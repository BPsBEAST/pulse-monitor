import test from "node:test";
import assert from "node:assert/strict";
import {securityPdfBytes} from "../pulse-security-pdf.mjs";
import {securityHtml} from "../pulse-security.mjs";
const demo={
 hostname:"exemplo.pt",protocol:"https",checkedAt:"2026-11-11T16:00:00.000Z",
 http:{status:"online",code:200,ms:42},score:80,grade:"Bom",coverage:100,
 checks:[
  {id:"https",name:"Ligação HTTPS",status:"pass",detail:"Ligação HTTPS confirmada.",recommendation:"Ativar HTTPS.",weight:25},
  {id:"csp",name:"Content Security Policy",status:"warning",detail:"Ausente.",recommendation:"Adicionar uma política.",weight:20}
 ],
 limitations:["Certificados TLS não analisados.","Verificações passivas."]
};
test("PDF export returns self-contained, valid PDF 1.4 structure",()=>{
 const pdf=securityPdfBytes(demo);
 assert.ok(pdf instanceof Uint8Array);
 const text=Buffer.from(pdf).toString("latin1");
 assert.ok(text.startsWith("%PDF-1.4\n"));
 assert.match(text,/\/Type \/Catalog/);
 assert.match(text,/\/Type \/Pages/);
 assert.match(text,/\/Type \/Page\b/);
 assert.match(text,/PULSE  \/  SECURITY REPORT/);
 assert.match(text,/exemplo\.pt/);
 assert.match(text,/80\/100/);
 assert.ok(text.endsWith("%%EOF\n"));
 const match=text.match(/startxref\n(\d+)\n%%EOF\n$/);
 assert.ok(match);
 assert.ok(text.slice(Number(match[1])).startsWith("xref\n"),"xref offset must be accurate");
});
test("PDF paginates lengthy findings",()=>{
 const long={...demo,checks:Array.from({length:20},(_,i)=>({
  id:String(i),name:"Configuração "+i,status:"warning",detail:"Estado observado: "+"incompleto ".repeat(50),
  recommendation:"Corrigir o cabeçalho seguindo o princípio do menor privilégio. ".repeat(10),weight:5
 }))};
 const text=Buffer.from(securityPdfBytes(long)).toString("latin1");
 assert.match(text,/\/Count [2-9]\b/);
 assert.match(text,/pagina 2 de/);
});
test("renderer escapes untrusted HTTP text, and only exports real response",()=>{
 const rendered=securityHtml({...demo,hostname:'<img src=x onerror=alert(1)>',checks:[{...demo.checks[0],name:"<script>bad()</script>"}]});
 assert.ok(!rendered.includes("<script>"));
 assert.ok(!rendered.includes("<img"));
 assert.match(rendered,/&lt;script&gt;/);
 assert.match(rendered,/data-action="security-pdf"/);
});
test("inconclusive security reports show no fabricated score",()=>{
 const text=securityHtml({...demo,score:null,grade:null,coverage:0,reason:"HTTP 302",checks:[]});
 assert.match(text,/Inconclusivo/);
 assert.match(text,/HTTP 302/);
});
