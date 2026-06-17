# DevCenter

## Auto-update

Auto-update is wired for release builds using the Tauri updater plugin.

To activate real update delivery, configure these fields in
`app/src-tauri/tauri.conf.json` under `plugins.updater`:

- `pubkey`: your updater signing public key
- `endpoints`: one or more updater feed endpoints

Current scaffold values are placeholders (`pubkey: ""`, `endpoints: []`), so
release builds will check and emit an updater error state until these values are
set.