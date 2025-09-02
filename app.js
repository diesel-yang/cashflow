/* =========================================================================
   極速記帳 v3.3 - app.js  (Firebase Realtime DB + 本機快取可關)
   更新：v17.4（個人分類改版＋醫療、一次性遷移、月結三等份＋預支扣回、月結入帳、基金專戶）
   作者：你 & 助手
   ======================================================================= */

/* =========================
   簡易工具
   ========================= */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const fmt = (n)=> (n||0).toLocaleString();
const todayISO = () => new Date().toISOString().slice(0,10);
const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

function toast(msg){
  let box = $('#toast');
  if(!box){
    box = document.createElement('div');
    box.id='toast';
    Object.assign(box.style,{
      position:'fixed',left:'50%',bottom:'24px',transform:'translateX(-50%)',
      background:'rgba(0,0,0,.75)',color:'#fff',padding:'8px 12px',
      borderRadius:'8px',fontSize:'14px',zIndex:9999,opacity:'0'
    });
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.style.opacity='1';
  setTimeout(()=>{ box.style.opacity='0'; },1500);
}

const FUND_ACCOUNT = '餐廳_基金帳';
function monthKey(date){
  const y = date.getFullYear();
  const m = (date.getMonth()+1).toString().padStart(2,'0');
  return `${y}-${m}`;
}

/* =========================
   狀態 / 預設
   ========================= */
const VERSION = 'v17.4 2025-09-02';

const defaultCategories = [
  // 餐廳（營業）
  { label:'現場銷售', kind:'revenue' },
  { label:'外送平台', kind:'revenue' },
  { label:'批發/通路', kind:'revenue' },
  { label:'其他收入', kind:'revenue' },

  // 銷貨成本
  { label:'食材-肉類', kind:'cogs' },
  { label:'食材-蔬果', kind:'cogs' },
  { label:'海鮮',     kind:'cogs' },
  { label:'調味/乾貨', kind:'cogs' },
  { label:'飲品原料', kind:'cogs' },
  { label:'包材',     kind:'cogs' },
  { label:'清潔耗材', kind:'cogs' },

  // 人事
  { label:'正職薪資', kind:'personnel' },
  { label:'勞健保',   kind:'personnel' },
  { label:'獎金/三節', kind:'personnel' },

  // 水電/租金/網路
  { label:'租金',     kind:'utilities' },
  { label:'水費',     kind:'utilities' },
  { label:'電費',     kind:'utilities' },
  { label:'瓦斯',     kind:'utilities' },
  { label:'網路/手機', kind:'utilities' },

  // 行銷
  { label:'廣告行銷', kind:'marketing' },
  { label:'拍攝設計', kind:'marketing' },
  { label:'活動攤費', kind:'marketing' },

  // 物流/運輸
  { label:'物流運費', kind:'logistics' },

  // 行政/稅務
  { label:'稅捐(5%)', kind:'admin' },
  { label:'記帳/法律', kind:'admin' },
  { label:'工具器具', kind:'admin' },
  { label:'設備購置', kind:'admin' },

  // 個人支出（9 大項）
  { label:'飲食',   kind:'p_expense' },
  { label:'治裝',   kind:'p_expense' },
  { label:'住房',   kind:'p_expense' },
  { label:'交通',   kind:'p_expense' },
  { label:'教育',   kind:'p_expense' },
  { label:'娛樂',   kind:'p_expense' },
  { label:'稅捐',   kind:'p_expense' },
  { label:'其他',   kind:'p_expense' },
  { label:'醫療',   kind:'p_expense' },

  // 個人收入（細項）
  { label:'薪資收入-月薪',     kind:'p_income' },
  { label:'薪資收入-兼差',     kind:'p_income' },
  { label:'投資獲利-存款利息', kind:'p_income' },
  { label:'投資獲利-股利',     kind:'p_income' },
  { label:'投資獲利-債券利息', kind:'p_income' },
  { label:'其他-資產出售',     kind:'p_income' },
  { label:'其他-退稅金額',     kind:'p_income' },
];

const PL_BUCKETS = ['revenue','cogs','personnel','utilities','marketing','logistics','admin'];

const state = {
  // 資料
  records: [],     // 記帳/報銷/轉帳流水
  categories: [],  // {label, kind}
  quicks: [],      // { id,label,type,cat,amt,who,owner? }
  budgets: { restaurant: [], jack: [], wal: [], nearOver: 0.9 },
  dues: { jack:0, wal:0 },  // 報銷應付
  // UI
  month: new Date(), // 當月
  tab: 'record',
  space: '',         // 共享空間代號（Firebase DB key）
  // 同步
  useCloud: true,
  writeLocal: false,
  isLoading: false,
};

/* =========================
   Firebase 啟動（可選）
   ========================= */
let fb = { app:null, db:null, rtdb:null, ref:null, onValue:null, get: null, set: null, update:null };
async function initFirebase(){
  if (!window.firebaseConfig) { state.useCloud = false; return; }
  // 走 CDN v9 模組化（由 index.html 掛到 window.firebase / window.firebaseDatabase）
  const { initializeApp } = window.firebase;
  const { getDatabase, ref, onValue, get, set, update } = window.firebaseDatabase;
  fb.app = initializeApp(window.firebaseConfig);
  fb.rtdb = getDatabase(fb.app);
  fb.ref = ref; fb.onValue = onValue; fb.get = get; fb.set = set; fb.update = update;
}

/* =========================
   本機快取（可關）
   ========================= */
function saveLocal(){
  if (!state.writeLocal) return;
  const payload = {
    records: state.records,
    categories: state.categories,
    quicks: state.quicks,
    budgets: state.budgets,
    dues: state.dues,
    space: state.space,
    month: state.month.toISOString()
  };
  localStorage.setItem('cf.data', JSON.stringify(payload));
}
function loadLocal(){
  try{
    const raw = localStorage.getItem('cf.data');
    if(!raw) return;
    const d = JSON.parse(raw);
    state.records = d.records || [];
    state.categories = d.categories || [];
    state.quicks = d.quicks || [];
    state.budgets = d.budgets || state.budgets;
    state.dues = d.dues || state.dues;
    state.space = d.space || state.space;
    if (d.month) state.month = new Date(d.month);
  }catch(e){}
}

/* =========================
   雲端同步
   ========================= */
function cloudPath(){
  const s = (state.space||'default').trim().toLowerCase();
  return `cashflow/${s}`;
}
async function pullCloud(){
  if(!state.useCloud || !fb.rtdb) return;
  state.isLoading = true;
  const snap = await fb.get(fb.ref(fb.rtdb, cloudPath()));
  if (snap.exists()){
    const data = snap.val();
    state.records = data.records || [];
    state.categories = data.categories || [];
    state.quicks = data.quicks || [];
    state.budgets = data.budgets || state.budgets;
    state.dues = data.dues || state.dues;
  }else{
    // 首次：灌入預設分類
    if (!state.categories || !state.categories.length) {
      state.categories = defaultCategories.slice();
      await pushCloud(); // 建立主檔
    }
  }
  state.isLoading = false;
  render();
}
async function pushCloud(){
  if(!state.useCloud || !fb.rtdb) return;
  const data = {
    records: state.records,
    categories: state.categories,
    quicks: state.quicks,
    budgets: state.budgets,
    dues: state.dues,
    _ts: Date.now()
  };
  await fb.set(fb.ref(fb.rtdb, cloudPath()), data);
}

/* =========================
   工具：分類 kind 查詢
   ========================= */
function getKindByLabel(label){
  const cat = (state.categories||[]).find(c=>c.label===label);
  return cat?.kind || '';
}

/* =========================
   記錄 / 轉帳 / 類別 / 快捷
   ========================= */
function addRecord({type, owner, who, cat, amt, note, ts, receipt}){
  const row = {
    id: uid(),
    type,       // 'income' | 'expense' | 'transfer'
    owner,      // 'RESTAURANT' | 'JACK' | 'WAL' | 'JW'
    who,
    cat, amt: Number(amt)||0, note: note||'',
    ts: ts || Date.now(),
    receipt: receipt || null
  };

  // 共同（JW）自動拆半到 JACK/WAL
  if (owner === 'JW' && (type==='expense' || type==='income')){
    const half = Math.round(row.amt/2);
    const a = { ...row, id: uid(), owner:'JACK', note: `${row.note||''}（共同拆分）`, amt: half };
    const b = { ...row, id: uid(), owner:'WAL',  note: `${row.note||''}（共同拆分）`, amt: row.amt-half };
    state.records.push(a,b);
  }else{
    state.records.push(row);
  }

  // ✅ 報銷應付的正確條件：餐廳費用由個人代墊（非個人支出）
  // owner=RESTAURANT、who=JACK|WAL、type=expense、kind !== 'p_expense'
  if (owner==='RESTAURANT' && (who==='JACK'||who==='WAL') && type==='expense'){
    const kind = getKindByLabel(cat);
    if (kind !== 'p_expense'){ // 不是個人支出 → 才算報銷
      state.dues[who.toLowerCase()] += Number(row.amt)||0;
    }
  }
}

function addTransfer({from, to, amt, note, ts}){
  const row = { id:uid(), type:'transfer', from, to, amt:Number(amt)||0, note:note||'', ts: ts||Date.now() };
  state.records.push(row);

  // 自動沖銷：餐廳_銀行/現金 -> JACK/WAL 視為報銷還款
  if ((from||'').startsWith('餐廳_') && (to==='JACK'||to==='WAL')){
    const key = to.toLowerCase();
    const paid = Math.min(state.dues[key], row.amt);
    state.dues[key] = Math.max(0, state.dues[key]-paid);
  }
}

// 快捷
function addQuick({label,type,cat,amt,who,owner='RESTAURANT'}){
  state.quicks.push({ id:uid(), label,type,cat,amt:Number(amt)||0, who, owner });
}
function removeQuick(id){
  state.quicks = state.quicks.filter(q=>q.id!==id);
}

/* =========================
   報表：P&L（餐廳）
   ========================= */
function getRestaurantMonthRows(date=new Date()){
  const y = date.getFullYear(), m = date.getMonth();
  const rows = (state.records||[]).filter(r=>{
    const d = new Date(r.ts||Date.now());
    return d.getFullYear()===y && d.getMonth()===m && r.owner==='RESTAURANT';
  }).map(r=>{
    const kind = getKindByLabel(r.cat) || 'admin';
    return { ...r, kind };
  });
  return rows;
}

function renderReport(){
  const box = $('#report-box'); if(!box) return;
  const rows = getRestaurantMonthRows(state.month);

  const sum = { revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0 };
  for(const r of rows){
    if (r.type==='income' && r.kind==='revenue') sum.revenue += r.amt||0;
    if (r.type==='expense'){
      if (PL_BUCKETS.includes(r.kind)) sum[r.kind] += r.amt||0;
      else sum.admin += r.amt||0;
    }
  }
  const gross = sum.revenue - sum.cogs;
  const opex  = sum.personnel+sum.utilities+sum.marketing+sum.logistics+sum.admin;
  const net   = gross - opex;
  const cogsPct = sum.revenue? (sum.cogs/sum.revenue):0;
  const personnelPct = sum.revenue? (sum.personnel/sum.revenue):0;

  const expand = $('#rep-expand')?.checked;
  const byKind = $('#rep-by-kind')?.checked;

  let detailsHTML = '';
  if (expand){
    const groups = {};
    for(const r of rows){
      const k = (r.type==='income') ? 'revenue' : r.kind;
      (groups[k] ||= []).push(r);
    }
    const order = ['revenue','cogs','personnel','utilities','marketing','logistics','admin'];
    const titleMap = {
      revenue:'營業收入 (Revenue)', cogs:'銷貨成本 (COGS)', personnel:'人事費 (Personnel)',
      utilities:'水電/租金 (Utilities)', marketing:'行銷 (Marketing)',
      logistics:'物流 (Logistics)', admin:'行政/稅務 (Admin)'
    };
    detailsHTML = order.map(k=>{
      const arr = groups[k]; if(!arr||!arr.length) return '';
      const subtotal = (k==='revenue'? sum.revenue: sum[k])||0;
      const lines = arr.sort((a,b)=>(a.ts||0)-(b.ts||0)).map(r=>`
        <div class="row small">
          <div class="muted" style="flex:0 0 8em">${new Date(r.ts).toLocaleDateString()}</div>
          <div>${r.cat}${r.note?`｜${r.note}`:''}</div>
          <div style="text-align:right;flex:0 0 6em">${r.type==='income'?'+':'-'}${fmt(r.amt)}</div>
        </div>
      `).join('');
      return `
        <div class="card soft">
          <div class="row bold"><div>${titleMap[k]}</div><div style="text-align:right">${fmt(subtotal)}</div></div>
          <div>${lines}</div>
        </div>
      `;
    }).join('');
  }

  const simpleIncome = sum.revenue, simpleExpense = sum.cogs+opex, simpleNet = simpleIncome-simpleExpense;

  const kindHTML = byKind ? `
    <div class="card">
      <div class="row"><div>營業收入 (Revenue)</div><div style="text-align:right">${fmt(sum.revenue)}</div></div>
      <div class="row"><div>銷貨成本 (COGS)</div><div style="text-align:right">-${fmt(sum.cogs)}</div></div>
      <hr/>
      <div class="row"><div><b>毛利 (Gross Profit)</b></div><div style="text-align:right"><b>${fmt(gross)}</b>　
        <span class="muted">COGS比率：${(cogsPct*100).toFixed(1)}%</span>
      </div></div>
      <div class="row"><div>人事費 (Personnel)</div><div style="text-align:right">-${fmt(sum.personnel)}　
        <span class="muted">占比：${(personnelPct*100).toFixed(1)}%</span>
      </div></div>
      <div class="row"><div>水電/租金 (Utilities)</div><div style="text-align:right">-${fmt(sum.utilities)}</div></div>
      <div class="row"><div>行銷 (Marketing)</div><div style="text-align:right">-${fmt(sum.marketing)}</div></div>
      <div class="row"><div>物流 (Logistics)</div><div style="text-align:right">-${fmt(sum.logistics)}</div></div>
      <div class="row"><div>行政/稅務 (Admin)</div><div style="text-align:right">-${fmt(sum.admin)}</div></div>
      <hr/>
      <div class="row"><div><b>淨利 (Net Profit)</b></div><div style="text-align:right"><b>${fmt(net)}</b></div></div>
    </div>
  ` : `
    <div class="row"><div>營業收入 (Revenue)</div><div style="text-align:right">${fmt(sum.revenue)}</div></div>
    <div class="row"><div>銷貨成本 (COGS)</div><div style="text-align:right">-${fmt(sum.cogs)}　
      <span class="muted">COGS比率：${(cogsPct*100).toFixed(1)}%</span>
    </div></div>
    <div class="row"><div>毛利 (Gross Profit)</div><div style="text-align:right"><b>${fmt(gross)}</b></div></div>
    <div class="row"><div>人事費 (Personnel)</div><div style="text-align:right">-${fmt(sum.personnel)}　
      <span class="muted">占比：${(personnelPct*100).toFixed(1)}%</span>
    </div></div>
    <div class="row"><div>水電/租金 (Utilities)</div><div style="text-align:right">-${fmt(sum.utilities)}</div></div>
    <div class="row"><div>行銷 (Marketing)</div><div style="text-align:right">-${fmt(sum.marketing)}</div></div>
    <div class="row"><div>物流 (Logistics)</div><div style="text-align:right">-${fmt(sum.logistics)}</div></div>
    <div class="row"><div>行政/稅務 (Admin)</div><div style="text-align:right">-${fmt(sum.admin)}</div></div>
    <hr/>
    <div class="row"><div><b>淨利 (Net Profit)</b></div><div style="text-align:right"><b>${fmt(net)}</b></div></div>
  `;

  // === 月結三等份 + 預支扣回 ===
  const y = state.month.getFullYear();
  const m = (state.month.getMonth()+1).toString().padStart(2,'0');
  const ym = `${y}-${m}`;

  const settlement = computeMonthlySettlement(state.month);
  const settleHTML = `
    <div class="card" style="background:#fff7ea">
      <div style="font-weight:700;margin-bottom:6px">月結結算（${ym}）</div>
      <div class="row"><div>本月淨利</div><div><b>${fmt(settlement.net)}</b></div></div>
      <hr/>
      <div class="row"><div>營運基金（1/3）</div><div>${fmt(settlement.opFund)}</div></div>
      <div class="row"><div>Jack 基本薪資（1/3）</div><div>${fmt(settlement.baseSalary)}</div></div>
      <div class="row"><div>Was 基本薪資（1/3）</div><div>${fmt(settlement.baseSalary)}</div></div>
      <hr/>
      <div class="row"><div>Jack 當月個人預支扣回</div><div>-${fmt(settlement.jackAdvance)}</div></div>
      <div class="row"><div>Was 當月個人預支扣回</div><div>-${fmt(settlement.walAdvance)}</div></div>
      <hr/>
      <div class="row"><div><b>Jack 本月實領</b></div><div><b>${fmt(settlement.jackTakeHome)}</b></div></div>
      <div class="row"><div><b>Was 本月實領</b></div><div><b>${fmt(settlement.walTakeHome)}</b></div></div>
      <div class="row" style="gap:10px; justify-content:flex-end; margin-top:8px">
        <button id="btn-close-month" class="btn">執行月結入帳</button>
        <button id="btn-fund-allocate" class="btn">撥入營運基金</button>
      </div>
    </div>
  `;

  // 基金摘要卡
  const fundBal = getFundBalance();
  const fundHTML = `
    <div class="card" style="background:#eef6f6">
      <div style="font-weight:700;margin-bottom:6px">營運基金專戶</div>
      <div class="row"><div>帳戶名稱</div><div>${FUND_ACCOUNT}</div></div>
      <div class="row"><div>目前餘額</div><div><b>${fmt(fundBal)}</b></div></div>
      <div class="muted" style="margin-top:8px">提示：基金餘額來自「轉帳 to ${FUND_ACCOUNT}」累積；若未來動用基金，記一筆「from ${FUND_ACCOUNT} → 餐廳_銀行/現金」即可。</div>
    </div>
  `;

  box.innerHTML = `
    <div class="card">
      <div class="row"><div>收入（本月）</div><b>+${fmt(simpleIncome)}</b></div>
      <div class="row"><div>支出（本月）</div><b>-${fmt(simpleExpense)}</b></div>
      <hr/>
      <div class="row"><div>結餘</div><b>${fmt(simpleNet)}</b></div>
    </div>

    <div class="card" style="background:#eef6f6">
      <div style="font-weight:700;margin-bottom:6px">餐廳 P&L（本月）</div>
      ${kindHTML}
    </div>

    ${detailsHTML}
    ${settleHTML}
    ${fundHTML}
  `;
}

/* =========================
   月結結算（三等份 + 預支扣回）
   ========================= */
function sumPersonalAdvance(rows, who){
  // 個人預支：owner=RESTAURANT、type=expense、who=JACK/WAL、kind=p_expense
  return rows
    .filter(r => r.type==='expense' && r.who===who && r.kind==='p_expense')
    .reduce((s, r)=> s + (r.amt||0), 0);
}
function computeMonthlySettlement(date=new Date()){
  const rows = getRestaurantMonthRows(date);
  const sum = { revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0 };
  for (const r of rows){
    if (r.type==='income' && r.kind==='revenue') sum.revenue += r.amt||0;
    if (r.type==='expense'){
      if (PL_BUCKETS.includes(r.kind)) sum[r.kind] += r.amt||0;
      else sum.admin += r.amt||0;
    }
  }
  const gross = sum.revenue - sum.cogs;
  const opex  = sum.personnel+sum.utilities+sum.marketing+sum.logistics+sum.admin;
  const net   = gross - opex;                 // 本月淨利
  const base  = Math.max(0, net/3);           // 三等份（淨利<=0 時視為 0）
  const advJ  = sumPersonalAdvance(rows, 'JACK'); // JACK 當月個人預支
  const advW  = sumPersonalAdvance(rows, 'WAL');  // Was 當月個人預支

  const jackTake = Math.max(0, base - advJ);
  const walTake  = Math.max(0, base - advW);

  return {
    net,                // 本月淨利
    opFund: base,       // 營運基金
    baseSalary: base,   // JACK/Was 的「基本」三等份
    jackAdvance: advJ,
    walAdvance:  advW,
    jackTakeHome: jackTake,
    walTakeHome:  walTake,
  };
}

/* =========================
   基金餘額計算 & 撥入基金
   ========================= */
function getFundBalance(){
  let bal = 0;
  for (const r of state.records){
    if (r.type !== 'transfer') continue;
    if (r.to === FUND_ACCOUNT) bal += (r.amt||0);
    if (r.from === FUND_ACCOUNT) bal -= (r.amt||0);
  }
  return bal;
}
async function postOpFundAllocation(date=new Date()){
  const ym = monthKey(date);
  const FROM_ACCOUNT = '餐廳_銀行'; // 你也可以改成 '餐廳_現金'

  // 查重：是否已有 [月結基金] {ym} 的轉帳
  const dup = (state.records||[]).some(r=>{
    if (r.type!=='transfer') return false;
    const d = new Date(r.ts||0);
    return monthKey(d)===ym && r.to===FUND_ACCOUNT && (r.note||'').includes(`[月結基金] ${ym}`);
  });
  if (dup){ toast(`已撥入過 ${ym} 的營運基金`); return; }

  const st = computeMonthlySettlement(date);
  const amt = Math.max(0, Math.floor(st.opFund));
  if (amt<=0){ toast('本月無可撥入的營運基金。'); return; }

  const ts = new Date(date.getFullYear(), date.getMonth()+1, 1).getTime() - 1; // 當月最後一日
  addTransfer({ from: FROM_ACCOUNT, to: FUND_ACCOUNT, amt, note: `[月結基金] ${ym}`, ts });
  saveLocal(); await pushCloud(); renderReport();
  toast(`已撥入營運基金 ${amt.toLocaleString()}`);
}

/* =========================
   月結入帳（Jack/Was）
   ========================= */
async function postMonthlySettlement(date=new Date()){
  const ym = monthKey(date);
  // 防重複檢查：看個人帳是否已有 [月結] 標記的收入
  const dup = (state.records||[]).some(r=>{
    if (r.type!=='income') return false;
    const d = new Date(r.ts||0);
    const mk = monthKey(d);
    return mk===ym && (r.owner==='JACK' || r.owner==='WAL') && (r.note||'').includes(`[月結] ${ym}`);
  });
  if (dup){
    toast(`已入帳過 ${ym} 的月結，避免重複！`);
    return;
  }

  const st = computeMonthlySettlement(date);
  const now = new Date(date.getFullYear(), date.getMonth()+1, 1).getTime() - 1; // 以當月最後一天 23:59 作為入帳時間戳
  const note = `[月結] ${ym}（三等份+預支扣回）`;

  if (st.baseSalary<=0 && st.jackTakeHome<=0 && st.walTakeHome<=0){
    toast('本月淨利小於等於 0，未執行入帳。');
    return;
  }

  if (st.jackTakeHome>0){
    addRecord({ type:'income', owner:'JACK', who:'RESTAURANT', cat:'薪資收入-月薪', amt: st.jackTakeHome, note, ts: now });
  }
  if (st.walTakeHome>0){
    addRecord({ type:'income', owner:'WAL',  who:'RESTAURANT', cat:'薪資收入-月薪', amt: st.walTakeHome,  note, ts: now });
  }

  saveLocal(); await pushCloud(); renderReport();
  toast(`已完成 ${ym} 月結入帳`);
}

/* =========================
   轉帳頁 render
   ========================= */
function renderTransfer(){
  const wrap = $('#transfer-list'); if(!wrap) return;
  const y = state.month.getFullYear(), m = state.month.getMonth();
  const rows = state.records.filter(r=>{
    const d = new Date(r.ts||0);
    return r.type==='transfer' && d.getFullYear()===y && d.getMonth()===m;
  }).sort((a,b)=>(b.ts||0)-(a.ts||0));
  wrap.innerHTML = rows.map(r=>`
    <div class="row">
      <div class="muted" style="flex:0 0 8em">${new Date(r.ts).toLocaleDateString()}</div>
      <div>${r.from} → ${r.to}${r.note?`｜${r.note}`:''}</div>
      <div style="text-align:right;flex:0 0 6em">${fmt(r.amt)}</div>
    </div>
  `).join('') || `<div class="muted">本月尚無轉帳</div>`;
}

/* =========================
   設定頁（共享空間/分類/快捷/預算）
   ========================= */
function renderSettings(){
  const ver = $('#version'); if(ver) ver.textContent = `極速記帳 v3.3 build ${VERSION}`;

  // 類別列表
  const list = $('#cat-list'); if(list){
    list.innerHTML = state.categories.map(c=>`
      <div class="row">
        <div>${c.label} <span class="muted">(${c.kind})</span></div>
        <button class="link danger" data-act="del-cat" data-label="${c.label}">刪除</button>
      </div>
    `).join('');
    list.onclick = (e)=>{
      const btn = e.target.closest('[data-act="del-cat"]'); if(!btn) return;
      const label = btn.dataset.label;
      state.categories = state.categories.filter(x=>x.label!==label);
      saveLocal(); pushCloud(); renderSettings(); toast('已刪除分類');
    };
  }

  // 快捷管理
  const qlist = $('#quick-list'); if(qlist){
    qlist.innerHTML = state.quicks.map(q=>`
      <div class="row">
        <div>${q.label}｜${q.type}｜${q.cat}｜${q.amt}｜${q.owner}/${q.who}</div>
        <div>
          <button class="link" data-act="edit-quick" data-id="${q.id}">編輯</button>
          <button class="link danger" data-act="del-quick" data-id="${q.id}">刪除</button>
        </div>
      </div>
    `).join('') || `<div class="muted">尚無快捷</div>`;
    qlist.onclick = (e)=>{
      const t = e.target;
      if (t.dataset.act==='del-quick'){
        state.quicks = state.quicks.filter(x=>x.id!==t.dataset.id);
        saveLocal(); pushCloud(); renderSettings(); toast('已刪除快捷');
      }
      if (t.dataset.act==='edit-quick'){
        const q = state.quicks.find(x=>x.id===t.dataset.id);
        if (!q) return;
        $('#q-label').value = q.label;
        $('#q-type').value  = q.type;
        $('#q-cat').value   = q.cat;
        $('#q-amt').value   = q.amt;
        $('#q-who').value   = q.who;
        $('#q-owner').value = q.owner;
        window.scrollTo({top:0,behavior:'smooth'});
        highlight($('#quick-form'));
      }
    };
  }
}
function highlight(el){
  if(!el) return;
  el.style.outline = '2px solid #3aa';
  setTimeout(()=> el.style.outline='none', 1500);
}

/* =========================
   導覽 & 頁面渲染
   ========================= */
function render(){
  const head = $('#currentMonthLabel');
  if (head){
    head.textContent = `${state.month.getFullYear()}年${(state.month.getMonth()+1).toString().padStart(2,'0')}月`;
  }
  renderReport();
  renderTransfer();
  renderSettings();
  const dueJ = $('#due-jack'); if(dueJ) dueJ.textContent = fmt(state.dues.jack||0);
  const dueW = $('#due-wal');  if(dueW) dueW.textContent = fmt(state.dues.wal||0);
  const f = $('#footer-version'); if(f) f.textContent = `極速記帳 v3.3 build ${VERSION}`;
}

/* =========================
   一次性遷移：舊→新個人分類
   ========================= */
function migratePersonalCategories(){
  const catMap = new Map([
    ['餐飲',   '飲食'],
    ['交通',   '交通'],
    ['娛樂',   '娛樂'],
    ['醫療',   '醫療'],
    ['個人收入', '薪資收入-月薪'],
  ]);

  const ensure = (label, kind)=>{
    if (!state.categories.find(c=>c.label===label)) state.categories.push({label, kind});
  };
  ['飲食','治裝','住房','交通','教育','娛樂','稅捐','其他','醫療']
    .forEach(lbl=>ensure(lbl,'p_expense'));
  ['薪資收入-月薪','薪資收入-兼差','投資獲利-存款利息','投資獲利-股利','投資獲利-債券利息','其他-資產出售','其他-退稅金額']
    .forEach(lbl=>ensure(lbl,'p_income'));

  let touched = 0;
  for (const r of state.records){
    const newLabel = catMap.get(r.cat);
    if (newLabel){
      r.cat = newLabel;
      touched++;
    }
  }
  const removeLabels = ['餐飲','交通','娛樂','個人收入'];
  state.categories = state.categories.filter(c=> !removeLabels.includes(c.label));
  if (touched>0) console.log(`[migratePersonalCategories] updated ${touched} rows`);
}

/* =========================
   事件：初始化 / 表單
   ========================= */
async function init(){
  loadLocal();
  await initFirebase();

  // 共享空間切換
  $('#space-apply')?.addEventListener('click', async ()=>{
    const code = ($('#space-code')?.value||'').trim();
    if (!code){ toast('請輸入共享代號'); return; }
    state.space = code;
    await pullCloud();
    saveLocal();
    toast('已切換共享空間');
  });

  // 新增分類
  $('#cat-add')?.addEventListener('click', async ()=>{
    const label = ($('#cat-new')?.value||'').trim();
    const kind = $('#cat-kind')?.value || 'admin';
    if (!label){ toast('請輸入分類名稱'); return; }
    if (state.categories.find(c=>c.label===label)){ toast('分類已存在'); return; }
    state.categories.push({label,kind});
    $('#cat-new').value='';
    saveLocal(); await pushCloud(); renderSettings(); toast('已新增分類');
  });

  // 快捷新增/覆寫
  $('#quick-save')?.addEventListener('click', async ()=>{
    const label = ($('#q-label')?.value||'').trim();
    const type = $('#q-type')?.value || 'expense';
    const cat  = $('#q-cat')?.value || '';
    const amt  = Number($('#q-amt')?.value||0);
    const who  = $('#q-who')?.value || 'JACK';
    const owner = $('#q-owner')?.value || 'RESTAURANT';
    if (!label || !cat || !amt){ toast('請填齊快捷欄位'); return; }
    const idx = state.quicks.findIndex(q=>q.label===label);
    if (idx>=0) state.quicks[idx] = { id:state.quicks[idx].id, label,type,cat,amt,who,owner };
    else state.quicks.push({ id:uid(), label,type,cat,amt,who,owner });
    saveLocal(); await pushCloud(); renderSettings(); toast('已儲存快捷');
  });

  // 轉帳提交
  $('#xfer-submit')?.addEventListener('click', async ()=>{
    const from = $('#xfer-from')?.value||'';
    const to   = $('#xfer-to')?.value||'';
    const amt  = Number($('#xfer-amt')?.value||0);
    const note = ($('#xfer-note')?.value||'').trim();
    if (!from||!to||!amt){ toast('請填齊轉帳欄位'); return; }
    addTransfer({from,to,amt,note});
    saveLocal(); await pushCloud(); renderTransfer();
    $('#xfer-amt').value=''; $('#xfer-note').value='';
    toast('已建立轉帳（若為還款已自動沖銷）');
  });

  // 報表切換
  $('#rep-expand')?.addEventListener('change', renderReport);
  $('#rep-by-kind')?.addEventListener('change', renderReport);

  // 月份切換
  $('#mon-prev')?.addEventListener('click', ()=>{ state.month = new Date(state.month.getFullYear(), state.month.getMonth()-1, 1); render(); });
  $('#mon-next')?.addEventListener('click', ()=>{ state.month = new Date(state.month.getFullYear(), state.month.getMonth()+1, 1); render(); });

  // 重置（只清快取，不清雲端）
  $('#reset-local')?.addEventListener('click', ()=>{
    localStorage.removeItem('cf.data');
    toast('已清除本機快取（雲端資料不受影響）');
  });

  // 首次載入：如果沒有分類就灌預設（雲端也會自建）
  if (!state.categories || !state.categories.length){
    state.categories = defaultCategories.slice();
  }

  // 拉雲端
  if (state.useCloud) await pullCloud();

  // 一次性遷移到新版個人分類
  migratePersonalCategories();
  await pushCloud();

  render();

  // 全域委派：月結入帳 / 撥入基金
  document.addEventListener('click', (e)=>{
    const btnClose = e.target.closest('#btn-close-month');
    if (btnClose){ postMonthlySettlement(state.month); return; }

    const btnFund = e.target.closest('#btn-fund-allocate');
    if (btnFund){ postOpFundAllocation(state.month); return; }
  });
}
document.addEventListener('DOMContentLoaded', init);

/* =========================
   提供給 index.html 的 API（記帳頁用）
   ========================= */
window.CF = {
  addIncome: async ({owner, who, cat, amt, note, ts})=>{
    addRecord({type:'income', owner, who, cat, amt, note, ts});
    saveLocal(); await pushCloud(); renderReport(); toast('已記錄收入');
  },
  addExpense: async ({owner, who, cat, amt, note, ts})=>{
    addRecord({type:'expense', owner, who, cat, amt, note, ts});
    saveLocal(); await pushCloud(); renderReport(); toast('已記錄支出');
  },
  runQuick: async (label)=>{
    const q = state.quicks.find(x=>x.label===label);
    if(!q){ toast('找不到快捷'); return; }
    if (q.type==='income') await window.CF.addIncome({owner:q.owner, who:q.who, cat:q.cat, amt:q.amt, note:`[快捷] ${q.label}`});
    else await window.CF.addExpense({owner:q.owner, who:q.who, cat:q.cat, amt:q.amt, note:`[快捷] ${q.label}`});
  },
  getState: ()=>state,
  refresh: async ()=>{ await pullCloud(); render(); toast('已同步最新雲端資料'); }
};
