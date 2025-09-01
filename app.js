const { createApp, ref, computed, nextTick } = Vue;
const storage = localforage.createInstance({ name: 'cashflow', storeName: 'records' });
const receipts = localforage.createInstance({ name: 'cashflow', storeName: 'receipts' });
const settingsStore = localforage.createInstance({ name: 'cashflow', storeName: 'settings' });

function deepPlain(obj){ return JSON.parse(JSON.stringify(obj)); }

const DEFAULT_CATS_RESTAURANT = ['現場銷售','外送平台','批發/通路','其他收入','食材-肉類','食材-蔬果','海鮮','調味/乾貨','飲品原料','包材','清潔耗材','正職薪資','兼職時薪','勞健保','獎金/三節','租金','水費','電費','瓦斯','網路/手機','設備購置','維修','工具器具','外送平台抽成','廣告行銷','拍攝設計','活動攤費','物流運費','油資','停車','稅捐(5%)','記帳/法律','金流手續費','銀行手續費','交際應酬','雜項'];
const DEFAULT_CATS_PERSONAL   = ['食','住-房租/貸','住-水電網路','行-交通','行-油資','行-停車','育樂','醫療','3C/家居','稅費','投資/儲蓄','收入-薪資','收入-其他'];

const DEFAULT_PL_MAP = {};
['現場銷售','外送平台','批發/通路','其他收入'].forEach(c => DEFAULT_PL_MAP[c] = 'revenue');
['食材-肉類','食材-蔬果','海鮮','調味/乾貨','飲品原料','包材','清潔耗材'].forEach(c => DEFAULT_PL_MAP[c] = 'cogs');
['正職薪資','兼職時薪','勞健保','獎金/三節'].forEach(c => DEFAULT_PL_MAP[c] = 'personnel');
['租金','水費','電費','瓦斯','網路/手機'].forEach(c => DEFAULT_PL_MAP[c] = 'utilities');
['外送平台抽成','廣告行銷','拍攝設計','活動攤費'].forEach(c => DEFAULT_PL_MAP[c] = 'marketing');
['物流運費','油資','停車'].forEach(c => DEFAULT_PL_MAP[c] = 'logistics');
['稅捐(5%)','記帳/法律','金流手續費','銀行手續費'].forEach(c => DEFAULT_PL_MAP[c] = 'admin');
['交際應酬','雜項','維修','設備購置','工具器具'].forEach(c => DEFAULT_PL_MAP[c] = 'other');

function uuid(){return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(0,8)}

createApp({
  setup(){
    const version = ref("極速記帳 v3.3 build v16 2025-09-01");

    const tab = ref('input');
    const type = ref('expense');
    const amountStr = ref('');
    const category = ref('食');
    const note = ref('');
    const vendor = ref('');
    const date = ref(new Date().toISOString().slice(0,10));
    const receiptDataUrl = ref(null);
    const hasReceipt = computed(()=> !!receiptDataUrl.value);

    const mode = ref('restaurant');
    const payAccount = ref('現金');
    const isReimburse = ref(false);

    const allRecords = ref([]);
    const settings = ref({
      cats_restaurant: DEFAULT_CATS_RESTAURANT.slice(),
      cats_personal: DEFAULT_CATS_PERSONAL.slice(),
      plMap: Object.assign({}, DEFAULT_PL_MAP),
      budgets: { personal:{JACK:{},WAL:{}}, restaurant:{} },
      warnThreshold:0.9,
      vendorRules:[
        { match:'全聯', set:{ mode:'personal-JACK', category:'食' } },
        { match:'家樂福', set:{ mode:'personal-WAL', category:'食' } },
        { match:'Uber Eats', set:{ mode:'restaurant', category:'外送平台抽成' } },
        { match:'foodpanda', set:{ mode:'restaurant', category:'外送平台抽成' } },
      ],
      remoteUrl:''
    });

    const categories = computed(()=> mode.value==='restaurant' ? settings.value.cats_restaurant : settings.value.cats_personal);

    const quicks = ref([
      {label:'午餐 120 (JACK)', type:'expense', category:'食', amount:120, mode:'personal-JACK'},
      {label:'捷運 30 (JACK)', type:'expense', category:'行-交通', amount:30, mode:'personal-JACK'},
      {label:'咖啡 65 (WAL)', type:'expense', category:'食', amount:65, mode:'personal-WAL'},
      {label:'外送平台收入 +1500', type:'income', category:'外送平台', amount:1500, mode:'restaurant'},
    ]);

    function monthKey(d){ return d.slice(0,7) }
    const cursor = ref(monthKey(date.value));
    const monthPicker = ref(null);
    const currentMonthLabel = computed(() => { const [y,m] = cursor.value.split('-'); return `${y}年${m}月`; });

    const filterEntity = ref('all');
    const filterPerson = ref('all');
    const netTransfers = ref(true);

    const monthRecords = computed(() => allRecords.value.filter(r => monthKey(r.date) === cursor.value).sort((a,b)=> a.date < b.date ? 1 : -1));

    const filteredMonthRecords = computed(() => monthRecords.value.filter(r => {
      if(filterEntity.value==='restaurant' && r.entity!=='restaurant') return false;
      if(filterEntity.value==='personal' && r.entity!=='personal') return false;
      if(filterEntity.value==='personal' && filterPerson.value!=='all'){
        if((r.person||'') !== filterPerson.value) return false;
      }
      return true;
    }));

    const sumIncome = computed(() => filteredMonthRecords.value.filter(r=>r.type==='income').reduce((a,b)=>a+b.amount,0));
    const sumExpense = computed(() => filteredMonthRecords.value.filter(r=>r.type==='expense').reduce((a,b)=>a+b.amount,0));
    const net = computed(()=> sumIncome.value - sumExpense.value);

    const dueJACK = computed(()=> monthRecords.value
      .filter(r=>r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to==='JACK')
      .reduce((a,b)=> a + ( (b.settlement && (typeof b.settlement.remaining==='number')) ? b.settlement.remaining : (b.amount||0) ), 0));
    const dueWAL = computed(()=> monthRecords.value
      .filter(r=>r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to==='WAL')
      .reduce((a,b)=> a + ( (b.settlement && (typeof b.settlement.remaining==='number')) ? b.settlement.remaining : (b.amount||0) ), 0));

    async function load(){
      const s = await settingsStore.getItem('settings');
      if(s){ 
        if(s.budgets && s.budgets.personal){
          if(s.budgets.personal.A){ s.budgets.personal.JACK = Object.assign({}, s.budgets.personal.JACK||{}, s.budgets.personal.A); delete s.budgets.personal.A; }
          if(s.budgets.personal.B){ s.budgets.personal.WAL  = Object.assign({}, s.budgets.personal.WAL||{},  s.budgets.personal.B); delete s.budgets.personal.B; }
        }
        if(s.vendorRules){
          s.vendorRules.forEach(r=>{
            if(r.set && r.set.mode==='personal-A') r.set.mode='personal-JACK';
            if(r.set && r.set.mode==='personal-B') r.set.mode='personal-WAL';
            if(r.set && r.set.pay_account==='個人A先墊') r.set.pay_account='JACK先墊';
            if(r.set && r.set.pay_account==='個人B先墊') r.set.pay_account='WAL先墊';
          });
        }
        settings.value = Object.assign(settings.value, s);
      }
      const arr = [];
      await storage.iterate((value, key) => { 
        if(value.person==='A') value.person='JACK';
        if(value.person==='B') value.person='WAL';
        if(value.pay_account==='個人A先墊') value.pay_account='JACK先墊';
        if(value.pay_account==='個人B先墊') value.pay_account='WAL先墊';
        if(value.settlement && (value.settlement.due_to==='A' || value.settlement.due_to==='B')){
          value.settlement.due_to = (value.settlement.due_to==='A') ? 'JACK' : 'WAL';
        }
        arr.push(value); 
      });
      allRecords.value = arr;
    }

    function monthSumByCategory(entity, person){
      const map = {};
      monthRecords.value.forEach(r => {
        if(entity && r.entity!==entity) return;
        if(entity==='personal' && person && r.person!==person) return;
        if(r.type!=='expense') return;
        map[r.category] = (map[r.category]||0) + r.amount;
      });
      return map;
    }
    function checkBudgetAlerts(rec){
      if(rec.type!=='expense') return;
      const mk = monthKey(rec.date);
      if(mk !== cursor.value) return;
      let budget=0, used=0, label='';
      if(rec.entity==='personal'){
        const target = rec.person==='JACK'? settings.value.budgets.personal.JACK : settings.value.budgets.personal.WAL;
        budget = (target && target[rec.category]) || 0;
        used = monthSumByCategory('personal', rec.person)[rec.category] || 0;
        label = `${rec.person} ${rec.category}`;
      }else if(rec.entity==='restaurant'){
        budget = (settings.value.budgets.restaurant && settings.value.budgets.restaurant[rec.category]) || 0;
        used = monthSumByCategory('restaurant', null)[rec.category] || 0;
        label = `餐廳 ${rec.category}`;
      }
      if(budget>0){
        const warn = settings.value.warnThreshold || 0.9;
        if(used >= budget){
          toast(`🔴 已超支：${label}（${used}/${budget}）`);
        }else if(used >= budget*warn){
          toast(`🟡 接近超支：${label}（${used}/${budget}）`);
        }
      }
    }

    async function save(){
      const amt = Number(amountStr.value);
      if(!amt || amt <= 0){ alert('請輸入金額'); return; }

      // 共用：先建原始基底物件
      const base = {
        type: type.value,
        category: category.value,
        amount: Math.round(amt),
        date: date.value,
        pay_account: payAccount.value,
        vendor: vendor.value || '',
        note: note.value || ''
      };

      // 共同（J+W）→ 自動拆成 JACK/WAL 兩筆
      if(mode.value==='personal-JW'){
        const jackAmt = Math.floor(base.amount/2);
        const walAmt = base.amount - jackAmt;
        const recJ = { id: uuid(), ...base, entity:'personal', person:'JACK', amount: jackAmt };
        const recW = { id: uuid(), ...base, entity:'personal', person:'WAL',  amount: walAmt };
        await storage.setItem(recJ.id, recJ);
        await storage.setItem(recW.id, recW);
        allRecords.value.push(recJ, recW);
        if(receiptDataUrl.value){
          await receipts.setItem(recJ.id, receiptDataUrl.value);
          await receipts.setItem(recW.id, receiptDataUrl.value);
          recJ.receipt_id = recJ.id; recW.receipt_id = recW.id;
          await storage.setItem(recJ.id, recJ); await storage.setItem(recW.id, recW);
        }
        // 預算提醒各做一次
        checkBudgetAlerts({ type: recJ.type, entity: recJ.entity, person: recJ.person, category: recJ.category, amount: recJ.amount, date: recJ.date });
        checkBudgetAlerts({ type: recW.type, entity: recW.entity, person: recW.person, category: recW.category, amount: recW.amount, date: recW.date });
      }else{
        const rec = {
          id: uuid(),
          ...base,
          entity: mode.value==='restaurant' ? 'restaurant' : 'personal',
          person: mode.value==='personal-JACK' ? 'JACK' : (mode.value==='personal-WAL' ? 'WAL' : null),
        };

        if (isReimburse.value && rec.entity==='restaurant' && rec.type==='expense' && (rec.pay_account==='JACK先墊' || rec.pay_account==='WAL先墊')) {
          rec.link_id = uuid();
          rec.settlement = { status:'unpaid', due_to: rec.pay_account.includes('JACK')?'JACK':'WAL', remaining: rec.amount };
        }

        await storage.setItem(rec.id, rec);
        allRecords.value.push(rec);

        if(receiptDataUrl.value){
          await receipts.setItem(rec.id, receiptDataUrl.value);
          rec.receipt_id = rec.id;
          await storage.setItem(rec.id, rec);
        }
        checkBudgetAlerts(rec);
      }

      amountStr.value=''; note.value=''; vendor.value=''; receiptDataUrl.value=null;
      toast('已記錄');
    }

    function onReceipt(e){
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => { receiptDataUrl.value = reader.result; toast('憑證已附'); };
      reader.readAsDataURL(file);
    }

    function applyVendorRule(){
      const text = (vendor.value||'').toLowerCase();
      const rules = (settings.value.vendorRules||[]);
      for(const r of rules){
        if(text.includes(r.match.toLowerCase())){
          if(r.set.mode) mode.value = r.set.mode;
          if(r.set.category) category.value = r.set.category;
          if(r.set.pay_account) payAccount.value = r.set.pay_account;
          break;
        }
      }
    }

    function applyQuick(q){
      type.value = q.type;
      category.value = q.category;
      amountStr.value = String(q.amount);
      note.value = q.label;
      date.value = new Date().toISOString().slice(0,10);
      if(q.mode) mode.value = q.mode;
    }

    function prevMonth(){
      const [y,m] = cursor.value.split('-').map(Number);
      const d = new Date(y, m-2, 1);
      cursor.value = d.toISOString().slice(0,7);
    }
    function openMonthPicker(){
      try{ monthPicker.value && monthPicker.value.showPicker ? monthPicker.value.showPicker() : monthPicker.value && monthPicker.value.click(); }
      catch(e){ monthPicker.value && monthPicker.value.click(); }
    }
    function onMonthPicked(e){
      const v = e.target.value;
      if(v && /\d{4}-\d{2}/.test(v)){ cursor.value = v; }
    }
    function nextMonth(){
      const [y,m] = cursor.value.split('-').map(Number);
      const d = new Date(y, m, 1);
      cursor.value = d.toISOString().slice(0,7);
    }

    // Transfer
    const fromAccount = ref('餐廳_銀行');
    const toAccount = ref('JACK');
    const transferAmountStr = ref('');
    const transferDate = ref(new Date().toISOString().slice(0,10));
    const transferNote = ref('');

    async function saveTransfer(){
      const amt = Number(transferAmountStr.value);
      if(!amt || amt<=0) return alert('請輸入金額');
      const rec = {
        id: uuid(),
        type: 'transfer',
        entity: 'restaurant',
        amount: Math.round(amt),
        date: transferDate.value,
        transfer: { from: fromAccount.value, to: toAccount.value },
        note: transferNote.value || ''
      };
      await storage.setItem(rec.id, rec);
      allRecords.value.push(rec);

      if(fromAccount.value.startsWith('餐廳') && (toAccount.value==='JACK' || toAccount.value==='WAL')){
        await autoSettle(toAccount.value, rec.amount);
      }
      transferAmountStr.value=''; transferNote.value='';
      toast('已建立轉帳並自動沖銷');
    }

    async function autoSettle(personKey, payAmount){
      let remaining = payAmount;
      const targets = allRecords.value
        .filter(r => r.entity==='restaurant' && r.settlement && r.settlement.status!=='paid' && r.settlement.due_to===personKey)
        .sort((a,b)=> a.date < b.date ? -1 : 1);
      for(const r of targets){
        const left = (typeof r.settlement.remaining==='number') ? r.settlement.remaining : r.amount;
        if(remaining <= 0) break;
        if(remaining >= left){
          r.settlement.status='paid';
          r.settlement.remaining = 0;
          remaining -= left;
        }else{
          r.settlement.status='partial';
          r.settlement.remaining = left - remaining;
          remaining = 0;
        }
        await storage.setItem(r.id, r);
      }
    }

    async function settle(rec){
      rec.settlement.status = 'paid';
      rec.settlement.remaining = 0;
      await storage.setItem(rec.id, rec);
      const idx = allRecords.value.findIndex(r=>r.id===rec.id);
      if(idx>=0) allRecords.value[idx] = rec;
      toast('已結清');
    }

    async function viewReceipt(rec){
      if(!rec.receipt_id) return;
      const url = await receipts.getItem(rec.receipt_id);
      if(url) window.open(url, '_blank');
    }

    // P&L + Charts
    const pl = ref({revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0,other:0,grossProfit:0,operatingProfit:0,cogsRate:0,personnelRate:0});
    function computePL(){
      const recs = monthRecords.value.filter(r=>r.entity==='restaurant');
      const sums = { revenue:0,cogs:0,personnel:0,utilities:0,marketing:0,logistics:0,admin:0,other:0 };
      for(const r of recs){
        if(r.type==='income'){
          if(settings.value.plMap[r.category]==='revenue') sums.revenue += r.amount;
        }else if(r.type==='expense'){
          const grp = settings.value.plMap[r.category] || 'other';
          if(grp!=='revenue'){ sums[grp] = (sums[grp]||0) + r.amount; }
        }
      }
      const gross = sums.revenue - sums.cogs;
      const op = gross - (sums.personnel + sums.utilities + sums.marketing + sums.logistics + sums.admin + sums.other);
      const cr = sums.revenue>0 ? (sums.cogs / sums.revenue * 100) : 0;
      const pr = sums.revenue>0 ? (sums.personnel / sums.revenue * 100) : 0;
      pl.value = { ...sums, grossProfit:gross, operatingProfit:op, cogsRate:cr, personnelRate:pr };
    }

    function exportCSV(scope){
      const recs = scope==='month' ? monthRecords.value : allRecords.value.slice().sort((a,b)=> a.date < b.date ? -1 : 1);
      const headers = ['id','type','entity','person','category','amount','date','pay_account','vendor','note','settlement.status','settlement.due_to','settlement.remaining','transfer.from','transfer.to','receipt_id'];
      const lines = [headers.join(',')];
      for(const r of recs){
        const row = [
          r.id, r.type, r.entity||'', r.person||'', r.category||'',
          r.amount, r.date, r.pay_account||'', (r.vendor||'').replace(/,/g,' '), (r.note||'').replace(/,/g,' '),
          r.settlement ? r.settlement.status : '', r.settlement ? r.settlement.due_to : '', r.settlement ? (typeof r.settlement.remaining==='number' ? r.settlement.remaining : '') : '',
          r.transfer ? r.transfer.from : '', r.transfer ? r.transfer.to : '', r.receipt_id || ''
        ];
        lines.push(row.map(v => (typeof v==='string' && (v.includes(' ')||v.includes(','))) ? `"${v.replace(/"/g,'""')}"` : v).join(','));
      }
      const blob = new Blob([lines.join('\\n')], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = scope==='month' ? (`cashflow_${cursor.value}.csv`) : ('cashflow_all.csv');
      a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
    }

    async function importCSV(evt){
      const f = evt.target.files && evt.target.files[0];
      if(!f) return;
      const text = await f.text();
      const rows = text.split(/\\r?\\n/).filter(x=>x.trim().length>0);
      const header = parseCSVLine(rows.shift());
      const idx = (name)=> header.indexOf(name);
      let imported = 0, updated=0, skipped=0;
      for(const line of rows){
        const cols = parseCSVLine(line);
        const r = {
          id: cols[idx('id')] || uuid(),
          type: cols[idx('type')] || 'expense',
          entity: cols[idx('entity')] || '',
          person: cols[idx('person')] || '',
          category: cols[idx('category')] || '',
          amount: Number(cols[idx('amount')]||0),
          date: cols[idx('date')] || new Date().toISOString().slice(0,10),
          pay_account: cols[idx('pay_account')] || '',
          vendor: cols[idx('vendor')] || '',
          note: cols[idx('note')] || ''
        };
        if(r.person==='A') r.person='JACK'; if(r.person==='B') r.person='WAL';
        if(r.pay_account==='個人A先墊') r.pay_account='JACK先墊';
        if(r.pay_account==='個人B先墊') r.pay_account='WAL先墊';
        const sStatus = cols[idx('settlement.status')]||'';
        const sDue = cols[idx('settlement.due_to')]||'';
        const sRem = cols[idx('settlement.remaining')]||'';
        if(sStatus){ r.settlement = { status: sStatus, due_to: (sDue==='A'?'JACK':(sDue==='B'?'WAL':sDue||null)), remaining: sRem? Number(sRem): null }; }
        const tFrom = cols[idx('transfer.from')]||'';
        const tTo = cols[idx('transfer.to')]||'';
        if(tFrom || tTo){ r.transfer = { from: tFrom, to: tTo }; }

        const existing = allRecords.value.find(x=>x.id===r.id);
        if(existing){
          if((r.date||'') > (existing.date||'')){
            await storage.setItem(r.id, r);
            Object.assign(existing, r);
            updated++;
          }else{
            skipped++;
          }
        }else{
          await storage.setItem(r.id, r);
          allRecords.value.push(r);
          imported++;
        }
      }
      toast(`CSV 匯入完成：新增 ${imported}，更新 ${updated}，略過 ${skipped}`);
      evt.target.value = '';
    }

    function parseCSVLine(line){
      const out = []; let cur = '', inQ=false;
      for(let i=0;i<line.length;i++){
        const ch = line[i];
        if(ch=='"'){ if(inQ && line[i+1]=='"'){ cur+='"'; i++; } else { inQ = !inQ; } continue; }
        if(ch===',' && !inQ){ out.push(cur); cur=''; } else { cur+=ch; }
      }
      out.push(cur); return out.map(s=>s.trim());
    }

    async function pullRemote(){
      if(!settings.value.remoteUrl) return alert('請設定遠端 JSON 位置');
      try{
        const res = await fetch(settings.value.remoteUrl, { cache:'no-store' });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        if(!Array.isArray(data)) throw new Error('JSON 格式需為陣列');
        let added=0, updated=0;
        for(const r of data){
          const existing = allRecords.value.find(x=>x.id===r.id);
          if(existing){
            if((r.date||'') > (existing.date||'')){
              await storage.setItem(r.id, r);
              Object.assign(existing, r);
              updated++;
            }
          }else{
            await storage.setItem(r.id, r);
            allRecords.value.push(r);
            added++;
          }
        }
        toast(`拉取完成：新增 ${added}、更新 ${updated}`);
      }catch(e){
        alert('讀取失敗：'+e.message);
      }
    }

    async function pushRemote(){
      const data = JSON.stringify(allRecords.value, null, 2);
      const blob = new Blob([data], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'cashflow_data.json'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      toast('已下載 JSON，請上傳到 GitHub Pages');
    }

    // Settings helpers + budgets
    const budgetCatRestaurant = ref(''); const budgetAmtRestaurant = ref(0);
    const budgetCatJ = ref(''); const budgetAmtJ = ref(0);
    const budgetCatW = ref(''); const budgetAmtW = ref(0);

    const newRestCat = ref(''); const newRestGroup = ref('cogs');
    const newPersonalCat = ref('');

    function addRestaurantCat(){
      const c = (newRestCat.value||'').trim();
      if(!c) return;
      if(!settings.value.cats_restaurant.includes(c)) settings.value.cats_restaurant.push(c);
      settings.value.plMap[c] = newRestGroup.value || 'other';
      newRestCat.value='';
      toast('已新增餐廳分類');
    }
    function delRestaurantCat(c){
      settings.value.cats_restaurant = settings.value.cats_restaurant.filter(x=>x!==c);
      delete settings.value.plMap[c];
    }
    function addPersonalCat(){
      const c = (newPersonalCat.value||'').trim();
      if(!c) return;
      if(!settings.value.cats_personal.includes(c)) settings.value.cats_personal.push(c);
      newPersonalCat.value='';
      toast('已新增個人分類');
    }
    function delPersonalCat(c){
      settings.value.cats_personal = settings.value.cats_personal.filter(x=>x!==c);
    }

    function addBudget(scope){
      if(scope==='restaurant' && budgetCatRestaurant.value){
        settings.value.budgets.restaurant[budgetCatRestaurant.value] = budgetAmtRestaurant.value;
        budgetCatRestaurant.value=''; budgetAmtRestaurant.value=0;
        toast('已新增/更新 餐廳預算');
      }else if(scope==='JACK' && budgetCatJ.value){
        settings.value.budgets.personal.JACK[budgetCatJ.value] = budgetAmtJ.value;
        budgetCatJ.value=''; budgetAmtJ.value=0;
        toast('已新增/更新 JACK 預算');
      }else if(scope==='WAL' && budgetCatW.value){
        settings.value.budgets.personal.WAL[budgetCatW.value] = budgetAmtW.value;
        budgetCatW.value=''; budgetAmtW.value=0;
        toast('已新增/更新 WAL 預算');
      }
    }

    function delBudget(scope,cat){
      if(scope==='restaurant'){
        delete settings.value.budgets.restaurant[cat];
      }else if(scope==='JACK'){
        delete settings.value.budgets.personal.JACK[cat];
      }else if(scope==='WAL'){
        delete settings.value.budgets.personal.WAL[cat];
      }
    }

    async function saveSettings(){ 
      const plain = deepPlain(settings.value); 
      await settingsStore.setItem('settings', plain); 
      toast('設定已儲存'); 
    }

    // Charts
    let pieChart = null, lineChart = null, plBarChart = null;
    function drawCharts(){
      computePL();
      const ctxPie = document.getElementById('pie');
      const ctxLine = document.getElementById('line');
      const ctxPL = document.getElementById('plbar');

      const catMap = {};
      filteredMonthRecords.value.filter(r=>r.type==='expense').forEach(r => { catMap[r.category] = (catMap[r.category]||0) + r.amount; });
      const pieData = { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap) }] };

      const dayMap = {};
      filteredMonthRecords.value.forEach(r => { dayMap[r.date] = (dayMap[r.date]||0) + (r.type==='income'? r.amount : (r.type==='expense' ? -r.amount : 0)); });
      const days = Object.keys(dayMap).sort();
      const acc = []; let sum = 0;
      days.forEach(d => { sum += dayMap[d]; acc.push(sum); });
      const lineData = { labels: days, datasets: [{ data: acc, tension: 0.25 }] };

      if(pieChart){ pieChart.destroy(); }
      if(lineChart){ lineChart.destroy(); }
      pieChart = new Chart(ctxPie, { type: 'pie', data: pieData, options: { plugins: { legend: { position: 'bottom' }}}});
      lineChart = new Chart(ctxLine, { type: 'line', data: lineData, options: { scales: { y: { beginAtZero: true }}}});
      if(ctxPL){
        if(plBarChart) plBarChart.destroy();
        const d = pl.value;
        const labels = ['收入','COGS','人事','水電租','行銷','物流','行政','其他','毛利','營業利益'];
        const data = [d.revenue, -d.cogs, -d.personnel, -d.utilities, -d.marketing, -d.logistics, -d.admin, -d.other, d.grossProfit, d.operatingProfit];
        plBarChart = new Chart(ctxPL, { type:'bar', data:{ labels, datasets:[{ data }] }, options:{ scales:{ y:{ beginAtZero:true }}} });
      }
    }

    load();

    return { 
      version,
      tab, type, amountStr, category, note, vendor, date, payAccount, isReimburse, mode, categories, currentMonthLabel,
      quicks, save, applyQuick, applyVendorRule, onReceipt, hasReceipt,
      prevMonth, nextMonth, openMonthPicker, onMonthPicked, monthPicker,
      filterEntity, filterPerson, netTransfers, monthRecords, filteredMonthRecords, sumIncome, sumExpense, net,
      dueJACK, dueWAL, drawCharts, settle, viewReceipt,
      fromAccount, toAccount, transferAmountStr, transferDate, transferNote, saveTransfer,
      exportCSV, importCSV, saveSettings, settings, pullRemote, pushRemote,
      budgetCatRestaurant, budgetAmtRestaurant, budgetCatJ, budgetAmtJ, budgetCatW, budgetAmtW, addBudget, delBudget,
      newRestCat, newRestGroup, newPersonalCat, addRestaurantCat, delRestaurantCat, addPersonalCat, delPersonalCat,
      pl
    };
  }
}).mount('#app');
