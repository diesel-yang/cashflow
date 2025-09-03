// app.js v3.7 — 含口袋顏色判斷

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, get, set, push, onValue,
  query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ── Firebase 初始化 ──
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

// ── DOM 工具 ──
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = id=>document.getElementById(id);

const btnConnect = byId('btn-connect');
const recentList = byId('recent-list');

// ── 狀態 ──
const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense", scope: "restaurant",
  group: "", item: "",
  payer: "", pocket: "",
  catalog: null, catalogIndex: null,
};

// ── 分類群組 ──
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];

function groupsFor(io, scope){
  if(scope==='restaurant')
    return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}

// ── 圖示 ──
const GROUP_ICON_MAP = {
  '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠',
  '行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁',
  '飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚',
  '娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
};

// 舊 kind → 新命名
function normalizeKind(k){
  if(!k) return '';
  if(k==='餐廳收入') return '營業收入';
  if(k==='其他') return '其他支出';
  const alias = { '水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務' };
  return alias[k] || k;
}

// ── Room / Catalog ──
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

// ── 最近 20 筆 ──
function watchRecent(){
  const q = query(ref(db, `rooms/${state.space}/records`), orderByChild('ts'), limitToLast(20));
  onValue(q, snap=>{
    const rows=[]; snap.forEach(ch=>rows.push(ch.val())); rows.sort((a,b)=>b.ts-a.ts);
    recentList.innerHTML = rows.map(r=>{
      const sign = r.io==='expense'?'-':'+'; 
      const d = r.date||new Date(r.ts).toLocaleDateString('zh-TW');
      return `<div class="row"><div class="r-date">${d}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group}・${r.item}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${r.amount}</div></div>`;
    }).join('')||`<div class="muted">（尚無記錄）</div>`;
  });
}

// ── 口袋 ──
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

// 新增：更新口袋餘額顏色
function updatePocketAmounts(bal){
  for(const p of POCKETS){
    const el=byId(`amt-${p.key}`); if(!el) continue;
    const val = Number(bal[p.key])||0;
    el.textContent = val.toLocaleString('zh-TW');
    if(val > 0){
      el.style.color = 'var(--pos)';   // 綠
    }else if(val < 0){
      el.style.color = 'var(--neg)';   // 紅
    }else{
      el.style.color = 'var(--text)';  // 白/中性
    }
  }
}

// ── Payers ──
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

// ── Groups & Items ──
function renderGroups(){
  const box=byId('group-grid'); if(!box) return;
  box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
    const icon=GROUP_ICON_MAP[g]||''; 
    return `<button class="chip" data-group="${g}">
      <span class="emoji">${icon}</span><span class="label">${g}</span></button>`;
  }).join('');
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
    return `<button class="chip" data-item="${it.label}">${icon}<span class="label">${it.label}</span></button>`;
  }).join('')||`<div class="muted">（暫無項目，可下方新增）</div>`;
  box.onclick=e=>{
    const btn=e.target.closest('[data-item]'); if(!btn) return;
    $$('#items-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.item=btn.dataset.item;
  };
}

// ── 新增項目：自動寫回 DB ──
byId('btn-add-cat')?.addEventListener('click',async()=>{
  const input=byId('new-cat-name'); if(!input) return;
  const name=(input.value||'').trim(); if(!name){alert('請輸入名稱');return;}
  if(!state.space||!state.group){alert('請先連線並選大項');return;}
  const base=ref(db,`rooms/${state.space}/catalog`);
  const s=await get(base);
  let cat=s.exists()?s.val():[];
  if(!Array.isArray(cat)){
    cat=[].concat(cat.categories?.restaurant||[],cat.categories?.personal||[],cat.categories||[]);
  }
  let icon='',label=name; const m=name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.+)$/u);
  if(m){icon=m[1];label=m[2].trim();}
  cat.push({id:label,label,kind:state.group,icon});
  await set(base,cat);
  state.catalog=cat; buildCatalogIndex(cat); input.value=''; renderItems();
});

// ── Submit ──
byId('btn-submit')?.addEventListener('click',async()=>{
  if(!state.space){alert('請先連線');return;}
  const amt=Number((byId('rec-amt')?.value||'').replace(/[^\d.-]/g,''))||0;
  if(!amt){alert('請輸入金額');return;}
  if(!state.pocket||!state.payer){alert('請選口袋與付款人');return;}
  const dateStr=byId('rec-date')?.value||''; const ts=dateStr?Date.parse(dateStr):Date.now();
  const note=byId('rec-note')?.value||'';
  const rec={ts,date:dateStr,amount:amt,io:state.io,scope:state.scope,group:state.group,item:state.item,payer:state.payer,pocket:state.pocket,note};
  const key=push(ref(db,`rooms/${state.space}/records`)).key;
  await set(ref(db,`rooms/${state.space}/records/${key}`),rec);
  byId('rec-amt').value=''; byId('rec-note').value='';
});

// ── Connect ──
btnConnect?.addEventListener('click',async()=>{
  state.space=(byId('space-code')?.value||'').trim(); if(!state.space){alert('請輸入共享代號');return;}
  await ensureRoom(); await ensureCatalog();
  renderPockets(); renderPayers(); watchRecent();
  btnConnect.textContent='已連線'; btnConnect.classList.add('success'); btnConnect.classList.remove('danger');
  localStorage.setItem('CF_SPACE',state.space);
});

// ── Boot ──
(function boot(){
  renderPockets(); renderPayers(); renderGroups(); renderItems();
  if(state.space){ ensureRoom().then(ensureCatalog).then(()=>{watchRecent();}); }
})();
