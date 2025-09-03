/* ==========================================================================
   極速記帳 app.js（Firebase Realtime DB + 本機快取）
   - UI：手機自適應、用途在右等寬、立體樣式（tabs/送出）
   - Catalog：一次載入快取，記憶體索引，渲染即時
   - normalizeKind：舊資料對應新命名
   ========================================================================== */

/* ===== Firebase：使用你的專案參數 ===== */
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ===== 快速工具 ===== */
const qs = (s, r=document)=>r.querySelector(s);
const qsa = (s, r=document)=>[...r.querySelectorAll(s)];
const el = (tag, attrs={}, html='')=>{
  const n = document.createElement(tag);
  for(const k in attrs){
    if(k==='class') n.className = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  if(html) n.innerHTML = html;
  return n;
};
const today = ()=> new Date().toISOString().slice(0,10);
const formatAmt = n => Number(n||0).toLocaleString('zh-TW');

/* ===== 狀態 ===== */
let ROOM = localStorage.getItem('cf_room') || '';
let state = {
  io: 'expense',         // 'expense' | 'income'
  scope: 'restaurant',   // 'restaurant' | 'personal'
  group: '',
  item: '',
  pocket: 'restaurant',
  payer: 'J'
};
let balances = { restaurant:0, jack:0, wal:0 };

/* ===== 舊 kind 名稱歸一化 ===== */
const normalizeKind = k => {
  if(!k) return '';
  if(k === '餐廳收入') return '營業收入';
  if(k === '其他')     return '其他支出';
  return k;
};

/* ===== 分群 ICON（群組顯示用） ===== */
const GROUP_ICON = {
  '營業收入':'💵','銷貨成本':'🥬','人事':'👥','水電租網':'🏠',
  '行銷':'📣','物流運輸':'🚚','行政稅務':'🧾',
  '薪資收入':'🧾','投資獲利':'📈','其他收入':'🎁',
  '飲食':'🍔','治裝':'👔','住房':'🏡','交通':'🚌','教育':'📚',
  '娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧾'
};

/* ===== Catalog：一次載入、索引快取 ===== */
let CATALOG_RAW = null;     // DB 原始物件
let CATALOG_IDX = {};       // { groupName: [ {id,label,group,emoji?} ] }
let CATALOG_READY = false;

const roomPath = () => `rooms/${ROOM}`;

async function ensureCatalog(){
  if(CATALOG_READY) return;
  const snap = await db.ref(`${roomPath()}/catalog`).get();
  CATALOG_RAW = snap.exists() ? snap.val() : {};
  CATALOG_IDX = {};
  for(const id in CATALOG_RAW){
    const it = CATALOG_RAW[id];
    const group = normalizeKind(it.kind || it.group || '');
    if(!group) continue;
    (CATALOG_IDX[group] ??= []);
    CATALOG_IDX[group].push({
      id: it.id || id,
      label: it.label || it.name || id,
      group,
      emoji: it.emoji || null
    });
  }
  CATALOG_READY = true;
}

/* ===== 依 io/scope 決定群組清單 ===== */
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

/* ===== DOM 參照 ===== */
const elRoom = qs('#room');
const btnConnect = qs('#btn-connect');
const chipIO = qs('#chip-io');
const chipScope = qs('#chip-scope');
const groupGrid = qs('#group-grid');
const itemsGrid = qs('#items-grid');
const pocketsRow = qs('#pockets-row');
const payersRow  = qs('#payers-row');
const inputAmt   = qs('#rec-amt');
const inputDate  = qs('#rec-date');
const inputNote  = qs('#rec-note');
const btnAddCat  = qs('#btn-add-cat');
const btnSubmit  = qs('#btn-submit');

/* ===== UI helpers ===== */
function setActive(container, selectorOrEl){
  qsa('.active', container).forEach(x=>x.classList.remove('active'));
  const t = typeof selectorOrEl==='string' ? container.querySelector(selectorOrEl) : selectorOrEl;
  if(t) t.classList.add('active');
}

/* 小豬三口袋：SVG <use> */
function renderPockets(){
  const html = ['restaurant','jack','wal'].map(k=>`
    <button class="pocket ${state.pocket===k?'active':''}" data-pocket="${k}">
      <svg class="pig" viewBox="0 0 167.18 139.17" aria-hidden="true"><use href="#pig-icon"></use></svg>
      <div class="meta">
        <div class="name">${k==='restaurant'?'餐廳':k==='jack'?'Jack':'Wal'}</div>
        <div class="amt">${formatAmt(balances[k]||0)}</div>
      </div>
    </button>
  `).join('');
  pocketsRow.innerHTML = html;
  qsa('.pocket', pocketsRow).forEach(b=>{
    b.onclick = ()=>{ state.pocket = b.dataset.pocket; setActive(pocketsRow,b); };
  });
}

/* 付款人/收款人：收入時顯示 Jack/Wal、支出時顯示 J/W/JW */
function renderPayers(){
  const isIncome = state.io === 'income';
  const opts = isIncome
    ? [{k:'jack', label:'Jack', icon:'👨‍🍳'},{k:'wal',label:'Wal',icon:'👨‍🍳'}]
    : [{k:'J',label:'J',icon:'👤'},{k:'W',label:'W',icon:'👤'},{k:'JW',label:'JW',icon:'👥'}];
  payersRow.innerHTML = opts.map(p=>`
    <button class="chip pill ${state.payer===p.k?'active':''}" data-payer="${p.k}">
      <span class="emoji">${p.icon}</span><span class="label">${p.label}</span>
    </button>
  `).join('');
  qsa('.chip', payersRow).forEach(b=>{
    b.onclick = ()=>{ state.payer = b.dataset.payer; setActive(payersRow,b); };
  });
}

/* 分類大項 */
function renderGroups(){
  const wanted = groupsFor(state.io, state.scope);
  const frag = document.createDocumentFragment();
  groupGrid.innerHTML = '';
  wanted.forEach(g=>{
    const btn = el('button',{class:`chip box ${state.group===g?'active':''}`,'data-group':g},
      `<span class="emoji">${GROUP_ICON[g]||'📁'}</span><span class="label">${g}</span>`);
    btn.onclick = ()=>{ state.group=g; renderGroups(); renderItems(); };
    frag.appendChild(btn);
  });
  groupGrid.appendChild(frag);
  if(!state.group && wanted[0]){ state.group=wanted[0]; setActive(groupGrid, groupGrid.firstElementChild); }
}

/* 項目 */
function renderItems(){
  itemsGrid.innerHTML = '';
  const list = CATALOG_IDX[state.group] || [];
  if(!list.length){
    itemsGrid.innerHTML = `<div class="muted" style="padding:8px 6px">（此群暫無項目）</div>`;
    state.item = '';
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(it=>{
    const b = el('button',{class:`chip box ${state.item===it.id?'active':''}`,'data-item':it.id},
      `<span class="emoji">${it.emoji||'•'}</span><span class="label">${it.label}</span>`);
    b.onclick = ()=>{ state.item=it.id; renderItems(); };
    frag.appendChild(b);
  });
  itemsGrid.appendChild(frag);
}

/* ===== 送出記錄 ===== */
async function submitRecord(){
  const amt = Number(inputAmt.value||0);
  if(!amt) return alert('請輸入金額');
  if(!state.item) return alert('請先選擇「分類大項 → 項目」');
  const date = inputDate.value || today();

  const rec = {
    io: state.io,
    scope: state.scope,
    group: state.group,
    item: state.item,
    pocket: state.pocket,
    payer: state.payer,
    amt, date,
    note: inputNote.value||'',
    ts: Date.now()
  };
  await db.ref(`${roomPath()}/records`).push(rec);
  inputAmt.value=''; inputNote.value='';
}

/* ===== 監看最近 20 筆 ===== */
function watchRecent(){
  db.ref(`${roomPath()}/records`).limitToLast(20).on('value', snap=>{
    const rows = [];
    snap.forEach(ch=>rows.push({id:ch.key, ...ch.val()}));
    rows.reverse();
    const html = rows.map(r=>{
      const sign = r.io==='income' ? '+' : '-';
      const cls = r.io==='income' ? 'pos' : 'neg';
      return `<div class="row">
        <div class="r-date">${r.date||''}</div>
        <div class="r-title">${r.group||''} · ${r.item||''}</div>
        <div class="r-amt ${cls}">${sign}${formatAmt(r.amt||0)}</div>
      </div>`;
    }).join('');
    qs('#recent-list').innerHTML = html;
  });
}

/* ===== 監看口袋餘額（簡化：依 records 聚合） ===== */
function watchBalances(){
  db.ref(`${roomPath()}/records`).on('value', snap=>{
    const agg = { restaurant:0, jack:0, wal:0 };
    snap.forEach(ch=>{
      const r = ch.val()||{};
      const sign = r.io==='income' ? 1 : -1;
      // 以「付費口袋 / 入帳口袋」簡化視角：收入視同流入該 pocket，支出視同流出該 pocket
      const k = r.pocket || 'restaurant';
      agg[k] = (agg[k]||0) + sign*Number(r.amt||0);
    });
    balances = agg;
    renderPockets();
  });
}

/* ===== 綁定 ===== */
function bindTabs(){
  qsa('.tab').forEach(t=>{
    t.onclick = ()=>{
      qsa('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const id = t.dataset.page;
      qsa('.page').forEach(p=>p.classList.remove('show'));
      qs(`#page-${id}`).classList.add('show');
    };
  });
}
function bindConnect(){
  elRoom.value = ROOM;
  updateConnectBtn();
  btnConnect.onclick = ()=>{
    if(!elRoom.value.trim()){
      alert('請輸入共享代號（room）');
      return;
    }
    ROOM = elRoom.value.trim();
    localStorage.setItem('cf_room', ROOM);
    // 重新掛監聽
    db.ref(`${roomPath()}/records`).off();
    db.ref(`${roomPath()}/records`).limitToLast(20).off();
    CATALOG_READY = false;
    initAfterConnect();
    updateConnectBtn(true);
  };
}
function updateConnectBtn(connected){
  const isOn = (connected || ROOM);
  btnConnect.textContent = isOn ? '連線中' : '未連線';
  if(isOn){ btnConnect.classList.add('primary'); }
  else { btnConnect.classList.remove('primary'); }
}

function bindIOandScope(){
  // 收支
  chipIO.addEventListener('click', e=>{
    const b = e.target.closest('[data-io]'); if(!b) return;
    state.io = b.dataset.io;
    setActive(chipIO, b);
    renderPayers();
    renderGroups();
    renderItems();
  });
  // 用途
  chipScope.addEventListener('click', e=>{
    const b = e.target.closest('[data-scope]'); if(!b) return;
    state.scope = b.dataset.scope;
    setActive(chip-scope, b); // 修正選取
  });
  // 修正：直接使用 ID 選擇器避免 typo
  chipScope.addEventListener('click', e=>{
    const b = e.target.closest('[data-scope]'); if(!b) return;
    state.scope = b.dataset.scope;
    setActive(chipScope, b);
    renderGroups();
    renderItems();
  });
}

function bindSubmit(){
  btnSubmit.onclick = submitRecord;
  btnAddCat.onclick = async ()=>{
    const name = (qs('#new-cat-name').value||'').trim();
    if(!name || !state.group) return alert('請輸入名稱並先選擇「分類大項」');
    // 以 group 當 kind 寫入
    const id = name;
    await db.ref(`${roomPath()}/catalog/${id}`).set({
      id, label:name, kind: state.group
    });
    // 更新本機快取
    (CATALOG_IDX[state.group] ??= []).push({id, label:name, group:state.group});
    qs('#new-cat-name').value='';
    renderItems();
  };
}

/* ===== 初始化 ===== */
async function init(){
  bindTabs();
  bindConnect();
  bindIOandScope();
  bindSubmit();

  inputDate.value = today();

  // 初次渲染（未連線也能看見 UI）
  renderPockets();
  renderPayers();

  // 若已有 room，自動載入
  if(ROOM) await initAfterConnect();
}

async function initAfterConnect(){
  await ensureCatalog();
  // 預設態：支出 + 餐廳
  state.io = state.io || 'expense';
  state.scope = state.scope || 'restaurant';
  setActive(chipIO, `[data-io="${state.io}"]`);
  setActive(qs('#chip-scope'), `[data-scope="${state.scope}"]`);

  const gs = groupsFor(state.io, state.scope);
  state.group = gs[0] || '';
  renderGroups();
  renderItems();
  watchRecent();
  watchBalances();
}

/* go */
document.addEventListener('DOMContentLoaded', init);
