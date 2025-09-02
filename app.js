/* app.js — v17.2 with Restaurant P&L restored
   - Firebase 自動同步（若提供 config）
   - 本機 localStorage 後援
   - 記帳/轉帳/報表/設定
   - P&L（Revenue/COGS/Personnel/Utilities/Marketing/Logistics/Admin + 毛利/比率）
*/

// ========== 工具 ==========
const $  = (sel, root=document)=> root.querySelector(sel);
const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
const nowTS = ()=> Date.now();
const fmt  = (n)=> (n||0).toLocaleString();
const pct  = (x)=> (x*100).toFixed(1) + '%';

// ========== 全域狀態 ==========
const state = {
  // 分類（可前台管理）
  // { label: '食材-肉類', kind: 'cogs' }
  cats: [],
  // 快捷（可前台管理）
  // { label:'午餐120(JACK)', type:'expense', cat:'餐飲', amt:120, owner:'JACK' }
  quicks: [],
  // 記帳紀錄
  // { id, ts, type:'income'|'expense', cat, amt, owner:'RESTAURANT'|'JACK'|'WAL', note?, receipt_url? }
  records: [],
  // 轉帳紀錄
  // { id, ts, from, to, amt, note? }  // 互轉/還款一律記錄於此；報表預設不算入損益
  transfers: [],
  // 設定
  budget: { warnRatio: 0.9, JACK: 0, WAL: 0, RESTAURANT: 0 },
  // 共用空間（Firebase key / path）；若沒設定=只存本機
  shareSpace: '',
  // 版本標示
  build: 'v17.2'
};

// ========== P&L 類別分桶（依 category.kind 對應）==========
const PL_BUCKETS = [
  'revenue',     // 營業收入
  'cogs',        // 銷貨成本
  'personnel',   // 人事費
  'utilities',   // 水電/租金/電信
  'marketing',   // 行銷
  'logistics',   // 物流
  'admin'        // 行政/稅務/法律/雜項
];

// 初始預設分類（餐廳＋個人常用）
const DEFAULT_CATS = [
  // 餐廳：收入
  {label:'現場銷售', kind:'revenue'},
  {label:'外送平台', kind:'revenue'},
  {label:'批發/通路', kind:'revenue'},
  {label:'其他收入', kind:'revenue'},
  // 餐廳：COGS
  {label:'食材-肉類', kind:'cogs'},
  {label:'食材-蔬果', kind:'cogs'},
  {label:'海鮮', kind:'cogs'},
  {label:'調味/乾貨', kind:'cogs'},
  {label:'飲品原料', kind:'cogs'},
  {label:'包材', kind:'cogs'},
  {label:'清潔耗材', kind:'cogs'},
  // 餐廳：人事
  {label:'正職薪資', kind:'personnel'},
  {label:'勞健保', kind:'personnel'},
  // 餐廳：Utilities/行銷/物流/行政
  {label:'租金', kind:'utilities'},
  {label:'水費', kind:'utilities'},
  {label:'電費', kind:'utilities'},
  {label:'網路/手機', kind:'utilities'},
  {label:'廣告行銷', kind:'marketing'},
  {label:'物流運費', kind:'logistics'},
  {label:'稅捐(5%)', kind:'admin'},
  {label:'記帳/法律', kind:'admin'},

  // 個人常用（預設歸到 admin 或 revenue）
  {label:'薪資', kind:'revenue'},
  {label:'交通', kind:'admin'},
  {label:'餐飲', kind:'admin'},
  {label:'娛樂', kind:'admin'},
  {label:'醫療', kind:'admin'}
];

// ========== 儲存層（Firebase + localStorage 後援）==========
let fb = null; // {db, ref, onValue, set, get, update} after init
const LOCAL_KEY = 'cashflow_state_v3';

// 檢查 index.html 是否有注入 firebaseConfig
function getFirebaseConfigFromDOM(){
  try {
    const el = document.getElementById('firebase-config');
    if (!el) return null;
    return JSON.parse(el.textContent);
  } catch { return null; }
}

async function initFirebaseIfAny(){
  const cfg = getFirebaseConfigFromDOM();
  if (!cfg) return; // 無 Firebase 設定
  // 使用 CDN 模組（需在 index.html 引入 v10+ 的 compat CDN）
  if (!window.firebase || !window.firebase.initializeApp) return;
  const app = firebase.initializeApp(cfg);
  const db  = firebase.database(app);
  fb = {
    db,
    ref: (path)=> db.ref(path),
    async get(path){
      const snap = await db.ref(path).get();
      return snap.exists() ? snap.val() : null;
    },
    async set(path, data){
      return db.ref(path).set(data);
    },
    async update(path, data){
      return db.ref(path).update(data);
    },
    onValue(path, cb){
      db.ref(path).on('value', (snap)=> cb(snap.exists()? snap.val(): null));
    }
  };
}

function lsLoad(){
  try{
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}
function lsSave(st){
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(st)); }catch{}
}

async function loadState(){
  // 先載本機
  const local = lsLoad();
  if (local) Object.assign(state, local);

  // 初次啟用預設分類
  if (!state.cats || !state.cats.length){
    state.cats = DEFAULT_CATS.slice();
  }

  // 若有 shareSpace + Firebase，串雲端
  if (fb && state.shareSpace){
    const path = `/spaces/${state.shareSpace}`;
    const cloud = await fb.get(path);
    if (cloud){
      Object.assign(state, cloud);
    }else{
      // 雲端尚未建立，以本機為主推上去
      await fb.set(path, state);
    }
    // 訂閱雲端變動 → 寫回本機
    fb.onValue(path, (val)=>{
      if (val){
        Object.assign(state, val);
        lsSave(state);
        renderAll();
      }
    });
  }
  lsSave(state);
}

async function saveState(){
  lsSave(state);
  if (fb && state.shareSpace){
    const path = `/spaces/${state.shareSpace}`;
    await fb.set(path, state);
  }
}

// ========== 初始化與路由 ==========
function initEvents(){
  // 導覽 tab
  $$('#nav .tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const t = btn.dataset.tab;
      switchTab(t);
    });
  });

  // 記帳頁：快速鍵（示意：以 data-quick 索引）
  $('#quick-list')?.addEventListener('click', (e)=>{
    const el = e.target.closest('button[data-qidx]');
    if (!el) return;
    const q = state.quicks[+el.dataset.qidx];
    if (!q) return;
    createRecord({
      type: q.type, cat: q.cat, amt: q.amt, owner: q.owner, note: q.label
    });
  });

  // 轉帳頁：建立
  $('#btn-transfer')?.addEventListener('click', ()=>{
    const ttype = $('#tf-type')?.value || 'transfer'; // transfer / repay
    const from  = $('#tf-from')?.value || '餐廳_現金';
    const to    = $('#tf-to')?.value   || 'JACK';
    const amt   = +($('#tf-amt')?.value||0);
    const note  = $('#tf-note')?.value || '';
    if (!amt) return toast('請輸入金額');

    state.transfers.push({ id:cid(), ts:nowTS(), ttype, from, to, amt, note });
    saveState().then(()=> {
      toast('已建立轉帳/還款');
      $('#tf-amt').value=''; $('#tf-note').value='';
      renderTransfers();
      renderReport(); // 轉帳本身不影響 P&L，但一起刷新概況
    });
  });

  // 設定頁：存檔
  $('#btn-save-settings')?.addEventListener('click', ()=>{
    const share = $('#share-space')?.value?.trim() || '';
    state.shareSpace = share;

    // 預算門檻
    const warn = parseFloat($('#budget-warn')?.value||'0.9') || 0.9;
    state.budget.warnRatio = warn;

    saveState().then(()=> toast('設定已儲存'));
  });

  // 分類管理：新增
  $('#btn-add-cat')?.addEventListener('click', ()=>{
    const label = $('#new-cat-label')?.value?.trim();
    const kind  = $('#new-cat-kind')?.value || 'admin';
    if (!label) return;
    state.cats.push({label, kind});
    $('#new-cat-label').value='';
    saveState().then(()=> renderSettings());
  });

  // 快捷管理：新增/覆寫
  $('#btn-add-quick')?.addEventListener('click', ()=>{
    const label = $('#q-label')?.value?.trim();
    const type  = $('#q-type')?.value || 'expense';
    const cat   = $('#q-cat')?.value || '';
    const amt   = +($('#q-amt')?.value||0);
    const owner = $('#q-owner')?.value || 'JACK';
    if (!label || !cat || !amt) return toast('請填完整快捷欄位');
    // 若同名 → 覆寫
    const idx = state.quicks.findIndex(q=> q.label===label);
    const item = {label, type, cat, amt, owner};
    if (idx>=0) state.quicks[idx]=item; else state.quicks.push(item);
    saveState().then(()=> { toast('快捷已儲存'); renderSettings(); });
  });

  // 快捷排序上下按鈕（事件代理）
  $('#quick-manage')?.addEventListener('click',(e)=>{
    const up = e.target.closest('[data-up]'); const down = e.target.closest('[data-down]');
    const edit = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
    if (up||down||edit||del){
      const idx = +((up||down||edit||del).dataset.idx||-1);
      if (idx<0) return;
      if (up){ if (idx>0){ [state.quicks[idx-1],state.quicks[idx]]=[state.quicks[idx],state.quicks[idx-1]]; saveState().then(()=>renderSettings()); }}
      else if (down){ if (idx<state.quicks.length-1){ [state.quicks[idx+1],state.quicks[idx]]=[state.quicks[idx],state.quicks[idx+1]]; saveState().then(()=>renderSettings()); }}
      else if (edit){
        const q = state.quicks[idx];
        $('#q-label').value=q.label; $('#q-type').value=q.type; setSelect('#q-cat', q.cat); $('#q-amt').value=q.amt; $('#q-owner').value=q.owner;
        // 捲到表單並高亮
        const frm = $('#quick-form'); frm?.scrollIntoView({behavior:'smooth', block:'start'});
        frm?.classList.add('highlight'); setTimeout(()=>frm?.classList.remove('highlight'), 1500);
      } else if (del){
        state.quicks.splice(idx,1); saveState().then(()=>renderSettings());
      }
    }
  });

  // 報表頁 checkbox
  $('#rep-expand')?.addEventListener('change', renderReport);
  $('#rep-by-kind')?.addEventListener('change', renderReport);
}

function cid(){ return Math.random().toString(36).slice(2,10); }

function switchTab(t){
  document.body.dataset.tab = t;
  if (t==='record') renderRecord();
  if (t==='transfer') renderTransfers();
  if (t==='report') renderReport();
  if (t==='settings') renderSettings();
}

// ========== 記帳 ==========
function createRecord(r){
  state.records.push({
    id: cid(), ts: nowTS(),
    type: r.type, cat: r.cat, amt: +r.amt||0, owner: r.owner||'RESTAURANT',
    note: r.note||'', receipt_url: r.receipt_url||''
  });
  saveState().then(()=> {
    toast('已記錄');
    renderRecord(); renderReport();
  });
}

function renderRecord(){
  // 這裡僅示範把快捷列出；實際記帳表單欄位你已經有了就沿用
  const quickWrap = $('#quick-list');
  if (quickWrap){
    quickWrap.innerHTML = state.quicks.map((q,i)=> `
      <button class="chip" data-qidx="${i}">${q.label}</button>
    `).join('') || '<div class="muted">尚未建立快捷</div>';
  }
}

// ========== 轉帳 ==========
function renderTransfers(){
  const box = $('#transfer-list'); if(!box) return;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const list = state.transfers.filter(t=>{
    const d=new Date(t.ts); return d.getFullYear()===y && d.getMonth()===m;
  }).sort((a,b)=> b.ts-a.ts);
  box.innerHTML = list.map(t=>`
    <div class="row">
      <div class="muted">${new Date(t.ts).toLocaleDateString()}</div>
      <div>${t.ttype==='repay'?'還款':'轉帳'}：${t.from} → ${t.to}</div>
      <div style="text-align:right">-${fmt(t.amt)}</div>
    </div>
  `).join('') || '<div class="muted">本月尚無轉帳紀錄</div>';
}

// ========== 報表（含餐廳 P&L） ==========
function getRestaurantMonthRows(){
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  return (state.records||[]).filter(r=>{
    const d = new Date(r.ts||Date.now());
    return d.getFullYear()===y && d.getMonth()===m && r.owner==='RESTAURANT';
  }).map(r=>{
    const cat = (state.cats||[]).find(c=> c.label===r.cat);
    return {...r, kind: cat?.kind || (r.type==='income'?'revenue':'admin')};
  });
}

function renderReport(){
  const box = $('#report-box'); if(!box) return;

  const rows = getRestaurantMonthRows();
  const sum = { revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0 };

  for (const r of rows){
    if (r.type==='income' && r.kind==='revenue') sum.revenue += r.amt||0;
    else if (r.type==='expense'){
      if (PL_BUCKETS.includes(r.kind)) sum[r.kind] += r.amt||0;
      else sum.admin += r.amt||0;
    }
  }

  const grossProfit = sum.revenue - sum.cogs;
  const otherOpex   = sum.personnel + sum.utilities + sum.marketing + sum.logistics + sum.admin;
  const netProfit   = grossProfit - otherOpex;
  const cogsPct      = sum.revenue ? sum.cogs/sum.revenue : 0;
  const personnelPct = sum.revenue ? sum.personnel/sum.revenue : 0;

  const expand = $('#rep-expand')?.checked;
  const byKind = $('#rep-by-kind')?.checked;

  // 預設概況（收入/支出/結餘）
  const simpleIncome  = sum.revenue;
  const simpleExpense = sum.cogs + otherOpex;
  const simpleNet     = simpleIncome - simpleExpense;

  // 明細展開
  let detailsHTML = '';
  if (expand){
    const groups = {};
    for (const r of rows){
      const k = r.type==='income'?'revenue':r.kind;
      (groups[k] ||= []).push(r);
    }
    const titleMap = {
      revenue:'營業收入 (Revenue)', cogs:'銷貨成本 (COGS)', personnel:'人事費 (Personnel)',
      utilities:'水電/租金 (Utilities)', marketing:'行銷 (Marketing)', logistics:'物流 (Logistics)', admin:'行政/稅務 (Admin)'
    };
    const order = ['revenue','cogs','personnel','utilities','marketing','logistics','admin'];
    detailsHTML = order.map(k=>{
      const arr = groups[k]; if (!arr?.length) return '';
      const subtotal = (k==='revenue'? sum.revenue : sum[k]) || 0;
      const lines = arr.sort((a,b)=> (a.ts||0)-(b.ts||0))
        .map(r=>`<div class="row" style="font-size:14px">
          <div class="muted" style="flex:0 0 9em">${new Date(r.ts).toLocaleDateString()}</div>
          <div>${r.cat}${r.note?`｜${r.note}`:''}</div>
          <div style="text-align:right;flex:0 0 7em">${r.type==='income'?'+':'-'}${fmt(r.amt)}</div>
        </div>`).join('');
      return `
        <div class="card" style="background:#f9fbfb">
          <div class="row" style="font-weight:700"><div>${titleMap[k]}</div><div style="text-align:right;flex:0 0 7em">${fmt(subtotal)}</div></div>
          <div style="margin-top:6px">${lines}</div>
        </div>
      `;
    }).join('');
  }

  // 依類型小計
  let kindHTML = '';
  if (byKind){
    kindHTML = `
      <div class="card">
        <div class="row"><div>營業收入 (Revenue)</div><div style="text-align:right">${fmt(sum.revenue)}</div></div>
        <div class="row"><div>銷貨成本 (COGS)</div><div style="text-align:right">-${fmt(sum.cogs)}</div></div>
        <hr/>
        <div class="row"><div><b>毛利 (Gross Profit)</b></div><div style="text-align:right"><b>${fmt(grossProfit)}</b>　<span class="muted">COGS比率：${pct(cogsPct)}</span></div></div>
        <div class="row"><div>人事費 (Personnel)</div><div style="text-align:right">-${fmt(sum.personnel)}　<span class="muted">占比：${pct(personnelPct)}</span></div></div>
        <div class="row"><div>水電/租金 (Utilities)</div><div style="text-align:right">-${fmt(sum.utilities)}</div></div>
        <div class="row"><div>行銷 (Marketing)</div><div style="text-align:right">-${fmt(sum.marketing)}</div></div>
        <div class="row"><div>物流 (Logistics)</div><div style="text-align:right">-${fmt(sum.logistics)}</div></div>
        <div class="row"><div>行政/稅務 (Admin)</div><div style="text-align:right">-${fmt(sum.admin)}</div></div>
        <hr/>
        <div class="row"><div><b>淨利 (Net Profit)</b></div><div style="text-align:right"><b>${fmt(netProfit)}</b></div></div>
      </div>
    `;
  }

  box.innerHTML = `
    <div class="card">
      <div class="row"><div>收入（本月）</div><b>+${fmt(simpleIncome)}</b></div>
      <div class="row"><div>支出（本月）</div><b>-${fmt(simpleExpense)}</b></div>
      <hr/>
      <div class="row"><div>結餘</div><b>${fmt(simpleNet)}</b></div>
    </div>

    <div class="card" style="background:#eef6f6">
      <div style="font-weight:700;margin-bottom:6px">餐廳 P&L（本月）</div>
      ${kindHTML || `
        <div class="row"><div>營業收入 (Revenue)</div><div style="text-align:right">${fmt(sum.revenue)}</div></div>
        <div class="row"><div>銷貨成本 (COGS)</div><div style="text-align:right">-${fmt(sum.cogs)}　<span class="muted">COGS比率：${pct(cogsPct)}</span></div></div>
        <div class="row"><div>毛利 (Gross Profit)</div><div style="text-align:right"><b>${fmt(grossProfit)}</b></div></div>
        <div class="row"><div>人事費 (Personnel)</div><div style="text-align:right">-${fmt(sum.personnel)}　<span class="muted">占比：${pct(personnelPct)}</span></div></div>
        <div class="row"><div>水電/租金 (Utilities)</div><div style="text-align:right">-${fmt(sum.utilities)}</div></div>
        <div class="row"><div>行銷 (Marketing)</div><div style="text-align:right">-${fmt(sum.marketing)}</div></div>
        <div class="row"><div>物流 (Logistics)</div><div style="text-align:right">-${fmt(sum.logistics)}</div></div>
        <div class="row"><div>行政/稅務 (Admin)</div><div style="text-align:right">-${fmt(sum.admin)}</div></div>
        <hr/>
        <div class="row"><div><b>淨利 (Net Profit)</b></div><div style="text-align:right"><b>${fmt(netProfit)}</b></div></div>
      `}
    </div>
    ${detailsHTML}
  `;
}

// ========== 設定 ==========
function setSelect(sel, value){
  const el = $(sel); if (!el) return;
  const opt = Array.from(el.options||[]).find(o=> o.value===value);
  if (opt) el.value = value;
}

function renderSettings(){
  // 共用空間
  if ($('#share-space')) $('#share-space').value = state.shareSpace||'';

  // 預算
  if ($('#budget-warn')) $('#budget-warn').value = state.budget.warnRatio ?? 0.9;

  // 分類管理
  const wrap = $('#cat-list');
  if (wrap){
    wrap.innerHTML = state.cats.map((c,i)=>`
      <div class="row">
        <div>${c.label} <span class="muted">(${c.kind})</span></div>
        <button data-del=${i} class="link danger">刪除</button>
      </div>
    `).join('') || '<div class="muted">尚無分類</div>';

    wrap.onclick = (e)=>{
      const del = e.target.closest('button[data-del]');
      if (!del) return;
      const idx = +del.dataset.del;
      state.cats.splice(idx,1);
      saveState().then(()=> renderSettings());
    };

    // 下拉：kind
    if ($('#new-cat-kind')){
      $('#new-cat-kind').innerHTML = PL_BUCKETS.map(k=> `<option value="${k}">${k}</option>`).join('');
    }
  }

  // 快捷管理
  const qwrap = $('#quick-manage');
  if (qwrap){
    qwrap.innerHTML = state.quicks.map((q,i)=>`
      <div class="row">
        <div class="muted">${q.type}</div>
        <div style="flex:1">${q.label}｜${q.cat}｜${q.owner}｜${fmt(q.amt)}</div>
        <button class="link" data-up data-idx="${i}">↑</button>
        <button class="link" data-down data-idx="${i}">↓</button>
        <button class="link" data-edit data-idx="${i}">編輯</button>
        <button class="link danger" data-del data-idx="${i}">刪除</button>
      </div>
    `).join('') || '<div class="muted">尚未建立快捷</div>';

    // 快捷下拉預設值
    if ($('#q-type')) $('#q-type').value = 'expense';
    if ($('#q-owner')) $('#q-owner').value = 'JACK';
    if ($('#q-cat')){
      $('#q-cat').innerHTML = state.cats.map(c=> `<option value="${c.label}">${c.label}</option>`).join('');
    }
  }

  // 版本
  const v = $('#build'); if (v) v.textContent = `極速記帳 v3.3 build ${state.build}`;
}

// ========== UI 零件 ==========
function toast(msg){
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('show'));
  setTimeout(()=> { el.classList.remove('show'); el.remove(); }, 1600);
}

// ========== 啟動 ==========
(async function boot(){
  await initFirebaseIfAny();
  await loadState();

  initEvents();
  switchTab('record'); // 預設進記帳
})();
