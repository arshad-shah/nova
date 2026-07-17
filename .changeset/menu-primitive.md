---
"verql": minor
---

Menus: one implementation for every menu in the app.

The renderer carried three copies of the same floating-menu machinery.
`DropdownMenu` accepted only `{ label, onSelect, disabled }`. `ContextMenu` was
a near-copy of it with no keyboard navigation and no collision handling, so
right-clicking an explorer node near a screen edge opened a menu that ran off
the viewport. `MenuBar` never used the primitive at all — despite a comment
claiming its look — and hand-rolled the same stack a third time, which is how it
ended up the most capable menu in the app while not being the shared one.

All three now render `primitives/surfaces/menu`. Nothing new was added to the
dependency tree: `@floating-ui/react` was already installed, and this uses the
parts of it the app had never touched — `useListNavigation` (replacing a
`querySelectorAll`-per-keypress loop), `useTypeahead`, `FloatingFocusManager`,
`FloatingTree` with `safePolygon` for submenus, and the `size` middleware so a
long connection list scrolls instead of overflowing.

Menus can now express what the app already needed: icons, accelerators, section
headers, separators, submenus, check and radio rows with the right ARIA roles
(`menuitemcheckbox` / `menuitemradio` / `group`), and a destructive tone. Two
entry points, one implementation — a declarative `items` tree for data-shaped
menus like the application menu, and compound `<Menu.Item>` for rows with custom
content.

Visible fixes that fall out of this: right-click near a screen edge now flips
into view; Escape returns focus to the trigger instead of stranding it on
`<body>`; typing jumps to a row; and the leading icon column is reserved per
menu rather than per row, so labels no longer jag left and right depending on
whether their neighbour has an icon — all three previous menus got that wrong.

The menubar keeps only what is genuinely menubar-specific (cross-menu hover
switching and ←/→) in a local `useMenubar` hook.

An audit test now fails CI if a fourth copy appears: `role="menu"` may only be
declared inside the menu module.
