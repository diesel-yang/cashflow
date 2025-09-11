// app.js v4.02 —— 以 v4.01 為基底：本月紀錄 + 報表 + 預算 + 口袋 SVG 高亮（其餘不動）

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
  const d=new Date(),mm=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function ymKey(d=new Date()){
  const mm=String(d.getMonth()+1).padStart(2,'0');
  return `${d.getFullYear()}-${mm}`;
}
function monthRangeStr(d=new Date()){
  const y=d.getFullYear(),m=d.getMonth();
  const start = new Date(y,m,1);
  const end   = new Date(y,m+1,0);
  const mm = String(m+1).padStart(2,'0');
  const s = `${y}-${mm}-01`;
  const e = `${y}-${mm}-${String(end.getDate()).padStart(2,'0')}`;
  return [s,e];
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
  cacheRecords: []  // 本月快取（報表/預算共用）
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

/* 口袋 */
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

/* 付款人（三等分：J / W / JW） */
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
    const btn=e.target.closest('[data-group]']); if(!btn) return;
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

/* ===== 本月紀錄（對應 .indexOn: ["date"]）+ 餘額 ===== */
function watchMonthAndBalances(){
  const list = byId('recent-list'); if(!list) return;
  const [s,e] = monthRangeStr(new Date());
  const refRec = db.ref(`rooms/${state.space}/records`)
    .orderByChild('date').startAt(s).endAt(e);
  refRec.on('value', snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    state.cacheRecords = arr.slice(); // 報表/預算共用
    // 本月清單
    const rows = arr.sort((a,b)=>(b.ts||0)-(a.ts||0));
    list.innerHTML = rows.map(r=>{
      const sign = r.io==='expense'?'-':'+';
      const d = r.date || new Date(r.ts).toLocaleDateString('zh-TW');
      return `<div class="row">
        <div class="r-date">${d}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group||''}${r.item? '・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div>
      </div>`;
    }).join('') || `<div class="muted">（本月尚無紀錄）</div>`;
    // 餘額（仍以全部 arr 加總，這裡就以本月資料推算可接受；若要全量可另拉全表）
    updatePocketAmountsFromRecords(arr);
    // 更新報表與預算
    refreshReport(); refreshBudgetProgress();
  });
}

/* ===== 送出 ===== */
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
  const rec={
    ts, date:dateStr,
    amount:amt,
    io:state.io,
    scope:state.scope,
    group:state.group||'',
    item:state.item||'',
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

/* ===== Tabs / IO / Scope ===== */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $$('.page').forEach(p=>p.classList.remove('show'));
      byId(tab.getAttribute('data-target'))?.classList.add('show');
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

/* ===== 報表（餐廳 / Jack / Wal）===== */
byId('chip-report-scope')?.addEventListener('click', e=>{
  const b=e.target.closest('[data-rscope]'); if(!b) return;
  $$('#chip-report-scope .chip').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); refreshReport();
});
function refreshReport(){
  const active = $('#chip-report-scope .chip.active')?.dataset.rscope || 'restaurant';
  const recs = state.cacheRecords || [];
  const ym = ymKey(new Date());
  // KPI 與類別彙總
  let income=0, expense=0;
  const groupSum = new Map();

  for(const r of recs){
    // 篩對象
    if(active==='restaurant'){
      if(r.scope!=='restaurant') continue;
    }else{
      // 個人：以付款人判斷 & JW 均分
      if(r.scope!=='personal') continue;
      if(r.io!=='expense') continue; // 報表側：只彙總支出類餅
      if(r.payer==='JW'){
        const half=(Number(r.amount)||0)/2;
        if(active==='jack') addGroup(groupSum,r.group,half);
        if(active==='wal')  addGroup(groupSum,r.group,half);
        expense += half; // 對 jack/wal 單人會重算，下面在各分支處理
        continue;
      }
      if((active==='jack' && r.payer!=='J') || (active==='wal' && r.payer!=='W')) continue;
    }

    const val = Number(r.amount)||0;
    if(r.io==='income'){ income += val; } else { expense += val; addGroup(groupSum,r.group,val); }
  }

  // 若選 Jack 或 Wal，expense 需以各自分攤重新計算
  if(active==='jack' || active==='wal'){
    income = 0; expense = 0;
    const gs = new Map();
    for(const r of recs){
      if(r.scope!=='personal' || r.io!=='expense') continue;
      let share = 0;
      if(r.payer==='JW') share = (Number(r.amount)||0)/2;
      if(active==='jack' && r.payer==='J') share = (Number(r.amount)||0);
      if(active==='wal'  && r.payer==='W') share = (Number(r.amount)||0);
      if(share>0){ expense += share; addGroup(gs,r.group,share); }
    }
    setGroupTable(gs);
    drawPie(gs);
  }else{
    setGroupTable(groupSum);
    drawPie(groupSum);
  }

  byId('kpi-income').textContent = money(income);
  byId('kpi-expense').textContent = money(expense);
  byId('kpi-net').textContent     = money(income-expense);

  function addGroup(map, g, v){
    if(!g) g='未分類';
    map.set(g, (map.get(g)||0)+Number(v||0));
  }
  function setGroupTable(map){
    const host = byId('report-table');
    const rows = [...map.entries()].sort((a,b)=>b[1]-a[1]).map(([g,v])=>{
      return `<div class="tr"><div class="tag">${GROUP_ICON_MAP[g]||'🧩'} ${g}</div><div>${money(v)}</div></div>`;
    }).join('') || `<div class="muted">（本月尚無支出）</div>`;
    host.innerHTML = rows;
  }
  function drawPie(map){
    const cvs = byId('pie-report'); if(!cvs) return;
    const ctx = cvs.getContext('2d'); ctx.clearRect(0,0,cvs.width,cvs.height);
    const data = [...map.values()]; const labels=[...map.keys()];
    const sum = data.reduce((a,b)=>a+b,0)||1;
    let start = -Math.PI/2;
    for(let i=0;i<data.length;i++){
      const frac = data[i]/sum;
      const end = start + frac*2*Math.PI;
      ctx.beginPath();
      ctx.moveTo(cvs.width/2, cvs.height/2);
      ctx.arc(cvs.width/2, cvs.height/2, Math.min(cvs.width,cvs.height)/2-8, start, end);
      ctx.closePath();
      // 不指定顏色：用 HSL 派生
      ctx.fillStyle = `hsl(${(i*55)%360} 65% 55%)`;
      ctx.fill();
      start = end;
    }
    // 外圈
    ctx.beginPath();
    ctx.arc(cvs.width/2, cvs.height/2, Math.min(cvs.width,cvs.height)/2-8, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke();
  }
}

/* ===== 預算 ===== */
byId('chip-budget-scope')?.addEventListener('click', e=>{
  const b=e.target.closest('[data-bscope]'); if(!b) return;
  $$('#chip-budget-scope .chip').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); buildBudgetUI();
});
byId('btn-save-budget')?.addEventListener('click', saveBudget);

function buildBudgetUI(){
  const scope = $('#chip-budget-scope .chip.active')?.dataset.bscope || 'restaurant';
  const host = byId('budget-list'); host.innerHTML='';
  const ym = ymKey(new Date());
  const groups = (scope==='restaurant') ? REST_GROUPS.filter(g=>g!=='營業收入') : PERS_EXPENSE_GROUPS;
  // 先讀出既有預算
  db.ref(`rooms/${state.space}/budgets/${scope}/${ym}`).get().then(snap=>{
    const exist = snap.val()||{};
    groups.forEach(g=>{
      const id = `bdg-${g}`;
      host.insertAdjacentHTML('beforeend', `
        <div class="budget-item" data-group="${g}">
          <div class="row pack"><div class="tag">${GROUP_ICON_MAP[g]||'🧩'} ${g}</div>
            <input id="${id}" class="input" type="number" inputmode="decimal" placeholder="預算金額" value="${exist[g]||''}" style="max-width:180px">
          </div>
          <div class="progress"><i id="prog-${g}" style="width:0%"></i></div>
          <div class="row pack"><span class="muted">本月支出</span><span id="spent-${g}">0</span></div>
        </div>`);
    });
    refreshBudgetProgress();
  });
  byId('budget-month-label').textContent = `${ym} 預算`;
}

function saveBudget(){
  const scope = $('#chip-budget-scope .chip.active')?.dataset.bscope || 'restaurant';
  const ym = ymKey(new Date());
  const nodes = $$('.budget-item');
  const payload={};
  nodes.forEach(n=>{
    const g = n.dataset.group;
    const v = Number(byId(`bdg-${g}`)?.value||0)||0;
    payload[g]=v;
  });
  db.ref(`rooms/${state.space}/budgets/${scope}/${ym}`).set(payload).then(()=>{
    alert('已儲存預算');
    refreshBudgetProgress();
  });
}
function refreshBudgetProgress(){
  const scope = $('#chip-budget-scope .chip.active')?.dataset.bscope || 'restaurant';
  const ym = ymKey(new Date());
  const groups = (scope==='restaurant') ? REST_GROUPS.filter(g=>g!=='營業收入') : PERS_EXPENSE_GROUPS;

  // 本月支出依來源計算
  const recs = state.cacheRecords||[];
  const spent = Object.fromEntries(groups.map(g=>[g,0]));
  for(const r of recs){
    if(r.io!=='expense') continue;
    if(scope==='restaurant'){
      if(r.scope!=='restaurant') continue;
      spent[r.group] = (spent[r.group]||0) + (Number(r.amount)||0);
    }else{
      if(r.scope!=='personal') continue;
      let share = 0;
      if(scope==='jack'){
        if(r.payer==='J') share=Number(r.amount)||0;
        if(r.payer==='JW') share=(Number(r.amount)||0)/2;
      }else{
        if(r.payer==='W') share=Number(r.amount)||0;
        if(r.payer==='JW') share=(Number(r.amount)||0)/2;
      }
      spent[r.group] = (spent[r.group]||0) + share;
    }
  }

  // 套用到畫面（若預算未載入也能先顯示支出）
  db.ref(`rooms/${state.space}/budgets/${scope}/${ym}`).get().then(snap=>{
    const bdg = snap.val()||{};
    groups.forEach(g=>{
      const s = spent[g]||0;
      const b = Number(byId(`bdg-${g}`)?.value || bdg[g] || 0);
      const p = b>0 ? Math.min(100, Math.round(s/b*100)) : 0;
      const spentEl = byId(`spent-${g}`), prog = byId(`prog-${g}`);
      if(spentEl) spentEl.textContent = money(s);
      if(prog) prog.style.width = `${p}%`;
    });
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
      watchMonthAndBalances();
      buildBudgetUI(); // 連線後預算頁讀取
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

  if(state.space){
    byId('space-code').value = state.space;
    ensureRoom().then(ensureCatalog).then(()=>{
      renderPockets(); renderPayers();
      watchMonthAndBalances();
      buildBudgetUI();
      btnConnect.textContent='連線中';
      btnConnect.classList.add('success'); btnConnect.classList.remove('danger');
    });
  }else{
    btnConnect?.classList.add('danger'); btnConnect.textContent='未連線';
  }

  renderPockets(); renderPayers(); renderGroups(); renderItems();
  bindTabs(); bindIOChips(); bindScopeChips();
})();
