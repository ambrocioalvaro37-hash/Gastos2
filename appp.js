// Config
const BLUE_URL="https://dolarapi.com/v1/dolares/blue";
const STORE_KEY="gastos_app_v1", SETTINGS_KEY="gastos_settings_v1", RATES_KEY="gastos_rates_cache_v1", METHODS_KEY="gastos_methods_v1", EVENTS_KEY="eventos_v1", INGRESOS_KEY="ingresos_v1";
const $=id=>document.getElementById(id);

// Estado
let gastos=loadGastos(), settings=loadSettings(), rates=loadRatesCache(), methods=loadMethods(), editingId=null;
let eventos=[], ingresos=[];
let editingEventId=null;
let editingIngresoId=null;
let calCurrent=new Date(); calCurrent.setDate(1);
let calSelectedISO=todayISO();
let historyDayISO=null;
let currentView="add";

function init(){
  eventos=loadEventos();
  ingresos=loadIngresos();
  // Tabs
  $("tabAdd").onclick=()=>showView("add");
  $("tabList").onclick=()=>showView("list");
  $("tabMonth").onclick=()=>showView("month");
  $("tabEvents").onclick=()=>showView("events");
  $("tabIngresos").onclick=()=>showView("ingresos");

  // Defaults
  $("date").value=todayISO();
  $("filterMonth").value=monthISO(new Date());
  $("eventDate").value=todayISO();
  $("eventTime").value=getCurrentTime();
  $("ingresoDate").value=todayISO();
  $("filterEventMonth").value=monthISO(new Date());
  $("filterIngresoMonth").value=monthISO(new Date());

  // Settings
  $("defaultRateType").value=settings.defaultRateType;
  updateAlwaysVentaBtn();
  $("btnToggleAlwaysVenta").onclick=()=>{settings.alwaysVentaDefault=!settings.alwaysVentaDefault;saveSettings(settings);updateAlwaysVentaBtn();applyDefaultRateType();updatePreview();};
  $("defaultRateType").onchange=()=>{settings.defaultRateType=$("defaultRateType").value;saveSettings(settings);applyDefaultRateType();updatePreview();};

  // Form listeners
  ["currency","amount","category","method","rateType","note","date"].forEach(id=>{ $(id).addEventListener("input",updatePreview); $(id).addEventListener("change",updatePreview); });

  $("btnSave").onclick=onSave;
  $("btnExportCsv").onclick=exportCSV;

  // Historial filters
  $("filterMonth").onchange=()=>{historyDayISO=null;renderList();};
  $("filterText").oninput=renderList;

  // Rates
  $("btnRefreshRates").onclick=refreshRates;

  // Methods
  $("btnAddMethod").onclick=addMethodFromUI;

  // Calendario
  $("calPrev").onclick=()=>{calCurrent=addMonths(calCurrent,-1);renderCalendar();renderMonth();};
  $("calNext").onclick=()=>{calCurrent=addMonths(calCurrent, 1);renderCalendar();renderMonth();};
  $("calToday").onclick=()=>{const t=new Date();calCurrent=new Date(t.getFullYear(),t.getMonth(),1);calSelectedISO=todayISO();renderCalendar();renderMonth();renderDayDetails();};

  // Mes -> Historial
  $("btnDayToHistory").onclick=()=>{historyDayISO=calSelectedISO;$("filterMonth").value=historyDayISO.slice(0,7);$("filterText").value="";showView("list");renderList();};

  // Historial -> Mes
  $("btnHistoryToMonth").onclick=()=>{const m=$("filterMonth").value||monthISO(new Date());const [y,mo]=m.split("-").map(Number);calCurrent=new Date(y,mo-1,1);if(historyDayISO)calSelectedISO=historyDayISO;showView("month");renderCalendar();renderMonth();renderDayDetails();};

  // Quitar filtro día en historial
  $("btnClearDayFilter").onclick=()=>{historyDayISO=null;renderList();};
  $("btnSaveEvent").onclick=onSaveEvent;
  $("filterEventMonth").onchange=renderEventsList;
  $("btnSaveIngreso").onclick=onSaveIngreso;
  $("filterIngresoMonth").onchange=()=>{renderIngresosList();renderBalance();};

  // Inicial
  renderCatDatalist();
  renderMethodsSelect();
  renderMethodsManager();
  renderRates();
  applyDefaultRateType();
  updatePreview();
  renderList();
  renderCalendar();
  renderDayDetails();
  renderMonth();
  renderEventsList();
  renderIngresosList();
  showView("add");
  addSwipeNavigation();

  refreshRates().catch(()=>{});
}

function showView(which){
  currentView = which;
  const top=document.getElementById("topPanels");
  if(top) top.style.display=(which==="add")?"":"none";
  $("viewAdd").style.display=(which==="add")?"block":"none";
  $("viewList").style.display=(which==="list")?"block":"none";
  $("viewMonth").style.display=(which==="month")?"block":"none";
  $("viewEvents").style.display=(which==="events")?"block":"none";
  $("viewIngresos").style.display=(which==="ingresos")?"block":"none";
  ["tabAdd","tabList","tabMonth","tabEvents","tabIngresos"].forEach(id => $(id).classList.remove("active"));
  if (which === "add") $("tabAdd").classList.add("active");
  if (which === "list") $("tabList").classList.add("active");
  if (which === "month") $("tabMonth").classList.add("active");
  if (which === "events") $("tabEvents").classList.add("active");
  if (which === "ingresos") {$("tabIngresos").classList.add("active");renderBalance();}
}

// Rates
async function refreshRates(){
  $("blueStatus").textContent="Estado: consultando…";
  try{
    const res=await fetch(BLUE_URL,{cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data=await res.json();
    rates={compra:Number(data.compra), venta:Number(data.venta), fechaActualizacion:data.fechaActualizacion, fetchedAt:new Date().toISOString()};
    localStorage.setItem(RATES_KEY,JSON.stringify(rates));
    renderRates(); $("blueStatus").textContent="Estado: OK (online)"; updatePreview();
  }catch(e){
    renderRates(); $("blueStatus").textContent="Estado: sin conexión (usando último guardado)";
  }
}
function renderRates(){
  $("blueCompra").textContent=rates?.compra?fmtARS(rates.compra):"—";
  $("blueVenta").textContent=rates?.venta?fmtARS(rates.venta):"—";
  $("blueUpdated").textContent=rates?.fechaActualizacion?new Date(rates.fechaActualizacion).toLocaleString("es-AR"):(rates?.fetchedAt?new Date(rates.fetchedAt).toLocaleString("es-AR"):"—");
}

// Settings
function loadSettings(){
  const raw=localStorage.getItem(SETTINGS_KEY);
  if(!raw) return {defaultRateType:"venta",alwaysVentaDefault:true};
  try{
    const s=JSON.parse(raw);
    return {defaultRateType:(s.defaultRateType==="compra")?"compra":"venta", alwaysVentaDefault:!!s.alwaysVentaDefault};
  }catch{return {defaultRateType:"venta",alwaysVentaDefault:true};}
}
function saveSettings(s){localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));}
function updateAlwaysVentaBtn(){ $("btnToggleAlwaysVenta").textContent=settings.alwaysVentaDefault?"✅ Siempre VENTA por defecto":"⬜ Siempre VENTA por defecto"; }
function applyDefaultRateType(){ $("rateType").value=settings.alwaysVentaDefault?"venta":settings.defaultRateType; }

// Methods
function loadMethods(){
  const raw=localStorage.getItem(METHODS_KEY);
  if(!raw) return ["Efectivo","MercadoPago","Tarjeta","Transferencia","Brubank","Ualá","AstroPay"];
  try{const a=JSON.parse(raw); return Array.isArray(a)?a:["Efectivo","MercadoPago"];}catch{return ["Efectivo","MercadoPago"];}
}
function saveMethods(a){localStorage.setItem(METHODS_KEY,JSON.stringify(a));}
function renderMethodsSelect(){
  const sel=$("method"); sel.innerHTML='<option value="">—</option>';
  methods.forEach(m=>{const o=document.createElement("option");o.value=m;o.textContent=m;sel.appendChild(o);});
}
function methodIsUsed(name){return gastos.some(g=>(g.method||"")===name);}
function renderMethodsManager(){
  const ul=$("methodsList"); ul.innerHTML="";
  methods.forEach(m=>{
    const li=document.createElement("li"); li.className="item";
    const used=methodIsUsed(m);
    li.innerHTML=`<div class="itemTop"><div><strong>${escapeHtml(m)}</strong> ${used?'<span class="pill">usado</span>':""}</div>
      <div class="actions"><button class="ghost" data-delmethod="${escapeHtml(m)}" ${used?"disabled":""}>${used?"No se puede borrar":"Borrar"}</button></div></div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll("button[data-delmethod]").forEach(btn=>{
    btn.onclick=()=>{const name=btn.getAttribute("data-delmethod"); if(methodIsUsed(name)) return;
      methods=methods.filter(x=>x!==name); saveMethods(methods); renderMethodsSelect(); renderMethodsManager(); renderMonth(); renderCalendar(); renderDayDetails(); renderList();
    };
  });
}
function addMethodFromUI(){
  const input=$("newMethod"); const name=(input.value||"").trim(); if(!name) return;
  if(methods.some(m=>m.toLowerCase()===name.toLowerCase())) return alert("Ese método ya existe.");
  methods.push(name); methods.sort((a,b)=>a.localeCompare(b,"es")); saveMethods(methods);
  input.value=""; renderMethodsSelect(); renderMethodsManager(); renderMonth();
}

// Gastos
function loadGastos(){const raw=localStorage.getItem(STORE_KEY); if(!raw) return []; try{return JSON.parse(raw)||[];}catch{return [];}}
function saveGastos(){localStorage.setItem(STORE_KEY,JSON.stringify(gastos));}
function loadRatesCache(){const raw=localStorage.getItem(RATES_KEY); if(!raw) return {}; try{return JSON.parse(raw)||{};}catch{return {};}}
function findById(id){return gastos.find(g=>g.id===id);}
function resetFormKeepPrefs(){
  $("amount").value=""; $("category").value=""; $("method").value=""; $("note").value="";
  $("currency").value="ARS"; $("date").value=todayISO(); applyDefaultRateType(); updatePreview();
}
function onSave(){
  const date=$("date").value||todayISO(), currency=$("currency").value, amount=Number($("amount").value);
  const category=($("category").value||"Otros").trim(), method=$("method").value||"", note=($("note").value||"").trim();
  const rateType=$("rateType").value;
  if(!amount||amount<=0) return alert("Poné un monto válido.");
  if(!rates?.compra||!rates?.venta) return alert("No tengo dólar. Tocá 'Actualizar ahora'.");
  const usedRate=(rateType==="compra")?rates.compra:rates.venta;
  const frozen={blue_compra:rates.compra, blue_venta:rates.venta, fechaActualizacion:rates.fechaActualizacion||rates.fetchedAt||new Date().toISOString(), usado_tipo:rateType, usado_valor:usedRate};
  let ars=0,usd=0;
  if(currency==="ARS"){ars=amount; usd=round2(amount/usedRate);} else {usd=amount; ars=round2(amount*usedRate);}
  const gasto={id:editingId??crypto.randomUUID(), date,currency,amount,category,method,note,ars,usd,frozen,
    createdAt:editingId?findById(editingId)?.createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()};
  if(editingId){gastos=gastos.map(g=>g.id===editingId?gasto:g); editingId=null; $("btnSave").textContent="Guardar gasto";}
  else gastos.unshift(gasto);
  saveGastos(); renderCatDatalist(); renderMethodsManager(); resetFormKeepPrefs();
  renderList(); renderCalendar(); renderDayDetails(); renderMonth();
  alert("Guardado ✅");
}
function editGasto(id){
  const g=findById(id); if(!g) return;
  editingId=id; $("btnSave").textContent="Actualizar gasto";
  $("date").value=g.date; $("currency").value=g.currency; $("amount").value=g.amount;
  $("category").value=g.category; $("method").value=g.method||""; $("note").value=g.note||"";
  $("rateType").value=g.frozen?.usado_tipo||"venta";
  showView("add"); updatePreview();
}
function deleteGasto(id){
  if(!confirm("¿Borrar este gasto?")) return;
  gastos=gastos.filter(g=>g.id!==id); saveGastos();
  renderMethodsManager(); renderList(); renderCalendar(); renderDayDetails(); renderMonth();
}

// Preview
function updatePreview(){
  const currency=$("currency").value, amount=Number($("amount").value||0), rateType=$("rateType").value;
  if(!amount||amount<=0||!rates?.compra||!rates?.venta){$("preview").textContent="Equivalente: —";return;}
  const used=(rateType==="compra")?rates.compra:rates.venta;
  $("preview").textContent = (currency==="ARS")
    ? `Equivale a ${fmtUSD(round2(amount/used))} usando ${rateType.toUpperCase()} ${fmtARS(used)}`
    : `Equivale a ${fmtARS(round2(amount*used))} usando ${rateType.toUpperCase()} ${fmtARS(used)}`;
}

// Historial
function renderList(){
  const month=$("filterMonth").value, text=($("filterText").value||"").toLowerCase().trim();
  const filtered=gastos.filter(g=>{
    const inMonth=month?(g.date&&g.date.startsWith(month)):true;
    const hay=`${g.category} ${g.method} ${g.note}`.toLowerCase();
    const okText=text?hay.includes(text):true;
    const inDay=historyDayISO?(g.date===historyDayISO):true;
    return inMonth&&okText&&inDay;
  });
  const ul=$("list"); ul.innerHTML="";
  $("listEmpty").style.display=filtered.length?"none":"";
  filtered.forEach(g=>{
    const li=document.createElement("li"); li.className="item";
    li.innerHTML=`<div class="itemTop"><div>
      <strong>${escapeHtml(g.category)}</strong>
      <div class="muted">${g.date} • ${g.method?escapeHtml(g.method):"—"} • ${g.currency} ${fmtNum(g.amount)}</div>
      <div class="muted">USD ${fmtNum(g.usd)} • ARS ${fmtNum(g.ars)} • Dólar: ${(g.frozen?.usado_tipo||"—").toUpperCase()} ${fmtNum(g.frozen?.usado_valor||0)}</div>
      ${g.note?`<div class="muted">${escapeHtml(g.note)}</div>`:""}
    </div>
    <div class="actions"><button class="ghost" data-edit="${g.id}">Editar</button><button class="ghost" data-del="${g.id}">Borrar</button></div></div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll("button[data-edit]").forEach(b=>b.onclick=()=>editGasto(b.getAttribute("data-edit")));
  ul.querySelectorAll("button[data-del]").forEach(b=>b.onclick=()=>deleteGasto(b.getAttribute("data-del")));

  if(historyDayISO){
    $("dayFilterBar").style.display="";
    $("dayFilterText").textContent=historyDayISO;
    const dayItems=gastos.filter(g=>g.date===historyDayISO);
    const tARS=round2(dayItems.reduce((s,g)=>s+(Number(g.ars)||0),0));
    const tUSD=round2(dayItems.reduce((s,g)=>s+(Number(g.usd)||0),0));
    $("dayFilterARS").textContent=fmtARS(tARS);
    $("dayFilterUSD").textContent=fmtUSD(tUSD);
  }else $("dayFilterBar").style.display="none";
}

// Calendario
function addMonths(d,delta){return new Date(d.getFullYear(),d.getMonth()+delta,1);}
function monthKeyFromDate(d){const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"); return `${y}-${m}`;}
function renderCalendar(){
  const mk=monthKeyFromDate(calCurrent);
  const title=calCurrent.toLocaleDateString("es-AR",{month:"long",year:"numeric"});
  $("calTitle").textContent=title.charAt(0).toUpperCase()+title.slice(1);
  $("calSelected").textContent=calSelectedISO;

  const y=calCurrent.getFullYear(), mo=calCurrent.getMonth();
  const first=new Date(y,mo,1), last=new Date(y,mo+1,0), dim=last.getDate();
  const mondayIndex=(first.getDay()+6)%7;

  const totalsByDay=new Map();
  for(const g of gastos){
    if(!g.date||!g.date.startsWith(mk)) continue;
    const cur=totalsByDay.get(g.date)||{ars:0,usd:0,count:0};
    cur.ars+=Number(g.ars)||0; cur.usd+=Number(g.usd)||0; cur.count+=1;
    totalsByDay.set(g.date,cur);
  }

  const names=["L","M","M","J","V","S","D"];
  let html=`<div class="calGridHeader">${names.map(n=>`<div class="muted" style="text-align:center;">${n}</div>`).join("")}</div>`;
  html+=`<div class="calGridDays">`;
  for(let i=0;i<mondayIndex;i++) html+=`<div style="height:54px;"></div>`;
  for(let day=1;day<=dim;day++){
    const iso=`${y}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const has=totalsByDay.get(iso);
    const sel=iso===calSelectedISO;
    html+=`<button class="calDayBtn ${sel?"sel":""}" data-iso="${iso}">
      <div class="dotRow"><div style="font-weight:800;">${day}</div>${has?`<span class="dot" title="Hay gastos"></span>`:""} </div>
      ${has?`<div class="muted" style="font-size:11px;">${has.count} • USD ${fmtNum(round2(has.usd))}</div>`:`<div class="muted" style="font-size:11px;">—</div>`}
    </button>`;
  }
  html+=`</div>`;
  $("calendarGrid").innerHTML=html;
  $("calendarGrid").querySelectorAll("button[data-iso]").forEach(btn=>{
    btn.onclick=()=>{calSelectedISO=btn.getAttribute("data-iso");renderCalendar();renderDayDetails();};
  });
}
function renderDayDetails(){
  const iso=calSelectedISO;
  $("calSelected").textContent=iso;
  const items=gastos.filter(g=>g.date===iso).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const tARS=round2(items.reduce((s,g)=>s+(Number(g.ars)||0),0));
  const tUSD=round2(items.reduce((s,g)=>s+(Number(g.usd)||0),0));
  $("dayTotalARS").textContent=fmtARS(tARS);
  $("dayTotalUSD").textContent=fmtUSD(tUSD);
  const ul=$("dayList"); ul.innerHTML="";
  $("dayEmpty").style.display=items.length?"none":"";
  items.forEach(g=>{
    const time=g.createdAt?new Date(g.createdAt).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}):"—";
    const li=document.createElement("li"); li.className="item";
    li.innerHTML=`<div class="itemTop"><div>
      <strong>${escapeHtml(g.category)}</strong>
      <div class="muted">${time} • ${g.method?escapeHtml(g.method):"—"} • ${g.currency} ${fmtNum(g.amount)}</div>
      <div class="muted">USD ${fmtNum(g.usd)} • ARS ${fmtNum(g.ars)} • ${(g.frozen?.usado_tipo||"—").toUpperCase()} ${fmtNum(g.frozen?.usado_valor||0)}</div>
      ${g.note?`<div class="muted">${escapeHtml(g.note)}</div>`:""}
    </div></div>`;
    ul.appendChild(li);
  });
}

// Resumen mes
function renderMonth(){
  const mk=monthKeyFromDate(calCurrent);
  const list=gastos.filter(g=>g.date&&g.date.startsWith(mk));
  $("sumARS").textContent=fmtARS(round2(list.reduce((a,g)=>a+(Number(g.ars)||0),0)));
  $("sumUSD").textContent=fmtUSD(round2(list.reduce((a,g)=>a+(Number(g.usd)||0),0)));

  const byCat=new Map();
  for(const g of list){const k=g.category||"Otros"; byCat.set(k,(byCat.get(k)||0)+(Number(g.usd)||0));}
  const rank=[...byCat.entries()].sort((a,b)=>b[1]-a[1]);
  const ul=$("catRank"); ul.innerHTML=""; $("catEmpty").style.display=rank.length?"none":"";
  rank.forEach(([cat,usd])=>{const li=document.createElement("li"); li.className="item";
    li.innerHTML=`<div class="itemTop"><div><strong>${escapeHtml(cat)}</strong></div><div class="pill">${fmtUSD(round2(usd))}</div></div>`; ul.appendChild(li);});

  const byMethod=new Map();
  for(const g of list){const k=g.method||"—"; const cur=byMethod.get(k)||{ars:0,usd:0}; cur.ars+=Number(g.ars)||0; cur.usd+=Number(g.usd)||0; byMethod.set(k,cur);}
  const mRank=[...byMethod.entries()].sort((a,b)=>b[1].usd-a[1].usd);
  const ulM=$("methodRank"); ulM.innerHTML=""; $("methodEmpty").style.display=mRank.length?"none":"";
  mRank.forEach(([m,t])=>{const li=document.createElement("li"); li.className="item";
    li.innerHTML=`<div class="itemTop"><div><strong>${escapeHtml(m)}</strong></div><div class="row" style="gap:8px;">
      <span class="pill">USD ${fmtNum(round2(t.usd))}</span><span class="pill">ARS ${fmtNum(round2(t.ars))}</span></div></div>`; ulM.appendChild(li);});
}

// Export CSV
function exportCSV(){
  if(!gastos.length) return alert("No hay gastos para exportar.");
  const headers=["id","fecha","categoria","metodo","moneda","monto","ars","usd","rate_tipo","rate_valor","blue_compra","blue_venta","fechaActualizacion","nota","createdAt","updatedAt"];
  const rows=gastos.map(g=>[g.id,g.date,g.category||"",g.method||"",g.currency,g.amount,g.ars,g.usd,g.frozen?.usado_tipo||"",g.frozen?.usado_valor||"",g.frozen?.blue_compra||"",g.frozen?.blue_venta||"",g.frozen?.fechaActualizacion||"",String(g.note||"").replaceAll("\n"," ").trim(),g.createdAt||"",g.updatedAt||""]);
  const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=`gastos_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

// Categorías
function renderCatDatalist(){
  const set=new Set(["Comida","Transporte","Servicios","Suscripciones","Salud","Compras","Salidas","Antojos","Otros"]);
  for(const g of gastos) if(g.category) set.add(g.category);
  const dl=$("catList"); dl.innerHTML=""; [...set].sort().forEach(c=>{const o=document.createElement("option"); o.value=c; dl.appendChild(o);});
}


// EVENTOS
function loadEventos(){try{return JSON.parse(localStorage.getItem(EVENTS_KEY)||'[]');}catch{return [];}}
function saveEventos(){localStorage.setItem(EVENTS_KEY,JSON.stringify(eventos));}
function onSaveEvent(){
  const d=$("eventDate").value||todayISO(),t=$("eventTime").value||"",desc=$("eventDescription").value.trim();
  if(!desc)return alert("Escribí una descripción");

  if(editingEventId){
    eventos = eventos.map(e => e.id===editingEventId ? {id:e.id,date:d,time:t,description:desc} : e);
    editingEventId = null;
    alert("✅ Evento actualizado");
  } else {
    eventos.unshift({id:crypto.randomUUID(),date:d,time:t,description:desc});
    alert("✅ Guardado");
  }

  saveEventos();
  $("eventDescription").value="";
  renderEventsList();
}
function renderEventsList(){
  const m=$("filterEventMonth").value,ul=$("eventsList");ul.innerHTML="";
  eventos.filter(e=>!m||e.date.startsWith(m)).forEach(e=>{
    const li=document.createElement("li");li.className="item";
    li.innerHTML=`<div class="itemTop"><div><strong>${escapeHtml(e.description)}</strong><div class="muted">${e.date} ${e.time}</div></div><div class="actions"><button class="ghost" data-editevent="${e.id}">Editar</button><button class="ghost" data-delevent="${e.id}">Borrar</button></div></div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll("button[data-editevent]").forEach(b=>b.onclick=()=>editEvento(b.getAttribute("data-editevent")));
  ul.querySelectorAll("button[data-delevent]").forEach(b=>b.onclick=()=>deleteEvento(b.getAttribute("data-delevent")));
}
function editEvento(id){
  const e=eventos.find(x=>x.id===id);if(!e)return;
  editingEventId=id;
  $("eventDate").value=e.date;
  $("eventTime").value=e.time;
  $("eventDescription").value=e.description;
}
function deleteEvento(id){
  if(!confirm("¿Borrar?"))return;
  eventos=eventos.filter(e=>e.id!==id);saveEventos();renderEventsList();
}

// INGRESOS
function loadIngresos(){try{return JSON.parse(localStorage.getItem(INGRESOS_KEY)||'[]');}catch{return [];}}
function saveIngresos(){localStorage.setItem(INGRESOS_KEY,JSON.stringify(ingresos));}
function onSaveIngreso(){
  const d=$("ingresoDate").value||todayISO(),amt=Number($("ingresoAmount").value),desc=$("ingresoDesc").value.trim();
  if(!amt||amt<=0)return alert("Monto inválido");

  if(editingIngresoId){
    ingresos = ingresos.map(i => i.id===editingIngresoId ? {id:i.id,date:d,amount:amt,description:desc} : i);
    editingIngresoId=null;
    alert("✅ Ingreso actualizado");
  } else {
    ingresos.unshift({id:crypto.randomUUID(),date:d,amount:amt,description:desc});
    alert("✅ Guardado");
  }

  saveIngresos();
  $("ingresoAmount").value="";
  $("ingresoDesc").value="";
  renderIngresosList();
  renderBalance();
}
function renderIngresosList(){
  const m=$("filterIngresoMonth").value,ul=$("ingresosList");ul.innerHTML="";
  ingresos.filter(i=>!m||i.date.startsWith(m)).forEach(i=>{
    const li=document.createElement("li");li.className="item";
    li.innerHTML=`<div class="itemTop"><div><strong>${escapeHtml(i.description)}</strong><div class="muted">${i.date} • ${fmtARS(i.amount)}</div></div><div class="actions"><button class="ghost" data-editingreso="${i.id}">Editar</button><button class="ghost" data-delingreso="${i.id}">Borrar</button></div></div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll("button[data-editingreso]").forEach(b=>b.onclick=()=>editIngreso(b.getAttribute("data-editingreso")));
  ul.querySelectorAll("button[data-delingreso]").forEach(b=>b.onclick=()=>deleteIngreso(b.getAttribute("data-delingreso")));
}
function editIngreso(id){
  const ing=ingresos.find(x=>x.id===id);if(!ing)return;
  editingIngresoId=id;
  $("ingresoDate").value=ing.date;
  $("ingresoAmount").value=ing.amount;
  $("ingresoDesc").value=ing.description;
}
function deleteIngreso(id){
  if(!confirm("¿Borrar?"))return;
  ingresos=ingresos.filter(i=>i.id!==id);saveIngresos();renderIngresosList();renderBalance();
}
function renderBalance(){
  const m=$("filterIngresoMonth").value||monthISO(new Date());
  const ing=ingresos.filter(i=>i.date.startsWith(m)).reduce((s,i)=>s+i.amount,0);
  const gast=gastos.filter(g=>g.date&&g.date.startsWith(m)).reduce((s,g)=>s+(Number(g.ars)||0),0);
  const bal=ing-gast;
  $("totalIngresos").textContent=fmtARS(ing);
  $("totalGastos").textContent=fmtARS(gast);
  $("balance").textContent=fmtARS(bal);
  $("balance").style.color=bal>=0?"#2DD4BF":"#ef4444";
}
function getCurrentTime(){const d=new Date();return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}

// Helpers
function todayISO(){const d=new Date(),off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,10);}
function monthISO(d){const off=d.getTimezoneOffset(); return new Date(d.getTime()-off*60000).toISOString().slice(0,7);}
function round2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function fmtNum(n){return Number(n).toLocaleString("es-AR",{maximumFractionDigits:2,minimumFractionDigits:0});}
function fmtARS(n){return Number(n).toLocaleString("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2});}
function fmtUSD(n){return Number(n).toLocaleString("es-AR",{style:"currency",currency:"USD",maximumFractionDigits:2});}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// SW (PWA)
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));}

function addSwipeNavigation(){
  // Swipe izquierda/derecha para cambiar entre Agregar -> Historial -> Mes
  // Evita dispararse cuando estás escribiendo en inputs o haciendo scroll vertical.
  let startX=0, startY=0, startT=0, moved=false;
  const THRESH_X = 60;     // px mínimos horizontal
  const THRESH_RATIO = 1.2; // debe ser más horizontal que vertical
  const MAX_TIME = 800;    // ms

  function isFormEl(el){
    if(!el) return false;
    const tag = (el.tagName||"").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  document.addEventListener("touchstart", (e)=>{
    if(!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
    moved = false;
  }, {passive:true});

  document.addEventListener("touchmove", (e)=>{
    moved = true;
  }, {passive:true});

  document.addEventListener("touchend", (e)=>{
    // Si terminó en un input/selector, no cambiar de vista
    const target = e.target;
    if(isFormEl(target) || (target && target.closest && target.closest("input, textarea, select, .actions"))) return;

    const dt = Date.now() - startT;
    if(dt > MAX_TIME) return;

    // touchend no siempre trae changedTouches, fallback
    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if(!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if(Math.abs(dx) < THRESH_X) return;
    if(Math.abs(dx) < Math.abs(dy) * THRESH_RATIO) return; // era más vertical

    // mapping
    const order = ["add","list","month","events","ingresos"];
    let idx = order.indexOf(currentView);
    if(idx === -1) idx = 0;

    if(dx < 0 && idx < order.length - 1){
      showView(order[idx+1]);
    } else if(dx > 0 && idx > 0){
      showView(order[idx-1]);
    }
  }, {passive:true});
}

init();
