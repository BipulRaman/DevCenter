// Accounts page — connect/test/remove GitHub and Azure DevOps accounts.
// Ported from the account UI in app/ui/js/backend.js.

import { useSignal } from "@preact/signals";
import { useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { accounts, accountsLoaded, upsertAccount, removeAccountLocal } from "@/state/accounts";
import { hydratePulls } from "@/state/pulls";
import { ICONS, Raw } from "@/lib/ico";
import { modal } from "@/components/modal";
import type { Account } from "@/types/models";
import styles from "./Accounts.module.css";

function providerMeta(p: string) {
  return p === "azure"
    ? { icon: ICONS.azure, cls: styles.azure, name: "Azure DevOps" }
    : { icon: ICONS.github, cls: styles.github, name: "GitHub" };
}

export function Accounts() {
  return (
    <>
      <header class="page-head">
        <div>
          <h1>Accounts</h1>
          <p class="page-desc">Connect GitHub and Azure DevOps so pull requests can load for your watched repositories.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onClick={openAddAccount}>
            <Raw html={ICONS.plus} />
            Add account
          </button>
        </div>
      </header>

      <div class={styles.accountList}>
        {!ipc.hasBackend ? (
          <div class="account-empty">
            <Raw html={ICONS.key} />
            <div>Account management is available in the desktop app.</div>
          </div>
        ) : !accountsLoaded.value ? (
          <div class="account-empty">
            <Raw html={ICONS.key} />
            <div>Loading accounts…</div>
          </div>
        ) : accounts.value.length === 0 ? (
          <div class="account-empty">
            <Raw html={ICONS.key} />
            <div>
              <strong>No accounts connected</strong>
              <br />
              Add a GitHub or Azure DevOps account to load pull requests for your watched repositories.
            </div>
          </div>
        ) : (
          accounts.value.map((a) => <AccountRow key={a.id} account={a} />)
        )}
      </div>
    </>
  );
}

function AccountRow({ account: a }: { account: Account }) {
  const testing = useSignal(false);
  const m = providerMeta(a.provider);
  const stateCls = a.status === "connected" ? styles.connected : a.status === "error" ? styles.error : styles.unverified;
  const stateLabel = a.status === "connected" ? "Connected" : a.status === "error" ? "Error" : "Unverified";

  const test = async () => {
    testing.value = true;
    try {
      const updated = await ipc.testAccount(a.id);
      upsertAccount(updated);
      void hydratePulls();
    } catch (e) {
      upsertAccount({ ...a, status: "error" });
      await modal.alert({ title: "Connection failed", message: String(e) });
    } finally {
      testing.value = false;
    }
  };

  const remove = async () => {
    const ok = await modal.confirm({
      title: "Remove account",
      message: `Remove "${a.label}"? Its stored token will be deleted from this machine.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await ipc.removeAccount(a.id);
      removeAccountLocal(a.id);
      void hydratePulls();
    } catch (e) {
      await modal.alert({ title: "Couldn't remove account", message: String(e) });
    }
  };

  return (
    <div class={styles.accountRow}>
      <div class={`${styles.accountIcon} ${m.cls}`}>
        <Raw html={m.icon} />
      </div>
      <div class={styles.accountMain}>
        <div class={styles.titleRow}>
          <span class={styles.accountName}>{a.label || ""}</span>
          <span class={`${styles.accountState} ${stateCls}`}>{stateLabel}</span>
        </div>
        <div class={styles.accountSub}>
          {m.name}
          {a.organization ? ` · ${a.organization}` : ""} · {a.username ? <code>{a.username}</code> : "Token"}
        </div>
      </div>
      <div class={styles.accountActions}>
        <button class="btn btn-ghost btn-sm" disabled={testing.value} onClick={test}>
          <span class={testing.value ? "spin" : undefined}>
            <Raw html={ICONS.sync} />
          </span>
          {testing.value ? "Testing…" : "Test"}
        </button>
        <button class="btn btn-icon btn-sm" title="Remove account" onClick={remove}>
          <Raw html={ICONS.trash} />
        </button>
      </div>
    </div>
  );
}

export function openAddAccount(): Promise<Account | null> {
  return modal.custom<Account | null>({
    title: "Add account",
    body: (close) => <AddAccountForm close={close} />,
  }).then((acc) => {
    if (acc) {
      upsertAccount(acc);
      void hydratePulls();
    }
    return acc;
  });
}

function normalizeOrg(s: string): string {
  s = (s || "").trim().replace(/^https?:\/\//, "");
  const vs = s.indexOf(".visualstudio.com");
  if (vs >= 0) return s.slice(0, vs);
  if (s.startsWith("dev.azure.com/")) return s.slice("dev.azure.com/".length).split("/")[0];
  return s.split("/")[0].trim();
}

function AddAccountForm({ close }: { close: (v: Account | null) => void }) {
  const [provider, setProvider] = useState<"github" | "azure">("github");
  const [username, setUsername] = useState("");
  const [org, setOrg] = useState("");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"git" | "token">("token");
  const [gitHost, setGitHost] = useState<string | null>(null);
  const [authLabel, setAuthLabel] = useState("Sign in with Git in browser");
  const [authBusy, setAuthBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const resetGit = () => {
    setMode("token");
    setGitHost(null);
    setAuthLabel("Sign in with Git in browser");
  };

  const hint =
    provider === "azure"
      ? "Reuses Git Credential Manager — the same Microsoft sign-in you saw when cloning. Or paste a token below."
      : "Reuses Git Credential Manager — the same GitHub sign-in you saw when cloning. Or paste a token below.";

  const signIn = async () => {
    setErr("");
    let host: string;
    if (provider === "azure") {
      const raw = org.trim();
      const o = normalizeOrg(raw);
      if (!o) return setErr("Enter your Azure DevOps organization first.");
      host = /visualstudio\.com/i.test(raw) ? `${o}.visualstudio.com` : "dev.azure.com";
    } else {
      host = "github.com";
    }
    if (!ipc.hasBackend) return setErr("Browser sign-in is only available in the desktop app.");
    setAuthBusy(true);
    setAuthLabel("Waiting for sign-in…");
    try {
      const cred = await ipc.gitToken(host);
      if (provider === "github" && cred.username && /^[a-zA-Z0-9-]+$/.test(cred.username) && !username.trim()) {
        setUsername(cred.username);
      }
      setToken("");
      setMode("git");
      setGitHost(host);
      setAuthLabel('Signed in — click "Add account"');
    } catch (e) {
      setErr(String(e));
      setAuthLabel("Sign in with Git in browser");
    } finally {
      setAuthBusy(false);
    }
  };

  const openTokenPage = () => {
    let url: string;
    if (provider === "azure") {
      const o = normalizeOrg(org);
      if (!o) return setErr("Enter your Azure DevOps organization first.");
      url = `https://dev.azure.com/${encodeURIComponent(o)}/_usersSettings/tokens`;
    } else {
      url = "https://github.com/settings/tokens/new?description=" + encodeURIComponent(window.BRAND) + "&scopes=repo";
    }
    setErr("");
    if (ipc.hasBackend) ipc.openUrl(url).catch(() => {});
    else window.open(url, "_blank");
  };

  const save = async () => {
    if (provider === "azure" && !org.trim()) return setErr("Enter your Azure DevOps organization.");
    if (mode !== "git" && !token) return setErr("Sign in with Git, or paste a token.");
    setErr("");
    setSaving(true);
    try {
      const account = await ipc.addAccount({
        provider,
        username: provider === "github" ? username.trim() : null,
        organization: provider === "azure" ? org.trim() : null,
        authKind: mode,
        host: mode === "git" ? gitHost : null,
        token: mode === "git" ? null : token,
        label: null,
      });
      close(account);
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  return (
    <>
      <div class="form-row">
        <label class="form-label">Provider</label>
        <div class={styles.formChoice}>
          <button
            type="button"
            class={`${styles.formOpt}${provider === "github" ? ` ${styles.active}` : ""}`}
            onClick={() => {
              setProvider("github");
              resetGit();
            }}
          >
            <Raw html={ICONS.github} />
            GitHub
          </button>
          <button
            type="button"
            class={`${styles.formOpt}${provider === "azure" ? ` ${styles.active}` : ""}`}
            onClick={() => {
              setProvider("azure");
              resetGit();
            }}
          >
            <Raw html={ICONS.azure} />
            Azure DevOps
          </button>
        </div>
      </div>
      {provider === "github" ? (
        <div class="form-row">
          <label class="form-label">Username (optional)</label>
          <input
            class="modal-input"
            placeholder="auto-detected if left blank"
            spellcheck={false}
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          />
        </div>
      ) : (
        <div class="form-row">
          <label class="form-label">Organization</label>
          <input
            class="modal-input"
            placeholder="e.g. contoso — or paste your Azure DevOps URL"
            spellcheck={false}
            value={org}
            onInput={(e) => setOrg((e.target as HTMLInputElement).value)}
          />
        </div>
      )}
      <div class="form-row">
        <label class="form-label">Authentication</label>
        <button type="button" class={`btn btn-primary ${styles.authButton}`} disabled={authBusy} onClick={signIn}>
          {authBusy ? <span class="spin"><Raw html={ICONS.sync} /></span> : <Raw html={mode === "git" ? ICONS.check : ICONS.external} />}
          {authLabel}
        </button>
        <div class="form-hint">{hint}</div>
      </div>
      <div class="form-row">
        <label class="form-label">Or paste a token</label>
        <input
          class="modal-input"
          type="password"
          placeholder="Personal access token"
          spellcheck={false}
          value={token}
          onInput={(e) => {
            setToken((e.target as HTMLInputElement).value);
            if ((e.target as HTMLInputElement).value) resetGit();
          }}
        />
        <button type="button" class={`btn btn-ghost btn-sm ${styles.tokenLink}`} onClick={openTokenPage}>
          <Raw html={ICONS.key} />
          Create a token…
        </button>
      </div>
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" disabled={saving} onClick={save}>
          {saving ? "Connecting…" : "Add account"}
        </button>
      </div>
    </>
  );
}
