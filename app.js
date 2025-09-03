// ====== CashFlow v3.5 ======

// Firebase
const firebaseConfig = {
  apiKey:"AIzaSyBfV21c91SabQrtrDDGBjt8aX9FcnHy-Es",
  authDomain:"cashflow-71391.firebaseapp.com",
  databaseURL:"https://cashflow-71391-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:"cashflow-71391",
  storageBucket:"cashflow-71391.firebasestorage.app",
  messagingSenderId:"204834375477",
  appId:"1:204834375477:web:406dde0ccb0d33a60d2e7c",
  measurementId:"G-G2DVG798M8"
};
firebase.initializeApp(firebaseConfig);

// State
const state = {
  user:null, space:"",
  records:[], transfers:[],
  dues:{JACK:0, WAL:0},
  catalog:{ categories:{restaurant:[], personal:[]}, items:{} },
  listeners:[]
};
const ui = { io:null, scope:null, owner:'JACK', who:'JACK', group:'', catId:'' };

// DOM
const $  = q=>document.querySelector(q);
const $$ = q=>document.querySelectorAll(q);

// Helpers
const uid = ()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const todayISO = ()=> new Date().toISOString().slice(0,10);
const cloudPath = ()=> `rooms/${(state.space||'default').trim().toLowerCase()}`;
const dbRef = p=> firebase.database().ref(p);
const safeKey = s=> String(s||'').replace(/[.#$[\]/]/g,'_');
const toast = m=> alert(m);

// Pocket UI
function setConnected(on){
  const b = $('#btn-connect');
  if(on){ b.classList.remove('danger'); b.textContent='連線中'; b.dataset.state='on'; }
  else  { b.classList.add('danger'); b.textContent='未連線'; b.dataset.state='off'; }
}

// Firebase
async function signIn(){ try{ state.user=(await firebase.auth().signInAnonymously()).user; }catch(e){console.error(e);toast('Firebase 登入失敗');}}
function clearListeners(){ state.listeners.forEach(off=>{try{off()}catch{}}); state.listeners=[]; }
function onValue(ref,cb){ const h=ref.on('value',s=>cb(s.val())); state.listeners.push(()=>ref.off('value',h)); }

async function connectSpace(space){
  state.space=(space||'').trim();
  if(!state.user) await signIn();
  if(!state.space){ toast('請輸入共享代號'); return; }
  clearListeners();

  onValue(dbRef(`${cloudPath()}/records`),(v)=>{ state.records=v?Object.values(v):[]; renderRecent(); renderPockets(); });
  onValue(dbRef(`${cloudPath()}/transfers`),(v)=>{ state.transfers=v?Object.values(v):[]; renderPockets(); });
  onValue(dbRef(`${cloudPath()}/dues`),(v)=>{ state.dues=v||{JACK:0,WAL:0}; renderPockets(); });
  onValue(dbRef(`${cloudPath()}/catalog`),(v)=>{ state.catalog=v||{categories:{restaurant:[],personal:[]},items:{}}; renderGroups(); renderManualSelect(); });

  setConnected(true);
}

// Balances
function catScope(id){
  const r = state.catalog?.categories?.restaurant?.some(c=>c.id===id);
  return r?'restaurant':'personal';
}
function computePocketBalances(){
  const bal={RESTAURANT:0,JACK:0,WAL:0};
  for(const r of state.records){
    const v=Number(r.amt)||0;
    if(r.type==='income'){ if(r.owner==='JW'){bal.JACK+=v/2;bal.WAL+=v/2;} else bal[r.owner]+=v; continue; }
    const scope = catScope(r.cat);
    if(scope==='restaurant'){
      if(r.owner==='JW'){bal.JACK-=v/2;bal.WAL-=v/2;} else bal[r.owner]-=v;
    }else{
      if(r.owner==='RESTAURANT'){ bal.RESTAURANT-=v; }
      else{ if(r.owner==='JW'){bal.JACK-=v/2;bal.WAL-=v/2;} else bal[r.owner]-=v; }
    }
  }
  return bal;
}
function renderPockets(){
  const b=computePocketBalances();
  const set=(id,v)=>{ const d=$(id); if(!d) return; d.textContent=(v||0).toLocaleString(); const box=d.closest('.pocket'); box.classList.toggle('negative',v<0); };
  set('#pk-rest',b.RESTAURANT); set('#pk-jack',b.JACK); set('#pk-wal',b.WAL);
}

// Write
async function pushRecord(row){ const ref=dbRef(`${cloudPath()}/records`).push(); row.id=row.id||ref.key; await ref.set(row); }
async function setDues(d){ await dbRef(`${cloudPath()}/dues`).set(d); }
async function addCatalogItem(catId,name){
  if(!name) return;
  const key=safeKey(catId);
  const list=state.catalog.items?.[key]||[];
  if(!list.includes(name)) list.push(name);
  await dbRef(`${cloudPath()}/catalog/items/${key}`).set(list);
}

// Category logic (io × scope)
const GROUP_META = {
  revenue:{name:'營業收入', emoji:'💵'},
  cogs:{name:'銷貨成本', emoji:'🥬'},
  personnel:{name:'人事', emoji:'👥'},
  utilities:{name:'水電租網', emoji:'🏠'},
  marketing:{name:'行銷', emoji:'📣'},
  logistics:{name:'物流', emoji:'🚛'},
  admin:{name:'行政稅務', emoji:'🧾'},
  p_income:{name:'個人收入', emoji:'💼'},
  p_expense:{name:'個人支出', emoji:'🍔'},
};
function groupsFor(io,scope){
  if(!io||!scope) return [];
  if(scope==='restaurant'){
    return io==='income'
      ? ['revenue']
      : ['cogs','personnel','utilities','marketing','logistics','admin'];
  }else{ // personal
    return io==='income' ? ['p_income'] : ['p_expense'];
  }
}
function categoriesFor(io,scope){
  const src = scope==='restaurant' ? (state.catalog?.categories?.restaurant||[]) : (state.catalog?.categories?.personal||[]);
  const allowed = new Set(groupsFor(io,scope));
  return src.filter(c=> allowed.has(c.kind));
}

// Render: manual select（只列「大項」）
function renderManualSelect(){
  const sel=$('#rec-manual-cat'); if(!sel) return;
  const gs=groupsFor(ui.io, ui.scope);
  sel.innerHTML = `<option value="">（選擇分類）</option>` + gs.map(g=>`<option value="${g}">${GROUP_META[g]?.name||g}</option>`).join('');
  if(ui.group) sel.value = ui.group;
}

// Render groups
function renderGroups(){
  const g=$('#group-panel'), i=$('#items-panel');
  if(!g||!i) return;
  g.innerHTML=''; i.style.display='none'; i.innerHTML='';
  ui.group=''; ui.catId='';
  const gs = groupsFor(ui.io, ui.scope);
  g.innerHTML = gs.map(k=>`<button class="chip" data-group="${k}">${GROUP_META[k]?.emoji||'🧩'} ${GROUP_META[k]?.name||k}</button>`).join('');
}

// 點大項 → 出細項；同步 select；送出不可用→待選細項
$('#group-panel')?.addEventListener('click', (e)=>{
  const b=e.target.closest('.chip'); if(!b) return;
  $('#group-panel .chip.active')?.classList.remove('active');
  b.classList.add('active');
  ui.group=b.dataset.group;

  const items = categoriesFor(ui.io, ui.scope).filter(c=>c.kind===ui.group);
  $('#items-panel').style.display='grid';
  $('#items-panel').innerHTML = items.map(c=>`<button class="chip" data-cat="${c.id}">${c.icon||'🧩'} ${c.label}</button>`).join('') || '<small class="muted">（此群暫無項目）</small>';

  // select 對齊「大項」
  const sel=$('#rec-manual-cat'); if(sel) sel.value=ui.group;
  ui.catId=''; validateReady();
});

// 點細項 → 只記錄 catId（不動 select）
$('#items-panel')?.addEventListener('click', (e)=>{
  const b=e.target.closest('.chip'); if(!b) return;
  $('#items-panel .chip.active')?.classList.remove('active');
  b.classList.add('active');
  ui.catId=b.dataset.cat;
  validateReady();
});

// 付款人/收款人（人形＋文字）
function renderWho(){
  const box=$('#chip-who'); if(!box) return;
  if(ui.io==='income'){
    $('#lbl-who').textContent='收款人';
    box.innerHTML=`
      <button class="chip sm active" data-who="JACK">🧑‍🍳 Jack</button>
      <button class="chip sm" data-who="WAL">🧑‍🍳 Wal</button>`;
    ui.who='JACK';
  }else{
    $('#lbl-who').textContent='付款人';
    box.innerHTML=`
      <button class="chip sm active" data-who="JACK">🧑‍🍳 Jack</button>
      <button class="chip sm" data-who="WAL">🧑‍🍳 Wal</button>
      <button class="chip sm" data-who="JW">👥 JW</button>`;
    ui.who='JACK';
  }
}

// 送出可用性
function validateReady(){
  const ok = ui.io && ui.scope && (ui.catId || ui.group) && Number($('#rec-amt').value||0) > 0;
  $('#rec-submit').disabled = !ok;
}

// Submit
async function postRecordFromUI(){
  const ds=$('#rec-date')?.value||todayISO();
  const ts=new Date(ds+'T12:00:00').getTime();
  const amt=Number($('#rec-amt')?.value||0);
  if(!amt) return toast('請輸入金額');

  const cat = ui.catId || ui.group; // 優先細項，否則用大項
  if(!ui.io||!ui.scope||!cat) return toast('請先選擇 收支 / 用途 / 分類');

  const itemName=($('#rec-item')?.value||'').trim();
  const note=($('#rec-note')?.value||'').trim();
  if(itemName && ui.catId) await addCatalogItem(ui.catId, itemName);

  const row={ id:uid(), type:ui.io, owner:ui.owner, who:ui.who, cat, amt, ts,
    note: itemName ? (note? `${itemName}｜${note}`: itemName) : note };
  await pushRecord(row);

  // 欠款邏輯
  const scope = catScope(cat);
  let dues={...state.dues};
  if(ui.io==='expense'){
    if(scope==='restaurant'){
      if(ui.owner==='JACK'||ui.owner==='WAL'||ui.owner==='JW'){
        const split=(ui.owner==='JW')?[['JACK',amt/2],['WAL',amt/2]]:[[ui.owner,amt]];
        split.forEach(([p,v])=>dues[p]=Number(dues[p]||0)+v);
        await setDues(dues);
      }
    }else{
      if(ui.owner==='RESTAURANT'){
        const split=(ui.who==='JW')?[['JACK',amt/2],['WAL',amt/2]]:[[ui.who,amt]];
        split.forEach(([p,v])=>dues[p]=Number(dues[p]||0)-v);
        await setDues(dues);
      }
    }
  }

  // reset
  $('#rec-amt').value=''; $('#rec-item').value=''; $('#rec-note').value='';
  ui.catId=''; ui.group='';
  renderGroups(); renderPockets(); validateReady();
  toast('已記帳 ✅');
}

// Recent list
function renderRecent(){
  const list=$('#recent-list'); if(!list) return;
  const arr=[...state.records].slice(-20).reverse();
  $('#rec-count').textContent=`${state.records.length} 筆`;
  list.innerHTML=arr.map(r=>{
    const d=new Date(r.ts||Date.now()); const ds=`${d.getMonth()+1}/${d.getDate()}`;
    const sign=r.type==='income'?'+':'-';
    return `<li><small>${ds}</small><b style="margin-left:6px">${r.cat}</b><span class="muted" style="margin-left:6px">${r.note||''}</span><span style="margin-left:auto">${sign}${Number(r.amt).toLocaleString()}</span></li>`;
  }).join('');
}

// Events
function bindEvents(){
  // Tabs
  document.querySelector('.tabs')?.addEventListener('click',(e)=>{
    const b=e.target.closest('.tab'); if(!b) return;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); b.classList.add('active');
    const v=b.dataset.view; ['book','transfer','report','settings'].forEach(x=>$('#view-'+x).style.display=(x===v?'block':'none'));
  });

  // 連線
  $('#btn-connect')?.addEventListener('click',()=>{
    const sp=$('#space-code').value||''; if(!sp){toast('請輸入共享代號');return;}
    localStorage.setItem('space', sp); connectSpace(sp);
  });

  // 支出/收入
  $('#chip-io')?.addEventListener('click',(e)=>{
    const b=e.target.closest('.chip'); if(!b) return;
    $('#chip-io .chip.active')?.classList.remove('active'); b.classList.add('active');
    ui.io=b.dataset.io; renderWho(); renderGroups(); renderManualSelect(); validateReady();
  });

  // 用途
  $('#chip-scope')?.addEventListener('click',(e)=>{
    const b=e.target.closest('.chip'); if(!b) return;
    $('#chip-scope .chip.active')?.classList.remove('active'); b.classList.add('active');
    ui.scope=b.dataset.scope; renderGroups(); renderManualSelect(); validateReady();
  });

  // 口袋（可點）
  $('#pockets')?.addEventListener('click',(e)=>{
    const btn=e.target.closest('.pocket'); if(!btn) return;
    $$('#pockets .pocket').forEach(x=>x.classList.remove('selected'));
    btn.classList.add('selected');
    ui.owner=btn.dataset.pk; validateReady();
  });

  // 付款人／收款人
  $('#chip-who')?.addEventListener('click',(e)=>{
    const b=e.target.closest('.chip'); if(!b) return;
    $('#chip-who .chip.active')?.classList.remove('active'); b.classList.add('active');
    ui.who=b.dataset.who;
  });

  // 金額 input → 驗證
  $('#rec-amt')?.addEventListener('input', validateReady);

  // 送出
  $('#rec-submit')?.addEventListener('click', postRecordFromUI);

  // 初值
  $('#rec-date').setAttribute('value', todayISO());
  setConnected(false);
  const last=localStorage.getItem('space')||''; if(last) $('#space-code').value=last;
  renderWho(); // 先渲染空白狀態
}
(async function init(){ await signIn(); bindEvents(); })();
