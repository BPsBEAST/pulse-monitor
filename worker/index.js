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
async function dnsCheck(host) {
  // DNS preflight is best-effort SSRF defense; it cannot pin the subsequent fetch's DNS.
  // Avoid network-level private egress without an additional external egress policy.
  const answers=[];
  for(const type of ["A","AAAA"]){
    const dns=new URL("https://cloudflare-dns.com/dns-query");
    dns.searchParams.set("name",host);dns.searchParams.set("type",type);
    const response=await fetch(dns.href,{headers:{Accept:"application/dns-json"},signal:AbortSignal.timeout(3000),redirect:"error"});
    if(!response.ok)throw Error("dns-unavailable");
    const payload=await response.json();
    if(payload.Status!==0 && payload.Status!==3)throw Error("dns-unavailable");
    for(const rr of payload.Answer||[]){
      if(rr.type===1||rr.type===28)answers.push({type:rr.type,address:rr.data});
    }
  }
  if(!answers.length || answers.length>30)throw Error("dns-unavailable");
  if(answers.some(x=>x.type===1?privateIpv4(x.address):!publicIpv6(x.address)))throw Error("unsafe-destination");
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
    if(incoming.pathname!=="/check")return json({error:"Not found"},404,origin);
    if(!env.CHECK_LIMITER)return json({error:"Rate limiter not configured"},503,origin);
    const client=request.headers.get("CF-Connecting-IP")||"unknown";
    const decision=await env.CHECK_LIMITER.limit({key:client});
    if(!decision.success)return json({error:"Too many requests"},429,origin,{"Retry-After":"60"});
    let target;
    try{target=parseTarget(incoming.searchParams.get("url"))}
    catch{return json({error:"Invalid public HTTP(S) URL"},400,origin)}
    try{await dnsCheck(target.hostname)}
    catch{return json({status:"unknown",code:null,ms:null,error:"DNS resolution failed or target rejected"},200,origin)}
    const start=Date.now();
    try{
      // No redirects. GET fallback is only used when the origin expressly rejects HEAD.
      let res=await fetch(target.href,{method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(8000)});
      if(res.status===405||res.status===501){
        res=await fetch(target.href,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(8000)});
        try{await res.body?.cancel()}catch{}
      }
      const code=res.status;
      // Redirects and anti-bot responses are unknown, not evidence of an outage.
      const status=code>=200&&code<400&&code!==304?"online":
        code>=500&&code<600?"offline":"unknown";
      return json({status,code,ms:Date.now()-start,checkedAt:new Date().toISOString()},200,origin);
    }catch{
      return json({status:"unknown",code:null,ms:Date.now()-start,
        checkedAt:new Date().toISOString(),error:"Connection or timeout failure"},200,origin);
    }
  }
};