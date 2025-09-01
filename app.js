// v17：日期 + 憑證拍照、J+W 平分、轉帳清單、月份 P&L
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const K = { CATS:'cashflow_cats', RECS:'cashflow_records', TRANS:'cashflow_transfers', QUICK:'cashflow_quicks' };

const todayStr = () => {
  const d = new Date();
  const mm = ('0' + (d.getMonth()+1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear()+'-'+mm+'-'+dd;
};
const toast = m => {
  const t=$('#toast'); t.textContent=m; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1600);
};
function activateTab(name){
  $$('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  $$('.tab-pane').forEach(p=>p.classList.toggle('active', p.id==='tab-'+name));
}
function bindTabs(){ $$('.tab-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab))); }

const defaultCats=[
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
const load=(k,f)=>{try{const s=localStorage.getItem(k);return s?JSON.parse(s):f}catch(e){return f}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

let cats=load(K.CATS, defaultCats.slice());
let records=load(K.RECS, []);
let transfers=load(K.TRANS, []);
let quicks=load(K.QUICK, []);

// ---------- Category ----------
function buildCatOptions(){
  const sel=$('#r-cat'); sel.innerHTML='';
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
  const ul=$('#catList'); ul.innerHTML='';
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
    cats.push({label,type}); save(K.CATS,cats);
    $('#c-new').value=''; renderCatList(); buildCatOptions();
  });
  $('#catList').addEventListener('click',e=>{
    const b=e.target.closest('button[data-act="del"]'); if(!b) return;
    cats.splice(Number(b.dataset.i),1); save(K.CATS,cats);
    renderCatList(); buildCatOptions();
  });
}

// ---------- Record ----------
function fileToDataURL(file){return new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(file);});}
async function saveRecord(){
  const date=$('#r-date').value||todayStr();
  const ts=new Date(date+'T00:00:00').getTime();
  const scope=$('#r-scope').value, type=$('#r-type').value, category=$('#r-cat').value;
  const amount=Number($('#r-amount').value||0);
  const note=$('#r-note').value.trim(), merchant=$('#r-merchant').value.trim();
  const reimburse=$('#r-reimburse').checked;
  let receipt_url=''; const f=$('#r-receipt').files[0]; if(f) receipt_url=await fileToDataURL(f);
  if(!amount||!category) return toast('請填金額與分類');

  const pushRec=(s,amt)=>records.push({ts,date,scope:s,type,category,amount:amt,note,merchant,reimburse,receipt_url});
  if(scope==='personal-JW'){
    const half=Math.round((amount/2)*100)/100;
    pushRec('personal-JACK', half); pushRec('personal-WAL', amount-half);
  }else pushRec(scope, amount);
  save(K.RECS,records);
  $('#r-amount').value=''; $('#r-note').value=''; $('#r-merchant').value='';
  $('#r-receipt').value=''; $('#r-preview').src='';
  toast('已記錄'); renderRecordList(); renderPL();
}
function renderRecordList(){
  const ym=$('#rp-month').value || new Date().toISOString().slice(0,7);
  const ul=$('#recordList'); ul.innerHTML='';
  records.filter(r=>isYearMonth(r.ts,ym)).sort((a,b)=>a.ts-b.ts).forEach(r=>{
    const li=document.createElement('li'); li.className='list-item';
    li.innerHTML=`<div>${r.date}｜${r.scope}｜${r.type}｜${r.category}｜${r.amount}
    ${r.merchant?('｜'+r.merchant):''}${r.note?('｜'+r.note):''}</div>
    <div>${r.receipt_url?'<a href="'+r.receipt_url+'" target="_blank">憑證</a>':''}</div>`;
    ul.appendChild(li);
  });
}

// ---------- Transfer ----------
function saveTransfer(){
  const amount=Number($('#t-amount').value||0); if(!amount) return toast('請填金額');
  const t={ts:Date.now(),from:$('#t-from').value,to:$('#t-to').value,amount};
  transfers.push(t); save(K.TRANS,transfers); $('#t-amount').value='';
  toast('已建立轉帳'); renderTransferList();
}
function renderTransferList(){
  const ym=$('#rp-month').value||new Date().toISOString().slice(0,7);
  const ul=$('#transferList'); ul.innerHTML='';
  transfers.filter(t=>isYearMonth(t.ts,ym)).sort((a,b)=>a.ts-b.ts).forEach(t=>{
    const d=new Date(t.ts).toISOString().slice(0,10);
    const li=document.createElement('li'); li.className='list-item';
    li.innerHTML=`<div>${d}｜${t.from}→${t.to}｜${t.amount}</div>`;
    ul.appendChild(li);
  });
}

// ---------- Report ----------
function isYearMonth(ts,ym){ const d=new Date(ts); const [y,m]=ym.split('-').map(Number); return d.getFullYear()===y && d.getMonth()+1===m; }
function renderPL(){
  const ym=$('#rp-month').value || new Date().toISOString().slice(0,7);
  const box=$('#plBox'), month=records.filter(r=>isYearMonth(r.ts,ym));
  const mapType = name=>(cats.find(c=>c.label===name)||{}).type||'misc';
  let revenue=0, buckets={cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0,tax:0,transport:0,finance:0,misc:0};
  month.forEach(r=>{const t=mapType(r.category); if(r.type==='income') revenue+=r.amount; else buckets[t]=(buckets[t]||0)+r.amount;});
  const cogs=buckets.cogs||0, gp=revenue-cogs, gm=revenue?(gp/revenue*100):0;
  const opex=Object.entries(buckets).reduce((a,[,v])=>a+v,0)-cogs; const net=gp-opex;
  let html=`<div class="kpi">
    <div class="box"><div>Revenue 營收</div><b>${revenue.toLocaleString()}</b></div>
    <div class="box"><div>Gross Profit 毛利</div><b>${gp.toLocaleString()}</b></div>
    <div class="box"><div>Gross Margin 毛利率</div><b>${gm.toFixed(1)}%</b></div>
  </div>`;
  html+=`<table class="table">
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
  <tr><td><b>Net Income（淨利）</b></td><td><b>${net.toLocaleString()}</b></td></tr></table>`;
  if($('#rp-subtotal').checked){
    const agg={}; month.forEach(r=>{const t=mapType(r.category);const key=(r.type==='income'?'revenue':t); if(!agg[key]) agg[key]={}; agg[key][r.category]=(agg[key][r.category]||0)+(r.type==='income'?-r.amount:r.amount);});
    html+='<hr><b>小計（同類彙總）</b>'; Object.keys(agg).forEach(g=>{html+=`<h4>${g}</h4><ul>`; Object.entries(agg[g]).forEach(([k,v])=>html+=`<li>${k}：${v.toLocaleString()}</li>`); html+='</ul>';});
  }
  if($('#rp-expand').checked){
    html+='<hr><b>明細</b><ul>'; month.forEach(r=> html+=`<li>${r.date}｜${r.scope}｜${r.type}｜${r.category}｜${r.amount}${r.merchant?('｜'+r.merchant):''}${r.note?('｜'+r.note):''}${r.reimburse?'｜報銷':''}${r.receipt_url?'｜<a href="'+r.receipt_url+'" target="_blank">憑證</a>':''}</li>`); html+='</ul>';
  }
  box.innerHTML=html;
}

// ---------- Reset ----------
async function resetAll(){
  if(!confirm('⚠️ 確定要刪除本機所有資料嗎？')) return;
  localStorage.clear();
  if(indexedDB && indexedDB.databases){const dbs=await indexedDB.databases(); for(const db of dbs){if(db.name) try{indexedDB.deleteDatabase(db.name);}catch(_){}}}
  if(caches){const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
  if(navigator.serviceWorker){const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister()));}
  location.reload();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded',()=>{
  bindTabs(); activateTab('record');
  $('#r-date').value=todayStr(); buildCatOptions(); renderCatList(); bindCatEvents();
  $('#r-receipt').addEventListener('change',async e=>{const f=e.target.files[0]; if(!f)return; const url=await fileToDataURL(f); $('#r-preview').src=url;});
  $('#r-save').addEventListener('click',saveRecord);
  $('#t-save').addEventListener('click',saveTransfer);
  const ym=new Date().toISOString().slice(0,7); $('#rp-month').value=ym;
  $('#rp-month').addEventListener('change',()=>{renderRecordList(); renderTransferList(); renderPL();});
  $('#rp-expand').addEventListener('change',renderPL);
  $('#rp-subtotal').addEventListener('change',renderPL);
  $('#btn-reset').addEventListener('click',resetAll);
  renderRecordList(); renderTransferList(); renderPL();
});
