const SIZE=20000, HALF=10000, N=251;
export async function createWaterMapOverlay({terrainRoot,tileRoot,camera}) {
 const [m,h,b,r]=await Promise.all([fetch(terrainRoot+"/terrain.json"),fetch(tileRoot+"/far/height_u16.bin"),fetch(tileRoot+"/far/biome_u8.bin"),fetch(terrainRoot+"/rivers.json")]);
 if(!m.ok||!h.ok||!b.ok||!r.ok) throw new Error("Map source files unavailable");
 const meta=await m.json(), heights=new Uint16Array(await h.arrayBuffer()), biomes=new Uint8Array(await b.arrayBuffer()), data=await r.json();
 const base=document.createElement("canvas");base.width=base.height=N;const c=base.getContext("2d"),img=c.createImageData(N,N);
 for(let i=0;i<biomes.length;i++){const hex=meta.biomes[biomes[i]]?.paint||"#8b8a68",v=parseInt(hex.slice(1),16),s=.75+heights[i]/65535*.25;img.data[i*4]=(v>>16&255)*s;img.data[i*4+1]=(v>>8&255)*s;img.data[i*4+2]=(v&255)*s;img.data[i*4+3]=255;}c.putImageData(img,0,0);
 const bg=document.createElement("canvas");bg.width=bg.height=800;const x=bg.getContext("2d");x.drawImage(base,0,0,800,800);
 const p=(a,z)=>[(a+HALF)/SIZE*800,(z+HALF)/SIZE*800];
 for(const l of data.lakes||[]){if(!l.outline)continue;x.beginPath();l.outline.forEach(([a,z],i)=>{const [u,v]=p(a,z);i?x.lineTo(u,v):x.moveTo(u,v)});x.closePath();x.fillStyle="#4c9dae";x.fill();}
 const widths={stream:1,small:1.5,medium:2.5,large:4,great:6};
 for(const r of data.rivers||[]){x.beginPath();r.nodes.forEach((n,i)=>{const [u,v]=p(n[0],n[1]);i?x.lineTo(u,v):x.moveTo(u,v)});x.strokeStyle="#4c9dae";x.lineWidth=widths[r.class]||1;x.stroke();}
 x.fillStyle="#fff0d0";x.font="bold 18px sans-serif";x.fillText("N",750,22);x.fillRect(16,750,200,4);x.fillText("20 km",16,780);
 const canvas=document.createElement("canvas");canvas.width=canvas.height=800;Object.assign(canvas.style,{position:"fixed",right:"12px",bottom:"12px",width:"180px",height:"180px",zIndex:"99",display:"none",border:"2px solid #eee0be"});document.body.appendChild(canvas);const ctx=canvas.getContext("2d");let mini=false,full=false;
 function draw(){if(!mini&&!full)return;ctx.clearRect(0,0,800,800);ctx.drawImage(bg,0,0);const size=800,px=(camera.position.x+HALF)/SIZE*size,pz=(camera.position.z+HALF)/SIZE*size;ctx.save();ctx.translate(px,pz);ctx.rotate(camera.rotation.y);ctx.fillStyle="#ffe05a";ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,8);ctx.lineTo(-8,8);ctx.fill();ctx.restore();}
 function update(){draw();}window.addEventListener("keydown",e=>{if(e.repeat)return;if(e.code==="KeyN"){mini=!mini;full=false;canvas.style.display=mini?"block":"none";canvas.style.width="180px";canvas.style.height="180px";draw();}if(e.code==="KeyM"){full=!full;mini=false;canvas.style.display=full?"block":"none";canvas.style.width=full?"min(84vmin,800px)":"180px";canvas.style.height=full?"min(84vmin,800px)":"180px";canvas.style.inset=full?"0":"auto";canvas.style.margin=full?"auto":"0";draw();}if(e.code==="Escape"&&full){full=false;canvas.style.display="none";}});
 return {update,dispose(){canvas.remove()}};
}