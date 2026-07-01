// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL (37 COLUMNAS)
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxXulFw6xdyWWwhCwhX6SBz64LrIpj_kC8matZilLgPBiEc-Aep_DdNmTilC9vrYZpcfA/exec";
const MESES_NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ÍNDICES EXACTOS DEL NUEVO MOLDE DE 37 COLUMNAS
const IDX_NOM=0, IDX_HOR=1, IDX_PH=2;
const IDX_AD_START=3, IDX_PLUS_START=9, IDX_DEB_START=25, IDX_AGUI=31;
const IDX_ME=32, IDX_MT=33, IDX_FP=34, IDX_SUE=35, IDX_EST=36;
const TOTAL_COLS = 37;

const LOADER_PHASES = ["Conectando con el servidor...", "Descargando flujos...", "Integrando RRHH...", "Sincronizando vistas..."];

let appState = {
    balances: null, carpetas: {}, proveedores: [], sueldos: {}, 
    selectedMonth: "", selectedYear: "", historyMonth: "ALL", historyYear: "ALL",
    sueldosMonth: "", sueldosYear: "", 
    sueldosEditMode: false, proveedoresEditMode: false, historialEditMode: false,
    currentHistorySheet: null, currentHistoryType: null, currentUpload: null, activeProvRowIndex: null, activeProvTab: "gen",
    activeSueldosTab: "registro-sueldos", sueldosVisibleAdelantos: 1, sueldosShowPlus: 0, sueldosShowDebito: 0, sueldosShowAguinaldo: false
};

let loaderInterval = null;

// ==========================================
// INICIALIZACIÓN Y UTILIDADES GLOBALES
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme(); initSelectors(); initTabs(); setupEventListeners(); setupWebModalHandlers(); fetchFinancialData(); 
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
    if (!dateStr || dateStr === "-") return ""; const str = dateStr.toString().trim();
    if (str.includes("T") && str.includes("-")) { const parts = str.split("T")[0].split("-"); if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`; }
    return str.split(" ")[0];
}

function getValDate(selector, tr) { const el = tr.querySelector(selector); if (!el) return ""; const raw = el.getAttribute('data-raw'); if (el.value === formatDateToAR(raw)) return raw; return el.value; }

function parseMonto(val) {
    if (val === "" || val === null || val === undefined || val === "-") return 0; if (typeof val === 'number') return val;
    let str = val.toString().trim().replace(/[^0-9.,-]/g, ''); 
    if (str.includes(',') && str.includes('.')) { const lastComma = str.lastIndexOf(','); const lastDot = str.lastIndexOf('.'); if (lastComma > lastDot) { str = str.replace(/\./g, '').replace(',', '.'); } else { str = str.replace(/,/g, ''); } } 
    else if (str.includes(',')) { str = str.replace(',', '.'); } else if (str.includes('.')) { const parts = str.split('.'); if (parts[parts.length - 1].length > 2) { str = str.replace(/\./g, ''); } }
    return Number(str) || 0;
}

function formatArgentineCurrency(v) { if(v===""||v==="-"||isNaN(v)) return v||"-"; return `$ ${Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatFinalBalance(v) { if(isNaN(v)) return "-"; const n = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `-$ ${n}` : `$ ${n}`; }

function toggleLoader(show, msg = "") { 
    clearInterval(loaderInterval); const l = document.getElementById("main-loader"); const m = document.getElementById("loader-msg"); 
    if (!show) { l.classList.add("hidden"); return; } 
    l.classList.remove("hidden"); if (msg) { m.textContent = msg; return; } 
    let p = 0; m.textContent = LOADER_PHASES[p]; loaderInterval = setInterval(() => { p = (p + 1) % LOADER_PHASES.length; m.textContent = LOADER_PHASES[p]; }, 1100); 
}

function showToast(msg) {
    const toast = document.getElementById("toast-notification"); if(!toast) return;
    toast.textContent = msg; toast.classList.remove("hidden"); toast.style.opacity = 1;
    setTimeout(() => { toast.style.opacity = 0; setTimeout(() => toast.classList.add("hidden"), 500); }, 3000);
}

function initSelectors() {
    const today = new Date(); const m = String(today.getMonth() + 1).padStart(2, '0'); const y = String(today.getFullYear());
    appState.selectedMonth = m; appState.selectedYear = y; appState.sueldosMonth = m; appState.sueldosYear = y; appState.historyMonth = "ALL"; appState.historyYear = "ALL";
    if(document.getElementById("select-month")) document.getElementById("select-month").value = m; 
    if(document.getElementById("select-year")) document.getElementById("select-year").value = y; 
    if(document.getElementById("sueldos-month")) document.getElementById("sueldos-month").value = m; 
    if(document.getElementById("sueldos-year")) document.getElementById("sueldos-year").value = y; 
}

function initTabs() {
    document.querySelectorAll(".top-nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".top-nav-btn").forEach(b => b.classList.remove("active")); e.target.classList.add("active");
            const targetModule = e.target.getAttribute("data-module");
            document.querySelectorAll(".app-module").forEach(m => m.classList.toggle("hidden", m.id !== targetModule));
            document.querySelectorAll(".app-module").forEach(m => m.classList.toggle("active", m.id === targetModule));
            if (targetModule === "module-sueldos") window.renderSueldos();
        });
    });

    document.querySelectorAll("#module-balances .menu-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#module-balances .menu-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
            const tab = btn.getAttribute("data-tab");
            document.querySelectorAll("#module-balances .tab-view").forEach(view => view.classList.toggle("active", view.id === `view-${tab}`));
        });
    });

    document.querySelectorAll("#module-sueldos .menu-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#module-sueldos .menu-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
            appState.activeSueldosTab = btn.getAttribute("data-tab");
            const histView = document.getElementById("view-historial-trabajador");
            if (histView) histView.classList.remove("active");
            document.querySelectorAll("#module-sueldos .tab-view").forEach(view => {
                if (view.id !== "view-historial-trabajador") view.classList.toggle("active", view.id === `view-${appState.activeSueldosTab}`);
            });
            window.renderSueldos();
        });
    });
}

// ==========================================
// MÓDULO: SUELDOS (BARRA UNIFICADA E HISTORIAL EN PANTALLA PRINCIPAL)
// ==========================================
function populateWorkerHistory() {
    const list = document.getElementById("worker-history-list");
    if (!list) return; list.innerHTML = "";
    let uniqueWorkers = new Set();
    
    Object.keys(appState.sueldos).forEach(tabName => {
        appState.sueldos[tabName].forEach(w => {
            let n = w.rowData[IDX_NOM];
            if(n && n.toString().trim() !== "-" && n.toString().trim() !== "") uniqueWorkers.add(n.toString().trim());
        });
    });
    
    Array.from(uniqueWorkers).sort().forEach(nw => {
        let div = document.createElement("div");
        div.style.padding = "10px 15px"; div.style.fontSize = "9.5pt"; div.style.borderBottom = "1px solid var(--border-color)";
        div.style.cursor = "pointer"; div.style.transition = "background 0.2s"; div.textContent = nw;
        div.onclick = () => showWorkerHistoryInMain(nw);
        list.appendChild(div);
    });
}

function showWorkerHistoryInMain(name) {
    document.querySelectorAll("#module-sueldos .tab-view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll("#module-sueldos .menu-btn").forEach(b => b.classList.remove("active"));
    
    let viewHist = document.getElementById("view-historial-trabajador");
    if (!viewHist) {
        viewHist = document.createElement("section"); viewHist.id = "view-historial-trabajador"; viewHist.className = "tab-view";
        const container = document.querySelector("#module-sueldos .view-container");
        if (container) container.appendChild(viewHist);
    }
    
    viewHist.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 2px solid var(--border-color); margin-bottom: 20px;">
            <h3 class="section-title text-left" style="margin: 0; border: none; padding: 0;">Historial General: <span>${name}</span></h3>
            <button id="btn-back-from-hist" class="btn btn-secondary" style="padding: 6px 12px; font-size: 9.5pt;">← Volver</button>
        </div>
        <div class="table-responsive nowrap-table" style="flex-grow: 1; overflow: auto; padding-bottom: 20px;">
            <table class="data-table">
                <thead><tr><th>Mes</th><th>Año</th><th class="text-center">Hs</th><th class="text-right">P/Hr</th><th class="text-right">Adelantos</th><th class="text-right">Plus Tot.</th><th class="text-right">Débitos Tot.</th><th class="text-right">Aguinaldo</th><th class="text-right">Sueldo Final</th><th class="text-left">F. Pago</th></tr></thead>
                <tbody id="worker-main-hist-tbody"></tbody>
            </table>
        </div>
    `;
    
    document.getElementById("btn-back-from-hist").onclick = () => {
        viewHist.classList.remove("active");
        const activeBtn = document.querySelector(`#module-sueldos .menu-btn[data-tab="${appState.activeSueldosTab}"]`);
        if (activeBtn) activeBtn.classList.add("active");
        const activeSection = document.getElementById(`view-${appState.activeSueldosTab}`);
        if (activeSection) activeSection.classList.add("active");
        window.renderSueldos();
    };
    
    const tbody = document.getElementById("worker-main-hist-tbody"); let historyData = [];
    
    Object.keys(appState.sueldos).forEach(tabName => {
        const parts = tabName.split(" "); if(parts.length !== 2) return;
        const mStr = parts[0]; const yStr = parts[1]; const mIdx = MESES_NOMBRES[mesNombre => MESES_NOMBRES.indexOf(mStr)];
        
        appState.sueldos[tabName].forEach(w => {
            if (w.rowData[IDX_NOM] && w.rowData[IDX_NOM].toString().trim().toLowerCase() === name.toLowerCase()) {
                const r = w.rowData;
                let sumAd = 0; for(let a=0; a<3; a++) sumAd += Math.abs(parseMonto(r[IDX_AD_START+(a*2)]));
                let pl = 0; for(let p=0; p<8; p++) pl += Math.abs(parseMonto(r[IDX_PLUS_START+(p*2)]));
                let db = 0; for(let d=0; d<3; d++) db += Math.abs(parseMonto(r[IDX_DEB_START+(d*2)]));
                let ag = Math.abs(parseMonto(r[IDX_AGUI])); let final = Math.abs(parseMonto(r[IDX_SUE]));
                let hs = r[IDX_HOR] || '-'; let ph = parseMonto(r[IDX_PH]); let fp = formatDateToAR(r[IDX_FP]) || '-';
                historyData.push({ year: parseInt(yStr), monthStr: mStr, monthIdx: MESES_NOMBRES.indexOf(mStr), hs, ph, sumAd, pl, db, ag, final, fp });
            }
        });
    });
    
    historyData.sort((a, b) => b.year !== a.year ? b.year - a.year : b.monthIdx - a.monthIdx);
    if (historyData.length === 0) { tbody.innerHTML = `<tr><td colspan="10" class="text-center">No hay registros para este trabajador.</td></tr>`; } 
    else {
        historyData.forEach(d => {
            tbody.innerHTML += `<tr><td><b>${d.monthStr}</b></td><td>${d.year}</td><td class="text-center">${d.hs}</td><td class="text-right">${formatArgentineCurrency(d.ph)}</td><td class="text-right">${d.sumAd > 0 ? "-"+formatArgentineCurrency(d.sumAd) : '-'}</td><td class="text-right">${d.pl > 0 ? "+"+formatArgentineCurrency(d.pl) : '-'}</td><td class="text-right">${d.db > 0 ? "-"+formatArgentineCurrency(d.db) : '-'}</td><td class="text-right">${d.ag > 0 ? "+"+formatArgentineCurrency(d.ag) : '-'}</td><td class="text-right" style="font-weight:700;">${formatArgentineCurrency(d.final)}</td><td>${d.fp}</td></tr>`;
        });
    }
    viewHist.classList.add("active");
}

window.renderSueldos = function() {
    populateWorkerHistory();
    const monthName = MESES_NOMBRES[parseInt(appState.sueldosMonth) - 1]; const yearStr = appState.sueldosYear; const tabName = `${monthName} ${yearStr}`;
    
    const toggleBtn = document.getElementById("toggle-sueldos-sidebar"); const sidebar = document.getElementById("sueldos-sidebar");
    if (toggleBtn && sidebar) { toggleBtn.onclick = () => sidebar.classList.toggle("collapsed"); }
    
    if(document.getElementById("btn-adelantos-add")) document.getElementById("btn-adelantos-add").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-adelantos-save")) document.getElementById("btn-adelantos-save").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-adelantos-cancel")) document.getElementById("btn-adelantos-cancel").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-adelantos-edit")) document.getElementById("btn-adelantos-edit").classList.toggle("hidden", appState.sueldosEditMode);
    
    if(document.getElementById("btn-liq-add-plus")) document.getElementById("btn-liq-add-plus").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-liq-add-debito")) document.getElementById("btn-liq-add-debito").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-liq-add-aguinaldo")) document.getElementById("btn-liq-add-aguinaldo").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-liq-save")) document.getElementById("btn-liq-save").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-liq-cancel")) document.getElementById("btn-liq-cancel").classList.toggle("hidden", !appState.sueldosEditMode);
    if(document.getElementById("btn-liq-edit")) document.getElementById("btn-liq-edit").classList.toggle("hidden", appState.sueldosEditMode);

    if (document.getElementById("view-historial-trabajador") && document.getElementById("view-historial-trabajador").classList.contains("active")) return;

    if (!appState.sueldos[tabName] && !appState.sueldosEditMode) {
        if(document.getElementById("liq-empty-state")) {
            document.getElementById("liq-empty-state").textContent = `Creando / Sincronizando el mes de ${tabName}...`;
            document.getElementById("liq-empty-state").classList.remove("hidden");
        }
        fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "SUELDO_GET_OR_CREATE_MONTH", data: { monthName: monthName, year: yearStr } }) }).then(() => fetchFinancialDataSilent());
        return;
    }

    let activeWorkers = appState.sueldos[tabName] ? [...appState.sueldos[tabName]] : [];
    activeWorkers.sort((a, b) => (a.rowData[IDX_NOM] || "").toString().toLowerCase().localeCompare((b.rowData[IDX_NOM] || "").toString().toLowerCase()));

    if (appState.sueldosEditMode) { let emptyRow = Array(TOTAL_COLS).fill(""); activeWorkers.push({ rowIndex: "NEW_NATURAL", rowData: emptyRow }); }

    // Determinar dinámicamente columnas visibles según uso de datos
    let maxPlusUsados = appState.sueldosShowPlus;
    let maxDebUsados = appState.sueldosShowDebito ? 3 : 1;
    activeWorkers.forEach(w => { 
        for(let i=0; i<8; i++) { if (parseMonto(w.rowData[IDX_PLUS_START + (i*2)]) > 0) maxPlusUsados = Math.max(maxPlusUsados, i + 1); } 
        for(let i=0; i<3; i++) { if (parseMonto(w.rowData[IDX_DEB_START + (i*2)]) > 0) maxDebUsados = Math.max(maxDebUsados, i + 1); }
    });

    if (appState.activeSueldosTab === "registro-sueldos") {
        const tbody = document.getElementById("sueldos-reg-tbody"); tbody.innerHTML = "";
        document.getElementById("sueldos-reg-empty").classList.toggle("hidden", activeWorkers.length === 0 || (activeWorkers.length === 1 && activeWorkers[0].rowIndex === "NEW_NATURAL"));
        activeWorkers.forEach(w => {
            if(w.rowIndex === "NEW_NATURAL") return; 
            const r = w.rowData; const valE = Math.abs(parseMonto(r[IDX_ME])); const valT = Math.abs(parseMonto(r[IDX_MT])); 
            let methodStr = "-"; if (valE > 0 && valT > 0) methodStr = `Efvo y Transf`; else if (valE > 0) methodStr = `Efectivo`; else if (valT > 0) methodStr = `Transferencia`;
            tbody.innerHTML += `<tr><td><b>${r[IDX_NOM] || "-"}</b></td><td class="text-right">${formatArgentineCurrency(parseMonto(r[IDX_SUE]))}</td><td>${formatDateToAR(r[IDX_FP])||'-'}</td><td>${methodStr}</td></tr>`;
        });
    }

    if (appState.activeSueldosTab === "adelantos") {
        const thead = document.getElementById("adelantos-thead"); const tbody = document.getElementById("adelantos-tbody"); const tfoot = document.getElementById("adelantos-tfoot");
        tbody.innerHTML = ""; tfoot.innerHTML = "";
        let cols = Math.max(1, Math.min(3, appState.sueldosVisibleAdelantos));
        let thHtml = `<tr><th>Nombre</th>`; for (let i = 0; i < cols; i++) thHtml += `<th class="text-right">Adelanto ${i+1}</th><th>Fecha</th>`;
        thHtml += `<th class="text-right">Total</th></tr>`; thead.innerHTML = thHtml;

        let grandTotal = 0;
        activeWorkers.forEach(w => {
            if(w.rowIndex === "NEW_NATURAL" && !appState.sueldosEditMode) return;
            const r = w.rowData; const tr = document.createElement("tr"); tr.setAttribute("data-row-index", w.rowIndex);
            let rowHtml = appState.sueldosEditMode ? `<td><input type="text" class="sueldos-minimal-input s-nom" value="${r[IDX_NOM] || ''}"></td>` : `<td><b>${r[IDX_NOM] || ''}</b></td>`;
            let rowTotal = 0;
            for (let i = 0; i < cols; i++) {
                let valM = Math.abs(parseMonto(r[IDX_AD_START+(i*2)])); rowTotal += valM;
                if (appState.sueldosEditMode) rowHtml += `<td><input type="number" step="0.01" class="sueldos-minimal-input s-ad-val ad-col-${i}" value="${valM || ''}" style="text-align:right;"></td><td><input type="text" class="sueldos-minimal-input s-ad-fec ad-fec-${i}" data-raw="${r[IDX_AD_START+1+(i*2)]||''}" value="${formatDateToAR(r[IDX_AD_START+1+(i*2)])}" placeholder="DD/MM/AA"></td>`;
                else rowHtml += `<td class="text-right">${formatArgentineCurrency(valM)}</td><td>${formatDateToAR(r[IDX_AD_START+1+(i*2)])||'-'}</td>`;
            }
            grandTotal += rowTotal; rowHtml += `<td class="text-right" id="row-tot-${w.rowIndex}">${formatArgentineCurrency(rowTotal)}</td>`; tr.innerHTML = rowHtml;
            if (appState.sueldosEditMode) { tr.querySelectorAll('.s-ad-val').forEach(inp => { inp.addEventListener('input', () => { let rt = 0; tr.querySelectorAll('.s-ad-val').forEach(ad => rt += (parseFloat(ad.value)||0)); tr.querySelector(`#row-tot-${w.rowIndex}`).textContent = formatArgentineCurrency(rt); }); }); }
            tbody.appendChild(tr);
        });
    }

    if (appState.activeSueldosTab === "liquidacion-sueldos") {
        const thead = document.getElementById("liq-thead"); const tbody = document.getElementById("liq-tbody"); tbody.innerHTML = "";
        let hasAdelantos = activeWorkers.some(w => { let tot=0; for(let a=0;a<3;a++) tot+=Math.abs(parseMonto(w.rowData[IDX_AD_START+(a*2)])); return tot > 0; });

        let thHtml = `<tr><th>Nombre</th><th class="text-center">Hs</th><th class="text-right">P/Hr</th>`;
        if (hasAdelantos || appState.sueldosEditMode) thHtml += `<th class="text-right">Adelantos</th>`;
        for(let i=0; i<maxPlusUsados; i++) thHtml += `<th class="text-right">Plus ${i+1}</th><th>Detalle ${i+1}</th>`;
        for(let i=0; i<maxDebUsados; i++) thHtml += `<th class="text-right">Débito ${i+1}</th><th>Detalle ${i+1}</th>`;
        if (appState.sueldosShowAguinaldo || activeWorkers.some(w => parseMonto(w.rowData[IDX_AGUI]) !== 0)) thHtml += `<th class="text-right">Aguinaldo</th>`;
        thHtml += `<th class="text-right">Sueldo Final</th><th class="text-center">Efectivo</th><th class="text-center">Transf.</th><th>F. Pago</th>`;
        if (appState.sueldosEditMode) thHtml += `<th class="text-center sticky-col">Acción</th>`;
        thHtml += `</tr>`; thead.innerHTML = thHtml;

        activeWorkers.forEach(w => {
            if(w.rowIndex === "NEW_NATURAL" && !appState.sueldosEditMode) return;
            const r = w.rowData; const tr = document.createElement("tr"); tr.setAttribute("data-row-index", w.rowIndex);
            let sumAd = 0; for(let a=0; a<3; a++) sumAd += Math.abs(parseMonto(r[IDX_AD_START+(a*2)]));
            
            if (appState.sueldosEditMode) {
                let rowH = `<td><input type="text" class="sueldos-minimal-input s-nom" value="${r[IDX_NOM]||''}" placeholder="..." style="min-width: 120px;"></td>`;
                rowH += `<td><input type="text" class="sueldos-minimal-input s-hor calc-trig" value="${r[IDX_HOR] || ''}" style="width:45px; text-align:center;"></td>`;
                rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input s-ph calc-trig" value="${parseMonto(r[IDX_PH]) || ''}" style="width:65px; text-align:right;"></td>`;
                if (hasAdelantos || appState.sueldosEditMode) rowH += `<td class="text-right"><span class="val-adelantos" data-val="${sumAd}">${sumAd > 0 ? '-$ '+sumAd.toFixed(2) : '-'}</span></td>`;
                
                for(let i=0; i<maxPlusUsados; i++) {
                    rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input calc-trig pl-m-${i}" value="${Math.abs(parseMonto(r[IDX_PLUS_START+(i*2)])) || ''}" style="width:65px; text-align:right;"></td><td><input type="text" class="sueldos-minimal-input pl-d-${i}" value="${r[IDX_PLUS_START+(i*2)+1] || ''}" style="min-width:90px;"></td>`;
                }
                for(let i=0; i<maxDebUsados; i++) {
                    rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input calc-trig db-m-${i}" value="${Math.abs(parseMonto(r[IDX_DEB_START+(i*2)])) || ''}" style="width:65px; text-align:right;"></td><td><input type="text" class="sueldos-minimal-input db-d-${i}" value="${r[IDX_DEB_START+(i*2)+1] || ''}" style="min-width:90px;"></td>`;
                }
                if (appState.sueldosShowAguinaldo || activeWorkers.some(w => parseMonto(w.rowData[IDX_AGUI]) !== 0)) {
                    rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input s-agui calc-trig" value="${Math.abs(parseMonto(r[IDX_AGUI])) || ''}" style="width:70px; text-align:right;"></td>`;
                }
                
                rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input s-sue" style="font-weight:bold; text-align:right; width:85px;" value="${Math.abs(parseMonto(r[IDX_SUE])) || ''}"></td>`;
                rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input s-me" value="${Math.abs(parseMonto(r[IDX_ME])) || ''}" style="width:70px; text-align:center;"></td>`;
                rowH += `<td><input type="number" step="0.01" class="sueldos-minimal-input s-mt" value="${Math.abs(parseMonto(r[IDX_MT])) || ''}" style="width:70px; text-align:center;"></td>`;
                rowH += `<td><input type="text" class="sueldos-minimal-input s-fp" data-raw="${r[IDX_FP] || ''}" value="${formatDateToAR(r[IDX_FP])}" placeholder="DD/MM/AA" style="width:80px;"></td>`;
                rowH += `<td class="action-buttons sticky-col">${w.rowIndex === "NEW_NATURAL" ? '<span>Nuevo</span>' : `<button class="action-btn" onclick="window.archiveWorker(this, ${w.rowIndex})">Borrar</button>`}</td>`;
                tr.innerHTML = rowH;
                
                // NUEVA LÓGICA MATEMÁTICA REAL-TIME (LOTE 37 COLUMNAS)
                const calcFinal = () => {
                    let h = parseFloat((tr.querySelector('.s-hor').value || "0").replace(',','.')) || 0;
                    let p = parseFloat(tr.querySelector('.s-ph').value) || 0;
                    let ad = parseFloat(tr.querySelector('.val-adelantos') ? tr.querySelector('.val-adelantos').getAttribute('data-val') : "0") || 0;
                    
                    let plTotal = 0; for(let i=0; i<maxPlusUsados; i++) { const inp = tr.querySelector(`.pl-m-${i}`); if(inp) plTotal += (parseFloat(inp.value) || 0); }
                    let dbTotal = 0; for(let i=0; i<maxDebUsados; i++) { const inp = tr.querySelector(`.db-m-${i}`); if(inp) dbTotal += (parseFloat(inp.value) || 0); }
                    let ag = tr.querySelector('.s-agui') ? (parseFloat(tr.querySelector('.s-agui').value) || 0) : 0;
                    
                    let final = (h * p) - ad + plTotal - dbTotal + ag;
                    tr.querySelector('.s-sue').value = final > 0 ? final.toFixed(2) : "";
                };
                tr.querySelectorAll('.calc-trig').forEach(i => i.addEventListener('input', calcFinal));
            } else {
                let rowH = `<td><b>${r[IDX_NOM] || '-'}</b></td><td class="text-center">${r[IDX_HOR] || '-'}</td><td class="text-right">${formatArgentineCurrency(parseMonto(r[IDX_PH]))}</td>`;
                if (hasAdelantos) rowH += `<td class="text-right">${sumAd > 0 ? formatArgentineCurrency(sumAd) : '-'}</td>`;
                for(let i=0; i<maxPlusUsados; i++) rowH += `<td class="text-right">${formatArgentineCurrency(parseMonto(r[IDX_PLUS_START+(i*2)]))}</td><td>${r[IDX_PLUS_START+(i*2)+1]||'-'}</td>`;
                for(let i=0; i<maxDebUsados; i++) rowH += `<td class="text-right">${formatArgentineCurrency(parseMonto(r[IDX_DEB_START+(i*2)]))}</td><td>${r[IDX_DEB_START+(i*2)+1]||'-'}</td>`;
                if (tr.innerHTML.includes('Aguinaldo') || activeWorkers.some(w => parseMonto(w.rowData[IDX_AGUI]) !== 0)) rowH += `<td class="text-right">${formatArgentineCurrency(parseMonto(r[IDX_AGUI]))}</td>`;
                rowH += `<td class="text-right" style="font-weight:700;">${formatArgentineCurrency(parseMonto(r[IDX_SUE]))}</td><td class="text-center">${formatArgentineCurrency(parseMonto(r[IDX_ME]))}</td><td class="text-center">${formatArgentineCurrency(parseMonto(r[IDX_MT]))}</td><td>${formatDateToAR(r[IDX_FP])||'-'}</td>`;
                tr.innerHTML = rowH;
            }
            tbody.appendChild(tr);
        });
    }
};

window.archiveWorker = function(btn, rowIndex) { 
    if(!confirm("¿Quitar trabajador de la liquidación de ESTE MES?")) return; 
    const monthName = MESES_NOMBRES[parseInt(appState.sueldosMonth) - 1]; const yearStr = appState.sueldosYear; const tabName = `${monthName} ${yearStr}`;
    let worker = appState.sueldos[tabName].find(w => w.rowIndex === rowIndex); if (!worker) return; 
    for (let i = 0; i < TOTAL_COLS; i++) worker.rowData[i] = ""; 
    fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "SUELDO_SAVE_BATCH", data: { year: yearStr, monthName: monthName, rows: [{rowIndex: rowIndex, rowData: worker.rowData}] } }) }).then(() => fetchFinancialDataSilent()); 
    btn.closest("tr").remove();
};

window.saveSueldos = async function() {
    const tab = appState.activeSueldosTab; const tbodyId = tab === "adelantos" ? "adelantos-tbody" : "liq-tbody"; const tbody = document.getElementById(tbodyId); if(!tbody) return;
    const monthName = MESES_NOMBRES[parseInt(appState.sueldosMonth) - 1]; const yearStr = appState.sueldosYear; const tabName = `${monthName} ${yearStr}`;
    let batchRows = []; const rows = tbody.querySelectorAll("tr"); 
    for (let tr of rows) { 
        let rowIndex = tr.getAttribute("data-row-index"); const isNaturalAdd = (rowIndex === "NEW_NATURAL"); if (isNaturalAdd) rowIndex = null; else rowIndex = parseInt(rowIndex); 
        let workerObj = null; if (rowIndex && appState.sueldos[tabName]) workerObj = appState.sueldos[tabName].find(w => w.rowIndex === rowIndex); 
        let finalRowData = workerObj ? [...workerObj.rowData] : Array(TOTAL_COLS).fill(""); 
        const getVal = (selector) => { const el = tr.querySelector(selector); return el ? el.value : ""; }; const nombreLeido = getVal('.s-nom');
        if (isNaturalAdd && nombreLeido.trim() === "") continue;

        if (tab === "adelantos") {
            finalRowData[IDX_NOM] = nombreLeido;
            for (let a = 0; a < 3; a++) {
                const inpVal = tr.querySelector(`.ad-col-${a}`); if (inpVal) finalRowData[IDX_AD_START + (a*2)] = inpVal.value;
                const inpFec = tr.querySelector(`.ad-fec-${a}`); if (inpFec) finalRowData[IDX_AD_START + 1 + (a*2)] = getValDate(`.ad-fec-${a}`, tr);
            }
        } else if (tab === "liquidacion-sueldos") {
            finalRowData[IDX_NOM] = nombreLeido; finalRowData[IDX_HOR] = getVal('.s-hor'); finalRowData[IDX_PH] = getVal('.s-ph'); 
            let pIdx = 0; while (tr.querySelector(`.pl-m-${pIdx}`)) { finalRowData[IDX_PLUS_START + (pIdx*2)] = getVal(`.pl-m-${pIdx}`); finalRowData[IDX_PLUS_START + (pIdx*2) + 1] = getVal(`.pl-d-${pIdx}`); pIdx++; }
            let dIdx = 0; while (tr.querySelector(`.db-m-${dIdx}`)) { finalRowData[IDX_DEB_START + (dIdx*2)] = getVal(`.db-m-${dIdx}`); finalRowData[IDX_DEB_START + (dIdx*2) + 1] = getVal(`.db-d-${dIdx}`); dIdx++; }
            if (tr.querySelector('.s-agui')) finalRowData[IDX_AGUI] = getVal('.s-agui');
            finalRowData[IDX_ME] = getVal('.s-me'); finalRowData[IDX_MT] = getVal('.s-mt'); finalRowData[IDX_FP] = getValDate('.s-fp', tr); 
            let finalSue = getVal('.s-sue'); if (finalSue !== "" && parseFloat(finalSue) > 0) finalRowData[IDX_SUE] = "-" + finalSue; else finalRowData[IDX_SUE] = finalSue;
        }
        batchRows.push({ rowIndex: rowIndex, rowData: finalRowData });
    }
    appState.sueldosEditMode = false; window.renderSueldos(); showToast("Guardando lote de datos...");
    try { await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "SUELDO_SAVE_BATCH", data: { year: yearStr, monthName: monthName, rows: batchRows } }) }); showToast("¡Guardado exitoso!"); fetchFinancialDataSilent(); } catch { showToast("Error al guardar."); fetchFinancialData(); }
};

// ==========================================
// SECCIÓN: BALANCES Y PROVEEDORES (COMPLETO)
// ==========================================
function setupAccordions(c) { c.querySelectorAll(".accordion-header").forEach(h => h.onclick = function() { const i = this.parentElement; const b = this.nextElementSibling; i.classList.toggle("open"); b.style.maxHeight = i.classList.contains("open") ? b.scrollHeight + "px" : null; }); }
function populateSidebarHistory() { const gList = document.getElementById("sidebar-gastos-list"); const iList = document.getElementById("sidebar-ingresos-list"); if (!gList || !iList) return; gList.innerHTML = ""; iList.innerHTML = ""; if (!appState.balances) return; Object.keys(appState.balances.gastos).forEach(sheet => { const btn = document.createElement("button"); btn.className = "history-btn"; btn.textContent = sheet; btn.onclick = () => openHistoryView(sheet, "gastos", btn); gList.appendChild(btn); }); const btnI = document.createElement("button"); btnI.className = "history-btn"; btnI.textContent = "Ingresos"; btnI.onclick = () => openHistoryView("Ingresos", "ingresos", btnI); iList.appendChild(btnI); }
function populateCuentasDropdown() { const select = document.getElementById("new-op-cuenta"); if (!select || !appState.balances) return; select.innerHTML = '<option value="">-- Seleccione una cuenta --</option>'; const optgroupI = document.createElement("optgroup"); optgroupI.label = "INGRESOS"; const optI = document.createElement("option"); optI.value = "Ingresos"; optI.textContent = "Ingresos"; optgroupI.appendChild(optI); select.appendChild(optgroupI); const optgroupG = document.createElement("optgroup"); optgroupG.label = "GASTOS"; Object.keys(appState.balances.gastos).forEach(s => { if(s === "Sueldos") return; const opt = document.createElement("option"); opt.value = s; opt.textContent = s; optgroupG.appendChild(opt); }); select.appendChild(optgroupG); }

function renderBalance() {
    if (!appState.balances) return; const pk = `${appState.selectedYear}-${appState.selectedMonth}`; let tg = 0; let ti = 0; let mc = 0; const gList = document.getElementById("gastos-list"); gList.innerHTML = "";
    Object.keys(appState.balances.gastos).forEach(s => {
        const pd = appState.balances.gastos[s]?.[pk]; if (!pd || pd.length === 0) return; let ct = 0; let rh = ""; const isSueldos = (s === "Sueldos");
        pd.forEach(m => { const a = Math.abs(m.monto); ct += a; mc++; if (isSueldos) rh += `<tr><td>${m.fecha}</td><td>${m.detalle||"-"}</td><td class="text-right">${formatArgentineCurrency(a)}</td></tr>`; else rh += `<tr><td>${m.fecha}</td><td>${m.detalle||"-"}</td><td>${m.operacion||"-"}</td><td class="text-right">${formatArgentineCurrency(a)}</td></tr>`; }); tg += ct;
        const theadHtml = isSueldos ? `<tr><th>Fecha</th><th>Detalle</th><th class="text-right">Monto</th></tr>` : `<tr><th>Fecha</th><th>Detalle</th><th>Operación</th><th class="text-right">Monto</th></tr>`;
        const ac = document.createElement("div"); ac.className = "accordion-item"; ac.innerHTML = `<div class="accordion-header"><div class="accordion-title-group"><span class="item-name">${s}</span></div><span class="item-val">${formatArgentineCurrency(ct)}</span></div><div class="accordion-body"><div class="accordion-content"><div class="table-responsive"><table class="detail-table"><thead>${theadHtml}</thead><tbody>${rh}</tbody><tfoot><tr class="table-total-row"><td colspan="${isSueldos ? '2' : '3'}" class="text-right">TOTAL</td><td class="text-right">${formatArgentineCurrency(ct)}</td></tr></tfoot></table></div></div></div>`; gList.appendChild(ac);
    });
    document.getElementById("total-gastos-value").textContent = formatArgentineCurrency(tg); setupAccordions(gList);
    const iList = document.getElementById("ingresos-list"); iList.innerHTML = ""; const id = appState.balances.ingresos["Ingresos"]?.[pk];
    if (id && id.length > 0) {
        let rh = ""; let ct = 0; id.forEach(m => { ti += m.monto; ct += m.monto; mc++; rh += `<tr><td>${m.fecha}</td><td>${m.detalle||"-"}</td><td>${m.operacion||"-"}</td><td class="text-right">${formatArgentineCurrency(m.monto)}</td></tr>`; });
        const ac = document.createElement("div"); ac.className = "accordion-item"; ac.innerHTML = `<div class="accordion-header"><span class="item-name">Ingresos</span><span class="item-val">${formatArgentineCurrency(ti)}</span></div><div class="accordion-body"><div class="accordion-content"><div class="table-responsive"><table class="detail-table"><thead><tr><th>Fecha</th><th>Detalle</th><th>Operación</th><th class="text-right">Monto</th></tr></thead><tbody>${rh}</tbody><tfoot><tr class="table-total-row"><td colspan="3" class="text-right">TOTAL</td><td class="text-right">${formatArgentineCurrency(ct)}</td></tr></tfoot></table></div></div></div>`; iList.appendChild(ac); setupAccordions(iList);
    }
    document.getElementById("total-ingresos-value").textContent = formatArgentineCurrency(ti); document.getElementById("empty-state").classList.toggle("hidden", mc > 0); document.getElementById("balance-content-wrapper").classList.toggle("hidden", mc === 0);
    const nb = ti - tg; document.getElementById("final-balance-value").textContent = formatFinalBalance(nb);
}

function renderAnnualSummary() { if (!appState.balances) return; const y = appState.selectedYear; let tg = 0; let ti = 0; Object.keys(appState.balances.gastos).forEach(s => { const sm = appState.balances.gastos[s]||{}; for (const p in sm) { if (p.startsWith(`${y}-`)) sm[p].forEach(m => tg += Math.abs(m.monto)); } }); const im = appState.balances.ingresos["Ingresos"]||{}; for (const p in im) { if (p.startsWith(`${y}-`)) im[p].forEach(m => ti += m.monto); } document.getElementById("annual-ingresos").textContent = formatArgentineCurrency(ti); document.getElementById("annual-gastos").textContent = formatArgentineCurrency(tg); const nb = ti - tg; document.getElementById("annual-balance").textContent = formatFinalBalance(nb); }

function openHistoryView(s, t, b) { if (!appState.balances) return; document.querySelectorAll(".menu-btn, .history-btn").forEach(btn => btn.classList.remove("active")); b.classList.add("active"); document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active")); document.getElementById("view-historial").classList.add("active"); document.getElementById("tab-subtitle").textContent = s; document.getElementById("historial-title").textContent = `Registros: ${s}`; appState.currentHistorySheet = s; appState.currentHistoryType = t; appState.historialEditMode = false; if(document.getElementById("btn-historial-save")) document.getElementById("btn-historial-save").classList.add("hidden"); if(document.getElementById("btn-historial-cancel")) document.getElementById("btn-historial-cancel").classList.add("hidden"); const theadTr = document.getElementById("historial-thead-tr"); if (s === "Sueldos") { if(document.getElementById("btn-historial-edit-mode")) document.getElementById("btn-historial-edit-mode").classList.add("hidden"); document.getElementById("carpetas-config-section").classList.add("hidden"); theadTr.innerHTML = `<th>Nombre</th><th class="text-right">Monto</th><th>Fecha de Pago</th><th>Mes</th><th>Método Pago</th><th class="text-right">Precio/Hora</th><th class="text-center">Horas</th>`; } else { if(document.getElementById("btn-historial-edit-mode")) document.getElementById("btn-historial-edit-mode").classList.remove("hidden"); renderCarpetasSection(s); let extraCol = appState.historialEditMode ? `<th class="text-center sticky-col">Acciones</th>` : `<th class="text-center">Comp. C</th><th class="text-center">Comp. P</th>`; theadTr.innerHTML = `<th>Fecha</th><th>Detalle</th><th class="text-right">Monto</th><th>Operación</th><th>IVA 21%</th><th>IVA 10.5%</th><th>IVA Cont.</th>${extraCol}`; } renderHistoryTable(); }
function toggleHistorialEditMode(isEdit) { appState.historialEditMode = isEdit; if(document.getElementById("btn-historial-edit-mode")) document.getElementById("btn-historial-edit-mode").classList.toggle("hidden", isEdit); if(document.getElementById("btn-historial-save")) document.getElementById("btn-historial-save").classList.toggle("hidden", !isEdit); if(document.getElementById("btn-historial-cancel")) document.getElementById("btn-historial-cancel").classList.toggle("hidden", !isEdit); renderHistoryTable(); }

function renderHistoryTable() { const tbody = document.getElementById("historial-tbody"); tbody.innerHTML = ""; let gt = 0; let fm = []; const s = appState.currentHistorySheet; const t = appState.currentHistoryType; if (!s || !appState.balances || !appState.balances[t] || !appState.balances[t][s]) { document.getElementById("historial-table").classList.add("hidden"); document.getElementById("historial-total-row").classList.add("hidden"); document.getElementById("historial-empty").classList.remove("hidden"); return; } const tm = appState.balances[t][s]; if (s !== "Sueldos") { const theadTr = document.getElementById("historial-thead-tr"); let extraCol = appState.historialEditMode ? `<th class="text-center sticky-col">Acciones</th>` : `<th class="text-center">Comp. C</th><th class="text-center">Comp. P</th>`; theadTr.innerHTML = `<th>Fecha</th><th>Detalle</th><th class="text-right">Monto</th><th>Operación</th><th>IVA 21%</th><th>IVA 10.5%</th><th>IVA Cont.</th>${extraCol}`; } for (const p in tm) { const [y, month] = p.split("-"); if (appState.historyYear !== "ALL" && appState.historyYear !== y) continue; if (appState.historyMonth !== "ALL" && appState.historyMonth !== month) continue; if (tm[p]) fm = fm.concat(tm[p]); } if (fm.length === 0) { document.getElementById("historial-table").classList.add("hidden"); document.getElementById("historial-total-row").classList.add("hidden"); document.getElementById("historial-empty").classList.remove("hidden"); } else { fm.forEach(m => { gt += Math.abs(m.monto); tbody.appendChild(createBalanceRowHTML(m)); }); document.getElementById("historial-table").classList.remove("hidden"); document.getElementById("historial-total-row").classList.remove("hidden"); document.getElementById("historial-empty").classList.add("hidden"); document.getElementById("historial-total-value").textContent = formatArgentineCurrency(gt); } }
function createBalanceRowHTML(m) { const s = appState.currentHistorySheet; const t = appState.currentHistoryType; const tr = document.createElement("tr"); tr.setAttribute("data-row-index", m.rowIndex || "NEW"); if (m.isVirtual) { tr.innerHTML = `<td>${m.detalle}</td><td class="text-right">${formatArgentineCurrency(m.monto)}</td><td>${m.fecha}</td><td>${m.mes}</td><td>${m.metodoPago}</td><td class="text-right">${m.precioHora === "-" ? "-" : formatArgentineCurrency(m.precioHora)}</td><td class="text-center">${m.horas}</td>`; return tr; } if (appState.historialEditMode) { tr.innerHTML = `<td><input type="text" class="edit-input i-fec" data-raw="${m.fecha||''}" value="${formatDateToAR(m.fecha)}"></td><td><input type="text" class="edit-input i-det" value="${m.detalle||''}"></td><td><input type="number" step="0.01" class="edit-input i-mon" value="${Math.abs(m.monto)||''}"></td><td><input type="text" class="edit-input i-ope" value="${m.operacion||''}"></td><td><input type="text" class="edit-input i-i21" value="${m.iva21||''}"></td><td><input type="text" class="edit-input i-i105" value="${m.iva105||''}"></td><td><input type="text" class="edit-input i-icon" value="${m.ivaCont||''}"></td><td class="action-buttons sticky-col"><button class="action-btn" onclick="deleteBalanceUI(this, ${m.rowIndex||'null'})">Borrar</button></td>`; } else { const compHTML_C = m.idComprobanteCompra ? `<a href="https://drive.google.com/file/d/${m.idComprobanteCompra}/view" target="_blank" class="action-btn">Ver</a>` : `<button class="action-btn" onclick="window.triggerUpload('${s}', ${m.rowIndex}, 'compra', '${t}')">Subir</button>`; const compHTML_P = m.idComprobantePago ? `<a href="https://drive.google.com/file/d/${m.idComprobantePago}/view" target="_blank" class="action-btn">Ver</a>` : `<button class="action-btn" onclick="window.triggerUpload('${s}', ${m.rowIndex}, 'pago', '${t}')">Subir</button>`; tr.innerHTML = `<td>${formatDateToAR(m.fecha)||'-'}</td><td>${m.detalle||'-'}</td><td class="text-right">${formatArgentineCurrency(t==='gastos'?Math.abs(m.monto):m.monto)}</td><td>${m.operacion||'-'}</td><td>${m.iva21||'-'}</td><td>${m.iva105||'-'}</td><td>${m.ivaCont||'-'}</td><td class="text-center">${compHTML_C}</td><td class="text-center">${compHTML_P}</td>`; } return tr; }
function renderCarpetasSection(s) { const sec = document.getElementById("carpetas-config-section"); if(sec) sec.classList.remove("hidden"); const c = appState.carpetas[s] || { idCuenta: "", idCompra: "", idPago: "" }; document.getElementById("view-id-cuenta").textContent = c.idCuenta||"-"; document.getElementById("view-id-compra").textContent = c.idCompra||"-"; document.getElementById("view-id-pago").textContent = c.idPago||"-"; document.getElementById("edit-id-cuenta").value = c.idCuenta; document.getElementById("edit-id-compra").value = c.idCompra; document.getElementById("edit-id-pago").value = c.idPago; }

// SUBPESTAÑA CONTACTOS OPTIMIZADA (Remoción de columna Nombre)
function toggleProveedoresEditMode(isEdit) { appState.proveedoresEditMode = isEdit; if(document.getElementById("btn-proveedores-edit-mode")) document.getElementById("btn-proveedores-edit-mode").classList.toggle("hidden", isEdit); if(document.getElementById("btn-proveedores-save")) document.getElementById("btn-proveedores-save").classList.toggle("hidden", !isEdit); if(document.getElementById("btn-proveedores-cancel")) document.getElementById("btn-proveedores-cancel").classList.toggle("hidden", !isEdit); if(document.getElementById("btn-proveedores-add")) document.getElementById("btn-proveedores-add").classList.toggle("hidden", !isEdit); renderProveedores(); }
function renderProveedores() {
    const thead = document.querySelector("#proveedores-table thead"); const tbody = document.getElementById("proveedores-tbody"); if(!thead || !tbody) return;
    const cGen = appState.activeProvTab === 'gen' ? '' : 'hidden'; const cBan = appState.activeProvTab === 'ban' ? '' : 'hidden'; const cCon = appState.activeProvTab === 'con' ? '' : 'hidden';
    let thHtml = `<tr><th>Proveedor</th>`; if (appState.activeProvTab !== 'con') thHtml += `<th>Nombre</th>`;
    thHtml += `<th class="col-prov-gen ${cGen}">Dirección</th><th class="col-prov-ban ${cBan}">Banco</th><th class="col-prov-ban ${cBan}">Alias</th><th class="col-prov-ban ${cBan}">CBU</th><th class="col-prov-con ${cCon}">Teléfono</th><th class="col-prov-con ${cCon}">Mail</th><th class="text-center col-prov-con ${cCon}">Web</th>`;
    if (appState.proveedoresEditMode) thHtml += `<th class="text-center sticky-col">Acciones</th>`; thHtml += `</tr>`; thead.innerHTML = thHtml; tbody.innerHTML = ""; appState.proveedores.forEach(prov => tbody.appendChild(createProvRowHTML(prov)));
}
function createProvRowHTML(prov) {
    const tr = document.createElement("tr"); tr.setAttribute("data-row-index", prov.rowIndex || "NEW"); const cGen = appState.activeProvTab === 'gen' ? '' : 'hidden'; const cBan = appState.activeProvTab === 'ban' ? '' : 'hidden'; const cCon = appState.activeProvTab === 'con' ? '' : 'hidden';
    if (appState.proveedoresEditMode) { tr.innerHTML = `<td><input type="text" class="edit-input i-prov" value="${prov.proveedor || ''}"></td>` + (appState.activeProvTab !== 'con' ? `<td><input type="text" class="edit-input i-nom" value="${prov.nombre || ''}"></td>` : '') + `<td class="col-prov-gen ${cGen}"><input type="text" class="edit-input i-dir" value="${prov.direccion || ''}"></td><td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-ban" value="${prov.banco || ''}"></td><td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-ali" value="${prov.alias || ''}"></td><td class="col-prov-ban ${cBan}"><input type="text" class="edit-input i-cbu" value="${prov.cbu || ''}"></td><td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-tel" value="${prov.telefono || ''}"></td><td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-mail" value="${prov.mail || ''}"></td><td class="col-prov-con ${cCon}"><input type="text" class="edit-input i-web" value="${prov.web || ''}"></td><td class="action-buttons sticky-col"><button class="action-btn" onclick="deleteProveedorUI(this, ${prov.rowIndex || 'null'})">Borrar</button></td>`; } 
    else { const btnWeb = prov.web ? `<button class="action-btn" onclick="openWebModal(${prov.rowIndex})">Ver Web</button>` : '-'; tr.innerHTML = `<td>${prov.proveedor || '-'}</td>` + (appState.activeProvTab !== 'con' ? `<td>${prov.nombre || '-'}</td>` : '') + `<td class="col-prov-gen ${cGen}">${prov.direccion || '-'}</td><td class="col-prov-ban ${cBan}">${prov.banco || '-'}</td><td class="col-prov-ban ${cBan}">${prov.alias || '-'}</td><td class="col-prov-ban ${cBan}">${prov.cbu || '-'}</td><td class="col-prov-con ${cCon}">${prov.telefono || '-'}</td><td class="col-prov-con ${cCon}">${prov.mail || '-'}</td><td class="text-center col-prov-con ${cCon}">${btnWeb}</td>`; } return tr;
}

// MODAL WEB MEJORADO: ENLACES COMPLETOS Y BOTONES INDIVIDUALES
function setupWebModalHandlers() {
    if(document.getElementById('btn-modal-close')) document.getElementById('btn-modal-close').onclick = () => document.getElementById('web-modal').classList.add('hidden');
}
window.openWebModal = function(rowIndex) {
    appState.activeProvRowIndex = rowIndex; const prov = appState.proveedores.find(p => p.rowIndex === rowIndex); if(!prov) return;
    document.getElementById('modal-prov-name').textContent = prov.nombre || prov.proveedor || "Proveedor";
    const container = document.getElementById('modal-web-container'); container.innerHTML = "";
    if(prov.web && prov.web.trim() !== "") {
        prov.web.split(";").forEach(urlStr => {
            let cleanUrl = urlStr.trim(); if(!cleanUrl) return;
            let targetUrl = cleanUrl.startsWith('http') ? cleanUrl : 'https://' + cleanUrl;
            let div = document.createElement("div"); div.style.display = "flex"; div.style.justifyContent = "space-between"; div.style.alignItems = "center"; div.style.marginBottom = "10px"; div.style.gap = "10px";
            let span = document.createElement("span"); span.style.wordBreak = "break-all"; span.style.fontSize = "9.5pt"; span.textContent = cleanUrl;
            let btn = document.createElement("button"); btn.className = "action-btn"; btn.textContent = "Abrir Link"; btn.onclick = () => window.open(targetUrl, '_blank');
            div.appendChild(span); div.appendChild(btn); container.appendChild(div);
        });
    } else { container.innerHTML = `<p style="font-size:9.5pt; opacity:0.5;">No hay páginas web registradas para este proveedor.</p>`; }
    document.getElementById('web-modal').classList.remove('hidden');
};
