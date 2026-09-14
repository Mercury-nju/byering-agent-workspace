# Marvis Recovery Report

## Input

- Application: `/Volumes/Marvis/Marvis.app`
- Bundle identifier: `com.tencent.mac.marvis`
- Application version: `1.0.0`
- Electron runtime: Electron Framework is bundled; `CFBundleExecutable` is `AtomApplication` based.
- ASAR SHA-256: `15b44f94a830550a832489f5f34e9d8e56872b22eb75de365e23b942dfbcc0e4`

## Recovered Material

- `app.asar.extracted/`: ASAR contents, including the runtime package metadata, Electron main/preload loaders, renderer installer UI, and bundled dependencies.
- `app.asar.unpacked/`: native Node modules and unpacked runtime files.
- `offline-pack/`: the packaged web application, including HTML, JavaScript, CSS, fonts, images, WebAssembly, and card bundles.
- `readable/`: Prettier-formatted copies of the main application/card JavaScript bundles for analysis.
- `build.json`: build metadata and component versions.
- `project/components/MarvisAgent/`: recovered Agent skill/resource/MCP text files from the component seed archive.
- `project/components/metadata/`: extracted component manifests, build metadata, and checksums.
- `project/recovered-symbols/`: generated API, Gateway action, IPC, network-host, and native-binary inventories.
- `project/recovered-symbols/api-call-sites.txt`: bounded renderer call-site context for 54 HTTP API paths, with secret-like literals redacted.
- `project/recovered-protocol/`: reconstructed WebSocket envelope, observed action payloads, component topology, and renderer store model.
- `project/components/MarvisGateway/`, `project/components/MarvisBorderlessspace/`, and `project/components/DocPreview/`: complete small component seed payloads.
- `project/components/Beacon/lib/index.js` and `index.d.ts`: readable native Beacon wrapper source recovered from the application resources.

## Evidence

- The main process and preload entrypoints are V8 cached bytecode (`.cjsc`) loaded by `bytecode-loader.cjs`.
- The renderer is a Vite-style production build with hashed JavaScript assets and React vendor chunks.
- The offline web app contains the main UI, feedback flow, publish-case flow, and an ordering-tea card.
- No original TypeScript/JSX files, source maps, or `sourcesContent` payloads were found in the inspected package.
- Component seed archives contain native/Python-built components rather than the original project source tree.
- The `MarvisAgent` seed does preserve a substantial set of readable Python skill and resource files; these were extracted selectively.
- Static inspection of the native binaries exposes local-service topology and protocol strings, including the Gateway WebSocket envelope, `daemon.sock`, dynamic service ports, `/health`, and relay endpoints.

## Security Note

`/Volumes/Marvis/Marvis.app/Contents/Resources/.env` contains production configuration and secret-like tokens. It was intentionally not copied into this recovery directory and must not be published or committed. Rotate those credentials if the application package has been shared outside the trusted environment.

## Recovery Assessment

The web UI can be reused as a starting point and reconstructed into a new project. The Electron main process and preload behavior can be reimplemented from the bytecode symbols, IPC channel names, renderer calls, native binaries, and runtime behavior, but the exact original source cannot be recovered from V8 cached bytecode alone.
