---
title: Installation
description: How to install Verql on macOS, Linux, and Windows, verify your download, and keep it updated.
sidebar:
  order: 1
---

Verql ships pre-built binaries for macOS, Linux, and Windows. Pick your platform
below.

All downloads are published on the
[GitHub Releases page](https://github.com/arshad-shah/verql/releases).

| Platform | Format | Notes |
|----------|--------|-------|
| macOS | Homebrew cask **or** `.dmg` (Intel + Apple Silicon) | Currently ad-hoc signed, not notarised (a Developer ID cert isn't wired in yet). |
| Linux | Homebrew formula **or** `.AppImage` | Portable, no installer needed either way. |
| Windows | Microsoft Store (MSIX) | Signed and updated by the Store — no separate download. |

[← Back to the User Guide](/guide/)

## macOS

### Option A: Homebrew (recommended)

If you use [Homebrew](https://brew.sh/), this is the easiest path and keeps Verql
up to date alongside your other tools:

```bash
brew install --cask arshad-shah/verql/verql
```

The cask `verql` lives in the tap `arshad-shah/homebrew-verql`. The
`user/repo/name` form above auto-taps it for you in one step; if you'd rather
tap explicitly first, `brew tap arshad-shah/homebrew-verql` followed by
`brew install --cask verql` works too. To update later:

```bash
brew upgrade --cask verql
```

### Option B: Download the `.dmg`

1. Download the `.dmg` for your chip (Intel or Apple Silicon) from the
   [Releases page](https://github.com/arshad-shah/verql/releases).
2. Open the `.dmg` and drag **Verql** into your Applications folder.
3. Launch it from Applications.

The macOS build is currently ad-hoc signed rather than signed with a Developer
ID and notarised, so Gatekeeper will likely warn the first time you open it.
See [Troubleshooting → macOS Gatekeeper](/guide/troubleshooting/#macos-gatekeeper)
for how to get past that warning.

## Linux

### Option A: Homebrew (recommended)

Homebrew on Linux has no casks, so Verql ships as a **formula** that installs
the AppImage plus a `verql` launcher on your `PATH`:

```bash
brew install arshad-shah/verql/verql
```

The `user/repo/name` form auto-taps `arshad-shah/homebrew-verql` for you; a
bare `brew install verql` only works if you've already tapped it. To update
later:

```bash
brew upgrade verql
```

### Option B: Download the `.AppImage`

1. Download the `.AppImage` from the
   [Releases page](https://github.com/arshad-shah/verql/releases).
2. Make it executable and run it:

   ```bash
   chmod +x verql-*.AppImage
   ./verql-*.AppImage
   ```

An AppImage is self-contained — there's nothing to install and nothing to
uninstall beyond deleting the file. To get a launcher entry and desktop
integration, tools like [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher)
can register it for you.

## Windows

Verql for Windows is distributed exclusively as an MSIX package through the
**Microsoft Store** — there is no standalone `.exe` installer.

1. Open the Microsoft Store app on Windows.
2. Search for **Verql** and install it.
3. The Store keeps it updated automatically — see
   [Keeping Verql updated](/guide/updating/).

Because the package is signed and distributed by the Store, there's no
Gatekeeper/SmartScreen-style warning to click through, and no separate checksum
to verify.

## Verifying your download

Downloads from the [Releases page](https://github.com/arshad-shah/verql/releases)
(the macOS `.dmg`s and the Linux `.AppImage`) are covered by a `sha256sums.txt`
listing the checksum of every asset, signed keylessly with
[cosign](https://docs.sigstore.dev/) (Sigstore) via a short-lived GitHub Actions
OIDC token — there's no long-lived signing key. The release publishes
`sha256sums.txt.sig` (the signature) and `sha256sums.txt.pem` (the signing
certificate) alongside it. The Windows build isn't part of the GitHub release at
all — it ships only through the Microsoft Store, which handles its own signing
and integrity checks. Verifying a release download is a two-step check: first
confirm the checksum file is genuinely signed, then confirm your download
matches its listed checksum.

```bash
# Install cosign once: brew install cosign  /  apt install cosign
# Download your asset, sha256sums.txt, sha256sums.txt.sig, and sha256sums.txt.pem
# from the release page, then from the folder containing all four:

# 1. Verify the checksum file's cosign signature
cosign verify-blob \
  --certificate sha256sums.txt.pem \
  --signature   sha256sums.txt.sig \
  --certificate-identity-regexp 'https://github.com/arshad-shah/verql/' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  sha256sums.txt

# 2. Verify your downloaded asset against the checksum list
sha256sum -c sha256sums.txt --ignore-missing
```

The `--ignore-missing` flag tells `sha256sum` to check only the files you
actually downloaded and skip the rest of the list. You should see `OK` next to
your asset's filename.

> On macOS, `sha256sum` may not be installed by default — use `shasum -a 256 -c`
> in step 2 instead, or install GNU coreutils via Homebrew.

## Keeping Verql updated

How you update depends on how you installed:

- **Homebrew (macOS or Linux):** run `brew upgrade --cask verql` (macOS) or
  `brew upgrade verql` (Linux). On macOS, Verql can also detect when it's
  running from a Homebrew-managed install and offer to update from inside the
  app — when you accept, it triggers the `brew upgrade` for you and then
  restarts to apply.
- **`.dmg` / `.AppImage`:** download the newer version from the
  [Releases page](https://github.com/arshad-shah/verql/releases) and reinstall
  over the top.
- **Windows (Microsoft Store):** the Store updates it automatically, the same
  as any other Store app.

See [Keeping Verql updated](/guide/updating/) for the full picture.

---

Next: [Connecting to a database →](/guide/connecting/)
