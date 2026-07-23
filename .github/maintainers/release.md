# Releasing Verql

This document covers cutting a new release end-to-end:

1. [The flow](#the-flow)
2. [Required secrets & accounts](#required-secrets--accounts)
3. [What the user gets](#what-the-user-gets)
4. [Verifying a release as a user](#verifying-a-release-as-a-user)
5. [Upgrading the pipeline](#upgrading-the-pipeline)

## The flow

Releasing is **tag-free** — you never run `git tag` / `git push --tags`. A
changeset per PR drives an automated "Version Packages" PR; merging it (your
review is the gate) auto-tags and builds.

```
   Contributor ▶  pnpm changeset            (per feature PR; describes the change)
                          │  push to main
                          ▼
              ┌────────────────────────────────────┐
              │ release-version.yml (on push:main) │
              │  changesets/action: pending        │
              │  changesets → open/update the       │
              │  "Version Packages" PR              │
              └────────────────────────────────────┘
                          │
            Maintainer ▶  review + MERGE the Version PR   ◀── approval gate (CODEOWNERS)
                          │  merge lands the version bump
                          ▼
              ┌────────────────────────────────────┐
              │ release-version.yml (same workflow)│
              │  version changed → auto-tag         │
              │  (scripts/release-tag.mjs) THEN     │
              │  call release.yml (reusable)        │
              └────────────────────────────────────┘
                          │  uses: ./release.yml (no PAT) ▼
              ┌────────────────────────┐
              │   release.yml          │
              └────────────────────────┘
                  │       │       │
        ┌─────────┘       │       └─────────┐
        ▼                 ▼                 ▼
   ┌─────────┐       ┌──────────┐      ┌─────────┐
   │ macOS   │       │  Linux   │      │ Windows │
   │ build   │       │  build   │      │  build  │
   │ + sign  │       │ AppImage │      │ MSIX →  │
   │ + notar │       │ → brew   │      │ Store   │
   │ DMG →   │       │ formula  │      │         │
   │ brew    │       │          │      │         │
   │ cask    │       │          │      │         │
   └─────────┘       └──────────┘      └─────────┘
        └──────────────┬───────────────────┘
                       ▼
              ┌──────────────────────┐
              │ Publish release      │  ◀── `release` environment:
              │ (environment:release)│      required reviewer = you
              │ - sha256sums.txt     │
              │ - cosign signature   │
              │ - CycloneDX SBOM     │
              │ - DRAFT GitHub rel.  │
              └──────────────────────┘
                       │
                       ▼
                Maintainer approves the run,
                then clicks Publish on the draft.
```

Workflows: [`release-version.yml`](../workflows/release-version.yml) (the
canonical `changesets/action` Version PR + auto-tag) and
[`release.yml`](../workflows/release.yml) (build + gated publish + Microsoft
Store). Both refuse to run for any repo other than `arshad-shah/verql`, so a
fork can't trigger a release. The Version PR itself is the standard
[Changesets](https://github.com/changesets/changesets) flow — the action runs
`pnpm changeset version` with `GITHUB_TOKEN` in scope so the changelog links
resolve; we deliberately don't give it a `publish` command, keeping releasing
behind the environment gates below.

**The SDK rides the same flow.** `@verql/plugin-sdk` is versioned independently
by changesets. When a changeset bumps it, the same Version PR carries its bump;
on merge, `release-version.yml` auto-tags `sdk-vX.Y.Z` and calls
[`publish-sdk.yml`](../workflows/publish-sdk.yml) (reusable) to publish to npm via
OIDC trusted publishing — gated by the `npm-publish` environment's required
reviewer. App and SDK publish independently in the same run: a PR can bump just
the app (`vX.Y.Z`), just the SDK (`sdk-vX.Y.Z`), or both.

## Approval gates & required GitHub settings

> **Quick setup:** run [`scripts/setup-release-gates.sh`](../../scripts/setup-release-gates.sh)
> once as a repo admin (`gh auth login` first). It creates the `release`
> environment with you as required reviewer and protects `main` — that's
> everything. No PAT or other secret is required. The rest of this section
> explains what those settings are.

Two gates put a release entirely in your hands; both are **repo settings you
configure once** (they can't live in a committed file — the script above sets
both for you):

1. **Merge gate (your approval to land anything on `main`).** Branch protection
   on `main` → *Require a pull request before merging* + *Require review from
   Code Owners*. [`CODEOWNERS`](../CODEOWNERS) makes `@arshad-shah` the owner of
   everything, so no PR — including the auto-generated Version PR — merges
   without your review.
   **Admins bypass:** the protection is set with `enforce_admins: false` (*Do
   not allow bypassing the above settings* is **off**), so you can still merge
   directly or push to `main` when you need to — the gate binds everyone else.
   Leave `enforce_admins` off to keep that escape hatch.
   Configure at `…/settings/branches`.

2. **Release-run gates (your approval to publish).** Two GitHub **Environments**,
   each with **Required reviewers = `@arshad-shah`**:
   - `release` — gates `release.yml`'s `publish` job (the GitHub release) **and**
     its `publish-msstore` job (the Store submission).
   - `npm-publish` — gates `publish-sdk.yml`'s `publish` job, and is where npm's
     trusted-publisher config is pinned.

   Each job declares its `environment:`, so the run pauses until you approve it
   in the Actions UI. The GitHub release is also created as a **draft**, so you
   still click *Publish* on it. Configure at `…/settings/environments`.

3. **Version-PR permission.** *Settings → Actions → General → Workflow
   permissions → Allow GitHub Actions to create and approve pull requests* must
   be **on** — that's how `changesets/action` opens the "Version Packages" PR.
   `setup-release-gates.sh` sets this for you (the default token stays
   read-only; the workflow widens its own scope per-job).

**No PAT or release secret is needed.** `release-version.yml` invokes
`release.yml` / `publish-sdk.yml` as **reusable workflows**
(`uses: ./.github/workflows/release.yml`) right after it auto-tags, so the build
never depends on a tag *triggering* a workflow — which is the only thing the
default `GITHUB_TOKEN` can't do. The tag is still created (with `GITHUB_TOKEN`)
for the release's name and record.

Optional hardening: in `…/settings/actions`, set *Fork pull request workflows* →
*Require approval for all outside collaborators* so CI on contributor PRs only
runs after you approve it.

### Cutting a release (what you actually do)

1. Ensure the PRs you want shipped each merged with a changeset.
2. **Author the in-app "What's New" page** for the upcoming version (a hand-written
   step — humans or an AI agent, not generated). This is part of cutting a release,
   not an afterthought: add the i18n copy + registry entry for the new version per
   [`docs/onboarding.md`](../../docs/onboarding.md) → *Authoring release notes*, and
   set its `version` to the exact number the Version PR will produce (so the running
   app opens the page on update). Skip only for pure patch releases with nothing
   user-facing to say.
3. The bot opens/updates a **Version Packages** PR — review the version bump +
   `CHANGELOG.md`, then **merge it**.
4. Approve the run when prompted — the `release` environment for the app (and
   the Microsoft Store, once configured), the `npm-publish` environment if the
   SDK bumped — then **Publish** the draft GitHub release. That's it — no tags,
   ever.

## Required secrets & accounts

Set each as a **Repository Secret** at
`https://github.com/arshad-shah/verql/settings/secrets/actions`.
Several are optional — leave them empty and the workflow produces
unsigned binaries for that platform instead of failing.

### macOS — signed + notarised

You need a paid **Apple Developer Program** membership
([apple.com/developer](https://developer.apple.com/programs/), $99/year).
With that you can mint:

1. **Developer ID Application certificate** — used to sign the
   `.app`/`.dmg`.
   - Generate it from Xcode → Settings → Accounts → Manage Certificates,
     or from
     [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list).
   - Choose "Developer ID Application".
   - Export from Keychain Access as a `.p12` with a password.
2. **App-specific password** for `notarytool` — generated at
   [appleid.apple.com](https://appleid.apple.com/) → Sign-In and Security
   → App-Specific Passwords → "+".

Then set these GitHub secrets:

| Secret | What it is | How to compute |
|--------|------------|----------------|
| `MAC_CERT_P12_BASE64` | The exported `.p12`, base64-encoded so it can live in a secret | `base64 -i Developer-ID.p12 \| pbcopy` |
| `MAC_CERT_PASSWORD` | The password you used when exporting the `.p12` | (whatever you typed) |
| `APPLE_ID` | The Apple ID email associated with the developer account | e.g. `you@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from above | `abcd-efgh-ijkl-mnop` |
| `APPLE_TEAM_ID` | 10-character team ID | Visible at [Membership Details](https://developer.apple.com/account#MembershipDetailsCard) |

Without these, the macOS build still produces a `.dmg`, but unsigned —
Gatekeeper will block the first launch unless the user right-clicks →
Open. Notarisation also fails (silently in CI for now), which would
trigger a "developer cannot be verified" prompt.

### Linux — GPG-signed checksums

The AppImage itself isn't signed at the binary level, but the release
publishes a `sha256sums.txt` and signs it with a detached GPG
signature. The cosign keyless flow does this for free — see
[Sigstore keyless](#sigstore-keyless-signing) below. Nothing extra to
configure.

If you'd rather use a traditional GPG key:

1. `gpg --full-generate-key` → RSA 4096, no expiration (or short
   expiry if you want to rotate annually).
2. `gpg --armor --export-secret-keys YOUR_KEY_ID | base64 | pbcopy`.
3. Set:
   - `GPG_PRIVATE_KEY` — the base64 armoured private key
   - `GPG_PASSPHRASE` — passphrase for that key
4. Replace the `cosign sign-blob` step in `release.yml` with a
   `gpg --detach-sign --armor sha256sums.txt` step.

The current pipeline uses sigstore by default because it requires no
key material at all.

### Windows — **Microsoft Store (MSIX) only**

The Windows build emits a single artifact (`package.json` → `build.win.target: appx`):

- **MSIX (`.appx`) → Microsoft Store.** The Store code-signs the package and
  drives its own updates, so no code-signing certificate is needed on our side.
  The `publish-msstore` job in `release.yml` submits it via the `msstore` CLI,
  gated behind the same `release` environment reviewer as the GitHub release.
  The job renames the `.appx` to `.msix` before submitting: `msstore publish`
  selects its packaged-app publisher purely by file extension
  (`.msix`/`.msixbundle`/`.msixupload`), so a `.appx` fails with "could not
  find a project publisher" even though the two formats are byte-identical.

> The `.appx` is **not** attached to the GitHub release (the publish job filters
> it out) — it only goes to the Store. There is no non-Store Windows install
> path.

> **Flaky Store commit API.** The Dev Center submission API allows only **one
> pending submission per app**, and its Commit endpoint intermittently returns
> an HTML error page instead of JSON (surfacing as a `System.Text.Json '<' is
> an invalid start of a value` crash in the `msstore` CLI). The publish step
> handles both: before each attempt it clears any dangling pending submission
> (`msstore submission delete "$PRODUCT_ID" --no-confirm`) and it retries the
> publish up to 4 times with backoff. If it still fails after that, the API is
> likely degraded — just **re-run the `publish-msstore` job** (the build
> artifacts are reused; the next run cleans up and retries). To clear a stuck
> submission by hand: `msstore submission delete <productId> --no-confirm`.

#### One-time Microsoft Store setup — do this before the first Store release

The CI job is **skipped automatically** until the repository variable
`MICROSOFT_STORE_PRODUCT_ID` is set, so the rest of a release never depends on
the Store being configured. To turn it on:

1. **Reserve the app** in [Partner Center](https://partner.microsoft.com/dashboard)
   (Apps and games → New product → MSIX or PWA app) and pick the name.
2. Open the reserved app → **Product management → Product identity** and confirm
   the identity values in the `build.appx` block of `package.json` match exactly
   (they already hold this app's values — `identityName` `Arshadshah.verql`,
   `publisher` `CN=2ABEC305-…` GUID, and `publisherDisplayName`). A mismatch makes
   the Store reject the upload — electron-builder only writes these when the
   `build.appx` block is present, so a missing/ignored config yields the default
   `verql` / `CN=ms` identity that Partner Center refuses.
   > The `build.appx` block also pins `minVersion`/`maxVersionTested`. The Store
   > refuses any MSIX whose `TargetDeviceFamily` `MinVersion` is `<= 10.0.17134.0`
   > (electron-builder's default is `10.0.14316.0`, which trips this). Verql
   > targets **Windows 11 only**, so `minVersion` is `10.0.22000.0` (Windows 11
   > 21H2 — the first Windows 11 build) and `maxVersionTested` is `10.0.22621.0`
   > (Windows 11 22H2). This is well above the Store floor and drops Windows 10.
   > Don't lower `minVersion` below `10.0.22000.0` without also revisiting the
   > "Windows 11 or later" requirement in the user install docs.
3. **Seed the listing with one manual submission.** `msstore publish` only
   *updates* an app that is already live. MSIX/appx can only be built on Windows,
   so produce the seed package on a Windows CI runner:
   `gh workflow run release.yml --ref <branch>`, let the `Build (windows-latest)`
   job finish, then `gh run download <run-id> -n verql-windows-latest` to get the
   `.appx`. (The gated `publish`/`publish-msstore` jobs are refused from a
   non-protected branch, so this is safe.) Upload that `.appx` to Partner Center
   by hand once. **This is the manual release that starts it up** — CI takes over
   from the next tagged release. The seed's version just needs to be ≤ the first
   version CI publishes.
4. Note the app's **Store product ID** (Product identity page) and set it as a
   repository **variable** `MICROSOFT_STORE_PRODUCT_ID` (a variable, not a
   secret — it isn't sensitive; `msstore publish -id` reads it).

**Publishing credentials (Azure Entra app registration):**

1. Azure portal → **Microsoft Entra ID → App registrations → New registration**.
   Note the **Application (client) ID** and the **Directory (tenant) ID**.
2. In that registration → **Certificates & secrets → New client secret** and
   copy the secret *value* immediately.
3. **Link the registration in Partner Center**: Account settings → User
   management → **Azure AD applications → Add Azure AD application**, pick the
   registration, and grant it the **Manager** role.
4. Find your **Seller ID** under Partner Center → Account settings → Identifiers.

Then set these GitHub **secrets**
(`…/settings/secrets/actions`):

| Secret | What it is |
|--------|------------|
| `PARTNER_CENTER_TENANT_ID` | Entra **Directory (tenant) ID** |
| `PARTNER_CENTER_CLIENT_ID` | Entra **Application (client) ID** of the registration |
| `PARTNER_CENTER_CLIENT_SECRET` | The client secret **value** from step 2 |
| `PARTNER_CENTER_SELLER_ID` | Partner Center **Seller ID** |

…and the repository **variable** `MICROSOFT_STORE_PRODUCT_ID`
(`…/settings/variables/actions`).

Reference: [Publish app updates to the Microsoft Store with GitHub Actions](https://learn.microsoft.com/windows/apps/publish/msstore-dev-cli/github-actions).

### Sigstore keyless signing

The release workflow signs the `sha256sums.txt` with
[cosign](https://docs.sigstore.dev/) using a short-lived OIDC token
provisioned by GitHub itself (`permissions: id-token: write`). No
secrets, no key material to rotate. The resulting `.sig` + `.pem`
files are published alongside the binaries.

Users verify with:

```bash
cosign verify-blob \
  --certificate sha256sums.txt.pem \
  --signature   sha256sums.txt.sig \
  --certificate-identity 'https://github.com/arshad-shah/verql/.github/workflows/release.yml@refs/tags/vX.Y.Z' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  sha256sums.txt
```

(See [Verifying a release](#verifying-a-release-as-a-user) for the
full command without the CI gobbledygook.)

### `GITHUB_TOKEN`

Provided automatically by GitHub Actions. The workflow's job-level
`permissions:` block scopes it to `contents: write` only in the
`publish` job. No action needed.

## What the user gets

A published release on
`https://github.com/arshad-shah/verql/releases/tag/vX.Y.Z` includes:

| Asset | Platform | What it is |
|-------|----------|------------|
| `verql-X.Y.Z-x64.dmg` | macOS Intel | Disk image (currently unsigned); download source for the Homebrew cask |
| `verql-X.Y.Z-arm64.dmg` | macOS Apple Silicon | Same as above |
| `verql-X.Y.Z-x86_64.AppImage` | Linux x64 | Portable; download source for the Homebrew formula |
| `sha256sums.txt` | All | One cosign-signed file covering every platform's binaries |
| `sha256sums.txt.sig` + `.pem` | All | Sigstore signature + cert |
| `verql-vX.Y.Z-sbom.cdx.json` | All | Software Bill of Materials (CycloneDX) |

> Windows ships as an MSIX through the **Microsoft Store** (published by
> `release.yml`'s `publish-msstore` job) and is **not** a release asset.

## Verifying a release as a user

```bash
# 1. Download the binary plus sha256sums.txt(.sig|.pem) from the release page.
# 2. Install cosign once: brew install cosign  /  apt install cosign

cosign verify-blob \
  --certificate       sha256sums.txt.pem \
  --signature         sha256sums.txt.sig \
  --certificate-identity-regexp 'https://github.com/arshad-shah/verql/' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  sha256sums.txt

# 3. Verify your downloaded binary matches the recorded hash:
sha256sum -c sha256sums.txt --ignore-missing   # Linux
shasum -a 256 -c sha256sums.txt --ignore-missing # macOS
```

If both succeed, you have a binary that was produced by the
`release.yml` workflow running in `arshad-shah/verql`, and nothing
mutated it after the build.

## Upgrading the pipeline

### Homebrew tap (cask + formula)

The `arshad-shah/homebrew-verql` tap is **regenerated from templates** in this
repo, never hand-edited. The source of truth is
[`packaging/homebrew/verql.cask.rb.tmpl`](../../packaging/homebrew/verql.cask.rb.tmpl)
(macOS DMGs) and
[`packaging/homebrew/verql.formula.rb.tmpl`](../../packaging/homebrew/verql.formula.rb.tmpl)
(the Linux AppImage + a `verql` launcher shim — brew on Linux has no casks),
filled by [`scripts/render-homebrew.mjs`](../../scripts/render-homebrew.mjs) (a
pure `render()` core that fails closed on any unresolved `{{PLACEHOLDER}}`). On
`release: published` (non-prerelease), the
[`homebrew-bump.yml`](../workflows/homebrew-bump.yml) workflow downloads the
DMGs + AppImage, computes their sha256s, runs the generator to write the whole
`Casks/verql.rb` + `Formula/verql.rb`, and pushes to the tap via the scoped
`HOMEBREW_VERQL_DEPLOY_KEY` deploy key. No awk surgery — the files are rewritten
in full each release. The templates use electron-builder's lowercase default
artifact names (`verql-${version}-${arch}.dmg`, `verql-${version}-x86_64.AppImage`);
the generator injects only the version + the three sha256s (the URLs are built
with Ruby `#{version}` interpolation). Users self-update with `brew upgrade`.

> **Unsigned-app handling.** The cask deliberately keeps a `postflight` that runs
> `xattr -dr com.apple.quarantine` on `Verql.app` — while builds are unsigned,
> macOS Sequoia otherwise reports "Verql is damaged". The cask template preserves
> this block verbatim; remove it once macOS builds are signed + notarised (set
> the `MAC_CERT_*` / `APPLE_*` secrets above).

### Promote a draft release

The pipeline creates **drafts** so the maintainer can sanity-check
before users see them. Once you're happy:

1. Go to https://github.com/arshad-shah/verql/releases
2. Find the draft, click Edit
3. Click "Publish release"
4. Publishing fires `homebrew-bump.yml`, which regenerates the cask + formula.
   macOS/Linux users then self-update with `brew upgrade`; Windows users get
   the update through the Microsoft Store.
