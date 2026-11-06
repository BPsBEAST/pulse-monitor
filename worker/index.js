// PULSE check endpoint. Deploy separately with Cloudflare Wrangler.
// Security model: allow only named public HTTP(S) hosts, reject manual redirects,
// limit response time, restrict browser origins, and keep the endpoint stateless.
// A production public service should also enforce Cloudflare account-level rate limits
// and use network-level egress restrictions to protect against DNS rebinding.
const headersFor=allowed=>({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Methods":"GET, OPTIONS","Vary":"Origin"});
const json=(body,status,headers)=>new Response(JSON.stringify(body),{status,headers});
function validTarget(raw){
 const u=new URL(raw);
 if(!["https:","http:"].includes(u.protocol)||u.username||u.password||u.port)throw Error("Invalid scheme or port");
 let host=u.hostname.toLowerCase().replace(/\.$/,"");
 if(!host||host.length>253||!host.includes(".")||host.includes("..")||host==="localhost"||/\.(local|localhost|internal|test|invalid|example|onion)$/.test(host))throw Error("Invalid hostname");
 if(!/^[a-z0-9.-]+$/.test(host)||host.split(".").some(p=>!p||p.length>63||p.startsWith("-")||p.endsWith("-")))throw Error("Invalid hostname");
 // Reject IPv4, IPv6, shorthand numeric IPs and hexadecimal/octal labels.
 if(/^\d+(\.\d+)*$/.test(host)||/(^|\.)0x[0-9a-f]+(\.|$)/.test(host)||/^\[/.test(host)||/^\d+\./.test(host))throw Error("IP targets are disabled");
 if(u.href.length>2048)throw Error("URL too long");
 u.hash="";
 return u;
}
export default {
 async fetch(request,env){
  const allowed=env.ALLOWED_ORIGIN;
  const origin=request.headers.get("Origin");
  const h=headersFor(allowed||"null");
  if(request.method==="OPTIONS"){
   if(!allowed||origin!==allowed)return json({error:"Forbidden"},403,h);
   return new Response(null,{status:204,headers:h});
  }
  if(!allowed||origin!==allowed)return json({error:"Forbidden"},403,h);
  if(request.method!=="GET")return json({error:"Method not allowed"},405,h);
  const requestUrl=new URL(request.url);
  if(requestUrl.pathname!=="/check")return json({error:"Not found"},404,h);
  let target;
  try{target=validTarget(requestUrl.searchParams.get("url")||"")}
  catch{return json({error:"Invalid public HTTP(S) URL"},400,h)}
  const started=Date.now();
  try{
   const response=await fetch(target.href,{
    method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(8000),
    headers:{"User-Agent":"PULSE-UptimeMonitor/0.1"}
   });
   const ms=Date.now()-started;
   // 2xx/3xx except redirect:manual; 4xx/5xx are confirmed HTTP responses
   // and counted as an offline HTTP outcome for this MVP.
   const code=response.status;
   const status=(code>=200&&code<400)?"online":"offline";
   return json({status,code,ms,checkedAt:new Date().toISOString()},200,h);
  }catch(e){
   // Network failures and blocked connections are indeterminate, not confirmed offline.
   return json({status:"unknown",code:null,ms:Date.now()-started,checkedAt:new Date().toISOString()},200,h);
  }
 }
};