import test from "node:test";
import assert from "node:assert/strict";
const kv=new Map();
globalThis.window={scrollTo(){},open(){}};
globalThis.localStorage={getItem:key=>kv.get(key)??null,setItem:(key,value)=>kv.set(key,value)};
const handlers=new Map();
function makeEl(id){
 const el={id,value:"",textContent:"",innerHTML:"",disabled:false,handlers:{},
 classList:{add(){},remove(){},toggle(){}},
 addEventListener(type,callback){this.handlers[type]=callback},
 showModal(){this.open=true},close(){this.open=false},focus(){},
 querySelector(){return {disabled:false}}};
 return el;
}
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,makeEl(id));return elements.get(id)};
globalThis.document={
 getElementById:element,querySelectorAll:()=>[],addEventListener(type,fn){handlers.set(type,fn)},
 activeElement:null,hidden:false
};
const realSetInterval=globalThis.setInterval;
const realSetTimeout=globalThis.setTimeout;
globalThis.setInterval=()=>0;
globalThis.setTimeout=(fn,ms)=>{const timer=realSetTimeout(fn,ms);timer.unref?.();return timer};
globalThis.fetch=async()=>({ok:true,json:async()=>({status:"online",code:200,ms:18})});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("adding a website displays it, saves it and restores it on reload",async()=>{
 await import("../app.js");
 await tick();await tick();
 element("monitorName").value="Website guardado";
 element("monitorUrl").value="https://example.com/";
 await element("addForm").handlers.submit({preventDefault(){},currentTarget:{querySelector(){return {disabled:false}}}});
 assert.match(element("websitesMonitors").innerHTML,/Website guardado/);
 assert.match(element("toast").textContent,/guardado neste browser/);
 const stored=JSON.parse(kv.get("pulse:v2"));
 assert.equal(stored.monitors.length,1);
 assert.equal(stored.monitors[0].url,"https://example.com/");
 elements.clear();
 await import("../app.js?reload");
 await tick();await tick();
 assert.match(element("websitesMonitors").innerHTML,/Website guardado/);
 assert.equal(element("totalStat").textContent,1);
});
test.after(()=>{
 globalThis.setInterval=realSetInterval;
 globalThis.setTimeout=realSetTimeout;
});
