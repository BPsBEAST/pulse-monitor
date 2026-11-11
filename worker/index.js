const CORS_METHODS = "GET, OPTIONS";
const json = (data, status, origin, extra={}) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":CORS_METHODS,
  "Access-Control-Allow-Headers":"Content-Type","Vary":"Origin","X-Content-Type-Options":"nosniff",...extra}
});
function parseTarget(input) {
  if (typeof input!=="string" || input.length>2048) throw Error("invalid-url");
  const url=new URL(input);
  if (!["http:","https:"].includes(url.protocol) || url.username || url.password ||
      url.port || url.hostname.length>253) throw Error("invalid-url");
  const hostname=url.hostname.toLowerCase().replace(/\.$/,"");
  if(!hostname.includes(".") || !/^[a-z0-9.-]+$/.test(hostname) ||
     hostname.split(".").some(x=>!x || x.length>63 || x.startsWith("-") || x.endsWith("-")) ||
     /\.(local|localhost|internal|test|invalid|example|onion|home|lan|arpa)$/.test(hostname) ||
     /^(localhost|metadata|metadata\.google\.internal)$/.test(hostname) ||
     /^\d+(?:\.\d+)*$/.test(hostname) || /^\d+\./.test(hostname) ||
     /(^|\.)0x[0-9a-f]+(\.|$)/.test(hostname)) throw Error("invalid-url");
  url.hash="";url.hostname=hostname;
  return url;
}
function privateIpv4(address) {
  const parts=address.split(".").map(Number);
  if(parts.length!==4 || parts.some(x=>!Number.isInteger(x)||x<0||x>255))return true;
  const [a,b,c]=parts;
  return a===0||a===10||a===127||a>=224||a===169&&b===254||
    a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&c===0||b===0&&c===2||
    b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&b>=18&&b<=19||
    a===198&&b===51&&c===100||a===203&&b===0&&c===113||a===192&&b===0&&c===0;
}
function publicIpv6(address) {
  const value=address.toLowerCase();
  if(!/^[0-9a-f:]+$/.test(value) || !value.includes(":"))return false;
  // Permit only ordinary globally routable unicast (2000::/3). Deny IPv4 mapping/tunnels
  // and special-purpose addresses, rather than trying to resolve internal equivalents.
  const first=parseInt(value.split(":")[0]||"0",16);
  return first>=0x2000&&first<=0x3fff && !value.startsWith("2001:db8:") &&
    !value.startsWith("2001:0:") && !value.startsWith("2002:") &&
    !value.startsWith("2001:20:") && !value.startsWith("2001:2:");
}
async function lookupDns(host,type){
 // The Cloudflare DoH endpoint may refuse requests originating from Workers.
 // Use Google's documented JSON DNS API, with a separate DoH provider as fallback.
 const providers=[
  {base:"https://dns.google/resolve",headers:{Accept:"application/json"}},
  {base:"https://cloudflare-dns.com/dns-query",headers:{Accept:"application/dns-json"}}
 ];
 for(const provider of providers){
  try{
   const req=new URL(provider.base);
   req.searchParams.set("name",host);req.searchParams.set("type",type);
   const response=await fetch(req.href,{headers:provider.headers,signal:AbortSignal.timeout(2500),redirect:"manual"});
   if(!response.ok)continue;
   const payload=await response.json();
   if(![0,3].includes(payload.Status))continue;
   return Array.isArray(payload.Answer)?payload.Answer.slice(0,30):[];
  }catch{}
 }
 throw Error("dns-unavailable");
}
function checkDnsAddresses(records){
 const addresses=records.filter(x=>x&&[1,28].includes(x.type));
 if(!addresses.length||addresses.length>30)throw Error("dns-unavailable");
 if(addresses.some(x=>x.type===1?privateIpv4(x.data):!publicIpv6(x.data)))throw Error("unsafe-destination");
 return addresses;
}
async function dnsCheck(host){
 const [a,aaaa]=await Promise.all([lookupDns(host,"A"),lookupDns(host,"AAAA")]);
 const addresses=checkDnsAddresses([...a,...aaaa]);
 return {a,aaaa,addresses};
}
const dnsTypeName=type=>({1:"A",28:"AAAA",5:"CNAME",15:"MX",2:"NS"})[type]||null;
async function dnsDetails(host,basic){
 const types=["CNAME","MX","NS"];
 const results=await Promise.allSettled(types.map(type=>lookupDns(host,type)));
 const records=[...basic.a,...basic.aaaa];
 for(const result of results){if(result.status==="fulfilled")records.push(...result.value)}
 const seen=new Set();
 return records.filter(x=>dnsTypeName(x.type)).map(rr=>({
  type:dnsTypeName(rr.type),value:String(rr.data??"").slice(0,300),
  ttl:Number.isInteger(rr.TTL)?Math.min(86400,Math.max(0,rr.TTL)):null
 })).filter(rr=>{const key=rr.type+"|"+rr.value;if(seen.has(key))return false;seen.add(key);return true}).slice(0,50);
}
function validatePublicIP(input){
 const value=String(input||"").trim();
 if(!value||value.length>45)throw Error("invalid-ip");
 if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)){
  if(privateIpv4(value))throw Error("unsafe-ip");
  return {ip:value,family:4,query:value.split(".").reverse().join(".")+".origin.asn.cymru.com"};
 }
 if(!/^[0-9a-f:]+$/i.test(value)||!value.includes(":"))throw Error("invalid-ip");
 let parts=value.toLowerCase().split("::");
 if(parts.length>2)throw Error("invalid-ip");
 const left=parts[0]?parts[0].split(":"):[],right=parts.length===2&&parts[1]?parts[1].split(":"):[];
 if([...left,...right].some(x=>!x||x.length>4||!/^[0-9a-f]+$/.test(x)))throw Error("invalid-ip");
 const zeros=8-left.length-right.length;
 if(zeros<0||(parts.length===1&&zeros!==0)||(parts.length===2&&zeros<1))throw Error("invalid-ip");
 const groups=[...left,...Array(zeros).fill("0"),...right].map(x=>x.padStart(4,"0"));
 const normalized=groups.join(":");
 if(!publicIpv6(normalized))throw Error("unsafe-ip");
 return {ip:value,family:6,query:groups.join("").split("").reverse().join(".")+".origin6.asn.cymru.com"};
}
function txtString(data){
 return String(data||"").replace(/"\s+"/g,"").replace(/^"|"$/g,"").slice(0,500);
}
async function ipOwnership(raw){
 const target=validatePublicIP(raw);
 const origin=await lookupDns(target.query,"TXT");
 const txt=origin.find(x=>x.type===16);
 if(!txt)return {ip:target.ip,family:target.family,found:false};
 const parts=txtString(txt.data).split("|").map(x=>x.trim());
 const asn=/^\d+(?:\s+\d+)*$/.test(parts[0]||"")?parts[0]:null;
 let organization=null;
 if(asn){
  const nameResult=await lookupDns("AS"+asn.split(" ")[0]+".asn.cymru.com","TXT").catch(()=>[]);
  const nameTxt=nameResult.find(x=>x.type===16);
  if(nameTxt)organization=txtString(nameTxt.data).split("|").slice(4).join("|").trim().slice(0,180)||null;
 }
 return {ip:target.ip,family:target.family,found:true,
  asn,prefix:(parts[1]||"").slice(0,65),country:(parts[2]||"").slice(0,8),
  registry:(parts[3]||"").slice(0,30),allocated:(parts[4]||"").slice(0,40),
  organization,source:"Team Cymru IP-to-ASN DNS (dados de encaminhamento BGP)"};
}
async function probeHttp(target,withHeaders=false,forSecurity=false){
 const started=Date.now();
 try{
  const options={method:forSecurity?"GET":"HEAD",redirect:"manual",signal:AbortSignal.timeout(8000)};
  let res=await fetch(target.href,options);
  if([403,405,501].includes(res.status) || (res.status>=500&&res.status<600)){
   res=await fetch(target.href,{...options,method:"GET"});
   try{await res.body?.cancel()}catch{}
  }
  if(forSecurity)try{await res.body?.cancel()}catch{}
  const code=res.status,ms=Date.now()-started;
  const status=code>=200&&code<300?"online":code>=500&&code<600?"offline":"unknown";
  const output={status,code,ms,checkedAt:new Date().toISOString()};
  if(withHeaders){
   const selected={};
   for(const key of (forSecurity?["content-type","strict-transport-security","content-security-policy","x-frame-options","x-content-type-options","referrer-policy","permissions-policy","cross-origin-opener-policy"]:["content-type","server","cache-control","content-length","strict-transport-security"])){
    const value=res.headers.get(key);if(value)selected[key]=value.slice(0,forSecurity?1200:150);
   }
   output.headers=selected;
   // Do not follow redirects or return query strings that may contain tokens.
   const location=res.headers.get("location");
   if(location&&code>=300&&code<400){
    try{const redirect=new URL(location,target);output.redirectHost=redirect.hostname.slice(0,253)}
    catch{output.redirectHost=null}
   }
  }
  return output;
 }catch{return {status:"unknown",code:null,ms:Date.now()-started,
  checkedAt:new Date().toISOString(),error:"Connection or timeout failure"}}
}


/**
 * Passive security snapshot: one HTTP request to the user-supplied public URL,
 * no redirects, brute-force, port scans, cookies, credentials or page parsing.
 * A missing header is an observation, not proof of exploitation.
 */
function securityReport(target,http) {
  const checkedAt=new Date().toISOString();
  const report={
    hostname:target.hostname,protocol:target.protocol.slice(0,-1),
    checkedAt,http:{status:http.status,code:http.code,ms:http.ms,redirectHost:http.redirectHost||null},
    score:null,coverage:0,grade:null,checks:[],
    limitations:[
      "Pontuação indicativa de configuração HTTP, não certificação nem teste de intrusão.",
      "O Worker não revela a validade, emissor ou versão TLS do certificado remoto.",
      "Não foram analisadas dependências, código, páginas autenticadas ou cookies de sessão.",
      "Os cabeçalhos observados numa resposta podem diferir entre páginas ou utilizadores."
    ]
  };
  if(http.status!=="online"){
    report.reason=http.redirectHost
      ?"O servidor redirecionou para outro endereço. Não seguimos redirecionamentos; analisa diretamente o URL HTTPS final."
      :"Não foi possível obter uma resposta HTTP 2xx para uma análise fiável.";
    return report;
  }
  const h=http.headers||{},c=report.checks;
  const check=(id,name,status,detail,recommendation,weight)=>
    c.push({id,name,status,detail,recommendation,weight});
  const html=/(?:text\/html|application\/xhtml\+xml)/i.test(h["content-type"]||"");
  const csp=h["content-security-policy"]||"";
  const hsts=h["strict-transport-security"]||"";
  const isHttps=target.protocol==="https:";
  check("https","Ligação HTTPS",isHttps?"pass":"fail",
    isHttps?"Ligação HTTPS estabelecida através do Worker.":"O website foi consultado por HTTP sem encriptação.",
    "Disponibilizar o website através de HTTPS com um certificado válido.",25);
  const maxAge=hsts.match(/(?:^|;)\s*max-age\s*=\s*(\d+)/i);
  check("hsts","HTTP Strict Transport Security",
    !isHttps?"not_checked":!hsts?"warning":maxAge&&Number(maxAge[1])>=15552000?"pass":"warning",
    !isHttps?"Não aplicável à resposta HTTP.":hsts?"Política declarada: "+hsts.slice(0,150):"Cabeçalho HSTS ausente.",
    "Configurar Strict-Transport-Security no HTTPS com max-age adequado após validar os subdomínios.",20);
  check("csp","Content Security Policy",
    !html?"not_checked":!csp?"warning":/\bunsafe-inline\b|\bunsafe-eval\b/i.test(csp)?"warning":"pass",
    !html?"Não avaliado: resposta sem Content-Type HTML confirmado.":!csp?"Cabeçalho Content-Security-Policy ausente.":/\bunsafe-inline\b|\bunsafe-eval\b/i.test(csp)?"CSP encontrada, mas inclui exceções unsafe-inline/unsafe-eval.":"CSP presente sem exceções unsafe-inline/unsafe-eval detetadas.",
    "Definir uma CSP específica para a aplicação, preferindo nonces ou hashes e evitando origens demasiado permissivas.",20);
  const frameAncestors=/(?:^|;)\s*frame-ancestors\s+[^;]+/i.test(csp);
  const xfo=(h["x-frame-options"]||"").trim().toUpperCase();
  check("framing","Proteção contra clickjacking",
    !html?"not_checked":frameAncestors||["DENY","SAMEORIGIN"].includes(xfo)?"pass":"warning",
    !html?"Não avaliado: não foi confirmado conteúdo HTML.":frameAncestors?"Diretiva frame-ancestors presente na CSP.":xfo?"X-Frame-Options: "+xfo:"Sem frame-ancestors ou X-Frame-Options válido.",
    "Adicionar frame-ancestors à CSP ou X-Frame-Options adequado.",10);
  const nosniff=(h["x-content-type-options"]||"").trim().toLowerCase()==="nosniff";
  check("nosniff","X-Content-Type-Options",nosniff?"pass":"warning",
    nosniff?"Cabeçalho nosniff presente.":"Cabeçalho nosniff ausente ou inválido.",
    "Definir X-Content-Type-Options: nosniff.",10);
  const ref=(h["referrer-policy"]||"").toLowerCase().split(",").map(v=>v.trim()).filter(Boolean).at(-1);
  check("referrer","Referrer-Policy",
    !ref?"warning":["no-referrer","same-origin","strict-origin","strict-origin-when-cross-origin"].includes(ref)?"pass":"warning",
    ref?"Política observada: "+ref:"Cabeçalho Referrer-Policy ausente.",
    "Usar strict-origin-when-cross-origin ou uma política mais restritiva adequada.",10);
  check("permissions","Permissions-Policy",!html?"not_checked":h["permissions-policy"]?"pass":"warning",
    !html?"Não avaliado: não foi confirmado conteúdo HTML.":h["permissions-policy"]?"Cabeçalho Permissions-Policy presente.":"Cabeçalho Permissions-Policy ausente.",
    "Definir permissões explícitas para recursos sensíveis como camera, microphone e geolocation.",5);
  const total=c.filter(x=>x.status!=="not_checked").reduce((n,x)=>n+x.weight,0);
  const earned=c.filter(x=>x.status==="pass").reduce((n,x)=>n+x.weight,0);
  report.coverage=total;
  if(total>=50){
    report.score=Math.round(earned*100/total);
    report.grade=report.score>=90?"Excelente":report.score>=75?"Bom":report.score>=50?"A melhorar":"Fraco";
  }
  return report;
}

export default {
  async fetch(request,env) {
    const origin=env.ALLOWED_ORIGIN||"null";
    const incomingOrigin=request.headers.get("Origin");
    if(incomingOrigin!==origin || origin==="null")return json({error:"Forbidden"},403,origin);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":CORS_METHODS,
      "Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"}});
    if(request.method!=="GET")return json({error:"Method not allowed"},405,origin);
    const incoming=new URL(request.url);
    if(incoming.pathname==="/health")return json({service:"PULSE",version:"0.8",status:"ok"},200,origin);
    if(!["/check","/diagnostics","/ip-info","/security"].includes(incoming.pathname))return json({error:"Not found"},404,origin);
    if(!env.CHECK_LIMITER)return json({error:"Rate limiter not configured"},503,origin);
    const client=request.headers.get("CF-Connecting-IP")||"unknown";
    const decision=await env.CHECK_LIMITER.limit({key:client});
    if(!decision.success)return json({error:"Too many requests"},429,origin,{"Retry-After":"60"});
    if(incoming.pathname==="/ip-info"){
      try{return json(await ipOwnership(incoming.searchParams.get("ip")),200,origin)}
      catch(error){
       if(error.message==="unsafe-ip")return json({error:"Esse endereço IP é privado, reservado ou não pode ser consultado."},400,origin);
       if(error.message==="invalid-ip")return json({error:"Introduz um endereço IPv4 ou IPv6 válido."},400,origin);
       return json({error:"O serviço de consulta de rede está temporariamente indisponível."},503,origin,{"Retry-After":"30"});
      }
    }
    let target;
    try{target=parseTarget(incoming.searchParams.get("url"))}
    catch{return json({error:"Invalid public HTTP(S) URL"},400,origin)}
    let basic;
    try{basic=await dnsCheck(target.hostname)}
    catch{return incoming.pathname==="/security"?json({error:"O DNS não pôde ser validado ou o destino não é permitido para análise."},422,origin):json({status:"unknown",code:null,ms:null,error:"DNS resolution failed or target rejected"},200,origin)}
    if(incoming.pathname==="/check")return json(await probeHttp(target),200,origin);
    if(incoming.pathname==="/security")return json(securityReport(target,await probeHttp(target,true,true)),200,origin);
    const [records,http]=await Promise.all([dnsDetails(target.hostname,basic),probeHttp(target,true)]);
    return json({
      hostname:target.hostname,protocol:target.protocol.slice(0,-1),
      ips:basic.addresses.map(x=>String(x.data)).slice(0,30),
      dns:records,http,
      tls:{supported:false,reason:"Os detalhes do certificado remoto não estão disponíveis neste Worker."},
      checkedAt:new Date().toISOString()
    },200,origin);
  }
};