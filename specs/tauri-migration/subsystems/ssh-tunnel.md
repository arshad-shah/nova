# ssh-tunnel — connection middleware, local port-forwarding

Ports `src/main/plugins/bundled/ssh-tunnel/index.ts` (130 LOC, ssh2 + `net`)
and the connection-middleware seam in
`src/main/plugins/sdk/driver-registry.ts` /
`src/main/plugins/sdk/types.ts:237`. Target crate: `verql-ssh-tunnel`
(russh-based per [`ADR-0004`](../decisions/ADR-0004-database-crates.md)
§consequences). Primary task: T-309.

## v1 behavior contract

### The middleware seam

```ts
interface ConnectionMiddleware {                       // sdk/types.ts:237
  shouldApply(profile: ConnectionProfile): boolean
  beforeConnect(profile: ConnectionProfile): Promise<ConnectionProfile>
  onDisconnect(profileId: string): Promise<void>
}
```

Registered via `ctx.drivers.registerConnectionMiddleware('ssh-tunnel',
sshMiddleware)`; duplicate id throws (`driver-registry.ts:33`). The `db:connect`
handler (`src/main/ipc/db.ts:46-50`) runs every middleware whose
`shouldApply(profile)` is true, replacing the profile with the
`beforeConnect` result, wrapped in `safeCall(…, { timeoutMs: 15_000 })` —
a hung tunnel fails the connect after 15 s. `db:disconnect` calls every
middleware's `onDisconnect(profileId)` (not only appliers), catching and
logging errors so a broken tunnel never blocks adapter release
(`ipc/db.ts:100-110`).

### The `ssh*` connection fields (manifest `contributes.connectionFields`)

| Key | Type | Default | Notes |
|---|---|---|---|
| `sshHost` | text | — | presence (truthy) is the whole `shouldApply` test |
| `sshPort` | number | 22 | |
| `sshUser` | text | — | falls back to `'root'` in `beforeConnect` |
| `sshPassword` | password | — | secret-typed ⇒ stripped to keyring like any password field |
| `sshPrivateKey` | file | — | type `file` ⇒ the field stores the key file **content** (PEM text; `dialog:open-file` returns `{ filePath: basename, content }` — `src/main/ipc/dialog.ts:8`), not a path |

All fields are `group: 'ssh'` (rendered as a collapsible section on every
driver's connection form — the fields are host-contributed, driver-agnostic).

### `beforeConnect` — the profile rewrite

1. Reads `sshHost/sshPort/sshUser/sshPassword/sshPrivateKey` off the profile;
   remote target = `profile.host || 'localhost'` : `profile.port || 5432`.
2. Picks a free local port by binding a throwaway server to port 0 on
   `127.0.0.1` (`getAvailablePort`).
3. Connects an `ssh2.Client` — auth precedence: `privateKey` if
   `sshPrivateKey` set, else `password` if `sshPassword` set, else none
   (agent/none). Error mapping: messages containing `authentication`/`Auth` →
   `SSH authentication failed — check credentials or private key`;
   `ECONNREFUSED` → `Cannot reach SSH host <host>:<port>`; otherwise
   `Failed to establish SSH tunnel: <message>`.
4. On ready: `client.forwardOut('127.0.0.1', localPort, remoteHost,
   remotePort, …)` obtains **one** forwarded stream, then a local
   `net.createServer` on `127.0.0.1:localPort` pipes every accepted socket
   into that single stream (`index.ts:57-60`). ⚠ Known v1 defect: all
   concurrent TCP connections (e.g. the pg pool's up-to-5 clients) share one
   SSH channel — traffic interleaves/corrupts under concurrency; it works in
   practice because pools open lazily. v2 fixes this (below); the fix is a
   recorded, allowlisted behavior difference.
5. Stores the client in `activeTunnels: Map<profileId, Client>` and resolves
   `{ ...profile, host: '127.0.0.1', port: localPort }` — the driver then
   connects to the rewritten address and never knows about SSH.

### Teardown

`onDisconnect(profileId)`: close the stashed `net.Server`
(`client._tunnelServer`), `client.end()`, delete from `activeTunnels`.
`deactivate()` does the same for every tunnel (plugin host calls it on app
shutdown). No keepalive, no auto-reconnect, no host-key verification in v1
(ssh2 default accepts any host key).

## v2 design (crate `verql-ssh-tunnel`)

- **Library**: **russh 0.62.x** — verified active (2026-07, see
  [versions-baseline.md](../decisions/versions-baseline.md)) with
  direct-tcpip (local forward) confirmed supported. Alternatives explicitly
  rejected: the `ssh2` crate (blocking, C libssh2 binding — wrong fit for
  the tokio middleware seam) and `openssh` (shells out to the system ssh
  binary). The implementing task still validates the details in-crate (auth
  methods, key formats incl. OpenSSH + PKCS#8 with passphrase — note v1
  field set has **no** passphrase field for the SSH key; do not add one)
  and records findings in the task Log, per the ADR-0004 verify-first rule.
- **Middleware trait** in `verql-db` mirroring the v1 shape:
  `should_apply(&Profile) -> bool`, `async before_connect(Profile) ->
  Result<Profile>`, `async on_disconnect(&str)`. The ConnectionManager runs
  appliers under the same 15 s `tokio::time::timeout` and the same
  never-rethrow rule on disconnect ([`db-engine.md`](./db-engine.md)).
- **Forwarding**: bind a `TcpListener` on `127.0.0.1:0` (kernel-assigned port —
  replaces the racy probe-then-rebind of `getAvailablePort`); for **each**
  accepted socket open a fresh `channel_open_direct_tcpip` to
  `remoteHost:remotePort` and bidirectionally copy — fixing the shared-stream
  defect. One SSH session per profile, multiplexing channels.
- **State**: `DashMap<String, TunnelHandle>` where `TunnelHandle` owns the
  session, the listener's abort handle, and a task JoinSet; `on_disconnect`
  aborts and awaits them. App exit: `verql-core` shutdown calls the same
  teardown for all live tunnels (v1's `deactivate`); `Drop` is the backstop.
- **Auth**: private-key **content** (string field, as v1) with password
  fallback; same three user-facing error strings, keyed for i18n per
  `../02-target-architecture.md` §what-stays-typescript.
- **Host keys**: accept-any to match v1 (log a Note proposing known_hosts
  support post-cutover; tightening silently would break existing users'
  tunnels — behavior change needs its own ratified task).

## Parity cases

Requires an SSH server fixture: **`docker-compose.yml` has no ssh service
today** (postgres/mysql/mongodb/redis only) — T-309 adds one (e.g.
`lscr.io/linuxserver/openssh-server` or a minimal `sshd` image) on the compose
network with password auth + an injected test key, able to reach the seeded
postgres container by service name. The service addition lands on `main`
first (it also lets the v1 oracle run) per the freeze-discipline exception
process in `../04-ipc-and-events-contract.md`.

1. `db:connect` on a postgres profile with `sshHost` set (password auth):
   connects, `db:query` returns the seeded golden rows; profile stored in
   config retains the original host/port (rewrite is in-memory only).
2. Same with `sshPrivateKey` content auth (and: key auth wins when both are set).
3. Wrong SSH password → connect resolves `{ success: false, error: 'SSH
   authentication failed — check credentials or private key' }`.
4. Unreachable SSH host → `Cannot reach SSH host <host>:<port>`.
5. SSH reachable but remote DB port closed → tunnel established, driver
   connect fails with the *driver's* connection-refused error (middleware
   succeeded — pin that the error is the DB's, not the tunnel's).
6. `db:disconnect` → local listener closed (connect to the old local port
   refused), no orphaned session on the sshd side.
7. Non-SSH profile (`sshHost` empty) → middleware skipped entirely.
8. v2-only (allowlisted diff): 5 concurrent connections through one tunnel
   all query correctly — the fixed shared-stream defect.

## Open questions

- ~~russh vs wrapper crate~~ — resolved by the 2026-07 research: russh
  0.62.x, active, direct-tcpip confirmed (ssh2/openssh rejected, above).
  Remaining for T-309: passphrase-protected key support (v1 has no UI for
  an SSH key passphrase — confirm unsupported-in-v1 and keep it so),
  recorded in its Log.
- **Hung-tunnel timeout layering**: v1 relies solely on the 15 s `safeCall`;
  does russh need its own connect timeout below that to produce the same
  error text? T-309 measures the v1 message for a black-holed host and pins it.
