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
    historyMonth: "ALL", historyYear: "ALL",
    sueldosMonth: "", sueldosYear: "", sueldosEditMode: false,
    currentHistorySheet: null, currentHistoryType: null,
    currentUpload: null, activeProvRowIndex: null, activeProvTab: "gen"
};

let loaderInterval = null;

// ==========================================
// INICIALIZACIÓN
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
    appState.selectedMonth = m; appState.selectedYear = y; appState.sueldosMonth = m; appState.sueldosYear = y;
    document.getElementById("select-month").value = m; document.getElementById("select-year").value = y;
    document.getElementById("sueldos-month").value = m; document.getElementById("sueldos-year").value = y;
}

function initTabs() {
    document.querySelectorAll("#module-balances .menu-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#module-balances .menu-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
            const tab = btn.getAttribute("data-tab");
            document.querySelectorAll("#module-balances .tab-view").forEach(view => view.classList.toggle("active", view.id === `view-${tab}`));
            if (tab === "balance") { document.getElementById("tab-title").textContent = "Balance"; document.getElementById("tab-subtitle").textContent = "Resumen consolidado"; }
            else if (tab === "resumen-anual") { document.getElementById("tab-title").textContent = "Resumen Anual"; renderAnnualSummary(); }
            document.querySelectorAll(".history-btn").forEach(b => b.classList.remove("active"));
        });
    });
}

// -------------------------------------------------------------
// INTEGRADOR AUTOMÁTICO DE SUELDOS HACIA BALANCES (VIRTUAL TAB)
// -------------------------------------------------------------
function injectSueldosIntoBalances() {
    if (!appState.balances) return;
    
    appState.balances.gastos["Liquidación de Sueldos"] = {};
    const gastosSueldos = appState.balances.gastos["Liquidación de Sueldos"];

    Object.keys(appState.sueldos).forEach(year => {
        appState.sueldos[year].forEach(worker => {
            const rData = worker.rowData;
            
            for (let m = 0; m < 12; m++) {
                const offset = m * 14;
                const nombre = rData[offset];
                const fechaPago = rData[offset + 12];
                const sueldoRaw = rData[offset + 13];
                const sueldoNumber = Number(sueldoRaw);

                if (nombre && nombre !== "-" && !isNaN(sueldoNumber) && sueldoNumber > 0) {
                    const monthStr = String(m + 1).padStart(2, '0');
                    const periodKey = `${year}-${monthStr}`;

                    if (!gastosSueldos[periodKey]) gastosSueldos[periodKey] = [];

                    gastosSueldos[periodKey].push({
                        rowIndex: null, 
                        fecha: (fechaPago && fechaPago !== "-") ? fechaPago : `01/${monthStr}/${year}`,
                        detalle: "Sueldo: " + nombre,
                        monto: sueldoNumber,
                        operacion: "Liquidación RRHH",
                        iva21: "-", iva105: "-", ivaCont: "-",
                        idComprobanteCompra: "", idComprobantePago: "",
                        isVirtual: true 
                    });
                }
            }
        });
    });
}

function populateSidebarHistory() {
    const gList = document.getElementById("sidebar-gastos-list"); const iList = document.getElementById("sidebar-ingresos-list");
    gList.innerHTML = ""; iList.innerHTML = ""; if (!appState.balances) return;
    Object.keys(appState.balances.gastos).sort().forEach(sheet => {
        const btn = document.createElement("button"); btn.className = "history-btn"; btn.textContent = sheet;
        btn.onclick = () => openHistoryView(sheet, "gastos", btn); gList.appendChild(btn);
    });
    const btnI = document.createElement("button"); btnI.className = "history-btn"; btnI.textContent = "Ingresos";
    btnI.onclick = () => openHistoryView("Ingresos", "ingresos", btnI); iList.appendChild(btnI);
}

function setupEventListeners() {
    // Eventos Balances
    document.getElementById("select-month").onchange = (e) => { appState.selectedMonth = e.target.value; renderBalance(); };
    document.getElementById("select-year").onchange = (e) => { appState.selectedYear = e.target.value; renderBalance(); if(document.getElementById("view-resumen-anual").classList.contains("active")) renderAnnualSummary(); };
    document.getElementById("historial-month").onchange = (e) => { appState.historyMonth = e.target.value; renderHistoryTable(); };
    document.getElementById("historial-year").onchange = (e) => { appState.historyYear = e.target.value; renderHistoryTable(); };

    // Gestión Dinámica Cuentas
    document.getElementById("btn-add-tab-sheet").onclick = () => {
        const t = prompt("Nombre de la nueva cuenta:"); if(!t || t.trim()==="") return;
        if(t.trim().toLowerCase()==="ingresos" || t.trim().toLowerCase()==="carpetas" || t.trim().toLowerCase()==="liquidación de sueldos") { alert("Nombre reservado."); return; }
        sendGlobalPostRequest("BAL_ADD_TAB", { sheetName: t.trim() });
    };
    document.getElementById("btn-del-tab-sheet").onclick = () => {
        if(!appState.currentHistorySheet || appState.currentHistoryType==="ingresos" || appState.currentHistorySheet==="Liquidación de Sueldos") { alert("Seleccione un gasto válido creado por usted."); return; }
        if(confirm(`¿Eliminar la cuenta '${appState.currentHistorySheet}'?`)) { sendGlobalPostRequest("BAL_DELETE_TAB", { sheetName: appState.currentHistorySheet }); appState.currentHistorySheet = null; document.querySelector('.menu-btn[data-tab="balance"]').click(); }
    };

    // Config Carpetas
    document.getElementById("btn-edit-carpetas").onclick = () => {
        document.querySelectorAll("#carpetas-config-section .form-control").forEach(el => el.classList.add("hidden")); document.querySelectorAll("#carpetas-config-section .edit-input").forEach(el => el.classList.remove("hidden"));
        document.getElementById("btn-edit-carpetas").classList.add("hidden"); document.getElementById("btn-save-carpetas").classList.remove("hidden"); document.getElementById("btn-cancel-carpetas").classList.remove("hidden");
    };
    document.getElementById("btn-cancel-carpetas").onclick = () => renderCarpetasSection(appState.currentHistorySheet);
    document.getElementById("btn-save-carpetas").onclick = () => {
        const payload = { rowIndex: (appState.carpetas[appState.currentHistorySheet]||{}).rowIndex, sheetName: appState.currentHistorySheet, idCuenta: document.getElementById("edit-id-cuenta").value, idCompra: document.getElementById("edit-id-compra").value, idPago: document.getElementById("edit-id-pago").value };
        sendGlobalPostRequest("UPDATE_FOLDERS", payload);
    };

    // Eventos Proveedores
    document.querySelectorAll("#module-proveedores .menu-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll("#module-proveedores .menu-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
            appState.activeProvTab = btn.getAttribute("data-prov-tab");
            const titles = { "gen": "Datos generales del proveedor", "ban": "Información bancaria y transferencias", "con": "Teléfono, correo y portal web" };
            document.getElementById("prov-tab-subtitle").textContent = titles[appState.activeProvTab];
            document.querySelectorAll("#proveedores-table th.col-prov-gen, #proveedores-table th.col-prov-ban, #proveedores-table th.col-prov-con").forEach(el => el.classList.add("hidden"));
            document.querySelectorAll(`#proveedores-table th.col-prov-${appState.activeProvTab}`).forEach(el => el.classList.remove("hidden"));
            renderProveedores(); 
        };
    });
    document.getElementById("btn-add-proveedor").onclick = () => addProveedorEmptyRow();

    // Eventos Sueldos
    document.getElementById("sueldos-month").onchange = (e) => { appState.sueldosMonth = e.target.value; renderSueldos(); };
    document.getElementById("sueldos-year").onchange = (e) => { appState.sueldosYear = e.target.value; renderSueldos(); };
    document.getElementById("btn-sueldos-edit-mode").onclick = () => toggleSueldosEditMode(true);
    document.getElementById("btn-sueldos-cancel").onclick = () => toggleSueldosEditMode(false);
    document.getElementById("btn-sueldos-save").onclick = () => saveSueldos();
    document.getElementById("btn-sueldos-add").onclick = () => addSueldoEmptyRow();
    
    document.getElementById("btn-refresh").onclick = () => fetchFinancialData();

    // Upload Drive
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
            
            populateSidebarHistory(); renderBalance(); renderProveedores();
            if (document.getElementById("module-sueldos").classList.contains("active")) renderSueldos();
            if (document.getElementById("view-resumen-anual").classList.contains("active")) renderAnnualSummary();
            if (appState.currentHistorySheet) { 
                renderHistoryTable(); 
                if (appState.currentHistorySheet !== "Liquidación de Sueldos") renderCarpetasSection(appState.currentHistorySheet); 
            }
        }
    }).finally(() => toggleLoader(false));
}

function renderBalance() {
    if (!appState.balances) return;
    const pk = `${appState.selectedYear}-${appState.selectedMonth}`; let tg = 0; let ti = 0; let mc = 0;
    const gList = document.getElementById("gastos-list"); gList.innerHTML = "";
    Object.keys(appState.balances.gastos).sort().forEach(s => {
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

function openHistoryView(s, t, b) {
    if (!appState.balances) return;
    document.querySelectorAll(".menu-btn, .history-btn").forEach(btn => btn.classList.remove("active")); b.classList.add("active");
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active")); document.getElementById("view-historial").classList.add("active");
    document.getElementById("tab-subtitle").textContent = s; document.getElementById("historial-title").textContent = `Registros: ${s}`;
    
    appState.currentHistorySheet = s; appState.currentHistoryType = t;
    document.getElementById("historial-month").value = "ALL"; document.getElementById("historial-year").value = "ALL"; appState.historyMonth = "ALL"; appState.historyYear = "ALL";
    
    if (s === "Liquidación de Sueldos") {
        document.getElementById("btn-add-balance").classList.add("hidden");
        document.getElementById("carpetas-config-section").classList.add("hidden");
    } else {
        document.getElementById("btn-add-balance").classList.remove("hidden");
        document.getElementById("btn-add-balance").onclick = () => addBalanceEmptyRow(s, t);
        renderCarpetasSection(s); 
    }
    
    renderHistoryTable();
}

function renderCarpetasSection(s) {
    document.getElementById("carpetas-config-section").classList.remove("hidden"); const c = appState.carpetas[s] || { idCuenta: "", idCompra: "", idPago: "" };
    document.getElementById("view-id-cuenta").textContent = c.idCuenta||"-"; document.getElementById("view-id-compra").textContent = c.idCompra||"-"; document.getElementById("view-id-pago").textContent = c.idPago||"-";
    document.getElementById("edit-id-cuenta").value = c.idCuenta; document.getElementById("edit-id-compra").value = c.idCompra; document.getElementById("edit-id-pago").value = c.idPago;
    document.querySelectorAll("#carpetas-config-section .form-control").forEach(el => el.classList.remove("hidden")); document.querySelectorAll("#carpetas-config-section .edit-input").forEach(el => el.classList.add("hidden"));
    document.getElementById("btn-edit-carpetas").classList.remove("hidden"); document.getElementById("btn-save-carpetas").classList.add("hidden"); document.getElementById("btn-cancel-carpetas").classList.add("hidden");
}

function renderHistoryTable() {
    const s = appState.currentHistorySheet; const t = appState.currentHistoryType; if (!s || !appState.balances) return;
    const tm = appState.balances[t][s]; const tbody = document.getElementById("historial-tbody"); tbody.innerHTML = ""; let gt = 0; let fm = [];
    
    // Ocultar acciones si es la pestaña virtual
    const colAcciones = document.getElementById("col-acciones-historial");
    if(colAcciones) colAcciones.classList.toggle("hidden", s === "Liquidación de Sueldos");

    for (const p in tm) { const [y, m] = p.split("-"); if (appState.historyYear !== "ALL" && appState.historyYear !== y) continue; if (appState.historyMonth !== "ALL" && appState.historyMonth !== m) continue; if (tm[p]) fm = fm.concat(tm[p]); }
    if (fm.length === 0) { document.getElementById("historial-table").classList.add("hidden"); document.getElementById("historial-total-row").classList.add("hidden"); document.getElementById("historial-empty").classList.remove("hidden"); } 
    else { fm.forEach(m => { gt += Math.abs(m.monto); tbody.appendChild(createBalanceRowHTML(m, false, s, t)); }); document.getElementById("historial-table").classList.remove("hidden"); document.getElementById("historial-total-row").classList.remove("hidden"); document.getElementById("historial-empty").classList.add("hidden"); document.getElementById("historial-total-value").textContent = formatArgentineCurrency(gt); }
}

function createBalanceRowHTML(m, edit, s, t) {
    const tr = document.createElement("tr");
    if (edit) { 
        tr.innerHTML = `<td><input type="text" class="edit-input i-fec" value="${m.fecha||''}" placeholder="DD/MM/AAAA"></td><td><input type="text" class="edit-input i-det" value="${m.detalle||''}"></td><td><input type="number" step="0.01" class="edit-input i-mon" value="${m.monto||''}"></td><td><input type="text" class="edit-input i-ope" value="${m.operacion||''}"></td><td><input type="text" class="edit-input i-i21" value="${m.iva21||''}"></td><td><input type="text" class="edit-input i-i105" value="${m.iva105||''}"></td><td><input type="text" class="edit-input i-icon" value="${m.ivaCont||''}"></td><td class="text-center">-</td><td class="text-center">-</td><td class="action-buttons sticky-col"><button class="action-btn btn-save" onclick="saveBalance(this, ${m.rowIndex||'null'}, '${s}', '${t}')">Guardar</button><button class="action-btn btn-cancel" onclick="renderHistoryTable()">Cancelar</button></td>`; 
    } else {
        const isVirtual = m.isVirtual || false;
        const compHTML_C = isVirtual ? "-" : (m.idComprobanteCompra ? `<a href="https://drive.google.com/file/d/${m.idComprobanteCompra}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none;">Ver</a>` : `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${s}', ${m.rowIndex}, 'compra', '${t}')">Subir</button>`);
        const compHTML_P = isVirtual ? "-" : (m.idComprobantePago ? `<a href="https://drive.google.com/file/d/${m.idComprobantePago}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none;">Ver</a>` : `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${s}', ${m.rowIndex}, 'pago', '${t}')">Subir</button>`);
        
        let actionCol = isVirtual ? `<td class="action-buttons sticky-col hidden"></td>` : `<td class="action-buttons sticky-col"><button class="action-btn btn-edit" onclick="editBalance(${m.rowIndex}, '${s}', '${t}')">Editar</button><button class="action-btn btn-delete" onclick="deleteBalance(${m.rowIndex}, '${s}')">Borrar</button></td>`;
        
        tr.innerHTML = `<td>${m.fecha||'-'}</td><td>${m.detalle||'-'}</td><td class="text-right" style="font-weight:600; color:var(--text-primary);">${formatArgentineCurrency(t==='gastos'?Math.abs(m.monto):m.monto)}</td><td>${m.operacion||'-'}</td><td>${m.iva21||'-'}</td><td>${m.iva105||'-'}</td><td>${m.ivaCont||'-'}</td><td class="text-center">${compHTML_C}</td><td class="text-center">${compHTML_P}</td>${actionCol}`;
    } return tr;
}

function addBalanceEmptyRow(s, t) { const tb = document.getElementById("historial-tbody"); document.getElementById("historial-table").classList.remove("hidden"); document.getElementById("historial-empty").classList.add("hidden"); tb.insertBefore(createBalanceRowHTML({ fecha: "", detalle: "", monto: "", operacion: "", iva21: "", iva105: "", ivaCont: "", idComprobanteCompra: "", idComprobantePago: "" }, true, s, t), tb.firstChild); }
window.editBalance = function(ri, s, t) { let tm; const p = appState.balances[t][s]; for (let d in p) { let m = p[d].find(x => x.rowIndex === ri); if (m) tm = m; } if (!tm) return; const tb = document.getElementById("historial-tbody"); const r = Array.from(tb.querySelectorAll("tr")); const idx = r.findIndex(x => x.querySelector(`button[onclick*="${ri}"]`)); if (idx > -1) tb.replaceChild(createBalanceRowHTML(tm, true, s, t), r[idx]); };
window.saveBalance = function(b, ri, s, t) { const tr = b.closest("tr"); let rm = tr.querySelector(".i-mon").value; if (t === 'gastos' && rm > 0) rm = -rm; let cc = "", cp = ""; if (ri) { const p = appState.balances[t][s]; for (let d in p) { let m = p[d].find(x => x.rowIndex === ri); if (m) { cc = m.idComprobanteCompra; cp = m.idComprobantePago; break; } } } const py = { rowIndex: ri, sheetName: s, fecha: tr.querySelector(".i-fec").value, detalle: tr.querySelector(".i-det").value, monto: rm, operacion: tr.querySelector(".i-ope").value, iva21: tr.querySelector(".i-i21").value, iva105: tr.querySelector(".i-i105").value, ivaCont: tr.querySelector(".i-icon").value, idComprobanteCompra: cc, idComprobantePago: cp }; sendGlobalPostRequest(ri ? "BAL_EDIT" : "BAL_ADD", py); };
window.deleteBalance = function(ri, s) { if (confirm("¿Eliminar permanente?")) sendGlobalPostRequest("BAL_DELETE", { rowIndex: ri, sheetName: s }); };
window.triggerUpload = function(s, ri, ty, c) { appState.currentUpload = { sheetName: s, rowIndex: ri, type: ty, categoryType: c }; document.getElementById("global-file-input").click(); };

// ==========================================
// MÓDULO PROVEEDORES
// ==========================================
function renderProveedores() {
    const tbody = document.getElementById("proveedores-tbody");
    tbody.innerHTML = "";
    appState.proveedores.forEach(prov => tbody.appendChild(createProvRowHTML(prov, false)));
}

function createProvRowHTML(prov, isEditing) {
    const tr = document.createElement("tr");
    
    const cGen = appState.activeProvTab === 'gen' ? '' : 'hidden';
    const cBan = appState.activeProvTab === 'ban' ? '' : 'hidden';
    const cCon = appState.activeProvTab === 'con' ? '' : 'hidden';

    if (isEditing) {
        tr.innerHTML = `
            <td class="col-prov-gen ${cGen}"><input type="text" class="edit-input i-prov" value="${prov.proveedor || ''}"></td>
            <td class="col-prov-gen ${cGen}"><input type="text" class="edit-input i-nom" value="${prov.nombre || ''}"></td>
            <td class="col-prov-gen ${cGen}"><input type="text" class="edit-input i-dir" value="${prov.direccion || ''}"></td>
            
            <td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-ban" value="${prov.banco || ''}"></td>
            <td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-ali" value="${prov.alias || ''}"></td>
            <td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-cbu" value="${prov.cbu || ''}"></td>
            
            <td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-tel" value="${prov.telefono || ''}"></td>
            <td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-mail" value="${prov.mail || ''}"></td>
            <td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-web" value="${prov.web || ''}"></td>
            
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-save" onclick="saveProveedor(this, ${prov.rowIndex || 'null'})">Guardar</button>
                <button class="action-btn btn-cancel" onclick="renderProveedores()">Cancelar</button>
            </td>`;
    } else {
        tr.innerHTML = `
            <td class="col-prov-gen ${cGen}">${prov.proveedor || '-'}</td>
            <td class="col-prov-gen ${cGen}">${prov.nombre || '-'}</td>
            <td class="col-prov-gen ${cGen}">${prov.direccion || '-'}</td>
            
            <td class="col-prov-ban ${cBan}">${prov.banco || '-'}</td>
            <td class="col-prov-ban ${cBan}">${prov.alias || '-'}</td>
            <td class="col-prov-ban ${cBan}">${prov.cbu || '-'}</td>
            
            <td class="col-prov-con ${cCon}">${prov.telefono || '-'}</td>
            <td class="col-prov-con ${cCon}">${prov.mail || '-'}</td>
            <td class="text-center col-prov-con ${cCon}">
                <button class="action-btn btn-secondary" style="border: 1px solid var(--primary-color); color: var(--primary-color); background:transparent; padding: 6px 10px;" onclick="openWebModal(${prov.rowIndex})">Ver Web</button>
            </td>
            
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-edit" onclick="editProveedor(${prov.rowIndex})">Editar</button>
                <button class="action-btn btn-delete" onclick="deleteProveedor(${prov.rowIndex})">Borrar</button>
            </td>`;
    }
    return tr;
}

function addProveedorEmptyRow() { const tbody = document.getElementById("proveedores-tbody"); const emptyProv = { proveedor: "", nombre: "", direccion: "", banco: "", alias: "", cbu: "", telefono: "", mail: "", web: "" }; tbody.insertBefore(createProvRowHTML(emptyProv, true), tbody.firstChild); }
window.editProveedor = function(rowIndex) { const prov = appState.proveedores.find(p => p.rowIndex === rowIndex); if (!prov) return; const tbody = document.getElementById("proveedores-tbody"); const rows = Array.from(tbody.querySelectorAll("tr")); const rowIndexInTable = rows.findIndex(row => row.querySelector(`button[onclick*="${rowIndex}"]`)); if (rowIndexInTable > -1) tbody.replaceChild(createProvRowHTML(prov, true), rows[rowIndexInTable]); };
window.saveProveedor = function(btnElement, rowIndex) {
    const tr = btnElement.closest("tr"); let currentProv = {}; if (rowIndex) currentProv = appState.proveedores.find(p => p.rowIndex === rowIndex) || {};
    const getVal = (selector, fallback) => { const input = tr.querySelector(selector); return input ? input.value : (fallback || ""); };
    const payload = { rowIndex: rowIndex, proveedor: getVal(".i-prov", currentProv.proveedor), nombre: getVal(".i-nom", currentProv.nombre), direccion: getVal(".i-dir", currentProv.direccion), banco: getVal(".i-ban", currentProv.banco), alias: getVal(".i-ali", currentProv.alias), cbu: getVal(".i-cbu", currentProv.cbu), telefono: getVal(".i-tel", currentProv.telefono), mail: getVal(".i-mail", currentProv.mail), web: getVal(".i-web", currentProv.web) };
    sendGlobalPostRequest(rowIndex ? "PROV_EDIT" : "PROV_ADD", payload);
};
window.deleteProveedor = function(rowIndex) { if (confirm("¿Eliminar proveedor?")) sendGlobalPostRequest("PROV_DELETE", { rowIndex: rowIndex }); };
window.openWebModal = function(rowIndex) { appState.activeProvRowIndex = rowIndex; const prov = appState.proveedores.find(p => p.rowIndex === rowIndex); document.getElementById('modal-prov-name').textContent = prov.nombre || prov.proveedor || "Nuevo Proveedor"; document.getElementById('web-view-mode').classList.remove('hidden'); document.getElementById('web-edit-mode').classList.add('hidden'); document.getElementById('btn-modal-edit').classList.remove('hidden'); document.getElementById('btn-modal-save').classList.add('hidden'); document.getElementById('btn-modal-cancel').classList.add('hidden'); const link = document.getElementById('modal-web-link'); const noWeb = document.getElementById('modal-no-web'); if(prov.web && prov.web.trim() !== "") { link.href = prov.web.startsWith('http') ? prov.web : 'https://' + prov.web; link.classList.remove('hidden'); noWeb.classList.add('hidden'); document.getElementById('modal-web-input').value = prov.web; } else { link.classList.add('hidden'); noWeb.classList.remove('hidden'); document.getElementById('modal-web-input').value = ""; } document.getElementById('web-modal').classList.remove('hidden'); };

// ==========================================
// MÓDULO SUELDOS
// ==========================================
function renderSueldos() {
    const year = appState.sueldosYear; const month = parseInt(appState.sueldosMonth) - 1; const offset = month * 14;
    const thead = document.getElementById("sueldos-thead"); const tbody = document.getElementById("sueldos-tbody"); const emptyState = document.getElementById("sueldos-empty-state"); const tableCard = document.getElementById("sueldos-card-content");
    thead.innerHTML = ""; tbody.innerHTML = ""; let yearData = appState.sueldos[year] || []; let activeWorkers = [];
    if (appState.sueldosEditMode) { activeWorkers = yearData; } else { activeWorkers = yearData.filter(worker => { const dataMes = worker.rowData.slice(offset, offset + 14); return dataMes.some(val => val !== "" && val !== "-"); }); }
    if (activeWorkers.length === 0 && !appState.sueldosEditMode) { emptyState.classList.remove("hidden"); tableCard.classList.add("hidden"); return; } else { emptyState.classList.add("hidden"); tableCard.classList.remove("hidden"); }
    activeWorkers.sort((a, b) => { const nameA = (a.rowData[offset] || "").toString().toLowerCase(); const nameB = (b.rowData[offset] || "").toString().toLowerCase(); return nameA.localeCompare(nameB); });
    let maxAdelantos = 0; activeWorkers.forEach(w => { if (w.rowData[offset + 4] !== "" && w.rowData[offset + 4] !== "-") maxAdelantos = Math.max(maxAdelantos, 1); if (w.rowData[offset + 6] !== "" && w.rowData[offset + 6] !== "-") maxAdelantos = Math.max(maxAdelantos, 2); if (w.rowData[offset + 8] !== "" && w.rowData[offset + 8] !== "-") maxAdelantos = Math.max(maxAdelantos, 3); });
    let thHtml = `<tr><th class="text-left">Nombre</th><th class="text-left">Mes</th><th class="text-center">Horas</th><th class="text-right">Precio/Hora</th>`;
    if (maxAdelantos >= 1) thHtml += `<th class="text-right">Adelanto 1</th><th class="text-left">F. Ad1</th>`;
    if (maxAdelantos >= 2) thHtml += `<th class="text-right">Adelanto 2</th><th class="text-left">F. Ad2</th>`;
    if (maxAdelantos === 3) thHtml += `<th class="text-right">Adelanto 3</th><th class="text-left">F. Ad3</th>`;
    thHtml += `<th class="text-left">Método Pago</th><th class="text-left">F. Pago</th><th class="text-right">Sueldo Final</th>`;
    if (appState.sueldosEditMode) thHtml += `<th class="text-center sticky-col">Acciones</th>`;
    thHtml += `</tr>`; thead.innerHTML = thHtml;
    activeWorkers.forEach((worker) => {
        const tr = document.createElement("tr"); const rData = worker.rowData;
        if (appState.sueldosEditMode) {
            let rowHtml = `<td><input type="text" class="edit-input s-nom" value="${rData[offset] || ''}"></td><td><input type="text" class="edit-input s-mes" value="${MESES_NOMBRES[month]}"></td><td><input type="text" class="edit-input s-hor" value="${rData[offset+2] || ''}" style="text-align:center;"></td><td><input type="number" step="0.01" class="edit-input s-ph" value="${rData[offset+3] || ''}"></td>`;
            if (maxAdelantos >= 1) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a1" value="${rData[offset+4] || ''}"></td><td><input type="text" class="edit-input s-fa1" value="${rData[offset+5] || ''}" placeholder="DD/MM"></td>`;
            if (maxAdelantos >= 2) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a2" value="${rData[offset+6] || ''}"></td><td><input type="text" class="edit-input s-fa2" value="${rData[offset+7] || ''}" placeholder="DD/MM"></td>`;
            if (maxAdelantos === 3) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a3" value="${rData[offset+8] || ''}"></td><td><input type="text" class="edit-input s-fa3" value="${rData[offset+9] || ''}" placeholder="DD/MM"></td>`;
            rowHtml += `<td><div style="display:flex; gap:4px; flex-direction:column;"><input type="number" step="0.01" class="edit-input s-me" value="${rData[offset+10] || ''}" placeholder="$ Efvo"><input type="number" step="0.01" class="edit-input s-mt" value="${rData[offset+11] || ''}" placeholder="$ Trans"></div></td><td><input type="text" class="edit-input s-fp" value="${rData[offset+12] || ''}" placeholder="DD/MM"></td><td><input type="number" step="0.01" class="edit-input s-sue" value="${rData[offset+13] || ''}"></td><td class="action-buttons sticky-col"><button class="action-btn btn-delete" onclick="archiveWorker(${worker.rowIndex})">Archivar</button></td>`;
            tr.setAttribute("data-row-index", worker.rowIndex || "NEW"); tr.innerHTML = rowHtml;
        } else {
            let methodStr = "-"; const valE = Number(rData[offset+10]); const valT = Number(rData[offset+11]); if (valE > 0 && valT > 0) methodStr = `Efvo: ${formatArgentineCurrency(valE)}<br>Trans: ${formatArgentineCurrency(valT)}`; else if (valE > 0) methodStr = `Efectivo`; else if (valT > 0) methodStr = `Transferencia`;
            let rowHtml = `<td class="text-left" style="font-weight:600;">${rData[offset] || '-'}</td><td class="text-left">${rData[offset+1] || MESES_NOMBRES[month]}</td><td class="text-center">${rData[offset+2] || '-'}</td><td class="text-right">${formatArgentineCurrency(rData[offset+3])}</td>`;
            if (maxAdelantos >= 1) rowHtml += `<td class="text-right">${formatArgentineCurrency(rData[offset+4])}</td><td class="text-left">${rData[offset+5] || '-'}</td>`;
            if (maxAdelantos >= 2) rowHtml += `<td class="text-right">${formatArgentineCurrency(rData[offset+6])}</td><td class="text-left">${rData[offset+7] || '-'}</td>`;
            if (maxAdelantos === 3) rowHtml += `<td class="text-right">${formatArgentineCurrency(rData[offset+8])}</td><td class="text-left">${rData[offset+9] || '-'}</td>`;
            rowHtml += `<td class="text-left" style="font-size: 8.5pt;">${methodStr}</td><td class="text-left">${rData[offset+12] || '-'}</td><td class="text-right" style="font-weight:700; color:var(--text-primary);">${formatArgentineCurrency(rData[offset+13])}</td>`; tr.innerHTML = rowHtml;
        } tbody.appendChild(tr);
    });
}

function toggleSueldosEditMode(isEdit) { appState.sueldosEditMode = isEdit; const btnEdit = document.getElementById("btn-sueldos-edit-mode"); const btnSave = document.getElementById("btn-sueldos-save"); const btnCancel = document.getElementById("btn-sueldos-cancel"); if (isEdit) { btnEdit.classList.add("hidden"); btnSave.classList.remove("hidden"); btnCancel.classList.remove("hidden"); } else { btnEdit.classList.remove("hidden"); btnSave.classList.add("hidden"); btnCancel.classList.add("hidden"); } renderSueldos(); }
function addSueldoEmptyRow() { if (!appState.sueldosEditMode) toggleSueldosEditMode(true); const year = appState.sueldosYear; if (!appState.sueldos[year]) appState.sueldos[year] = []; let newRow = Array(168).fill("-"); const month = parseInt(appState.sueldosMonth) - 1; const offset = month * 14; for(let i=0; i<14; i++) newRow[offset + i] = ""; newRow[offset + 1] = MESES_NOMBRES[month]; appState.sueldos[year].unshift({ rowIndex: null, rowData: newRow }); renderSueldos(); }
function archiveWorker(rowIndex) { if(!confirm("¿Archivar trabajador?")) return; const year = appState.sueldosYear; const month = parseInt(appState.sueldosMonth) - 1; const offset = month * 14; let worker = appState.sueldos[year].find(w => w.rowIndex === rowIndex); if (!worker) return; for (let i = offset; i < 168; i++) worker.rowData[i] = "-"; sendGlobalPostRequest("SUELDO_SAVE_ROW", { year: year, rowIndex: rowIndex, rowData: worker.rowData }); }

async function saveSueldos() {
    const tbody = document.getElementById("sueldos-tbody"); const rows = tbody.querySelectorAll("tr"); const year = appState.sueldosYear; const month = parseInt(appState.sueldosMonth) - 1; const offset = month * 14; toggleLoader(true, "Guardando registros...");
    try { 
        for (let tr of rows) { 
            let rowIndex = tr.getAttribute("data-row-index"); if (rowIndex === "NEW") rowIndex = null; else rowIndex = parseInt(rowIndex); 
            let workerObj = null; if (rowIndex) workerObj = appState.sueldos[year].find(w => w.rowIndex === rowIndex); 
            let finalRowData = workerObj ? [...workerObj.rowData] : Array(168).fill("-"); 
            const getVal = (selector) => { const el = tr.querySelector(selector); return el ? el.value : ""; }; 
            finalRowData[offset] = getVal('.s-nom'); finalRowData[offset+1] = getVal('.s-mes'); finalRowData[offset+2] = getVal('.s-hor'); finalRowData[offset+3] = getVal('.s-ph'); finalRowData[offset+4] = getVal('.s-a1') || finalRowData[offset+4]; finalRowData[offset+5] = getVal('.s-fa1') || finalRowData[offset+5]; finalRowData[offset+6] = getVal('.s-a2') || finalRowData[offset+6]; finalRowData[offset+7] = getVal('.s-fa2') || finalRowData[offset+7]; finalRowData[offset+8] = getVal('.s-a3') || finalRowData[offset+8]; finalRowData[offset+9] = getVal('.s-fa3') || finalRowData[offset+9]; finalRowData[offset+10] = getVal('.s-me'); finalRowData[offset+11] = getVal('.s-mt'); finalRowData[offset+12] = getVal('.s-fp'); finalRowData[offset+13] = getVal('.s-sue'); 
            const nombre = finalRowData[offset]; for (let m = 0; m < 12; m++) finalRowData[m * 14] = nombre; 
            await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "SUELDO_SAVE_ROW", data: { year: year, rowIndex: rowIndex, rowData: finalRowData } }) }); 
        } 
        toggleSueldosEditMode(false); fetchFinancialData(); 
    } catch { toggleLoader(false); }
}

function sendGlobalPostRequest(action, dataObj) { toggleLoader(true, "Procesando..."); fetch(API_URL, { method: "POST", body: JSON.stringify({ action: action, data: dataObj }) }).then(res => res.json()).then(res => { if (res.status === "success") fetchFinancialData(); else { alert("Error"); toggleLoader(false); } }).catch(() => toggleLoader(false)); }
