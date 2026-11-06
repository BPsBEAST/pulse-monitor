import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("../worker/index.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const ORIGIN="https://bpsbeast.github.io";
const API="https://pulse-monitor.example.workers.dev/check?url="+encodeURIComponent("https://example.com/");
const env={ALLOWED_ORIGIN:ORIGIN,CHECK_LIMITER:{limit:async()=>({success:true})}};
const makeRequest=(url=API,origin=ORIGIN)=>new Request(url,{headers:{"Origin":origin}});
async function withMock(response,run){
 const saved=globalThis.fetch;
 globalThis.fetch=async (url,options)=>{
  if(String(url).startsWith("https://cloudflare-dns.com/dns-query")){
   const type=new URL(url).searchParams.get("type");
   return new Response(JSON.stringify({Status:0,Answer:type==="A"?[{type:1,data:"93.184.215.14"}]:[{type:28,data:"2606:2800:220:1:248:1893:25c8:1946"}]}),{status:200});
  }
  return response(url,options);
 };
 try{return await run()}finally{globalThis.fetch=saved}
}
test("rejects calls from an untrusted origin",async()=>{
 const response=await worker.fetch(makeRequest(API,"https://untrusted.example"),env);
 assert.equal(response.status,403);
});
test("rejects private IP targets",async()=>{
 const u="https://pulse-monitor.example.workers.dev/check?url="+encodeURIComponent("http://127.0.0.1/");
 const response=await worker.fetch(makeRequest(u),env);
 assert.equal(response.status,400);
});
test("rate limiting responds with 429",async()=>{
 const response=await worker.fetch(makeRequest(),{...env,CHECK_LIMITER:{limit:async()=>({success:false})}});
 assert.equal(response.status,429);
});
test("HTTP 200 is online and exposes latency",()=>withMock(async()=>new Response(null,{status:200}),async()=>{
 const response=await worker.fetch(makeRequest(),env);
 const result=await response.json();
 assert.equal(result.status,"online");assert.equal(result.code,200);
 assert.ok(Number.isFinite(result.ms));
}));
test("HTTP 503 indicates offline",()=>withMock(async()=>new Response(null,{status:503}),async()=>{
 const result=await (await worker.fetch(makeRequest(),env)).json();
 assert.equal(result.status,"offline");assert.equal(result.code,503);
}));
test("HTTP 403 is unknown, not confirmed offline",()=>withMock(async()=>new Response(null,{status:403}),async()=>{
 const result=await (await worker.fetch(makeRequest(),env)).json();
 assert.equal(result.status,"unknown");
}));
test("HEAD unsupported falls back to GET",()=>withMock(async(_url,options)=>new Response(null,{status:options.method==="HEAD"?405:200}),async()=>{
 const result=await (await worker.fetch(makeRequest(),env)).json();
 assert.equal(result.status,"online");
}));
test("redirects are not followed",()=>withMock(async()=>new Response(null,{status:302,headers:{Location:"http://127.0.0.1/"}}),async()=>{
 const result=await (await worker.fetch(makeRequest(),env)).json();
 assert.equal(result.status,"unknown");assert.equal(result.code,302);
}));
test("missing limiter fails closed",async()=>{
 const result=await worker.fetch(makeRequest(),{ALLOWED_ORIGIN:ORIGIN});
 assert.equal(result.status,503);
});

test("diagnostics returns DNS records, public IPs and HTTP status",()=>withMock(async()=>new Response(null,{status:200,headers:{"content-type":"text/html","server":"test-server"}}),async()=>{
 const url="https://pulse-monitor.example.workers.dev/diagnostics?url="+encodeURIComponent("https://example.com");
 const response=await worker.fetch(makeRequest(url),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.hostname,"example.com");
 assert.ok(body.ips.includes("93.184.215.14"));
 assert.equal(body.http.status,"online");
 assert.equal(body.http.code,200);
 assert.equal(body.http.headers["content-type"],"text/html");
 assert.equal(body.tls.supported,false);
}));
test("diagnostics rejects private IPs before DNS or probing",async()=>{
 const u="https://pulse-monitor.example.workers.dev/diagnostics?url="+encodeURIComponent("http://127.0.0.1");
 const response=await worker.fetch(makeRequest(u),env);
 assert.equal(response.status,400);
});
test("redirects remain unknown in diagnostics",()=>withMock(async()=>new Response(null,{status:302,headers:{"location":"http://127.0.0.1/secret?token=private"}}),async()=>{
 const url="https://pulse-monitor.example.workers.dev/diagnostics?url="+encodeURIComponent("https://example.com");
 const body=await (await worker.fetch(makeRequest(url),env)).json();
 assert.equal(body.http.status,"unknown");
 assert.equal(body.http.redirectHost,"127.0.0.1");
 assert.ok(!JSON.stringify(body).includes("token=private"));
}));

test("passive public IP lookup returns ASN without connecting to the IP",async()=>{
 const original=globalThis.fetch;let calls=[];
 globalThis.fetch=async(url)=>{
  calls.push(String(url));
  const dns=new URL(url),name=dns.searchParams.get("name");
  const data=name?.includes("origin.asn.cymru.com")
   ?[{type:16,data:'"13335 | 1.1.1.0/24 | AU | apnic | 2011-08-11"'}]
   :[{type:16,data:'"13335 | US | arin | 2010-07-14 | CLOUDFLARENET"'}];
  return new Response(JSON.stringify({Status:0,Answer:data}),{status:200});
 };
 try{
  const url="https://pulse-monitor.example.workers.dev/ip-info?ip=1.1.1.1";
  const response=await worker.fetch(makeRequest(url),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ip,"1.1.1.1");
  assert.equal(body.asn,"13335");
  assert.equal(body.prefix,"1.1.1.0/24");
  assert.equal(body.organization,"CLOUDFLARENET");
  assert.ok(calls.every(u=>u.startsWith("https://cloudflare-dns.com/dns-query")));
 }finally{globalThis.fetch=original}
});
test("private IP lookups are blocked before external queries",async()=>{
 for(const ip of ["127.0.0.1","10.2.3.4","192.168.0.1","169.254.169.254","::1","fc00::1"]){
  const url="https://pulse-monitor.example.workers.dev/ip-info?ip="+encodeURIComponent(ip);
  const response=await worker.fetch(makeRequest(url),env);
  assert.equal(response.status,400,ip);
 }
});
