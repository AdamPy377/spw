// --- Native time inputs ---------------------------------------------------
function snapTimeInput(input, stepMinutes) {
    if (!input?.value) return;
    const raw = mins(input.value);
    if (raw == null) return;
    const snapped = Math.round(raw / stepMinutes) * stepMinutes % 1440;
    input.value = `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
}

// --- Cash management ------------------------------------------------------
const CASH_DRAWER_DEFS = [
    { id: "front_counter", label: "Front Counter Drawer", required: true },
    { id: "drive_thru", label: "Drive Thru Drawer", required: true },
    { id: "drive_thru_present", label: "Drive Thru Present Drawer", required: false },
];
const SAFE_DENOMINATIONS = ["Loose coin", "5c", "10c", "20c", "50c", "$1", "$2", "$5", "$10", "$20", "$50", "$100"];
const DRAWER_FLOAT = 200;
const SAFE_DRAWER_FLOAT_TOTAL = 800;
const PHYSICAL_SAFE_TARGET = 1700;
const SAFE_TOTAL_TARGET = 2500;
function normaliseCash(cash = {}) {
    const drawers = cash.drawers && typeof cash.drawers === "object" ? cash.drawers : {};
    CASH_DRAWER_DEFS.forEach((d) => {
        drawers[d.id] = drawers[d.id] || {};
        drawers[d.id].enabled = d.required ? true : !!drawers[d.id].enabled;
        drawers[d.id].counts = Array.isArray(drawers[d.id].counts) ? drawers[d.id].counts : [];
    });
    const safe = cash.safe && typeof cash.safe === "object" ? cash.safe : {};
    safe.denominations = safe.denominations && typeof safe.denominations === "object" ? safe.denominations : {};
    SAFE_DENOMINATIONS.forEach((d) => { if (safe.denominations[d] == null) safe.denominations[d] = ""; });
    safe.history = Array.isArray(safe.history) ? safe.history : [];
    return { drawers, safe, notes: cash.notes || "" };
}
function latestDrawerCount(id, spw = currentSpw) {
    const counts = normaliseCash(spw?.cash).drawers[id]?.counts || [];
    return counts[counts.length - 1] || null;
}
function drawerDepositTotal(id, spw = currentSpw) {
    return (normaliseCash(spw?.cash).drawers[id]?.counts || []).reduce((sum, count) => sum + cashNumber(count.deposit), 0);
}
function cashNumber(v) { const n = Number.parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function formatMoney(v) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cashNumber(v)); }
function safePhysicalTotal(spw = currentSpw) { return SAFE_DENOMINATIONS.reduce((sum, d) => sum + cashNumber(normaliseCash(spw?.cash).safe.denominations[d]), 0); }

function cashShiftEnd(spw = currentSpw) {
    if (!spw?.shift_date || !spw?.shift_type) return null;
    const start = shiftSlotStart({ date: spw.shift_date, type: spw.shift_type });
    return new Date(start.getTime() + 8 * 60 * 60000);
}
function cashDueState(spw = currentSpw) {
    const end = cashShiftEnd(spw);
    if (!end) return { due: false, overdue: false, minutesToEnd: null };
    const minutesToEnd = Math.ceil((end.getTime() - Date.now()) / 60000);
    return {
        due: minutesToEnd <= 60 && minutesToEnd >= 0,
        overdue: minutesToEnd < 0,
        minutesToEnd,
        end,
    };
}
function cashCompletionStatus(spw = currentSpw) {
    if (!spw) return { complete: false, hasVariance: false, totalVariance: 0 };
    const cash = normaliseCash(spw.cash);
    const active = CASH_DRAWER_DEFS.filter((d) => d.required || cash.drawers[d.id].enabled);
    const drawerCountsComplete = active.every((d) => !!latestDrawerCount(d.id, spw));
    const safeComplete = !!cash.safe.counted_at;
    const drawerVariance = active.reduce((sum, d) => sum + (latestDrawerCount(d.id, spw)?.variance || 0), 0);
    const safeVariance = safeComplete ? safePhysicalTotal(spw) - PHYSICAL_SAFE_TARGET : 0;
    const totalVariance = drawerVariance + safeVariance;
    return { complete: drawerCountsComplete && safeComplete, hasVariance: Math.abs(totalVariance) >= 0.005, totalVariance, drawerCountsComplete, safeComplete };
}
function cashCriticalCard() {
    if (!currentSpw) return "";
    const st = cashCompletionStatus(), due = cashDueState();
    const timing = due.overdue ? "Overdue" : due.due ? `Due now · ${Math.max(0, due.minutesToEnd)}m to shift end` : due.minutesToEnd != null ? `Due in final hour · ${Math.max(0, due.minutesToEnd - 60)}m until due` : "Due in final hour";
    const statusClass = st.complete ? (st.hasVariance ? "warn" : "ok") : (due.due || due.overdue ? "bad" : "info");
    const statusText = st.complete ? (st.hasVariance ? `Variance ${formatMoney(st.totalVariance)}` : "Complete") : timing;
    return `<div class="card cash-critical ${st.complete ? "complete" : due.due || due.overdue ? "outstanding" : "not-due"}"><div class="cash-critical-copy"><span class="task-category">Critical · End of shift</span><h2>Cash Management</h2><div class="small muted">Drawer closeout and safe count become due during the final hour of the shift.</div></div><div><span class="pill ${statusClass}">${statusText}</span><button class="btn primary sm" onclick="showPage('cash')">${st.complete ? "Review" : due.due || due.overdue ? "Complete now" : "Open"}</button></div></div>`;
}
function cashDrawerCard(def) {
    const cash = normaliseCash(currentSpw.cash);
    const drawer = cash.drawers[def.id];
    if (!def.required && !drawer.enabled) return `<div class="card cash-drawer optional"><h2>${esc(def.label)}</h2><div class="small muted">Optional drawer.</div><button class="btn" onclick="setDrawerEnabled('${def.id}',true)">Add drawer count</button></div>`;
    const latest = latestDrawerCount(def.id), history = drawer.counts || [], deposited = drawerDepositTotal(def.id);
    return `<div class="card cash-drawer"><div class="cash-head"><div><h2>${esc(def.label)}</h2><div class="small muted">Each entry is a new drawer cycle. Keep ${formatMoney(DRAWER_FLOAT)} as the float; only the excess from each count is added to the deposit.</div></div>${!def.required ? `<button class="btn sm" onclick="setDrawerEnabled('${def.id}',false)">Remove</button>` : ""}</div>${latest ? `<div class="cash-summary"><div><span>Latest count</span><strong>${formatMoney(latest.total)}</strong></div><div><span>Latest deposit</span><strong>${formatMoney(latest.deposit)}</strong></div><div><span>Total deposited</span><strong>${formatMoney(deposited)}</strong></div></div>` : '<div class="alert bad"><div>Not counted yet.</div></div>'}<div class="row"><div class="field"><label>${latest ? "Next drawer count" : "Drawer total cash"}</label><input id="drawer-${def.id}" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div><button class="btn primary" onclick="saveDrawerCount('${def.id}')">${latest ? "Save additional count" : "Save count"}</button></div>${history.length ? `<details class="result-advanced" ${history.length > 1 ? "open" : ""}><summary>Drawer counts (${history.length})</summary>${history.slice().reverse().map((h, i) => `<div class="cash-history"><span>${esc(fmtDateTime(h.at))}</span><span>${formatMoney(h.total)}</span><span>Deposit ${formatMoney(h.deposit)}</span><span>${i === 0 ? `Running ${formatMoney(deposited)}` : ""}</span></div>`).join("")}</details>` : ""}</div>`;
}

function renderCashManagement() {
    const el = $("page-cash");
    if (!currentSpw) { el.innerHTML = pageHero("Cash Management") + buildPicker(); return; }
    currentSpw.cash = normaliseCash(currentSpw.cash);
    const physical = safePhysicalTotal();
    const status = cashCompletionStatus();
    el.innerHTML = pageHero("Cash Management", "Drawer closeout and safe count · due in the final hour of the shift") + cashCriticalCard() +
        `<div class="cash-overview"><div class="metric"><div class="n">${formatMoney(CASH_DRAWER_DEFS.filter((d) => d.required || currentSpw.cash.drawers[d.id].enabled).reduce((s,d) => s + drawerDepositTotal(d.id),0))}</div><div class="l">Deposit from counted drawers</div></div><div class="metric"><div class="n">${formatMoney(physical)}</div><div class="l">Physical safe counted</div></div><div class="metric"><div class="n">${formatMoney(SAFE_TOTAL_TARGET)}</div><div class="l">Safe accountability target</div></div></div>` +
        `<div class="section-title">Drawer counts</div>${CASH_DRAWER_DEFS.map(cashDrawerCard).join("")}` +
        `<div class="card"><div class="cash-head"><div><h2>Safe Count</h2><div class="small muted">Physical safe target ${formatMoney(PHYSICAL_SAFE_TARGET)}. Together with four ${formatMoney(DRAWER_FLOAT)} drawer floats (${formatMoney(SAFE_DRAWER_FLOAT_TOTAL)}), total accountability is ${formatMoney(SAFE_TOTAL_TARGET)}.</div></div><span class="pill ${currentSpw.cash.safe.counted_at ? (Math.abs(physical-PHYSICAL_SAFE_TARGET)>.004 ? "warn" : "ok") : "bad"}">${currentSpw.cash.safe.counted_at ? `Counted · ${formatMoney(physical-PHYSICAL_SAFE_TARGET)} variance` : "Outstanding"}</span></div><div class="safe-grid">${SAFE_DENOMINATIONS.map((d) => `<div class="field"><label>${esc(d)} amount ($)</label><input class="safe-denom" data-denom="${esc(d)}" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(currentSpw.cash.safe.denominations[d] || "")}" oninput="previewSafeTotal()"></div>`).join("")}</div><div class="cash-safe-total"><span>Physical safe total</span><strong id="safe-total">${formatMoney(physical)}</strong><span id="safe-variance" class="${Math.abs(physical-PHYSICAL_SAFE_TARGET)>.004 ? "warning-text" : ""}">Variance ${formatMoney(physical-PHYSICAL_SAFE_TARGET)}</span></div><div class="row"><button class="btn primary" onclick="saveSafeCount()">${currentSpw.cash.safe.counted_at ? "Save recount" : "Save safe count"}</button></div></div>` +
        `<div class="card"><h2>Cash notes</h2><textarea oninput="currentSpw.cash.notes=this.value;scheduleSave()" placeholder="Cash issue, recount reason, safe discrepancy…">${esc(currentSpw.cash.notes || "")}</textarea></div>`;
}
async function setDrawerEnabled(id, enabled) { currentSpw.cash = normaliseCash(currentSpw.cash); currentSpw.cash.drawers[id].enabled = enabled; await saveSpw(true); renderCashManagement(); }
async function saveDrawerCount(id) {
    const input = $(`drawer-${id}`);
    if (!input || input.value === "") return toast("Enter the drawer total");
    const total = cashNumber(input.value);
    const deposit = Math.max(0, total - DRAWER_FLOAT);
    const variance = total - DRAWER_FLOAT - deposit;
    currentSpw.cash = normaliseCash(currentSpw.cash);
    currentSpw.cash.drawers[id].counts.push({ total, deposit, variance, at: new Date().toISOString() });
    await saveSpw(true);
    toast(currentSpw.cash.drawers[id].counts.length > 1 ? "Additional drawer count saved" : "Drawer count saved");
    renderCashManagement();
}
function previewSafeTotal() {
    const vals = {}; document.querySelectorAll(".safe-denom").forEach((el) => vals[el.dataset.denom] = el.value);
    const total = SAFE_DENOMINATIONS.reduce((s,d) => s + cashNumber(vals[d]), 0);
    if ($("safe-total")) $("safe-total").textContent = formatMoney(total);
    if ($("safe-variance")) { $("safe-variance").textContent = `Variance ${formatMoney(total-PHYSICAL_SAFE_TARGET)}`; $("safe-variance").classList.toggle("warning-text", Math.abs(total-PHYSICAL_SAFE_TARGET)>.004); }
}
async function saveSafeCount() {
    currentSpw.cash = normaliseCash(currentSpw.cash);
    const previous = { ...currentSpw.cash.safe.denominations };
    const values = {}; document.querySelectorAll(".safe-denom").forEach((el) => values[el.dataset.denom] = el.value);
    if (currentSpw.cash.safe.counted_at) currentSpw.cash.safe.history.push({ denominations: previous, total: safePhysicalTotal(), at: currentSpw.cash.safe.counted_at });
    currentSpw.cash.safe.denominations = values;
    currentSpw.cash.safe.counted_at = new Date().toISOString();
    await saveSpw(true);
    toast(currentSpw.cash.safe.history.length ? "Safe recount saved" : "Safe count saved");
    renderCashManagement();
}

