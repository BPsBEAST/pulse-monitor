import {hydrate,EMPTY} from "./pulse-core.mjs";
const STORE="pulse:v2", DB_NAME="pulse-history", DB_VERSION=2;
let db=null;
function getLocal(){
  try{const raw=localStorage.getItem(STORE);return raw?hydrate(JSON.parse(raw)):null}catch{return null}
}
function openDB(){
  return new Promise(resolve=>{
    if(!("indexedDB" in window))return resolve(null);
    try{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains("checks"))d.createObjectStore("checks",{keyPath:"key"});
        if(!d.objectStoreNames.contains("state"))d.createObjectStore("state");
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>resolve(null);
      req.onblocked=()=>resolve(null);
    }catch{resolve(null)}
  });
}
function retrieve(d,store,key){
  return new Promise(resolve=>{
    try{
      const request=d.transaction(store,"readonly").objectStore(store)[key===null?"getAll":"get"](key===null?undefined:key);
      request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);
    }catch{resolve(null)}
  });
}
function writeDb(snapshot){
  return new Promise(resolve=>{
    if(!db)return resolve(false);
    try{
      const tx=db.transaction("state","readwrite");
      tx.objectStore("state").put(snapshot,"main");
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>resolve(false);
      tx.onabort=()=>resolve(false);
    }catch{resolve(false)}
  });
}
export async function initializeStorage(){
  const local=getLocal();
  db=await openDB();
  const remote=db?await retrieve(db,"state","main"):null;
  const idb=remote?hydrate(remote):null;
  let state;
  if(local&&idb)state=(idb.revision>local.revision || idb.revision===local.revision&&idb.history.length>local.history.length)?idb:local;
  else state=idb||local||EMPTY();
  // Upgrade historical checks saved by the previous IndexedDB implementation.
  if(db&&!idb){
    const old=await retrieve(db,"checks",null);
    if(Array.isArray(old)&&old.length){
      const seen=new Set(state.history.map(h=>h.key||h.id+":"+h.at));
      for(const h of old)if(state.monitors.some(m=>m.id===h.id)&&!seen.has(h.key||h.id+":"+h.at)){state.history.push(h);seen.add(h.key||h.id+":"+h.at)}
      state.history.sort((a,b)=>b.at-a.at);state.history=state.history.slice(0,5000);
    }
  }
  return {state,hasPersistentStore:!!db||canLocal(),initialCount:state.monitors.length};
}
function canLocal(){try{const v=localStorage.getItem(STORE);return v!==undefined}catch{return false}}
export async function saveState(state){
  state.revision=(Number(state.revision)||0)+1;
  const full=structuredClone(state);
  let localOk=false;
  try{
    const compact={...full,history:full.history.slice(0,100)};
    const value=JSON.stringify(compact);
    localStorage.setItem(STORE,value);
    localOk=localStorage.getItem(STORE)===value;
  }catch{}
  const idbOk=await writeDb(full);
  if(!localOk&&!idbOk)throw new Error("O browser bloqueou o armazenamento. Usa uma janela normal ou permite guardar dados para este website.");
  return {localOk,idbOk};
}
