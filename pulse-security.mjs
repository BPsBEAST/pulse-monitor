const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;"}[c]));
const formats={pass:["✓","Conforme"],warning:["!","A melhorar"],fail:["×","Falha"],not_checked:["—","Não avaliado"]};

/** Render only escaped values returned by the Worker; no interpolated HTML from external sites. */
export function securityHtml(data){
 if(!data||typeof data.hostname!=="string"||!Array.isArray(data.checks))return '<div class="panel padded">Resposta de segurança inválida.</div>';
 const usable=Number.isInteger(data.score)&&data.score>=0&&data.score<=100;
 const checks=data.checks.slice(0,20);
 const counts={pass:0,warning:0,fail:0,not_checked:0};
 checks.forEach(c=>{if(Object.hasOwn(counts,c.status))counts[c.status]++});
 const statusClass=usable?(data.score>=75?"safe":data.score>=50?"caution":"risk"):"neutral";
 const date=Number.isFinite(Date.parse(data.checkedAt))?new Date(data.checkedAt).toLocaleString("pt-PT"):"—";
 const top='<div class="security-top"><div class="security-gauge '+statusClass+'"><span>SECURITY SCORE</span><strong>'+(usable?data.score:"—")+'</strong><small>'+(usable?'de 100 pontos':'Sem pontuação')+'</small></div><div class="security-headline"><p class="eyebrow">CONFIGURAÇÃO OBSERVADA</p><h3>'+escapeHtml(data.hostname)+'</h3><p class="muted small">Verificado em '+escapeHtml(date)+' · HTTP '+escapeHtml(data.http?.code??"—")+'</p><p class="security-rating">'+escapeHtml(usable?data.grade:"Inconclusivo")+'</p><p class="muted small">Cobertura: '+escapeHtml(data.coverage??0)+'% dos critérios ponderados. O resultado não substitui uma auditoria de segurança.</p></div></div>';
 const legend='<div class="security-legend"><span class="safe">✓ '+counts.pass+' conformes</span><span class="caution">! '+counts.warning+' a melhorar</span><span class="risk">× '+counts.fail+' falhas</span><span class="muted">— '+counts.not_checked+' não avaliados</span></div>';
 const items=checks.map(c=>{
  const status=Object.hasOwn(formats,c.status)?c.status:"not_checked";
  const [symbol,label]=formats[status];
  return '<article class="security-check"><div class="security-check-main"><span class="security-check-icon '+status+'">'+symbol+'</span><div><strong>'+escapeHtml(c.name)+'</strong><p class="muted small">'+escapeHtml(c.detail||"Sem dados observáveis.")+'</p></div></div><div class="security-check-aside"><span class="security-check-status '+status+'">'+label+'</span><small class="muted">'+(Number.isInteger(c.weight)?c.weight+" pts":"—")+'</small></div>'+(status!=="pass"&&status!=="not_checked"&&c.recommendation?'<p class="security-remedy"><b>Como melhorar:</b> '+escapeHtml(c.recommendation)+'</p>':"")+'</article>';
 }).join("");
 const reason=data.reason?'<div class="security-note"><strong>Análise inconclusiva</strong><p>'+escapeHtml(data.reason)+'</p></div>':"";
 const restrictions=(Array.isArray(data.limitations)?data.limitations:[]).slice(0,10).map(l=>'<li>'+escapeHtml(l)+'</li>').join("");
 return '<section class="security-report panel padded" aria-label="Relatório de segurança">'+top+legend+reason+
  (checks.length?'<div class="security-check-list">'+items+'</div>':'<p class="muted">Não existem verificações concluídas para apresentar.</p>')+
  '<div class="security-report-footer"><div><h3>Âmbito e limitações</h3><ul class="security-limitations">'+restrictions+'</ul></div><button type="button" class="subtle security-export" data-action="security-pdf">↓ Descarregar PDF</button></div></section>';
}
