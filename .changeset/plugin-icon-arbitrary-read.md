---
"verql": patch
---

Security: a plugin's manifest icon could read arbitrary files.

`plugins:list` resolved a plugin's `manifest.icon` against the plugin's own
directory with `path.resolve` and no containment check, then base64-encoded
whatever it found and returned it to the renderer. Because a manifest is
attacker-controlled for any third-party plugin, an entry like
`"icon": "../../../../etc/passwd"` — or any absolute path — escaped the plugin's
directory and the file's contents were handed back as the plugin's "icon".

Any installed plugin could therefore read any file the app process can read,
with no prompt, no permission grant, and no capability gate. The file extension
only ever selected a MIME type, so it restricted nothing: a traversal to
`../secret.png` was read and returned too.

**Who is affected:** anyone who has installed a third-party plugin. Bundled
plugins were never able to reach this path. There is no indication of
exploitation, and nothing in the app itself triggers it — a plugin had to ask.

**The fix:** icon paths are now pinned to the plugin's own directory through a
shared `resolveWithinPlugin()` guard, and an unknown extension means the file is
never opened rather than read and mislabelled. The same guard has always
protected `manifest.main`, but it was written inline in the plugin host and
never shared — which is precisely why `icon` shipped without it. Both call-sites
now use the one guard, so a third manifest-driven path cannot forget it.

Found by an adversarial test-hardening pass, and now pinned by regression tests
covering traversal, absolute paths, a traversal wearing an image extension, a
non-image inside the plugin directory, and a legitimate nested icon still
resolving.
