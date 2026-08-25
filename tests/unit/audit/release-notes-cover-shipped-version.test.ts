// Architecture guard — pins the release-process invariant documented in
// `.github/maintainers/release.md` ("Cutting a release", step 2) and
// `docs/onboarding.md` ("Authoring release notes"):
//
//   The version Verql actually ships must have a curated "What's New" page.
//   Authoring it is a hand-written step in cutting a release, so nothing else
//   can notice when it is skipped.
//
// Why this matters (the reason, so it survives the rule): the page is resolved
// by EXACT version match. `decideStartupSurface` only opens a release tab when
// `hasReleaseNote(currentVersion)` is true, so a missing entry is a silent
// no-op — no error, no warning, just an update that says nothing. Worse, Help →
// What's New, the command palette and the Welcome tab all call
// `getLatestReleaseNote()`, which returns `RELEASE_NOTES[0]` unconditionally:
// a user who goes looking is shown the newest page that EXISTS, not the one for
// the build they are running. 1.6.0 and 1.7.0 both shipped that way — users on
// either were handed the 1.5.0 page — and nothing turned red.
//
// The rule is deliberately "newest entry >= package.json", not "an entry equals
// package.json", because the documented flow authors the page BEFORE the
// Version Packages PR bumps `package.json`. The registry is therefore allowed
// to run ahead of the shipped version, and only falling BEHIND is a defect.
//
// Deliberately-planted regressions that must turn this red:
//   • bumping `package.json` past the newest curated entry (what 1.6.0/1.7.0 did)
//   • inserting a release entry anywhere but the top of `RELEASE_NOTES`
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { RELEASE_NOTES } from '../../../src/renderer/src/lib/release-notes'

/** `x.y.z` with an optional `-prerelease` suffix, as shipped by the release flow. */
function parseVersion(version: string): { parts: [number, number, number]; prerelease: string } {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version)
  if (!match) throw new Error(`Not a plain semver version: "${version}"`)
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? '',
  }
}

/** Negative when `a` precedes `b`, positive when it follows, 0 when equal.
 *  A prerelease sorts BEFORE its own release (1.8.0-rc.1 < 1.8.0). */
function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] - right.parts[i]
  }
  if (left.prerelease === right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease < right.prerelease ? -1 : 1
}

const appVersion: string = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'),
).version

describe('curated release notes cover the shipped version', () => {
  it('parses and orders versions the way the release flow produces them', () => {
    // Guard the guard: a broken comparator would make the assertions below
    // vacuously pass, which is exactly how this class of drift goes unnoticed.
    expect(compareVersions('1.8.0', '1.7.0')).toBeGreaterThan(0)
    expect(compareVersions('1.7.0', '1.8.0')).toBeLessThan(0)
    expect(compareVersions('1.8.0', '1.8.0')).toBe(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.8.0-rc.1', '1.8.0')).toBeLessThan(0)
    expect(() => parseVersion('not-a-version')).toThrow()
  })

  it('the newest curated entry is not behind package.json', () => {
    const newest = RELEASE_NOTES[0]
    expect(
      compareVersions(newest.version, appVersion),
      `package.json is at ${appVersion} but the newest curated "What's New" page is ${newest.version}.\n` +
        `Shipping this build would open no release tab on update, and Help → What's New would show the\n` +
        `${newest.version} page to a ${appVersion} user. Author the page before merging the Version Packages PR:\n` +
        `  1. add the copy    — shared/i18n/locales/en/whats-new.ts (a v${appVersion.replace(/\./g, '_')} block)\n` +
        `  2. add the structure — src/renderer/src/lib/release-notes/registry.ts (new entry at the TOP)\n` +
        `Guide: docs/onboarding.md → "Authoring release notes".`,
    ).toBeGreaterThanOrEqual(0)
  })

  it('is ordered strictly newest-first', () => {
    // `getLatestReleaseNote()` returns `RELEASE_NOTES[0]` on the strength of
    // this ordering alone, and the check above reads [0] as "the newest" — an
    // entry appended in the wrong place would defeat both.
    const versions = RELEASE_NOTES.map((note) => note.version)
    for (let i = 1; i < versions.length; i++) {
      expect(
        compareVersions(versions[i - 1], versions[i]),
        `RELEASE_NOTES must be ordered newest-first, but ${versions[i - 1]} is listed above ${versions[i]}. ` +
          `Add new releases to the TOP of the array.`,
      ).toBeGreaterThan(0)
    }
  })

  it('every curated version is a plain semver string', () => {
    for (const note of RELEASE_NOTES) {
      expect(() => parseVersion(note.version), note.version).not.toThrow()
    }
  })
})
