# PULSE — Website Monitoring

A free, account-free website monitoring dashboard. No Supabase, no tracking, and no traditional database.

## What works
- Responsive dashboard and monitor management (max 20)
- Add, edit, remove and manually check website addresses
- Browser-local history and incidents, with backup export/import
- Automatic checks every 5 minutes **while the page is open**, once a Worker is configured
- Explicit unknown state when a check cannot be completed

## Architecture
Static frontend: `index.html`, `styles.css`, `app.js`, hosted on GitHub Pages.
Persistence: browser `localStorage` (device and browser specific).
Optional backend: Cloudflare Worker in `worker/`, making remote HTTP HEAD checks.

## Publish frontend
Open repository Settings → Pages → Build and deployment → Source: **GitHub Actions**.
The workflow in `.github/workflows/pages.yml` deploys the main branch.
Expected URL: https://bpsbeast.github.io/pulse-monitor/

## Deploy the Worker
Requires a Cloudflare account and Wrangler (not deployed automatically).
1. `cd worker`
2. `npx wrangler login`
3. `npx wrangler deploy`
4. Copy the `https://...workers.dev` endpoint into PULSE → Definições.

`ALLOWED_ORIGIN` must match the exact frontend origin (without its path), currently `https://bpsbeast.github.io`.

## Important limitations
- The site **does not** monitor after the browser is closed.
- Nothing is checked until the Cloudflare Worker has been deployed and configured.
- Browser storage can be deleted by the user; export regularly.
- This early MVP does not provide server-side notification delivery, SSL certificate inspection, or uptime statistics for periods that were not measured.
- No API endpoint should be treated as secure based on CORS alone; for public deployment add Cloudflare rate limiting, abuse protection, robust network egress safeguards and operational monitoring.
- HEAD requests may be unsupported by some sites. Manual redirects are not followed to prevent unsafe unvalidated destinations.
- An HTTP error is a confirmed server response, but some website policies and anti-bot features can produce false outage indications. Confirmations and improved classification are planned.

## Project status
MVP frontend committed. Hosted publication and Worker deployment must be verified separately.
