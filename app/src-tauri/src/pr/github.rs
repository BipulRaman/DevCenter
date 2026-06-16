//! GitHub REST client for pull requests.

use std::time::Duration;

use serde_json::Value;

use super::{short_date, RepoRef};
use crate::error::{AppError, AppResult};
use crate::models::PullRequest;

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

/// Validate the token and return the authenticated login.
pub fn verify(token: &str) -> AppResult<String> {
    let v = get("https://api.github.com/user", token)?;
    Ok(v.get("login")
        .and_then(|x| x.as_str())
        .unwrap_or("GitHub user")
        .to_string())
}

pub fn fetch_pulls(r: &RepoRef, token: &str, display: &str) -> AppResult<Vec<PullRequest>> {
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
