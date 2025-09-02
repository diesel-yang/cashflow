// ====== 極速記帳 v3.4 ======

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
    console.log('Signed in:', cred.user?.uid);
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
    renderCatalogChips();
    renderManualCatSelect();
  });
}

// --- 寫入雲端 ---
async function pushRecord(row){
  const ref = dbRef(`${cloudPath()}/records`).push();
  row.id = row.id || ref.key;
  await ref.set(row);
}
async function pushTransfer(row){
  const ref = dbRef(`${cloudPath()}/transfers`).push();
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
    if (r.type==='income'){
      if (r.owner==='RESTAURANT') bal.RESTAURANT += Number(r.amt)||0;
      if (r.owner==='JACK')       bal.JACK      += Number(r.amt)||0;
      if (r.owner==='WAL')        bal.WAL       += Number(r.amt)||0;
    }
    if (r.type==='expense'){
      const c = findCat(r.cat) || {};
      const kind = c.kind || (catScope(r.cat)==='personal' ? 'p_expense' : null);

      // 餐廳付個人分類 = 預支：不扣餐廳口袋，扣個人口袋
      if (r.owner==='RESTAURANT' && (r.who==='JACK'||r.who==='WAL') && kind==='p_expense'){
        bal[r.who] -= Number(r.amt)||0;
        continue;
      }
      // 一般支出：由 owner 扣
      if (r.owner==='RESTAURANT') bal.RESTAURANT -= Number(r.amt)||0;
      if (r.owner==='JACK')       bal.JACK      -= Number(r.amt)||0;
      if (r.owner==='WAL')        bal.WAL       -= Number(r.amt)||0;
    }
  }

  // 轉帳：支援「餐廳_...」帳戶前綴
  for(const t of state.transfers){
    const amt = Number(t.amt)||0;
    const from = t.from||'', to=t.to||'';
    if (from==='JACK') bal.JACK -= amt;
    if (to  ==='JACK') bal.JACK += amt;
    if (from==='WAL')  bal.WAL  -= amt;
    if (to  ==='WAL')  bal.WAL  += amt;
    if ((from||'').startsWith('餐廳_')) bal.RESTAURANT -= amt;
    if ((to  ||'').startsWith('餐廳_')) bal.RESTAURANT += amt;
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

// --- Catalog → 畫分類方塊 & 項目 ---
let selectedCatId = '';
function renderCatalogChips(){
  const r = $('#cats-restaurant'), p = $('#cats-personal');
  const RC = state.catalog?.categories?.restaurant || [];
  const PC = state.catalog?.categories?.personal || [];
  r.innerHTML = RC.map(c=>`<button class="chip" data-cat="${c.id}">${c.icon||'📦'}<br>${c.label}</button>`).join('') || '<small class="muted">（尚無餐廳分類）</small>';
  p.innerHTML = PC.map(c=>`<button class="chip" data-cat="${c.id}">${c.icon||'🧩'}<br>${c.label}</button>`).join('') || '<small class="muted">（尚無個人分類）</small>';
}
function renderManualCatSelect(){
  const sel = $('#rec-manual-cat'); if(!sel) return;
  const RC = state.catalog?.categories?.restaurant || [];
  const PC = state.catalog?.categories?.personal || [];
  const opts = [...RC, ...PC].map(c=>`<option value="${c.id}">${c.id}</option>`).join('');
  sel.innerHTML = `<option value="">（選擇分類）</option>` + opts;
}
function openItemsOf(catId){
  selectedCatId = catId;
  const key = safeKey(catId);
  const items = state.catalog?.items?.[key] || [];
  $('#items-grid').innerHTML = items.length ? items.map(n=>`<button class="chip" data-item="${n}">${n}</button>`).join('') : '<small class="muted">此分類暫無項目，請在下方手動新增</small>';
  $('#items-panel').style.display = 'block';
  $('#items-subtitle').textContent = `（${catId}）`;
  const sel = $('#rec-manual-cat'); if (sel) sel.value = catId;
}

// --- 記帳提交 ---
async function postRecordFromUI(){
  const isExpense = $('#io-exp')?.checked;
  const ds = $('#rec-date')?.value || todayISO();
  const ts = new Date(ds+'T12:00:00').getTime();
  const amt = Number($('#rec-amt')?.value||0);
  const who = $('#rec-who')?.value || 'RESTAURANT';

  // 分類與項目
  let cat = selectedCatId || ($('#rec-manual-cat')?.value||'');
  const itemName = ($('#rec-item')?.value||'').trim();
  const note = ($('#rec-note')?.value||'').trim();

  if (!amt) return toast('請輸入金額');
  if (!cat) return toast('請先選分類或指定分類');
  const catInfo = findCat(cat) || {};
  const scope = catScope(cat);

  let owner = $('#rec-owner')?.value || (isExpense? 'RESTAURANT':'RESTAURANT');

  // 關鍵邏輯：記帳 owner / who 的決定
  if (isExpense){
    if (scope==='restaurant'){
      // 無論誰付錢，P&L 應記餐廳 → owner 固定為 RESTAURANT；who = 付款人（決定是否代墊）
      owner = 'RESTAURANT';
    }else{
      // 個人分類：由實際出錢的口袋承擔
      // 若 owner=RESTAURANT 且 who=JACK/WAL → 預支（餐廳代付個人）
      // 若 owner=JACK/WAL → 純個人消費
    }
  }else{
    // 收入：進入 owner 指定口袋
  }

  const row = {
    id: uid(),
    type: isExpense? 'expense':'income',
    owner, who, cat, amt,
    note: itemName ? `${itemName}${note?`｜${note}`:''}` : note,
    ts
  };

  await pushRecord(row);

  // 影子轉帳 / 報銷：個人代墊餐廳
  if (isExpense && scope==='restaurant' && (who==='JACK'||who==='WAL')){
    // 個人刷卡替餐廳買 → 增加 dues & 影子轉帳（個人→餐廳_銀行）
    await pushTransfer({ id: uid(), type:'transfer', from: who, to:'餐廳_銀行', amt, ts, note:'[代墊] 個人→餐廳' });
    const dues = {...state.dues};
    dues[who] = Number(dues[who]||0) + amt;
    await setDues(dues);
  }

  // 餐廳代付個人（預支）：owner=RESTAURANT + 個人分類 + who=JACK/WAL → 將 dues 視為個人欠餐廳
  if (isExpense && scope==='personal' && owner==='RESTAURANT' && (who==='JACK'||who==='WAL')){
    const dues = {...state.dues};
    dues[who] = Number(dues[who]||0) - amt; // 欠餐廳：用負數表示（或你喜歡可以分2欄）
    await setDues(dues);
  }

  // 新增手動項目 → 寫回 catalog
  if (itemName) await addCatalogItem(cat, itemName);

  // reset
  $('#rec-amt').value=''; $('#rec-item').value=''; $('#rec-note').value='';
  $$('#items-grid .chip').forEach(b=>b.classList.remove('active'));
  $$('.chip').forEach(b=>b.classList.remove('active'));
  selectedCatId='';
  renderPockets();
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
  $('#btn-connect')?.addEventListener('click', ()=> connectSpace($('#space-code').value||''));
  $('#io-exp')?.addEventListener('change', ()=> $('#lbl-owner').textContent='付費口袋');
  $('#io-inc')?.addEventListener('change', ()=> $('#lbl-owner').textContent='入帳口袋');
  $('#rec-date')?.setAttribute('value', todayISO());

  // 點分類 → 展開項目
  $('#cats-restaurant')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip'); if(!btn) return;
    $$('#cats-restaurant .chip, #cats-personal .chip').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); openItemsOf(btn.dataset.cat);
  });
  $('#cats-personal')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip'); if(!btn) return;
    $$('#cats-restaurant .chip, #cats-personal .chip').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); openItemsOf(btn.dataset.cat);
  });

  // 點項目 → 帶入名稱
  $('#items-grid')?.addEventListener('click', (e)=>{
    const it = e.target.closest('.chip'); if(!it) return;
    $('#rec-item').value = it.dataset.item || '';
    $$('#items-grid .chip').forEach(b=>b.classList.remove('active'));
    it.classList.add('active');
  });

  $('#rec-submit')?.addEventListener('click', postRecordFromUI);

  // 點口袋 → 快速切 owner
  document.querySelector('.pockets')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.pocket'); if(!btn) return;
    const pk = btn.dataset.pk;
    const isExpense = $('#io-exp')?.checked;
    $('#rec-owner').value = pk;
  });
}

// --- 啟動 ---
(async function init(){
  bindEvents();
  await signIn();
  // 可填入上次使用的 space
  const last = localStorage.getItem('space') || '';
  if (last){ $('#space-code').value = last; connectSpace(last); }
  $('#btn-connect')?.addEventListener('click', ()=> localStorage.setItem('space', $('#space-code').value||''));
})();
