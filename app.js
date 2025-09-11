// v4.02 修補 4025：分頁切換強化、iOS 日期/小豬、圓餅圖自適應與色票維持
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

/* utils */
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
const byId=id=>document.getElementById(id);
const money=n=>(Number(n)||0).toLocaleString('zh-TW');
const todayISO=()=>{const d=new Date();const m=String(d.getMonth()+1).padStart(2,'0');const dd=String(d.getDate()).padStart(2,'0');return `${d.getFullYear()}-${m}-${dd}`};

const state={space:localStorage.getItem('CF_SPACE')||"",io:"expense",scope:"restaurant",
  group:"",item:"",payer:"J",pocket:"restaurant",catalog:[],catalogIndex:null};
let allRecordsCache=[];

/* 色票（圓餅） */
const PAL_OPEX=['#4cc9f0','#4361ee','#3a0ca3','#b5179e','#f72585'];
const PAL_PERS=['#84dcc6','#a0ced9','#cfbaf0','#ffc8dd','#ffafcc','#b9fbc0','#f1fa8c','#ffd6a5'];

/* 群組/圖示 */
const REST_GROUPS=['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
const PERS_INCOME_GROUPS=['薪資收入','投資獲利','其他收入'];
const PERS_EXPENSE_GROUPS=['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];
const GROUP_ICON_MAP={'營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠','行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
  '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁','飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚','娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'};
function groupsFor(io,scope){if(scope==='restaurant')return(io==='income')?['營業收入']:REST_GROUPS.filter(g=>g!=='營業收入');return(io==='income')?PERS_INCOME_GROUPS:PERS_EXPENSE_GROUPS;}
function normalizeKind(k){if(!k)return'';if(k==='餐廳收入')return'營業收入';if(k==='其他')return'其他支出';const alias={'水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務'};return alias[k]||k;}

/* Catalog */
function buildCatalogIndex(raw){
  const flat=Array.isArray(raw)?raw:[].concat(raw?.categories?.restaurant||[],raw?.categories?.personal||[],raw?.categories||[]);
  const by={restaurant:[],personal:[]};
  (flat||[]).forEach(x=>{
    const item={id:x.id||x.label,label:x.label||x.id,kind:normalizeKind(x.kind),icon:x.icon||''};
    if(REST_GROUPS.includes(item.kind))by.restaurant.push(item);else by.personal.push(item);
  });
  state.catalogIndex=by;
}
function categoriesFor(scope,group){
  const pool=scope==='restaurant'?(state.catalogIndex?.restaurant||[]):(state.catalogIndex?.personal||[]);
  return pool.filter(c=>c.kind===group);
}

/* room & catalog */
async function ensureRoom(){const r=db.ref(`rooms/${state.space}`);const s=await r.get();if(!s.exists())await r.set({_ts:Date.now()});}
async function ensureCatalog(){
  const base=db.ref(`rooms/${state.space}/catalog`);const s=await base.get();
  state.catalog=s.exists()?s.val():[]; if(!s.exists()) await base.set(state.catalog);
  buildCatalogIndex(state.catalog); renderGroups(); renderItems();
}

/* 口袋 */
const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
function renderPockets(){
  const host=byId('pockets-row'); if(!host) return;
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
      <svg class="pig" viewBox="0 0 167 139" aria-hidden="true"><use href="#pig-icon"></use></svg>
      <div class="badge" id="amt-${p.key}">0</div>
      <div class="name">${p.name}</div>
    </button>`).join('');
  if(!state.pocket) state.pocket='restaurant'; setActivePocket(state.pocket);
  host.onclick=e=>{const btn=e.target.closest('[data-pocket]'); if(!btn) return; setActivePocket(btn.dataset.pocket);};
}
function setActivePocket(key){
  state.pocket=key;
  $$('#pockets-row .pocket').forEach(el=>{const on=el.dataset.pocket===key; el.classList.toggle('active',on); el.setAttribute('aria-pressed',on?'true':'false');});
}
function updatePocketAmountsFromRecords(records){
  const bal={restaurant:0,jack:0,wal:0};
  for(const r of records){const d=(r.io==='income'?1:-1)*(Number(r.amount||r.amt)||0); if(r.pocket && bal[r.pocket]!=null) bal[r.pocket]+=d;}
  for(const p of POCKETS){const el=byId(`amt-${p.key}`); if(!el) continue; const v=bal[p.key]||0; el.textContent=(v||0).toLocaleString('zh-TW');
    const card=el.closest('.pocket'); card.classList.toggle('negative',v<0); card.classList.toggle('positive',v>0);}
}

/* Payers */
function renderPayers(){
  const row=byId('payers-row'); if(!row) return;
  const data=[{key:'J',label:'J',icon:'👤'},{key:'W',label:'W',icon:'👤'},{key:'JW',label:'JW',icon:'👥'}];
  row.innerHTML=data.map(x=>`<button class="chip lg ${x.key==='J'?'active':''}" data-payer="${x.key}">
      <span class="emoji">${x.icon}</span><span class="label">${x.label}</span></button>`).join('');
  state.payer='J';
  row.onclick=e=>{const btn=e.target.closest('[data-payer]'); if(!btn) return; $$('#payers-row .chip').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.payer=btn.dataset.payer;};
}

/* Groups & Items */
function renderGroups(){
  const box=byId('group-grid'); if(!box) return;
  box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
    const icon=GROUP_ICON_MAP[g]||''; 
    return `<button class="chip" data-group="${g}"><span class="emoji">${icon}</span><span class="label">${g}</span></button>`;
  }).join('');
  state.group='';
  box.onclick=e=>{const btn=e.target.closest('[data-group]'); if(!btn) return; $$('#group-grid .active').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.group=btn.dataset.group; state.item=''; renderItems();};
}
function renderItems(){
  const box=byId('items-grid'); if(!box) return;
  if(!state.group){box.innerHTML=`<div class="muted">（請先選類別）</div>`; return;}
  const items=categoriesFor(state.scope,state.group);
  box.innerHTML=items.map(it=>{
    const icon=it.icon?`<span class="emoji">${it.icon}</span>`:''; 
    return `<button class="chip" data-item="${it.label}">${icon}<span class="label">${it.label}</span></button>`;
  }).join('')||`<div class="muted">（暫無項目，可下方建立）</div>`;
  box.onclick=e=>{const btn=e.target.closest('[data-item]'); if(!btn) return; $$('#items-grid .active').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.item=btn.dataset.item;};
}

/* 新增項目 */
byId('btn-add-cat')?.addEventListener('click', addItemToCatalog);
async function addItemToCatalog(){
  const input=byId('new-cat-name'); if(!input) return;
  const name=(input.value||'').trim(); if(!name) return alert('請輸入名稱');
  if(!state.space||!state.group) return alert('請先連線並選類別');
  const base=db.ref(`rooms/${state.space}/catalog`); const s=await base.get();
  let cat=s.exists()?s.val():[]; if(!Array.isArray(cat)){cat=[].concat(cat.categories?.restaurant||[],cat.categories?.personal||[],cat.categories||[]);}
  let icon='',label=name; const m=name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.+)$/u); if(m){icon=m[1];label=m[2].trim();}
  cat.push({id:label,label,kind:state.group,icon}); await base.set(cat);
  state.catalog=cat; buildCatalogIndex(cat); input.value=''; renderItems();
}

/* 監看紀錄 */
function watchRecentAndBalances(){
  const list=byId('recent-list'); if(!list) return;
  const refRec=db.ref(`rooms/${state.space}/records`);
  refRec.on('value', snap=>{
    const arr=[]; snap.forEach(ch=>arr.push(ch.val())); allRecordsCache=arr.slice();
    const d=new Date(); const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const rows=arr.filter(r=>(r.date||'').startsWith(ym)).sort((a,b)=>(b.ts||0)-(a.ts||0));
    list.innerHTML=rows.map(r=>{
      const dstr=(r.date||'').slice(0,10)||new Date(r.ts).toISOString().slice(0,10);
      const sign=r.io==='expense'?'-':'+';
      return `<div class="row"><div class="r-date">${dstr}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group||''}${r.item?'・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount||r.amt)}</div></div>`;
    }).join('')||`<div class="muted">（本月無紀錄）</div>`;
    updatePocketAmountsFromRecords(arr); renderReports();
  });
}

/* 送出 */
byId('btn-submit')?.addEventListener('click', async ()=>{
  if(!state.space) return alert('請先連線');
  const amtRaw=(byId('rec-amt')?.value||'').replace(/[^\d.-]/g,''); const amt=Number(amtRaw)||0; if(!amt) return alert('請輸入金額');
  if(!state.pocket||!state.payer) return alert('請選口袋與付款人/收款人');
  const newName=(byId('new-cat-name')?.value||'').trim(); if(newName && state.group){ await addItemToCatalog(); }
  const dateStr=byId('rec-date')?.value||todayISO(); const ts=Date.parse(dateStr)||Date.now(); const note=byId('rec-note')?.value||'';
  const rec={ts,date:dateStr,amount:amt,io:state.io,scope:state.scope,group:state.group,item:state.item,payer:state.payer,pocket:state.pocket,note};
  const room=db.ref(`rooms/${state.space}`); const id=room.child('records').push().key;
  const updates={}; updates[`records/${id}`]=rec;
  updates[`balances/${state.pocket}`]=firebase.database.ServerValue.increment((state.io==='income'?1:-1)*amt);
  await room.update(updates); byId('rec-amt').value=''; byId('rec-note').value='';
});

/* Tabs / IO / Scope */
function bindTabs(){
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      $$('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const target=tab.getAttribute('data-target');
      $$('.page').forEach(p=>p.classList.remove('show'));
      byId(target)?.classList.add('show');
      if(target==='page-biz'||target==='page-personal'||target==='page-budget') renderReports();
    });
  });
}
function bindIOChips(){
  const group=byId('chip-io'); if(!group) return;
  group.addEventListener('click',e=>{
    const btn=e.target.closest('[data-io]'); if(!btn) return;
    $$('#chip-io .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.io=btn.dataset.io; renderGroups(); renderItems();
  });
}
function bindScopeChips(){
  const group=byId('chip-scope'); if(!group) return;
  group.addEventListener('click',e=>{
    const btn=e.target.closest('[data-scope]'); if(!btn) return;
    $$('#chip-scope .chip').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); state.scope=btn.dataset.scope; state.group=''; state.item=''; renderGroups(); renderItems();
  });
}

/* 報表 / 圖表 */
const ro=new ResizeObserver(entries=>{
  for(const e of entries){
    const cvs=e.target.matches?.('.auto-canvas')?e.target:e.target.querySelector?.('.auto-canvas'); if(!cvs) continue;
    const w=Math.max(240,Math.floor(e.contentRect.width)); const h=Math.floor(w*0.66);
    const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
    cvs.width=Math.floor(w*dpr); cvs.height=Math.floor(h*dpr); cvs.style.width=w+'px'; cvs.style.height=h+'px';
  }
  renderReports();
});
function observeCanvas(){ $$('.auto-canvas').forEach(c=> ro.observe(c.parentElement)); }

function currentMonthPrefix(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
const sum=a=>a.reduce((x,y)=>x+(Number(y)||0),0);
const filterMonth=(recs,ym)=>recs.filter(r=>(r.date||'').startsWith(ym));
function groupSumBy(records,key){const m=new Map(); for(const r of records){const k=r[key]||''; m.set(k,(m.get(k)||0)+(Number(r.amount||r.amt)||0)*(r.io==='expense'?-1:1));} return m;}

function buildBizPL(monthRecs){
  const rs=monthRecs.filter(r=>r.scope==='restaurant');
  const income=rs.filter(r=>r.io==='income'&&(r.group==='營業收入'||r.group===''));
  const byGroup=new Map(); for(const g of REST_GROUPS){byGroup.set(g,0);}
  for(const r of rs){const g=r.group||(r.io==='income'?'營業收入':'其他'); const v=(Number(r.amount||r.amt)||0)*(r.io==='expense'?-1:1); if(!byGroup.has(g)) byGroup.set(g,0); byGroup.set(g,byGroup.get(g)+v);}
  const revenue=sum(income.map(x=>Number(x.amount||x.amt)||0));
  const cogs=Math.abs(byGroup.get('銷貨成本')||0);
  const opexGroups=['人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
  const opex=Math.abs(opexGroups.reduce((t,g)=>t+(byGroup.get(g)||0),0));
  const grossProfit=revenue-cogs; const operatingProfit=grossProfit-opex;
  return {byGroup,revenue,cogs,opex,grossProfit,operatingProfit};
}
function buildPersonalPL(monthRecs){
  const ps=monthRecs.filter(r=>r.scope==='personal');
  const income=ps.filter(r=>r.io==='income'); const expense=ps.filter(r=>r.io==='expense');
  const byIncome=groupSumBy(income,'group'); const byExpense=groupSumBy(expense,'group');
  const incomeTotal=sum(income.map(x=>Number(x.amount||x.amt)||0));
  const expenseTotal=sum(expense.map(x=>Number(x.amount||x.amt)||0));
  const net=incomeTotal-expenseTotal; return {byIncome,byExpense,incomeTotal,expenseTotal,net};
}
function drawPie(canvas,labels,values,palette){
  if(!canvas) return;
  const ctx=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W,H);
  const cx=W/2,cy=H/2,r=Math.min(W,H)*0.36; const total=values.reduce((a,b)=>a+(Number(b)||0),0)||1;
  let start=-Math.PI/2;
  for(let i=0;i<values.length;i++){const v=Number(values[i])||0; if(v<=0) continue; const ang=(v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,start+ang); ctx.closePath(); ctx.fillStyle=palette[i%palette.length]; ctx.fill(); start+=ang;}
  // legend
  const dpr=Math.max(1,window.devicePixelRatio||1); const x=16*dpr; let y=16*dpr; ctx.font=`${Math.round(12*dpr)}px system-ui`;
  for(let i=0;i<labels.length;i++){ctx.fillStyle=palette[i%palette.length]; ctx.fillRect(x,y-10*dpr,12*dpr,12*dpr);
    ctx.fillStyle='#e6eef0'; ctx.fillText(`${labels[i]}  ${Math.round(values[i]||0).toLocaleString('zh-TW')}`, x+16*dpr, y+1); y+=18*dpr;}
}
function renderPLTable(host,rows){
  if(!host) return; host.innerHTML=`<table>
    <thead><tr><th>項目</th><th class="amt">金額</th></tr></thead>
    <tbody>${rows.map(r=>{const v=Number(r.value)||0; const s=v>=0?'pos':'neg'; return `<tr class="${r.class||''}"><td>${r.label}</td><td class="amt ${s}">${money(v)}</td></tr>`;}).join('')}</tbody>
  </table>`;
}
function renderReports(){
  const ym=currentMonthPrefix(); const monthRecs=filterMonth(allRecordsCache,ym);
  const biz=buildBizPL(monthRecs);
  renderPLTable(byId('biz-pl'),[
    {label:'營業收入',value:biz.revenue,class:'total'},
    {label:'銷貨成本（COGS）',value:-biz.cogs},
    {label:'毛利',value:biz.grossProfit,class:'total'},
    {label:'人事',value:-(Math.abs(biz.byGroup.get('人事')||0))},
    {label:'水電/租金/網路',value:-(Math.abs(biz.byGroup.get('水電/租金/網路')||0))},
    {label:'行銷',value:-(Math.abs(biz.byGroup.get('行銷')||0))},
    {label:'物流/運輸',value:-(Math.abs(biz.byGroup.get('物流/運輸')||0))},
    {label:'行政/稅務',value:-(Math.abs(biz.byGroup.get('行政/稅務')||0))},
    {label:'營業利益',value:biz.operatingProfit,class:'total'}
  ]);
  const opexLbl=['人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
  const opexVal=opexLbl.map(g=>Math.abs(biz.byGroup.get(g)||0));
  drawPie(byId('biz-pie'), opexLbl, opexVal, PAL_OPEX);

  const per=buildPersonalPL(monthRecs);
  renderPLTable(byId('pers-pl'),[
    {label:'收入合計',value:per.incomeTotal,class:'total'},
    ...PERS_INCOME_GROUPS.map(g=>({label:`收入：${g}`,value:Math.abs(per.byIncome.get(g)||0)})),
    {label:'支出合計',value:-per.expenseTotal,class:'total'},
    ...PERS_EXPENSE_GROUPS.map(g=>({label:`支出：${g}`,value:-(Math.abs(per.byExpense.get(g)||0))})),
    {label:'本月結餘',value:per.net,class:'total'}
  ]);
  const expLbl=PERS_EXPENSE_GROUPS; const expVal=expLbl.map(g=>Math.abs(per.byExpense.get(g)||0));
  drawPie(byId('pers-pie'), expLbl, expVal, PAL_PERS);

  renderPLTable(byId('budget-summary'),[
    {label:'餐廳：營業收入（本月）',value:biz.revenue,class:'total'},
    {label:'餐廳：營運費用合計（本月）',value:-biz.opex},
    {label:'餐廳：營業利益（本月）',value:biz.operatingProfit,class:'total'},
    {label:'個人：收入合計（本月）',value:per.incomeTotal,class:'total'},
    {label:'個人：支出合計（本月）',value:-per.expenseTotal},
    {label:'個人：本月結餘',value:per.net,class:'total'}
  ]);
}

/* Boot */
(function boot(){
  const dateInput=byId('rec-date'); if(dateInput && !dateInput.value) dateInput.value=todayISO();

  // 只讓第一個分頁可見
  $$('.page').forEach(p=>p.classList.remove('show')); byId('page-rec')?.classList.add('show');

  if(state.space){
    byId('space-code').value=state.space;
    ensureRoom().then(ensureCatalog).then(()=>{
      renderPockets(); renderPayers(); watchRecentAndBalances();
      byId('btn-connect').textContent='連線中'; byId('btn-connect').classList.add('success'); byId('btn-connect').classList.remove('danger');
    });
  }else{
    byId('btn-connect')?.classList.add('danger'); byId('btn-connect').textContent='未連線';
    renderPockets(); renderPayers();
  }

  renderGroups(); renderItems(); bindTabs(); bindIOChips(); bindScopeChips();
  observeCanvas(); // 圓餅圖自動調整
})();
