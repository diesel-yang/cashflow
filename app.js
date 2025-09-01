const { createApp, ref, computed } = Vue;

window.__cf_toast__ = function(msg){
  try{
    const t = document.getElementById('toast');
    if(!t){ alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=> t.classList.remove('show'), 1800);
  }catch(e){ alert(msg); }
};

const storage = localforage.createInstance({ name:'cashflow', storeName:'records' });
const receipts = localforage.createInstance({ name:'cashflow', storeName:'receipts' });
const settingsStore = localforage.createInstance({ name:'cashflow', storeName:'settings' });
function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2,8); }
function monthKey(d){ return d.slice(0,7); }

const DEFAULT_SETTINGS = {
  warnThreshold: 0.9,
  categories: {
    restaurant: [
      { label: '現場銷售', type: 'revenue' },
      { label: '外送平台', type: 'revenue' },
      { label: '批發/通路', type: 'revenue' },
      { label: '其他收入', type: 'revenue' },
      { label: '食材-肉類', type: 'cogs' },
      { label: '食材-蔬果', type: 'cogs' },
      { label: '海鮮', type: 'cogs' },
      { label: '調味/乾貨', type: 'cogs' },
      { label: '飲品原料', type: 'cogs' },
      { label: '包材', type: 'cogs' },
      { label: '清潔耗材', type: 'cogs' },
      { label: '正職薪資', type: 'personnel' },
      { label: '勞健保', type: 'personnel' },
      { label: '獎金/三節', type: 'personnel' },
      { label: '租金', type: 'utilities' },
      { label: '水費', type: 'utilities' },
      { label: '電費', type: 'utilities' },
      { label: '瓦斯', type: 'utilities' },
      { label: '網路/手機', type: 'utilities' },
      { label: '設備購置', type: 'utilities' },
      { label: '維修', type: 'utilities' },
      { label: '工具器具', type: 'utilities' },
      { label: '外送平台抽成', type: 'utilities' },
      { label: '廣告行銷', type: 'marketing' },
      { label: '拍攝設計', type: 'marketing' },
      { label: '活動攤費', type: 'marketing' },
      { label: '物流運費', type: 'logistics' },
      { label: '油資', type: 'logistics' },
      { label: '停車', type: 'logistics' },
      { label: '稅捐(5%)', type: 'admin' },
      { label: '記帳/法律', type: 'admin' },
      { label: '金流手續費', type: 'admin' },
      { label: '銀行手續費', type: 'admin' },
      { label: '交際應酬', type: 'admin' },
      { label: '雜項', type: 'admin' }
    ],
    personal: [
      { label: '餐飲', type: 'expense' },
      { label: '交通', type: 'expense' },
      { label: '油資', type: 'expense' },
      { label: '停車', type: 'expense' },
      { label: '育樂', type: 'expense' },
      { label: '醫療', type: 'expense' },
      { label: '3C/家居', type: 'expense' },
      { label: '稅費', type: 'expense' },
      { label: '投資/儲蓄', type: 'expense' },
      { label: '收入-薪資', type: 'income' },
      { label: '收入-其他', type: 'income' }
    ]
  },
  quicks: [
    { label: '午餐 120 (JACK)', type: 'expense', category: '餐飲', amount: 120, mode: 'personal-JACK', autoSave: false },
    { label: '捷運 30 (JACK)',  type: 'expense', category: '交通', amount: 30,  mode: 'personal-JACK', autoSave: false },
    { label: '咖啡 65 (WAL)',   type: 'expense', category: '餐飲', amount: 65,  mode: 'personal-WAL',  autoSave: false },
    { label: '外送平台收入 +1500', type: 'income',  category: '外送平台', amount: 1500, mode: 'restaurant', autoSave: false }
  ],
  remoteUrl: ''
};

function normalizeSettings(s){
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if(s && typeof s==='object'){
    for(const k of Object.keys(s)){
      if(k==='categories'){
        if(s.categories && typeof s.categories==='object'){
          base.categories.restaurant = Array.isArray(s.categories.restaurant) && s.categories.restaurant.length ? s.categories.restaurant : base.categories.restaurant;
          base.categories.personal   = Array.isArray(s.categories.personal)   && s.categories.personal.length   ? s.categories.personal   : base.categories.personal;
        }
      }else{
        base[k]=s[k];
      }
    }
  }
  if(!Array.isArray(base.quicks)) base.quicks = [];
  return base;
}

createApp({
  setup(){
    const tab = ref('input');
    function setTab(t){ tab.value=t; window.scrollTo({top:0, behavior:'instant'}); }

    const date = ref(new Date().toISOString().slice(0,10));
    const cursor = ref(monthKey(date.value));
    const currentMonthLabel = computed(()=>{ const [y,m]=cursor.value.split('-'); return `${y}年${m}月`; });
    const monthPicker = ref(null);
    function openMonthPicker(){ try{ monthPicker.value && (monthPicker.value.showPicker ? monthPicker.value.showPicker() : monthPicker.value.click()); }catch{ monthPicker.value && monthPicker.value.click(); } }
    function onMonthPicked(e){ const v=e.target.value; if(v && /\d{4}-\d{2}/.test(v)) cursor.value=v; }
    function prevMonth(){ const [y,m]=cursor.value.split('-').map(Number); cursor.value=new Date(y,m-2,1).toISOString().slice(0,7); }
    function nextMonth(){ const [y,m]=cursor.value.split('-').map(Number); cursor.value=new Date(y,m,1).toISOString().slice(0,7); }

    const settings = ref(normalizeSettings(null));
    const categories = ref(settings.value.categories);

    function catTypeOf(label){
      label = (label||'').trim();
      for(const arr of [categories.value.restaurant, categories.value.personal]){
        const f = arr.find(x=>x.label===label);
        if(f) return f.type;
      }
      return null;
    }

    // 記帳欄位
    const type = ref('expense');
    const mode = ref('restaurant');
    const amountStr = ref('');
    const category = ref('餐飲');
    const vendor = ref('');
    const note = ref('');
    const isReimburse = ref(false);
    const receiptDataUrl = ref(null);
    const hasReceipt = computed(()=> !!receiptDataUrl.value);

    function applyQuick(q){
      type.value = q.type; category.value = q.category; amountStr.value = String(q.amount);
      mode.value = q.mode; note.value = q.note || ''; vendor.value = q.vendor || '';
      if (q.autoSave) save(); else window.__cf_toast__('已帶入快捷內容');
    }

    // 快捷管理（新增/刪除/排序）
    const newQuick = ref({ label:'', type:'expense', category:'餐飲', amount:0, mode:'personal-JACK', autoSave:false });
    function addQuick(){
      const q = { ...newQuick.value };
      if(!q.label || !q.category || !q.amount) return alert('請完整填寫快捷');
      const i = settings.value.quicks.findIndex(x=>x.label===q.label);
      if(i>=0) settings.value.quicks[i]=q; else settings.value.quicks.push(q);
      newQuick.value = { label:'', type:'expense', category:'餐飲', amount:0, mode:'personal-JACK', autoSave:false };
      window.__cf_toast__('已新增/覆寫快捷');
      saveSettings();
    }
    function editQuick(idx){ newQuick.value = { ...settings.value.quicks[idx] }; window.__cf_toast__('已帶入至表單，可修改後存回'); }
    function delQuick(idx){ settings.value.quicks.splice(idx,1); window.__cf_toast__('已刪除快捷'); saveSettings(); }
    function moveQuick(idx, dir){
      const j = idx + dir; if(j<0 || j>=settings.value.quicks.length) return;
      const arr = settings.value.quicks;
      const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
      window.__cf_toast__('已調整排序'); saveSettings();
    }

    function applyVendorRule(){
      const t=(vendor.value||'').toLowerCase();
      if(t.includes('uber')){ mode.value='restaurant'; category.value='外送平台抽成'; }
      if(t.includes('全聯')){ mode.value='personal-JACK'; category.value='餐飲'; }
    }

    const allRecords = ref([]);
    const monthRecords = computed(()=> allRecords.value.filter(r=> monthKey(r.date)===cursor.value));
    const sumIncome = computed(()=> monthRecords.value.filter(r=>r.type==='income').reduce((a,b)=>a+b.amount,0));
    const sumExpense = computed(()=> monthRecords.value.filter(r=>r.type==='expense').reduce((a,b)=>a+b.amount,0));
    const net = computed(()=> sumIncome.value - sumExpense.value);

    // 應付（轉帳自動沖銷）
    const dueJACK = computed(()=> monthRecords.value.filter(r=>r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to==='JACK').reduce((a,b)=> a + (typeof b.settlement.remaining==='number' ? b.settlement.remaining : b.amount),0));
    const dueWAL  = computed(()=> monthRecords.value.filter(r=>r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to==='WAL' ).reduce((a,b)=> a + (typeof b.settlement.remaining==='number' ? b.settlement.remaining : b.amount),0));

    // P&L（餐廳）+ 類型小計/明細
    const restRecs = computed(()=> monthRecords.value.filter(r=> r.entity==='restaurant' && (r.type==='income' || r.type==='expense')));
    const pl = computed(()=>{
      const buckets = { revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0 };
      for(const r of restRecs.value){
        const t = catTypeOf(r.category) || (r.type==='income' ? 'revenue' : 'admin');
        if(r.type==='income'){
          if(t==='revenue') buckets.revenue += r.amount;
          else buckets.admin += r.amount; // 其他收入暫歸 admin
        }else{
          if (t in buckets) buckets[t] += r.amount;
          else buckets.admin += r.amount;
        }
      }
      const gp = buckets.revenue - buckets.cogs;
      const op = gp - (buckets.personnel + buckets.utilities + buckets.marketing + buckets.logistics + buckets.admin);
      return { ...buckets, gp, op };
    });
    const plPerc = computed(()=>{
      const rev = pl.value.revenue || 1;
      const pct = v => Math.round((v/rev)*1000)/10; // 1 位小數
      return { cogs: pct(pl.value.cogs), personnel: pct(pl.value.personnel), gp: pct(pl.value.gp) };
    });

    // 類型設定/明細
    const plTypes = ref([
      { key:'revenue',   label:'Revenue（營業收入）', sign:'+' },
      { key:'cogs',      label:'COGS（銷貨成本）', sign:'-' },
      { key:'personnel', label:'Personnel（人事）', sign:'-' },
      { key:'utilities', label:'Utilities（水電房租）', sign:'-' },
      { key:'marketing', label:'Marketing（行銷）', sign:'-' },
      { key:'logistics', label:'Logistics（物流交通）', sign:'-' },
      { key:'admin',     label:'Admin（行政財務）', sign:'-' }
    ]);
    const expanded = ref({ revenue:false,cogs:false,personnel:false,utilities:false,marketing:false,logistics:false,admin:false });
    function toggleDetail(k){ expanded.value[k] = !expanded.value[k]; }
    const detailByType = computed(()=>{
      const map = { revenue:[],cogs:[],personnel:[],utilities:[],marketing:[],logistics:[],admin:[] };
      for(const r of restRecs.value){
        const t = catTypeOf(r.category) || (r.type==='income'?'revenue':'admin');
        map[t].push(r);
      }
      // 依日期排序
      Object.keys(map).forEach(k=> map[k].sort((a,b)=> a.date<b.date?-1:1));
      return map;
    });
    const typeTotals = computed(()=>{
      return {
        revenue: detailByType.value.revenue.filter(r=>r.type==='income').reduce((a,b)=>a+b.amount,0),
        cogs:    detailByType.value.cogs.reduce((a,b)=>a+(b.type==='expense'?b.amount:0),0),
        personnel: detailByType.value.personnel.reduce((a,b)=>a+(b.type==='expense'?b.amount:0),0),
        utilities: detailByType.value.utilities.reduce((a,b)=>a+(b.type==='expense'?b.amount:0),0),
        marketing: detailByType.value.marketing.reduce((a,b)=>a+(b.type==='expense'?b.amount:0),0),
        logistics: detailByType.value.logistics.reduce((a,b)=>a+(b.type==='expense'?b.amount:0),0),
        admin:     detailByType.value.admin.reduce((a,b)=>a+(b.type==='expense'?b.amount:0),0)
      };
    });
    const typeCounts = computed(()=>{
      const out={}; for(const t of plTypes.value){ out[t.key]=detailByType.value[t.key].length; } return out;
    });

    // 載入/儲存
    async function load(){
      try{
        const s = await settingsStore.getItem('settings');
        if(s) Object.assign(settings.value, normalizeSettings(s));
        categories.value = settings.value.categories;
      }catch(e){
        settings.value = normalizeSettings(null);
        categories.value = settings.value.categories;
      }
      const arr=[]; await storage.iterate((v,k)=>arr.push(v)); allRecords.value = arr;
    }

    function onReceipt(e){
      const f=e.target.files&&e.target.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{ receiptDataUrl.value=r.result; window.__cf_toast__('憑證已附'); };
      r.readAsDataURL(f);
    }

    async function save(){
      const amt = Number(amountStr.value); if(!amt || amt<=0) return alert('請輸入金額');
      const base = { type:type.value, category:category.value, amount:Math.round(amt), date:date.value, vendor:vendor.value||'', note:note.value||'' };
      if(mode.value==='personal-JW'){
        const jackAmt = Math.floor(base.amount/2), walAmt = base.amount - jackAmt;
        const recJ = { id:uuid(), ...base, entity:'personal', person:'JACK', amount:jackAmt };
        const recW = { id:uuid(), ...base, entity:'personal', person:'WAL',  amount:walAmt };
        await storage.setItem(recJ.id, recJ); await storage.setItem(recW.id, recW); allRecords.value.push(recJ,recW);
      }else{
        const rec = { id:uuid(), ...base, entity: (mode.value==='restaurant'?'restaurant':'personal'), person:(mode.value==='personal-JACK'?'JACK':(mode.value==='personal-WAL'?'WAL':null)) };
        if (isReimburse.value && rec.entity==='restaurant' && rec.type==='expense') {
          rec.link_id = uuid();
          rec.settlement = { status:'unpaid', due_to: rec.person||'JACK', remaining: rec.amount };
        }
        await storage.setItem(rec.id, rec); allRecords.value.push(rec);
        if(receiptDataUrl.value){
          await receipts.setItem(rec.id, receiptDataUrl.value);
          rec.receipt_id = rec.id;
          await storage.setItem(rec.id, rec);
        }
      }
      amountStr.value=''; note.value=''; vendor.value=''; receiptDataUrl.value=null;
      window.__cf_toast__('已記錄');
    }

    // 轉帳 + 自動沖銷
    const fromAccount = ref('餐廳_銀行'); const toAccount = ref('JACK');
    const transferAmountStr = ref(''); const transferDate = ref(new Date().toISOString().slice(0,10)); const transferNote = ref('');
    async function saveTransfer(){
      const amt = Number(transferAmountStr.value); if(!amt || amt<=0) return alert('請輸入金額');
      const rec = { id:uuid(), type:'transfer', entity:'restaurant', amount:Math.round(amt), date:transferDate.value, transfer:{from:fromAccount.value, to:toAccount.value}, note:transferNote.value||'' };
      await storage.setItem(rec.id, rec); allRecords.value.push(rec);
      if(toAccount.value==='JACK' || toAccount.value==='WAL') await autoSettle(toAccount.value, rec.amount);
      transferAmountStr.value=''; transferNote.value='';
      window.__cf_toast__('已建立轉帳並自動沖銷');
    }
    async function autoSettle(personKey, payAmount){
      let remaining = payAmount;
      const targets = allRecords.value
        .filter(r=> r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to===personKey)
        .sort((a,b)=> a.date < b.date ? -1 : 1);
      for(const r of targets){
        const left = (typeof r.settlement.remaining==='number') ? r.settlement.remaining : r.amount;
        if(remaining <= 0) break;
        if(remaining >= left){
          r.settlement.status='paid'; r.settlement.remaining=0; remaining-=left;
        } else {
          r.settlement.status='partial'; r.settlement.remaining = left-remaining; remaining = 0;
        }
        await storage.setItem(r.id, r);
      }
    }

    // CSV/同步（精簡）
    function parseCSVLine(line){
      const out=[]; let cur='',q=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch=='"'){
          if(q && line[i+1]=='"'){ cur+='"'; i++; }
          else { q=!q; }
          continue;
        }
        if(ch===',' && !q){ out.push(cur); cur=''; }
        else cur+=ch;
      }
      out.push(cur);
      return out.map(s=>s.trim());
    }
    function exportCSV(scope){
      const recs = scope==='month' ? monthRecords.value : allRecords.value.slice().sort((a,b)=> a.date < b.date ? -1 : 1);
      const headers=['id','type','entity','person','category','amount','date','vendor','note','settlement.status','settlement.due_to','settlement.remaining','transfer.from','transfer.to','receipt_id'];
      const lines=[headers.join(',')];
      for(const r of recs){
        const row=[r.id,r.type,r.entity||'',r.person||'',r.category||'',r.amount,r.date,(r.vendor||'').replace(/,/g,' '),(r.note||'').replace(/,/g,' '),
          r.settlement? r.settlement.status:'',r.settlement? r.settlement.due_to:'',r.settlement? (typeof r.settlement.remaining==='number'? r.settlement.remaining:''):'',
          r.transfer? r.transfer.from:'',r.transfer? r.transfer.to:'',r.receipt_id||''];
        lines.push(row.map(v=> (typeof v==='string' && (v.includes(' ')||v.includes(','))) ? '"'+v.replace(/"/g,'""')+'"' : v).join(','));
      }
      const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download= scope==='month'? ('cashflow_'+cursor.value+'.csv') : 'cashflow_all.csv'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function importCSV(evt){
      const f = evt.target.files && evt.target.files[0]; if(!f) return;
      const text = await f.text(); const rows = text.split(/\r?\n/).filter(x=>x.trim().length>0);
      const header = parseCSVLine(rows.shift()); const idx=(n)=> header.indexOf(n);
      let imported=0,updated=0,skipped=0;
      for(const line of rows){
        const c=parseCSVLine(line);
        const r={ id: c[idx('id')]||uuid(), type:c[idx('type')]||'expense', entity:c[idx('entity')]||'', person:c[idx('person')]||'', category:c[idx('category')]||'', amount:Number(c[idx('amount')]||0), date:c[idx('date')]||new Date().toISOString().slice(0,10), vendor:c[idx('vendor')]||'', note:c[idx('note')]||'' };
        const sStatus=c[idx('settlement.status')]||''; const sDue=c[idx('settlement.due_to')]||''; const sRem=c[idx('settlement.remaining')]||'';
        if(sStatus){ r.settlement={status:sStatus, due_to:sDue||null, remaining:sRem? Number(sRem): null}; }
        const tFrom=c[idx('transfer.from')]||''; const tTo=c[idx('transfer.to')]||''; if(tFrom||tTo){ r.transfer={from:tFrom,to:tTo}; }
        const ex = allRecords.value.find(x=>x.id===r.id);
        if(ex){ if((r.date||'') > (ex.date||'')){ await storage.setItem(r.id,r); Object.assign(ex,r); updated++; } else skipped++; }
        else { await storage.setItem(r.id,r); allRecords.value.push(r); imported++; }
      }
      window.__cf_toast__(`CSV 匯入完成：新增 ${imported}，更新 ${updated}，略過 ${skipped}`);
      evt.target.value='';
    }
    async function pullRemote(){
      if(!settings.value.remoteUrl) return alert('請設定遠端 JSON 位置');
      const res = await fetch(settings.value.remoteUrl,{cache:'no-store'});
      if(!res.ok) return alert('讀取失敗');
      const data = await res.json();
      if(!Array.isArray(data)) return alert('格式需為陣列');
      let added=0, updated=0;
      for(const r of data){
        const ex=allRecords.value.find(x=>x.id===r.id);
        if(ex){ if((r.date||'')>(ex.date||'')){ await storage.setItem(r.id,r); Object.assign(ex,r); updated++; } }
        else { await storage.setItem(r.id,r); allRecords.value.push(r); added++; }
      }
      window.__cf_toast__(`合併完成：新增 ${added}，更新 ${updated}`);
    }
    async function pushRemote(){
      const data=JSON.stringify(allRecords.value,null,2);
      const blob=new Blob([data],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download='cashflow_data.json'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      window.__cf_toast__('已下載 JSON，請上傳到 GitHub Pages');
    }
    async function saveSettings(){
      settings.value.categories = categories.value;
      await settingsStore.setItem('settings', JSON.parse(JSON.stringify(settings.value)));
      window.__cf_toast__('設定已儲存');
    }
    async function resetSettings(){
      await settingsStore.removeItem('settings');
      settings.value = normalizeSettings(null);
      categories.value = settings.value.categories;
      window.__cf_toast__('已重設本機設定');
    }

    load();

    return {
      // tab
      tab, setTab,
      // month
      currentMonthLabel, monthPicker, openMonthPicker, onMonthPicked, prevMonth, nextMonth,
      // input
      type, mode, amountStr, category, vendor, note, date, isReimburse, onReceipt, hasReceipt, save, categories,
      // transfer
      fromAccount, toAccount, transferAmountStr, transferDate, transferNote, saveTransfer, dueJACK, dueWAL,
      // report
      monthRecords, sumIncome, sumExpense, net, pl, plPerc,
      plTypes, expanded, toggleDetail, detailByType, typeTotals, typeCounts,
      // quicks
      settings, newQuick, addQuick, editQuick, delQuick, moveQuick, applyQuick,
      // settings-page
      newCat: ref({ label:'', type:'cogs' }), newCatP: ref({ label:'', type:'expense' }),
      addCategory(group){
        const obj = (group==='restaurant') ? this.newCat : this.newCatP;
        if(!obj.label) return alert('請輸入分類名稱');
        const arr = categories.value[group];
        if(arr.find(x=>x.label===obj.label)) return alert('分類已存在');
        arr.push({ label: obj.label, type: obj.type });
        obj.label='';
        window.__cf_toast__('已新增分類'); saveSettings();
      },
      removeCategory(group, idx){ categories.value[group].splice(idx,1); window.__cf_toast__('已刪除分類'); saveSettings(); },
      // csv/sync
      exportCSV, importCSV, pullRemote, pushRemote,
      // misc
      saveSettings, resetSettings
    };
  }
}).mount('#app');
