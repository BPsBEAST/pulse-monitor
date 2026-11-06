import test from "node:test";
import assert from "node:assert/strict";
import {EMPTY,registerMonitor} from "../pulse-core.mjs";
const kv=new Map();
globalThis.window={};
globalThis.localStorage={
 getItem(key){return kv.get(key)??null},
 setItem(key,value){kv.set(key,value)},
 removeItem(key){kv.delete(key)}
};
const {initializeStorage,saveState}=await import("../pulse-storage.mjs");
test("saved monitor is recovered after startup",async()=>{
 kv.clear();
 const state=EMPTY();registerMonitor(state,"https://example.com/","Site pessoal");
 const receipt=await saveState(state);
 assert.equal(receipt.localOk,true);
 const newSession=await initializeStorage();
 assert.equal(newSession.state.monitors.length,1);
 assert.equal(newSession.state.monitors[0].name,"Site pessoal");
});
test("blocked browser storage produces an error instead of a false success",async()=>{
 kv.clear();
 const saved=globalThis.localStorage;
 globalThis.localStorage={getItem(){throw Error("blocked")},setItem(){throw Error("blocked")}};
 try{await assert.rejects(saveState(EMPTY()),/bloqueou o armazenamento/)}
 finally{globalThis.localStorage=saved}
});
