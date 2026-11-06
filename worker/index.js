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
 const req=new URL("https://cloudflare-dns.com/dns-query");
 req.searchParams.set("name",host);req.searchParams.set("type",type);
 const response=await fetch(req.href,{headers:{Accept:"application/dns-json"},signal:AbortSignal.timeout(3000),redirect:"error"});
 if(!response.ok)throw Error("dns-unavailable");
 const payload=await response.json();
 if(![0,3].includes(payload.Status))throw Error("dns-unavailable");
 return Array.isArray(payload.Answer)?payload.Answer.slice(0,30):[];
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
async function probeHttp(target,withHeaders=false){
 const started=Date.now();
 try{
  const options={method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(8000)};
  let res=await fetch(target.href,options);
  if([405,501].includes(res.status)){
   res=await fetch(target.href,{...options,method:"GET"});
   try{await res.body?.cancel()}catch{}
  }
  const code=res.status,ms=Date.now()-started;
  const status=code>=200&&code<300?"online":code>=500&&code<600?"offline":"unknown";
  const output={status,code,ms,checkedAt:new Date().toISOString()};
  if(withHeaders){
   const selected={};
   for(const key of ["content-type","server","cache-control","content-length","strict-transport-security"]){
    const value=res.headers.get(key);if(value)selected[key]=value.slice(0,150);
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
    if(!["/check","/diagnostics"].includes(incoming.pathname))return json({error:"Not found"},404,origin);
    if(!env.CHECK_LIMITER)return json({error:"Rate limiter not configured"},503,origin);
    const client=request.headers.get("CF-Connecting-IP")||"unknown";
    const decision=await env.CHECK_LIMITER.limit({key:client});
    if(!decision.success)return json({error:"Too many requests"},429,origin,{"Retry-After":"60"});
    let target;
    try{target=parseTarget(incoming.searchParams.get("url"))}
    catch{return json({error:"Invalid public HTTP(S) URL"},400,origin)}
    let basic;
    try{basic=await dnsCheck(target.hostname)}
    catch{return json({status:"unknown",code:null,ms:null,error:"DNS resolution failed or target rejected"},200,origin)}
    if(incoming.pathname==="/check")return json(await probeHttp(target),200,origin);
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