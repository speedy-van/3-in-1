# Restaurant screens

A Next.js application with one authenticated menu editor and six browser-based display channels. The repository was empty before this implementation. This does not replace the existing ordering provider, configure a domain, provision a database, or deploy a live website.

## Included

- `/admin/screens`: administrator login, six screen configurations, menu/price editor, image uploads, promotion expiry, pairing codes and connection status.
- `/display/1` through `/display/6`: read-only displays, own content or mirrored content, menu pagination, poster mode, landscape/portrait layouts, optional full screen and Screen Wake Lock.
- `/`: a published-menu view reading the same catalogue. No basket, payment or ordering integration is added by this feature.
- Automatic display polling every 10 seconds, conditional responses, request timeouts, bounded reconnection backoff, 15-minute maximum cached-price age, and revocation handling.
- Display-only service-worker caching. Administration and API responses are never cached by the worker.
- 140 researched menu entries and 314 price variants, imported only as drafts. Six screens initially remain disabled.
- PostgreSQL persistence through Neon's HTTP serverless driver. PGlite is a development-only PostgreSQL test engine, not a production fallback.

## Server setup

Use Node.js 22.16 or later and npm. Install the committed lockfile with `npm ci`.

Copy `.env.example` to `.env.local` and configure these newly defined server-only settings:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | An authorised Neon PostgreSQL connection string. Never a public client variable. |
| `APP_ORIGIN` | Exact canonical HTTPS origin, no trailing slash or path. Local development may use `http://localhost:3000`. |
| `ADMIN_PASSWORD_HASH` | Generate locally using `npm run password`. There is no default password. |

The password generator accepts a hidden terminal input of 14 to 256 characters. Do not put a plaintext password or a real connection string into Git. Hosting dashboards receive the literal generated hash. When using `.env.local`, escape each literal `$` in the hash as `\$` because Next.js expands dollar-prefixed environment references.

Run `npm run db:migrate` once with the authorised database connection. The migration is transactional and idempotent, creates only the explicitly documented signage tables, and never overwrites an existing catalogue. Then run `npm run dev`, or `npm run build` followed by `npm start`.

Configure the same server settings in the hosting environment before deploying. The application fails closed with a setup message if configuration or database tables are missing. This repository does not contain deployment credentials.

## Pairing the televisions

1. Sign in at `/admin/screens`. Review and publish appropriate menu items, configure each display, enable it, and save.
2. On TV 1, open `/display/1`. Generate a pairing code for Screen 1 in the dashboard and enter it on the TV. Repeat through `/display/6`.
3. Codes expire after ten minutes, work once, and are scoped to one screen. The television receives an HttpOnly, screen-scoped cookie, not administrator access.
4. Press **Start full-screen display** on each television. A browser cannot grant full-screen permission without user interaction or reliably change hardware sleep settings.
5. Disable sleep, eco/auto-power-off timers and screen savers in the television's settings. Configure its start-up browser/bookmark where supported. Test every physical device after power loss.

Each screen has its own enable switch. Mirrored screens follow the source's content, timing and orientation; a disabled source pauses its mirrors. **Show this content on all six screens** configures the other five to mirror the selected source, without changing their enable switches.

A screen is labelled Connected when its last request was within 90 seconds. This is a last-seen indicator, not proof that the panel is physically illuminated. Reported version is the last version acknowledged by the browser; it can lag by one poll.

## Editing content

Use **Menu & prices** to add categories/items, edit names and exact GBP prices, publish/unpublish items, mark sold-out products, and upload photos. Every size/variant is a separate display row, so a sauce-only price is not silently advertised as a full curry price. Screen category selection controls what rotates on that television; an empty selection means all categories.

Uploads accept JPG, PNG or WebP up to 3 MB and 20 megapixels. The server validates and re-encodes images as WebP, strips metadata, and limits dimensions to 1920 pixels. Menu images are public assets stored in PostgreSQL, not private customer uploads. SVG and remote URL imports are not accepted. Replaced/unreferenced images are retained intentionally to avoid breaking cached snapshots; a retention/cleanup policy can be added separately.

Promotions require a UTC expiry time and disappear locally at expiry, even while offline. Poster images are manually controlled content; promotional claims embedded within an image do not gain automatic expiry from the separate text banner. Remove or replace dated posters before their offers end.

Save is explicit and atomic. A revision mismatch returns a conflict instead of overwriting another administrator. Unsaved edits remain on screen; **Reload saved** requires confirmation before discarding them. Device-status polling never replaces a dirty form.

## Offline behaviour and limits

A previously loaded, paired display may use its last successfully confirmed menu for at most 15 minutes. Prices are then hidden behind a staff-assistance message until reconnection. A successful 304 response refreshes the confirmation time. A 401/403 clears cached content immediately. Revocation cannot reach a completely offline device instantaneously; the same 15-minute limit applies.

The service worker caches only display shells and same-origin hashed JavaScript/CSS assets. It requires a supported secure browser and a successful online visit to prime the cache. It does not cache API or administrator responses. A first visit without internet cannot be bootstrapped, and OS storage eviction may remove an existing cache. Image loading offline also depends on the browser's asset cache.

Full screen, wake lock, automatic browser launch and HDMI device behaviour require real-device testing. This implementation does not claim compatibility with every smart-TV browser. Unsupported keep-awake/full-screen capabilities have user-facing fallbacks. No silent browser permission bypass is used.

## Data and security

`data/menu-draft.json` is a compact transcription of the user-provided research handover dated 9 October 2026. Source: `https://pa23.3in1dunoon.com/Menu`. Format: category tuples containing item-name tuples and `[variant label, price in pence]` pairs. Names and prices are draft observations, not owner approval or an allergy matrix. No photographs, dietary certifications, opening hours, discounts or customer data were invented or imported into live operation.

Authentication uses a fixed-cost scrypt hash and opaque, hashed database sessions. Administrator sessions last 12 hours and become invalid after a password-hash change. Device cookies renew while used and are revocable. Mutations require the exact configured Origin, with SameSite cookies, server-side validation, bounded request bodies, parameterised SQL, and persistent rate limiting. Login is globally limited to 20 attempts per 15 minutes; each screen has six pairing attempts per minute. Add hosting-level abuse protection for an internet-facing installation, especially because a deliberate attacker could temporarily consume the shared login budget.

The public menu and TV projection only include published, available products. TV snapshots do not expose passwords, pairing codes, device records or administrator sessions. All routes remain noindex and the pilot robots file disallows crawling until the wider restaurant website is approved.

## Validation

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests use the real PostgreSQL engine embedded in PGlite to exercise persistence, optimistic concurrency, code replay/expiry, session expiry, revocation, rate limits and media references. Browser tests use clearly scoped API fixtures for interactions and also exercise real unauthenticated/CSRF rejection routes. They are not a live Neon, live-payment or physical-TV acceptance test.

GitHub Actions runs these commands and retains source, browser screenshots and failure traces for seven days. The initial implementation workflow resolves actual npm registry versions and commits only the tested package manifest and lockfile on the implementation branch. Later installs use `npm ci` and the committed lock.

## Rollout and rollback

Before live use: configure the authorised database and hosting environment, run the migration, set the canonical origin, approve menu entries, upload authorised images, pair all six televisions, and test power recovery and internet interruption on the actual devices. Keep the existing ordering site intact.

To pause operation, disable screens in the dashboard or revoke the individual device. To roll back code, restore a previously tested Git commit through the normal hosting workflow. Do not drop the database tables or overwrite the catalogue to roll back a front-end change.
