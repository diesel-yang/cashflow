// ====== CashFlow v3.6 ======

// app.js  (ES Module)

// ───────────────────────────────── Firebase Init
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, child, get, set, push, onValue, update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 你的專案設定（照你提供）
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

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
const auth = getAuth(app);

// ────────────────────────────── State / Helpers
const state = {
  space: localStorage.getItem('CF_SPACE') || '',
  io: null,              // 'expense' | 'income'
  scope: null,           // 'restaurant' | 'personal'
  group: null,           // 選到的大項名稱（中文）
  cat: null,             // 選到的細項（label）
  pocket: 'restaurant',  // 付費口袋：restaurant|jack|wal（收入時此欄位可省略）
  payer: 'J',            // 付款人：J|W|JW   / 收入時改為收款人：Jack|Wal
  balances: { restaurant:0, jack:0, wal:0 },

  catalog: null,         // 從 DB 載入的 catalog（扁平或 categories 皆可）
  catalogIndex: null,    // {restaurant:[], personal:[]}
  recent: []
};

const $ = (q, el=document)=> el.querySelector(q);
const $$= (q, el=document)=> el.querySelectorAll(q);
const ce = (tag, props={}) => Object.assign(document.createElement(tag), props);

function todayISO(){
  const d = new Date();
  const z = n=> String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

function toast(msg){
  console.log('[Toast]', msg);
}

// ────────────────────────────── UI: Tabs
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.page').forEach(p=>p.classList.remove('show'));
    $(`#page-${tab}`).classList.add('show');
  });
});

// ────────────────────────────── UI: Topbar
$('#space-code').value = state.space;

$('#btn-connect').addEventListener('click', connectSpace);

function setConnectedUI(on){
  $('#btn-connect').textContent = on ? '已連線' : '連線';
  $('#btn-connect').classList.toggle('on', on);
}

// ────────────────────────────── UI: 記帳頁元件
// IO：支出/收入
$('#chip-io').addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-io]');
  if(!b) return;
  state.io = b.dataset.io;
  // 高亮
  $$('#chip-io .chip').forEach(x=>x.classList.toggle('active', x===b));

  // 收入時，payers 標註為「收款人」
  renderPayers();
  renderGroups();
  state.group = null;
  state.cat   = null;
  renderItems();
});

// 用途：餐廳/個人
$('#chip-scope').addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-scope]');
  if(!b) return;
  state.scope = b.dataset.scope;
  $$('#chip-scope .chip').forEach(x=>x.classList.toggle('active', x===b));

  state.group = null;
  state.cat   = null;
  renderGroups();
  renderItems();
});

// 新增自訂細項
$('#btn-add-cat').addEventListener('click', addCustomItem);

// 送出紀錄
$('#btn-submit').addEventListener('click', submitRecord);

// 預設日期
$('#rec-date').value = todayISO();

// ────────────────────────────── Pockets & Payers
function renderPockets(){
  const host = $('#pockets-row');
  host.innerHTML = '';

  const pockets = [
    { key:'restaurant', emoji:'🏦', name:'餐廳'   },
    { key:'jack',       emoji:'👨‍🍳', name:'Jack' },
    { key:'wal',        emoji:'👨‍🍳', name:'Wal'  },
  ];

  pockets.forEach(p=>{
    const btn = ce('button',{ className:'pocket' });
    btn.innerHTML = `
      <span class="pocket-emoji">${p.emoji}</span>
      <span class="pocket-name">${p.name}</span>
      <span class="balance" id="bal-${p.key}">${fmtMoney(state.balances[p.key]||0)}</span>
    `;
    btn.addEventListener('click', ()=>{
      state.pocket = p.key;
      $$('#pockets-row .pocket').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
    });
    host.appendChild(btn);
  });

  // 預設選餐廳
  [...host.children][0]?.classList.add('active');
  state.pocket = 'restaurant';
}

function renderPayers(){
  const host = $('#payers-row');
  host.innerHTML = '';
  const isIncome = state.io === 'income';

  if(isIncome){
    // 收入：收款人（Jack / Wal）
    host.append(
      buildPayerBtn('Jack','Jack'),
      buildPayerBtn('Wal','Wal'),
    );
    state.payer = 'Jack';
  }else{
    // 支出：付款人（J / W / JW）
    host.append(
      buildPayerBtn('J','J'),
      buildPayerBtn('W','W'),
      buildPayerBtn('JW','JW'),
    );
    state.payer = 'J';
  }
  // 第 1 顆高亮
  host.firstElementChild?.classList.add('active');
}

function buildPayerBtn(text, val){
  const b = ce('button',{ className:'chip pill payer', textContent:text });
  b.addEventListener('click', ()=>{
    $$('#payers-row .payer').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    state.payer = val;
  });
  return b;
}

function fmtMoney(n){
  const s = (Number(n)||0).toFixed(0);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ────────────────────────────── Groups / Items
const GROUP_META = {
  // 餐廳
  '營業收入': { name:'營業收入', emoji:'💵' },
  '銷貨成本': { name:'銷貨成本', emoji:'🥬' },
  '人事':     { name:'人事',     emoji:'👥' },
  '水電租網': { name:'水電租網', emoji:'🏠' },
  '行銷':     { name:'行銷',     emoji:'📣' },
  '物流運輸': { name:'物流運輸', emoji:'🚛' },
  '行政稅務': { name:'行政稅務', emoji:'🧾' },

  // 個人收入 3 大類
  '薪資收入': { name:'薪資收入', emoji:'🧾' },
  '投資獲利': { name:'投資獲利', emoji:'📈' },
  '其他收入': { name:'其他收入', emoji:'🎁' },

  // 個人支出 9 大類
  '飲食':     { name:'飲食',     emoji:'🍔' },
  '治裝':     { name:'治裝',     emoji:'👕' },
  '住房':     { name:'住房',     emoji:'🏠' },
  '交通':     { name:'交通',     emoji:'🚇' },
  '教育':     { name:'教育',     emoji:'📚' },
  '娛樂':     { name:'娛樂',     emoji:'🎬' },
  '稅捐':     { name:'稅捐',     emoji:'💸' },
  '醫療':     { name:'醫療',     emoji:'🩺' },
  '其他支出': { name:'其他支出', emoji:'🔖' },
};

function groupsFor(io, scope){
  if(!io || !scope) return [];
  if(scope === 'restaurant'){
    return (io === 'income')
      ? ['營業收入']
      : ['銷貨成本','人事','水電租網','行銷','物流運輸','行政稅務'];
  }else{
    return (io === 'income')
      ? ['薪資收入','投資獲利','其他收入']
      : ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];
  }
}

// 建 catalog 索引（容忍扁平/舊命名）
function buildCatalogIndex(raw){
  const cat = raw || state.catalog || {};
  const flat = Array.isArray(cat) ? cat
    : [].concat(cat.categories?.restaurant || [],
                cat.categories?.personal   || [],
                cat.categories || []);

  const norm = k => (k==='餐廳收入'?'營業收入': (k==='其他'?'其他支出': k));

  const byScope = { restaurant:[], personal:[] };
  flat.forEach(x=>{
    const item = {
      id:   x.id   || x.label,
      label:x.label|| x.id,
      kind: norm(x.kind||'')
    };
    if(['營業收入','銷貨成本','人事','水電租網','行銷','物流運輸','行政稅務'].includes(item.kind)){
      byScope.restaurant.push(item);
    }else{
      byScope.personal.push(item);
    }
  });
  state.catalogIndex = byScope;
}

// 指定（收支×用途×大項）回傳細項
function categoriesFor(io, scope, group){
  const pool = (scope==='restaurant') ? (state.catalogIndex?.restaurant||[])
                                       : (state.catalogIndex?.personal  ||[]);
  return pool.filter(c => c.kind === group);
}

function renderGroups(){
  const host = $('#group-grid');
  host.innerHTML = '';
  const arr = groupsFor(state.io, state.scope);

  arr.forEach(name=>{
    const meta = GROUP_META[name] || {name, emoji:'•'};
    const b = ce('button',{ className:'chip pill xl' });
    b.innerHTML = `<span class="emoji">${meta.emoji}</span><span>${meta.name}</span>`;
    b.addEventListener('click', ()=>{
      state.group = name;
      state.cat   = null;
      $$('#group-grid .chip').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      renderItems();
    });
    host.appendChild(b);
  });
}

function renderItems(){
  const host = $('#items-grid');
  host.innerHTML = '';

  if(!state.group){
    host.innerHTML = `<div class="muted">（暫無項目）</div>`;
    return;
  }
  const arr = categoriesFor(state.io, state.scope, state.group);
  if(!arr.length){
    host.innerHTML = `<div class="muted">（暫無項目）</div>`;
    return;
  }
  arr.forEach(x=>{
    const b = ce('button',{ className:'chip item' });
    b.textContent = x.label;
    b.addEventListener('click', ()=>{
      state.cat = x.label;
      $$('#items-grid .chip').forEach(n=>n.classList.remove('active'));
      b.classList.add('active');
    });
    host.appendChild(b);
  });
}

// 新增自訂細項（使用目前選到的大項作為 kind）
async function addCustomItem(){
  const name = ($('#new-cat-name').value||'').trim();
  if(!name){ toast('請輸入項目名稱'); return; }
  if(!state.group){ toast('請先選擇分類大項'); return; }
  const scope = state.scope || 'personal';

  const item = { id:name, label:name, kind:state.group };

  const base = ref(db, `rooms/${state.space}/catalog/categories/${scope}`);
  const newRef = push(base);
  await set(newRef, item);

  // 本地索引更新
  (scope==='restaurant' ? state.catalogIndex.restaurant : state.catalogIndex.personal).push(item);
  $('#new-cat-name').value = '';
  renderItems();
  toast('已新增');
}

// 送出記帳
async function submitRecord(){
  // 基本檢查
  const amt = Number($('#rec-amt').value||0);
  if(!state.io)        return toast('請先選擇「支出／收入」');
  if(!state.scope)     return toast('請先選擇「用途」');
  if(!state.group)     return toast('請先選擇「分類大項」');
  if(!state.cat)       return toast('請選擇或輸入細項（可先新增一個）');
  if(!(amt>0))         return toast('請輸入金額');

  const dt = $('#rec-date').value || todayISO();
  const note = $('#rec-note').value||'';

  const rec = {
    ts: Date.now(),
    date: dt,
    io: state.io,                // 'expense' | 'income'
    scope: state.scope,          // 'restaurant' | 'personal'
    group: state.group,          // 中文：銷貨成本 / 飲食 / 薪資收入 …
    cat: state.cat,              // 細項 label
    pocket: state.pocket,        // 付費口袋
    payer: state.payer,          // 付款人（或收款人）
    amount: amt,
    note: note
  };

  const base = ref(db, `rooms/${state.space}/records`);
  await set(push(base), rec);

  $('#rec-amt').value = '';
  $('#rec-note').value = '';
  toast('已送出');
}

// 近期 20 筆
function watchRecent(){
  const r = ref(db, `rooms/${state.space}/records`);
  onValue(r, snap=>{
    const vals = snap.val() || {};
    const arr = Object.values(vals).sort((a,b)=>b.ts-a.ts).slice(0,20);
    state.recent = arr;
    renderRecent();
  });
}
function renderRecent(){
  const host = $('#recent-list');
  host.innerHTML = '';
  state.recent.forEach(x=>{
    const row = ce('div',{className:'row recent'});
    row.innerHTML = `
      <div class="r-date">${x.date}</div>
      <div class="r-text">${x.scope==='restaurant'?'餐廳':'個人'}・${x.group}・${x.cat}</div>
      <div class="r-amt ${x.io==='income'?'pos':'neg'}">${x.io==='income'?'+':'-'}${fmtMoney(x.amount)}</div>
    `;
    host.appendChild(row);
  });
}

// 讀口袋餘額（可之後接總額）— 目前先以 0 顯示
function loadBalances(){
  // 這邊可接你的資金結餘計算邏輯
  ['restaurant','jack','wal'].forEach(k=>{
    $(`#bal-${k}`)?.replaceWith(ce('span',{className:'balance', id:`bal-${k}`, textContent:fmtMoney(state.balances[k]||0)}));
  });
}

// ────────────────────────────── Connect / Load
async function connectSpace(){
  const space = ($('#space-code').value||'').trim();
  if(!space) return toast('請輸入共享代號');
  state.space = space;
  localStorage.setItem('CF_SPACE', space);

  // 建立空節點（若不存在）
  const root = ref(db, `rooms/${space}`);
  const snap = await get(root);
  if(!snap.exists()){
    await set(root, { _ts: Date.now() });
  }

  // 讀取/建立 catalog
  await ensureCatalog();
  setConnectedUI(true);
  loadBalances();
  watchRecent();
}

async function ensureCatalog(){
  const base = ref(db, `rooms/${state.space}/catalog`);
  const snap = await get(base);
  if(snap.exists()){
    state.catalog = snap.val();
  }else{
    // 若空的，先放一個空 categories 讓使用者可新增
    state.catalog = { categories:{ restaurant:[], personal:[] } };
    await set(base, state.catalog);
  }
  buildCatalogIndex(state.catalog);
  // 預設 UI 狀態
  renderPockets();
  renderPayers();
  // 預設：支出 + 餐廳
  state.io = 'expense';
  state.scope = 'restaurant';
  $('#chip-io [data-io="expense"]').classList.add('active');
  $('#chip-scope [data-scope="restaurant"]').classList.add('active');
  renderGroups();
  renderItems();
}

// ────────────────────────────── Auth
onAuthStateChanged(auth, user=>{
  if(user) { setConnectedUI(!!state.space); }
});
signInAnonymously(auth).catch(console.error);

// ────────────────────────────── Boot
renderPockets();
renderPayers();
