# Electron Reconstruction

The original main process and preload were distributed as V8 cached bytecode (`.cjsc`). The files in this directory are a clean-room reconstruction of the observable bridge contract, not a byte-for-byte decompilation.

The scaffold restores:

- BrowserWindow creation and preload isolation
- `window.marvis` bridge shape
- service-port and gateway readiness IPC channels
- renderer-ready, process-event, menu-action, JSB invoke, and drag-file channel names

Native services, account state, updater logic, local databases, and production telemetry still need to be connected from the original component binaries and runtime behavior.
