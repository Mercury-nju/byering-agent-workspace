# Recovered Components

The original app ships several component seed archives under `Contents/Resources/component-seeds`.

This directory contains:

- `MarvisAgent/skills/`: recovered Python skill scripts, references, assets, MCP binaries, resources, and prompt payloads from the Agent seed.
- `metadata/`: extracted `manifest.json`, `build_info.txt`, and `checksums.txt` for every seed archive.

The large packaged runtimes and native libraries remain in the original application and seed archives. They were not duplicated here because they are generated dependencies rather than project source.
