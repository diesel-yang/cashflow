// app.js v4.02 — 熱修：三欄穩定、口袋=SVG（內嵌金額）、日期預設今日、分頁可切換、P&L/圖表
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
  catalogIndex: null
};
let allRecordsCache = []; // 供 P&L 與圖表使用（全資料，非僅本月）

/* Groups / Icons（保持既有） */
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

/* 付款口袋（小豬=卡片主體、金額內嵌） */
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
      <svg class="pig" viewBox="0 0 167 139" aria-hidden="true"><use href="#pig-icon"></use></svg>
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

/* Payers (J / W / JW 三等分) */
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

/* 本月紀錄 + 餘額（維持既有 monthly filter） */
function watchRecentAndBalances(){
  const list = byId('recent-list'); if(!list) return;
  const refRec = db.ref(`rooms/${state.space}/records`);
  refRec.on('value', snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
    allRecordsCache = arr.slice(); // 更新全域快取

    // 只顯示本月
    const d=new Date(); const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const rows = arr.filter(r=>(r.date||'').startsWith(ym)).sort((a,b)=> (b.ts||0)-(a.ts||0));
    list.innerHTML = rows.map(r=>{
      const sign = r.io==='expense'?'-':'+';
      const dstr = r.date || new Date(r.ts).toLocaleDateString('zh-TW');
      return `<div class="row">
        <div class="r-date">${dstr}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group||''}${r.item? '・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div>
      </div>`;
    }).join('') || `<div class="muted">（本月無紀錄）</div>`;

    // 餘額依全部紀錄累計
    updatePocketAmountsFromRecords(arr);

    // 更新報表 & 圖表
    renderReports();
  });
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
  if(newName && state.group){ await addItemToCatalog(); }

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

  // 清空輸入
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
      // 切到報表頁時重畫一次（避免 canvas 尺寸或捲動影響）
      if(id==='page-biz' || id==='page-personal' || id==='page-budget'){ renderReports(); }
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

/* ===== 報表與圖表 ===== */
function currentMonthPrefix(){
  const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function sum(arr){ return arr.reduce((a,b)=>a+(Number(b)||0),0); }
function filterMonth(records, ym){
  return records.filter(r => (r.date||'').startsWith(ym));
}
function groupSumBy(records, key){
  const m=new Map();
  for(const r of records){
    const k = r[key] || '';
    m.set(k, (m.get(k)||0) + (Number(r.amount||r.amt)||0) * (r.io==='expense'?-1:1));
  }
  return m;
}
function buildBizPL(monthRecs){
  // 餐廳（scope='restaurant'）
  const rs = monthRecs.filter(r=>r.scope==='restaurant');
  const income = rs.filter(r=>r.io==='income' && (r.group==='營業收入' || r.group==='' ));
  const expenses = rs.filter(r=>r.io==='expense');

  const byGroup = new Map();
  for(const g of REST_GROUPS){ byGroup.set(g,0); }
  for(const r of rs){
    const g = r.group || (r.io==='income'?'營業收入':'其他');
    const val = (Number(r.amount||r.amt)||0) * (r.io==='expense'?-1:1);
    if(!byGroup.has(g)) byGroup.set(g,0);
    byGroup.set(g, byGroup.get(g)+val);
  }
  const revenue = sum(income.map(x=>Number(x.amount||x.amt)||0));
  const cogs = Math.abs(byGroup.get('銷貨成本')||0);
  const opexGroups = ['人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
  const opex = Math.abs( opexGroups.reduce((t,g)=> t + (byGroup.get(g)||0), 0) );
  const grossProfit = revenue - cogs;
  const operatingProfit = grossProfit - opex;

  return {byGroup, revenue, cogs, opex, grossProfit, operatingProfit};
}
function buildPersonalPL(monthRecs){
  const ps = monthRecs.filter(r=>r.scope==='personal');
  const income = ps.filter(r=>r.io==='income');
  const expense = ps.filter(r=>r.io==='expense');

  const byIncome = groupSumBy(income,'group'); // 正值
  const byExpense = groupSumBy(expense,'group'); // 負值（我們取絕對值顯示）
  const incomeTotal = sum(income.map(x=>Number(x.amount||x.amt)||0));
  const expenseTotal = sum(expense.map(x=>Number(x.amount||x.amt)||0));
  const net = incomeTotal - expenseTotal;
  return {byIncome, byExpense, incomeTotal, expenseTotal, net};
}

/* 繪製簡易柱狀圖（原生 canvas，無外掛） */
function drawBarChart(canvas, labels, values){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const padding = 40;
  const chartW = W - padding*2;
  const chartH = H - padding*2;

  const maxV = Math.max(1, ...values.map(v=>Math.abs(v)));
  const barW = Math.max(8, chartW / Math.max(1, labels.length) * 0.7);
  const gap = (chartW - barW*labels.length) / Math.max(1,(labels.length-1));

  ctx.fillStyle = '#e6eef0';
  ctx.font = '12px system-ui';

  // axes
  ctx.globalAlpha = .6;
  ctx.beginPath();
  ctx.moveTo(padding, H-padding); ctx.lineTo(W-padding, H-padding);
  ctx.moveTo(padding, padding); ctx.lineTo(padding, H-padding);
  ctx.strokeStyle = '#2b3a3d'; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha = 1;

  // bars
  let x = padding;
  for(let i=0;i<labels.length;i++){
    const v = Math.max(0, values[i]);
    const h = (v/maxV)* (chartH-10);
    const y = H - padding - h;

    // bar (不指定顏色，使用預設 fillStyle)
    ctx.fillRect(x, y, barW, h);

    // label
    const txt = labels[i];
    const tw = ctx.measureText(txt).width;
    ctx.save();
    ctx.globalAlpha = .85;
    ctx.fillText(txt, x + barW/2 - tw/2, H - padding + 14);
    ctx.restore();

    // value
    const valStr = (Math.round(v)).toLocaleString('zh-TW');
    const vw = ctx.measureText(valStr).width;
    ctx.fillText(valStr, x + barW/2 - vw/2, y - 6);

    x += barW + gap;
  }
}

/* 渲染表格 */
function renderPLTable(host, rows){
  if(!host) return;
  host.innerHTML = `
    <table>
      <thead><tr><th>項目</th><th class="amt">金額</th></tr></thead>
      <tbody>
        ${rows.map(r=>{
          const cls = r.class || '';
          const val = (Number(r.value)||0);
          const signCls = val>=0 ? 'pos' : 'neg';
          return `<tr class="${cls}">
            <td>${r.label}</td>
            <td class="amt ${signCls}">${money(val)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

/* 主渲染：報表與圖表（本月） */
function renderReports(){
  const ym = currentMonthPrefix();
  const monthRecs = filterMonth(allRecordsCache, ym);

  // 餐廳
  const biz = buildBizPL(monthRecs);
  const bizRows = [
    {label:'營業收入', value: biz.revenue, class:'total'},
    {label:'銷貨成本（COGS）', value: -biz.cogs},
    {label:'毛利', value: biz.grossProfit, class:'total'},
    {label:'人事', value: -(Math.abs(biz.byGroup.get('人事')||0))},
    {label:'水電/租金/網路', value: -(Math.abs(biz.byGroup.get('水電/租金/網路')||0))},
    {label:'行銷', value: -(Math.abs(biz.byGroup.get('行銷')||0))},
    {label:'物流/運輸', value: -(Math.abs(biz.byGroup.get('物流/運輸')||0))},
    {label:'行政/稅務', value: -(Math.abs(biz.byGroup.get('行政/稅務')||0))},
    {label:'營業利益', value: biz.operatingProfit, class:'total'}
  ];
  renderPLTable(byId('biz-pl'), bizRows);

  // 餐廳支出圖（排除營業收入與 COGS，只看營運費用）
  const opexLabels = ['人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
  const opexValues = opexLabels.map(g => Math.abs(biz.byGroup.get(g)||0));
  drawBarChart(byId('biz-chart'), opexLabels, opexValues);

  // 個人
  const per = buildPersonalPL(monthRecs);
  const perRows = [
    {label:'收入合計', value: per.incomeTotal, class:'total'},
    ...PERS_INCOME_GROUPS.map(g=>({label:`收入：${g}`, value: Math.abs(per.byIncome.get(g)||0)})),
    {label:'支出合計', value: -per.expenseTotal, class:'total'},
    ...PERS_EXPENSE_GROUPS.map(g=>({label:`支出：${g}`, value: -(Math.abs(per.byExpense.get(g)||0))})),
    {label:'本月結餘', value: per.net, class:'total'}
  ];
  renderPLTable(byId('pers-pl'), perRows);

  // 個人支出圖
  const expLabels = PERS_EXPENSE_GROUPS;
  const expValues = expLabels.map(g => Math.abs(per.byExpense.get(g)||0));
  drawBarChart(byId('pers-chart'), expLabels, expValues);

  // 預算頁快覽（以實際數據先顯示）
  const budgetRows = [
    {label:'餐廳：營業收入（本月）', value: biz.revenue, class:'total'},
    {label:'餐廳：營運費用合計（本月）', value: -biz.opex},
    {label:'餐廳：營業利益（本月）', value: biz.operatingProfit, class:'total'},
    {label:'個人：收入合計（本月）', value: per.incomeTotal, class:'total'},
    {label:'個人：支出合計（本月）', value: -per.expenseTotal},
    {label:'個人：本月結餘', value: per.net, class:'total'}
  ];
  renderPLTable(byId('budget-summary'), budgetRows);
}

/* Boot */
(function boot(){
  // 日期預設今天
  const dateInput = byId('rec-date');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  // 還原空間
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
  }

  renderPockets(); renderPayers(); renderGroups(); renderItems();
  bindTabs(); bindIOChips(); bindScopeChips();
})();
