---
"verql": patch
---

Storybook: give every story the app `ThemeProvider` from a single global
decorator. The title bar and welcome screen stories crashed with "useTheme must
be used within ThemeProvider" — both render `VerqlMark`, whose `auto` variant
resolves light/dark through `useTheme()`, and Storybook's theme toolbar only set
the `data-theme` attribute, never the React context. Every story that touched
the theme had to remember its own provider decorator, and the two newest ones
didn't.

The provider now wraps all stories from `.storybook/preview.tsx`, and the ten
per-file decorators that duplicated it are gone. The theme toolbar drives the
provider through its own `setTheme` instead of writing `data-theme` behind its
back, so the provider stays the single writer of that attribute — this replaces
addon-themes' `withThemeByDataAttribute`, which raced it.
