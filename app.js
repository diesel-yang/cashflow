// v4.02 修正整合：本月紀錄、分頁切換、SVG口袋高亮、報表拆頁、日期預設

/* Firebase（Compat） */
const firebaseConfig = {
  apiKey:"AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
  authDomain:"cashflow-71391.firebaseapp.com",
  databaseURL:"https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:"cashflow-71391",
  storageBucket:"cashflow-71391.firebasestorage.app",
  messagingSenderId:"204834375477",
  appId:"1:204834375477:web:406dde0ccb0d33a60d2e7c",
  measurementId:"G-G2DVG798M8"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ===== Utils ===== */
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
function ymRange(date=new Date()){
  const y = date.getFullYear();
  const m = date.getMonth();
  const mm = String(m+1).padStart(2,'0');
  const first = `${y}-${mm}-01`;
  const lastDate = new Date(y, m+1, 0).getDate();
  const last  = `${y}-${mm}-${String(lastDate).padStart(2,'0')}`;
  return {first,last,ym:`${y}-${mm}`};
}

/* ===== State ===== */
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
  person:"J",               // 個人收支頁 J/W
  monthRecords: []          // 本月資料快取（for 報表）
};

/* ===== Groups & Icons ===== */
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];
const GROUP_ICON_MAP = {
  '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠','行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁','飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚','娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
};
function groupsFor(io, scope){
  if(scope==='restaurant') return (io==='income')?['營業收入']:REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income')?PERS_INCOME_GROUPS:PERS_EXPENSE_GROUPS;
}

/* ===== Catalog helpers ===== */
function normalizeKind(k){
  if(!k) return '';
  if(k==='餐廳收入') return '營業收入';
  if(k==='其他')     return '其他支出';
  const alias = { '水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務' };
  return alias[k] || k;
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

/* ===== Ensure room & catalog ===== */
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

/* ===== Pockets ===== */
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
      <span class="amt-badge" id="amt-${p.key}">0</span>
      <svg class="pig" viewBox="0 0 128 96" aria-hidden="true"><use href="#pig-icon"></use></svg>
      <div class="name">${p.name}</div>
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

/* ===== Payers ===== */
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

/* ===== Groups & Items ===== */
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

/* ===== 新增項目（可附 emoji） ===== */
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

/* ===== 本月紀錄（date 索引） & 餘額（全期間） ===== */
let offMonthly = null, offAll = null;
function watchMonthlyAndBalances(){
  if(!state.space) return;
  const {first,last} = ymRange(new Date());
  const root = db.ref(`rooms/${state.space}/records`);

  // 本月
  if(offMonthly) root.off('value', offMonthly);
  offMonthly = root.orderByChild('date').startAt(first).endAt(last)
    .on('value', snap=>{
      const arr=[];
      snap.forEach(ch=>arr.push(ch.val()));
      state.monthRecords = arr.slice().sort((a,b)=> (b.ts||0)-(a.ts||0));
      renderRecent(state.monthRecords);
      renderBizReport(state.monthRecords);
      renderPersonalReport(state.monthRecords);
    });

  // 全期間（僅用來計算口袋餘額）
  if(offAll) root.off('value', offAll);
  offAll = root.on('value', snap=>{
    const all=[]; snap.forEach(ch=>all.push(ch.val()));
    updatePocketAmountsFromRecords(all);
  });
}
function renderRecent(rows){
  const list = byId('recent-list'); if(!list) return;
  list.innerHTML = rows.map(r=>{
    const sign = r.io==='expense'?'-':'+';
    const d = r.date || new Date(r.ts||Date.now()).toLocaleDateString('zh-TW');
    return `<div class="row">
      <div class="r-date">${d}</div>
      <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group||''}${r.item? '・'+r.item:''}</div>
      <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div>
    </div>`;
  }).join('') || `<div class="muted">（本月尚無紀錄）</div>`;
}

/* ===== 報表：餐廳營收（P&L + pie） ===== */
function renderBizReport(monthArr){
  const recs = monthArr.filter(r=>r.scope==='restaurant');
  const income = recs.filter(r=>r.io==='income' || r.group==='營業收入')
                     .reduce((s,r)=>s+Number(r.amount||r.amt||0),0);
  const cogs   = recs.filter(r=>r.group==='銷貨成本' && r.io==='expense')
                     .reduce((s,r)=>s+Number(r.amount||r.amt||0),0);
  byId('biz-income').textContent = money(income);
  byId('biz-cogs').textContent   = money(cogs);
  byId('biz-gp').textContent     = money(income - cogs);

  // pie：餐廳支出分布（不含營收）
  const map=new Map();
  recs.filter(r=>r.io==='expense').forEach(r=>{
    const k=r.group||'其他';
    map.set(k,(map.get(k)||0)+Number(r.amount||r.amt||0));
  });
  const pairs=[...map.entries()];
  drawPie(byId('biz-pie'), pairs);

  // 表
  const host=byId('biz-table');
  host.innerHTML = pairs.sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
    <div class="row"><div>${k}</div><div></div><div class="r-amt neg">-${money(v)}</div></div>
  `).join('') || `<div class="muted">（本月無支出）</div>`;
}

/* ===== 報表：個人收支（J/W + pie + 預支） ===== */
function renderPersonalReport(monthArr){
  const who = state.person; // 'J' or 'W'
  const recs = monthArr.filter(r=>r.scope==='personal');

  // 收入：個人收入（io=income）且付款人為自己
  const inc = recs.filter(r=>r.io==='income' && r.payer===who)
                  .reduce((s,r)=>s+Number(r.amount||r.amt||0),0);

  // 支出：個人支出（io=expense），自己支付或 JW 均分
  const exp = recs.reduce((s,r)=>{
    if(r.io!=='expense') return s;
    const a = Number(r.amount||r.amt||0);
    if(r.payer===who) return s+a;
    if(r.payer==='JW') return s+a/2;
    return s;
  },0);

  // 預支：使用「餐廳口袋」支付的個人支出，算在個人預支；JW 均分
  const adv = recs.reduce((s,r)=>{
    if(r.io!=='expense' || r.pocket!=='restaurant') return s;
    const a = Number(r.amount||r.amt||0);
    if(r.payer===who) return s+a;
    if(r.payer==='JW') return s+a/2;
    return s;
  },0);

  byId('p-inc').textContent = money(inc);
  byId('p-exp').textContent = money(exp);
  byId('p-adv').textContent = money(adv);

  // pie：個人支出分布
  const map=new Map();
  recs.filter(r=>r.io==='expense').forEach(r=>{
    const share = (r.payer==='JW')?0.5 : (r.payer===who?1:0);
    if(share<=0) return;
    const k=r.group||'其他';
    map.set(k,(map.get(k)||0)+share*Number(r.amount||r.amt||0));
  });
  const pairs=[...map.entries()];
  drawPie(byId('p-pie'), pairs);

  const host=byId('p-table');
  host.innerHTML = pairs.sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
    <div class="row"><div>${k}</div><div></div><div class="r-amt neg">-${money(v)}</div></div>
  `).join('') || `<div class="muted">（本月無支出）</div>`;
}

/* ===== 送出 ===== */
byId('btn-submit')?.addEventListener('click', onSubmit);
async function onSubmit(){
  if(!state.space) return alert('請先連線');
  const amtRaw = (byId('rec-amt')?.value||'').replace(/[^\d.-]/g,'');
  const amt = Number(amtRaw)||0;
  if(!amt) return alert('請輸入金額');
  if(!state.pocket || !state.payer) return alert('請選口袋與付款人/收款人');

  // 若輸入的新項目名稱存在，先補 catalog
  const newName = (byId('new-cat-name')?.value||'').trim();
  if(newName && state.group){ await addItemToCatalog(); }

  const dateStr = byId('rec-date')?.value || todayISO();
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
  // 口袋餘額（全期間累加）
  updates[`balances/${state.pocket}`] = firebase.database.ServerValue.increment(
    (state.io==='income'?1:-1) * amt
  );
  await room.update(updates);

  byId('rec-amt').value=''; byId('rec-note').value='';
}

/* ===== Tabs / IO / Scope / Person ===== */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $$('.page').forEach(p=>p.classList.remove('show'));
      const id = tab.getAttribute('data-target');
      byId(id)?.classList.add('show');
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
function bindPersonChips(){
  const group = byId('chip-person'); if(!group) return;
  group.addEventListener('click',e=>{
    const btn=e.target.closest('[data-person]'); if(!btn) return;
    $$('#chip-person .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    state.person = btn.dataset.person; 
    renderPersonalReport(state.monthRecords);
  });
}

/* ===== 連線 ===== */
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
      watchMonthlyAndBalances();
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success');
      btnConnect.classList.remove('danger');
      localStorage.setItem('CF_SPACE',state.space);
    })
    .catch(err=>{
      console.error(err);
      alert('連線失敗，請稍後再試');
    });
}
btnConnect?.addEventListener('click', doConnect);
byId('space-code')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doConnect(); });

/* ===== Boot ===== */
(function boot(){
  // 日期預設今天
  const dateInput = byId('rec-date');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  // 連線還原
  if(state.space){
    byId('space-code').value = state.space;
    ensureRoom().then(ensureCatalog).then(()=>{
      renderPockets(); renderPayers();
      watchMonthlyAndBalances();
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success');
      btnConnect.classList.remove('danger');
    });
  }else{
    btnConnect?.classList.add('danger');
    btnConnect.textContent='未連線';
  }

  renderPockets(); renderPayers(); renderGroups(); renderItems();
  bindTabs(); bindIOChips(); bindScopeChips(); bindPersonChips();
})();
