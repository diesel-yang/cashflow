// app.js  (ES Module)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, child, get, set, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const state = {
  space: localStorage.getItem('CF_SPACE') || '',
  io: null,              // 'expense' | 'income'
  scope: null,           // 'restaurant' | 'personal'
  group: null,           // 大項（中文）
  cat: null,             // 細項 label
  pocket: 'restaurant',  // 付費口袋：restaurant|jack|wal
  payer: 'J',            // 付款人：J|W|JW；收入時為 Jack|Wal
  balances: { restaurant:0, jack:0, wal:0 },

  catalog: null,         // 原始 catalog
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
function toast(m){ console.log('[Toast]', m); }
function fmt(n){ const s=(+n||0).toFixed(0); return s.replace(/\B(?=(\d{3})+(?!\d))/g,','); }

// Tabs
$$('.tab').forEach(b=>{
  b.addEventListener('click', ()=>{
    $$('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const tab = b.dataset.tab;
    $$('.page').forEach(p=>p.classList.remove('show'));
    $(`#page-${tab}`).classList.add('show');
  });
});

// Topbar
$('#space-code').value = state.space;
$('#btn-connect').addEventListener('click', connectSpace);
function setConnectedUI(on){
  $('#btn-connect').textContent = on ? '已連線' : '連線';
  $('#btn-connect').classList.toggle('on', on);
}

// 記帳互動
$('#chip-io').addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-io]');
  if(!b) return;
  state.io = b.dataset.io;
  $$('#chip-io .chip').forEach(x=>x.classList.toggle('active', x===b));
  renderPayers();
  state.group = null; state.cat = null;
  renderGroups(); renderItems();
});

$('#chip-scope').addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-scope]');
  if(!b) return;
  state.scope = b.dataset.scope;
  $$('#chip-scope .chip').forEach(x=>x.classList.toggle('active', x===b));
  state.group = null; state.cat = null;
  renderGroups(); renderItems();
});

$('#btn-add-cat').addEventListener('click', addCustomItem);
$('#btn-submit').addEventListener('click', submitRecord);
$('#rec-date').value = todayISO();

// pockets / payers
function renderPockets(){
  const host = $('#pockets-row'); host.innerHTML = '';
  const pockets = [
    { key:'restaurant', emoji:'🏦', name:'餐廳' },
    { key:'jack',       emoji:'👨‍🍳', name:'Jack' },
    { key:'wal',        emoji:'👨‍🍳', name:'Wal'  },
  ];
  pockets.forEach(p=>{
    const btn = ce('button',{ className:'chip box pocket' });
    btn.innerHTML = `
      <span class="emoji" aria-hidden="true">${p.emoji}</span>
      <span class="label">${p.name}</span>
      <span class="badge">${fmt(state.balances[p.key]||0)}</span>
    `;
    btn.addEventListener('click', ()=>{
      state.pocket = p.key;
      $$('#pockets-row .chip').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
    });
    host.appendChild(btn);
  });
  host.firstElementChild?.classList.add('active');
  state.pocket = 'restaurant';
}

function renderPayers(){
  const host = $('#payers-row'); host.innerHTML = '';
  const isIncome = state.io === 'income';
  const btns = isIncome
    ? [{t:'Jack', v:'Jack'}, {t:'Wal', v:'Wal'}]
    : [{t:'J', v:'J'}, {t:'W', v:'W'}, {t:'JW', v:'JW'}];

  btns.forEach(({t,v},i)=>{
    const b = ce('button',{ className:'chip pill payer', textContent:t });
    b.addEventListener('click', ()=>{
      $$('#payers-row .chip').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); state.payer = v;
    });
    if(i===0){ b.classList.add('active'); state.payer=v; }
    host.appendChild(b);
  });
}

// Groups / Items
const GROUP_META = {
  '營業收入': { name:'營業收入', emoji:'💵' },
  '銷貨成本': { name:'銷貨成本', emoji:'🥬' },
  '人事':     { name:'人事',     emoji:'👥' },
  '水電租網': { name:'水電租網', emoji:'🏠' },
  '行銷':     { name:'行銷',     emoji:'📣' },
  '物流運輸': { name:'物流運輸', emoji:'🚛' },
  '行政稅務': { name:'行政稅務', emoji:'🧾' },

  '薪資收入': { name:'薪資收入', emoji:'🧾' },
  '投資獲利': { name:'投資獲利', emoji:'📈' },
  '其他收入': { name:'其他收入', emoji:'🎁' },

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

}function buildCatalogIndex(raw){
  const cat = raw ?? state.catalog ?? {};
  // 允許三種來源：扁平陣列 / categories.restaurant / categories.personal
  const flat = Array.isArray(cat) ? cat
    : [].concat(cat.categories?.restaurant || [],
                cat.categories?.personal   || [],
                cat.categories || []);

  // 舊命名 → 新命名
  const normalizeKind = (k) => {
    if (!k) return '';
    if (k === '餐廳收入') return '營業收入';
    if (k === '其他')   return '其他支出';
    return k;
  };

  const byScope = { restaurant:[], personal:[] };
  const REST_GROUPS = new Set(['營業收入','銷貨成本','人事','水電租網','行銷','物流運輸','行政稅務']);

  flat.forEach(x=>{
    const item = {
      id   : x.id    || x.label,
      label: x.label || x.id,
      kind : normalizeKind(x.kind || '')
    };
    if(REST_GROUPS.has(item.kind)) byScope.restaurant.push(item);
    else                           byScope.personal.push(item);
  });

  state.catalogIndex = byScope;

  // Console 診斷
  console.log('[catalogIndex]',
    'restaurant=', byScope.restaurant.length,
    'personal=',   byScope.personal.length
  );
}
function categoriesFor(io, scope, group){
  const pool = (scope==='restaurant')
    ? (state.catalogIndex?.restaurant || [])
    : (state.catalogIndex?.personal   || []);

  return pool.filter(c => c.kind === group);
}

function renderGroups(){
  const host = $('#group-grid'); host.innerHTML='';
  const arr = groupsFor(state.io, state.scope);
  arr.forEach(name=>{
    const meta = GROUP_META[name] || {name, emoji:'•'};
    const b = ce('button',{ className:'chip box group' });
    b.innerHTML = `<span class="emoji">${meta.emoji}</span><span class="label">${meta.name}</span>`;
    b.addEventListener('click', ()=>{
      state.group = name; state.cat = null;
      $$('#group-grid .chip').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); renderItems();
    });
    host.appendChild(b);
  });
}
function renderItems(){
  const host = $('#items-grid'); host.innerHTML='';
  if(!state.group){ host.innerHTML = `<div class="muted">（此群暫無項目）</div>`; return; }
  const arr = categoriesFor(state.io, state.scope, state.group);
  if(!arr.length){ host.innerHTML = `<div class="muted">（此群暫無項目）</div>`; return; }
  arr.forEach(x=>{
    const b = ce('button',{ className:'chip pill item', textContent:x.label });
    b.addEventListener('click', ()=>{
      state.cat = x.label;
      $$('#items-grid .chip').forEach(n=>n.classList.remove('active'));
      b.classList.add('active');
    });
    host.appendChild(b);
  });
}

// 新增自訂細項（吃目前大項為 kind）
async function addCustomItem(){
  const name = ($('#new-cat-name').value||'').trim();
  if(!name){ toast('請輸入項目名稱'); return; }
  if(!state.group){ toast('請先選擇分類大項'); return; }
  const scope = state.scope || 'personal';
  const item = { id:name, label:name, kind:state.group };

  const base = ref(db, `rooms/${state.space}/catalog/categories/${scope}`);
  await set(push(base), item);
  (scope==='restaurant' ? state.catalogIndex.restaurant : state.catalogIndex.personal).push(item);
  $('#new-cat-name').value = '';
  renderItems(); toast('已新增');
}

// 送出
async function submitRecord(){
  const amt = Number($('#rec-amt').value||0);
  if(!state.io)    return toast('請先選擇「支出／收入」');
  if(!state.scope) return toast('請先選擇「用途」');
  if(!state.group) return toast('請先選擇「分類大項」');
  if(!state.cat)   return toast('請選擇或新增一個項目');
  if(!(amt>0))     return toast('請輸入金額');

  const rec = {
    ts: Date.now(),
    date: $('#rec-date').value || todayISO(),
    io: state.io,
    scope: state.scope,
    group: state.group,
    cat: state.cat,
    pocket: state.pocket,
    payer: state.payer,
    amount: amt,
    note: $('#rec-note').value||''
  };
  await set(push(ref(db, `rooms/${state.space}/records`)), rec);

  $('#rec-amt').value=''; $('#rec-note').value='';
  toast('已送出');
}

// 最近 20 筆
function watchRecent(){
  onValue(ref(db, `rooms/${state.space}/records`), snap=>{
    const vals = snap.val() || {};
    const arr = Object.values(vals).sort((a,b)=>b.ts-a.ts).slice(0,20);
    state.recent = arr; renderRecent();
  });
}
function renderRecent(){
  const host = $('#recent-list'); host.innerHTML='';
  state.recent.forEach(x=>{
    const row = ce('div',{className:'row recent'});
    row.innerHTML = `
      <div class="r-date">${x.date}</div>
      <div class="r-text">${x.scope==='restaurant'?'餐廳':'個人'}・${x.group}・${x.cat}</div>
      <div class="r-amt ${x.io==='income'?'pos':'neg'}">${x.io==='income'?'+':'-'}${fmt(x.amount)}</div>
    `;
    host.appendChild(row);
  });
}

// 連線 & Catalog
$('#rec-date').value = todayISO();
async function connectSpace(){
  const space = ($('#space-code').value||'').trim();
  if(!space) return toast('請輸入共享代號');
  state.space = space; localStorage.setItem('CF_SPACE', space);

  const root = ref(db, `rooms/${space}`);
  const snap = await get(root);
  if(!snap.exists()){ await set(root, { _ts: Date.now() }); }

  await ensureCatalog();
  setConnectedUI(true);
  watchRecent();
}

async function ensureCatalog(){
  const base = ref(db, `rooms/${state.space}/catalog`);
  const snap = await get(base);
  if(snap.exists()){
    state.catalog = snap.val();
  }else{
    // 如果 DB 沒 catalog，就放空骨架（可直接在 UI 新增）
    state.catalog = { categories:{ restaurant:[], personal:[] } };
    await set(base, state.catalog);
  }

  buildCatalogIndex(state.catalog);

  // 預設 UI 狀態
  renderPockets();
  renderPayers();
  state.io = 'expense';
  state.scope = 'restaurant';
  $('#chip-io [data-io="expense"]').classList.add('active');
  $('#chip-scope [data-scope="restaurant"]').classList.add('active');
  renderGroups();
  renderItems();

  // 若索引是 0，協助提示
  const rCount = state.catalogIndex?.restaurant?.length || 0;
  const pCount = state.catalogIndex?.personal?.length || 0;
  if(rCount + pCount === 0){
    console.warn('[catalog] 目前沒有任何分類項目。請到 Realtime DB 匯入 catalog_full.json → /rooms/<space>/catalog');
    $('#items-grid').innerHTML = `<div class="muted">（尚未匯入分類。請到 Firebase 匯入 catalog）</div>`;
  }
}

// Auth
onAuthStateChanged(auth, u=>{ if(u) setConnectedUI(!!state.space); });
signInAnonymously(auth).catch(console.error);

// boot
renderPockets(); renderPayers();
