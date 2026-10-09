# Copilot handover

The six-screen implementation already exists. Do not scaffold another application or replace it with mock pages. Communicate in Arabic; keep code and UI copy in British English.

Read README.md, package.json, package-lock.json, .env.example, db/001_signage.sql, and the actual Git status before changing anything. Preserve unrelated work. Do not provision resources, deploy, change DNS or run production migrations without launch approval.

Existing entry points:
- src/app/admin/screens/page.tsx -> AdminDashboard in src/components/admin-dashboard.tsx.
- src/app/display/[screenId]/page.tsx -> DisplayPlayer({ screenId: number }) in src/components/display-player.tsx; accepts 1 through 6 only.
- src/hooks/use-display.ts -> useDisplay(screenId), bounded polling, pairing and cache lifetime.
- src/hooks/use-kiosk.ts -> useKiosk(), feature-detected full screen and wake lock.
- src/lib/model.ts -> validated MenuDocument, MenuItem, Screen, SavedDocument and DisplaySnapshot contracts.
- src/lib/repository.ts -> SignageRepository with parameterised queries and optimistic revisions.
- src/lib/server.ts and src/lib/security.ts -> server-only configuration, session verification and mutation protection.
- src/app/api/signage/[...path]/route.ts -> shared API; update all consumers together if a contract changes.
- public/display-sw.js -> display shell caching only, never admin or API responses.
- src/lib/seed.ts and data/menu-draft.json -> 140 draft items and 314 price variants.

For authorised setup, use only the documented DATABASE_URL, APP_ORIGIN and ADMIN_PASSWORD_HASH. Generate the password hash locally with npm run password; never print or commit secrets. Observe the README instructions for dollar signs in .env.local. Run npm run db:migrate only against the approved database. Existing data must not be overwritten.

Preserve these behaviours: guest screens have no admin privileges; one menu source; independent or mirrored displays; integer GBP pence; explicit publishing; sold-out filtering; expiring text promotions; 10-second healthy polling; no overlapping fetches; abort/cleanup on unmount; cached prices hidden after 15 minutes without confirmation; conflicts preserve unsaved edits; loading, pairing, empty, paused, offline, timeout and error states.

Run npm ci, npm run lint, npm run typecheck, npm test, npm run build, npx playwright install chromium and npm run test:e2e. Inspect e2e/screens.spec.ts, e2e/edge-cases.spec.ts and tests/*.test.ts before altering coverage. Do not weaken a test to conceal a real regression.

Physical acceptance remains separate: pair each television, verify its browser compatibility, wake/full-screen permissions, sleep/eco settings, power restart and internet recovery. Browser fixtures are not a live Neon or physical-TV test. The existing external ordering site is not connected to this catalogue.

Report actual commands, results, changed paths, complete contents of touched files, remaining configuration and rollback steps. Do not claim that a GitHub push has made a live website available.
