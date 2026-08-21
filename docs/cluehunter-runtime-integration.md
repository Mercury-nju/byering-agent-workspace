# ClueHunter Runtime Integration

The repository URL is source code, not an HTTP service address. Byering calls
the deployed ClueHunter runtime through the following contract.

## Cloud desktop provisioning

The Java service exposes:

- `POST /api/cloud/desktop/apply`
- `POST /api/cloud/desktop/applyStatus`
- `GET /self/rpa/startJob`

The request body is:

```json
{
  "uid": 123,
  "tenant": 456,
  "regionId": "cn-beijing",
  "robotInfoId": 0
}
```

The status values are `0=INIT`, `1=APPLYING`, `2=FAILED`, and `3=READY`.
Byering calls `apply`, then polls `applyStatus` until `READY`, then calls the
legacy `GET /self/rpa/startJob` endpoint. The latter places the start command
on the idle robot bound to the cloud desktop; the robot subsequently reports
heartbeat/ACK data through the ClueHunter RPA endpoints. A failed or timed-out
application or RPA start is returned to the user as an error; it never creates
a local browser session as a substitute.

## Required deployment configuration

Set these values in the backend runtime environment:

```dotenv
BYERING_CLOUD_DESKTOP_MODE=cluehunter
BYERING_CLUEHUNTER_BASE_URL=https://<deployed-cluehunter-api>
BYERING_CLUEHUNTER_AUTH_TOKEN=<service-or-user-bearer-token>
BYERING_CLUEHUNTER_TENANT_ID=<numeric-tenant-id>
BYERING_CLUEHUNTER_UID=<numeric-executor-uid>
BYERING_CLUEHUNTER_REGION_ID=<cloud-region-id>
# Optional when the legacy service requires a specific robot binding.
BYERING_CLUEHUNTER_ROBOT_INFO_ID=<numeric-robot-info-id>
```

The base URL must be the deployed API gateway that serves
`/api/cloud/desktop/*`; the Codeup repository URL itself cannot be used as the
base URL. The Kafka brokers remain an internal dependency of ClueHunter's
cloud creation consumer. Byering does not publish directly to that Kafka
cluster, which keeps cloud creation, persistence, and RPA binding in the
legacy service's transaction boundary.

## Runtime behavior

- `GET /healthz` reports `cloudDesktopReady` and
  `capabilities.cloudDesktopProvisioning`.
- `POST /v1/cloud-desktops/apply` explicitly requests provisioning.
- `POST /v1/cloud-desktops/status` reads the authoritative status.
- `POST /v1/cloud-desktops/connect` provisions/reuses the cloud desktop and
  starts the bound RPA client in one idempotent operation.
- `POST /v1/browser-sessions` provisions first when mode is `cluehunter`.
- Missing configuration returns `CLOUD_DESKTOP_NOT_CONFIGURED`.
- Status `2` returns `CLOUD_DESKTOP_APPLY_FAILED`.
- A poll deadline returns `CLOUD_DESKTOP_PROVISIONING`.
