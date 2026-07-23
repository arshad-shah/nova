---
"verql": patch
---

ER diagram node labels now use a readable, themed label colour derived from the
node's own hue instead of a hardcoded white. Every colour in the table palette
is bright enough that white text fell below WCAG AA against it (as low as
1.7:1 on the gold and green hues); the header label is now chosen from the
fill's luminance, clearing AA on every hue and every theme. This closes the one
place the renderer's foreground colour did not follow the theme, and the same
`--color-on-fill-*` label tokens replace the remaining raw palette classes
(`text-white`, `text-black`, `bg-black/50`, `divide-white`, `border-white`)
across the window controls, appearance settings, avatars, modals, notifications
sidebar and colour picker. A renderer-wide guard test now fails if any raw
Tailwind palette utility is reintroduced.
