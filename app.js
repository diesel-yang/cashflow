// v16.9：完整 P&L（Revenue/COGS/Gross Profit/各費用/Net Income）
const $ = s=>document.querySelector(s), $$ = s=>document.querySelectorAll(s);
const toast = (m)=>{ const t=$('#toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1600); };
function activateTab(name){ $$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name)); $$('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name)); }
function bindTabs(){ $$('.tab-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab))); activateTab('report'); }

const K={CATS:'cashflow_cats',QUICK:'cashflow_quicks',RECS:'cashflow_records',TRANS:'cashflow_transfers'};

const defaultCats=[
  {label:'現場銷售',type:'revenue'},{label:'外送平台',type:'revenue'},{label:'批發/通路',type:'revenue'},{label:'其他收入',type:'revenue'},
  {label:'食材-肉類',type:'cogs'},{label:'食材-蔬果',type:'cogs'},{label:'海鮮',type:'cogs'},{label:'調味/乾貨',type:'cogs'},
  {label:'飲品原料',type:'cogs'},{label:'包材',type:'cogs'},{label:'清潔耗材',type:'cogs'},
  {label:'正職薪資',type:'personnel'},{label:'勞健保',type:'personnel'},{label:'獎金/三節',type:'personnel'},{label:'兼職時薪',type:'personnel'},
  {label:'租金',type:'utilities'},{label:'水費',type:'utilities'},{label:'電費',type:'utilities'},{label:'瓦斯',type:'utilities'},{label:'網路/手機',type:'utilities'},
  {label:'廣告行銷',type:'marketing'},{label:'拍攝設計',type:'marketing'},{label:'活動攤費',type:'marketing'},{label:'外送平台抽成',type:'logistics'},
  {label:'物流運費',type:'logistics'},
  {label:'記帳/法律',type:'admin'},{label:'設備購置',type:'admin'},{label:'維修',type:'admin'},{label:'工具器具',type:'admin'},
  {label:'稅捐(5%)',type:'tax'},
  {label:'油資',type:'transport'},{label:'停車',type:'transport'},
  {label:'金流手續費',type:'finance'},{label:'銀行手續費',type:'finance'},{label:'交際應酬',type:'finance'},
  {label:'雜項',type:'misc'}
];
const load=(k,f)=>{try{const s=localStorage.getItem(k);return s?JSON.parse(s):f}catch(e){return f}}, save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
let cats=load(K.CATS,defaultCats.slice()), quicks=load(K.QUICK,[]), records=load(K.RECS,[]), transfers=load(K.TRANS,[]);

function buildCatOptions(){
  const sel=$('#r-cat'); sel.innerHTML='';
  const groups=['revenue','cogs','personnel','utilities','marketing','logistics','admin','tax','transport','finance','misc'];
  groups.forEach(g=>{ const og=document.createElement('optgroup'); og.label=g; cats.filter(c=>c.type===g).forEach(c=>{const o=document.createElement('option');o.value=c.label;o.textContent=`${c.label} (${c.type})`;og.appendChild(o)}); if(og.children.length) sel.appendChild(og); });
}
function renderCatList(){ const ul=$('#catList'); if(!ul) return; ul.innerHTML=''; cats.forEach((c,i)=>{const li=document.createElement('li');li.className='cat-item';li.innerHTML=`<div><b>${c.label}</b> <span class="muted">(${c.type})</span></div><div><button class='btn-link btn-danger' data-i='${i}' data-act='del'>刪除</button></div>`; ul.appendChild(li);}); }
function bindCatEvents(){ const add=$('#c-add'); if(!add) return; add.addEventListener('click',()=>{const label=$('#c-new').value.trim(); const type=$('#c-type').value; if(!label) return toast('請輸入分類'); cats.push({label,type}); save(K.CATS,cats); $('#c-new').value=''; renderCatList(); buildCatOptions();}); $('#catList').addEventListener('click',e=>{const b=e.target.closest('button[data-act="del"]'); if(!b) return; cats.splice(Number(b.dataset.i),1); save(K.CATS,cats); renderCatList(); buildCatOptions();}); }

function saveRecord(){
  const rec={ts:Date.now(), scope:$('#r-scope').value, type:$('#r-type').value, category:$('#r-cat').value, amount:Number($('#r-amount').value||0), note:$('#r-note').value.trim(), reimburse:$('#r-reimburse').checked};
  if(!rec.amount||!rec.category) return toast('請填金額與分類');
  records.push(rec); save(K.RECS,records); $('#r-amount').value=''; $('#r-note').value=''; $('#r-reimburse').checked=false; toast('已記錄'); renderPL();
}
function saveTransfer(){ const t={ts:Date.now(),from:$('#t-from').value,to:$('#t-to').value,amount:Number($('#t-amount').value||0)}; if(!t.amount) return toast('請填金額'); transfers.push(t); save(K.TRANS,transfers); $('#t-amount').value=''; toast('已建立轉帳'); }

function isSameMonth(ts){ const d=new Date(ts), n=new Date(); return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth(); }

function renderPL(){
  const box=$('#plBox'); const month=records.filter(r=>isSameMonth(r.ts));
  const mapType = name => (cats.find(c=>c.label===name)||{}).type || 'misc';
  let revenue=0, buckets={cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0,tax:0,transport:0,finance:0,misc:0};
  month.forEach(r=>{
    const t=mapType(r.category);
    if(r.type==='income'){ revenue+=r.amount; }
    else { if(buckets[t]==null) buckets[t]=0; buckets[t]+=r.amount; }
  });
  const cogs=buckets.cogs||0;
  const grossProfit = revenue - cogs;
  const grossMargin = revenue ? (grossProfit/revenue*100) : 0;
  const opex = (buckets.personnel||0)+(buckets.utilities||0)+(buckets.marketing||0)+(buckets.logistics||0)+(buckets.admin||0)+(buckets.tax||0)+(buckets.transport||0)+(buckets.finance||0)+(buckets.misc||0);
  const netIncome = grossProfit - opex;

  let html = `<div class="kpi">
    <div class="box"><div>Revenue 營收</div><b>${revenue.toLocaleString()}</b></div>
    <div class="box"><div>Gross Profit 毛利</div><b>${grossProfit.toLocaleString()}</b></div>
    <div class="box"><div>Gross Margin 毛利率</div><b>${grossMargin.toFixed(1)}%</b></div>
  </div>`;

  html += `<table class="table">
    <tr><th>區塊</th><th>金額</th></tr>
    <tr><td><b>Revenue（營收）</b></td><td><b>${revenue.toLocaleString()}</b></td></tr>
    <tr><td>COGS（銷貨成本）</td><td>${cogs.toLocaleString()}</td></tr>
    <tr><td><b>Gross Profit（毛利）</b></td><td><b>${grossProfit.toLocaleString()}</b></td></tr>
    <tr><td>Personnel（人事）</td><td>${(buckets.personnel||0).toLocaleString()}</td></tr>
    <tr><td>Utilities（水電租金）</td><td>${(buckets.utilities||0).toLocaleString()}</td></tr>
    <tr><td>Marketing（行銷）</td><td>${(buckets.marketing||0).toLocaleString()}</td></tr>
    <tr><td>Logistics（物流/抽成）</td><td>${(buckets.logistics||0).toLocaleString()}</td></tr>
    <tr><td>Admin（行政/其他）</td><td>${(buckets.admin||0).toLocaleString()}</td></tr>
    <tr><td>Tax（稅捐）</td><td>${(buckets.tax||0).toLocaleString()}</td></tr>
    <tr><td>Transport（交通）</td><td>${(buckets.transport||0).toLocaleString()}</td></tr>
    <tr><td>Finance（金流/銀行/交際）</td><td>${(buckets.finance||0).toLocaleString()}</td></tr>
    <tr><td>Misc（雜項）</td><td>${(buckets.misc||0).toLocaleString()}</td></tr>
    <tr><td><b>Net Income（淨利）</b></td><td><b>${netIncome.toLocaleString()}</b></td></tr>
  </table>`;

  if($('#rp-subtotal')?.checked){
    const agg={};
    month.forEach(r=>{
      const t=mapType(r.category);
      const key=(r.type==='income'?'revenue':t);
      if(!agg[key]) agg[key]={}; agg[key][r.category]=(agg[key][r.category]||0)+(r.type==='income'?-r.amount:r.amount);
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
    month.forEach(r=> html+=`<li>${new Date(r.ts).toLocaleDateString()}｜${r.type}｜${r.category}｜${r.amount}｜${r.scope}${r.reimburse?'｜報銷':''}${r.note?('｜'+r.note):''}</li>`);
    html+='</ul>';
  }
  box.innerHTML=html;
}

// 快捷：僅保留 UI 與基本行為（排序/刪除/編輯捲動高亮）
function renderQuickList(){ const ul=$('#quickList'); if(!ul) return; ul.innerHTML=''; quicks.forEach((q,i)=>{const li=document.createElement('li'); li.className='quick-item'; li.innerHTML=`<div><b>${q.label}</b><span class="muted">｜${q.type}｜${q.category}｜${q.amount}｜${q.mode}${q.auto?'｜一鍵':''}</span></div><div><button class='btn-link' data-act='up' data-i='${i}'>↑</button><button class='btn-link' data-act='down' data-i='${i}'>↓</button><button class='btn-link' data-act='edit' data-i='${i}'>編輯</button><button class='btn-link btn-danger' data-act='del' data-i='${i}'>刪除</button></div>`; ul.appendChild(li); }); }
function readQuickForm(){ return { label:$('#qLabel').value.trim(), type:$('#qType').value, category:$('#qCat').value.trim(), amount:Number($('#qAmt').value||0), mode:$('#qMode').value, auto:$('#qAuto').checked }; }
function fillQuickForm(q){ $('#qLabel').value=q.label||''; $('#qType').value=q.type||'expense'; $('#qCat').value=q.category||''; $('#qAmt').value=q.amount||''; $('#qMode').value=q.mode||'personal-JACK'; $('#qAuto').checked=!!q.auto; }
function onQuickSave(){ const q=readQuickForm(); if(!q.label||!q.category||!q.amount) return toast('請完整填寫'); const i=quicks.findIndex(x=>x.label===q.label); if(i>=0) quicks[i]=q; else quicks.push(q); save(K.QUICK,quicks); renderQuickList(); toast('已新增/覆寫快捷'); }
function onQuickClick(e){ const b=e.target.closest('button[data-act]'); if(!b) return; const act=b.dataset.act; const i=Number(b.dataset.i); if(act==='del'){quicks.splice(i,1); save(K.QUICK,quicks); renderQuickList();} else if(act==='up'||act==='down'){ const j=i+(act==='up'?-1:1); if(j<0||j>=quicks.length) return; [quicks[i],quicks[j]]=[quicks[j],quicks[i]]; save(K.QUICK,quicks); renderQuickList(); } else if(act==='edit'){ fillQuickForm(quicks[i]); const form=$('#quickForm'); form.scrollIntoView({behavior:'smooth'}); form.classList.add('pulse'); setTimeout(()=>form.classList.remove('pulse'),1500); activateTab('settings'); } }

async function resetAll(){ if(!confirm('⚠️ 確定要刪除本機所有資料？')) return; try{ localStorage.clear(); if(indexedDB&&indexedDB.databases){const dbs=await indexedDB.databases(); for(const db of dbs){ if(db.name) try{indexedDB.deleteDatabase(db.name)}catch(_){}}} if(caches){const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k)));} if(navigator.serviceWorker){const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister()));} location.reload(); }catch(e){ alert('重置失敗：'+(e.message||e)); }}

document.addEventListener('DOMContentLoaded',()=>{
  bindTabs(); buildCatOptions(); renderCatList(); bindCatEvents(); renderQuickList();
  $('#r-save').addEventListener('click',saveRecord);
  $('#t-save').addEventListener('click',saveTransfer);
  $('#rp-expand').addEventListener('change',renderPL);
  $('#rp-subtotal').addEventListener('change',renderPL);
  $('#qSave').addEventListener('click',onQuickSave);
  $('#quickList').addEventListener('click',onQuickClick);
  $('#btn-reset').addEventListener('click',resetAll);
  renderPL();
});
