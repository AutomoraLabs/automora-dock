# Source package validation — 2026-10-29

- Frontend TypeScript and Vite production build: passed.
- Node regression tests: 49 passed, 0 failed, 0 skipped on Windows with Node 24.
- Both native Windows hosts compiled successfully from this export against the pinned WebView2 SDK.
- Frozen lockfile consistency check: passed (pnpm 11; CI configured for pnpm 10).
- Six UI screenshots captured from the real frontend with synthetic data and all browser requests intercepted. No personal service/network access, page errors or horizontal page overflow. Light manager, light launcher and settings also visually reviewed.
- Source-only ZIP excludes node_modules, built frontend/runtime/host binaries, old experimental Tauri host, private diagnostics, saved library and backup files.
- Portable build discovery uses an installed Node on PATH or an explicit NodePath. No dependency on the author's editor runtime cache.
- Repository-relative README links and images verified; ZIP decompression/integrity and per-file hashes verified.

The supplied GitHub Actions workflow has not run on GitHub yet. The export's updated release packaging/installer license entries have not been exercised through a new installer build in this task. This package does not claim independent security certification or multi-PC acceptance testing. Current binary release installation was validated separately before source packaging.
