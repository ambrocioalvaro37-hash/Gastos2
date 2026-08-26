// CONFIG & CONSTANTS
const BLUE_URL="https://dolarapi.com/v1/dolares/blue";
const STORE_KEY="gastos_app_v1", RATES_KEY="gastos_rates_cache_v1", METHODS_KEY="gastos_methods_v1";
const $=id=>document.getElementById(id);

// STATE
let gastos=loadGastos(), rates=loadRatesCache(), methods=loadMethods(), editingId=null;
let calCurrent=new Date(); calCurrent.setDate(1);
let calSelectedISO=todayISO();
let currentView="add";
let currentMode="gasto"; // Puede ser 'gasto' o 'evento'

function init(){
  // Tabs Navegación
  $("tabAdd").onclick=()=>showView("add");
  $("tabList").onclick=()=>showView("list");
  $("tabMonth").onclick=()=>showView("month");

  // Switch Modo (Gasto vs Evento)
  $("btnSetGasto").onclick=()=>setMode("gasto");
  $("btnSetEvento").onclick=()=>setMode("evento");

  // Inputs por defecto
  $("date").value=todayISO();
  $("timeInput").value=nowTimeISO();
  $("filterMonth").value=monthISO(new Date());

  // Listeners
  ["currency","amount","rateType"].forEach(id=>$(id).addEventListener("input",updatePreview));
  
  $("btnSave").onclick=onSave;
  $("filterMonth").onchange=renderList;
  $("filterText").oninput=renderList;
  $("btnRefreshRates").onclick=refreshRates;
  
  // Calendario
  $("calPrev").onclick=()=>{calCurrent=addMonths(calCurrent,-1);renderCalendar();renderMonth();};
  $("calNext").onclick=()=>{calCurrent=addMonths(calCurrent, 1);renderCalendar();renderMonth();};

  // Inicializar todo
  renderCatDatalist();
  renderMethodsSelect();
  renderRates();
  updatePreview();
  renderList();
  renderCalendar();
  renderDayDetails();
  renderMonth();
  showView("add");
  setMode("gasto"); // Arranca en modo gasto
  refreshRates().catch(()=>{});
  addSwipeNavigation(); 
}

// --- LOGICA DE VISTAS ---
function showView(which){
  currentView = which;
  ["viewAdd","viewList","viewMonth"].forEach(id => $(id).classList.remove("is-visible"));
  ["tabAdd","tabList","tabMonth"].forEach(id => $(id).classList.remove("active"));
  
  if(which==="add"){ $("viewAdd").classList.add("is-visible"); $("tabAdd").classList.add("active"); }
  if(which==="list"){ $("viewList").classList.add("is-visible"); $("tabList").classList.add("active"); renderList(); }
  if(which==="month"){ $("viewMonth").classList.add("is-visible"); $("tabMonth").classList.add("active"); renderMonth(); }
  
  // Animación simple
  $(which==="add"?"viewAdd":(which==="list"?"viewList":"viewMonth")).classList.add("animate-in");
  setTimeout(()=>document.querySelectorAll(".view").forEach(e=>e.classList.remove("animate-in")),300);
}

function setMode(mode){
  currentMode = mode;
  $("btnSetGasto").className = mode==="gasto" ? "active mode-gasto" : "";
  $("btnSetEvento").className = mode==="evento" ? "active mode-evento" : "";
  
  if(mode==="gasto"){
    $("sectionGasto").style.display="block";
    $("sectionEvento").style.display="none";
    $("fieldTime").style.display="none";
    $("btnSave").textContent = editingId ? "Actualizar Gasto" : "Guardar Gasto";
  } else {
    $("sectionGasto").style.display="none";
    $("sectionEvento").style.display="block";
    $("fieldTime").style.display="block"; // Mostrar hora en eventos
    $("btnSave").textContent = editingId ? "Actualizar Evento" : "Guardar Evento";
  }
}

// --- GUARDAR DATOS ---
function onSave(){
  const date=$("date").value||todayISO();
  
  // Estructura base
  let entry = {
    id: editingId || crypto.randomUUID(),
    date: date,
    createdAt: new Date().toISOString(),
    type: currentMode
  };

  if(currentMode === "gasto"){
    // Lógica para GASTOS
    const amount=Number($("amount").value);
    if(!amount||amount<=0) return alert("Falta el monto.");
    if(!rates?.compra) return alert("Actualiza el dólar primero.");

    entry.amount = amount;
    entry.currency = $("currency").value;
    entry.category = ($("category").value||"Otros").trim();
    entry.method = $("method").value;
    entry.note = $("note").value;
    
    const rateType = $("rateType").value;
    const rateVal = rateType==="venta"?rates.venta:rates.compra;
    entry.frozen = { tipo:rateType, valor:rateVal };
    
    if(entry.currency==="ARS"){ entry.ars=amount; entry.usd=round2(amount/rateVal); }
    else { entry.usd=amount; entry.ars=round2(amount*rateVal); }
    
  } else {
    // Lógica para EVENTOS
    entry.title = $("eventTitle").value;
    if(!entry.title) return alert("Escribe qué hiciste.");
    entry.subType = $("eventType").value; // Personal, Salud, etc.
    entry.time = $("timeInput").value;
    entry.note = $("note").value;
  }

  // Guardar en array
  if(editingId){
    gastos = gastos.map(g => g.id===editingId ? entry : g);
    editingId = null;
    alert("Actualizado!");
  } else {
    gastos.unshift(entry);
    alert("Guardado!");
  }
  
  saveGastos();
  resetForm();
  renderList(); renderMonth();
}

function resetForm(){
  $("amount").value=""; $("note").value=""; $("eventTitle").value="";
  $("date").value=todayISO(); $("timeInput").value=nowTimeISO();
}

// --- RENDERIZADO ---
function renderList(){
  const m=$("filterMonth").value, txt=($("filterText").value||"").toLowerCase();
  
  const filtered = gastos.filter(g => {
    if(m && !g.date.startsWith(m)) return false;
    // Búsqueda en texto
    const content = (g.category||"")+" "+(g.title||"")+" "+(g.note||"");
    if(txt && !content.toLowerCase().includes(txt)) return false;
    return true;
  });

  const ul=$("list"); ul.innerHTML="";
  $("listEmpty").style.display = filtered.length?"none":"block";

  filtered.forEach(g => {
    const li=document.createElement("li"); li.className="item";
    
    if(g.type === "evento"){
      // === CÓMO SE VE UN EVENTO EN LA LISTA ===
      li.innerHTML = `
        <div class="itemTop">
           <div>
             <strong style="color:var(--event)">${getIcon(g.subType)} ${g.title}</strong>
             <div class="muted">${fmtDate(g.date)} • ${g.time||""} • ${g.subType}</div>
             ${g.note ? `<div class="muted">"${g.note}"</div>` : ""}
           </div>
           <div class="actions">
             <button class="ghost" onclick="editG('${g.id}')">✏️</button>
             <button class="ghost" onclick="delG('${g.id}')">🗑️</button>
           </div>
        </div>`;
    } else {
      // === CÓMO SE VE UN GASTO (Tu diseño original) ===
      li.innerHTML=`
        <div class="itemTop">
          <div>
            <strong>${g.category}</strong>
            <div class="muted">${fmtDate(g.date)} • ${g.method||"-"} • ${g.currency} ${fmtNum(g.amount)}</div>
            <div class="muted">USD ${fmtNum(g.usd)} • ARS ${fmtNum(g.ars)}</div>
            ${g.note?`<div class="muted">${g.note}</div>`:""}
          </div>
          <div class="actions">
             <button class="ghost" onclick="editG('${g.id}')">✏️</button>
             <button class="ghost" onclick="delG('${g.id}')">🗑️</button>
          </div>
        </div>`;
    }
    ul.appendChild(li);
  });
}

function renderMonth(){
  // Totales (Solo sumamos Gastos)
  const mk = monthKeyFromDate(calCurrent);
  $("calTitle").textContent = calCurrent.toLocaleDateString("es-AR",{month:"long", year:"numeric"});
  
  const monthData = gastos.filter(g => g.date.startsWith(mk));
  const totalArs = monthData.filter(g=>g.type!=="evento").reduce((s,g)=>s+(g.ars||0),0);
  const totalUsd = monthData.filter(g=>g.type!=="evento").reduce((s,g)=>s+(g.usd||0),0);
  
  $("sumARS").textContent = fmtARS(totalArs);
  $("sumUSD").textContent = fmtUSD(totalUsd);
  
  // Calendario Grid
  const y=calCurrent.getFullYear(), m=calCurrent.getMonth();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay(); // 0=Dom
  
  const grid=$("calendarGrid"); 
  grid.innerHTML = `<div class="calGridHeader">${["D","L","M","M","J","V","S"].map(d=>`<div class="muted" style="text-align:center">${d}</div>`).join("")}</div><div class="calGridDays"></div>`;
  const daysContainer = grid.querySelector(".calGridDays");
  
  // Espacios vacios
  for(let i=0; i<firstDay; i++) daysContainer.innerHTML+=`<div></div>`;
  
  // Dias
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayItems = gastos.filter(g=>g.date===iso);
    const hasGasto = dayItems.some(g=>g.type!=="evento");
    const hasEvent = dayItems.some(g=>g.type==="evento");
    
    const sel = iso===calSelectedISO ? "sel" : "";
    
    // Mostramos puntito verde si hay gasto, violeta si hay evento
    daysContainer.innerHTML += `
      <button class="calDayBtn ${sel}" onclick="selDay('${iso}')">
        <div style="font-weight:bold;">${d}</div>
        <div class="dotRow">
          ${hasGasto ? `<div class="dot"></div>` : ""}
          ${hasEvent ? `<div class="dot event"></div>` : ""}
        </div>
      </button>`;
  }
  
  renderDayDetails();
}

function renderDayDetails(){
  $("calSelected").textContent = fmtDate(calSelectedISO);
  const list = $("dayList"); list.innerHTML="";
  const items = gastos.filter(g => g.date === calSelectedISO);
  
  if(!items.length) { list.innerHTML="<div class='muted'>Nada este día.</div>"; return; }
  
  items.forEach(g => {
    const li=document.createElement("li"); li.className="item";
    if(g.type==="evento"){
      li.innerHTML = `<div><strong style="color:var(--event)">${getIcon(g.subType)} ${g.title}</strong> <span class="muted">${g.time}</span></div>`;
    } else {
      li.innerHTML = `<div><strong>${g.category}</strong> <span class="muted">${g.currency} ${fmtNum(g.amount)}</span></div>`;
    }
    list.appendChild(li);
  });
}

// --- UTILS & DATA ---
function loadGastos(){ try{return JSON.parse(localStorage.getItem(STORE_KEY))||[];}catch{return[];} }
function saveGastos(){ localStorage.setItem(STORE_KEY, JSON.stringify(gastos)); }
function loadRatesCache(){ try{return JSON.parse(localStorage.getItem(RATES_KEY))||{};}catch{return{};} }
function loadMethods(){ const r=localStorage.getItem(METHODS_KEY); return r?JSON.parse(r):["Efectivo","MercadoPago","Débito","Crédito"]; }

async function refreshRates(){
  const r=await fetch(BLUE_URL); const d=await r.json();
  rates={compra:d.compra, venta:d.venta, date:new Date().toISOString()};
  localStorage.setItem(RATES_KEY,JSON.stringify(rates));
  renderRates(); updatePreview();
}
function renderRates(){ $("blueCompra").textContent=rates.compra||"-"; $("blueVenta").textContent=rates.venta||"-"; }
function renderCatDatalist(){ const dl=$("catList"); dl.innerHTML=""; ["Comida","Super","Salidas","Transporte","Servicios","Varios"].forEach(c=>{dl.innerHTML+=`<option value="${c}">`}); }
function renderMethodsSelect(){ const s=$("method"); s.innerHTML=""; methods.forEach(m=>s.innerHTML+=`<option value="${m}">${m}</option>`); }
function updatePreview(){
  const cur=$("currency").value, amt=Number($("amount").value), type=$("rateType").value;
  if(!amt || !rates.venta){ $("preview").textContent="—"; return; }
  const r = type==="venta"?rates.venta:rates.compra;
  const res = cur==="ARS" ? (amt/r) : (amt*r);
  const symbol = cur==="ARS" ? "USD" : "ARS";
  $("preview").textContent = `≈ ${symbol} ${fmtNum(res)}`;
}

// Acciones globales (Editar/Borrar)
window.editG = (id) => {
  const g = gastos.find(x=>x.id===id); if(!g)return;
  editingId=id; showView("add");
  $("date").value=g.date; $("note").value=g.note||"";
  
  if(g.type==="evento"){
    setMode("evento");
    $("eventType").value=g.subType; $("eventTitle").value=g.title; $("timeInput").value=g.time;
  } else {
    setMode("gasto");
    $("amount").value=g.amount; $("currency").value=g.currency; $("category").value=g.category; $("method").value=g.method;
    $("rateType").value=g.frozen?.tipo||"venta";
  }
};
window.delG = (id) => { if(confirm("Borrar?")){ gastos=gastos.filter(x=>x.id!==id); saveGastos(); renderList(); renderMonth(); } };
window.selDay = (iso) => { calSelectedISO=iso; renderMonth(); };

// Helpers
function todayISO(){ return new Date(new Date().getTime() - new Date().getTimezoneOffset()*60000).toISOString().split("T")[0]; }
function nowTimeISO(){ return new Date().toTimeString().slice(0,5); }
function monthISO(d){ return d.toISOString().slice(0,7); }
function monthKeyFromDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function addMonths(d,n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
function round2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
function fmtNum(n){ return new Intl.NumberFormat("es-AR",{minimumFractionDigits:0, maximumFractionDigits:2}).format(n); }
function fmtARS(n){ return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(n); }
function fmtUSD(n){ return new Intl.NumberFormat("es-AR",{style:"currency",currency:"USD"}).format(n); }
function fmtDate(iso){ const [y,m,d]=iso.split("-"); return `${d}/${m}`; }
function getIcon(t){ const m={"Personal":"🐶","Salud":"🏥","Trabajo":"💼","Social":"🎉","Recordatorio":"⏰"}; return m[t]||"📌"; }

// Swipe
function addSwipeNavigation(){
  let startX=0, startY=0;
  document.addEventListener("touchstart",e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;}, {passive:true});
  document.addEventListener("touchend",e=>{
    const dx=e.changedTouches[0].clientX-startX, dy=e.changedTouches[0].clientY-startY;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.5){
      if(dx<0 && currentView==="add") showView("list");
      else if(dx<0 && currentView==="list") showView("month");
      else if(dx>0 && currentView==="month") showView("list");
      else if(dx>0 && currentView==="list") showView("add");
    }
  }, {passive:true});
}

init();