import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile, mkdir} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {chromium} from "playwright";

const root=process.cwd();
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
 const name=pathname==="/"?"/index.html":pathname;
 const file=resolve(root,"."+name);
 if(!file.startsWith(root+"/")){res.writeHead(403);res.end();return}
 try{
  const data=await readFile(file);
  const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8"};
  res.writeHead(200,{"Content-Type":types[extname(file)]||"text/plain; charset=utf-8","Cache-Control":"no-store"});res.end(data);
 }catch{res.writeHead(404);res.end("Not found")}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const host="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const messages=[];
function installErrors(page){
 page.on("pageerror",e=>messages.push(String(e)));
 page.on("console",m=>{if(m.type()==="error"&&!m.text().includes("Failed to load resource"))messages.push(m.text())});
}
const now=Date.now();
const demo={
 version:3,revision:20,api:"https://pulse-monitor.brunofranciscospinto.workers.dev",intervalMinutes:5,
 monitors:[{id:"test-site",url:"https://example.com/",name:"Website de teste",status:"online",ms:42,checkedAt:now,paused:false,pendingStatus:null,pendingCount:0}],
 history:[{id:"test-site",name:"Website de teste",url:"https://example.com/",status:"online",code:200,ms:52,at:now-3600000},{id:"test-site",name:"Website de teste",url:"https://example.com/",status:"online",code:200,ms:42,at:now-1500000}],
 incidents:[],notifications:[]
};
try{
 await mkdir("artifacts/browser",{recursive:true});
 const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 installErrors(desktop);
 await desktop.addInitScript(snapshot=>localStorage.setItem("pulse:v2",JSON.stringify(snapshot)),demo);
 await desktop.goto(host+"/",{waitUntil:"networkidle"});
 await desktop.waitForFunction(()=>document.querySelectorAll(".service-status-card").length===1,{timeout:10000});
 const chart=await desktop.locator(".dashboard-chart-card").boundingBox();
 const services=await desktop.locator(".dash-service-grid").boundingBox();
 assert.ok(chart&&services,"Expected both chart and services panels");
 assert.ok(services.x>chart.x+chart.width-5,"Desktop services should appear to the right of chart");
 assert.ok(Math.abs(chart.y-services.y)<20,"Desktop cards and chart should align at the top");
 assert.equal(await desktop.locator(".service-placeholder").count(),3,"Four balanced service slots expected");
 assert.equal(await desktop.locator(".hero-chart svg").count(),1,"Real measurement chart must be rendered");
 const layout=await desktop.evaluate(()=>({
  grid:getComputedStyle(document.querySelector(".overview-grid")).gridTemplateColumns,
  background:getComputedStyle(document.body).backgroundColor,
  stylesheet:document.querySelector('link[rel="stylesheet"]').href,
  scrollWidth:document.documentElement.scrollWidth,
  width:innerWidth
 }));
 assert.ok(layout.grid.split(" ").length===2,"Expected a 2-column desktop grid");
 assert.ok(layout.stylesheet.includes("styles.css?v=8"),"Stylesheet must be cache-busted");
 assert.ok(layout.scrollWidth<=layout.width+2,"No horizontal scroll on desktop");
 await desktop.screenshot({path:"artifacts/browser/pulse-desktop-1440.png",fullPage:true});
 // Exercise the security UI and actual client-side PDF download without hitting public websites.
 const report={
  hostname:"example.com",protocol:"https",checkedAt:"2026-11-11T16:00:00Z",
  http:{status:"online",code:200,ms:33},score:75,grade:"Bom",coverage:100,
  checks:[{id:"https",name:"Ligação HTTPS",status:"pass",detail:"HTTPS observado.",recommendation:"Usar HTTPS.",weight:25},
   {id:"csp",name:"Content Security Policy",status:"warning",detail:"Header ausente.",recommendation:"Definir política CSP.",weight:20}],
  limitations:["Pontuação indicativa, não é auditoria de intrusão."]
 };
 await desktop.route("**/security?url=**",route=>route.fulfill({status:200,contentType:"application/json",
  headers:{"access-control-allow-origin":"*"},body:JSON.stringify(report)}));
 await desktop.locator('.nav[data-page="diagnostics"]').click();
 await desktop.locator("#securityUrl").fill("https://example.com/");
 await desktop.locator("#securityForm button[type='submit']").click();
 await desktop.locator(".security-gauge strong").waitFor();
 assert.equal(await desktop.locator(".security-gauge strong").innerText(),"75");
 assert.equal(await desktop.locator(".security-check").count(),2);
 const downloaded=desktop.waitForEvent("download");
 await desktop.locator('[data-action="security-pdf"]').click();
 const pdf=await downloaded;
 assert.match(pdf.suggestedFilename(),/^pulse-security-example\.com-.*\.pdf$/);
 await pdf.saveAs("artifacts/browser/pulse-security-test.pdf");
 assert.equal((await readFile("artifacts/browser/pulse-security-test.pdf")).subarray(0,4).toString(),"%PDF");
 await desktop.screenshot({path:"artifacts/browser/pulse-security-desktop.png",fullPage:true});
 await desktop.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 installErrors(mobile);
 await mobile.addInitScript(snapshot=>localStorage.setItem("pulse:v2",JSON.stringify(snapshot)),demo);
 await mobile.goto(host+"/",{waitUntil:"networkidle"});
 await mobile.waitForFunction(()=>document.querySelectorAll(".service-status-card").length===1);
 const mobileLayout=await mobile.evaluate(()=>({
  scrollWidth:document.documentElement.scrollWidth,
  width:innerWidth,
  columns:getComputedStyle(document.querySelector(".overview-grid")).gridTemplateColumns,
  sidebarBottom:Math.round(document.querySelector(".sidebar").getBoundingClientRect().bottom),
  chartWidth:Math.round(document.querySelector(".dashboard-chart-card").getBoundingClientRect().width)
 }));
 assert.ok(mobileLayout.scrollWidth<=mobileLayout.width+2,"No horizontal scroll on mobile");
 assert.ok(mobileLayout.chartWidth<=mobileLayout.width,"Chart must fit mobile viewport");
 assert.ok(Math.abs(mobileLayout.sidebarBottom-844)<3,"Mobile navigation should be anchored at the bottom");
 await mobile.screenshot({path:"artifacts/browser/pulse-mobile-390.png",fullPage:true});
 await mobile.close();
 const empty=await browser.newPage({viewport:{width:1280,height:800}});
 installErrors(empty);
 await empty.goto(host+"/",{waitUntil:"networkidle"});
 await empty.waitForSelector(".service-empty");
 assert.equal(await empty.locator(".hero-chart .graph-empty").count(),1,"No fake chart with zero measurements");
 await empty.screenshot({path:"artifacts/browser/pulse-empty-1280.png",fullPage:true});
 await empty.close();
 assert.deepEqual(messages,[],"Unexpected browser JavaScript errors");
 console.log("Layout tests passed. Desktop and mobile screenshots generated.");
}catch(error){
 console.error("Browser layout test failed:",error);
 process.exitCode=1;
}finally{
 await browser.close();await new Promise(ok=>server.close(ok));
}
