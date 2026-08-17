# Marvis Recovered Project

This project is reconstructed from `/Volumes/Marvis/Marvis.app`.

## Run the packaged renderer

```bash
npm run serve
```

Then open `http://127.0.0.1:4173/`.

## Run the reconstructed Electron shell

```bash
npm install
npm run electron
```

The Electron shell is intentionally conservative: it provides the recovered bridge contract and opens the recovered renderer, but does not pretend to reproduce unavailable native services.

## Source boundaries

- `OFFICE-ARCHITECTURE.md` contains the detailed office scene logic, Agent state machine, handover flow, animation mapping, and recovery boundaries.
- `ARCHITECTURE.md` contains the broader application architecture outside the office module.

- `assets/`, `cards/`, `workbench/`, and the HTML files are packaged renderer output.
- `readable/` contains formatted copies for analysis; imports still point at the original hashed bundles.
- `recovered-symbols/` contains filtered bytecode symbols and IPC channel names.
- `recovered-symbols/api-call-sites.txt` preserves bounded call-site context for the recovered HTTP APIs.
- `recovered-protocol/` documents the recovered WebSocket envelope, action payloads, component topology, and renderer store model.
- `electron/` contains the reconstructed main/preload scaffold.
- `components/MarvisAgent/` contains readable Python skill/resource files recovered from the Agent seed.
- `components/metadata/` contains metadata for all bundled component seeds.
- `components/MarvisGateway/`, `components/MarvisBorderlessspace/`, and `components/DocPreview/` contain the complete small component seed payloads.
- `components/Beacon/lib/` contains the original readable Node wrapper and TypeScript declaration recovered beside `beacon_napi.node`.
- Production secrets were intentionally excluded. See `.env.example`.
