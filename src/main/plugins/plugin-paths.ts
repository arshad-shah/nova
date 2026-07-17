import path from 'node:path'

/**
 * Resolve a manifest-supplied relative path against a plugin's own directory,
 * refusing anything that escapes it.
 *
 * A manifest is attacker-controlled for any third-party plugin: it can name a
 * path as `../../../etc/passwd`, or as an absolute path, and `path.resolve`
 * will happily follow it out of the plugin directory. Every read driven by a
 * manifest field must be pinned back to the plugin root.
 *
 * This guard existed inline for `manifest.main` but not for `manifest.icon`,
 * which let any installed plugin read an arbitrary file through `plugins:list`.
 * It lives here so the next manifest-driven path cannot forget it.
 *
 * @returns the resolved absolute path, or `null` if it escapes `pluginRoot`.
 */
export function resolveWithinPlugin(pluginRoot: string, candidate: string): string | null {
  const root = path.resolve(pluginRoot)
  const resolved = path.resolve(root, candidate)
  const within = resolved === root || resolved.startsWith(root + path.sep)
  return within ? resolved : null
}
