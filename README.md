# PULSE · Website Monitoring

Free website monitoring without user accounts. Static GitHub Pages frontend + Cloudflare Worker.

**Frontend:** https://bpsbeast.github.io/pulse-monitor/  
**Worker:** https://pulse-monitor.brunofranciscospinto.workers.dev  
**Release:** v0.4 MVP

## Adicionar um website (importante)

Na **Visão geral**, o formulário principal **Que website queres acompanhar?** permite adicionar um endereço sem entrar em menus. A página **Websites** também tem um formulário rápido. Depois de guardar, o PULSE abre automaticamente a lista de websites, permitindo confirmar onde ficou o monitor. O botão **+ Novo website** também permanece acessível a partir de qualquer página, incluindo as Definições. O endereço do Cloudflare Worker é uma opção exclusivamente técnica escondida em **Configuração avançada do servidor PULSE**.

Na v0.2 era possível guardar um website por engano no campo da API. A v0.3 recupera especificamente `https://formacao.inem.pt` quando estiver guardado nesse campo, adiciona-o como monitor e restaura `https://pulse-monitor.brunofranciscospinto.workers.dev` como backend. Isto só funciona se os dados anteriores ainda existirem no browser. Se o utilizador tiver fechado uma sessão anónima, terá de adicionar novamente o website.

## What works

- Add, edit and remove up to 20 websites. The app automatically opens the saved website list after a successful save.
- Monitor settings and websites are stored in both IndexedDB and localStorage when available. Save operations verify persistence and **display an error instead of claiming success** when both are blocked.
- Previously saved data from the original `pulse:v2` localStorage format and earlier IndexedDB history are migrated when possible.
- Export a complete JSON backup or import it again, with URL validation.
- Pause and resume a monitor; manually check or run automatic checks every 1, 5, 10, 15 or 30 minutes while the tab is open.
- Real latency, HTTP status, history, incidents confirmed by consecutive observations, notifications stored locally and a chart of **measured** response times.
- Observed uptime summaries for the last 24h, 7d and 30d. No data is fabricated for times when checks did not run.
- Optional browser notifications require user permission, and are limited to times when the page is running.

## Important storage warning

All data belongs to the browser profile and device. **Incognito/anonymous browsing is temporary:** closing all private windows removes the session's saved websites. For durable day-to-day use, open the PULSE URL in an ordinary browser window and periodically export a backup under Settings. Data is **not synced** between devices.


## Melhorias de usabilidade v0.4

- Campo **Adicionar website** em destaque no topo da Visão geral, com uma única ação principal.
- Navegação mais clara: Visão geral, Websites, Histórico, Incidentes, Notificações e Definições.
- Ao guardar, o website aparece logo em **Websites**; o estado distingue *Por verificar*, *A verificar*, *Online*, *Indisponível* e *Estado inconclusivo*.
- Quando a lista está vazia, um botão visível convida a adicionar o primeiro website.
- Os avisos técnicos de armazenamento só ocupam espaço quando existe um problema real. Os limites de persistência continuam explicados junto ao formulário e nas Definições.
- Definições técnicas do Cloudflare Worker continuam escondidas na secção avançada para evitar confusão com websites monitorizados.

## Architecture

- `index.html`, `styles.css`, `app.js`: responsive browser UI.
- `pulse-core.mjs`: URL validation, monitor state, incident confirmation and statistics.
- `pulse-storage.mjs`: IndexedDB + localStorage persistence, migrations and rollback-safe saves.
- `worker/index.js`: external HTTP monitoring and input validation.
- `worker/wrangler.toml`: Worker deployment and approximate Cloudflare rate limiting.
- `tests/*.test.mjs`: Worker response checks, monitor logic, storage roundtrip and UI reload regression tests.

## Deployments

**GitHub Pages:** publish the main branch using the configured Pages Actions workflow.  
**Cloudflare:** Git repository `BPsBEAST/pulse-monitor`, root `worker`, deploy `npx wrangler deploy --name pulse-monitor`. Check `worker/wrangler.toml` for the expected CORS origin.

Run `node --check app.js`, `node --check pulse-core.mjs`, `node --check pulse-storage.mjs` and `node --test tests/*.test.mjs` with Node 22. The GitHub workflow `.github/workflows/tests.yml` runs these automatically.

## Monitoring semantics

- HTTP 2xx: online.
- HTTP 3xx: unknown, because redirects are deliberately not followed.
- HTTP 4xx: unknown (some anti-bot policies respond with 4xx).
- HTTP 5xx: offline signal.
- Network timeout, DNS error, rejected URL or unsupported host: unknown.
- Two consecutive offline signals open an incident, and two consecutive online signals confirm recovery.
- Where HEAD is unsupported with 405/501, GET is attempted.

## Security and production limitations

- Only public DNS hostnames are accepted and their resolved A/AAAA records receive a preflight inspection; literal IP addresses, private hostnames, credentials, unsupported schemes and nonstandard ports are blocked. Redirects are not followed.
- The Worker has a Cloudflare rate-limiting binding and exact allowed CORS origin. **CORS is not authentication**, and Cloudflare's native rate limiter is approximate and regional.
- **DNS preflight is not complete SSRF protection:** DNS answers can change between validation and connection. Public deployment with arbitrary user-controlled URLs requires an egress design that can guarantee no private/metadata connections, plus extra Cloudflare abuse controls.
- The Worker is stateless; there is **no 24/7 checking when the browser is closed**, no cross-device history, and no push alerts while completely offline.
- Certificate-expiry monitoring requires a separate, trustworthy TLS-inspection backend. It is not implemented.
- Live end-to-end deployment and multi-browser tests must be verified after the GitHub/Cloudflare build completes. Unit tests alone do not prove a live deployment.

## Status

The GitHub code contains the new persistence implementation and tests. Live production status needs a successful deployment and real-browser verification before declaring the feature complete.
