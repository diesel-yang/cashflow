/* app.js v4.0 — 區塊模板化 + 自適應 + 小豬2x嵌入金額 + 送出自動寫回 + 即時監聽 */
(function () {
  // ---------- Firebase 初始化（compat，最穩定） ----------
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
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  const auth = firebase.auth();

  // ---------- DOM utils ----------
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const money = n => (Number(n)||0).toLocaleString('zh-TW');

  // ---------- 狀態 ----------
  const state = {
    space: localStorage.getItem('CF_SPACE') || "",
    io: "expense",
    scope: "restaurant",
    group: "",
    item: "",
    payer: "",
    pocket: "restaurant",
    catalog: [],
    catalogIndex: { restaurant:[], personal:[] },
  };

  // ---------- 群組/圖示 ----------
  const REST_GROUPS = ['營業收入','銷貨成本','人事','水電/租金/網路','行銷','物流/運輸','行政/稅務'];
  const PERS_INCOME_GROUPS  = ['薪資收入','投資獲利','其他收入'];
  const PERS_EXPENSE_GROUPS = ['飲食','治裝','住房','交通','教育','娛樂','稅捐','醫療','其他支出'];
  const GROUP_ICON_MAP = {
    '營業收入':'💰','銷貨成本':'📦','人事':'🧑‍🍳','水電/租金/網路':'🏠','行銷':'📣','物流/運輸':'🚚','行政/稅務':'🧾',
    '薪資收入':'💼','投資獲利':'📈','其他收入':'🎁','飲食':'🍜','治裝':'👕','住房':'🏠','交通':'🚗','教育':'📚','娛樂':'🎬','稅捐':'💸','醫療':'🩺','其他支出':'🧩'
  };
  function groupsFor(io, scope){
    if(scope==='restaurant')
      return (io==='income') ? ['營業收入'] : REST_GROUPS.filter(g=>g!=='營業收入');
    return (io==='income') ? PERS_INCOME_GROUPS : PERS_EXPENSE_GROUPS;
  }
  function normalizeKind(k){
    if(!k) return '';
    if(k==='餐廳收入') return '營業收入';
    if(k==='其他')     return '其他支出';
    const alias = { '水電租網':'水電/租金/網路','物流運輸':'物流/運輸','行政稅務':'行政/稅務' };
    return alias[k] || k;
  }

  // ---------- Room / Catalog ----------
  let roomRef = null;
  async function ensureAuth(){ try{ await auth.signInAnonymously(); }catch(e){} }
  async function ensureRoom(code){
    if(!code) throw new Error('no-room-code');
    await ensureAuth();
    roomRef = db.ref(`rooms/${code}`);
    await roomRef.child('_ts').set(firebase.database.ServerValue.TIMESTAMP);
    // 若無 catalog 放入空陣列
    const cSnap = await roomRef.child('catalog').get();
    state.catalog = cSnap.exists()? cSnap.val() : [];
    if(!Array.isArray(state.catalog)){
      state.catalog = [].concat(
        state.catalog?.categories?.restaurant||[],
        state.catalog?.categories?.personal||[],
        state.catalog?.categories||[]
      );
      await roomRef.child('catalog').set(state.catalog);
    }
    buildCatalogIndex(state.catalog);
  }
  function buildCatalogIndex(raw){
    const by={restaurant:[], personal:[]};
    (raw||[]).forEach(x=>{
      const item = { id:x.id||x.label, label:x.label||x.id, kind:normalizeKind(x.kind), icon:x.icon||'' };
      if(REST_GROUPS.includes(item.kind)) by.restaurant.push(item); else by.personal.push(item);
    });
    state.catalogIndex = by;
  }
  function categoriesFor(scope, group){
    const pool = scope==='restaurant'? state.catalogIndex.restaurant : state.catalogIndex.personal;
    return pool.filter(c=>c.kind===group);
  }

  // ---------- UI：口袋 ----------
  const POCKETS=[{key:'restaurant',name:'餐廳'},{key:'jack',name:'Jack'},{key:'wal',name:'Wal'}];
  function renderPockets(){
    const host=byId('pockets-row'); if(!host) return;
    host.innerHTML=POCKETS.map(p=>`
      <button class="pocket" data-pocket="${p.key}" aria-pressed="false">
        <svg class="pig" viewBox="0 0 167 139" aria-hidden="true"><use href="#pig-icon"/></svg>
        <div class="amt-in" id="amt-${p.key}">0</div>
        <div class="name">${p.name}</div>
      </button>
    `).join('');
    setActivePocket(state.pocket || 'restaurant');
    host.onclick=e=>{
      const btn=e.target.closest('[data-pocket]'); if(!btn) return;
      setActivePocket(btn.dataset.pocket);
    };
  }
  function setActivePocket(key){
    state.pocket=key;
    $$('#pockets-row .pocket').forEach(el=>{
      const on = el.dataset.pocket===key;
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', on?'true':'false');
    });
  }
  function updatePocketAmounts(bal){
    for(const p of POCKETS){
      const el=byId(`amt-${p.key}`); if(!el) continue;
      const val = Number(bal[p.key])||0;
      el.textContent = money(val);
      const card = el.closest('.pocket');
      card.classList.toggle('positive', val>=0);
      card.classList.toggle('negative', val<0);
    }
  }
  function sumBalances(records){
    const bal={restaurant:0,jack:0,wal:0};
    for(const r of records){
      const delta=(r.io==='income'?1:-1)*(Number(r.amount||r.amt)||0);
      if (r.pocket && bal[r.pocket] != null) bal[r.pocket]+=delta;
    }
    return bal;
  }
  function watchBalances(){
    if(!roomRef) return;
    roomRef.child('records').orderByChild('ts').limitToLast(500).on('value', snap=>{
      const arr=[]; snap.forEach(ch=>arr.push(ch.val()));
      updatePocketAmounts(sumBalances(arr));
    });
  }

  // ---------- UI：付款人 ----------
  function renderPayers(){
    const row=byId('payers-row'); if(!row) return;
    const data = (state.io==='income')
      ? [{key:'Jack',label:'Jack',icon:'👤'},{key:'Wal',label:'Wal',icon:'👤'}]
      : [{key:'J',label:'J',icon:'👤'},{key:'W',label:'W',icon:'👤'},{key:'JW',label:'JW',icon:'👥'}];
    row.innerHTML=data.map(x=>`<button class="chip pill lg" data-payer="${x.key}">
      <span>${x.icon}</span> <span>${x.label}</span></button>`).join('');
    row.onclick=e=>{
      const btn=e.target.closest('[data-payer]'); if(!btn) return;
      $$('#payers-row .chip').forEach(x=>x.classList.toggle('active', x===btn));
      state.payer=btn.dataset.payer;
    };
  }

  // ---------- UI：類別 / 項目 ----------
  function renderGroups(){
    const box=byId('group-grid'); if(!box) return;
    box.innerHTML=groupsFor(state.io,state.scope).map(g=>{
      const icon=GROUP_ICON_MAP[g]||''; 
      return `<button class="chip pressable" data-group="${g}">
        <span>${icon}</span><span>${g}</span></button>`;
    }).join('');
    box.onclick=e=>{
      const btn=e.target.closest('[data-group]'); if(!btn) return;
      $$('#group-grid .chip').forEach(x=>x.classList.toggle('active', x===btn));
      state.group=btn.dataset.group; state.item=''; renderItems();
    };
  }
  function renderItems(){
    const box=byId('items-grid'); if(!box) return;
    if(!state.group){ box.innerHTML=`<div class="muted">（請先選類別）</div>`; return; }
    const items=categoriesFor(state.scope,state.group);
    box.innerHTML=items.map(it=>{
      const icon=it.icon?`<span>${it.icon}</span>`:'';
      return `<button class="chip pressable" data-item="${it.label}">${icon}<span>${it.label}</span></button>`;
    }).join('')||`<div class="muted">（暫無項目，可上方輸入新增）</div>`;
    box.onclick=e=>{
      const btn=e.target.closest('[data-item]'); if(!btn) return;
      $$('#items-grid .chip').forEach(x=>x.classList.toggle('active', x===btn));
      state.item=btn.dataset.item;
    };
  }

  // ---------- 最近一個月 ----------
  function watchRecent(){
    if(!roomRef) return;
    const list = byId('recent-list'); if(!list) return;
    const since = Date.now() - 30*24*60*60*1000;
    roomRef.child('records').orderByChild('ts').startAt(since).on('value', snap=>{
      const rows=[]; snap.forEach(ch=>rows.push(ch.val())); rows.sort((a,b)=>b.ts-a.ts);
      list.innerHTML = rows.map(r=>{
        const sign = r.io==='expense'?'-':'+';
        const d = r.date || new Date(r.ts).toLocaleDateString('zh-TW');
        return `<div class="row">
          <div class="r-date">${d}</div>
          <div>${(r.scope==='restaurant'?'餐廳':'個人')}・${r.group}${r.item? '・'+r.item:''}</div>
          <div class="r-amt ${r.io==='expense'?'neg':'pos'}">${sign}${money(r.amount || r.amt)}</div>
        </div>`;
      }).join('') || `<div class="muted">（尚無記錄）</div>`;
    });
    byId('btn-toggle-recent')?.addEventListener('click',()=>{
      list.classList.toggle('collapse');
    });
  }

  // ---------- 送出：同時寫入記錄、若新項目則寫回 catalog ----------
  byId('btn-submit')?.addEventListener('click', async ()=>{
    if(!roomRef) return alert('請先連線');
    const amt = Number((byId('rec-amt')?.value||'').replace(/[^\d.-]/g,''))||0;
    if(!amt) return alert('請輸入金額');
    if(!state.pocket || !state.payer) return alert('請選口袋與付款/收款人');

    const dateStr = byId('rec-date')?.value || new Date().toISOString().slice(0,10);
    const note    = byId('rec-note')?.value || '';
    // 若輸入了「新增項目名稱」就當成本次 item 並自動寫回
    const newName = (byId('new-cat-name')?.value||'').trim();
    if(newName) state.item = newName;

    const rec = {
      ts: Date.now(),
      date: dateStr,
      amount: amt,
      io: state.io,
      scope: state.scope,
      group: state.group,
      item: state.item,
      payer: state.payer,
      pocket: state.pocket,
      note
    };

    const id = roomRef.child('records').push().key;
    const updates = {};
    updates[`records/${id}`] = rec;
    // 口袋餘額即時加總
    const delta = (state.io==='income'?1:-1) * amt;
    updates[`balances/${state.pocket}`] = firebase.database.ServerValue.increment(delta);

    // 若新項目需寫回 catalog
    if(newName){
      let icon='',label=newName;
      const m=newName.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.+)$/u);
      if(m){icon=m[1];label=m[2].trim();}
      state.catalog.push({id:label,label,kind:state.group,icon});
      updates[`catalog`] = state.catalog;
    }

    await roomRef.update(updates);
    byId('rec-amt').value=''; byId('rec-note').value=''; byId('new-cat-name').value='';
    alert('已送出');
  });

  // ---------- 分頁 / IO / 用途 ----------
  function bindTabs(){
    $$('.tab').forEach(tab=>{
      tab.addEventListener('click', ()=>{
        const target = tab.getAttribute('data-target');
        $$('.tab').forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        $$('.page').forEach(p=>p.classList.remove('show'));
        if(target) byId(target)?.classList.add('show');
      });
    });
  }
  function bindIOChips(){
    const wrap = byId('chip-io'); if(!wrap) return;
    wrap.addEventListener('click',e=>{
      const btn=e.target.closest('[data-io]'); if(!btn) return;
      $$('#chip-io .chip').forEach(x=>x.classList.toggle('active', x===btn));
      state.io = btn.dataset.io;
      renderPayers(); renderGroups(); renderItems();
    });
  }
  function bindScopeChips(){
    const wrap = byId('chip-scope'); if(!wrap) return;
    wrap.addEventListener('click',e=>{
      const btn=e.target.closest('[data-scope]'); if(!btn) return;
      $$('#chip-scope .chip').forEach(x=>x.classList.toggle('active', x===btn));
      state.scope = btn.dataset.scope;
      state.group=''; state.item='';
      renderGroups(); renderItems();
    });
  }

  // ---------- 連線 ----------
  const btnConnect = byId('btn-connect');
  async function doConnect(){
    const code = (byId('space-code')?.value||'').trim();
    if(!code) return alert('請輸入共享代號');
    try{
      await ensureRoom(code);
      renderPockets(); renderPayers(); renderGroups(); renderItems();
      watchRecent(); watchBalances();
      btnConnect.classList.remove('danger'); btnConnect.classList.add('success');
      btnConnect.textContent = '已連線';
      localStorage.setItem('CF_SPACE', code);
      state.space = code;
    }catch(err){
      console.error(err);
      alert('連線失敗：' + (err?.message || 'Permission denied'));
    }
  }
  btnConnect?.addEventListener('click', doConnect);
  byId('space-code')?.addEventListener('keydown', e=>{ if(e.key==='Enter') doConnect(); });

  // ---------- 開機 ----------
  (async function boot(){
    bindTabs(); bindIOChips(); bindScopeChips();
    renderPockets(); renderPayers(); renderGroups(); renderItems();

    // 初始化預設 chip 高亮
    $('#chip-io [data-io="expense"]')?.classList.add('active');
    $('#chip-scope [data-scope="restaurant"]')?.classList.add('active');

    // 還原房號自動連線
    if(state.space){
      byId('space-code').value = state.space;
      try{
        await ensureRoom(state.space);
        renderPockets(); renderPayers(); renderGroups(); renderItems();
        watchRecent(); watchBalances();
        btnConnect.classList.remove('danger'); btnConnect.classList.add('success');
        btnConnect.textContent = '已連線';
      }catch(e){
        btnConnect.classList.add('danger');
      }
    }else{
      btnConnect.classList.add('danger');
    }
  })();
})();
