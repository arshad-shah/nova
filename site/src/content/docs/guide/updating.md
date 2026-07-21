---
title: Keeping Verql updated
description: Update channels for each install method and how in-app Homebrew upgrades work.
sidebar:
  order: 8
---

Verql is under active development, so new releases land regularly with fixes
and features. Keeping up to date is the best way to get improvements and
security fixes.

[← Back to the User Guide](/guide/)

## How updates work

How you update depends on how you installed Verql:

| Install method | How to update |
|----------------|---------------|
| Homebrew cask (macOS) | `brew upgrade --cask verql` |
| `.dmg` (macOS) | Download the newer `.dmg` and reinstall |
| Homebrew formula (Linux) | `brew upgrade verql` |
| `.AppImage` (Linux) | Download the newer `.AppImage` and replace the file |
| Microsoft Store (Windows) | Updates automatically, like any other Store app |

Releases are published on the
[GitHub Releases page](https://github.com/arshad-shah/verql/releases). Always
[verify your download](/guide/installation/#verifying-your-download) for the macOS
and Linux binaries. Windows doesn't have a separate download to verify — Verql
ships there only through the Microsoft Store, which handles its own signing.

## Homebrew updates (macOS and Linux)

If you installed via Homebrew, updating is just:

```bash
brew upgrade --cask verql   # macOS
brew upgrade verql          # Linux (formula, not a cask)
```

On **macOS**, Verql can also help from inside the app: when it detects that
it's running from a Homebrew-cask-managed install, it can check for a newer
version and offer to update for you. Accepting runs `brew upgrade --cask verql`
for you, and then you restart Verql to finish applying the update. This in-app
check currently only recognizes the macOS cask install, not the Linux formula —
on Linux, update with `brew upgrade verql` directly.

> The in-app update mechanism is channel-pluggable, so other distribution
> channels can be wired in over time. For now, the in-app "update for me" flow
> is for Homebrew-cask-managed installs; on other platforms, update by
> downloading the latest release (Linux `.AppImage`) or letting the Microsoft
> Store update Verql automatically (Windows).

## Staying informed

- Watch the [Releases page](https://github.com/arshad-shah/verql/releases) for
  new versions.
- Read the
  [changelog](https://github.com/arshad-shah/verql/blob/main/CHANGELOG.md) to
  see what changed.

> Minor versions can include breaking changes. Skim the changelog before
> upgrading if you depend on specific behaviour.

---

Next: [Troubleshooting →](/guide/troubleshooting/)
