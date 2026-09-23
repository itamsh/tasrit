/* ============================================================================
   prog_reader.js — "קורא הפרוגרמה"
   עמוד בממשק שמתרגם את נספח הפרוגרמה של היועץ לפורמט אחיד ופורש אותו על התשריט.
   תכנון: פרוגרמה/ROADMAP_program_reader.md · פורמט: פרוגרמה/corpus_v2/IDEAL_FORMAT.md

   מבנה הקובץ:
     1. NORMS  — נורמות מהתדריך/האקסל (מוטמעות; ה-CSP לא מאפשר טעינה חיצונית)
     2. Engine — חישוב טהור (ללא DOM). נבדק ב-tests/prog_reader.test.js (node)
     3. UI     — הפאנל בממשק (רק בדפדפן)
   ========================================================================== */
(function(root){
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// 1. NORMS
// ════════════════════════════════════════════════════════════════════════════
const NORMS={
  version:'2018+2025',
  versionLabel:'מדריך הקצאות 08/2018 · אקסל מינהל התכנון 07/2024 · עדכון בתי ספר קומפקטיים 03/2025',

  // שורות החינוך — נוסחת האקסל הרשמי: כיתות = ילדים_בשנתון × חלק × שיעור_ביקוש × שכבות ÷ תלמידים_בכיתה
  // sectors: 'all' | 'nonharedi' | 'haredi'
  edu:[
    {id:'maon',   inst:'מעון יום',          stream:null,       special:false, sectors:'all',       share:1,   rate:0.5,  grades:3, perClass:20},
    {id:'gan',    inst:'גן ילדים',          stream:'כללי',     special:false, sectors:'nonharedi', share:1,   rate:1,    grades:3, perClass:30},
    {id:'gan_hb', inst:'גן ילדים',          stream:'חרדי בנים',special:false, sectors:'haredi',    share:0.5, rate:1,    grades:3, perClass:30},
    {id:'gan_hg', inst:'גן ילדים',          stream:'חרדי בנות',special:false, sectors:'haredi',    share:0.5, rate:1,    grades:3, perClass:30},
    {id:'elem',   inst:'בית ספר יסודי',     stream:'כללי',     special:false, sectors:'nonharedi', share:1,   rate:1,    grades:6, perClass:27},
    {id:'elem_hb',inst:'בית ספר יסודי',     stream:'חרדי בנים',special:false, sectors:'haredi',    share:0.5, rate:1,    grades:9, perClass:20},
    {id:'elem_hg',inst:'בית ספר יסודי',     stream:'חרדי בנות',special:false, sectors:'haredi',    share:0.5, rate:1,    grades:8, perClass:27},
    {id:'sec',    inst:'בית ספר על-יסודי',  stream:'כללי',     special:false, sectors:'nonharedi', share:1,   rate:1,    grades:6, perClass:27},
    {id:'sec_hb', inst:'בית ספר על-יסודי',  stream:'חרדי בנים',special:false, sectors:'haredi',    share:0.5, rate:1,    grades:4, perClass:20},
    {id:'sec_hg', inst:'בית ספר על-יסודי',  stream:'חרדי בנות',special:false, sectors:'haredi',    share:0.5, rate:1,    grades:4, perClass:27},
    {id:'maon_se',inst:'מעון יום',          stream:null,       special:true,  sectors:'all',       share:1,   rate:0.02, grades:3, perClass:8},
    {id:'gan_se', inst:'גן ילדים',          stream:null,       special:true,  sectors:'all',       share:1,   rate:0.02, grades:3, perClass:8},
    {id:'elem_se',inst:'בית ספר יסודי',     stream:null,       special:true,  sectors:'all',       share:1,   rate:0.02, grades:6, perClass:10},
    {id:'sec_se', inst:'בית ספר על-יסודי',  stream:null,       special:true,  sectors:'all',       share:1,   rate:0.02, grades:9, perClass:10},
  ],

  // מוסדות ציבור אחרים — לפי guide_standards.json (גליון "שער" באקסל 07/2024).
  // compute(c) מחזיר {v:מספר|null, cat:קטגוריה|null, na:true אם לא חל}
  // c = {POP, COH, UNITS, POPTRAD, SECTOR, TEXTURE, SIZE}
  public:[
    {id:'tipat',   inst:'תחנה לבריאות המשפחה', family:'בריאות', unit:'אחיות', f:'ילדים_בשנתון × 2 ÷ 100',
      compute:c=>{const v=c.COH*2/100; return {v, cat:v<=1.5?'אין סף כניסה':v<=2?'תחנה קטנה':v<=3?'תחנה בינונית':'תחנה גדולה'};}},
    {id:'clinic',  inst:'מרפאה שכונתית', family:'בריאות', unit:'מ"ר', f:'אוכלוסייה × 0.1',
      compute:c=>{const v=c.POP*0.1; return {v, cat:v<=150?'אין סף כניסה':v<=300?'קטנה':v<=500?'בינונית':'גדולה'};}},
    {id:'daycare_ltd', inst:'מרכז יום לקשיש — מוגבלים', family:'רווחה', unit:'משתתפים', f:'אוכלוסייה × 0.075 × 0.018',
      compute:c=>({v:c.POP*0.075*0.018})},
    {id:'daycare_frail', inst:'מרכז יום לקשיש — תשושים', family:'רווחה', unit:'משתתפים', f:'אוכלוסייה × 0.075 × 0.02',
      compute:c=>({v:c.POP*0.075*0.02})},
    {id:'welfare', inst:'מחלקה לשירותים חברתיים', family:'רווחה', unit:'מ"ר', f:'אוכלוסייה × 0.011',
      compute:c=>({v:c.POP*0.011})},
    {id:'welfare_res', inst:'רזרבה לרווחה כלל-עירונית', family:'רווחה', unit:'דונם', f:'אוכלוסייה × 0.05 ÷ 1000 (מתחם חדש, 5,000 יח"ד ומעלה)',
      compute:c=>(c.TEXTURE==='existing'||c.UNITS<5000)?{na:true}:{v:c.POP*0.05/1000}},
    {id:'community', inst:'מרכז תרבות וקהילה', family:'תרבות וקהילה', unit:'סוג מרכז', f:'יישוב קטן: אוכלוסייה × 0.5 · יישוב גדול: אוכלוסייה × 0.2 — לפי ספים',
      compute:c=>{
        if(!c.SIZE) return {cat:'חסר: גודל יישוב'};
        const d=c.POP*(c.SIZE==='large'?0.2:0.5);
        const cat=d<3000?'אגף בבית ספר':d<5000?'מרכז קטן':d<7500?'מרכז בינוני':(c.SIZE==='large'?'לבדיקה פרטנית':'מרכז גדול');
        return {v:d, cat};
      }},
    {id:'youth', inst:'מועדון נוער', family:'תרבות וקהילה', unit:'משתמשים', f:'ילדים_בשנתון × 8 × 0.35',
      compute:c=>({v:c.COH*8*0.35})},
    {id:'elderly_club', inst:'מועדון לקשיש', family:'תרבות וקהילה', unit:'מ"ר', f:'אוכלוסייה × 0.075 × 0.15 (משתמשים קבועים) — לפי ספים',
      compute:c=>{const d=c.POP*0.075*0.15;
        return d<150?{v:d,cat:'פחות מ-150 משתמשים — אין סף כניסה'}:d<200?{v:d,cat:'250-300 מ"ר בנוי'}:{v:d,cat:Math.round(d)+' מ"ר'};}},
    {id:'synagogue', inst:'בית כנסת', family:'דת', unit:'מ"ר', f:'אוכלוסייה × %שומרי_מסורת × 0.49 × 1.1',
      compute:c=>c.NONJEWISH?{na:true}:{v:c.POPTRAD*0.49*1.1}},
    {id:'mikve', inst:'מקווה', family:'דת', unit:'בורות טבילה', f:'אוכלוסייה × %שומרי_מסורת ÷ 22.5 × 0.07',
      compute:c=>c.NONJEWISH?{na:true}:{v:c.POPTRAD/22.5*0.07}},
    {id:'football', inst:'מגרש כדורגל', family:'ספורט', unit:'דונם', f:'12 ד׳ אם אוכלוסייה > 20,000',
      compute:c=>c.POP>20000?{v:12}:{na:true}},
    {id:'stadium', inst:'אצטדיון כדורגל', family:'ספורט', unit:'דונם', f:'12 ד׳ מ-50,000 נפש · 20 ד׳ מ-150,000',
      compute:c=>c.POP>150000?{v:20}:c.POP<50000?{na:true}:{v:12}},
    {id:'athletics', inst:'אצטדיון אתלטיקה', family:'ספורט', unit:'דונם', f:'20 ד׳ אם אוכלוסייה > 250,000',
      compute:c=>c.POP>250000?{v:20}:{na:true}},
    {id:'pool', inst:'בריכת שחייה', family:'ספורט', unit:'יחידות', f:'אוכלוסייה ÷ 25,000',
      compute:c=>({v:c.POP/25000})},
    {id:'tennis', inst:'מגרשי טניס', family:'ספורט', unit:'מקבצים', f:'אוכלוסייה ÷ 40,000 (מקבץ = 2 מגרשים)',
      compute:c=>({v:c.POP/40000})},
    {id:'police', inst:'תחנת משטרה', family:'חירום והצלה', unit:'סוג מתקן', f:'לפי ספי אוכלוסייה',
      compute:c=>({cat:c.POP<5000?'אין סף כניסה':c.POP<7000?'שיטור קהילתי':c.POP<15000?'נקודת משטרה':c.POP<40000?'תחנה קטנה':c.POP<100000?'תחנה בינונית':'תחנה גדולה'})},
    {id:'mda', inst:'מגן דוד אדום', family:'חירום והצלה', unit:'סוג תחנה', f:'לפי ספי אוכלוסייה',
      compute:c=>({cat:c.POP<7000?'אין סף כניסה':c.POP<15000?'תחנה קטנה':c.POP<50000?'תחנה בינונית':'תחנה גדולה'})},
    {id:'fire', inst:'כיבוי אש', family:'חירום והצלה', unit:'סוג תחנה', f:'לפי ספי אוכלוסייה',
      compute:c=>({cat:c.POP<15000?'אין סף כניסה':c.POP<30000?'תחנה קטנה':c.POP<60000?'תחנה בינונית':'תחנה גדולה'})},
    {id:'reserve', inst:'רזרבה כללית', family:'כלל-עירוני', unit:'דונם', f:'מתחם חדש: אוכלוסייה × 0.3 ÷ 1000 (מתחת ל-5,000 יח"ד) / × 0.7 ÷ 1000',
      compute:c=>(c.TEXTURE==='existing'||c.UNITS<500)?{na:true}:{v:c.POP*(c.UNITS<5000?0.3:0.7)/1000}},
  ],

  // שטחים פתוחים — מפתחות מ"ר לנפש (מדריך + הנחיות ותמ"ל). ניתנים לשינוי בנספח.
  openSpace:{
    levels:[
      {id:'home',  label:'סף הבית',     keyNew:5, keyRenewal:3, note:'עד 7 דק׳ הליכה / 200-300 מ׳; לפחות 80% ירוק (בהתחדשות: 2/3)'},
      {id:'urban', label:'עירוני',      keyNew:2, keyRenewal:2, note:'10-20 דק׳ הליכה / 10 דק׳ אופניים'},
    ],
  },

  // דגמי בתי ספר ודונם לכיתה (school_models.json v0.2) + טבלאות שטח מפורטות (school_area_tables.json)
  school:{"source":"school_models.json v0.2 + school_area_tables.json v0.1","dunamPerClass":{"בית ספר יסודי":{"A":{"regular":0.5,"haredi_boys":0.3},"B":{"regular":0.4,"haredi_boys":0.25},"C":{"regular":0.3,"haredi_boys":0.2},"model_1":{"regular":0.25,"haredi_boys":null},"model_2":{"regular":0.2,"haredi_boys":null}},"בית ספר על-יסודי":{"A":{"regular":0.75,"haredi_boys":0.5},"B":{"regular":0.5,"haredi_boys":0.35},"C":{"regular":0.4,"haredi_boys":0.3},"model_1":{"regular":0.25,"haredi_boys":null},"model_2":{"regular":0.22,"haredi_boys":null}}},"modelLabels":{"A":"כפרי/קהילתי","B":"עירוני, מתחם חדש","C":"עירוני, מרקם קיים/התחדשות","model_1":"מגרש קומפקטי — מטרו / מתע\"ן / יישוב צפוף (עדכון 03/2025)","model_2":"מגרש קומפקטי במרקם בנוי בתחום מטרו (עדכון 03/2025)"},"areaTables":[{"institution_canonical":"בית ספר יסודי","stream":"ממלכתי / ממלכתי-דתי","gender":null,"pupils_per_class":27,"guide_page":54,"rows":[{"classes":12,"land_dunam":{"A":6.0,"B":4.8,"C":3.6},"built_sqm":{"A":1900,"B":2100,"C":2340}},{"classes":18,"land_dunam":{"A":9.0,"B":7.2,"C":5.4},"built_sqm":{"A":2600,"B":2900,"C":3220}},{"classes":24,"land_dunam":{"A":12.0,"B":9.6,"C":7.2},"built_sqm":{"A":3600,"B":4050,"C":4500}}],"yard_ratio_pct":{"A":60,"B":80,"C":100}},{"institution_canonical":"בית ספר על-יסודי","stream":"ממלכתי / ממלכתי-דתי","gender":null,"pupils_per_class":27,"guide_page":55,"rows":[{"classes":30,"land_dunam":{"A":22.5,"B":15.0,"C":12.0},"built_sqm":{"A":6540,"B":7400,"C":8200}},{"classes":36,"land_dunam":{"A":27.0,"B":18.0,"C":14.4},"built_sqm":{"A":7770,"B":8750,"C":9720}},{"classes":42,"land_dunam":{"A":31.5,"B":21.0,"C":16.8},"built_sqm":{"A":8790,"B":9900,"C":11000}}],"yard_ratio_pct":{"A":60,"B":80,"C":100}},{"institution_canonical":"בית ספר יסודי","stream":"חרדי","gender":"בנים","pupils_per_class":20,"guide_page":56,"rows":[{"classes":11,"land_dunam":{"A":3.9,"B":3.5,"C":3.1},"built_sqm":{"A":1100,"B":1240,"C":1380}},{"classes":22,"land_dunam":{"A":7.8,"B":7.0,"C":6.2},"built_sqm":{"A":2200,"B":2470,"C":2750}}],"yard_ratio_pct":{"A":60,"B":80,"C":100}},{"institution_canonical":"בית ספר על-יסודי","stream":"חרדי","gender":"בנים","pupils_per_class":20,"guide_page":57,"rows":[{"classes":8,"land_dunam":{"A":4.0,"B":2.8,"C":2.4},"built_sqm":{"A":1040,"B":1180,"C":1300}},{"classes":12,"land_dunam":{"A":6.0,"B":4.2,"C":3.6},"built_sqm":{"A":1500,"B":1700,"C":1900}}],"yard_ratio_pct":{"A":60,"B":80,"C":100}},{"institution_canonical":"בית ספר יסודי","stream":"חרדי","gender":"בנות","pupils_per_class":27,"guide_page":58,"rows":[{"classes":16,"land_dunam":{"A":8.0,"B":6.4,"C":4.8},"built_sqm":{"A":2330,"B":2620,"C":2920}},{"classes":24,"land_dunam":{"A":12.0,"B":9.6,"C":7.2},"built_sqm":{"A":3560,"B":4010,"C":4450}}],"yard_ratio_pct":{"A":60,"B":80,"C":100}},{"institution_canonical":"בית ספר על-יסודי","stream":"חרדי","gender":"בנות","pupils_per_class":27,"guide_page":59,"rows":[{"classes":12,"land_dunam":{"A":9.0,"B":6.0,"C":4.8},"built_sqm":{"A":2240,"B":2520,"C":2800}},{"classes":24,"land_dunam":{"A":18.0,"B":12.0,"C":9.6},"built_sqm":{"A":4330,"B":4870,"C":5410}}],"yard_ratio_pct":{"A":60,"B":80,"C":100}},{"institution_canonical":"מעון יום","stream":"חינוך מיוחד","gender":null,"pupils_per_class":"6-8","guide_page":60,"no_model_split":true,"_note":"חינוך מיוחד — ערך יחיד, אין פיצול A/B/C.","rows":[{"classes":4,"land_dunam":1.5,"built_sqm":750,"yard_sqm":750}],"target_pct_of_age_group":2},{"institution_canonical":"גן ילדים","stream":"חינוך מיוחד","gender":null,"pupils_per_class":"6-8","guide_page":61,"no_model_split":true,"_note":"שטח קרקע 0.5 דונם לכיתה; שטח בנוי 130 מ\"ר לכיתה + ~200 מ\"ר חצר/מרפסת.","dunam_per_class":0.5,"built_sqm_per_class":130,"rows":[{"classes":1,"land_dunam":0.5,"built_sqm":130},{"classes":2,"land_dunam":1.0,"built_sqm":260},{"classes":3,"land_dunam":1.5,"built_sqm":390},{"classes":4,"land_dunam":1.5,"built_sqm":520}],"target_pct_of_age_group":2},{"institution_canonical":"בית ספר יסודי","stream":"חינוך מיוחד","gender":null,"pupils_per_class":10,"guide_page":62,"no_model_split":true,"_note":"שטח קרקע 0.3 דונם לכיתה. שטח בנוי לפי טבלה (לא ליניארי). טרה 60%.","dunam_per_class":0.3,"rows":[{"classes":6,"land_dunam":1.8,"built_sqm":1155},{"classes":10,"land_dunam":3.0,"built_sqm":1940}],"yard_ratio_pct":60,"target_pct_of_age_group":2},{"institution_canonical":"בית ספר על-יסודי","stream":"חינוך מיוחד","gender":null,"pupils_per_class":10,"guide_page":63,"no_model_split":true,"_note":"שטח קרקע 0.3 דונם לכיתה. שטח בנוי לפי טבלה. טרה 60%.","dunam_per_class":0.3,"rows":[{"classes":12,"land_dunam":4.0,"built_sqm":1840},{"classes":18,"land_dunam":6.0,"built_sqm":2530}],"yard_ratio_pct":60,"target_pct_of_age_group":2}],"haredBoysNote":"לחרדי בנים יסודי — הטבלה המפורטת (school_area_tables.json, עמ' 56) היא המקור המוסמך. אל תשתמש בקירוב הליניארי מ-school_models.json עבור מקרה זה."},
};

// ════════════════════════════════════════════════════════════════════════════
// 2. ENGINE (טהור)
// ════════════════════════════════════════════════════════════════════════════
const SECTORS=['יהודי כללי','חרדי','ערבי','דרוזי','בדואי','מעורב'];
const NONJEWISH=new Set(['ערבי','דרוזי','בדואי']);
const DOMAINS=[
  {id:'edu',    icon:'🎓', label:'חינוך'},
  {id:'public', icon:'🏛', label:'מוסדות ציבור אחרים'},
  {id:'open',   icon:'🌳', label:'שטחים פתוחים'},
  {id:'all',    icon:'◎',  label:'תמונה כוללת'},
];

function num(v){ if(v===''||v==null) return null; const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,'')); return isFinite(n)?n:null; }
function round(v){ return v==null?null:Math.round(v); }

function emptySpec(){
  return {
    v:1,
    identity:{plan_number:'',plan_name:'',settlement:'',annex_editor:'',date:'',
      document_kind:'',dev_type:'מתחם חדש',norm_version:NORMS.version},
    assumptions:{
      sector:'יהודי כללי', tradition_pct:null, settlement_size:'', cohort_def:'',
      base:'total', existing_units:null, realization_default:100,
      segments:[newSegment('כל התכנית')],
      declared:{units:null,population:null,cohort_count:null,household_size:null,cohort_pct:null},
    },
    keys:{}, demand:[], provision:[], cells:[], open_space:{}, notes:[],
  };
}
let _segSeq=0;
function newSegment(label){
  return {id:'s'+Date.now().toString(36)+(_segSeq++),label:label||'',units:null,realization_pct:null,
    household_size:null,cohort_pct:null,sector:'',trad_pct:null};
}
// מבטיח שמבנה שנטען מפרויקט ישן/חלקי יהיה שלם
function normalizeSpec(s){
  const e=emptySpec();
  if(!s||typeof s!=='object') return e;
  const out=Object.assign(e,s);
  out.identity=Object.assign(emptySpec().identity,s.identity||{});
  const a=Object.assign(emptySpec().assumptions,s.assumptions||{});
  a.declared=Object.assign(emptySpec().assumptions.declared,(s.assumptions||{}).declared||{});
  a.segments=Array.isArray(a.segments)&&a.segments.length?a.segments.map(g=>Object.assign(newSegment(),g)):[newSegment('כל התכנית')];
  out.assumptions=a;
  return out;
}

function effSector(a,seg){ return (a.sector==='מעורב'?(seg.sector||'יהודי כללי'):a.sector)||'יהודי כללי'; }

// שרשרת ההנחות: יח"ד ← מתממשות ← אוכלוסייה ← ילדים בשנתון, לכל מקטע ובסה"כ
function computeAssumptions(spec){
  const a=spec.assumptions;
  const rows=a.segments.map(g=>{
    const units=num(g.units), real=num(g.realization_pct)??num(a.realization_default)??100;
    const hh=num(g.household_size), cp=num(g.cohort_pct);
    const unitsR=units!=null?units*real/100:null;
    const pop=unitsR!=null&&hh!=null?unitsR*hh:null;
    const coh=pop!=null&&cp!=null?pop*cp/100:null;
    const sector=effSector(a,g);
    const trad=sector==='חרדי'?(num(g.trad_pct)??100):(num(g.trad_pct)??num(a.tradition_pct));
    return {id:g.id,label:g.label,units,real,unitsR,hh,cp,pop,coh,sector,trad};
  });
  const sum=k=>rows.every(r=>r[k]==null)?null:rows.reduce((t,r)=>t+(r[k]||0),0);
  const T={units:sum('units'),unitsR:sum('unitsR'),pop:sum('pop'),coh:sum('coh')};
  T.hh=T.pop!=null&&T.unitsR?T.pop/T.unitsR:null;
  T.cp=T.coh!=null&&T.pop?T.coh/T.pop*100:null;
  T.complete=rows.length>0&&rows.every(r=>r.pop!=null&&(r.coh!=null||num(a.segments.find(s=>s.id===r.id).cohort_pct)===0));
  // בסיס "תוספת": מקזזים יח"ד קיימות (התחדשות עירונית)
  let addition=null;
  const ex=num(a.existing_units);
  if(a.base==='both'&&ex!=null&&T.unitsR){
    const f=Math.max(0,(T.unitsR-ex)/T.unitsR);
    addition={units:T.unitsR-ex,pop:T.pop!=null?T.pop*f:null,coh:T.coh!=null?T.coh*f:null};
  }
  return {rows,T,addition};
}

// השוואה בין ערך שהנספח הצהיר לבין החישוב
function compare(declared,computed,kind){
  const d=num(declared);
  if(d==null||computed==null) return {status:'none'};
  const diff=d-computed;
  const tol=kind==='pct'||kind==='ratio'?0.05:Math.max(0.5,Math.abs(computed)*0.005);
  return {status:Math.abs(diff)<=tol?'ok':'diff',diff};
}

// ביקוש חינוך לפי התדריך — לכל שורה סוכמים את התרומה של המקטעים שהיא חלה עליהם
function eduDemand(spec,A){
  A=A||computeAssumptions(spec);
  const out=[];
  for(const L of NORMS.edu){
    let coh=0,any=false; const parts=[];
    for(const r of A.rows){
      if(r.coh==null) continue;
      const har=r.sector==='חרדי';
      if(L.sectors==='haredi'&&!har) continue;
      if(L.sectors==='nonharedi'&&har) continue;
      coh+=r.coh; any=true; parts.push({label:r.label,coh:r.coh});
    }
    if(!any) continue;
    const agePop=coh*L.share*L.grades;
    const participants=agePop*L.rate;
    const classes=participants/L.perClass;
    out.push({id:L.id,domain:'edu',inst:L.inst,stream:L.stream,special:L.special,
      coh,parts,share:L.share,rate:L.rate,grades:L.grades,perClass:L.perClass,
      agePop,participants,classes,classesRounded:round(classes),
      formula:`${fmtN(coh,1)} ילדים בשנתון`+(L.share!==1?` × ${L.share}`:'')+(L.rate!==1?` × ${L.rate}`:'')+` × ${L.grades} שכבות ÷ ${L.perClass} בכיתה`});
  }
  return out;
}

function publicDemand(spec,A){
  A=A||computeAssumptions(spec);
  const a=spec.assumptions;
  const T=A.T;
  if(T.pop==null) return [];
  const POPTRAD=A.rows.reduce((t,r)=>t+(r.pop!=null&&r.trad!=null?r.pop*r.trad/100:0),0);
  const sectors=new Set(A.rows.map(r=>r.sector));
  const c={POP:T.pop,COH:T.coh||0,UNITS:T.units||0,POPTRAD,
    NONJEWISH:[...sectors].every(s=>NONJEWISH.has(s)),
    TEXTURE:spec.identity.dev_type==='התחדשות עירונית'?'existing':'new',
    SIZE:a.settlement_size||''};
  return NORMS.public.map(P=>{
    const r=P.compute(c)||{};
    return {id:P.id,domain:'public',inst:P.inst,family:P.family,unit:P.unit,formula:P.f,
      value:r.v??null,category:r.cat??null,na:!!r.na,
      needsTrad:(P.id==='synagogue'||P.id==='mikve')&&!c.NONJEWISH&&POPTRAD===0};
  });
}

function openSpaceDemand(spec,A){
  A=A||computeAssumptions(spec);
  const pop=A.T.pop; if(pop==null) return [];
  const ren=spec.identity.dev_type==='התחדשות עירונית';
  return NORMS.openSpace.levels.map(L=>{
    const key=ren?L.keyRenewal:L.keyNew;
    return {id:L.id,domain:'open',label:L.label,key,note:L.note,pop,dunam:pop*key/1000,
      formula:`${fmtN(pop,0)} נפש × ${key} מ"ר ÷ 1,000`};
  });
}

function fmtN(v,d){
  if(v==null||!isFinite(v)) return '—';
  return Number(v).toLocaleString('he-IL',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});
}

const Engine={num,round,emptySpec,newSegment,normalizeSpec,computeAssumptions,compare,
  eduDemand,publicDemand,openSpaceDemand,fmtN,SECTORS,DOMAINS};

if(typeof module!=='undefined'&&module.exports){ module.exports={NORMS,Engine}; return; }

// ════════════════════════════════════════════════════════════════════════════
// 3. UI (דפדפן בלבד)
// ════════════════════════════════════════════════════════════════════════════
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const PR={
  spec:emptySpec(),
  domain:'edu',
  tab:'assump',
  open:false,
};

const TABS=[
  {id:'assump',  label:'זהות והנחות'},
  {id:'demand',  label:'ביקוש'},
  {id:'supply',  label:'מענה ושיבוץ'},
  {id:'checks',  label:'בדיקות'},
];

// ── CSS (מוזרק פעם אחת) ──
const CSS=`
#pr-panel{display:none;flex-direction:column;width:min(560px,58vw);min-width:380px;flex-shrink:0;
  background:#141e2c;border-left:1px solid #2d4060;color:#d6e2f0;font-size:13px;overflow:hidden}
#pr-panel.vis{display:flex}
#pr-hdr{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#1f2e42;border-bottom:1px solid #2d4060;flex-shrink:0}
#pr-hdr h2{margin:0;font-size:14px;color:#7ecfff;flex:1;font-weight:600}
#pr-hdr .pr-x{background:#2c3e55;border:1px solid #3a5070;color:#cde;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px}
#pr-domains{display:flex;gap:4px;padding:8px 10px 0;flex-shrink:0;flex-wrap:wrap}
.pr-dom{flex:1;min-width:92px;background:#18263a;border:1px solid #2d4060;border-bottom:none;color:#9ab;
  padding:7px 6px;border-radius:8px 8px 0 0;cursor:pointer;font-size:12.5px;white-space:nowrap}
.pr-dom.on{background:#223550;color:#fff;border-color:#3d6a9a;font-weight:600}
.pr-dom .soon{font-size:10px;color:#f0b429;margin-right:3px}
#pr-tabs{display:flex;gap:2px;padding:0 10px;background:#223550;border-top:1px solid #3d6a9a;flex-shrink:0}
.pr-tab{background:none;border:none;border-bottom:2px solid transparent;color:#9ab;padding:8px 10px;cursor:pointer;font-size:12.5px}
.pr-tab.on{color:#7ecfff;border-bottom-color:#7ecfff;font-weight:600}
#pr-body{flex:1;overflow:auto;padding:12px 14px 30px}
.pr-sec{margin-bottom:18px}
.pr-sec h3{font-size:13px;color:#7ecfff;margin:0 0 8px;font-weight:600;display:flex;align-items:center;gap:8px}
.pr-sec h3 .pr-hint{font-weight:400;color:#7899bb;font-size:11.5px}
.pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
.pr-f{display:flex;flex-direction:column;gap:3px}
.pr-f label{font-size:11.5px;color:#8fa6c0}
.pr-f input,.pr-f select,.pr-tbl input,.pr-tbl select{background:#0f1824;border:1px solid #2d4060;color:#e6eef8;border-radius:5px;
  padding:5px 7px;font-size:12.5px;width:100%;box-sizing:border-box;font-family:inherit}
.pr-f input:focus,.pr-tbl input:focus{outline:none;border-color:#5aa0e0}
.pr-tbl{width:100%;border-collapse:collapse;font-size:12px}
.pr-tbl th{font-weight:500;color:#8fa6c0;font-size:11px;text-align:right;padding:4px 3px;border-bottom:1px solid #2d4060;vertical-align:bottom}
.pr-tbl td{padding:3px 3px;border-bottom:1px solid #1d2b3e;vertical-align:middle}
.pr-tbl input{padding:4px 5px;font-size:12px}
.pr-tbl td.num{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}
.pr-calc{color:#b8c8da;background:#16263a;border-radius:4px;padding:3px 6px;display:inline-block;min-width:48px;text-align:left;direction:ltr}
.pr-tot td{border-top:1px solid #3d6a9a;font-weight:600;color:#fff}
.pr-decl td{background:#1a2230}
.pr-src{font-size:9.5px;padding:1px 5px;border-radius:8px;margin-right:4px;white-space:nowrap}
.pr-src.calc{background:#233a55;color:#9cc8f0}
.pr-src.guide{background:#2d2a45;color:#c4b5ff}
.pr-st{font-size:11px;font-weight:600;white-space:nowrap}
.pr-st.ok{color:#5ecf99}.pr-st.diff{color:#f0b429}
.pr-btn{background:#1f3350;border:1px solid #3d6a9a;color:#cfe3fa;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px}
.pr-btn:hover{background:#27456b}
.pr-del{background:none;border:none;color:#c06060;cursor:pointer;font-size:14px;padding:0 4px}
.pr-chain{display:flex;align-items:stretch;gap:4px;flex-wrap:wrap;direction:rtl}
.pr-node{background:#18263a;border:1px solid #2d4060;border-radius:8px;padding:6px 10px;text-align:center;min-width:78px}
.pr-node .l{font-size:10.5px;color:#8fa6c0}.pr-node .v{font-size:15px;font-weight:700;color:#fff;direction:ltr}
.pr-node.hi{border-color:#5aa0e0;background:#1d3350}
.pr-arr{display:flex;flex-direction:column;justify-content:center;align-items:center;color:#7899bb;font-size:10.5px;padding:0 2px}
.pr-note{background:#18263a;border:1px dashed #3d6a9a;border-radius:8px;padding:12px 14px;color:#a9bdd3;line-height:1.7;font-size:12.5px}
.pr-note b{color:#dbe8f6}
.pr-soon{max-width:460px;margin:30px auto;text-align:center}
.pr-soon .ic{font-size:34px}
.pr-cat{font-size:11.5px;color:#f5d58a}
.pr-na{color:#5d7087;font-size:11.5px}
.pr-small{font-size:11px;color:#7899bb}
body.theme-light #pr-panel{background:#f4f7fb;color:#1c2b3c;border-left-color:#bfccdb}
body.theme-light #pr-hdr{background:#dde5ef;border-bottom-color:#bfccdb}
body.theme-light #pr-hdr h2,body.theme-light .pr-sec h3{color:#1a3560}
body.theme-light .pr-dom{background:#e6edf5;color:#4a5d74;border-color:#bfccdb}
body.theme-light .pr-dom.on{background:#fff;color:#1a3560;border-color:#8fb0d6}
body.theme-light #pr-tabs{background:#fff;border-top-color:#8fb0d6}
body.theme-light .pr-f input,body.theme-light .pr-f select,body.theme-light .pr-tbl input,body.theme-light .pr-tbl select{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .pr-calc{background:#e6edf5;color:#1c2b3c}
body.theme-light .pr-tot td{color:#1a3560}
body.theme-light .pr-node,body.theme-light .pr-note{background:#fff;border-color:#bfccdb;color:#2a3d52}
body.theme-light .pr-node .v{color:#1a3560}
body.theme-light .pr-decl td{background:#eef2f7}
`;

function _ensureDom(){
  if($('pr-panel')) return true;
  const main=$('main-area'), wrap=$('canvas-wrap');
  if(!main||!wrap) return false;
  const st=document.createElement('style'); st.id='pr-css'; st.textContent=CSS; document.head.appendChild(st);
  const p=document.createElement('div'); p.id='pr-panel';
  p.innerHTML=`<div id="pr-hdr"><h2>📊 קורא הפרוגרמה</h2>
      <span class="pr-small" title="${E(NORMS.versionLabel)}">נורמות: ${E(NORMS.version)}</span>
      <button class="pr-x" onclick="PR.close()">✕ סגירה</button></div>
    <div id="pr-domains"></div><div id="pr-tabs"></div><div id="pr-body"></div>`;
  main.insertBefore(p,wrap);
  return true;
}

function _resizeMap(){ try{ if(typeof resize==='function') resize(); }catch(e){} }

PR.openPanel=function(){
  if(!_ensureDom()) return;
  // סגירת פאנלים אחרים שתופסים את אותו מקום
  try{ if($('rn-panel')&&$('rn-panel').style.display==='flex'&&typeof closeRoadNetPanel==='function') closeRoadNetPanel(); }catch(e){}
  try{ if($('t5-panel')&&$('t5-panel').classList.contains('vis')) closeTable5View(); }catch(e){}
  try{ if($('tama-panel')&&$('tama-panel').classList.contains('vis')) closeTamaView(); }catch(e){}
  try{ if($('prog-panel')&&$('prog-panel').classList.contains('vis')) closeProgView(); }catch(e){}
  $('legend').style.display='none';
  $('pr-panel').classList.add('vis');
  const b=$('btn-prog'); if(b) b.classList.add('active');
  PR.open=true;
  _prefillIdentity();
  PR.render();
  _resizeMap();
};
PR.close=function(){
  const p=$('pr-panel'); if(p) p.classList.remove('vis');
  if($('legend')) $('legend').style.display='';
  const b=$('btn-prog'); if(b) b.classList.remove('active');
  PR.open=false;
  _resizeMap();
};
PR.toggle=function(){ PR.open?PR.close():PR.openPanel(); };

function _prefillIdentity(){
  const I=PR.spec.identity;
  try{ if(!I.plan_number&&typeof _projPlanNumber==='function') I.plan_number=_projPlanNumber()||''; }catch(e){}
}

PR.setDomain=function(d){ PR.domain=d; PR.render(); };
PR.setTab=function(t){ PR.tab=t; PR.render(); };

// ── עדכון שדות ──
function _setPath(obj,path,val){
  const ks=path.split('.'); let o=obj;
  for(let i=0;i<ks.length-1;i++){ o=o[ks[i]]; if(o==null) return; }
  o[ks[ks.length-1]]=val;
}
// שדה טקסט/מספר — לא מרנדר מחדש (שומר פוקוס), רק מעדכן ערכים מחושבים
PR.onField=function(el){
  const path=el.dataset.p, kind=el.dataset.k;
  let v=el.value;
  if(kind==='n') v=v===''?null:v; // שומרים כמחרוזת; num() מפרש
  if(path.startsWith('seg:')){
    const [,id,field]=path.split(':');
    const g=PR.spec.assumptions.segments.find(s=>s.id===id); if(g) g[field]=v;
  } else _setPath(PR.spec,path,v);
  _refreshComputed();
};
// select / שינוי מבני — מרנדר מחדש
PR.onSelect=function(el){ PR.onField(el); PR.render(); };
PR.addSegment=function(){ PR.spec.assumptions.segments.push(newSegment('')); PR.render(); };
PR.delSegment=function(id){
  const a=PR.spec.assumptions;
  if(a.segments.length<=1) return;
  a.segments=a.segments.filter(s=>s.id!==id); PR.render();
};

// ── רינדור ──
PR.render=function(){
  if(!$('pr-panel')) return;
  $('pr-domains').innerHTML=DOMAINS.map(d=>{
    const soon=(d.id==='edu'||d.id==='all')?'':'<span class="soon">בקרוב</span>';
    return `<button class="pr-dom${PR.domain===d.id?' on':''}" onclick="PR.setDomain('${d.id}')">${d.icon} ${E(d.label)}${soon}</button>`;
  }).join('');
  $('pr-tabs').innerHTML=TABS.map(t=>`<button class="pr-tab${PR.tab===t.id?' on':''}" onclick="PR.setTab('${t.id}')">${E(t.label)}</button>`).join('');
  const body=$('pr-body');
  const sc=body.scrollTop;
  body.innerHTML=PR.tab==='assump'?_renderAssump():PR.tab==='demand'?_renderDemand():_renderSoon(PR.tab);
  body.scrollTop=sc;
  _refreshComputed();
};

function _inp(path,val,kind,ph,extra){
  return `<input data-p="${E(path)}" data-k="${kind||'t'}" value="${E(val??'')}" placeholder="${E(ph||'')}" oninput="PR.onField(this)" ${extra||''}>`;
}
function _sel(path,val,opts,onchange){
  return `<select data-p="${E(path)}" onchange="${onchange||'PR.onSelect(this)'}">${opts.map(o=>{
    const [v,l]=Array.isArray(o)?o:[o,o];
    return `<option value="${E(v)}"${String(val??'')===String(v)?' selected':''}>${E(l)}</option>`;}).join('')}</select>`;
}

function _renderAssump(){
  const S=PR.spec, I=S.identity, a=S.assumptions;
  const mixed=a.sector==='מעורב';
  const idh=`<div class="pr-sec"><h3>זהות הנספח <span class="pr-hint">לפי השער של הנספח. מספר התכנית — מהחותמת, לא משם הקובץ</span></h3>
    <div class="pr-grid">
      <div class="pr-f"><label>מספר תכנית</label>${_inp('identity.plan_number',I.plan_number,'t','1125')}</div>
      <div class="pr-f"><label>שם התכנית / השכונה</label>${_inp('identity.plan_name',I.plan_name,'t')}</div>
      <div class="pr-f"><label>יישוב</label>${_inp('identity.settlement',I.settlement,'t')}</div>
      <div class="pr-f"><label>עורך הנספח</label>${_inp('identity.annex_editor',I.annex_editor,'t')}</div>
      <div class="pr-f"><label>תאריך / מהדורה</label>${_inp('identity.date',I.date,'t','12/2024')}</div>
      <div class="pr-f"><label>סוג מסמך</label>${_sel('identity.document_kind',I.document_kind,[['','—'],'נספח מלא','מצגת','מכתב / תמצית','פרק במסמך חברתי-כלכלי','בחינת כושר נשיאה'])}</div>
      <div class="pr-f"><label>סוג פיתוח</label>${_sel('identity.dev_type',I.dev_type,['מתחם חדש','התחדשות עירונית','TOD'])}</div>
      <div class="pr-f"><label>גרסת נורמות להשוואה</label>${_sel('identity.norm_version',I.norm_version,[[NORMS.version,'תדריך 2018 + אקסל 2024 + קומפקטי 2025']])}</div>
    </div></div>`;

  const ctx=`<div class="pr-sec"><h3>הקשר האוכלוסייה <span class="pr-hint">משפיע על הנוסחאות ועל רשימת המוסדות</span></h3>
    <div class="pr-grid">
      <div class="pr-f"><label>מגזר</label>${_sel('assumptions.sector',a.sector,SECTORS.map(s=>[s,s==='מעורב'?'מעורב (לפי מקטעים)':s]))}</div>
      <div class="pr-f"><label>% שומרי מסורת <span class="pr-small">(לבתי כנסת ומקוואות)</span></label>${_inp('assumptions.tradition_pct',a.tradition_pct,'n',a.sector==='חרדי'?'100':'25')}</div>
      <div class="pr-f"><label>גודל היישוב</label>${_sel('assumptions.settlement_size',a.settlement_size,[['','—'],['small','עד 50,000 נפש'],['large','מעל 50,000 נפש']])}</div>
      <div class="pr-f"><label>הגדרת שנתון בנספח</label>${_sel('assumptions.cohort_def',a.cohort_def,[['','לא צוין'],['0-19','גילאי 0-19'],['0-18','גילאי 0-18'],['0-14','גילאי 0-14']])}</div>
      <div class="pr-f"><label>בסיס החישוב</label>${_sel('assumptions.base',a.base,[['total','סה"כ יח"ד בתכנית'],['addition','תוספת בלבד (התחדשות)'],['both','סה"כ וגם תוספת']])}</div>
      ${a.base==='both'?`<div class="pr-f"><label>יח"ד קיימות (לקיזוז)</label>${_inp('assumptions.existing_units',a.existing_units,'n')}</div>`:'<div></div>'}
    </div></div>`;

  // טבלת מקטעים
  const head=`<tr><th style="width:24%">מקטע</th><th>יח"ד</th><th>מימוש %</th><th>נפשות<br>למ"ב</th><th>שנתון %</th>
    ${mixed?'<th>מגזר</th>':''}<th>אוכלוסייה <span class="pr-src calc">חושב</span></th><th>ילדים<br>בשנתון <span class="pr-src calc">חושב</span></th><th></th></tr>`;
  const rows=a.segments.map(g=>`<tr>
      <td>${_inp('seg:'+g.id+':label',g.label,'t','תווית')}</td>
      <td>${_inp('seg:'+g.id+':units',g.units,'n')}</td>
      <td>${_inp('seg:'+g.id+':realization_pct',g.realization_pct,'n',String(a.realization_default??100))}</td>
      <td>${_inp('seg:'+g.id+':household_size',g.household_size,'n')}</td>
      <td>${_inp('seg:'+g.id+':cohort_pct',g.cohort_pct,'n')}</td>
      ${mixed?`<td>${_sel('seg:'+g.id+':sector',g.sector||'יהודי כללי',SECTORS.filter(s=>s!=='מעורב'))}</td>`:''}
      <td class="num"><span class="pr-calc" data-out="seg-pop-${g.id}">—</span></td>
      <td class="num"><span class="pr-calc" data-out="seg-coh-${g.id}">—</span></td>
      <td>${a.segments.length>1?`<button class="pr-del" title="מחיקת מקטע" onclick="PR.delSegment('${g.id}')">✕</button>`:''}</td>
    </tr>`).join('');
  const D=a.declared;
  const span=mixed?1:0;
  const tot=`<tr class="pr-tot"><td>סה"כ (חישוב)</td>
      <td class="num"><span data-out="T-units">—</span></td><td></td>
      <td class="num"><span data-out="T-hh">—</span></td><td class="num"><span data-out="T-cp">—</span></td>
      ${span?'<td></td>':''}
      <td class="num"><span data-out="T-pop">—</span></td><td class="num"><span data-out="T-coh">—</span></td><td></td></tr>
    <tr class="pr-decl"><td>הנספח מצהיר <div class="pr-small">סיכום מתוך הנספח</div></td>
      <td>${_inp('assumptions.declared.units',D.units,'n')}<div data-out="st-units"></div></td><td></td>
      <td>${_inp('assumptions.declared.household_size',D.household_size,'n')}<div data-out="st-hh"></div></td>
      <td>${_inp('assumptions.declared.cohort_pct',D.cohort_pct,'n')}<div data-out="st-cp"></div></td>
      ${span?'<td></td>':''}
      <td>${_inp('assumptions.declared.population',D.population,'n')}<div data-out="st-pop"></div></td>
      <td>${_inp('assumptions.declared.cohort_count',D.cohort_count,'n')}<div data-out="st-coh"></div></td><td></td></tr>`;

  const segs=`<div class="pr-sec"><h3>הנחות מוצא — מקטעים
      <span class="pr-hint">מקטע אחד = מספר אחיד לכל התכנית. הוסיפו מקטעים אם הנספח מפצל (גודל דירה, חדרים, כללי/חרדי, דיור מוגן, רשות)</span></h3>
    <table class="pr-tbl">${head}${rows}${tot}</table>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <button class="pr-btn" onclick="PR.addSegment()">+ מקטע</button>
      <span class="pr-small">אחוז מימוש ריק = 100%. ילדים בשנתון = אוכלוסייה × שנתון%.</span>
    </div></div>`;

  const chain=`<div class="pr-sec"><h3>שרשרת ההנחות</h3><div class="pr-chain" data-out="chain"></div>
    <div data-out="addition" class="pr-small" style="margin-top:6px"></div></div>`;
  return idh+ctx+segs+chain;
}

function _refreshComputed(){
  const body=$('pr-body'); if(!body) return;
  const A=computeAssumptions(PR.spec);
  const set=(k,html)=>{ const el=body.querySelector(`[data-out="${k}"]`); if(el) el.innerHTML=html; };
  for(const r of A.rows){ set('seg-pop-'+r.id,fmtN(r.pop)); set('seg-coh-'+r.id,fmtN(r.coh,r.coh!=null&&r.coh<100?1:0)); }
  const T=A.T;
  set('T-units',fmtN(T.units)); set('T-pop',fmtN(T.pop)); set('T-coh',fmtN(T.coh,T.coh!=null&&T.coh<100?1:0));
  set('T-hh',T.hh!=null?fmtN(T.hh,2):'—'); set('T-cp',T.cp!=null?fmtN(T.cp,2)+'%':'—');
  const D=PR.spec.assumptions.declared;
  const st=(k,decl,comp,kind)=>{
    const c=compare(decl,comp,kind);
    set('st-'+k,c.status==='ok'?'<span class="pr-st ok">✓ תואם</span>'
      :c.status==='diff'?`<span class="pr-st diff" title="החישוב מההנחות: ${E(fmtN(comp,kind?2:0))}">⚠ פער ${E(fmtN(c.diff,kind?2:0))}</span>`:'');
  };
  st('units',D.units,T.units); st('pop',D.population,T.pop); st('coh',D.cohort_count,T.coh);
  st('hh',D.household_size,T.hh,'ratio'); st('cp',D.cohort_pct,T.cp,'pct');
  // שרשרת
  const nd=(l,v,hi)=>`<div class="pr-node${hi?' hi':''}"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const ar=t=>`<div class="pr-arr"><div>${t}</div><div>◀</div></div>`;
  let ch=nd('יח"ד',fmtN(T.units));
  if(T.unitsR!=null&&T.units!=null&&Math.abs(T.unitsR-T.units)>0.5){ ch+=ar('× מימוש')+nd('מתממשות',fmtN(T.unitsR)); }
  ch+=ar(`× ${T.hh!=null?fmtN(T.hh,2):'?'} נפשות`)+nd('אוכלוסייה',fmtN(T.pop));
  ch+=ar(`× ${T.cp!=null?fmtN(T.cp,2):'?'}%`)+nd('ילדים בשנתון',fmtN(T.coh,1),true);
  set('chain',ch);
  set('addition',A.addition?`בסיס תוספת: ${fmtN(A.addition.units)} יח"ד · ${fmtN(A.addition.pop)} נפש · ${fmtN(A.addition.coh,1)} ילדים בשנתון (אחרי קיזוז יח"ד קיימות)`:'');
}

function _renderDemand(){
  const A=computeAssumptions(PR.spec);
  if(A.T.pop==null) return `<div class="pr-note">כדי לראות ביקוש, מלאו קודם בלשונית <b>זהות והנחות</b> לפחות מקטע אחד עם יח"ד, נפשות למשק בית ושנתון.</div>`;
  const intro=`<div class="pr-note" style="margin-bottom:12px"><b>תצוגה מקדימה — ביקוש לפי התדריך בלבד.</b>
    בשלב הבא תתווסף לכל שורה עמודת <b>"הנספח אומר"</b> (מה שהיועץ כתב) ועמודת <b>"חישוב מהנחות הנספח"</b>, עם סימון סטיות.</div>`;
  if(PR.domain==='edu'||PR.domain==='all'){
    const rows=eduDemand(PR.spec,A);
    const t=rows.map(r=>`<tr>
        <td>${E(r.inst)}${r.stream&&r.stream!=='כללי'?` <span class="pr-small">— ${E(r.stream)}</span>`:''}${r.special?' <span class="pr-small">(חנ"מ)</span>':''}</td>
        <td class="num">${fmtN(r.agePop)}</td>
        <td class="num" title="${E(r.formula)}"><span class="pr-calc">${fmtN(r.classes,1)}</span></td>
        <td class="num"><b>${fmtN(r.classesRounded)}</b></td>
        <td class="pr-small">${E(r.formula)}</td></tr>`).join('');
    const eduT=`<div class="pr-sec"><h3>🎓 חינוך — כיתות נדרשות <span class="pr-src guide">תדריך</span></h3>
      <table class="pr-tbl"><tr><th>מוסד</th><th>אוכלוסייה<br>בגיל</th><th>כיתות<br>(מדויק)</th><th>כיתות</th><th>נוסחה</th></tr>${t}</table></div>`;
    if(PR.domain==='edu') return intro+eduT;
    return intro+eduT+_publicTable(A)+_openTable(A);
  }
  if(PR.domain==='public') return intro+_publicTable(A);
  if(PR.domain==='open') return intro+_openTable(A);
  return '';
}
function _publicTable(A){
  const rows=publicDemand(PR.spec,A);
  const t=rows.map(r=>`<tr${r.na?' style="opacity:.55"':''}>
      <td>${E(r.inst)} <span class="pr-small">${E(r.family)}</span></td>
      <td class="num">${r.na?'<span class="pr-na">לא חל</span>':r.value!=null?`<span class="pr-calc">${fmtN(r.value,r.value<10?1:0)}</span>`:''}</td>
      <td class="pr-small">${r.na?'':E(r.unit)}</td>
      <td>${r.category?`<span class="pr-cat">${E(r.category)}</span>`:''}${r.needsTrad?' <span class="pr-st diff">חסר % שומרי מסורת</span>':''}</td>
      <td class="pr-small">${E(r.formula)}</td></tr>`).join('');
  return `<div class="pr-sec"><h3>🏛 מוסדות ציבור אחרים <span class="pr-src guide">תדריך</span></h3>
    <table class="pr-tbl"><tr><th>מוסד</th><th>כמות</th><th>יחידה</th><th>קטגוריה</th><th>נוסחה</th></tr>${t}</table></div>`;
}
function _openTable(A){
  const rows=openSpaceDemand(PR.spec,A);
  const t=rows.map(r=>`<tr><td>${E(r.label)}</td><td class="num">${r.key} מ"ר לנפש</td>
      <td class="num"><b>${fmtN(r.dunam,1)}</b> ד׳</td><td class="pr-small">${E(r.formula)}<br>${E(r.note)}</td></tr>`).join('');
  return `<div class="pr-sec"><h3>🌳 שטחים פתוחים <span class="pr-src guide">ברירת מחדל</span></h3>
    <table class="pr-tbl"><tr><th>רמה</th><th>מפתח</th><th>נדרש</th><th>נוסחה</th></tr>${t}</table></div>`;
}

function _renderSoon(tab){
  const txt={
    supply:`כאן יוזן <b>המענה</b> שהיועץ הציע לכל צורך: קרקע חומה / הפרשה מבונה במגרש מגורים / בשילוב במוסד אחר / מחוץ לתכנית —
      ו<b>ישובץ בלחיצה על התשריט</b> או בהקלדת מספרי תאי שטח. התאים ייצבעו לפי סוג המוסד, ושטח כל תא יושווה לשטח הנדרש לפי הדגם.`,
    checks:`כאן ירוכזו כל הממצאים: <b>עקביות פנימית</b> (האם מסקנות הנספח נובעות מהנחותיו), <b>מול התדריך</b>,
      <b>מול טבלה 5</b> (האם ההפרשות המבונות מעוגנות בזכויות), ו<b>כיסוי</b> רדיוסי השירות.`,
  }[tab]||'';
  return `<div class="pr-soon"><div class="ic">🛠</div><div style="color:#f0b429;font-weight:600;margin:6px 0 10px">בשלב הבא</div>
    <div class="pr-note" style="text-align:right">${txt}</div></div>`;
}

// ── שכבה על התשריט (שלב 0: עדיין ריקה) ──
PR.drawLayer=function(ctx){ /* שלב א: צביעת תאים משובצים, סמלים, רדיוסים */ };

// ── שמירה בפרויקט ──
PR.getSpec=function(){ return PR.spec; };
PR.setSpec=function(s){ PR.spec=normalizeSpec(s); if(PR.open) PR.render(); };
PR.reset=function(){ PR.spec=emptySpec(); PR.close(); };

PR.NORMS=NORMS; PR.Engine=Engine;
root.PR=PR;
root.openProgReader=function(){ PR.toggle(); };
// פרויקט שנטען לפני שהקובץ הזה נטען
if(root._PR_PENDING!==undefined){ PR.setSpec(root._PR_PENDING); root._PR_PENDING=undefined; }

})(typeof window!=='undefined'?window:globalThis);
