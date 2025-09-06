// app.js v53 — 純 ES Modules；手機自適應版面；立體日期/送出；口袋 SVG；新增項目併入送出
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, get, set, push, onValue,
  query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ─── Firebase ─── */
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

/* ─── DOM utils ─── */
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = (id)=>document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString('zh-TW');

/* ─── State ─── */
const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense",          // expense / income
  scope: "restaurant",    // restaurant / personal
  group: "",              // 類別
  item: "",               // 項目
  payer: "",              // J/W/JW or Jack/Wal
  pocket: "",             // restaurant / jack / wal
  catalog: null,
  catalogIndex: null
};

/* ─── 群組定義 ─── */
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

const GROUP_ICON_MAP = {
  '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠',
  '行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁',
  '飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚',
  '娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
};

function groupsFor(io, scope){
  if(scope==='restaurant') return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}
function normalizeKind(k){
  if(!k) return '';
  if(k==='餐廳收入') return '營業收入';
  if(k==='其他')     return '其他支出';
  const alias={'水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務'};
  return alias[k]||k;
}

/* ─── Room / Catalog ─── */
async function ensureRoom(){
  const root = ref(db, `rooms/${state.space}`);
  const s = await get(root);
  if(!s.exists()) await set(root, { _ts: Date.now() });
}
async function ensureCatalog(){
  const base = ref(db, `rooms/${state.space}/catalog`);
  const s = await get(base);
  state.catalog = s.exists()?s.val():[];
  if(!s.exists()) await set(base, state.catalog);
  buildCatalogIndex(state.catalog);
  renderGroups(); renderItems();
}
function buildCatalogIndex(raw){
  const flat = Array.isArray(raw)? raw
    : [].concat(raw?.categories?.restaurant||[], raw?.categories?.personal||[], raw?.categories||[]);
  const by={restaurant:[], personal:[]};
  (flat||[]).forEach(x=>{
    const item = { id:x.id||x.label, label:x.label||x.id, kind:normalizeKind(x.kind), icon:x.icon||'' };
    if(REST_GROUPS.includes(item.kind)) by.restaurant.push(item); else by.personal.push(item);
  });
  state.catalogIndex = by;
}
function categoriesFor(scope, group){
  const pool = scope==='restaurant'? (state.catalogIndex?.restaurant||[]) : (state.catalogIndex?.personal||[]);
  return pool.filter(c=>c.kind===group);
}

/* ─── 最近 1 個月（20 筆上限，按時間倒序） ─── */
function watchRecent(){
  const recentList = byId('recent-list'); if(!recentList) return;
  const q = query(ref(db, `rooms/${state.space}/records`), orderByChild('ts'), limitToLast(200));
  onValue(q, snap=>{
    const now = Date.now(), monthAgo = now - 30*24*3600*1000;
    const rows=[]; snap.forEach(ch=>rows.push(ch.val()));
    const filtered = rows.filter(r=> (r.ts||0) >= monthAgo).sort((a,b)=>b.ts-a.ts).slice(0,20);
    recentList.innerHTML = filtered.map(r=>{
      const sign = r.io==='expense'?'-':'+'; 
      const d = r.date||new Date(r.ts).toLocaleDateString('zh-TW');
      return `<div class="row" role="button" tabindex="0">
        <div class="r-date">${d}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group}${r.item? '・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount)}</div>
      </div>`;
    }).join('') || `<div class="muted">（尚無紀錄）</div>`;
  });
}

/* ─── 口袋 ─── */
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];

function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
      <svg class="pig" viewBox="0 0 167 139" aria-hidden="true"><use href="#pig-icon"></use></svg>
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
function updatePocketAmounts(bal){
  for(const p of POCKETS){
    const el=byId(`amt-${p.key}`); if(!el) continue;
    const val = Number(bal[p.key])||0;
    el.textContent = val.toLocaleString('zh-TW');
    const card = el.closest('.pocket');
    card.classList.toggle('positive', val>=0);
    card.classList.toggle('negative', val<0);
  }
}
function sumBalances(records){
  const bal={restaurant:0,jack:0,wal:0};
  for(const r of records){
    const delta=(r.io==='income'?1:-1)*(Number(r.amount)||0);
    if (r.pocket && bal[r.pocket] != null) bal[r.pocket]+=delta;
  }
  return bal;
}
function watchBalances(){
  const q=query(ref(db,`rooms/${state.space}/records`),orderByChild('ts'),limitToLast(500));
  onValue(q,snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    updatePocketAmounts(sumBalances(arr));
  });
}

/* ─── 付款人 / 收款人 ─── */
function renderPayers(){
  const row=byId('payers-row'); if(!row) return;
  const data = (state.io==='income')
    ? [{key:'Jack',label:'Jack', icon:'👤'}, {key:'Wal',label:'Wal', icon:'👤'}]
    : [{key:'J',label:'J',icon:'👤'}, {key:'W',label:'W',icon:'👤'}, {key:'JW',label:'JW',icon:'👥'}];
  row.innerHTML=data.map(x=>`<button class="chip pill lg pressable" data-payer="${x.key}">
    <span class="emoji">${x.icon}</span><span class="label">${x.label}</span></button>`).join('');
  row.onclick=e=>{
    const btn=e.target.closest('[data-payer]'); if(!btn) return;
    $$('#payers-row .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.payer=btn.dataset.payer;
  };
}

/* ─── 類別 / 項目 ─── */
function renderGroups(){
  const box=byId('group-grid'); if(!box) return;
  box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
    const icon=GROUP_ICON_MAP[g]||''; 
    return `<button class="chip pressable" data-group="${g}">
      <span class="emoji">${icon}</span><span class="label">${g}</span></button>`;
  }).join('');
  state.group=''; state.item='';
  box.onclick=e=>{
    const btn=e.target.closest('[data-group]'); if(!btn) return;
    $$('#group-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.group=btn.dataset.group; state.item=''; renderItems();
  };
}
function renderItems(){
  const box=byId('items-grid'); if(!box) return;
  if(!state.group){ box.innerHTML=`<div class="muted">（請先選類別）</div>`; return; }
  const items=categoriesFor(state.scope,state.group);
  box.innerHTML=items.map(it=>{
    const icon=it.icon?`<span class="emoji">${it.icon}</span>`:''; 
    return `<button class="chip pressable" data-item="${it.label}">${icon}<span class="label">${it.label}</span></button>`;
  }).join('')||`<div class="muted">（暫無項目，可直接上方「新增項目」輸入）</div>`;
  box.onclick=e=>{
    const btn=e.target.closest('[data-item]'); if(!btn) return;
    $$('#items-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.item=btn.dataset.item;
  };
}

/* ─── 送出（含「新增項目」併入） ─── */
byId('btn-submit').addEventListener('click', async ()=>{
  if(!state.space) return alert('請先連線');
  const amt = Number((byId('rec-amt').value||'').replace(/[^\d.-]/g,''))||0;
  if(!amt) return alert('請輸入金額');
  if(!state.pocket) return alert('請選擇付款口袋');
  if(!state.payer)  return alert('請選擇付款人/收款人');

  const dateStr=byId('rec-date').value || new Date().toISOString().slice(0,10);
  const note = byId('rec-note').value || '';
  const newCat = (byId('new-cat-name').value||'').trim();

  // 若輸入了新項目，先寫回 catalog（依目前選定 scope/group）
  if(newCat && state.group){
    const m=newCat.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.+)$/u);
    const icon = m? m[1] : '';
    const label= m? m[2].trim() : newCat;
    const base = ref(db, `rooms/${state.space}/catalog`);
    const snap = await get(base);
    let cat = snap.exists()?snap.val():[];
    if(!Array.isArray(cat)){
      cat=[].concat(cat.categories?.restaurant||[],cat.categories?.personal||[],cat.categories||[]);
    }
    cat.push({id:label,label,kind:state.group,icon});
    await set(base, cat);
    state.catalog=cat; buildCatalogIndex(cat);
    // 若尚未選 item，就把新項目當本次 item
    if(!state.item) state.item = label;
    byId('new-cat-name').value='';
    // 同步刷新項目區
    renderItems();
  }

  const record = {
    ts: Date.now(), date: dateStr,
    amount: amt, io: state.io, scope: state.scope,
    group: state.group || '', item: state.item || '',
    payer: state.payer, pocket: state.pocket, note
  };
  const key = push(ref(db, `rooms/${state.space}/records`)).key;
  await set(ref(db, `rooms/${state.space}/records/${key}`), record);

  byId('rec-amt').value=''; byId('rec-note').value='';
});

/* ─── 分頁&chip 綁定 ─── */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.getAttribute('data-target');
      $$('.page').forEach(p=>p.classList.remove('show'));
      byId(id)?.classList.add('show');
    });
  });
}
function bindIOChips(){
  byId('chip-io').addEventListener('click',e=>{
    const btn=e.target.closest('[data-io]'); if(!btn) return;
    $$('#chip-io .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.io = btn.dataset.io;
    renderPayers(); renderGroups(); renderItems();
  });
}
function bindScopeChips(){
  byId('chip-scope').addEventListener('click',e=>{
    const btn=e.target.closest('[data-scope]'); if(!btn) return;
    $$('#chip-scope .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.scope = btn.dataset.scope;
    state.group=''; state.item='';
    renderGroups(); renderItems();
  });
}

/* ─── 連線 ─── */
const btnConnect = byId('btn-connect');
async function doConnect(){
  const code = (byId('space-code').value||'').trim();
  if(!code) return alert('請輸入共享代號');
  state.space = code;
  try{
    await ensureRoom();
    await ensureCatalog();
    renderPockets(); renderPayers(); watchRecent(); watchBalances();
    btnConnect.textContent='已連線';
    btnConnect.classList.remove('danger');
    btnConnect.classList.add('success');
    localStorage.setItem('CF_SPACE', code);
  }catch(err){
    console.error(err);
    alert('連線失敗，請稍後再試');
  }
}
btnConnect.addEventListener('click', doConnect);
byId('space-code').addEventListener('keydown', e=>{ if(e.key==='Enter') doConnect(); });

/* ─── Boot ─── */
(function boot(){
  // 初始 UI
  renderPockets(); renderPayers(); renderGroups(); renderItems();
  bindTabs(); bindIOChips(); bindScopeChips();

  // 恢復空間
  if(state.space){
    byId('space-code').value = state.space;
    ensureRoom().then(ensureCatalog).then(()=>{
      renderPockets(); renderPayers(); watchRecent(); watchBalances();
      btnConnect.textContent='已連線';
      btnConnect.classList.remove('danger'); btnConnect.classList.add('success');
    });
  }else{
    btnConnect.classList.add('danger');
  }
})();
