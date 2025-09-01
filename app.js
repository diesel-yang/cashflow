// v16.7.2 快捷管理（編輯→自動捲動+高亮）＋ 表單自適應
const toast = (msg)=>{
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1600);
};

const storeKey = 'cashflow_quicks';
const loadQuicks = ()=>{
  try{ const s = localStorage.getItem(storeKey); if(!s) return []; const j = JSON.parse(s); return Array.isArray(j)? j : []; }catch(e){ return []; }
};
const saveQuicks = (arr)=> localStorage.setItem(storeKey, JSON.stringify(arr));

let quicks = loadQuicks();
const $ = (s)=> document.querySelector(s);

function renderList(){
  const ul = $('#quickList');
  ul.innerHTML = '';
  quicks.forEach((q,idx)=>{
    const li = document.createElement('li');
    li.className = 'quick-item';
    li.innerHTML = `
      <div><b>${q.label}</b>
        <span class="muted">｜${q.type}｜${q.category}｜${q.amount}｜${q.mode}${q.auto?'｜一鍵':''}</span>
      </div>
      <div>
        <button class="btn-link" data-act="up" data-i="${idx}">↑</button>
        <button class="btn-link" data-act="down" data-i="${idx}">↓</button>
        <button class="btn-link" data-act="edit" data-i="${idx}">編輯</button>
        <button class="btn-link btn-danger" data-act="del" data-i="${idx}">刪除</button>
      </div>`;
    ul.appendChild(li);
  });
}

function readForm(){
  return {
    label: $('#qLabel').value.trim(),
    type: $('#qType').value,
    category: $('#qCat').value.trim(),
    amount: Number($('#qAmt').value || 0),
    mode: $('#qMode').value,
    auto: $('#qAuto').checked
  };
}
function fillForm(q){
  $('#qLabel').value = q.label || '';
  $('#qType').value = q.type || 'expense';
  $('#qCat').value = q.category || '';
  $('#qAmt').value = q.amount || '';
  $('#qMode').value = q.mode || 'personal-JACK';
  $('#qAuto').checked = !!q.auto;
}

function saveForm(){
  const q = readForm();
  if(!q.label || !q.category || !q.amount){ toast('請完整填寫'); return; }
  const i = quicks.findIndex(x=> x.label === q.label);
  if(i>=0) quicks[i] = q; else quicks.push(q);
  saveQuicks(quicks);
  renderList();
  toast('已新增/覆寫快捷');
}

function handleClick(e){
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const act = btn.dataset.act;
  const i = Number(btn.dataset.i);
  if(Number.isNaN(i)) return;
  if(act==='del'){
    quicks.splice(i,1);
    saveQuicks(quicks); renderList();
  }else if(act==='up' || act==='down'){
    const j = i + (act==='up' ? -1 : 1);
    if(j<0 || j>=quicks.length) return;
    const tmp = quicks[i]; quicks[i]=quicks[j]; quicks[j]=tmp;
    saveQuicks(quicks); renderList();
  }else if(act==='edit'){
    fillForm(quicks[i]);
    toast('已帶入至表單，可修改後存回');
    const form = document.getElementById('quickForm');
    form.scrollIntoView({ behavior:'smooth', block:'start' });
    form.classList.add('pulse');
    setTimeout(()=> form.classList.remove('pulse'), 1500);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  renderList();
  document.getElementById('qSave').addEventListener('click', saveForm);
  document.getElementById('quickList').addEventListener('click', handleClick);
});
