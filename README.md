# DevCenter

## Auto-update

Release builds auto-update via the Tauri updater plugin. Installers are signed
in CI, and existing installs pick up new versions from published GitHub
Releases. The feed endpoint is configured in
`app/src-tauri/tauri.conf.json`; the signing keys are **not** committed — the
public key is injected from a secret at build time.

To enable signed releases, add two repository secrets:
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PUBLIC_KEY`. See
**[docs/auto-update-setup.md](docs/auto-update-setup.md)** for the full
walkthrough — key generation, the secrets, the release flow, and key rotation.