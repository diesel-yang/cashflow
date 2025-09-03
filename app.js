// app.js（整合版） -------------------------------------------------------------
// 使用 ES Module CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, child, get, set, push, update, onValue, query,
  orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- 你的 Firebase 設定（你提供的那組） ---
const firebaseConfig = {
  apiKey: "AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
  authDomain: "cashflow-71391.firebaseapp.com",
  databaseURL: "https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cashflow-71391",
  storageBucket: "cashflow-71391.firebasestorage.app",
  messagingSenderId: "204834375477",
  appId: "1:204834375477:web:406dde0ccb0d33a60d2e7c",
  measurementId: "G-G2DVG798M8"
};

// --- 初始化 Firebase ---
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
const auth = getAuth(app);
await signInAnonymously(auth).catch(console.error);

// --- 全域狀態 ---
const state = {
  space: localStorage.getItem('CF_SPACE') || '',
  io: 'expense',          // 'expense' | 'income'
  scope: 'restaurant',    // 'restaurant' | 'personal'
  group: '',              // 目前所選分類大項
  item:  '',              // 目前所選項目
  catalog: null,
  catalogIndex: null
};

window.CF = { state }; // 方便除錯用

// --- 小工具 ---
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const byId = id => document.getElementById(id);

const money = n => (Number(n)||0).toLocaleString('zh-TW');

// 舊命名 → 新命名（避免你舊資料 kind 落差）
const normalizeKind = (k) => {
  if (!k) return '';
  if (k === '餐廳收入') return '營業收入';
  if (k === '其他')   return '其他支出';
  return k;
};

// --- 分類大項（UI 用） ---
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電租網','行銷','物流運輸','行政稅務'];
const PERS_INCOME_GROUPS = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

// 依 IO 與 Scope 給出可選的大項
function groupsFor(io, scope){
  if(scope === 'restaurant'){
    return (io === 'income') ? ['營業收入'] : REST_GROUPS.filter(g => g!=='營業收入');
  }else{
    return (io === 'income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
  }
}

// --- Catalog 索引：扁平或 categories.* 都能吃 ---
function buildCatalogIndex(raw){
  const cat = raw ?? state.catalog ?? {};
  const flat = Array.isArray(cat) ? cat
    : [].concat(cat.categories?.restaurant || [],
                cat.categories?.personal   || [],
                cat.categories || []);

  const by = { restaurant:[], personal:[] };
  flat.forEach(x=>{
    const item = {
      id   : x.id    || x.label,
      label: x.label || x.id,
      kind : normalizeKind(x.kind || '')
    };
    if (REST_GROUPS.includes(item.kind) || item.kind === '營業收入') by.restaurant.push(item);
    else by.personal.push(item);
  });

  state.catalogIndex = by;
  console.log('[catalogIndex]', 'restaurant=', by.restaurant.length, 'personal=', by.personal.length);
}

// 依大項取出細項
function categoriesFor(scope, group){
  const pool = (scope==='restaurant')
    ? (state.catalogIndex?.restaurant || [])
    : (state.catalogIndex?.personal   || []);
  return pool.filter(c => c.kind === group);
}

// --- 連線與載入 ---
async function ensureRoom(){
  if(!state.space) throw new Error('缺少共享代號');
  const root = ref(db, `rooms/${state.space}`);
  const snap = await get(root);
  if(!snap.exists()){
    await set(root, { _ts: Date.now() });
  }
}

async function ensureCatalog(){
  const base = ref(db, `rooms/${state.space}/catalog`);
  const snap = await get(base);
  if(snap.exists()){
    state.catalog = snap.val();
  }else{
    // 建空的骨架，讓 UI 可以先新增
    state.catalog = { categories:{ restaurant:[], personal:[] } };
    await set(base, state.catalog);
  }
  buildCatalogIndex(state.catalog);
  renderGroups();   // 依現況畫大項
  renderItems();    // 如果已有 group 就畫細項
}

// 監看最近 20 筆
function watchRecent(){
  const q = query(ref(db, `rooms/${state.space}/records`), orderByChild('ts'), limitToLast(20));
  onValue(q, (snap)=>{
    const box = byId('recent-list');
    if(!box) return;
    const rows = [];
    snap.forEach(ch=>{
      const r = ch.val();
      rows.push(r);
    });
    rows.sort((a,b)=>b.ts-a.ts);
    box.innerHTML = rows.map(r=>{
      const sign = r.io==='expense' ? '-' : '+';
      const tag  = `${r.scope==='restaurant'?'餐廳':'個人'}．${r.group || ''}．${r.item || ''}`;
      const dstr = new Date(r.date||r.ts).toLocaleDateString('zh-TW');
      return `<div class="row">
        <div class="muted">${dstr}</div>
        <div class="tag">${tag}</div>
        <div class="${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount)}</div>
      </div>`;
    }).join('') || `<div class="muted">（目前尚無記錄）</div>`;
  });
}

// --- UI 綁定 ---
// 連線按鈕
(function bindConnect(){
  const btn = byId('btn-connect');
  if(!btn) return;
  // 預填 space
  const spaceInput = byId('space-code');
  if(spaceInput && state.space) spaceInput.value = state.space;

  btn.addEventListener('click', async ()=>{
    try{
      state.space = (spaceInput?.value || '').trim();
      if(!state.space){ alert('請先輸入共享代號'); return; }

      await ensureRoom();
      await ensureCatalog();
      watchRecent();

      // 標記 UI 已連線
      btn.textContent = '已連線';
      btn.dataset.state = 'on';
      btn.classList.remove('danger');
      btn.classList.add('success');
      localStorage.setItem('CF_SPACE', state.space);
    }catch(err){
      console.error(err);
      alert('連線失敗：' + (err?.message||err));
    }
  });
})();

// IO 切換（支出 / 收入）
(function bindIOChips(){
  const wrap = byId('chip-io');
  if(!wrap) return;
  wrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-io]');
    if(!btn) return;
    $$('#chip-io .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.io = btn.dataset.io;     // 'expense' | 'income'
    state.group = '';
    state.item  = '';
    renderGroups();
    renderItems();
  });
})();

// 用途切換（餐廳 / 個人）
(function bindScopeChips(){
  const wrap = byId('chip-scope');
  if(!wrap) return;
  wrap.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-scope]');
    if(!btn) return;
    $$('#chip-scope .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.scope = btn.dataset.scope; // 'restaurant' | 'personal'
    state.group = '';
    state.item  = '';
    renderGroups();
    renderItems();
  });
})();

// 選擇分類大項
function renderGroups(){
  const box = byId('groups-grid');
  if(!box) return;
  const gs = groupsFor(state.io, state.scope);
  box.innerHTML = gs.map(g=>{
    const active = (g===state.group) ? 'active':'';
    return `<button class="chip ${active}" data-group="${g}">${g}</button>`;
  }).join('') || `<div class="muted">（請先選支出/收入與用途）</div>`;

  box.onclick = (e)=>{
    const btn = e.target.closest('[data-group]');
    if(!btn) return;
    $$('#groups-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.group = btn.dataset.group;
    state.item  = '';
    renderItems();
  };
}

// 顯示大項下的細項
function renderItems(){
  const box = byId('items-grid');
  if(!box) return;
  if(!state.group){
    box.innerHTML = `<div class="muted">（請先選分類大項）</div>`;
    return;
  }
  const items = categoriesFor(state.scope, state.group);
  box.innerHTML = items.map(it=>{
    const active = (it.label===state.item) ? 'active':'';
    return `<button class="chip ${active}" data-item="${it.label}">${it.label}</button>`;
  }).join('') || `<div class="muted">（此群暫無項目，可於下方「新增項目」）</div>`;

  box.onclick = (e)=>{
    const btn = e.target.closest('[data-item]');
    if(!btn) return;
    $$('#items-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.item = btn.dataset.item;
  };
}

// 新增分類項目（會回寫到 /catalog）
(function bindAddItem(){
  const btn = byId('btn-add-item');
  const input = byId('new-item-name');
  if(!btn || !input) return;

  btn.addEventListener('click', async ()=>{
    const name = (input.value||'').trim();
    if(!name){ alert('請輸入項目名稱'); return; }
    if(!state.space){ alert('請先連線'); return; }
    if(!state.group){ alert('請先選分類大項'); return; }

    // 準備一筆 catalog item
    const item = { id: name, label: name, kind: state.group };

    // 以扁平陣列模式回寫（最穩）
    const base = ref(db, `rooms/${state.space}/catalog`);
    const snap = await get(base);
    let cat = snap.exists() ? snap.val() : [];
    if(!Array.isArray(cat)){
      // 若不是陣列，轉換成陣列（merge 原本 categories.*）
      const flat = [].concat(cat.categories?.restaurant || [],
                             cat.categories?.personal   || [],
                             cat.categories || []);
      cat = flat;
    }
    cat.push(item);
    await set(base, cat);

    // 更新本地索引與 UI
    state.catalog = cat;
    buildCatalogIndex(cat);
    input.value = '';
    renderItems();
  });
})();

// 送出記帳
(function bindSubmit(){
  const btn = byId('btn-submit');
  if(!btn) return;

  btn.addEventListener('click', async ()=>{
    try{
      if(!state.space){ alert('請先連線'); return; }

      const amount = Number((byId('amount')?.value || '').replace(/[^\d.-]/g,'')) || 0;
      if(!amount){ alert('請輸入金額'); return; }
      if(!state.group){ alert('請先選分類大項'); return; }
      if(!state.item){  alert('請先選項目'); return; }

      const dateStr = byId('date')?.value || ''; // yyyy-mm-dd
      const ts = dateStr ? Date.parse(dateStr) : Date.now();

      const note = byId('note')?.value || '';

      const rec = {
        ts,
        date: dateStr,
        io: state.io,               // expense|income
        scope: state.scope,         // restaurant|personal
        group: state.group,
        item : state.item,
        amount,
        payer: currentPayer(),      // 'J' | 'W' | 'JW' 或 'Jack'/'Wal'（依你的 UI 實作）
        pocket: currentPocket(),    // 'restaurant'|'jack'|'wal'（依你的 UI 實作）
        note
      };

      const key = push(ref(db, `rooms/${state.space}/records`)).key;
      await set(ref(db, `rooms/${state.space}/records/${key}`), rec);

      // reset 部分欄位
      if(byId('amount')) byId('amount').value = '';
      if(byId('note'))   byId('note').value   = '';
      console.log('saved:', rec);
      alert('已送出');
    }catch(err){
      console.error(err);
      alert('送出失敗：' + (err?.message||err));
    }
  });

  function currentPayer(){
    // 依你的 UI 取選中的付款人；這裡提供退路（無則回傳空字串）
    const el = $('#payers .active');
    return el?.dataset?.payer || '';
  }
  function currentPocket(){
    // 依你的 UI 取選中的付費口袋；這裡提供退路（無則回傳 'restaurant'）
    const el = $('#pockets .active');
    return el?.dataset?.pocket || 'restaurant';
  }
})();

// --- 預設 UI 初始化（不連線也先把 chip 樣式設好） ---
(function bootUI(){
  // 如果頁面上有 chip，幫第一顆加 active 也行；這裡改用狀態渲染：
  const ioBtn = $(`#chip-io [data-io="${state.io}"]`);
  if(ioBtn) ioBtn.classList.add('active');
  const scopeBtn = $(`#chip-scope [data-scope="${state.scope}"]`);
  if(scopeBtn) scopeBtn.classList.add('active');
  renderGroups();
  renderItems();
})();
