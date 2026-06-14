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
    balances: null, 
    carpetas: {}, 
    proveedores: [], 
    sueldos: {}, 
    selectedMonth: "", 
    selectedYear: "",
    historyMonth: "ALL", 
    historyYear: "ALL",
    sueldosMonth: "", 
    sueldosYear: "", 
    sueldosEditMode: false,
    currentHistorySheet: null, 
    currentHistoryType: null,
    currentUpload: null, 
    activeProvRowIndex: null,
    activeProvTab: "gen" // Pestaña de proveedores activa
};

let loaderInterval = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme(); 
    initNavModules(); 
    initSelectors(); 
    initTabs();
    setupEventListeners(); 
    setupWebModalHandlers(); 
    fetchFinancialData(); 
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const moonIcon = document.getElementById('moon-icon'); 
    const sunIcon = document.getElementById('sun-icon');
    
    if (savedTheme === 'dark') { 
        document.body.classList.add('dark-mode'); 
        moonIcon.classList.add('hidden'); 
        sunIcon.classList.remove('hidden'); 
    }
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode'); 
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        if (isDark) { 
            moonIcon.classList.add('hidden'); 
            sunIcon.classList.remove('hidden'); 
        } else { 
            moonIcon.classList.remove('hidden'); 
            sunIcon.classList.add('hidden'); 
        }
    });
}

function initNavModules() {
    const navBtns = document.querySelectorAll(".top-nav-btn"); 
    const modules = document.querySelectorAll(".app-module");
    
    navBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            navBtns.forEach(b => b.classList.remove("active")); 
            e.target.classList.add("active");
            
            const targetModule = e.target.getAttribute("data-module");
            
            modules.forEach(m => { 
                if (m.id === targetModule) { 
                    m.classList.remove("hidden"); 
                    m.classList.add("active"); 
                } else { 
                    m.classList.add("hidden"); 
                    m.classList.remove("active"); 
                } 
            });
            
            if (targetModule === "module-sueldos") renderSueldos();
        });
    });
}

function initSelectors() {
    const today = new Date(); 
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0'); 
    const currentYear = String(today.getFullYear());
    
    document.getElementById("select-month").value = currentMonth; 
    document.getElementById("select-year").value = currentYear;
    appState.selectedMonth = currentMonth; 
    appState.selectedYear = currentYear;
    
    document.getElementById("sueldos-month").value = currentMonth; 
    document.getElementById("sueldos-year").value = currentYear;
    appState.sueldosMonth = currentMonth; 
    appState.sueldosYear = currentYear;
}

function initTabs() {
    const menuButtons = document.querySelectorAll("#module-balances .menu-btn"); 
    const tabViews = document.querySelectorAll("#module-balances .tab-view");
    const tabTitle = document.getElementById("tab-title"); 
    const tabSubtitle = document.getElementById("tab-subtitle");
    
    menuButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTab = button.getAttribute("data-tab"); 
            
            menuButtons.forEach(btn => btn.classList.remove("active"));
            document.querySelectorAll(".history-btn").forEach(btn => btn.classList.remove("active")); 
            button.classList.add("active");
            
            tabViews.forEach(view => { 
                view.classList.toggle("active", view.id === `view-${targetTab}`); 
            });
            
            if (targetTab === "balance") { 
                tabTitle.textContent = "Balance"; 
                tabSubtitle.textContent = "Resumen consolidado de ingresos y gastos"; 
            } else if (targetTab === "resumen-anual") { 
                tabTitle.textContent = "Resumen Anual"; 
                tabSubtitle.textContent = "Acumulado de flujos anuales consolidados"; 
                renderAnnualSummary(); 
            }
        });
    });
}

// -------------------------------------------------------------
// INTEGRADOR AUTOMÁTICO DE SUELDOS HACIA BALANCES (VIRTUAL TAB)
// -------------------------------------------------------------
function injectSueldosIntoBalances() {
    // Creamos la categoría virtual
    appState.balances.gastos["Liquidación de Sueldos"] = {};
    const gastosSueldos = appState.balances.gastos["Liquidación de Sueldos"];

    Object.keys(appState.sueldos).forEach(year => {
        appState.sueldos[year].forEach(worker => {
            const rData = worker.rowData;
            
            // Recorrer los 12 meses
            for (let m = 0; m < 12; m++) {
                const offset = m * 14;
                const nombre = rData[offset];
                const fechaPago = rData[offset + 12];
                const sueldoRaw = rData[offset + 13];
                const sueldoNumber = Number(sueldoRaw);

                // Si hay nombre válido y el sueldo es un número mayor a 0
                if (nombre && nombre !== "-" && !isNaN(sueldoNumber) && sueldoNumber > 0) {
                    const monthStr = String(m + 1).padStart(2, '0');
                    const periodKey = `${year}-${monthStr}`;

                    if (!gastosSueldos[periodKey]) gastosSueldos[periodKey] = [];

                    gastosSueldos[periodKey].push({
                        rowIndex: null, // Evita edición en Balances
                        fecha: (fechaPago && fechaPago !== "-") ? fechaPago : `01/${monthStr}/${year}`,
                        detalle: nombre,
                        monto: sueldoNumber,
                        operacion: "Sueldo Mensual",
                        iva21: "-", iva105: "-", ivaCont: "-",
                        idComprobanteCompra: "", idComprobantePago: "",
                        isVirtual: true // Bandera clave
                    });
                }
            }
        });
    });
}

function populateSidebarHistory() {
    const gastosContainer = document.getElementById("sidebar-gastos-list"); 
    const ingresosContainer = document.getElementById("sidebar-ingresos-list");
    gastosContainer.innerHTML = ""; 
    ingresosContainer.innerHTML = "";
    
    if (!appState.balances) return;
    
    Object.keys(appState.balances.gastos).sort().forEach(sheetName => {
        const btn = document.createElement("button"); 
        btn.className = "history-btn"; 
        btn.textContent = sheetName; 
        btn.title = sheetName;
        btn.addEventListener("click", () => openHistoryView(sheetName, "gastos", btn)); 
        gastosContainer.appendChild(btn);
    });
    
    const btnIngreso = document.createElement("button"); 
    btnIngreso.className = "history-btn"; 
    btnIngreso.textContent = "Ingresos";
    btnIngreso.addEventListener("click", () => openHistoryView("Ingresos", "ingresos", btnIngreso)); 
    ingresosContainer.appendChild(btnIngreso);
}

function setupEventListeners() {
    // Filtros de Balances
    document.getElementById("select-month").addEventListener("change", (e) => { appState.selectedMonth = e.target.value; renderBalance(); });
    document.getElementById("select-year").addEventListener("change", (e) => { appState.selectedYear = e.target.value; renderBalance(); if (document.getElementById("view-resumen-anual").classList.contains("active")) renderAnnualSummary(); });
    document.getElementById("historial-month").addEventListener("change", (e) => { appState.historyMonth = e.target.value; renderHistoryTable(); });
    document.getElementById("historial-year").addEventListener("change", (e) => { appState.historyYear = e.target.value; renderHistoryTable(); });

    // Pestañas dinámicas de Balances
    document.getElementById("btn-add-tab-sheet").addEventListener("click", () => {
        const newTab = prompt("Ingrese el nombre de la nueva cuenta:"); 
        if (!newTab || newTab.trim() === "") return;
        if (newTab.trim().toLowerCase() === "ingresos" || newTab.trim().toLowerCase() === "carpetas" || newTab.trim().toLowerCase() === "liquidación de sueldos") { 
            alert("Nombre reservado del sistema."); 
            return; 
        }
        sendGlobalPostRequest("BAL_ADD_TAB", { sheetName: newTab.trim() });
    });
    
    document.getElementById("btn-del-tab-sheet").addEventListener("click", () => {
        if (!appState.currentHistorySheet || appState.currentHistoryType === "ingresos" || appState.currentHistorySheet === "Liquidación de Sueldos") { 
            alert("Seleccione una cuenta de Gastos válida creada por usted."); 
            return; 
        }
        if (confirm(`¿Eliminar la cuenta '${appState.currentHistorySheet}' permanentemente?`)) {
            sendGlobalPostRequest("BAL_DELETE_TAB", { sheetName: appState.currentHistorySheet }); 
            appState.currentHistorySheet = null; 
            document.querySelector('.menu-btn[data-tab="balance"]').click();
        }
    });

    // Edición de Carpetas de Drive en la web
    document.getElementById("btn-edit-carpetas").addEventListener("click", () => {
        document.querySelectorAll("#carpetas-config-section .form-control").forEach(el => el.classList.add("hidden"));
        document.querySelectorAll("#carpetas-config-section .edit-input").forEach(el => el.classList.remove("hidden"));
        document.getElementById("btn-edit-carpetas").classList.add("hidden"); 
        document.getElementById("btn-save-carpetas").classList.remove("hidden"); 
        document.getElementById("btn-cancel-carpetas").classList.remove("hidden");
    });
    
    document.getElementById("btn-cancel-carpetas").addEventListener("click", () => renderCarpetasSection(appState.currentHistorySheet));
    
    document.getElementById("btn-save-carpetas").addEventListener("click", () => {
        const sheetName = appState.currentHistorySheet; 
        const cData = appState.carpetas[sheetName] || { rowIndex: null };
        const payload = { 
            rowIndex: cData.rowIndex, 
            sheetName: sheetName, 
            idCuenta: document.getElementById("edit-id-cuenta").value.trim(), 
            idCompra: document.getElementById("edit-id-compra").value.trim(), 
            idPago: document.getElementById("edit-id-pago").value.trim() 
        };
        sendGlobalPostRequest("UPDATE_FOLDERS", payload);
    });

    // NAVEGACIÓN SUBPESTAÑAS PROVEEDORES
    document.querySelectorAll("#module-proveedores .menu-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#module-proveedores .menu-btn").forEach(b => b.classList.remove("active")); 
            btn.classList.add("active");
            appState.activeProvTab = btn.getAttribute("data-prov-tab");
            
            const titles = { "gen": "Datos generales del proveedor", "ban": "Información bancaria y transferencias", "con": "Teléfono, correo y portal web" };
            document.getElementById("prov-tab-subtitle").textContent = titles[appState.activeProvTab];
            
            // Ocultar todas las columnas dinámicas y mostrar solo las de la pestaña activa
            document.querySelectorAll("#proveedores-table th.col-prov-gen, #proveedores-table th.col-prov-ban, #proveedores-table th.col-prov-con").forEach(el => el.classList.add("hidden"));
            document.querySelectorAll(`#proveedores-table th.col-prov-${appState.activeProvTab}`).forEach(el => el.classList.remove("hidden"));
            
            renderProveedores();
        });
    });

    // Filtros y botones de Sueldos y Proveedores
    document.getElementById("sueldos-month").addEventListener("change", (e) => { appState.sueldosMonth = e.target.value; renderSueldos(); });
    document.getElementById("sueldos-year").addEventListener("change", (e) => { appState.sueldosYear = e.target.value; renderSueldos(); });
    document.getElementById("btn-sueldos-edit-mode").addEventListener("click", () => toggleSueldosEditMode(true));
    document.getElementById("btn-sueldos-cancel").addEventListener("click", () => toggleSueldosEditMode(false));
    document.getElementById("btn-sueldos-save").addEventListener("click", () => saveSueldos());
    document.getElementById("btn-sueldos-add").addEventListener("click", () => addSueldoEmptyRow());
    
    document.getElementById("btn-refresh").addEventListener("click", () => fetchFinancialData());
    document.getElementById("btn-add-proveedor").addEventListener("click", () => addProveedorEmptyRow());

    // UPLOAD DIRECTO 
    document.getElementById("global-file-input").addEventListener("change", function(e) {
        const file = e.target.files[0]; 
        if (!file || !appState.currentUpload) return;
        
        toggleLoader(true, "Procesando archivo en Drive...");
        const reader = new FileReader();
        
        reader.onload = function(evt) {
            const base64String = evt.target.result.split(',')[1]; 
            const payload = { 
                action: "UPLOAD_FILE", 
                data: { 
                    sheetName: appState.currentUpload.sheetName, 
                    rowIndex: appState.currentUpload.rowIndex, 
                    type: appState.currentUpload.type, 
                    fileName: file.name, 
                    mimeType: file.type, 
                    fileBase64: base64String 
                } 
            };
            
            fetch(API_URL, { method: "POST", body: JSON.stringify(payload) })
                .then(res => res.json())
                .then(data => { 
                    if(data.status === "success") fetchFinancialData(); 
                    else { alert("Error: " + data.message); toggleLoader(false); } 
                })
                .catch(() => toggleLoader(false));
                
            document.getElementById("global-file-input").value = "";
        };
        reader.readAsDataURL(file);
    });
}

function setupWebModalHandlers() {
    document.getElementById('btn-modal-close').onclick = () => document.getElementById('web-modal').classList.add('hidden');
    
    document.getElementById('btn-modal-edit').onclick = function() { 
        document.getElementById('web-view-mode').classList.add('hidden'); 
        document.getElementById('web-edit-mode').classList.remove('hidden'); 
        this.classList.add('hidden'); 
        document.getElementById('btn-modal-save').classList.remove('hidden'); 
        document.getElementById('btn-modal-cancel').classList.remove('hidden'); 
    };
    
    document.getElementById('btn-modal-cancel').onclick = () => window.openWebModal(appState.activeProvRowIndex);
    
    document.getElementById('btn-modal-save').onclick = function() { 
        const newVal = document.getElementById('modal-web-input').value; 
        const prov = appState.proveedores.find(p => p.rowIndex === appState.activeProvRowIndex); 
        prov.web = newVal; 
        sendGlobalPostRequest("PROV_EDIT", prov); 
        document.getElementById('web-modal').classList.add('hidden'); 
    };
}

function setupAccordions(container) {
    const headers = container.querySelectorAll(".accordion-header");
    headers.forEach(header => {
        header.addEventListener("click", function() {
            const item = this.parentElement; 
            const body = this.nextElementSibling; 
            item.classList.toggle("open");
            if (item.classList.contains("open")) {
                body.style.maxHeight = body.scrollHeight + "px"; 
            } else {
                body.style.maxHeight = null; 
            }
        });
    });
}

// ==========================================
// CARGADOR ANTIFREEZE INTERACTIVO
// ==========================================
function toggleLoader(show, msg = "") {
    const loader = document.getElementById("main-loader"); 
    const msgEl = document.getElementById("loader-msg");
    
    clearInterval(loaderInterval);
    if (!show) { 
        loader.classList.add("hidden"); 
        return; 
    }
    
    loader.classList.remove("hidden");
    if (msg) { 
        msgEl.textContent = msg; 
        return; 
    }
    
    let phaseIdx = 0; 
    msgEl.textContent = LOADER_PHASES[phaseIdx];
    loaderInterval = setInterval(() => { 
        phaseIdx = (phaseIdx + 1) % LOADER_PHASES.length; 
        msgEl.textContent = LOADER_PHASES[phaseIdx]; 
    }, 1100);
}

function formatArgentineCurrency(value) { 
    if(value === "" || value === "-" || isNaN(value)) return value || "-"; 
    return `$ ${Math.abs(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; 
}

function formatFinalBalance(value) { 
    if(isNaN(value)) return "-"; 
    const num = Math.abs(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); 
    return value < 0 ? `-$ ${num}` : `$ ${num}`; 
}

// ==========================================
// LECTURA DE DATOS (GET)
// ==========================================
function fetchFinancialData() {
    toggleLoader(true);
    fetch(API_URL)
        .then(res => { 
            if (!res.ok) throw new Error(); 
            return res.json(); 
        })
        .then(json => {
            if (json.status === "success") {
                appState.balances = json.data.balances; 
                appState.carpetas = json.data.carpetas || {}; 
                appState.proveedores = json.data.proveedores || []; 
                appState.sueldos = json.data.sueldos || {};
                
                // INYECTAMOS SUELDOS COMO UN GASTO DE BALANCE
                injectSueldosIntoBalances();
                
                populateSidebarHistory(); 
                renderBalance(); 
                renderProveedores();
                
                if (document.getElementById("module-sueldos").classList.contains("active")) renderSueldos();
                if (document.getElementById("view-resumen-anual").classList.contains("active")) renderAnnualSummary();
                if (appState.currentHistorySheet) { 
                    renderHistoryTable(); 
                    if (appState.currentHistorySheet !== "Liquidación de Sueldos") renderCarpetasSection(appState.currentHistorySheet); 
                } 
            }
        })
        .catch(() => { alert("Error de sincronización."); })
        .finally(() => toggleLoader(false));
}

// ==========================================
// MÓDULO: BALANCES 
// ==========================================
function renderBalance() {
    if (!appState.balances) return;
    const periodKey = `${appState.selectedYear}-${appState.selectedMonth}`;
    let grandTotalGastos = 0; 
    let grandTotalIngresos = 0; 
    let movimientosCount = 0;
    
    const gastosList = document.getElementById("gastos-list"); 
    gastosList.innerHTML = "";
    
    Object.keys(appState.balances.gastos).sort().forEach(sheetName => {
        const periodData = appState.balances.gastos[sheetName]?.[periodKey];
        if (!periodData || periodData.length === 0) return; 
        
        let categoryTotal = 0; 
        let rowsHtml = "";
        
        periodData.forEach(mov => { 
            const absMonto = Math.abs(mov.monto); 
            categoryTotal += absMonto; 
            movimientosCount++; 
            rowsHtml += `
                <tr>
                    <td class="text-left">${mov.fecha}</td>
                    <td class="text-left">${mov.detalle || "-"}</td>
                    <td class="text-left">${mov.operacion || "-"}</td>
                    <td class="text-right" style="font-weight:600; color: var(--text-primary);">${formatArgentineCurrency(absMonto)}</td>
                </tr>`; 
        });
        
        grandTotalGastos += categoryTotal;
        const accItem = document.createElement("div"); 
        accItem.className = "accordion-item";
        
        accItem.innerHTML = `
            <div class="accordion-header">
                <div class="accordion-title-group">
                    <svg class="accordion-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" /></svg>
                    <span class="item-name">${sheetName}</span>
                </div>
                <span class="item-val">${formatArgentineCurrency(categoryTotal)}</span>
            </div>
            <div class="accordion-body">
                <div class="accordion-content" style="padding-top:0; padding-bottom:0; border:none;">
                    <div class="table-responsive">
                        <table class="detail-table" style="margin:0; border-radius:0;">
                            <thead>
                                <tr>
                                    <th class="text-left">Fecha</th>
                                    <th class="text-left">Detalle</th>
                                    <th class="text-left">Operación</th>
                                    <th class="text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                            <tfoot>
                                <tr class="table-total-row">
                                    <td colspan="3" class="text-right">TOTAL PESTAÑA</td>
                                    <td class="text-right" style="color:var(--text-primary);">${formatArgentineCurrency(categoryTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>`;
        gastosList.appendChild(accItem);
    });
    
    document.getElementById("total-gastos-value").textContent = formatArgentineCurrency(grandTotalGastos); 
    setupAccordions(gastosList);
    
    const ingresosList = document.getElementById("ingresos-list"); 
    ingresosList.innerHTML = ""; 
    const ingresosData = appState.balances.ingresos["Ingresos"]?.[periodKey];
    
    if (ingresosData && ingresosData.length > 0) {
        let rowsHtml = ""; 
        let categoryTotal = 0;
        
        ingresosData.forEach(mov => { 
            grandTotalIngresos += mov.monto; 
            categoryTotal += mov.monto; 
            movimientosCount++; 
            rowsHtml += `
                <tr>
                    <td class="text-left">${mov.fecha}</td>
                    <td class="text-left">${mov.detalle || "-"}</td>
                    <td class="text-left">${mov.operacion || "-"}</td>
                    <td class="text-right" style="font-weight:600; color: var(--text-primary);">${formatArgentineCurrency(mov.monto)}</td>
                </tr>`; 
        });
        
        const accIngreso = document.createElement("div"); 
        accIngreso.className = "accordion-item";
        accIngreso.innerHTML = `
            <div class="accordion-header">
                <div class="accordion-title-group">
                    <svg class="accordion-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" /></svg>
                    <span class="item-name">Ingresos</span>
                </div>
                <span class="item-val">${formatArgentineCurrency(grandTotalIngresos)}</span>
            </div>
            <div class="accordion-body">
                <div class="accordion-content" style="padding-top:0; padding-bottom:0;">
                    <div class="table-responsive">
                        <table class="detail-table" style="margin:0;">
                            <thead>
                                <tr>
                                    <th class="text-left">Fecha</th>
                                    <th class="text-left">Detalle</th>
                                    <th class="text-left">Operación</th>
                                    <th class="text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                            <tfoot>
                                <tr class="table-total-row">
                                    <td colspan="3" class="text-right">TOTAL INGRESOS</td>
                                    <td class="text-right" style="color:var(--text-primary);">${formatArgentineCurrency(categoryTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>`;
        ingresosList.appendChild(accIngreso); 
        setupAccordions(ingresosList);
    }
    
    document.getElementById("total-ingresos-value").textContent = formatArgentineCurrency(grandTotalIngresos);
    
    if (movimientosCount === 0) { 
        document.getElementById("empty-state").classList.remove("hidden"); 
        document.getElementById("balance-content-wrapper").classList.add("hidden"); 
    } else { 
        document.getElementById("empty-state").classList.add("hidden"); 
        document.getElementById("balance-content-wrapper").classList.remove("hidden"); 
    }
    
    const netBalance = grandTotalIngresos - grandTotalGastos;
    document.getElementById("final-balance-value").textContent = formatFinalBalance(netBalance); 
    document.getElementById("final-balance-value").className = `final-amount text-right ${netBalance >= 0 ? 'text-success' : 'text-danger'}`; 
    document.getElementById("balance-result-card").className = `card balance-result-card ${netBalance >= 0 ? 'positive' : 'negative'}`;
}

function renderAnnualSummary() {
    if (!appState.balances) return; 
    const selectedYear = appState.selectedYear; 
    let annualGastosTotal = 0; 
    let annualIngresosTotal = 0;
    
    Object.keys(appState.balances.gastos).forEach(sheetName => { 
        const sheetMonths = appState.balances.gastos[sheetName] || {}; 
        for (const periodKey in sheetMonths) { 
            if (periodKey.startsWith(`${selectedYear}-`)) { 
                sheetMonths[periodKey].forEach(mov => { annualGastosTotal += Math.abs(mov.monto); }); 
            } 
        } 
    });
    
    const ingresosMonths = appState.balances.ingresos["Ingresos"] || {}; 
    for (const periodKey in ingresosMonths) { 
        if (periodKey.startsWith(`${selectedYear}-`)) { 
            ingresosMonths[periodKey].forEach(mov => { annualIngresosTotal += mov.monto; }); 
        } 
    }
    
    const annualNet = annualIngresosTotal - annualGastosTotal;
    document.getElementById("annual-ingresos").textContent = formatArgentineCurrency(annualIngresosTotal); 
    document.getElementById("annual-gastos").textContent = formatArgentineCurrency(annualGastosTotal);
    document.getElementById("annual-balance").textContent = formatFinalBalance(annualNet); 
    document.getElementById("annual-balance").className = `text-right font-weight-bold ${annualNet >= 0 ? 'text-success' : 'text-danger'}`;
}

function openHistoryView(sheetName, type, clickedBtn) {
    if (!appState.balances) return;
    
    document.querySelectorAll(".menu-btn").forEach(btn => btn.classList.remove("active")); 
    document.querySelectorAll(".history-btn").forEach(btn => btn.classList.remove("active")); 
    clickedBtn.classList.add("active");
    
    document.querySelectorAll(".tab-view").forEach(view => view.classList.remove("active")); 
    document.getElementById("view-historial").classList.add("active");
    
    document.getElementById("tab-title").textContent = "Historial y Edición"; 
    document.getElementById("tab-subtitle").textContent = sheetName; 
    document.getElementById("historial-title").textContent = `Registros: ${sheetName}`;
    
    appState.currentHistorySheet = sheetName; 
    appState.currentHistoryType = type;
    document.getElementById("historial-month").value = "ALL"; 
    document.getElementById("historial-year").value = "ALL"; 
    appState.historyMonth = "ALL"; 
    appState.historyYear = "ALL";
    
    // Deshabilitar funciones si es la Pestaña Virtual de Sueldos
    if (sheetName === "Liquidación de Sueldos") {
        document.getElementById("btn-add-balance").classList.add("hidden");
        document.getElementById("carpetas-config-section").classList.add("hidden");
        document.getElementById("col-acciones-historial").classList.add("hidden");
    } else {
        document.getElementById("btn-add-balance").classList.remove("hidden");
        document.getElementById("btn-add-balance").onclick = () => addBalanceEmptyRow(sheetName, type);
        document.getElementById("col-acciones-historial").classList.remove("hidden");
        renderCarpetasSection(sheetName);
    }

    renderHistoryTable();
}

function renderCarpetasSection(sheetName) {
    document.getElementById("carpetas-config-section").classList.remove("hidden");
    const cData = appState.carpetas[sheetName] || { idCuenta: "", idCompra: "", idPago: "" };
    
    document.getElementById("view-id-cuenta").textContent = cData.idCuenta || "-"; 
    document.getElementById("view-id-compra").textContent = cData.idCompra || "-"; 
    document.getElementById("view-id-pago").textContent = cData.idPago || "-";
    
    document.getElementById("edit-id-cuenta").value = cData.idCuenta; 
    document.getElementById("edit-id-compra").value = cData.idCompra; 
    document.getElementById("edit-id-pago").value = cData.idPago;
    
    document.querySelectorAll("#carpetas-config-section .form-control").forEach(el => el.classList.remove("hidden")); 
    document.querySelectorAll("#carpetas-config-section .edit-input").forEach(el => el.classList.add("hidden"));
    
    document.getElementById("btn-edit-carpetas").classList.remove("hidden"); 
    document.getElementById("btn-save-carpetas").classList.add("hidden"); 
    document.getElementById("btn-cancel-carpetas").classList.add("hidden");
}

function renderHistoryTable() {
    const sheetName = appState.currentHistorySheet; 
    const type = appState.currentHistoryType; 
    if (!sheetName || !appState.balances) return;
    
    const targetMap = appState.balances[type][sheetName]; 
    const tbody = document.getElementById("historial-tbody"); 
    const table = document.getElementById("historial-table"); 
    const emptyMsg = document.getElementById("historial-empty"); 
    const totalRow = document.getElementById("historial-total-row"); 
    const totalVal = document.getElementById("historial-total-value");
    
    tbody.innerHTML = ""; 
    let grandTotalHistorico = 0; 
    let filteredMovs = [];
    
    for (const period in targetMap) { 
        const [year, month] = period.split("-"); 
        if (appState.historyYear !== "ALL" && appState.historyYear !== year) continue; 
        if (appState.historyMonth !== "ALL" && appState.historyMonth !== month) continue; 
        if (targetMap[period]) filteredMovs = filteredMovs.concat(targetMap[period]); 
    }
    
    if (filteredMovs.length === 0) { 
        table.classList.add("hidden"); 
        totalRow.classList.add("hidden"); 
        emptyMsg.classList.remove("hidden"); 
    } else { 
        filteredMovs.forEach(mov => { 
            grandTotalHistorico += Math.abs(mov.monto); 
            tbody.appendChild(createBalanceRowHTML(mov, false, sheetName, type)); 
        }); 
        table.classList.remove("hidden"); 
        totalRow.classList.remove("hidden"); 
        emptyMsg.classList.add("hidden"); 
        totalVal.textContent = formatArgentineCurrency(grandTotalHistorico); 
        totalVal.className = `total-amount text-right`; 
    }
}

function createBalanceRowHTML(mov, isEditing, sheetName, type) {
    const tr = document.createElement("tr");
    
    if (isEditing) { 
        tr.innerHTML = `
            <td><input type="text" class="edit-input i-fec" value="${mov.fecha || ''}" placeholder="DD/MM/AAAA"></td>
            <td><input type="text" class="edit-input i-det" value="${mov.detalle || ''}"></td>
            <td><input type="number" step="0.01" class="edit-input i-mon" value="${mov.monto || ''}"></td>
            <td><input type="text" class="edit-input i-ope" value="${mov.operacion || ''}"></td>
            <td><input type="text" class="edit-input i-i21" value="${mov.iva21 || ''}"></td>
            <td><input type="text" class="edit-input i-i105" value="${mov.iva105 || ''}"></td>
            <td><input type="text" class="edit-input i-icon" value="${mov.ivaCont || ''}"></td>
            <td class="text-center">-</td>
            <td class="text-center">-</td>
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-save" onclick="saveBalance(this, ${mov.rowIndex || 'null'}, '${sheetName}', '${type}')">Guardar</button>
                <button class="action-btn btn-cancel" onclick="renderHistoryTable()">Cancelar</button>
            </td>`; 
    } else {
        const montoFormat = formatArgentineCurrency(type === 'gastos' ? Math.abs(mov.monto) : mov.monto);
        
        let compHTML_C = "-";
        let compHTML_P = "-";
        let actionCol = "";

        if (mov.isVirtual) {
            // Sueldos generados
            actionCol = `<td class="action-buttons sticky-col hidden"></td>`;
        } else {
            compHTML_C = mov.idComprobanteCompra 
                ? `<a href="https://drive.google.com/file/d/${mov.idComprobanteCompra}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none; display:inline-block;">Ver</a>` 
                : `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${sheetName}', ${mov.rowIndex}, 'compra', '${type}')">Subir</button>`;
                
            compHTML_P = mov.idComprobantePago 
                ? `<a href="https://drive.google.com/file/d/${mov.idComprobantePago}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none; display:inline-block;">Ver</a>` 
                : `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${sheetName}', ${mov.rowIndex}, 'pago', '${type}')">Subir</button>`;
            
            actionCol = `<td class="action-buttons sticky-col">
                            <button class="action-btn btn-edit" onclick="editBalance(${mov.rowIndex}, '${sheetName}', '${type}')">Editar</button>
                            <button class="action-btn btn-delete" onclick="deleteBalance(${mov.rowIndex}, '${sheetName}')">Borrar</button>
                         </td>`;
        }
            
        tr.innerHTML = `
            <td>${mov.fecha || '-'}</td>
            <td>${mov.detalle || '-'}</td>
            <td class="text-right" style="font-weight:600; color: var(--text-primary);">${montoFormat}</td>
            <td>${mov.operacion || '-'}</td>
            <td>${mov.iva21 || '-'}</td>
            <td>${mov.iva105 || '-'}</td>
            <td>${mov.ivaCont || '-'}</td>
            <td class="text-center">${compHTML_C}</td>
            <td class="text-center">${compHTML_P}</td>
            ${actionCol}`;
    } 
    return tr;
}

function addBalanceEmptyRow(sheetName, type) { 
    const tbody = document.getElementById("historial-tbody"); 
    document.getElementById("historial-table").classList.remove("hidden"); 
    document.getElementById("historial-empty").classList.add("hidden"); 
    const emptyMov = { fecha: "", detalle: "", monto: "", operacion: "", iva21: "", iva105: "", ivaCont: "", idComprobanteCompra: "", idComprobantePago: "" }; 
    tbody.insertBefore(createBalanceRowHTML(emptyMov, true, sheetName, type), tbody.firstChild); 
}

window.editBalance = function(rowIndex, sheetName, type) { 
    let targetMov; 
    const targetMap = appState.balances[type][sheetName]; 
    for (let period in targetMap) { 
        let mov = targetMap[period].find(m => m.rowIndex === rowIndex); 
        if (mov) targetMov = mov; 
    } 
    if (!targetMov) return; 
    const tbody = document.getElementById("historial-tbody"); 
    const rows = Array.from(tbody.querySelectorAll("tr")); 
    const rowIndexInTable = rows.findIndex(row => row.querySelector(`button[onclick*="${rowIndex}"]`)); 
    if (rowIndexInTable > -1) { 
        tbody.replaceChild(createBalanceRowHTML(targetMov, true, sheetName, type), rows[rowIndexInTable]); 
    } 
};

window.saveBalance = function(btnElement, rowIndex, sheetName, type) { 
    const tr = btnElement.closest("tr"); 
    let rawMonto = tr.querySelector(".i-mon").value; 
    if (type === 'gastos' && rawMonto > 0) rawMonto = -rawMonto; 
    
    let compCompra = "", compPago = ""; 
    if (rowIndex) { 
        const targetMap = appState.balances[type][sheetName]; 
        for (let period in targetMap) { 
            let mov = targetMap[period].find(m => m.rowIndex === rowIndex); 
            if (mov) { 
                compCompra = mov.idComprobanteCompra; 
                compPago = mov.idComprobantePago; 
                break; 
            } 
        } 
    } 
    
    const payload = { 
        rowIndex: rowIndex, 
        sheetName: sheetName, 
        fecha: tr.querySelector(".i-fec").value, 
        detalle: tr.querySelector(".i-det").value, 
        monto: rawMonto, 
        operacion: tr.querySelector(".i-ope").value, 
        iva21: tr.querySelector(".i-i21").value, 
        iva105: tr.querySelector(".i-i105").value, 
        ivaCont: tr.querySelector(".i-icon").value, 
        idComprobanteCompra: compCompra, 
        idComprobantePago: compPago 
    }; 
    sendGlobalPostRequest(rowIndex ? "BAL_EDIT" : "BAL_ADD", payload); 
};

window.deleteBalance = function(rowIndex, sheetName) { 
    if (confirm("¿Eliminar permanente?")) { 
        sendGlobalPostRequest("BAL_DELETE", { rowIndex: rowIndex, sheetName: sheetName }); 
    } 
};

window.triggerUpload = function(sheetName, rowIndex, uploadType, categoryType) { 
    appState.currentUpload = { sheetName, rowIndex, type: uploadType, categoryType }; 
    document.getElementById("global-file-input").click(); 
};

// ==========================================
// MÓDULO: PROVEEDORES (PESTAÑAS INDEPENDIENTES)
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
                <button class="action-btn btn-save" onclick="saveProveedor(this, ${prov.rowIndex || 'null'})">Guardar</button>
                <button class="action-btn btn-cancel" onclick="renderProveedores()">Cancelar</button>
            </td>`; 
    } else { 
        tr.innerHTML = `
            <td>${prov.proveedor || '-'}</td>
            <td>${prov.nombre || '-'}</td>
            
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

function addProveedorEmptyRow() { 
    const tbody = document.getElementById("proveedores-tbody"); 
    const emptyProv = { proveedor: "", nombre: "", direccion: "", banco: "", alias: "", cbu: "", telefono: "", mail: "", web: "" }; 
    tbody.insertBefore(createProvRowHTML(emptyProv, true), tbody.firstChild); 
}

window.editProveedor = function(rowIndex) { 
    const prov = appState.proveedores.find(p => p.rowIndex === rowIndex); 
    if (!prov) return; 
    const tbody = document.getElementById("proveedores-tbody"); 
    const rows = Array.from(tbody.querySelectorAll("tr")); 
    const rowIndexInTable = rows.findIndex(row => row.querySelector(`button[onclick*="${rowIndex}"]`)); 
    if (rowIndexInTable > -1) tbody.replaceChild(createProvRowHTML(prov, true), rows[rowIndexInTable]); 
};

window.saveProveedor = function(btnElement, rowIndex) { 
    const tr = btnElement.closest("tr"); 
    let currentProv = {}; 
    if (rowIndex) { 
        currentProv = appState.proveedores.find(p => p.rowIndex === rowIndex) || {}; 
    } 
    
    // Al guardar, usamos el valor del input si la columna está visible, 
    // sino conservamos el valor histórico de appState (para no borrar datos de otras pestañas ocultas)
    const getVal = (selector, fallback) => {
        const input = tr.querySelector(selector);
        return input ? input.value : (fallback || "");
    };

    const payload = { 
        rowIndex: rowIndex, 
        proveedor: getVal(".i-prov", currentProv.proveedor), 
        nombre: getVal(".i-nom", currentProv.nombre), 
        direccion: getVal(".i-dir", currentProv.direccion), 
        banco: getVal(".i-ban", currentProv.banco), 
        alias: getVal(".i-ali", currentProv.alias), 
        cbu: getVal(".i-cbu", currentProv.cbu), 
        telefono: getVal(".i-tel", currentProv.telefono), 
        mail: getVal(".i-mail", currentProv.mail), 
        web: getVal(".i-web", currentProv.web)
    }; 
    
    sendGlobalPostRequest(rowIndex ? "PROV_EDIT" : "PROV_ADD", payload); 
};

window.deleteProveedor = function(rowIndex) { 
    if (confirm("¿Eliminar proveedor?")) sendGlobalPostRequest("PROV_DELETE", { rowIndex: rowIndex }); 
};

window.openWebModal = function(rowIndex) { 
    appState.activeProvRowIndex = rowIndex; 
    const prov = appState.proveedores.find(p => p.rowIndex === rowIndex); 
    document.getElementById('modal-prov-name').textContent = prov.nombre || prov.proveedor || "Nuevo Proveedor"; 
    
    const viewMode = document.getElementById('web-view-mode'); 
    const editMode = document.getElementById('web-edit-mode'); 
    const link = document.getElementById('modal-web-link'); 
    const noWeb = document.getElementById('modal-no-web'); 
    const input = document.getElementById('modal-web-input'); 
    
    viewMode.classList.remove('hidden'); 
    editMode.classList.add('hidden'); 
    document.getElementById('btn-modal-edit').classList.remove('hidden'); 
    document.getElementById('btn-modal-save').classList.add('hidden'); 
    document.getElementById('btn-modal-cancel').classList.add('hidden'); 
    
    if(prov.web && prov.web.trim() !== "") { 
        link.href = prov.web.startsWith('http') ? prov.web : 'https://' + prov.web; 
        link.classList.remove('hidden'); 
        noWeb.classList.add('hidden'); 
        input.value = prov.web; 
    } else { 
        link.classList.add('hidden'); 
        noWeb.classList.remove('hidden'); 
        input.value = ""; 
    } 
    document.getElementById('web-modal').classList.remove('hidden'); 
};

// ==========================================
// MÓDULO: SUELDOS (RRHH)
// ==========================================
function renderSueldos() {
    const year = appState.sueldosYear; 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14;
    
    const thead = document.getElementById("sueldos-thead"); 
    const tbody = document.getElementById("sueldos-tbody"); 
    const emptyState = document.getElementById("sueldos-empty-state"); 
    const tableCard = document.getElementById("sueldos-card-content");
    
    thead.innerHTML = ""; 
    tbody.innerHTML = "";
    
    let yearData = appState.sueldos[year] || []; 
    let activeWorkers = [];
    
    if (appState.sueldosEditMode) { 
        activeWorkers = yearData; 
    } else { 
        activeWorkers = yearData.filter(worker => { 
            const dataMes = worker.rowData.slice(offset, offset + 14); 
            return dataMes.some(val => val !== "" && val !== "-"); 
        }); 
    }
    
    if (activeWorkers.length === 0 && !appState.sueldosEditMode) { 
        emptyState.classList.remove("hidden"); 
        tableCard.classList.add("hidden"); 
        return; 
    } else { 
        emptyState.classList.add("hidden"); 
        tableCard.classList.remove("hidden"); 
    }
    
    activeWorkers.sort((a, b) => { 
        const nameA = (a.rowData[offset] || "").toString().toLowerCase(); 
        const nameB = (b.rowData[offset] || "").toString().toLowerCase(); 
        return nameA.localeCompare(nameB); 
    });
    
    let maxAdelantos = 0; 
    activeWorkers.forEach(w => { 
        if (w.rowData[offset + 4] !== "" && w.rowData[offset + 4] !== "-") maxAdelantos = Math.max(maxAdelantos, 1); 
        if (w.rowData[offset + 6] !== "" && w.rowData[offset + 6] !== "-") maxAdelantos = Math.max(maxAdelantos, 2); 
        if (w.rowData[offset + 8] !== "" && w.rowData[offset + 8] !== "-") maxAdelantos = Math.max(maxAdelantos, 3); 
    });
    
    let thHtml = `
        <tr>
            <th class="text-left">Nombre</th>
            <th class="text-left">Mes</th>
            <th class="text-center">Horas</th>
            <th class="text-right">Precio/Hora</th>`;
            
    if (maxAdelantos >= 1) thHtml += `<th class="text-right">Adelanto 1</th><th class="text-left">F. Ad1</th>`;
    if (maxAdelantos >= 2) thHtml += `<th class="text-right">Adelanto 2</th><th class="text-left">F. Ad2</th>`;
    if (maxAdelantos === 3) thHtml += `<th class="text-right">Adelanto 3</th><th class="text-left">F. Ad3</th>`;
    
    thHtml += `
            <th class="text-left">Método Pago</th>
            <th class="text-left">F. Pago</th>
            <th class="text-right">Sueldo Final</th>`;
            
    if (appState.sueldosEditMode) thHtml += `<th class="text-center sticky-col">Acciones</th>`;
    
    thHtml += `</tr>`; 
    thead.innerHTML = thHtml;
    
    activeWorkers.forEach((worker) => {
        const tr = document.createElement("tr"); 
        const rData = worker.rowData;
        
        if (appState.sueldosEditMode) {
            let rowHtml = `
                <td><input type="text" class="edit-input s-nom" value="${rData[offset] || ''}"></td>
                <td><input type="text" class="edit-input s-mes" value="${MESES_NOMBRES[month]}"></td>
                <td><input type="text" class="edit-input s-hor" value="${rData[offset+2] || ''}" style="text-align:center;"></td>
                <td><input type="number" step="0.01" class="edit-input s-ph" value="${rData[offset+3] || ''}"></td>`;
                
            if (maxAdelantos >= 1) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a1" value="${rData[offset+4] || ''}"></td><td><input type="text" class="edit-input s-fa1" value="${rData[offset+5] || ''}" placeholder="DD/MM"></td>`;
            if (maxAdelantos >= 2) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a2" value="${rData[offset+6] || ''}"></td><td><input type="text" class="edit-input s-fa2" value="${rData[offset+7] || ''}" placeholder="DD/MM"></td>`;
            if (maxAdelantos === 3) rowHtml += `<td><input type="number" step="0.01" class="edit-input s-a3" value="${rData[offset+8] || ''}"></td><td><input type="text" class="edit-input s-fa3" value="${rData[offset+9] || ''}" placeholder="DD/MM"></td>`;
            
            rowHtml += `
                <td>
                    <div style="display:flex; gap:4px; flex-direction:column;">
                        <input type="number" step="0.01" class="edit-input s-me" value="${rData[offset+10] || ''}" placeholder="$ Efvo">
                        <input type="number" step="0.01" class="edit-input s-mt" value="${rData[offset+11] || ''}" placeholder="$ Trans">
                    </div>
                </td>
                <td><input type="text" class="edit-input s-fp" value="${rData[offset+12] || ''}" placeholder="DD/MM"></td>
                <td><input type="number" step="0.01" class="edit-input s-sue" value="${rData[offset+13] || ''}"></td>
                <td class="action-buttons sticky-col">
                    <button class="action-btn btn-delete" onclick="archiveWorker(${worker.rowIndex})">Archivar</button>
                </td>`;
                
            tr.setAttribute("data-row-index", worker.rowIndex || "NEW"); 
            tr.innerHTML = rowHtml;
        } else {
            let methodStr = "-"; 
            const valE = Number(rData[offset+10]); 
            const valT = Number(rData[offset+11]); 
            
            if (valE > 0 && valT > 0) methodStr = `Efvo: ${formatArgentineCurrency(valE)}<br>Trans: ${formatArgentineCurrency(valT)}`; 
            else if (valE > 0) methodStr = `Efectivo`; 
            else if (valT > 0) methodStr = `Transferencia`;
            
            let rowHtml = `
                <td class="text-left" style="font-weight:600;">${rData[offset] || '-'}</td>
                <td class="text-left">${rData[offset+1] || MESES_NOMBRES[month]}</td>
                <td class="text-center">${rData[offset+2] || '-'}</td>
                <td class="text-right">${formatArgentineCurrency(rData[offset+3])}</td>`;
                
            if (maxAdelantos >= 1) rowHtml += `<td class="text-right">${formatArgentineCurrency(rData[offset+4])}</td><td class="text-left">${rData[offset+5] || '-'}</td>`;
            if (maxAdelantos >= 2) rowHtml += `<td class="text-right">${formatArgentineCurrency(rData[offset+6])}</td><td class="text-left">${rData[offset+7] || '-'}</td>`;
            if (maxAdelantos === 3) rowHtml += `<td class="text-right">${formatArgentineCurrency(rData[offset+8])}</td><td class="text-left">${rData[offset+9] || '-'}</td>`;
            
            rowHtml += `
                <td class="text-left" style="font-size: 8.5pt;">${methodStr}</td>
                <td class="text-left">${rData[offset+12] || '-'}</td>
                <td class="text-right" style="font-weight:700; color:var(--text-primary);">${formatArgentineCurrency(rData[offset+13])}</td>`; 
                
            tr.innerHTML = rowHtml;
        } 
        tbody.appendChild(tr);
    });
}

function toggleSueldosEditMode(isEdit) { 
    appState.sueldosEditMode = isEdit; 
    const btnEdit = document.getElementById("btn-sueldos-edit-mode"); 
    const btnSave = document.getElementById("btn-sueldos-save"); 
    const btnCancel = document.getElementById("btn-sueldos-cancel"); 
    
    if (isEdit) { 
        btnEdit.classList.add("hidden"); 
        btnSave.classList.remove("hidden"); 
        btnCancel.classList.remove("hidden"); 
    } else { 
        btnEdit.classList.remove("hidden"); 
        btnSave.classList.add("hidden"); 
        btnCancel.classList.add("hidden"); 
    } 
    renderSueldos(); 
}

function addSueldoEmptyRow() { 
    if (!appState.sueldosEditMode) toggleSueldosEditMode(true); 
    const year = appState.sueldosYear; 
    
    if (!appState.sueldos[year]) appState.sueldos[year] = []; 
    
    let newRow = Array(168).fill("-"); 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14; 
    
    for(let i=0; i<14; i++) newRow[offset + i] = ""; 
    newRow[offset + 1] = MESES_NOMBRES[month]; 
    
    appState.sueldos[year].unshift({ rowIndex: null, rowData: newRow }); 
    renderSueldos(); 
}

function archiveWorker(rowIndex) { 
    if(!confirm("¿Archivar trabajador?")) return; 
    const year = appState.sueldosYear; 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14; 
    
    let worker = appState.sueldos[year].find(w => w.rowIndex === rowIndex); 
    if (!worker) return; 
    
    for (let i = offset; i < 168; i++) worker.rowData[i] = "-"; 
    
    sendSueldosPostRequest("SUELDO_SAVE_ROW", { year: year, rowIndex: rowIndex, rowData: worker.rowData }); 
}

async function saveSueldos() {
    const tbody = document.getElementById("sueldos-tbody"); 
    const rows = tbody.querySelectorAll("tr"); 
    const year = appState.sueldosYear; 
    const month = parseInt(appState.sueldosMonth) - 1; 
    const offset = month * 14; 
    
    toggleLoader(true, "Guardando registros...");
    
    try { 
        for (let tr of rows) { 
            let rowIndex = tr.getAttribute("data-row-index"); 
            if (rowIndex === "NEW") rowIndex = null; 
            else rowIndex = parseInt(rowIndex); 
            
            let workerObj = null; 
            if (rowIndex) workerObj = appState.sueldos[year].find(w => w.rowIndex === rowIndex); 
            
            let finalRowData = workerObj ? [...workerObj.rowData] : Array(168).fill("-"); 
            
            const getVal = (selector) => { 
                const el = tr.querySelector(selector); 
                return el ? el.value : ""; 
            }; 
            
            finalRowData[offset] = getVal('.s-nom'); 
            finalRowData[offset+1] = getVal('.s-mes'); 
            finalRowData[offset+2] = getVal('.s-hor'); 
            finalRowData[offset+3] = getVal('.s-ph'); 
            finalRowData[offset+4] = getVal('.s-a1') || finalRowData[offset+4]; 
            finalRowData[offset+5] = getVal('.s-fa1') || finalRowData[offset+5]; 
            finalRowData[offset+6] = getVal('.s-a2') || finalRowData[offset+6]; 
            finalRowData[offset+7] = getVal('.s-fa2') || finalRowData[offset+7]; 
            finalRowData[offset+8] = getVal('.s-a3') || finalRowData[offset+8]; 
            finalRowData[offset+9] = getVal('.s-fa3') || finalRowData[offset+9]; 
            finalRowData[offset+10] = getVal('.s-me'); 
            finalRowData[offset+11] = getVal('.s-mt'); 
            finalRowData[offset+12] = getVal('.s-fp'); 
            finalRowData[offset+13] = getVal('.s-sue'); 
            
            const nombre = finalRowData[offset]; 
            for (let m = 0; m < 12; m++) finalRowData[m * 14] = nombre; 
            
            await fetch(API_URL, { 
                method: "POST", 
                body: JSON.stringify({ 
                    action: "SUELDO_SAVE_ROW", 
                    data: { year: year, rowIndex: rowIndex, rowData: finalRowData } 
                }) 
            }); 
        } 
        toggleSueldosEditMode(false); 
        fetchFinancialData(); 
    } catch { 
        toggleLoader(false); 
    }
}

// ==========================================
// RED GLOBAL (FETCH POST genérico)
// ==========================================
function sendGlobalPostRequest(action, dataObj) { 
    toggleLoader(true, "Procesando petición..."); 
    fetch(API_URL, { 
        method: "POST", 
        body: JSON.stringify({ action: action, data: dataObj }) 
    })
    .then(res => res.json())
    .then(res => { 
        if (res.status === "success") fetchFinancialData(); 
        else { alert("Error al conectar con la base de datos."); toggleLoader(false); } 
    })
    .catch(() => toggleLoader(false)); 
}

function sendSueldosPostRequest(action, dataObj) { 
    toggleLoader(true, "Procesando nómina..."); 
    fetch(API_URL, { 
        method: "POST", 
        body: JSON.stringify({ action: action, data: dataObj }) 
    })
    .then(res => res.json())
    .then(res => { 
        if (res.status === "success") fetchFinancialData(); 
        else toggleLoader(false); 
    })
    .catch(() => toggleLoader(false)); 
}
