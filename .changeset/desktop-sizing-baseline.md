---
"verql": minor
---

The interface reads at a proper desktop size. Everything used to render **12.5%
smaller than designed**: UI density set the root font size (13/14/15px) as its
scaling lever, but the styling scale is relative to that root — so at the
default density body text came out at 10.5px instead of 12px, the title bar at
35px instead of 40px, and buttons at 31.5px instead of 36px. Most text sat below
both the macOS (11px floor, 13px body) and Windows (14px body) guidance for
desktop apps.

Density no longer drags the whole interface down with it, and the scale has been
raised a step across all three settings — the old floor was simply too small on
a desktop display. At the default (**comfortable**) body text is now 15px, with
a 45px title bar and 42px controls. **Compact** is now what the old default
aimed to be — 12/14/16px text and 36px controls — so it's a genuinely dense
option rather than an unreadable one, and **spacious** goes further again (16px
body, 48px controls).

If the new default feels roomy, Settings → Appearance → UI density → compact.
