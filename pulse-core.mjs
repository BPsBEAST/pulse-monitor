export const DEFAULT_API="https://pulse-monitor.brunofranciscospinto.workers.dev";
export const MAX_MONITORS=20;
export const MAX_CHECKS=5000;
export const EMPTY=()=>({version:3,revision:0,monitors:[],history:[],incidents:[],notifications:[],api:DEFAULT_API,intervalMinutes:5});
const INVALID_SUFFIX=/\.(localhost|local|internal|test|invalid|example|onion|home|lan|arpa)$/i;
export function normalizeUrl(input){
  if(typeof input!=="string"||input.length>2048)throw Error("Endereço inválido ou demasiado longo.");
  let u;try{u=new URL(input.trim())}catch{throw Error("Introduz um URL completo, por exemplo https://exemplo.pt")}
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.port)throw Error("Usa HTTP ou HTTPS, sem credenciais nem portas personalizadas.");
  const host=u.hostname.toLowerCase().replace(/\.$/,"");
  if(!host.includes(".")||! /^[a-z0-9.-]+$/.test(host)||INVALID_SUFFIX.test(host)||/^(localhost|metadata)$/i.test(host)|| /^\d/.test(host) || host.split(".").some(label=>!label||label.length>63||label[0]==="-"||label.endsWith("-")))throw Error("Só são aceites domínios públicos.");
  u.hostname=host;u.hash="";
  return u.href;
}
export function sanitizeMonitor(value){
  if(!value||typeof value!=="object")return null;
  try{
    const url=normalizeUrl(value.url);
    return {id:typeof value.id==="string"&&value.id.length<150?value.id:crypto.randomUUID(),url,name:String(value.name||"").slice(0,60),status:["online","offline","unknown"].includes(value.status)?value.status:"unknown",ms:Number.isFinite(value.ms)?value.ms:null,checkedAt:Number.isFinite(value.checkedAt)?value.checkedAt:null,paused:!!value.paused,pendingStatus:value.pendingStatus||null,pendingCount:Math.min(2,Math.max(0,Number(value.pendingCount)||0))};
  }catch{return null}
}
export function hydrate(raw){
  const result=EMPTY();
  if(!raw||typeof raw!=="object")return result;
  result.revision=Number.isFinite(raw.revision)?raw.revision:0;
  const ids=new Set(),urls=new Set();
  for(const item of Array.isArray(raw.monitors)?raw.monitors:[]){
    const m=sanitizeMonitor(item);
    if(!m||ids.has(m.id)||urls.has(m.url))continue;
    result.monitors.push(m);ids.add(m.id);urls.add(m.url);
    if(result.monitors.length===MAX_MONITORS)break;
  }
  result.history=(Array.isArray(raw.history)?raw.history:[]).filter(x=>x&&ids.has(x.id)&&Number.isFinite(x.at)).slice(0,MAX_CHECKS);
  result.incidents=(Array.isArray(raw.incidents)?raw.incidents:[]).filter(x=>x&&ids.has(x.id)&&Number.isFinite(x.start)).slice(0,250);
  result.notifications=(Array.isArray(raw.notifications)?raw.notifications:[]).filter(x=>x&&typeof x.message==="string").slice(0,100);
  if(typeof raw.api==="string"&&/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(raw.api))result.api=raw.api.replace(/\/$/,"");
  if([1,5,10,15,30].includes(raw.intervalMinutes))result.intervalMinutes=raw.intervalMinutes;
  return result;
}
export function registerMonitor(state,url,name="",id){
  const normalized=normalizeUrl(url);
  if(state.monitors.some(x=>x.url===normalized&&x.id!==id))throw Error("Este website já foi adicionado.");
  if(!id&&state.monitors.length>=MAX_MONITORS)throw Error("Limite de 20 websites nesta versão.");
  if(id){
    const m=state.monitors.find(x=>x.id===id);
    if(!m)throw Error("Este website já não existe.");
    if(m.url!==normalized){m.status="unknown";m.ms=null;m.checkedAt=null;m.pendingStatus=null;m.pendingCount=0;}
    m.url=normalized;m.name=String(name).trim().slice(0,60);
    return m;
  }
  const m=sanitizeMonitor({id:crypto.randomUUID(),url:normalized,name:String(name).trim()});
  state.monitors.unshift(m);return m;
}
export function applyCheck(state,id,result,at=Date.now()){
  const monitor=state.monitors.find(x=>x.id===id);
  if(!monitor)return null;
  const status=["online","offline","unknown"].includes(result?.status)?result.status:"unknown";
  const code=Number.isInteger(result?.code)?result.code:null;
  const ms=Number.isFinite(result?.ms)?result.ms:null;
  state.history.unshift({id,url:monitor.url,name:monitor.name,status,code,ms,at});
  state.history.length=Math.min(state.history.length,MAX_CHECKS);
  monitor.checkedAt=at;monitor.ms=ms;
  if(status==="unknown"){monitor.pendingStatus=null;monitor.pendingCount=0;return null}
  if(status===monitor.status){monitor.pendingStatus=null;monitor.pendingCount=0;return null}
  monitor.pendingCount=monitor.pendingStatus===status?monitor.pendingCount+1:1;
  monitor.pendingStatus=status;
  const required=(status==="offline"||monitor.status==="offline")?2:1;
  if(monitor.pendingCount<required)return null;
  const old=monitor.status;monitor.status=status;monitor.pendingStatus=null;monitor.pendingCount=0;
  let message=null;
  if(status==="offline"){
    state.incidents.unshift({id,url:monitor.url,name:monitor.name,start:at,end:null});
    message=(monitor.name||new URL(monitor.url).hostname)+" ficou indisponível.";
  }else if(old==="offline"){
    const incident=state.incidents.find(x=>x.id===id&&!x.end);
    if(incident)incident.end=at;
    message=(monitor.name||new URL(monitor.url).hostname)+" voltou a estar online.";
  }
  if(message){const item={id:crypto.randomUUID(),at,message,read:false};
    state.notifications.unshift(item);state.notifications=state.notifications.slice(0,100);
    return item;
  }
  return null;
}
export function summary(history,periodMs,now=Date.now()){
  const measured=history.filter(h=>now-h.at<=periodMs&&["online","offline"].includes(h.status));
  const online=measured.filter(h=>h.status==="online").length;
  const responseTimes=measured.filter(h=>h.status==="online"&&Number.isFinite(h.ms)).map(h=>h.ms);
  return {checks:measured.length,uptime:measured.length?100*online/measured.length:null,avgMs:responseTimes.length?Math.round(responseTimes.reduce((a,b)=>a+b,0)/responseTimes.length):null};
}
