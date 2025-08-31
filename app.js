const {createApp,ref} = Vue;
createApp({
  setup(){
    const version = ref("極速記帳 v3.3 fixed build " + new Date().toISOString().slice(0,10));
    const tab = ref('input');
    const currentMonthLabel = ref("2025年08月");
    const settings = ref({
      cats_restaurant: [],
      cats_personal: [],
      plMap: {},
      budgets: { personal:{JACK:{},WAL:{}}, restaurant:{} },
      warnThreshold:0.9,
      vendorRules: [],
      remoteUrl:''
    });
    function addBudget(scope){ console.log("addBudget",scope); }
    function delBudget(scope,cat){ console.log("delBudget",scope,cat); }
    return {version,tab,currentMonthLabel,settings,addBudget,delBudget};
  }
}).mount('#app');