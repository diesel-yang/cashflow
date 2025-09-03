// app.js (v53) — 修正版完整檔案

// ── Firebase 初始化 ──────────────────────────────
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

// ── Helpers / State ──────────────────────────────
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = id=>document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString('zh-TW');

const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense", scope: "restaurant",
  group: "", item: "",
  payer: "", pocket: "",
  catalog: null, catalogIndex: null,
  pocketTargets: { restaurant:100000, jack:50000, wal:50000 }
};
window.CF = { state }; // for debug

// ── 群組定義 / icon map ──────────────────────────
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

function groupsFor(io, scope){
  if(scope==='restaurant') return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}

const GROUP_ICON_MAP = {
  '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠',
  '行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁',
  '飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚',
  '娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
};

// ── kind 正規化 ──────────────────────────────────
function normalizeKind(k){
  if(!k) return '';
  if(k==='餐廳收入') return '營業收入';
  if(k==='其他') return '其他支出';
  const alias = { '水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務' };
  return alias[k] || k;
}

// ── Room / Catalog / Settings ────────────────────
async function ensureRoom(){
  const root = ref(db, `rooms/${state.space}`);
  const s = await get(root);
  if(!s.exists()) await set(root, { _ts: Date.now() });
}
async function ensureCatalog(){
  const base = ref(db, `rooms/${state.space}/catalog`);
  const s = await get(base);
  state.catalog = s.exists()?s.val():{ categories:{restaurant:[],personal:[]} };
  if(!s.exists()) await set(base, state.catalog);
  buildCatalogIndex(state.catalog);
  renderGroups(); renderItems();
}
function buildCatalogIndex(raw){
  const flat = Array.isArray(raw)? raw
    : [].concat(raw?.categories?.restaurant||[], raw?.categories?.personal||[], raw?.categories||[]);
  const by={restaurant:[], personal:[]};
  flat.forEach(x=>{
    const item = { id:x.id||x.label, label:x.label||x.id, kind:normalizeKind(x.kind), icon:x.icon||'' };
    if(REST_GROUPS.includes(item.kind)) by.restaurant.push(item); else by.personal.push(item);
  });
  state.catalogIndex = by;
}
function categoriesFor(scope, group){
  const pool = scope==='restaurant'? (state.catalogIndex?.restaurant||[]) : (state.catalogIndex?.personal||[]);
  return pool.filter(c=>c.kind===group);
}

// ── Recent / Balance watcher ─────────────────────
function watchRecent(){
  const box = byId('recent-list'); if(!box) return;
  const q = query(ref(db, `rooms/${state.space}/records`), orderByChild('ts'), limitToLast(20));
  onValue(q, snap=>{
    const rows=[]; snap.forEach(ch=>rows.push(ch.val())); rows.sort((a,b)=>b.ts-a.ts);
    box.innerHTML = rows.map(r=>{
      const sign = r.io==='expense'?'-':'+';
      const d = r.date||new Date(r.ts).toLocaleDateString('zh-TW');
      const tag = `${r.scope==='restaurant'?'餐廳':'個人'}．${r.group}．${r.item}`;
      return `<div class="row"><div class="r-date">${d}</div><div class="tag">${tag}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount)}</div></div>`;
    }).join('')||`<div class="muted">（目前尚無記錄）</div>`;
  });
}
function sumBalances(records){
  const bal={restaurant:0,jack:0,wal:0};
  for(const r of records){
    const delta=(r.io==='income'?1:-1)*(Number(r.amount)||0);
    if(bal[r.pocket]!=null) bal[r.pocket]+=delta;
  }
  return bal;
}
function watchBalances(){
  const q=query(ref(db,`rooms/${state.space}/records`),orderByChild('ts'),limitToLast(200));
  onValue(q,snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    updatePocketAmounts(sumBalances(arr));
  });
}

// ── 口袋小豬 SVG ─────────────────────────────────
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}">
      <svg class="pig"><use href="#pig-icon"></use></svg>
      <div class="meta"><div class="name">${p.name}</div><div class="amt" id="amt-${p.key}">0</div></div>
    </button>`).join('');
  if(!state.pocket) state.pocket='restaurant';
  setActivePocket(state.pocket);
  host.onclick=e=>{
    const btn=e.target.closest('[data-pocket]'); if(!btn) return;
    setActivePocket(btn.dataset.pocket);
  };
}
function setActivePocket(key){
  state.pocket=key;
  $$('#pockets-row .pocket').forEach(el=>{
    el.classList.toggle('active',el.dataset.pocket===key);
  });
}
function updatePocketAmounts(bal){
  for(const p of POCKETS){
    const el=byId(`amt-${p.key}`); const wrap=el?.closest('.pocket'); if(!el||!wrap) continue;
    el.textContent=(Number(bal[p.key])||0).toLocaleString('zh-TW');
  }
}

// ── Payers ───────────────────────────────────────
function renderPayers(){
  const row=byId('payers-row'); if(!row) return;
  row.innerHTML=(state.io==='income'
    ? [{key:'Jack',label:'Jack'},{key:'Wal',label:'Wal'}]
    : [{key:'J',label:'J'},{key:'W',label:'W'},{key:'JW',label:'JW'}]
  ).map(x=>`<button class="chip pill lg" data-payer="${x.key}">${x.label}</button>`).join('');
  row.onclick=e=>{
    const btn=e.target.closest('[data-payer]'); if(!btn) return;
    $$('#payers-row .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.payer=btn.dataset.payer;
  };
}

// ── IO / Scope 切換（已修正 chip bug）──────────────
byId('chip-io')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-io]'); if(!btn) return;
  $$('#chip-io .active').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active'); state.io=btn.dataset.io;
  renderPayers(); renderGroups(); renderItems();
});
byId('chip-scope')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-scope]'); if(!btn) return;
  $$('#chip-scope .active').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active'); state.scope=btn.dataset.scope; state.group=''; state.item='';
  renderGroups(); renderItems();
});

// ── Groups & Items ──────────────────────────────
function renderGroups(){
  const box=byId('group-grid'); if(!box) return;
  box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
    const icon=GROUP_ICON_MAP[g]||'';
    return `<button class="chip" data-group="${g}"><span class="emoji">${icon}</span><span class="label">${g}</span></button>`;
  }).join('');
  box.onclick=e=>{
    const btn=e.target.closest('[data-group]'); if(!btn) return;
    $$('#group-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.group=btn.dataset.group; state.item=''; renderItems();
  };
}
function renderItems(){
  const box=byId('items-grid'); if(!box) return;
  if(!state.group){ box.innerHTML=`<div class="muted">（請先選分類大項）</div>`; return; }
  const items=categoriesFor(state.scope,state.group);
  box.innerHTML=items.map(it=>{
    const icon=it.icon?`<span class="emoji">${it.icon}</span>`:''; 
    return `<button class="chip" data-item="${it.label}">${icon}<span class="label">${it.label}</span></button>`;
  }).join('')||`<div class="muted">（此群暫無項目，可於下方新增）</div>`;
  box.onclick=e=>{
    const btn=e.target.closest('[data-item]'); if(!btn) return;
    $$('#items-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.item=btn.dataset.item;
  };
}

// ── Add Item ────────────────────────────────────
byId('btn-add-cat')?.addEventListener('click',async()=>{
  const input=byId('new-cat-name'); if(!input) return;
  const name=(input.value||'').trim(); if(!name){alert('請輸入項目名稱');return;}
  if(!state.space||!state.group){alert('請先連線並選大項');return;}
  const base=ref(db,`rooms/${state.space}/catalog`); const s=await get(base);
  let cat=s.exists()?s.val():[]; if(!Array.isArray(cat)){
    cat=[].concat(cat.categories?.restaurant||[],cat.categories?.personal||[],cat.categories||[]);
  }
  let icon='',label=name; const m=name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.+)$/u);
  if(m){icon=m[1];label=m[2].trim();}
  cat.push({id:label,label,kind:state.group,icon});
  await set(base,cat); state.catalog=cat; buildCatalogIndex(cat); input.value=''; renderItems();
});

// ── Submit Record ───────────────────────────────
byId('btn-submit')?.addEventListener('click',submitRecord);
async function submitRecord(){
  if(!state.space){alert('請先連線');return;}
  const amt=Number((byId('rec-amt')?.value||'').replace(/[^\d.-]/g,''))||0;
  if(!amt){alert('請輸入金額');return;}
  if(!state.pocket||!state.payer){alert('請選口袋和付款人');return;}
  const dateStr=byId('rec-date')?.value||''; const ts=dateStr?Date.parse(dateStr):Date.now();
  const note=byId('rec-note')?.value||'';
  const rec={ts,date:dateStr,amount:amt,io:state.io,scope:state.scope,group:state.group,item:state.item,payer:state.payer,pocket:state.pocket,note};
  const key=push(ref(db,`rooms/${state.space}/records`)).key;
  await set(ref(db,`rooms/${state.space}/records/${key}`),rec);
  byId('rec-amt').value=''; byId('rec-note').value=''; alert('已送出');
}

// ── Connect ─────────────────────────────────────
byId('btn-connect')?.addEventListener('click',async()=>{
  state.space=(byId('space-code')?.value||'').trim(); if(!state.space){alert('請輸入共享代號');return;}
  await ensureRoom(); await ensureCatalog();
  renderPockets(); renderPayers(); watchRecent(); watchBalances();
  byId('btn-connect').textContent='已連線'; byId('btn-connect').classList.remove('danger'); byId('btn-connect').classList.add('success');
  localStorage.setItem('CF_SPACE',state.space);
});

// ── Boot ────────────────────────────────────────
(function boot(){
  renderPockets(); renderPayers(); renderGroups(); renderItems();
  if(state.space){ ensureRoom().then(ensureCatalog).then(()=>{watchRecent();watchBalances();}); }
})();const elRoom = qs('#room');
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
function updateConnectBtn(forceConnected){
  const isOn = !!(forceConnected || ROOM);
  btnConnect.textContent = isOn ? '連線中' : '未連線';
  btnConnect.classList.remove('primary','danger');
  // 已連：藍綠；未連：紅色
  btnConnect.classList.add(isOn ? 'primary' : 'danger');
}

function bindIOandScope(){
  // 收支
  const chipIO = document.getElementById('chip-io');
  chipIO.addEventListener('click', e=>{
    const b = e.target.closest('[data-io]'); 
    if(!b) return;
    state.io = b.dataset.io;
    setActive(chipIO, b);
    renderPayers();
    renderGroups();
    renderItems();
  });

  // 用途（餐廳/個人）
  const chipScope = document.getElementById('chipscope');
  chipScope.addEventListener('click', e=>{
    const b = e.target.closest('[data-scope]');
    if(!b) return;
    state.scope = b.dataset.scope;
    setActive(chipScope, b);
    renderGroups();
    renderItems();
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
  setActive(qs('#chipscope'), `[data-scope="${state.scope}"]`);

  const gs = groupsFor(state.io, state.scope);
  state.group = gs[0] || '';
  renderGroups();
  renderItems();
  watchRecent();
  watchBalances();
}

/* go */
document.addEventListener('DOMContentLoaded', init);
