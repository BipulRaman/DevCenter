//! Azure DevOps REST client for pull requests.

use std::time::Duration;

use base64::Engine;
use serde_json::{json, Value};

use super::{short_date, RepoRef};
use crate::error::{AppError, AppResult};
use crate::models::{Account, PrComment, PrThread, PullRequest};

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

/// POST/PATCH/PUT a JSON body, trying Basic auth (PAT) first and falling back
/// to Bearer (Entra/AAD token), mirroring `get`.
fn send(method: &str, url: &str, token: &str, body: &Value) -> AppResult<Value> {
    let basic = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!(":{token}"))
    );
    match try_send(method, url, &basic, body) {
        Ok(v) => Ok(v),
        Err(first) => try_send(method, url, &format!("Bearer {token}"), body).map_err(|_| first),
    }
}

fn try_send(method: &str, url: &str, auth: &str, body: &Value) -> AppResult<Value> {
    match ureq::request(method, url)
        .timeout(Duration::from_secs(20))
        .set("Authorization", auth)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .set("User-Agent", "DevCenter")
        .send_json(body.clone())
    {
        Ok(resp) => {
            let ctype = resp.header("content-type").unwrap_or("").to_lowercase();
            if !ctype.contains("json") {
                return Ok(Value::Null); // some endpoints reply 204/empty on success
            }
            Ok(resp.into_json::<Value>().unwrap_or(Value::Null))
        }
        Err(ureq::Error::Status(code, resp)) => {
            let msg = resp
                .into_json::<Value>()
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(str::to_string));
            Err(AppError::msg(msg.unwrap_or_else(|| format!("Azure DevOps API error {code}"))))
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

/// Map Azure reviewer votes to a coarse review state plus approval details.
/// Votes: 10 approved, 5 approved-with-suggestions, 0 none, -5 waiting, -10 rejected.
/// `me` is the signed-in user's display name, used to flag their own approval.
/// Returns (state, approval_count, approved_by_me).
fn review_state(reviewers: Option<&Vec<Value>>, me: &str) -> (&'static str, u32, bool) {
    let mut any_negative = false;
    let mut approvals: u32 = 0;
    let mut approved_by_me = false;
    if let Some(list) = reviewers {
        for rv in list {
            let vote = rv.get("vote").and_then(|x| x.as_i64()).unwrap_or(0);
            if vote < 0 {
                any_negative = true;
            } else if vote > 0 {
                approvals += 1;
                let name = rv.get("displayName").and_then(|x| x.as_str()).unwrap_or("");
                let unique = rv.get("uniqueName").and_then(|x| x.as_str()).unwrap_or("");
                if !me.is_empty() && (name.eq_ignore_ascii_case(me) || unique.eq_ignore_ascii_case(me)) {
                    approved_by_me = true;
                }
            }
        }
    }
    let state = if any_negative {
        "changes"
    } else if approvals > 0 {
        "approved"
    } else {
        "pending"
    };
    (state, approvals, approved_by_me)
}

pub fn fetch_pulls(r: &RepoRef, token: &str, display: &str, repo_id: &str, me: &str) -> AppResult<Vec<PullRequest>> {
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
        let (reviews, approvals, approved_by_me) =
            review_state(p.get("reviewers").and_then(|x| x.as_array()), me);

        out.push(PullRequest {
            id,
            title: p
                .get("title")
                .and_then(|x| x.as_str())
                .unwrap_or("(untitled)")
                .to_string(),
            repo: display.to_string(),
            repo_id: repo_id.to_string(),
            author: p
                .pointer("/createdBy/displayName")
                .and_then(|x| x.as_str())
                .unwrap_or("unknown")
                .to_string(),
            branch: strip_ref(p.get("sourceRefName").and_then(|x| x.as_str()).unwrap_or("")),
            base: strip_ref(p.get("targetRefName").and_then(|x| x.as_str()).unwrap_or("")),
            status: status.to_string(),
            reviews: reviews.to_string(),
            approvals,
            approved_by_me,
            comments: 0,
            additions: 0,
            deletions: 0,
            updated: short_date(p.get("creationDate").and_then(|x| x.as_str()).unwrap_or("")),
            url: format!("{base}/{project}/_git/{}/pullrequest/{id}", r.repo),
        });
    }
    Ok(out)
}

// ===================== PR review: comments + threads =====================

fn comment_from(v: &Value) -> PrComment {
    PrComment {
        id: v.get("id").map(|x| x.to_string()).unwrap_or_default(),
        author: v
            .pointer("/author/displayName")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .to_string(),
        body: v.get("content").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        created: short_date(v.get("publishedDate").and_then(|x| x.as_str()).unwrap_or("")),
    }
}

/// All comment threads for a PR (general discussion threads and inline
/// code-review threads alike — Azure DevOps models both the same way).
/// System-generated notices (vote changes, etc.) are filtered out.
pub fn fetch_threads(r: &RepoRef, pr_id: u64, token: &str) -> AppResult<Vec<PrThread>> {
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullRequests/{pr_id}/threads?api-version=7.1",
        r.repo
    );
    let v = get(&url, token)?;
    let mut out = Vec::new();
    for t in v.get("value").and_then(|x| x.as_array()).cloned().unwrap_or_default() {
        let comments: Vec<PrComment> = t
            .get("comments")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter(|c| c.get("commentType").and_then(|x| x.as_str()) != Some("system"))
            .filter(|c| !c.get("isDeleted").and_then(|x| x.as_bool()).unwrap_or(false))
            .map(comment_from)
            .collect();
        if comments.is_empty() {
            continue;
        }
        let id = t.get("id").and_then(|x| x.as_u64()).unwrap_or(0);
        let ctx = t.get("threadContext").filter(|c| !c.is_null());
        let path = ctx
            .and_then(|c| c.get("filePath"))
            .and_then(|x| x.as_str())
            .map(|p| p.trim_start_matches('/').to_string());
        let line = ctx
            .and_then(|c| c.pointer("/rightFileStart/line").or_else(|| c.pointer("/leftFileStart/line")))
            .and_then(|x| x.as_u64())
            .map(|x| x as u32);
        let status = t.get("status").and_then(|x| x.as_str()).unwrap_or("active");
        out.push(PrThread {
            id: id.to_string(),
            path,
            line,
            resolved: status == "fixed",
            can_resolve: true,
            comments,
        });
    }
    Ok(out)
}

/// Reply to an existing thread.
pub fn post_comment(r: &RepoRef, pr_id: u64, thread_id: u64, body: &str, token: &str) -> AppResult<()> {
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullRequests/{pr_id}/threads/{thread_id}/comments?api-version=7.1",
        r.repo
    );
    send("POST", &url, token, &json!({ "content": body, "commentType": 1 }))?;
    Ok(())
}

/// Start a new thread — a general discussion comment (`path` is `None`) or an
/// inline code-review comment anchored to `path`/`line`.
pub fn create_thread(
    r: &RepoRef,
    pr_id: u64,
    body: &str,
    path: Option<&str>,
    line: Option<u32>,
    token: &str,
) -> AppResult<()> {
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullRequests/{pr_id}/threads?api-version=7.1",
        r.repo
    );
    let mut payload = json!({
        "comments": [{ "content": body, "commentType": 1 }],
        "status": "active",
    });
    if let (Some(path), Some(line)) = (path, line) {
        payload["threadContext"] = json!({
            "filePath": path,
            "rightFileStart": { "line": line, "offset": 1 },
            "rightFileEnd": { "line": line, "offset": 1 },
        });
    }
    send("POST", &url, token, &payload)?;
    Ok(())
}

/// Resolve/reopen a thread.
pub fn resolve_thread(r: &RepoRef, pr_id: u64, thread_id: u64, resolved: bool, token: &str) -> AppResult<()> {
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullRequests/{pr_id}/threads/{thread_id}?api-version=7.1",
        r.repo
    );
    send("PATCH", &url, token, &json!({ "status": if resolved { "fixed" } else { "active" } }))?;
    Ok(())
}

/// The authenticated user's identity id (needed to cast a review vote as
/// yourself via the reviewers endpoint).
fn current_user_id(r: &RepoRef, token: &str) -> AppResult<String> {
    let base = collection_base(&r.host, &r.owner);
    let url = format!("{base}/_apis/connectionData?api-version=7.1-preview");
    let v = get(&url, token)?;
    Ok(v.pointer("/authenticatedUser/id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string())
}

/// Open a pull request from `head` into `base` (both branch names in the same
/// repository). Returns the created PR modeled for the UI.
pub fn create_pr(
    r: &RepoRef,
    title: &str,
    body: &str,
    base: &str,
    head: &str,
    draft: bool,
    display: &str,
    repo_id: &str,
    token: &str,
) -> AppResult<PullRequest> {
    let org = &r.owner;
    let project = r.project.as_deref().unwrap_or("");
    let base_url = collection_base(&r.host, org);
    let url = format!(
        "{base_url}/{project}/_apis/git/repositories/{}/pullrequests?api-version=7.1",
        r.repo
    );
    let payload = json!({
        "sourceRefName": format!("refs/heads/{head}"),
        "targetRefName": format!("refs/heads/{base}"),
        "title": title,
        "description": body,
        "isDraft": draft,
    });
    let p = send("POST", &url, token, &payload)?;
    let id = p.get("pullRequestId").and_then(|x| x.as_u64()).unwrap_or(0);
    let is_draft = p.get("isDraft").and_then(|x| x.as_bool()).unwrap_or(draft);
    Ok(PullRequest {
        id,
        title: p.get("title").and_then(|x| x.as_str()).unwrap_or(title).to_string(),
        repo: display.to_string(),
        repo_id: repo_id.to_string(),
        author: p
            .pointer("/createdBy/displayName")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        branch: strip_ref(p.get("sourceRefName").and_then(|x| x.as_str()).unwrap_or(head)),
        base: strip_ref(p.get("targetRefName").and_then(|x| x.as_str()).unwrap_or(base)),
        status: if is_draft { "draft" } else { "open" }.to_string(),
        reviews: "pending".to_string(),
        approvals: 0,
        approved_by_me: false,
        comments: 0,
        additions: 0,
        deletions: 0,
        updated: short_date(p.get("creationDate").and_then(|x| x.as_str()).unwrap_or("")),
        url: format!("{base_url}/{project}/_git/{}/pullrequest/{id}", r.repo),
    })
}

/// Cast (or change) your own review vote. `vote` is 10 (approve), -10
/// (reject/request changes), or 0 (no vote — used for a plain "comment"
/// review, which otherwise only posts `body` as a general comment).
pub fn submit_review(r: &RepoRef, pr_id: u64, vote: i32, token: &str) -> AppResult<()> {
    let reviewer_id = current_user_id(r, token)?;
    if reviewer_id.is_empty() {
        return Err(AppError::msg("Couldn't resolve your Azure DevOps identity."));
    }
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullRequests/{pr_id}/reviewers/{reviewer_id}?api-version=7.1",
        r.repo
    );
    send("PUT", &url, token, &json!({ "vote": vote }))?;
    Ok(())
}

/// The signed-in user's own vote on a PR (Azure scale: 10 approved,
/// 5 approved-with-suggestions, 0 none, -5 waiting, -10 rejected).
pub fn my_vote(r: &RepoRef, pr_id: u64, token: &str) -> AppResult<i32> {
    let uid = current_user_id(r, token)?;
    if uid.is_empty() {
        return Ok(0);
    }
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullRequests/{pr_id}/reviewers?api-version=7.1",
        r.repo
    );
    let v = get(&url, token)?;
    let arr = v
        .get("value")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    for rv in arr {
        if rv.get("id").and_then(|x| x.as_str()).unwrap_or("") == uid {
            return Ok(rv.get("vote").and_then(|x| x.as_i64()).unwrap_or(0) as i32);
        }
    }
    Ok(0)
}

/// Publish a draft pull request (clear its draft flag so it's open for review).
pub fn publish(r: &RepoRef, pr_id: u64, token: &str) -> AppResult<()> {
    let project = r.project.as_deref().unwrap_or("");
    let base = collection_base(&r.host, &r.owner);
    let url = format!(
        "{base}/{project}/_apis/git/repositories/{}/pullrequests/{pr_id}?api-version=7.1",
        r.repo
    );
    send("PATCH", &url, token, &json!({ "isDraft": false }))?;
    Ok(())
}

