// Git Identities page — default identity + conditional (includeIf) profiles.
// Ported from app/ui/js/git-identity.js.

import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { ICONS, Raw } from "@/lib/ico";
import { modal } from "@/components/modal";
import type { GitIdentity, IdentityCondKind, IdentityCredential, IdentityProfile } from "@/types/models";
import styles from "./Identities.module.css";

const identity = signal<GitIdentity | null>(null);
const loaded = signal(false);
let started = false;

const COND: Record<IdentityCondKind, { label: string; short: string; placeholder: string }> = {
  remoteUrl: { label: "Remote URL matches", short: "URL", placeholder: "https://dev.azure.com/Contoso/**" },
  gitdir: { label: "Repository folder", short: "Folder", placeholder: "C:/Users/you/work/" },
};

export async function initIdentity(): Promise<void> {
  if (started) return;
  started = true;
  if (!ipc.hasBackend) {
    loaded.value = true;
    return;
  }
  try {
    const data = await ipc.readGitIdentity();
    if (data) identity.value = data;
  } catch (e) {
    console.error("readGitIdentity failed", e);
  } finally {
    loaded.value = true;
  }
}

async function persist(next: GitIdentity): Promise<boolean> {
  try {
    const saved = await ipc.saveGitIdentity(next);
    identity.value = saved;
    return true;
  } catch (e) {
    await modal.alert({ title: "Couldn't save Git identities", message: String(e) });
    return false;
  }
}

export function Identities() {
  return (
    <>
      <header class="page-head">
        <div>
          <h1>Git Identities</h1>
          <p class="page-desc">Design a multi-account Git setup: a default identity plus per-repository identities that switch automatically based on the remote URL or folder.</p>
        </div>
      </header>

      <div id="gitIdentityRoot">
        {!ipc.hasBackend ? (
          <div class="account-empty">
            <Raw html={ICONS.gear} />
            <div>Git identity management is available in the desktop app.</div>
          </div>
        ) : !loaded.value || !identity.value ? (
          <div class="account-empty">
            <Raw html={ICONS.sync} />
            <div>Loading your Git configuration…</div>
          </div>
        ) : (
          <IdentityBody g={identity.value} />
        )}
      </div>
    </>
  );
}

function IdentityBody({ g }: { g: GitIdentity }) {
  return (
    <>
      <div class={styles.defaultCard}>
        <div class={styles.defaultHead}>
          <div>
            <div class={styles.defaultLabel}>Default identity</div>
            <div class={styles.defaultDesc}>Used for every repository that doesn't match a condition below.</div>
          </div>
          <button class="btn btn-ghost btn-sm" onClick={editDefault}>
            <Raw html={ICONS.pencil} />
            Edit
          </button>
        </div>
        <div class={styles.defaultBody}>
          <div class={styles.keyValue}>
            <span>Name</span>
            <strong>{g.defaultName || <em>Not set</em>}</strong>
          </div>
          <div class={styles.keyValue}>
            <span>Email</span>
            <strong>{g.defaultEmail || <em>Not set</em>}</strong>
          </div>
        </div>
      </div>

      <div class={styles.sectionHead}>
        <div class={styles.sectionTitle}>Conditional identities</div>
        <button class="btn btn-primary btn-sm" onClick={() => editProfile(null)}>
          <Raw html={ICONS.plus} />
          Add identity
        </button>
      </div>
      <div class={styles.identityList}>
        {g.profiles.length === 0 ? (
          <div class="account-empty">
            <Raw html={ICONS.branch} />
            <div>
              <strong>No conditional identities yet</strong>
              <br />
              Add one to use a different name, email or Azure credential for specific repositories.
            </div>
          </div>
        ) : (
          g.profiles.map((p, i) => <ProfileCard key={p.key} profile={p} index={i} />)
        )}
      </div>

      <div class={styles.footer}>
        <Raw html={ICONS.gear} />
        <span>
          Saved to <code>{g.globalPath}</code> and per-identity <code>~/.gitconfig-*</code> files. {window.BRAND} only
          rewrites the sections it manages — your other settings are left untouched.
        </span>
      </div>
    </>
  );
}

function ProfileCard({ profile: p, index }: { profile: IdentityProfile; index: number }) {
  return (
    <div class={styles.identityCard}>
      <div class={styles.cardHead}>
        <div class={styles.cardTitle}>
          <code class={styles.identityFile}>~/.gitconfig-{p.key}</code>
        </div>
        <div class={styles.cardActions}>
          <button class="btn btn-ghost btn-sm" onClick={() => editProfile(index)}>
            <Raw html={ICONS.pencil} />
            Edit
          </button>
          <button class="btn btn-icon btn-sm" title="Remove identity" onClick={() => removeProfile(index)}>
            <Raw html={ICONS.trash} />
          </button>
        </div>
      </div>
      <div class={styles.defaultBody}>
        <div class={styles.keyValue}>
          <span>Name</span>
          <strong>{p.name || <em>Not set</em>}</strong>
        </div>
        <div class={styles.keyValue}>
          <span>Email</span>
          <strong>{p.email || <em>Not set</em>}</strong>
        </div>
      </div>
      <div class={styles.conditions}>
        {p.conditions.length ? (
          p.conditions.map((c, i) => (
            <div class={styles.conditionLine} key={i}>
              <span class={styles.conditionKind}>{COND[c.kind]?.short || "URL"}</span>
              <code>{c.value || ""}</code>
            </div>
          ))
        ) : (
          <div class={`${styles.conditionLine} ${styles.warning}`}>No conditions — never activates</div>
        )}
      </div>
      {p.credentials && p.credentials.length ? (
        <div class={styles.credentials}>
          <span class={styles.credentialsLabel}>
            <Raw html={ICONS.key} />
            Azure credentials
          </span>
          <div class={styles.credentialList}>
            {p.credentials.map((c, i) => (
              <div class={styles.conditionLine} key={i}>
                <span class={`${styles.conditionKind} ${styles.organization}`}>{c.org}</span>
                <code>{c.username}</code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function editDefault() {
  const g = identity.value;
  if (!g) return;
  void modal.custom<boolean>({
    title: "Default identity",
    body: (close) => <DefaultForm g={g} close={close} />,
  });
}

function DefaultForm({ g, close }: { g: GitIdentity; close: (v: boolean) => void }) {
  const [name, setName] = useState(g.defaultName || "");
  const [email, setEmail] = useState(g.defaultEmail || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !email.trim()) return setErr("Enter both a name and an email.");
    setSaving(true);
    const ok = await persist({ ...g, defaultName: name.trim(), defaultEmail: email.trim() });
    if (ok) close(true);
    else setSaving(false);
  };

  return (
    <>
      <div class="form-row">
        <label class="form-label">Name</label>
        <input class="modal-input" placeholder="Jane Doe" spellcheck={false} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </div>
      <div class="form-row">
        <label class="form-label">Email</label>
        <input class="modal-input" placeholder="jane@example.com" spellcheck={false} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
      </div>
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(false)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}

function editProfile(index: number | null) {
  const g = identity.value;
  if (!g) return;
  const existing = index != null && index >= 0 ? g.profiles[index] : null;
  void modal
    .custom<IdentityProfile | null>({
      title: existing ? "Edit identity" : "Add identity",
      wide: true,
      body: (close) => <ProfileForm existing={existing} close={close} />,
    })
    .then(async (profile) => {
      if (!profile) return;
      const cur = identity.value!;
      const next = { ...cur, profiles: cur.profiles.slice() };
      if (existing && index != null) next.profiles[index] = profile;
      else next.profiles.push(profile);
      await persist(next);
    });
}

async function removeProfile(index: number) {
  const g = identity.value;
  if (!g) return;
  const p = g.profiles[index];
  if (!p) return;
  const ok = await modal.confirm({
    title: "Remove identity",
    message: `Remove "${p.name || p.key}"? Its condition will be removed from ~/.gitconfig. The ~/.gitconfig-${p.key} file is left on disk in case you still need it.`,
    confirmText: "Remove",
    danger: true,
  });
  if (!ok) return;
  const next = { ...g, profiles: g.profiles.slice() };
  next.profiles.splice(index, 1);
  await persist(next);
}

const slug = (s: string) =>
  (s || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

function ProfileForm({ existing, close }: { existing: IdentityProfile | null; close: (v: IdentityProfile | null) => void }) {
  const [key, setKey] = useState(existing?.key || "");
  const [name, setName] = useState(existing?.name || "");
  const [email, setEmail] = useState(existing?.email || "");
  const [conds, setConds] = useState(
    existing?.conditions?.length ? existing.conditions.slice() : [{ kind: "remoteUrl" as IdentityCondKind, value: "" }],
  );
  const [creds, setCreds] = useState<IdentityCredential[]>(existing?.credentials?.slice() || []);
  const [err, setErr] = useState("");

  const fileKey = slug(key) || "…";

  const save = () => {
    const k = slug(key);
    if (!k) return setErr("Enter an identity name.");
    if (!name.trim() || !email.trim()) return setErr("Enter a Git name and email for this identity.");
    const conditions = conds.filter((c) => c.value.trim()).map((c) => ({ kind: c.kind, value: c.value.trim() }));
    if (!conditions.length) return setErr("Add at least one condition so this identity can activate.");
    const credentials: IdentityCredential[] = [];
    let credError = false;
    for (const c of creds) {
      const org = c.org.trim();
      const username = c.username.trim();
      if (!org && !username) continue;
      if (!org || !username) credError = true;
      credentials.push({ org, username, authority: c.authority || null });
    }
    if (credError) return setErr("Each Azure credential needs both an organization and a username.");
    setErr("");
    close({ key: k, name: name.trim(), email: email.trim(), path: `~/.gitconfig-${k}`, conditions, credentials });
  };

  return (
    <>
      <div class={styles.formGrid}>
        <div class="form-row">
          <label class="form-label">Identity name</label>
          <input class="modal-input" placeholder="e.g. work" spellcheck={false} value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
          <div class="form-hint">
            Used for the file <code>~/.gitconfig-{fileKey}</code>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">Git email</label>
          <input class="modal-input" placeholder="jane@contoso.com" spellcheck={false} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">Git name</label>
        <input class="modal-input" placeholder="Jane Doe" spellcheck={false} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </div>

      <div class="form-row">
        <label class="form-label">Activate when…</label>
        <div class={styles.rows}>
          {conds.map((c, i) => (
            <div class={styles.row} key={i}>
              <select
                class="modal-input"
                value={c.kind}
                onChange={(e) => {
                  const kind = (e.target as HTMLSelectElement).value as IdentityCondKind;
                  setConds((prev) => prev.map((x, j) => (j === i ? { ...x, kind } : x)));
                }}
              >
                <option value="remoteUrl">{COND.remoteUrl.label}</option>
                <option value="gitdir">{COND.gitdir.label}</option>
              </select>
              <input
                class="modal-input"
                spellcheck={false}
                placeholder={COND[c.kind].placeholder}
                value={c.value}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setConds((prev) => prev.map((x, j) => (j === i ? { ...x, value } : x)));
                }}
              />
              <button class="btn btn-icon btn-sm" type="button" title="Remove" onClick={() => setConds((prev) => prev.filter((_, j) => j !== i))}>
                <Raw html={ICONS.x} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" class={`btn btn-ghost btn-sm ${styles.addRowButton}`} onClick={() => setConds((prev) => [...prev, { kind: "remoteUrl", value: "" }])}>
          <Raw html={ICONS.plus} />
          Add condition
        </button>
      </div>

      <details class={styles.advanced} open={creds.length > 0}>
        <summary>Azure DevOps credential usernames (optional)</summary>
        <div class={`form-hint ${styles.advancedHint}`}>
          Maps a sign-in username to an Azure DevOps organization so the credential helper picks the right account.
        </div>
        <div class={styles.rows}>
          {creds.map((c, i) => (
            <div class={`${styles.row} ${styles.credentialRow}`} key={i}>
              <input
                class="modal-input"
                placeholder="organization"
                spellcheck={false}
                value={c.org}
                onInput={(e) => {
                  const org = (e.target as HTMLInputElement).value;
                  setCreds((prev) => prev.map((x, j) => (j === i ? { ...x, org } : x)));
                }}
              />
              <input
                class="modal-input"
                placeholder="user@contoso.com"
                spellcheck={false}
                value={c.username}
                onInput={(e) => {
                  const username = (e.target as HTMLInputElement).value;
                  setCreds((prev) => prev.map((x, j) => (j === i ? { ...x, username } : x)));
                }}
              />
              <button class="btn btn-icon btn-sm" type="button" title="Remove" onClick={() => setCreds((prev) => prev.filter((_, j) => j !== i))}>
                <Raw html={ICONS.x} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" class={`btn btn-ghost btn-sm ${styles.addRowButton}`} onClick={() => setCreds((prev) => [...prev, { org: "", username: "", authority: null }])}>
          <Raw html={ICONS.plus} />
          Add credential
        </button>
      </details>

      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={save}>
          {existing ? "Save identity" : "Add identity"}
        </button>
      </div>
    </>
  );
}
