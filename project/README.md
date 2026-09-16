# Byering Web Project

This project is reconstructed from `/Volumes/Marvis/Marvis.app`.

## Run the web application

```bash
npm run serve
```

Then open `http://127.0.0.1:4173/`.

## Source boundaries

- `OFFICE-ARCHITECTURE.md` contains the detailed office scene logic, Agent state machine, handover flow, animation mapping, and recovery boundaries.
- `ARCHITECTURE.md` contains the broader application architecture outside the office module.

- `assets/`, `cards/`, `workbench/`, and the HTML files are packaged renderer output.
- `readable/` contains formatted copies for analysis; imports still point at the original hashed bundles.
- `recovered-symbols/` contains filtered bytecode symbols and IPC channel names.
- `recovered-symbols/api-call-sites.txt` preserves bounded call-site context for the recovered HTTP APIs.
- `recovered-protocol/` documents the recovered WebSocket envelope, action payloads, component topology, and renderer store model.
- `components/MarvisAgent/` contains readable Python skill/resource files recovered from the Agent seed.
- `components/metadata/` contains metadata for all bundled component seeds.
- `components/MarvisGateway/`, `components/MarvisBorderlessspace/`, and `components/DocPreview/` contain the complete small component seed payloads.
- `components/Beacon/lib/` contains the original readable Node wrapper and TypeScript declaration recovered beside `beacon_napi.node`.
- Production secrets were intentionally excluded. See `.env.example`.
