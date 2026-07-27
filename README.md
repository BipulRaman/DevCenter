# DevGitCenter

DevGitCenter is a cross-platform Tauri desktop app that brings your local Git
repositories, your GitHub / Azure DevOps pull requests and your local apps into
one window.

- **Git Board** — discover, clone, watch, tag and fetch local repositories.
- **Changes** — stage, diff, commit, push/pull, plus branches, history, stashes,
  tags, worktrees and remotes.
- **Conflict resolver** — resolve merge / rebase / cherry-pick conflicts per hunk.
- **Pull Requests + PR Reviewer** — list PRs across GitHub and Azure DevOps, then
  read diffs, reply to threads and approve or request changes in-app.
- **App Center** — build and run local apps (.NET, Node, React, Next.js, Angular,
  Vue, Express, static folders, scripts, OpenAPI mocks) with live streamed logs.
- **Accounts & Git Identities** — multiple provider accounts with tokens in the OS
  keychain, and default plus conditional Git identities.

## Platforms

CI builds and releases native bundles for:

- **Windows** — `.exe` (NSIS) installer
- **macOS** — `.dmg` for both Apple Silicon (`aarch64`) and Intel (`x86_64`)
- **Linux** — `.AppImage` and `.deb`

## Building locally

The frontend is a Preact + TypeScript app in `app/ui2`, built with Vite via
[Bun](https://bun.sh). You need the Rust toolchain, the Tauri CLI and Bun:

```sh
cd app/ui2
bun install          # once, to install frontend dependencies

cd ../
cargo tauri dev      # run with hot reload
cargo tauri build    # build the installer for the current OS
```

`cargo tauri dev` / `build` start the Vite dev server and production build for
you (see `build.beforeDevCommand` in `app/src-tauri/tauri.conf.json`).

On **Linux** install the WebKitGTK build dependencies first:

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

macOS release builds are ad-hoc signed (`bundle.macOS.signingIdentity = "-"`) so
unsigned Apple Silicon downloads aren't flagged as "damaged"; replace this with a
real Apple Developer identity to notarize.

## Auto-update

Release builds auto-update via the Tauri updater plugin. Installers are signed
in CI for every OS, and existing installs pick up new versions from published
GitHub Releases. The feed endpoint is configured in
`app/src-tauri/tauri.conf.json`; the signing keys are **not** committed — the
public key is injected from a secret at build time.

To enable signed releases, add two repository secrets:
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PUBLIC_KEY`. See
**[docs/auto-update-setup.md](docs/auto-update-setup.md)** for the full
walkthrough — key generation, the secrets, the release flow, and key rotation.