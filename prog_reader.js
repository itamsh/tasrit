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
    keys:{},
    demand:{},     // {lineId: {declared:{classes,institutions,land,model}, keys:{rate,grades,perClass}}} — מה שהנספח אומר
    provision:[],  // [{id,line,lines?,alt?,mode,cells:[],classes,land,built,model,note}] — המענה שהיועץ הציע ושיבוצו בתאים
                   // lines = אשכול משותף לכמה סוגים (למשל מעון+גן) · alt = תאים חלופיים ("אחד מכמה שימושים אפשריים")
    builtNonEdu:[], // תאים עם שטח ציבורי מבונה בטבלה 5 שסומנו "לא לחינוך"
    radii:null, open_space:{}, notes:[],
  };
}
let _segSeq=0;
function newSegment(label){
  return {id:'s'+Date.now().toString(36)+(_segSeq++),label:label||'',units:null,realization_pct:null,
    household_size:null,cohort_pct:null,sector:'',trad_pct:null,special:false};
  // special = דיור מיוחד (דיור מוגן, דיור לסטודנטים וכד'): תושבים שנספרים לצורכי ציבור כלליים (ירוק, מועדונים…) אך לא לחינוך
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
  out.demand=(s.demand&&typeof s.demand==='object'&&!Array.isArray(s.demand))?s.demand:{};
  out.provision=Array.isArray(s.provision)?s.provision.map(p=>Object.assign({cells:[]},p,{cells:Array.isArray(p.cells)?p.cells.map(String):[]})):[];
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
    const special=!!g.special;
    const coh=special?(pop!=null?0:null):(pop!=null&&cp!=null?pop*cp/100:null); // דיור מיוחד — ללא ילדים
    const sector=effSector(a,g);
    const trad=sector==='חרדי'?(num(g.trad_pct)??100):(num(g.trad_pct)??num(a.tradition_pct));
    return {id:g.id,label:g.label,units,real,unitsR,hh,cp:special?null:cp,pop,coh,sector,trad,special};
  });
  // T = מגורים רגילים (בסיס החינוך וההשוואה לנספח); T.special = דיור מיוחד; T.popAll/unitsAll = כל התושבים (לצורכי ציבור כלליים)
  const reg=rows.filter(r=>!r.special), spc=rows.filter(r=>r.special);
  const sumOf=(rs,k)=>!rs.length||rs.every(r=>r[k]==null)?null:rs.reduce((t,r)=>t+(r[k]||0),0);
  const T={units:sumOf(reg,'units'),unitsR:sumOf(reg,'unitsR'),pop:sumOf(reg,'pop'),coh:sumOf(reg,'coh')};
  T.hh=T.pop!=null&&T.unitsR?T.pop/T.unitsR:null;
  T.cp=T.coh!=null&&T.pop?T.coh/T.pop*100:null;
  T.special=spc.length?{units:sumOf(spc,'units'),unitsR:sumOf(spc,'unitsR'),pop:sumOf(spc,'pop')}:null;
  const add=(x,y)=>x==null&&y==null?null:(x||0)+(y||0);
  T.popAll=add(T.pop,T.special&&T.special.pop); T.unitsAll=add(T.units,T.special&&T.special.units);
  if(!reg.length&&T.special){ T.pop=null; } // רק דיור מיוחד — אין בסיס לחינוך
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
  if(T.popAll==null) return [];
  const POPTRAD=A.rows.reduce((t,r)=>t+(r.pop!=null&&r.trad!=null?r.pop*r.trad/100:0),0);
  const sectors=new Set(A.rows.map(r=>r.sector));
  const c={POP:T.popAll,COH:T.coh||0,UNITS:T.unitsAll||0,POPTRAD, // כל התושבים, כולל דיור מיוחד
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
  const pop=A.T.popAll; if(pop==null) return []; // כולל דיור מיוחד — גם הם משתמשים בשטחים הפתוחים
  const ren=spec.identity.dev_type==='התחדשות עירונית';
  return NORMS.openSpace.levels.map(L=>{
    const key=ren?L.keyRenewal:L.keyNew;
    return {id:L.id,domain:'open',label:L.label,key,note:L.note,pop,dunam:pop*key/1000,
      formula:`${fmtN(pop,0)} נפש${A.T.special?' (כולל דיור מיוחד)':''} × ${key} מ"ר ÷ 1,000`};
  });
}

function fmtN(v,d){
  if(v==null||!isFinite(v)) return '—';
  return Number(v).toLocaleString('he-IL',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});
}

// ── שלב א (חינוך): השוואת "הנספח אומר" מול התדריך ומול מפתח היועץ ──
// צבע, תווית קצרה ורדיוס שירות ברירת מחדל (מ׳) לכל סוג מוסד חינוך
const EDU_META={
  maon:{short:'מעון',  color:'#e74c3c', radius:500},
  gan: {short:'גן',    color:'#f1c40f', radius:500},
  elem:{short:'יסודי', color:'#3498db', radius:750},
  sec: {short:'על-יסודי',color:'#8e44ad',radius:1500},
};
function eduBase(id){ return String(id||'').split('_')[0]; }
function eduShort(line){
  const m=EDU_META[eduBase(line.id)]||{short:line.inst};
  let s=m.short;
  if(line.special) s+=' חנ"מ';
  else if(line.stream&&line.stream!=='כללי') s+=' '+line.stream.replace('חרדי ','');
  return s;
}
// דונם לכיתה לפי דגם (school_models.json): model = 'A'|'B'|'C'|'model_1'|'model_2'
function dunamPerClass(inst,stream,model){
  const t=NORMS.school&&NORMS.school.dunamPerClass&&NORMS.school.dunamPerClass[inst];
  if(!t||!model||!t[model]) return null;
  const v=/בנים/.test(stream||'')?t[model].haredi_boys:t[model].regular;
  return v==null?null:v;
}
// ── מכסות שטח לכיתות לפי התדריך (מדריך 2018 עמ' 54-55; חנ"מ — school_area_tables.json) ──
// גן ילדים: 1-3 כיתות = 0.5 ד׳ לכיתה · 4 = 1.5 · 5-6 = 2.0 (אשכול); מעבר ל-6 — אשכולות נוספים
function ganLandDunam(n){ let d=0; n=Math.max(0,Math.round(n)); while(n>6){ d+=2; n-=6; } return d+(n<=3?0.5*n:n===4?1.5:2.0); }
// קרקע נדרשת לסוג מוסד ומספר כיתות: {d, f} או null כשאין תקן (או שחסר דגם לבית ספר)
function landNeed(lineId,n,model,line){
  n=num(n); if(!n) return null;
  const b=eduBase(lineId), se=/_se$/.test(lineId);
  if(b==='maon'&&!se){ const d=Math.max(1,n/3); return {d,f:`${n} כיתות × 1.0 ד׳ לכל 3 כיתות${n<3?' (מינימום 1.0)':''} = ${fmtN(d,1)} ד׳`}; }
  if(b==='gan'&&!se){ const d=ganLandDunam(n); return {d,f:`${n} כיתות גן — ${n<=3?'0.5 ד׳ לכיתה':n===4?'4 כיתות = 1.5 ד׳':n<=6?'5-6 כיתות = 2.0 ד׳':'אשכולות של עד 6 כיתות (2.0 ד׳ לאשכול)'} = ${fmtN(d,1)} ד׳`}; }
  if(se){ const per={maon:0.375,gan:0.5,elem:0.3}[b]; if(!per) return null; return {d:n*per,f:`${n} × ${per} ד׳ לכיתה (חנ"מ) = ${fmtN(n*per,1)} ד׳`}; }
  if((b==='elem'||b==='sec')&&line){ const dpc=dunamPerClass(line.inst,line.stream,model); if(!dpc) return null;
    return {d:n*dpc,f:`${n} × ${dpc} ד׳ לכיתה (דגם ${String(model).replace('model_','')}) = ${fmtN(n*dpc,1)} ד׳`}; }
  return null;
}
// שטח בנוי נדרש (הקצאה מבונה): מעון 147 מ"ר ל-3 הכיתות הראשונות + 125 לכל נוספת · גן 130 מ"ר לכיתה (+ חצר)
function builtNeed(lineId,n){
  n=num(n); if(!n) return null;
  const b=eduBase(lineId), se=/_se$/.test(lineId);
  if(b==='maon'&&!se){ const m=147*Math.min(n,3)+125*Math.max(0,n-3); return {m,f:`${n} כיתות: 147 מ"ר × ${Math.min(n,3)}${n>3?` + 125 × ${n-3}`:''} = ${fmtN(m)} מ"ר`}; }
  if(b==='gan'){ return {m:130*n,f:`${n} × 130 מ"ר לכיתה = ${fmtN(130*n)} מ"ר (+ חצר/מרפסת ${se?'':'200 מ"ר לכיתה'})`}; }
  if(b==='maon'&&se){ return {m:187.5*n,f:`${n} × 187.5 מ"ר (750 מ"ר ל-4 כיתות חנ"מ) = ${fmtN(187.5*n)} מ"ר`}; }
  return null;
}
// חישוב לפי מפתח היועץ (שכבות / תלמידים בכיתה / שיעור ביקוש) — ריק = כמו בתדריך
function keysClasses(line,keys){
  const k=keys||{};
  const rate=num(k.rate)!=null?num(k.rate)/100:line.rate;     // מוזן באחוזים
  const grades=num(k.grades)??line.grades, per=num(k.perClass)??line.perClass;
  const any=num(k.rate)!=null||num(k.grades)!=null||num(k.perClass)!=null;
  return {any,rate,grades,perClass:per,classes:per?line.coh*line.share*grades*rate/per:null};
}
// מרווח ביטחון: עודף קטן מעל הנדרש (כיתות/שטח) הוא נוהג מקובל ואף רצוי — לא פער.
// עד +20% = "מרווח ביטחון" (✓); מעבר לכך = "עודף ניכר" (ℹ, לא אזהרה); חוסר = ⚠.
const MARGIN=0.2;
function evalSupply(given,need,tolAbs){
  if(given==null||need==null) return {cls:'none'};
  const t=tolAbs??0; const d=given-need; const pct=need?d/need*100:null;
  if(d< -t) return {cls:'short',d,pct};
  if(d<=t) return {cls:'ok',d,pct};
  if(given<=need*(1+MARGIN)+t) return {cls:'margin',d,pct};
  return {cls:'surplus',d,pct};
}
// סטטוס שורה: ok = תואם לתדריך (±1) · margin = מעט מעל התדריך (מרווח ביטחון) ·
// keys = תואם למפתח היועץ אך לא לתדריך · surplus = עודף ניכר · diff = חוסר
function eduRowStatus(line,d){
  const decl=num(d&&d.declared&&d.declared.classes);
  if(decl==null) return {status:'none'};
  const kc=keysClasses(line,d&&d.keys);
  const ev=evalSupply(decl,line.classesRounded,1);
  const okKeys=kc.any&&kc.classes!=null&&Math.abs(decl-Math.round(kc.classes))<=1;
  const status=ev.cls==='ok'?'ok':ev.cls==='margin'?'margin':okKeys?'keys':ev.cls==='surplus'?'surplus':'diff';
  return {status,diff:decl-line.classesRounded,pct:ev.pct,keysClasses:kc.any?kc.classes:null};
}

const Engine={num,round,emptySpec,newSegment,normalizeSpec,computeAssumptions,compare,
  eduDemand,publicDemand,openSpaceDemand,fmtN,SECTORS,DOMAINS,
  EDU_META,eduBase,eduShort,dunamPerClass,keysClasses,eduRowStatus,evalSupply,MARGIN,ganLandDunam,landNeed,builtNeed};

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
  {id:'walk',    label:'🎯 תא אחר תא'},
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
/* תמונת הנספח: עמודות המספרים ממורכזות — הכותרת בדיוק מעל הערכים */
.pr-sumtbl th:not(:first-child),.pr-sumtbl td.num{text-align:center;width:13%}
.pr-sumtbl th:first-child{width:22%}.pr-sumtbl th:last-child{text-align:right;width:auto}
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
.pr-wprog{display:flex;gap:4px;margin-bottom:10px}
.pr-wprog span{flex:1;text-align:center;padding:6px 4px;border-radius:7px;background:#18263a;border:1px solid #2d4060;font-size:12px;cursor:pointer;color:#8fa6c0}
.pr-wprog span.on{background:#1d3a57;border-color:#5aa0e0;color:#fff;font-weight:600}
.pr-wcard{background:#18263a;border:1px solid #2d4060;border-radius:11px;padding:12px 14px;margin-bottom:10px}
.pr-wcard.intro p{line-height:1.7;margin:6px 0;color:#c4d4e6;font-size:13px}
.pr-wbig{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px}
.pr-wgo{background:linear-gradient(135deg,#1e8f5e,#27ae60);border:none;color:#fff;border-radius:8px;padding:8px 18px;font-size:14px;font-weight:700;cursor:pointer;margin-top:6px}
.pr-wgo:hover{filter:brightness(1.12)}
.pr-whdr{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:12.5px;color:#a9bdd3}
.pr-wnum{font-size:20px;font-weight:800;color:#00e0ff}
.pr-wb{background:#3a2a4a;color:#e0c8f5;border-radius:8px;padding:1px 8px;font-size:11.5px}
.pr-wq{font-size:13px;font-weight:600;color:#dbe8f6;margin:4px 0 6px}
.pr-wts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;align-items:center}
.pr-wt{background:#0f1824;border:2px solid #2d4060;color:#cfe3fa;border-radius:20px;padding:5px 12px;font-size:13px;cursor:pointer;transition:all .12s}
.pr-wts.sm .pr-wt{font-size:11.5px;padding:3px 9px;border-width:1.5px}
.pr-wt:hover{border-color:var(--c);transform:translateY(-1px)}
.pr-wt.on{background:var(--c);border-color:var(--c);color:#fff;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.pr-wt.on .pr-dot{border-color:#fff}
.pr-wrows{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.pr-wrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-right:4px solid;background:#132033;border-radius:6px;padding:6px 10px}
.pr-step{display:inline-flex;align-items:center;gap:3px}
.pr-step button{width:26px;height:26px;border-radius:50%;border:1px solid #3d6a9a;background:#1f3350;color:#fff;font-size:15px;cursor:pointer;line-height:1}
.pr-step input{width:44px;text-align:center;font-size:15px;font-weight:700;background:#0f1824;border:1px solid #2d4060;color:#fff;border-radius:6px;padding:2px}
.pr-wm{display:inline-flex;gap:3px;align-items:center}
.pr-wmb{background:#0f1824;border:1px solid #2d4060;color:#9ab;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:12px}
.pr-wmb.on{background:#3498db;border-color:#3498db;color:#fff;font-weight:700}
.pr-walt{display:block;font-size:12px;color:#a9bdd3;margin-top:8px;cursor:pointer}
.pr-wlive{margin-top:8px;min-height:6px}
.pr-wnav{display:flex;justify-content:space-between;align-items:center;margin-top:12px;border-top:1px solid #2d4060;padding-top:10px}
.pr-wdots{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.pr-wd{min-width:34px;padding:2px 5px;border-radius:6px;border:1.5px solid var(--c,#2d4060);background:#0f1824;color:#8fa6c0;font-size:11px;cursor:pointer}
.pr-wd.done{background:color-mix(in srgb,var(--c,#3aa06a) 35%,#0f1824);color:#fff}
.pr-wd.cur{outline:2px solid #00e0ff;color:#fff;font-weight:700}
.pr-wsplit{display:flex;flex-wrap:wrap;gap:16px;margin:6px 0 10px;font-size:13px}
.pr-covs{display:flex;flex-wrap:wrap;gap:8px}
.pr-covb{font-size:12px;padding:2px 8px;border-radius:8px;border:1px solid #2d4060}
.pr-covb.ok{border-color:#3aa06a}.pr-covb.bad{border-color:#c0892b}
body.theme-light .pr-wprog span{background:#fff;border-color:#bfccdb;color:#4a5d74}
body.theme-light .pr-wprog span.on{background:#dcebfb;border-color:#5a8fd0;color:#1a3560}
body.theme-light .pr-wcard{background:#fff;border-color:#bfccdb}
body.theme-light .pr-wcard.intro p{color:#2a3d52}
body.theme-light .pr-wbig,body.theme-light .pr-wq{color:#1a3560}
body.theme-light .pr-whdr{color:#4a5d74}
body.theme-light .pr-wnum{color:#0088aa}
body.theme-light .pr-wt{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .pr-wt.on{background:var(--c);border-color:var(--c);color:#fff}
body.theme-light .pr-wrow{background:#f4f7fb}
body.theme-light .pr-step input{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .pr-step button{background:#dcebfb;color:#1a3560;border-color:#8fb0d6}
body.theme-light .pr-wmb{background:#fff;color:#4a5d74;border-color:#bfccdb}
body.theme-light .pr-wmb.on{background:#3498db;color:#fff}
body.theme-light .pr-walt{color:#4a5d74}
body.theme-light .pr-wd{background:#fff;color:#4a5d74}
body.theme-light .pr-wd.done{background:color-mix(in srgb,var(--c,#3aa06a) 45%,#fff);color:#1a2535}
body.theme-light .pr-wb{background:#f1e6f8;color:#5b2c6f}
.pr-wold{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:8px}
.pr-offl{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:6px 0 3px}
.pr-offn{min-width:92px;font-size:12px;font-weight:600}
.pr-offd summary{cursor:pointer}
.pr-spc{display:flex;align-items:center;gap:4px;font-size:10.5px;color:#8fa6c0;margin-top:3px;white-space:nowrap;cursor:pointer}
.pr-docrow{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#18263a;border:1px solid #2d4060;border-radius:7px;margin-bottom:5px}
.pr-docname{font-weight:600;min-width:92px}
.pr-docfmt{font-size:10.5px;background:#2d2a45;color:#c4b5ff;border-radius:6px;padding:1px 6px}
.pr-docver{flex:1;font-size:11.5px;color:#a9bdd3}
.pr-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-left:6px;vertical-align:-1px;border:1px solid rgba(255,255,255,.5)}
.pr-in-s{width:62px!important;padding:3px 5px!important;font-size:12px!important;background:#0f1824;border:1px solid #2d4060;color:#e6eef8;border-radius:5px}
.pr-etbl td{vertical-align:middle}
.pr-exp{background:none;border:1px solid #2d4060;color:#9ab;border-radius:5px;cursor:pointer;padding:1px 7px}
.pr-edet td{background:#152234;padding:8px 10px!important}
.pr-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 10px}
.pr-st.keys{color:#7ecfff}
.pr-card{background:#18263a;border:1px solid #2d4060;border-radius:9px;padding:8px 10px;margin-bottom:8px}
.pr-card:hover{border-color:#4a7ab0}
.pr-card-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.pr-asum{margin-right:auto}
.pr-alloc{border:1px dashed #33506f;border-radius:7px;padding:6px 8px;margin-bottom:6px;background:#132033}
.pr-alloc.picking{border:2px solid #00c8e8;background:#0f2a3a}
.pr-arow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.pr-arow label{font-size:11.5px;color:#8fa6c0;display:inline-flex;align-items:center;gap:4px}
.pr-arow select{background:#0f1824;border:1px solid #2d4060;color:#e6eef8;border-radius:5px;padding:3px 5px;font-size:12px}
.pr-in-cells,.pr-in-note{flex:1;min-width:140px;background:#0f1824;border:1px solid #2d4060;color:#e6eef8;border-radius:5px;padding:3px 6px;font-size:12px}
.pr-chip{display:inline-flex;align-items:center;gap:3px;background:#243a57;border:1px solid #3d6a9a;border-radius:10px;padding:1px 8px;font-size:11.5px;direction:ltr;color:#fff}
.pr-chip button{background:none;border:none;color:#ffb3b3;cursor:pointer;font-size:10px;padding:0}
.pr-st.info{color:#9fb7d0}
.pr-exp{font-size:11px;white-space:nowrap}
.pr-alloc.alt{border-style:dotted;background:repeating-linear-gradient(135deg,transparent 0 7px,rgba(120,150,190,.07) 7px 9px),#132033}
.pr-atag{font-size:11.5px;color:#cfe3fa;margin-bottom:4px}
.pr-opts{gap:4px}
.pr-tog{background:#0f1824;border:1px solid #2d4060;color:#8fa6c0;border-radius:10px;padding:1px 8px 1px 4px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center}
.pr-tog .pr-dot{margin-left:4px;width:8px;height:8px}
.pr-tog.on{background:#1d3a57;border-color:#6aa6e0;color:#fff}
.pr-altlbl{margin-right:auto}
.pr-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:#8fa6c0;margin-bottom:8px}
.pr-legend i{display:inline-block;width:16px;height:11px;margin-left:4px;vertical-align:-1px;border:1.5px solid #3498db;border-radius:2px}
.pr-legend .lg-fill{background:rgba(52,152,219,.5)}
.pr-legend .lg-stripe{border-color:#e74c3c;background:repeating-linear-gradient(135deg,rgba(231,76,60,.7) 0 4px,rgba(241,196,15,.7) 4px 8px)}
.pr-legend .lg-alt{border-style:dashed;background:repeating-linear-gradient(135deg,transparent 0 4px,rgba(52,152,219,.8) 4px 5px)}
.pr-legend .lg-free{border:1.5px dashed #c0392b}
.pr-chips{display:flex;flex-wrap:wrap;gap:4px}
.pr-chip.free{border-style:dashed;border-color:#c0392b;background:#2a1a1a}
.pr-chip.used{background:#1d3a2b;border-color:#3aa06a}
.pr-chip.non{background:#2a2a33;border-color:#666;color:#bbb;text-decoration:line-through}
.pr-bsel{margin-right:auto;background:#0f1824;border:1px solid #6c4a8a;color:#e6eef8;border-radius:5px;padding:2px 5px;font-size:11.5px}
.pr-legend .lg-built{border:2.5px solid #3498db;box-shadow:0 0 0 1.5px #fff inset;background:transparent}
.pr-legend .lg-t5b{border:3px solid #8b5a2b}
.pr-btn.on{background:#00a6c8;border-color:#00c8e8;color:#fff}
.pr-pick{position:sticky;top:-12px;z-index:5;background:#0f3a4a;border:1px solid #00c8e8;border-radius:8px;padding:8px 10px;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pr-chk{font-size:11.5px;margin:2px 0;line-height:1.45}
.pr-chk.ok{color:#8fe0b5}.pr-chk.bad{color:#f5c35a}.pr-chk.i{color:#9ab}
.pr-cg{margin-bottom:10px}.pr-cg-h{font-weight:600;color:#cfe3fa;margin-bottom:3px;font-size:12.5px}
body.theme-light .pr-card,body.theme-light .pr-alloc,body.theme-light .pr-edet td{background:#fff;border-color:#bfccdb}
body.theme-light .pr-in-s,body.theme-light .pr-in-cells,body.theme-light .pr-in-note,body.theme-light .pr-arow select{background:#fff;color:#1c2b3c;border-color:#bfccdb}
body.theme-light .pr-chk.ok{color:#1e7a4a}body.theme-light .pr-chk.bad{color:#9a6400}
body.theme-light .pr-cg-h{color:#1a3560}
body.theme-light .pr-chk.i,body.theme-light .pr-st.info{color:#4a6380}
body.theme-light .pr-alloc.alt{background:repeating-linear-gradient(135deg,transparent 0 7px,rgba(60,90,130,.06) 7px 9px),#fff}
body.theme-light .pr-atag{color:#1a3560}
body.theme-light .pr-tog{background:#fff;border-color:#bfccdb;color:#4a5d74}
body.theme-light .pr-tog.on{background:#dcebfb;border-color:#5a8fd0;color:#1a3560}
body.theme-light .pr-legend{color:#4a5d74}
body.theme-light .pr-bsel{background:#fff;color:#1c2b3c}
body.theme-light .pr-exp{color:#4a5d74;border-color:#bfccdb}
body.theme-light .pr-docrow{background:#fff;border-color:#bfccdb}
body.theme-light .pr-docver{color:#4a5d74}
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

// הגנה: נתונים שהוזנו לתוכנית אחרת (למשל משארית מגרסה קודמת) — מציעים לשמור אותם בשם התוכנית ההיא ולנקות
const _normPN=v=>String(v||'').replace(/^תו?כנית\s*/,'').replace(/\s+/g,'').trim();
function _curPlanNumber(){ try{ return (typeof _projPlanNumber==='function'&&_projPlanNumber())||''; }catch(e){ return ''; } }
function _mismatchBanner(){
  const I=PR.spec.identity||{}, cur=_curPlanNumber();
  if(!I.plan_number||!cur||_normPN(I.plan_number)===_normPN(cur)) return '';
  return `<div class="pr-pick" style="background:#3a2a10;border-color:#f0b429">⚠ הנתונים כאן הוזנו לתוכנית <b>${E(I.plan_number)}</b>, אבל טעונה עכשיו <b>${E(cur)}</b>.
    <button class="pr-btn" onclick="PR.stashForeign()">שמור אותם כפרויקט "${E(I.plan_number)}" ונקה</button>
    <button class="pr-btn" onclick="PR.clearSpec()">נקה בלי לשמור</button></div>`;
}
PR.clearSpec=function(){ PR.spec=emptySpec(); PR.pick=null; _prefillIdentity(); PR.render(); safeRedraw(); };
PR.stashForeign=async function(){
  const spec=JSON.parse(JSON.stringify(PR.spec));
  try{ if(typeof _projSaveForeignSpec==='function') await _projSaveForeignSpec(spec); }catch(e){ alert('השמירה נכשלה: '+e.message); return; }
  PR.clearSpec();
};
PR.setDomain=function(d){ PR.domain=d; PR.render(); };
PR.setTab=function(t){
  PR.tab=t;
  // בלשונית "תא אחר תא" — לחיצה על תא במפה קופצת אליו
  if(t==='walk'){ if(!PR.pick||PR.pick==='__walk'){ PR.pick='__walk'; try{ wrap.style.cursor='pointer'; }catch(e){} } }
  else if(PR.pick==='__walk'){ PR.pick=null; try{ wrap.style.cursor=''; }catch(e){} }
  PR.render(); safeRedraw();
  if(t==='walk'){ const w=_walk(); if(w.cur) PR.walkFocus(w.cur); }
};

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
PR.setSpecial=function(id,on){ const g=PR.spec.assumptions.segments.find(x=>x.id===id); if(!g) return; g.special=!!on; if(on&&!g.label) g.label='דיור מיוחד'; PR.render(); };
PR.addSegment=function(){ PR.spec.assumptions.segments.push(newSegment('')); PR.render(); };
PR.delSegment=function(id){
  const a=PR.spec.assumptions;
  if(a.segments.length<=1) return;
  a.segments=a.segments.filter(s=>s.id!==id); PR.render();
};

// ── רינדור ──
PR.render=function(){
  if(!$('pr-panel')) return;
  if(PR.tab==='supply') PR.tab='walk'; // "מענה ושיבוץ" אוחדה לתוך "תא אחר תא"
  $('pr-domains').innerHTML=DOMAINS.map(d=>{
    const soon=(d.id==='edu'||d.id==='all')?'':'<span class="soon">חלקי</span>';
    return `<button class="pr-dom${PR.domain===d.id?' on':''}" onclick="PR.setDomain('${d.id}')">${d.icon} ${E(d.label)}${soon}</button>`;
  }).join('');
  $('pr-tabs').innerHTML=TABS.map(t=>`<button class="pr-tab${PR.tab===t.id?' on':''}" onclick="PR.setTab('${t.id}')">${E(t.label)}</button>`).join('');
  const body=$('pr-body');
  const sc=body.scrollTop;
  const eduDom=PR.domain==='edu'||PR.domain==='all';
  body.innerHTML=_mismatchBanner()+(PR.tab==='assump'?_renderAssump():PR.tab==='demand'?_renderDemand()
    :PR.tab==='walk'?(eduDom?_renderWalk():_renderSoon('supply'))
    :PR.tab==='checks'?(eduDom?_renderChecks():_renderSoon('checks')):'');
  body.scrollTop=sc;
  _refreshComputed(); _refreshEdu(); _refreshSupply();
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
      <td>${_inp('seg:'+g.id+':label',g.label,'t','תווית')}
        <label class="pr-spc" title="דיור מוגן / מיוחד: התושבים נספרים לשטחים פתוחים ולמוסדות ציבור כלליים, אך לא לחינוך"><input type="checkbox" ${g.special?'checked':''} onchange="PR.setSpecial('${g.id}',this.checked)"> דיור מיוחד (ללא ילדים)</label></td>
      <td>${_inp('seg:'+g.id+':units',g.units,'n')}</td>
      <td>${_inp('seg:'+g.id+':realization_pct',g.realization_pct,'n',String(a.realization_default??100))}</td>
      <td>${_inp('seg:'+g.id+':household_size',g.household_size,'n')}</td>
      <td>${g.special?'<span class="pr-small" title="דיור מיוחד — לא נספר לחינוך">— אין ילדים</span>':_inp('seg:'+g.id+':cohort_pct',g.cohort_pct,'n')}</td>
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
    <tr data-out-row="spc"><td colspan="${7+span}" class="pr-small" data-out="T-special"></td></tr>
    <tr class="pr-decl"><td>תוצאות הנספח <div class="pr-small">לא חובה — לבדיקת החשבון של היועץ</div></td>
      <td></td><td></td><td></td>
      <td class="pr-small" style="text-align:left">מה הנספח קיבל ←</td>
      ${span?'<td></td>':''}
      <td>${_inp('assumptions.declared.population',D.population,'n')}<div data-out="st-pop"></div></td>
      <td>${_inp('assumptions.declared.cohort_count',D.cohort_count,'n')}<div data-out="st-coh"></div></td><td></td></tr>`;

  const segs=`<div class="pr-sec"><h3>הנחות מוצא — מקטעים
      <span class="pr-hint">מקטע אחד = מספר אחיד לכל התכנית. הוסיפו מקטעים אם הנספח מפצל (גודל דירה, חדרים, כללי/חרדי, דיור מוגן, רשות)</span></h3>
    <table class="pr-tbl">${head}${rows}${tot}</table>
    <div data-out="addition" class="pr-small" style="margin-top:6px"></div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <button class="pr-btn" onclick="PR.addSegment()">+ מקטע</button>
      <span class="pr-small">אחוז מימוש ריק = 100%. ילדים בשנתון = אוכלוסייה × שנתון%. דיור מוגן/מיוחד — מקטע נפרד עם ☑ "דיור מיוחד".</span>
    </div></div>`;

  // "שרשרת ההנחות" הוסרה — טבלת המקטעים כבר מציגה יח"ד → אוכלוסייה → ילדים בשנתון (הערת המשתמש)
  return _renderPlanDocs()+idh+ctx+segs;
}

// מסמכי התוכנית שנמשכו מ"מידע תכנוני" (דרך התוסף) — לפתיחה לצד התשריט בזמן ההזנה
function _renderPlanDocs(){
  if(typeof state==='undefined') return '';
  const md=state.mavatDocs||{};
  const has=k=>k==='takanon'?!!((state.files.takanon&&state.files.takanon.length)||(state.files.word&&state.files.word.length))
    :!!(state.files[k]&&state.files[k].length);
  const row=(k,label)=>{
    const m=md[k]||{};
    if(!has(k)) return `<div class="pr-docrow"><span class="pr-docname">${label}</span><span class="pr-small">לא נטען</span></div>`;
    const f=(k==='takanon'?(state.files.takanon||state.files.word):state.files[k])[0];
    const hasW=k==='takanon'&&state.files.word&&state.files.word.length, hasP=k!=='takanon'||(state.files.takanon&&state.files.takanon.length);
    const fmt=k==='takanon'?[hasP?'PDF':'',hasW?'DOC':''].filter(Boolean).join(' · '):(m.format||f.name.split('.').pop()||'').toUpperCase();
    const ver=m.set?`${E(m.set)}${m.date?' · '+E(m.date):''}${m.versions>1?` <span class="pr-src calc" title="באתר נמצאו ${m.versions} גרסאות — נבחרה האחרונה">האחרונה מתוך ${m.versions}</span>`:''}`:'<span class="pr-small">נטען ידנית</span>';
    return `<div class="pr-docrow"><span class="pr-docname">${label}</span><span class="pr-docfmt">${E(fmt)}</span>
      <span class="pr-docver">${ver}${k==='takanon'&&!hasW&&m.set?' <span class="pr-small">(Word לא קיים באתר)</span>':''}</span>
      ${hasP?`<button class="pr-btn" onclick="openPlanDoc('${k}')">${/^PDF/.test(fmt)||k==='takanon'?'פתח':'הורד'}</button>`:''}
      ${hasW?`<button class="pr-btn" onclick="openPlanDoc('word')" title="הורדת קובץ ה-Word של התקנון">⬇ Word</button>`:''}</div>`;
  };
  // הקישור עצמו נמצא בעת הלחיצה (_resolveMavatUrl) — גם לתוכנית שנטענה מקובצי SHP
  const canFetch=typeof _bridgeVersion==='function'&&_bridgeVersion()&&typeof _planNumberForMavat==='function'
    &&(_planMavatUrl()||_planNumberForMavat()||(state.layers&&state.layers.gvul));
  const missing=['takanon','prog'].filter(k=>!has(k));
  const fetchBtn=canFetch?`<button class="pr-btn" onclick="_mavatFetchDocs(${E(JSON.stringify(missing.length?missing:['takanon','prog']))})">⟳ ${missing.length?'משוך מ"מידע תכנוני"':'משוך שוב (בדיקת גרסה חדשה)'}</button>`
    :`<span class="pr-small">למשיכה אוטומטית מ"מידע תכנוני" — התקינו את התוסף לכרום (בעמוד הפתיחה)</span>`;
  return `<div class="pr-sec"><h3>מסמכי התוכנית <span class="pr-hint">הנספח והתקנון — לפתיחה לצד התשריט בזמן ההזנה</span></h3>
    ${row('prog','נספח פרוגרמה')}${row('takanon','תקנון')}
    <div style="margin-top:6px">${fetchBtn}</div></div>`;
}

function _refreshComputed(){
  const body=$('pr-body'); if(!body) return;
  const A=computeAssumptions(PR.spec);
  const set=(k,html)=>{ const el=body.querySelector(`[data-out="${k}"]`); if(el) el.innerHTML=html; };
  for(const r of A.rows){ set('seg-pop-'+r.id,fmtN(r.pop)); set('seg-coh-'+r.id,fmtN(r.coh,r.coh!=null&&r.coh<100?1:0)); }
  const T=A.T;
  set('T-special',T.special?`<b>+ דיור מיוחד:</b> ${fmtN(T.special.units)} יח"ד · ${fmtN(T.special.pop)} נפש — לא נספרים לחינוך. <b>סה"כ תושבים לצורכי ציבור כלליים ושטחים פתוחים: ${fmtN(T.popAll)}</b> (${fmtN(T.unitsAll)} יח"ד)`:'');
  for(const r of A.rows) if(r.special) set('seg-coh-'+r.id,'<span title="דיור מיוחד — לא נספר לחינוך">0</span>');
  set('T-units',fmtN(T.units)); set('T-pop',fmtN(T.pop)); set('T-coh',fmtN(T.coh,T.coh!=null&&T.coh<100?1:0));
  set('T-hh',T.hh!=null?fmtN(T.hh,2):'—'); set('T-cp',T.cp!=null?fmtN(T.cp,2)+'%':'—');
  const D=PR.spec.assumptions.declared;
  const st=(k,decl,comp,kind)=>{
    const c=compare(decl,comp,kind);
    set('st-'+k,c.status==='ok'?'<span class="pr-st ok">✓ תואם</span>'
      :c.status==='diff'?`<span class="pr-st diff" title="החישוב מההנחות: ${E(fmtN(comp,kind?2:0))}">⚠ פער ${E(fmtN(c.diff,kind?2:0))}</span>`:'');
  };
  // רק התוצאות (אוכלוסייה, ילדים בשנתון) — את ההנחות עצמן מקלידים מהנספח בשורות המקטעים, אין מה להשוות
  st('pop',D.population,T.pop); st('coh',D.cohort_count,T.coh);
  // שרשרת
  const nd=(l,v,hi)=>`<div class="pr-node${hi?' hi':''}"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const ar=t=>`<div class="pr-arr"><div>${t}</div><div>◀</div></div>`;
  let ch=nd('יח"ד',fmtN(T.units));
  if(T.unitsR!=null&&T.units!=null&&Math.abs(T.unitsR-T.units)>0.5){ ch+=ar('× מימוש')+nd('מתממשות',fmtN(T.unitsR)); }
  ch+=ar(`× ${T.hh!=null?fmtN(T.hh,2):'?'} נפשות`)+nd('אוכלוסייה',fmtN(T.pop));
  ch+=ar(`× ${T.cp!=null?fmtN(T.cp,2):'?'}%`)+nd('ילדים בשנתון',fmtN(T.coh,1),true);
  if(T.special) ch+=`<div class="pr-arr"><div>+</div></div>`+nd('דיור מיוחד (לא לחינוך)',`${fmtN(T.special.units)} יח"ד · ${fmtN(T.special.pop)} נפש`)+`<div class="pr-arr"><div>=</div></div>`+nd('תושבים לצורכי ציבור',fmtN(T.popAll));
  set('chain',ch);
  set('addition',A.addition?`בסיס תוספת: ${fmtN(A.addition.units)} יח"ד · ${fmtN(A.addition.pop)} נפש · ${fmtN(A.addition.coh,1)} ילדים בשנתון (אחרי קיזוז יח"ד קיימות)`:'');
}

// ════════════════════════════════════════════════════════════════════════════
// שלב א — 🎓 חינוך: "הנספח אומר" · מענה ושיבוץ בתשריט · טבלה 5 · רדיוסי שירות
// ════════════════════════════════════════════════════════════════════════════
const MODEL_OPTS=[['','—'],['A','A'],['B','B'],['C','C'],['model_1','דגם 1'],['model_2','דגם 2'],['vertical','ורטיקלי']];
const ALLOC_MODES=[
  ['land','קרקע חומה'],['built','הפרשה מבונה'],['combined','בשילוב במוסד אחר'],['outside','מחוץ לתכנית'],['none','לא ניתן מענה'],
];
const ALLOC_MODE_LABEL=Object.fromEntries(ALLOC_MODES);
const safeRedraw=()=>{ try{ (typeof scheduleRedraw==='function'?scheduleRedraw:redraw)(); }catch(e){} };

function _dem(id){ const D=PR.spec.demand||(PR.spec.demand={}); return D[id]||(D[id]={declared:{},keys:{}}); }
function _eduLines(){ return eduDemand(PR.spec,computeAssumptions(PR.spec)); }
// הסוגים שהקצאה משרתת (אשכול משותף = יותר מסוג אחד)
function aLines(a){ return Array.isArray(a.lines)&&a.lines.length?a.lines:[a.line]; }
const isShared=a=>aLines(a).length>1;
function _allocsOf(lineId){ return (PR.spec.provision||[]).filter(p=>aLines(p).includes(lineId)); }
function _lineShortById(id,lines){ const L=(lines||_eduLines()).find(l=>l.id===id)||{id,inst:''}; return eduShort(L); }
function _allocLabel(a,lines){ return aLines(a).map(id=>_lineShortById(id,lines)).join('+'); }
// "2 כיתות גן" / "כיתת גן אחת" / "מעון/גן" — לתגיות בתשריט ולחלונית הריחוף (withN=false: בלי מספר, למשל מענה שמתפרס על כמה תאים)
function _classesLabel(a,lines,withN){
  const nm=_allocLabel(a,lines).replace(/\+/g,'/'), n=num(a.classes);
  if(!n||withN===false) return nm;
  return n===1?`כיתת ${nm} אחת`:`${fmtN(n)} כיתות ${nm}`;
}
// קבוצות של סוגים שמחוברים באשכולות משותפים (למשל {מעון, גן}) — לבדיקת שטח משותפת
function sharedGroups(){
  const prov=PR.spec.provision||[]; const parent={};
  const f=x=>parent[x]===x?x:(parent[x]=f(parent[x]));
  for(const a of prov) if(isShared(a)){ const ls=aLines(a); ls.forEach(l=>{ if(!parent[l]) parent[l]=l; }); ls.slice(1).forEach(l=>{ parent[f(l)]=f(ls[0]); }); }
  const g={}; for(const l of Object.keys(parent)) (g[f(l)]=g[f(l)]||[]).push(l);
  return Object.values(g).map(lines=>({lines,allocs:prov.filter(a=>aLines(a).some(l=>lines.includes(l)))}));
}
function _stHtml(s){
  const sg=v=>(v>0?'+':'')+fmtN(v);
  return s.status==='ok'?'<span class="pr-st ok">✓ תואם</span>'
    :s.status==='margin'?`<span class="pr-st ok" title="מעט מעל התדריך — מרווח ביטחון מקובל">✓ ${sg(s.diff)} מרווח ביטחון</span>`
    :s.status==='keys'?`<span class="pr-st keys" title="תואם לחישוב לפי מפתח היועץ, אך שונה מהתדריך">✓ לפי מפתח היועץ · ${sg(s.diff)} מהתדריך</span>`
    :s.status==='surplus'?`<span class="pr-st info" title="עודף של יותר מ-${MARGIN*100}% מעל התדריך — לא בהכרח בעיה, כדאי להבין למה">ℹ ${sg(s.diff)} עודף ניכר (${fmtN(s.pct,0)}%)</span>`
    :s.status==='diff'?`<span class="pr-st diff">⚠ ${sg(s.diff)} — חסר מול התדריך</span>`:'';
}
function _alloc(id){ return (PR.spec.provision||[]).find(p=>p.id===id); }
let _aSeq=0;

// ── עזרי תאי שטח (מהתשריט הטעון) ──
let _cellIdx={}, _cellIdxSrc=null;
function cellIndex(){
  const fs=typeof state!=='undefined'&&state.layers&&state.layers.plan&&state.layers.plan.features;
  if(!fs) return {};
  if(_cellIdxSrc===fs) return _cellIdx;
  const m={};
  for(const f of fs){ const n=f.properties&&f.properties.NUM; if(n==null||n===''||!f.geometry) continue; (m[String(n)]=m[String(n)]||[]).push(f); }
  _cellIdx=m; _cellIdxSrc=fs; return m;
}
function cellLandUse(fs){
  const p=fs[0].properties; let n=p.MAVAT_NAME||'';
  try{ n=fixHebrew(n); }catch(e){}
  try{ const st=getStyle(p.MAVAT_CODE); if(st&&st.name&&st.name!=='אחר') n=st.name; }catch(e){}
  return String(n);
}
const isPublicCell=fs=>fs&&/מבנים ומוסדות ציבור/.test(cellLandUse(fs));
const isResidentialCell=fs=>fs&&/מגורים/.test(cellLandUse(fs));
function cellAreaM2(fs){
  return fs.reduce((t,f)=>{
    if(typeof _featureAreaM2==='function'){ const a=_featureAreaM2(f); if(a>0) return t+a; }
    const p=f.properties; return t+(+p.SHAPE_AREA>0?+p.SHAPE_AREA:(+p.LEGAL_AREA>0?+p.LEGAL_AREA*1000:0));
  },0);
}
function ringCentroid(r){
  let a=0,cx=0,cy=0;
  for(let i=0,j=r.length-1;i<r.length;j=i++){ const f=r[j][0]*r[i][1]-r[i][0]*r[j][1]; a+=f; cx+=(r[j][0]+r[i][0])*f; cy+=(r[j][1]+r[i][1])*f; }
  if(Math.abs(a)<1e-9){ let sx=0,sy=0; r.forEach(p=>{sx+=p[0];sy+=p[1];}); return [sx/r.length,sy/r.length]; }
  return [cx/(3*a),cy/(3*a)];
}
function cellCentroid(fs){
  let best=null,ba=-1;
  for(const f of fs){ const g=f.geometry; const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    for(const p of polys){ const r=p[0]; let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=r[j][0]*r[i][1]-r[i][0]*r[j][1]; if(Math.abs(a)>ba){ba=Math.abs(a);best=r;} } }
  return best?ringCentroid(best):null;
}
function t5Of(cn){ if(typeof state==='undefined'||!state.table5) return null; return state.table5[String(cn)]||state.table5[String(+cn)]||[]; }
function t5Units(cn){ const r=t5Of(cn); return r?r.reduce((t,x)=>t+(num(x.yihud)||0),0):0; }
// יחס קבוע בין "גודל מגרש" בטבלה 5 לשטח הפוליגון בתשריט (בבית שאן: 0.900 בכל התאים) —
// מוסכמה של הטבלה, לא טעות. מזהים אותו פעם אחת (חציון), ומתריעים רק על תא שחורג ממנו.
let _t5RatioSrc=null,_t5Ratio=null;
function t5AreaRatio(){
  if(typeof state==='undefined'||!state.table5) return null;
  if(_t5RatioSrc===state.table5) return _t5Ratio;
  const idx=cellIndex(), rs=[];
  for(const [k,fs] of Object.entries(idx)){ const r=t5Of(k); const mg=r&&r.length?num(r[0].magras):null; const ar=cellAreaM2(fs); if(mg&&ar) rs.push(mg/ar); }
  rs.sort((a,b)=>a-b);
  _t5Ratio=rs.length>=3?rs[Math.floor(rs.length/2)]:null; _t5RatioSrc=state.table5;
  return _t5Ratio;
}

// בדיקת תא מול טבלה 5 לפי אופן המענה
function t5CellCheck(cn,mode){
  const rows=t5Of(cn);
  if(rows==null) return null; // טבלה 5 לא נטענה
  if(!rows.length) return {ok:false,txt:`תא ${cn} לא מופיע בטבלה 5`};
  if(mode==='land'){
    const pub=rows.some(r=>/ציבור/.test(r.yiud||''));
    return {ok:pub,txt:pub?`תא ${cn}: ייעוד "${rows[0].yiud}" בטבלה 5`:`תא ${cn}: בטבלה 5 הייעוד הוא "${rows[0].yiud}" — לא ציבורי`};
  }
  if(mode==='built'){
    const pr=rows.filter(isPubUseRow);
    const sqm=t5PublicSqm(rows);
    return pr.length?{ok:true,sqm,txt:`תא ${cn}: שימוש "מבנים ומוסדות ציבור" — ${fmtN(sqm)} מ"ר`}
      :{ok:false,txt:`תא ${cn}: אין בטבלה 5 שימוש ציבורי בתא הזה`};
  }
  return null;
}
// שורת "מבנים ומוסדות ציבור" בטבלה 5. השטח: עיקרי+שירות מעל הקרקע, ואם ריקים — "סה"כ מעל הקרקע"
// (בתמ"ל 3006 רק העמודה הכוללת מולאה)
const isPubUseRow=r=>/מבנים ומוסדות ציבור/.test(r.shimush||'');
function t5PublicSqm(rows){
  return (rows||[]).filter(isPubUseRow).reduce((t,r)=>{ const a=(num(r.ikariMal)||0)+(num(r.sherutMal)||0); return t+(a>0?a:(num(r.kollMal)||0)); },0);
}
// סריקת טבלה 5: שטחי ציבור מבונים במגרשים סחירים (מגורים / תעסוקה / מסחר…)
function builtScan(){
  if(typeof state==='undefined'||!state.table5) return null;
  const out=[];
  for(const [cn,rows] of Object.entries(state.table5)){
    if(!rows||!rows.some(isPubUseRow)) continue;
    const yiud=(rows[0].yiud||'').trim();
    if(/ציבור/.test(yiud)) continue; // קרקע חומה — לא הפרשה מבונה
    out.push({cn:String(cn),yiud,sqm:t5PublicSqm(rows),units:rows.reduce((t,r)=>t+(num(r.yihud)||0),0)});
  }
  return out.sort((a,b)=>(+a.cn)-(+b.cn));
}

// בדיקות להקצאה אחת: שטח התאים מול הדגם, טבלה 5, מבונה מול טבלה 5
function allocChecks(a,line){
  const out=[]; const idx=cellIndex();
  if(!a.cells||!a.cells.length){
    if(a.mode==='land'||a.mode==='built') out.push({ok:false,txt:'עוד לא שובץ לתא שטח'});
    return out;
  }
  const missing=a.cells.filter(c=>!idx[c]);
  if(missing.length) out.push({ok:false,txt:`תאים שלא קיימים בתשריט: ${missing.join(', ')}`});
  if(a.mode==='land'){
    const area=a.cells.filter(c=>idx[c]).reduce((t,c)=>t+cellAreaM2(idx[c]),0)/1000;
    const cls=num(a.classes), ln=line&&!isShared(a)?landNeed(line.id,cls,a.model,line):null;
    const co=(PR.spec.provision||[]).filter(o=>o!==a&&o.mode==='land'&&o.cells.some(c=>a.cells.includes(c)));
    if(co.length){ // כמה מוסדות באותו תא — השטח נבדק לתא כולו (סכום המכסות)
      for(const c of a.cells.filter(c=>idx[c])){ const cc=cellLandCheck(c); if(cc) out.push(cc); }
    } else if(cls&&ln){
      const need=ln.d, ev=evalSupply(area,need,need*0.03);
      const base=`שטח ${a.cells.length>1?'התאים':'התא'} ${fmtN(area,1)} ד׳ · נדרש לפי התדריך: ${ln.f}`;
      out.push(ev.cls==='short'?{ok:false,txt:base+' — חסר'}
        :ev.cls==='surplus'?{info:true,txt:base+` — עודף ניכר (${fmtN(ev.pct,0)}%)`}
        :{ok:true,txt:base+(ev.cls==='margin'?` — מרווח ביטחון (+${fmtN(ev.pct,0)}%)`:'')});
    } else out.push({info:true,txt:`שטח התאים ${fmtN(area,1)} ד׳`+(cls&&!a.model&&!isShared(a)&&/ספר/.test(line?line.inst:'')?' · בחרו דגם להשוואה לתדריך':'')});
    // שטח שהנספח מציין מול שטח התאים בתשריט: תשריט גדול מעט = תקין (התא שיצא); תשריט קטן = ⚠
    const decl=num(a.land);
    if(decl!=null){ const ev=evalSupply(area,decl,Math.max(0.2,decl*0.03));
      if(ev.cls==='short') out.push({ok:false,txt:`הנספח מציין ${fmtN(decl,1)} ד׳, אך שטח התאים בתשריט רק ${fmtN(area,1)} ד׳`});
      else if(ev.cls==='surplus') out.push({info:true,txt:`שטח התאים בתשריט (${fmtN(area,1)} ד׳) גדול בהרבה מהמצוין בנספח (${fmtN(decl,1)} ד׳)`});
      else if(ev.cls==='margin') out.push({ok:true,txt:`שטח התאים בתשריט ${fmtN(area,1)} ד׳ — מעט יותר מהמצוין בנספח (${fmtN(decl,1)} ד׳)`}); }
    // מסכמים: שורה אחת כשהכל תקין, ופירוט רק לתאים הבעייתיים
    const cells=a.cells.filter(c=>idx[c]);
    const notPub=cells.filter(c=>!isPublicCell(idx[c]));
    for(const c of notPub) out.push({ok:false,txt:`תא ${c} בתשריט: "${cellLandUse(idx[c])}" — לא קרקע חומה`});
    const t5=cells.map(c=>t5CellCheck(c,'land')).filter(Boolean);
    const t5bad=t5.filter(t=>!t.ok);
    if(t5.length&&!t5bad.length) out.push({ok:true,txt:`טבלה 5: ${t5.length>1?`כל ${t5.length} התאים`:'התא'} בייעוד מבנים ומוסדות ציבור`});
    out.push(...t5bad);
    const ratio=t5AreaRatio();
    for(const c of cells){
      const r=t5Of(c); const mg=r&&r.length?num(r[0].magras):null; const ar=cellAreaM2(idx[c]);
      if(!mg||!ar) continue;
      const exp=ar*(ratio||1);
      if(Math.abs(mg-exp)>Math.max(50,exp*0.03)) out.push({ok:false,txt:`תא ${c}: גודל המגרש בטבלה 5 ${fmtN(mg)} מ"ר, בתשריט ${fmtN(ar)} מ"ר${ratio&&Math.abs(ratio-1)>0.02?` (בשאר התוכנית היחס קבוע: ${ratio.toFixed(3)})`:''}`});
    }
  }
  if(a.mode==='built'){
    let sum=0,any=false; const good=[],bad=[];
    for(const c of a.cells){ const t=t5CellCheck(c,'built'); if(!t) continue; if(t.ok){ sum+=t.sqm; any=true; good.push(t); } else bad.push(t); }
    // מסכמים: שורה אחת לכל התאים התקינים, פירוט רק לבעייתיים
    if(good.length===1) out.push(good[0]);
    else if(good.length>1) out.push({ok:true,txt:`טבלה 5: שימוש ציבורי בכל ${good.length} התאים — סה"כ ${fmtN(sum)} מ"ר`});
    out.push(...bad);
    const decl=num(a.built);
    if(decl!=null&&any){ const ev=evalSupply(sum,decl,Math.max(10,decl*0.03));
      out.push(ev.cls==='short'?{ok:false,txt:`הנספח: ${fmtN(decl)} מ"ר מבונה; בטבלה 5 בתאים אלה רק ${fmtN(sum)} מ"ר`}
        :ev.cls==='ok'?{ok:true,txt:`המבונה בנספח (${fmtN(decl)} מ"ר) תואם לטבלה 5`}
        :{ok:ev.cls==='margin',info:ev.cls==='surplus',txt:`בטבלה 5 ${fmtN(sum)} מ"ר — יותר מהמצוין בנספח (${fmtN(decl)} מ"ר)`}); }
    // הערכת כיתות מהמבונה — רק אם הוזן מפתח מ"ר לכיתה (מהנספח/התדריך)
    const per=num(a.sqmPerClass), cls=num(a.classes), base=decl??(any?sum:null);
    if(per&&base){ const est=base/per;
      out.push(cls?{ok:est>=cls-0.5,txt:`${fmtN(base)} מ"ר ÷ ${fmtN(per)} מ"ר לכיתה ≈ ${fmtN(est,1)} כיתות · בנספח ${fmtN(cls)}${est<cls-0.5?' — המבונה לא מספיק':''}`}
        :{info:true,txt:`${fmtN(base)} מ"ר ÷ ${fmtN(per)} מ"ר לכיתה ≈ ${fmtN(est,1)} כיתות`}); }
  }
  return out;
}
const chk=c=>`<div class="pr-chk ${c.info?'i':c.ok?'ok':'bad'}">${c.info?'ℹ':c.ok?'✓':'⚠'} ${E(c.txt)}</div>`;

// ── לשונית ביקוש ──
PR.expanded=PR.expanded||{};
PR.toggleExp=function(id){ PR.expanded[id]=!PR.expanded[id]; PR.render(); };
PR.onDem=function(el){
  const [id,grp,f]=el.dataset.d.split('.');
  const d=_dem(id); d[grp]=d[grp]||{}; d[grp][f]=el.value===''?null:el.value;
  if(el.tagName==='SELECT') PR.render(); else _refreshEdu();
};
function _eduDemandTable(lines){
  const rows=lines.map(L=>{
    const d=_dem(L.id), dc=d.declared||{}, k=d.keys||{}, open=!!PR.expanded[L.id];
    const meta=EDU_META[eduBase(L.id)]||{};
    const isSchool=/ספר/.test(L.inst);
    return `<tr class="pr-erow">
        <td><span class="pr-dot" style="background:${meta.color}"></span>${E(eduShort(L))}</td>
        <td class="num" title="${E(L.formula)}"><b>${fmtN(L.classesRounded)}</b> <span class="pr-small">(${fmtN(L.classes,1)})</span></td>
        <td><input class="pr-in-s" data-d="${L.id}.declared.classes" value="${E(dc.classes??'')}" oninput="PR.onDem(this)" placeholder="כיתות"></td>
        <td data-out="est-${L.id}"></td>
        <td><button class="pr-exp" onclick="PR.toggleExp('${L.id}')" title="פרטים (לא חובה): שטח, דגם, מפתח היועץ">פרטים ${open?'▴':'▾'}</button></td>
      </tr>
      <tr class="pr-edet"${open?'':' style="display:none"'}><td colspan="5">
        <div class="pr-grid3">
          <div class="pr-f"><label>מוסדות (הנספח)</label><input data-d="${L.id}.declared.institutions" value="${E(dc.institutions??'')}" oninput="PR.onDem(this)"></div>
          <div class="pr-f"><label>שטח קרקע (ד׳)</label><input data-d="${L.id}.declared.land" value="${E(dc.land??'')}" oninput="PR.onDem(this)"></div>
          <div class="pr-f"><label>דגם</label><select data-d="${L.id}.declared.model" onchange="PR.onDem(this)">${MODEL_OPTS.map(([v,l])=>`<option value="${v}"${(dc.model||'')===v?' selected':''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="pr-small" style="margin:6px 0 3px">מפתח היועץ — אם הנספח חישב אחרת מהתדריך (ריק = כמו בתדריך):</div>
        <div class="pr-grid3">
          <div class="pr-f"><label>שיעור ביקוש %</label><input data-d="${L.id}.keys.rate" value="${E(k.rate??'')}" placeholder="${Math.round(L.rate*100)}" oninput="PR.onDem(this)"></div>
          <div class="pr-f"><label>שכבות גיל</label><input data-d="${L.id}.keys.grades" value="${E(k.grades??'')}" placeholder="${L.grades}" oninput="PR.onDem(this)"></div>
          <div class="pr-f"><label>תלמידים בכיתה</label><input data-d="${L.id}.keys.perClass" value="${E(k.perClass??'')}" placeholder="${L.perClass}" oninput="PR.onDem(this)"></div>
        </div>
        <div data-out="edet-${L.id}" class="pr-small" style="margin-top:6px"></div>
        <div class="pr-small">תדריך: ${E(L.formula)}${isSchool?'':''}</div>
      </td></tr>`;
  }).join('');
  return `<table class="pr-tbl pr-etbl"><tr><th>מוסד</th><th>לפי התדריך</th><th>הנספח אומר</th><th>השוואה</th><th></th></tr>${rows}</table>`;
}
function _refreshEdu(){
  const body=$('pr-body'); if(!body) return;
  const set=(k,h)=>{ const el=body.querySelector(`[data-out="${k}"]`); if(el) el.innerHTML=h; };
  const lines=_eduLines(); let ok=0,warn=0,info=0,landSum=0,landAny=false;
  for(const L of lines){
    const d=_dem(L.id), s=eduRowStatus(L,d);
    set('est-'+L.id,_stHtml(s));
    if(s.status==='ok'||s.status==='margin'||s.status==='keys') ok++; else if(s.status==='surplus') info++; else if(s.status==='diff') warn++;
    const dc=d.declared||{}; const lines2=[];
    const kc=keysClasses(L,d.keys);
    if(kc.any) lines2.push(`לפי מפתח היועץ: ${fmtN(L.coh,1)} × ${L.share!==1?L.share+' × ':''}${Math.round(kc.rate*100)}% × ${kc.grades} ÷ ${kc.perClass} = <b>${fmtN(kc.classes,1)}</b> כיתות`);
    const cls=num(dc.classes)??L.classesRounded, dpc=dunamPerClass(L.inst,L.stream,dc.model);
    if(dpc) lines2.push(`שטח לפי ${dc.model.replace('model_','דגם ')} בתדריך: ${fmtN(cls)} × ${dpc} = <b>${fmtN(cls*dpc,1)}</b> ד׳`+(num(dc.land)!=null?` · בנספח ${fmtN(num(dc.land),1)} ד׳`:''));
    if(num(dc.land)!=null){ landSum+=num(dc.land); landAny=true; }
    set('edet-'+L.id,lines2.join('<br>'));
  }
  set('edu-sum',`${ok?`<span class="pr-st ok">✓ ${ok} תקינות</span> `:''}${info?`<span class="pr-st info">ℹ ${info} בעודף ניכר</span> `:''}${warn?`<span class="pr-st diff">⚠ ${warn} בחוסר</span> `:''}${landAny?` · סה"כ שטח חינוך בנספח: <b>${fmtN(landSum,1)}</b> ד׳`:''}`);
}

function _renderDemand(){
  const A=computeAssumptions(PR.spec);
  if(A.T.pop==null) return `<div class="pr-note">כדי לראות ביקוש, מלאו קודם בלשונית <b>זהות והנחות</b> לפחות מקטע אחד עם יח"ד, נפשות למשק בית ושנתון.</div>`;
  if(PR.domain==='edu'||PR.domain==='all'){
    const lines=eduDemand(PR.spec,A);
    const eduT=`<div class="pr-sec"><h3>🎓 חינוך — כיתות נדרשות <span class="pr-hint">הקלידו לכל שורה את מספר הכיתות שהנספח מציין</span></h3>
      <div data-out="edu-sum" style="margin-bottom:6px"></div>${_eduDemandTable(lines)}
      <div class="pr-small" style="margin-top:6px">"לפי התדריך" מחושב מההנחות שהוזנו בלשונית הראשונה. ✓ = עד כיתה אחת הפרש (עיגול), או עד ${MARGIN*100}% מעל התדריך (מרווח ביטחון — מקובל).
        ℹ = עודף ניכר (לא בהכרח בעיה). ⚠ = פחות מהתדריך.<br>
        <b>פרטים</b> (לא חובה): שטח ודגם כפי שבנספח — השטח משמש לבדיקת אשכולות משותפים (למשל מעון+גן); ומפתח היועץ, אם חישב אחרת מהתדריך.</div></div>`;
    if(PR.domain==='edu') return eduT;
    return eduT+_publicTable(A)+_openTable(A);
  }
  const intro=`<div class="pr-note" style="margin-bottom:12px"><b>תצוגה מקדימה — ביקוש לפי התדריך.</b> השוואה ל"הנספח אומר" ושיבוץ בתשריט לתחום זה — בשלב הבא.</div>`;
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

// ── לשונית מענה ושיבוץ ──
PR.pick=null;       // מזהה ההקצאה שמשבצים לה תאים בלחיצה על התשריט
PR.hlLine=null;     // שורה שמודגשת בתשריט (ריחוף)
PR.addAlloc=function(lineId){
  const L=_eduLines().find(x=>x.id===lineId);
  const d=_dem(lineId); const need=num(d.declared&&d.declared.classes)??(L?L.classesRounded:null);
  const used=_allocsOf(lineId).reduce((t,a)=>t+(num(a.classes)||0),0);
  const a={id:'a'+Date.now().toString(36)+(_aSeq++),line:lineId,mode:'land',cells:[],
    classes:need!=null&&need-used>0?String(need-used):'',land:'',built:'',model:(d.declared&&d.declared.model)||'',note:''};
  PR.spec.provision.push(a); PR.startPick(a.id);
};
PR.delAlloc=function(id){ PR.spec.provision=PR.spec.provision.filter(a=>a.id!==id); if(PR.pick===id) PR.pick=null; PR.render(); safeRedraw(); };
PR.onAlloc=function(el){
  const [id,f]=el.dataset.a.split('.'); const a=_alloc(id); if(!a) return;
  if(f==='cellsText'){ a.cells=[...new Set(String(el.value).split(/[\s,;،]+/).map(s=>s.trim()).filter(Boolean))]; PR.render(); safeRedraw(); return; }
  a[f]=el.value;
  if(el.tagName==='SELECT'){ PR.render(); } else _refreshSupply();
  safeRedraw();
};
PR.removeCell=function(id,cn){ const a=_alloc(id); if(!a) return; a.cells=a.cells.filter(c=>c!==cn); PR.render(); safeRedraw(); };
PR.startPick=function(id){ PR.pick=id; PR.tab='walk'; PR.render(); try{ wrap.style.cursor='crosshair'; }catch(e){} safeRedraw(); };
PR.endPick=function(){ PR.pick=null; try{ wrap.style.cursor=''; }catch(e){} PR.render(); safeRedraw(); };
// נקרא מהממשק הראשי בלחיצה על תא בתשריט כשמצב שיבוץ פעיל
PR.onCellPick=function(cn){
  if(PR.pick==='__walk'){ PR.walkGo(cn); return true; }
  const a=_alloc(PR.pick); if(!a) return false;
  cn=String(cn);
  if(a.cells.includes(cn)) a.cells=a.cells.filter(c=>c!==cn); else a.cells.push(cn);
  if(a.cells.length===1&&a.mode==='land'){ const fs=cellIndex()[cn]; if(fs&&!isPublicCell(fs)) a.mode='built'; } // תא סחיר → הפרשה מבונה
  PR.render(); safeRedraw(); return true;
};
PR.hl=function(lineId){ if(PR.hlLine===lineId) return; PR.hlLine=lineId; safeRedraw(); };

function _renderSupplyEdu(){
  const A=computeAssumptions(PR.spec);
  if(A.T.pop==null) return `<div class="pr-note">מלאו קודם את ההנחות (לשונית <b>זהות והנחות</b>) — אז יופיעו כאן שורות החינוך לשיבוץ.</div>`;
  if(typeof state==='undefined'||!state.layers||!state.layers.plan) return `<div class="pr-note">טענו תשריט כדי לשבץ מוסדות בתאי שטח.</div>`;
  const lines=eduDemand(PR.spec,A);
  const pickA=_alloc(PR.pick);
  const banner=pickA?`<div class="pr-pick">📍 <b>מצב שיבוץ:</b> לחצו על תאי שטח בתשריט עבור "${E(eduShort(lines.find(l=>l.id===pickA.line)||{id:pickA.line,inst:''}))}" — לחיצה נוספת מסירה.
      <button class="pr-btn" onclick="PR.endPick()">✓ סיום שיבוץ</button></div>`:'';
  const cards=lines.map(L=>{
    const d=_dem(L.id), meta=EDU_META[eduBase(L.id)]||{};
    const declared=num(d.declared&&d.declared.classes);
    const allocs=_allocsOf(L.id);
    const isSchool=/ספר/.test(L.inst);
    const rows=allocs.map(a=>{
      const cells=a.cells.map(c=>`<span class="pr-chip">${E(c)}<button onclick="PR.removeCell('${a.id}','${E(c)}')" title="הסר">✕</button></span>`).join('');
      const needsCells=a.mode==='land'||a.mode==='built';
      const shared=isShared(a);
      // אפשר לשתף רק בין סוגים מאותה משפחה: מעונות+גנים, או בתי ספר
      const pre=id=>/^(maon|gan)/.test(id);
      const partners=lines.filter(o=>o.id!==L.id&&pre(o.id)===pre(L.id));
      const shareChips=partners.map(o=>{ const on=aLines(a).includes(o.id); const c=(EDU_META[eduBase(o.id)]||{}).color;
        return `<button class="pr-tog${on?' on':''}" onclick="PR.toggleShare('${a.id}','${o.id}')" title="${on?'הסר מהאשכול':'צרף לאשכול משותף'}"><span class="pr-dot" style="background:${c}"></span>${E(eduShort(o))}</button>`; }).join('');
      return `<div class="pr-alloc${PR.pick===a.id?' picking':''}${a.alt?' alt':''}">
        ${shared||a.alt?`<div class="pr-atag">${shared?`⟷ אשכול משותף: <b>${E(_allocLabel(a,lines))}</b>`:''}${shared&&a.alt?' · ':''}${a.alt?'<b>?</b> תאים חלופיים — אחד מכמה שימושים אפשריים':''}</div>`:''}
        <div class="pr-arow">
          <select data-a="${a.id}.mode" onchange="PR.onAlloc(this)">${ALLOC_MODES.map(([v,l])=>`<option value="${v}"${a.mode===v?' selected':''}>${l}</option>`).join('')}</select>
          <label>${shared?'כיתות (סה"כ באשכול)':'כיתות'} <input class="pr-in-s" data-a="${a.id}.classes" value="${E(a.classes??'')}" oninput="PR.onAlloc(this)"${shared?' title="לא חובה — רק אם הנספח מציין"':''}></label>
          ${a.mode==='land'?`<label>ד׳ <input class="pr-in-s" data-a="${a.id}.land" value="${E(a.land??'')}" oninput="PR.onAlloc(this)" title="שטח קרקע כפי שבנספח (לא חובה)"></label>`:''}
          ${a.mode==='built'?`<label>מ"ר <input class="pr-in-s" data-a="${a.id}.built" value="${E(a.built??'')}" oninput="PR.onAlloc(this)" title="שטח מבונה כפי שבנספח (לא חובה — ריק = לפי טבלה 5)"></label>
            <label title="לא חובה — להערכת מספר הכיתות מהמ&quot;ר">מ"ר לכיתה <input class="pr-in-s" data-a="${a.id}.sqmPerClass" value="${E(a.sqmPerClass??'')}" oninput="PR.onAlloc(this)"></label>`:''}
          ${a.mode==='land'&&isSchool&&!shared?`<select data-a="${a.id}.model" onchange="PR.onAlloc(this)" title="דגם">${MODEL_OPTS.map(([v,l])=>`<option value="${v}"${(a.model||'')===v?' selected':''}>${v?l:'דגם'}</option>`).join('')}</select>`:''}
          <button class="pr-del" onclick="PR.delAlloc('${a.id}')" title="מחיקת מענה">🗑</button>
        </div>
        ${needsCells?`<div class="pr-arow pr-opts">${partners.length?`<span class="pr-small">משרת גם:</span>${shareChips}`:''}
          <label class="pr-altlbl" title="התאים מוצעים לכמה שימושים חלופיים (למשל גנים/מעונות/בית כנסת/מועדון) — הם לא נספרים כמענה ודאי"><input type="checkbox" ${a.alt?'checked':''} onchange="PR.toggleAlt('${a.id}',this.checked)"> תאים חלופיים</label></div>`:''}
        ${needsCells?`<div class="pr-arow">${cells||'<span class="pr-small">טרם שובץ</span>'}
          ${PR.pick===a.id?`<button class="pr-btn on" onclick="PR.endPick()">✓ סיום</button>`:`<button class="pr-btn" onclick="PR.startPick('${a.id}')">📍 שבץ בתשריט</button>`}
          <input class="pr-in-cells" data-a="${a.id}.cellsText" value="${E(a.cells.join(', '))}" onchange="PR.onAlloc(this)" placeholder="או הקלידו מספרי תאים: 401, 402"></div>`
        :`<div class="pr-arow"><input class="pr-in-note" data-a="${a.id}.note" value="${E(a.note??'')}" oninput="PR.onAlloc(this)" placeholder="${a.mode==='combined'?'בשילוב עם… (למשל: ת"ת / בית ספר)':'הערה מהנספח'}"></div>`}
        <div data-out="achk-${a.id}"></div>
      </div>`;
    }).join('');
    return `<div class="pr-card" onmouseenter="PR.hl('${L.id}')" onmouseleave="PR.hl(null)">
      <div class="pr-card-h"><span class="pr-dot" style="background:${meta.color}"></span><b>${E(eduShort(L))}</b>
        <span class="pr-small">נדרש: ${declared!=null?`${fmtN(declared)} (נספח) · `:''}${fmtN(L.classesRounded)} (תדריך)</span>
        <span data-out="asum-${L.id}" class="pr-asum"></span></div>
      ${rows}
      <button class="pr-btn" onclick="PR.addAlloc('${L.id}')">+ מענה</button>
    </div>`;
  }).join('');
  const legend=`<div class="pr-legend"><span><i class="lg-fill"></i>תא ייעודי</span><span><i class="lg-stripe"></i>אשכול משותף (פסים בצבעי הסוגים)</span>
    <span><i class="lg-alt"></i>תא חלופי (קווקוו דק, "?" בתווית)</span><span><i class="lg-free"></i>תא ציבור בלי שיבוץ</span><span><i class="lg-built"></i>הפרשה מבונה (מסגרת בלבד)</span><span><i class="lg-t5b"></i>🏢 מבונה בטבלה 5, לא שויך</span></div>`;
  return banner+`<div class="pr-sec"><h3>🎓 מענה ושיבוץ בתשריט <span class="pr-hint">לכל שורה: איך היועץ נתן מענה, ובאילו תאי שטח</span></h3>
    <div class="pr-small" style="margin-bottom:6px">גנים ומעונות מוקצים לרוב <b>באשכול משותף</b> — הוסיפו מענה אחד, וסמנו בו "משרת גם". תאים שהנספח מציע לכמה שימושים חלופיים — סמנו "תאים חלופיים".</div>
    ${legend}${cards}</div>`+_renderGroups()+_renderBuiltScan()+_renderPublicCells()+_renderRadii();
}
// ── שטחי ציבור מבונים שנמצאו בטבלה 5 ──
function _builtAssigned(){ const m={}; for(const a of PR.spec.provision||[]) if(a.mode==='built') for(const c of a.cells) (m[c]=m[c]||[]).push(a); return m; }
function _nonEdu(){ return PR.spec.builtNonEdu||(PR.spec.builtNonEdu=[]); }
// לתא יש מענה כלשהו: הקצאה, שימוש לא-חינוכי / עתודה שהוזנו ב"תא אחר תא", או סימון "לא לחינוך"
function _cellHasUse(cn){ cn=String(cn); const m=((PR.spec.walk||{}).cells||{})[cn]||{};
  return _cellAllocs(cn).length>0||(m.other||[]).length>0||!!m.reserve||_nonEdu().includes(cn); }
function _builtGroupsOf(scan){ const g={}; for(const s of scan) (g[s.yiud]=g[s.yiud]||[]).push(s); return g; }
function _renderBuiltScan(){
  const scan=builtScan();
  if(scan==null) return `<div class="pr-sec"><h3>🏢 שטחי ציבור מבונים <span class="pr-hint">במגרשים סחירים</span></h3><div class="pr-small">טענו טבלה 5 כדי לאתר אוטומטית הקצאות מבונות במגרשי מגורים/תעסוקה.</div></div>`;
  if(!scan.length) return `<div class="pr-sec"><h3>🏢 שטחי ציבור מבונים <span class="pr-hint">במגרשים סחירים</span></h3><div class="pr-small">בטבלה 5 אין שימוש "מבנים ומוסדות ציבור" במגרשים שאינם ציבוריים.</div></div>`;
  const asg=_builtAssigned(), non=new Set(_nonEdu()), lines=_eduLines();
  const tot=scan.reduce((t,s)=>t+s.sqm,0);
  const groups=_builtGroupsOf(scan);
  const opts=`<option value="">שייך את הפנויים ל…</option>`+
    (lines.some(l=>l.id==='maon')&&lines.some(l=>l.id==='gan')?`<option value="maon+gan">מעון + גן (אשכול משותף)</option>`:'')+
    lines.map(l=>`<option value="${l.id}">${E(eduShort(l))}</option>`).join('')+`<option value="__non">לא לחינוך (מוסדות אחרים)</option>`;
  const blocks=Object.entries(groups).map(([yiud,list])=>{
    const sq=list.reduce((t,s)=>t+s.sqm,0);
    const chips=list.map(s=>{ const as=asg[s.cn];
      const cls=as?'used':non.has(s.cn)?'non':'free';
      const ttl=as?'משויך: '+as.map(a=>_allocLabel(a,lines)).join(', '):non.has(s.cn)?'סומן כלא-חינוך':'לא משויך';
      return `<span class="pr-chip ${cls}" title="${E(ttl)}${s.units?` · ${s.units} יח"ד`:''}${cls==='non'?' · לחיצה מבטלת':''}"${cls==='non'?` onclick="PR.unNonEdu('${s.cn}')" style="cursor:pointer"`:''} onmouseenter="PR.hlCells(['${s.cn}'])" onmouseleave="PR.hlCells(null)">${E(s.cn)} · ${fmtN(s.sqm)}</span>`; }).join('');
    const free=list.filter(s=>!asg[s.cn]&&!non.has(s.cn)).length;
    return `<div class="pr-card" onmouseenter="PR.hlCells(${E(JSON.stringify(list.map(s=>s.cn)))})" onmouseleave="PR.hlCells(null)">
      <div class="pr-card-h"><b>${E(yiud)}</b><span class="pr-small">${list.length} תאים · ${fmtN(sq)} מ"ר${free?` · ${free} לא משויכים`:''}</span>
        ${free?`<select class="pr-bsel" onchange="PR.assignBuilt(${E(JSON.stringify(yiud))},this.value)">${opts}</select>`:''}</div>
      <div class="pr-chips">${chips}</div></div>`;
  }).join('');
  return `<div class="pr-sec"><h3>🏢 שטחי ציבור מבונים בטבלה 5 <span class="pr-hint">${scan.length} מגרשים סחירים · ${fmtN(tot)} מ"ר — זוהו אוטומטית</span></h3>
    <div class="pr-small" style="margin-bottom:6px">מגרשים שבטבלה 5 יש בהם שימוש "מבנים ומוסדות ציבור" אף שהייעוד שלהם אינו ציבורי. שייכו אותם לפי הנספח —
      קבוצה שלמה בבת אחת, או תא-תא דרך "📍 שבץ בתשריט" במענה "הפרשה מבונה". מספר אחרי התא = מ"ר.
      <span class="pr-chip used">משויך</span> <span class="pr-chip free">לא משויך</span> <span class="pr-chip non">לא לחינוך</span></div>${blocks}</div>`;
}
PR.assignBuilt=function(yiud,target){
  if(!target) return;
  const scan=builtScan()||[], asg=_builtAssigned(), non=_nonEdu();
  const cells=scan.filter(s=>s.yiud===yiud&&!asg[s.cn]&&!non.includes(s.cn)).map(s=>s.cn);
  if(!cells.length) return;
  if(target==='__non'){ non.push(...cells); PR.render(); safeRedraw(); return; }
  const ls=target.split('+');
  const sqm=cells.reduce((t,c)=>t+t5PublicSqm(t5Of(c)),0);
  PR.spec.provision.push({id:'a'+Date.now().toString(36)+(_aSeq++),line:ls[0],lines:ls.length>1?ls:undefined,mode:'built',cells,
    classes:'',land:'',built:'',model:'',note:`שויך מטבלה 5 (${fmtN(sqm)} מ"ר)`});
  PR.render(); safeRedraw();
};
PR.unNonEdu=function(cn){ PR.spec.builtNonEdu=_nonEdu().filter(c=>c!==cn); PR.render(); safeRedraw(); };
PR.hlCellList=null;
PR.hlCells=function(list){ PR.hlCellList=list; safeRedraw(); };
PR.toggleShare=function(id,lineId){
  const a=_alloc(id); if(!a) return;
  let ls=aLines(a).slice();
  if(ls.includes(lineId)){ if(ls.length<2) return; ls=ls.filter(l=>l!==lineId); } else ls.push(lineId);
  a.lines=ls.length>1?ls:undefined; a.line=ls[0];
  if(ls.length>1) a.model='';
  PR.render(); safeRedraw();
};
PR.toggleAlt=function(id,on){ const a=_alloc(id); if(!a) return; a.alt=!!on||undefined; PR.render(); safeRedraw(); };

// ── אשכולות משותפים: בדיקת שטח לקבוצת סוגים (למשל מעון+גן) ──
const _landArea=cells=>{ const idx=cellIndex(); return cells.filter(c=>idx[c]).reduce((t,c)=>t+cellAreaM2(idx[c]),0)/1000; };
function groupChecks(){
  const lines=_eduLines(), out=[];
  for(const g of sharedGroups()){
    const label=g.lines.map(id=>_lineShortById(id,lines)).join(' + ');
    const parts=g.lines.map(id=>({id,land:num((_dem(id).declared||{}).land)}));
    const missing=parts.filter(p=>p.land==null);
    const need=missing.length?null:parts.reduce((t,p)=>t+p.land,0);
    const firmCells=[...new Set(g.allocs.filter(a=>a.mode==='land'&&!a.alt).flatMap(a=>a.cells))];
    const altCells=[...new Set(g.allocs.filter(a=>a.mode==='land'&&a.alt).flatMap(a=>a.cells))].filter(c=>!firmCells.includes(c));
    const firm=_landArea(firmCells), alt=_landArea(altCells);
    const bCells=[...new Set(g.allocs.filter(a=>a.mode==='built').flatMap(a=>a.cells))];
    const bSqm=bCells.reduce((t,c)=>t+t5PublicSqm(t5Of(c)),0);
    const have=`בתאים ייעודיים ${fmtN(firm,1)} ד׳ (${firmCells.length} תאים)${altCells.length?` · בתאים חלופיים עוד ${fmtN(alt,1)} ד׳ (${altCells.length})`:''}${bCells.length?` · ובנוסף הפרשה מבונה ${fmtN(bSqm)} מ"ר ב-${bCells.length} מגרשים`:''}`;
    if(need==null){ out.push({info:true,label,txt:`${have} · להשוואה: הזינו בלשונית "ביקוש" ▸ פרטים את השטח הנדרש ל${missing.map(p=>_lineShortById(p.id,lines)).join(', ')}`}); continue; }
    const needTxt=`נדרש לפי הנספח ${fmtN(need,1)} ד׳ (${parts.map(p=>_lineShortById(p.id,lines)+' '+fmtN(p.land,1)).join(' + ')})`;
    const ev=evalSupply(firm,need,Math.max(0.1,need*0.03));
    if(ev.cls==='short'){
      if(firm+alt>=need*0.97) out.push({info:true,label,txt:`${needTxt} · ${have} — נסגר רק בעזרת התאים החלופיים`});
      else out.push({ok:false,label,txt:`${needTxt} · ${have} — חסר ${fmtN(need-firm-alt,1)} ד׳`});
    } else out.push({ok:ev.cls!=='surplus',info:ev.cls==='surplus',label,txt:`${needTxt} · ${have}${ev.cls==='margin'?` — מרווח ביטחון (+${fmtN(ev.pct,0)}%)`:ev.cls==='surplus'?` — עודף ניכר (${fmtN(ev.pct,0)}%)`:''}`});
  }
  return out;
}
function _renderGroups(){
  const gc=groupChecks(); if(!gc.length) return '';
  return `<div class="pr-sec"><h3>⟷ אשכולות משותפים <span class="pr-hint">השטח של כל התאים יחד, מול סכום השטח הנדרש לסוגים</span></h3>
    ${gc.map(c=>`<div class="pr-card"><b>${E(c.label)}</b>${chk(c)}</div>`).join('')}</div>`;
}
function _renderPublicCells(){
  const idx=cellIndex(); const used=new Set((PR.spec.provision||[]).flatMap(a=>a.cells||[]));
  const pub=Object.keys(idx).filter(k=>isPublicCell(idx[k])).sort((a,b)=>(+a)-(+b));
  if(!pub.length) return '';
  const chips=pub.map(k=>`<span class="pr-chip ${used.has(k)?'used':'free'}" title="${fmtN(cellAreaM2(idx[k])/1000,1)} ד׳">${E(k)}</span>`).join('');
  const free=pub.filter(k=>!used.has(k));
  return `<div class="pr-sec"><h3>תאי "מבנים ומוסדות ציבור" בתשריט <span class="pr-hint">${pub.length} תאים · ${free.length} בלי שיבוץ (מקווקו בתשריט)</span></h3><div class="pr-chips">${chips}</div></div>`;
}

// ── רדיוסי שירות וכיסוי ──
function _radii(){ const r=PR.spec.radii||(PR.spec.radii={on:false,base:'gan',r:{}}); r.r=r.r||{}; return r; }
PR.setRadii=function(k,v){ const R=_radii(); if(k==='on') R.on=!!v; else if(k==='base') R.base=v; else R.r[k]=v; PR.render(); safeRedraw(); };
function _mPerUnit(){ return (typeof state!=='undefined'&&state.spanMeters)?state.spanMeters/1000:null; }
function coverage(base){
  const idx=cellIndex(), R=_radii(), mpu=_mPerUnit();
  const rM=num(R.r[base])??EDU_META[base].radius;
  const centers=[], altCenters=[];
  for(const a of PR.spec.provision||[]){ if(!aLines(a).some(l=>eduBase(l)===base)||!(a.mode==='land'||a.mode==='built')) continue;
    for(const c of a.cells){ if(idx[c]){ const p=cellCentroid(idx[c]); if(p) (a.alt?altCenters:centers).push(p); } } }
  if(!mpu||!(centers.length||altCenters.length)) return {base,rM,centers,altCenters,pct:null,pctAlt:null,uncovered:[]};
  const rU=rM/mpu; let tot=0,cov=0,covA=0; const uncovered=[];
  const useUnits=!!(state.table5);
  const near=(cs,p)=>cs.some(c=>Math.hypot(c[0]-p[0],c[1]-p[1])<=rU);
  for(const [k,fs] of Object.entries(idx)){
    if(!isResidentialCell(fs)) continue;
    const p=cellCentroid(fs); if(!p) continue;
    const w=useUnits?(t5Units(k)||0):cellAreaM2(fs); if(!w) continue;
    tot+=w;
    if(near(centers,p)){ cov+=w; covA+=w; } else { uncovered.push(k); if(near(altCenters,p)) covA+=w; }
  }
  return {base,rM,rU,centers,altCenters,pct:tot?cov/tot*100:null,pctAlt:tot&&altCenters.length?covA/tot*100:null,uncovered,byUnits:useUnits};
}
function _renderRadii(){
  const R=_radii();
  const bases=Object.keys(EDU_META);
  const rows=bases.map(b=>{
    const c=coverage(b);
    return `<tr><td><label><input type="radio" name="pr-rb" ${R.base===b?'checked':''} onchange="PR.setRadii('base','${b}')"> <span class="pr-dot" style="background:${EDU_META[b].color}"></span>${EDU_META[b].short}</label></td>
      <td><input class="pr-in-s" value="${E(R.r[b]??'')}" placeholder="${EDU_META[b].radius}" onchange="PR.setRadii('${b}',this.value)"> מ׳</td>
      <td>${c.centers.length||c.altCenters.length?(c.pct!=null?`<b>${fmtN(c.pct,0)}%</b> ${c.byUnits?'מיח"ד':'משטח המגורים'} בטווח${c.pctAlt!=null?` <span class="pr-small">(${fmtN(c.pctAlt,0)}% כולל חלופיים)</span>`:''}`:'—'):'<span class="pr-small">אין שיבוץ</span>'}</td></tr>`;
  }).join('');
  return `<div class="pr-sec"><h3>רדיוסי שירות <span class="pr-hint">מרחק אווירי ממרכז כל תא משובץ; מגרשי מגורים מחוץ לטווח מסומנים באדום</span></h3>
    <label class="pr-small"><input type="checkbox" ${R.on?'checked':''} onchange="PR.setRadii('on',this.checked)"> הצג בתשריט את הרדיוסים של הסוג המסומן</label>
    <table class="pr-tbl" style="margin-top:4px"><tr><th>סוג</th><th>רדיוס</th><th>כיסוי מגרשי המגורים</th></tr>${rows}</table></div>`;
}

function _refreshSupply(){
  const body=$('pr-body'); if(!body) return;
  // אשכול משותף מופיע בכמה כרטיסים — מעדכנים את כל המופעים
  const set=(k,h)=>{ body.querySelectorAll(`[data-out="${k}"]`).forEach(el=>{ el.innerHTML=h; }); };
  const lines=_eduLines();
  for(const L of lines){
    const allocs=_allocsOf(L.id), d=_dem(L.id);
    const need=num(d.declared&&d.declared.classes)??L.classesRounded;
    set('asum-'+L.id,_lineSupplyHtml(L,allocs,need));
    for(const a of allocs) set('achk-'+a.id,allocChecks(a,L).map(chk).join(''));
  }
}
// סיכום מענה לשורה: כיתות ייעודיות מול הנדרש; אשכולות משותפים ותאים חלופיים — בנפרד
function lineSupply(L,allocs,need){
  const own=allocs.filter(a=>a.mode!=='none'&&!isShared(a));
  const given=own.filter(a=>!a.alt).reduce((t,a)=>t+(num(a.classes)||0),0);
  const alt=own.filter(a=>a.alt).reduce((t,a)=>t+(num(a.classes)||0),0);
  const shared=allocs.filter(a=>a.mode!=='none'&&isShared(a));
  return {given,alt,shared,ev:evalSupply(given,need,0)};
}
function _lineSupplyHtml(L,allocs,need){
  if(!allocs.length) return '<span class="pr-small">אין מענה</span>';
  const s=lineSupply(L,allocs,need);
  const altT=s.alt?` <span class="pr-small">(+${fmtN(s.alt)} בתאים חלופיים)</span>`:'';
  if(s.shared.length&&s.ev.cls==='short')
    return `<span class="pr-st keys" title="השטח נבדק יחד לכל האשכול — ראו 'אשכולות משותפים' למטה">⟷ באשכול משותף${s.given?` + ${fmtN(s.given)} כיתות ייעודיות`:''}</span>${altT}`;
  const e=s.ev;
  return (e.cls==='short'?`<span class="pr-st diff">⚠ מענה ל-${fmtN(s.given)}/${fmtN(need)}</span>`
    :e.cls==='surplus'?`<span class="pr-st info">ℹ מענה ל-${fmtN(s.given)}/${fmtN(need)} — עודף ניכר</span>`
    :`<span class="pr-st ok">✓ מענה ל-${fmtN(s.given)}/${fmtN(need)}${e.cls==='margin'?' — מרווח ביטחון':''}</span>`)+altT
    +(s.shared.length?' <span class="pr-small">+ אשכול משותף</span>':'');
}

// ── לשונית בדיקות (חינוך) ──
function _renderChecks(){
  const A=computeAssumptions(PR.spec);
  if(A.T.pop==null) return `<div class="pr-note">אין עדיין נתונים לבדיקה — מלאו את ההנחות.</div>`;
  const items=[];
  const D=PR.spec.assumptions.declared, T=A.T;
  const cmp=(lbl,decl,comp,kind)=>{ const c=compare(decl,comp,kind); if(c.status==='diff') items.push({g:'עקביות ההנחות',ok:false,txt:`${lbl}: הנספח ${fmtN(num(decl),kind?2:0)}, מחישוב המקטעים ${fmtN(comp,kind?2:0)}`}); else if(c.status==='ok') items.push({g:'עקביות ההנחות',ok:true,txt:`${lbl} תואם`}); };
  cmp('אוכלוסייה',D.population,T.pop); cmp('ילדים בשנתון',D.cohort_count,T.coh);
  const lines=eduDemand(PR.spec,A);
  for(const L of lines){
    const d=_dem(L.id), s=eduRowStatus(L,d);
    const G='כיתות מול התדריך', dcl=num(d.declared&&d.declared.classes);
    if(s.status==='ok') items.push({g:G,ok:true,txt:`${eduShort(L)}: ${dcl} כיתות — תואם`});
    else if(s.status==='margin') items.push({g:G,ok:true,txt:`${eduShort(L)}: ${dcl} כיתות (תדריך ${L.classesRounded}) — מרווח ביטחון`});
    else if(s.status==='keys') items.push({g:G,ok:true,txt:`${eduShort(L)}: ${dcl} כיתות — עקבי עם מפתח היועץ (תדריך ${L.classesRounded})`});
    else if(s.status==='surplus') items.push({g:G,info:true,txt:`${eduShort(L)}: ${dcl} כיתות מול ${L.classesRounded} בתדריך — עודף ניכר (${fmtN(s.pct,0)}%), כדאי להבין למה`});
    else if(s.status==='diff') items.push({g:G,ok:false,txt:`${eduShort(L)}: הנספח ${dcl}, התדריך ${L.classesRounded} — חסר`});
    const allocs=_allocsOf(L.id), need=dcl??L.classesRounded;
    if(allocs.length){ const ls=lineSupply(L,allocs,need);
      if(ls.ev.cls==='short'&&!ls.shared.length) items.push({g:'מענה',ok:false,txt:`${eduShort(L)}: מענה ודאי ל-${ls.given} מתוך ${need} כיתות${ls.alt?` (ועוד ${ls.alt} בתאים חלופיים)`:''}`}); }
    for(const a of allocs){ if(isShared(a)&&aLines(a)[0]!==L.id) continue; // אשכול משותף — פעם אחת
      const nm=isShared(a)?_allocLabel(a,lines):eduShort(L);
      for(const c of allocChecks(a,L)) if(!c.info||/עודף/.test(c.txt)) items.push({g:c.txt.includes('טבלה 5')?'מול טבלה 5':'שיבוץ ושטח',ok:c.ok,info:c.info,txt:`${nm} (${ALLOC_MODE_LABEL[a.mode]}${a.alt?', חלופי':''}): ${c.txt}`}); }
  }
  for(const c of groupChecks()) items.push({g:'אשכולות משותפים',ok:c.ok,info:c.info,txt:`${c.label}: ${c.txt}`});
  const idx=cellIndex(); const used=new Set((PR.spec.provision||[]).flatMap(a=>a.cells||[]));
  const free=Object.keys(idx).filter(k=>isPublicCell(idx[k])&&!used.has(k));
  { const scan=builtScan(); if(scan&&scan.length){ const asg=_builtAssigned(), non=new Set(_nonEdu());
      const un=scan.filter(s=>!_cellHasUse(s.cn)), done=scan.filter(s=>_cellHasUse(s.cn)&&!non.has(s.cn));
      if(done.length) items.push({g:'מבונה בטבלה 5',ok:true,txt:`${done.length} מגרשים סחירים עם שטח ציבורי מבונה שויכו (${fmtN(done.reduce((t,s)=>t+s.sqm,0))} מ"ר)`});
      if(un.length) items.push({g:'מבונה בטבלה 5',info:true,txt:`${un.length} מגרשים סחירים עם שטח ציבורי מבונה בטבלה 5 (${fmtN(un.reduce((t,s)=>t+s.sqm,0))} מ"ר) לא שויכו לשום מענה: ${un.slice(0,15).map(s=>s.cn).join(', ')}${un.length>15?'…':''} — האם הנספח מתייחס אליהם?`}); } }
  if(PR.spec.provision.length&&free.length) items.push({g:'שיבוץ ושטח',ok:false,info:true,txt:`${free.length} תאי ציבור בתשריט בלי שיבוץ (ייתכן שמיועדים למוסדות שאינם חינוך): ${free.slice(0,15).join(', ')}${free.length>15?'…':''}`});
  for(const b of Object.keys(EDU_META)){ const c=coverage(b); if(c.pct!=null) items.push({g:'כיסוי',ok:c.pct>=90,txt:`${EDU_META[b].short}: ${fmtN(c.pct,0)}% ${c.byUnits?'מיח"ד':'משטח המגורים'} בטווח ${fmtN(c.rM)} מ׳${c.pctAlt!=null?` (${fmtN(c.pctAlt,0)}% כולל תאים חלופיים)`:''}${c.uncovered.length?` · מחוץ לטווח: ${c.uncovered.slice(0,12).join(', ')}${c.uncovered.length>12?'…':''}`:''}`}); }
  if(!items.length) return `<div class="pr-note">עוד אין מה לבדוק — הזינו בלשונית <b>ביקוש</b> את מה שהנספח אומר, ובלשונית <b>תא אחר תא</b> מה הוצע בכל תא.</div>`;
  const groups=[...new Set(items.map(i=>i.g))];
  const bad=items.filter(i=>!i.ok&&!i.info).length, good=items.filter(i=>i.ok&&!i.info).length, inf=items.filter(i=>i.info).length;
  const rank=i=>i.info?1:i.ok?2:0;
  return `<div class="pr-sec"><h3>בדיקות — חינוך <span class="pr-hint">${good} ✓ · ${inf} ℹ · ${bad} ⚠</span></h3>
    <div class="pr-small" style="margin-bottom:8px">⚠ = חוסר או אי-התאמה · ℹ = לתשומת לב (עודף ניכר, תאים חלופיים) · עודף של עד ${MARGIN*100}% נחשב מרווח ביטחון תקין.</div>`+
    groups.map(g=>`<div class="pr-cg"><div class="pr-cg-h">${E(g)}</div>${items.filter(i=>i.g===g).sort((a,b)=>rank(a)-rank(b)).map(chk).join('')}</div>`).join('')+`</div>`;
}

function _renderSoon(tab){
  const txt={
    supply:`שיבוץ בתשריט לתחום זה — בשלב הבא. בינתיים: תחום 🎓 חינוך.`,
    checks:`בדיקות לתחום זה — בשלב הבא. בינתיים: תחום 🎓 חינוך.`,
  }[tab]||'';
  return `<div class="pr-soon"><div class="ic">🛠</div><div style="color:#f0b429;font-weight:600;margin:6px 0 10px">בשלב הבא</div>
    <div class="pr-note" style="text-align:right">${txt}</div></div>`;
}

// מידע לכרטיס תא השטח בממשק הראשי (לחיצה על תא)
// מה הוזן לתא (משותף לחלונית ליד הסמן ולחלונית הלחיצה): "310 מ"ר מבונה ציבורי", "2 כיתות גן", "בית כנסת"…
function _cellProgParts(cn){
  cn=String(cn); const lines=_eduLines(), parts=[];
  const al=_cellAllocs(cn), built=al.filter(a=>a.mode==='built');
  const scan=(builtScan()||[]).find(x=>x.cn===cn);
  if(built.length){ const decl=built.reduce((t,a)=>t+(num(a.built)||0),0), sq=decl||(scan?scan.sqm:t5PublicSqm(t5Of(cn)));
    if(sq) parts.push(`${fmtN(sq)} מ"ר מבונה ציבורי`); }
  else if(scan) parts.push(`${scan.sqm>0?fmtN(scan.sqm)+' מ"ר ':''}מבונה ציבורי${_cellHasUse(cn)?'':' (טבלה 5) — עוד לא שויך'}`);
  for(const a of al) parts.push(_classesLabel(a,lines,true)+(a.cells.length>1&&num(a.classes)?` ב-${a.cells.length} תאים`:'')+(a.mode==='built'||a.mode==='land'?'':' ('+(ALLOC_MODE_LABEL[a.mode]||'')+')')+(a.alt?' — חלופי':''));
  const m=((PR.spec.walk||{}).cells||{})[cn]||{};
  if(m.other&&m.other.length) parts.push(m.other.join(', ')+(m.alt?' — חלופי':''));
  if(m.reserve) parts.push('עתודה / לא מוגדר');
  if(_nonEdu().includes(cn)&&!parts.length) parts.push('לא לחינוך');
  return parts;
}
PR.cellInfoHtml=function(cn){
  const parts=_cellProgParts(cn);
  return parts.length?`<div class="t5-shimush t5-prog">פרוגרמה</div>${parts.map(x=>`<div style="margin:3px 0">${E(x)}</div>`).join('')}`:'';
};
PR.hoverInfo=function(cn){
  if(!PR.open) return '';
  const parts=_cellProgParts(cn);
  return parts.length?`<div class="ht-prog">📊 ${parts.map(E).join(' · ')}</div>`:'';
};

// ── שכבת הפרוגרמה על התשריט ──
function _pathCell(ctx,fs){
  ctx.beginPath();
  for(const f of fs){ const g=f.geometry; const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    for(const p of polys) for(const ring of p){ ring.forEach(([x,y],i)=>{ const [sx,sy]=dc(x,y); i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy); }); ctx.closePath(); } }
}
// פסים אלכסוניים בתוך תא: thin=false → פסים עבים לסירוגין בצבעים (אשכול); thin=true → קווקוו דק (חלופי)
function _stripes(ctx,fs,cols,alpha,w,thin){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const f of fs){ const g=f.geometry; const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    for(const p of polys) for(const [x,y] of p[0]){ const [sx,sy]=dc(x,y); if(sx<x0)x0=sx; if(sx>x1)x1=sx; if(sy<y0)y0=sy; if(sy>y1)y1=sy; } }
  ctx.save(); _pathCell(ctx,fs); ctx.clip();
  const step=thin?7:w, h=y1-y0; let i=0;
  ctx.lineWidth=thin?w:w+0.5;
  for(let x=x0-h;x<x1+step;x+=step,i++){
    ctx.strokeStyle=_hexA(cols[i%cols.length],alpha);
    ctx.beginPath(); ctx.moveTo(x,y1); ctx.lineTo(x+h,y0); ctx.stroke();
  }
  ctx.restore();
}
function _hexA(hex,a){ const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
PR.drawLayer=function(ctx){
  if(!PR.open||typeof state==='undefined'||!state.layers||!state.layers.plan) return;
  if(!(PR.domain==='edu'||PR.domain==='all')) return;
  // סימבולוגיה מצומצמת (בקשת המשתמש): התאים עצמם לא נצבעים — ייעוד הקרקע של התשריט (חום = ציבור) נשאר כמו שהוא.
  // מסגרת חומה עבה = הקצאה מבונה (שטח ציבורי במגרש סחיר). על כל תא — תגיות לבנות עם מה שהוצע בו.
  const idx=cellIndex(), L=_eduLines(), W=(PR.spec.walk||{}).cells||{};
  const scan=builtScan()||[], scanBy=Object.fromEntries(scan.map(x=>[x.cn,x]));
  const byCell={};
  for(const a of PR.spec.provision||[]){ if(!(a.mode==='land'||a.mode==='built')) continue; for(const c of a.cells) (byCell[c]=byCell[c]||[]).push(a); }
  ctx.save();
  // 1. רדיוסים + מגרשי מגורים מחוץ לטווח (רק כשהמשתמש הדליק)
  const R=PR.spec.radii;
  if(R&&R.on&&R.base&&EDU_META[R.base]){
    const c=coverage(R.base), col=EDU_META[R.base].color;
    if(c.rU){
      ctx.strokeStyle='rgba(231,76,60,.9)'; ctx.lineWidth=2; ctx.fillStyle='rgba(231,76,60,.18)';
      for(const k of c.uncovered){ const fs=idx[k]; if(!fs) continue; _pathCell(ctx,fs); ctx.fill(); ctx.stroke(); }
      for(const p of c.centers){ const [sx,sy]=dc(p[0],p[1]); const r=Math.abs(c.rU*scale);
        ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.fillStyle=_hexA(col,.07); ctx.fill();
        ctx.setLineDash([8,5]); ctx.strokeStyle=_hexA(col,.9); ctx.lineWidth=1.8; ctx.stroke(); ctx.setLineDash([]); }
      for(const p of c.altCenters||[]){ const [sx,sy]=dc(p[0],p[1]); const r=Math.abs(c.rU*scale);
        ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.setLineDash([2,5]); ctx.strokeStyle=_hexA(col,.6); ctx.lineWidth=1.4; ctx.stroke(); ctx.setLineDash([]); }
    }
  }
  // 2. מסגרת חומה — כל תא עם הקצאה מבונה (מטבלה 5, או שהוזנה כמבונה)
  const builtCells=new Set([...scan.map(x=>x.cn),...Object.entries(byCell).filter(([k,l])=>l.some(a=>a.mode==='built')).map(([k])=>k)]);
  for(const k of builtCells){ const fs=idx[k]; if(!fs) continue;
    _pathCell(ctx,fs); ctx.lineWidth=6; ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.stroke(); // הילה — שהגבול ייראה גם על כתום
    ctx.lineWidth=4; ctx.strokeStyle='#8b5a2b'; ctx.stroke(); }
  // 3. הדגשות: ריחוף על שורה בפאנל / מצב שיבוץ
  const pickA=(PR.spec.provision||[]).find(a=>a.id===PR.pick);
  for(const [k,list] of Object.entries(byCell)){ const fs=idx[k]; if(!fs) continue;
    const hl=PR.hlLine&&list.some(a=>aLines(a).includes(PR.hlLine)), picked=pickA&&pickA.cells.includes(k);
    if(hl||picked){ _pathCell(ctx,fs); ctx.lineWidth=3.5; ctx.strokeStyle=picked?'#00e0ff':'#ffd400'; ctx.stroke(); } }
  // 4. תגיות לכל תא שיש בו משהו
  const cells=new Set([...Object.keys(byCell),...builtCells,...Object.keys(W).filter(k=>(W[k].other||[]).length||W[k].reserve)]);
  ctx.font='bold 11px Arial'; ctx.textBaseline='middle'; ctx.textAlign='center';
  for(const k of cells){
    const fs=idx[k]; if(!fs) continue; const p=cellCentroid(fs); if(!p) continue;
    const [sx,sy]=dc(p[0],p[1]); const list=byCell[k]||[], m=W[k]||{}, tags=[];
    if(builtCells.has(k)){ const bl=list.filter(a=>a.mode==='built'), decl=bl.reduce((t,a)=>t+(num(a.built)||0),0);
      const sq=decl||(scanBy[k]?scanBy[k].sqm:t5PublicSqm(t5Of(k)));
      tags.push({txt:sq>0?`🏢 ${fmtN(sq)} מ"ר`:'🏢 ציבורי (בלי שטח בטבלה 5)',brown:true}); }
    for(const a of list) tags.push({txt:_classesLabel(a,L,a.cells.length===1)+(a.alt?' ?':'')});
    for(const o of m.other||[]) tags.push({txt:o+(m.alt?' ?':'')});
    if(m.reserve) tags.push({txt:'עתודה'});
    const h=16, gap=2; let y=sy-(tags.length*(h+gap))/2+h/2;
    for(const t of tags){
      const w=ctx.measureText(t.txt).width+12;
      ctx.fillStyle=t.brown?'rgba(250,243,235,.96)':'rgba(255,255,255,.94)'; ctx.strokeStyle=t.brown?'#8b5a2b':'#5a6b80'; ctx.lineWidth=1.5;
      ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(sx-w/2,y-h/2,w,h,7); else ctx.rect(sx-w/2,y-h/2,w,h); ctx.fill(); ctx.stroke();
      ctx.fillStyle=t.brown?'#5a3515':'#1a2533'; ctx.fillText(t.txt,sx,y);
      y+=h+gap;
    }
  }
  // 5. התא הנוכחי במעבר תא-אחר-תא
  if(PR.tab==='walk'&&PR.spec.walk&&PR.spec.walk.cur&&idx[PR.spec.walk.cur]){ const fs=idx[PR.spec.walk.cur];
    _pathCell(ctx,fs); ctx.lineWidth=9; ctx.strokeStyle='rgba(0,224,255,.35)'; ctx.stroke(); ctx.lineWidth=3.5; ctx.strokeStyle='#00e0ff'; ctx.stroke(); }
  if(PR.hlCellList) for(const k of PR.hlCellList){ const fs=idx[k]; if(!fs) continue; _pathCell(ctx,fs); ctx.lineWidth=4; ctx.strokeStyle='#ffd400'; ctx.stroke(); }
  ctx.restore();
};

// ════════════════════════════════════════════════════════════════════════════
// 🎯 מעבר תא-אחר-תא: כמו בתדריך — עוברים על תאי השטח (חומים, ואז סחירים עם הקצאה מבונה),
// ולכל תא מזינים מה הנספח מציע בו. בסוף — "תמונת הנספח" מול הדרישות.
// ════════════════════════════════════════════════════════════════════════════
const OTHER_USES=['בית כנסת','מועדון / מתנ"ס','מרפאה / טיפת חלב','רווחה','ספורט','מקווה','אחר'];
function _walk(){ const w=PR.spec.walk||(PR.spec.walk={}); w.done=w.done||{}; w.cells=w.cells||{}; w.split=w.split||{}; w.phase=w.phase||'intro'; return w; }
function _wCell(cn){ const w=_walk(); return w.cells[cn]||(w.cells[cn]={other:[],reserve:false,alt:false,note:''}); }
function walkQueue(){
  const idx=cellIndex();
  const land=Object.keys(idx).filter(k=>isPublicCell(idx[k])).sort((a,b)=>(+a)-(+b));
  const built=(builtScan()||[]).map(s=>s.cn).filter(c=>!land.includes(c));
  return {land,built};
}
const _cellAllocs=cn=>(PR.spec.provision||[]).filter(a=>a.cells.includes(String(cn)));
const _walkAllocs=cn=>_cellAllocs(cn).filter(a=>a.src==='walk');
// בדיקת שטח לתא: סכום מכסות הקרקע של כל המוסדות שבו מול שטח התא
function cellLandCheck(cn){
  const idx=cellIndex(); if(!idx[cn]) return null;
  const lines=_eduLines();
  const al=_cellAllocs(cn).filter(a=>a.mode==='land'&&!isShared(a)&&num(a.classes));
  if(!al.length) return null;
  const parts=[],miss=[]; let tot=0;
  for(const a of al){ const L=lines.find(l=>l.id===a.line); const ln=landNeed(a.line,a.classes,a.model,L);
    if(ln){ tot+=ln.d; parts.push(`${_lineShortById(a.line,lines)} ${num(a.classes)} כ׳ → ${fmtN(ln.d,1)}`); }
    else miss.push(_lineShortById(a.line,lines)+(/ספר/.test(L&&L.inst||'')?' (בחרו דגם)':'')); }
  const area=cellAreaM2(idx[cn])/1000;
  if(!tot) return {info:true,txt:`תא ${cn}: ${fmtN(area,1)} ד׳${miss.length?` · אין תקן להשוואה: ${miss.join(', ')}`:''}`};
  const ev=evalSupply(area,tot,Math.max(0.05,tot*0.03));
  const t=`תא ${cn}: נדרש ${fmtN(tot,1)} ד׳ (${parts.join(' + ')})${miss.length?` + ${miss.join(', ')}`:''} · בתא ${fmtN(area,1)} ד׳`;
  return ev.cls==='short'?{ok:false,txt:t+` — חסר ${fmtN(tot-area,1)} ד׳`}:ev.cls==='surplus'?{info:true,txt:t+` — עודף ניכר (${fmtN(ev.pct,0)}%)`}:{ok:true,txt:t+(ev.cls==='margin'?' — מרווח ביטחון':'')};
}
function cellBuiltCheck(cn){
  const lines=_eduLines();
  const al=_cellAllocs(cn).filter(a=>a.mode==='built'&&!isShared(a)&&num(a.classes));
  if(!al.length) return null;
  let need=0; const parts=[];
  for(const a of al){ const b=builtNeed(a.line,a.classes); if(b){ need+=b.m; parts.push(`${_lineShortById(a.line,lines)} ${num(a.classes)} כ׳ → ${fmtN(b.m)}`); } }
  const decl=al.reduce((t,a)=>t+(num(a.built)||0),0), t5=t5PublicSqm(t5Of(cn)), have=decl||t5;
  if(!need||!have) return null;
  const ev=evalSupply(have,need,need*0.03);
  const t=`תא ${cn}: נדרש ${fmtN(need)} מ"ר בנוי (${parts.join(' + ')}) · ${decl?'בנספח':'בטבלה 5'} ${fmtN(have)} מ"ר`;
  return ev.cls==='short'?{ok:false,txt:t+' — חסר'}:ev.cls==='surplus'?{info:true,txt:t+` — עודף (${fmtN(ev.pct,0)}%)`}:{ok:true,txt:t+(ev.cls==='margin'?' — מרווח ביטחון':'')};
}

PR.walkGo=function(cn){
  const w=_walk(); cn=String(cn);
  const Q=walkQueue(); w.cur=cn; w.phase=Q.built.includes(cn)&&!Q.land.includes(cn)?'built':'land';
  PR.tab='walk'; PR.render(); PR.walkFocus(cn); safeRedraw();
};
PR.walkStart=function(phase){
  const w=_walk(), Q=walkQueue(), list=phase==='built'?Q.built:Q.land;
  if(!list.length){ w.phase=phase==='built'?'summary':'built'; if(w.phase==='built'&&!Q.built.length) w.phase='summary'; w.cur=null; PR.render(); return; }
  PR.walkGo(list.find(c=>!w.done[c])||list[0]);
};
PR.walkNext=function(dir){
  const w=_walk(), Q=walkQueue(), list=w.phase==='built'?Q.built:Q.land;
  if(w.cur&&dir>0) w.done[w.cur]=true;
  const i=list.indexOf(w.cur), j=i+(dir||1);
  if(j>=0&&j<list.length) return PR.walkGo(list[j]);
  if(dir<0) return;
  // סוף השלב: חומים → סחירים → סיכום
  w.cur=null; w.phase=w.phase==='land'&&Q.built.length?'builtIntro':'summary';
  PR.render(); safeRedraw();
};
// הקצאה ישנה בתא (למשל ממענה שהתפרס על כמה תאים) → הקצאת "תא אחר תא" לתא הזה, לעריכה בכפתורים
PR.walkAdopt=function(id){
  const a=_alloc(id), cn=_walk().cur; if(!a||!cn) return;
  if(a.cells.length<=1){ a.src='walk'; }
  else { a.cells=a.cells.filter(c=>c!==cn);
    PR.spec.provision.push({id:'a'+Date.now().toString(36)+(_aSeq++),line:a.line,lines:a.lines,mode:a.mode,cells:[cn],classes:'',land:'',built:'',model:a.model||'',note:'',src:'walk',alt:a.alt}); }
  PR.render(); safeRedraw();
};
// מענה שאינו בתא שטח: בשילוב במוסד אחר / מחוץ לתכנית / לא ניתן מענה (למשל חינוך מיוחד)
PR.walkAddOff=function(lineId,mode){
  PR.spec.provision.push({id:'a'+Date.now().toString(36)+(_aSeq++),line:lineId,mode,cells:[],classes:'',land:'',built:'',model:'',note:''});
  PR.render(); safeRedraw();
};
PR.walkPhase=function(p){ const w=_walk(); w.phase=p; if(p!=='land'&&p!=='built') w.cur=null; PR.render(); safeRedraw(); };
PR.walkToggleType=function(lineId){
  const w=_walk(), cn=w.cur; if(!cn) return;
  const ex=_walkAllocs(cn).find(a=>a.line===lineId&&!isShared(a));
  if(ex) PR.spec.provision=PR.spec.provision.filter(a=>a!==ex);
  else { const t5=w.phase==='built'?t5PublicSqm(t5Of(cn)):0;
    PR.spec.provision.push({id:'a'+Date.now().toString(36)+(_aSeq++),line:lineId,mode:w.phase==='built'?'built':'land',cells:[cn],
      classes:'',land:'',built:'',model:'',note:'',src:'walk',alt:_wCell(cn).alt||undefined}); }
  const m=_wCell(cn); m.reserve=false;
  PR.render(); safeRedraw();
};
PR.walkSet=function(id,f,v){
  const a=_alloc(id); if(!a) return;
  if(f==='classesStep'){ a.classes=String(Math.max(0,(num(a.classes)||0)+v)); if(a.classes==='0') a.classes=''; PR.render(); safeRedraw(); return; }
  a[f]=v; if(f==='model') { PR.render(); safeRedraw(); return; }
  _walkRefresh(); safeRedraw();
};
PR.walkMeta=function(f,v){
  const cn=_walk().cur; if(!cn) return; const m=_wCell(cn);
  if(f==='other'){ if(typeof v==='number') v=OTHER_USES[v]; m.other=m.other.includes(v)?m.other.filter(x=>x!==v):[...m.other,v]; }
  else if(f==='reserve'){ m.reserve=!m.reserve; }
  else if(f==='alt'){ m.alt=!m.alt; for(const a of _walkAllocs(cn)) a.alt=m.alt||undefined; }
  else m[f]=v;
  PR.render(); safeRedraw();
};
PR.walkSplit=function(base,v){ const w=_walk(); w.split[base]=v===''?null:v; _walkRefresh(); };
// מיקוד המפה בתא הנוכחי
PR.walkFocus=function(cn){
  try{
    const fs=cellIndex()[cn]; if(!fs||typeof dc!=='function') return;
    // קנה מידה מוחלט (לא יחסי — שלא יצטבר): התא תופס ~30% מהמסך, אבל רואים לפחות 350 מ׳ סביבו (הקשר)
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const f of fs){ const g=f.geometry; const P=g.type==='Polygon'?[g.coordinates]:g.coordinates; for(const p of P) for(const [x,y] of p[0]){ x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} }
    const W=wrap.clientWidth,H=wrap.clientHeight, mpu=_mPerUnit()||1;
    const span=Math.max((x1-x0)/0.3,(y1-y0)/0.3*W/H,350/mpu); // יחידות נתונים לרוחב המסך
    const target=W/span;
    const p=cellCentroid(fs)||[(x0+x1)/2,(y0+y1)/2];
    let [sx,sy]=dc(p[0],p[1]); zoomAt(sx,sy,target/scale);
    [sx,sy]=dc(p[0],p[1]); viewX+=W/2-sx; viewY+=H/2-sy; redraw();
  }catch(e){}
};

// ── תצוגה ──
function _walkTypeButtons(cn,lines,phase){
  const al=_walkAllocs(cn);
  const btn=(L)=>{ const on=al.some(a=>a.line===L.id&&!isShared(a)); const c=(EDU_META[eduBase(L.id)]||{}).color;
    return `<button class="pr-wt${on?' on':''}" style="--c:${c}" onclick="PR.walkToggleType('${L.id}')"><span class="pr-dot" style="background:${c}"></span>${E(eduShort(L))}</button>`; };
  const main=lines.filter(L=>!L.special), se=lines.filter(L=>L.special);
  return `<div class="pr-wq">מה הנספח מציע ${phase==='built'?'להקצאה המבונה ב':'ב'}תא הזה? <span class="pr-small">(אפשר לבחור כמה)</span></div>
    <div class="pr-wts">${main.map(btn).join('')}</div>
    ${se.length?`<div class="pr-wts sm"><span class="pr-small">חינוך מיוחד:</span>${se.map(btn).join('')}</div>`:''}`;
}
function _walkAllocRows(cn,lines,phase){
  return _walkAllocs(cn).filter(a=>!isShared(a)).map(a=>{
    const L=lines.find(l=>l.id===a.line)||{id:a.line,inst:''}; const c=(EDU_META[eduBase(a.line)]||{}).color;
    const school=/ספר/.test(L.inst||'')&&!L.special;
    const models=school?`<div class="pr-wm"><span class="pr-small">דגם:</span>${['A','B','C','model_1','model_2'].map(m=>`<button class="pr-wmb${a.model===m?' on':''}" onclick="PR.walkSet('${a.id}','model','${a.model===m?'':m}')">${m.replace('model_','דגם ')}</button>`).join('')}</div>`:'';
    return `<div class="pr-wrow" style="border-color:${c}">
      <b style="min-width:70px"><span class="pr-dot" style="background:${c}"></span>${E(eduShort(L))}</b>
      <div class="pr-step"><button onclick="PR.walkSet('${a.id}','classesStep',-1)">−</button>
        <input value="${E(a.classes??'')}" placeholder="?" oninput="PR.walkSet('${a.id}','classes',this.value)"><button onclick="PR.walkSet('${a.id}','classesStep',1)">+</button><span class="pr-small">כיתות</span></div>
      ${phase==='built'?`<label class="pr-small">מ"ר בנוי <input class="pr-in-s" value="${E(a.built??'')}" placeholder="${fmtN(t5PublicSqm(t5Of(cn)))}" oninput="PR.walkSet('${a.id}','built',this.value)" title="לפי הנספח (ריק = לפי טבלה 5)"></label>`:''}
      ${models}</div>`;
  }).join('');
}
function _walkOtherRow(cn){
  const m=_wCell(cn);
  return `<div class="pr-wq" style="margin-top:10px">ולא-חינוך:</div><div class="pr-wts sm">
    ${OTHER_USES.map((u,i)=>`<button class="pr-wt${m.other.includes(u)?' on':''}" style="--c:#7f8c8d" onclick="PR.walkMeta('other',${i})">🏛 ${E(u)}</button>`).join('')}
    <button class="pr-wt${m.reserve?' on':''}" style="--c:#95a5a6" onclick="PR.walkMeta('reserve')">⬜ עתודה / לא מוגדר</button></div>
    <label class="pr-walt"><input type="checkbox" ${m.alt?'checked':''} onchange="PR.walkMeta('alt')"> <b>?</b> הנספח מציע כאן <b>כמה שימושים חלופיים</b> (למשל "גנים / מעונות / בית כנסת") — לא ודאי</label>`;
}
function _walkLive(cn,phase){
  const out=[];
  if(phase==='built'){ const b=cellBuiltCheck(cn); if(b) out.push(b); }
  else { const l=cellLandCheck(cn); if(l) out.push(l); const t=t5CellCheck(cn,'land'); if(t&&!t.ok) out.push(t); }
  return out.map(chk).join('');
}
function _walkRefresh(){ const el=$('pr-wlive'); const w=_walk(); if(el&&w.cur) el.innerHTML=_walkLive(w.cur,w.phase); const s=$('pr-wsum'); if(s&&w.phase==='summary') s.innerHTML=_walkSummaryBody(); }
function _walkDots(list,w){
  return `<div class="pr-wdots">${list.map(c=>{ const al=_cellAllocs(c), m=w.cells[c]||{};
    const col=al.length?(EDU_META[eduBase(al[0].line)]||{}).color:(m.other&&m.other.length)?'#7f8c8d':m.reserve?'#95a5a6':'';
    return `<button class="pr-wd${c===w.cur?' cur':''}${w.done[c]?' done':''}" style="${col?`--c:${col}`:''}" onclick="PR.walkGo('${c}')" title="תא ${c}">${c}</button>`; }).join('')}</div>`;
}
function _renderWalk(){
  const A=computeAssumptions(PR.spec);
  if(A.T.pop==null) return `<div class="pr-note">מלאו קודם את ההנחות (לשונית <b>זהות והנחות</b>) — כך הממשק ידע כמה כיתות נדרשות.</div>`;
  if(typeof state==='undefined'||!state.layers||!state.layers.plan) return `<div class="pr-note">טענו תשריט.</div>`;
  const w=_walk(), Q=walkQueue(), lines=_eduLines();
  const nDone=l=>l.filter(c=>w.done[c]).length;
  const prog=`<div class="pr-wprog"><span class="${w.phase==='land'?'on':''}" onclick="PR.walkStart('land')">① חומים ${nDone(Q.land)}/${Q.land.length}</span>
    <span class="${w.phase==='built'||w.phase==='builtIntro'?'on':''}" onclick="PR.walkPhase('builtIntro')">② הקצאות מבונות ${nDone(Q.built)}/${Q.built.length}</span>
    <span class="${w.phase==='summary'?'on':''}" onclick="PR.walkPhase('summary')">③ תמונת הנספח</span></div>`;
  if(w.phase==='intro') return prog+`<div class="pr-wcard intro"><div class="pr-wbig">🎯 נעבור על התשריט תא אחר תא</div>
    <p>לכל תא — מסתכלים בנספח ולוחצים מה היועץ הציע בו (מעון, גן, בית ספר…) וכמה כיתות. המפה תתמקד בכל תא בתורו.</p>
    <p>① <b>${Q.land.length} תאים חומים</b> (מבנים ומוסדות ציבור) · ② <b>${Q.built.length} מגרשים סחירים עם שטח ציבורי מבונה</b> בטבלה 5${state.table5?'':' (טענו טבלה 5 כדי לאתר אותם)'} · ③ תמונה מסכמת מול הדרישות.</p>
    <p class="pr-small">טיפ: אפשר גם ללחוץ על תא במפה כדי לקפוץ אליו. Enter = הבא.</p>
    <button class="pr-wgo" onclick="PR.walkStart('land')">בואו נתחיל ←</button></div>`;
  if(w.phase==='builtIntro'){
    const sp=b=>`<input class="pr-in-s" value="${E(w.split[b]??'')}" placeholder="?" oninput="PR.walkSplit('${b}',this.value)">`;
    return prog+`<div class="pr-wcard intro"><div class="pr-wbig">② הקצאות מבונות במגרשים סחירים</div>
      <p>לפני שעוברים על המגרשים: <b>איך הנספח מחלק בין קרקע למבונה?</b> <span class="pr-small">(לא חובה — אם הנספח מציין)</span></p>
      <div class="pr-wsplit"><span><span class="pr-dot" style="background:${EDU_META.maon.color}"></span>מעונות: ${sp('maon')} % בקרקע (השאר במבונה)</span>
        <span><span class="pr-dot" style="background:${EDU_META.gan.color}"></span>גנים: ${sp('gan')} % בקרקע</span></div>
      <p class="pr-small">התדריך ממליץ: במתחמים עם 10 כיתות מעון ויותר — כשליש מהן במבנה ציבורי אחר או במגרש סחיר.</p>
      ${Q.built.length?`<button class="pr-wgo" onclick="PR.walkStart('built')">למגרשים הסחירים (${Q.built.length}) ←</button>`:'<p>אין בטבלה 5 מגרשים סחירים עם שטח ציבורי.</p>'}
      <button class="pr-btn" onclick="PR.walkPhase('summary')">דלג לתמונת הנספח</button></div>`;
  }
  if(w.phase==='summary') return prog+`<div id="pr-wsum">${_walkSummaryBody()}</div>`;
  // צעד: תא אחד
  const cn=w.cur, list=w.phase==='built'?Q.built:Q.land, i=list.indexOf(cn);
  const fs=cellIndex()[cn]; const area=fs?cellAreaM2(fs)/1000:null;
  const t5=t5Of(cn), yi=t5&&t5.length?t5[0].yiud:(fs?cellLandUse(fs):'');
  const pubB=w.phase==='built'?t5PublicSqm(t5):null;
  const other=_cellAllocs(cn).filter(a=>a.src!=='walk');
  return prog+_walkDots(list,w)+`<div class="pr-wcard">
    <div class="pr-whdr"><span class="pr-wnum">תא ${E(cn)}</span><span>${E(yi)}</span><span>${area!=null?fmtN(area,2)+' ד׳':''}</span>
      ${pubB?`<span class="pr-wb">🏢 ${fmtN(pubB)} מ"ר ציבורי בטבלה 5</span>`:''}<span class="pr-small" style="margin-right:auto">${i+1} מתוך ${list.length}</span></div>
    ${other.length?`<div class="pr-wold"><span class="pr-small">הוזן קודם (בשיטה הישנה):</span> ${other.map(a=>`<span class="pr-chip used">${E(_classesLabel(a,lines,a.cells.length===1))}${a.cells.length>1?` <span class="pr-small">(${a.cells.length} תאים)</span>`:''}
        <button onclick="PR.walkAdopt('${a.id}')" title="להעביר לעריכה כאן, בתא הזה">✎</button><button onclick="PR.removeCell('${a.id}','${E(cn)}')" title="להסיר מהתא הזה">✕</button></span>`).join(' ')}</div>`:''}
    ${_walkTypeButtons(cn,lines,w.phase)}
    <div class="pr-wrows">${_walkAllocRows(cn,lines,w.phase)}</div>
    ${_walkOtherRow(cn)}
    <div id="pr-wlive" class="pr-wlive">${_walkLive(cn,w.phase)}</div>
    <div class="pr-wnav"><button class="pr-btn" onclick="PR.walkNext(-1)" ${i<=0?'disabled':''}>→ הקודם</button>
      <button class="pr-wgo" onclick="PR.walkNext(1)">${i===list.length-1?(w.phase==='land'?'סיום החומים ✓':'לתמונת הנספח ✓'):'הבא ←'}</button></div></div>`;
}
// תמונת הנספח: כמה כיתות בקרקע / במבונה / חלופי לכל סוג, מול הנדרש; בדיקות התאים; כיסוי
function _walkSummaryBody(){
  const w=_walk(), lines=_eduLines(), Q=walkQueue();
  const rows=lines.map(L=>{
    const d=_dem(L.id), need=num(d.declared&&d.declared.classes)??L.classesRounded;
    const al=_allocsOf(L.id).filter(a=>!isShared(a));
    const sum=f=>al.filter(f).reduce((t,a)=>t+(num(a.classes)||0),0);
    const land=sum(a=>a.mode==='land'&&!a.alt), built=sum(a=>a.mode==='built'&&!a.alt), alt=sum(a=>a.alt), other=sum(a=>a.mode==='combined'||a.mode==='outside');
    const shared=_allocsOf(L.id).some(isShared);
    const tot=land+built+other, ev=evalSupply(tot,need,0);
    const st=!al.length&&!shared?'<span class="pr-st diff">⚠ לא נמצא מענה</span>'
      :ev.cls==='short'?(tot+alt>=need?'<span class="pr-st info">◐ נסגר רק עם תאים חלופיים</span>':shared?'<span class="pr-st keys">⟷ חלק באשכול משותף</span>':`<span class="pr-st diff">⚠ חסרות ${fmtN(need-tot)}</span>`)
      :ev.cls==='surplus'?'<span class="pr-st info">ℹ עודף ניכר</span>':`<span class="pr-st ok">✓${ev.cls==='margin'?' מרווח ביטחון':''}</span>`;
    // חלוקה קרקע/מבונה שהנספח הצהיר
    let spl=''; const b=eduBase(L.id), p=num(w.split[b]);
    if(p!=null&&!L.special&&(b==='maon'||b==='gan')){ const exp=need*p/100;
      spl=Math.abs(land-exp)<=1?`<span class="pr-st ok" title="לפי ${p}% בקרקע">✓ ${p}% בקרקע</span>`:`<span class="pr-st diff" title="לפי ${p}% בקרקע צפויות ${fmtN(exp,1)} כיתות בקרקע">⚠ צפויות ${fmtN(exp,0)} בקרקע</span>`; }
    const cls=v=>v?fmtN(v):'<span class="pr-small">—</span>';
    return `<tr><td><span class="pr-dot" style="background:${(EDU_META[b]||{}).color}"></span>${E(eduShort(L))}</td><td class="num"><b>${fmtN(need)}</b></td>
      <td class="num">${cls(land)}</td><td class="num">${cls(built)}</td><td class="num">${cls(other)}</td><td class="num">${alt?`<span class="pr-small">+${fmtN(alt)}</span>`:''}</td><td>${st} ${spl}</td></tr>`;
  }).join('');
  const cellsChk=[...Q.land.map(cellLandCheck),...Q.built.map(cellBuiltCheck)].filter(Boolean);
  const bad=cellsChk.filter(c=>!c.ok&&!c.info), good=cellsChk.filter(c=>c.ok);
  const skipped=[...Q.land,...Q.built].filter(c=>!_cellAllocs(c).length&&!((w.cells[c]||{}).other||[]).length&&!(w.cells[c]||{}).reserve);
  const cov=Object.keys(EDU_META).map(b=>{ const c=coverage(b); return c.pct==null?'':`<span class="pr-covb ${c.pct>=90?'ok':'bad'}"><span class="pr-dot" style="background:${EDU_META[b].color}"></span>${EDU_META[b].short} ${fmtN(c.pct,0)}%${c.pctAlt!=null?` <span class="pr-small">(${fmtN(c.pctAlt,0)}% עם חלופיים)</span>`:''}</span>`; }).join('');
  return `<div class="pr-wcard"><div class="pr-wbig">ההקצאה שהנספח מציע — מול הדרישות</div>
    <table class="pr-tbl pr-sumtbl"><tr><th>סוג</th><th>נדרש</th><th>בקרקע</th><th>במבונה</th><th>אחר</th><th>חלופי</th><th>מצב</th></tr>${rows}</table>
    <div class="pr-small" style="margin:4px 0 10px">נדרש = מה שהוזן כ"הנספח אומר" בלשונית ביקוש (או התדריך). "אחר" = בשילוב במוסד אחר / מחוץ לתכנית — ר׳ למטה.</div>
    ${_walkOffCells(lines)}
    <div class="pr-cg"><div class="pr-cg-h">שטח התאים מול מכסות התדריך <span class="pr-small">${good.length} ✓ · ${bad.length} ⚠</span></div>
      ${cellsChk.length?cellsChk.sort((a,b)=>(a.ok?1:0)-(b.ok?1:0)).map(c=>chk(c)).join(''):'<div class="pr-small">אין עדיין תאים עם כיתות.</div>'}</div>
    <div class="pr-cg"><div class="pr-cg-h">מקרא לתשריט</div><div class="pr-legend"><span><i class="lg-t5b"></i>הקצאה מבונה — שטח ציבורי במגרש סחיר (לפי טבלה 5)</span>
      <span class="pr-small">על כל תא — תגית עם מה שהוצע בו · "?" = שימוש חלופי</span></div></div>
    ${_renderRadii()}
    ${skipped.length?`<div class="pr-cg"><div class="pr-cg-h">תאים בלי הזנה (${skipped.length})</div><div class="pr-wdots">${skipped.map(c=>`<button class="pr-wd" onclick="PR.walkGo('${c}')">${c}</button>`).join('')}</div></div>`:''}
  </div>`;
}
// מענים שאינם בתא שטח — לכל סוג: רשימה + הוספה (בעיקר לחינוך מיוחד: "בשילוב עם גן" וכד')
function _walkOffCells(lines){
  const OFF=[['combined','בשילוב במוסד אחר'],['outside','מחוץ לתכנית'],['none','לא ניתן מענה']];
  const rows=lines.map(L=>{
    const al=_allocsOf(L.id).filter(a=>a.mode==='combined'||a.mode==='outside'||a.mode==='none');
    const c=(EDU_META[eduBase(L.id)]||{}).color;
    const items=al.map(a=>`<div class="pr-wrow" style="border-color:${c}">
        <span class="pr-small" style="min-width:110px">${E(ALLOC_MODE_LABEL[a.mode])}</span>
        ${a.mode!=='none'?`<div class="pr-step"><button onclick="PR.walkSet('${a.id}','classesStep',-1)">−</button><input value="${E(a.classes??'')}" placeholder="?" oninput="PR.walkSet('${a.id}','classes',this.value)"><button onclick="PR.walkSet('${a.id}','classesStep',1)">+</button><span class="pr-small">כיתות</span></div>`:''}
        <input class="pr-in-note" data-a="${a.id}.note" value="${E(a.note??'')}" oninput="PR.onAlloc(this)" placeholder="${a.mode==='combined'?'בשילוב עם… (למשל: גן / בית ספר)':'הערה מהנספח'}">
        <button class="pr-del" onclick="PR.delAlloc('${a.id}')" title="מחיקה">🗑</button></div>`).join('');
    return `<div class="pr-offl"><span class="pr-offn"><span class="pr-dot" style="background:${c}"></span>${E(eduShort(L))}</span>
      ${OFF.map(([m,l])=>`<button class="pr-wmb" onclick="PR.walkAddOff('${L.id}','${m}')">+ ${l}</button>`).join('')}</div>${items}`;
  }).join('');
  return `<details class="pr-cg pr-offd"${lines.some(L=>_allocsOf(L.id).some(a=>!a.cells.length))?' open':''}><summary class="pr-cg-h">מענה שאינו בתא שטח <span class="pr-small">— בשילוב במוסד אחר, מחוץ לתכנית (למשל חינוך מיוחד)</span></summary>${rows}</details>`;
}
PR.getSpec=function(){ return PR.spec; };
PR.setSpec=function(s){ PR.spec=normalizeSpec(s); if(PR.open) PR.render(); };
PR.reset=function(){ PR.spec=emptySpec(); PR.close(); };

document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||!PR.open||PR.tab!=='walk') return;
  const w=PR.spec.walk; if(!w||!w.cur||!(w.phase==='land'||w.phase==='built')) return;
  if(e.target&&(e.target.tagName==='TEXTAREA'||e.target.tagName==='BUTTON')) return;
  e.preventDefault(); PR.walkNext(1);
});
PR.NORMS=NORMS; PR.Engine=Engine;
root.PR=PR;
root.openProgReader=function(){ PR.toggle(); };
// פרויקט שנטען לפני שהקובץ הזה נטען
if(root._PR_PENDING!==undefined){ PR.setSpec(root._PR_PENDING); root._PR_PENDING=undefined; }

})(typeof window!=='undefined'?window:globalThis);
