// app.js v3.10.0 — 本月篩選 / date index / 口袋與介面修正整合版（Compat SDK）

/* ───────────────── Firebase（Compat） ───────────────── */
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

/* ───────────────── 小工具 ───────────────── */
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = id=>document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString('zh-TW');
function todayISO(){
  const d=new Date(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ───────────────── 狀態 ───────────────── */
const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense",                 // expense | income
  scope: "restaurant",           // restaurant | personal
  group: "",                     // 類別
  item: "",                      // 項目
  payer: "",                     // J | W | JW（收入時 Jack | Wal）
  pocket: "",                    // restaurant | jack | wal
  catalog: null,
  catalogIndex: null,
};

/* ───────────────── 類別群組定義 ───────────────── */
const REST_GROUPS = [
  '營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'
];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

function groupsFor(io, scope){
  if(scope==='restaurant') return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}

/* ───────────────── 群組 icon ───────────────── */
const GROUP_ICON_MAP = {
  '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠',
  '行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁',
  '飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚',
  '娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
};

/* ───────────────── 舊 kind 正規化 ───────────────── */
function normalizeKind(k){
  if(!k) return '';
  if(k==='餐廳收入') return '營業收入';
  if(k==='其他')     return '其他支出';
  const alias = { '水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務' };
  return alias[k] || k;
}

/* ───────────────── Room / Catalog ───────────────── */
async function ensureRoom(){
  const roomRef = db.ref(`rooms/${state.space}`);
  const snap = await roomRef.get();
  if(!snap.exists()){
    await roomRef.set({ _ts: Date.now(), catalog: [], records: {} });
  }
  return roomRef;
}

async function ensureCatalog(){
  const base = db.ref(`rooms/${state.space}/catalog`);
  const s = await base.get();
  state.catalog = s.exists()? s.val() : [];
  if(!s.exists()) await base.set(state.catalog);
  buildCatalogIndex(state.catalog);
  renderGroups(); renderItems();
}

function buildCatalogIndex(raw){
  // 支援：Array 或 {categories:{restaurant:[], personal:[]}} 舊結構
  const flat = Array.isArray(raw)
    ? raw
    : [].concat(raw?.categories?.restaurant||[], raw?.categories?.personal||[], raw?.categories||[]);
  const by={restaurant:[], personal:[]};
  (flat||[]).forEach(x=>{
    const item = { id:x.id||x.label, label:x.label||x.id, kind:normalizeKind(x.kind), icon:x.icon||'' };
    if(REST_GROUPS.includes(item.kind)) by.restaurant.push(item); else by.personal.push(item);
  });
  state.catalogIndex = by;
}

function categoriesFor(scope, group){
  const pool = scope==='restaurant' ? (state.catalogIndex?.restaurant||[]) : (state.catalogIndex?.personal||[]);
  return pool.filter(c=>c.kind===group);
}

/* ───────────────── 最近（本月） + 全部餘額 監看 ───────────────── */

/** 只抓「本月」記錄，使用 orderByChild('date') + .indexOn(["date"]) */
function watchRecentMonthly(){
  const list = byId('recent-list'); if(!list) return;
  const refRec = db.ref(`rooms/${state.space}/records`);

  const now  = new Date();
  const first= new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth()+1, 1);
  const fromDate = first.toISOString().slice(0,10);
  const toDate   = next.toISOString().slice(0,10);

  const q = refRec.orderByChild('date').startAt(fromDate).endBefore(toDate);
  q.on('value', snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    const rows = arr.sort((a,b)=> (b.ts||0) - (a.ts||0));
    list.innerHTML = rows.map(r=>{
      const sign = (r.io==='expense')?'-':'+';
      const d = r.date || new Date(r.ts).toLocaleDateString('zh-TW');
      return `<div class="row">
        <div class="r-date">${d}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group}${r.item? '・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div>
      </div>`;
    }).join('') || `<div class="muted">（本月無紀錄）</div>`;
  });
}

/** 餘額必須以「全部紀錄」計算，不能只算本月 */
function watchAllBalances(){
  const refRec = db.ref(`rooms/${state.space}/records`);
  refRec.on('value', snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    updatePocketAmountsFromRecords(arr);
  });
}

function updatePocketAmountsFromRecords(records){
  const bal={restaurant:0,jack:0,wal:0};
  for(const r of records){
    const pocket=(r.pocket||'').toLowerCase();
    const amt = Number(r.amount ?? r.amt) || 0;
    const delta = (r.io==='income'?1:-1)*amt;
    if(pocket in bal) bal[pocket]+=delta;
  }
  // 更新 UI（>0 綠 / <0 紅 / 0 白）
  for(const k of Object.keys(bal)){
    const el = byId(`amt-${k}`);
    if(!el) continue;
    const v = bal[k]||0;
    el.textContent = v.toLocaleString('zh-TW');
    if(v>0)      el.style.color='var(--pos)';
    else if(v<0) el.style.color='var(--neg)';
    else         el.style.color='var(--text)';
  }
}

/* ───────────────── 口袋（小豬 SVG） ───────────────── */
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];

function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
      <svg class="pig" width="88" height="88" viewBox="0 0 167 139" aria-hidden="true">
        <use href="#pig-icon"></use>
      </svg>
      <div class="name">${p.name}</div>
      <div class="amt" id="amt-${p.key}">0</div>
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
    const on = el.dataset.pocket===key;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', on?'true':'false');
  });
}

/* ───────────────── 付款人 / 收款人 ───────────────── */
function renderPayers(){
  const row=byId('payers-row'); if(!row) return;
  const data = (state.io==='income')
    ? [{key:'Jack',label:'Jack', icon:'👤'}, {key:'Wal',label:'Wal', icon:'👤'}]
    : [{key:'J',label:'J',icon:'👤'}, {key:'W',label:'W',icon:'👤'}, {key:'JW',label:'JW',icon:'👥'}];
  row.innerHTML=data.map(x=>`<button class="chip pill lg" data-payer="${x.key}">
    <span class="emoji">${x.icon}</span><span class="label">${x.label}</span></button>`).join('');
  row.onclick=e=>{
    const btn=e.target.closest('[data-payer]'); if(!btn) return;
    $$('#payers-row .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.payer=btn.dataset.payer;
  };
}

/* ───────────────── 類別 / 項目 ───────────────── */
function renderGroups(){
  const box=byId('group-grid'); if(!box) return;
  box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
    const icon=GROUP_ICON_MAP[g]||''; 
    return `<button class="chip" data-group="${g}">
      <span class="emoji">${icon}</span><span class="label">${g}</span></button>`;
  }).join('');
  box.onclick=e=>{
    const btn=e.target.closest('[data-group]'); if(!btn) return;
    $$('#group-grid .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.group=btn.dataset.group; state.item=''; renderItems();
  };
}

function renderItems(){
  const box=byId('items-grid'); if(!box) return;
  if(!state.group){ box.innerHTML=`<div class="muted">（請先選類別）</div>`; return; }
  const items=categoriesFor(state.scope,state.group);
  box.innerHTML=items.map(it=>{
    const icon=it.icon?`<span class="emoji">${it.icon}</span>`:''; 
    return `<button class="chip" data-item="${it.label}">${icon}<span class="label">${it.label}</span></button>`;
  }).join('')||`<div class="muted">（暫無項目，可下方新增）</div>`;
  box.onclick=e=>{
    const btn=e.target.closest('[data-item]'); if(!btn) return;
    $$('#items-grid .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.item=btn.dataset.item;
  };
}

/* ───────────────── 新增項目（合併到送出前）與獨立新增鍵支援 ───────────────── */
async function addCatalogItemIfNeeded(label){
  if(!label || !state.group) return;
  const base = db.ref(`rooms/${state.space}/catalog`);
  const snap = await base.get();
  let cat = snap.exists()? snap.val(): [];
  if(!Array.isArray(cat)){
    cat=[].concat(cat.categories?.restaurant||[], cat.categories?.personal||[], cat.categories||[]);
  }
  // 若不存在才新增
  if(!cat.find(c=> (c.label||c.id) === label && normalizeKind(c.kind)===state.group )){
    cat.push({ id:label, label, kind:state.group, icon:'' });
    await base.set(cat);
    state.catalog = cat; buildCatalogIndex(cat);
  }
}
byId('btn-add-cat')?.addEventListener('click', async ()=>{
  const input=byId('new-cat-name'); if(!input) return;
  const name=(input.value||'').trim(); if(!name){alert('請輸入名稱');return;}
  if(!state.space||!state.group){alert('請先連線並選類別');return;}
  await addCatalogItemIfNeeded(name);
  input.value=''; renderItems();
});

/* ───────────────── 送出紀錄 ───────────────── */
byId('btn-submit')?.addEventListener('click', async ()=>{
  if(!state.space) return alert('請先連線');
  const amt = Number((byId('rec-amt')?.value||'').replace(/[^\d.-]/g,''))||0;
  if(!amt) return alert('請輸入金額');
  if(!state.pocket) return alert('請選擇付款口袋');
  if(!state.payer)  return alert('請選擇付款人/收款人');

  const dateStr = byId('rec-date')?.value || todayISO();
  const note    = byId('rec-note')?.value || '';

  // 若使用者在「項目」裡沒有點選，但在「新增項目」有填，就補寫 catalog 並採用它
  const newName = (byId('new-cat-name')?.value||'').trim();
  let finalItem = state.item;
  if(!finalItem && newName){
    await addCatalogItemIfNeeded(newName);
    finalItem = newName;
    byId('new-cat-name').value='';
  }

  const rec = {
    ts: Date.now(),
    date: dateStr,                   // yyyy-mm-dd（用於 indexOn 'date'）
    amount: amt,
    io: state.io,
    scope: state.scope,
    group: state.group || '',
    item: finalItem || '',
    payer: state.payer,
    pocket: state.pocket,
    note
  };
  const key = db.ref(`rooms/${state.space}/records`).push().key;
  await db.ref(`rooms/${state.space}/records/${key}`).set(rec);

  byId('rec-amt').value=''; byId('rec-note').value='';
  // 提交後不重置已選類別/項目，方便連續記同一類型
});

/* ───────────────── 分頁/收支/用途 綁定 ───────────────── */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      const page = tab.getAttribute('data-page'); // 使用 data-page
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $$('.page').forEach(p=>p.classList.remove('show'));
      if(page) byId(`page-${page}`)?.classList.add('show');
    });
  });
}
function bindIOChips(){
  const group = byId('chip-io'); if(!group) return;
  group.addEventListener('click',e=>{
    const btn=e.target.closest('[data-io]'); if(!btn) return;
    $$('#chip-io .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.io = btn.dataset.io;
    renderPayers(); renderGroups(); renderItems();
  });
}
function bindScopeChips(){
  const group = byId('chip-scope'); if(!group) return;
  group.addEventListener('click',e=>{
    const btn=e.target.closest('[data-scope]'); if(!btn) return;
    $$('#chip-scope .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.scope = btn.dataset.scope;
    state.group=''; state.item='';
    renderGroups(); renderItems();
  });
}

/* ───────────────── 連線 ───────────────── */
const btnConnect = byId('btn-connect');
function doConnect(){
  const input = byId('space-code');
  const code = (input?.value||'').trim();
  if(!code){ alert('請輸入共享代號'); return; }
  state.space = code;
  ensureRoom()
    .then(ensureCatalog)
    .then(()=>{
      // UI 與監看
      renderPockets(); renderPayers(); renderGroups(); renderItems();
      watchRecentMonthly();   // 本月紀錄
      watchAllBalances();     // 全部餘額
      // 按鈕狀態
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success'); btnConnect.classList.remove('danger');
      localStorage.setItem('CF_SPACE', state.space);
      // 日期預設今天（保險）
      const dateInput = byId('rec-date');
      if(dateInput && !dateInput.value) dateInput.value = todayISO();
    })
    .catch(err=>{
      console.error(err);
      alert('連線失敗，請稍後再試');
    });
}
btnConnect?.addEventListener('click', doConnect);
byId('space-code')?.addEventListener('keydown', e=>{ if(e.key==='Enter') doConnect(); });

/* ───────────────── 啟動 ───────────────── */
(function boot(){
  // 日期預設今天
  const dateInput = byId('rec-date');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  // 初始口袋 / 付款人 UI
  renderPockets(); renderPayers(); renderGroups(); renderItems();
  bindTabs(); bindIOChips(); bindScopeChips();

  // 未連線：紅色
  if(!state.space){
    btnConnect?.classList.add('danger');
  }else{
    // 自動帶入最近一次房號並連線
    const input = byId('space-code'); if(input) input.value = state.space;
    doConnect();
  }
})();
