/* ============================================================================
   fitcheck.js — "🏗 בקרת בינוי": האם הזכויות בטבלה 5 נכנסות בתאי השטח
   מפרט: binui_check/מפרט הכלי.md (22/11/2026). גרסה 2 — שלב 1: תשריט + טבלה 5 בלבד.
   הגרסה הראשונה (טופס ארוך + מנוע שהעמיד מגדלים) הוחלפה במלואה.

   מבנה:
     1. ערכים זמניים (סעיף 10) וברירות מחדל לשבע השאלות (סעיף 4)
     2. Engine — טהור, בלי DOM: הנדסה לאחור לכל שורה (שלב 2), מעטפת (3), יחס אחרי גובה (4),
        מגבלות שנבדקות תמיד (5, מרתף/שטח פתוח), טיפולוגיה (6), סיווג (8–9)
     3. UI — פאנל, 7 כרטיסים, מסך תוצאות (סעיף 7), צביעת תאים, תחקור תא, עמודות בטבלה 5
   לא בשלב הזה: קריאת תקנון (בוטל), נספח בינוי ותדפיס (מפלסים, שיפוע, ערימה אנכית, חזית מסחרית, שני אזורי גובה).
   תלות בממשק (גלובלי): state, _calcBuildGeom, _featureAreaM2, _isBuildLine, dc, redraw, zoomAt, wrap, scale, _mPerUnit, DATA_SIZE
   ========================================================================== */
(function(root){
'use strict';
const FC={open:false,spec:null,res:null,filter:'all',rowF:'',depF:'',sel:null};
const $=id=>typeof document!=='undefined'?document.getElementById(id):null;
const E=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num=v=>{ const m=String(v==null?'':v).replace(/\(\s*[^)]*\)/g,'').replace(/,/g,'').match(/-?\d+(\.\d+)?/); return m?+m[0]:0; };
const fmt=v=>v==null||!isFinite(v)?'—':Math.round(v).toLocaleString('he-IL');
const f1=v=>v==null||!isFinite(v)?'—':(+v).toLocaleString('he-IL',{maximumFractionDigits:1});
const f2=v=>v==null||!isFinite(v)?'—':(+v).toLocaleString('he-IL',{maximumFractionDigits:2});
const pct=v=>v==null||!isFinite(v)?'—':Math.round(v*100)+'%';
const med=arr=>{ const s=arr.filter(v=>v!=null&&isFinite(v)).sort((p,q)=>p-q); return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):null; };

// ═══════════════════════════════════════════════════════════════════════════
// 1. ערכים זמניים (מפרט סעיף 10) — כולם "ממתין לאדריכל" או "הצעה של המפרט"
// ═══════════════════════════════════════════════════════════════════════════
const TV={
  fhRes:{l:'גובה קומת מגורים',v:'3.2–3.3 מ\'',st:'arch'},
  fhPub:{l:'גובה קומת ציבור (4.0 = קצה, 4.5 = רגיל)',v:'4.0–4.5 מ\'',st:'arch'},
  fhOff:{l:'גובה קומת משרדים / תעסוקה',v:'3.8–4.0 מ\'',st:'arch'},
  fhCom:{l:'גובה קומת קרקע מסחרית',v:'6–7 מ\'',st:'arch'},
  fhOther:{l:'גובה קומה למחסנים, מתקנים, תעשייה',v:'אין ערך',st:'arch'},
  tower:{l:'סף "מגדל"',v:'מעל 10 קומות, או רצפת הקומה העליונה מעל 29 מ\'',st:'prop'},
  towerCov:{l:'כיסוי קומת מגדל מהמעטפת',v:'עד 85%',st:'arch'},
  depth:{l:'עומק בניין מגורים',v:'עד 20 מ\' רגיל, 20–22 בקצה',st:'arch'},
  officePlate:{l:'שטח קומה מרבי למגדל משרדים',v:'כ-1,500 מ"ר',st:'arch'},
  unitBig:{l:'"שטח לדירה גדול מהמקובל"',v:'160 מ"ר ברוטו ליח"ד',st:'arch'},
  unitFit:{l:'"יח"ד נכנסות": שטח מינימלי ליח"ד',v:'110 מ"ר ברוטו',st:'prop'},
  core:{l:'ליבה ושטחים משותפים',v:'12–18% משטח הקומה',st:'arch'},
  parapet:{l:'הגובה המרבי לא כולל מעקה גג',v:'לא כולל (מקל)',st:'arch'}
};
const TVST={arch:'ממתין לאישור אדריכל',prop:'הצעה של המפרט — ממתין לאישור'};
const K={towerFloors:10,towerH:29,towerCov:0.85,depthOk:20,depthMax:22,widthLo:22,widthHi:40,officePlate:1500,unitBig:160,unitFit:110,coreLo:0.12,coreHi:0.18,dense:0.8,eps:0.01,outlier:0.03,apuOut:0.15};

const CLS=['fit','cond','excess','plan','mat'];                 // מהקל לחמור
const SEV={fit:0,cond:1,excess:2,plan:3,mat:4};
const CL={fit:'נכנס',cond:'נכנס בתנאי',excess:'זכויות עודפות',plan:'לבדיקת מתכנן',mat:'ממצא מהותי'};
const COL={fit:'#27ae60',cond:'#9bbf2a',excess:'#3498db',plan:'#f39c12',mat:'#e74c3c'};
const worst=(a,b)=>SEV[a]>=SEV[b]?a:b;
const USE_L={res:'מגורים',pub:'ציבור',off:'משרדים / תעסוקה',com:'מסחר',other:'אחר'};

function defaultAnswers(){ return {
  q1:{status:'bg',topic:'',manual:[]},  // manual: {cells,H,ref:'abs'|'rel',z,ground,floors} — הוקלד ידנית מהנספח
  q2:{res:{lo:3.2,hi:3.3,tk:false},pub:{lo:4.0,hi:4.5,tk:false},off:{lo:3.8,hi:4.0,tk:false},com:{lo:6,hi:7,tk:false}},
  q3:{mode:'auto',z:{}},
  q4:{list:[]},          // {kind:'transfer'|'floors', val, exposed, approval, yiud:null|[], src}
  q5:{list:[],parapet:'no',balc:false,alt:[]},  // balc: מרפסות בתוך התכסית; alt: ייעודים שבהם השימושים הם חלופות // {kind:'basementCov'|'freeAbove'|'freeAll'|'floorCap'|'openSpace', val, yiud:null|[], minCell, src}
  q6:{mand:[]},          // ייעודים שבהם יש חובה לממש
  q7:{avgMin:null,avgMax:null}
}; }
function emptySpec(plan){ return {v:2,plan:plan||'',ans:defaultAnswers(),conf:{}}; }
function normalizeSpec(s,plan){
  if(!s||typeof s!=='object') return emptySpec(plan);
  if(s.v!==2){ const e=emptySpec(plan); e.legacy=s.legacy||s; return e; }   // הטופס הישן נשמר בצד, לא נמחק
  const e=emptySpec(s.plan||plan), a=s.ans||{};
  for(const q of Object.keys(e.ans)) if(a[q]&&typeof a[q]==='object') e.ans[q]=Object.assign(e.ans[q],JSON.parse(JSON.stringify(a[q])));
  for(const u of ['res','pub','off','com']) e.ans.q2[u]=Object.assign(defaultAnswers().q2[u],(a.q2||{})[u]||{});
  e.conf=Object.assign({},s.conf||{}); if(s.legacy) e.legacy=s.legacy;
  return e;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ENGINE (טהור — נבדק ב-node: tests/fitcheck.test.js)
// ═══════════════════════════════════════════════════════════════════════════
const isSum=r=>!r.shimush||/סך|סה"כ/.test(r.shimush)||/סך|סה"כ/.test(r.yiud||'');
function useClass(use,yiud){
  const t=s=>{ s=s||'';
    if(/מגורים|דיור|דירות/.test(s)) return 'res';
    if(/מסחר|חנויות|קמעונ/.test(s)) return 'com';
    if(/משרד|תעסוקה|מלונ|הייטק/.test(s)) return 'off';
    if(/ציבור|מוסד|חינוך|דת|קהיל|בריאות|רווחה|גן ילדים|בית ספר|מעון|תרבות/.test(s)) return 'pub';
    if(/תעשי|מחסנ|מתקנ|אחסנ|חני|ספורט|תשתית|הנדסי/.test(s)) return 'other';
    return null; };
  return t(use)||t(yiud)||'other';
}
// טבלה 5 (מבנה הממשק: state.table5[cn]=[rows]) + גאומטריה → תאים לחישוב
function cellsFromT5(t5,geomOf){
  const grpOf={}, groups=(t5&&t5.__groups)||{};
  for(const g of Object.values(groups)) for(const n of g.nums||[]) grpOf[n]=g.label;
  const out={}, pctMode=!!(t5&&t5.__units&&t5.__units.rightsPct);
  for(const cn of Object.keys(t5||{})){
    const all=t5[cn]||[], rows=all.length===1?all:all.filter(r=>!isSum(r)); if(!rows.length) continue;
    const g=geomOf?geomOf(cn):{}; if(!g) continue;
    const yiud=(rows[0].yiud||'').trim();
    const x=Object.assign({cn,yiud,grp:grpOf[cn]||null,rows:[],floors:0,floorsB:0,H:null,cov:null,sb:null,magras:null,mirp:0},g);
    x.notesIn=[]; x.moved=[];
    const pctK=pctMode&&x.A>0?x.A/100:1;   // זכויות ב"% מתא שטח" → מ"ר לפי שטח הפוליגון
    const ab=r=>pctK*((r.ikariMal||r.sherutMal)?num(r.ikariMal)+num(r.sherutMal):num(r.kollMal));
    const bl=r=>pctK*((r.ikariMitahat||r.sherutMitahat)?num(r.ikariMitahat)+num(r.sherutMitahat):num(r.kollMitahat));
    const unitsOf=r=>num(r.yihud)||(num(r.tsfifut)&&x.A>0?num(r.tsfifut)*x.A/1000:0);   // צפיפות ליח"ד לדונם → יח"ד
    for(const r of rows){
      let above=ab(r), below=bl(r);
      const use=(r.shimush||'').trim()||yiud;
      // שורה שיש לה קומות מתחת לכניסה ואין לה קומות מעל: השטח שלה נספר מתחת לכניסה (בית שמש 1100: "עיקרי" כולל גם מתחת)
      if(above>0&&!num(r.komMal)&&num(r.komMitahat)>0){ x.moved.push({use,area:above,fl:num(r.komMitahat)}); below+=above; above=0; }
      x.rows.push({use,cls:useClass(use,yiud),above,below,units:unitsOf(r),fB:num(r.komMitahat),fA:num(r.komMal),gova:num(r.gova),mirp:above>0?num(r.mirpasot):0});
      x.mirp+=num(r.mirpasot);
    }
    if(pctMode) x._pct=true;
    if(x.moved.length) x.notesIn.push(x.moved.map(m=>`${m.use} ${fmt(m.area)} מ"ר רשום בעמודת "מעל הכניסה", אבל לשורה יש רק ${m.fl} קומות מתחת לכניסה — נספר מתחת לכניסה`).join('; ')+'.');
    // זכויות שרשומות רק בשורת "סך הכל" (קריית שמונה 104: מתחת לכניסה)
    const sums=all.filter(r=>isSum(r)&&r!==rows[0]);
    if(sums.length&&rows.length&&all.length>1){
      const sA=Math.max(...sums.map(ab)), sB=Math.max(...sums.map(bl));
      const rA=x.rows.reduce((t,r)=>t+r.above,0), rB=x.rows.reduce((t,r)=>t+r.below,0);
      if(!rA&&sA>0){ x.rows.push({use:yiud,cls:useClass(yiud,yiud),above:sA,below:0,units:0}); x.notesIn.push(`השטח מעל הכניסה (${fmt(sA)} מ"ר) רשום רק בשורת "סך הכל".`); }
      if(!rB&&sB>0){ x.rows.push({use:yiud,cls:useClass(yiud,yiud),above:0,below:sB,units:0,fB:Math.max(...sums.map(r=>num(r.komMitahat)))}); x.notesIn.push(`השטח מתחת לכניסה (${fmt(sB)} מ"ר) רשום רק בשורת "סך הכל".`); }
    }
    // legal_area מ-Xplan לפעמים בדונם (קריית שמונה), לפעמים במ"ר (בית שמש)
    if(x.LA>0&&x.A>0&&x.LA<x.A/100) x.LA*=1000;
    for(const r of all){   // נתוני בינוי — לפעמים רק בשורת הסיכום
      x.floors=Math.max(x.floors,num(r.komMal)); x.floorsB=Math.max(x.floorsB,num(r.komMitahat));
      const h=num(r.gova); if(h) x.H=Math.max(x.H||0,h);
      if(num(r.tachsit)) x.cov=num(r.tachsit);
      if(num(r.magras)) x.magras=num(r.magras);
      if(!x.sb&&(r.kvQdami||r.kvAhori||r.kvYmani||r.kvSmali)) x.sb={q:num(r.kvQdami),h:num(r.kvAhori),y:num(r.kvYmani),l:num(r.kvSmali)};
    }
    out[cn]=x;
  }
  return out;
}
function regime(x){
  const by={}; let units=0, resA=0;
  for(const r of x.rows){ by[r.cls]=(by[r.cls]||0)+r.above; units+=r.units; if(r.cls==='res') resA+=r.above; }
  const tot=Object.values(by).reduce((a,b)=>a+b,0), below=x.rows.reduce((s,r)=>s+r.below,0);
  const nonCom=Object.entries(by).filter(([k,v])=>k!=='com'&&v>0).sort((a,b)=>b[1]-a[1]);
  const hasCom=(by.com||0)>0;
  const main=nonCom.length?nonCom[0][0]:(hasCom?'off':null);   // מסחר בלבד: הקומות שמעל הקרקע כמשרדים
  return {by,tot,below,units,resA,main,hasCom,share:k=>tot?(by[k]||0)/tot:0};
}
const appliesTo=(item,x)=>(!item.yiud||!item.yiud.length||item.yiud.includes(x.yiud))&&(!item.minCell||x.A>=+item.minCell);
function rectDims(A,P){ if(!(A>0)) return null; if(!(P>0)) P=4*Math.sqrt(A); const h=P/2, d=Math.max(0,h*h/4-A), a=h/2+Math.sqrt(d); return {a,b:Math.max(0.1,h-a)}; }
// "504, 509, 1101-1116" → Set
function parseCells(s){ const out=new Set(); for(const p of String(s||'').split(/[,;\s]+/)){ const m=p.match(/^(\d+)[-–—](\d+)$/);
  if(m){ let a=+m[1],b=+m[2]; if(a>b)[a,b]=[b,a]; if(b-a<=5000) for(let i=a;i<=b;i++) out.add(String(i)); } else if(/^\d+$/.test(p)) out.add(p); } return out; }
function manualFor(x,ans){ if(!ans.q1||ans.q1.status!=='bind') return null; let hit=null;
  for(const m of ans.q1.manual||[]) if((m.H||m.floors||m.z!=null||m.ground!=null)&&parseCells(m.cells).has(String(x.cn))) hit=m; return hit; }
function heightOf(x,ans){
  const m=x._man;
  if(m&&m.H){   // גובה שהוקלד ידנית מנספח מחייב
    if(m.ref==='rel') return {Hrel:+m.H,abs:false,manual:true,Hraw:+m.H};
    if(m.z!=null&&m.z!==''&&isFinite(+m.z)) return {Hrel:m.H-(+m.z),abs:true,z:+m.z,manual:true,Hraw:+m.H};
    if(m.ground!=null&&m.ground!==''&&isFinite(+m.ground)) return {Hrel:m.H-(+m.ground),abs:true,ground:+m.ground,manual:true,Hraw:+m.H};
    return {Hrel:null,abs:true,missing:true,manual:true,Hraw:+m.H};
  }
  if(x.H==null) return {Hrel:null,abs:false};
  const mode=ans.q3.mode, auto=x.floors>0?x.H>x.floors*6+12:x.H>60;
  const abs=mode==='abs'?true:mode==='rel'?false:auto;
  if(!abs) return {Hrel:x.H,abs:false};
  const z=ans.q3.z&&ans.q3.z[x.yiud];
  return z!=null&&z!==''&&isFinite(+z)?{Hrel:x.H-(+z),abs:true,z:+z}:{Hrel:null,abs:true,missing:true};
}
const floorsFit=(H,h,hasCom,g)=>H==null||!h?null:hasCom?Math.max(0,Math.floor((H-g)/h+1e-6)+1):Math.max(0,Math.floor(H/h+1e-6));

// שלב 2 — הנדסה לאחור לכל שורה
function reverse(cells,ans){
  const rows={};
  for(const x of Object.values(cells)){ const k=x.grp||x.yiud||'—'; (rows[k]=rows[k]||{key:k,yiud:x.yiud,cells:[]}).cells.push(x); }
  const notes={};   // cn → [הערות]
  const add=(cn,t)=>(notes[cn]=notes[cn]||[]).push(t);
  for(const R of Object.values(rows)){
    const cs=R.cells.filter(x=>x.A>0);
    for(const x of cs){ const g=regime(x); x._rA=g.tot/x.A; x._rB=g.below/x.A; x._apu=g.units&&g.resA?g.resA/g.units:null;
      x._rCF=x.cov&&x.floors?g.tot/(x.cov/100*x.floors*x.A):null; }
    R.rA=med(cs.map(x=>x._rA)); R.rB=med(cs.map(x=>x._rB)); R.apu=med(cs.map(x=>x._apu)); R.rCF=med(cs.map(x=>x._rCF));
    const x0=cs[0]||R.cells[0]; R.cov=x0&&x0.cov; R.floors=x0&&x0.floors; R.H=x0&&x0.H;
    R.dens=med(cs.map(x=>{ const u=regime(x).units; return u?u/x.A*1000:null; }));
    R.tags=[];
    if(R.rCF!=null){
      if(Math.abs(R.rCF-1)<=K.eps) R.tags.push('ללא מרווח: הזכויות = תכסית × קומות בדיוק');
      else if(cs.length&&cs.every(x=>x._rCF!=null&&x._rCF>1+K.eps)) R.tags.push(`שורה מעל 1: ${pct(R.rA)} מול תכסית × קומות ${pct(R.cov/100*R.floors)} — לא נכנס באף תא בלי הוראה מתירה`);
      else if(R.rCF<0.5) R.tags.push('הזכויות נגזרו כנראה מצפיפות — המעטפת לא תכריע');
    }
    const hr=x0?heightOf(x0,ans):{}; const fh=x0?ans.q2[regime(x0).main]:null;
    if(hr.Hrel!=null&&x0.floors&&fh&&hr.Hrel/x0.floors<fh.lo-0.005){ R.impliedH=hr.Hrel/x0.floors; R.tags.push(`גובה ÷ קומות = ${f2(R.impliedH)} מ', פחות מהערך המקובל (${f2(fh.lo)} מ')`); }
    if(cs.length>=3&&R.rA){
      for(const x of cs){
        if(Math.abs(x._rA/R.rA-1)>K.outlier){
          const g=regime(x);
          if(x.LA>0&&Math.abs(g.tot/x.LA/R.rA-1)<=K.eps){ x._laSuspect=true;
            add(x.cn,`ייתכן טעות חישוב בטבלה: הזכויות (${fmt(g.tot)} מ"ר) מתאימות ל-legal_area (${fmt(x.LA)} מ"ר) ולא לשטח הפוליגון (${fmt(x.A)} מ"ר). לאמת מול התדפיס.`); }
          else add(x.cn,`חריג בטבלה 5: ${f2(x._rA)} × שטח התא, בשורה ${f2(R.rA)} × שטח`);
        }
        if(x._apu&&R.apu&&Math.abs(x._apu/R.apu-1)>=K.apuOut) add(x.cn,`שטח לדירה ${fmt(x._apu)} מ"ר, מול ${fmt(R.apu)} בשורה (חריגה של ${pct(Math.abs(x._apu/R.apu-1))})`);
      }
    }
    for(const x of cs){
      if(x.magras&&x.A<x.magras-0.5) add(x.cn,`התא (${f1(x.A)} מ"ר) קטן מגודל המגרש בטבלה (${fmt(x.magras)} מ"ר)`);
      if(x.magras&&x.cov&&x.floors&&Math.abs(regime(x).tot/(x.cov/100*x.floors*x.magras)-1)<=K.eps&&Math.abs(x.magras-x.A)>1) x._magrasRead=true;
    }
  }
  return {rows,notes};
}

// שלב 3 — מעטפת: קריאות מקילה ומחמירה
function envelope(x,ans){
  const A=x.A, caps=[], geoms=[];
  const rest=(ans.q5.list||[]).filter(r=>appliesTo(r,x)&&+r.val>0);
  const covs=[];
  if(x.cov){ covs.push({v:x.cov/100*A,w:`תכסית ${x.cov}% × שטח התא`}); if(x._magrasRead) covs.push({v:x.cov/100*x.magras,w:`תכסית ${x.cov}% × גודל המגרש בטבלה (${fmt(x.magras)})`}); }
  for(const r of rest){
    if(r.kind==='freeAbove'||r.kind==='freeAll') caps.push({v:A*(1-r.val/100),w:`${r.val}% מהתא ללא בינוי${r.src?' ('+r.src+')':''}`,q5:true});
    if(r.kind==='floorCap') caps.push({v:+r.val,w:`תקרת שטח לקומה ${fmt(r.val)} מ"ר${r.src?' ('+r.src+')':''}`,q5:true});
  }
  if(x.lines&&x.lines.env>0){ const d=x.lines.w>0?{b:Math.min(x.lines.w,Math.sqrt(x.lines.env)),a:x.lines.env/Math.min(x.lines.w,Math.sqrt(x.lines.env))}:rectDims(x.lines.env,x.lines.per); /* רוחב = פעמיים הנקודה העמוקה במעטפת */ geoms.push({v:x.lines.env,w:'קווי הבניין בתשריט',d}); }
  else if(x.sb&&A>0){
    const d=rectDims(A,x.per0), {q,h,y,l}=x.sb, P=v=>Math.max(0,v);
    const rd=[{a:P(d.a-q-h),b:P(d.b-y-l)},{a:P(d.a-y-l),b:P(d.b-q-h)},{a:P(d.a-q-h),b:P(d.b-q-l)}].map(o=>({v:o.a*o.b,d:{a:Math.max(o.a,o.b),b:Math.min(o.a,o.b)}}));
    rd.sort((p,s)=>p.v-s.v);
    const sbt=`קווי בניין מטבלה 5 (קדמי ${q}, אחורי ${h}, צדדים ${y}/${l})`;
    if(rd[2].v-rd[0].v>1){ geoms.push({v:rd[2].v,w:sbt+' — קריאה מקילה',d:rd[2].d}); geoms.push({v:rd[0].v,w:sbt+' — קריאה מחמירה (צלע קדמית אחרת / תא פינתי)',d:rd[0].d}); }
    else geoms.push({v:rd[0].v,w:sbt,d:rd[0].d});
  } else geoms.push({v:A,w:'שטח התא (אין קווי בניין)',d:rectDims(A,x.per0)});
  const out=[];
  for(const g of geoms) for(const c of (covs.length?covs:[null])){
    let best={v:g.v,w:g.w}; const list=[{v:g.v,w:g.w}];
    for(const k of [c,...caps]) if(k){ list.push(k); if(k.v<best.v) best=k; }
    out.push({env:Math.max(0,best.v),bind:best.w,bindQ5:!!best.q5,parts:list,d:g.d});
  }
  out.sort((p,s)=>s.env-p.env);
  return {len:out[0],str:out[out.length-1],two:out[0].env-out[out.length-1].env>1};
}

// התא כולו
function evalCell(x,ans,conf,ctx){
  const man=manualFor(x,ans); if(man) x=Object.assign({},x,{_man:man,floors:+man.floors||x.floors});
  if(ans.q5.balc&&x.rows.some(r=>r.mirp>0)) x=Object.assign({},x,{rows:x.rows.map(r=>r.mirp>0?Object.assign({},r,{above:r.above+r.mirp}):r),_balc:x.rows.reduce((t,r)=>t+(r.mirp||0),0)});
  const g=regime(x), R={cn:x.cn,yiud:x.yiud,grp:x.grp,A:x.A,LA:x.LA,units:g.units,above:g.tot,below:g.below,floors:x.floors,floorsB:x.floorsB,H:x.H,
    cls:'fit',aCls:'fit',bCls:'fit',why:'',bWhy:'',notes:[...(ctx.notes[x.cn]||[])],deps:new Set(),steps:[],ratio:null,ratioS:null,mainUse:g.main};
  const step=(t,lines)=>R.steps.push({t,l:lines.filter(Boolean)});
  const dep=k=>R.deps.add(k);
  if(!(x.A>0)){ R.cls=R.aCls='plan'; R.why='אין שטח לתא בתשריט'; return R; }
  step('הנתונים',[`שטח התא (פוליגון): ${fmt(x.A)} מ"ר${x.LA>0?` · legal_area: ${fmt(x.LA)} מ"ר`:''}`,
    `זכויות מעל הכניסה: ${fmt(g.tot)} מ"ר${g.below?` · מתחת לכניסה: ${fmt(g.below)} מ"ר`:''}${g.units?` · ${fmt(g.units)} יח"ד`:''}`,
    `קומות בטבלה: ${x.floors||'—'} מעל${x.floorsB?`, ${x.floorsB} מתחת`:''}${x.H!=null?` · גובה: ${f1(x.H)} מ'`:''}${x.cov?` · תכסית: ${x.cov}%`:''}`,
    `שימושים: ${x.rows.filter(r=>r.above||r.below).map(r=>`${r.use} (${USE_L[r.cls]})`).join(', ')}`,
    x._balc?`כולל מרפסות: ${fmt(x._balc)} מ"ר (כרטיס 5)`:null]);
  if(x._balc) dep('q5');

  // ── מעל הכניסה ──
  if(g.tot>0){
    const ev=envelope(x,ans);
    if(ev.len.bindQ5||ev.str.bindQ5) dep('q5');
    step('שלב 3 — מעטפת מעל הכניסה',[...ev.len.parts.map(p=>`${p.w}: ${fmt(p.v)} מ"ר`),
      `המעטפת = הקטן מביניהם: ${fmt(ev.len.env)} מ"ר (קובע: ${ev.len.bind})`,
      ev.two?`קריאה שנייה (מחמירה): ${fmt(ev.str.env)} מ"ר (קובע: ${ev.str.bind})`:null]);
    if(!x.floors){ R.aCls='plan'; R.why='אין מספר קומות מעל הכניסה בטבלה 5 — אי אפשר לחשב שטח קומה'; }
    else{
      const hr=heightOf(x,ans), fh=g.main&&g.main!=='other'?ans.q2[g.main]:null, gCom=+ans.q2.com.lo||6;
      const hLow=fh?+fh.lo:null, hNorm=fh?(fh.tk?+fh.lo:(g.main==='pub'?+fh.hi:+fh.lo)):null;
      const fhKey={res:'fhRes',pub:'fhPub',off:'fhOff',other:'fhOther'}[g.main]||'fhOff';
      if(hr.manual){ dep('q1'); R.notes.push(`הוקלד ידנית (נספח מחייב): גובה ${f2(hr.Hraw)} מ'${hr.abs?' מעל פני הים':' מעל הכניסה'}${hr.z!=null?`, מפלס 0.00 ${f2(hr.z)}`:''}${hr.ground!=null?`, קרקע גבוהה בתא ${f2(hr.ground)}`:''}${x._man.floors?`, ${x._man.floors} קומות`:''}.`); }
      if(hr.missing){ dep(hr.manual?'q1':'q3'); R.notes.push(hr.manual?`פרמטר חסר: הגובה שהוקלד (${f1(hr.Hraw)}) מעל פני הים, בלי מפלס 0.00 ובלי קרקע (כרטיס 1). הגובה לא נבדק.`:`פרמטר חסר: הגובה (${f1(x.H)}) נראה מעל פני הים, ואין מפלס 0.00 לייעוד ${x.yiud} (כרטיס 3). הגובה לא נבדק — החישוב לפי מספר הקומות בטבלה.`); }
      const P=(ans.q4.list||[]).filter(p=>appliesTo(p,x)&&+p.val>0);
      const U=P.filter(p=>!p.exposed&&!p.approval), C=P.filter(p=>!p.exposed&&p.approval), X=P.filter(p=>p.exposed);
      const DROP=1;   // ירידה סבירה של 0.00 מתחת לקרקע הקיימת בשטח שטוח (ערך זמני, החלטה ק3)
      const test=(env,h,provs,dH=0)=>{
        const tp=Math.min(0.9,provs.filter(p=>p.kind==='transfer').reduce((s,p)=>s+(+p.val),0)/100);
        const xf=provs.filter(p=>p.kind==='floors').reduce((s,p)=>s+Math.round(+p.val),0);
        const fl=x.floors+xf, fit=fh?floorsFit(hr.Hrel==null?null:hr.Hrel+dH,h,g.hasCom,gCom):null;
        const fs=fit==null?fl:Math.min(fl,fit), area=g.tot*(1-tp);
        return {fs,fit,area,ratio:fs>0&&env>0?area/fs/env:Infinity,tp,xf};
      };
      const ladder=env=>{
        const L=[{k:0,t:test(env,hNorm,[])}];
        if(U.length) L.push({k:1,t:test(env,hNorm,U)});
        if(fh&&hLow<hNorm-1e-9) L.push({k:2,t:test(env,hLow,U)});
        const dG=hr.ground!=null?DROP:0;
        if(dG) L.push({k:3,t:test(env,hLow||hNorm,U,dG)});
        if(C.length) L.push({k:4,t:test(env,hLow||hNorm,[...U,...C],dG)});
        const hit=L.find(o=>o.t.ratio<=1+1e-9);
        return {lev:hit?hit.k:9,hit,last:L[L.length-1],L};
      };
      const Ll=ladder(ev.len.env), Ls=ev.two?ladder(ev.str.env):Ll;
      const sortT=test(ev.len.env,hLow||hNorm,[]);
      R.ratio=sortT.ratio; R.fs=sortT.fs; R.fit=sortT.fit; if(ev.two) R.ratioS=test(ev.str.env,hLow||hNorm,[]).ratio;
      const H=hr.Hrel;
      step('שלב 4 — כמה קומות נכנסות בגובה',[
        H==null?(x.H==null?'אין גובה מרבי בטבלה — לפי מספר הקומות בטבלה.':'אין מפלס 0.00 — לפי מספר הקומות בטבלה.'):
          `גובה זמין: ${f1(H)} מ'${hr.abs&&hr.z!=null?` (${f1(hr.Hraw||x.H)} פחות מפלס 0.00 ${f1(hr.z)})`:''}${hr.ground!=null?` (${f1(hr.Hraw)} פחות הקרקע הגבוהה בתא ${f1(hr.ground)} — מפלס 0.00 לא ידוע, מחמיר)`:''}`,
        fh?`גובה קומה (${USE_L[g.main]}): ${f2(hLow)}${hNorm!==hLow?`–${f2(hNorm)}`:''} מ'${fh.tk?' (לפי התקנון)':' — ערך מקובל, ממתין לאדריכל'}${g.hasCom?` · קומת קרקע מסחרית ${f1(gCom)} מ'`:''}`:
          `אין ערך מקובל לגובה קומה לשימוש "${USE_L[g.main]||'—'}" — לפי מספר הקומות בטבלה.`,
        sortT.fit!=null?`קומות שנכנסות: ${g.hasCom?`(${f1(H)} − ${f1(gCom)}) ÷ ${f2(hLow)} + 1`:`${f1(H)} ÷ ${f2(hLow)}`} = ${sortT.fit} (מעוגל למטה). בטבלה: ${x.floors}.`:null,
        `קומות למיון: ${sortT.fs}`,
        `יחס = ${fmt(g.tot)} ÷ ${sortT.fs} קומות ÷ ${fmt(ev.len.env)} מ"ר = ${f2(sortT.ratio)}${ev.two?` (בקריאה המחמירה: ${f2(R.ratioS)})`:''}`,
        'ספים: עד 0.8 נכנס · 0.8–1.0 נכנס, צפוף · מעל 1.0 — ממשיכים לניסיונות להכניס.']);
      if(sortT.fit!=null&&sortT.fit<x.floors) dep(fhKey);
      if(g.hasCom&&sortT.fit!=null&&sortT.fit<x.floors) dep('fhCom');
      // Q2 חלק ב — הגובה שהטבלה משתמעת ממנו
      if(H!=null&&!hr.manual&&fh&&H/x.floors<hLow-0.005){ dep('q2');
        const tt=x.floors>0&&ev.str.env>0?g.tot/x.floors/ev.str.env:Infinity;
        R.notes.push(`לפי הטבלה (${f2(H/x.floors)} מ' לקומה, ${x.floors} קומות): ${tt<=1?'נכנס':'לא נכנס'} (יחס ${f2(tt)}). הסיווג לפי הערך המקובל (${f2(hLow)} מ').`); }
      const lines8=[];
      const nm=p=>p.src?`"${p.src}"`:(p.kind==='transfer'?`העברת ${p.val}% אל מתחת לכניסה`:`תוספת ${p.val} קומות`);
      if(X.length) R.notes.push(`לא הופעלה: ${X.map(nm).join(', ')} — ההוראה דורשת קומה חשופה מתחת לכניסה, והכלי לא בודק מפלסים.`);
      let lev;
      if(Ll.lev<9&&Ls.lev<9){ lev=Ll.lev; if(ev.two&&Ls.lev!==Ll.lev) R.notes.push('שתי קריאות של קווי הבניין: שתיהן נכנסות — נלקחה המקילה.'); }
      else if(Ll.lev<9){ lev=-1; }
      else lev=9;
      const hit=lev>=0&&lev<9?Ll.hit.t:null;
      if(lev===0||lev===1){
        R.aCls='fit'; R.why=lev===1?`נכנס בעזרת ${U.map(nm).join(', ')}`:'נכנס';
        if(lev===1) dep('q4');
        if(hit.ratio>K.dense){ R.notes.push(`צפוף (יחס ${f2(hit.ratio)})`); }
      } else if(lev===2){
        const need=Math.ceil(hit.area/ev.len.env-1e-9);
        const hMax=g.hasCom?(H-gCom)/Math.max(1,need-1):H/Math.max(1,need);
        R.aCls='cond'; R.why=`נכנס בתנאי — ממתין לטווח מאושר: גובה קומה ${f2(Math.floor(hMax*20)/20)} מ' (נכנס ב-${f2(hLow)}, לא ב-${f2(hNorm)})`; dep(fhKey); if(U.length) dep('q4');
      } else if(lev===3){
        const tN=test(ev.len.env,hNorm,U,DROP), useH=tN.ratio<=1+1e-9?hNorm:hLow;
        const need=Math.min(x.floors,Math.ceil(hit.area/ev.len.env-1e-9)), reqH=g.hasCom?gCom+(need-1)*useH:need*useH, drop=Math.max(0,reqH-H);
        const zReq=hr.ground-drop;
        if(tN.ratio<=1+1e-9){ R.aCls='fit'; R.why='נכנס, אם מפלס 0.00 יורד עד 1 מ׳ מתחת לקרקע'; }
        else { const hMax=g.hasCom?(H+DROP-gCom)/Math.max(1,need-1):(H+DROP)/Math.max(1,need);
          R.aCls='cond'; R.why=`נכנס בתנאי — ממתין לטווח מאושר: גובה קומה ${f2(Math.floor(hMax*20)/20)} מ' (נכנס ב-${f2(hLow)}, לא ב-${f2(hNorm)})`; dep(fhKey); }
        R.notes.push(`פרמטר חסר: נדרש 0.00 ≤ ${f2(zReq)} (ירידה של ${f2(drop)} מ' מתחת לקרקע הגבוהה בתא; בשטח שטוח עד 1 מ' סביר)`); dep('q1'); if(U.length) dep('q4');
      } else if(lev===4){
        R.aCls='cond'; R.why=`נכנס בתנאי: ${C.map(nm).join(', ')} — באישור`; dep('q4');
      } else if(lev===-1){
        R.aCls='plan'; R.why=`שתי קריאות של קווי הבניין נותנות תשובות הפוכות: בקריאה המקילה נכנס, במחמירה חסרים ${fmt(Ls.last.t.area-Ls.last.t.fs*ev.str.env)} מ"ר. הטבלה צריכה הבהרה.`;
      } else {
        // שלב 8 — לא נכנס גם עם כל הניסיונות
        dep('q4');
        const t=Ll.last.t, fitArea=t.fs*ev.len.env, miss=t.area-fitArea;
        lines8.push(`לא נכנס גם במעטפת המקילה, בגובה קומה ${f2(hLow||hNorm)} מ'${P.length?' ועם ההוראות המתירות':''}: נכנסים ${fmt(fitArea)} מ"ר מתוך ${fmt(t.area)} (חסרים ${fmt(miss)}).`);
        const mand=(ans.q6.mand||[]).includes(x.yiud);
        if(g.share('res')>=0.9&&g.units>0){
          const fpu=fitArea/g.units, apu=g.tot/g.units;
          lines8.push(`מגורים: בשטח שנכנס יש ${fmt(fpu)} מ"ר ליח"ד (סף "יח"ד נכנסות": ${K.unitFit}); בטבלה ${fmt(apu)} מ"ר ליח"ד (סף "גדול מהמקובל": ${K.unitBig}).`);
          dep('unitFit'); dep('unitBig');
          if(fpu>=K.unitFit&&apu>K.unitBig){ R.aCls='excess'; R.why=`זכויות עודפות: היח"ד נכנסות (${fmt(fpu)} מ"ר ליח"ד), והשטח לדירה בטבלה גדול מהמקובל (${fmt(apu)} מ"ר). חסרים ${fmt(miss)} מ"ר.`; }
        }
        if(R.aCls==='fit'&&g.main==='pub'&&g.share('pub')>=0.9&&!mand){ dep('q6');
          R.aCls='excess'; R.why=`זכויות עודפות + פרמטר חסר (פרוגרמה): אין חובה לממש בייעוד הזה (כרטיס 6). חסרים ${fmt(miss)} מ"ר.`; }
        if(R.aCls==='fit'){
          if(g.main==='pub') dep('q6');
          const why=[];
          if(!conf.q4) why.push('כרטיס 4 (הוראות מתירות) עוד לא אושר');
          if(hr.missing) why.push('חסר מפלס 0.00 (כרטיס 3)');
          if(x._laSuspect) why.push('שטח התא לא אומת מול התדפיס');
          if(X.length) why.push('הוראה שדורשת קומה חשופה לא נבדקה');
          if(!fh) why.push(`אין ערך מקובל לגובה קומה של ${USE_L[g.main]||'השימוש'}`);
          const what=USE_L[g.main]||'שטח';
          if(why.length){ R.aCls='plan'; R.why=`חסרים ${fmt(miss)} מ"ר של ${what}. לא סומן כממצא כי: ${why.join('; ')}.`; }
          else { R.aCls='mat'; R.why=`ממצא מהותי: חסרים ${fmt(miss)} מ"ר של ${what} — לא נכנס גם במעטפת המקילה, בקצה הנמוך של גובה הקומה ועם כל ההוראות.`; }
        }
      }
      // מגבלת תמהיל (כרטיס 7)
      const q7=ans.q7;
      if(g.share('res')>=0.9&&g.units>0&&(q7.avgMin||q7.avgMax)){ dep('q7'); dep('core');
        const apu=g.tot/g.units;
        if(q7.avgMin){ const maxCore=1-q7.avgMin/apu;
          if(maxCore<K.coreLo&&SEV[R.aCls]<SEV.excess){ const fitU=Math.floor(g.tot*(1-K.coreLo)/q7.avgMin);
            R.aCls='excess'; R.why=`זכויות עודפות ביח"ד: בממוצע ${fmt(q7.avgMin)} מ"ר נטו וליבה של ${pct(K.coreLo)} נכנסות ${fmt(fitU)} יח"ד מתוך ${fmt(g.units)}.`; }
          else R.notes.push(`תמהיל: ליבה מרבית ${pct(maxCore)} (מקובל ${pct(K.coreLo)}–${pct(K.coreHi)}) — עובר.`); }
        if(q7.avgMax){ const minNet=apu*(1-K.coreHi);
          if(minNet>q7.avgMax&&SEV[R.aCls]<SEV.plan){ R.aCls='plan'; R.why=`שטח לדירה נטו לפחות ${fmt(minNet)} מ"ר (גם בליבה של ${pct(K.coreHi)}), מעל תקרת הממוצע (${fmt(q7.avgMax)} מ"ר).`; } }
      }
      // שלב 6 — שלושה מספרים של טיפולוגיה (רק לתא שנכנס)
      if(R.aCls==='fit'||R.aCls==='cond'){
        const t=hit||sortT, floorA=t.area/t.fs, tower=x.floors>K.towerFloors||(H!=null&&H-(hLow||hNorm||0)>K.towerH);   // 29 מ׳ עד רצפת הקומה העליונה (כמו בתקנות)
        const l6=[`שטח קומה נדרש: ${fmt(floorA)} מ"ר`];
        if(tower){ dep('tower'); const cov=floorA/ev.len.env; l6.push(`מגדל: כיסוי המעטפת ${pct(cov)} (מקובל עד ${pct(K.towerCov)})`);
          if(cov>K.towerCov){ dep('towerCov'); R.aCls='plan'; R.why=`נכנס רק אם קומת המגדל מכסה ${pct(cov)} מהמעטפת בכל ${t.fs} הקומות. מעל הערך המקובל (85%).`; } }
        const d=ev.len.d;
        if(g.main==='res'&&d&&d.b>=K.widthLo&&d.b<=K.widthHi&&R.aCls!=='plan'){ const depth=floorA/d.a; dep('depth');
          l6.push(`רוחב המעטפת ${f1(d.b)} מ', אורך ${f1(d.a)} מ' → עומק בניין נדרש ${f1(depth)} מ'`);
          if(depth>K.depthMax){ R.aCls='plan'; R.why=`המעטפת ברוחב ${f1(d.b)} מ'. כדי להכניס את הזכויות נדרש בניין בעומק ${f1(depth)} מ', מעל המקובל (עד 22 מ').`; }
          else if(depth>K.depthOk&&R.aCls==='fit'){ R.aCls='cond'; R.why=`נכנס בתנאי: עומק בניין ${f1(depth)} מ' (קצה הטווח, בלוק עם גרעין מרכזי)`; } }
        if(tower&&g.main==='off'&&floorA>K.officePlate&&R.aCls!=='plan'){ dep('officePlate'); R.aCls='plan'; R.why=`נדרשת קומת משרדים של ${fmt(floorA)} מ"ר, מעל הערך המקובל (${fmt(K.officePlate)} מ"ר).`; }
        // שטח פתוח בתוך התא
        for(const r of (ans.q5.list||[]).filter(r=>r.kind==='openSpace'&&+r.val>0&&appliesTo(r,x))){ dep('q5');
          const left=x.A-floorA; l6.push(`שטח פתוח נדרש ${fmt(r.val)} מ"ר; אחרי שטח הקומה נשארים ${fmt(left)}`);
          if(left<+r.val&&R.aCls!=='plan'){ R.aCls='plan'; R.why=`התקנון מחייב ${fmt(r.val)} מ"ר פתוחים. אחרי התכסית הנדרשת נשארים ${fmt(left)} מ"ר.`; } }
        step('שלב 6 — טיפולוגיה (שלושה מספרים, בלי העמדה)',l6);
      }
      step('שלב 8–9 — סיווג מעל הכניסה',[...Ll.L.map(o=>`${['בלי הוראות, גובה קומה רגיל','עם הוראות מתירות בלי תנאי','+ קצה נמוך של גובה הקומה','+ ירידת 0.00 עד 1 מ׳ מתחת לקרקע','+ הוראות באישור ועדה/מהנדס'][o.k]}: ${o.t.fs} קומות, יחס ${f2(o.t.ratio)}${o.t.ratio<=1+1e-9?' ✓':''}`),
        ...lines8, R.why.startsWith(CL[R.aCls])?`→ ${R.why}`:`→ ${CL[R.aCls]}: ${R.why}`]);
    }
  }
  // ── מתחת לכניסה (שלב 5.4, הכרעה ד) ──
  if(g.below>0){
    const rest=(ans.q5.list||[]).filter(r=>appliesTo(r,x)&&+r.val>0), parts=[{v:x.A,w:'שטח התא'}];
    for(const r of rest){ if(r.kind==='basementCov') parts.push({v:x.A*r.val/100,w:`תכסית מרתף ${r.val}%`}); if(r.kind==='freeAll') parts.push({v:x.A*(1-r.val/100),w:`${r.val}% ללא בינוי מעל ומתחת`}); }
    if(parts.length>1) dep('q5');
    const envB=Math.min(...parts.map(p=>p.v));
    // לכל שורה בטבלה 5 בנפרד, מול הקומות שלה (מקל: שורות שונות לא נספרות כחולקות את אותן קומות)
    const bl=[]; let miss=0, rbMax=0, unk=false;
    for(const r of x.rows.filter(r=>r.below>0)){
      const fl=r.fB||x.floorsB; if(!fl){ unk=true; bl.push(`${r.use}: ${fmt(r.below)} מ"ר — אין מספר קומות, לא נבדק`); continue; }
      const cap=envB*fl, rb=r.below/cap; rbMax=Math.max(rbMax,rb); if(rb>1+1e-9) miss+=r.below-cap;
      bl.push(`${r.use}: ${fmt(r.below)} ÷ (${fmt(envB)} × ${fl} קומות) = ${f2(rb)}${rb>1+1e-9?' ✗':' ✓'}`);
    }
    R.ratioB=rbMax||null;
    if(miss>0){ R.bCls='excess'; R.bMiss=miss; R.bWhy=`מתחת לכניסה: זכויות עודפות + פרמטר חסר (תקן חניה). חסרים ${fmt(miss)} מ"ר.`; }
    else if(rbMax) R.bWhy=rbMax>=1-K.eps?'מתחת לכניסה: נכנס (ללא מרווח)':'מתחת לכניסה: נכנס';
    else R.bWhy='מתחת לכניסה: לא נבדק';
    if(unk) R.notes.push('מתחת לכניסה: לשורה בלי מספר קומות — לא נבדקה.');
    step('שלב 5 — מתחת לכניסה (מרתף), לכל שורה',[...parts.map(p=>`${p.w}: ${fmt(p.v)} מ"ר`),...bl,`→ ${R.bWhy}`]);
  }
  R.cls=worst(R.aCls,R.bCls);
  if(!R.why) R.why=g.tot>0?'נכנס':'';
  if(R.bCls!=='fit'&&SEV[R.bCls]>SEV[R.aCls]) R.whyMain=R.bWhy; else R.whyMain=R.why;
  R.deps=[...R.deps];
  return R;
}

function run(cells,spec,ctx){
  ctx=ctx||{}; const ans=spec.ans, conf=spec.conf||{};
  const rev=reverse(cells,ans);
  for(const x of Object.values(cells)) if(x.notesIn&&x.notesIn.length) (rev.notes[x.cn]=rev.notes[x.cn]||[]).unshift(...x.notesIn);
  const one=x=>{
    const g=regime(x);
    if(!(ans.q5.alt||[]).includes(x.yiud)||!(g.by.res>0&&g.by.pub>0)) return evalCell(x,ans,conf,{notes:rev.notes});
    // שימושים חלופיים (מגורים או ציבור): כל חלופה נבדקת לבד, עם הקומות והגובה של השורות שלה; הקובעת — החמורה
    const mk=(drop,lbl)=>{ const rs=x.rows.filter(r=>r.cls!==drop), up=rs.filter(r=>r.above>0);
      const fl=Math.max(0,...up.map(r=>r.fA||0))||x.floors, h=Math.max(0,...up.map(r=>r.gova||0))||x.H;
      const R=evalCell(Object.assign({},x,{rows:rs,floors:fl,H:h}),ans,conf,{notes:rev.notes}); R._alt=lbl; return R; };
    const a=mk('pub','מגורים'), b=mk('res','ציבור');
    const w=SEV[b.cls]>SEV[a.cls]||(SEV[b.cls]===SEV[a.cls]&&(b.ratio||0)>(a.ratio||0))?b:a, o=w===a?b:a;
    w.notes.unshift(`שימושים חלופיים (כרטיס 5): כל חלופה נבדקה לבד. הקובעת: ${w._alt}. החלופה השנייה (${o._alt}): ${CL[o.cls]}${o.ratio!=null&&isFinite(o.ratio)?', יחס '+f2(o.ratio):''}.`);
    w.deps=[...new Set([...w.deps,'q5'])]; w.units=regime(x).units; return w; };
  const rows=Object.values(cells).map(one);
  const cnt={}; for(const c of CLS) cnt[c]=0; for(const r of rows) cnt[r.cls]++;
  rows.sort((a,b)=>SEV[b.cls]-SEV[a.cls]||(b.ratio||0)-(a.ratio||0));
  const depCnt={}; for(const r of rows) for(const d of r.deps) depCnt[d]=(depCnt[d]||0)+1;
  // הערות לתוכנית ולשורה
  const plan=[], rowNotes=[];
  if(Object.values(cells).some(x=>x._pct)) plan.push('הזכויות בטבלה 5 רשומות באחוזים משטח התא ("% מתא שטח") — הומרו למ"ר לפי שטח הפוליגון. מספר יח"ד מחושב מהצפיפות, כשאין עמודת יח"ד.');
  if(ctx.noLinesLayer) plan.push('אין קווי בניין בתשריט: המעטפת נבנית מהמספרים בטבלה 5. בלי לדעת איזו צלע פונה לדרך, מחושבות שתי קריאות של כיוון הקווים.');
  const bx={}; for(const r of rows) if(r.bCls==='excess'){ const k=r.grp||r.yiud; (bx[k]=bx[k]||[]).push(r); }
  for(const [k,list] of Object.entries(bx)) rowNotes.push({t:`מרתף, ${k} (${list.length} תאים): זכויות עודפות + פרמטר חסר (תקן חניה). חסרים בסך הכל ${fmt(list.reduce((s,r)=>s+r.bMiss,0))} מ"ר.`,cells:list.map(r=>r.cn)});
  if(Object.keys(bx).length) plan.push('תקן חניה לא נבדק (פרמטר חסר): זכויות מרתף שלא נכנסות מסומנות "זכויות עודפות", לא ממצא.');
  plan.push('מפלסים, שיפוע, ערימה אנכית, חזית מסחרית ותא עם כמה אזורי גובה לא נבדקים בכלי: הוא עובד רק על התשריט וטבלה 5.');
  const mirp=Object.values(cells).reduce((s,x)=>s+(x.mirp||0),0);
  if(mirp>0) plan.push(ans.q5.balc?`מרפסות (${fmt(mirp)} מ"ר בטבלה) נכללו בשטח מעל הכניסה (כרטיס 5).`:`מרפסות (${fmt(mirp)} מ"ר בטבלה) לא נכללו בשטח שנבדק. אם הן בתוך התכסית — לסמן בכרטיס 5.`);
  if(ans.q1.status==='bind') plan.push(`נספח הבינוי מחייב${ans.q1.topic?' ב'+ans.q1.topic:''}. הכלי לא קורא אותו: נתוני התאים לפי טבלה 5 בלבד — כדאי לבדוק את התאים הרלוונטיים מול הנספח.`);
  const missZ=new Set(rows.filter(r=>r.deps.includes('q3')).map(r=>r.yiud));
  if(missZ.size) plan.push(`הגובה בטבלה נראה מעל פני הים ב: ${[...missZ].join(', ')}. בלי מפלס 0.00 (כרטיס 3) הגובה לא נבדק.`);
  return {rows,cnt,depCnt,rev,plan,rowNotes};
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. UI
// ═══════════════════════════════════════════════════════════════════════════
const CSS=`
#fc-panel{display:none;flex-direction:column;width:min(640px,62vw);min-width:420px;flex-shrink:0;background:#141e2c;border-left:1px solid #2d4060;color:#d6e2f0;font-size:13px;overflow:hidden}
#fc-panel.vis{display:flex}
#fc-hdr{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#1f2e42;border-bottom:1px solid #2d4060;flex-shrink:0}
#fc-hdr h2{margin:0;font-size:14px;color:#7ecfff;flex:1;font-weight:600}
#fc-hdr button,.fc-btn{background:#2c3e55;border:1px solid #3a5070;color:#cde;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px}
.fc-btn.ok{background:#1e6b3a;border-color:#2e8b50;color:#fff;font-weight:600}
#fc-body{overflow:auto;padding:10px 14px 30px;flex:1}
.fc-sec{margin:0 0 12px;border:1px solid #2d4060;border-radius:8px;background:#172334}
.fc-sec>summary{cursor:pointer;padding:8px 10px;font-weight:600;color:#9fd3ff;list-style:none}
.fc-sec>summary::-webkit-details-marker{display:none}
.fc-sec>summary:before{content:'▸ ';color:#6a8ab0}.fc-sec[open]>summary:before{content:'▾ '}
.fc-in{padding:4px 10px 10px}
.fc-sum{padding:8px 10px;line-height:1.8}
.fc-cnt{display:inline-block;border-radius:10px;padding:1px 9px;margin:0 2px 3px;color:#fff;font-weight:600;font-size:12px;cursor:pointer}
.fc-cnt.off{opacity:.35}
.fc-small{font-size:11.5px;color:#8fa3b8}
.fc-note{font-size:12px;color:#b5c4d4;padding:3px 0;line-height:1.55}
.fc-card{border:1px solid #6b5a1e;border-right:4px solid #8a8f98;border-radius:7px;padding:7px 10px 8px;margin:8px 0;background:#1a1f26}
.fc-card.done{border-color:#2e6b44;border-right-color:#2e8b50;background:#14231b}
.fc-card.zero{opacity:.8}
.fc-ch{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap}.fc-ch b{font-size:13.5px;color:#e6eef8}
.fc-st{font-size:11px;border-radius:9px;padding:1px 8px;background:#3a3f48;color:#ccd}
.fc-st.ok{background:#1e6b3a;color:#fff}
.fc-imp{font-size:11.5px;color:#f7c56b}
.fc-card .fc-q{font-size:12.5px;line-height:1.7;margin-top:4px}
.fc-card input[type=number],.fc-card input[type=text],.fc-card select{background:#0f1824;color:#e6eef8;border:1px solid #34506f;border-radius:5px;padding:2px 5px;font-size:12.5px}
.fc-card input[type=number]{width:64px}
.fc-li{border:1px dashed #34506f;border-radius:6px;padding:5px 8px;margin:5px 0;line-height:2}
.fc-yi{display:inline-flex;align-items:center;gap:2px;margin-left:8px;font-size:12px;white-space:nowrap}
.fc-tbl{width:100%;border-collapse:collapse;font-size:12px}
.fc-tbl th{position:sticky;top:0;background:#1f2e42;color:#9fd3ff;font-weight:600;padding:5px 4px;text-align:right;border-bottom:1px solid #2d4060;white-space:nowrap}
.fc-tbl td{padding:4px;border-bottom:1px solid #22344d;vertical-align:top}
.fc-tbl tr.c{cursor:pointer}.fc-tbl tr.c:hover td{background:#1c2c42}
.fc-v{display:inline-block;border-radius:8px;padding:1px 7px;color:#fff;font-weight:600;white-space:nowrap}
.fc-why{font-size:11.5px;color:#b5c4d4;margin-top:2px}
.fc-tw{overflow-x:auto}
.fc-tv{display:inline-block;font-size:10.5px;background:#3a2f12;color:#f7c56b;border:1px solid #6b5a1e;border-radius:8px;padding:0 6px;margin-right:4px}
.fc-flt{display:flex;gap:6px;flex-wrap:wrap;padding:0 10px 8px}
.fc-flt select{background:#0f1824;color:#e6eef8;border:1px solid #34506f;border-radius:5px;padding:2px 5px;font-size:12px}
#fc-pop{display:none;position:fixed;inset:0;background:rgba(5,12,22,.55);z-index:9000;align-items:center;justify-content:center}
#fc-pop.vis{display:flex}
#fc-pop .fcx-box{width:min(760px,94vw);max-height:88vh;display:flex;flex-direction:column;background:#141e2c;color:#d6e2f0;border:1px solid #3d6a9a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);direction:rtl}
#fc-pop .fcx-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1f2e42;border-bottom:1px solid #2d4060;border-radius:10px 10px 0 0}
#fc-pop .fcx-hd b{flex:1;color:#7ecfff;font-size:14px}
#fc-pop .fcx-hd button{background:#2c3e55;border:1px solid #3a5070;color:#cde;border-radius:6px;padding:3px 10px;cursor:pointer}
#fc-pop .fcx-bd{overflow:auto;padding:12px 16px 20px;font-size:13px;line-height:1.7}
.fcx-sec{border-top:1px solid #2d4060;padding:8px 0 10px}
.fcx-sec h4{margin:0 0 4px;color:#9fd3ff;font-size:13.5px}
.fcx-sec div{padding-right:8px}
.t5v-fc-x{cursor:pointer}.t5v-fc-x:hover{outline:1px dashed #6a8ab0}
body.theme-light #fc-panel{background:#f4f7fb;color:#1c2b3c;border-left-color:#bfccdb}
body.theme-light #fc-hdr{background:#e6edf5;border-color:#bfccdb}
body.theme-light #fc-hdr h2{color:#1a3560}
body.theme-light .fc-sec{background:#fff;border-color:#cfd9e6}
body.theme-light .fc-sec>summary{color:#1a3560}
body.theme-light .fc-small{color:#4a5d73}
body.theme-light .fc-note,body.theme-light .fc-why{color:#34485e}
body.theme-light .fc-card{background:#fbfbfc;border-color:#d9d0b0;border-right-color:#9aa3ad}
body.theme-light .fc-card.done{background:#f3fbf5;border-color:#9fd3b0;border-right-color:#2e8b50}
body.theme-light .fc-ch b{color:#1a3560}
body.theme-light .fc-st{background:#e3e7ec;color:#34485e}
body.theme-light .fc-st.ok{background:#1e6b3a;color:#fff}
body.theme-light .fc-imp{color:#8a5a00}
body.theme-light .fc-card input,body.theme-light .fc-card select,body.theme-light .fc-flt select{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .fc-li{border-color:#cfd9e6}
body.theme-light .fc-tbl th{background:#e6edf5;color:#1a3560}
body.theme-light .fc-tbl tr.c:hover td{background:#eef3f9}
body.theme-light .fc-tbl td{border-color:#e1e8f0}
body.theme-light .fc-tv{background:#fff6dc;color:#7a5a00;border-color:#e0c26b}
body.theme-light #fc-hdr button,body.theme-light .fc-btn{background:#fff;color:#1a3560;border-color:#bfccdb}
body.theme-light .fc-btn.ok{background:#1e6b3a;color:#fff;border-color:#1e6b3a}
body.theme-light #fc-pop .fcx-box{background:#fff;color:#1c2b3c;border-color:#8fb0d6}
body.theme-light #fc-pop .fcx-hd{background:#e6edf5;border-color:#bfccdb}
body.theme-light #fc-pop .fcx-hd b,body.theme-light .fcx-sec h4{color:#1a3560}
body.theme-light .fcx-sec{border-color:#dde5ef}
`;
function _css(){ if(typeof document==='undefined'||$('fc-css')) return; const st=document.createElement('style'); st.id='fc-css'; st.textContent=CSS; document.head.appendChild(st); }
function _ensureDom(){
  if($('fc-panel')) return true;
  const main=$('main-area'), wrap=$('canvas-wrap'); if(!main||!wrap) return false;
  _css();
  const p=document.createElement('div'); p.id='fc-panel';
  p.innerHTML=`<div id="fc-hdr"><h2>🏗 בקרת בינוי — האם הזכויות נכנסות בתאים</h2>
    <button onclick="FC.explainMethod()">ⓘ איך זה עובד</button><button onclick="FC.close()">✕ סגירה</button></div><div id="fc-body"></div>`;
  main.insertBefore(p,wrap); return true;
}
const _resize=()=>{ try{ if(typeof resize==='function') resize(); }catch(e){} };
const _redraw=()=>{ try{ if(typeof redraw==='function') redraw(); }catch(e){} };
function curPlan(){ try{ return String((typeof _projPlanNumber==='function'&&_projPlanNumber())||''); }catch(e){ return ''; } }

FC.openPanel=function(){
  if(!_ensureDom()) return;
  try{ if($('rn-panel')&&$('rn-panel').style.display==='flex'&&typeof closeRoadNetPanel==='function') closeRoadNetPanel(); }catch(e){}
  try{ if($('t5-panel')&&$('t5-panel').classList.contains('vis')) closeTable5View(); }catch(e){}
  try{ if($('tama-panel')&&$('tama-panel').classList.contains('vis')) closeTamaView(); }catch(e){}
  try{ if(root.PR&&PR.open) PR.close(); }catch(e){}
  if($('legend')) $('legend').style.display='none';
  $('fc-panel').classList.add('vis'); const b=$('btn-fc'); if(b) b.classList.add('active');
  FC.open=true;
  const p=curPlan(); if(!FC.spec) FC.spec=emptySpec(p);
  if(p&&FC.spec.plan&&FC.spec.plan!==p&&!FC.hasUser()) FC.spec=emptySpec(p);   // לא לגרור תשובות מתוכנית אחרת
  if(!FC.spec.plan) FC.spec.plan=p;
  FC.ensure(true); FC.render(); _resize(); _redraw();
};
FC.close=function(){
  const p=$('fc-panel'); if(p) p.classList.remove('vis');
  if($('legend')) $('legend').style.display='';
  const b=$('btn-fc'); if(b) b.classList.remove('active');
  FC.open=false; _resize(); _redraw();
};
FC.toggle=function(){ FC.open?FC.close():FC.openPanel(); };

// ── נתונים מהממשק ──
function featIndex(){ const idx={}; const L=state.layers&&state.layers.plan; if(!L) return idx;
  for(const f of L.features){ const n=String(f.properties.NUM??'').trim(); if(n) (idx[n]=idx[n]||[]).push(f); } return idx; }
function perim(f,mpuIn){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates; let s=0;
  for(const p of P){ const r=p[0]; for(let i=1;i<r.length;i++) s+=Math.hypot(r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]); }
  const mpu=mpuIn||((typeof state!=='undefined'&&state.spanMeters&&typeof DATA_SIZE!=='undefined')?state.spanMeters/DATA_SIZE:1); return s*mpu; }
// L (בדיקות): {area, buildGeom, mpu} — ברירת מחדל: הפונקציות של הממשק
function geomOf(idx,L){ L=L||{}; const area=L.area||(f=>_featureAreaM2(f)), bgeom=L.buildGeom||(f=>_calcBuildGeom(f));
  return cn=>{ const fs=idx[cn]; if(!fs||!fs.length) return null;
  let A=0; try{ for(const f of fs) A+=area(f); }catch(e){ return null; }
  const LA=fs.reduce((s,f)=>s+(+f.properties.LEGAL_AREA||0),0);
  let lines=null; try{ const g=bgeom(fs[0]); if(g&&!g.noLines&&g.env>0) lines={env:g.env,per:g.per,w:g.w}; }catch(e){}
  let per0=null; try{ per0=perim(fs[0],L.mpu); }catch(e){}
  return {A,LA,lines,per0}; }; }
function _noLinesLayer(){ const arc=state.layers&&state.layers.arc; return !arc||!arc.features.some(f=>typeof _isBuildLine==='function'&&_isBuildLine(f.properties.MAVAT_CODE)); }
FC.ensure=function(force){
  if(!state.table5||!state.layers||!state.layers.plan){ FC.res=null; return null; }
  const sig=JSON.stringify(FC.spec);
  if(!force&&FC.res&&FC._t5===state.table5&&FC._plan===state.layers.plan&&FC._sig===sig) return FC.res;
  FC._idx=featIndex(); FC._cells=cellsFromT5(state.table5,geomOf(FC._idx));
  FC.res=run(FC._cells,FC.spec,{noLinesLayer:_noLinesLayer()});
  FC._t5=state.table5; FC._plan=state.layers.plan; FC._sig=sig;
  FC._by=Object.fromEntries(FC.res.rows.map(r=>[r.cn,r]));
  FC._yiuds=[...new Set(Object.values(FC._cells).map(x=>x.yiud))].filter(Boolean);
  return FC.res;
};
FC.resultFor=function(cn){ try{ if(!FC.spec) FC.spec=emptySpec(curPlan()); if(!FC.ensure()) return null; return FC._by[String(cn)]||null; }catch(e){ return null; } };

// ── עדכוני כרטיסים (בכל handler רק מזהים/אינדקסים — בלי טקסט עברי בתוך onclick) ──
const A_=()=>FC.spec.ans;
const _upd=()=>{ FC.ensure(true); FC.render(); _redraw(); };
const val=el=>el.type==='checkbox'?el.checked:(el.type==='number'?(el.value===''?null:+el.value):el.value);
FC.set=function(path,el){ const ks=path.split('.'); let o=A_(); for(let i=0;i<ks.length-1;i++) o=o[ks[i]]; o[ks[ks.length-1]]=val(el); _upd(); };
FC.setZ=function(yi,el){ A_().q3.z[FC._yiuds[yi]]=el.value===''?null:+el.value; _upd(); };
FC.conf=function(q){ FC.spec.conf[q]=!FC.spec.conf[q]; _upd(); };
FC.addItem=function(q){ const L=A_()[q].list; L.push(q==='q4'?{kind:'transfer',val:null,exposed:false,approval:false,yiud:null,src:''}:{kind:'basementCov',val:null,yiud:null,minCell:null,src:''}); FC.spec.conf[q]=false; _upd(); };
FC.addMan=function(){ const q=A_().q1; (q.manual=q.manual||[]).push({cells:'',H:null,ref:'abs',z:null,ground:null,floors:null}); _upd(); };
FC.delMan=function(i){ A_().q1.manual.splice(i,1); _upd(); };
FC.setMan=function(i,k,el){ A_().q1.manual[i][k]=val(el); _upd(); };
FC.delItem=function(q,i){ A_()[q].list.splice(i,1); _upd(); };
FC.setItem=function(q,i,k,el){ A_()[q].list[i][k]=val(el); _upd(); };
FC.itemYiud=function(q,i,yi,el){ const it=A_()[q].list[i], y=FC._yiuds[yi];
  let s=it.yiud&&it.yiud.length?[...it.yiud]:[...FC._yiuds]; s=el.checked?[...new Set([...s,y])]:s.filter(v=>v!==y);
  it.yiud=s.length===FC._yiuds.length?null:s; _upd(); };
FC.alt=function(yi,el){ const y=FC._yiuds[yi], m=A_().q5.alt||[]; A_().q5.alt=el.checked?[...new Set([...m,y])]:m.filter(v=>v!==y); _upd(); };
FC.mand=function(yi,el){ const y=FC._yiuds[yi], m=A_().q6.mand; const s=el.checked?[...new Set([...m,y])]:m.filter(v=>v!==y); A_().q6.mand=s; _upd(); };
FC.setFilter=function(k,v){ FC[k]=FC[k]===v&&k==='filter'?'all':v; FC.render(); };
FC.focus=function(cn){
  FC.sel=String(cn); _redraw();
  const fs=FC._idx&&FC._idx[cn]; if(!fs||typeof dc!=='function'||typeof zoomAt!=='function') return;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const f of fs){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates; for(const p of P) for(const [x,y] of p[0]){ x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} }
  const W=wrap.clientWidth,H=wrap.clientHeight, mpu=(typeof _mPerUnit==='function'&&_mPerUnit())||1;
  const span=Math.max((x1-x0)/0.3,(y1-y0)/0.3*W/H,300/mpu), target=W/span;
  const [sx,sy]=dc((x0+x1)/2,(y0+y1)/2); zoomAt(sx,sy,target/scale);
};

// ── 7 הכרטיסים ──
function _yiudBoxes(q,i,item){ return FC._yiuds.map((y,yi)=>`<label class="fc-yi"><input type="checkbox" ${!item.yiud||!item.yiud.length||item.yiud.includes(y)?'checked':''} onchange="FC.itemYiud('${q}',${i},${yi},this)">${E(y)}</label>`).join(''); }
const tvTag=k=>`<span class="fc-tv" title="${E(TVST[TV[k].st])}">${TV[k].st==='prop'?'הצעה':'ממתין לאדריכל'}</span>`;
function cardsDef(R){
  const a=A_(), dc=k=>R.depCnt[k]||0;
  const rowsB=Object.values(R.rev.rows).filter(r=>r.impliedH);
  const absY=FC._yiuds.filter(y=>Object.values(FC._cells).some(x=>x.yiud===y&&heightOf(x,Object.assign({},a,{q3:{mode:a.q3.mode,z:{}}})).abs));
  const noVal=[...new Set(Object.values(FC._cells).map(x=>regime(x).main).filter(m=>m==='other'))];
  const fhRow=(u,l,tvk)=>{ const v=a.q2[u]; return `<div>${l}: <input type="number" step="0.05" value="${v.lo}" onchange="FC.set('q2.${u}.lo',this)"> – <input type="number" step="0.05" value="${v.hi}" onchange="FC.set('q2.${u}.hi',this)"> מ'
    <label class="fc-yi"><input type="checkbox" ${v.tk?'checked':''} onchange="FC.set('q2.${u}.tk',this)">נקבע בתקנון</label>${v.tk?'':tvTag(tvk)}</div>`; };
  const q4i=(it,i)=>`<div class="fc-li">
    <select onchange="FC.setItem('q4',${i},'kind',this)"><option value="transfer"${it.kind==='transfer'?' selected':''}>העברת שטח מעל הכניסה אל מתחתיה</option><option value="floors"${it.kind==='floors'?' selected':''}>תוספת קומות</option></select>
    ${it.kind==='transfer'?'עד':'מספר קומות:'} <input type="number" value="${it.val??''}" onchange="FC.setItem('q4',${i},'val',this)">${it.kind==='transfer'?'%':''}
    <button class="fc-btn" onclick="FC.delItem('q4',${i})">✕</button><br>
    <label class="fc-yi"><input type="checkbox" ${it.approval?'checked':''} onchange="FC.setItem('q4',${i},'approval',this)">רק באישור ועדה / מהנדס</label>
    <label class="fc-yi"><input type="checkbox" ${it.exposed?'checked':''} onchange="FC.setItem('q4',${i},'exposed',this)">דורשת קומה חשופה מתחת לכניסה ("לא יהיו בתת-קרקע")</label><br>
    מקור: <input type="text" style="width:180px" placeholder="הערה / סעיף" value="${E(it.src)}" onchange="FC.setItem('q4',${i},'src',this)"><br>
    <span class="fc-small">חל על:</span> ${_yiudBoxes('q4',i,it)}</div>`;
  const K5={basementCov:'תכסית מרתף לא תעלה על (%)',freeAbove:'שטח ללא בינוי מעל הקרקע (% מהתא)',freeAll:'שטח ללא בינוי מעל ומתחת לקרקע (% מהתא)',floorCap:'תקרת שטח לקומה / למבנה (מ"ר)',openSpace:'שטח פתוח נדרש בתוך התא (מ"ר)'};
  const q5i=(it,i)=>`<div class="fc-li">
    <select onchange="FC.setItem('q5',${i},'kind',this)">${Object.entries(K5).map(([k,l])=>`<option value="${k}"${it.kind===k?' selected':''}>${l}</option>`).join('')}</select>
    <input type="number" value="${it.val??''}" onchange="FC.setItem('q5',${i},'val',this)"> <button class="fc-btn" onclick="FC.delItem('q5',${i})">✕</button><br>
    רק בתא ששטחו מעל <input type="number" value="${it.minCell??''}" onchange="FC.setItem('q5',${i},'minCell',this)"> מ"ר (ריק = כל התאים) ·
    מקור: <input type="text" style="width:140px" value="${E(it.src)}" onchange="FC.setItem('q5',${i},'src',this)"><br>
    <span class="fc-small">חל על:</span> ${_yiudBoxes('q5',i,it)}</div>`;
  const potB=Object.values(FC._cells).filter(x=>regime(x).below>0).length;
  const altY=FC._yiuds.filter(y=>Object.values(FC._cells).some(x=>x.yiud===y&&regime(x).by.res>0&&regime(x).by.pub>0));
  return [
    {q:'q1',t:'מעמד נספח הבינוי',n:a.q1.status==='bind'?Math.max(1,dc('q1')):0,nTxt:a.q1.status==='bind'&&!dc('q1')?'הערה לכל התוכנית':null,
      h:`<div>לפי טבלה 1.7 בתקנון ("מסמכי התכנית"), נספח הבינוי:
        <select onchange="FC.set('q1.status',this)"><option value="bg"${a.q1.status==='bg'?' selected':''}>רקע / מנחה</option><option value="bind"${a.q1.status==='bind'?' selected':''}>מחייב (חלקית) בנושא מסוים</option></select>
        ${a.q1.status==='bind'?`בנושא: <input type="text" style="width:160px" placeholder="למשל: גובה וקומות" value="${E(a.q1.topic)}" onchange="FC.set('q1.topic',this)">`:''}</div>
        <div class="fc-small">הכלי לא קורא את הנספח. אם הוא מחייב בגובה או במפלסים — אפשר להקליד כאן את הנתון מהנספח לתא או לקבוצת תאים. נתון שלא הוקלד לא נכנס לחישוב.</div>
        ${a.q1.status==='bind'?`${(a.q1.manual||[]).map((m,i)=>`<div class="fc-li">תאים: <input type="text" style="width:130px" placeholder="504, 1101-1116" value="${E(m.cells)}" onchange="FC.setMan(${i},'cells',this)">
          גובה מרבי: <input type="number" step="0.01" value="${m.H??''}" onchange="FC.setMan(${i},'H',this)"> מ'
          <select onchange="FC.setMan(${i},'ref',this)"><option value="abs"${m.ref!=='rel'?' selected':''}>מעל פני הים</option><option value="rel"${m.ref==='rel'?' selected':''}>מעל הכניסה</option></select>
          <button class="fc-btn" onclick="FC.delMan(${i})">✕</button><br>
          ${m.ref!=='rel'?`מפלס 0.00: <input type="number" step="0.01" value="${m.z??''}" onchange="FC.setMan(${i},'z',this)"> · או קרקע גבוהה בתא: <input type="number" step="0.01" value="${m.ground??''}" onchange="FC.setMan(${i},'ground',this)"> · `:''}
          קומות (אם הנספח קובע): <input type="number" value="${m.floors??''}" onchange="FC.setMan(${i},'floors',this)"></div>`).join('')}
          <button class="fc-btn" onclick="FC.addMan()">＋ הקלדת נתון מהנספח</button>
          <div class="fc-small">בלי מפלס 0.00, הגובה הזמין מחושב מהקרקע הגבוהה בתא (מחמיר). אם התא נכנס רק בירידה של עד 1 מ' מתחת לקרקע — "פרמטר חסר: נדרש 0.00 ≤ ___". הערכים מסומנים "הוקלד ידנית" ונשמרים לתוכנית הזו.</div>`:''}`},
    {q:'q2',t:'גובה קומה',n:dc('q2')+dc('fhRes')+dc('fhPub')+dc('fhOff')+dc('fhCom'),
      h:`<div>התקנון לא קובע גובה קומה? הכלי מחשב לפי הערכים המקובלים. אם התקנון קובע — מתקנים כאן ומסמנים "נקבע בתקנון".</div>
        ${fhRow('res','מגורים','fhRes')}${fhRow('pub','ציבור','fhPub')}${fhRow('off','משרדים / תעסוקה','fhOff')}${fhRow('com','קומת קרקע מסחרית','fhCom')}
        <div class="fc-small">בציבור 4.0 מ' הוא "קצה" ו-4.5 מ' "רגיל": תא שנכנס רק ב-4.0 = "נכנס בתנאי". בשאר השימושים כל הטווח רגיל.</div>
        ${noVal.length?`<div>לשימושים ${noVal.map(m=>USE_L[m]).join(', ')} (מחסנים, מתקנים, תעשייה…) אין ערך מקובל ${tvTag('fhOther')}</div>`:''}
        ${rowsB.length?`<div><b>חלק ב:</b> בשורות האלה טבלה 5 נותנת פחות מהערך המקובל לקומה. הסיווג לפי הערך המקובל, ולצדו "לפי הטבלה":<br>${rowsB.map(r=>`• ${E(r.key)}: ${f1(r.H)} מ' ל-${r.floors} קומות = ${f2(r.impliedH)} מ' לקומה`).join('<br>')}</div>`:''}`},
    {q:'q3',t:'מפלס הכניסה (0.00)',n:dc('q3'),
      h:`<div>הגובה בטבלה 5 נמדד: <select onchange="FC.set('q3.mode',this)">
        <option value="auto"${a.q3.mode==='auto'?' selected':''}>זיהוי אוטומטי (מספר גדול מהמתאים לקומות = מעל פני הים)</option>
        <option value="rel"${a.q3.mode==='rel'?' selected':''}>מעל הכניסה הקובעת, בכל השורות</option>
        <option value="abs"${a.q3.mode==='abs'?' selected':''}>מעל פני הים, בכל השורות</option></select></div>
        ${absY.length?`<div>גובה מעל פני הים בייעודים האלה. מפלס 0.00 (מ' מעל פני הים), אם ידוע מהתקנון או מהנספח:<br>
          ${absY.map(y=>{ const yi=FC._yiuds.indexOf(y); const z=a.q3.z[y]; return `<span class="fc-yi">${E(y)}: <input type="number" step="0.01" value="${z??''}" onchange="FC.setZ(${yi},this)"></span>`; }).join('')}
          <div class="fc-small">בלי מפלס הגובה לא נבדק, והתאים מחושבים לפי מספר הקומות בטבלה. תא שלא נכנס גם כך יסומן "לבדיקת מתכנן", לא ממצא.</div></div>`:'<div class="fc-small">בתוכנית הזו הגובה נמדד מעל הכניסה — אין צורך במפלס.</div>'}`},
    {q:'q4',t:'הוראות שמתירות',n:dc('q4'),nTxt:dc('q4')?`${dc('q4')} תאים לא נכנסים בלי הוראה כזו, או נכנסים בזכותה`:null,
      h:`<div>הוראה בתקנון או בהערות לטבלה 5 שמתירה להעביר שטח אל מתחת לכניסה, או להוסיף קומות. בלי תנאי = הכלי מפעיל אותה; "באישור" = התא "נכנס בתנאי".
        "במטרה להתגבר על הפרשי טופוגרפיה" הוא הסבר, לא תנאי.</div>
        ${(a.q4.list||[]).map(q4i).join('')}<button class="fc-btn" onclick="FC.addItem('q4')">＋ הוספת הוראה</button>
        <div class="fc-small">הוראה שמחייבת קומה חשופה מתחת לכניסה לא מופעלת — הכלי לא בודק מפלסים. אם אין הוראות כאלה, לאשר את הכרטיס ריק.</div>`},
    {q:'q5',t:'מגבלות בתקנון',n:(a.q5.list||[]).length?dc('q5'):potB,nTxt:(a.q5.list||[]).length?null:(potB?`${potB} תאים עם זכויות מתחת לכניסה`:null),
      h:`<div>מגבלה שמקטינה את המעטפת. ברירת המחדל לכל מגבלה: חלה רק על הייעוד של הפרק שבו היא כתובה (לא מחילים באנלוגיה).</div>
        ${(a.q5.list||[]).map(q5i).join('')}<button class="fc-btn" onclick="FC.addItem('q5')">＋ הוספת מגבלה</button>
        <div>הגובה המרבי: <select onchange="FC.set('q5.parapet',this)"><option value="no"${a.q5.parapet!=='yes'?' selected':''}>לא כולל מעקה גג (ברירת מחדל)</option><option value="yes"${a.q5.parapet==='yes'?' selected':''}>כולל מעקה גג וחדר יציאה</option></select>
        ${a.q5.parapet!=='yes'?tvTag('parapet'):''}</div>
        <div><label class="fc-yi"><input type="checkbox" ${a.q5.balc?'checked':''} onchange="FC.set('q5.balc',this)">המרפסות בטבלה 5 בתוך התכסית / קווי הבניין (נספרות בשטח הקומה)</label></div>
        ${altY.length?`<div>ייעודים שבהם השימושים בטבלה הם <b>חלופות</b> (מגורים <b>או</b> ציבור), לא תוספת: ${altY.map(y=>`<label class="fc-yi"><input type="checkbox" ${(a.q5.alt||[]).includes(y)?'checked':''} onchange="FC.alt(${FC._yiuds.indexOf(y)},this)">${E(y)}</label>`).join('')}
          <div class="fc-small">כל חלופה נבדקת לבד, עם הקומות והגובה שלה, והחמורה קובעת. בלי סימון — השימושים מתחברים.</div></div>`:''}`},
    {q:'q6',t:'חובה לממש שטחי ציבור',n:dc('q6'),
      h:`<div>נוסח כמו "תראה את מיצוי" = הזכויות <b>חובה</b>: מה שלא נכנס הוא ממצא. בלי נוסח כזה הן מקסימום, ומה שלא נכנס = זכויות עודפות. לסמן רק ייעוד שהנוסח כתוב בפרק שלו:</div>
        ${FC._yiuds.filter(y=>Object.values(FC._cells).some(x=>x.yiud===y&&regime(x).main==='pub')).map(y=>`<label class="fc-yi"><input type="checkbox" ${(a.q6.mand||[]).includes(y)?'checked':''} onchange="FC.mand(${FC._yiuds.indexOf(y)},this)">${E(y)}</label>`).join('')||'<span class="fc-small">אין בתוכנית ייעודי ציבור עם זכויות.</span>'}`},
    {q:'q7',t:'תמהיל ושטח לדירה',n:dc('q7'),
      h:`<div>השטח הממוצע ליח"ד (נטו) לא יפחת מ- <input type="number" value="${a.q7.avgMin??''}" onchange="FC.set('q7.avgMin',this)"> מ"ר ·
        לא יעלה על <input type="number" value="${a.q7.avgMax??''}" onchange="FC.set('q7.avgMax',this)"> מ"ר</div>
        <div class="fc-small">"שטח דירה" לא כולל שטחים משותפים. ליבה ושטחים משותפים ${pct(K.coreLo)}–${pct(K.coreHi)} משטח הקומה ${tvTag('core')}. ריק = אין הוראה כזו.</div>`}
  ];
}
function _cardsHtml(R){
  const cs=cardsDef(R).sort((p,s)=>s.n-p.n);
  const card=c=>{ const done=!!FC.spec.conf[c.q];
    return `<div class="fc-card${done?' done':''}${c.n?'':' zero'}"><div class="fc-ch"><b>${c.q.slice(1)}. ${c.t}</b>
      <span class="fc-imp">${c.nTxt||(c.n?`משנה ${c.n} תאים`:'לא משנה אף תא בתוכנית הזו')}</span>
      <span class="fc-st${done?' ok':''}">${done?'✓ מאושר':'לפי ברירת מחדל'}</span>
      <button class="fc-btn${done?'':' ok'}" onclick="FC.conf('${c.q}')">${done?'בטל אישור':'✓ מאשר'}</button></div>
      <div class="fc-q">${c.h}</div></div>`; };
  const on=cs.filter(c=>c.n), off=cs.filter(c=>!c.n);
  return on.map(card).join('')+(off.length?`<details class="fc-sec" style="margin-top:8px"><summary>${off.length} כרטיסים שלא משנים אף תא בתוכנית הזו</summary><div class="fc-in">${off.map(card).join('')}</div></details>`:'');
}
function _tvHtml(R){
  const used=Object.keys(TV).filter(k=>R.depCnt[k]);
  if(!used.length) return '<div class="fc-note">אף ערך זמני לא הכריע בתוכנית הזו.</div>';
  return used.sort((p,s)=>R.depCnt[s]-R.depCnt[p]).map(k=>`<div class="fc-note">• ${E(TV[k].l)}: ${E(TV[k].v)} <span class="fc-tv">${E(TVST[TV[k].st])}</span> — <b>${R.depCnt[k]} תאים תלויים בו</b></div>`).join('');
}
function _revHtml(R){
  const rows=Object.values(R.rev.rows);
  return `<div class="fc-tw"><table class="fc-tbl"><thead><tr><th>שורה</th><th>תאים</th><th>מעל ÷ שטח</th><th>תכסית × קומות</th><th>מתחת ÷ שטח</th><th>מ"ר ליח"ד</th><th>יח"ד לדונם</th><th>מה עולה</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td><b>${E(r.key)}</b>${r.key!==r.yiud?`<div class="fc-small">${E(r.yiud)}</div>`:''}</td><td>${r.cells.length}</td><td>${f2(r.rA)}</td><td>${r.cov&&r.floors?`${r.cov}% × ${r.floors} = ${f2(r.cov/100*r.floors)}`:'—'}</td>
    <td>${r.rB?f2(r.rB):'—'}</td><td>${r.apu?fmt(r.apu):'—'}</td><td>${r.dens?f1(r.dens):'—'}</td><td class="fc-why">${r.tags.map(E).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
}
const DEP_L={q1:'כרטיס 1',q2:'כרטיס 2',q3:'כרטיס 3',q4:'כרטיס 4',q5:'כרטיס 5',q6:'כרטיס 6',q7:'כרטיס 7'};
const depLabel=d=>DEP_L[d]||(TV[d]?TV[d].l:d);
function _cellsHtml(R){
  const flt=FC.filter==='all'?null:FC.filter;
  const list=R.rows.filter(r=>(!flt||r.cls===flt)&&(!FC.rowF||(r.grp||r.yiud)===FC.rowF)&&(!FC.depF||r.deps.includes(FC.depF)));
  const rowKeys=[...new Set(R.rows.map(r=>r.grp||r.yiud))], deps=[...new Set(R.rows.flatMap(r=>r.deps))];
  const opt=(k,v,l)=>`<option value="${E(v)}"${FC[k]===v?' selected':''}>${E(l)}</option>`;
  FC._rowKeys=rowKeys; FC._depKeys=deps;
  return `<div class="fc-flt">שורה: <select onchange="FC.setFilter('rowF',this.value)">${opt('rowF','','הכל')}${rowKeys.map(k=>opt('rowF',k,k)).join('')}</select>
    תלוי ב: <select onchange="FC.setFilter('depF',this.value)">${opt('depF','','הכל')}${deps.map(k=>opt('depF',k,depLabel(k))).join('')}</select>
    <span class="fc-small">${list.length} מתוך ${R.rows.length} תאים · לחיצה על שורה = התמקדות במפה ותחקור</span></div>
  <div class="fc-tw"><table class="fc-tbl"><thead><tr><th>תא</th><th>סיווג</th><th>הסיבה</th><th>יחס אחרי גובה</th><th>הערות</th><th>תלוי ב</th></tr></thead><tbody>
  ${list.map(r=>{ const c=E(r.cn);
    const ab=r.below>0&&r.aCls!==r.bCls?`<div class="fc-small">מעל: ${CL[r.aCls]} · מתחת: ${CL[r.bCls]}</div>`:'';
    return `<tr class="c" onclick="FC.pick('${c}')"><td><b>${c}</b><div class="fc-small">${E(r.yiud)} · ${fmt(r.A)} מ"ר</div></td>
    <td><span class="fc-v" style="background:${COL[r.cls]}">${CL[r.cls]}</span>${ab}</td>
    <td class="fc-why">${E(r.whyMain)}</td><td>${r.ratio!=null&&isFinite(r.ratio)?f2(r.ratio)+(r.ratioS!=null&&Math.abs(r.ratioS-r.ratio)>0.005?` / ${f2(r.ratioS)}`:''):'—'}</td>
    <td class="fc-why">${r.notes.map(E).join('<br>')}</td><td class="fc-small">${r.deps.filter(d=>DEP_L[d]||TV[d]).map(depLabel).map(E).join(', ')}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
FC.pick=function(cn){ FC.focus(cn); FC.explain(cn); };
function _openQ(R){
  const arch=Object.keys(TV).filter(k=>R.depCnt[k]).map(k=>`• ${E(TV[k].l)} (${E(TV[k].v)}): ${R.depCnt[k]} תאים`);
  const pl=R.rows.filter(r=>r.cls==='plan').map(r=>`• תא ${E(r.cn)} (${E(r.yiud)}): ${E(r.whyMain)}`);
  return `<div class="fc-note"><b>לאדריכל</b> — ערכים זמניים שהכריעו בתוכנית הזו:<br>${arch.join('<br>')||'אין'}</div>
    <div class="fc-note" style="margin-top:6px"><b>למתכנן</b> — תאים "לבדיקת מתכנן":<br>${pl.join('<br>')||'אין'}</div>`;
}
FC.render=function(){
  const B=$('fc-body'); if(!B) return;
  if(!state.table5){ B.innerHTML='<div class="fc-note">צריך טבלה 5 לתוכנית הזו (ר׳ החיווי מתחת לשם התוכנית).</div>'; return; }
  const R=FC.ensure(); if(!R){ B.innerHTML='<div class="fc-note">התשריט לא נטען.</div>'; return; }
  const scroll=B.scrollTop, open={}; B.querySelectorAll('details[data-k]').forEach(d=>open[d.dataset.k]=d.open);
  const det=(k,def,title,body)=>`<details class="fc-sec" data-k="${k}"${(open[k]??def)?' open':''}><summary>${title}</summary><div class="fc-in">${body}</div></details>`;
  const nCells=Object.keys(state.table5).length, nGeo=R.rows.length, nl=_noLinesLayer();
  const cnts=CLS.slice().reverse().map(k=>`<span class="fc-cnt${FC.filter!=='all'&&FC.filter!==k?' off':''}" style="background:${COL[k]}" onclick="FC.setFilter('filter','${k}')">${CL[k]} ${R.cnt[k]}</span>`).join('');
  const nConf=Object.values(FC.spec.conf).filter(Boolean).length;
  B.innerHTML=`<div class="fc-sum"><b>תוכנית ${E(FC.spec.plan||curPlan()||'—')}</b> · נקראו: טבלה 5 (${nCells} תאים) · תשריט (${nGeo} תאים נבדקו) · ${nl?'אין קווי בניין בתשריט':'קווי בניין מהתשריט'}<br>${cnts}
      <div class="fc-small">${nConf}/7 כרטיסים אושרו. תוצאה שתלויה בכרטיס שלא אושר — לפי ברירת המחדל. <button class="fc-btn" onclick="FC.exportFile()">⬇ ייצוא לקובץ</button></div></div>
    ${det('cards',true,'שאלות לתוכנית — 7 כרטיסים (מסודרים לפי מספר התאים שכל אחד משנה)',_cardsHtml(R))}
    ${det('tv',true,'ערכים זמניים שהתוצאה נשענת עליהם',_tvHtml(R))}
    ${det('notes',true,'הערות לתוכנית ולשורות',R.plan.map(t=>`<div class="fc-note">• ${E(t)}</div>`).join('')+R.rowNotes.map(n=>`<div class="fc-note">• ${E(n.t)} <span class="fc-small">(${n.cells.map(E).join(', ')})</span></div>`).join(''))}
    ${det('rev',false,'הנדסה לאחור — לכל שורה בטבלה 5',_revHtml(R))}
    ${det('cells',true,'טבלת התאים',_cellsHtml(R))}
    ${det('open',false,'שאלות פתוחות',_openQ(R))}`;
  B.scrollTop=scroll;
};

// ── מפה ──
FC.drawLayer=function(ctx){
  if(!FC.open||!FC.res||!FC._idx||typeof dc!=='function') return;
  ctx.save();
  for(const r of FC.res.rows){ const fs=FC._idx[r.cn]; if(!fs) continue; if(FC.filter!=='all'&&r.cls!==FC.filter) continue;
    for(const f of fs){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      ctx.beginPath(); for(const p of P) for(const ring of p){ ring.forEach(([x,y],i)=>{ const [sx,sy]=dc(x,y); i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy); }); ctx.closePath(); }
      ctx.fillStyle=COL[r.cls]+'70'; ctx.fill('evenodd');
      ctx.lineWidth=FC.sel===r.cn?4:1.6; ctx.strokeStyle=FC.sel===r.cn?'#00e0ff':COL[r.cls]; ctx.stroke(); } }
  ctx.restore();
};
FC.cellInfoHtml=function(cn){
  if(!FC.res) return ''; const r=FC._by&&FC._by[String(cn)]; if(!r) return '';
  return `<div style="margin-top:8px;padding:6px 8px;border-radius:6px;border:1px solid ${COL[r.cls]}">
    <b>🏗 בקרת בינוי:</b> <span style="color:${COL[r.cls]};font-weight:700">${CL[r.cls]}</span>${r.ratio!=null&&isFinite(r.ratio)?` · יחס ${f2(r.ratio)}`:''}
    <div style="font-size:11px;opacity:.85">${E(r.whyMain)}</div>
    <div style="font-size:11px"><a href="#" onclick="FC.explain('${E(r.cn)}');return false">החשבון המלא ▸</a></div></div>`;
};

// ── תחקור תא ──
function explainHtml(r){
  const deps=r.deps.filter(d=>DEP_L[d]||TV[d]);
  return `<div class="fcx-sec"><h4>סיווג: <span class="fc-v" style="background:${COL[r.cls]}">${CL[r.cls]}</span></h4><div>${E(r.whyMain)}</div>
    ${r.below>0?`<div class="fc-small">מעל הכניסה: ${CL[r.aCls]} · מתחת לכניסה: ${CL[r.bCls]}</div>`:''}</div>
    ${r.steps.map(s=>`<div class="fcx-sec"><h4>${E(s.t)}</h4>${s.l.map(l=>`<div>${E(l)}</div>`).join('')}</div>`).join('')}
    ${r.notes.length?`<div class="fcx-sec"><h4>הערות</h4>${r.notes.map(n=>`<div>• ${E(n)}</div>`).join('')}</div>`:''}
    ${deps.length?`<div class="fcx-sec"><h4>תלוי ב</h4>${deps.map(d=>`<div>• ${E(depLabel(d))}${TV[d]?` — ${E(TV[d].v)} (${E(TVST[TV[d].st])})`:''}</div>`).join('')}</div>`:''}`;
}
const METHOD=`<div class="fcx-sec"><h4>מה הכלי עושה</h4><div>לכל תא שטח הכלי עונה על שאלה אחת: <b>האם יש סיבה להסתכל עליו</b>. הוא לא מעמיד בניינים. הוא מחשב שטחים, יחסים וגבהים, ומשווה כמה מספרים בודדים לערכים מקובלים.</div></div>
<div class="fcx-sec"><h4>החשבון</h4><div>1. <b>מעטפת</b>: הקטן מבין שטח קווי הבניין בתוך התא, התכסית × שטח התא, ומגבלות מכרטיס 5.</div>
<div>2. <b>קומות שנכנסות בגובה</b>: הגובה המרבי ÷ גובה קומה (הקצה הנמוך של הערך המקובל), מעוגל למטה. קומות למיון = הקטן מבין זה לבין הקומות בטבלה.</div>
<div>3. <b>יחס</b> = זכויות מעל הכניסה ÷ קומות למיון ÷ מעטפת. עד 0.8 נכנס · 0.8–1.0 נכנס, צפוף · מעל 1.0 — ניסיונות להכניס: הוראות מתירות, קצה הטווח של גובה הקומה, הוראות באישור.</div>
<div>4. <b>מה שלא נכנס</b>: מגורים שהיח"ד שלהם נכנסות והשטח לדירה גדול (מעל 160 מ"ר) = זכויות עודפות. ציבור בלי חובה לממש = זכויות עודפות. אחרת — מועמד לממצא מהותי, שהופך לממצא רק אם אין שום ספק (כרטיס 4 אושר, אין נתון חסר).</div>
<div>5. <b>מתחת לכניסה</b>: זכויות ÷ (מעטפת מרתף × קומות). מה שלא נכנס = זכויות עודפות + פרמטר חסר (תקן חניה), פעם אחת לשורה.</div></div>
<div class="fcx-sec"><h4>חמשת הסיווגים</h4><div>${CLS.map(k=>`<span class="fc-v" style="background:${COL[k]}">${CL[k]}</span>`).join(' ')}</div>
<div class="fc-small">ערך שלא בא מהתוכנית מסומן "ממתין לאדריכל" או "הצעה". הכלי עובד על התשריט וטבלה 5; את מה שכתוב בתקנון מזינים בשבעת הכרטיסים.</div></div>`;
function _pop(title,html){
  let p=$('fc-pop');
  if(!p){ p=document.createElement('div'); p.id='fc-pop';
    p.innerHTML=`<div class="fcx-box"><div class="fcx-hd"><b id="fcx-title"></b><button onclick="FC.closeExplain()">✕</button></div><div class="fcx-bd" id="fcx-bd"></div></div>`;
    p.addEventListener('click',e=>{ if(e.target===p) FC.closeExplain(); }); document.body.appendChild(p); }
  _css(); $('fcx-title').textContent=title; $('fcx-bd').innerHTML=html; $('fcx-bd').scrollTop=0; p.classList.add('vis');
}
FC.explain=function(cn,ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); const r=FC.resultFor(cn); if(!r) return; _pop(`בקרת בינוי — תא ${cn} (${r.yiud})`,explainHtml(r)); };
FC.explainMethod=function(){ _pop('איך בקרת הבינוי עובדת',METHOD); };
FC.closeExplain=function(){ const p=$('fc-pop'); if(p) p.classList.remove('vis'); };
if(typeof document!=='undefined') document.addEventListener('keydown',e=>{ if(e.key==='Escape') FC.closeExplain(); });

// ── ייצוא ──
FC.exportFile=function(){
  const R=FC.ensure(); if(!R) return;
  const plan=FC.spec.plan||curPlan()||'plan';
  const html=`<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><title>בקרת בינוי — ${E(plan)}</title>
<style>body{font-family:Arial,sans-serif;font-size:13px;margin:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:right;vertical-align:top}th{background:#eef}.v{color:#fff;border-radius:6px;padding:0 6px}</style>
<h1>בקרת בינוי — תוכנית ${E(plan)}</h1><p>${CLS.slice().reverse().map(k=>`${CL[k]}: ${R.cnt[k]}`).join(' · ')}</p>
<h2>כרטיסים</h2><ul>${['q1','q2','q3','q4','q5','q6','q7'].map(q=>`<li>כרטיס ${q.slice(1)}: ${FC.spec.conf[q]?'מאושר':'לפי ברירת מחדל'}</li>`).join('')}</ul>
<h2>ערכים זמניים</h2>${_tvHtml(R)}
<h2>הערות לתוכנית ולשורות</h2><ul>${R.plan.map(t=>`<li>${E(t)}</li>`).join('')}${R.rowNotes.map(n=>`<li>${E(n.t)} (${n.cells.map(E).join(', ')})</li>`).join('')}</ul>
<h2>תאים</h2><table><tr><th>תא</th><th>ייעוד</th><th>סיווג</th><th>הסיבה</th><th>יחס</th><th>הערות</th></tr>
${R.rows.map(r=>`<tr><td>${E(r.cn)}</td><td>${E(r.yiud)}</td><td><span class="v" style="background:${COL[r.cls]}">${CL[r.cls]}</span></td><td>${E(r.whyMain)}</td><td>${r.ratio!=null&&isFinite(r.ratio)?f2(r.ratio):'—'}</td><td>${r.notes.map(E).join('<br>')}</td></tr>`).join('')}</table>
<h2>שאלות פתוחות</h2>${_openQ(R)}</html>`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download=`בקרת בינוי ${String(plan).replace(/[\\/:*?"<>|]/g,'_')}.html`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
};

// ── עמודות בלשונית טבלה 5 ──
FC.t5HeadHtml=function(){
  return `<th class="t5v-calc-hdr t5v-fc-hdr" title="בקרת בינוי: שטח קומה נדרש ÷ מעטפת, אחרי בדיקת הגובה">יחס אחרי<br>גובה</th>
    <th class="t5v-calc-hdr t5v-fc-hdr">בקרת בינוי</th><th class="t5v-calc-hdr t5v-fc-hdr">הסיבה</th>`;
};
FC.t5CellsHtml=function(cn,rowspan){
  const r=cn==null?null:FC.resultFor(cn), rs=rowspan>1?` rowspan="${rowspan}"`:'';
  if(!r) return `<td class="t5v-calc-cell"${rs} style="color:#888">—</td><td class="t5v-calc-cell"${rs} style="color:#888">—</td><td class="t5v-calc-cell"${rs} style="color:#888">—</td>`;
  const c=E(r.cn);
  return `<td class="t5v-calc-cell t5v-fc-x"${rs} onclick="FC.explain('${c}',event)">${r.ratio!=null&&isFinite(r.ratio)?f2(r.ratio):'—'}</td>
    <td class="t5v-calc-cell t5v-fc-x"${rs} onclick="FC.explain('${c}',event)"><span class="fc-v" style="background:${COL[r.cls]};color:#fff;border-radius:8px;padding:1px 7px;font-weight:600;white-space:nowrap">${CL[r.cls]}</span></td>
    <td class="t5v-calc-cell t5v-fc-x"${rs} style="font-size:11px;max-width:260px" onclick="FC.explain('${c}',event)">${E(r.whyMain)}</td>`;
};

// ── שמירה בפרויקט (לפי מספר התוכנית; מצב ריק לא נשמר מעל קיים) ──
FC.getSpec=function(){ return FC.spec; };
FC.setSpec=function(s){
  const p=curPlan();
  if(s&&s.v===2&&s.plan&&p&&s.plan!==p) s=null;     // תשובות של תוכנית אחרת — לא נטענות
  FC.spec=normalizeSpec(s,p); FC.res=null; if(FC.open){ FC.ensure(true); FC.render(); }
};
FC.reset=function(){ FC.spec=emptySpec(''); FC.res=null; FC.sel=null; FC.filter='all'; FC.rowF=''; FC.depF=''; if(FC.open) FC.close(); };
FC.hasUser=function(s){ s=s||FC.spec; if(!s) return false;
  if(s.v!==2) return !!(s.conf&&Object.keys(s.conf).length||s.g);
  if(s.legacy) return true;
  if(Object.values(s.conf||{}).some(Boolean)) return true;
  return JSON.stringify(normalizeSpec({v:2,ans:s.ans}).ans)!==JSON.stringify(defaultAnswers()); };

FC.Engine={geomOf,featIndexOf:feats=>{ const idx={}; for(const f of feats){ const n=String(f.properties.NUM??'').trim(); if(n) (idx[n]=idx[n]||[]).push(f); } return idx; },run,cellsFromT5,evalCell,reverse,envelope,heightOf,useClass,regime,defaultAnswers,emptySpec,normalizeSpec,TV,K,CL};
FC.spec=emptySpec('');
if(typeof document!=='undefined'){ if(document.head) _css(); else document.addEventListener('DOMContentLoaded',_css); }
root.FC=FC;
root.openFitCheck=function(){ FC.toggle(); };
if(root._FC_PENDING!==undefined){ FC.setSpec(root._FC_PENDING); root._FC_PENDING=undefined; }
})(typeof window!=='undefined'?window:globalThis);
