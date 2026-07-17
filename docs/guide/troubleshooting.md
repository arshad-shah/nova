# Troubleshooting

Running into something odd? Start here. If your problem isn't listed, see
[reporting an issue](#reporting-an-issue) at the bottom.

[← Back to the User Guide](./README.md)

## macOS Gatekeeper {#macos-gatekeeper}

**Symptom:** macOS blocks the app or warns that it can't be verified.

**Why:** The macOS `.dmg` is signed and notarised, so this is uncommon — but it
can still happen, especially on older systems or with a partial download.

**Fix:**

- Make sure you installed by dragging Verql into Applications and launched it
  from there.
- If macOS still refuses, open **System Settings → Privacy & Security**, find the
  message about Verql being blocked, and choose to open it anyway.
- If the app reports it's "damaged", re-download from the
  [Releases page](https://github.com/arshad-shah/verql/releases) (a truncated
  download can cause this) and
  [verify the checksum](./installation.md#verifying-your-download).

## Connection failures

**Symptom:** A connection won't connect, times out, or errors immediately.

Work through these:

- **Details:** Double-check host, port, database name, and credentials in the
  [connection profile](./connecting.md).
- **Reachability:** Confirm the database is actually reachable from your machine.
  If it sits behind a bastion host, set up an
  [SSH tunnel](./connecting.md#ssh-tunnels).
- **SSL (PostgreSQL):** If SSL is enabled, Verql verifies the server certificate
  by default. A self-signed or mismatched certificate will fail verification —
  use a valid certificate, or deliberately choose **Skip verification
  (insecure)** in the SSL Mode selector if you understand the risk.
- **SQLite file path:** Make sure the database file path is correct and the file
  is accessible.
- **Stale schema:** If tables seem missing or autocomplete looks wrong after the
  database changed, disconnect and reconnect — Verql clears the cached schema on
  disconnect.

## Native module notes (better-sqlite3)

SQLite support relies on a **native module** (`better-sqlite3`) that's compiled
for the exact Electron runtime Verql ships. In the pre-built apps this is already
handled for you, so you shouldn't need to do anything.

This mainly matters if you're **running Verql from source**: the install step
rebuilds `better-sqlite3` against Electron's Node ABI, and you may need to rebuild
it when switching between running the app and running tests under your system
Node. If a packaged build ever fails to load SQLite, re-download the release
rather than trying to rebuild it yourself.

## Where logs and data live

Verql stores its data in the standard per-user application data directory for
your OS (Electron's `userData` path), under the app name **`verql`**:

| Platform | Typical location |
|----------|------------------|
| macOS | `~/Library/Application Support/verql/` |
| Linux | `~/.config/verql/` |
| Windows | `%APPDATA%\verql\` |

This folder holds your configuration (connection profiles minus their secrets,
which live encrypted in the [OS keychain](./connecting.md#how-your-credentials-are-stored))
and related app data. It's a good thing to attach when reporting a bug — but
**review it first and redact anything sensitive**.

## Reporting an issue

If you're stuck or think you've found a bug:

1. Note your Verql version, your OS, and the database type involved.
2. Write down the exact steps to reproduce and the error message.
3. Open an issue at
   [github.com/arshad-shah/verql/issues](https://github.com/arshad-shah/verql/issues).

> Found a **security** vulnerability? Please don't open a public issue — follow
> the project's [security policy](https://github.com/arshad-shah/verql/blob/main/SECURITY.md)
> instead.

---

[← Back to the User Guide](./README.md)
