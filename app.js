/* ===============================
   Firebase 初始化（CDN 版）
   =============================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// TODO: 改成你的專案設定
const firebaseConfig = {
    databaseURL: "https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app/",
    apiKey: "AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
    authDomain: "cashflow-71391.firebaseapp.com",
    projectId: "cashflow-71391",
    storageBucket: "cashflow-71391.firebasestorage.app",
    messagingSenderId: "204834375477",
    appId: "1:204834375477:web:406dde0ccb0d33a60d2e7c",
    measurementId: "G-G2DVG798M8"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* ===============================
   簡易 DOM utils
   =============================== */
const $  = (q)=> document.querySelector(q);
const $$ = (q)=> Array.from(document.querySelectorAll(q));
const fmt = (n)=> (Number(n)||0).toLocaleString();
const todayStr = ()=> new Date().toISOString().slice(0,10);
const monthStr = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

/* ===============================
   全域狀態
   =============================== */
const state = {
  spaceKey: localStorage.getItem('spaceKey') || 'default',
  cats: [],        // {label, kind}
  records: [],     // {owner, type, cat, amt, ts, note}
  settings: { near: 0.9 }
};

function dbPath(key){ return `spaces/${state.spaceKey}/${key}`; }

/* ===============================
   分類：預設一份餐廳導向 + 個人常用
   =============================== */
const DEFAULT_CATS = [
  // 餐廳收入
  {label:'現場銷售', kind:'revenue'},
  {label:'外送平台', kind:'revenue'},
  {label:'批發/通路', kind:'revenue'},
  {label:'其他收入', kind:'revenue'},
  // 餐廳 COGS
  {label:'食材-肉類', kind:'cogs'},{label:'食材-蔬果', kind:'cogs'},{label:'海鮮', kind:'cogs'},
  {label:'調味/乾貨', kind:'cogs'},{label:'飲品原料', kind:'cogs'},{label:'包材', kind:'cogs'},
  {label:'清潔耗材', kind:'cogs'},
  // 人事/Utilities/行銷/物流/行政
  {label:'正職薪資', kind:'personnel'},{label:'勞健保', kind:'personnel'},
  {label:'租金', kind:'utilities'},{label:'水費', kind:'utilities'},{label:'電費', kind:'utilities'},{label:'網路/手機', kind:'utilities'},
  {label:'廣告行銷', kind:'marketing'},{label:'拍攝設計', kind:'marketing'},
  {label:'物流運費', kind:'logistics'},
  {label:'稅捐(5%)', kind:'admin'},{label:'記帳/法律', kind:'admin'},
  // 個人常用
  {label:'薪資收入', kind:'revenue'},{label:'利息/股息', kind:'revenue'},
  {label:'餐飲', kind:'admin'},{label:'交通', kind:'admin'},{label:'油資', kind:'admin'},
];

/* P&L 欄位順序與名稱 */
const PL_BUCKETS = ['revenue','cogs','personnel','utilities','marketing','logistics','admin'];
const PL_TITLES = {
  revenue:'營業收入 (Revenue)',
  cogs:'銷貨成本 (COGS)',
  personnel:'人事費 (Personnel)',
  utilities:'水電/租金 (Utilities)',
  marketing:'行銷 (Marketing)',
  logistics:'物流 (Logistics)',
  admin:'行政/稅務 (Admin)'
};

/* ===============================
   啟動：訂閱雲端資料
   =============================== */
function subscribeSpace(){
  onValue(ref(db, dbPath('cats')), (snap)=>{
    state.cats = snap.exists() ? snap.val() : DEFAULT_CATS;
    renderCatSelects();
    renderCatList();
    renderReport(); // 分類變動會影響 P&L
  });

  onValue(ref(db, dbPath('records')), (snap)=>{
    state.records = snap.exists() ? snap.val() : [];
    renderCountThisMonth();
    renderReport();
    renderXferList();
  });

  onValue(ref(db, dbPath('settings')), (snap)=>{
    state.settings = snap.exists() ? snap.val() : { near: 0.9 };
    $('#near-threshold').value = state.settings.near ?? 0.9;
  });
}

/* ===============================
   UI 初始化與事件
   =============================== */
function initUI(){
  // tabs
  $$('.tab').forEach(t=>{
    t.onclick = ()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const name = t.dataset.tab;
      $$('.section').forEach(s=> s.classList.remove('active'));
      $('#sec-'+name).classList.add('active');
    }
  });

  // 日期預設
  $('#date').value = todayStr();
  $('#xfer-date').value = todayStr();

  // 記帳
  $('#btn-add').onclick = addRecord;

  // 轉帳
  $('#btn-xfer').onclick = addTransfer;

  // 設定
  $('#btn-apply-space').onclick = applySpaceKey;
  $('#btn-add-cat').onclick = addCategory;
  $('#btn-save-settings').onclick = saveSettings;

  // 報表控制
  const now = new Date();
  $('#rep-month').value = monthStr(now);
  $('#rep-owner').onchange = renderReport;
  $('#rep-month').onchange = renderReport;
  $('#rep-by-kind').onchange = renderReport;
  $('#rep-expand').onchange = renderReport;

  // Space key 欄位
  $('#space-key').value = state.spaceKey;

  renderCatSelects();
}

/* ===============================
   記帳 / 轉帳
   =============================== */
function addRecord(){
  const owner = $('#owner').value;
  const type  = $('#type').value; // 'income' | 'expense'
  const cat   = $('#cat').value;
  const amt   = Number($('#amt').value||0);
  const date  = $('#date').value;
  const note  = $('#note').value?.trim()||'';

  if(!amt || !date || !cat){ alert('請輸入金額/日期/分類'); return; }

  const ts = new Date(date+'T00:00:00').getTime();
  const row = { owner, type, cat, amt, ts, note };

  const rows = state.records.concat([row]);
  set(ref(db, dbPath('records')), rows);
  $('#amt').value = ''; $('#note').value='';
  alert('已記錄');
}

function addTransfer(){
  const kind = $('#xfer-kind').value; // transfer | settle
  const from = $('#from').value;
  const to   = $('#to').value;
  const amt  = Number($('#xfer-amt').value||0);
  const date = $('#xfer-date').value;
  if(!amt || !date){ alert('請輸入金額/日期'); return; }
  const ts = new Date(date+'T00:00:00').getTime();

  const rows = state.records.slice();

  if(kind==='transfer'){
    // 建兩筆：from 支出、to 收入（分類使用「行政」避免影響 COGS 比率）
    rows.push({ owner: mapXferOwner(from), type:'expense', cat:'行政/稅務 (Admin)' , amt, ts, note:`轉出→${to}` });
    rows.push({ owner: mapXferOwner(to),   type:'income',  cat:'行政/稅務 (Admin)' , amt, ts, note:`轉入←${from}` });
  }else{
    // 還款（沖銷報銷）：JACK / WAL -> 餐廳_銀行（視情況調整）
    rows.push({ owner: mapXferOwner(from), type:'expense', cat:'行政/稅務 (Admin)', amt, ts, note:`還款→${to}` });
    rows.push({ owner: mapXferOwner(to),   type:'income',  cat:'行政/稅務 (Admin)', amt, ts, note:`收款←${from}` });
  }

  set(ref(db, dbPath('records')), rows);
  $('#xfer-amt').value='';
  alert('已建立');
}

function mapXferOwner(x){
  if(x==='JACK' || x==='WAL') return x;
  return 'RESTAURANT'; // 餐廳_現金 / 銀行 都算餐廳
}

function renderXferList(){
  const m = $('#rep-month').value || monthStr(new Date());
  const [y,mm] = m.split('-').map(Number);
  const range = monthRange(y, mm-1);
  const rows = state.records.filter(r=> r.ts>=range.start && r.ts<range.end && /轉|還款|轉入|轉出|收款/.test(r.note||''));
  $('#xfer-list').innerHTML = rows.length
    ? rows.sort((a,b)=>a.ts-b.ts).map(r=>
        `<div class="row">
          <div class="muted" style="flex:0 0 8em">${new Date(r.ts).toLocaleDateString()}</div>
          <div>${r.owner}｜${r.note||''}</div>
          <div style="text-align:right;flex:0 0 7em">${(r.type==='income'?'+':'-')+fmt(r.amt)}</div>
        </div>`
      ).join('')
    : '<span class="muted">（本月尚無轉帳/還款紀錄）</span>';
}

/* ===============================
   分類管理 / 下拉
   =============================== */
function renderCatSelects(){
  const sel = $('#cat');
  sel.innerHTML = state.cats.map(c=>`<option value="${escapeHTML(c.label)}">${c.label}</option>`).join('');
}
function renderCatList(){
  const box = $('#cat-list');
  box.innerHTML = state.cats.map((c,i)=>`
    <div class="row">
      <div>${c.label} <span class="muted">(${c.kind})</span></div>
      <button class="btn secondary" style="flex:0 0 70px" data-del="${i}">刪除</button>
    </div>
  `).join('');
  box.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>{
      const i = Number(btn.dataset.del);
      const arr = state.cats.slice(); arr.splice(i,1);
      set(ref(db, dbPath('cats')), arr);
    };
  });
}
function addCategory(){
  const label = $('#new-cat-label').value?.trim();
  const kind  = $('#new-cat-kind').value;
  if(!label) return alert('請輸入分類名稱');
  const exists = state.cats.some(c=>c.label===label);
  if(exists) return alert('已有同名分類');
  const arr = state.cats.concat([{label, kind}]);
  set(ref(db, dbPath('cats')), arr);
  $('#new-cat-label').value='';
}

function saveSettings(){
  const near = Number($('#near-threshold').value||0.9);
  update(ref(db, dbPath('settings')), { near });
  alert('已儲存');
}

/* ===============================
   共享空間（兩機同資料）
   =============================== */
function applySpaceKey(){
  const key = $('#space-key').value?.trim();
  if(!key) return alert('請輸入代號');
  localStorage.setItem('spaceKey', key);
  state.spaceKey = key;
  subscribeSpace(); // 重新訂閱此空間
  alert('已切換共享代號：'+key);
}

/* ===============================
   報表（可切月份 / 可切擁有者）
   =============================== */
function monthRange(year, monthIdx){
  // monthIdx: 0~11
  const start = new Date(year, monthIdx, 1).getTime();
  const end   = new Date(year, monthIdx+1, 1).getTime();
  return { start, end };
}

function rowsByOwnerAndMonth(owner, y, m){
  const {start, end} = monthRange(y, m);
  return state.records
    .filter(r => r.ts>=start && r.ts<end && (owner==='ALL' ? true : r.owner===owner))
    .map(r=>{
      const cat = state.cats.find(c=> c.label===r.cat);
      return {...r, kind: cat?.kind || 'admin'};
    });
}

function renderReport(){
  const box = $('#report-box'); if(!box) return;

  // 來源：UI
  const m = $('#rep-month').value || monthStr(new Date());
  const [yy, mm] = m.split('-').map(Number); // e.g. 2025, 08
  const owner = $('#rep-owner').value;       // RESTAURANT | JACK | WAL
  const expand = $('#rep-expand').checked;
  const byKind = $('#rep-by-kind').checked;

  const rows = rowsByOwnerAndMonth(owner, yy, mm-1);

  // 累加
  const sum = { revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0 };
  for(const r of rows){
    if(r.type==='income' && r.kind==='revenue') sum.revenue += r.amt||0;
    if(r.type==='expense'){
      if(PL_BUCKETS.includes(r.kind)) sum[r.kind]+=r.amt||0;
      else sum.admin+=r.amt||0;
    }
  }

  const grossProfit = sum.revenue - sum.cogs;
  const otherOpex   = sum.personnel + sum.utilities + sum.marketing + sum.logistics + sum.admin;
  const netProfit   = grossProfit - otherOpex;
  const cogsPct     = sum.revenue ? sum.cogs / sum.revenue : 0;
  const pplPct      = sum.revenue ? sum.personnel / sum.revenue : 0;

  const titleWho = owner==='RESTAURANT' ? '餐廳' : (owner==='JACK' ? 'JACK（個人）' : 'WAL（個人）');
  const titleMonth = `${yy}年${String(mm).padStart(2,'0')}月`;

  // 簡表
  const simpleIncome  = sum.revenue;
  const simpleExpense = sum.cogs + otherOpex;
  const simpleNet     = simpleIncome - simpleExpense;

  // 依類型小計
  const kindHTML = `
    <div class="row"><div>${PL_TITLES.revenue}</div><div style="text-align:right">${fmt(sum.revenue)}</div></div>
    <div class="row"><div>${PL_TITLES.cogs}</div><div style="text-align:right">-${fmt(sum.cogs)}　<span class="muted">COGS比率：${(cogsPct*100).toFixed(1)}%</span></div></div>
    <hr/>
    <div class="row"><div><b>毛利 (Gross Profit)</b></div><div style="text-align:right"><b>${fmt(grossProfit)}</b></div></div>
    <div class="row"><div>${PL_TITLES.personnel}</div><div style="text-align:right">-${fmt(sum.personnel)}　<span class="muted">占比：${(pplPct*100).toFixed(1)}%</span></div></div>
    <div class="row"><div>${PL_TITLES.utilities}</div><div style="text-align:right">-${fmt(sum.utilities)}</div></div>
    <div class="row"><div>${PL_TITLES.marketing}</div><div style="text-align:right">-${fmt(sum.marketing)}</div></div>
    <div class="row"><div>${PL_TITLES.logistics}</div><div style="text-align:right">-${fmt(sum.logistics)}</div></div>
    <div class="row"><div>${PL_TITLES.admin}</div><div style="text-align:right">-${fmt(sum.admin)}</div></div>
    <hr/>
    <div class="row"><div><b>淨利 (Net Profit)</b></div><div style="text-align:right"><b>${fmt(netProfit)}</b></div></div>
  `;

  // 明細展開
  let detailsHTML = '';
  if(expand){
    const groups = {};
    for(const r of rows){
      const key = r.type==='income' ? 'revenue' : r.kind;
      (groups[key] ||= []).push(r);
    }
    detailsHTML = PL_BUCKETS
      .filter(k => groups[k]?.length)
      .map(k=>{
        const lines = groups[k].sort((a,b)=>a.ts-b.ts).map(r=>`
          <div class="row" style="font-size:14px">
            <div class="muted" style="flex:0 0 8.5em">${new Date(r.ts).toLocaleDateString()}</div>
            <div>${r.cat}${r.note?`｜${escapeHTML(r.note)}`:''}</div>
            <div style="text-align:right;flex:0 0 7em">${(r.type==='income'?'+':'-')+fmt(r.amt)}</div>
          </div>
        `).join('');
        const subtotal = (k==='revenue'?sum.revenue:sum[k])||0;
        return `
          <div class="card" style="background:#f9fbfb">
            <div class="row" style="font-weight:700"><div>${PL_TITLES[k]}</div><div style="text-align:right">${fmt(subtotal)}</div></div>
            <div style="margin-top:6px">${lines}</div>
          </div>
        `;
      }).join('');
  }

  box.innerHTML = `
    <div class="card">
      <div class="row"><div class="muted">${titleMonth}｜${titleWho}</div><div></div></div>
      <div class="row"><div>收入（本月）</div><b>+${fmt(simpleIncome)}</b></div>
      <div class="row"><div>支出（本月）</div><b>-${fmt(simpleExpense)}</b></div>
      <hr/>
      <div class="row"><div>結餘</div><b>${fmt(simpleNet)}</b></div>
    </div>

    <div class="card" style="background:#eef6f6">
      <div style="font-weight:700;margin-bottom:6px">P&L（損益表）</div>
      ${kindHTML}
    </div>

    ${detailsHTML}
  `;
}

/* ===============================
   其它
   =============================== */
function renderCountThisMonth(){
  const now = new Date();
  const {start,end} = monthRange(now.getFullYear(), now.getMonth());
  const n = state.records.filter(r=> r.ts>=start && r.ts<end).length;
  $('#count-this-month').textContent = n;
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

/* ===============================
   啟動
   =============================== */
window.addEventListener('DOMContentLoaded', ()=>{
  initUI();
  subscribeSpace(); // 載入目前 spaceKey 的雲端資料
});
