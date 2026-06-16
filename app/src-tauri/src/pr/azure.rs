//! Azure DevOps REST client for pull requests.

use std::time::Duration;

use base64::Engine;
use serde_json::Value;

use super::{short_date, RepoRef};
use crate::error::{AppError, AppResult};
use crate::models::{Account, PullRequest};

/// GET a JSON document, trying Basic auth (PAT) first and falling back to
/// Bearer (Entra/AAD token). Azure DevOps answers bad auth with a 200 HTML
/// sign-in page, so a non-JSON content type is treated as an auth failure and
/// triggers the fallback.
fn get(url: &str, token: &str) -> AppResult<Value> {
    let basic = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!(":{token}"))
    );
    match try_get(url, &basic) {
        Ok(v) => Ok(v),
        Err(first) => try_get(url, &format!("Bearer {token}")).map_err(|_| first),
    }
}

fn try_get(url: &str, auth: &str) -> AppResult<Value> {
    match ureq::get(url)
        .timeout(Duration::from_secs(20))
        .set("Authorization", auth)
        .set("Accept", "application/json")
        .set("User-Agent", "DevCenter")
        .call()
    {
        Ok(resp) => {
            let ctype = resp.header("content-type").unwrap_or("").to_lowercase();
            if !ctype.contains("json") {
                return Err(AppError::msg(
                    "Azure DevOps authentication failed — check the token and its scopes.",
                ));
            }
            resp.into_json::<Value>()
                .map_err(|e| AppError::msg(e.to_string()))
        }
        Err(ureq::Error::Status(code, _)) => {
            Err(AppError::msg(format!("Azure DevOps API error {code}")))
        }
        Err(e) => Err(AppError::msg(e.to_string())),
    }
}

/// Build the Azure DevOps collection base URL for an (host, org) pair. Modern
/// orgs use `https://dev.azure.com/{org}`; legacy orgs use
/// `https://{org}.visualstudio.com`. `host` carries which form to use.
pub fn collection_base(host: &str, org: &str) -> String {
    if host.contains("visualstudio.com") {
        format!("https://{org}.visualstudio.com")
    } else {
        format!("https://dev.azure.com/{org}")
    }
}

/// Validate the token against the org and return the authenticated display name.
pub fn verify(account: &Account, token: &str) -> AppResult<String> {
    let org = account.organization.as_deref().unwrap_or("");
    let base = collection_base(&account.host, org);
    let url = format!("{base}/_apis/connectionData?api-version=7.1-preview");
    let v = get(&url, token)?;
    Ok(v.pointer("/authenticatedUser/providerDisplayName")
        .and_then(|x| x.as_str())
        .unwrap_or("Azure DevOps user")
        .to_string())
}

fn strip_ref(s: &str) -> String {
    s.strip_prefix("refs/heads/").unwrap_or(s).to_string()
}

/// Map Azure reviewer votes to a coarse review state.
/// Votes: 10 approved, 5 approved-with-suggestions, 0 none, -5 waiting, -10 rejected.
fn review_state(reviewers: Option<&Vec<Value>>) -> &'static str {
    let mut any_positive = false;
    if let Some(list) = reviewers {
        for rv in list {
            let vote = rv.get("vote").and_then(|x| x.as_i64()).unwrap_or(0);
            if vote < 0 {
                return "changes";
            }
            if vote > 0 {
                any_positive = true;
            }
        }
    }
    if any_positive {
        "approved"
    } else {
        "pending"
    }
}

pub fn fetch_pulls(r: &RepoRef, token: &str, display: &str) -> AppResult<Vec<PullRequest>> {
    let org = &r.owner;
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, org);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullrequests?searchCriteria.status=active&$top=50&api-version=7.1",
        r.repo
    );
    let v = get(&url, token)?;
    let arr = v
        .get("value")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for p in arr {
        let ado_status = p.get("status").and_then(|x| x.as_str()).unwrap_or("active");
        let is_draft = p.get("isDraft").and_then(|x| x.as_bool()).unwrap_or(false);
        let status = match ado_status {
            "active" if is_draft => "draft",
            "active" => "open",
            // completed / abandoned / anything else is not shown.
            _ => continue,
        };

        let id = p.get("pullRequestId").and_then(|x| x.as_u64()).unwrap_or(0);
        let reviews = review_state(p.get("reviewers").and_then(|x| x.as_array()));

        out.push(PullRequest {
            id,
            title: p
                .get("title")
                .and_then(|x| x.as_str())
                .unwrap_or("(untitled)")
                .to_string(),
            repo: display.to_string(),
            author: p
                .pointer("/createdBy/displayName")
                .and_then(|x| x.as_str())
                .unwrap_or("unknown")
                .to_string(),
            branch: strip_ref(p.get("sourceRefName").and_then(|x| x.as_str()).unwrap_or("")),
            base: strip_ref(p.get("targetRefName").and_then(|x| x.as_str()).unwrap_or("")),
            status: status.to_string(),
            reviews: reviews.to_string(),
            comments: 0,
            additions: 0,
            deletions: 0,
            updated: short_date(p.get("creationDate").and_then(|x| x.as_str()).unwrap_or("")),
            url: format!("{base}/{project}/_git/{}/pullrequest/{id}", r.repo),
        });
    }
    Ok(out)
}
