---
'verql': minor
---

Redesigned the tab bar. Tabs are larger and roomier at every UI density
(Settings → Appearance → UI Density), sized off a proper density scale instead
of a fractional accident — the previous "comfortable" tab was 33.75px tall.
The active tab no longer relies on a thin accent strip across the top; it now
reads as a raised surface welded into the workspace, with a brighter label and
matching corner rounding.

Tabs are now fully keyboard-operable and exposed to assistive tech: the tab
strip is a single tab stop, arrow keys move focus along it, Enter/Space
activates the focused tab, Home/End jump to the first/last tab, and
Delete/Backspace closes it (respecting the same unsaved-changes and
open-transaction prompts as clicking the close button). Switching focus with
the arrow keys does not itself switch tabs — activating one opens a real
editor and, for a database tab, a real connection, so that only happens on an
explicit activate.

Fixed: Close Others, Close to the Right, and Close All could silently discard
unsaved changes and abandon open transactions, bypassing the confirmation
prompts that a single tab's close button always honored. They now behave
consistently with closing one tab at a time: clean tabs close immediately, any
unsaved tabs in the batch share one confirmation before their changes are
discarded, and any tab with an open transaction is prompted to commit or roll
back before it closes.

Fixed: tab icons no longer ignore the active theme.

Fixed: inactive tab labels had insufficient contrast against the tab
background on several bundled themes; labels are now readable at a minimum
contrast ratio across all bundled themes, checked automatically going forward.
