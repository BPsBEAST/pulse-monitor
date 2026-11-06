const formatTime=at=>new Date(at).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
// A valid HTTP response is a latency observation even when the HTTP code is a redirect,
// access denied, or server error. Network failures and DNS errors are NOT observations.
export function chartModel(history,periodMs,now=Date.now()){
 return history.filter(h=>Number.isInteger(h.code)&&h.code>=100&&h.code<=599&&
   Number.isFinite(h.ms)&&h.ms>=0&&Number.isFinite(h.at)&&
   h.at>=now-periodMs&&h.at<=now)
  .sort((a,b)=>a.at-b.at).slice(-50);
}
export function latencySvg(history,periodMs,now=Date.now()){
 const data=chartModel(history,periodMs,now);
 if(!data.length)return '<div class="graph-empty"><span class="graph-empty-icon">⌁</span><strong>Ainda sem medições HTTP</strong><p>Verifica um website para obter a primeira medição. Quando um servidor bloqueia a verificação, o PULSE explica o motivo sem inventar valores.</p></div>';
 const width=760,height=260,padLeft=43,padRight=20,padTop=26,padBottom=37;
 const maxMs=Math.max(10,Math.ceil(Math.max(...data.map(x=>x.ms))*1.2/10)*10);
 const plotW=width-padLeft-padRight,plotH=height-padTop-padBottom;
 const minAt=data[0].at,maxAt=data.at(-1).at;
 const points=data.map((d,i)=>({x:data.length===1?padLeft+plotW/2:padLeft+(maxAt===minAt?i/(data.length-1):(d.at-minAt)/Math.max(1,maxAt-minAt))*plotW,y:padTop+(1-d.ms/maxMs)*plotH,ms:d.ms,at:d.at,code:d.code}));
 const coords=arr=>arr.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 const ticks=[0,.25,.5,.75,1].map(f=>{const y=padTop+f*plotH;return '<line x1="'+padLeft+'" y1="'+y+'" x2="'+(width-padRight)+'" y2="'+y+'" class="chart-gridline"/><text x="'+(padLeft-10)+'" y="'+(y+4)+'" text-anchor="end" class="chart-axis">'+Math.round(maxMs*(1-f))+'</text>'}).join("");
 const xIds=data.length===1?[0]:[0,Math.floor((data.length-1)/2),data.length-1];
 const xLabels=[...new Set(xIds)].map(i=>'<text x="'+points[i].x.toFixed(1)+'" y="'+(height-10)+'" text-anchor="'+(data.length===1?"middle":i===0?"start":i===data.length-1?"end":"middle")+'" class="chart-axis">'+formatTime(data[i].at)+'</text>').join("");
 const dots=points.length<=20?points.map(p=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(data.length===1?"5":"3.5")+'" fill="#b1f98c" stroke="#15221d" stroke-width="2"><title>'+p.ms+' ms · HTTP '+p.code+' · '+formatTime(p.at)+'</title></circle>').join(""):"";
 let graph="";
 if(points.length>1){
  const average=data.map((_,i)=>{const slice=data.slice(Math.max(0,i-4),i+1);return slice.reduce((s,v)=>s+v.ms,0)/slice.length});
  const smoothed=points.map((p,i)=>({x:p.x,y:padTop+(1-average[i]/maxMs)*plotH}));
  const line=coords(points),area=line+" L "+points.at(-1).x.toFixed(1)+" "+(height-padBottom)+" L "+points[0].x.toFixed(1)+" "+(height-padBottom)+" Z";
  graph='<path d="'+area+'" fill="url(#pulseGraphFill)"/><path d="'+coords(smoothed)+'" class="chart-line-secondary"/><path d="'+line+'" class="chart-line-primary"/>';
 }
 return '<svg class="pulse-graph" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Medições reais de latência HTTP em milissegundos; os códigos HTTP de erro também são mostrados" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="pulseGraphFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#87dd75" stop-opacity=".38"/><stop offset="1" stop-color="#87dd75" stop-opacity="0"/></linearGradient></defs>'+ticks+graph+dots+xLabels+'</svg>';
}
