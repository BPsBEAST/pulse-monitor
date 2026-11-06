import test from "node:test";
import assert from "node:assert/strict";
import {EMPTY,normalizeUrl,registerMonitor,applyCheck,hydrate,summary} from "../pulse-core.mjs";

test("accepts a public HTTPS URL and strips fragments",()=>{
 assert.equal(normalizeUrl("https://example.com/path#section"),"https://example.com/path");
});
test("rejects private and malformed targets",()=>{
 for(const value of ["http://localhost/","http://127.0.0.1/","http://192.168.1.5","http://10.0.0.10","https://example.com:8080/","file:///etc/passwd","https://user:pass@example.com","https://router.local"])assert.throws(()=>normalizeUrl(value),value);
});
test("adding a website returns a visible monitor and survives JSON round trip",()=>{
 const state=EMPTY(),monitor=registerMonitor(state,"https://example.com/","Meu website");
 assert.equal(state.monitors.length,1);assert.equal(state.monitors[0].id,monitor.id);
 const restored=hydrate(JSON.parse(JSON.stringify(state)));
 assert.equal(restored.monitors.length,1);assert.equal(restored.monitors[0].name,"Meu website");
});
test("duplicate websites are rejected",()=>{
 const state=EMPTY();registerMonitor(state,"https://example.com/");
 assert.throws(()=>registerMonitor(state,"https://example.com/"),/já foi adicionado/);
});
test("editing changes a monitor without duplicating it",()=>{
 const state=EMPTY(),monitor=registerMonitor(state,"https://example.com/","Original");
 registerMonitor(state,"https://example.org/","Atualizado",monitor.id);
 assert.equal(state.monitors.length,1);assert.equal(state.monitors[0].name,"Atualizado");
 assert.equal(state.monitors[0].url,"https://example.org/");
});
test("two consecutive failures are necessary before opening an incident",()=>{
 const state=EMPTY(),monitor=registerMonitor(state,"https://example.com/");
 applyCheck(state,monitor.id,{status:"online",code:200,ms:20},100);
 applyCheck(state,monitor.id,{status:"offline",code:503,ms:30},200);
 assert.equal(state.monitors[0].status,"online");assert.equal(state.incidents.length,0);
 applyCheck(state,monitor.id,{status:"offline",code:503,ms:25},300);
 assert.equal(state.monitors[0].status,"offline");assert.equal(state.incidents.length,1);
 applyCheck(state,monitor.id,{status:"online",code:200,ms:22},400);
 assert.equal(state.monitors[0].status,"offline");
 applyCheck(state,monitor.id,{status:"online",code:200,ms:19},500);
 assert.equal(state.monitors[0].status,"online");
 assert.equal(state.incidents[0].end,500);assert.equal(state.notifications.length,2);
});
test("unknown outcomes cannot open incidents",()=>{
 const state=EMPTY(),m=registerMonitor(state,"https://example.com/");
 applyCheck(state,m.id,{status:"unknown"},100);
 applyCheck(state,m.id,{status:"unknown"},200);
 assert.equal(state.incidents.length,0);assert.equal(state.monitors[0].status,"unknown");
});
test("uptime only uses recorded measurements in the requested period",()=>{
 const history=[{at:900,status:"online",ms:20},{at:950,status:"offline",ms:25},{at:100,status:"online",ms:99},{at:930,status:"unknown",ms:null}];
 assert.deepEqual(summary(history,200,1000),{checks:2,uptime:50,avgMs:20});
 assert.equal(summary([],1000).uptime,null);
});
