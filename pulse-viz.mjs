const h=items=>items.map(x=>x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"));
const formatTime=at=>new Date(at).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
export function chartModel(history,periodMs,now=Date.now()){
 const data=history.filter(h=>h.status==="online"&&Number.isFinite(h.ms)&&Number.isFinite(h.at)&&h.at>=now-periodMs&&h.at<=now).sort((a,b)=>a.at-b.at).slice(-50);
 return data;
}
export function latencySvg(history,periodMs,now=Date.now()){
 const data=chartModel(history,periodMs,now);
 if(data.length<2)return '<div class="graph-empty"><span class="graph-empty-icon">⌁</span><strong>Ainda não existem dados suficientes</strong><p>O gráfico aparece depois de duas verificações online neste período.</p></div>';
 const width=760,height=260,padLeft=42,padRight=20,padTop=26,padBottom=36;
 const maxMs=Math.max(10,Math.ceil(Math.max(...data.map(x=>x.ms))*1.2/10)*10),minAt=data[0].at,maxAt=data.at(-1).at;
 const rangeAt=Math.max(maxAt-minAt,1),plotW=width-padLeft-padRight,plotH=height-padTop-padBottom;
 const points=data.map((d,i)=>({x:padLeft+(maxAt===minAt?(i/Math.max(1,data.length-1)):(d.at-minAt)/rangeAt)*plotW,y:padTop+(1-d.ms/maxMs)*plotH,ms:d.ms,at:d.at}));
 const average=data.map((d,i)=>{const slice=data.slice(Math.max(0,i-4),i+1);return slice.reduce((s,v)=>s+v.ms,0)/slice.length});
 const smoothed=points.map((p,i)=>({x:p.x,y:padTop+(1-average[i]/maxMs)*plotH}));
 const coords=arr=>arr.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 const line=coords(points),smooth=coords(smoothed);
 const area=line+" L "+points.at(-1).x.toFixed(1)+" "+(height-padBottom)+" L "+points[0].x.toFixed(1)+" "+(height-padBottom)+" Z";
 const ticks=[0,.25,.5,.75,1].map(f=>{const y=padTop+f*plotH;return '<line x1="'+padLeft+'" y1="'+y+'" x2="'+(width-padRight)+'" y2="'+y+'" class="chart-gridline"/><text x="'+(padLeft-10)+'" y="'+(y+4)+'" text-anchor="end" class="chart-axis">'+Math.round(maxMs*(1-f))+'</text>'}).join("");
 const xLabels=[0,Math.floor((data.length-1)/2),data.length-1].map(i=>'<text x="'+points[i].x.toFixed(1)+'" y="'+(height-10)+'" text-anchor="'+(i===0?"start":i===data.length-1?"end":"middle")+'" class="chart-axis">'+formatTime(data[i].at)+'</text>').join("");
 const dots=points.length<=20?points.map(p=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3.5" fill="#b1f98c" stroke="#15221d" stroke-width="2"><title>'+p.ms+' ms · '+formatTime(p.at)+'</title></circle>').join(""):"";
 return '<svg class="pulse-graph" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Tempos de resposta reais, em milissegundos, e média móvel das últimas cinco verificações" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="pulseGraphFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#87dd75" stop-opacity=".38"/><stop offset="1" stop-color="#87dd75" stop-opacity="0"/></linearGradient></defs>'+ticks+'<path d="'+area+'" fill="url(#pulseGraphFill)"/><path d="'+smooth+'" class="chart-line-secondary"/><path d="'+line+'" class="chart-line-primary"/>'+dots+xLabels+'</svg>';
}
