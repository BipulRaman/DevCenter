# Auto-update setup

App ships with Tauri's built-in updater. Release installers are signed in
CI with a **minisign (Ed25519) keypair** so the in-app updater can verify that
every update came from this repository and wasn't tampered with on the way to
the user.

This page documents the signing setup. Both halves of the key are kept as
**repository secrets** — nothing key-related is committed to `tauri.conf.json`.
The public key is injected into the build from a secret (via `--config`), and
the private key signs the artifacts. A maintainer just needs to add those two
secrets (see [Required: add the signing secrets](#required-add-the-signing-secrets)).

> **Design choice — no passphrase.** The private key is generated *without* a
> passphrase. A second secret (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) would add
> no real security — the key and its password would both live in GitHub
> Secrets, so anyone who can read one can read the other — and it removes a
> whole class of CI breakage ("Wrong password for that key" from shell
> escaping, CRLF, trailing newlines, etc.). The release workflow passes the
> password env var as an **empty string** to match.

---

## What's already wired up

- `tauri-plugin-updater` registered in [../app/src-tauri/src/lib.rs](../app/src-tauri/src/lib.rs)
  (`tauri_plugin_updater::Builder::new().build()`).
- Boot-time check `auto_update_on_start` (release builds only) + the manual
  `check_for_updates` command, both in
  [../app/src-tauri/src/lib.rs](../app/src-tauri/src/lib.rs) and
  [../app/src-tauri/src/commands/os.rs](../app/src-tauri/src/commands/os.rs).
- **Check for updates** button (`#checkUpdateBtn`) in
  [../app/ui/index.html](../app/ui/index.html), wired in
  [../app/ui/js/app.js](../app/ui/js/app.js); progress is surfaced through the
  `update_state` event (`onUpdateState` in
  [../app/ui/js/api.js](../app/ui/js/api.js)).
- Updater endpoint + `installMode` in
  [../app/src-tauri/tauri.conf.json](../app/src-tauri/tauri.conf.json). The
  `pubkey` is left empty and `createUpdaterArtifacts` is `false` there — both are
  supplied at build time from secrets, so local builds never need a key.
- Release workflow injects the pubkey from a secret, signs the installer, and
  publishes `latest.json` —
  [../.github/workflows/release.yml](../.github/workflows/release.yml).
- Helper workflow that regenerates the keypair entirely in CI —
  [../.github/workflows/generate-updater-keys.yml](../.github/workflows/generate-updater-keys.yml).

---

## Required: add the signing secrets

Add **two** repository secrets. Until they exist, the release build can't sign
or embed the updater key.

Copy each key to your clipboard (neither ever prints to the screen):

```powershell
# Private key (signs the installer)
Get-Content "$HOME\.tauri\devcenter.key" -Raw | Set-Clipboard
# ...paste into TAURI_SIGNING_PRIVATE_KEY, then:

# Public key (embedded into the app to verify updates)
Get-Content "$HOME\.tauri\devcenter.key.pub" -Raw | Set-Clipboard
```

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~\.tauri\devcenter.key` |
| `TAURI_SIGNING_PUBLIC_KEY`  | Contents of `~\.tauri\devcenter.key.pub` |

There is **no** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret — the workflow sets
that env var to an empty string. If an old one exists, delete it.

> The public key isn't sensitive (it's baked into every shipped build and can be
> extracted from any installer) — it's kept as a secret here only so nothing
> key-related lives in the repo. The **private key is the real secret**.
>
> **Back up `~\.tauri\devcenter.key`.** If you lose it you cannot sign updates
> that existing installs will accept — see [Rotating the key](#rotating-the-key).

---

## Generating a keypair

You only need this when setting up a fresh fork or [rotating the key](#rotating-the-key).
DevGitCenter's key already exists, so you can skip this section for normal use.

### Option A — locally (Tauri CLI installed)

```powershell
cargo tauri signer generate -w "$HOME\.tauri\devcenter.key" --ci
```

- `-w` writes two files: `devcenter.key` (private) and `devcenter.key.pub` (public).
- `--ci` generates a key with an empty passphrase and never prompts.

Then read the public key:

```powershell
Get-Content "$HOME\.tauri\devcenter.key.pub" -Raw
```

Add both halves as the `TAURI_SIGNING_PUBLIC_KEY` and `TAURI_SIGNING_PRIVATE_KEY`
secrets (steps above) — nothing goes into `tauri.conf.json`.

### Option B — in CI (no local Tauri needed)

**Actions** tab → **Generate Updater Signing Keys** → **Run workflow**.

The run:
1. Prints the **public key** (and masks the private key in the log).
2. Uploads the keypair as a **1-day artifact** named `tauri-signing-keypair`.
3. Prints step-by-step instructions.

Then: create the `TAURI_SIGNING_PUBLIC_KEY` secret from the printed public key,
download the artifact and create the `TAURI_SIGNING_PRIVATE_KEY` secret from the
file named `key`, and **delete the artifact**.

---

## Shipping a release

The release workflow triggers on a **published** GitHub Release (or manual
dispatch). The release tag drives the version (`v1.0.2` → `1.0.2`).

**From the GitHub UI (recommended):**

1. **Releases → Draft a new release**.
2. Choose / create a tag like `v1.0.2`, write the notes.
3. **Publish release**.

**From the Actions tab (ad-hoc rebuild):**

- **Actions → Release → Run workflow**, enter the tag (e.g. `v1.0.2`).

Either way the workflow produces and attaches:

Either way the workflow builds every OS in a matrix and attaches:

- `DevGitCenter_<version>_x64-setup.exe` — Windows NSIS installer
- `DevGitCenter_<version>_aarch64.dmg` / `…_x64.dmg` — macOS (Apple Silicon / Intel)
- `DevGitCenter_<version>_amd64.AppImage` and `…_amd64.deb` — Linux
- a `.sig` file next to each updater bundle — the update signature
- `latest.json` — one manifest with a per-platform entry that the in-app updater fetches

---

## Verifying the update flow

1. Install the **previous** version of DevGitCenter.
2. Launch it (the boot check runs after a moment in release builds), or open
   **Settings → Check for updates**.
3. The app finds the new version, verifies the signature, downloads, installs,
   and relaunches on the new version.

Future published releases reach existing installs automatically through the
same path.

---

## Rotating the key

Generate a new keypair ([Option A](#option-a--locally-tauri-cli-installed) or
[B](#option-b--in-ci-no-local-tauri-needed)), then replace **both** the
`TAURI_SIGNING_PUBLIC_KEY` and `TAURI_SIGNING_PRIVATE_KEY` secrets, and publish a
new release.

> **Important:** every existing install has the *old* public key compiled in.
> After a rotation they cannot auto-update — the new signature won't match the
> old pubkey. Call this out in the release notes: that version needs a manual
> reinstall once; subsequent updates work normally.

---

## Endpoint URL

The app fetches the update manifest from:

```
https://github.com/BipulRaman/DevCenter/releases/latest/download/latest.json
```

This GitHub-provided URL permanently redirects to the latest published
release's `latest.json`, so it always points at the newest version. It's
configured in
[../app/src-tauri/tauri.conf.json](../app/src-tauri/tauri.conf.json) under
`plugins.updater.endpoints`.
