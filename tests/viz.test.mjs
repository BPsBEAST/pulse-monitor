import test from "node:test";
import assert from "node:assert/strict";
import {latencySvg,chartModel} from "../pulse-viz.mjs";
import {diagnosticsHtml} from "../pulse-diagnostics.mjs";
test("charts have an empty state when there are no real observations",()=>{
 assert.match(latencySvg([],86400000),/Ainda não existem dados suficientes/);
 assert.equal(chartModel([],86400000).length,0);
});
test("charts include only real online measurements",()=>{
 const time=Date.now();
 const rows=[{status:"online",ms:32,at:time-2000},{status:"online",ms:48,at:time-1000},{status:"unknown",ms:null,at:time-100},{status:"online",ms:12,at:time-100000000}];
 const svg=latencySvg(rows,86400000,time);
 assert.match(svg,/<svg/);
 assert.match(svg,/32 ms/);
 assert.match(svg,/48 ms/);
 assert.equal(chartModel(rows,86400000,time).length,2);
});
test("diagnostic output escapes untrusted HTTP headers and DNS text",()=>{
 const html=diagnosticsHtml({hostname:"example.com",protocol:"https",checkedAt:new Date().toISOString(),
  ips:["93.184.215.14"],dns:[{type:"CNAME",value:"<script>alert(1)</script>",ttl:300}],
  http:{status:"online",code:200,ms:31,headers:{server:'"><img src=x onerror=alert(2)>'}}});
 assert.ok(!html.includes("<script>"));
 assert.ok(!html.includes("<img "));
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/DNS/);
});
