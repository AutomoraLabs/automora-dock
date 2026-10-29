# Release checks

Run `pnpm test`, `pnpm build` and the native host build. Test installer clean install/upgrade/uninstall on disposable Windows accounts. Verify both icons/shortcuts, sign-in startup, pin consent/fallback, profile routing, launcher toggle, persistence and full backup restore. Publish checksums with binary releases.

Do not equate an unsigned build or automated tests with independent security, accessibility or commercial certification. Windows controls pin consent and startup scheduling.
