# Local HTTP server + browser instead of a native app

Bloom is delivered as a Bun HTTP server running on the user's machine, with the UI served to any browser at `http://localhost:5173`. We rejected Tauri/Electron (adds a native shell around a fundamentally web app, complicates phone-on-LAN access, requires a Rust/Node native build pipeline) and the pure-browser FileSystem Access API (Chrome/Edge only, no proxy for Ollama's non-CORS endpoints, no background indexing, periodic re-grant of folder permission).

The local-server shape gives us free phone-on-LAN access today (point Safari at `http://macbook.local:5173`) and a clean migration path to k8s + nginx later — the same Bun binary deploys to both contexts. The launch story starts as `bun run bloom` in a terminal, can graduate to a launchd plist, and ultimately to a menubar app — none of those changes the architectural shape.
