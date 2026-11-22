/* ============================================================================
   massing3d.js — מציג תלת-ממד לבקרת הבינוי (🧊 בלשונית "🏗 בקרת בינוי")
   נטען רק בלחיצה על המתג. three.js מקומי: three.min.js + three-orbit.js (r146, גרסה גלובלית — מתאים ל-CSP 'self').
   הנפחים מגיעים מהמנוע של fitcheck.js (FC.massItems):
     • מעטפת מותרת — קופסה שקופה עם קווי מתאר אדומים. בסיס: מצולע קווי הבניין (או התא), מוקטן לשטח המעטפת
       כשהתכסית קובעת. גובה: הקומות שנכנסות × גובה קומה.
     • הנפח שהזכויות דורשות — גוש בצבע הסיווג: אותו בסיס, מוקטן/מוגדל לשטח הקומה הנדרש; גובה: קומות למיון.
       כשהשטח הנדרש גדול מהמעטפת, הגוש בולט מהקופסה.
     • מרתף (אופציונלי) — גוש שקוף מתחת לקרקע.
   קרקע שטוחה; גבהים מעל מפלס הכניסה. לחיצה על תא → FC.explain.
   ========================================================================== */
(function(root){
'use strict';
const M3={open:false,showBelow:true,showEnv:true};
const $=id=>document.getElementById(id);
let S=null;   // {scene,camera,renderer,controls,ro,picks,center}
let libP=null;
function loadScript(src){ return new Promise((ok,no)=>{ const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=()=>no(new Error('לא נטען: '+src)); document.head.appendChild(s); }); }
function libs(){ if(root.THREE&&root.THREE.OrbitControls) return Promise.resolve(); if(!libP) libP=loadScript('three.min.js').then(()=>loadScript('three-orbit.js')); return libP; }

const CSS=`
#m3d{position:absolute;inset:0;z-index:200;background:#eef1f4;display:none}
#m3d.vis{display:block}
#m3d canvas{display:block;width:100%;height:100%}
#m3d-bar{position:absolute;top:10px;left:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;direction:rtl;z-index:2}
#m3d-bar button,#m3d-bar label{background:#fff;border:1px solid #9fb2c8;color:#1a3560;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit}
#m3d-bar label{display:inline-flex;gap:4px;align-items:center}
#m3d-note{position:absolute;bottom:10px;left:10px;right:10px;max-width:560px;background:rgba(255,255,255,.92);border:1px solid #c9d4e0;border-radius:8px;padding:6px 10px;font-size:12px;color:#34485e;direction:rtl;line-height:1.5;z-index:2}
#m3d-leg{position:absolute;top:44px;left:10px;background:rgba(255,255,255,.92);border:1px solid #c9d4e0;border-radius:8px;padding:6px 9px;font-size:11.5px;color:#1c2b3c;direction:rtl;line-height:1.7;z-index:2}
#m3d-leg i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-left:5px;vertical-align:-1px}
#m3d-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:#34485e;direction:rtl;pointer-events:none}
`;
function css(){ if($('m3d-css')) return; const st=document.createElement('style'); st.id='m3d-css'; st.textContent=CSS; document.head.appendChild(st); }
function dom(){
  if($('m3d')) return $('m3d');
  css(); const wrap=$('canvas-wrap'); if(!wrap) return null;
  const d=document.createElement('div'); d.id='m3d';
  d.innerHTML=`<div id="m3d-bar"><button onclick="M3D.close()">✕ חזרה למפה</button><button onclick="M3D.resetView()">⟲ מבט התחלתי</button><button onclick="M3D.topView()">מבט מלמעלה</button>
    <label><input type="checkbox" checked onchange="M3D.set('showEnv',this.checked)">מעטפת</label>
    <label><input type="checkbox" checked onchange="M3D.set('showBelow',this.checked)">מרתף</label></div>
    <div id="m3d-leg"></div>
    <div id="m3d-note"><b>הגוש מציג כמות, לא בניין.</b> הוא לא מראה נסיגות, מגדל על מסד או כמה מבנים בתא.
      קופסה שקופה אדומה = המעטפת המותרת (קווי בניין / תכסית × הקומות שנכנסות בגובה). גוש צבעוני = שטח הקומה שהזכויות דורשות × הקומות.
      גוש שבולט מהקופסה = הזכויות לא נכנסות. קרקע שטוחה; גבהים מעל מפלס הכניסה. לחיצה על תא = החשבון המלא.<br>
      <span style="opacity:.8">גרירה = סיבוב · גלגלת = זום · כפתור ימני = הזזה</span></div>
    <div id="m3d-msg">טוען תלת-ממד…</div>`;
  wrap.appendChild(d); return d;
}

const toM=(x,y,mpu,c)=>[x*mpu-c[0],y*mpu-c[1]];
function shapeOf(T,ring){ const sh=new T.Shape(); ring.forEach((p,i)=>i?sh.lineTo(p[0],p[1]):sh.moveTo(p[0],p[1])); return sh; }
function prism(T,ring,z0,z1,color,opacity,edgeColor){
  const g=new T.ExtrudeGeometry(shapeOf(T,ring),{depth:Math.max(0.05,z1-z0),bevelEnabled:false}); g.rotateX(-Math.PI/2); g.translate(0,z0,0);
  const mesh=new T.Mesh(g,new T.MeshLambertMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity>=1,side:T.DoubleSide}));
  const grp=new T.Group(); grp.add(mesh);
  if(edgeColor!=null) grp.add(new T.LineSegments(new T.EdgesGeometry(g),new T.LineBasicMaterial({color:edgeColor})));
  grp.userData.mesh=mesh; return grp;
}
function colorOf(T,f){
  try{ const st=f._style||(typeof getStyle==='function'?getStyle(f.properties.MAVAT_CODE):null); const c=st&&(st.f||st.fill);
    if(c&&typeof c==='string'&&c!=='none') return new T.Color(c.length===9?c.slice(0,7):c); }catch(e){}
  return new T.Color(0xf2f2f2);
}

function build(){
  const T=root.THREE, d=dom(); if(!d||!T) return;
  const w=d.clientWidth||800, h=d.clientHeight||600;
  if(!S){
    const scene=new T.Scene(); scene.background=new T.Color(0xeef1f4);
    const camera=new T.PerspectiveCamera(40,w/h,1,20000);
    const renderer=new T.WebGLRenderer({antialias:true}); renderer.setPixelRatio(root.devicePixelRatio||1); renderer.setSize(w,h);
    d.insertBefore(renderer.domElement,d.firstChild);
    const controls=new T.OrbitControls(camera,renderer.domElement); controls.maxPolarAngle=Math.PI/2-0.02;
    controls.addEventListener('change',render);
    scene.add(new T.AmbientLight(0xffffff,.72)); const dl=new T.DirectionalLight(0xffffff,.55); dl.position.set(-300,600,400); scene.add(dl);
    S={scene,camera,renderer,controls,picks:[],world:null};
    // click (not drag) → explain the cell
    let down=null;
    renderer.domElement.addEventListener('pointerdown',e=>{ down=[e.clientX,e.clientY]; });
    renderer.domElement.addEventListener('pointerup',e=>{
      if(!down||e.button!==0||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5) return;
      const r=renderer.domElement.getBoundingClientRect(), v=new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      const rc=new T.Raycaster(); rc.setFromCamera(v,camera);
      const hit=rc.intersectObjects(S.picks,false)[0];
      if(hit&&hit.object.userData.cn&&root.FC){ FC.sel=hit.object.userData.cn; FC.explain(hit.object.userData.cn); M3.refresh(); }
    });
    if(root.ResizeObserver){ S.ro=new ResizeObserver(()=>size()); S.ro.observe(d); }
  }
  if(S.world){ S.scene.remove(S.world); S.world.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); }
  const world=new T.Group(); S.world=world; S.picks=[]; S.scene.add(world);
  const feats=(state.layers&&state.layers.plan&&state.layers.plan.features)||[];
  const mpu=state.spanMeters/DATA_SIZE;
  let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
  for(const f of feats){ const g=f.geometry; if(!g) continue; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates; for(const p of P) for(const [x,y] of p[0]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  const c=[(x0+x1)/2*mpu,(y0+y1)/2*mpu]; S.center=c; S.span=Math.max(50,(x1-x0)*mpu,(y1-y0)*mpu);
  // ground: the plan, flat, in land-use colours
  const lineMat=new T.LineBasicMaterial({color:0x8a96a3});
  for(const f of feats){ const g=f.geometry; if(!g) continue; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    for(const p of P){ const outer=p[0].map(([x,y])=>toM(x,y,mpu,c)); if(outer.length<3) continue;
      const sh=shapeOf(T,outer); for(let i=1;i<p.length;i++) sh.holes.push(shapeOf(T,p[i].map(([x,y])=>toM(x,y,mpu,c))));
      const geo=new T.ShapeGeometry(sh); geo.rotateX(-Math.PI/2);
      const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({color:colorOf(T,f),side:T.DoubleSide})); mesh.userData.cn=String(f.properties.NUM??'').trim()||null;
      world.add(mesh); S.picks.push(mesh);
      const lg=new T.BufferGeometry().setFromPoints(outer.concat([outer[0]]).map(q=>new T.Vector3(q[0],0.05,-q[1])));
      world.add(new T.Line(lg,lineMat)); } }
  // the two volumes per cell
  const items=root.FC&&FC.massItems?FC.massItems():[];
  const flt=root.FC&&FC.filter&&FC.filter!=='all'?FC.filter:null;
  let nOut=0;
  for(const it of items){
    if(flt&&it.cls!==flt) continue;
    const sel=root.FC&&FC.sel===it.cn, sh=r=>r.map(p=>[p[0]-c[0],p[1]-c[1]]);
    if(it.req&&it.req.h>0){ const gr=prism(T,sh(it.req.poly),0.1,it.req.h,new T.Color(it.col),1,sel?0x00c8ff:0x333333);
      gr.userData.mesh.userData.cn=it.cn; S.picks.push(gr.userData.mesh); world.add(gr); if(it.out) nOut++; }
    if(M3.showEnv&&it.env&&it.env.h>0){ const gr=prism(T,sh(it.env.poly),0.1,it.env.h,0xe06060,0.08,sel?0x00c8ff:0xd00000); world.add(gr); }
    if(M3.showBelow&&it.below&&it.below.depth>0){ const gr=prism(T,sh(it.below.poly),-it.below.depth,-0.05,new T.Color(it.colB),0.3,0x666666);
      gr.userData.mesh.userData.cn=it.cn; S.picks.push(gr.userData.mesh); world.add(gr); }
  }
  const leg=$('m3d-leg');
  if(leg&&root.FC){ const cnt={}; for(const it of items) cnt[it.cls]=(cnt[it.cls]||0)+1;
    leg.innerHTML=['mat','plan','excess','cond','fit'].filter(k=>cnt[k]).map(k=>`<div><i style="background:${FC.COL[k]}"></i>${FC.CL[k]} (${cnt[k]})</div>`).join('')+
      `<div><i style="background:transparent;border:2px solid #d00000"></i>מעטפת מותרת</div>${nOut?`<div><b>${nOut}</b> גושים בולטים מהמעטפת</div>`:''}`; }
  const msg=$('m3d-msg'); if(msg) msg.textContent=items.length?'':'אין תוצאות להצגה — צריך תשריט וטבלה 5.';
  if(!S.viewSet){ M3.resetView(); S.viewSet=true; } else render();
}
function size(){ if(!S) return; const d=$('m3d'); if(!d||!d.clientWidth) return; S.renderer.setSize(d.clientWidth,d.clientHeight); S.camera.aspect=d.clientWidth/d.clientHeight; S.camera.updateProjectionMatrix(); render(); }
function render(){ if(S&&M3.open) S.renderer.render(S.scene,S.camera); }

M3.resetView=function(){ if(!S) return; const s=S.span; S.camera.position.set(-0.55*s,0.6*s,0.75*s); S.controls.target.set(0,0,0); S.controls.update(); render(); };
M3.topView=function(){ if(!S) return; S.camera.position.set(0,1.3*S.span,0.01); S.controls.target.set(0,0,0); S.controls.update(); render(); };
M3.set=function(k,v){ M3[k]=v; M3.refresh(); };
M3.refresh=function(){ if(M3.open&&root.THREE&&S) build(); };
M3.openView=function(){
  const d=dom(); if(!d) return; d.classList.add('vis'); M3.open=true; const b=$('btn-m3d'); if(b) b.classList.add('on');
  libs().then(()=>{ if(!M3.open) return; build(); size(); }).catch(e=>{ const m=$('m3d-msg'); if(m) m.textContent='שגיאה בטעינת התלת-ממד: '+e.message; });
};
M3.close=function(){ const d=$('m3d'); if(d) d.classList.remove('vis'); M3.open=false; const b=$('btn-m3d'); if(b) b.classList.remove('on'); };
M3.toggle=function(){ M3.open?M3.close():M3.openView(); };
M3.reset=function(){ M3.close(); if(S){ S.viewSet=false; } };   // תוכנית חדשה: מבט התחלתי מחדש
root.M3D=M3;
})(window);
