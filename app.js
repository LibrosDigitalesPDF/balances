// URL de la API web (Actualizada con tu endpoint funcional)
const API_URL = "https://script.google.com/macros/s/AKfycbxXulFw6xdyWWwhCwhX6SBz64LrIpj_kC8matZilLgPBiEc-Aep_DdNmTilC9vrYZpcfA/exec";

// Listas oficiales de pestañas
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

// Estado global de la aplicación
let appState = {
    data: null,
    selectedMonth: "",
    selectedYear: ""
};

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSelectors();
    initTabs();
    setupEventListeners();
    populateSidebarHistory();
    fetchFinancialData();
});

// Configuración del Modo Noche persistente
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

// Configura los selectores de mes y año con la fecha actual
function initSelectors() {
    const today = new Date();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentYear = String(today.getFullYear());

    document.getElementById("select-month").value = currentMonth;
    document.getElementById("select-year").value = currentYear;

    appState.selectedMonth = currentMonth;
    appState.selectedYear = currentYear;
}

// Configura el sistema de subpestañas principales
function initTabs() {
    const menuButtons = document.querySelectorAll(".menu-btn");
    const tabViews = document.querySelectorAll(".tab-view");
    const tabTitle = document.getElementById("tab-title");
    const tabSubtitle = document.getElementById("tab-subtitle");
    const historyBtns = document.querySelectorAll(".history-btn");

    menuButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTab = button.getAttribute("data-tab");

            // Limpiar estado activo de todos los botones (incluyendo los del historial)
            menuButtons.forEach(btn => btn.classList.remove("active"));
            historyBtns.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            // Alternar vistas
            tabViews.forEach(view => {
                view.classList.toggle("active", view.id === `view-${targetTab}`);
            });

            // Actualizar textos
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

// Rellena la barra lateral izquierda con todas las pestañas para el historial
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

// Asignación de manejadores de eventos
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
}

// Activa los acordeones para que se desplieguen suavemente
function setupAccordions(container) {
    const headers = container.querySelectorAll(".accordion-header");
    headers.forEach(header => {
        header.addEventListener("click", function() {
            const item = this.parentElement;
            const body = this.nextElementSibling;
            
            // Cerrar otros acordeones abiertos (Opcional, si quieres que solo uno esté abierto a la vez)
            // container.querySelectorAll(".accordion-item.open").forEach(openItem => {
            //     if (openItem !== item) {
            //         openItem.classList.remove("open");
            //         openItem.querySelector(".accordion-body").style.maxHeight = null;
            //     }
            // });

            item.classList.toggle("open");
            if (item.classList.contains("open")) {
                body.style.maxHeight = body.scrollHeight + "px";
            } else {
                body.style.maxHeight = null;
            }
        });
    });
}

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

// Llama al backend de Google Apps Script
function fetchFinancialData() {
    toggleLoader(true);
    document.getElementById("error-container").classList.add("hidden");

    fetch(API_URL)
        .then(response => {
            if (!response.ok) throw new Error("La respuesta de red no fue satisfactoria.");
            return response.json();
        })
        .then(json => {
            if (json.status === "success") {
                appState.data = json.data;
                renderBalance();
                
                // Refrescar vistas si están activas
                if (document.getElementById("view-resumen-anual").classList.contains("active")) {
                    renderAnnualSummary();
                }
                const activeHistoryBtn = document.querySelector(".history-btn.active");
                if (activeHistoryBtn) {
                    activeHistoryBtn.click(); // Recargar historial activo
                }
            } else {
                throw new Error(json.message);
            }
        })
        .catch(err => {
            console.error("Error al buscar datos:", err);
            document.getElementById("error-message").textContent = err.message;
            document.getElementById("error-container").classList.remove("hidden");
        })
        .finally(() => toggleLoader(false));
}

// PROCESA LA VISTA PRINCIPAL "BALANCE"
function renderBalance() {
    if (!appState.data) return;

    const periodKey = `${appState.selectedYear}-${appState.selectedMonth}`;
    let grandTotalGastos = 0;
    let grandTotalIngresos = 0;
    let movimientosCount = 0;

    const gastosList = document.getElementById("gastos-list");
    gastosList.innerHTML = "";

    // 1. RENDERIZAR GASTOS (Filtra vacíos y arma acordeones)
    GASTOS_CATEGORIES.forEach(sheetName => {
        const periodData = appState.data.gastos[sheetName]?.[periodKey];
        
        // FILTRO: Solo mostrar la pestaña si tuvo movimientos en este mes
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

        // Construir HTML del Acordeón
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
                        </table>
                    </div>
                </div>
            </div>
        `;
        gastosList.appendChild(accItem);
    });

    document.getElementById("total-gastos-value").textContent = formatArgentineCurrency(grandTotalGastos);
    setupAccordions(gastosList);

    // 2. RENDERIZAR INGRESOS
    const ingresosList = document.getElementById("ingresos-list");
    ingresosList.innerHTML = "";
    const ingresosData = appState.data.ingresos["Ingresos"]?.[periodKey];

    if (ingresosData && ingresosData.length > 0) {
        let rowsHtml = "";
        ingresosData.forEach(mov => {
            grandTotalIngresos += mov.monto;
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
                        </table>
                    </div>
                </div>
            </div>
        `;
        ingresosList.appendChild(accIngreso);
        setupAccordions(ingresosList);
    }

    document.getElementById("total-ingresos-value").textContent = formatArgentineCurrency(grandTotalIngresos);

    // 3. ACTUALIZAR ESTADO VACÍO Y BALANCE FINAL
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

// PROCESA VISTA HISTÓRICA AL CLICKEAR EL MENÚ IZQUIERDO
function openHistoryView(sheetName, type, clickedBtn) {
    if (!appState.data) return;

    // Cambiar estilos de botones
    document.querySelectorAll(".menu-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".history-btn").forEach(btn => btn.classList.remove("active"));
    clickedBtn.classList.add("active");

    // Cambiar a la vista del historial
    document.querySelectorAll(".tab-view").forEach(view => view.classList.remove("active"));
    document.getElementById("view-historial").classList.add("active");

    document.getElementById("tab-title").textContent = "Historial";
    document.getElementById("tab-subtitle").textContent = sheetName;
    document.getElementById("historial-title").textContent = `Historial: ${sheetName}`;

    const targetMap = appState.data[type][sheetName];
    const tbody = document.getElementById("historial-tbody");
    const table = document.getElementById("historial-table");
    const emptyMsg = document.getElementById("historial-empty");
    
    tbody.innerHTML = "";
    let totalRegistros = 0;

    // Recorrer todos los meses buscando registros para esta pestaña
    for (const period in targetMap) {
        const registros = targetMap[period];
        if (registros && registros.length > 0) {
            registros.forEach(mov => {
                totalRegistros++;
                const montoFormat = formatArgentineCurrency(type === 'gastos' ? Math.abs(mov.monto) : mov.monto);
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
        emptyMsg.classList.remove("hidden");
    } else {
        table.classList.remove("hidden");
        emptyMsg.classList.add("hidden");
    }
}

// PROCESA RESUMEN ANUAL
function renderAnnualSummary() {
    if (!appState.data) return;

    const selectedYear = appState.selectedYear;
    let annualGastosTotal = 0;
    let annualIngresosTotal = 0;

    // Sumar Gastos
    GASTOS_CATEGORIES.forEach(sheetName => {
        const sheetMonths = appState.data.gastos[sheetName] || {};
        for (const periodKey in sheetMonths) {
            if (periodKey.startsWith(`${selectedYear}-`)) {
                sheetMonths[periodKey].forEach(mov => {
                    annualGastosTotal += Math.abs(mov.monto);
                });
            }
        }
    });

    // Sumar Ingresos
    const ingresosMonths = appState.data.ingresos["Ingresos"] || {};
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
