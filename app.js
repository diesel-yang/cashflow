// ====== 極速記帳 v3.4（fixed build） ======

// --- Firebase 設定（你的專案參數） ---
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

// --- 狀態 ---
const state = {
  user: null,
  space: "",
  records: [],
  transfers: [],
  dues: { JACK: 0, WAL: 0 },
  catalog: { categories: { restaurant: [], personal: [] }, items: {} },
  listeners: []
};

// UI 狀態
const uiState = {
  io: 'expense',           // expense | income
  scope: 'restaurant',     // restaurant | personal
  owner: 'JACK',           // RESTAURANT | JACK | WAL
  who: 'JACK',             // JACK | WAL | JW  -- income 模式下只會有 JACK/WAL
  group: '',               // 群組選擇（餐廳六群 / 個人收入/支出）
  catId: ''                // 細項分類
};

// --- DOM Helper ---
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

// --- 便利函式 ---
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function cloudPath(){ const s=(state.space||'default').trim().toLowerCase(); return `rooms/${s}`; }
function dbRef(p){ return firebase.database().ref(p); }
function safeKey(s){ return String(s||'').replace(/[.#$[\]/]/g,'_'); }
function findCat(id){
  const all = [...(state.catalog?.categories?.restaurant||[]), ...(state.catalog?.categories?.personal||[])];
  return all.find(c=>c.id===id) || null;
}
function catScope(id){
  const r = state.catalog?.categories?.restaurant?.some(c=>c.id===id);
  return r ? 'restaurant' : 'personal';
}
function toast(msg){ console.log('[toast]', msg); alert(msg); }

// --- Firebase 登入 & 連線 ---
async function signIn(){
  try {
    const cred = await firebase.auth().signInAnonymously();
    state.user = cred.user;
    console.log('Signed in:', cred.user?.uid, 'build=', window.__CF_VERSION__);
  } catch(e){ console.error('auth error', e); toast('Firebase 連線/登入失敗，請檢查金鑰或網路'); }
}

function clearListeners(){
  state.listeners.forEach(unsub => { try{ unsub(); }catch{} });
  state.listeners = [];
}

function onValue(ref, handler){
  const cb = ref.on('value', snap => handler(snap.val()));
  state.listeners.push(()=>ref.off('value', cb));
}

// 載入雲端資料
async function connectSpace(space){
  state.space = space.trim();
  if(!state.user) await signIn();
  if(!state.space){ toast('請輸入共享代號'); return; }
  clearListeners();

  // 監聽 records/transfers/dues/catalog
  onValue(dbRef(`${cloudPath()}/records`), (val)=>{
    const arr = val ? Object.values(val) : [];
    state.records = arr.sort((a,b)=> (a.ts||0)-(b.ts||0));
    renderRecent(); renderPockets();
  });
  onValue(dbRef(`${cloudPath()}/transfers`), (val)=>{
    const arr = val ? Object.values(val) : [];
    state.transfers = arr.sort((a,b)=> (a.ts||0)-(b.ts||0));
    renderPockets();
  });
  onValue(dbRef(`${cloudPath()}/dues`), (val)=>{
    state.dues = val || { JACK:0, WAL:0 };
    renderPockets();
  });
  onValue(dbRef(`${cloudPath()}/catalog`), (val)=>{
    state.catalog = val || { categories:{restaurant:[],personal:[]}, items:{} };
    renderGroupChips();
    renderManualCatSelect();
  });
}

// --- 寫入雲端 ---
async function pushRecord(row){
  const ref = dbRef(`${cloudPath()}/records`).push();
  row.id = row.id || ref.key;
  await ref.set(row);
}
async function setDues(dues){
  await dbRef(`${cloudPath()}/dues`).set(dues);
}
async function addCatalogItem(catId, name){
  if(!name) return;
  const key = safeKey(catId);
  const list = state.catalog.items?.[key] || [];
  if(!list.includes(name)) list.push(name);
  await dbRef(`${cloudPath()}/catalog/items/${key}`).set(list);
}

// --- 三口袋計算 ---
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
        bal.RESTAURANT -= v; // 預支：不動個人口袋，dues 呈現
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
  const elR = $('#pk-rest'), elJ=$('#pk-jack'), elW=$('#pk-wal');
  if (!elR) return;
  elR.textContent = (b.RESTAURANT||0).toLocaleString();
  elJ.textContent = (b.JACK||0).toLocaleString();
  elW.textContent = (b.WAL||0).toLocaleString();
  elR.parentElement.classList.toggle('negative', b.RESTAURANT<0);
  elJ.parentElement.classList.toggle('negative', b.JACK<0);
  elW.parentElement.classList.toggle('negative', b.WAL<0);
}

// --- Catalog/群組/項目 ---
function renderManualCatSelect(){
  const sel = $('#rec-manual-cat'); if(!sel) return;
  const RC = state.catalog?.categories?.restaurant || [];
  const PC = state.catalog?.categories?.personal || [];
  const opts = [...RC, ...PC].map(c=>`<option value="${c.id}">${c.id}</option>`).join('');
  sel.innerHTML = `<option value="">（選擇分類）</option>` + opts;
}

function renderGroupChips(){
  const g = $('#group-panel'), i = $('#items-panel');
  g.innerHTML = ''; i.style.display='none'; i.innerHTML = '';
  uiState.group = ''; uiState.catId = '';

  if (uiState.scope==='restaurant'){
    const groups = [
      {id:'revenue', name:'營業收入', emoji:'💵'},
      {id:'cogs', name:'銷貨成本', emoji:'🥬'},
      {id:'personnel', name:'人事', emoji:'👥'},
      {id:'utilities', name:'水電租網', emoji:'🏠'},
      {id:'marketing', name:'行銷', emoji:'📣'},
      {id:'logistics', name:'物流', emoji:'🚛'},
      {id:'admin', name:'行政稅務', emoji:'🧾'}
    ];
    g.innerHTML = groups.map(x=>`<button class="chip" data-group="${x.id}">${x.emoji}<br>${x.name}</button>`).join('');
  }else{
    const groups = [
      {id:'p_income', name:'個人收入', emoji:'💼'},
      {id:'p_expense', name:'個人支出', emoji:'🍔'}
    ];
    g.innerHTML = groups.map(x=>`<button class="chip" data-group="${x.id}">${x.emoji}<br>${x.name}</button>`).join('');
  }
}

// 點群組 → 畫細項分類
$('#group-panel')?.addEventListener('click', (e)=>{
  const b = e.target.closest('.chip'); if(!b) return;
  $('#group-panel .chip.active')?.classList.remove('active');
  b.classList.add('active');
  uiState.group = b.dataset.group;

  const cats = [...state.catalog.categories.restaurant, ...state.catalog.categories.personal]
    .filter(c => c.kind === uiState.group);

  const items = cats.map(c=>`<button class="chip" data-cat="${c.id}">${c.icon||'🧩'}<br>${c.label}</button>`).join('');
  $('#items-panel').style.display='block';
  $('#items-panel').innerHTML = items || '<small class="muted">（此群無細項）</small>';

  renderManualCatSelect();
});

// 點細項 → 記住 catId
$('#items-panel')?.addEventListener('click', (e)=>{
  const b = e.target.closest('.chip'); if(!b) return;
  $('#items-panel .chip.active')?.classList.remove('active');
  b.classList.add('active');
  uiState.catId = b.dataset.cat;
  $('#rec-manual-cat').value = uiState.catId;
});
function renderWhoChips(){
  const box = $('#chip-who');
  if (!box) return;
  if (uiState.io === 'income'){
    $('#lbl-who').textContent = '收款人';
    box.innerHTML = `
      <button class="chip sm active" data-who="JACK">J</button>
      <button class="chip sm" data-who="WAL">W</button>
    `;
    uiState.who = 'JACK';
  } else {
    $('#lbl-who').textContent = '付款人';
    box.innerHTML = `
      <button class="chip sm active" data-who="JACK">J</button>
      <button class="chip sm" data-who="WAL">W</button>
      <button class="chip sm" data-who="JW">JW</button>
    `;
    uiState.who = 'JACK';
  }
}

// --- 記帳提交 ---
async function postRecordFromUI(){
  const ds = $('#rec-date')?.value || todayISO();
  const ts = new Date(ds+'T12:00:00').getTime();
  const amt = Number($('#rec-amt')?.value||0);
  if (!amt) return toast('請輸入金額');

  let owner = uiState.owner;
  let cat = uiState.catId || ($('#rec-manual-cat')?.value||'');
  if (!cat) return toast('請先選群組與分類，或在下方指定分類');
  const scope = catScope(cat);
  const itemName = ($('#rec-item')?.value||'').trim();
  const note = ($('#rec-note')?.value||'').trim();
  if (itemName) await addCatalogItem(cat, itemName);

  const row = {
    id: uid(),
    type: uiState.io,
    owner,
    who: uiState.who,
    cat, amt, ts,
    note: itemName ? (note? `${itemName}｜${note}`: itemName) : note
  };
  await pushRecord(row);

  // 欠款 dues 處理（不建立 transfers）
  let dues = {...state.dues};

  if (uiState.io==='expense'){
    if (scope==='restaurant'){
      // 個人代墊餐廳：owner=J/W/JW
      if (owner==='JACK' || owner==='WAL' || owner==='JW'){
        const split = (owner==='JW') ? [['JACK',amt/2], ['WAL',amt/2]] : [[owner, amt]];
        split.forEach(([who, v]) => dues[who] = Number(dues[who]||0) + v);
        await setDues(dues);
      }
    } else {
      // 個人分類
      if (owner==='RESTAURANT'){
        // 餐廳預支個人：欠餐廳（用負數）
        const split = (uiState.who==='JW') ? [['JACK',amt/2], ['WAL',amt/2]] : [[uiState.who, amt]];
        split.forEach(([who, v]) => dues[who] = Number(dues[who]||0) - v);
        await setDues(dues);
      }
    }
  }

  // reset
  $('#rec-amt').value=''; $('#rec-item').value=''; $('#rec-note').value='';
  uiState.catId=''; uiState.group='';
  renderGroupChips(); renderPockets();
  toast('已記帳 ✅');
}

// --- 最近紀錄（簡版列表） ---
function renderRecent(){
  const list = $('#recent-list');
  const arr = [...state.records].slice(-20).reverse();
  $('#rec-count').textContent = `${state.records.length} 筆`;
  list.innerHTML = arr.map(r=>{
    const d = new Date(r.ts||Date.now()); const ds = `${d.getMonth()+1}/${d.getDate()}`;
    const sign = r.type==='income' ? '+' : '-';
    return `<li><small class="badge">${ds}</small><b>${r.cat}</b><span class="muted">${r.note||''}</span><span style="margin-left:auto">${sign}${Number(r.amt).toLocaleString()}</span></li>`;
  }).join('');
}

// --- 事件綁定 ---
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

  // 支出/收入
  $('#chip-io')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $('#chip-io .chip.active')?.classList.remove('active');
    b.classList.add('active');
    uiState.io = b.dataset.io;
    renderWhoChips();
  });

  // 用途：餐廳/個人
  $('#chip-scope')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $('#chip-scope .chip.active')?.classList.remove('active');
    b.classList.add('active');
    uiState.scope = b.dataset.scope;
    renderGroupChips();
  });

  // 點三口袋 → 設定 owner
  document.querySelector('.pockets.inline')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.pocket'); if(!btn) return;
    uiState.owner = btn.dataset.pk;
  });

  // 付款人/收款人
  $('#chip-who')?.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $('#chip-who .chip.active')?.classList.remove('active');
    b.classList.add('active');
    uiState.who = b.dataset.who;
  });

  // 送出
  $('#rec-submit')?.addEventListener('click', postRecordFromUI);

  // 初始值
  $('#rec-date')?.setAttribute('value', todayISO());
  renderWhoChips();
  renderGroupChips();
}

// --- 啟動 ---
(async function init(){
  bindEvents();
  await signIn();
  const last = localStorage.getItem('space') || '';
  if (last){ $('#space-code').value = last; connectSpace(last); }
  $('#btn-connect')?.addEventListener('click', ()=> {
    const sp = $('#space-code').value||'';
    localStorage.setItem('space', sp);
    connectSpace(sp);
  });
})();
