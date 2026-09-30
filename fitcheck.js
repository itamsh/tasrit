/* ============================================================================
   fitcheck.js — "בקרת בינוי": האם הזכויות בטבלה 5 נכנסות בתאי השטח
   מחקר ואפיון: בקרת בינוי/README.md · FORM_SPEC.md · PARAMETER_MAP.md · MASTER_TAKANON.md
   המנוע נבדק מחוץ לממשק (בקרת בינוי/tools/fitcheck/engine.js) על 5 תמ"לים + ניפוח זכויות מכוון.

   מבנה:
     1. FIELDS — שדות הטופס (ברירות מחדל מתקנון המאסטר + "איפה מחפשים")
     2. Engine — חסם עליון לקיבולת לכל תא לפי תרחישים, מול טבלה 5; בדיקות השוואה (עמיתים, שטח ליח"ד)
     3. UI     — פאנל בתוך main-area, צביעת תאים, כרטיס תא, עמודות בלשונית טבלה 5
   תלות בממשק (גלובלי): state, _calcBuildGeom, _featureAreaM2, dc, redraw, zoomAt, wrap, scale, viewX, viewY, _mPerUnit, esc
   ========================================================================== */
(function(root){
'use strict';
const FC={open:false,spec:null,res:null,filter:'all'};
const $=id=>document.getElementById(id);
const E=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num=v=>{ const m=String(v==null?'':v).replace(/\(\s*\d+\s*\)/g,'').replace(/,/g,'').match(/-?\d+(\.\d+)?/); return m?+m[0]:0; };
const fmt=v=>v==null||!isFinite(v)?'—':Math.round(v).toLocaleString('he-IL');

// ═══════════════════════════════════════════════════════════════════════════
// 1. FIELDS
// ═══════════════════════════════════════════════════════════════════════════
// כללי תוכנית — ערך אחד לכל התוכנית. def=null → "לא נקבע".
const FIELDS=[
  {k:'marakmiMaxFloors',label:'סף מרקמי — קומות מרביות למבנה מרקמי',def:10,unit:"ק'",where:'1.9 הגדרות · הערות לטבלה 5',say:'"בניין פשוט/מרקמי … ועד X קומות". מאסטר: 10. רב-קומות = מעל 29 מ\''},
  {k:'dMM',label:'מרחק מרקמי–מרקמי',def:8,unit:"מ'",where:'6.1.1 "הוראות להעמדת מבנים" · 4.1.2 · לפעמים 6.3/6.4',say:'"המרחק בין שני מבנים … יהיה לפחות". מאסטר: 8'},
  {k:'dMMlong',label:'…בין חזיתות ארוכות (אם התוכנית מפצלת)',def:null,unit:"מ'",where:'כמו למעלה',say:'למשל 8 בין חזיתות קצרות / 13 בין ארוכות'},
  {k:'dMMlowUpTo',label:'…מרחק מופחת למבנים עד N קומות: N',def:null,unit:"ק'",where:'כמו למעלה',say:'למשל "שני מבנים בני 6 קומות — 6 מ\'"'},
  {k:'dMMlow',label:'…המרחק המופחת',def:null,unit:"מ'",where:'',say:''},
  {k:'dMT',label:'מרחק מרקמי–רב-קומות',def:10,unit:"מ'",where:'כמו למעלה',say:'מאסטר: 10'},
  {k:'dTT',label:'מרחק רב-קומות–רב-קומות',def:15,unit:"מ'",where:'כמו למעלה',say:'מאסטר: 15'},
  {k:'dTTabove',label:'תוספת מרחק בין רבי-קומות — מעל קומה',def:25,unit:"ק'",where:'כמו למעלה',say:'מאסטר: +1 מ\' לכל קומה מעל 25'},
  {k:'dTTadd',label:'…תוספת לכל קומה',def:1,unit:"מ'",where:'',say:''},
  {k:'coverage',label:'תכסית מרבית עילית — אם אינה בטבלה 5',def:null,unit:'%',where:'עמודה בטבלה 5 · הערות · פרק 4',say:'"תכסית … לא תעלה על"'},
  {k:'freePct',label:'שטח שחייב להישאר פנוי / מגונן',def:0,unit:'% מהתא',where:'6.1 נטיעות · 6.5 פיתוח · פרק ניהול הנגר',say:'"לפחות X% משטח התא יהיה פנוי / מגונן / מחלחל"'},
  {k:'pbMode',label:'שטחים משותפים לכל בניין',def:'included',type:'sel',opts:[['included','כלולים בטבלה'],['add','תוספת מעל הטבלה'],['deduct','חובה מתוך הטבלה']],where:'הערות לטבלה 5 · 4.1.2',say:'"לכל בניין תותר תוספת…" / "מתוך השטחים בטבלה… לכל מבנה"'},
  {k:'pbMarakmi',label:'…תוספת למבנה מרקמי',def:null,unit:'מ"ר',where:'',say:'רק במצב "תוספת"'},
  {k:'pbTower',label:'…תוספת לרב-קומות',def:null,unit:'מ"ר',where:'',say:'אם ריק — כמו מרקמי'},
  {k:'pbExcept',label:'…לא חל על הייעודים',def:'',type:'text',where:'',say:'שמות ייעוד כמו בטבלה 5, מופרדים בפסיק (למשל: מגורים א\')'},
  {k:'bonusPct',label:'תוספת זכויות מחוץ לטבלה (בונוס כללי)',def:0,unit:'%',where:'הערות לטבלה 5 · 6.x',say:'למשל "+5% ליח"ד ולזכויות" (מרפסות — לא כאן)'},
  {k:'setback',label:'נסיגה אחידה מגבול התא — רק כשאין קווי בניין בתשריט',def:null,unit:"מ'",where:'נספח הבינוי · הערות לטבלה 5 ("לפי נספח הבינוי")',say:'מספר אחד מקורב; התוצאה תסומן ⚠'},
];
// כללים לקבוצות תאים — ברירת מחדל לכל תאי המגורים + חריגים "תא:ערך"
const GROUPS=[
  {k:'maxTowers',label:'מספר רבי-קומות מרבי בתא',where:'הערות לטבלה 5 ("יתאפשר בניין רב-קומות אחד") · 6.1.1 · נספח מחייב',say:'ריק = לא מוגבל'},
  {k:'minBuildings',label:'מספר מבנים מזערי בתא',where:'נספח בינוי מחייב ("מספר מבנים מינימלי") · הערות',say:'ריק = 1'},
  {k:'maxBuildings',label:'מספר מבנים מרבי בתא',where:'עמודה בטבלה 5 (נקלטת אוטומטית) · הערות',say:'ריק = לפי הטבלה / לא מוגבל'},
  {k:'marakmiRequired',label:'מבנים שחייבים להיות מרקמיים',where:'הערות לטבלה 5 ("שני מבנים מחויבים בבנייה מרקמית")',say:'ריק = אין חובה'},
  {k:'marakmiFloors',label:'קומות מרביות למבנה מרקמי בתא',where:'הערות לטבלה 5 · נספח',say:'כשהטבלה נותנת את קומות המגדל. ריק = סף המרקמי'},
];
// הנחות מודל — לא מהתוכנית; תמיד "הנחה" (לא יכולות לתת ✗)
const ASSUME=[
  {k:'eff',label:'יעילות קומה (ניכוי פירים, מגרעות ונסיגות)',def:0.85,unit:''},
  {k:'unit',label:'שטח דירה ממוצע (פלדלת)',def:100,unit:'מ"ר'},
  {k:'upfT',label:'יח"ד בקומה טיפוסית — מגדל',def:5,unit:''},
  {k:'Dm',label:'עומק מבנה מרקמי',def:15,unit:"מ'"},
];
const CORE_T={3:null,4:27,5:24,6:20,7:18,8:16};          // מאסטר: גרעין ליח"ד במגדל לפי יח"ד בקומה (7–8: המשך המגמה)
const LOOSE={eff:1.0,plateT:900,Dm:20};                    // הנחות מקילות — ✗ רק אם גם בהן לא נכנס

function emptySpec(){
  const f={}; for(const x of FIELDS) f[x.k]=x.def;
  const g={}; for(const x of GROUPS) g[x.k]={def:null,exc:''};
  const a={}; for(const x of ASSUME) a[x.k]=x.def;
  return {v:1,plan:'',f,conf:{},g,a};
}
function normalizeSpec(s){
  const e=emptySpec(); if(!s||typeof s!=='object') return e;
  return {v:1,plan:s.plan||'',f:Object.assign(e.f,s.f||{}),conf:Object.assign({},s.conf||{}),
    g:Object.assign(e.g,s.g||{}),a:Object.assign(e.a,s.a||{})};
}
FC.spec=emptySpec();

// ═══════════════════════════════════════════════════════════════════════════
// 2. Engine
// ═══════════════════════════════════════════════════════════════════════════
const isSum=r=>!r.shimush||/סך|סה"כ/.test(r.shimush)||/סך|סה"כ/.test(r.yiud||'');
const isRes=r=>/מגורים|דיור/.test(r.shimush||'')||(!r.shimush&&/מגורים/.test(r.yiud||''));
function parseExc(s){ const o={}; for(const part of String(s||'').split(/[,;\n]+/)){ const m=part.match(/^\s*([\w\-]+)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/); if(m) o[m[1]]=+m[2]; } return o; }
function ruleFor(spec,k,cell){ const g=spec.g[k]; if(!g) return null; const ex=parseExc(g.exc); if(ex[cell]!=null) return ex[cell]; return g.def==null||g.def===''?null:+g.def; }

// T5 rows → per-cell demand
function cellsFromT5(t5){
  const out={};
  for(const cn of Object.keys(t5||{})){
    const all=t5[cn]||[], rows=all.length===1?all:all.filter(r=>!isSum(r));
    if(!rows.length) continue;
    const x={cn,yiud:(rows[0].yiud||'').trim(),above:0,resArea:0,units:0,floors:0,cov:null,maxB:null,gova:null,det:[]};
    for(const r of rows){
      const a=(r.ikariMal||r.sherutMal)?num(r.ikariMal)+num(r.sherutMal):num(r.kollMal);
      x.above+=a;
      x.det.push({use:r.shimush||r.yiud||'—',ikari:num(r.ikariMal),sherut:num(r.sherutMal),koll:(r.ikariMal||r.sherutMal)?null:num(r.kollMal),above:a,units:num(r.yihud),floors:num(r.komMal)});
      const u=num(r.yihud); x.units+=u; if(u&&isRes(r)) x.resArea+=a;
      x.floors=Math.max(x.floors,num(r.komMal));
      if(num(r.tachsit)) x.cov=num(r.tachsit);
    }
    for(const r of all){ if(num(r.maxBld)) x.maxB=num(r.maxBld); if(num(r.gova)) x.gova=Math.max(x.gova||0,num(r.gova)); if(!x.floors&&num(r.komMal)) x.floors=num(r.komMal); }
    out[cn]=x;
  }
  return out;
}
// band area at depth D (linear interpolation of the envelope-depth profile)
function bandAt(g,D){ const ks=Object.keys(g.band).map(Number).sort((a,b)=>a-b);
  if(D<=ks[0]) return g.band[ks[0]]*D/ks[0];
  for(let i=1;i<ks.length;i++) if(D<=ks[i]){ const t=(D-ks[i-1])/(ks[i]-ks[i-1]); return g.band[ks[i-1]]*(1-t)+g.band[ks[i]]*t; }
  return g.band[ks[ks.length-1]]; }
// cell with no building lines: rectangle equivalent of the cell, shrunk by a uniform setback (approximate)
function rectGeom(A,P,s){
  const h=P/2, disc=Math.max(0,h*h/4-A), a=h/2+Math.sqrt(disc), b=Math.max(1,h-a);
  const ea=Math.max(0,a-2*s), eb=Math.max(0,b-2*s), env=ea*eb, band={};
  for(const D of [8,10,12,15,18,20]) band[D]=env-Math.max(0,ea-2*D)*Math.max(0,eb-2*D);
  return {env,per:2*(ea+eb),band,cellA:A,approx:true};
}
function cellPerimeter(f){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates; let s=0;
  for(const p of P) for(const r of p) for(let i=1;i<r.length;i++) s+=Math.hypot(r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]);
  return s*((typeof _mPerUnit==='function'&&_mPerUnit())||1); }

// capacity (upper bound) of one cell under assumptions a; conf = which plan rules are confirmed (loose run relaxes the rest)
function capacity(spec,x,g,a,loose){
  const F=spec.f, C=spec.conf, cn=x.cn;
  const use=(k,relaxTo)=>loose&&!C[k]?relaxTo:F[k];
  const thr=+F.marakmiMaxFloors||10;
  const Fm=Math.min(thr,x.floors,ruleFor(spec,'marakmiFloors',cn)??thr);
  const Ft=x.floors>thr?x.floors:0;
  const lowUpTo=F.dMMlowUpTo, dmm=(F.dMMlow!=null&&lowUpTo!=null&&Fm<=+lowUpTo)?use('dMMlow',0):use('dMM',0);
  const dmt=use('dMT',0);
  let dtt=use('dTT',0); if(Ft&&F.dTTabove!=null&&F.dTTadd) dtt+=Math.max(0,Ft-(+F.dTTabove))*(loose&&!C.dTTadd?0:+F.dTTadd);
  const cov=x.cov??(F.coverage!=null&&F.coverage!==''?+F.coverage:null);
  const free=+(use('freePct',0)||0);
  const budget=Math.min(g.env,(1-free/100)*g.cellA,cov?cov/100*g.cellA:Infinity);
  const core=CORE_T[+a.upfT]??24, T=loose?LOOSE.plateT:(+a.upfT)*((+a.unit)+core);
  const eff=loose?LOOSE.eff:+a.eff, Dm=loose?LOOSE.Dm:+a.Dm;
  const dil=D=>g.env+g.per*D/2+Math.PI*D*D/4;
  const kRule=Ft?ruleFor(spec,'maxTowers',cn):null;
  let kmax=Ft?(kRule??99):0;
  while(kmax>0&&kmax*(Math.sqrt(T)+dtt)**2>dil(dtt)) kmax--;
  const nMin=Math.max(1,ruleFor(spec,'minBuildings',cn)??1);
  const nMax=ruleFor(spec,'maxBuildings',cn)??x.maxB??99;
  const mReq=ruleFor(spec,'marakmiRequired',cn)??0;
  const except=String(F.pbExcept||'').split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
  const addOn=F.pbMode==='add'&&!except.includes(x.yiud);
  const ring=d=>0.5*((Math.sqrt(T)+d)**2-T);
  let best=null; const scen=[];
  const det={thr,Fm,Ft,dmm,dmt,dtt,cov,covSrc:x.cov!=null?'טבלה 5':(cov?'הטופס':null),free,env:g.env,cellA:g.cellA,
    freeCap:(1-free/100)*g.cellA,covCap:cov?cov/100*g.cellA:null,budget,T,upf:+a.upfT,unit:+a.unit,core,eff,Dm,band:bandAt(g,Dm),
    kRule,kmax,nMin,nMax,nMaxSrc:ruleFor(spec,'maxBuildings',cn)!=null?'הטופס':(x.maxB!=null?'טבלה 5':null),mReq,addOn,
    addM:+F.pbMarakmi||0,addT:+F.pbTower||+F.pbMarakmi||0,bonus:+F.bonusPct||0,scale:x.scale||1,loose,
    relaxed:loose?['dMM','dMT','dTT','freePct'].filter(k=>!C[k]):[]};
  for(let k=0;k<=kmax;k++) for(const extra of [0,1]){
    const nmMin=Math.max(k?0:1,nMin-k,mReq), nm=nmMin+(extra&&Fm?1:0);
    if(extra&&!Fm) continue;
    if(k+nm>nMax||(!Fm&&nm)) continue;
    const TF=k*T; if(TF>budget) continue;
    const TL=k*(nm?ring(dmt):0)+Math.max(0,k-1)*(nm?0:ring(dtt));
    const gaps=Math.max(0,nm-1)*dmm*Dm;
    const MF=nm?Math.max(0,Math.min(bandAt(g,Dm),budget-TF-TL)-gaps):0;
    const cap=eff*(TF*Ft+MF*Fm);
    const n=k+nm;
    const need=x.above*(1+(+F.bonusPct||0)/100)*(x.scale||1)+(addOn?n*(k?(+F.pbTower||+F.pbMarakmi||0):(+F.pbMarakmi||0)):0);
    const slack=cap-need;
    const s={k,nm,Fm,Ft,TF,MF,TL,gaps,cap,need,slack,budget,T,n};
    scen.push(s);
    if(!best||slack>best.slack) best=s;
  }
  if(best){ best.det=det; best.scen=scen; }
  return best;
}

const med=arr=>{ const s=[...arr].sort((p,q)=>p-q); return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):NaN; };

// run the whole plan. geomOf(cn) → {env,per,band,cellA,approx?}|{noLines:true,cellA}; opts.scale={cn:factor} for tests
function run(spec,cells,geomOf,opts){
  opts=opts||{}; const rows=[]; const thr=+spec.f.marakmiMaxFloors||10;
  for(const x of Object.values(cells)){
    if(!x.above||!/מגורים|תעסוקה|דיור/.test(x.yiud)) continue;
    let g=geomOf(x.cn); if(!g) continue;
    let approx=false, noLines=false;
    if(g.noLines){ noLines=true;
      if(spec.f.setback!=null&&spec.f.setback!==''&&g.per0) { g=rectGeom(g.cellA,g.per0,+spec.f.setback); approx=true; }
      else { g=rectGeom(g.cellA,g.per0||4*Math.sqrt(g.cellA),0); approx=true; } }
    const xs=Object.assign({},x,{scale:(opts.scale&&opts.scale[x.cn])||1});
    const nom=capacity(spec,xs,g,spec.a,false), lo=capacity(spec,xs,g,spec.a,true);
    const r={cn:x.cn,yiud:x.yiud,floors:x.floors,units:x.units,cellA:g.cellA,env:g.env,approx,noLines,
      need:nom?nom.need:xs.above,cap:nom?nom.cap:0,capL:lo?lo.cap:0,nom,lo,x:xs,flags:[]};
    if(!nom||!lo){ r.verdict='✗'; r.why='אין תרחיש בינוי שעומד בכללים (מספר מבנים / חובת מרקמי)'; rows.push(r); continue; }
    r.ratio=nom.need/nom.cap;
    if(lo.need>lo.cap) r.verdict=approx?'⚠':'✗';
    else if(nom.need>nom.cap) r.verdict='⚠';
    else if(r.ratio<0.5) r.verdict='חסר?';
    else r.verdict='✓';
    r.scen=`${nom.k?nom.k+' רבי-קומות × '+nom.Ft+" ק'":''}${nom.k&&nom.nm?' + ':''}${nom.nm?nom.nm+' מרקמי × '+nom.Fm+" ק'":''}`;
    const bind=nom.TF+nom.MF>=nom.budget-1?(Math.abs(nom.budget-g.env)<1?'המעטפה (קווי בניין)':'תקציב הקרקע (שטח פנוי / תכסית)'):'עומק המבנה והמרחקים';
    r.why=r.verdict==='✗'?`גם בהנחות המקילות הקיבולת ${fmt(lo.cap)} מ"ר < ${fmt(lo.need)} מ"ר. המגביל: ${bind}.`
      :r.verdict==='⚠'?`בהנחות הרגילות הקיבולת ${fmt(nom.cap)} מ"ר < ${fmt(nom.need)} מ"ר; בהנחות המקילות נכנס. המגביל: ${bind}.`
      :`תרחיש שמכיל את הזכויות: ${r.scen}. המגביל: ${bind}.`;
    if(noLines) r.flags.push(approx&&spec.f.setback!=null&&spec.f.setback!==''?'אין קווי בניין בתשריט — נסיגה אחידה מקורבת':'אין קווי בניין בתשריט — המעטפה = התא כולו');
    rows.push(r);
  }
  // peer checks
  const ok=rows.filter(r=>r.ratio);
  for(const r of ok){
    let peers=ok.filter(o=>o!==r&&o.yiud===r.yiud&&o.floors===r.floors);
    if(peers.length<3) peers=ok.filter(o=>o!==r&&o.yiud===r.yiud&&(o.floors>thr)===(r.floors>thr));
    if(peers.length<3) peers=ok.filter(o=>o!==r&&(o.floors>thr)===(r.floors>thr));
    r.peerList=peers.map(o=>({cn:o.cn,ratio:o.ratio})); r.peerMed=peers.length?med(peers.map(o=>o.ratio)):null;
    r.peer=peers.length>=3?r.ratio/r.peerMed:null; r.peerN=peers.length;
    const x=cells[r.cn]; r.apu=x&&x.units?x.resArea*((opts.scale&&opts.scale[r.cn])||1)/x.units:null;
  }
  const apuPlan=med(ok.filter(r=>r.apu).map(r=>r.apu));
  for(const r of ok){
    const same=ok.filter(o=>o!==r&&o.apu&&o.yiud===r.yiud);
    const ref=same.length>=3?med(same.map(o=>o.apu)):apuPlan;
    r.apuRef=ref; r.apuRefSrc=same.length>=3?`${same.length} תאים באותו ייעוד`:'כל התוכנית'; r.apuRel=r.apu&&ref?r.apu/ref:null;
    if(r.peer&&r.peer>=1.25&&r.ratio>=0.7) r.flags.push(`צפוף פי ${r.peer.toFixed(2)} מ-${r.peerN} תאים דומים`);
    if(r.apuRel&&r.apuRel>=1.15) r.flags.push(`שטח ליח"ד ${fmt(r.apu)} מ"ר — פי ${r.apuRel.toFixed(2)} מתאים דומים`);
    if(r.apuRel&&r.apuRel<=0.85) r.flags.push(`שטח ליח"ד ${fmt(r.apu)} מ"ר — נמוך (פי ${r.apuRel.toFixed(2)})`);
    if(r.flags.some(f=>!/קווי בניין/.test(f))&&(r.verdict==='✓'||r.verdict==='חסר?')) r.verdict='לבדיקה';
  }
  // plan-level summary
  const res=rows.filter(r=>/מגורים/.test(r.yiud)&&r.floors&&r.cellA);
  const impliedCov=res.length?res.reduce((s,r)=>s+cells[r.cn].above/r.floors,0)/res.reduce((s,r)=>s+r.cellA,0)*100:null;
  const cnt={}; for(const r of rows) cnt[r.verdict]=(cnt[r.verdict]||0)+1;
  const order={'✗':0,'⚠':1,'לבדיקה':2,'חסר?':3,'✓':4};
  rows.sort((p,q)=>(order[p.verdict]-order[q.verdict])||((q.ratio||0)-(p.ratio||0)));
  return {rows,cnt,impliedCov,apuPlan,thr,at:Date.now()};
}
FC.Engine={cellsFromT5,capacity,run,emptySpec,normalizeSpec,parseExc,rectGeom};

// ═══════════════════════════════════════════════════════════════════════════
// 3. UI
// ═══════════════════════════════════════════════════════════════════════════
const COL={'✗':'#e74c3c','⚠':'#f39c12','לבדיקה':'#f1c40f','חסר?':'#3498db','✓':'#27ae60'};
const LBL={'✗':'✗ לא נכנס','⚠':'⚠ תלוי בהנחות','לבדיקה':'לבדיקה','חסר?':'חסר?','✓':'✓ נכנס'};
const CSS=`
#fc-panel{display:none;flex-direction:column;width:min(600px,60vw);min-width:400px;flex-shrink:0;background:#141e2c;border-left:1px solid #2d4060;color:#d6e2f0;font-size:13px;overflow:hidden}
#fc-panel.vis{display:flex}
#fc-hdr{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#1f2e42;border-bottom:1px solid #2d4060;flex-shrink:0}
#fc-hdr h2{margin:0;font-size:14px;color:#7ecfff;flex:1;font-weight:600}
#fc-hdr button,.fc-btn{background:#2c3e55;border:1px solid #3a5070;color:#cde;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px}
.fc-run{background:#1e6b3a;border-color:#2e8b50;color:#fff;font-weight:600;padding:5px 14px}
#fc-body{overflow:auto;padding:10px 14px 30px;flex:1}
.fc-sec{margin:0 0 12px;border:1px solid #2d4060;border-radius:8px;background:#172334}
.fc-sec>summary{cursor:pointer;padding:8px 10px;font-weight:600;color:#9fd3ff;list-style:none}
.fc-sec>summary::-webkit-details-marker{display:none}
.fc-sec>summary:before{content:'▸ ';color:#6a8ab0}.fc-sec[open]>summary:before{content:'▾ '}
.fc-in{padding:4px 10px 10px}
.fc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 10px 10px}
.fc-chip{border-radius:12px;padding:2px 9px;font-size:11.5px;background:#22344d;border:1px solid #34506f}
.fc-chip.ok{border-color:#2e8b50;color:#9fe0b4}.fc-chip.no{color:#9ab;opacity:.8}.fc-chip.warn{border-color:#b9770e;color:#f7c56b}
.fc-f{display:grid;grid-template-columns:1fr 92px 58px 96px;gap:4px 8px;align-items:center;padding:5px 0;border-bottom:1px dashed #243650}
.fc-f label{font-size:12.5px}.fc-f .u{font-size:11px;color:#8aa}
.fc-f input,.fc-f select{background:#0f1824;color:#e6eef8;border:1px solid #34506f;border-radius:5px;padding:3px 6px;font-size:12.5px;width:100%;box-sizing:border-box}
.fc-f input.conf{border-color:#2e8b50;background:#12281b}
.fc-hint{grid-column:1/-1;font-size:11px;color:#7f93aa;margin-top:-2px}
.fc-g{display:grid;grid-template-columns:1fr 70px 1.1fr;gap:4px 8px;align-items:center;padding:5px 0;border-bottom:1px dashed #243650}
.fc-g input{background:#0f1824;color:#e6eef8;border:1px solid #34506f;border-radius:5px;padding:3px 6px;font-size:12.5px;width:100%;box-sizing:border-box}
.fc-sum{padding:8px 10px;line-height:1.7}
.fc-cnt{display:inline-block;border-radius:10px;padding:1px 8px;margin:0 2px;color:#fff;font-weight:600;font-size:12px;cursor:pointer}
.fc-cnt.off{opacity:.35}
.fc-tbl{width:100%;border-collapse:collapse;font-size:12px}
.fc-tbl th{position:sticky;top:0;background:#1f2e42;color:#9fd3ff;font-weight:600;padding:5px 4px;text-align:right;border-bottom:1px solid #2d4060}
.fc-tbl td{padding:4px;border-bottom:1px solid #22344d;vertical-align:top}
.fc-tbl tr{cursor:pointer}.fc-tbl tr:hover td{background:#1c2c42}
.fc-v{display:inline-block;border-radius:8px;padding:1px 7px;color:#fff;font-weight:600;white-space:nowrap}
.fc-why{font-size:11px;color:#9ab;margin-top:2px}
.fc-small{font-size:11px;color:#8aa}
.fc-note{font-size:11.5px;color:#9ab;padding:6px 10px;line-height:1.55}
.fc-tw{overflow-x:auto}
.fc-bn{border-radius:8px;padding:9px 11px;margin:0 0 12px;line-height:1.55;font-size:12.5px}
.fc-bn.warn{background:#3a2a10;border:2px solid #f0b429}.fc-bn.ok{background:#12301f;border:2px solid #2e8b50}
.fc-bn-h{font-weight:700;font-size:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.fc-bn-c{font-weight:600;font-size:12px;background:rgba(255,255,255,.12);border-radius:10px;padding:1px 8px}
.fc-bn-l{margin-top:6px}
.fc-cf{display:flex;align-items:center;gap:4px;background:#2a2410;border:1px solid #6b5a1e;color:#f7c56b;border-radius:5px;padding:2px 6px;cursor:pointer;font-size:11.5px;white-space:nowrap}
.fc-cf input{margin:0;cursor:pointer}
.fc-cf.on{background:#12301f;border-color:#2e8b50;color:#9fe0b4}
.fc-fh{border-bottom:1px solid #34506f;padding-bottom:3px}.fc-fh span{font-size:11px;color:#8aa;font-weight:600}
.fc-topic{border:1px solid #6b5a1e;border-right:4px solid #f0b429;border-radius:7px;padding:7px 10px 8px;margin:8px 0;background:#1a1f22}
.fc-topic.done{border-color:#2e6b44;border-right-color:#2e8b50;background:#14231b}
.fc-th{display:flex;align-items:center;gap:8px;justify-content:space-between}.fc-th b{font-size:13.5px;color:#e6eef8}
.fc-tr{display:grid;grid-template-columns:1fr 92px 46px;gap:4px 8px;align-items:center;padding:4px 0}
.fc-tr-t{grid-template-columns:1fr}
.fc-tl{font-size:12.5px}
.fc-tr input,.fc-tr select{background:#0f1824;color:#e6eef8;border:1px solid #34506f;border-radius:5px;padding:3px 6px;font-size:12.5px;width:100%;box-sizing:border-box}
.fc-tpl{font-size:12.5px;line-height:2}.fc-tpl input.sm{width:62px;display:inline-block;margin:0 3px}
.fc-opt{border:1px dashed #34506f;border-radius:6px;padding:4px 8px;margin-top:6px}
.fc-opt-h{font-size:11px;color:#8aa;margin-bottom:2px}
body.theme-light .fc-topic{background:#fffdf5;border-color:#e0c26b;border-right-color:#f0b429}
body.theme-light .fc-topic.done{background:#f3fbf5;border-color:#9fd3b0;border-right-color:#2e8b50}
body.theme-light .fc-th b{color:#1a3560}
body.theme-light .fc-tr input,body.theme-light .fc-tr select{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .fc-opt{border-color:#cfd9e6}
body.theme-light .fc-bn.warn{background:#fff6dc;color:#4a3500}
body.theme-light .fc-bn.ok{background:#e9f7ee;color:#10391f}
body.theme-light .fc-bn-c{background:rgba(0,0,0,.07)}
body.theme-light .fc-cf{background:#fff8e6;color:#7a5a00;border-color:#e0c26b}
body.theme-light .fc-cf.on{background:#e9f7ee;color:#1e6b3a;border-color:#2e8b50}
.fc-tbl th{white-space:nowrap}
.fc-x{cursor:pointer;border-bottom:1px dotted #6a8ab0}.fc-x:hover{color:#7ecfff}
.fc-info{background:#2a4a6e;border:1px solid #3d6a9a;color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px}
.t5v-fc-hdr{white-space:nowrap}
.t5v-fc-x{cursor:pointer}.t5v-fc-x:hover{outline:1px dashed #6a8ab0}
#fc-pop{display:none;position:fixed;inset:0;background:rgba(5,12,22,.55);z-index:9000;align-items:center;justify-content:center}
#fc-pop.vis{display:flex}
#fc-pop .fcx-box{width:min(760px,94vw);max-height:88vh;display:flex;flex-direction:column;background:#141e2c;color:#d6e2f0;border:1px solid #3d6a9a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);direction:rtl}
#fc-pop .fcx-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1f2e42;border-bottom:1px solid #2d4060;border-radius:10px 10px 0 0}
#fc-pop .fcx-hd b{flex:1;color:#7ecfff;font-size:14px}
#fc-pop .fcx-hd button{background:#2c3e55;border:1px solid #3a5070;color:#cde;border-radius:6px;padding:3px 10px;cursor:pointer}
#fc-pop .fcx-bd{overflow:auto;padding:12px 16px 20px;font-size:13px;line-height:1.6}
.fcx-intro{background:#1a2a40;border:1px solid #2d4060;border-radius:8px;padding:8px 10px;margin-bottom:10px}
.fcx-sec{border-top:1px solid #2d4060;padding:8px 0 10px}
.fcx-sec.on{background:#1b2d45;border:1px solid #f1c40f;border-radius:8px;padding:8px 10px}
.fcx-sec h4{margin:0 0 6px;color:#9fd3ff;font-size:13.5px}
.fcx-eq{background:#0f1824;border:1px solid #2d4060;border-radius:6px;padding:6px 10px;margin:6px 0;font-family:inherit}
.fcx-w{font-size:12px;color:#9fb2c8;margin-top:3px}
.fcx-t{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0}
.fcx-t th,.fcx-t td{border:1px solid #2d4060;padding:3px 6px;text-align:right;white-space:nowrap}
.fcx-t th{background:#1f2e42;color:#9fd3ff}.fcx-t td.fcx-w{white-space:normal}
.fcx-t tr.s td{background:#1d3a2a}
body.theme-light #fc-pop .fcx-box{background:#fff;color:#1c2b3c;border-color:#8fb0d6}
body.theme-light #fc-pop .fcx-hd{background:#e6edf5;border-color:#bfccdb}
body.theme-light #fc-pop .fcx-hd b{color:#1a3560}
body.theme-light .fcx-intro{background:#eef3f9;border-color:#cfd9e6}
body.theme-light .fcx-sec{border-color:#dde5ef}
body.theme-light .fcx-sec.on{background:#fffbe6}
body.theme-light .fcx-sec h4{color:#1a3560}
body.theme-light .fcx-eq{background:#f6f9fc;border-color:#cfd9e6}
body.theme-light .fcx-w{color:#4a5d73}
body.theme-light .fcx-t th{background:#e6edf5;color:#1a3560}
body.theme-light .fcx-t th,body.theme-light .fcx-t td{border-color:#cfd9e6}
body.theme-light .fcx-t tr.s td{background:#e3f4e8}
body.theme-light #fc-panel{background:#f4f7fb;color:#1c2b3c;border-left-color:#bfccdb}
body.theme-light #fc-hdr{background:#e6edf5;border-color:#bfccdb}
body.theme-light #fc-hdr h2{color:#1a3560}
body.theme-light .fc-sec{background:#fff;border-color:#cfd9e6}
body.theme-light .fc-sec>summary{color:#1a3560}
body.theme-light .fc-f input,body.theme-light .fc-f select,body.theme-light .fc-g input{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .fc-f input.conf{background:#eaf7ee;border-color:#2e8b50}
body.theme-light .fc-tbl th{background:#e6edf5;color:#1a3560}
body.theme-light .fc-tbl tr:hover td{background:#eef3f9}
body.theme-light .fc-chip{background:#eef3f9;border-color:#cfd9e6;color:#1c2b3c}
body.theme-light #fc-hdr button,body.theme-light .fc-btn{background:#fff;color:#1a3560;border-color:#bfccdb}
body.theme-light .fc-run{background:#1e6b3a;color:#fff}
`;

function _ensureDom(){
  if($('fc-panel')) return true;
  const main=$('main-area'), wrap=$('canvas-wrap'); if(!main||!wrap) return false;
  _css();
  const p=document.createElement('div'); p.id='fc-panel';
  p.innerHTML=`<div id="fc-hdr"><h2>🏗 בקרת בינוי — האם הזכויות נכנסות בתאים</h2>
    <button class="fc-info" onclick="FC.explainMethod()">ⓘ איך זה עובד</button>
    <button onclick="FC.close()">✕ סגירה</button></div><div id="fc-body"></div>`;
  main.insertBefore(p,wrap); return true;
}
const _resize=()=>{ try{ if(typeof resize==='function') resize(); }catch(e){} };
const _redraw=()=>{ try{ if(typeof redraw==='function') redraw(); }catch(e){} };
function curPlan(){ try{ return (typeof _projPlanNumber==='function'&&_projPlanNumber())||''; }catch(e){ return ''; } }

FC.openPanel=function(){
  if(!_ensureDom()) return;
  try{ if($('rn-panel')&&$('rn-panel').style.display==='flex'&&typeof closeRoadNetPanel==='function') closeRoadNetPanel(); }catch(e){}
  try{ if($('t5-panel')&&$('t5-panel').classList.contains('vis')) closeTable5View(); }catch(e){}
  try{ if($('tama-panel')&&$('tama-panel').classList.contains('vis')) closeTamaView(); }catch(e){}
  try{ if(root.PR&&PR.open) PR.close(); }catch(e){}
  if($('legend')) $('legend').style.display='none';
  $('fc-panel').classList.add('vis'); const b=$('btn-fc'); if(b) b.classList.add('active');
  FC.open=true; if(!FC.spec.plan) FC.spec.plan=curPlan();
  FC.ensure(); FC.render(); _resize(); _redraw();
};
FC.close=function(){
  const p=$('fc-panel'); if(p) p.classList.remove('vis');
  if($('legend')) $('legend').style.display='';
  const b=$('btn-fc'); if(b) b.classList.remove('active');
  FC.open=false; _resize(); _redraw();
};
FC.toggle=function(){ FC.open?FC.close():FC.openPanel(); };

// ── data from the viewer ──
function featIndex(){ const idx={}; const L=state.layers&&state.layers.plan; if(!L) return idx;
  for(const f of L.features){ const n=String(f.properties.NUM??'').trim(); if(n) (idx[n]=idx[n]||[]).push(f); } return idx; }
function geomOf(idx){ return cn=>{ const fs=idx[cn]; if(!fs||!fs.length) return null;
  let g=null; try{ g=_calcBuildGeom(fs[0]); }catch(e){ return null; }
  if(!g) return null;
  if(g.noLines&&g.per0==null){ try{ g.per0=cellPerimeter(fs[0]); }catch(e){} }
  return g; }; }
FC.ensure=function(force){
  if(!state.table5||!state.layers||!state.layers.plan){ FC.res=null; return null; }
  if(!force&&FC.res&&FC._t5===state.table5&&FC._plan===state.layers.plan&&FC._sig===JSON.stringify(FC.spec)) return FC.res;
  FC._cells=cellsFromT5(state.table5); FC._idx=featIndex();
  FC.res=run(FC.spec,FC._cells,geomOf(FC._idx));
  FC._t5=state.table5; FC._plan=state.layers.plan; FC._sig=JSON.stringify(FC.spec);
  FC._by=Object.fromEntries(FC.res.rows.map(r=>[r.cn,r]));
  return FC.res;
};
FC.resultFor=function(cn){ try{ if(!FC.ensure()) return null; return FC._by[String(cn)]||null; }catch(e){ return null; } };

// ── form events (indices only in handlers — no Hebrew text inside onclick) ──
function _coreStatus(){ const need=_activeTopics(); return {need,done:need.filter(topicDone)}; }
function _noLinesPlan(){ const arc=state.layers&&state.layers.arc; return !arc||!arc.features.some(f=>typeof _isBuildLine==='function'&&_isBuildLine(f.properties.MAVAT_CODE)); }
FC.gotoForm=function(){ const d=$('fc-sec-rules'); if(!d) return; d.open=true; d.scrollIntoView({behavior:'smooth',block:'start'}); };
function _annexLine(){
  const md=(state.mavatDocs||{}).binui, has=!!(state.files&&state.files.binui&&state.files.binui.length);
  const rule=`בודקים בטבלה 1.7 בתקנון ("מסמכי התכנית"): אם נספח הבינוי <b>"מחייב חלקית"</b> לעניין קווי בניין, מספר מבנים, מיקום או מספר מגדלים, או קומות —
    צריך לעיין בו ולמלא את השדות המתאימים בטופס (ר' "כללים לקבוצות תאים" ו"נסיגה אחידה"). נספח <b>רקע</b> — לא נדרש לבדיקה.`;
  if(!has) return `<div class="fc-bn-l">📄 <b>נספח הבינוי לא נטען.</b> ${rule} אפשר לטעון אותו מהחיווי מתחת לשם התוכנית ("⬇ נספח בינוי").</div>`;
  const st=md&&md.section?(/נספחים/.test(md.section)?'<b>נספח מחייב</b> (במבא"ת תחת "נספחים")':'<b>מסמך רקע</b> — לא מחייב'):'מעמד לא ידוע';
  return `<div class="fc-bn-l">📄 <b>נספח הבינוי נטען</b> — ${st}${md&&md.title?`: "${E(md.title)}"`:''}. ${rule}</div>`;
}
function _banner(){
  const {need,done}=_coreStatus(), all=done.length===need.length, none=!done.length;
  const nl=_noLinesPlan();
  return `<div class="fc-bn ${all?'ok':'warn'}">
    <div class="fc-bn-h">${all?'✅ בדיקה לפי כללי התוכנית':none?'⚠ בדיקה ראשונית — לפי ברירות מחדל בלבד':'⚠ בדיקה חלקית — חלק מהכללים עדיין ברירת מחדל'}
      <span class="fc-bn-c">נבדקו ${done.length} מתוך ${need.length} נושאים</span></div>
    ${all?`<div class="fc-bn-l">כל כללי התוכנית נבדקו מול התקנון. אם נספח הבינוי מחייב לעניין מספר מבנים או מגדלים — ודאו שמולאו גם "כללים לקבוצות תאים".</div>`
      :`<div class="fc-bn-l">הממשק עשה את החלק האוטומטי (טבלה 5 + קווי הבניין מהתשריט). <b>את כללי התוכנית הוא לא יודע לקרוא מהתקנון — צריך להזין אותם.</b>
        עד אז התוצאות מבוססות על ברירות המחדל של תקנון המאסטר, ואינן יכולות לתת ✗. עוברים על ${need.length} נושאים מול התקנון (בערך 5–10 דקות):
        לכל נושא מופיע איפה לחפש; אחרי הבדיקה מסמנים "בדקתי בתקנון" (גם אם הערכים נשארים כמו שהם).</div>
        <button class="fc-btn fc-run" style="margin-top:6px" onclick="FC.gotoForm()">מלאו את כללי התוכנית ←</button>`}
    ${nl?(FC.spec.f.setback!=null&&FC.spec.f.setback!==''
      ?`<div class="fc-bn-l">ℹ אין קווי בניין בתשריט — הוזנה נסיגה אחידה של ${E(FC.spec.f.setback)} מ'. המעטפה מקורבת, ולכן תאים שלא נכנסים יסומנו ⚠ ולא ✗.</div>`
      :`<div class="fc-bn-l" style="color:#ffb3a7">⛔ <b>אין קווי בניין בתשריט של התוכנית הזו.</b> כנראה שהם בנספח הבינוי — מלאו "נסיגה אחידה מגבול התא", אחרת המעטפה היא התא כולו וכמעט כל תא ייראה כנכנס.</div>`):''}
    ${_annexLine()}
  </div>`;
}
FC.setG=function(i,part,el){ const x=GROUPS[i]; const g=FC.spec.g[x.k];
  if(part==='def') g.def=el.value===''?null:+el.value; else g.exc=el.value; FC._dirty=true; };
FC.setA=function(i,el){ const x=ASSUME[i]; FC.spec.a[x.k]=el.value===''?x.def:+el.value; FC._dirty=true; };
FC.resetForm=function(){ const p=FC.spec.plan; FC.spec=emptySpec(); FC.spec.plan=p; FC.res=null; FC.ensure(true); FC.render(); _redraw(); };
FC.runNow=function(){ FC.ensure(true); FC._dirty=false; FC.render(); _redraw(); };
FC.setFilter=function(f){ FC.filter=FC.filter===f?'all':f; FC.render(); };
FC.focus=function(cn){ FC.sel=cn; try{
  const fs=FC._idx&&FC._idx[cn]; if(!fs||typeof dc!=='function') return;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const f of fs){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates; for(const p of P) for(const [x,y] of p[0]){ x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} }
  const W=wrap.clientWidth,H=wrap.clientHeight, mpu=(typeof _mPerUnit==='function'&&_mPerUnit())||1;
  const span=Math.max((x1-x0)/0.3,(y1-y0)/0.3*W/H,300/mpu), target=W/span;
  const cx=(x0+x1)/2, cy=(y0+y1)/2; let [sx,sy]=dc(cx,cy); zoomAt(sx,sy,target/scale);
  [sx,sy]=dc(cx,cy); viewX+=W/2-sx; viewY+=H/2-sy; _redraw(); }catch(e){} };

function _autoChips(){
  const t5=state.table5||{}, rows=Object.values(t5).flat();
  const has=k=>rows.some(r=>r[k]&&String(r[k]).trim()!=='');
  const arc=state.layers&&state.layers.arc, bl=arc?arc.features.filter(f=>typeof _isBuildLine==='function'&&_isBuildLine(f.properties.MAVAT_CODE)).length:0;
  const chip=(ok,txt,warn)=>`<span class="fc-chip ${ok?'ok':warn?'warn':'no'}">${ok?'✓':warn?'⚠':'—'} ${txt}</span>`;
  return `<div class="fc-chips">
    ${chip(true,`טבלה 5 (${Object.keys(t5).length} תאים)`)}
    ${chip(bl>0,bl>0?`קווי בניין בתשריט (${bl})`:'אין קווי בניין בתשריט — מלאו "נסיגה אחידה"',bl===0)}
    ${chip(has('tachsit'),'תכסית בטבלה')}${chip(has('maxBld'),'מספר מבנים מרבי בטבלה')}${chip(has('gova'),"גובה (מ') בטבלה")}
  </div>`;
}
// ── הטופס מקובץ לפי נושאים: נושא = סעיף אחד בתקנון, עם "בדקתי בתקנון" אחד לכל הנושא ──
// row.f = שדה יחיד; row.tpl = משפט עם שדות בתוכו ({k}); row.opt = "אם התוכנית מפצלת"; row.when = מוצג רק בתנאי
const TOPICS=[
  {id:'thr',title:'סף מרקמי',where:'1.9 הגדרות · הערות לטבלה 5',say:'"בניין פשוט/מרקמי — שאינו רב-קומות … ועד X קומות". מאסטר: 10. רב-קומות = מעל 29 מ\' מהכניסה לקומה העליונה',
    rows:[{label:'קומות מרביות למבנה מרקמי',f:'marakmiMaxFloors'}]},
  {id:'dist',title:'מרחקים בין מבנים',where:'6.1.1 "הוראות להעמדת מבנים" · 4.1.2 · לפעמים 6.3 / 6.4',say:'"המרחק בין שני מבנים … יהיה לפחות". מאסטר: 8 / 10 / 15 מ\', ועוד 1 מ\' לכל קומה מעל 25',
    rows:[{label:'מרקמי – מרקמי',f:'dMM'},{label:'מרקמי – רב-קומות',f:'dMT'},{label:'רב-קומות – רב-קומות',f:'dTT'},
      {opt:true,label:'תוספת בין רבי-קומות גבוהים',tpl:"{dTTadd} מ' לכל קומה מעל קומה {dTTabove}"},
      {opt:true,label:'מרחק שונה בין חזיתות ארוכות (מרקמי – מרקמי)',f:'dMMlong'},
      {opt:true,label:'מרחק מופחת למבנים נמוכים',tpl:"{dMMlow} מ' בין מבנים של עד {dMMlowUpTo} קומות"}]},
  {id:'cov',title:'תכסית מרבית עילית',where:'עמודת תכסית בטבלה 5 · הערות לטבלה · פרק 4',say:'"תכסית … לא תעלה על". אם יש עמודה בטבלה 5 — היא נקלטת אוטומטית, והשדה נשאר ריק',
    rows:[{label:'תכסית מרבית (אם אינה בטבלה 5)',f:'coverage'}]},
  {id:'free',title:'שטח שחייב להישאר פנוי / מגונן',where:'6.1 נטיעות · 6.5 פיתוח · פרק ניהול הנגר',say:'"לפחות X% משטח התא יהיה פנוי מבינוי / מגונן / מחלחל"',
    rows:[{label:'אחוז מהתא',f:'freePct'}]},
  {id:'pb',title:'שטחים משותפים לכל בניין',where:'הערות לטבלה 5 · 4.1.2',say:'"לכל בניין תותר תוספת של X מ"ר…" (תוספת) / "מתוך השטחים בטבלה, לכל מבנה X מ"ר…" (חובה מתוך הטבלה)',
    rows:[{label:'איך התקנון מתייחס אליהם',f:'pbMode'},
      {when:'add',label:'תוספת לכל מבנה מרקמי',f:'pbMarakmi'},{when:'add',label:'תוספת לכל רב-קומות (ריק = כמו מרקמי)',f:'pbTower'},
      {when:'add',label:'התוספת לא חלה על הייעודים (שמות כמו בטבלה 5, מופרדים בפסיק)',f:'pbExcept'}]},
  {id:'bonus',title:'תוספת זכויות מחוץ לטבלה',where:'הערות לטבלה 5 · פרק 6',say:'למשל "תתאפשר תוספת של 5% ליח"ד ולזכויות". מרפסות — לא כאן (הן מחוץ למעטפה)',
    rows:[{label:'תוספת כללית',f:'bonusPct'}]},
  {id:'setback',title:'נסיגה אחידה מגבול התא',where:'נספח הבינוי · הערות לטבלה 5 ("קווי הבניין לפי נספח הבינוי")',say:'רק לתוכנית שאין בתשריט שלה קווי בניין. מספר אחד מקורב — התוצאה תסומן ⚠',
    onlyNoLines:true,rows:[{label:'נסיגה מגבול התא',f:'setback'}]},
];
const FIDX=Object.fromEntries(FIELDS.map((x,i)=>[x.k,i]));
const topicKeys=T=>T.rows.flatMap(r=>r.f?[r.f]:(r.tpl.match(/\{(\w+)\}/g)||[]).map(s=>s.slice(1,-1)));
const topicOf=k=>TOPICS.find(T=>topicKeys(T).includes(k));
const topicDone=T=>!!FC.spec.conf['t:'+T.id];
function _activeTopics(){ return TOPICS.filter(T=>!T.onlyNoLines||_noLinesPlan()); }
FC.setF=function(i,el){ const x=FIELDS[i]; let v=el.value;
  if(x.type!=='sel'&&x.type!=='text') v=v===''?null:+v;
  FC.spec.f[x.k]=v; const T=topicOf(x.k); if(T){ FC.spec.conf['t:'+T.id]=true; for(const k of topicKeys(T)) FC.spec.conf[k]=true; }
  FC._dirty=true; FC.render(); };
FC.confT=function(ti){ const T=TOPICS[ti], on=!topicDone(T); FC.spec.conf['t:'+T.id]=on;
  for(const k of topicKeys(T)) { if(on) FC.spec.conf[k]=true; else delete FC.spec.conf[k]; } FC._dirty=true; FC.render(); };
function _inp(k,small){ const i=FIDX[k], x=FIELDS[i], v=FC.spec.f[k];
  if(x.type==='sel') return `<select onchange="FC.setF(${i},this)">${x.opts.map(o=>`<option value="${o[0]}"${v===o[0]?' selected':''}>${E(o[1])}</option>`).join('')}</select>`;
  return `<input class="${small?'sm':''}" ${x.type==='text'?'':'type="number" step="any"'} value="${E(v??'')}" placeholder="${x.def==null?'לא נקבע':''}" onchange="FC.setF(${i},this)">`; }
function _fieldsHtml(){
  const F=FC.spec.f;
  const intro=`<div class="fc-note"><b>לכל נושא:</b> מוצאים את הסעיף בתקנון (המיקום כתוב בראש הנושא), מתקנים ערכים אם צריך, ומסמנים <b>"בדקתי בתקנון"</b>.
    אם התקנון לא מתייחס לנושא — משאירים את ברירת המחדל (או שדה ריק) ומסמנים. נושא שלא סומן נחשב <b>ברירת מחדל שלא נבדקה</b>.</div>`;
  return intro+_activeTopics().map(T=>{ const ti=TOPICS.indexOf(T), done=topicDone(T);
    const rows=T.rows.filter(r=>!r.when||F.pbMode===r.when);
    const main=rows.filter(r=>!r.opt), opt=rows.filter(r=>r.opt);
    const line=r=>{ if(r.tpl){ const html=E(r.tpl).replace(/\{(\w+)\}/g,(m,k)=>_inp(k,true));
        return `<div class="fc-tr fc-tr-t"><span class="fc-tl">${E(r.label)}</span><span class="fc-tpl">${html}</span></div>`; }
      const x=FIELDS[FIDX[r.f]];
      return `<div class="fc-tr"><span class="fc-tl">${E(r.label)}</span>${_inp(r.f)}<span class="u">${E(x.unit||'')}</span></div>`; };
    const pbNote=T.id==='pb'&&F.pbMode!=='add'?`<div class="fc-hint">${F.pbMode==='deduct'?'"חובה מתוך הטבלה" — השטח כבר בתוך הזכויות, אין מה להוסיף.':'"כלולים בטבלה" — אין תוספת לכל בניין.'} אם התקנון נותן תוספת לכל בניין — בחרו "תוספת מעל הטבלה" ויופיעו שדות הסכום.</div>`:'';
    return `<div class="fc-topic${done?' done':''}">
      <div class="fc-th"><b>${E(T.title)}</b>
        <label class="fc-cf${done?' on':''}" title="${done?'נבדק מול התקנון. לחיצה מבטלת.':'עדיין ברירת מחדל — לא נבדק מול התקנון'}"><input type="checkbox"${done?' checked':''} onchange="FC.confT(${ti})"> בדקתי בתקנון</label></div>
      <div class="fc-hint">איפה בתקנון: ${E(T.where)} · ${E(T.say)}</div>
      ${main.map(line).join('')}${pbNote}
      ${opt.length?`<div class="fc-opt"><div class="fc-opt-h">אם התוכנית מפצלת / מוסיפה — ${T.id==='dist'?'רוב התוכניות לא':'לא חובה'}:</div>${opt.map(line).join('')}</div>`:''}
    </div>`; }).join('');
}
function _groupsHtml(){
  return `<div class="fc-note">ערך אחד חל על כל תאי המגורים; בשדה החריגים — "תא:ערך" מופרדים בפסיק (למשל <b>404:2, 602:3</b>).</div>`+
    GROUPS.map((x,i)=>{ const g=FC.spec.g[x.k];
      return `<div class="fc-g"><label>${E(x.label)}</label>
        <input type="number" step="1" value="${E(g.def??'')}" placeholder="ריק" onchange="FC.setG(${i},'def',this)">
        <input value="${E(g.exc||'')}" placeholder="חריגים: תא:ערך, …" onchange="FC.setG(${i},'exc',this)">
        <div class="fc-hint">${E('איפה: '+x.where+' · '+x.say)}</div></div>`; }).join('');
}
function _assumeHtml(){
  return `<div class="fc-note">הנחות — לא מהתוכנית. תוצאה שנכשלת רק בגללן מסומנת ⚠ ולא ✗.
    שטח קומת מגדל = יח"ד בקומה × (שטח דירה + גרעין לפי טבלת המאסטר).</div>`+
    ASSUME.map((x,i)=>`<div class="fc-f"><label>${E(x.label)}</label>
      <input type="number" step="any" value="${E(FC.spec.a[x.k])}" onchange="FC.setA(${i},this)"><span class="u">${E(x.unit)}</span></div>`).join('');
}
function _resultsHtml(){
  const R=FC.res; if(!R) return '<div class="fc-note">אין תוצאות — טבלה 5 או התשריט לא נטענו.</div>';
  const unconf=['dMM','dMT','dTT','freePct'].filter(k=>!FC.spec.conf[k]).length;
  const cov=R.impliedCov;
  const ORD=['✗','⚠','לבדיקה','חסר?','✓'];
  const cnts=ORD.filter(k=>R.cnt[k]).map(k=>{ const i=String(ORD.indexOf(k));
    return `<span class="fc-cnt${FC.filter!=='all'&&FC.filter!==i?' off':''}" style="background:${COL[k]}" onclick="FC.setFilter('${i}')">${E(LBL[k])} ${R.cnt[k]}</span>`; }).join(' ');
  const flt=FC.filter==='all'?null:ORD[+FC.filter];
  const rows=R.rows.filter(r=>!flt||r.verdict===flt);
  return `<div class="fc-sum">${cnts}
    <div class="fc-small">${R.rows.length} תאים נבדקו · שטח ליח"ד (חציון): ${fmt(R.apuPlan)} מ"ר ·
      תכסית משתמעת (מגורים): ${cov!=null?cov.toFixed(0)+'%':'—'} <span title="זכויות מעל הקרקע חלקי מספר הקומות בטבלה חלקי שטח התאים. מספר הקומות בטבלה הוא לרוב תקרת המבנה הגבוה בתא, ולכן זו הערכת חסר של התכסית בפועל — לא להשוות ישירות לסף 40% של המאסטר.">ⓘ</span></div>
    ${unconf?`<div class="fc-small" style="color:#f7c56b">⚠ ${unconf} מכללי המרחקים/השטח הפנוי עדיין לא נבדקו מול התקנון — הם לא יכולים לתת ✗ עד שיסומנו "בדקתי בתקנון".</div>`:''}
    ${FC._dirty?'<div class="fc-small" style="color:#f7c56b">הטופס שונה — לחצו "▶ בדיקה" לעדכון.</div>':''}</div>
    <div class="fc-small" style="padding:0 10px 6px">לחיצה על שורה מתמקדת בתא במפה · <b>לחיצה על נתון</b> (מסומן בקו מנוקד) פותחת תחקור מלא של החישוב.</div>
    <div class="fc-tw"><table class="fc-tbl"><thead><tr><th>תא</th><th>ייעוד</th><th>קומות</th><th>זכויות מעל<br>הקרקע (מ"ר)</th><th>קיבולת<br>מחושבת (מ"ר)</th><th>ניצול</th><th>תוצאה</th></tr></thead><tbody>
    ${rows.map(r=>{ const c=E(r.cn), x=(f,v)=>`<span class="fc-x" onclick="FC.explain('${c}','${f}',event)">${v}</span>`;
      return `<tr onclick="FC.focus('${c}')"><td><b>${c}</b></td><td>${E(r.yiud)}</td><td>${x('floors',r.floors||'—')}</td>
      <td>${x('need',fmt(r.need))}</td><td>${x('cap',fmt(r.cap))}</td><td>${x('ratio',r.ratio?Math.round(r.ratio*100)+'%':'—')}</td>
      <td><span class="fc-v fc-x" style="background:${COL[r.verdict]}" onclick="FC.explain('${c}','verdict',event)">${E(LBL[r.verdict])}</span>
        <div class="fc-why">${E(r.why||'')}${r.flags.length?'<br>• '+r.flags.map(E).join('<br>• '):''}</div></td></tr>`; }).join('')}
    </tbody></table></div>`;
}
FC.render=function(){
  if(!$('fc-body')) return;
  if(!state.table5){ $('fc-body').innerHTML='<div class="fc-note">צריך טבלה 5 לתוכנית הזו (ר׳ החיווי מתחת לשם התוכנית).</div>'; return; }
  const scroll=$('fc-body').scrollTop;
  const cs=_coreStatus(), incomplete=cs.done.length<cs.need.length;
  $('fc-body').innerHTML=`${_banner()}
    <details class="fc-sec"><summary>1. מה הממשק מצא אוטומטית</summary>${_autoChips()}</details>
    <details class="fc-sec" id="fc-sec-rules"${incomplete?' open':''}><summary>2. כללי התוכנית — <span style="color:#f7c56b">למלא מהתקנון</span> <span class="fc-small">(ערך אחד לכל התוכנית)</span></summary><div class="fc-in">${_fieldsHtml()}</div></details>
    <details class="fc-sec"><summary>3. כללים לקבוצות תאים <span class="fc-small">— אם התקנון או נספח מחייב קובעים מספר מבנים / רבי-קומות / חובת מרקמי</span></summary><div class="fc-in">${_groupsHtml()}</div></details>
    <details class="fc-sec"><summary>4. הנחות (מתקדם — לא חובה)</summary><div class="fc-in">${_assumeHtml()}</div></details>
    <div style="display:flex;gap:8px;margin:0 0 10px"><button class="fc-btn fc-run" onclick="FC.runNow()">▶ בדיקה</button>
      <button class="fc-btn" onclick="FC.resetForm()">איפוס הטופס</button></div>
    <details class="fc-sec" open><summary>תוצאות ${incomplete?'<span style="color:#f7c56b">— בדיקה ראשונית (ברירות מחדל)</span>':'— לפי כללי התוכנית'}</summary>${_resultsHtml()}
      <div class="fc-note">✗ לא נכנס גם בהנחות המקילות (רק כללי התוכנית מכשילים) · ⚠ לא נכנס בהנחות הרגילות · לבדיקה = חריג מול תאים דומים באותה תוכנית ·
      חסר? = הזכויות מנצלות פחות מחצי מהקיבולת · ✓ נמצא תרחיש שמכיל את הזכויות. הקיבולת היא חסם עליון (לא תכנון בינוי).</div></details>`;
  $('fc-body').scrollTop=scroll;
};

// ── map layer: colour every checked cell by its result ──
FC.drawLayer=function(ctx){
  if(!FC.open||!FC.res||!FC._idx||typeof dc!=='function') return;
  ctx.save();
  for(const r of FC.res.rows){ const fs=FC._idx[r.cn]; if(!fs) continue;
    for(const f of fs){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      ctx.beginPath(); for(const p of P) for(const ring of p){ ring.forEach(([x,y],i)=>{ const [sx,sy]=dc(x,y); i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy); }); ctx.closePath(); }
      ctx.fillStyle=COL[r.verdict]+'70'; ctx.fill('evenodd');
      ctx.lineWidth=FC.sel===r.cn?4:1.6; ctx.strokeStyle=FC.sel===r.cn?'#00e0ff':COL[r.verdict]; ctx.stroke(); } }
  ctx.restore();
};
// ── cell card (showInfo) ──
FC.cellInfoHtml=function(cn){
  if(!FC.res) return ''; const r=FC._by&&FC._by[String(cn)]; if(!r) return '';
  return `<div style="margin-top:8px;padding:6px 8px;border-radius:6px;border:1px solid ${COL[r.verdict]}">
    <b>🏗 בקרת בינוי:</b> <span style="color:${COL[r.verdict]};font-weight:700">${E(LBL[r.verdict])}</span>
    ${r.ratio?` · ניצול ${Math.round(r.ratio*100)}%`:''}<div style="font-size:11px;opacity:.85">${E(r.why||'')}</div>
    ${r.flags.length?`<div style="font-size:11px;opacity:.85">• ${r.flags.map(E).join('<br>• ')}</div>`:''}</div>`;
};

// ── תחקור: פירוט מלא של החישוב לתא (נפתח בלחיצה על כל נתון) ──
const f1=v=>v==null||!isFinite(v)?'—':(+v).toLocaleString('he-IL',{maximumFractionDigits:1});
const pct=v=>v==null||!isFinite(v)?'—':Math.round(v*100)+'%';
const f2=v=>v==null||!isFinite(v)?'—':(+v).toLocaleString('he-IL',{maximumFractionDigits:2});
const FNAME={dMM:'מרחק מרקמי–מרקמי',dMT:'מרחק מרקמי–רב-קומות',dTT:'מרחק רב-קומות–רב-קומות',freePct:'שטח פנוי'};
function _sec(id,title,body,on){ return `<div class="fcx-sec${on?' on':''}" id="fcx-${id}"><h4>${title}</h4>${body}</div>`; }
function _eq(formula,words){ return `<div class="fcx-eq">${formula}${words?`<div class="fcx-w">${words}</div>`:''}</div>`; }
function explainHtml(r,focus){
  const x=r.x, N=r.nom, D=N?N.det:null, L=r.lo, LD=L?L.det:null, F=FC.spec.f;
  const out=[];
  out.push(`<div class="fcx-intro">הבדיקה שואלת: <b>האם אפשר לבנות בתא ${E(r.cn)} את כל השטחים שטבלה 5 נותנת לו</b>, בלי לחרוג מקווי הבניין,
    מהמרחקים בין מבנים, מהשטח שחייב להישאר פנוי ומשאר כללי התוכנית. היא מחשבת <b>כמה לכל היותר</b> אפשר לבנות בתא (קיבולת),
    ומשווה לזכויות. הקיבולת היא <b>חסם עליון</b> — לא תכנון בינוי: אם הזכויות גדולות ממנה, אין סידור בינוי שמכיל אותן.</div>`);
  // 1. demand
  const rowsT=(x.det||[]).map(d=>`<tr><td>${E(d.use)}</td><td>${d.koll!=null?'—':fmt(d.ikari)}</td><td>${d.koll!=null?'—':fmt(d.sherut)}</td><td>${d.koll!=null?fmt(d.koll):'—'}</td><td><b>${fmt(d.above)}</b></td><td>${d.units||''}</td><td>${d.floors||''}</td></tr>`).join('');
  let need=`<table class="fcx-t"><tr><th>שימוש</th><th>עיקרי מעל</th><th>שירות מעל</th><th>סה"כ מעל</th><th>נספר</th><th>יח"ד</th><th>קומות</th></tr>${rowsT}
    <tr class="s"><td>סה"כ</td><td></td><td></td><td></td><td><b>${fmt(x.above)}</b></td><td>${x.units||''}</td><td>${x.floors||''}</td></tr></table>
    <div class="fcx-w">נספרים רק השטחים <b>מעל הכניסה הקובעת</b> (מה שמתחת — מרתפים — לא תופס את קרקע התא מעל הקרקע). כל השימושים בתא נספרים יחד,
    כי הם נבנים באותם מבנים.</div>`;
  if(D){
    const parts=[`${fmt(x.above)}`];
    if(D.bonus) parts[0]+=` × (1 + ${D.bonus}%)`;
    if(D.scale!==1) parts[0]+=` × ${D.scale} (ניפוח בדיקה)`;
    if(D.addOn) parts.push(`${N.n} מבנים × ${fmt(N.k?D.addT:D.addM)} מ"ר`);
    need+=_eq(parts.length>1||D.bonus||D.scale!==1?`${parts.join(' + ')} = <b>${fmt(N.need)} מ"ר</b>`:`הנדרש = <b>${fmt(N.need)} מ"ר</b>`,
      (D.bonus?`תוספת ${D.bonus}% מחוץ לטבלה (שדה "תוספת זכויות"). `:'')+
      (D.addOn?`"שטחים משותפים לכל בניין" במצב <b>תוספת</b> — לכל מבנה בתרחיש נוספים ${fmt(D.addM)} מ"ר (ברב-קומות ${fmt(D.addT)}); לכן הנדרש תלוי במספר המבנים.`
        :(F.pbMode==='add'?`התוספת לכל בניין לא חלה על הייעוד "${E(x.yiud)}".`:'השטחים המשותפים כלולים בטבלה — אין תוספת לכל בניין.')));
  }
  out.push(_sec('need','1. הזכויות הנדרשות (מטבלה 5)',need,focus==='need'));
  if(!D){ out.push(_sec('verdict','התוצאה',`<div class="fcx-w">${E(r.why||'')}</div>`,true)); return out.join(''); }
  // 2. land budget
  const lim=[['המעטפה — השטח בתוך קווי הבניין',D.env,r.noLines?(r.approx?'אין קווי בניין בתשריט — הערכה לפי מלבן שווה-ערך':'אין קווי בניין בתשריט — נלקח התא כולו'):"נמדד על התשריט: כל אזור בתוך קווי הבניין ברוחב 8 מ' לפחות (בלי רצועות הנסיגה)"],
    [`התא פחות השטח שחייב להישאר פנוי (${D.free}%)`,D.freeCap,`${fmt(D.cellA)} × (1 − ${D.free}%)`],
    ...(D.covCap!=null?[[`תכסית מרבית ${D.cov}% (${D.covSrc})`,D.covCap,`${fmt(D.cellA)} × ${D.cov}%`]]:[])];
  const mn=Math.min(...lim.map(l=>l[1]));
  out.push(_sec('land','2. כמה קרקע אפשר לכסות במבנים',`<table class="fcx-t"><tr><th>מגבלה</th><th>מ"ר</th><th>איך</th></tr>
    ${lim.map(l=>`<tr${Math.abs(l[1]-mn)<1?' class="s"':''}><td>${l[0]}</td><td><b>${fmt(l[1])}</b></td><td class="fcx-w">${l[2]}</td></tr>`).join('')}</table>
    ${_eq(`תקציב הקרקע = הקטן מביניהם = <b>${fmt(D.budget)} מ"ר</b>`,`שטח התא (מדוד): ${fmt(D.cellA)} מ"ר. סך טביעות הרגל של כל המבנים לא יכול לעבור את תקציב הקרקע.`)}`,focus==='land'));
  // 3. floors
  out.push(_sec('floors','3. קומות',`<div class="fcx-w">בטבלה 5: <b>${x.floors} קומות</b> מעל הכניסה. זו בדרך כלל <b>תקרה</b> — קומות המבנה הגבוה בתא, לא של כל המבנים.
    סף המרקמי (שדה בטופס): <b>${D.thr} קומות</b>.
    ${D.Ft?`הקומות בטבלה גבוהות מהסף, ולכן בתא מותרים <b>רבי-קומות של ${D.Ft} קומות</b>, ולצידם מבנים מרקמיים של עד <b>${D.Fm}</b> קומות.`
      :`הקומות בטבלה לא גבוהות מהסף, ולכן כל המבנים מרקמיים, עד <b>${D.Fm} קומות</b>.`}</div>`,focus==='floors'));
  // 4. towers
  if(D.Ft){
    const dRing=N.nm?D.dmt:D.dtt, ring1=0.5*((Math.sqrt(D.T)+dRing)**2-D.T);
    out.push(_sec('towers','4. רבי-קומות (מגדלים)',`${_eq(`שטח קומת מגדל = ${D.upf} יח"ד × (${fmt(D.unit)} + ${D.core}) = <b>${fmt(D.T)} מ"ר</b>`,
      `הנחה: ${D.upf} דירות בקומה, דירה ממוצעת ${fmt(D.unit)} מ"ר, ועוד ${D.core} מ"ר גרעין לכל דירה — מטבלת הגרעינים בתקנון המאסטר (מגדל, ${D.upf} יח"ד בקומה). ניתן לשינוי ב"הנחות".`)}
      <div class="fcx-w">מספר רבי-קומות מרבי: ${D.kRule!=null?`<b>${D.kRule}</b> (כלל בטופס)`:'לא נקבע בטופס'}; מבחינה גאומטרית נכנסים עד <b>${D.kmax}</b>
      (כל מגדל צריך ריבוע בצלע √${fmt(D.T)} + ${f1(D.dtt)} מ' מרחק).</div>
      ${_eq(`שטח שהמרחק גוזל סביב מגדל = ½ × ((√${fmt(D.T)} + ${f1(dRing)})² − ${fmt(D.T)}) ≈ <b>${fmt(ring1)} מ"ר</b>`,
        `סביב כל מגדל נשארת רצועה ברוחב המרחק הנדרש (${N.nm?`מרקמי–רב-קומות ${f1(D.dmt)} מ'`:`רב-קומות–רב-קומות ${f1(D.dtt)} מ'`}) שבה אי אפשר לבנות מבנה אחר. נספרת מחצית ממנה — מקלה, כי חלק מהרצועה נופל מחוץ למעטפה.`)}`,focus==='towers'));
  }
  // 5. marakmi
  out.push(_sec('marakmi',`${D.Ft?'5':'4'}. מבנים מרקמיים`,`${_eq(`רצועת עומק ${f1(D.Dm)} מ' לאורך קצה המעטפה = <b>${fmt(D.band)} מ"ר</b>`,
    `מבנים מרקמיים (בנייה לאורך הרחוב, בלוקים) לא יכולים להיות עמוקים מאוד. לכן השטח שלהם מוגבל לרצועה בעומק ${f1(D.Dm)} מ' מקצה המעטפה (הנחה, ניתן לשינוי). בתא צר — הרצועה היא כל המעטפה.`)}
    ${N.nm>1?_eq(`רווחים בין מבנים = (${N.nm} − 1) × ${f1(D.dmm)} מ' × ${f1(D.Dm)} מ' = <b>${fmt(N.gaps)} מ"ר</b>`,`בין כל שני מבנים מרקמיים נשאר רווח לפי מרחק מרקמי–מרקמי.`):''}
    ${N.nm?_eq(`טביעת רגל מרקמית = min(${fmt(D.band)}, ${fmt(D.budget)} − ${fmt(N.TF)} − ${fmt(N.TL)})${N.nm>1?` − ${fmt(N.gaps)}`:''} = <b>${fmt(N.MF)} מ"ר</b>`,
      `הקטן מבין הרצועה לבין מה שנשאר מתקציב הקרקע אחרי המגדלים והמרחקים סביבם.`):'<div class="fcx-w">בתרחיש שנבחר אין מבנים מרקמיים.</div>'}`,focus==='marakmi'));
  // 6. capacity
  out.push(_sec('cap',`${D.Ft?'6':'5'}. הקיבולת`,_eq(`${f2(D.eff)} × (${fmt(N.TF)} × ${N.Ft} + ${fmt(N.MF)} × ${N.Fm}) = <b>${fmt(N.cap)} מ"ר</b>`,
    `יעילות קומה ${f2(D.eff)} (ניכוי פירים, מגרעות ונסיגות — הנחה) × (טביעת המגדלים × קומות המגדל + טביעת המרקמיים × קומות המרקמי).
     בתרחיש הזה: ${N.k} רבי-קומות ו-${N.nm} מבנים מרקמיים.`)+
    `<div class="fcx-w">יחס הניצול = הנדרש ÷ הקיבולת = ${fmt(N.need)} ÷ ${fmt(N.cap)} = <b>${pct(N.need/N.cap)}</b></div>`,focus==='cap'||focus==='ratio'));
  // 7. scenarios
  const sc=[...N.scen].sort((a,b)=>b.slack-a.slack).slice(0,8);
  out.push(_sec('scen','תרחישים שנבדקו',`<div class="fcx-w">המנוע עובר על כל הצירופים המותרים של מספר רבי-קומות ומספר מבנים מרקמיים
    (בכפוף למספר מבנים מזערי ${D.nMin}${D.nMax<99?`, מרבי ${D.nMax} (${D.nMaxSrc})`:''}${D.mReq?`, חובת ${D.mReq} מרקמיים`:''}) ובוחר את זה שמשאיר הכי הרבה מקום.</div>
    <table class="fcx-t"><tr><th>רבי-קומות</th><th>מרקמיים</th><th>קיבולת</th><th>נדרש</th><th>יתרה</th></tr>
    ${sc.map(s=>`<tr${s===N?' class="s"':''}><td>${s.k}</td><td>${s.nm}</td><td>${fmt(s.cap)}</td><td>${fmt(s.need)}</td><td>${fmt(s.slack)}</td></tr>`).join('')}</table>`,false));
  // 8. loose
  if(L&&LD) out.push(_sec('loose','הרצה מקילה',`<div class="fcx-w">כדי לא לפסול תא בגלל הנחה שלנו, החישוב רץ שוב בהנחות המקילות ביותר:
    יעילות קומה 1.0 (בלי ניכוי), קומת מגדל עד 900 מ"ר, עומק מרקמי 20 מ'${LD.relaxed.length?`, ו<b>בלי</b> הכללים שעדיין לא אושרו בטופס (${LD.relaxed.map(k=>FNAME[k]).join(', ')} = 0)`:''}.</div>
    ${_eq(`קיבולת מקילה = <b>${fmt(L.cap)} מ"ר</b> (נדרש ${fmt(L.need)})`,'')}`,false));
  // 9. verdict
  const rule=r.verdict==='✗'?`גם בהרצה המקילה הקיבולת (${fmt(L.cap)}) קטנה מהנדרש (${fmt(L.need)}) — רק כללי התוכנית שאושרו מכשילים, ולכן <b>✗ לא נכנס</b>.`
    :r.verdict==='⚠'?`בהנחות הרגילות הקיבולת (${fmt(N.cap)}) קטנה מהנדרש, אבל בהרצה המקילה (${fmt(L.cap)}) נכנס — התוצאה <b>תלויה בהנחות</b>.${r.approx?' (או שהמעטפה מקורבת — אין קווי בניין בתשריט.)':''}`
    :r.verdict==='חסר?'?`הזכויות מנצלות פחות מחצי מהקיבולת (${pct(r.ratio)}) — ייתכן שהתא מקבל פחות זכויות ממה שהוא יכול לשאת. <b>לא בהכרח טעות</b>: לעתים זה מרווח מכוון (טופוגרפיה, תקרת קומות אחידה).`
    :r.verdict==='לבדיקה'?`הזכויות נכנסות, אבל התא חריג מול תאים דומים בתוכנית (ר' למטה) — כדאי לבדוק את השורה שלו בטבלה 5.`
    :`נמצא תרחיש שמכיל את הזכויות (ניצול ${pct(r.ratio)}).`;
  out.push(_sec('verdict','התוצאה',`<div class="fcx-w">${rule}</div>`,focus==='verdict'));
  // 10. comparisons
  if(r.ratio){
    const pl=(r.peerList||[]).slice().sort((a,b)=>b.ratio-a.ratio).slice(0,12);
    out.push(_sec('peers','השוואה לתאים דומים',`<div class="fcx-w">בתוכנית אחת הזכויות מחושבות בדרך כלל באותה שיטה, ולכן תאים דומים (אותו ייעוד ואותן קומות) מנצלים אחוז דומה מהקיבולת,
      והשטח ליח"ד כמעט קבוע (בגוף הידע: ±5%). תא שבולט מול עמיתיו — כדאי לבדוק.</div>
      ${r.peerN>=3?_eq(`ניצול התא ${pct(r.ratio)} ÷ חציון ${r.peerN} תאים דומים ${pct(r.peerMed)} = <b>×${f2(r.peer)}</b>`,
        `סימון אם ×1.25 ומעלה וגם הניצול עצמו 70% ומעלה. תאים דומים: ${pl.map(p=>`${E(p.cn)} (${pct(p.ratio)})`).join(', ')}${r.peerN>12?' …':''}`):'<div class="fcx-w">אין מספיק תאים דומים להשוואה (צריך 3 לפחות).</div>'}
      ${r.apu?_eq(`שטח ליח"ד = ${fmt(x.resArea*(D.scale||1))} ÷ ${x.units} = ${fmt(r.apu)} מ"ר · מול ${r.apuRefSrc}: ${fmt(r.apuRef)} → <b>×${f2(r.apuRel)}</b>`,
        'שטח המגורים מעל הקרקע (כולל שירות וגרעינים) חלקי מספר יח"ד. סימון מ-×1.15 ומעלה או ×0.85 ומטה.'):''}`,focus==='peers'));
  }
  out.push(_sec('limits','מה הבדיקה לא בודקת',`<div class="fcx-w">היא לא מתכננת בינוי אמיתי ולא בודקת: צמידות לקו בניין / דופן רציפה, תחומי חיפוש לרבי-קומות מהנספח,
    מגבלות גובה מוחלטות, טופוגרפיה, תכנון קומת הקרקע והמרתף. מגדלים מחושבים כריבועים ומרקמיים כרצועה — קירוב. לכן ✓ פירושו "לא נפסל", ולא "תוכנן".</div>`,false));
  return out.join('');
}
const METHOD=`<div class="fcx-intro"><b>מה הבדיקה עושה.</b> לכל תא מגורים או תעסוקה היא משווה בין שני מספרים:
  <b>הנדרש</b> — שטחי הבנייה מעל הקרקע שטבלה 5 נותנת לתא, ו<b>הקיבולת</b> — כמה לכל היותר אפשר לבנות בתא לפי כללי התוכנית.</div>
  ${_sec('m1','איך מחושבת הקיבולת',`<div class="fcx-w">(1) <b>תקציב קרקע</b> — הקטן מבין: השטח בתוך קווי הבניין שבתשריט, התא פחות השטח שחייב להישאר פנוי, ותכסית מרבית (אם נקבעה).
  (2) <b>קומות</b> — מטבלה 5; מעל סף המרקמי מותרים רבי-קומות, ולצידם מבנים מרקמיים עד הסף.
  (3) <b>רבי-קומות</b> — שטח קומה לפי נוסחת המאסטר (יח"ד בקומה × (דירה + גרעין)); סביב כל מגדל נגרע שטח לפי המרחק הנדרש.
  (4) <b>מרקמיים</b> — רצועה בעומק סביר לאורך קצה המעטפה, פחות רווחים בין המבנים.
  (5) הקיבולת = יעילות קומה × (טביעת מגדלים × קומות מגדל + טביעת מרקמיים × קומות מרקמי). נבדקים כל הצירופים של מספר מגדלים ומבנים — ונבחר הטוב ביותר.</div>`,false)}
  ${_sec('m2','מה פירוש התוצאות',`<div class="fcx-w"><b>✗ לא נכנס</b> — גם בהנחות המקילות ביותר, ורק לפי כללים שאושרו מהתקנון.
  <b>⚠ תלוי בהנחות</b> — לא נכנס בהנחות הרגילות, נכנס במקילות. <b>לבדיקה</b> — נכנס, אבל חריג מול תאים דומים באותה תוכנית (ניצול או שטח ליח"ד).
  <b>חסר?</b> — הזכויות מנצלות פחות מחצי מהקיבולת. <b>✓</b> — נמצא תרחיש שמכיל את הזכויות (חסם עליון — "לא נפסל", לא "תוכנן").</div>`,false)}
  ${_sec('m3','כללים, הנחות ואישור',`<div class="fcx-w">כללי התוכנית (מרחקים, שטח פנוי וכו') מתחילים בברירות מחדל מתקנון המאסטר. כל שדה מסומן <b>"בדקתי בתקנון"</b> אחרי שבודקים אותו (שינוי ערך מסמן אוטומטית).
  רק כלל שנבדק יכול להכשיל ל-✗; כלל שלא נבדק מוקל בהרצה המקילה. ההנחות (יעילות, דירה, יח"ד בקומה, עומק) לעולם לא מכשילות ל-✗.</div>`,false)}
  ${_sec('m4','השוואות בתוך התוכנית',`<div class="fcx-w">בתוכנית אחת הזכויות מחושבות בדרך כלל באותה שיטה, ולכן תאים דומים מנצלים אחוז דומה מהקיבולת, והשטח ליח"ד כמעט קבוע.
  תא שבולט מול עמיתיו מסומן "לבדיקה" — גם אם הוא נכנס. כך נתפסות גם חריגות של 15–20% שהחסם העליון לבדו לא תופס.</div>`,false)}
  <div class="fcx-w" style="margin-top:8px">לחיצה על כל נתון בטבלת התוצאות (או בעמודות בלשונית טבלה 5) פותחת את התחקור המלא של התא.</div>`;
function _pop(title,html,focus){
  let p=$('fc-pop');
  if(!p){ p=document.createElement('div'); p.id='fc-pop';
    p.innerHTML=`<div class="fcx-box"><div class="fcx-hd"><b id="fcx-title"></b><button onclick="FC.closeExplain()">✕</button></div><div class="fcx-bd" id="fcx-bd"></div></div>`;
    p.addEventListener('click',e=>{ if(e.target===p) FC.closeExplain(); }); document.body.appendChild(p); }
  _css();
  $('fcx-title').textContent=title; $('fcx-bd').innerHTML=html; p.classList.add('vis');
  const t=focus&&$('fcx-'+focus); $('fcx-bd').scrollTop=t?Math.max(0,t.offsetTop-60):0;
}
FC._explainHtml=explainHtml; // לבדיקות
FC.explain=function(cn,focus,ev){ if(ev) ev.stopPropagation(); const r=FC.resultFor(cn); if(!r) return;
  _pop(`תחקור בקרת בינוי — תא ${cn} (${r.yiud})`,explainHtml(r,focus),focus); };
FC.explainMethod=function(){ _pop('איך בקרת הבינוי עובדת',METHOD); };
FC.closeExplain=function(){ const p=$('fc-pop'); if(p) p.classList.remove('vis'); };
if(typeof document!=='undefined') document.addEventListener('keydown',e=>{ if(e.key==='Escape') FC.closeExplain(); });

// ── columns in the "טבלה 5" tab ──
FC.t5HeadHtml=function(){
  return `<th class="t5v-calc-hdr t5v-fc-hdr" title="בקרת בינוי — חסם עליון: כמה אפשר לבנות בתא לפי קווי הבניין והכללים (לשונית 🏗 בקרת בינוי)">קיבולת מחושבת<br><small>מ"ר מעל הקרקע</small></th>
    <th class="t5v-calc-hdr t5v-fc-hdr" title="הזכויות בטבלה חלקי הקיבולת">ניצול<br><small>%</small></th>
    <th class="t5v-calc-hdr t5v-fc-hdr">בקרת בינוי</th>`;
};
FC.t5CellsHtml=function(cn,rowspan){
  const r=FC.resultFor(cn), rs=rowspan>1?` rowspan="${rowspan}"`:'';
  if(!r) return `<td class="t5v-calc-cell"${rs} style="color:#888">—</td><td class="t5v-calc-cell"${rs} style="color:#888">—</td><td class="t5v-calc-cell"${rs} style="color:#888">—</td>`;
  const c=E(r.cn);
  return `<td class="t5v-calc-cell t5v-fc-x"${rs} onclick="FC.explain('${c}','cap',event)" title="לחץ לתחקור החישוב">${fmt(r.cap)} <span style="font-size:9px;opacity:.6">🔍</span></td>
    <td class="t5v-calc-cell t5v-fc-x"${rs} onclick="FC.explain('${c}','ratio',event)" title="לחץ לתחקור החישוב">${r.ratio?Math.round(r.ratio*100)+'%':'—'} <span style="font-size:9px;opacity:.6">🔍</span></td>
    <td class="t5v-calc-cell t5v-fc-x"${rs} onclick="FC.explain('${c}','verdict',event)" title="${E((r.why||'')+(r.flags.length?' · '+r.flags.join(' · '):''))} — לחץ לתחקור"><span class="fc-v" style="background:${COL[r.verdict]};color:#fff;border-radius:8px;padding:1px 7px;font-weight:600;white-space:nowrap">${E(LBL[r.verdict])}</span></td>`;
};

// ── project persistence ──
FC.getSpec=function(){ return FC.spec; };
FC.setSpec=function(s){ FC.spec=normalizeSpec(s); FC.res=null; FC._dirty=false; if(FC.open){ FC.ensure(true); FC.render(); } };
FC.reset=function(){ FC.spec=emptySpec(); FC.res=null; FC.sel=null; if(FC.open) FC.close(); };
FC.hasUser=function(s){ s=s||FC.spec; return !!(s&&(Object.keys(s.conf||{}).length||Object.values(s.g||{}).some(g=>(g.def!=null&&g.def!=='')||g.exc))); };

function _css(){ if(typeof document==='undefined'||$('fc-css')) return; const st=document.createElement('style'); st.id='fc-css'; st.textContent=CSS; document.head.appendChild(st); }
if(typeof document!=='undefined'){ if(document.head) _css(); else document.addEventListener('DOMContentLoaded',_css); } // גם לעמודות בלשונית טבלה 5

root.FC=FC;
root.openFitCheck=function(){ FC.toggle(); };
if(root._FC_PENDING!==undefined){ FC.setSpec(root._FC_PENDING); root._FC_PENDING=undefined; }
})(typeof window!=='undefined'?window:globalThis);
