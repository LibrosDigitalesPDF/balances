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
    selectedYear: ""
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

    // Botón Agregar Proveedor
    document.getElementById("btn-add-proveedor").addEventListener("click", () => {
        addProveedorEmptyRow();
    });
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
function toggleLoader(show) {
    const loader = document.getElementById("main-loader");
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
            if (!response.ok) throw new Error("La respuesta de red no fue satisfactoria.");
            return response.json();
        })
        .then(json => {
            if (json.status === "success") {
                appState.balances = json.data.balances;
                appState.proveedores = json.data.proveedores || [];
                
                renderBalance();
                renderProveedores(); // Renderizar módulo proveedores
                
                if (document.getElementById("view-resumen-anual").classList.contains("active")) {
                    renderAnnualSummary();
                }
                const activeHistoryBtn = document.querySelector(".history-btn.active");
                if (activeHistoryBtn) {
                    activeHistoryBtn.click();
                }
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
            } else {
                alert("Error de conexión: " + err.message);
            }
        })
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

    // GASTOS
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

        // Fila Total al pie de la tabla interna
        const tfootHtml = `
            <tfoot>
                <tr class="table-total-row">
                    <td colspan="3" class="text-right">TOTAL ${sheetName.toUpperCase()}</td>
                    <td class="text-right">${formatArgentineCurrency(categoryTotal)}</td>
                </tr>
            </tfoot>
        `;

        const accItem = document.createElement("div");
        accItem.className = "accordion-item";
        accItem.innerHTML = `
            <div class="accordion-header">
                <div class="accordion-title-group">
                    <svg class="accordion-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
                    </svg>
                    <span class="item-name">${sheetName}</span>
                </div>
                <span class="item-val">${formatArgentineCurrency(categoryTotal)}</span>
            </div>
            <div class="accordion-body">
                <div class="accordion-content">
                    <div class="table-responsive">
                        <table class="detail-table">
                            <thead>
                                <tr>
                                    <th class="text-left">Fecha</th>
                                    <th class="text-left">Detalle</th>
                                    <th class="text-left">Operación</th>
                                    <th class="text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                            ${tfootHtml}
                        </table>
                    </div>
                </div>
            </div>
        `;
        gastosList.appendChild(accItem);
    });

    document.getElementById("total-gastos-value").textContent = formatArgentineCurrency(grandTotalGastos);
    setupAccordions(gastosList);

    // INGRESOS
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

        const tfootHtml = `
            <tfoot>
                <tr class="table-total-row">
                    <td colspan="3" class="text-right">TOTAL INGRESOS</td>
                    <td class="text-right">${formatArgentineCurrency(categoryTotal)}</td>
                </tr>
            </tfoot>
        `;

        const accIngreso = document.createElement("div");
        accIngreso.className = "accordion-item";
        accIngreso.innerHTML = `
            <div class="accordion-header">
                <div class="accordion-title-group">
                    <svg class="accordion-icon" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
                    </svg>
                    <span class="item-name">Ingresos</span>
                </div>
                <span class="item-val">${formatArgentineCurrency(grandTotalIngresos)}</span>
            </div>
            <div class="accordion-body">
                <div class="accordion-content">
                    <div class="table-responsive">
                        <table class="detail-table">
                            <thead>
                                <tr>
                                    <th class="text-left">Fecha</th>
                                    <th class="text-left">Detalle</th>
                                    <th class="text-left">Operación</th>
                                    <th class="text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                            ${tfootHtml}
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

function openHistoryView(sheetName, type, clickedBtn) {
    if (!appState.balances) return;

    document.querySelectorAll(".menu-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".history-btn").forEach(btn => btn.classList.remove("active"));
    clickedBtn.classList.add("active");

    document.querySelectorAll(".tab-view").forEach(view => view.classList.remove("active"));
    document.getElementById("view-historial").classList.add("active");

    document.getElementById("tab-title").textContent = "Historial";
    document.getElementById("tab-subtitle").textContent = sheetName;
    document.getElementById("historial-title").textContent = `Historial Completo: ${sheetName}`;

    const targetMap = appState.balances[type][sheetName];
    const tbody = document.getElementById("historial-tbody");
    const table = document.getElementById("historial-table");
    const emptyMsg = document.getElementById("historial-empty");
    const totalRow = document.getElementById("historial-total-row");
    const totalVal = document.getElementById("historial-total-value");
    
    tbody.innerHTML = "";
    let totalRegistros = 0;
    let grandTotalHistorico = 0;

    for (const period in targetMap) {
        const registros = targetMap[period];
        if (registros && registros.length > 0) {
            registros.forEach(mov => {
                totalRegistros++;
                const absMonto = Math.abs(mov.monto);
                grandTotalHistorico += absMonto; // Sumar al total histórico

                const montoFormat = formatArgentineCurrency(type === 'gastos' ? absMonto : mov.monto);
                const colorClass = type === 'gastos' ? 'text-danger' : 'text-success';
                
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="text-left" style="white-space: nowrap;">${mov.fecha}</td>
                    <td class="text-left">${mov.detalle || "-"}</td>
                    <td class="text-left">${mov.operacion || "-"}</td>
                    <td class="text-right ${colorClass}" style="font-weight:600;">${montoFormat}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    if (totalRegistros === 0) {
        table.classList.add("hidden");
        totalRow.classList.add("hidden");
        emptyMsg.classList.remove("hidden");
    } else {
        table.classList.remove("hidden");
        totalRow.classList.remove("hidden");
        emptyMsg.classList.add("hidden");
        
        // Volcar el total en el HTML
        totalVal.textContent = formatArgentineCurrency(grandTotalHistorico);
        if (type === 'gastos') {
            totalVal.className = "total-amount text-right text-danger";
        } else {
            totalVal.className = "total-amount text-right text-success";
        }
    }
}

// ==========================================
// MÓDULO: PROVEEDORES (CRUD)
// ==========================================

function renderProveedores() {
    const tbody = document.getElementById("proveedores-tbody");
    tbody.innerHTML = "";

    appState.proveedores.forEach(prov => {
        tbody.appendChild(createProvRowHTML(prov, false));
    });
}

// Genera una fila de tabla en formato Lectura o formato Edición
function createProvRowHTML(prov, isEditing) {
    const tr = document.createElement("tr");

    if (isEditing) {
        tr.innerHTML = `
            <td><input type="text" class="edit-input i-prov" value="${prov.proveedor || ''}"></td>
            <td><input type="text" class="edit-input i-nom" value="${prov.nombre || ''}"></td>
            <td><input type="text" class="edit-input i-dir" value="${prov.direccion || ''}"></td>
            <td><input type="text" class="edit-input i-ban" value="${prov.banco || ''}"></td>
            <td><input type="text" class="edit-input i-ali" value="${prov.alias || ''}"></td>
            <td><input type="text" class="edit-input i-cbu" value="${prov.cbu || ''}"></td>
            <td><input type="text" class="edit-input i-web" value="${prov.web || ''}"></td>
            <td class="action-buttons">
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
            <td>${prov.web}</td>
            <td class="action-buttons">
                <button class="action-btn btn-edit" onclick="editProveedor(${prov.rowIndex})">Editar</button>
                <button class="action-btn btn-delete" onclick="deleteProveedor(${prov.rowIndex})">Borrar</button>
            </td>
        `;
    }
    return tr;
}

// Agrega una fila editable vacía al principio
function addProveedorEmptyRow() {
    const tbody = document.getElementById("proveedores-tbody");
    const emptyProv = { proveedor: "", nombre: "", direccion: "", banco: "", alias: "", cbu: "", web: "" };
    // Insertar al inicio de la tabla
    tbody.insertBefore(createProvRowHTML(emptyProv, true), tbody.firstChild);
}

// Convertir fila existente a modo edición
window.editProveedor = function(rowIndex) {
    const prov = appState.proveedores.find(p => p.rowIndex === rowIndex);
    if (!prov) return;

    const tbody = document.getElementById("proveedores-tbody");
    const rows = tbody.querySelectorAll("tr");
    
    // Buscar la fila visual correspondiente y reemplazarla por la editable
    appState.proveedores.forEach((p, index) => {
        if (p.rowIndex === rowIndex) {
            tbody.replaceChild(createProvRowHTML(prov, true), rows[index]);
        }
    });
};

// Recopila datos de los inputs y los envía (Para Nuevo o Editado)
window.saveProveedor = function(btnElement, rowIndex) {
    const tr = btnElement.closest("tr");
    
    const payload = {
        rowIndex: rowIndex,
        proveedor: tr.querySelector(".i-prov").value,
        nombre: tr.querySelector(".i-nom").value,
        direccion: tr.querySelector(".i-dir").value,
        banco: tr.querySelector(".i-ban").value,
        alias: tr.querySelector(".i-ali").value,
        cbu: tr.querySelector(".i-cbu").value,
        web: tr.querySelector(".i-web").value
    };

    const action = rowIndex ? "EDIT_PROVEEDOR" : "ADD_PROVEEDOR";
    sendProvPostRequest(action, payload);
};

window.deleteProveedor = function(rowIndex) {
    if (confirm("¿Estás seguro de eliminar este proveedor? Esta acción no se puede deshacer.")) {
        sendProvPostRequest("DELETE_PROVEEDOR", { rowIndex: rowIndex });
    }
};

// ==========================================
// ESCRITURA DE DATOS (POST)
// ==========================================
function sendProvPostRequest(action, dataObj) {
    toggleLoader(true);

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: action, data: dataObj })
    })
    .then(response => response.json())
    .then(res => {
        if (res.status === "success") {
            // Recargar toda la base de datos para ver los cambios reflejados
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
