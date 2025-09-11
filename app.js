// app.js v4.01 + Reports/Budget

/* Firebase（Compat） */
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

/* DOM utils */
const $  = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const byId = id=>document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString('zh-TW');

function todayISO(){
  const d = new Date();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function monthRangeISO(d=new Date()){
  const y = d.getFullYear(), m = d.getMonth();
  const start = new Date(y, m, 1);
  const end   = new Date(y, m+1, 0);
  const s = `${y}-${String(m+1).padStart(2,'0')}-01`;
  const e = `${y}-${String(m+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
  return {startISO:s, endISO:e};
}

/* State */
const state = {
  space: localStorage.getItem('CF_SPACE') || "",
  io: "expense",
  scope: "restaurant",
  group: "",
  item: "",
  payer: "J",
  pocket: "restaurant",
  catalog: [],
  catalogIndex: null,
  // report/budget scopes
  rscope: "restaurant",
  bscope: "restaurant"
};

/* Groups / Icons */
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];
function groupsFor(io, scope){
  if(scope==='restaurant')
    return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
}
const GROUP_ICON_MAP = {
  '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠',
  '行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁',
  '飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚',
  '娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
};
function normalizeKind(k){
  if(!k) return '';
  if(k==='餐廳收入') return '營業收入';
  if(k==='其他')     return '其他支出';
  const alias = { '水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務' };
  return alias[k] || k;
}

/* Catalog helpers */
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

/* Ensure room & catalog */
async function ensureRoom(){
  const r = db.ref(`rooms/${state.space}`);
  const s = await r.get();
  if(!s.exists()) await r.set({_ts:Date.now()});
}
async function ensureCatalog(){
  const base = db.ref(`rooms/${state.space}/catalog`);
  const s = await base.get();
  state.catalog = s.exists()?s.val():[];
  if(!s.exists()) await base.set(state.catalog);
  buildCatalogIndex(state.catalog);
  renderGroups(); renderItems();
}

/* Pockets */
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
function updatePocketAmountsFromRecords(records){
  const bal={restaurant:0,jack:0,wal:0};
  for(const r of records){
    const delta=(r.io==='income'?1:-1)*(Number(r.amount||r.amt)||0);
    if (r.pocket && bal[r.pocket] != null) bal[r.pocket]+=delta;
  }
  for(const p of POCKETS){
    const el=byId(`amt-${p.key}`); if(!el) continue;
    const v = bal[p.key]||0;
    el.textContent = (v||0).toLocaleString('zh-TW');
    const card = el.closest('.pocket');
    card.classList.toggle('negative', v<0);
    card.classList.toggle('positive', v>0);
  }
}

/* Payers (3 等分：J / W / JW) */
function renderPayers(){
  const row=byId('payers-row'); if(!row) return;
  const data = [{key:'J',label:'J',icon:'👤'},{key:'W',label:'W',icon:'👤'},{key:'JW',label:'JW',icon:'👥'}];
  row.innerHTML = data.map(x=>`
    <button class="chip lg ${x.key==='J'?'active':''}" data-payer="${x.key}">
      <span class="emoji">${x.icon}</span><span class="label">${x.label}</span>
    </button>`).join('');
  state.payer = 'J';
  row.onclick=e=>{
    const btn=e.target.closest('[data-payer]'); if(!btn) return;
    $$('#payers-row .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.payer=btn.dataset.payer;
  };
}

/* Groups & Items */
function renderGroups(){
  const box=byId('group-grid'); if(!box) return;
  box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
    const icon=GROUP_ICON_MAP[g]||''; 
    return `<button class="chip" data-group="${g}">
      <span class="emoji">${icon}</span><span class="label">${g}</span></button>`;
  }).join('');
  state.group='';
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
  }).join('')||`<div class="muted">（暫無項目，可下方建立）</div>`;
  box.onclick=e=>{
    const btn=e.target.closest('[data-item]'); if(!btn) return;
    $$('#items-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.item=btn.dataset.item;
  };
}

/* 建立/補項目（可附 emoji） */
byId('btn-add-cat')?.addEventListener('click', addItemToCatalog);
async function addItemToCatalog(){
  const input=byId('new-cat-name'); if(!input) return;
  const name=(input.value||'').trim(); if(!name){alert('請輸入名稱');return;}
  if(!state.space||!state.group){alert('請先連線並選類別');return;}
  const base=db.ref(`rooms/${state.space}/catalog`);
  const s=await base.get();
  let cat=s.exists()?s.val():[];
  if(!Array.isArray(cat)){
    cat=[].concat(cat.categories?.restaurant||[],cat.categories?.personal||[],cat.categories||[]);
  }
  let icon='',label=name; 
  const m=name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.+)$/u);
  if(m){icon=m[1];label=m[2].trim();}
  cat.push({id:label,label,kind:state.group,icon});
  await base.set(cat);
  state.catalog=cat; buildCatalogIndex(cat); input.value=''; renderItems();
}

/* 送出 */
byId('btn-submit')?.addEventListener('click', onSubmit);
async function onSubmit(){
  if(!state.space) return alert('請先連線');
  const amtRaw = (byId('rec-amt')?.value||'').replace(/[^\d.-]/g,'');
  const amt = Number(amtRaw)||0;
  if(!amt) return alert('請輸入金額');
  if(!state.pocket || !state.payer) return alert('請選口袋與付款人/收款人');

  // 若輸入的新項目名稱存在，先補 catalog（合併流程）
  const newName = (byId('new-cat-name')?.value||'').trim();
  if(newName && state.group){
    await addItemToCatalog();
  }

  const dateStr=byId('rec-date')?.value||todayISO(); 
  const ts = Date.parse(dateStr)||Date.now();
  const note=byId('rec-note')?.value||'';
  const rec={
    ts, date:dateStr,
    amount:amt,
    io:state.io,
    scope:state.scope,
    group:state.group,
    item:state.item,
    payer:state.payer,
    pocket:state.pocket,
    note
  };
  const room = db.ref(`rooms/${state.space}`);
  const id = room.child('records').push().key;
  const updates = {};
  updates[`records/${id}`] = rec;
  updates[`balances/${state.pocket}`] = firebase.database.ServerValue.increment(
    (state.io==='income'?1:-1) * amt
  );
  await room.update(updates);

  byId('rec-amt').value=''; byId('rec-note').value='';
}

/* 本月紀錄 + 餘額（用 date 索引） */
function watchMonthAndBalances(){
  const list = byId('recent-list'); if(!list) return;
  const {startISO, endISO} = monthRangeISO(new Date());
  const recRef = db.ref(`rooms/${state.space}/records`).orderByChild('date').startAt(startISO).endAt(endISO);

  recRef.on('value', snap=>{
    const arr=[];
    snap.forEach(ch=>arr.push(ch.val()));
    arr.sort((a,b)=> (b.date||'') < (a.date||'') ? -1 : 1);

    list.innerHTML = arr.map(r=>{
      const sign = r.io==='expense'?'-':'+';
      const d = r.date || new Date(r.ts).toLocaleDateString('zh-TW');
      return `<div class="row">
        <div class="r-date">${d}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group}${r.item? '・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div>
      </div>`;
    }).join('') || `<div class="muted">（本月尚無紀錄）</div>`;

    // 餘額用「全部歷史」會較準確；若只要本月可改用 arr
    const allRef = db.ref(`rooms/${state.space}/records`);
    allRef.once('value').then(s=>{
      const all=[]; s.forEach(c=>all.push(c.val()));
      updatePocketAmountsFromRecords(all);
    });
  });
}

/* 報表（本月） */
let pieChart = null;
async function renderReport(){
  if(!state.space) return;
  const {startISO,endISO} = monthRangeISO(new Date());
  const refQ = db.ref(`rooms/${state.space}/records`).orderByChild('date').startAt(startISO).endAt(endISO);
  const snap = await refQ.get();
  const arr=[]; snap.forEach(ch=>arr.push(ch.val()));

  // 篩選範圍
  let rows = [];
  if(state.rscope==='restaurant'){
    rows = arr.filter(r=>r.scope==='restaurant');
  }else if(state.rscope==='jack'){
    rows = arr.filter(r=> (r.pocket==='jack'));
  }else{
    rows = arr.filter(r=> (r.pocket==='wal'));
  }

  // KPI
  let inc=0, exp=0;
  rows.forEach(r=>{
    const v = Number(r.amount||0);
    if(r.io==='income') inc += v; else exp += v;
  });
  const net = inc - exp;
  byId('r-inc').textContent = money(inc);
  byId('r-exp').textContent = money(exp);
  byId('r-net').textContent = money(net);
  byId('r-net').classList.toggle('pos', net>0);
  byId('r-net').classList.toggle('neg', net<0);

  // 圓餅：以「支出」依類別彙總
  const sumByKind = {};
  rows.filter(r=>r.io==='expense').forEach(r=>{
    const k = r.group || '未分類';
    sumByKind[k] = (sumByKind[k]||0) + Number(r.amount||0);
  });
  const labels = Object.keys(sumByKind);
  const data   = labels.map(k=>sumByKind[k]);

  // 表格
  const tb = byId('report-tbody');
  tb.innerHTML = labels.map(k=>`<tr><td>${k}</td><td class="tr">${money(sumByKind[k])}</td></tr>`).join('') || `<tr><td colspan="2" class="muted">（本月尚無支出）</td></tr>`;
  byId('report-sum').textContent = money(data.reduce((a,b)=>a+b,0));

  // 畫圓餅
  const ctx = byId('pie-chart').getContext('2d');
  if(pieChart){ pieChart.destroy(); }
  pieChart = new Chart(ctx, {
    type:'pie',
    data:{ labels, datasets:[{ data }]},
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:'#dff5f9' } } } }
  });
}

/* 預算頁 */
function ymKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function budgetGroups(scope){
  return (scope==='restaurant') ? REST_GROUPS.filter(g=>g!=='營業收入') : PERS_EXPENSE_GROUPS;
}
async function renderBudget(){
  if(!state.space) return;
  const month = ymKey(new Date());
  byId('bud-month-label').textContent = `月份：${month}`;

  const groups = budgetGroups(state.bscope);
  const wrap = byId('budget-list');
  wrap.innerHTML = groups.map(g=>`
    <div class="bud-row" data-group="${g}">
      <div class="label"><span class="emoji">${GROUP_ICON_MAP[g]||''}</span>${g}</div>
      <input class="in-budget" type="number" placeholder="預算">
      <div class="progress"><i></i></div>
    </div>
  `).join('');

  // 載入既有預算
  const budRef = db.ref(`rooms/${state.space}/budgets/${state.bscope}/${month}`);
  const recRef = db.ref(`rooms/${state.space}/records`).orderByChild('date')
                    .startAt(monthRangeISO().startISO).endAt(monthRangeISO().endISO);

  const [budSnap, recSnap] = await Promise.all([budRef.get(), recRef.get()]);
  const bud = budSnap.exists()? budSnap.val() : {};
  const rows=[]; recSnap.forEach(ch=>rows.push(ch.val()));

  // 計算本月該 scope 支出
  const spendBy = {};
  rows.filter(r=>{
    if(state.bscope==='restaurant') return r.scope==='restaurant' && r.io==='expense';
    if(state.bscope==='jack')       return r.pocket==='jack' && r.io==='expense';
    return r.pocket==='wal' && r.io==='expense';
  }).forEach(r=>{
    const k=r.group||'未分類';
    spendBy[k]=(spendBy[k]||0)+Number(r.amount||0);
  });

  // 回填
  $$('.bud-row').forEach(row=>{
    const g = row.dataset.group;
    const input = row.querySelector('.in-budget');
    const prog  = row.querySelector('.progress > i');
    input.value = bud[g]||'';
    const val = Number(spendBy[g]||0);
    const cap = Math.max(0, Number(input.value||0));
    const pct = cap ? Math.min(100, Math.round(val/cap*100)) : 0;
    prog.style.width = pct+'%';
  });
}

// 儲存預算
byId('btn-save-budget')?.addEventListener('click', async ()=>{
  if(!state.space) return alert('請先連線');
  const month = ymKey(new Date());
  const payload = {};
  $$('.bud-row').forEach(row=>{
    const g = row.dataset.group;
    const v = Number(row.querySelector('.in-budget').value||0);
    if(v>0) payload[g]=v;
  });
  await db.ref(`rooms/${state.space}/budgets/${state.bscope}/${month}`).set(payload);
  alert('已儲存預算');
});

/* Tabs / IO / Scope */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', async ()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $$('.page').forEach(p=>p.classList.remove('show'));
      const id = tab.getAttribute('data-target');
      byId(id)?.classList.add('show');

      if(id==='page-report') await renderReport();
      if(id==='page-budget') await renderBudget();
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
    renderGroups(); renderItems();
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
// 報表/預算 scope chips
byId('report-scope')?.addEventListener('click', async e=>{
  const btn = e.target.closest('[data-rscope]'); if(!btn) return;
  $$('#report-scope .chip').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  state.rscope = btn.dataset.rscope;
  await renderReport();
});
byId('budget-scope')?.addEventListener('click', async e=>{
  const btn = e.target.closest('[data-bscope]'); if(!btn) return;
  $$('#budget-scope .chip').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  state.bscope = btn.dataset.bscope;
  await renderBudget();
});

/* 連線 */
const btnConnect = byId('btn-connect');
function doConnect(){
  const input = byId('space-code');
  const code = (input?.value||'').trim();
  if(!code){ alert('請輸入共享代號'); return; }
  state.space = code;
  ensureRoom()
    .then(ensureCatalog)
    .then(()=>{
      renderPockets(); renderPayers();
      watchMonthAndBalances();
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success');
      btnConnect.classList.remove('danger');
      localStorage.setItem('CF_SPACE',state.space);
      // 初始載入報表/預算
      renderReport(); renderBudget();
    })
    .catch(err=>{
      console.error(err);
      alert('連線失敗，請稍後再試');
    });
}
btnConnect?.addEventListener('click', doConnect);
byId('space-code')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doConnect(); });

/* Boot */
(function boot(){
  // 日期預設今天
  const dateInput = byId('rec-date');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  if(state.space){
    byId('space-code').value = state.space;
    ensureRoom().then(ensureCatalog).then(()=>{
      renderPockets(); renderPayers();
      watchMonthAndBalances();
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success');
      btnConnect.classList.remove('danger');
      renderReport(); renderBudget();
    });
  }else{
    btnConnect?.classList.add('danger');
    btnConnect.textContent='未連線';
  }

  renderPockets(); renderPayers(); renderGroups(); renderItems();
  bindTabs(); bindIOChips(); bindScopeChips();
})();
