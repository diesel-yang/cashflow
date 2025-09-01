const { createApp, ref, computed } = Vue;

// 全域 toast
window.__cf_toast__ = function(msg){
  try{
    const t = document.getElementById('toast');
    if(!t){ alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=> t.classList.remove('show'), 1800);
  }catch(e){ alert(msg); }
};

// 儲存
const storage = localforage.createInstance({ name:'cashflow', storeName:'records' });
const receipts = localforage.createInstance({ name:'cashflow', storeName:'receipts' });
const settingsStore = localforage.createInstance({ name:'cashflow', storeName:'settings' });
function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2,8); }
function monthKey(d){ return d.slice(0,7); }

createApp({
  setup(){
    // tab 與月份
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

    // 設定
    const settings = ref({
      warnThreshold: 0.9,
      quicks: [
        { label:'午餐 120 (JACK)', type:'expense', category:'食', amount:120, mode:'personal-JACK', autoSave:false },
        { label:'捷運 30 (JACK)',  type:'expense', category:'行-交通', amount:30,  mode:'personal-JACK', autoSave:false },
        { label:'咖啡 65 (WAL)',   type:'expense', category:'食', amount:65,  mode:'personal-WAL',  autoSave:false },
        { label:'外送平台收入 +1500', type:'income',  category:'外送平台', amount:1500, mode:'restaurant', autoSave:false },
      ],
      remoteUrl: ''
    });
    const newQuick = ref({ label:'', type:'expense', category:'', amount:0, mode:'personal-JACK', autoSave:false });

    // 記帳欄位
    const type = ref('expense');
    const mode = ref('restaurant');
    const amountStr = ref('');
    const category = ref('食');
    const vendor = ref('');
    const note = ref('');
    const isReimburse = ref(false);
    const receiptDataUrl = ref(null);
    const hasReceipt = computed(()=> !!receiptDataUrl.value);

    function applyQuick(q){
      type.value = q.type;
      category.value = q.category;
      amountStr.value = String(q.amount);
      mode.value = q.mode;
      note.value = q.note || '';
      vendor.value = q.vendor || '';
      if (q.autoSave) save(); else window.__cf_toast__('已帶入快捷內容');
    }

    function addQuick(){
      const q = { ...newQuick.value };
      if(!q.label || !q.category || !q.amount) return alert('請完整填寫快捷');
      const i = settings.value.quicks.findIndex(x=>x.label===q.label);
      if(i>=0) settings.value.quicks[i]=q; else settings.value.quicks.push(q);
      newQuick.value = { label:'', type:'expense', category:'', amount:0, mode:'personal-JACK', autoSave:false };
      window.__cf_toast__('已新增/覆寫快捷');
    }
    function editQuick(idx){ newQuick.value = { ...settings.value.quicks[idx] }; window.__cf_toast__('已帶入至表單，可修改後存回'); }
    function delQuick(idx){ settings.value.quicks.splice(idx,1); window.__cf_toast__('已刪除快捷'); }

    function applyVendorRule(){
      const t=(vendor.value||'').toLowerCase();
      if(t.includes('uber')){ mode.value='restaurant'; category.value='外送平台抽成'; }
      if(t.includes('全聯')){ mode.value='personal-JACK'; category.value='食'; }
    }

    // 資料
    const allRecords = ref([]);
    const monthRecords = computed(()=> allRecords.value.filter(r=> monthKey(r.date)===cursor.value));
    const filterEntity = ref('all');
    const filterPerson = ref('all');
    const netTransfers = ref(true);
    const filteredMonthRecords = computed(()=> monthRecords.value.filter(r=>{
      if(filterEntity.value==='restaurant' && r.entity!=='restaurant') return false;
      if(filterEntity.value==='personal' && r.entity!=='personal') return false;
      if(filterEntity.value==='personal' && filterPerson.value!=='all'){ if((r.person||'') !== filterPerson.value) return false; }
      return true;
    }));
    const sumIncome = computed(()=> filteredMonthRecords.value.filter(r=>r.type==='income').reduce((a,b)=>a+b.amount,0));
    const sumExpense = computed(()=> filteredMonthRecords.value.filter(r=>r.type==='expense').reduce((a,b)=>a+b.amount,0));
    const net = computed(()=> sumIncome.value - sumExpense.value);

    const dueJACK = computed(()=> monthRecords.value.filter(r=>r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to==='JACK').reduce((a,b)=> a + (typeof b.settlement.remaining==='number' ? b.settlement.remaining : b.amount),0));
    const dueWAL  = computed(()=> monthRecords.value.filter(r=>r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to==='WAL' ).reduce((a,b)=> a + (typeof b.settlement.remaining==='number' ? b.settlement.remaining : b.amount),0));

    async function load(){
      const s = await settingsStore.getItem('settings'); if(s) Object.assign(settings.value, s);
      const arr=[]; await storage.iterate((v,k)=>arr.push(v)); allRecords.value = arr;
    }

    function onReceipt(e){ const f=e.target.files&&e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ receiptDataUrl.value=r.result; window.__cf_toast__('憑證已附'); }; r.readAsDataURL(f); }

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
          rec.link_id = uuid(); rec.settlement = { status:'unpaid', due_to: rec.person||'JACK', remaining: rec.amount };
        }
        await storage.setItem(rec.id, rec); allRecords.value.push(rec);
        if(receiptDataUrl.value){ await receipts.setItem(rec.id, receiptDataUrl.value); rec.receipt_id = rec.id; await storage.setItem(rec.id, rec); }
      }
      amountStr.value=''; note.value=''; vendor.value=''; receiptDataUrl.value=null;
      window.__cf_toast__('已記錄');
    }

    // 轉帳 & 自動沖銷
    const fromAccount = ref('餐廳_銀行'); const toAccount = ref('JACK');
    const transferAmountStr = ref(''); const transferDate = ref(new Date().toISOString().slice(0,10)); const transferNote = ref('');
    async function saveTransfer(){
      const amt = Number(transferAmountStr.value); if(!amt || amt<=0) return alert('請輸入金額');
      const rec = { id:uuid(), type:'transfer', entity:'restaurant', amount:Math.round(amt), date:transferDate.value, transfer:{from:fromAccount.value, to:toAccount.value}, note:transferNote.value||'' };
      await storage.setItem(rec.id, rec); allRecords.value.push(rec);
      if(toAccount.value==='JACK' || toAccount.value==='WAL') await autoSettle(toAccount.value, rec.amount);
      transferAmountStr.value=''; transferNote.value=''; window.__cf_toast__('已建立轉帳並自動沖銷');
    }
    async function autoSettle(personKey, payAmount){
      let remaining = payAmount;
      const targets = allRecords.value.filter(r=> r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to===personKey).sort((a,b)=> a.date < b.date ? -1 : 1);
      for(const r of targets){
        const left = (typeof r.settlement.remaining==='number') ? r.settlement.remaining : r.amount;
        if(remaining <= 0) break;
        if(remaining >= left){ r.settlement.status='paid'; r.settlement.remaining=0; remaining-=left; }
        else { r.settlement.status='partial'; r.settlement.remaining = left-remaining; remaining = 0; }
        await storage.setItem(r.id, r);
      }
    }

    // 匯入/匯出/同步（簡版）
    function parseCSVLine(line){ const out=[]; let cur='',q=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch=='"'){ if(q && line[i+1]=='"'){ cur+='"'; i++; } else { q=!q; } continue; } if(ch===',' && !q){ out.push(cur); cur=''; } else cur+=ch; } out.push(cur); return out.map(s=>s.trim()); }
    function exportCSV(scope){
      const recs = scope==='month' ? monthRecords.value : allRecords.value.slice().sort((a,b)=> a.date < b.date ? -1 : 1);
      const headers=['id','type','entity','person','category','amount','date','vendor','note','settlement.status','settlement.due_to','settlement.remaining','transfer.from','transfer.to','receipt_id'];
      const lines=[headers.join(',')];
      for(const r of recs){
        const row=[r.id,r.type,r.entity||'',r.person||'',r.category||'',r.amount,r.date,(r.vendor||'').replace(/,/g,' '),(r.note||'').replace(/,/g,' '),r.settlement? r.settlement.status:'',r.settlement? r.settlement.due_to:'',r.settlement? (typeof r.settlement.remaining==='number'? r.settlement.remaining:''):'',r.transfer? r.transfer.from:'',r.transfer? r.transfer.to:'',r.receipt_id||''];
        lines.push(row.map(v=> (typeof v==='string' && (v.includes(' ')||v.includes(','))) ? '"'+v.replace(/"/g,'""')+'"' : v).join(','));
      }
      const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download= scope==='month'? ('cashflow_'+cursor.value+'.csv') : 'cashflow_all.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
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
      window.__cf_toast__(`CSV 匯入完成：新增 ${imported}，更新 ${updated}，略過 ${skipped}`); evt.target.value='';
    }
    async function pullRemote(){ if(!settings.value.remoteUrl) return alert('請設定遠端 JSON 位置'); const res = await fetch(settings.value.remoteUrl,{cache:'no-store'}); if(!res.ok) return alert('讀取失敗'); const data = await res.json(); if(!Array.isArray(data)) return alert('格式需為陣列'); let added=0, updated=0; for(const r of data){ const ex=allRecords.value.find(x=>x.id===r.id); if(ex){ if((r.date||'')>(ex.date||'')){ await storage.setItem(r.id,r); Object.assign(ex,r); updated++; } } else { await storage.setItem(r.id,r); allRecords.value.push(r); added++; } } window.__cf_toast__(`已合併：新增 ${added}、更新 ${updated}`); }
    async function pushRemote(){ const data=JSON.stringify(allRecords.value,null,2); const blob=new Blob([data],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='cashflow_data.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); window.__cf_toast__('已下載 JSON，請上傳到 GitHub Pages'); }

    async function saveSettings(){ await settingsStore.setItem('settings', JSON.parse(JSON.stringify(settings.value))); window.__cf_toast__('設定已儲存'); }

    load();

    // footer 版本容錯（避免 null）
    const footerEl = document.querySelector('.footer small');
    const version = ref(footerEl ? footerEl.textContent : 'v16.2');

    return {
      // tab
      tab, setTab,
      // month
      currentMonthLabel, monthPicker, openMonthPicker, onMonthPicked, prevMonth, nextMonth,
      // input
      type, mode, amountStr, category, vendor, note, date, isReimburse, onReceipt, hasReceipt, save,
      // transfer
      fromAccount, toAccount, transferAmountStr, transferDate, transferNote, saveTransfer, dueJACK, dueWAL,
      // report
      filterEntity, filterPerson, netTransfers, monthRecords, sumIncome, sumExpense, net,
      // quicks
      settings, newQuick, addQuick, editQuick, delQuick, applyQuick,
      // csv/sync
      exportCSV, importCSV, pullRemote, pushRemote,
      // version
      version
    };
  }
}).mount('#app');
