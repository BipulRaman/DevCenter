//! Read and write the user's Git identity configuration for managing multiple
//! accounts. This models the common "one identity per repository" setup that
//! relies on Git's conditional includes (`includeIf`):
//!
//! ```gitconfig
//! # ~/.gitconfig
//! [user]
//! 	name = Jane Doe
//! 	email = jane@personal.example
//! [includeIf "hasconfig:remote.*.url:https://dev.azure.com/Contoso/**"]
//! 	path = ~/.gitconfig-contoso
//! [credential "azrepos:org/contoso"]
//! 	username = jane@contoso.com
//! ```
//!
//! Each conditional identity lives in its own included file (e.g.
//! `~/.gitconfig-contoso`) that overrides `[user]` when one of its conditions
//! matches the repository.
//!
//! DevCenter *manages* three kinds of sections in the global config — the
//! default `[user]`, every recognized `[includeIf]` (whose condition is
//! `hasconfig:remote.*.url:` or `gitdir:`), and every `[credential
//! "azrepos:org/*"]` — regenerating them from the model on save. Every other
//! section (aliases, `[filter "lfs"]`, custom settings, comments) is preserved
//! verbatim so nothing the user hand-wrote is ever lost.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// A single condition that activates a conditional identity.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCondition {
    /// `"remoteUrl"` (matches `hasconfig:remote.*.url:<glob>`) or `"gitdir"`
    /// (matches `gitdir:<path>`).
    pub kind: String,
    /// The glob/path value the condition matches against.
    pub value: String,
}

/// An Azure DevOps credential-helper username mapping, scoped to an org.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCredential {
    /// Azure DevOps organization slug (the `<org>` in `azrepos:org/<org>`).
    pub org: String,
    /// Username presented to the credential helper.
    pub username: String,
    /// Optional Entra ID (AAD) tenant authority URL.
    pub authority: Option<String>,
}

/// A conditional identity: an included config file plus the conditions that
/// activate it and any Azure credential mappings that belong with it.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitProfile {
    /// Short key used to name the include file (`~/.gitconfig-<key>`).
    pub key: String,
    /// Identity name written into the include file's `[user]`.
    pub name: String,
    /// Identity email written into the include file's `[user]`.
    pub email: String,
    /// The include path as written in `.gitconfig` (e.g. `~/.gitconfig-contoso`).
    pub path: String,
    pub conditions: Vec<GitCondition>,
    #[serde(default)]
    pub credentials: Vec<GitCredential>,
}

/// The full identity configuration surfaced to (and accepted from) the UI.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentityConfig {
    /// Absolute path of the global `.gitconfig` being managed (for display).
    pub global_path: String,
    /// Default identity name from the global `[user]`.
    pub default_name: String,
    /// Default identity email from the global `[user]`.
    pub default_email: String,
    pub profiles: Vec<GitProfile>,
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// The current user's home directory (`%USERPROFILE%` on Windows, `$HOME`
/// elsewhere).
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var_os("HOME").filter(|s| !s.is_empty()))
        .map(PathBuf::from)
}

/// Path to the global `.gitconfig` DevCenter manages (`~/.gitconfig`).
pub fn global_config_path() -> AppResult<PathBuf> {
    let home = home_dir().ok_or_else(|| AppError::msg("Could not determine your home directory."))?;
    Ok(home.join(".gitconfig"))
}

/// Expand a leading `~` in a config path to the user's home directory.
fn expand_tilde(p: &str) -> PathBuf {
    let s = p.trim();
    if s == "~" {
        if let Some(h) = home_dir() {
            return h;
        }
    }
    if let Some(rest) = s.strip_prefix("~/").or_else(|| s.strip_prefix("~\\")) {
        if let Some(h) = home_dir() {
            return h.join(rest);
        }
    }
    PathBuf::from(s)
}

// ---------------------------------------------------------------------------
// Block model — a section header plus its body and the comment/blank lines that
// lead into it. Round-tripping through these blocks preserves everything we do
// not explicitly manage.
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct Block {
    /// Comment/blank lines that precede this section header.
    lead: Vec<String>,
    /// Lowercased section name (e.g. `"user"`, `"includeif"`, `"credential"`),
    /// or `None` for a trailing preamble of comments with no section.
    section: Option<String>,
    /// Raw subsection text (between the quotes), if any.
    subsection: Option<String>,
    /// Raw body lines belonging to the section (key/value pairs, comments).
    body: Vec<String>,
}

impl Block {
    fn is_default_user(&self) -> bool {
        self.section.as_deref() == Some("user") && self.subsection.is_none()
    }

    /// A `[includeIf ...]` whose condition DevCenter understands and manages.
    fn is_managed_include(&self) -> bool {
        if self.section.as_deref() != Some("includeif") {
            return false;
        }
        match &self.subsection {
            Some(sub) => {
                let s = sub.to_lowercase();
                s.starts_with("hasconfig:remote.*.url:") || s.starts_with("gitdir:")
            }
            None => false,
        }
    }

    /// A `[credential "azrepos:org/*"]` section DevCenter manages.
    fn is_managed_credential(&self) -> bool {
        self.section.as_deref() == Some("credential")
            && self
                .subsection
                .as_deref()
                .map(|s| s.to_lowercase().starts_with("azrepos:org/"))
                .unwrap_or(false)
    }

    fn is_managed(&self) -> bool {
        self.is_default_user() || self.is_managed_include() || self.is_managed_credential()
    }

    /// Read a `key = value` from the body (case-insensitive key).
    fn value_of(&self, key: &str) -> Option<String> {
        for line in &self.body {
            let t = line.trim();
            if t.starts_with('#') || t.starts_with(';') {
                continue;
            }
            if let Some((k, v)) = t.split_once('=') {
                if k.trim().eq_ignore_ascii_case(key) {
                    return Some(v.trim().to_string());
                }
            }
        }
        None
    }
}

/// Parse a section header like `[user]`, `[user "sub"]`, or `[section sub]`.
/// Returns `(section_lowercased, subsection_raw)`.
fn parse_header(line: &str) -> Option<(String, Option<String>)> {
    let t = line.trim();
    let inner = t.strip_prefix('[')?.strip_suffix(']')?;
    let inner = inner.trim();
    // Quoted subsection: `section "subsection"` (the subsection can contain any
    // character, including `]`, but not an unescaped `"`).
    if let Some(q) = inner.find('"') {
        let section = inner[..q].trim().to_lowercase();
        let rest = &inner[q + 1..];
        let sub = rest.strip_suffix('"').unwrap_or(rest);
        // Unescape `\"` and `\\` per git's config format.
        let sub = sub.replace("\\\"", "\"").replace("\\\\", "\\");
        return Some((section, Some(sub)));
    }
    // Unquoted: `[section]` or `[section subsection]`.
    match inner.split_once(char::is_whitespace) {
        Some((sec, sub)) => Some((sec.trim().to_lowercase(), Some(sub.trim().to_string()))),
        None => Some((inner.to_lowercase(), None)),
    }
}

/// Split raw config text into blocks. Leading comment/blank lines attach to the
/// section that follows them; any trailing comments with no following section
/// become a headerless block.
fn parse_blocks(text: &str) -> Vec<Block> {
    let mut blocks: Vec<Block> = Vec::new();
    let mut lead: Vec<String> = Vec::new();
    let mut current: Option<Block> = None;

    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('[') && parse_header(line).is_some() {
            if let Some(b) = current.take() {
                blocks.push(b);
            }
            let (section, subsection) = parse_header(line).unwrap();
            current = Some(Block {
                lead: std::mem::take(&mut lead),
                section: Some(section),
                subsection,
                body: Vec::new(),
            });
        } else if let Some(b) = current.as_mut() {
            b.body.push(line.to_string());
        } else {
            // Before any section: preamble comment/blank lines.
            lead.push(line.to_string());
        }
    }
    if let Some(b) = current.take() {
        blocks.push(b);
    }
    if !lead.is_empty() {
        blocks.push(Block {
            lead,
            section: None,
            subsection: None,
            body: Vec::new(),
        });
    }
    blocks
}

/// Render a block back to text exactly as it should appear on disk.
fn render_block(b: &Block, out: &mut String) {
    for l in &b.lead {
        out.push_str(l);
        out.push('\n');
    }
    if let Some(sec) = &b.section {
        match &b.subsection {
            Some(sub) => {
                let escaped = sub.replace('\\', "\\\\").replace('"', "\\\"");
                out.push_str(&format!("[{sec} \"{escaped}\"]\n"));
            }
            None => out.push_str(&format!("[{sec}]\n")),
        }
        for l in &b.body {
            out.push_str(l);
            out.push('\n');
        }
    }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/// Read the identity name/email from a config file's default `[user]` section.
fn read_user(path: &Path) -> (String, String) {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    for b in parse_blocks(&text) {
        if b.is_default_user() {
            return (
                b.value_of("name").unwrap_or_default(),
                b.value_of("email").unwrap_or_default(),
            );
        }
    }
    (String::new(), String::new())
}

/// Turn a managed `[includeIf]` subsection into a `GitCondition`, or `None` if
/// its type is not one we manage.
fn condition_from_subsection(sub: &str) -> Option<GitCondition> {
    let low = sub.to_lowercase();
    if let Some(idx) = low.find("hasconfig:remote.*.url:") {
        let value = sub[idx + "hasconfig:remote.*.url:".len()..].to_string();
        return Some(GitCondition {
            kind: "remoteUrl".into(),
            value,
        });
    }
    if low.starts_with("gitdir:") {
        // Preserve the original (possibly case-sensitive) value.
        let value = sub["gitdir:".len()..].to_string();
        return Some(GitCondition {
            kind: "gitdir".into(),
            value,
        });
    }
    None
}

/// Derive a profile key from an include path (`~/.gitconfig-contoso` → `contoso`).
fn key_from_path(path: &str) -> String {
    let name = Path::new(path.trim())
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.trim().to_string());
    name.strip_prefix(".gitconfig-")
        .map(|s| s.to_string())
        .unwrap_or(name)
}

/// Read and model the current identity configuration.
pub fn read() -> AppResult<GitIdentityConfig> {
    let global = global_config_path()?;
    let text = std::fs::read_to_string(&global).unwrap_or_default();
    let blocks = parse_blocks(&text);

    let mut default_name = String::new();
    let mut default_email = String::new();

    // Group conditions by their include path so multiple `includeIf` entries
    // pointing at the same file collapse into one profile. Order is preserved.
    let mut order: Vec<String> = Vec::new();
    let mut by_path: std::collections::HashMap<String, Vec<GitCondition>> =
        std::collections::HashMap::new();
    let mut credentials: Vec<GitCredential> = Vec::new();

    for b in &blocks {
        if b.is_default_user() {
            default_name = b.value_of("name").unwrap_or_default();
            default_email = b.value_of("email").unwrap_or_default();
        } else if b.is_managed_include() {
            let sub = b.subsection.clone().unwrap_or_default();
            if let (Some(cond), Some(path)) = (condition_from_subsection(&sub), b.value_of("path")) {
                if !by_path.contains_key(&path) {
                    order.push(path.clone());
                }
                by_path.entry(path).or_default().push(cond);
            }
        } else if b.is_managed_credential() {
            let sub = b.subsection.clone().unwrap_or_default();
            let org = sub["azrepos:org/".len().min(sub.len())..].to_string();
            credentials.push(GitCredential {
                org,
                username: b.value_of("username").unwrap_or_default(),
                authority: b.value_of("azureauthority"),
            });
        }
    }

    let mut profiles: Vec<GitProfile> = Vec::new();
    for path in order {
        let conditions = by_path.remove(&path).unwrap_or_default();
        let (name, email) = read_user(&expand_tilde(&path));
        profiles.push(GitProfile {
            key: key_from_path(&path),
            name,
            email,
            path,
            conditions,
            credentials: Vec::new(),
        });
    }

    // Attach each Azure credential to the profile whose conditions reference its
    // org (case-insensitive). Unmatched credentials fall onto the first profile
    // so they stay visible/editable rather than silently dropped.
    for cred in credentials {
        let org_lc = cred.org.to_lowercase();
        let idx = profiles.iter().position(|p| {
            p.conditions
                .iter()
                .any(|c| c.value.to_lowercase().contains(&org_lc))
        });
        match idx {
            Some(i) => profiles[i].credentials.push(cred),
            None => {
                if let Some(first) = profiles.first_mut() {
                    first.credentials.push(cred);
                }
            }
        }
    }

    Ok(GitIdentityConfig {
        global_path: global.to_string_lossy().to_string(),
        default_name,
        default_email,
        profiles,
    })
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/// Sanitize a profile key into a filename-safe slug used for `~/.gitconfig-<key>`.
fn sanitize_key(key: &str) -> String {
    let slug: String = key
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    slug.trim_matches('-').to_string()
}

fn validate(cfg: &GitIdentityConfig) -> AppResult<()> {
    for p in &cfg.profiles {
        if sanitize_key(&p.key).is_empty() {
            return Err(AppError::msg("Each identity needs a name (used for its file)."));
        }
        for c in &p.conditions {
            if c.value.trim().is_empty() {
                return Err(AppError::msg(format!(
                    "Identity “{}” has an empty condition. Remove it or fill it in.",
                    p.key
                )));
            }
        }
        for cr in &p.credentials {
            if cr.org.trim().is_empty() || cr.username.trim().is_empty() {
                return Err(AppError::msg(format!(
                    "Identity “{}” has an Azure credential missing an organization or username.",
                    p.key
                )));
            }
        }
    }
    Ok(())
}

/// Build the `[user]` body for an include (profile) file.
fn user_block_text(name: &str, email: &str) -> String {
    let mut s = String::from("[user]\n");
    s.push_str(&format!("\tname = {}\n", name.trim()));
    s.push_str(&format!("\temail = {}\n", email.trim()));
    s
}

/// Write (or update) a profile's include file, preserving any non-`[user]`
/// content the user may have added to it.
fn write_profile_file(path: &Path, name: &str, email: &str) -> AppResult<()> {
    let existing = std::fs::read_to_string(path).unwrap_or_default();
    let mut kept = String::new();
    if existing.trim().is_empty() {
        kept.push_str("# Managed by DevCenter — conditional Git identity.\n");
    }
    for b in parse_blocks(&existing) {
        if b.is_default_user() {
            continue; // regenerated below
        }
        render_block(&b, &mut kept);
    }
    let mut out = String::new();
    out.push_str(&user_block_text(name, email));
    if !kept.trim().is_empty() {
        out.push('\n');
        out.push_str(&kept);
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(path, out)?;
    Ok(())
}

/// Persist the configuration: regenerate the managed sections of the global
/// `.gitconfig` and (re)write each profile's include file. Returns the freshly
/// re-read configuration.
pub fn write(cfg: &GitIdentityConfig) -> AppResult<GitIdentityConfig> {
    validate(cfg)?;

    let global = global_config_path()?;
    let text = std::fs::read_to_string(&global).unwrap_or_default();
    let blocks = parse_blocks(&text);

    // Keep everything we do not manage, verbatim and in place.
    let mut preserved = String::new();
    for b in &blocks {
        if !b.is_managed() {
            render_block(b, &mut preserved);
        }
    }

    // Normalize profiles: assign a stable include path from the (sanitized) key.
    let mut profiles = cfg.profiles.clone();
    for p in &mut profiles {
        let key = sanitize_key(&p.key);
        p.key = key.clone();
        p.path = format!("~/.gitconfig-{key}");
    }

    // Build the managed block: default identity, conditional includes, then the
    // Azure credential mappings gathered from every profile.
    let mut managed = String::new();
    managed.push_str("# ==== Managed by DevCenter — Git identities ====\n");
    managed.push_str("# Default identity. Edit these on the Git Identities page.\n");
    managed.push_str(&user_block_text(&cfg.default_name, &cfg.default_email));

    for p in &profiles {
        if p.conditions.is_empty() {
            continue;
        }
        managed.push('\n');
        managed.push_str(&format!("# Identity: {}\n", p.key));
        for c in &p.conditions {
            let value = c.value.trim();
            if value.is_empty() {
                continue;
            }
            let subsection = match c.kind.as_str() {
                "gitdir" => format!("gitdir:{value}"),
                _ => format!("hasconfig:remote.*.url:{value}"),
            };
            let escaped = subsection.replace('\\', "\\\\").replace('"', "\\\"");
            managed.push_str(&format!("[includeIf \"{escaped}\"]\n"));
            managed.push_str(&format!("\tpath = {}\n", p.path));
        }
    }

    let mut wrote_cred_header = false;
    for p in &profiles {
        for cr in &p.credentials {
            let org = cr.org.trim();
            if org.is_empty() || cr.username.trim().is_empty() {
                continue;
            }
            if !wrote_cred_header {
                managed.push_str("\n# Azure DevOps credential-helper usernames.\n");
                wrote_cred_header = true;
            }
            let escaped = format!("azrepos:org/{org}")
                .replace('\\', "\\\\")
                .replace('"', "\\\"");
            managed.push_str(&format!("[credential \"{escaped}\"]\n"));
            if let Some(auth) = cr.authority.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                managed.push_str(&format!("\tazureAuthority = {auth}\n"));
            }
            managed.push_str(&format!("\tusername = {}\n", cr.username.trim()));
        }
    }

    // Assemble: preserved content first (keeps the base `[user]` order sensible),
    // then DevCenter's managed block. `includeIf` must follow the default
    // `[user]` for the override to take effect — which it does here.
    let mut out = String::new();
    let preserved = preserved.trim_end();
    if !preserved.is_empty() {
        out.push_str(preserved);
        out.push_str("\n\n");
    }
    out.push_str(managed.trim_end());
    out.push('\n');

    std::fs::write(&global, out)?;

    // Write each profile's include file.
    for p in &profiles {
        write_profile_file(&expand_tilde(&p.path), &p.name, &p.email)?;
    }

    read()
}
