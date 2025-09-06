/* 語音記帳 App */
(function(){
  const $ = s => document.querySelector(s);
  const todayStr = () => new Date().toISOString().slice(0,10);
  const DB_NAME = 'voice-expense-db';
  const STORE = 'items';
  let db;

  // IndexedDB 開啟
  const idbOpen = () => new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(STORE)){
        db.createObjectStore(STORE, {keyPath:'id', autoIncrement:true});
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });

  const idbAll = () => new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = ()=> resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
  const idbAdd = (obj) => new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.add(obj);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
  const idbPut = (obj) => new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.put(obj);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
  const idbDel = (id) => new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = ()=> resolve();
    req.onerror = e => reject(e.target.error);
  });

  // 初始化
  const els = {
    voiceText: $('#voiceText'),
    date: $('#date'),
    amount: $('#amount'),
    desc: $('#desc'),
    cat: $('#cat'),
    attr: $('#attr'),
    btnSpeak: $('#btnSpeak'),
    btnAdd: $('#btnAdd'),
    btnExport: $('#btnExport'),
    btnImport: $('#btnImport'),
    fileImport: $('#fileImport'),
    btnShare: $('#btnShare'),
    btnClear: $('#btnClear'),
    tbody: $('#table tbody'),
    rowTpl: $('#rowTpl'),
    summary: $('#summary'),
  };

  (async function init(){
    db = await idbOpen();
    els.date.value = todayStr();
    render(await idbAll());
    bind();
  })();

  function bind(){
    els.btnAdd.addEventListener('click', addFromFields);
    els.btnSpeak.addEventListener('click', speechCapture);
    els.btnExport.addEventListener('click', exportCSV);
    els.btnImport.addEventListener('click', ()=> els.fileImport.click());
    els.fileImport.addEventListener('change', importCSV);
    els.btnShare.addEventListener('click', shareSummary);
    els.btnClear.addEventListener('click', clearAll);
    els.tbody.addEventListener('click', tableActions);
  }

  // 表格操作
  function tableActions(e){
    const tr = e.target.closest('tr');
    if(!tr) return;
    const id = Number(tr.dataset.id);
    if(e.target.matches('button.del')){
      idbDel(id).then(async()=> render(await idbAll()));
    } else if(e.target.matches('button.edit')){
      const editing = tr.contentEditable === 'true';
      tr.contentEditable = editing ? 'false' : 'true';
      e.target.textContent = editing ? '編輯' : '保存';
      if(editing){
        const obj = {
          id,
          date: tr.querySelector('[data-k="date"]').textContent,
          desc: tr.querySelector('[data-k="desc"]').textContent,
          cat: tr.querySelector('[data-k="cat"]').textContent,
          income: Number(tr.querySelector('[data-k="income"]').textContent.replace(/,/g,''))||0,
          var: Number(tr.querySelector('[data-k="var"]').textContent.replace(/,/g,''))||0,
          fix: Number(tr.querySelector('[data-k="fix"]').textContent.replace(/,/g,''))||0,
        };
        idbPut(obj).then(async()=> render(await idbAll()));
      }
    }
  }

  // 新增
  async function addFromFields(){
    const obj = normalize({
      date: els.date.value || todayStr(),
      desc: els.desc.value.trim() || els.voiceText.value.trim() || '未命名',
      cat: els.cat.value.trim() || '',
      amount: Number(els.amount.value),
      attr: els.attr.value
    });
    if(!obj) return alert('請輸入金額');
    await idbAdd(obj);
    clearFields();
    render(await idbAll());
  }

  function clearFields(){
    els.amount.value = '';
    els.desc.value = '';
    els.cat.value = '';
    els.voiceText.value = '';
    els.attr.value = 'variable';
    els.date.value = todayStr();
  }

  // 語音
  function speechCapture(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ alert('此瀏覽器不支援語音辨識，請用鍵盤麥克風（粵語鍵盤）。'); return; }

  const r = new SR();
  r.lang = 'yue-Hant-HK';          // 粵語（香港）
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 1;

  let finalText = '';
  r.onresult = (ev) => {
    const res = ev.results[0][0];
    finalText = (res && res.transcript ? res.transcript : '').trim();
    if (finalText) document.querySelector('#voiceText').value = finalText;
  };
  r.onspeechend = () => { try { r.stop(); } catch(_){} };
  r.onend = () => {
    if(finalText){ parseToFields(finalText); addFromFields(); }
    else{ alert('未聽到有效內容，請再試一次。'); }
  };
  r.onerror = (e) => alert('語音辨識失敗：' + (e.error || 'unknown'));
  r.start();
}

  // 簡單解析文字 → 填入欄位
  function parseToFields(text){
    let date = todayStr();
    if(/昨天/.test(text)) date = new Date(Date.now()-86400000).toISOString().slice(0,10);
    let amount = (text.match(/\d+(\.\d+)?/)||[])[0];
    let attr = /收入/.test(text) ? 'income' : (/固定/.test(text) ? 'fixed' : 'variable');
    let cat = /餐|午餐|晚餐|早餐/.test(text) ? '餐飲' :
              /車|交通|地鐵/.test(text) ? '交通' :
              /租|房/.test(text) ? '租金' : '';
    els.date.value = date;
    els.amount.value = amount||'';
    els.desc.value = text.replace(/\d+(\.\d+)?/, '').trim();
    els.cat.value = cat;
    els.attr.value = attr;
  }

  function normalize(i){
    if(!i.amount || isNaN(i.amount)) return null;
    const row = { date: i.date, desc: i.desc, cat: i.cat, income:0, var:0, fix:0 };
    if(i.attr === 'income') row.income = i.amount;
    else if(i.attr === 'fixed') row.fix = i.amount;
    else row.var = i.amount;
    return row;
  }

  // Render
  async function render(items){
    items.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.id||0)-(a.id||0));
    els.tbody.innerHTML = '';
    for(const it of items){
      const tr = document.importNode(els.rowTpl.content, true).querySelector('tr');
      tr.dataset.id = it.id;
      tr.querySelector('[data-k="date"]').textContent = it.date||'';
      tr.querySelector('[data-k="desc"]').textContent = it.desc||'';
      tr.querySelector('[data-k="cat"]').textContent = it.cat||'';
      tr.querySelector('[data-k="income"]').textContent = it.income||'';
      tr.querySelector('[data-k="var"]').textContent = it.var||'';
      tr.querySelector('[data-k="fix"]').textContent = it.fix||'';
      els.tbody.appendChild(tr);
    }
    renderSummary(items);
  }

  function renderSummary(items){
    const curYM = new Date().toISOString().slice(0,7);
    const byYM = items.filter(i => (i.date||'').slice(0,7)===curYM);
    const income = byYM.reduce((s,i)=>s+i.income,0);
    const varExp = byYM.reduce((s,i)=>s+i.var,0);
    const fixExp = byYM.reduce((s,i)=>s+i.fix,0);
    const net = income-varExp-fixExp;
    els.summary.innerHTML = `
      <div class="kpi"><h3>收入</h3><div class="val">${income}</div></div>
      <div class="kpi"><h3>變動支出</h3><div class="val">${varExp}</div></div>
      <div class="kpi"><h3>固定支出</h3><div class="val">${fixExp}</div></div>
      <div class="kpi"><h3>淨額</h3><div class="val">${net}</div></div>
    `;
  }

  // 匯出 CSV
  async function exportCSV(){
    const items = await idbAll();
    const header = ['Date','Description','Category','Income','Variable Expense','Fixed Expense'];
    const lines = [header.join(',')];
    for(const i of items){
      lines.push([i.date,i.desc,i.cat,i.income,i.var,i.fix].join(','));
    }
    const blob = new Blob([lines.join('\n')], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'voice-expense.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // 匯入 CSV
  async function importCSV(ev){
    const f = ev.target.files[0];
    if(!f) return;
    const text = await f.text();
    const [first,...rows] = text.split(/\r?\n/).filter(Boolean);
    for(const line of rows){
      const [date,desc,cat,income,varExp,fixExp] = line.split(',');
      await idbAdd({date,desc,cat,income:Number(income)||0,var:Number(varExp)||0,fix:Number(fixExp)||0});
    }
    render(await idbAll());
    ev.target.value='';
  }

  // 分享
  async function shareSummary(){
    const items = await idbAll();
    const curYM = new Date().toISOString().slice(0,7);
    const byYM = items.filter(i => (i.date||'').slice(0,7)===curYM);
    const income = byYM.reduce((s,i)=>s+i.income,0);
    const varExp = byYM.reduce((s,i)=>s+i.var,0);
    const fixExp = byYM.reduce((s,i)=>s+i.fix,0);
    const net = income-varExp-fixExp;
    const text = `【${curYM} 收支】收入:${income} 變動:${varExp} 固定:${fixExp} 淨額:${net}`;
    if(navigator.share){
      navigator.share({text});
    }else{
      navigator.clipboard.writeText(text);
      alert('已複製，可貼到 WhatsApp/備忘錄');
    }
  }

  async function clearAll(){
    if(!confirm('確定清空?')) return;
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).clear().onsuccess = async()=> render(await idbAll());
  }

})();
