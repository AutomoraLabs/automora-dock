# Contributing

Open an issue describing the problem and steps to reproduce, then submit a focused pull request. Include Windows/Chrome versions and whether the issue affects the manager or launcher. Use synthetic bookmarks and paths in examples.

Follow the README setup, run `pnpm test` and `pnpm build`, and compile the native hosts when changing C#. For UI changes, check both themes and manager/launcher layouts. For data changes, verify backup/restore and backward compatibility with a disposable library.

Do not commit personal databases, profile directories, backups, cookies, tokens, binaries, node_modules or installer outputs. Keep the ProfileDock storage and AppUserModelID identifiers stable unless migration is implemented. Contributions are provided under the repository MIT license.
