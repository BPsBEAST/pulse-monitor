# PULSE — Website Monitoring

Monitor websites and APIs without an account. Responsive static frontend hosted on GitHub Pages, with a separate Cloudflare Worker.

**Frontend:** https://bpsbeast.github.io/pulse-monitor/  
**API:** https://pulse-monitor.brunofranciscospinto.workers.dev

## Current implementation
- Add, edit and delete up to 20 monitors locally.
- HTTP checks use a Cloudflare Worker, configured automatically on first load.
- Online means a successful 2xx/3xx HTTP response (redirects are treated as unknown because they are deliberately not followed).
- A server 5xx is an offline signal; 4xx and connectivity errors are indeterminate. Websites rejecting HEAD with 405/501 are retried with GET.
- Two consecutive offline signals are required to declare an incident; recovery also takes two consecutive online signals.
- Checking every 5 minutes while the tab is active. **No 24/7 monitoring when the browser is closed.**
- Individual checks, recent activity, incidents, export/import.
- Monitor preferences and settings in localStorage. Historical checks in IndexedDB with localStorage fallback. Browser deletion removes local data.
- API rejects invalid schemes, credentials, custom ports, IP literals and non-public DNS responses, with no redirects and a rate limiter.

## Run locally
Open `index.html` in a modern browser (or start a local static server). The remote API requires the configured GitHub Pages origin for its CORS allowlist; local browsers cannot run live checks against the production API without changing the allowed origin.

## Deployment
GitHub Pages is deployed from the main branch using the GitHub Actions workflow. Cloudflare connects to the same repo with **root directory: `worker`**, deploy command `npx wrangler deploy --name pulse-monitor`. The worker's config is `worker/wrangler.toml`.

Do not expose a new staging deployment with permissive CORS or a disabled rate limiter. API config uses `ALLOWED_ORIGIN=https://bpsbeast.github.io` and `CHECK_LIMITER`.

## Tests
Run `node --check app.js` and `node --test tests/*.test.mjs` in Node 22. These commands also run in the CI workflow `.github/workflows/tests.yml`.

## Security and known limitations
- CORS is not authentication; other HTTP clients can supply an Origin header.
- Native Cloudflare rate limiting is approximate and applies per Cloudflare location, not as a strict global quota. Additional WAF and account-level protections are recommended. <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- DNS preflight **does not fully prevent DNS rebinding**, because the lookup is not pinned to the subsequent connection. Do not present this as complete SSRF protection; require network-level private egress isolation or pin-and-validate all actual connections before considering open URL checking production-hardened.
- Automatic monitoring is not active with the browser closed. The uptime percentage for unmeasured periods must never be inferred.
- Cross-browser syncing, notifications, certificate-expiration checks, and multiple-region monitoring are not implemented.
- The Worker intentionally avoids following HTTP redirects. 4xx and redirects are indeterminate, which may differ from other uptime monitors.
- Production endpoint testing needs live Cloudflare/GitHub Pages access; committed unit tests are not a substitute for end-to-end testing.

The project is an MVP under active development.
