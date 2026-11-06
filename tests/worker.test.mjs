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
