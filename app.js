// URL de la API web creada mediante Google Apps Script
// Reemplazar esta constante con la URL real devuelta al implementar como Web App
const API_URL = "https://script.google.com/macros/s/AKfycbxXulFw6xdyWWwhCwhX6SBz64LrIpj_kC8matZilLgPBiEc-Aep_DdNmTilC9vrYZpcfA/exec";

// Listas oficiales de pestañas de acuerdo con la especificación estructural
const GASTOS_CATEGORIES = [
    "Alquiler Don Bosco 128 - UF1 y 2",
    "Alquiler Don Bosco 128 - UF3 y 4",
    "Eden Don Bosco 128",
    "Eden Don Bosco 128 UF4",
    "Litoral Gas Don Bosco 128",
    "Claro Tv - Internet",
    "Impuestos Inmobiliarios",
    "Alquiler Francia 172",
    "Eden Francia 172",
    "Personal Flow",
    "Contador",
    "Abogado",
    "Seguros",
    "Publicidad",
    "Reparaciones - Mantenimiento",
    "Habitat Ecologico",
    "Tarjetas Nahuel",
    "Tarjetas Cesar",
    "Supermercado - Despensa",
    "Pastas Fabiano",
    "Ecoquimica Tripiel",
    "Mudemed",
    "Fumigacion - Cordisco",
    "Verduleria",
    "Galliteteria",
    "Insumos Enfermeria",
    "Gastos diarios y otros"
];

// Estado global de la aplicación
let appState = {
    data: null,
    selectedMonth: "",
    selectedYear: ""
};

// Inicialización de la aplicación al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
    initSelectors();
    initTabs();
    setupEventListeners();
    fetchFinancialData();
});

// Configura los selectores de mes y año con la fecha actual del sistema
function initSelectors() {
    const today = new Date();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0'); // Formato '01'-'12'
    const currentYear = String(today.getFullYear());

    const monthSelect = document.getElementById("select-month");
    const yearSelect = document.getElementById("select-year");

    monthSelect.value = currentMonth;
    yearSelect.value = currentYear;

    appState.selectedMonth = currentMonth;
    appState.selectedYear = currentYear;
}

// Configura el sistema de subpestañas de la barra lateral (Sidebar)
function initTabs() {
    const menuButtons = document.querySelectorAll(".menu-btn");
    const tabViews = document.querySelectorAll(".tab-view");
    const tabTitle = document.getElementById("tab-title");
    const tabSubtitle = document.getElementById("tab-subtitle");

    menuButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTab = button.getAttribute("data-tab");

            // Alternar estado activo en botones
            menuButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            // Alternar visibilidad de las vistas
            tabViews.forEach(view => {
                if (view.id === `view-${targetTab}`) {
                    view.classList.add("active");
                } else {
                    view.classList.remove("active");
                }
            });

            // Actualizar textos de encabezado
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

// Asignación de manejadores de eventos para controles interactivos
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

// Muestra u oculta el spinner de carga de pantalla completa
function toggleLoader(show) {
    const loader = document.getElementById("main-loader");
    if (show) {
        loader.classList.remove("hidden");
    } else {
        loader.classList.add("hidden");
    }
}

// Muestra bloque de error en interfaz si falla la llamada API
function showError(message) {
    const errContainer = document.getElementById("error-container");
    const errMsg = document.getElementById("error-message");
    errMsg.textContent = message;
    errContainer.classList.remove("hidden");
}

function hideError() {
    document.getElementById("error-container").classList.add("hidden");
}

// Formateador monetario oficial para pesos argentinos ($ 580.000,00)
function formatArgentineCurrency(value) {
    const absValue = Math.abs(value);
    const formattedNumber = absValue.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `$ ${formattedNumber}`;
}

// Formateador específico para el renglón final del balance (mantiene signo si es negativo)
function formatFinalBalance(value) {
    const formattedNumber = Math.abs(value).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    if (value < 0) {
        return `-$ ${formattedNumber}`;
    }
    return `$ ${formattedNumber}`;
}

// Llama al backend de Google Apps Script para descargar la base de datos
function fetchFinancialData() {
    toggleLoader(true);
    hideError();

    fetch(API_URL)
        .then(response => {
            if (!response.ok) {
                throw new Error("La respuesta de red no fue satisfactoria.");
            }
            return response.json();
        })
        .then(json => {
            if (json.status === "success") {
                appState.data = json.data;
                renderBalance();
                if (document.getElementById("view-resumen-anual").classList.contains("active")) {
                    renderAnnualSummary();
                }
            } else {
                throw new Error(json.message || "Error desconocido devuelto por el servidor.");
            }
        })
        .catch(err => {
            console.error("Error al buscar datos:", err);
            showError(`No se pudieron sincronizar los datos. Detalle: ${err.message}. Asegúrate de haber publicado el script como Web App con acceso 'Cualquiera' e ingresado la URL correcta en app.js.`);
        })
        .finally(() => {
            toggleLoader(false);
        });
}

// Procesa y renderiza la subpestaña principal "Balance"
function renderBalance() {
    if (!appState.data) return;

    const periodKey = `${appState.selectedYear}-${appState.selectedMonth}`; // Llave: YYYY-MM
    
    let grandTotalGastos = 0;
    let grandTotalIngresos = 0;

    // 1. PROCESAR Y RENDERIZAR GASTOS
    const gastosListContainer = document.getElementById("gastos-list");
    gastosListContainer.innerHTML = "";

    GASTOS_CATEGORIES.forEach(sheetName => {
        const sheetMonths = appState.data.gastos[sheetName] || {};
        const periodSum = sheetMonths[periodKey] || 0;
        
        // Sumamos al acumulador de gastos (tratándolo de forma absoluta para la visualización y sumatoria)
        const absoluteGastoValue = Math.abs(periodSum);
        grandTotalGastos += absoluteGastoValue;

        // Crear fila HTML alineada
        const row = document.createElement("div");
        row.className = "row-item";
        row.innerHTML = `
            <span class="item-name">${sheetName}</span>
            <span class="item-val">${formatArgentineCurrency(absoluteGastoValue)}</span>
        `;
        gastosListContainer.appendChild(row);
    });
    
    // Renderizar total consolidado de gastos
    document.getElementById("total-gastos-value").textContent = formatArgentineCurrency(grandTotalGastos);

    // 2. PROCESAR Y RENDERIZAR INGRESOS
    const ingresosListContainer = document.getElementById("ingresos-list");
    ingresosListContainer.innerHTML = "";

    const ingresosSheetData = appState.data.ingresos["Ingresos"] || {};
    const ingresosPeriodSum = ingresosSheetData[periodKey] || 0;
    grandTotalIngresos = ingresosPeriodSum;

    // Crear fila para la pestaña única de ingresos
    const rowIngreso = document.createElement("div");
    rowIngreso.className = "row-item";
    rowIngreso.innerHTML = `
        <span class="item-name">Ingresos</span>
        <span class="item-val">${formatArgentineCurrency(grandTotalIngresos)}</span>
    `;
    ingresosListContainer.appendChild(rowIngreso);
    
    // Renderizar total consolidado de ingresos
    document.getElementById("total-ingresos-value").textContent = formatArgentineCurrency(grandTotalIngresos);

    // 3. CALCULO DEL RESULTADO FINAL DEL BALANCE
    // Fórmula: TOTAL INGRESOS - TOTAL GASTOS (Gastos ya está en absoluto)
    const netBalance = grandTotalIngresos - grandTotalGastos;
    const finalBalanceContainer = document.getElementById("final-balance-value");
    const finalBalanceCard = document.querySelector(".balance-result-card");

    finalBalanceContainer.textContent = formatFinalBalance(netBalance);

    // Estilización condicional según el signo numérico resultante
    if (netBalance >= 0) {
        finalBalanceContainer.className = "final-amount text-right text-success";
        finalBalanceCard.className = "card balance-result-card positive";
    } else {
        finalBalanceContainer.className = "final-amount text-right text-danger";
        finalBalanceCard.className = "card balance-result-card negative";
    }
}

// Procesa y renderiza la subpestaña secundaria "Resumen Anual"
function renderAnnualSummary() {
    if (!appState.data) return;

    const selectedYearStr = appState.selectedYear;
    let annualGastosTotal = 0;
    let annualIngresosTotal = 0;

    // Calcular el acumulado anual recorriendo todos los meses para el año seleccionado
    // Gastos
    GASTOS_CATEGORIES.forEach(sheetName => {
        const sheetMonths = appState.data.gastos[sheetName] || {};
        for (const periodKey in sheetMonths) {
            if (periodKey.startsWith(`${selectedYearStr}-`)) {
                annualGastosTotal += Math.abs(sheetMonths[periodKey]);
            }
        }
    });

    // Ingresos
    const ingresosSheetData = appState.data.ingresos["Ingresos"] || {};
    for (const periodKey in ingresosSheetData) {
        if (periodKey.startsWith(`${selectedYearStr}-`)) {
            annualIngresosTotal += ingresosSheetData[periodKey];
        }
    }

    const annualNet = annualIngresosTotal - annualGastosTotal;

    // Volcar a las celdas correspondientes en la interfaz
    document.getElementById("annual-ingresos").textContent = formatArgentineCurrency(annualIngresosTotal);
    document.getElementById("annual-gastos").textContent = formatArgentineCurrency(annualGastosTotal);
    
    const annualBalanceCell = document.getElementById("annual-balance");
    annualBalanceCell.textContent = formatFinalBalance(annualNet);
    
    if (annualNet >= 0) {
        annualBalanceCell.className = "text-right text-success";
    } else {
        annualBalanceCell.className = "text-right text-danger";
    }
}
