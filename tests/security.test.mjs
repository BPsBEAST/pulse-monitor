import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../worker/index.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const ORIGIN="https://bpsbeast.github.io";
const env={ALLOWED_ORIGIN:ORIGIN,CHECK_LIMITER:{limit:async()=>({success:true})}};
const endpoint=url=>"https://pulse-monitor.example.workers.dev/security?url="+encodeURIComponent(url);
const request=url=>new Request(endpoint(url),{headers:{Origin:ORIGIN}});
async function withResponse(makeResponse,run){
 const original=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{
  const address=String(url);
  if(address.startsWith("https://dns.google/resolve")||address.startsWith("https://cloudflare-dns.com/dns-query")){
   const type=new URL(address).searchParams.get("type");
   return new Response(JSON.stringify({Status:0,Answer:type==="A"?[{type:1,data:"93.184.215.14"}]:[]}),{status:200});
  }
  requests.push({url:address,method:options?.method,redirect:options?.redirect});
  return makeResponse(url,options);
 };
 try{return await run(requests)}finally{globalThis.fetch=original}
}
test("HTTPS with strong security headers scores 100 using observed evidence",()=>withResponse(
 ()=>new Response("<html></html>",{status:200,headers:{
  "content-type":"text/html",
  "strict-transport-security":"max-age=31536000; includeSubDomains",
  "content-security-policy":"default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options":"nosniff",
  "referrer-policy":"strict-origin-when-cross-origin",
  "permissions-policy":"camera=(), microphone=()"
 }}),async requests=>{
  const response=await worker.fetch(request("https://example.com/"),env),data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.hostname,"example.com");
  assert.equal(data.score,100);assert.equal(data.grade,"Excelente");
  assert.equal(data.coverage,100);
  assert.equal(data.checks.length,7);
  assert.ok(data.checks.every(c=>c.status==="pass"));
  assert.deepEqual(requests,[{url:"https://example.com/",method:"GET",redirect:"manual"}]);
  assert.equal(data.http.code,200);
  assert.ok(data.limitations.some(x=>x.includes("TLS")));
 }));
test("missing security headers yield improvement recommendations, not imaginary passes",()=>withResponse(
 ()=>new Response("<html></html>",{status:200,headers:{"content-type":"text/html"}}),async()=>{
  const data=await (await worker.fetch(request("https://example.com/"),env)).json();
  assert.equal(data.score,25);
  assert.equal(data.grade,"Fraco");
  assert.ok(data.checks.filter(x=>x.status==="warning").length>=5);
  assert.ok(data.checks.every(x=>typeof x.recommendation==="string"&&x.recommendation.length>5));
 }));
test("HTTP transport is marked insecure and HSTS remains not checked",()=>withResponse(
 ()=>new Response("<html></html>",{status:200,headers:{"content-type":"text/html"}}),async()=>{
  const data=await (await worker.fetch(request("http://example.com/"),env)).json();
  assert.equal(data.checks.find(x=>x.id==="https").status,"fail");
  assert.equal(data.checks.find(x=>x.id==="hsts").status,"not_checked");
  assert.equal(data.score,0);
  assert.equal(data.coverage,80);
 }));
test("redirects are not followed and do not receive invented scores",()=>withResponse(
 ()=>new Response(null,{status:302,headers:{location:"https://destination.test/path?secret=password"}}),async requests=>{
  const data=await (await worker.fetch(request("https://example.com/"),env)).json();
  assert.equal(data.score,null);assert.deepEqual(data.checks,[]);
  assert.equal(data.http.redirectHost,"destination.test");
  assert.ok(!JSON.stringify(data).includes("secret=password"));
  assert.equal(requests.length,1);
 }));
test("security endpoint rejects private addresses before probing",async()=>{
 const response=await worker.fetch(request("http://127.0.0.1/"),env);
 assert.equal(response.status,400);
});
