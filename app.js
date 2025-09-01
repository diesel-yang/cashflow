// v16.7.5：Tab、快捷管理、重置（含確認視窗與 SW/Cache/IndexedDB 清除）
const $ = (s)=> document.querySelector(s);
const $$ = (s)=> document.querySelectorAll(s);

// Toast
const toast = (msg)=>{
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1600);
};

// Tabs
function activateTab(name){
  $$('.tab-btn').forEach(b=> b.classList.toggle('active', b.dataset.tab===name));
  $$('.tab-pane').forEach(p=> p.classList.toggle('active', p.id===('tab-'+name)));
}
function bindTabs(){
  $$('.tab-btn').forEach(b=> b.addEventListener('click', ()=> activateTab(b.dataset.tab)));
  activateTab('record');
}

// 快捷管理
const storeKey = 'cashflow_quicks';
const loadQuicks = ()=>{
  try{ const s = localStorage.getItem(storeKey); if(!s) return []; const j = JSON.parse(s); return Array.isArray(j)? j : []; }catch(e){ return []; }
};
const saveQuicks = (arr)=> localStorage.setItem(storeKey, JSON.stringify(arr));
let quicks = loadQuicks();

function readQuickForm(){
  return {
    label: $('#qLabel').value.trim(),
    type: $('#qType').value,
    category: $('#qCat').value.trim(),
    amount: Number($('#qAmt').value || 0),
    mode: $('#qMode').value,
    auto: $('#qAuto').checked
  };
}
function fillQuickForm(q){
  $('#qLabel').value = q.label || '';
  $('#qType').value = q.type || 'expense';
  $('#qCat').value = q.category || '';
  $('#qAmt').value = q.amount || '';
  $('#qMode').value = q.mode || 'personal-JACK';
  $('#qAuto').checked = !!q.auto;
}
function renderQuickList(){
  const ul = $('#quickList'); ul.innerHTML='';
  quicks.forEach((q,i)=>{
    const li = document.createElement('li'); li.className='quick-item';
    li.innerHTML = `<div><b>${q.label}</b>
      <span class="muted">｜${q.type}｜${q.category}｜${q.amount}｜${q.mode}${q.auto?'｜一鍵':''}</span></div>
      <div>
        <button class="btn-link" data-act="up" data-i="${i}">↑</button>
        <button class="btn-link" data-act="down" data-i="${i}">↓</button>
        <button class="btn-link" data-act="edit" data-i="${i}">編輯</button>
        <button class="btn-link btn-danger" data-act="del" data-i="${i}">刪除</button>
      </div>`;
    ul.appendChild(li);
  });
}
function onQuickClick(e){
  const btn = e.target.closest('button[data-act]'); if(!btn) return;
  const act = btn.dataset.act; const i = Number(btn.dataset.i); if(Number.isNaN(i)) return;
  if(act==='del'){ quicks.splice(i,1); saveQuicks(quicks); renderQuickList(); }
  else if(act==='up' || act==='down'){
    const j = i + (act==='up'?-1:1); if(j<0 || j>=quicks.length) return;
    [quicks[i], quicks[j]] = [quicks[j], quicks[i]]; saveQuicks(quicks); renderQuickList();
  }
  else if(act==='edit'){
    fillQuickForm(quicks[i]); toast('已帶入至表單，可修改後存回');
    const form = $('#quickForm'); form.scrollIntoView({behavior:'smooth', block:'start'});
    form.classList.add('pulse'); setTimeout(()=> form.classList.remove('pulse'), 1500);
    activateTab('settings');
  }
}
function onQuickSave(){
  const q = readQuickForm();
  if(!q.label || !q.category || !q.amount){ toast('請完整填寫'); return; }
  const idx = quicks.findIndex(x=> x.label === q.label);
  if(idx>=0) quicks[idx] = q; else quicks.push(q);
  saveQuicks(quicks); renderQuickList(); toast('已新增/覆寫快捷');
}

// 重置（含確認視窗）
async function resetAll(){
  const ok = confirm('⚠️ 確定要刪除本機所有資料嗎？\n這會清除 LocalStorage / IndexedDB / Cache / Service Worker 並重新載入。');
  if(!ok) return;
  try{
    // 1) LocalStorage
    localStorage.clear();

    // 2) IndexedDB（刪除所有資料庫）
    if (indexedDB && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) { try { indexedDB.deleteDatabase(db.name); } catch(_){} }
      }
    } else {
      // 若瀏覽器不支援列舉，刪除常用名稱
      ['cashflow','cashflow/records','cashflow/receipts','cashflow/settings'].forEach(n=>{ try{ indexedDB.deleteDatabase(n); }catch(_){}});
    }

    // 3) Cache Storage
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 4) Service Worker
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    // 5) Reload
    location.reload();
  }catch(e){
    alert('重置時發生錯誤：' + (e.message || e));
  }
}

// 啟動
document.addEventListener('DOMContentLoaded', ()=>{
  // Tabs
  bindTabs();

  // 快捷
  renderQuickList();
  $('#quickList').addEventListener('click', onQuickClick);
  $('#qSave').addEventListener('click', onQuickSave);

  // Reset
  $('#btn-reset').addEventListener('click', resetAll);
});
