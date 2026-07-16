---
"verql": minor
---

macOS gets the full application menu. The native menu and the Windows/Linux
menu bar were declared in two separate places and had drifted: macOS was
missing the entire **Query** menu (Run, Run Selection, Save, Format Document),
plus Settings, Find in Editor, Close/Reopen Tab, the Explorer/Plugins and
sidebar/dock toggles, Welcome and What's New.

The menu is now declared once in `shared/menus.ts` and rendered by both
surfaces, so a command can't exist on one platform and not another. Placement
still follows each platform's conventions rather than mirroring one OS onto
another: Settings sits in the macOS app menu at Cmd+, and under File elsewhere.

**About now opens Verql's own About window on macOS** instead of the system
About panel, matching every other platform.

Menu shortcuts follow your keybindings. Previously the native menu hardcoded
its accelerators, so rebinding a command in Settings → Keybindings left the old
key firing the old command. One visible consequence: **New Query is Cmd/Ctrl+T**
— the shortcut the keybinding list always advertised — where the menu used to
say Cmd/Ctrl+N.
