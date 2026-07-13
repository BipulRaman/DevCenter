//! GitHub REST client for pull requests.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{json, Value};

use super::{short_date, RepoRef};
use crate::error::{AppError, AppResult};
use crate::models::{PrComment, PrThread, PullRequest};

fn get(url: &str, token: &str) -> AppResult<Value> {
    match ureq::get(url)
        .timeout(Duration::from_secs(20))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "DevCenter")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
    {
        Ok(resp) => resp
            .into_json::<Value>()
            .map_err(|e| AppError::msg(e.to_string())),
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
            Err(AppError::msg("GitHub authentication failed — check the token and its scopes."))
        }
        Err(ureq::Error::Status(404, _)) => {
            Err(AppError::msg("GitHub repository not found (or no access)."))
        }
        Err(ureq::Error::Status(code, _)) => Err(AppError::msg(format!("GitHub API error {code}"))),
        Err(e) => Err(AppError::msg(e.to_string())),
    }
}

/// POST/PUT/PATCH a JSON body, returning the parsed JSON response (or `null`
/// for endpoints that reply with an empty body).
fn send(method: &str, url: &str, token: &str, body: &Value) -> AppResult<Value> {
    let req = ureq::request(method, url)
        .timeout(Duration::from_secs(20))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "DevCenter")
        .set("X-GitHub-Api-Version", "2022-11-28");
    match req.send_json(body.clone()) {
        Ok(resp) => Ok(resp.into_json::<Value>().unwrap_or(Value::Null)),
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
            Err(AppError::msg("GitHub authentication failed — check the token and its scopes."))
        }
        Err(ureq::Error::Status(404, _)) => {
            Err(AppError::msg("GitHub resource not found (or no access)."))
        }
        Err(ureq::Error::Status(422, resp)) => {
            let msg = resp
                .into_json::<Value>()
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(str::to_string))
                .unwrap_or_else(|| "GitHub rejected the request.".to_string());
            Err(AppError::msg(msg))
        }
        Err(ureq::Error::Status(code, _)) => Err(AppError::msg(format!("GitHub API error {code}"))),
        Err(e) => Err(AppError::msg(e.to_string())),
    }
}

/// Validate the token and return the authenticated login.
pub fn verify(token: &str) -> AppResult<String> {
    let v = get("https://api.github.com/user", token)?;
    Ok(v.get("login")
        .and_then(|x| x.as_str())
        .unwrap_or("GitHub user")
        .to_string())
}


pub fn fetch_pulls(r: &RepoRef, token: &str, display: &str, repo_id: &str) -> AppResult<Vec<PullRequest>> {
    // Only open (incl. draft) PRs are surfaced.
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open&per_page=50&sort=updated&direction=desc",
        r.owner, r.repo
    );
    let v = get(&url, token)?;
    let arr = v.as_array().cloned().unwrap_or_default();

    let mut out = Vec::new();
    for p in arr {
        let state = p.get("state").and_then(|x| x.as_str()).unwrap_or("open");
        let draft = p.get("draft").and_then(|x| x.as_bool()).unwrap_or(false);

        // Only open / draft PRs; skip anything closed or merged.
        let status = if state != "open" {
            continue;
        } else if draft {
            "draft"
        } else {
            "open"
        };

        out.push(PullRequest {
            id: p.get("number").and_then(|x| x.as_u64()).unwrap_or(0),
            title: p
                .get("title")
                .and_then(|x| x.as_str())
                .unwrap_or("(untitled)")
                .to_string(),
            repo: display.to_string(),
            repo_id: repo_id.to_string(),
            author: p
                .pointer("/user/login")
                .and_then(|x| x.as_str())
                .unwrap_or("unknown")
                .to_string(),
            branch: p
                .pointer("/head/ref")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            base: p
                .pointer("/base/ref")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            status: status.to_string(),
            reviews: "pending".to_string(),
            comments: 0,
            additions: 0,
            deletions: 0,
            updated: short_date(p.get("updated_at").and_then(|x| x.as_str()).unwrap_or("")),
            url: p
                .get("html_url")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
        });
    }
    Ok(out)
}

// ===================== PR review: comments + threads =====================

fn comment_from(v: &Value) -> PrComment {
    PrComment {
        id: v.get("id").map(|x| x.to_string()).unwrap_or_default(),
        author: v
            .pointer("/user/login")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .to_string(),
        body: v.get("body").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        created: short_date(v.get("created_at").and_then(|x| x.as_str()).unwrap_or("")),
    }
}

/// The PR's head commit SHA, required by the "create review comment" endpoint.
fn head_sha(r: &RepoRef, pr_number: u64, token: &str) -> AppResult<String> {
    let url = format!("https://api.github.com/repos/{}/{}/pulls/{pr_number}", r.owner, r.repo);
    let v = get(&url, token)?;
    Ok(v.pointer("/head/sha").and_then(|x| x.as_str()).unwrap_or("").to_string())
}

/// All comment threads for a PR: one synthesized "general" thread (issue
/// comments + any review submissions that included a body, merged and sorted
/// chronologically) plus one thread per root inline review comment (replies
/// grouped under their `in_reply_to_id`).
pub fn fetch_threads(r: &RepoRef, pr_number: u64, token: &str) -> AppResult<Vec<PrThread>> {
    let mut general: Vec<(String, PrComment)> = Vec::new(); // (sort key, comment)

    let issue_url = format!(
        "https://api.github.com/repos/{}/{}/issues/{pr_number}/comments?per_page=100",
        r.owner, r.repo
    );
    for c in get(&issue_url, token)?.as_array().cloned().unwrap_or_default() {
        let sort_key = c.get("created_at").and_then(|x| x.as_str()).unwrap_or("").to_string();
        general.push((sort_key, comment_from(&c)));
    }

    let reviews_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}/reviews?per_page=100",
        r.owner, r.repo
    );
    for rv in get(&reviews_url, token)?.as_array().cloned().unwrap_or_default() {
        let body = rv.get("body").and_then(|x| x.as_str()).unwrap_or("");
        if body.trim().is_empty() {
            continue; // approve/request-changes with no summary — nothing to show
        }
        let event = rv.get("state").and_then(|x| x.as_str()).unwrap_or("");
        let prefix = match event {
            "APPROVED" => "✓ Approved — ",
            "CHANGES_REQUESTED" => "✗ Requested changes — ",
            _ => "",
        };
        let sort_key = rv.get("submitted_at").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let mut comment = comment_from(&rv);
        comment.body = format!("{prefix}{}", comment.body);
        general.push((sort_key, comment));
    }
    general.sort_by(|a, b| a.0.cmp(&b.0));

    let mut threads: Vec<PrThread> = Vec::new();
    if !general.is_empty() {
        threads.push(PrThread {
            id: "general".to_string(),
            path: None,
            line: None,
            resolved: false,
            can_resolve: false,
            comments: general.into_iter().map(|(_, c)| c).collect(),
        });
    }

    // Inline review comments — group replies under their thread root.
    let review_url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}/comments?per_page=100",
        r.owner, r.repo
    );
    let arr = get(&review_url, token)?.as_array().cloned().unwrap_or_default();
    let mut roots: Vec<Value> = Vec::new();
    let mut replies_by_root: HashMap<u64, Vec<Value>> = HashMap::new();
    for c in arr {
        match c.get("in_reply_to_id").and_then(|x| x.as_u64()) {
            Some(root_id) => replies_by_root.entry(root_id).or_default().push(c),
            None => roots.push(c),
        }
    }
    for root in &roots {
        let root_id = root.get("id").and_then(|x| x.as_u64()).unwrap_or(0);
        let mut comments = vec![comment_from(root)];
        if let Some(replies) = replies_by_root.get(&root_id) {
            let mut sorted = replies.clone();
            sorted.sort_by_key(|c| c.get("id").and_then(|x| x.as_u64()).unwrap_or(0));
            comments.extend(sorted.iter().map(comment_from));
        }
        // A null `line` (superseded by later commits) falls back to `original_line`.
        let line = root
            .get("line")
            .and_then(|x| x.as_u64())
            .or_else(|| root.get("original_line").and_then(|x| x.as_u64()))
            .map(|x| x as u32);
        threads.push(PrThread {
            id: root_id.to_string(),
            path: root.get("path").and_then(|x| x.as_str()).map(str::to_string),
            line,
            resolved: false,
            can_resolve: false,
            comments,
        });
    }
    Ok(threads)
}

/// Post a top-level (non-inline) PR/issue comment.
pub fn post_general_comment(r: &RepoRef, pr_number: u64, body: &str, token: &str) -> AppResult<()> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues/{pr_number}/comments",
        r.owner, r.repo
    );
    send("POST", &url, token, &json!({ "body": body }))?;
    Ok(())
}

/// Start a new inline review-comment thread anchored to a file/line.
pub fn post_inline_comment(
    r: &RepoRef,
    pr_number: u64,
    path: &str,
    line: u32,
    body: &str,
    token: &str,
) -> AppResult<()> {
    let sha = head_sha(r, pr_number, token)?;
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}/comments",
        r.owner, r.repo
    );
    send(
        "POST",
        &url,
        token,
        &json!({ "body": body, "commit_id": sha, "path": path, "line": line, "side": "RIGHT" }),
    )?;
    Ok(())
}

/// Reply to an existing inline review-comment thread (by its root comment id).
pub fn post_reply(r: &RepoRef, pr_number: u64, comment_id: &str, body: &str, token: &str) -> AppResult<()> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}/comments/{comment_id}/replies",
        r.owner, r.repo
    );
    send("POST", &url, token, &json!({ "body": body }))?;
    Ok(())
}

/// Submit a review. `event` is one of "APPROVE" | "REQUEST_CHANGES" | "COMMENT".
pub fn submit_review(r: &RepoRef, pr_number: u64, event: &str, body: &str, token: &str) -> AppResult<()> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}/reviews",
        r.owner, r.repo
    );
    send("POST", &url, token, &json!({ "body": body, "event": event }))?;
    Ok(())
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
    let url = format!("https://api.github.com/repos/{}/{}/pulls", r.owner, r.repo);
    let payload = json!({
        "title": title,
        "body": body,
        "base": base,
        "head": head,
        "draft": draft,
    });
    let p = send("POST", &url, token, &payload)?;
    let is_draft = p.get("draft").and_then(|x| x.as_bool()).unwrap_or(draft);
    Ok(PullRequest {
        id: p.get("number").and_then(|x| x.as_u64()).unwrap_or(0),
        title: p.get("title").and_then(|x| x.as_str()).unwrap_or(title).to_string(),
        repo: display.to_string(),
        repo_id: repo_id.to_string(),
        author: p.pointer("/user/login").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        branch: p.pointer("/head/ref").and_then(|x| x.as_str()).unwrap_or(head).to_string(),
        base: p.pointer("/base/ref").and_then(|x| x.as_str()).unwrap_or(base).to_string(),
        status: if is_draft { "draft" } else { "open" }.to_string(),
        reviews: "pending".to_string(),
        comments: 0,
        additions: 0,
        deletions: 0,
        updated: short_date(p.get("updated_at").and_then(|x| x.as_str()).unwrap_or("")),
        url: p.get("html_url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
    })
}

/// The authenticated user's login (to identify your own review among a PR's
/// reviews).
fn current_login(token: &str) -> AppResult<String> {
    let v = get("https://api.github.com/user", token)?;
    Ok(v.get("login")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string())
}

/// The signed-in user's own vote on a PR, normalized to the Azure scale so the
/// UI can treat both providers uniformly: 10 approved, -10 changes requested,
/// 0 none. (GitHub has no "approve with suggestions" / "waiting" states.)
pub fn my_vote(r: &RepoRef, pr_number: u64, token: &str) -> AppResult<i32> {
    let login = current_login(token)?;
    if login.is_empty() {
        return Ok(0);
    }
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}/reviews?per_page=100",
        r.owner, r.repo
    );
    // Reviews come back in chronological order — the last decisive one wins.
    let mut vote = 0;
    for rv in get(&url, token)?.as_array().cloned().unwrap_or_default() {
        if rv.pointer("/user/login").and_then(|x| x.as_str()).unwrap_or("") != login {
            continue;
        }
        match rv.get("state").and_then(|x| x.as_str()).unwrap_or("") {
            "APPROVED" => vote = 10,
            "CHANGES_REQUESTED" => vote = -10,
            "DISMISSED" => vote = 0,
            _ => {} // COMMENTED leaves the standing vote unchanged
        }
    }
    Ok(vote)
}

/// Publish a draft pull request (mark it ready for review). GitHub only exposes
/// this via GraphQL, which needs the PR's node id.
pub fn publish(r: &RepoRef, pr_number: u64, token: &str) -> AppResult<()> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{pr_number}",
        r.owner, r.repo
    );
    let node_id = get(&url, token)?
        .get("node_id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if node_id.is_empty() {
        return Err(AppError::msg("Couldn't resolve the pull request id."));
    }
    let body = json!({
        "query": "mutation($id:ID!){ markPullRequestReadyForReview(input:{pullRequestId:$id}){ pullRequest { isDraft } } }",
        "variables": { "id": node_id },
    });
    let resp = send("POST", "https://api.github.com/graphql", token, &body)?;
    if let Some(errs) = resp.get("errors").and_then(|e| e.as_array()) {
        if let Some(first) = errs.first() {
            let msg = first
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("GitHub rejected the request.");
            return Err(AppError::msg(msg.to_string()));
        }
    }
    Ok(())
}

