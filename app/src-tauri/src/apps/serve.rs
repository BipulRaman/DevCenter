//! In-process HTTP servers for the Static Folder and API Mock serve modes,
//! built on axum. Each runs until its shutdown signal fires.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    extract::State,
    http::{header, Method, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use serde_json::{json, Value};
use tokio::sync::oneshot;
use tower_http::services::{ServeDir, ServeFile};

/// Serve a static build directory on `127.0.0.1:port` with SPA fallback to
/// `index.html`. Resolves when the shutdown signal fires.
pub async fn run_static(
    dir: PathBuf,
    port: u16,
    shutdown: oneshot::Receiver<()>,
) -> Result<(), String> {
    if !dir.is_dir() {
        return Err(format!("Static folder not found: {}", dir.display()));
    }
    let index = dir.join("index.html");
    let service = ServeDir::new(&dir).fallback(ServeFile::new(index));
    let app = Router::new().fallback_service(service);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Cannot bind 127.0.0.1:{port} — {e}"))?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = shutdown.await;
        })
        .await
        .map_err(|e| e.to_string())
}

// ---------- API Mock ----------

struct MockSpec {
    raw: Value,
    /// (method-uppercase, path-template) -> operation object
    ops: HashMap<(String, String), Value>,
}

/// Serve a Swagger 2.0 / OpenAPI 3.x mock on `127.0.0.1:port`. Routes:
/// `/` → Swagger UI, `/swagger.json` → the raw spec, everything else → a
/// synthesized JSON response for the matching operation.
pub async fn run_mock(
    spec_path: PathBuf,
    port: u16,
    shutdown: oneshot::Receiver<()>,
) -> Result<(), String> {
    let text = std::fs::read_to_string(&spec_path)
        .map_err(|e| format!("Cannot read spec {}: {e}", spec_path.display()))?;
    let raw: Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON spec: {e}"))?;

    let mut ops = HashMap::new();
    if let Some(paths) = raw.get("paths").and_then(|p| p.as_object()) {
        for (path, item) in paths {
            if let Some(methods) = item.as_object() {
                for (method, op) in methods {
                    let m = method.to_uppercase();
                    if matches!(m.as_str(), "GET" | "POST" | "PUT" | "DELETE" | "PATCH") {
                        ops.insert((m, path.clone()), op.clone());
                    }
                }
            }
        }
    }
    let spec = Arc::new(MockSpec { raw, ops });

    let app = Router::new()
        .route("/", get(swagger_ui))
        .route("/swagger.json", get(swagger_json))
        .fallback(mock_handler)
        .with_state(spec);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Cannot bind 127.0.0.1:{port} — {e}"))?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = shutdown.await;
        })
        .await
        .map_err(|e| e.to_string())
}

async fn swagger_json(State(spec): State<Arc<MockSpec>>) -> Response {
    ([(header::CONTENT_TYPE, "application/json")], spec.raw.to_string()).into_response()
}

async fn swagger_ui() -> Html<&'static str> {
    // Swagger UI is loaded from a CDN; this page runs in the user's browser
    // (not the Tauri WebView), so the app CSP does not apply.
    Html(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>API Mock — Swagger UI</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
<style>body{margin:0}</style></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=()=>{window.ui=SwaggerUIBundle({url:'/swagger.json',dom_id:'#swagger-ui'});};</script>
</body></html>"#,
    )
}

/// Match an incoming request to a spec operation and synthesize a response.
async fn mock_handler(
    State(spec): State<Arc<MockSpec>>,
    method: Method,
    uri: Uri,
) -> Response {
    let req_path = uri.path();
    let m = method.as_str().to_uppercase();

    let op = spec.ops.iter().find(|((om, otmpl), _)| {
        om == &m && path_matches(otmpl, req_path)
    });

    let Some(((_, _), op)) = op else {
        return (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "application/json")],
            json!({ "error": "No mock for this route", "path": req_path }).to_string(),
        )
            .into_response();
    };

    let (status, body) = response_for(op, &spec.raw);
    (
        StatusCode::from_u16(status).unwrap_or(StatusCode::OK),
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::HeaderName::from_static("x-devcenter-mock"), "1"),
        ],
        body.to_string(),
    )
        .into_response()
}

/// Whether a request path matches a spec path template (`{param}` = wildcard).
fn path_matches(template: &str, path: &str) -> bool {
    let t: Vec<&str> = template.trim_matches('/').split('/').collect();
    let p: Vec<&str> = path.trim_matches('/').split('/').collect();
    if t.len() != p.len() {
        return false;
    }
    t.iter()
        .zip(p.iter())
        .all(|(ts, ps)| (ts.starts_with('{') && ts.ends_with('}')) || ts == ps)
}

/// Pick the best response (prefer 200) and synthesize a body.
fn response_for(op: &Value, root: &Value) -> (u16, Value) {
    let responses = op.get("responses").and_then(|r| r.as_object());
    let Some(responses) = responses else {
        return (200, json!({}));
    };
    let key = ["200", "201", "202", "default"]
        .into_iter()
        .find(|k| responses.contains_key(*k))
        .or_else(|| responses.keys().next().map(|s| s.as_str()))
        .unwrap_or("200");
    let status: u16 = key.parse().unwrap_or(200);
    let resp = &responses[key];

    // OpenAPI 3: response.content["application/json"].{example|schema}
    // Swagger 2: response.{examples|schema}
    if let Some(ex) = resp
        .pointer("/content/application~1json/example")
        .or_else(|| resp.pointer("/examples/application~1json"))
    {
        return (status, ex.clone());
    }
    let schema = resp
        .pointer("/content/application~1json/schema")
        .or_else(|| resp.get("schema"));
    match schema {
        Some(s) => (status, synth(s, root, 0)),
        None => (status, json!({})),
    }
}

/// Recursively synthesize a sample JSON value from a JSON Schema.
fn synth(schema: &Value, root: &Value, depth: u8) -> Value {
    if depth > 8 {
        return Value::Null;
    }
    // Resolve a local $ref.
    if let Some(r) = schema.get("$ref").and_then(|x| x.as_str()) {
        if let Some(resolved) = resolve_ref(root, r) {
            return synth(&resolved, root, depth + 1);
        }
        return json!({});
    }
    if let Some(ex) = schema.get("example") {
        return ex.clone();
    }
    if let Some(en) = schema.get("enum").and_then(|e| e.as_array()).and_then(|a| a.first()) {
        return en.clone();
    }
    if let Some(all) = schema.get("allOf").and_then(|a| a.as_array()) {
        let mut merged = serde_json::Map::new();
        for s in all {
            if let Value::Object(o) = synth(s, root, depth + 1) {
                merged.extend(o);
            }
        }
        return Value::Object(merged);
    }
    for key in ["oneOf", "anyOf"] {
        if let Some(first) = schema.get(key).and_then(|a| a.as_array()).and_then(|a| a.first()) {
            return synth(first, root, depth + 1);
        }
    }

    let ty = schema.get("type").and_then(|t| t.as_str()).unwrap_or_else(|| {
        if schema.get("properties").is_some() {
            "object"
        } else {
            "string"
        }
    });
    match ty {
        "object" => {
            let mut obj = serde_json::Map::new();
            if let Some(props) = schema.get("properties").and_then(|p| p.as_object()) {
                for (k, v) in props {
                    obj.insert(k.clone(), synth(v, root, depth + 1));
                }
            }
            Value::Object(obj)
        }
        "array" => {
            let item = schema
                .get("items")
                .map(|i| synth(i, root, depth + 1))
                .unwrap_or(Value::Null);
            json!([item])
        }
        "integer" => json!(0),
        "number" => json!(0.0),
        "boolean" => json!(true),
        "string" => {
            let fmt = schema.get("format").and_then(|f| f.as_str()).unwrap_or("");
            match fmt {
                "date-time" => json!("2024-01-01T00:00:00Z"),
                "date" => json!("2024-01-01"),
                "uuid" => json!("00000000-0000-0000-0000-000000000000"),
                "email" => json!("user@example.com"),
                _ => json!("string"),
            }
        }
        _ => Value::Null,
    }
}

/// Resolve a local JSON pointer `$ref` like `#/components/schemas/Foo`.
fn resolve_ref(root: &Value, r: &str) -> Option<Value> {
    let p = r.strip_prefix('#')?;
    root.pointer(p).cloned()
}
