import {DEFAULT_API,EMPTY,normalizeUrl,registerMonitor,applyCheck,summary,hydrate} from "./pulse-core.mjs";
import {initializeStorage,saveState} from "./pulse-storage.mjs";
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const when=t=>Number.isFinite(t)?new Date(t).toLocaleString("pt-PT",{dateStyle:"short",timeStyle:"short"}):"Nunca";
let state=EMPTY(),page="overview",editingId=null,queue=Promise.resolve(),timer=null,toastTimer=null;
const inFlight=new Set();
let ready=false;
// O campo técnico aceita apenas Workers. URLs comuns pertencem aos monitores.
function isWorkerAddress(value){
 try{
  const u=new URL(value);
  return u.protocol==="https:" && u.username==="" && u.password==="" &&
    u.port==="" && u.search==="" && u.hash==="" && (u.pathname==="/" || u.pathname==="") &&
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/i.test(u.hostname);
 }catch{return false}
}
async function recoverMisplacedWebsite(){
 if(isWorkerAddress(state.api))return {recovered:false,updated:false};
 const mistaken=state.api;
 state.api=DEFAULT_API;
 let recovered=false;
 // Recuperação pontual do website confundido com a API na versão anterior.
 // Não adicionamos automaticamente outros endpoints técnicos à lista de websites.
 try{
  const candidate=normalizeUrl(mistaken);
  if(new URL(candidate).hostname==="formacao.inem.pt"){
   if(!state.monitors.some(m=>m.url===candidate))registerMonitor(state,candidate,"Formação INEM");
   recovered=true;
  }
 }catch{}
 await saveState(state);
 return {recovered,updated:true};
}

function toast(message){
 const el=$("toast");el.textContent=message;el.classList.add("show");
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),5200);
}
async function commit(mutator){
 const work=async()=>{
  const before=structuredClone(state);
  try{const result=mutator(state);await saveState(state);render();return result}
  catch(e){state=before;render();throw e}
 };
 const operation=queue.then(work,work);queue=operation.catch(()=>{});return operation;
}
function setStorageMessage(message,warning=false){
 const el=$("storageNotice");
 el.classList.remove("hidden");
 el.innerHTML='<span class="banner-icon">'+(warning?"⚠":"ⓘ")+'</span><div><strong>'+esc(warning?"Atenção ao armazenamento":"Os teus websites ficam guardados neste browser")+'</strong><p>'+esc(message)+'</p></div>';
}
function label(m){
 if(inFlight.has(m.id))return ["checking","◷ A verificar"];
 if(m.paused)return ["unknown","Ⅱ Pausado"];
 return m.status==="online"?["up","● Online"]:m.status==="offline"?["down","● Offline"]:["unknown","○ Desconhecido"];
}
function monitorHtml(m){
 const [cls,text]=label(m);
 return '<div class="monitor"><div class="monitor-main"><div class="site-avatar">◉</div><div class="site-details"><strong>'+esc(m.name||new URL(m.url).hostname)+'</strong><small>'+esc(m.url)+'</small><small>Última verificação: '+when(m.checkedAt)+'</small></div></div><div class="monitor-right"><span class="status '+cls+'">'+text+(m.status==="online"&&Number.isFinite(m.ms)?" · "+m.ms+" ms":"")+'</span><div class="monitor-actions"><button class="mini-btn" data-action="check" data-id="'+esc(m.id)+'" title="Verificar agora" '+(inFlight.has(m.id)?"disabled":"")+'>↻</button> <button class="mini-btn" data-action="pause" data-id="'+esc(m.id)+'">'+(m.paused?"Retomar":"Pausar")+'</button> <button class="mini-btn" data-action="external" data-id="'+esc(m.id)+'">Diagnóstico ↗</button> <button class="mini-btn" data-action="edit" data-id="'+esc(m.id)+'">Editar</button> <button class="mini-btn danger" data-action="delete" data-id="'+esc(m.id)+'" aria-label="Eliminar website">×</button></div></div></div>';
}
const empty=text=>'<div class="empty"><span class="empty-icon">◎</span>'+esc(text)+'</div>';
function render(){
 $("totalStat").textContent=state.monitors.length;
 const up=state.monitors.filter(m=>!m.paused&&m.status==="online").length;
 const down=state.monitors.filter(m=>!m.paused&&m.status==="offline").length;
 $("upStat").textContent=up;$("downStat").textContent=down;
 const latest=state.monitors.filter(m=>m.status==="online"&&Number.isFinite(m.ms)).map(m=>m.ms);
 $("latencyStat").textContent=latest.length?Math.round(latest.reduce((a,b)=>a+b,0)/latest.length)+" ms":"—";
 const monitors=state.monitors.map(monitorHtml).join("")||empty("Ainda não existem websites guardados. Adiciona o teu primeiro monitor.");
 $("overviewMonitors").innerHTML=monitors;$("websitesMonitors").innerHTML=monitors;
 $("websitesCount").textContent=state.monitors.length+" guardados neste browser";
 const historyRow=h=>'<div class="entry"><div><b class="'+(h.status==="online"?"green":h.status==="offline"?"red":"muted")+'">'+esc(h.status==="online"?"● Online":h.status==="offline"?"● HTTP 5xx":"○ Indeterminado")+'</b> · '+esc(h.name||h.url)+(Number.isInteger(h.code)?" · HTTP "+h.code:"")+(Number.isFinite(h.ms)?" · "+h.ms+" ms":"")+'</div><time>'+when(h.at)+'</time></div>';
 $("recentHistory").innerHTML=state.history.slice(0,5).map(historyRow).join("")||empty("Ainda não existem verificações.");
 $("fullHistory").innerHTML=state.history.slice(0,500).map(historyRow).join("")||empty("Ainda não existem verificações.");
 $("incidentList").innerHTML=state.incidents.map(i=>'<div class="entry"><div><b class="'+(i.end?"green":"red")+'">'+(i.end?"Recuperado":"Indisponível")+'</b> · '+esc(i.name||i.url)+'</div><time>'+when(i.start)+(i.end?" → "+when(i.end):"")+'</time></div>').join("")||empty("Sem incidentes confirmados.");
 const cards=$("periodCards");
 if(cards)cards.innerHTML=[["24 horas",86400000],["7 dias",7*86400000],["30 dias",30*86400000]].map(([name,period])=>{
  const info=summary(state.history,period);return '<div class="period"><span>'+name+'</span><strong>'+(info.uptime===null?"—":info.uptime.toFixed(1)+"%")+'</strong><small>'+info.checks+' verificações · '+(info.avgMs===null?"sem latência":info.avgMs+" ms")+'</small></div>';
 }).join("");
 const chart=$("latencyChart");
 if(chart){
   const points=state.history.filter(x=>x.status==="online"&&Number.isFinite(x.ms)).slice(0,40).reverse();
   if(points.length){
     const max=Math.max(50,...points.map(x=>x.ms));
     chart.innerHTML='<div class="latency-bars" role="img" aria-label="Gráfico de '+points.length+' medições reais de latência">'+points.map(x=>'<div class="latency-bar" style="height:'+Math.max(7,Math.round(100*x.ms/max))+'%" title="'+x.ms+' ms · '+when(x.at)+'"></div>').join("")+'</div><p class="muted small">Últimas '+points.length+' respostas online · máximo '+max+' ms</p>';
   }else chart.innerHTML=empty("Ainda não existem medições de latência.");
 }
 if($("notificationsList"))$("notificationsList").innerHTML=state.notifications.map(n=>'<div class="entry"><div>'+esc(n.message)+'</div><time>'+when(n.at)+'</time></div>').join("")||empty("Não existem notificações.");
 $("backendBanner").classList.toggle("hidden",!!state.api);
 if($("apiInput")&&page==="settings"&&document.activeElement!==$("apiInput"))$("apiInput").value=state.api;
 if($("intervalInput"))$("intervalInput").value=String(state.intervalMinutes);
}
function navigate(to){
 page=to;for(const id of ["overview","websites","history","incidents","notifications","settings"]){const el=$(id+"Page");if(el)el.classList.toggle("hidden",id!==to)}
 document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===to));
 const titles={overview:["Dashboard","Uma visão clara do estado dos teus websites."],websites:["Websites","Websites guardados e verificações manuais."],history:["Histórico","Apenas medições realmente realizadas."],incidents:["Incidentes","Falhas confirmadas e recuperações."],notifications:["Notificações","Alertas enquanto estás a utilizar o PULSE."],settings:["Definições","Dados locais, cópias de segurança e intervalos."]};
 $("pageTitle").textContent=titles[to][0];$("pageDescription").textContent=titles[to][1];
 $("addTop").classList.remove("hidden");render();window.scrollTo({top:0,behavior:"smooth"});
}
function openDialog(m=null){
 editingId=m?.id||null;$("monitorName").value=m?.name||"";$("monitorUrl").value=m?.url||"";
 $("formError").textContent="";$("addDialog").showModal();$("monitorUrl").focus();
}
function notify(item){
 if(!item)return;toast(item.message);
 if("Notification" in window&&Notification.permission==="granted"&&document.hidden){
  try{new Notification("PULSE",{body:item.message,tag:item.id})}catch{}
 }
}
async function checkOne(id,{manual=false}={}){
 const m=state.monitors.find(x=>x.id===id);if(!m||inFlight.has(id)||(!manual&&m.paused))return;
 if(!state.api){toast("A API não está configurada. Abre Definições.");return}
 inFlight.add(id);render();
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11500);
 let result={status:"unknown",code:null,ms:null};
 try{
  const response=await fetch(state.api+"/check?url="+encodeURIComponent(m.url),{signal:controller.signal,headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("O serviço respondeu HTTP "+response.status);
  const body=await response.json();
  if(!["online","offline","unknown"].includes(body.status))throw Error("Resposta inválida da API");
  result={status:body.status,code:body.code,ms:body.ms};
 }catch(e){if(manual)toast("Não foi possível verificar: "+e.message)}
 finally{
  clearTimeout(timeout);inFlight.delete(id);
  try{const note=await commit(s=>applyCheck(s,id,result));notify(note)}
  catch(e){toast("Erro a guardar verificação: "+e.message)}
  render();
 }
}
async function checkAll(){
 if(!state.api){toast("Configura a API nas Definições.");return}
 const list=state.monitors.filter(m=>!m.paused);
 for(let i=0;i<list.length;i+=3)await Promise.all(list.slice(i,i+3).map(m=>checkOne(m.id)));
}
async function removeMonitor(m){
 if(!confirm("Eliminar "+(m.name||m.url)+" e todo o seu histórico neste browser?"))return;
 try{await commit(s=>{s.monitors=s.monitors.filter(x=>x.id!==m.id);s.history=s.history.filter(x=>x.id!==m.id);s.incidents=s.incidents.filter(x=>x.id!==m.id)});toast("Website eliminado.")}
 catch(e){toast("Não foi possível eliminar: "+e.message)}
}
function schedule(){
 if(timer)clearInterval(timer);
 timer=setInterval(()=>{if(!document.hidden&&ready)checkAll()},state.intervalMinutes*60000);
}
document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>navigate(btn.dataset.page)));
$("settingsBtn").onclick=()=>navigate("settings");
$("addTop").onclick=()=>openDialog();$("closeDialog").onclick=()=>$("addDialog").close();
$("addFromSettings").onclick=()=>openDialog();
$("addForm").addEventListener("submit",async event=>{
 event.preventDefault();
 if(!ready)return;
 const submit=event.currentTarget.querySelector('[type="submit"]');
 submit.disabled=true;
 try{
  const name=$("monitorName").value.trim(),url=$("monitorUrl").value.trim();
  const previous=editingId;
  const monitor=await commit(s=>registerMonitor(s,url,name,previous));
  $("addDialog").close();navigate("websites");
  toast("✓ Website "+(previous?"atualizado":"guardado")+" neste browser.");
  if(!previous)void checkOne(monitor.id,{manual:true});
 }catch(e){$("formError").textContent=e.message}
 finally{submit.disabled=false}
});
$("quickAddForm").addEventListener("submit",async event=>{
 event.preventDefault();
 if(!ready)return;
 const input=$("quickAddUrl"),submit=event.currentTarget.querySelector('[type="submit"]');
 submit.disabled=true;$("quickAddError").textContent="";
 try{
  const monitor=await commit(s=>registerMonitor(s,input.value.trim()));
  input.value="";toast("✓ Website adicionado e guardado: "+monitor.url);
  void checkOne(monitor.id,{manual:true});
 }catch(error){$("quickAddError").textContent=error.message}
 finally{submit.disabled=false}
});
document.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-action]");if(!btn)return;
 const m=state.monitors.find(x=>x.id===btn.dataset.id);if(!m)return;
 if(btn.dataset.action==="check")return void checkOne(m.id,{manual:true});
 if(btn.dataset.action==="edit")return openDialog(m);
 if(btn.dataset.action==="delete")return void removeMonitor(m);
 if(btn.dataset.action==="external")return window.open("https://check-host.net/check-http?host="+encodeURIComponent(m.url),"_blank","noopener,noreferrer");
 if(btn.dataset.action==="pause"){
  try{await commit(s=>{const monitor=s.monitors.find(x=>x.id===m.id);monitor.paused=!monitor.paused});toast("Estado de monitorização atualizado.")}
  catch(error){toast(error.message)}
 }
});
$("checkAll").onclick=()=>void checkAll();
$("clearHistory").onclick=async()=>{
 if(!confirm("Eliminar todo o histórico de verificações?"))return;
 try{await commit(s=>{s.history=[]});toast("Histórico eliminado.")}
 catch(e){toast(e.message)}
};
if($("clearNotifications"))$("clearNotifications").onclick=async()=>{
 try{await commit(s=>{s.notifications=[]});toast("Notificações eliminadas.")}catch(e){toast(e.message)}
};
$("saveApi").onclick=async()=>{
 const value=$("apiInput").value.trim().replace(/\/+$/,"");
 if(!isWorkerAddress(value)){
  $("apiStatus").textContent="Este campo é só para um endereço .workers.dev. Para monitorizar um website, usa o botão Adicionar website.";
  toast("Não substituímos a API. Usa Adicionar website para guardar sites.");
  return;
 }
 try{
  await commit(s=>{s.api=value});
  $("apiStatus").textContent="Configuração técnica guardada.";
  toast("Servidor do PULSE atualizado.");
 }catch(error){$("apiStatus").textContent=error.message}
};
$("resetApi").onclick=async()=>{
 try{
  await commit(s=>{s.api=DEFAULT_API});
  $("apiInput").value=DEFAULT_API;
  $("apiStatus").textContent="Servidor original restaurado.";
  toast("API do PULSE restaurada.");
 }catch(error){$("apiStatus").textContent=error.message}
};
if($("intervalInput"))$("intervalInput").onchange=async e=>{
 const minutes=Number(e.target.value);
 if(![1,5,10,15,30].includes(minutes))return;
 try{await commit(s=>{s.intervalMinutes=minutes});schedule();toast("Intervalo alterado para "+minutes+" minutos.")}
 catch(error){toast(error.message)}
};
$("exportBtn").onclick=()=>{
 const backup=JSON.stringify({schema:"pulse-backup-v3",exportedAt:new Date().toISOString(),...state},null,2);
 const blob=new Blob([backup],{type:"application/json"}),url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download="pulse-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
};
$("importFile").onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>5e6)throw Error("O ficheiro é demasiado grande.");
  const data=JSON.parse(await file.text());
  if(!data||!Array.isArray(data.monitors)||data.monitors.length>20||!Array.isArray(data.history)||data.history.length>5000)throw Error("Backup inválido.");
  if(!confirm("Substituir os websites atuais pelos existentes no backup?"))return;
  const imported=hydrate({...data,api:state.api});
  await commit(s=>{const currentRevision=s.revision;Object.assign(s,imported);s.revision=currentRevision});
  toast("Backup importado com "+state.monitors.length+" websites.");navigate("websites");
 }catch(error){toast("Erro na importação: "+error.message)}
 finally{e.target.value=""}
};
if($("enableAlerts"))$("enableAlerts").onclick=async()=>{
 if(!("Notification" in window)){toast("Este browser não suporta notificações.");return}
 const permission=await Notification.requestPermission();
 toast(permission==="granted"?"Notificações do browser ativadas.":"Notificações não autorizadas.");
};
(async()=>{
 try{
  const loaded=await initializeStorage();state=loaded.state;
  let recovery={recovered:false,updated:false};
  try{recovery=await recoverMisplacedWebsite()}
  catch(error){toast("Não foi possível guardar a recuperação: "+error.message)}
  ready=true;
  setStorageMessage("Os websites são guardados neste browser, não num servidor. Em navegação anónima podem desaparecer quando fechas a sessão. Exporta uma cópia nas Definições.",!loaded.hasPersistentStore);
  if(!loaded.hasPersistentStore)toast("O browser pode estar a bloquear o armazenamento. Verifica as permissões.");
  render();schedule();
  if(recovery.recovered){
    navigate("websites");
    toast("✓ Recuperámos formacao.inem.pt e restaurámos a API do PULSE.");
  }else if(recovery.updated)toast("Restaurámos a ligação correta ao servidor do PULSE.");
 }catch(e){ready=true;setStorageMessage("Não foi possível recuperar os dados guardados. Confirma as permissões de armazenamento do browser.",true);render()}
})();
