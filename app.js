// 極速記帳 v3.3 build v16.8：完整預設分類 + 記帳/轉帳/報表 + 快捷管理 + 重置
const $ = (s)=> document.querySelector(s);
const $$ = (s)=> document.querySelectorAll(s);

// toast
const toast = (msg)=>{ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1600); };

// tabs
function activateTab(name){ $$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name)); $$('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name)); }
function bindTabs(){ $$('.tab-btn').forEach(b=>b.addEventListener('click', ()=> activateTab(b.dataset.tab))); activateTab('record'); }

// storage helpers
const K = {
  CATS: 'cashflow_cats',
  QUICK: 'cashflow_quicks',
  RECS: 'cashflow_records',
  TRANS: 'cashflow_transfers',
};

// default categories（完整可用）
const defaultCats = [
  // revenue
  {label:'現場銷售', type:'revenue'}, {label:'外送平台', type:'revenue'}, {label:'批發/通路', type:'revenue'}, {label:'其他收入', type:'revenue'},
  // COGS
  {label:'食材-肉類', type:'cogs'}, {label:'食材-蔬果', type:'cogs'}, {label:'海鮮', type:'cogs'}, {label:'調味/乾貨', type:'cogs'},
  {label:'飲品原料', type:'cogs'}, {label:'包材', type:'cogs'}, {label:'清潔耗材', type:'cogs'},
  // personnel
  {label:'正職薪資', type:'personnel'}, {label:'勞健保', type:'personnel'}, {label:'獎金/三節', type:'personnel'}, {label:'兼職時薪', type:'personnel'},
  // utilities
  {label:'租金', type:'utilities'}, {label:'水費', type:'utilities'}, {label:'電費', type:'utilities'}, {label:'瓦斯', type:'utilities'}, {label:'網路/手機', type:'utilities'},
  // marketing
  {label:'廣告行銷', type:'marketing'}, {label:'拍攝設計', type:'marketing'}, {label:'活動攤費', type:'marketing'}, {label:'外送平台抽成', type:'marketing'},
  // logistics
  {label:'物流運費', type:'logistics'},
  // admin
  {label:'記帳/法律', type:'admin'}, {label:'設備購置', type:'admin'}, {label:'維修', type:'admin'}, {label:'工具器具', type:'admin'},
  // tax
  {label:'稅捐(5%)', type:'tax'},
  // transport
  {label:'油資', type:'transport'}, {label:'停車', type:'transport'},
  // finance
  {label:'金流手續費', type:'finance'}, {label:'銀行手續費', type:'finance'}, {label:'交際應酬', type:'finance'},
  // misc
  {label:'雜項', type:'misc'}
];

function load(key, fallback){ try{ const s=localStorage.getItem(key); if(!s) return fallback; const j=JSON.parse(s); return j??fallback; }catch(e){ return fallback; } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

let cats = load(K.CATS, defaultCats.slice());
let quicks = load(K.QUICK, []);
let records = load(K.RECS, []);
let transfers = load(K.TRANS, []);

// ---- 設定：分類管理 ----
function renderCatList(){
  const ul = $('#catList'); ul.innerHTML='';
  cats.forEach((c, i)=>{
    const li = document.createElement('li');
    li.className='cat-item';
    li.innerHTML = `<div><b>${c.label}</b> <span class="muted">(${c.type})</span></div>
      <div><button class="btn-link btn-danger" data-i="${i}" data-act="del">刪除</button></div>`;
    ul.appendChild(li);
  });
}
function bindCatEvents(){
  $('#c-add').addEventListener('click', ()=>{
    const label = $('#c-new').value.trim();
    const type = $('#c-type').value;
    if(!label){ toast('請輸入分類名稱'); return; }
    cats.push({label, type}); save(K.CATS, cats); $('#c-new').value=''; renderCatList(); buildCatOptions();
  });
  $('#catList').addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act="del"]'); if(!btn) return;
    const i = Number(btn.dataset.i); cats.splice(i,1); save(K.CATS, cats); renderCatList(); buildCatOptions();
  });
}

// ---- 記帳 ----
function buildCatOptions(){
  const sel = $('#r-cat'); sel.innerHTML='';
  // 預設依 type 群組
  const groups = ['revenue','cogs','personnel','utilities','marketing','logistics','admin','tax','transport','finance','misc'];
  groups.forEach(g=>{
    const og = document.createElement('optgroup'); og.label = g;
    cats.filter(c=>c.type===g).forEach(c=>{ const opt=document.createElement('option'); opt.value=c.label; opt.textContent=`${c.label} (${c.type})`; og.appendChild(opt); });
    if(og.children.length) sel.appendChild(og);
  });
}
function saveRecord(){
  const rec = {
    ts: Date.now(),
    scope: $('#r-scope').value,
    type: $('#r-type').value,
    category: $('#r-cat').value,
    amount: Number($('#r-amount').value || 0),
    note: $('#r-note').value.trim(),
    reimburse: $('#r-reimburse').checked
  };
  if(!rec.amount || !rec.category){ toast('請填金額與分類'); return; }
  records.push(rec); save(K.RECS, records);
  $('#r-amount').value=''; $('#r-note').value=''; $('#r-reimburse').checked=false;
  toast('已記錄');
  renderReport();
}

// ---- 轉帳 ----
function saveTransfer(){
  const t = {
    ts: Date.now(),
    from: $('#t-from').value,
    to: $('#t-to').value,
    amount: Number($('#t-amount').value || 0)
  };
  if(!t.amount){ toast('請填金額'); return; }
  transfers.push(t); save(K.TRANS, transfers);
  $('#t-amount').value=''; toast('已建立轉帳');
  renderReport();
}

// ---- 報表（簡版）----
function isSameMonth(ts){
  const d=new Date(ts), n=new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth();
}
function renderReport(){
  const box = $('#reportBox');
  const monthRecs = records.filter(r=>isSameMonth(r.ts));
  const income = monthRecs.filter(r=>r.type==='income').reduce((a,b)=>a+b.amount,0);
  const expense = monthRecs.filter(r=>r.type==='expense').reduce((a,b)=>a+b.amount,0);
  const net = income - expense;

  let html = `<div class="grid g2">
    <div><b>收入</b><div>+${income.toLocaleString()}</div></div>
    <div><b>支出</b><div>-${expense.toLocaleString()}</div></div>
    <div class="full"><b>結餘</b><div>${net.toLocaleString()}</div></div>
  </div>`;

  if($('#rp-subtotal').checked){
    const byType = {};
    monthRecs.forEach(r=>{
      const t = cats.find(c=>c.label===r.category)?.type || 'misc';
      byType[t] = (byType[t]||0) + (r.type==='expense' ? r.amount : -r.amount);
    });
    html += '<hr><b>按類型小計（支出為正）</b><ul>';
    Object.keys(byType).forEach(k=> html += `<li>${k}：${byType[k].toLocaleString()}</li>`);
    html += '</ul>';
  }

  if($('#rp-expand').checked){
    html += '<hr><b>明細</b><ul>';
    monthRecs.forEach(r=> html += `<li>${new Date(r.ts).toLocaleDateString()}｜${r.type}｜${r.category}｜${r.amount}｜${r.scope}${r.reimburse?'｜報銷':''}${r.note?('｜'+r.note):''}</li>`);
    html += '</ul>';
  }

  box.innerHTML = html;
}

// ---- 快捷管理 ----
function loadQuicks(){ return quicks; }
function renderQuickList(){
  const ul = $('#quickList'); ul.innerHTML='';
  quicks.forEach((q,i)=>{
    const li=document.createElement('li'); li.className='quick-item';
    li.innerHTML=`<div><b>${q.label}</b><span class="muted">｜${q.type}｜${q.category}｜${q.amount}｜${q.mode}${q.auto?'｜一鍵':''}</span></div>
      <div><button class="btn-link" data-act="up" data-i="${i}">↑</button>
      <button class="btn-link" data-act="down" data-i="${i}">↓</button>
      <button class="btn-link" data-act="edit" data-i="${i}">編輯</button>
      <button class="btn-link btn-danger" data-act="del" data-i="${i}">刪除</button></div>`;
    ul.appendChild(li);
  });
}
function readQuickForm(){
  return { label: $('#qLabel').value.trim(), type: $('#qType').value, category: $('#qCat').value.trim(),
    amount: Number($('#qAmt').value||0), mode: $('#qMode').value, auto: $('#qAuto').checked };
}
function fillQuickForm(q){
  $('#qLabel').value=q.label||''; $('#qType').value=q.type||'expense'; $('#qCat').value=q.category||''; $('#qAmt').value=q.amount||''; $('#qMode').value=q.mode||'personal-JACK'; $('#qAuto').checked=!!q.auto;
}
function onQuickSave(){
  const q=readQuickForm(); if(!q.label||!q.category||!q.amount){ toast('請完整填寫'); return; }
  const i=quicks.findIndex(x=>x.label===q.label); if(i>=0) quicks[i]=q; else quicks.push(q);
  save(K.QUICK, quicks); renderQuickList(); toast('已新增/覆寫快捷');
}
function onQuickClick(e){
  const btn=e.target.closest('button[data-act]'); if(!btn) return;
  const act=btn.dataset.act; const i=Number(btn.dataset.i);
  if(act==='del'){ quicks.splice(i,1); save(K.QUICK, quicks); renderQuickList(); }
  else if(act==='up'||act==='down'){ const j=i+(act==='up'?-1:1); if(j<0||j>=quicks.length) return; [quicks[i],quicks[j]]=[quicks[j],quicks[i]]; save(K.QUICK, quicks); renderQuickList(); }
  else if(act==='edit'){ fillQuickForm(quicks[i]); const form=$('#quickForm'); form.scrollIntoView({behavior:'smooth'}); form.classList.add('pulse'); setTimeout(()=>form.classList.remove('pulse'),1500); activateTab('settings'); }
}

// ---- 重置 ----
async function resetAll(){
  const ok = confirm('⚠️ 確定要刪除本機所有資料嗎？\n這會清除 LocalStorage / IndexedDB / Cache / Service Worker 並重新載入。');
  if(!ok) return;
  try{
    localStorage.clear();
    if(indexedDB && indexedDB.databases){
      const dbs = await indexedDB.databases();
      for(const db of dbs){ if(db.name){ try{ indexedDB.deleteDatabase(db.name);}catch(_){}} }
    }
    if(window.caches){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
    if(navigator.serviceWorker){ const regs=await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r=>r.unregister())); }
    location.reload();
  }catch(e){ alert('重置發生錯誤：'+(e.message||e)); }
}

// ---- 啟動 ----
document.addEventListener('DOMContentLoaded', ()=>{
  bindTabs();
  renderCatList(); bindCatEvents();
  buildCatOptions();
  renderReport();

  // 記帳
  $('#r-save').addEventListener('click', saveRecord);

  // 轉帳
  $('#t-save').addEventListener('click', saveTransfer);

  // 報表開關
  $('#rp-expand').addEventListener('change', renderReport);
  $('#rp-subtotal').addEventListener('change', renderReport);

  // 快捷
  renderQuickList();
  $('#qSave').addEventListener('click', onQuickSave);
  $('#quickList').addEventListener('click', onQuickClick);

  // 重置
  $('#btn-reset').addEventListener('click', resetAll);
});
