// v4.04.2：小豬自動縮放 + 日期卡片覆蓋 input + 連線 debug
const firebaseConfig = {
  apiKey: "AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
  authDomain: "cashflow-71391.firebaseapp.com",
  databaseURL: "https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cashflow-71391",
  storageBucket: "cashflow-71391.appspot.com",
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
function todayISO(){ const d=new Date(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${mm}-${dd}`; }

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
  allRecords: []
};

/* Groups / Icons */
const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];
function groupsFor(io, scope){
  if(scope==='restaurant') return (io==='income')?['營業收入']:REST_GROUPS.filter(g=>g!=='營業收入');
  return (io==='income')?PERS_INCOME_GROUPS:PERS_EXPENSE_GROUPS;
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
  if(k==='其他') return '其他支出';
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

/* 付款口袋 */
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
      <svg class="pig" viewBox="0 0 167 139" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><use href="#pig-icon"></use></svg>
      <div class="badge" id="amt-${p.key}">0</div>
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

/* Payers */
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

/* 觀察紀錄 + 餘額 + 圖表 */
const COLOR_PALETTE = ["#12b4c4","#ff9aa0","#76e3a8","#f6c344","#9b6ef3","#f37ec7","#3eb489","#ffa600","#00a6ed","#ff6b6b"];
let bizBarChart=null, personalPieChart=null;

function watchRecentAndBalances(){
  const list = byId('recent-list'); if(!list) return;
  const refRec = db.ref(`rooms/${state.space}/records`);
  refRec.on('value', snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    state.allRecords = arr;

    const d=new Date(); const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const rows = arr.filter(r=>(r.date||'').startsWith(ym)).sort((a,b)=> (b.ts||0)-(a.ts||0));
    list.innerHTML = rows.map(r=>{
      const sign = r.io==='expense'?'-':'+';
      const dstr = (r.date||'').slice(0,10) || new Date(r.ts).toISOString().slice(0,10);
      return `<div class="row">
        <div class="r-date">${dstr}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group||''}${r.item? '・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div>
      </div>`;
    }).join('') || `<div class="muted">（本月無紀錄）</div>`;

    updatePocketAmountsFromRecords(arr);
    renderCharts();
  });
}

/* 圖表：餐廳 P&L / 個人圓餅 */
function getMonthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function monthFilter(recs){const ym=getMonthKey();return recs.filter(r=>(r.date||'').startsWith(ym));}
function sumBy(recs, pred){return recs.reduce((s,r)=> pred(r)? s+(Number(r.amount||r.amt)||0) : s, 0);}

function renderCharts(){
  const mRecs = monthFilter(state.allRecords);

  // 餐廳 P&L
  const rest = mRecs.filter(r=>r.scope==='restaurant');
  const revenue = sumBy(rest, r=> r.io==='income' && (r.group||r.item)==='營業收入');
  const cogs    = sumBy(rest, r=> r.io==='expense' && normalizeKind(r.group)==='銷貨成本');
  const expenseGroups = ['人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
  const expenseSums = expenseGroups.map(g=> sumBy(rest, r=> r.io==='expense' && normalizeKind(r.group)===g));
  const gp = revenue - cogs;
  const opex = expenseSums.reduce((a,b)=>a+b,0);
  const op = gp - opex;
  const gpm = revenue? (gp/revenue*100):0;

  const pl = byId('pl-numbers');
  if(pl){
    pl.innerHTML = `
      <div class="pl"><div class="k">營業收入</div><div class="v">${money(revenue)}</div></div>
      <div class="pl"><div class="k">銷貨成本</div><div class="v neg">-${money(cogs)}</div></div>
      <div class="pl"><div class="k">毛利</div><div class="v ${gp>=0?'pos':'neg'}">${gp>=0?'+':''}${money(gp)}</div></div>
      <div class="pl"><div class="k">毛利率</div><div class="v">${gpm.toFixed(1)}%</div></div>
      <div class="pl"><div class="k">營業費用</div><div class="v neg">-${money(opex)}</div></div>
      <div class="pl"><div class="k">營業利益</div><div class="v ${op>=0?'pos':'neg'}">${op>=0?'+':''}${money(op)}</div></div>
    `;
  }

  const barCtx = byId('biz-bar');
  if(barCtx && window.Chart){
    bizBarChart?.destroy();
    bizBarChart = new Chart(barCtx, {
      type:'bar',
      data:{labels:expenseGroups, datasets:[{label:'金額', data:expenseSums, backgroundColor: COLOR_PALETTE.slice(0,expenseGroups.length)}]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>money(v)}}}}
    });
  }

  // 個人圓餅
  const personal = mRecs.filter(r=>r.scope==='personal' && r.io==='expense');
  const persGroups = PERS_EXPENSE_GROUPS;
  const persSums = persGroups.map(g=> sumBy(personal, r=> normalizeKind(r.group)===g));
  const pieCtx = byId('personal-pie');
  if(pieCtx && window.Chart){
    personalPieChart?.destroy();
    personalPieChart = new Chart(pieCtx, {
      type:'pie',
      data:{labels:persGroups, datasets:[{data:persSums, backgroundColor: COLOR_PALETTE}]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'left'}}}
    });
  }
}

/* 送出 */
byId('btn-submit')?.addEventListener('click', onSubmit);
async function onSubmit(){
  if(!state.space) return alert('請先連線');
  const amtRaw = (byId('rec-amt')?.value||'').replace(/[^\d.-]/g,'');
  const amt = Number(amtRaw)||0;
  if(!amt) return alert('請輸入金額');
  if(!state.pocket || !state.payer) return alert('請選口袋與付款人/收款人');

  const newName = (byId('new-cat-name')?.value||'').trim();
  if(newName && state.group){ await addItemToCatalog(); }

  const dateStr=byId('rec-date')?.value||todayISO(); 
  const ts = Date.parse(dateStr)||Date.now();
  const note=byId('rec-note')?.value||'';
  const rec={ts, date:dateStr, amount:amt, io:state.io, scope:state.scope, group:state.group,
             item:state.item, payer:state.payer, pocket:state.pocket, note};
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

/* Tabs / IO / Scope */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $$('.page').forEach(p=>p.classList.remove('show'));
      const id = tab.getAttribute('data-target');
      byId(id)?.classList.add('show');
      setTimeout(renderCharts, 0);
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

/* 日期顯示層（年後換行） */
function formatDateMultiline(str){
  const [y,m,d]=str.split('-'); if(!y||!m||!d) return '';
  return `${y}\n年${Number(m)}月${Number(d)}日`;
}
function syncDateDisplay(){
  const el=byId('rec-date'); const disp=byId('rec-date-display');
  if(!el||!disp) return;
  const val=el.value || todayISO();
  disp.textContent = formatDateMultiline(val);
}
byId('rec-date')?.addEventListener('input', syncDateDisplay);
byId('rec-date')?.addEventListener('change', syncDateDisplay);

/* 連線 */
const btnConnect = byId('btn-connect');
function doConnect(){
  const input = byId('space-code');
  const code = (input?.value||'').trim();
  console.log("doConnect", code);   // debug：桌機上檢查是否有觸發
  if(!code){ alert('請輸入共享代號'); return; }
  state.space = code;
  ensureRoom()
    .then(ensureCatalog)
    .then(()=>{
      renderPockets(); renderPayers();
      watchRecentAndBalances();
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

/* Boot */
(function boot(){
  const dateInput = byId('rec-date');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
  syncDateDisplay();

  if(state.space){
    byId('space-code').value = state.space;
    ensureRoom().then(ensureCatalog).then(()=>{
      renderPockets(); renderPayers();
      watchRecentAndBalances();
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success');
      btnConnect.classList.remove('danger');
    });
  }else{
    btnConnect?.classList.add('danger');
    btnConnect.textContent='未連線';
    renderPockets(); renderPayers(); renderGroups(); renderItems();
  }

  bindTabs(); bindIOChips(); bindScopeChips();
  window.addEventListener('resize', ()=>{ setTimeout(renderCharts, 0); });
})();
