// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxXulFw6xdyWWwhCwhX6SBz64LrIpj_kC8matZilLgPBiEc-Aep_DdNmTilC9vrYZpcfA/exec";
const MESES_NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const LOADER_PHASES = [
    "Conectando con el servidor central...",
    "Descargando flujos de caja y balances...",
    "Integrando sistema de RRHH y sueldos...",
    "Cargando módulos comerciales...",
    "Sincronizando vistas dinámicas...",
    "Inicializando entorno administrativo..."
];

let appState = {
    balances: null, carpetas: {}, proveedores: [], sueldos: {}, 
    selectedMonth: "", selectedYear: "",
    historyMonth: "", historyYear: "",
    sueldosMonth: "", sueldosYear: "", 
    sueldosEditMode: false, proveedoresEditMode: false, historialEditMode: false,
    currentHistorySheet: null, currentHistoryType: null,
    currentUpload: null, activeProvRowIndex: null, activeProvTab: "gen"
};

let loaderInterval = null;

// ==========================================
// INICIALIZACIÓN Y UTILIDADES
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme(); initNavModules(); initSelectors(); initTabs();
    setupEventListeners(); setupWebModalHandlers(); fetchFinancialData(); 
});

function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark';
    if (isDark) { document.body.classList.add('dark-mode'); document.getElementById('moon-icon').classList.add('hidden'); document.getElementById('sun-icon').classList.remove('hidden'); }
    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode'); const dark = document.body.classList.contains('dark-mode'); localStorage.setItem('theme', dark ? 'dark' : 'light');
        document.getElementById('moon-icon').classList.toggle('hidden', dark); document.getElementById('sun-icon').classList.toggle('hidden', !dark);
    });
}

function formatDateToAR(dateStr) {
    if (!dateStr || dateStr === "-") return "";
    const str = dateStr.toString().trim();
    if (str.includes("T") && str.includes("-")) {
        const parts = str.split("T")[0].split("-");
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return str.split(" ")[0];
}

function getValDate(selector, tr) {
    const el = tr.querySelector(selector);
    if (!el) return "";
    const raw = el.getAttribute('data-raw');
    if (el.value === formatDateToAR(raw)) return raw;
    return el.value;
}

function parseMonto(val) {
    if (val === "" || val === null || val === undefined || val === "-") return 0;
    if (typeof val === 'number') return val;
    let str = val.toString().trim();
    str = str.replace(/[^0-9.,-]/g, ''); 
    if (str.includes(',') && str.includes('.')) {
        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');
        if (lastComma > lastDot) { str = str.replace(/\./g, '').replace(',', '.'); } 
        else { str = str.replace(/,/g, ''); } 
    } 
    else if (str.includes(',')) { str = str.replace(',', '.'); } 
    else if (str.includes('.')) {
        const parts = str.split('.');
        if (parts[parts.length - 1].length > 2) { str = str.replace(/\./g, ''); }
    }
    return Number(str) || 0;
}

function initNavModules() {
    document.querySelectorAll(".top-nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".top-nav-btn").forEach(b => b.classList.remove("active")); e.target.classList.add("active");
            const targetModule = e.target.getAttribute("data-module");
            document.querySelectorAll(".app-module").forEach(m => m.classList.toggle("hidden", m.id !== targetModule));
            document.querySelectorAll(".app-module").forEach(m => m.classList.toggle("active", m.id === targetModule));
            if (targetModule === "module-sueldos") renderSueldos();
        });
    });
}

function initSelectors() {
    const today = new Date(); const m = String(today.getMonth() + 1).padStart(2, '0'); const y = String(today.getFullYear());
    appState.selectedMonth = m; appState.selectedYear = y; 
    appState.sueldosMonth = m; appState.sueldosYear = y;
    appState.historyMonth = m; appState.historyYear = y;
    
    document.getElementById("select-month").value = m; document.getElementById("select-year").value = y;
    document.getElementById("sueldos-month").value = m; document.getElementById("sueldos-year").value = y;
    document.getElementById("historial-month").value = m; document.getElementById("historial-year").value = y;
}

function initTabs() {
    document.querySelectorAll("#module-balances .menu-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#module-balances .menu-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
            const tab = btn.getAttribute("data-tab");
            document.querySelectorAll("#module-balances .tab-view").forEach(view => view.classList.toggle("active", view.id === `view-${tab}`));
            if (tab === "balance") { document.getElementById("tab-title").textContent = "Balance"; document.getElementById("tab-subtitle").textContent = "Resumen consolidado"; }
            else if (tab === "resumen-anual") { document.getElementById("tab-title").textContent = "Resumen Anual"; renderAnnualSummary(); }
            else if (tab === "nueva-operacion") { document.getElementById("tab-title").textContent = "Nueva Operación"; document.getElementById("tab-subtitle").textContent = "Registro manual de flujos"; }
            document.querySelectorAll(".history-btn").forEach(b => b.classList.remove("active"));
        });
    });
}

function injectSueldosIntoBalances() {
    if (!appState.balances) return;
    appState.balances.gastos["Sueldos"] = {};
    const gastosSueldos = appState.balances.gastos["Sueldos"];

    Object.keys(appState.sueldos).forEach(year => {
        appState.sueldos[year].forEach((worker, wIndex) => {
            const rData = worker.rowData;
            
            for (let m = 0; m < 12; m++) {
                const offset = m * 14;
                const nombre = rData[offset] || rData[0];
                if (!nombre || nombre === "-") continue;

                const monthStr = String(m + 1).padStart(2, '0');
                const periodKey = `${year}-${monthStr}`;
                if (!gastosSueldos[periodKey]) gastosSueldos[periodKey] = [];
                
                let methodStr = "-"; 
                const valE = parseMonto(rData[offset+10]); 
                const valT = parseMonto(rData[offset+11]);
                if (valE > 0 && valT > 0) methodStr = "Efectivo y Transf.";
                else if (valE > 0) methodStr = "Efectivo"; 
                else if (valT > 0) methodStr = "Transferencia";

                const sueldoNum = parseMonto(rData[offset + 13]);
                const fechaRawSueldo = rData[offset + 12];
                if (sueldoNum > 0) {
                    gastosSueldos[periodKey].push({
                        rowIndex: `s_${wIndex}_${m}_SF`, 
                        fecha: formatDateToAR(fechaRawSueldo) || `01/${monthStr}/${year}`,
                        detalle: nombre, 
                        monto: sueldoNum,
                        mes: MESES_NOMBRES[m],
                        metodoPago: methodStr,
                        precioHora: rData[offset+3] || "-",
                        horas: rData[offset+2] || "-",
                        operacion: "Sueldo Final",
                        isVirtual: true 
                    });
                }

                const adelantos = [
                    { tipo: "Adelanto 1", mIdx: 4, fIdx: 5 },
                    { tipo: "Adelanto 2", mIdx: 6, fIdx: 7 },
                    { tipo: "Adelanto 3", mIdx: 8, fIdx: 9 }
                ];

                adelantos.forEach((ad, aIndex) => {
                    const adMonto = parseMonto(rData[offset + ad.mIdx]);
                    if (adMonto > 0) {
                        gastosSueldos[periodKey].push({
                            rowIndex: `s_${wIndex}_${m}_A${aIndex}`,
                            fecha: formatDateToAR(rData[offset + ad.fIdx]) || `01/${monthStr}/${year}`,
                            detalle: `${nombre} (${ad.tipo})`,
                            monto: adMonto,
                            mes: MESES_NOMBRES[m],
                            metodoPago: methodStr,
                            precioHora: "-",
                            horas: "-",
                            operacion: ad.tipo,
                            isVirtual: true 
                        });
                    }
                });
            }
        });
    });
}

function populateSidebarHistory() {
    const gList = document.getElementById("sidebar-gastos-list"); const iList = document.getElementById("sidebar-ingresos-list");
    gList.innerHTML = ""; iList.innerHTML = ""; if (!appState.balances) return;
    
    Object.keys(appState.balances.gastos).forEach(sheet => {
        const btn = document.createElement("button"); btn.className = "history-btn"; btn.textContent = sheet;
        btn.onclick = () => openHistoryView(sheet, "gastos", btn); gList.appendChild(btn);
    });
    const btnI = document.createElement("button"); btnI.className = "history-btn"; btnI.textContent = "Ingresos";
    btnI.onclick = () => openHistoryView("Ingresos", "ingresos", btnI); iList.appendChild(btnI);
}

function populateCuentasDropdown() {
    const select = document.getElementById("new-op-cuenta");
    if (!select || !appState.balances) return;
    select.innerHTML = '<option value="">-- Seleccione una cuenta --</option>';
    
    const optgroupI = document.createElement("optgroup");
    optgroupI.label = "INGRESOS";
    const optI = document.createElement("option");
    optI.value = "Ingresos"; optI.textContent = "Ingresos";
    optgroupI.appendChild(optI); select.appendChild(optgroupI);

    const optgroupG = document.createElement("optgroup");
    optgroupG.label = "GASTOS";
    
    Object.keys(appState.balances.gastos).forEach(s => {
        if(s === "Sueldos") return; 
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        optgroupG.appendChild(opt);
    });
    select.appendChild(optgroupG);
}

function setupEventListeners() {
    document.getElementById("select-month").onchange = (e) => { appState.selectedMonth = e.target.value; renderBalance(); };
    document.getElementById("select-year").onchange = (e) => { appState.selectedYear = e.target.value; renderBalance(); if(document.getElementById("view-resumen-anual").classList.contains("active")) renderAnnualSummary(); };
    document.getElementById("historial-month").onchange = (e) => { appState.historyMonth = e.target.value; renderHistoryTable(); };
    document.getElementById("historial-year").onchange = (e) => { appState.historyYear = e.target.value; renderHistoryTable(); };

    document.getElementById("btn-add-tab-sheet").onclick = () => {
        const t = prompt("Nombre de la nueva cuenta:"); if(!t || t.trim()==="") return;
        if(t.trim().toLowerCase()==="ingresos" || t.trim().toLowerCase()==="carpetas" || t.trim().toLowerCase()==="sueldos") { alert("Nombre reservado."); return; }
        sendGlobalPostRequest("BAL_ADD_TAB", { sheetName: t.trim() });
    };
    
    document.getElementById("btn-del-tab-sheet").onclick = () => {
        if(!appState.currentHistorySheet || appState.currentHistoryType==="ingresos" || appState.currentHistorySheet==="Sueldos") { alert("Seleccione un gasto válido creado por usted."); return; }
        if(confirm(`¿Eliminar la cuenta '${appState.currentHistorySheet}'?`)) { sendGlobalPostRequest("BAL_DELETE_TAB", { sheetName: appState.currentHistorySheet }); appState.currentHistorySheet = null; document.querySelector('.menu-btn[data-tab="balance"]').click(); }
    };

    document.getElementById("btn-save-nueva-op").onclick = () => {
        const cuenta = document.getElementById("new-op-cuenta").value;
        const fecha = document.getElementById("new-op-fec").value;
        const det = document.getElementById("new-op-det").value;
        let mon = parseMonto(document.getElementById("new-op-mon").value);
        const ope = document.getElementById("new-op-ope").value;
        const i21 = document.getElementById("new-op-i21").value;
        const i10 = document.getElementById("new-op-i10").value;
        const icont = document.getElementById("new-op-icont").value;
        const cc = document.getElementById("new-op-comp-c") ? document.getElementById("new-op-comp-c").value : "";
        const cv = document.getElementById("new-op-comp-v") ? document.getElementById("new-op-comp-v").value : "";

        if(!cuenta || !fecha || !mon) { alert("Complete cuenta de destino, fecha y monto para guardar."); return; }

        let isGasto = cuenta !== "Ingresos";
        if(isGasto && mon > 0) mon = -mon;

        const payload = { rowIndex: null, sheetName: cuenta, fecha: fecha, detalle: det, monto: mon, operacion: ope, iva21: i21, iva105: i10, ivaCont: icont, idComprobanteCompra: cc, idComprobantePago: cv };
        sendGlobalPostRequest("BAL_ADD", payload);
        document.querySelectorAll("#view-nueva-operacion input").forEach(i => i.value = "");
        document.getElementById("new-op-cuenta").value = "";
    };

    document.getElementById("btn-edit-carpetas").onclick = () => {
        document.querySelectorAll("#carpetas-config-section .form-control").forEach(el => el.classList.add("hidden")); document.querySelectorAll("#carpetas-config-section .edit-input").forEach(el => el.classList.remove("hidden"));
        document.getElementById("btn-edit-carpetas").classList.add("hidden"); document.getElementById("btn-save-carpetas").classList.remove("hidden"); document.getElementById("btn-cancel-carpetas").classList.remove("hidden");
    };
    document.getElementById("btn-cancel-carpetas").onclick = () => renderCarpetasSection(appState.currentHistorySheet);
    document.getElementById("btn-save-carpetas").onclick = () => {
        const payload = { rowIndex: (appState.carpetas[appState.currentHistorySheet]||{}).rowIndex, sheetName: appState.currentHistorySheet, idCuenta: document.getElementById("edit-id-cuenta").value, idCompra: document.getElementById("edit-id-compra").value, idPago: document.getElementById("edit-id-pago").value };
        sendGlobalPostRequest("UPDATE_FOLDERS", payload);
    };

    document.getElementById("btn-historial-edit-mode").onclick = () => toggleHistorialEditMode(true);
    document.getElementById("btn-historial-cancel").onclick = () => toggleHistorialEditMode(false);
    document.getElementById("btn-historial-save").onclick = () => saveHistorial();

    document.querySelectorAll("#module-proveedores .menu-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll("#module-proveedores .menu-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
            appState.activeProvTab = btn.getAttribute("data-prov-tab");
            const titles = { "gen": "Datos generales del proveedor", "ban": "Información bancaria y transferencias", "con": "Teléfono, correo y portal web" };
            document.getElementById("prov-tab-subtitle").textContent = titles[appState.activeProvTab];
            renderProveedores(); 
        };
    });
    
    document.getElementById("btn-proveedores-edit-mode").onclick = () => toggleProveedoresEditMode(true);
    document.getElementById("btn-proveedores-cancel").onclick = () => toggleProveedoresEditMode(false);
    document.getElementById("btn-proveedores-save").onclick = () => saveProveedores();
    document.getElementById("btn-proveedores-add").onclick = () => {
        if (!appState.proveedoresEditMode) toggleProveedoresEditMode(true);
        appState.proveedores.unshift({ rowIndex: null, proveedor: "", nombre: "", direccion: "", banco: "", alias: "", cbu: "", telefono: "", mail: "", web: "" });
        renderProveedores();
    };

    document.getElementById("sueldos-month").onchange = (e) => { appState.sueldosMonth = e.target.value; renderSueldos(); };
    document.getElementById("sueldos-year").onchange = (e) => { 
        const newYear = e.target.value;
        appState.sueldosYear = newYear; 
        if (!appState.sueldos[newYear]) {
            if (confirm(`El año ${newYear} no tiene registros de RRHH.\n\n¿Desea inicializar este año automáticamente copiando a los trabajadores que estuvieron activos en Diciembre de ${newYear - 1}?`)) {
                sendGlobalPostRequest("SUELDO_INIT_YEAR", { year: newYear });
            } else { renderSueldos(); }
        } else { renderSueldos(); }
    };
    
    document.getElementById("btn-sueldos-edit-mode").onclick = () => toggleSueldosEditMode(true);
    document.getElementById("btn-sueldos-cancel").onclick = () => toggleSueldosEditMode(false);
    document.getElementById("btn-sueldos-save").onclick = () => saveSueldos();
    document.getElementById("btn-sueldos-add").onclick = () => addSueldoEmptyRow();
    
    document.getElementById("btn-refresh").onclick = () => fetchFinancialData();

    document.getElementById("global-file-input").onchange = function(e) {
        const file = e.target.files[0]; if (!file || !appState.currentUpload) return;
        toggleLoader(true, "Procesando archivo en Drive...");
        const reader = new FileReader();
        reader.onload = function(evt) {
            const payload = { action: "UPLOAD_FILE", data: { sheetName: appState.currentUpload.sheetName, rowIndex: appState.currentUpload.rowIndex, type: appState.currentUpload.type, fileName: file.name, mimeType: file.type, fileBase64: evt.target.result.split(',')[1] } };
            fetch(API_URL, { method: "POST", body: JSON.stringify(payload) }).then(r=>r.json()).then(d => { if(d.status==="success") fetchFinancialData(); else { alert("Error"); toggleLoader(false); } }).catch(() => toggleLoader(false));
            document.getElementById("global-file-input").value = "";
        }; reader.readAsDataURL(file);
    };
}

function setupWebModalHandlers() {
    document.getElementById('btn-modal-close').onclick = () => document.getElementById('web-modal').classList.add('hidden');
    document.getElementById('btn-modal-cancel').onclick = () => window.openWebModal(appState.activeProvRowIndex);
    document.getElementById('btn-modal-edit').onclick = function() { document.getElementById('web-view-mode').classList.add('hidden'); document.getElementById('web-edit-mode').classList.remove('hidden'); this.classList.add('hidden'); document.getElementById('btn-modal-save').classList.remove('hidden'); document.getElementById('btn-modal-cancel').classList.remove('hidden'); };
    document.getElementById('btn-modal-save').onclick = function() { const prov = appState.proveedores.find(p => p.rowIndex === appState.activeProvRowIndex); prov.web = document.getElementById('modal-web-input').value; sendGlobalPostRequest("PROV_EDIT", prov); document.getElementById('web-modal').classList.add('hidden'); };
}

function setupAccordions(c) { c.querySelectorAll(".accordion-header").forEach(h => h.onclick = function() { const i = this.parentElement; const b = this.nextElementSibling; i.classList.toggle("open"); b.style.maxHeight = i.classList.contains("open") ? b.scrollHeight + "px" : null; }); }
function toggleLoader(show, msg = "") { clearInterval(loaderInterval); const l = document.getElementById("main-loader"); const m = document.getElementById("loader-msg"); if (!show) { l.classList.add("hidden"); return; } l.classList.remove("hidden"); if (msg) { m.textContent = msg; return; } let p = 0; m.textContent = LOADER_PHASES[p]; loaderInterval = setInterval(() => { p = (p + 1) % LOADER_PHASES.length; m.textContent = LOADER_PHASES[p]; }, 1100); }
function formatArgentineCurrency(v) { if(v===""||v==="-"||isNaN(v)) return v||"-"; return `$ ${Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatFinalBalance(v) { if(isNaN(v)) return "-"; const n = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `-$ ${n}` : `$ ${n}`; }

function fetchFinancialData() {
    toggleLoader(true);
    fetch(API_URL).then(r => r.json()).then(j => {
        if (j.status === "success") {
            appState.balances = j.data.balances; appState.carpetas = j.data.carpetas || {}; appState.proveedores = j.data.proveedores || []; appState.sueldos = j.data.sueldos || {};
            injectSueldosIntoBalances();
            populateSidebarHistory(); 
            populateCuentasDropdown();
            renderBalance(); renderProveedores();
            if (document.getElementById("module-sueldos").classList.contains("active")) renderSueldos();
            if (document.getElementById("view-resumen-anual").classList.contains("active")) renderAnnualSummary();
            if (appState.currentHistorySheet) { 
                renderHistoryTable(); 
                if (appState.currentHistorySheet !== "Sueldos") renderCarpetasSection(appState.currentHistorySheet); 
            }
        }
    }).finally(() => toggleLoader(false));
}

// ==========================================
// MÓDULO: BALANCES E HISTORIAL
// ==========================================
function renderBalance() {
    if (!appState.balances) return;
    const pk = `${appState.selectedYear}-${appState.selectedMonth}`; let tg = 0; let ti = 0; let mc = 0;
    const gList = document.getElementById("gastos-list"); gList.innerHTML = "";
    
    Object.keys(appState.balances.gastos).forEach(s => {
        const pd = appState.balances.gastos[s]?.[pk]; if (!pd || pd.length === 0) return; let ct = 0; let rh = "";
        pd.forEach(m => { const a = Math.abs(m.monto); ct += a; mc++; rh += `<tr><td>${m.fecha}</td><td>${m.detalle||"-"}</td><td>${m.operacion||"-"}</td><td class="text-right" style="font-weight:600; color:var(--text-primary);">${formatArgentineCurrency(a)}</td></tr>`; }); tg += ct;
        const ac = document.createElement("div"); ac.className = "accordion-item";
        ac.innerHTML = `<div class="accordion-header"><div class="accordion-title-group"><svg class="accordion-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" /></svg><span class="item-name">${s}</span></div><span class="item-val">${formatArgentineCurrency(ct)}</span></div><div class="accordion-body"><div class="accordion-content" style="padding-top:0; padding-bottom:0; border:none;"><div class="table-responsive"><table class="detail-table" style="margin:0;"><thead><tr><th class="text-left">Fecha</th><th class="text-left">Detalle</th><th class="text-left">Operación</th><th class="text-right">Monto</th></tr></thead><tbody>${rh}</tbody><tfoot><tr class="table-total-row"><td colspan="3" class="text-right">TOTAL PESTAÑA</td><td class="text-right" style="color:var(--text-primary);">${formatArgentineCurrency(ct)}</td></tr></tfoot></table></div></div></div>`;
        gList.appendChild(ac);
    });
    document.getElementById("total-gastos-value").textContent = formatArgentineCurrency(tg); setupAccordions(gList);
    const iList = document.getElementById("ingresos-list"); iList.innerHTML = ""; const id = appState.balances.ingresos["Ingresos"]?.[pk];
    if (id && id.length > 0) {
        let rh = ""; let ct = 0;
        id.forEach(m => { ti += m.monto; ct += m.monto; mc++; rh += `<tr><td>${m.fecha}</td><td>${m.detalle||"-"}</td><td>${m.operacion||"-"}</td><td class="text-right" style="font-weight:600; color:var(--text-primary);">${formatArgentineCurrency(m.monto)}</td></tr>`; });
        const ac = document.createElement("div"); ac.className = "accordion-item";
        ac.innerHTML = `<div class="accordion-header"><div class="accordion-title-group"><svg class="accordion-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" /></svg><span class="item-name">Ingresos</span></div><span class="item-val">${formatArgentineCurrency(ti)}</span></div><div class="accordion-body"><div class="accordion-content" style="padding-top:0; padding-bottom:0;"><div class="table-responsive"><table class="detail-table" style="margin:0;"><thead><tr><th class="text-left">Fecha</th><th class="text-left">Detalle</th><th class="text-left">Operación</th><th class="text-right">Monto</th></tr></thead><tbody>${rh}</tbody><tfoot><tr class="table-total-row"><td colspan="3" class="text-right">TOTAL INGRESOS</td><td class="text-right" style="color:var(--text-primary);">${formatArgentineCurrency(ct)}</td></tr></tfoot></table></div></div></div>`;
        iList.appendChild(ac); setupAccordions(iList);
    }
    document.getElementById("total-ingresos-value").textContent = formatArgentineCurrency(ti);
    document.getElementById("empty-state").classList.toggle("hidden", mc > 0); document.getElementById("balance-content-wrapper").classList.toggle("hidden", mc === 0);
    const nb = ti - tg; document.getElementById("final-balance-value").textContent = formatFinalBalance(nb); document.getElementById("final-balance-value").className = `final-amount text-right ${nb >= 0 ? 'text-success' : 'text-danger'}`; document.getElementById("balance-result-card").className = `card balance-result-card ${nb >= 0 ? 'positive' : 'negative'}`;
}

function renderAnnualSummary() {
    if (!appState.balances) return; const y = appState.selectedYear; let tg = 0; let ti = 0;
    Object.keys(appState.balances.gastos).forEach(s => { const sm = appState.balances.gastos[s]||{}; for (const p in sm) { if (p.startsWith(`${y}-`)) sm[p].forEach(m => tg += Math.abs(m.monto)); } });
    const im = appState.balances.ingresos["Ingresos"]||{}; for (const p in im) { if (p.startsWith(`${y}-`)) im[p].forEach(m => ti += m.monto); }
    document.getElementById("annual-ingresos").textContent = formatArgentineCurrency(ti); document.getElementById("annual-gastos").textContent = formatArgentineCurrency(tg);
    const nb = ti - tg; document.getElementById("annual-balance").textContent = formatFinalBalance(nb); document.getElementById("annual-balance").className = `text-right font-weight-bold ${nb >= 0 ? 'text-success' : 'text-danger'}`;
}

function toggleHistorialEditMode(isEdit) {
    appState.historialEditMode = isEdit;
    document.getElementById("btn-historial-edit-mode").classList.toggle("hidden", isEdit);
    document.getElementById("btn-historial-save").classList.toggle("hidden", !isEdit);
    document.getElementById("btn-historial-cancel").classList.toggle("hidden", !isEdit);
    renderHistoryTable();
}

function openHistoryView(s, t, b) {
    if (!appState.balances) return;
    document.querySelectorAll(".menu-btn, .history-btn").forEach(btn => btn.classList.remove("active")); b.classList.add("active");
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active")); document.getElementById("view-historial").classList.add("active");
    document.getElementById("tab-subtitle").textContent = s; document.getElementById("historial-title").textContent = `Registros: ${s}`;
    
    appState.currentHistorySheet = s; appState.currentHistoryType = t;
    
    // CORRECCIÓN: Filtro predeterminado AL MES EN CURSO, sin errores de renderizado.
    const m = appState.selectedMonth; 
    const y = appState.selectedYear;
    document.getElementById("historial-month").value = m; 
    document.getElementById("historial-year").value = y; 
    appState.historyMonth = m; 
    appState.historyYear = y;
    
    appState.historialEditMode = false;
    document.getElementById("btn-historial-save").classList.add("hidden");
    document.getElementById("btn-historial-cancel").classList.add("hidden");

    const theadTr = document.getElementById("historial-thead-tr");
    
    if (s === "Sueldos") {
        document.getElementById("btn-historial-edit-mode").classList.add("hidden"); 
        document.getElementById("carpetas-config-section").classList.add("hidden");
        theadTr.innerHTML = `
            <th class="text-left">Nombre</th>
            <th class="text-right">Monto</th>
            <th class="text-left">Fecha de Pago</th>
            <th class="text-left">Mes</th>
            <th class="text-left">Método Pago</th>
            <th class="text-right">Precio/Hora</th>
            <th class="text-center">Horas</th>`;
    } else {
        document.getElementById("btn-historial-edit-mode").classList.remove("hidden");
        renderCarpetasSection(s); 
        let extraCol = appState.historialEditMode ? `<th class="text-center sticky-col">Acciones</th>` : `<th class="text-center">Comp. C</th><th class="text-center">Comp. P</th>`;
        theadTr.innerHTML = `
            <th class="text-left">Fecha</th><th class="text-left">Detalle</th><th class="text-right">Monto</th>
            <th class="text-left">Operación</th><th class="text-left">IVA 21%</th><th class="text-left">IVA 10.5%</th>
            <th class="text-left">IVA Cont.</th>${extraCol}`;
    }
    
    renderHistoryTable();
}

function renderHistoryTable() {
    const s = appState.currentHistorySheet; const t = appState.currentHistoryType; 
    if (!s || !appState.balances || !appState.balances[t]) return;
    
    // BLINDAJE ANTICRASHEO: Si la cuenta está vacía no tira error, se adapta.
    const tm = appState.balances[t][s] || {}; 
    const tbody = document.getElementById("historial-tbody"); tbody.innerHTML = ""; let gt = 0; let fm = [];

    if (s !== "Sueldos") {
        const theadTr = document.getElementById("historial-thead-tr");
        let extraCol = appState.historialEditMode ? `<th class="text-center sticky-col">Acciones</th>` : `<th class="text-center">Comp. C</th><th class="text-center">Comp. P</th>`;
        theadTr.innerHTML = `
            <th class="text-left">Fecha</th><th class="text-left">Detalle</th><th class="text-right">Monto</th>
            <th class="text-left">Operación</th><th class="text-left">IVA 21%</th><th class="text-left">IVA 10.5%</th>
            <th class="text-left">IVA Cont.</th>${extraCol}`;
    }

    for (const p in tm) { 
        const [y, month] = p.split("-"); 
        if (appState.historyYear !== "ALL" && appState.historyYear !== y) continue; 
        if (appState.historyMonth !== "ALL" && appState.historyMonth !== month) continue; 
        if (tm[p]) fm = fm.concat(tm[p]); 
    }
    if (fm.length === 0) { 
        document.getElementById("historial-table").classList.add("hidden"); 
        document.getElementById("historial-total-row").classList.add("hidden"); 
        document.getElementById("historial-empty").classList.remove("hidden"); 
    } else { 
        fm.forEach(m => { gt += Math.abs(m.monto); tbody.appendChild(createBalanceRowHTML(m)); }); 
        document.getElementById("historial-table").classList.remove("hidden"); 
        document.getElementById("historial-total-row").classList.remove("hidden"); 
        document.getElementById("historial-empty").classList.add("hidden"); 
        document.getElementById("historial-total-value").textContent = formatArgentineCurrency(gt); 
    }
}

function createBalanceRowHTML(m) {
    const s = appState.currentHistorySheet; const t = appState.currentHistoryType;
    const tr = document.createElement("tr");
    tr.setAttribute("data-row-index", m.rowIndex || "NEW");
    
    if (m.isVirtual) {
        tr.innerHTML = `
            <td class="text-left" style="font-weight:600;">${m.detalle}</td>
            <td class="text-right" style="font-weight:700; color:var(--text-primary);">${formatArgentineCurrency(m.monto)}</td>
            <td class="text-left">${m.fecha}</td>
            <td class="text-left">${m.mes}</td>
            <td class="text-left">${m.metodoPago}</td>
            <td class="text-right">${m.precioHora === "-" ? "-" : formatArgentineCurrency(m.precioHora)}</td>
            <td class="text-center">${m.horas}</td>`;
        return tr;
    }

    if (appState.historialEditMode) { 
        tr.innerHTML = `
            <td><input type="text" class="edit-input i-fec" data-raw="${m.fecha||''}" value="${formatDateToAR(m.fecha)}" placeholder="DD/MM/AAAA"></td>
            <td><input type="text" class="edit-input i-det" value="${m.detalle||''}"></td>
            <td><input type="number" step="0.01" class="edit-input i-mon" value="${Math.abs(m.monto)||''}"></td>
            <td><input type="text" class="edit-input i-ope" value="${m.operacion||''}" placeholder="Operación"></td>
            <td><input type="text" class="edit-input i-i21" value="${m.iva21||''}"></td>
            <td><input type="text" class="edit-input i-i105" value="${m.iva105||''}"></td>
            <td><input type="text" class="edit-input i-icon" value="${m.ivaCont||''}"></td>
            <td class="action-buttons sticky-col"><button class="action-btn btn-delete" onclick="deleteBalanceUI(this, ${m.rowIndex||'null'})">Borrar</button></td>`; 
    } else {
        const compHTML_C = m.idComprobanteCompra ? `<a href="https://drive.google.com/file/d/${m.idComprobanteCompra}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none;">Ver</a>` : `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${s}', ${m.rowIndex}, 'compra', '${t}')">Subir</button>`;
        const compHTML_P = m.idComprobantePago ? `<a href="https://drive.google.com/file/d/${m.idComprobantePago}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none;">Ver</a>` : `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${s}', ${m.rowIndex}, 'pago', '${t}')">Subir</button>`;
        tr.innerHTML = `
            <td>${formatDateToAR(m.fecha)||'-'}</td><td>${m.detalle||'-'}</td><td class="text-right" style="font-weight:600; color:var(--text-primary);">${formatArgentineCurrency(t==='gastos'?Math.abs(m.monto):m.monto)}</td>
            <td>${m.operacion||'-'}</td><td>${m.iva21||'-'}</td><td>${m.iva105||'-'}</td><td>${m.ivaCont||'-'}</td>
            <td class="text-center">${compHTML_C}</td><td class="text-center">${compHTML_P}</td>`;
    } 
    return tr;
}

window.deleteBalanceUI = function(btn, rowIndex) {
    if (!rowIndex || rowIndex === 'null') {
        btn.closest("tr").remove();
    } else {
        if(confirm("¿Eliminar operación permanentemente?")) {
            sendGlobalPostRequest("BAL_DELETE", { rowIndex: rowIndex, sheetName: appState.currentHistorySheet });
        }
    }
};

async function saveHistorial() {
    const s = appState.currentHistorySheet; const t = appState.currentHistoryType;
    const tbody = document.getElementById("historial-tbody");
    const rows = tbody.querySelectorAll("tr");
    toggleLoader(true, "Guardando registros...");
    try {
        for (let tr of rows) {
            let rowIndex = tr.getAttribute("data-row-index");
            if (rowIndex === "NEW") rowIndex = null; else rowIndex = parseInt(rowIndex);
            
            let rm = parseMonto(tr.querySelector(".i-mon").value);
            if (t === 'gastos' && rm > 0) rm = -rm; 
            
            let cc = "", cp = ""; 
            if (rowIndex) { 
                const p = appState.balances[t][s]; 
                for (let d in p) { let m = p[d].find(x => x.rowIndex === rowIndex); if (m) { cc = m.idComprobanteCompra; cp = m.idComprobantePago; break; } } 
            } 
            
            const payload = { 
                rowIndex: rowIndex, sheetName: s, 
                fecha: getValDate('.i-fec', tr), 
                detalle: tr.querySelector(".i-det").value, 
                monto: rm, operacion: tr.querySelector(".i-ope").value, 
                iva21: tr.querySelector(".i-i21").value, 
                iva105: tr.querySelector(".i-i105").value, 
                ivaCont: tr.querySelector(".i-icon").value, 
                idComprobanteCompra: cc, idComprobantePago: cp 
            }; 
            await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: rowIndex ? "BAL_EDIT" : "BAL_ADD", data: payload }) });
        }
        toggleHistorialEditMode(false);
        fetchFinancialData();
    } catch { toggleLoader(false); }
}

window.triggerUpload = function(s, ri, ty, c) { appState.currentUpload = { sheetName: s, rowIndex: ri, type: ty, categoryType: c }; document.getElementById("global-file-input").click(); };

function renderCarpetasSection(s) {
    const sec = document.getElementById("carpetas-config-section");
    if(sec) sec.classList.remove("hidden"); 
    
    const c = appState.carpetas[s] || { idCuenta: "", idCompra: "", idPago: "" };
    document.getElementById("view-id-cuenta").textContent = c.idCuenta||"-"; document.getElementById("view-id-compra").textContent = c.idCompra||"-"; document.getElementById("view-id-pago").textContent = c.idPago||"-";
    document.getElementById("edit-id-cuenta").value = c.idCuenta; document.getElementById("edit-id-compra").value = c.idCompra; document.getElementById("edit-id-pago").value = c.idPago;
    document.querySelectorAll("#carpetas-config-section .form-control").forEach(el => el.classList.remove("hidden")); document.querySelectorAll("#carpetas-config-section .edit-input").forEach(el => el.classList.add("hidden"));
    document.getElementById("btn-edit-carpetas").classList.remove("hidden"); document.getElementById("btn-save-carpetas").classList.add("hidden"); document.getElementById("btn-cancel-carpetas").classList.add("hidden");
}

// ==========================================
// MÓDULO: PROVEEDORES
// ==========================================
function toggleProveedoresEditMode(isEdit) {
    appState.proveedoresEditMode = isEdit;
    document.getElementById("btn-proveedores-edit-mode").classList.toggle("hidden", isEdit);
    document.getElementById("btn-proveedores-save").classList.toggle("hidden", !isEdit);
    document.getElementById("btn-proveedores-cancel").classList.toggle("hidden", !isEdit);
    document.getElementById("btn-proveedores-add").classList.toggle("hidden", !isEdit);
    renderProveedores();
}

function renderProveedores() {
    const thead = document.querySelector("#proveedores-table thead");
    const tbody = document.getElementById("proveedores-tbody");
    
    const cGen = appState.activeProvTab === 'gen' ? '' : 'hidden';
    const cBan = appState.activeProvTab === 'ban' ? '' : 'hidden';
    const cCon = appState.activeProvTab === 'con' ? '' : 'hidden';
    
    let thHtml = `
        <tr>
            <th class="text-left">Proveedor</th>
            <th class="text-left">Nombre</th>
            <th class="text-left col-prov-gen ${cGen}">Dirección</th>
            <th class="text-left col-prov-ban ${cBan}">Banco</th>
            <th class="text-left col-prov-ban ${cBan}">Alias</th>
            <th class="text-left col-prov-ban ${cBan}">CBU</th>
            <th class="text-left col-prov-con ${cCon}">Teléfono</th>
            <th class="text-left col-prov-con ${cCon}">Mail</th>
            <th class="text-center col-prov-con ${cCon}">Web</th>`;
    if (appState.proveedoresEditMode) thHtml += `<th class="text-center sticky-col">Acciones</th>`;
    thHtml += `</tr>`;
    thead.innerHTML = thHtml;
    
    tbody.innerHTML = "";
    appState.proveedores.forEach(prov => tbody.appendChild(createProvRowHTML(prov)));
}

function createProvRowHTML(prov) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-row-index", prov.rowIndex || "NEW");
    
    const cGen = appState.activeProvTab === 'gen' ? '' : 'hidden';
    const cBan = appState.activeProvTab === 'ban' ? '' : 'hidden';
    const cCon = appState.activeProvTab === 'con' ? '' : 'hidden';

    if (appState.proveedoresEditMode) {
        tr.innerHTML = `
            <td><input type="text" class="edit-input i-prov" value="${prov.proveedor || ''}"></td>
            <td><input type="text" class="edit-input i-nom" value="${prov.nombre || ''}"></td>
            <td class="col-prov-gen ${cGen}"><input type="text" class="edit-input i-dir" value="${prov.direccion || ''}"></td>
            <td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-ban" value="${prov.banco || ''}"></td>
            <td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-ali" value="${prov.alias || ''}"></td>
            <td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-cbu" value="${prov.cbu || ''}"></td>
            <td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-tel" value="${prov.telefono || ''}"></td>
            <td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-mail" value="${prov.mail || ''}"></td>
            <td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-web" value="${prov.web || ''}"></td>
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-delete" onclick="deleteProveedorUI(this, ${prov.rowIndex || 'null'})">Borrar</button>
            </td>`;
    } else {
        const btnWeb = prov.web ? `<button class="action-btn btn-secondary" style="border: 1px solid var(--primary-color); color: var(--primary-color); background:transparent; padding: 6px 10px;" onclick="openWebModal(${prov.rowIndex})">Ver Web</button>` : '-';
        tr.innerHTML = `
            <td>${prov.proveedor || '-'}</td>
            <td>${prov.nombre || '-'}</td>
            <td class="col-prov-gen ${cGen}">${prov.direccion || '-'}</td>
            <td class="col-prov-ban ${cBan}">${prov.banco || '-'}</td>
            <td class="col-prov-ban ${cBan}">${prov.alias || '-'}</td>
            <td class="col-prov-ban ${cBan}">${prov.cbu || '-'}</td>
            <td class="col-prov-con ${cCon}">${prov.telefono || '-'}</td>
            <td class="col-prov-con ${cCon}">${prov.mail || '-'}</td>
            <td class="text-center col-prov-con ${cCon}">${btnWeb}</td>`;
    }
    return tr;
}

window.deleteProveedorUI = function(btn, rowIndex) {
    if (!rowIndex || rowIndex === 'null') {
        btn.closest("tr").remove();
    } else {
        if(confirm("¿Eliminar proveedor permanentemente?")) {
            sendGlobalPostRequest("PROV_DELETE", { rowIndex: rowIndex });
        }
    }
};

window.openWebModal = function(rowIndex) { 
    appState.activeProvRowIndex = rowIndex; 
    const prov = appState.proveedores.find(p => p.rowIndex === rowIndex); 
    if(!prov) return;
    document.getElementById('modal-prov-name').textContent = prov.nombre || prov.proveedor || "Proveedor"; 
    document.getElementById('web-view-mode').classList.remove('hidden'); 
    document.getElementById('web-edit-mode').classList.add('hidden'); 
    document.getElementById('btn-modal-edit').classList.remove('hidden'); 
    document.getElementById('btn-modal-save').classList.add('hidden'); 
    document.getElementById('btn-modal-cancel').classList.add('hidden'); 
    
    const link = document.getElementById('modal-web-link'); 
    const noWeb = document.getElementById('modal-no-web'); 
    if(prov.web && prov.web.trim() !== "") { 
        let url = prov.web.trim();
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        link.href = url; 
        link.classList.remove('hidden'); 
        noWeb.classList.add('hidden'); 
        document.getElementById('modal-web-input').value = prov.web; 
    } else { 
        link.classList.add('hidden'); 
        noWeb.classList.remove('hidden'); 
        document.getElementById('modal-web-input').value = ""; 
    } 
    document.getElementById('web-modal').classList.remove('hidden'); 
};

async function saveProveedores() {
    const tbody = document.getElementById("proveedores-tbody");
    const rows = tbody.querySelectorAll("tr");
    toggleLoader(true, "Guardando proveedores...");
    try {
        for (let tr of rows) {
            let rowIndex = tr.getAttribute("data-row-index");
            if (rowIndex === "NEW") rowIndex = null; else rowIndex = parseInt(rowIndex);
            
            let pData = null;
            if (rowIndex) pData = appState.proveedores.find(p => p.rowIndex === rowIndex);
            
            const getVal = (sel) => { const input = tr.querySelector(sel); return input ? input.value : ""; };
            
            const payload = {
                rowIndex: rowIndex,
                proveedor: getVal(".i-prov") || (pData ? pData.proveedor : ""),
                nombre: getVal(".i-nom") || (pData ? pData.nombre : ""),
                direccion: getVal(".i-dir") || (pData ? pData.direccion : ""),
                banco: getVal(".i-ban") || (pData ? pData.banco : ""),
                alias: getVal(".i-ali") || (pData ? pData.alias : ""),
                cbu: getVal(".i-cbu") || (pData ? pData.cbu : ""),
                telefono: getVal(".i-tel") || (pData ? pData.telefono : ""),
                mail: getVal(".i-mail") || (pData ? pData.mail : ""),
                web: getVal(".i-web") || (pData ? pData.web : "")
            };
            await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: rowIndex ? "PROV_EDIT" : "PROV_ADD", data: payload }) });
        }
        toggleProveedoresEditMode(false);
        fetchFinancialData();
    } catch { toggleLoader(false); }
}

// ==========================================
// MÓDULO: SUELDOS
// ==========================================
function renderSueldos() {
    const year = appState.sueldosYear; 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14;
    
    const thead = document.getElementById("sueldos-thead"); 
    const tbody = document.getElementById("sueldos-tbody"); 
    const emptyState = document.getElementById("sueldos-empty-state"); 
    const tableContainer = document.getElementById("sueldos-table-container");
    
    thead.innerHTML = ""; 
    tbody.innerHTML = "";
    
    let yearData = appState.sueldos[year] || []; 
    let activeWorkers = [];
    
    if (appState.sueldosEditMode) { 
        activeWorkers = yearData; 
    } else { 
        activeWorkers = yearData.filter(worker => { 
            const dataMes = worker.rowData.slice(offset, offset + 14); 
            const tieneDatosEsteMes = dataMes.some(val => val !== "" && val !== "-"); 
            const prevMesName = month > 0 ? worker.rowData[(month - 1) * 14] : "";
            const teniaDatosMesAnterior = prevMesName !== "" && prevMesName !== "-";
            return tieneDatosEsteMes || teniaDatosMesAnterior; 
        }); 
    }
    
    if (activeWorkers.length === 0 && !appState.sueldosEditMode) { 
        emptyState.classList.remove("hidden"); 
        tableContainer.classList.add("hidden"); 
        return; 
    } else { 
        emptyState.classList.add("hidden"); 
        tableContainer.classList.remove("hidden"); 
    }
    
    activeWorkers.sort((a, b) => { 
        const nameA = (a.rowData[offset] || a.rowData[0] || "").toString().toLowerCase(); 
        const nameB = (b.rowData[offset] || b.rowData[0] || "").toString().toLowerCase(); 
        return nameA.localeCompare(nameB); 
    });
    
    let maxAdelantos = 0; 
    activeWorkers.forEach(w => { 
        if (parseMonto(w.rowData[offset + 4]) > 0) maxAdelantos = Math.max(maxAdelantos, 1); 
        if (parseMonto(w.rowData[offset + 6]) > 0) maxAdelantos = Math.max(maxAdelantos, 2); 
        if (parseMonto(w.rowData[offset + 8]) > 0) maxAdelantos = Math.max(maxAdelantos, 3); 
    });
    
    let thHtml = `
        <tr>
            <th class="text-left">Nombre</th>
            <th class="text-right">Sueldo</th>
            <th class="text-left">Fecha de Pago</th>
            <th class="text-left">Mes</th>`;
            
    if (maxAdelantos >= 1) thHtml += `<th class="text-right">Adelanto 1</th><th class="text-left">F. Ad1</th>`;
    if (maxAdelantos >= 2) thHtml += `<th class="text-right">Adelanto 2</th><th class="text-left">F. Ad2</th>`;
    if (maxAdelantos === 3) thHtml += `<th class="text-right">Adelanto 3</th><th class="text-left">F. Ad3</th>`;
    
    thHtml += `
            <th class="text-left">Método Pago</th>
            <th class="text-right">Precio/Hora</th>
            <th class="text-center">Horas</th>`;
            
    if (appState.sueldosEditMode) thHtml += `<th class="text-center sticky-col">Acciones</th>`;
    thHtml += `</tr>`; 
    thead.innerHTML = thHtml;
    
    activeWorkers.forEach((worker) => {
        const tr = document.createElement("tr"); 
        const rData = worker.rowData;
        
        const nombrePrevio = month > 0 ? rData[(month - 1) * 14] : "";
        const nombreAmostrar = rData[offset] || nombrePrevio || rData[0] || "";
        
        if (appState.sueldosEditMode) {
            let rowHtml = `
                <td><input type="text" class="edit-input s-nom" value="${nombreAmostrar}"></td>
                <td><input type="number" step="0.01" class="edit-input s-sue" value="${parseMonto(rData[offset+13]) || ''}"></td>
                <td><input type="text" class="edit-input s-fp" data-raw="${rData[offset+12] || ''}" value="${formatDateToAR(rData[offset+12])}" placeholder="DD/MM/AAAA"></td>
                <td><input type="text" class="edit-input s-mes" value="${rData[offset+1] || MESES_NOMBRES[month]}"></td>`;
                
            if (maxAdelantos >= 1) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a1" value="${parseMonto(rData[offset+4]) || ''}"></td><td><input type="text" class="edit-input s-fa1" data-raw="${rData[offset+5] || ''}" value="${formatDateToAR(rData[offset+5])}" placeholder="DD/MM/AAAA"></td>`;
            if (maxAdelantos >= 2) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a2" value="${parseMonto(rData[offset+6]) || ''}"></td><td><input type="text" class="edit-input s-fa2" data-raw="${rData[offset+7] || ''}" value="${formatDateToAR(rData[offset+7])}" placeholder="DD/MM/AAAA"></td>`;
            if (maxAdelantos === 3) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a3" value="${parseMonto(rData[offset+8]) || ''}"></td><td><input type="text" class="edit-input s-fa3" data-raw="${rData[offset+9] || ''}" value="${formatDateToAR(rData[offset+9])}" placeholder="DD/MM/AAAA"></td>`;
            
            rowHtml += `
                <td>
                    <div style="display:flex; gap:4px; flex-direction:column;">
                        <input type="number" step="0.01" class="edit-input s-me" value="${parseMonto(rData[offset+10]) || ''}" placeholder="$ Efvo">
                        <input type="number" step="0.01" class="edit-input s-mt" value="${parseMonto(rData[offset+11]) || ''}" placeholder="$ Trans">
                    </div>
                </td>
                <td><input type="number" step="0.01" class="edit-input s-ph" value="${parseMonto(rData[offset+3]) || ''}"></td>
                <td><input type="text" class="edit-input s-hor" value="${rData[offset+2] || ''}" style="text-align:center;"></td>
                <td class="action-buttons sticky-col"><button class="action-btn btn-delete" onclick="window.archiveWorker(this, ${worker.rowIndex})">Borrar Mes</button></td>`;
                
            tr.setAttribute("data-row-index", worker.rowIndex || "NEW"); 
            tr.innerHTML = rowHtml;
            
            let iHor = tr.querySelector('.s-hor');
            let iPh = tr.querySelector('.s-ph');
            let iSue = tr.querySelector('.s-sue');
            if (iHor && iPh && iSue) {
                const autoCalc = () => {
                    let hVal = iHor.value.toString().replace(/,/g, '.');
                    let h = parseFloat(hVal);
                    let p = parseFloat(iPh.value);
                    if (!isNaN(h) && !isNaN(p) && h > 0 && p > 0) {
                        iSue.value = (h * p).toFixed(2);
                    }
                };
                iHor.addEventListener('input', autoCalc);
                iPh.addEventListener('input', autoCalc);
            }
        } else {
            let methodStr = "-"; const valE = parseMonto(rData[offset+10]); const valT = parseMonto(rData[offset+11]); 
            if (valE > 0 && valT > 0) methodStr = `Efvo: ${formatArgentineCurrency(valE)}<br>Trans: ${formatArgentineCurrency(valT)}`; else if (valE > 0) methodStr = `Efectivo`; else if (valT > 0) methodStr = `Transferencia`;
            
            let rowHtml = `
                <td class="text-left" style="font-weight:600;">${nombreAmostrar || '-'}</td>
                <td class="text-right" style="font-weight:700; color:var(--text-primary);">${formatArgentineCurrency(parseMonto(rData[offset+13]))}</td>
                <td class="text-left">${formatDateToAR(rData[offset+12]) || '-'}</td>
                <td class="text-left">${rData[offset+1] || MESES_NOMBRES[month]}</td>`;
                
            if (maxAdelantos >= 1) rowHtml += `<td class="text-right">${formatArgentineCurrency(parseMonto(rData[offset+4]))}</td><td class="text-left">${formatDateToAR(rData[offset+5]) || '-'}</td>`;
            if (maxAdelantos >= 2) rowHtml += `<td class="text-right">${formatArgentineCurrency(parseMonto(rData[offset+6]))}</td><td class="text-left">${formatDateToAR(rData[offset+7]) || '-'}</td>`;
            if (maxAdelantos === 3) rowHtml += `<td class="text-right">${formatArgentineCurrency(parseMonto(rData[offset+8]))}</td><td class="text-left">${formatDateToAR(rData[offset+9]) || '-'}</td>`;
            
            rowHtml += `
                <td class="text-left" style="font-size: 8.5pt;">${methodStr}</td>
                <td class="text-right">${formatArgentineCurrency(parseMonto(rData[offset+3]))}</td>
                <td class="text-center">${rData[offset+2] || '-'}</td>`; 
                
            tr.innerHTML = rowHtml;
        } 
        tbody.appendChild(tr);
    });
}

function toggleSueldosEditMode(isEdit) { 
    appState.sueldosEditMode = isEdit; 
    document.getElementById("btn-sueldos-edit-mode").classList.toggle("hidden", isEdit); 
    document.getElementById("btn-sueldos-save").classList.toggle("hidden", !isEdit); 
    document.getElementById("btn-sueldos-cancel").classList.toggle("hidden", !isEdit); 
    document.getElementById("btn-sueldos-add").classList.toggle("hidden", !isEdit); 
    renderSueldos(); 
}

function addSueldoEmptyRow() { 
    if (!appState.sueldosEditMode) toggleSueldosEditMode(true); 
    const year = appState.sueldosYear; 
    if (!appState.sueldos[year]) appState.sueldos[year] = []; 
    let newRow = Array(168).fill(""); 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14; 
    newRow[offset + 1] = MESES_NOMBRES[month]; 
    appState.sueldos[year].unshift({ rowIndex: null, rowData: newRow }); 
    renderSueldos(); 
}

window.archiveWorker = function(btn, rowIndex) { 
    if(!confirm("¿Borrar datos del trabajador de ESTE MES? (Se mantendrá intacto en el historial de otros meses)")) return; 
    const year = appState.sueldosYear; 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14; 
    
    if (rowIndex === "NEW" || rowIndex === null) {
        btn.closest("tr").remove();
        return;
    }

    let worker = appState.sueldos[year].find(w => w.rowIndex === rowIndex); 
    if (!worker) return; 
    for (let i = offset; i < offset + 14; i++) worker.rowData[i] = ""; 
    sendGlobalPostRequest("SUELDO_SAVE_ROW", { year: year, rowIndex: rowIndex, rowData: worker.rowData }); 
}

async function saveSueldos() {
    const tbody = document.getElementById("sueldos-tbody"); const rows = tbody.querySelectorAll("tr"); const year = appState.sueldosYear; const month = parseInt(appState.sueldosMonth) - 1; const offset = month * 14; toggleLoader(true, "Guardando registros...");
    try { 
        for (let tr of rows) { 
            let rowIndex = tr.getAttribute("data-row-index"); if (rowIndex === "NEW") rowIndex = null; else rowIndex = parseInt(rowIndex); 
            let workerObj = null; if (rowIndex) workerObj = appState.sueldos[year].find(w => w.rowIndex === rowIndex); 
            
            let finalRowData = workerObj ? [...workerObj.rowData] : Array(168).fill(""); 
            const getVal = (selector) => { const el = tr.querySelector(selector); return el ? el.value : ""; }; 
            
            finalRowData[offset] = getVal('.s-nom'); 
            finalRowData[offset+1] = getVal('.s-mes'); 
            finalRowData[offset+2] = getVal('.s-hor'); 
            finalRowData[offset+3] = getVal('.s-ph'); 
            finalRowData[offset+4] = getVal('.s-a1') || finalRowData[offset+4]; 
            finalRowData[offset+5] = getValDate('.s-fa1', tr) || finalRowData[offset+5]; 
            finalRowData[offset+6] = getVal('.s-a2') || finalRowData[offset+6]; 
            finalRowData[offset+7] = getValDate('.s-fa2', tr) || finalRowData[offset+7]; 
            finalRowData[offset+8] = getVal('.s-a3') || finalRowData[offset+8]; 
            finalRowData[offset+9] = getValDate('.s-fa3', tr) || finalRowData[offset+9]; 
            finalRowData[offset+10] = getVal('.s-me'); 
            finalRowData[offset+11] = getVal('.s-mt'); 
            finalRowData[offset+12] = getValDate('.s-fp', tr) || finalRowData[offset+12]; 
            finalRowData[offset+13] = getVal('.s-sue'); 
            
            await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "SUELDO_SAVE_ROW", data: { year: year, rowIndex: rowIndex, rowData: finalRowData } }) }); 
        } 
        toggleSueldosEditMode(false); fetchFinancialData(); 
    } catch { toggleLoader(false); }
}

function sendGlobalPostRequest(action, dataObj) { toggleLoader(true, "Procesando petición..."); fetch(API_URL, { method: "POST", body: JSON.stringify({ action: action, data: dataObj }) }).then(res => res.json()).then(res => { if (res.status === "success") fetchFinancialData(); else { alert("Error"); toggleLoader(false); } }).catch(() => toggleLoader(false)); }
