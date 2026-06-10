// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxXulFw6xdyWWwhCwhX6SBz64LrIpj_kC8matZilLgPBiEc-Aep_DdNmTilC9vrYZpcfA/exec";

const GASTOS_CATEGORIES = [
    "Alquiler Don Bosco 128 - UF1 y 2", "Alquiler Don Bosco 128 - UF3 y 4",
    "Eden Don Bosco 128", "Eden Don Bosco 128 UF4", "Litoral Gas Don Bosco 128",
    "Claro Tv - Internet", "Impuestos Inmobiliarios", "Alquiler Francia 172",
    "Eden Francia 172", "Personal Flow", "Contador", "Abogado", "Seguros",
    "Publicidad", "Reparaciones - Mantenimiento", "Habitat Ecologico",
    "Tarjetas Nahuel", "Tarjetas Cesar", "Supermercado - Despensa",
    "Pastas Fabiano", "Ecoquimica Tripiel", "Mudemed", "Fumigacion - Cordisco",
    "Verduleria", "Galliteteria", "Insumos Enfermeria", "Gastos diarios y otros"
];

let appState = {
    balances: null,
    proveedores: [],
    selectedMonth: "",
    selectedYear: "",
    currentUpload: null, // Para guardar el contexto al subir comprobantes
    activeProvRowIndex: null // Para el modal web
};

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
    populateSidebarHistory();
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
}

function initTabs() {
    const menuButtons = document.querySelectorAll(".menu-btn");
    const tabViews = document.querySelectorAll(".tab-view");
    const tabTitle = document.getElementById("tab-title");
    const tabSubtitle = document.getElementById("tab-subtitle");
    const historyBtns = document.querySelectorAll(".history-btn");

    menuButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTab = button.getAttribute("data-tab");

            menuButtons.forEach(btn => btn.classList.remove("active"));
            historyBtns.forEach(btn => btn.classList.remove("active"));
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

function populateSidebarHistory() {
    const gastosContainer = document.getElementById("sidebar-gastos-list");
    const ingresosContainer = document.getElementById("sidebar-ingresos-list");
    
    gastosContainer.innerHTML = "";
    ingresosContainer.innerHTML = "";

    GASTOS_CATEGORIES.forEach(sheetName => {
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
    document.getElementById("select-month").addEventListener("change", (e) => {
        appState.selectedMonth = e.target.value;
        renderBalance();
    });

    document.getElementById("select-year").addEventListener("change", (e) => {
        appState.selectedYear = e.target.value;
        renderBalance();
        if (document.getElementById("view-resumen-anual").classList.contains("active")) {
            renderAnnualSummary();
        }
    });

    document.getElementById("btn-refresh").addEventListener("click", () => {
        fetchFinancialData();
    });

    document.getElementById("btn-add-proveedor").addEventListener("click", () => {
        addProveedorEmptyRow();
    });

    // Lector de archivos oculto para Subida a Google Drive
    document.getElementById("global-file-input").addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (!file || !appState.currentUpload) return;
        
        toggleLoader(true, "Subiendo comprobante...");
        const reader = new FileReader();
        reader.onload = function(evt) {
            const base64String = evt.target.result.split(',')[1];
            
            // Buscar la fila para ver si ya tiene un folderId
            const typeKey = appState.currentUpload.categoryType; 
            const targetMap = appState.balances[typeKey][appState.currentUpload.sheetName];
            let folderId = "";

            // Aplanamos los meses para buscar la fila
            for (let period in targetMap) {
                let mov = targetMap[period].find(m => m.rowIndex === appState.currentUpload.rowIndex);
                if (mov) {
                    folderId = appState.currentUpload.type === "compra" ? mov.idCarpetaCompra : mov.idCarpetaVenta;
                    break;
                }
            }

            const payload = {
                action: "UPLOAD_FILE",
                data: {
                    sheetName: appState.currentUpload.sheetName,
                    rowIndex: appState.currentUpload.rowIndex,
                    type: appState.currentUpload.type,
                    folderId: folderId || "",
                    fileName: file.name,
                    mimeType: file.type,
                    fileBase64: base64String
                }
            };

            fetch(API_URL, { method: "POST", body: JSON.stringify(payload) })
            .then(res => res.json())
            .then(data => {
                if(data.status === "success") {
                    fetchFinancialData();
                } else {
                    alert("Error al subir archivo: " + data.message);
                    toggleLoader(false);
                }
            })
            .catch(err => {
                alert("Error de conexión al subir.");
                toggleLoader(false);
            });
            
            // Limpiar input
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
// UTILIDADES
// ==========================================
function toggleLoader(show, msg = "Cargando base de datos...") {
    const loader = document.getElementById("main-loader");
    const msgEl = document.getElementById("loader-msg");
    if(msgEl) msgEl.textContent = msg;
    show ? loader.classList.remove("hidden") : loader.classList.add("hidden");
}

function formatArgentineCurrency(value) {
    return `$ ${Math.abs(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatFinalBalance(value) {
    const num = Math.abs(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value < 0 ? `-$ ${num}` : `$ ${num}`;
}

// ==========================================
// LECTURA DE DATOS (GET)
// ==========================================
function fetchFinancialData() {
    toggleLoader(true);
    const errContainer = document.getElementById("error-container");
    if(errContainer) errContainer.classList.add("hidden");

    fetch(API_URL)
        .then(response => {
            if (!response.ok) throw new Error("Error de red HTTP");
            return response.json();
        })
        .then(json => {
            if (json.status === "success") {
                appState.balances = json.data.balances;
                appState.proveedores = json.data.proveedores || [];
                
                renderBalance();
                renderProveedores();
                
                if (document.getElementById("view-resumen-anual").classList.contains("active")) {
                    renderAnnualSummary();
                }
                const activeHistoryBtn = document.querySelector(".history-btn.active");
                if (activeHistoryBtn) activeHistoryBtn.click();
            } else {
                throw new Error(json.message);
            }
        })
        .catch(err => {
            console.error("Error al buscar datos:", err);
            const errMsj = document.getElementById("error-message");
            if(errMsj) {
                errMsj.textContent = err.message;
                errContainer.classList.remove("hidden");
            }
        })
        .finally(() => toggleLoader(false));
}

// ==========================================
// MÓDULO: BALANCES (VISTAS MENSUALES Y ANUALES)
// ==========================================
function renderBalance() {
    if (!appState.balances) return;

    const periodKey = `${appState.selectedYear}-${appState.selectedMonth}`;
    let grandTotalGastos = 0;
    let grandTotalIngresos = 0;
    let movimientosCount = 0;

    const gastosList = document.getElementById("gastos-list");
    gastosList.innerHTML = "";

    GASTOS_CATEGORIES.forEach(sheetName => {
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
                    <td class="text-right">${formatArgentineCurrency(absMonto)}</td>
                </tr>
            `;
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
                <div class="accordion-content" style="padding:0;">
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
                                    <td colspan="3" class="text-right">TOTAL DE LA PESTAÑA</td>
                                    <td class="text-right">${formatArgentineCurrency(categoryTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;
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
                    <td class="text-right">${formatArgentineCurrency(mov.monto)}</td>
                </tr>
            `;
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
                <div class="accordion-content" style="padding:0;">
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
                                    <td colspan="3" class="text-right">TOTAL INGRESOS</td>
                                    <td class="text-right">${formatArgentineCurrency(categoryTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;
        ingresosList.appendChild(accIngreso);
        setupAccordions(ingresosList);
    }

    document.getElementById("total-ingresos-value").textContent = formatArgentineCurrency(grandTotalIngresos);

    const emptyState = document.getElementById("empty-state");
    const contentWrapper = document.getElementById("balance-content-wrapper");

    if (movimientosCount === 0) {
        emptyState.classList.remove("hidden");
        contentWrapper.classList.add("hidden");
    } else {
        emptyState.classList.add("hidden");
        contentWrapper.classList.remove("hidden");
    }

    const netBalance = grandTotalIngresos - grandTotalGastos;
    const finalBalanceContainer = document.getElementById("final-balance-value");
    const finalBalanceCard = document.getElementById("balance-result-card");

    finalBalanceContainer.textContent = formatFinalBalance(netBalance);
    finalBalanceContainer.className = `final-amount text-right ${netBalance >= 0 ? 'text-success' : 'text-danger'}`;
    finalBalanceCard.className = `card balance-result-card ${netBalance >= 0 ? 'positive' : 'negative'}`;
}

function renderAnnualSummary() {
    if (!appState.balances) return;

    const selectedYear = appState.selectedYear;
    let annualGastosTotal = 0;
    let annualIngresosTotal = 0;

    GASTOS_CATEGORIES.forEach(sheetName => {
        const sheetMonths = appState.balances.gastos[sheetName] || {};
        for (const periodKey in sheetMonths) {
            if (periodKey.startsWith(`${selectedYear}-`)) {
                sheetMonths[periodKey].forEach(mov => {
                    annualGastosTotal += Math.abs(mov.monto);
                });
            }
        }
    });

    const ingresosMonths = appState.balances.ingresos["Ingresos"] || {};
    for (const periodKey in ingresosMonths) {
        if (periodKey.startsWith(`${selectedYear}-`)) {
            ingresosMonths[periodKey].forEach(mov => {
                annualIngresosTotal += mov.monto;
            });
        }
    }

    const annualNet = annualIngresosTotal - annualGastosTotal;

    document.getElementById("annual-ingresos").textContent = formatArgentineCurrency(annualIngresosTotal);
    document.getElementById("annual-gastos").textContent = formatArgentineCurrency(annualGastosTotal);
    
    const annualBalanceCell = document.getElementById("annual-balance");
    annualBalanceCell.textContent = formatFinalBalance(annualNet);
    annualBalanceCell.className = `text-right font-weight-bold ${annualNet >= 0 ? 'text-success' : 'text-danger'}`;
}

// ==========================================
// MÓDULO: HISTORIAL DE BALANCES Y DRIVE (CRUD)
// ==========================================
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

    // Configurar Botón Nueva Operación
    const btnAdd = document.getElementById("btn-add-balance");
    btnAdd.classList.remove("hidden");
    btnAdd.onclick = () => addBalanceEmptyRow(sheetName, type);

    const targetMap = appState.balances[type][sheetName];
    const tbody = document.getElementById("historial-tbody");
    const table = document.getElementById("historial-table");
    const emptyMsg = document.getElementById("historial-empty");
    const totalRow = document.getElementById("historial-total-row");
    const totalVal = document.getElementById("historial-total-value");
    
    tbody.innerHTML = "";
    let totalRegistros = 0;
    let grandTotalHistorico = 0;

    // Recopilar todos los movimientos aplanados
    let allMovs = [];
    for (const period in targetMap) {
        if (targetMap[period]) {
            allMovs = allMovs.concat(targetMap[period]);
        }
    }

    if (allMovs.length === 0) {
        table.classList.add("hidden");
        totalRow.classList.add("hidden");
        emptyMsg.classList.remove("hidden");
    } else {
        allMovs.forEach(mov => {
            grandTotalHistorico += Math.abs(mov.monto);
            tbody.appendChild(createBalanceRowHTML(mov, false, sheetName, type));
        });

        table.classList.remove("hidden");
        totalRow.classList.remove("hidden");
        emptyMsg.classList.add("hidden");
        
        totalVal.textContent = formatArgentineCurrency(grandTotalHistorico);
        totalVal.className = `total-amount text-right ${type === 'gastos' ? 'text-danger' : 'text-success'}`;
    }
}

// Generador HTML para filas de Balance (Lectura y Edición completa A-L)
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
            <td><input type="text" class="edit-input i-carpc" value="${mov.idCarpetaCompra || ''}" placeholder="ID Drive"></td>
            <td><input type="text" class="edit-input i-carpv" value="${mov.idCarpetaVenta || ''}" placeholder="ID Drive"></td>
            <td class="text-center">-</td>
            <td class="text-center">-</td>
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-save" onclick="saveBalance(this, ${mov.rowIndex || 'null'}, '${sheetName}', '${type}')">Guardar</button>
                <button class="action-btn btn-cancel" onclick="document.querySelector('.history-btn.active').click()">Cancelar</button>
            </td>
        `;
    } else {
        const montoFormat = formatArgentineCurrency(type === 'gastos' ? Math.abs(mov.monto) : mov.monto);
        const colorClass = type === 'gastos' ? 'text-danger' : 'text-success';

        // Lógica Botones Drive
        const btnVerC = `<a href="https://drive.google.com/file/d/${mov.idComprobanteCompra}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none; display:inline-block;">Ver</a>`;
        const btnSubirC = `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${sheetName}', ${mov.rowIndex}, 'compra', '${type}')">Subir</button>`;
        const compHTML_C = mov.idComprobanteCompra ? btnVerC : btnSubirC;

        const btnVerV = `<a href="https://drive.google.com/file/d/${mov.idComprobanteVenta}/view" target="_blank" class="action-btn btn-link" style="text-decoration:none; display:inline-block;">Ver</a>`;
        const btnSubirV = `<button class="action-btn btn-secondary" style="border:1px solid var(--primary-color); color:var(--primary-color);" onclick="window.triggerUpload('${sheetName}', ${mov.rowIndex}, 'venta', '${type}')">Subir</button>`;
        const compHTML_V = mov.idComprobanteVenta ? btnVerV : btnSubirV;

        const linkCarpC = mov.idCarpetaCompra ? `<a href="https://drive.google.com/drive/folders/${mov.idCarpetaCompra}" target="_blank">Carpeta</a>` : '-';
        const linkCarpV = mov.idCarpetaVenta ? `<a href="https://drive.google.com/drive/folders/${mov.idCarpetaVenta}" target="_blank">Carpeta</a>` : '-';

        tr.innerHTML = `
            <td>${mov.fecha || '-'}</td>
            <td>${mov.detalle || '-'}</td>
            <td class="text-right ${colorClass}" style="font-weight:600;">${montoFormat}</td>
            <td>${mov.operacion || '-'}</td>
            <td>${mov.iva21 || '-'}</td>
            <td>${mov.iva105 || '-'}</td>
            <td>${mov.ivaCont || '-'}</td>
            <td class="text-center">${linkCarpC}</td>
            <td class="text-center">${linkCarpV}</td>
            <td class="text-center">${compHTML_C}</td>
            <td class="text-center">${compHTML_V}</td>
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-edit" onclick="editBalance(${mov.rowIndex}, '${sheetName}', '${type}')">Editar</button>
                <button class="action-btn btn-delete" onclick="deleteBalance(${mov.rowIndex}, '${sheetName}')">Borrar</button>
            </td>
        `;
    }
    return tr;
}

function addBalanceEmptyRow(sheetName, type) {
    const tbody = document.getElementById("historial-tbody");
    document.getElementById("historial-table").classList.remove("hidden");
    document.getElementById("historial-empty").classList.add("hidden");
    const emptyMov = { fecha: "", detalle: "", monto: "", operacion: "", iva21: "", iva105: "", ivaCont: "", idCarpetaCompra: "", idCarpetaVenta: "" };
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
    
    // Al guardar un gasto, el monto en sheets suele ir negativo
    let rawMonto = tr.querySelector(".i-mon").value;
    if (type === 'gastos' && rawMonto > 0) rawMonto = -rawMonto;

    // Recuperamos comprobantes ocultos si es edición para no perderlos
    let compCompra = "", compVenta = "";
    if (rowIndex) {
        const targetMap = appState.balances[type][sheetName];
        for (let period in targetMap) {
            let mov = targetMap[period].find(m => m.rowIndex === rowIndex);
            if (mov) { compCompra = mov.idComprobanteCompra; compVenta = mov.idComprobanteVenta; break; }
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
        idCarpetaCompra: tr.querySelector(".i-carpc").value,
        idComprobanteCompra: compCompra,
        idCarpetaVenta: tr.querySelector(".i-carpv").value,
        idComprobanteVenta: compVenta
    };

    sendGlobalPostRequest(rowIndex ? "BAL_EDIT" : "BAL_ADD", payload);
};

window.deleteBalance = function(rowIndex, sheetName) {
    if (confirm("¿Estás seguro de eliminar esta operación? Esta acción borrará la fila del Excel permanentemente.")) {
        sendGlobalPostRequest("BAL_DELETE", { rowIndex: rowIndex, sheetName: sheetName });
    }
};

window.triggerUpload = function(sheetName, rowIndex, uploadType, categoryType) {
    appState.currentUpload = { sheetName, rowIndex, type: uploadType, categoryType };
    document.getElementById("global-file-input").click();
};

// ==========================================
// MÓDULO: PROVEEDORES (CRUD + MODAL WEB)
// ==========================================
function renderProveedores() {
    const tbody = document.getElementById("proveedores-tbody");
    tbody.innerHTML = "";
    appState.proveedores.forEach(prov => tbody.appendChild(createProvRowHTML(prov, false)));
}

function createProvRowHTML(prov, isEditing) {
    const tr = document.createElement("tr");

    if (isEditing) {
        // En edición, no se edita la Web aquí, se edita en el Modal.
        tr.innerHTML = `
            <td><input type="text" class="edit-input i-prov" value="${prov.proveedor || ''}"></td>
            <td><input type="text" class="edit-input i-nom" value="${prov.nombre || ''}"></td>
            <td><input type="text" class="edit-input i-dir" value="${prov.direccion || ''}"></td>
            <td><input type="text" class="edit-input i-ban" value="${prov.banco || ''}"></td>
            <td><input type="text" class="edit-input i-ali" value="${prov.alias || ''}"></td>
            <td><input type="text" class="edit-input i-cbu" value="${prov.cbu || ''}"></td>
            <td class="text-center">-</td>
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-save" onclick="saveProveedor(this, ${prov.rowIndex || 'null'})">Guardar</button>
                <button class="action-btn btn-cancel" onclick="renderProveedores()">Cancelar</button>
            </td>
        `;
    } else {
        tr.innerHTML = `
            <td>${prov.proveedor}</td>
            <td>${prov.nombre}</td>
            <td>${prov.direccion}</td>
            <td>${prov.banco}</td>
            <td>${prov.alias}</td>
            <td>${prov.cbu}</td>
            <td class="text-center">
                <button class="action-btn btn-secondary" style="border: 1px solid var(--primary-color); color: var(--primary-color); background:transparent;" onclick="openWebModal(${prov.rowIndex})">Ver Web</button>
            </td>
            <td class="action-buttons sticky-col">
                <button class="action-btn btn-edit" onclick="editProveedor(${prov.rowIndex})">Editar</button>
                <button class="action-btn btn-delete" onclick="deleteProveedor(${prov.rowIndex})">Borrar</button>
            </td>
        `;
    }
    return tr;
}

function addProveedorEmptyRow() {
    const tbody = document.getElementById("proveedores-tbody");
    const emptyProv = { proveedor: "", nombre: "", direccion: "", banco: "", alias: "", cbu: "", web: "" };
    tbody.insertBefore(createProvRowHTML(emptyProv, true), tbody.firstChild);
}

window.editProveedor = function(rowIndex) {
    const prov = appState.proveedores.find(p => p.rowIndex === rowIndex);
    if (!prov) return;
    const tbody = document.getElementById("proveedores-tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const rowIndexInTable = rows.findIndex(row => row.querySelector(`button[onclick*="${rowIndex}"]`));
    
    if (rowIndexInTable > -1) {
        tbody.replaceChild(createProvRowHTML(prov, true), rows[rowIndexInTable]);
    }
};

window.saveProveedor = function(btnElement, rowIndex) {
    const tr = btnElement.closest("tr");
    
    // Recuperamos la web actual para no perderla al guardar desde la tabla
    let currentWeb = "";
    if (rowIndex) {
        const p = appState.proveedores.find(p => p.rowIndex === rowIndex);
        if (p) currentWeb = p.web;
    }

    const payload = {
        rowIndex: rowIndex,
        proveedor: tr.querySelector(".i-prov").value,
        nombre: tr.querySelector(".i-nom").value,
        direccion: tr.querySelector(".i-dir").value,
        banco: tr.querySelector(".i-ban").value,
        alias: tr.querySelector(".i-ali").value,
        cbu: tr.querySelector(".i-cbu").value,
        web: currentWeb
    };

    sendGlobalPostRequest(rowIndex ? "PROV_EDIT" : "PROV_ADD", payload);
};

window.deleteProveedor = function(rowIndex) {
    if (confirm("¿Eliminar proveedor?")) {
        sendGlobalPostRequest("PROV_DELETE", { rowIndex: rowIndex });
    }
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
// RED GLOBAL (FETCH POST)
// ==========================================
function sendGlobalPostRequest(action, dataObj) {
    toggleLoader(true, "Guardando cambios...");

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: action, data: dataObj })
    })
    .then(response => response.json())
    .then(res => {
        if (res.status === "success") {
            fetchFinancialData();
        } else {
            alert("Error al procesar: " + res.message);
            toggleLoader(false);
        }
    })
    .catch(err => {
        alert("Error de conexión al guardar los datos.");
        toggleLoader(false);
    });
}
