// TypeScript mirrors of the Rust serde models in app/src-tauri/src/models.rs.
// Rust structs use `#[serde(rename_all = "camelCase")]`, so field names here are
// camelCase. Keep this file in sync with models.rs (or generate via tauri-specta
// later — see plan.md §10).

export type Provider = "github" | "azure" | "other";

export interface Repo {
  id: string;
  name: string;
  path: string;
  branch: string;
  remote: string;
  /** "github" | "azure" | "other" */
  provider: Provider;
  /** "clean" | "dirty" */
  status: "clean" | "dirty";
  ahead: number;
  behind: number;
  lastFetch: string | null;
  watched: boolean;
  tags: string[];
}

export interface Account {
  /** "github.com" for GitHub, "azure:{org}" for Azure DevOps. */
  id: string;
  provider: "github" | "azure";
  label: string;
  host: string;
  organization: string | null;
  username: string | null;
  /** "token" | "git" */
  authKind: "token" | "git";
  /** "connected" | "error" | "unverified" */
  status: "connected" | "error" | "unverified";
}

export interface PrComment {
  id: string;
  author: string;
  body: string;
  created: string;
}

export interface PrThread {
  id: string;
  path: string | null;
  line: number | null;
  resolved: boolean;
  canResolve: boolean;
  comments: PrComment[];
}

export interface PullRequest {
  id: number;
  title: string;
  repo: string;
  repoId: string;
  author: string;
  branch: string;
  base: string;
  /** "open" | "draft" | "merged" */
  status: "open" | "draft" | "merged";
  /** "approved" | "changes" | "pending" */
  reviews: "approved" | "changes" | "pending";
  approvals: number;
  approvedByMe: boolean;
  comments: number;
  additions: number;
  deletions: number;
  updated: string;
  url: string;
}

export type FileStatus =
  | "new"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "typechange";

export interface FileChange {
  path: string;
  oldPath: string | null;
  status: FileStatus;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  when: string;
}

export interface GitTagInfo {
  name: string;
  target: string;
  message: string | null;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  isMain: boolean;
  locked: boolean;
}

export interface GitLogEntry {
  time: string;
  repo: string;
  action: string;
  ok: boolean;
  detail: string | null;
}

export interface ChangeSet {
  branch: string | null;
  summary: string | null;
  author: string | null;
  when: string | null;
  files: FileChange[];
  staged: FileChange[];
  unstaged: FileChange[];
  stashes: StashEntry[];
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

export interface DiffLine {
  /** "add" | "del" | "ctx" */
  kind: "add" | "del" | "ctx";
  content: string;
  oldLineno: number | null;
  newLineno: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  oldImage?: string | null;
  newImage?: string | null;
}

export interface ConflictInfo {
  /** "merge" | "rebase" | "cherry-pick" | "revert" | "none" */
  kind: "merge" | "rebase" | "cherry-pick" | "revert" | "none";
  ours: string;
  theirs: string;
  files: string[];
}

export interface ConflictFile {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  merged: string;
  binary: boolean;
}

export interface CommitInfo {
  /** Short hash (7 chars). */
  id: string;
  /** Full hash. */
  hash: string;
  summary: string;
  author: string;
  when: string;
  unpushed: boolean;
  tags: string[];
}

// --- App Center -------------------------------------------------------------

export type ServeMode = "command" | "static" | "script" | "apimock";
export type AppStatus = "running" | "building" | "error" | "stopped";

export interface AppPreset {
  value: string;
  label: string;
  serveMode: ServeMode | string;
  port?: number | null;
  commands?: string;
  env?: string;
  staticDir?: string;
}

export interface ManagedApp {
  id: number;
  name: string;
  appType: string;
  serveMode: ServeMode;
  projectDir: string;
  commands: string[];
  staticDir: string | null;
  scriptFile: string | null;
  specFile: string | null;
  /** [key, value] pairs. */
  env: [string, string][];
  port: number | null;
  autostart: boolean;
  order: number;
  status: AppStatus;
  pid?: number | null;
  uptime?: string;
  tags: string[];
}

// --- Event payloads (Rust -> UI) -------------------------------------------

export interface AppStatusEvent {
  id: number | string;
  status: AppStatus;
  pid?: number | null;
  uptime?: string;
}

export interface AppLogEvent {
  id: number | string;
  line: string;
  ts?: string;
  level?: string;
  stream?: string;
  /** Cached rendered HTML (client-side memo). */
  __html?: string;
}

// --- Git Identities ---------------------------------------------------------

export type IdentityCondKind = "remoteUrl" | "gitdir";

export interface IdentityCondition {
  kind: IdentityCondKind;
  value: string;
}

export interface IdentityCredential {
  org: string;
  username: string;
  authority: string | null;
}

export interface IdentityProfile {
  key: string;
  name: string;
  email: string;
  path: string;
  conditions: IdentityCondition[];
  credentials: IdentityCredential[];
}

export interface GitIdentity {
  defaultName: string;
  defaultEmail: string;
  globalPath: string;
  profiles: IdentityProfile[];
}
