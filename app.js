// app.js (ES Module, v51)

// ── Firebase ─────────────────────────────────────────
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

// ── Helpers / State ────────────────────────────────
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = id=>document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString('zh-TW');

const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense",            // 'expense' | 'income'
  scope: "restaurant",      // 'restaurant' | 'personal'
  group: "", item: "",
  payer: "", pocket: "",
  catalog: null, catalogIndex: null
};
window.CF = { state }; // 方便除錯

// ── 群組定義（UI 大項，採官方名稱） ────────────────
const REST_GROUPS = [
  '營業收入',
  '銷貨成本',
  '人事',
  '水電/租金/網路',
  '行銷',
  '物流/運輸',
  '行政/稅務'
];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

function groupsFor(io, scope){
  if (scope==='restaurant') return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}

// ── kind 正規化（舊稱/無斜線 → 官方名） ─────────────
function normalizeKind(k){
  if(!k) return '';
  // 舊稱 → 新稱
  if (k === '餐廳收入') return '營業收入';
  if (k === '其他')     return '其他支出';
  // 無斜線別名 → 有斜線官方
  const alias = {
    '水電租網': '水電/租金/網路',
    '物流運輸': '物流/運輸',
    '行政稅務': '行政/稅務'
  };
  return alias[k] || k;
}

// ── Room / Catalog / Recent ────────────────────────
async function ensureRoom(){
  if(!state.space) throw new Error('缺少共享代號');
  const root = ref(db, `rooms/${state.space}`);
  const s = await get(root);
  if(!s.exists()) await set(root, { _ts: Date.now() });
}

async function ensureCatalog(){
  const base = ref(db, `rooms/${state.space}/catalog`);
  const s = await get(base);
  // 兼容兩種格式：Array 或 {categories:{restaurant[], personal[]}}
  state.catalog = s.exists() ? s.val() : { categories:{ restaurant:[], personal:[] } };
  if(!s.exists()) await set(base, state.catalog);
  buildCatalogIndex(state.catalog);
  renderGroups(); renderItems();
}

function buildCatalogIndex(raw){
  const flat = Array.isArray(raw)
    ? raw
    : [].concat(raw?.categories?.restaurant||[], raw?.categories?.personal||[], raw?.categories||[]);
  const by = { restaurant:[], personal:[] };
  flat.forEach(x=>{
    const item = { id:x.id||x.label, label:x.label||x.id, kind: normalizeKind(x.kind) };
    if (REST_GROUPS.includes(item.kind)) by.restaurant.push(item);
    else by.personal.push(item);
  });
  state.catalogIndex = by;
  console.log('[catalogIndex]', 'restaurant=', by.restaurant.length, 'personal=', by.personal.length);
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

// ── 連線按鈕（支援自動連線） ───────────────────────
(function bindConnect(){
  const btn = byId('btn-connect');
  const inp = byId('space-code');
  if (inp && state.space) inp.value = state.space;

  async function doConnect(){
    try{
      state.space = (inp?.value||'').trim() || state.space;
      if(!state.space){ alert('請輸入共享代號'); return; }
      await ensureRoom(); await ensureCatalog();
      renderPockets(); renderPayers();        // 連線後再畫，避免沒 space 時監看報錯
      watchRecent(); watchBalances();         // 監看列表 + 餘額
      if(btn){
        btn.textContent='已連線'; btn.dataset.state='on';
        btn.classList.remove('danger'); btn.classList.add('success');
      }
      localStorage.setItem('CF_SPACE', state.space);
    }catch(err){ console.error(err); alert('連線失敗：'+(err?.message||err)); }
  }

  if (btn) btn.addEventListener('click', doConnect);
  // 已記住代號 → 自動連線
  if (state.space) doConnect();
})();

// ── 口袋小豬（PNG icon + 即時餘額） ────────────────
const POCKETS = [
  { key:'restaurant', name:'餐廳', icon:'icons/pocket-restaurant-128.png' },
  { key:'jack',       name:'Jack', icon:'icons/pocket-jack-128.png' },
  { key:'wal',        name:'Wal',  icon:'icons/pocket-wal-128.png'  },
];

function renderPockets(){
  const host = byId('pockets-row'); if(!host) return;
  host.innerHTML = POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="${state.pocket===p.key}">
      <img class="pig" src="${p.icon}" alt="${p.name}">
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

// ── 付款人/收款人（依收支切換） ─────────────────────
function renderPayers(){
  const row = byId('payers-row'); if(!row) return;
  if(state.io==='income'){
    row.innerHTML = [
      {key:'Jack', label:'👨‍🍳 Jack'},
      {key:'Wal',  label:'👨‍🍳 Wal'}
    ].map(x=>`<button class="chip pill lg" data-payer="${x.key}">${x.label}</button>`).join('');
  }else{
    row.innerHTML = [
      {key:'J',  label:'👨‍🍳 J'},
      {key:'W',  label:'👨‍🍳 W'},
      {key:'JW', label:'👥 JW'}
    ].map(x=>`<button class="chip pill lg" data-payer="${x.key}">${x.label}</button>`).join('');
  }
  row.onclick = (e)=>{
    const btn = e.target.closest('[data-payer]'); if(!btn) return;
    $$('#payers-row .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.payer = btn.dataset.payer;
  };
  const def = row.querySelector('[data-payer]');
  if(def){ def.classList.add('active'); state.payer = def.dataset.payer; }
  const label = row.parentElement?.previousElementSibling?.querySelector('.subhead');
  if(label) label.textContent = (state.io==='income') ? '收款人' : '付款人';
}

// ── IO / Scope 切換 ───────────────────────────────
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

// ── 分類大項 / 項目（對應 #group-grid / #items-grid） ───
function renderGroups(){
  const box = byId('group-grid'); if(!box) return;
  const gs = groupsFor(state.io, state.scope);
  box.innerHTML = gs.map(g=>`<button class="chip" data-group="${g}">${g}</button>`).join('');
  box.onclick = (e)=>{
    const btn = e.target.closest('[data-group]'); if(!btn) return;
    $$('#group-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.group = btn.dataset.group; state.item='';
    renderItems();
  };
}
function renderItems(){
  const box = byId('items-grid'); if(!box) return;
  if(!state.group){ box.innerHTML = `<div class="muted">（請先選分類大項）</div>`; return; }
  const items = categoriesFor(state.scope, state.group);
  box.innerHTML = items.map(it=>`<button class="chip" data-item="${it.label}">${it.label}</button>`).join('')
    || `<div class="muted">（此群暫無項目，可於下方「新增項目」）</div>`;
  box.onclick = (e)=>{
    const btn = e.target.closest('[data-item]'); if(!btn) return;
    $$('#items-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.item = btn.dataset.item;
  };
}

// ── 新增項目（#new-cat-name / #btn-add-cat） ───────────
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
    // 直接用目前的分類大項為 kind
    cat.push({ id:name, label:name, kind: state.group });
    await set(base, cat);

    state.catalog = cat;
    buildCatalogIndex(cat);
    input.value=''; renderItems();
  });
})();

// ── 送出記帳（#btn-submit；#rec-amt / #rec-date / #rec-note） ──
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

// ── 啟動（畫靜態 && 監看） ─────────────────────────
;(function boot(){
  // 預設 chip 狀態
  byId('chip-io')?.querySelector('[data-io="expense"]')?.classList.add('active');
  byId('chip-scope')?.querySelector('[data-scope="restaurant"]')?.classList.add('active');
  // 靜態先畫（未連線也能看得到 UI），真正資料在連線後 watchBalances/watchRecent
  renderPockets();
  renderPayers();
  renderGroups();
  renderItems();
  // 若頁上沒有連線鈕但本地已有空間，直接啟用
  if(state.space && !byId('btn-connect')){
    ensureRoom().then(ensureCatalog).then(()=>{ watchRecent(); watchBalances(); }).catch(console.error);
  }
})();
