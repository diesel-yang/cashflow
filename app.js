// app.js v4.0 修正版 — 本月紀錄 + 小豬SVG口袋 + 手機排版修正
firebase.initializeApp({
  apiKey:"AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
  authDomain:"cashflow-71391.firebaseapp.com",
  databaseURL:"https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:"cashflow-71391"
});
const db=firebase.database();
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s)), byId=id=>document.getElementById(id);
const money=n=>(Number(n)||0).toLocaleString('zh-TW');
function todayISO(){let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

const state={space:localStorage.getItem('CF_SPACE')||"",io:"expense",scope:"restaurant",group:"",item:"",payer:"J",pocket:"restaurant"};

const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
function renderPockets(){
  const host=byId('pockets-row');
  host.innerHTML=POCKETS.map(p=>`
    <button class="pocket" data-pocket="${p.key}">
      <svg class="pig"><use href="#pig-icon"/></svg>
      <div class="amt" id="amt-${p.key}">0</div>
      <div class="name">${p.name}</div>
    </button>`).join('');
}
function updatePocketAmounts(records){
  const bal={restaurant:0,jack:0,wal:0};
  records.forEach(r=>{
    const delta=(r.io==='income'?1:-1)*(Number(r.amount||0));
    if(r.pocket&&bal[r.pocket]!=null)bal[r.pocket]+=delta;
  });
  POCKETS.forEach(p=>{
    const el=byId(`amt-${p.key}`);if(!el)return;
    const v=bal[p.key];el.textContent=money(v);
    const card=el.closest('.pocket');
    card.classList.toggle('negative',v<0);card.classList.toggle('positive',v>0);
  });
}

function watchThisMonth(){
  const list=byId('recent-list');
  const refRec=db.ref(`rooms/${state.space}/records`);
  refRec.on('value',snap=>{
    const arr=[];snap.forEach(ch=>arr.push(ch.val()));
    const now=new Date(), ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const rows=arr.filter(r=>(r.date||"").startsWith(ym)).sort((a,b)=>b.ts-a.ts);
    list.innerHTML=rows.map(r=>{
      const sign=r.io==='expense'?'-':'+';
      return `<div class="row">
        <div class="r-date">${r.date}</div>
        <div>${r.scope==='restaurant'?'餐廳':'個人'}・${r.group}${r.item?'・'+r.item:''}</div>
        <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount)}</div>
      </div>`;
    }).join('')||`<div class="muted">（本月無紀錄）</div>`;
    updatePocketAmounts(arr);
  });
}

// 綁定連線
byId('btn-connect').addEventListener('click',()=>{
  const code=(byId('space-code').value||'').trim();if(!code)return alert('請輸入共享代號');
  state.space=code;localStorage.setItem('CF_SPACE',code);
  renderPockets();watchThisMonth();
  byId('btn-connect').textContent='連線中';byId('btn-connect').classList.add('success');byId('btn-connect').classList.remove('danger');
});

// 預設日期
(function boot(){
  const dateInput=byId('rec-date');if(dateInput&&!dateInput.value)dateInput.value=todayISO();
  if(state.space){byId('space-code').value=state.space;renderPockets();watchThisMonth();}
  else{byId('btn-connect').classList.add('danger');byId('btn-connect').textContent='未連線';}
})();
