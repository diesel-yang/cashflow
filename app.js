// app.js (v52 完整版)

// ── Firebase ─────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, get, set, push, onValue,
  query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);
await signInAnonymously(auth).catch(console.error);

// ── Helpers / State ──────────────────────
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = id=>document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString('zh-TW');

const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense",
  scope: "restaurant",
  group: "", item: "",
  payer: "", pocket: "",
  catalog: null, catalogIndex: null
};
window.CF = { state };

// ── 群組定義 ─────────────────────────────
const REST_GROUPS = [
  '營業收入','銷貨成本','人事',
  '水電/租金/網路','行銷','物流/運輸','行政/稅務'
];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

function groupsFor(io, scope){
  if (scope==='restaurant')
    return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}

// ── kind 正規化 ─────────────────────────
function normalizeKind(k){
  if(!k) return '';
  if (k==='餐廳收入') return '營業收入';
  if (k==='其他')   return '其他支出';
  const alias = {
    '水電租網': '水電/租金/網路',
    '物流運輸': '物流/運輸',
    '行政稅務': '行政/稅務'
  };
  return alias[k] || k;
}

// ── Room / Catalog / Recent ─────────────
async function ensureRoom(){
  if(!state.space) throw new Error('缺少共享代號');
  const root = ref(db, `rooms/${state.space}`);
  const s = await get(root);
  if(!s.exists()) await set(root, { _ts: Date.now() });
}
/* 建立 catalog 索引：確保先完成再渲染 */
let catalog = null;
let catalogIndex = null;

function buildCatalogIndex(cat){
  const groups = {};   // groupName -> { name, emoji }
  const items  = {};   // itemId   -> { id, label, emoji, group }
  // groups
  for(const g of cat.groups){
    groups[g.name] = { name: g.name, emoji: g.emoji || '📁' };
  }
  // items
  for(const it of cat.items){
    items[it.id] = {
      id: it.id,
      label: it.label,
      emoji: it.emoji || '🔸',
      group: it.group
    };
  }
  return { groups, items };
}

async function ensureCatalog(){
  if(catalog) return;
  const snap = await get(ref(dbRoom, 'catalog')); // 你的 DB 參照
  catalog = snap.val();
  catalogIndex = buildCatalogIndex(catalog);
}


function categoriesFor(scope, group){
  const pool = scope==='restaurant' ? (state.catalogIndex?.restaurant||[]) : (state.catalogIndex?.personal||[]);
  return pool.filter(c=>c.kind===group);
}

function watchRecent(){
  const box = byId('recent-list'); if(!box) return;
  const q = query(ref(db, `rooms/${state.space}/records`), orderByChild('ts'), limitToLast(20));
  onValue(q, (snap)=>{
    const rows=[]; snap.forEach(ch=>rows.push(ch.val())); rows.sort((a,b)=>b.ts-a.ts);
    box.innerHTML = rows.map(r=>{
      const sign = r.io==='expense' ? '-' : '+';
      const d = r.date ? r.date : new Date(r.ts).toLocaleDateString('zh-TW');
      const tag = `${r.scope==='restaurant'?'餐廳':'個人'}．${r.group||''}．${r.item||''}`;
      return `<div class="row">
        <div class="r-date">${d}</div>
        <div class="tag">${tag}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount)}</div>
      </div>`;
    }).join('') || `<div class="muted">（目前尚無記錄）</div>`;
  });
}

// ── 連線按鈕 ─────────────────────────────
(function bindConnect(){
  const btn = byId('btn-connect');
  const inp = byId('space-code');
  if (inp && state.space) inp.value = state.space;

  async function doConnect(){
    try{
      state.space = (inp?.value||'').trim() || state.space;
      if(!state.space){ alert('請輸入共享代號'); return; }
      await ensureRoom(); await ensureCatalog();
      renderPockets(); renderPayers();
      watchRecent(); watchBalances();
      if(btn){
        btn.textContent='已連線'; btn.dataset.state='on';
        btn.classList.remove('danger'); btn.classList.add('success');
      }
      localStorage.setItem('CF_SPACE', state.space);
    }catch(err){ console.error(err); alert('連線失敗：'+(err?.message||err)); }
  }

  if (btn) btn.addEventListener('click', doConnect);
  if (state.space) doConnect();
})();

// ── 口袋（SVG） ─────────────────────────
const POCKETS = [
  { key:'restaurant', name:'餐廳' },
  { key:'jack',       name:'Jack' },
  { key:'wal',        name:'Wal'  },
];

function renderPockets(){
  const host = byId('pockets-row'); if(!host) return;
  host.innerHTML = POCKETS.map(p=>`
    <button class="pocket ${p.key}" data-pocket="${p.key}" aria-pressed="${state.pocket===p.key}">
      <svg class="pig" aria-hidden="true"><use href="#pig-icon"></use></svg>
      <div class="meta">
        <div class="name">${p.name}</div>
        <div class="amt" id="amt-${p.key}">0</div>
      </div>
    </button>
  `).join('');
  if(!state.pocket) state.pocket='restaurant';
  setActivePocket(state.pocket);

  host.onclick = (e)=>{
    const btn = e.target.closest('[data-pocket]');
    if(!btn) return;
    setActivePocket(btn.dataset.pocket);
  };
}

function setActivePocket(key){
  state.pocket = key;
  $$('#pockets-row .pocket').forEach(el=>{
    const on = el.dataset.pocket===key;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', on?'true':'false');
  });
}

function updatePocketAmounts(bal){
  for(const p of POCKETS){
    const el = byId(`amt-${p.key}`);
    if(el) el.textContent = (Number(bal[p.key])||0).toLocaleString('zh-TW');
  }
}

function sumBalances(records){
  const bal = { restaurant:0, jack:0, wal:0 };
  for(const r of records){
    const delta = (r.io==='income'? +1 : -1) * (Number(r.amount)||0);
    if(bal[r.pocket]!=null) bal[r.pocket] += delta;
  }
  return bal;
}

function watchBalances(){
  if(!state.space) return;
  const q = query(ref(db, `rooms/${state.space}/records`), orderByChild('ts'), limitToLast(200));
  onValue(q, snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    updatePocketAmounts(sumBalances(arr));
  });
}

// ── 付款人/收款人 ──────────────────────
function renderPayers(){
  const row = document.getElementById('payers-row');
  row.innerHTML = '';

  const opts = (state.io === 'income')
    ? [{key:'jack', label:'Jack', emoji:'👨‍🍳'},{key:'wal',label:'Wal',emoji:'👨‍🍳'}]
    : [{key:'J',label:'J',emoji:'👨‍🍳'},{key:'W',label:'W',emoji:'👨‍🍳'},{key:'JW',label:'JW',emoji:'👥'}];
  const frag = document.createDocumentFragment();
  for(const p of opts){
    const b = document.createElement('button');
    b.className = 'chip pill is-option';
    b.dataset.payer = p.key;
    b.innerHTML = `<span class="emoji">${p.emoji}</span><span class="label">${p.label}</span>`;
    if(state.payer === p.key) b.classList.add('active');
    b.addEventListener('click', ()=>{
      state.payer = p.key;
      renderPayers(); // 切換高亮
    });
    frag.appendChild(b);
  }
  row.appendChild(frag);
}
    
// ── IO / Scope 切換 ────────────────────
(function bindIO(){
  const wrap = byId('chip-io'); if(!wrap) return;
  wrap.addEventListener('click', e=>{
    const btn = e.target.closest('[data-io]'); if(!btn) return;
    $$('#chip-io .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.io = btn.dataset.io;
    renderPayers(); renderGroups(); renderItems();
  });
  wrap.querySelector('[data-io="expense"]')?.classList.add('active');
})();
(function bindScope(){
  const wrap = byId('chip-scope');
  if(wrap){
    wrap.addEventListener('click', e=>{
      const btn = e.target.closest('[data-scope]'); if(!btn) return;
      $$('#chip-scope .active').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      state.scope = btn.dataset.scope; state.group=''; state.item='';
      renderGroups(); renderItems();
    });
    wrap.querySelector('[data-scope="restaurant"]')?.classList.add('active');
  }
})();

// ── 分類大項 / 項目 ────────────────────
function renderGroups(){
  const wrap = document.getElementById('group-grid');
  wrap.innerHTML = '';
  if(!state.io || !state.scope || !catalogIndex) return;

  const wanted = groupsFor(state.io, state.scope); // 你既有的函式
  const frag = document.createDocumentFragment();
  const frag = document.createDocumentFragment();
  for(const p of opts){
    const b = document.createElement('button');
    b.className = 'chip pill is-option';
    b.dataset.payer = p.key;
    b.innerHTML = `<span class="emoji">${p.emoji}</span><span class="label">${p.label}</span>`;
    if(state.payer === p.key) b.classList.add('active');
    b.addEventListener('click', ()=>{
      state.payer = p.key;
      renderPayers(); // 切換高亮
    });
    frag.appendChild(b);
  }
  row.appendChild(frag);
}

function renderPockets(){
  const row = document.getElementById('pockets-row');
  row.innerHTML = '';
  const pockets = [
    {key:'restaurant', label:'餐廳',  amt: balances.restaurant || 0},
    {key:'jack',       label:'Jack',  amt: balances.jack || 0},
    {key:'wal',        label:'Wal',   amt: balances.wal  || 0},
  ];
  const frag = document.createDocumentFragment();
  pockets.forEach(p=>{
    const card = document.createElement('button');
    card.className = 'pocket is-option';
    card.dataset.pocket = p.key;
    if(state.pocket === p.key) card.classList.add('active');
    card.innerHTML = `
      <svg class="pig" viewBox="0 0 167.18021 139.17355" aria-hidden="true">
        <use href="#pig-icon"></use>
      </svg>
      <div class="meta">
        <div class="name">${p.label}</div>
        <div class="amt">${formatAmt(p.amt)}</div>
      </div>`;
    card.addEventListener('click', ()=>{
      state.pocket = p.key;
      renderPockets(); // 高亮
    });
    frag.appendChild(card);
  });
  row.appendChild(frag);
}

async function ensureCatalog(){
  if(catalog) return;
  const cached = localStorage.getItem('cf_catalog_v2');
  if(cached){
    catalog = JSON.parse(cached);
  }else{
    const snap = await get(ref(dbRoom, 'catalog'));
    catalog = snap.val();
    localStorage.setItem('cf_catalog_v2', JSON.stringify(catalog));
  }
  catalogIndex = buildCatalogIndex(catalog);
}

const normalizeKind = k => {
  if(!k) return '';
  if(k === '餐廳收入') return '營業收入';
  if(k === '其他')     return '其他支出';
  return k;
};

(async function init(){
  bindConnectButton();      // 連線按鈕
  bindIOScopeChips();       // 支出/收入 + 餐廳/個人
  bindAddItem();            // 新增項目
  bindSubmit();             // 送出

  await connectIfSaved();   // 若記過 room 就自動連上
  await ensureCatalog();    // 只抓一次，建立 catalogIndex

  watchRecent();            // 最近 20 筆
  watchBalances();          // 三個口袋餘額

  // 初始渲染
  renderPockets();
  renderPayers();
  renderGroups();
  renderItems();
})();


  wanted.forEach(gName=>{
    const g = catalogIndex.groups[gName] || {name:gName, emoji:'📁'};
    const btn = document.createElement('button');
    btn.className = 'chip box is-option';
    btn.dataset.group = gName;
    btn.innerHTML = `<span class="emoji">${g.emoji}</span><span class="label">${g.name}</span>`;
    if(state.group === gName) btn.classList.add('active');
    btn.addEventListener('click', ()=>{
      state.group = gName;
      renderGroups();      // 切換高亮
      renderItems();       // 依群組渲染項目
    });
    frag.appendChild(btn);
  });
  wrap.appendChild(frag);
}

function renderItems(){
  const wrap = document.getElementById('items-grid');
  wrap.innerHTML = '';
  if(!state.group || !catalogIndex) return;

  // 只挑屬於該 group 的 items
  const frag = document.createDocumentFragment();
  for(const id in catalogIndex.items){
    const it = catalogIndex.items[id];
    if(it.group !== state.group) continue;

    const btn = document.createElement('button');
    btn.className = 'chip box is-option';
    btn.dataset.itemId = id;
    btn.innerHTML = `<span class="emoji">${it.emoji}</span><span class="label">${it.label}</span>`;
    if(state.itemId === id) btn.classList.add('active');
    btn.addEventListener('click', ()=>{
      state.itemId = id;
      renderItems(); // 高亮切換
    });
    frag.appendChild(btn);
  }
  wrap.appendChild(frag);
}

// ── 新增項目 ───────────────────────────
;(function bindAddItem(){
  const input = byId('new-cat-name');
  const btn   = byId('btn-add-cat');
  if(!input || !btn) return;
  btn.addEventListener('click', async ()=>{
    const name = (input.value||'').trim();
    if(!name){ alert('請輸入項目名稱'); return; }
    if(!state.space){ alert('請先連線'); return; }
    if(!state.group){ alert('請先選分類大項'); return; }

    const base = ref(db, `rooms/${state.space}/catalog`);
    const s = await get(base);
    let cat = s.exists()?s.val():[];
    if(!Array.isArray(cat)){
      const flat = [].concat(cat.categories?.restaurant||[], cat.categories?.personal||[], cat.categories||[]);
      cat = flat;
    }
    cat.push({ id:name, label:name, kind: state.group });
    await set(base, cat);

    state.catalog = cat;
    buildCatalogIndex(cat);
    input.value=''; renderItems();
  });
})();

// ── 送出記帳 ───────────────────────────
byId('btn-submit')?.addEventListener('click', submitRecord);
async function submitRecord(){
  try{
    if(!state.space){ alert('請先連線'); return; }
    const amt = Number((byId('rec-amt')?.value||'').replace(/[^\d.-]/g,''))||0;
    if(!amt){ alert('請輸入金額'); return; }
    if(!state.pocket){ alert('請選付款口袋'); return; }
    if(!state.payer){  alert('請選付款人/收款人'); return; }

    const dateStr = byId('rec-date')?.value || '';
    const ts = dateStr ? Date.parse(dateStr) : Date.now();
    const note = byId('rec-note')?.value || '';

    const rec = {
      ts, date: dateStr, amount: amt,
      io: state.io, scope: state.scope,
      group: state.group || '', item: state.item || '',
      payer: state.payer, pocket: state.pocket,
      note
    };
    const key = push(ref(db, `rooms/${state.space}/records`)).key;
    await set(ref(db, `rooms/${state.space}/records/${key}`), rec);

    byId('rec-amt') && (byId('rec-amt').value='');
    byId('rec-note') && (byId('rec-note').value='');
    alert('已送出');
  }catch(err){
    console.error(err); alert('送出失敗：'+(err?.message||err));
  }
}

// ── 啟動 ──────────────────────────────
;(function boot(){
  byId('chip-io')?.querySelector('[data-io="expense"]')?.classList.add('active');
  byId('chip-scope')?.querySelector('[data-scope="restaurant"]')?.classList.add('active');
  renderPockets();
  renderPayers();
  renderGroups();
  renderItems();
  if(state.space && !byId('btn-connect')){
    ensureRoom().then(ensureCatalog).then(()=>{ watchRecent(); watchBalances(); }).catch(console.error);
  }
})();
