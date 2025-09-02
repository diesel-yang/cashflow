// ====== CashFlow v3.5 ======

// --- Firebase 設定 ---
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

// ---- 狀態 ----
const state = {
  user: null,
  space: "",
  records: [],
  transfers: [],
  dues: { JACK: 0, WAL: 0 },
  catalog: { categories: { restaurant: [], personal: [] }, items: {} },
  listeners: []
};

// UI 狀態（不預設）
const ui = {
  io: null,            // 'expense' | 'income'
  scope: null,         // 'restaurant' | 'personal'
  owner: 'JACK',       // RESTAURANT | JACK | WAL
  who: 'JACK',         // JACK | WAL | JW （收入時只有 JACK / WAL）
  group: '',           // 大項
  catId: ''            // 細項
};

// ---- DOM ----
const $  = (q)=>document.querySelector(q);
const $$ = (q)=>document.querySelectorAll(q);

// ---- Helper ----
const uid = ()=> Math.random().toString(36).slice(2)+Date.now().toString(36);
const todayISO = ()=> new Date().toISOString().slice(0,10);
const cloudPath = ()=> `rooms/${(state.space||'default').trim().toLowerCase()}`;
const dbRef = (p)=> firebase.database().ref(p);
const safeKey = (s)=> String(s||'').replace(/[.#$[\]/]/g,'_');
const toast = (m)=> alert(m);

function catScope(id){
  const r = state.catalog?.categories?.restaurant?.some(c=>c.id===id);
  return r ? 'restaurant' : 'personal';
}

// ---- 連線按鈕狀態 ----
function setConnected(on){
  const b = $('#btn-connect');
  if (!b) return;
  if (on){
    b.classList.remove('danger'); b.textContent = '連線中'; b.dataset.state='on';
  }else{
    b.classList.add('danger'); b.textContent = '未連線'; b.dataset.state='off';
  }
}

// ---- Firebase ----
async function signIn(){
  try{
    const { user } = await firebase.auth().signInAnonymously();
    state.user = user;
  }catch(e){
    console.error(e); toast('Firebase 登入失敗');
  }
}
function clearListeners(){
  state.listeners.forEach(off=>{try{off()}catch{}});
  state.listeners = [];
}
function onValue(ref, cb){
  const h = ref.on('value', s => cb(s.val()));
  state.listeners.push(()=>ref.off('value', h));
}

async function connectSpace(space){
  state.space = (space||'').trim();
  if(!state.user) await signIn();
  if(!state.space){ toast('請輸入共享代號'); return; }
  clearListeners();

  onValue(dbRef(`${cloudPath()}/records`),(v)=>{
    state.records = v ? Object.values(v).sort((a,b)=> (a.ts||0)-(b.ts||0)) : [];
    renderRecent(); renderPockets();
  });
  onValue(dbRef(`${cloudPath()}/transfers`),(v)=>{
    state.transfers = v ? Object.values(v) : [];
    renderPockets();
  });
  onValue(dbRef(`${cloudPath()}/dues`),(v)=>{
    state.dues = v || { JACK:0, WAL:0 };
    renderPockets();
  });
  onValue(dbRef(`${cloudPath()}/catalog`),(v)=>{
    state.catalog = v || { categories:{restaurant:[],personal:[]}, items:{} };
    renderGroupChips(); renderManualCatSelect();
  });

  setConnected(true);
}

// ---- 計算口袋 ----
function computePocketBalances(){
  const bal = { RESTAURANT:0, JACK:0, WAL:0 };
  for(const r of state.records){
    const v = Number(r.amt)||0;
    if (r.type==='income'){
      if (r.owner==='JW'){ bal.JACK += v/2; bal.WAL += v/2; }
      else bal[r.owner] += v;
      continue;
    }
    const scope = catScope(r.cat);
    if (scope==='restaurant'){
      if (r.owner==='JW'){ bal.JACK -= v/2; bal.WAL -= v/2; }
      else bal[r.owner] -= v;
    }else{
      if (r.owner==='RESTAURANT'){
        bal.RESTAURANT -= v; // 預支：個人口袋不動
      }else{
        if (r.owner==='JW'){ bal.JACK -= v/2; bal.WAL -= v/2; }
        else bal[r.owner] -= v;
      }
    }
  }
  return bal;
}
function renderPockets(){
  const b = computePocketBalances();
  const elR=$('#pk-rest'), elJ=$('#pk-jack'), elW=$('#pk-wal');
  if(!elR) return;
  elR.textContent = (b.RESTAURANT||0).toLocaleString();
  elJ.textContent = (b.JACK||0).toLocaleString();
  elW.textContent = (b.WAL||0).toLocaleString();
  elR.parentElement.classList.toggle('negative', b.RESTAURANT<0);
  elJ.parentElement.classList.toggle('negative', b.JACK<0);
  elW.parentElement.classList.toggle('negative', b.WAL<0);
}

// ---- 寫入 ----
async function pushRecord(row){
  const ref = dbRef(`${cloudPath()}/records`).push();
  row.id = row.id || ref.key;
  await ref.set(row);
}
async function setDues(d){
  await dbRef(`${cloudPath()}/dues`).set(d);
}
async function addCatalogItem(catId, name){
  if(!name) return;
  const key = safeKey(catId);
  const list = state.catalog.items?.[key] || [];
  if(!list.includes(name)) list.push(name);
  await dbRef(`${cloudPath()}/catalog/items/${key}`).set(list);
}

// ---- 分類渲染（依 io × scope） ----
function categoriesFor(io, scope){
  const R = state.catalog?.categories?.restaurant || [];
  const P = state.catalog?.categories?.personal || [];
  const map = { restaurant:R, personal:P };
  const all = map[scope||'restaurant'];

  if (!io || !scope) return [];

  // io=income：餐廳只顯示 revenue；個人只顯示 p_income
  if (io==='income'){
    const want = scope==='restaurant' ? ['revenue'] : ['p_income'];
    return all.filter(c=> want.includes(c.kind));
  }
  // io=expense：餐廳排除 revenue；個人只顯示 p_expense（九大類）
  if (io==='expense'){
    if (scope==='restaurant') return all.filter(c=> c.kind!=='revenue');
    return all.filter(c=> c.kind==='p_expense');
  }
  return [];
}

function renderManualCatSelect(){
  const sel = $('#rec-manual-cat'); if(!sel) return;
  const cats = categoriesFor(ui.io, ui.scope);
  sel.innerHTML = `<option value="">（選擇大項）</option>` +
    cats.map(c=> `<option value="${c.id}">${c.label||c.id}</option>`).join('');
}

function renderGroupChips(){
  const g = $('#group-panel'), i = $('#items-panel');
  g.innerHTML = ''; i.style.display='none'; i.innerHTML = '';
  ui.group=''; ui.catId='';

  const cats = categoriesFor(ui.io, ui.scope);
  g.innerHTML = cats.map(c=>`<button class="chip" data-group="${c.kind}">${c.icon||'🧩'} ${c.label||c.id}</button>`).join('');
}

// 點大項 → 顯示項目
$('#group-panel')?.addEventListener('click', (e)=>{
  const b = e.target.closest('.chip'); if(!b) return;
  $('#group-panel .chip.active')?.classList.remove('active');
  b.classList.add('active');
  ui.group = b.dataset.group;

  const RC = state.catalog?.categories?.restaurant || [];
  const PC = state.catalog?.categories?.personal || [];
  const cats = [...RC, ...PC].filter(c=> c.kind===ui.group);
  const items = cats.map(c=>`<button class="chip" data-cat="${c.id}">${c.icon||'🧩'} ${c.label}</button>`).join('');

  const panel = $('#items-panel');
  panel.style.display = 'grid';
  panel.innerHTML = items || '<small class="muted">（此群暫無項目）</small>';

  renderManualCatSelect();
});

// 點細項 → 設定 catId
$('#items-panel')?.addEventListener('click', (e)=>{
  const b = e.target.closest('.chip'); if(!b) return;
  $('#items-panel .chip.active')?.classList.remove('active');
  b.classList.add('active');
  ui.catId = b.dataset.cat;
  $('#rec-manual-cat').value = ui.catId;
  validateReady();
});

// ---- 付款人/收款人 ----
function renderWhoChips(){
  const box = $('#chip-who'); if(!box) return;
  if (ui.io === 'income'){
    $('#lbl-who').textContent = '收款人';
    box.innerHTML = `
      <button class="chip sm active" data-who="JACK">J</button>
      <button class="chip sm" data-who="WAL">W</button>
    `;
    ui.who = 'JACK';
  }else{
    $('#lbl-who').textContent = '付款人';
    box.innerHTML = `
      <button class="chip sm active" data-who="JACK">J</button>
      <button class="chip sm" data-who="WAL">W</button>
      <button class="chip sm" data-who="JW">JW</button>
    `;
    ui.who = 'JACK';
  }
}

// ---- 檢查送出可用 ----
function validateReady(){
  const ok = ui.io && ui.scope && (ui.catId || $('#rec-manual-cat').value) && Number($('#rec-amt').value||0) > 0;
  $('#rec-submit').disabled = !ok;
}

// ---- 送出 ----
async function postRecordFromUI(){
  const ds = $('#rec-date')?.value || todayISO();
  const ts = new Date(ds+'T12:00:00').getTime();
  const amt = Number($('#rec-amt')?.value||0);
  if (!amt) return toast('請輸入金額');

  const cat = ui.catId || ($('#rec-manual-cat').value||'');
  if (!ui.io || !ui.scope || !cat) return toast('請先選擇 收支/用途/分類');

  const itemName = ($('#rec-item')?.value||'').trim();
  const note = ($('#rec-note')?.value||'').trim();
  if (itemName) await addCatalogItem(cat, itemName);

  const row = {
    id: uid(),
    type: ui.io,
    owner: ui.owner,
    who: ui.who,
    cat, amt, ts,
    note: itemName ? (note? `${itemName}｜${note}`: itemName) : note
  };
  await pushRecord(row);

  // 欠款 dues（不建立轉帳）
  const scope = catScope(cat);
  let dues = {...state.dues};

  if (ui.io==='expense'){
    if (scope==='restaurant'){
      // 個人代墊餐廳
      if (ui.owner==='JACK' || ui.owner==='WAL' || ui.owner==='JW'){
        const split = (ui.owner==='JW') ? [['JACK',amt/2], ['WAL',amt/2]] : [[ui.owner, amt]];
        split.forEach(([who, v]) => dues[who] = Number(dues[who]||0) + v);
        await setDues(dues);
      }
    } else {
      // 個人分類由餐廳支付 → 預支
      if (ui.owner==='RESTAURANT'){
        const split = (ui.who==='JW') ? [['JACK',amt/2], ['WAL',amt/2]] : [[ui.who, amt]];
        split.forEach(([who, v]) => dues[who] = Number(dues[who]||0) - v);
        await setDues(dues);
      }
    }
  }

  // reset
  $('#rec-amt').value=''; $('#rec-item').value=''; $('#rec-note').value='';
  ui.catId=''; ui.group='';
  renderGroupChips(); renderPockets(); validateReady();
  toast('已記帳 ✅');
}

// ---- 最近紀錄 ----
function renderRecent(){
  const list = $('#recent-list');
  const arr = [...state.records].slice(-20).reverse();
  $('#rec-count').textContent = `${state.records.length} 筆`;
  list.innerHTML = arr.map(r=>{
    const d = new Date(r.ts||Date.now()); const ds = `${d.getMonth()+1}/${d.getDate()}`;
    const sign = r.type==='income' ? '+' : '-';
    return `<li><small>${ds}</small><b style="margin-left:6px">${r.cat}</b><span class="muted" style="margin-left:6px">${r.note||''}</span><span style="margin-left:auto">${sign}${Number(r.amt).toLocaleString()}</span></li>`;
  }).join('');
}

// ---- 綁事件 ----
function bindEvents(){
  // Tabs
  document.querySelector('.tabs')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.tab'); if(!b) return;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    b.classList.add('active');
    const v = b.dataset.view;
    ['book','transfer','report','settings'].forEach(x=>{
      $('#view-'+x).style.display = (x===v?'block':'none');
    });
  });

  // 連線
  $('#btn-connect')?.addEventListener('click', ()=>{
    const sp = $('#space-code').value||'';
    if(!sp){ toast('請輸入共享代號'); return; }
    localStorage.setItem('space', sp);
    connectSpace(sp);
  });

  // 支出/收入（無預設）
  $('#chip-io')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $('#chip-io .chip.active')?.classList.remove('active');
    b.classList.add('active');
    ui.io = b.dataset.io;
    renderWhoChips();
    renderGroupChips();
    renderManualCatSelect();
    validateReady();
  });

  // 用途：餐廳/個人（無預設）
  $('#chip-scope')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $('#chip-scope .chip.active')?.classList.remove('active');
    b.classList.add('active');
    ui.scope = b.dataset.scope;
    renderGroupChips();
    renderManualCatSelect();
    validateReady();
  });

  // 點三口袋 → owner
  document.querySelector('.pockets.inline')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.pocket'); if(!btn) return;
    ui.owner = btn.dataset.pk;
    validateReady();
  });

  // 付款人/收款人
  $('#chip-who')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $('#chip-who .chip.active')?.classList.remove('active');
    b.classList.add('active');
    ui.who = b.dataset.who;
  });

  // 送出
  $('#rec-submit')?.addEventListener('click', postRecordFromUI);

  // 初始化
  $('#rec-date').setAttribute('value', todayISO());
  setConnected(false);
  const last = localStorage.getItem('space')||'';
  if(last){ $('#space-code').value = last; }
}

(async function init(){
  await signIn();
  bindEvents();
})();
