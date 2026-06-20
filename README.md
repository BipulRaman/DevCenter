# DevCenter

DevCenter is a cross-platform Tauri desktop app for tracking Git repositories,
pull requests and local apps.

## Platforms

CI builds and releases native bundles for:

- **Windows** — `.exe` (NSIS) installer
- **macOS** — `.dmg` for both Apple Silicon (`aarch64`) and Intel (`x86_64`)
- **Linux** — `.AppImage` and `.deb`

## Building locally

The frontend is static (vanilla JS in `app/ui`), so only the Rust toolchain and
the Tauri CLI are needed:

```sh
cd app
cargo tauri dev      # run with hot reload
cargo tauri build    # build the installer for the current OS
```

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