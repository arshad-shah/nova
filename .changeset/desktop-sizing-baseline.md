---
"verql": minor
---

The interface reads at its intended size. Everything was rendering **12.5%
smaller than designed**: UI density set the root font size (13/14/15px) as its
scaling lever, but the styling scale is relative to that root — so at the
default density body text came out at 10.5px instead of 12px, the title bar at
35px instead of 40px, and buttons at 31.5px instead of 36px. That put most text
below both the macOS (11px floor, 13px body) and Windows (14px body) guidance
for desktop apps.

Sizes now land where they were designed to: 12px small text, 14px body, a 40px
title bar, 36px buttons. Density still does its job — compact and spacious
scale text and spacing exactly as before — it just no longer drags the whole
interface down with it. If you preferred the tighter look, Settings → Appearance
→ UI density → **compact** is very close to the old default.
