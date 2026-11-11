# PULSE · Website Monitoring

Free website monitoring without user accounts. Static GitHub Pages frontend + Cloudflare Worker.

**Frontend:** https://bpsbeast.github.io/pulse-monitor/  
**Worker:** https://pulse-monitor.brunofranciscospinto.workers.dev  
**Release:** v0.8 · frontend e backend de segurança verificados em produção em 11/11/2026


## Segurança HTTP (v0.8)

Dentro de **Diagnóstico**, a área **Segurança HTTP** permite analisar a configuração de um website público. Cada website guardado também apresenta um atalho **Segurança** para preencher e executar a análise. A funcionalidade reutiliza o mesmo frontend GitHub Pages, o Cloudflare Worker já existente e o mesmo limite de pedidos.

- GET /security?url=https://exemplo.pt realiza **uma única consulta GET** ao destino, depois de validar o DNS e sem seguir redirecionamentos. Não faz fuzzing, scans de portas, brute force, exploração de falhas nem análise de recursos internos.
- As **7 verificações** são HTTPS (25 pontos), HSTS (20), CSP (20), proteção contra clickjacking (10), X-Content-Type-Options (10), Referrer-Policy (10) e Permissions-Policy (5). O painel mostra evidência observada, estado e recomendação.
- O resultado é **indicativo**; a nota é calculada apenas sobre critérios avaliáveis e apresenta a cobertura. Se não houver resposta 2xx ou cobertura suficiente, não atribui pontuação. Redirecionamentos não são seguidos.
- **Descarregar PDF** gera localmente um PDF de várias páginas com avaliação, recomendações, data e limitações, sem serviço externo nem biblioteca paga. Os valores recebidos do site são escapados na interface.
- O Worker pode confirmar que uma ligação HTTPS teve sucesso, **mas não disponibiliza validade/emissor/cadeia/versionamento do certificado TLS**. Não existem alegações de validação detalhada de certificados, testes de vulnerabilidades, dependências/CVEs, cookies ou segurança de páginas autenticadas. Para analisar dependências é necessário um ficheiro de dependências ou um SBOM fornecido pelo proprietário.
- A análise é pontual e apenas a pedido do utilizador, sem alterações ao monitor periódico, histórico ou armazenamento dos websites.

### Deploy desta funcionalidade

1. O GitHub Pages publica automaticamente a interface após merge em main.
2. **Estado confirmado (11/11/2026):** o Worker em produção respondeu com `/health` na versão **0.8**, e `/security` devolveu sete verificações e uma pontuação indicativa para `https://example.com/`. O workflow `Live PULSE Worker smoke test` verifica a publicação real; o workflow do GitHub Pages publica apenas o frontend. Para publicação manual de alterações futuras ao Worker, executar `npx wrangler deploy` na pasta `worker` com autorização Cloudflare.
3. Se uma futura alteração ainda não tiver chegado ao Worker, o PULSE mostra uma mensagem explícita em vez de inventar uma pontuação. Confirma sempre `/health` e `/security` com o workflow de integração.
4. Executa `node --test tests/*.test.mjs` e usa os testes Playwright do workflow `.github/workflows/tests.yml`. O workflow `.github/workflows/live-smoke.yml` também gera e valida um PDF real a partir de uma análise pública, disponibilizando-o como artefacto. O projeto mantém os limites do plano gratuito sujeitos aos termos do fornecedor.

## Adicionar um website (importante)

Na **Visão geral**, o formulário principal **Monitorizar um novo website** permite adicionar um endereço sem entrar em menus. A página **Websites** também tem um formulário rápido. Depois de guardar, o PULSE abre automaticamente a lista de websites, permitindo confirmar onde ficou o monitor. O botão **+ Novo website** também permanece acessível a partir de qualquer página, incluindo as Definições. O endereço do Cloudflare Worker é uma opção exclusivamente técnica escondida em **Configuração avançada do servidor PULSE**.

Na v0.2 era possível guardar um website por engano no campo da API. A v0.3 recupera especificamente `https://formacao.inem.pt` quando estiver guardado nesse campo, adiciona-o como monitor e restaura `https://pulse-monitor.brunofranciscospinto.workers.dev` como backend. Isto só funciona se os dados anteriores ainda existirem no browser. Se o utilizador tiver fechado uma sessão anónima, terá de adicionar novamente o website.

## Dashboard e diagnósticos v0.5

- Novo dashboard inspirado em ferramentas de observabilidade: gráfico de latência e média móvel, cartões de estado por website, métricas, disponibilidade medida e atividade recente. **Todos os valores são derivados de verificações reais**; quando faltam dados, são mostrados estados vazios.
- Navegação **Diagnóstico** e botão interno **Diagnóstico** em cada monitor.
- Endpoint `GET /diagnostics?url=https://exemplo.pt`: IPs públicos resolvidos, registos DNS A/AAAA/CNAME/MX/NS, HTTP status, latência, cabeçalhos selecionados e hostname de redirecionamento (sem seguir o redirect).
- Endpoint `GET /ip-info?ip=1.1.1.1`: consulta passiva de ASN, prefixo BGP e organização via Team Cymru DNS. Não envia ping nem pedidos HTTP ao IP consultado.
- A consulta de IPs tem como alvo a titularidade/roteamento de **IPs públicos de infraestrutura**, não a identificação de pessoas.
- **Limitações:** não há ping ICMP, traceroute, scans de portas, geolocalização precisa nem validade do certificado TLS; não inventamos dados para estas funcionalidades.
- Consultas sujeitas a limites de pedidos, validação de destinos e restrição de CORS. A validação DNS prévia ainda não garante proteção total contra DNS rebinding.

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
- `pulse-viz.mjs`: SVG charts from measured data only.
- `pulse-diagnostics.mjs`: escaped HTML renderers for DNS, HTTP and IP results.
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
- Where HEAD is rejected or returns 403, 405, 501 or 5xx, GET is attempted for **monitoring**; the **security** audit performs only one GET and does not retry redirects or failed results.

## Security and production limitations

- Only public DNS hostnames are accepted and their resolved A/AAAA records receive a preflight inspection; literal IP addresses, private hostnames, credentials, unsupported schemes and nonstandard ports are blocked. Redirects are not followed.
- The Worker has a Cloudflare rate-limiting binding and exact allowed CORS origin. **CORS is not authentication**, and Cloudflare's native rate limiter is approximate and regional.
- **DNS preflight is not complete SSRF protection:** DNS answers can change between validation and connection. Public deployment with arbitrary user-controlled URLs requires an egress design that can guarantee no private/metadata connections, plus extra Cloudflare abuse controls.
- The Worker is stateless; there is **no 24/7 checking when the browser is closed**, no cross-device history, and no push alerts while completely offline.
- Certificate-expiry monitoring requires a separate, trustworthy TLS-inspection backend. It is not implemented.
- Live end-to-end deployment and multi-browser tests must be verified after the GitHub/Cloudflare build completes. Unit tests alone do not prove a live deployment.

## Status

A versão v0.8 do frontend e o endpoint `/security` do Worker foram verificados em produção em 11/11/2026 com resultados de testes públicos reais. O relatório de segurança é pontual e indicativo. A monitorização 24/7, a análise avançada de TLS e a proteção completa contra DNS rebinding continuam fora do âmbito da versão atual.
