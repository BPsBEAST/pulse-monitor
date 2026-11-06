const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const formatStatus=status=>status==="online"?"Online":status==="offline"?"Indisponível":"Inconclusivo";
export function diagnosticsHtml(data){
 if(!data||typeof data.hostname!=="string")return '<div class="panel padded">A resposta do diagnóstico não foi reconhecida.</div>';
 const ips=Array.isArray(data.ips)?data.ips.slice(0,30):[];
 const entries=Array.isArray(data.dns)?data.dns.slice(0,50):[];
 const http=data.http&&typeof data.http==="object"?data.http:{};
 const cards=["A","AAAA","CNAME","MX","NS"].map(type=>{
  const records=entries.filter(r=>r?.type===type);
  return '<article class="panel diagnostic-card"><div class="diag-card-label">'+type+'</div>'+(records.length?records.map(r=>'<div class="dns-value">'+escapeHtml(r.value)+(Number.isFinite(r.ttl)?'<small>TTL '+r.ttl+'s</small>':"")+'</div>').join(""):'<p class="muted small">Sem registos devolvidos.</p>')+'</article>';
 }).join("");
 const headers=http.headers&&typeof http.headers==="object"?Object.entries(http.headers).slice(0,7).map(([k,v])=>'<div class="diag-row"><span>'+escapeHtml(k)+'</span><strong>'+escapeHtml(v)+'</strong></div>').join(""):"";
 return '<div class="diag-header"><div><p class="eyebrow">RESULTADO DO DIAGNÓSTICO</p><h2>'+escapeHtml(data.hostname)+'</h2><p class="muted small">Consulta efetuada em '+escapeHtml(data.checkedAt?new Date(data.checkedAt).toLocaleString("pt-PT"):"—")+' · apenas dados técnicos de domínios públicos</p></div><span class="diag-pill">'+escapeHtml((data.protocol||"").toUpperCase())+'</span></div>'+
 '<div class="diagnostic-top-grid"><article class="panel diagnostic-summary"><span>Estado HTTP</span><strong class="'+(http.status==="online"?"green":http.status==="offline"?"red":"muted")+'">'+escapeHtml(formatStatus(http.status))+'</strong><small>'+(Number.isInteger(http.code)?"HTTP "+http.code:"Sem resposta HTTP conclusiva")+'</small></article>'+
 '<article class="panel diagnostic-summary"><span>Resposta</span><strong>'+ (Number.isFinite(http.ms)?http.ms+" ms":"—") +'</strong><small>Medida a partir do Worker</small></article>'+
 '<article class="panel diagnostic-summary"><span>IPs públicos resolvidos</span><strong>'+ips.length+'</strong><small>Registos A e AAAA</small></article></div>'+
 '<div class="panel padded diag-ips"><div class="section-header"><h2>Endereços IP do domínio</h2><span class="muted small">Não são IPs de visitantes</span></div>'+(ips.length?'<div class="ip-list">'+ips.map(ip=>'<code>'+escapeHtml(ip)+'</code>').join("")+'</div>':'<p class="muted small">Não foram encontrados IPs públicos.</p>')+'</div>'+
 '<div class="section-header"><h2>Registos DNS</h2><span class="muted small">Resolução por DNS-over-HTTPS</span></div><div class="dns-grid">'+cards+'</div>'+
 '<div class="diag-details-grid"><article class="panel padded"><h2>Cabeçalhos HTTP</h2>'+(headers||'<p class="muted small">Sem cabeçalhos disponíveis.</p>')+(http.redirectHost?'<div class="diag-row"><span>Destino de redirecionamento</span><strong>'+escapeHtml(http.redirectHost)+'</strong></div>':"")+'</article>'+
 '<article class="panel padded"><h2>HTTPS / Certificado</h2><p class="muted small">Protocolo: '+escapeHtml(data.protocol==="https"?"HTTPS":"HTTP")+'</p><p class="muted small">O Worker atual não disponibiliza a data de validade do certificado remoto. Não mostramos dados TLS inventados.</p></article></div>';
}
