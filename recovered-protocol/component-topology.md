# Recovered Component Topology

The application is a desktop shell around several local services. The following relationships are supported by packaged strings, manifests, and renderer call sites.

```text
Electron main/preload (.cjsc)
        |
        +-- MarvisService
        |      `-- daemon.sock (Unix domain socket)
        |
        +-- MarvisHost (MarvisGateway)
        |      `-- ws://127.0.0.1:<dynamic-port>?token=...
        |
        +-- llm_service / llm_sdk.node
        |      `-- /health and a dynamic backend/service port
        |
        +-- MarvisAgent
        |      `-- MCP servers, skills, prompts, browser/file tooling
        |
        +-- BorderlessSpace + easy-control SDK
        |      `-- relay, streaming, TCP/UDP/WebSocket ports
        |
        +-- DocPreview
        |      `-- editor SDK and ICU data
        |
        +-- Beacon wrapper
        |      `-- readable Node API plus beacon_napi.node
        |
        `-- Knowledgebase
               `-- packaged Python runtime and native ML/document libraries
```

## Native evidence

- `MarvisService` contains `MARVIS_DAEMON_SOCKET_PATH`, `daemon.sock`, `MARVIS_DAEMON_DATA_DIR`, and a WebSocket subscription URL.
- `llm_service` contains `/health`, `--port`, `server_port`, and `backend_port` strings.
- `BorderlessSpace` and the easy-control libraries contain `tcp_port`, `proxy_tcp_port`, `ws_port`, `udp_port`, relay-token validation, and heartbeat endpoints.
- `aria2c` is bundled as a local download helper and exposes an RPC listener option.
- All small component seeds are copied under `components/`; the large Agent and Knowledgebase archives are represented by recovered readable content and metadata to avoid duplicating hundreds of megabytes of opaque third-party runtime files.

See `../recovered-symbols/native-binaries.txt` for the static inventory and filtered strings.
