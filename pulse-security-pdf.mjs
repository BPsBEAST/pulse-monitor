/**
 * Dependency-free PDF export (PDF 1.4, core Helvetica fonts).
 * Runs locally in the browser and never uploads the result.
 */
function winAnsi(text){
 const extra={"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,
  "‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};
 return [...String(text??"").normalize("NFC")].map(ch=>{
   const code=ch.codePointAt(0);
   if(code>=32&&code<=126||code>=160&&code<=255)return String.fromCharCode(code);
   if(Object.hasOwn(extra,ch))return String.fromCharCode(extra[ch]);
   return ch==="\n"?" ":"?";
 }).join("");
}
function pdfEscape(text){
 return winAnsi(text).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
function wrap(text,maxChars){
 const words=String(text??"").replace(/\s+/g," ").trim().split(" ");
 const lines=[];let line="";
 for(let word of words){
  if(!word)continue;
  while(word.length>maxChars){
   if(line){lines.push(line);line=""}
   lines.push(word.slice(0,maxChars));word=word.slice(maxChars);
  }
  if(!word)continue;
  if(line&&line.length+word.length+1>maxChars){lines.push(line);line=word}
  else line=line?line+" "+word:word;
 }
 if(line)lines.push(line);
 return lines.length?lines:[""];
}

export function securityPdfBytes(data){
 if(!data||typeof data.hostname!=="string"||!Array.isArray(data.checks))throw Error("Relatório de segurança inválido.");
 const pages=[];let commands=[],y=760;
 function nextPage(){
  if(commands.length)pages.push(commands.join("\n")+"\n");
  commands=[
    "0.07 0.12 0.18 rg 0 792 595 50 re f",
    "BT /F2 16 Tf 1 1 1 rg 45 809 Td (PULSE  /  SECURITY REPORT) Tj ET",
    "0.1 0.16 0.23 rg"
  ];
  y=770;
 }
 nextPage();
 function line(value,{size=10,bold=false,spacing=15,indent=0}={}){
  if(y<54)nextPage();
  commands.push("BT /"+(bold?"F2":"F1")+" "+size+" Tf 0.12 0.16 0.22 rg "+(45+indent)+" "+y+" Td ("+pdfEscape(value)+") Tj ET");
  y-=spacing;
 }
 function paragraph(text,{size=10,bold=false,spacing=15,indent=0,gap=0}={}){
  const max=Math.max(20,Math.floor((505-indent)/(size*0.56)));
  for(const value of wrap(text,max))line(value,{size,bold,spacing,indent});
  y-=gap;
 }
 const stamped=Number.isFinite(Date.parse(data.checkedAt))?new Date(data.checkedAt).toISOString().slice(0,19).replace("T"," ")+" UTC":"Data indisponível";
 paragraph("Website: "+data.hostname,{size:15,bold:true,spacing:22,gap:5});
 paragraph("Data da verificação: "+stamped,{size:10,spacing:17});
 paragraph("Resposta HTTP: "+(data.http?.code??"não disponível")+" · Protocolo: "+(data.protocol||"não confirmado"),{size:10,spacing:17,gap:8});
 if(Number.isInteger(data.score)&&data.score>=0&&data.score<=100){
  paragraph("Pontuação indicativa: "+data.score+"/100 ("+(data.grade||"sem classificação")+")",{size:13,bold:true,spacing:21});
  paragraph("Cobertura dos critérios ponderados: "+(data.coverage??0)+"%",{size:10,spacing:16,gap:9});
 }else{
  paragraph("Resultado: inconclusivo — sem pontuação atribuída.",{size:12,bold:true,spacing:19,gap:8});
 }
 if(data.reason)paragraph("Nota: "+data.reason,{size:10,spacing:15,gap:10});
 paragraph("VERIFICAÇÕES DE SEGURANÇA",{size:12,bold:true,spacing:21,gap:2});
 const states={pass:"CONFORME",warning:"A MELHORAR",fail:"FALHA",not_checked:"NÃO AVALIADO"};
 for(const item of data.checks.slice(0,20)){
  const label=Object.hasOwn(states,item.status)?states[item.status]:"NÃO AVALIADO";
  paragraph("["+label+"] "+item.name,{size:10,bold:true,spacing:16});
  if(item.detail)paragraph("Observação: "+item.detail,{size:9,spacing:14,indent:9});
  if(item.status!=="pass"&&item.status!=="not_checked"&&item.recommendation)
   paragraph("Recomendação: "+item.recommendation,{size:9,spacing:14,indent:9});
  y-=8;
 }
 paragraph("LIMITAÇÕES",{size:12,bold:true,spacing:20,gap:2});
 for(const warning of (Array.isArray(data.limitations)?data.limitations:[]).slice(0,10))
  paragraph("- "+warning,{size:9,spacing:14,gap:2});
 paragraph("Gerado localmente pelo PULSE. Os resultados refletem apenas a resposta observada.",{size:9,spacing:14,gap:5});
 pages.push(commands.join("\n")+"\n");
 const objects=[null];
 const add=(value)=>{objects.push(value);return objects.length-1};
 const catalog=add(""),pagesNode=add("");
 const regular=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
 const bold=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
 const pageNodes=[];
 for(let i=0;i<pages.length;i++){
  const payload=pages[i]+"BT /F1 8 Tf 0.45 0.48 0.52 rg 45 32 Td (PULSE  -  pagina "+(i+1)+" de "+pages.length+") Tj ET\n";
  const stream=add("<< /Length "+payload.length+" >>\nstream\n"+payload+"endstream");
  const page=add("<< /Type /Page /Parent "+pagesNode+" 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "+regular+" 0 R /F2 "+bold+" 0 R >> >> /Contents "+stream+" 0 R >>");
  pageNodes.push(page);
 }
 objects[catalog]="<< /Type /Catalog /Pages "+pagesNode+" 0 R >>";
 objects[pagesNode]="<< /Type /Pages /Kids ["+pageNodes.map(n=>n+" 0 R").join(" ")+"] /Count "+pageNodes.length+" >>";
 let pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
 const offsets=[0];
 for(let i=1;i<objects.length;i++){
  offsets.push(pdf.length);
  pdf+=i+" 0 obj\n"+objects[i]+"\nendobj\n";
 }
 const xref=pdf.length;
 pdf+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 pdf+="trailer\n<< /Size "+objects.length+" /Root "+catalog+" 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 return Uint8Array.from(pdf,ch=>ch.charCodeAt(0));
}

export function downloadSecurityPdf(data){
 const bytes=securityPdfBytes(data);
 const blob=new Blob([bytes],{type:"application/pdf"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 const hostname=String(data.hostname).replace(/[^a-z0-9.-]/gi,"-").slice(0,100);
 a.href=url;a.download="pulse-security-"+hostname+"-"+new Date().toISOString().slice(0,10)+".pdf";
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
