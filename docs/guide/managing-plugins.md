# Managing plugins

Much of what Verql does is delivered through **plugins** — extensions that add
capabilities to the app. From your point of view, a plugin can add things like a
new database driver, a colour theme, an import/export format, an AI provider, or
a panel. Even the built-in PostgreSQL, MySQL, and SQLite drivers are bundled
plugins.

[← Back to the User Guide](./README.md)

## What plugins add

A plugin can contribute one or more of:

- **Database drivers** — support for another database type
- **Themes** — additional colour schemes
- **Import/export formats** — more ways to move data in and out
- **AI providers** — more model backends for the assistant
- **Panels and commands** — extra UI and actions

The plugins settings page shows each plugin's actual contributions so you can see
what it brings.

## Viewing, enabling, and disabling plugins

Verql shows installed plugins in two places that stay in sync: the **Plugins**
panel in the sidebar, and the **Plugins** category in Settings. From either you
can:

- See each plugin's description and what it contributes
- **Enable** or **disable** a plugin — a disabled plugin's contributions are
  removed from the app, and your choice persists across restarts

> The always-on bundled plugins that provide core functionality stay in place;
> optional plugins are the ones you'll typically toggle.

Installing and uninstalling starts from the sidebar **Plugins** panel: its
install button opens an install view where you drag a plugin folder or `.zip`
file, or use **Browse Files** to pick one; open a plugin's detail view and
choose **Uninstall** to remove one you no longer want. Built-in plugins can't
be uninstalled — only disabled.

## Reviewing a plugin's permissions

A plugin's detail view has a **Permissions** tab. Built-in plugins are trusted
and skip this entirely. A third-party plugin instead lists the capabilities it
declared — for example, access to the keyring or your saved connections — with
a toggle for each; the tab marks which ones Verql actually enforces and which
are advisory only. If you change a permission while the plugin is active, you
need to disable and re-enable it for the change to take effect.

## A word on safety

> **Only install plugins you trust.** A third-party plugin runs with access to
> the app — including, potentially, your connections and the data you can reach.
> Treat installing a plugin like installing any other software: get it from a
> source you trust, and don't install something just because it sounds useful.

Verql includes guardrails to limit what a plugin can do and to protect the
built-in drivers from being impersonated. For the full picture of how Verql
protects you, see [Plugin security](../plugin-security.md).

---

Next: [Keeping Verql updated →](./updating.md)
