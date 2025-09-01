// v17.1（Firebase 版）：多人即時同步；日期+憑證；J+W 平分；轉帳類型；P&L 報表；房間代號共享

// ====== 小工具 ======
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const toast = m => { const t=$('#toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1600); };
const todayStr = () => { const d=new Date(); const mm=('0'+(d.getMonth()+1)).slice(-2), dd=('0'+d.getDate()).slice(-2); return `${d.getFullYear()}-${mm}-${dd}`; };
const uid = () => Math.random().toString(36).slice(2) + Date.now();
const touch = o => (o.updated_at = Date.now(), o);

// ====== 本機快取鍵（離線時可用，啟動時先渲染）======
const K = { ROOM:'cashflow_room', CATS:'cashflow_cats', RECS:'cashflow_records', TRANS:'cashflow_transfers' };

// ====== Firebase 初始化（請換成你自己的設定）======
const firebaseConfig = {
  // ← 把這段換成你 Firebase Console 的 Web App 設定
    databaseURL: "https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app/",
    apiKey: "AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
    authDomain: "cashflow-71391.firebaseapp.com",
    projectId: "cashflow-71391",
    storageBucket: "cashflow-71391.firebasestorage.app",
    messagingSenderId: "204834375477",
    appId: "1:204834375477:web:406dde0ccb0d33a60d2e7c",
    measurementId: "G-G2DVG798M8"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 匿名登入
firebase.auth().signInAnonymously().catch(e=>console.warn('Anon auth error', e));

// ====== 共享代號（房間）======
let ROOM = localStorage.getItem(K.ROOM) || 'jackwal'; // 預設一個代號
$('#room-key') && ($('#room-key').value = ROOM);

function path(p){ return `rooms/${ROOM}/${p}`; }    // 所有資料都放進 /rooms/{room}/... 底下
const R = {
  cats: () => db.ref(path('cats')),
  records: () => db.ref(path('records')),
  transfers: () => db.ref(path('transfers')),
};

// ====== 狀態（先用本機快取渲染，再掛雲端即時監聽）======
const defaultCats = [
  {label:'現場銷售',type:'revenue'},{label:'外送平台',type:'revenue'},{label:'批發/通路',type:'revenue'},{label:'其他收入',type:'revenue'},
  {label:'食材-肉類',type:'cogs'},{label:'食材-蔬果',type:'cogs'},{label:'海鮮',type:'cogs'},{label:'調味/乾貨',type:'cogs'},
  {label:'飲品原料',type:'cogs'},{label:'包材',type:'cogs'},{label:'清潔耗材',type:'cogs'},
  {label:'正職薪資',type:'personnel'},{label:'勞健保',type:'personnel'},{label:'兼職時薪',type:'personnel'},{label:'獎金/三節',type:'personnel'},
  {label:'租金',type:'utilities'},{label:'水費',type:'utilities'},{label:'電費',type:'utilities'},{label:'瓦斯',type:'utilities'},{label:'網路/手機',type:'utilities'},
  {label:'廣告行銷',type:'marketing'},{label:'拍攝設計',type:'marketing'},{label:'活動攤費',type:'marketing'},{label:'外送平台抽成',type:'logistics'},
  {label:'物流運費',type:'logistics'},{label:'記帳/法律',type:'admin'},{label:'設備購置',type:'admin'},{label:'維修',type:'admin'},{label:'工具器具',type:'admin'},
  {label:'稅捐(5%)',type:'tax'},{label:'油資',type:'transport'},{label:'停車',type:'transport'},
  {label:'金流手續費',type:'finance'},{label:'銀行手續費',type:'finance'},{label:'交際應酬',type:'finance'},
  {label:'雜項',type:'misc'}
];

let cats = JSON.parse(localStorage.getItem(K.CATS) || 'null') || defaultCats.slice();
let records = JSON.parse(localStorage.getItem(K.RECS) || '[]');
let transfers = JSON.parse(localStorage.getItem(K.TRANS) || '[]');

// ====== UI：標籤與頁籤 ======
function activateTab(name){ $$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name)); $$('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name)); }
function bindTabs(){ $$('.tab-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab))); }

// ====== 分類：渲染與管理 ======
function buildCatOptions(){
  const sel=$('#r-cat'); if(!sel) return; sel.innerHTML='';
  const groups=['revenue','cogs','personnel','utilities','marketing','logistics','admin','tax','transport','finance','misc'];
  groups.forEach(g=>{
    const og=document.createElement('optgroup'); og.label=g;
    cats.filter(c=>c.type===g).forEach(c=>{
      const o=document.createElement('option'); o.value=c.label; o.textContent=`${c.label} (${c.type})`; og.appendChild(o);
    });
    if(og.children.length) sel.appendChild(og);
  });
}
function renderCatList(){
  const ul=$('#catList'); if(!ul) return; ul.innerHTML='';
  cats.forEach((c,i)=>{
    const li=document.createElement('li'); li.className='cat-item';
    li.innerHTML=`<div><b>${c.label}</b> <span class="muted">(${c.type})</span></div>
      <div><button class="btn-link btn-danger" data-i="${i}" data-act="del">刪除</button></div>`;
    ul.appendChild(li);
  });
}
function bindCatEvents(){
  $('#c-add').addEventListener('click',()=>{
    const label=$('#c-new').value.trim(), type=$('#c-type').value;
    if(!label) return toast('請輸入分類');
    cats.push(touch({id: uid(), label, type}));
    localStorage.setItem(K.CATS, JSON.stringify(cats));
    R.cats().set(cats);
    $('#c-new').value=''; renderCatList(); buildCatOptions();
  });
  $('#catList').addEventListener('click',e=>{
    const b=e.target.closest('button[data-act="del"]'); if(!b) return;
    cats.splice(Number(b.dataset.i),1);
    localStorage.setItem(K.CATS, JSON.stringify(cats));
    R.cats().set(cats);
    renderCatList(); buildCatOptions();
  });
}

// ====== 記帳：儲存（日期、憑證、J+W 平分）與列表 ======
function fileToDataURL(file){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); }); }
async function saveRecord(){
  const date=$('#r-date').value||todayStr();
  const ts=new Date(date+'T00:00:00').getTime();
  const scope=$('#r-scope').value, type=$('#r-type').value, category=$('#r-cat').value;
  const amount=Number($('#r-amount').value||0);
  const note=$('#r-note').value.trim(), merchant=$('#r-merchant').value.trim();
  const reimburse=$('#r-reimburse').checked;
  let receipt_url=''; const f=$('#r-receipt').files[0]; if(f) receipt_url=await fileToDataURL(f);
  if(!amount||!category) return toast('請填金額與分類');

  const pushRec=(s,amt)=>{
    const rec = touch({ id: uid(), ts, date, scope:s, type, category, amount:amt, note, merchant, reimburse, receipt_url });
    records.push(rec);
  };

  if(scope==='personal-JW'){
    const half = Math.round((amount/2)*100)/100;
    pushRec('personal-JACK', half);
    pushRec('personal-WAL', amount-half);
  }else{
    pushRec(scope, amount);
  }

  localStorage.setItem(K.RECS, JSON.stringify(records));
  await R.records().set(records);
  // 清表單
  $('#r-amount').value=''; $('#r-note').value=''; $('#r-merchant').value='';
  $('#r-receipt').value=''; $('#r-preview').src='';
  toast('已記錄'); renderRecordList(); renderPL();
}
function isYearMonth(ts, ym){ const d=new Date(ts); const [y,m]=ym.split('-').map(Number); return d.getFullYear()===y && (d.getMonth()+1)===m; }
function renderRecordList(){
  const ul=$('#recordList'); if(!ul) return;
  const ym=$('#rp-month').value || new Date().toISOString().slice(0,7);
  ul.innerHTML='';
  records.filter(r=>isYearMonth(r.ts,ym)).sort((a,b)=>a.ts-b.ts).forEach(r=>{
    const li=document.createElement('li'); li.className='list-item';
    li.innerHTML=`<div>${r.date}｜${r.scope}｜${r.type}｜${r.category}｜${r.amount}
      ${r.merchant?('｜'+r.merchant):''}${r.note?('｜'+r.note):''}${r.reimburse?'｜報銷':''}</div>
      <div>${r.receipt_url?'<a href="'+r.receipt_url+'" target="_blank">憑證</a>':''}</div>`;
    ul.appendChild(li);
  });
}

// ====== 轉帳：類型、儲存與列表 ======
function saveTransfer(){
  const amount=Number($('#t-amount').value||0); if(!amount) return toast('請填金額');
  const t = touch({
    id: uid(),
    ts: Date.now(),
    kind: $('#t-kind').value, // transfer / repay
    from: $('#t-from').value,
    to: $('#t-to').value,
    amount
  });
  transfers.push(t);
  localStorage.setItem(K.TRANS, JSON.stringify(transfers));
  R.transfers().set(transfers);
  $('#t-amount').value='';
  toast('已建立轉帳'); renderTransferList();
}
function renderTransferList(){
  const ul=$('#transferList'); if(!ul) return;
  const ym=$('#rp-month').value||new Date().toISOString().slice(0,7);
  ul.innerHTML='';
  transfers.filter(t=>isYearMonth(t.ts,ym)).sort((a,b)=>a.ts-b.ts).forEach(t=>{
    const d=new Date(t.ts).toISOString().slice(0,10);
    const tag = t.kind==='repay' ? '還款' : '轉帳';
    const li=document.createElement('li'); li.className='list-item';
    li.innerHTML=`<div>${d}｜<b>[${tag}]</b> ${t.from}→${t.to}｜${t.amount.toLocaleString()}</div>`;
    ul.appendChild(li);
  });
}

// ====== P&L 報表 ======
function renderPL(){
  const ym=$('#rp-month').value || new Date().toISOString().slice(0,7);
  const box=$('#plBox'); if(!box) return;
  const mapType = name => (cats.find(c=>c.label===name)||{}).type || 'misc';
  const month = records.filter(r=>isYearMonth(r.ts,ym));
  let revenue=0, buckets={cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0,tax:0,transport:0,finance:0,misc:0};
  month.forEach(r=>{ const t=mapType(r.category); if(r.type==='income') revenue+=r.amount; else buckets[t]=(buckets[t]||0)+r.amount; });
  const cogs=buckets.cogs||0, gp=revenue-cogs, gm=revenue?(gp/revenue*100):0;
  const opex=(buckets.personnel||0)+(buckets.utilities||0)+(buckets.marketing||0)+(buckets.logistics||0)+(buckets.admin||0)+(buckets.tax||0)+(buckets.transport||0)+(buckets.finance||0)+(buckets.misc||0);
  const net = gp - opex;

  let html = `<div class="kpi">
    <div class="box"><div>Revenue 營收</div><b>${revenue.toLocaleString()}</b></div>
    <div class="box"><div>Gross Profit 毛利</div><b>${gp.toLocaleString()}</b></div>
    <div class="box"><div>Gross Margin 毛利率</div><b>${gm.toFixed(1)}%</b></div>
  </div>
  <table class="table">
    <tr><th>區塊</th><th>金額</th></tr>
    <tr><td><b>Revenue（營收）</b></td><td><b>${revenue.toLocaleString()}</b></td></tr>
    <tr><td>COGS（銷貨成本）</td><td>${cogs.toLocaleString()}</td></tr>
    <tr><td><b>Gross Profit（毛利）</b></td><td><b>${gp.toLocaleString()}</b></td></tr>
    <tr><td>Personnel（人事）</td><td>${(buckets.personnel||0).toLocaleString()}</td></tr>
    <tr><td>Utilities（水電租金）</td><td>${(buckets.utilities||0).toLocaleString()}</td></tr>
    <tr><td>Marketing（行銷）</td><td>${(buckets.marketing||0).toLocaleString()}</td></tr>
    <tr><td>Logistics（物流/抽成）</td><td>${(buckets.logistics||0).toLocaleString()}</td></tr>
    <tr><td>Admin（行政/其他）</td><td>${(buckets.admin||0).toLocaleString()}</td></tr>
    <tr><td>Tax（稅捐）</td><td>${(buckets.tax||0).toLocaleString()}</td></tr>
    <tr><td>Transport（交通）</td><td>${(buckets.transport||0).toLocaleString()}</td></tr>
    <tr><td>Finance（金流/銀行/交際）</td><td>${(buckets.finance||0).toLocaleString()}</td></tr>
    <tr><td>Misc（雜項）</td><td>${(buckets.misc||0).toLocaleString()}</td></tr>
    <tr><td><b>Net Income（淨利）</b></td><td><b>${net.toLocaleString()}</b></td></tr>
  </table>`;

  if($('#rp-subtotal')?.checked){
    const agg={};
    month.forEach(r=>{
      const t=mapType(r.category); const key=(r.type==='income'?'revenue':t);
      if(!agg[key]) agg[key]={};
      agg[key][r.category]=(agg[key][r.category]||0)+(r.type==='income'?-r.amount:r.amount);
    });
    html+='<hr><b>小計（同類彙總）</b>';
    Object.keys(agg).forEach(group=>{
      html+=`<h4>${group}</h4><ul>`;
      Object.entries(agg[group]).forEach(([k,v])=>{ html+=`<li>${k}：${v.toLocaleString()}</li>`; });
      html+='</ul>';
    });
  }
  if($('#rp-expand')?.checked){
    html+='<hr><b>明細</b><ul>';
    month.forEach(r=> html+=`<li>${r.date}｜${r.scope}｜${r.type}｜${r.category}｜${r.amount}${r.merchant?('｜'+r.merchant):''}${r.note?('｜'+r.note):''}${r.reimburse?'｜報銷':''}${r.receipt_url?'｜<a href="'+r.receipt_url+'" target="_blank">憑證</a>':''}</li>`);
    html+='</ul>';
  }
  box.innerHTML = html;
}

// ====== 房間（共享代號）切換 ======
async function applyRoom(){
  const v = ($('#room-key').value || '').trim();
  if(!v) return toast('請輸入共享代號');
  ROOM = v;
  localStorage.setItem(K.ROOM, ROOM);
  toast(`已切換到共享代號：${ROOM}`);
  // 重新掛載即時監聽
  unbindRealtime();
  bindRealtime();
}

// ====== 即時監聽（Firebase）======
let offFns = [];
function unbindRealtime(){
  offFns.forEach(fn=>fn&&fn()); offFns = [];
}
function bindRealtime(){
  // cats
  const offCats = R.cats().on('value', s=>{
    const v = s.val();
    if(v){ cats = v; localStorage.setItem(K.CATS, JSON.stringify(cats)); buildCatOptions(); renderCatList(); }
    else { // 雲端沒資料就寫入預設
      cats = cats && cats.length ? cats : defaultCats.slice();
      R.cats().set(cats);
    }
  });
  // records
  const offRecs = R.records().on('value', s=>{
    records = s.val() || []; localStorage.setItem(K.RECS, JSON.stringify(records)); renderRecordList(); renderPL();
  });
  // transfers
  const offTrans = R.transfers().on('value', s=>{
    transfers = s.val() || []; localStorage.setItem(K.TRANS, JSON.stringify(transfers)); renderTransferList();
  });
  offFns = [ ()=>R.cats().off('value', offCats), ()=>R.records().off('value', offRecs), ()=>R.transfers().off('value', offTrans) ];
}

// ====== 快取/SW 控制 ======
async function clearCacheOnly(){
  if(!confirm('清快取（不刪除記帳資料）？')) return;
  try{
    if(caches){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
    if(navigator.serviceWorker){ const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister())); }
    toast('已清快取與 SW，請重新整理');
  }catch(e){ toast('清快取失敗'); }
}
async function wipeAllData(){
  if(!confirm('⚠️ 確認刪除「本機所有資料」？（含記帳/分類/轉帳）\n※ 雲端資料不會自動刪除')) return;
  localStorage.clear();
  if(indexedDB && indexedDB.databases){ const dbs=await indexedDB.databases(); for(const db of dbs){ if(db.name) try{ indexedDB.deleteDatabase(db.name);}catch(_){}}}
  if(caches){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
  if(navigator.serviceWorker){ const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister())); }
  location.reload();
}

// ====== 初始化 ======
document.addEventListener('DOMContentLoaded', ()=>{
  // tabs & default UI
  bindTabs(); activateTab('record');
  $('#r-date').value = todayStr();
  buildCatOptions(); renderCatList(); renderRecordList(); renderTransferList(); renderPL();

  // 記帳上傳憑證預覽
  $('#r-receipt').addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return; const url=await fileToDataURL(f); $('#r-preview').src=url;
  });

  // 動作事件
  $('#r-save').addEventListener('click', saveRecord);
  $('#t-save').addEventListener('click', saveTransfer);
  $('#rp-month').value = new Date().toISOString().slice(0,7);
  $('#rp-month').addEventListener('change', ()=>{ renderRecordList(); renderTransferList(); renderPL(); });
  $('#rp-expand').addEventListener('change', renderPL);
  $('#rp-subtotal').addEventListener('change', renderPL);

  // 分類管理
  bindCatEvents();

  // 快取/資料
  $('#btn-clear-cache').addEventListener('click', clearCacheOnly);
  $('#btn-wipe-all').addEventListener('click', wipeAllData);

  // 房間切換
  $('#room-apply').addEventListener('click', applyRoom);

  // 掛即時監聽
  bindRealtime();
});
