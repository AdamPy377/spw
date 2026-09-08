			function ensureResults(spw = currentSpw) {
				spw.results = spw.results || {};
				spw.results.hourly =
					spw.results.hourly || spw.hours.map(() => ({}));
				while (spw.results.hourly.length < spw.hours.length)
					spw.results.hourly.push({});
				spw.results.hourly.forEach((row) => {
					if (
						(row.oepe_seconds == null || row.oepe_seconds === "") &&
						row.dt_time != null &&
						row.dt_time !== ""
					)
						row.oepe_seconds = row.dt_time;
				});
				return spw.results;
			}
			function resultCompletion(row, i) {
				let n =
					String(currentSpw?.actual?.[i] ?? "").trim() !== "" ? 1 : 0;
				for (let k of ["oepe_pct", "oepe_seconds"])
					if (String(row?.[k] ?? "").trim() !== "") n++;
				return n;
			}
			function updateResultField(i, key, value) {
				let r = ensureResults();
				r.hourly[i] = r.hourly[i] || {};
				r.hourly[i][key] = value;
				if (key === "sales") currentSpw.actual[i] = value;
				scheduleSave();
				let el = $(`hour-complete-${i}`);
				if (el)
					el.textContent = `${resultCompletion(r.hourly[i], i)}/3 key metrics entered`;
			}
			function shiftScore(spw = currentSpw) {
				if (!spw) return { total: 0, parts: {} };
				let st = hourlyStaffing(spw),
					withSales = st.filter((x) => x.sales > 0),
					spch = withSales.length
						? Math.min(
								100,
								Math.round(
									(withSales.filter((x) => x.spch >= 145)
										.length /
										withSales.length) *
										100,
								),
							)
						: 70;
				let breaks = [];
				for (let c of spw.crew)
					for (let [f, t] of [
						["meal_sent", "meal_time"],
						["rest1_sent", "rest1_time"],
						["rest2_sent", "rest2_time"],
					])
						if (c[t])
							breaks.push({
								done: !!c[f],
								plan: c[t],
								at: c[f + "_at"],
								c,
							});
				let breakPct = breaks.length
					? Math.round(
							(breaks.filter((b) => b.done).length /
								breaks.length) *
								100,
						)
					: 100;
				let tasks = taskStore(),
					allTasks = [...defaultShiftTasks(), ...tasks.custom],
					taskPct = allTasks.length
						? Math.round(
								(allTasks.filter((t) => tasks.items[t.id]?.done)
									.length /
									allTasks.length) *
									100,
							)
						: 100;
				let fs = FOOD_SAFETY_DEFS[spw.shift_type] || [],
					fsPct = fs.length
						? Math.round(
								(fs.filter((x) => fsState(x.id).done).length /
									fs.length) *
									100,
							)
						: 100;
				let areas = AREA_DEFS.filter((a) =>
						spw.crew.some((c) => c.area === a.key),
					),
					cov = areas.length
						? Math.round(
								areas.reduce(
									(sum, a) =>
										sum + areaCoverage(a.key, spw).score,
									0,
								) / areas.length,
							)
						: 70;
				let total = Math.round(
					spch * 0.25 +
						breakPct * 0.2 +
						taskPct * 0.15 +
						fsPct * 0.15 +
						cov * 0.25,
				);
				return {
					total,
					parts: {
						spch,
						breaks: breakPct,
						tasks: taskPct,
						food: fsPct,
						coverage: cov,
					},
				};
			}
			function resultsSummaryCard(value, label) {
				return `<div class="results-summary-card"><div class="results-summary-value">${value}</div><div class="results-summary-label">${esc(label)}</div><div class="results-summary-scale">out of 100</div></div>`;
			}
			function renderResults() {
				let el = $("page-results");
				if (!currentSpw) {
					el.innerHTML =
						pageHero("Shift Results", "Load a shift first") +
						buildPicker();
					return;
				}
				let res = ensureResults(),
					score = shiftScore();
				resultsHourIndex = Math.max(
					0,
					Math.min(resultsHourIndex, currentSpw.hours.length - 1),
				);
				el.innerHTML =
					pageHero(
						"Shift Results",
						"Hourly sales and service results",
					) +
					`<div class="results-summary">${resultsSummaryCard(score.total, "Shift Score")}${resultsSummaryCard(score.parts.coverage, "Coverage")}${resultsSummaryCard(score.parts.breaks, "Break Completion")}${resultsSummaryCard(score.parts.tasks, "Task Completion")}</div>` +
					`<div class="card score-breakdown"><h2>Score breakdown</h2><div class="small muted">25% staffing/SPCH · 25% position coverage · 20% breaks · 15% shift tasks · 15% food safety. Hourly OEPE/KVS metrics are recorded here but are not yet included in the score.</div></div>` +
					spwHourResultCard(res, resultsHourIndex);
			}
			function changeResultsHour(delta) {
				if (!currentSpw) return;
				resultsHourIndex = Math.max(
					0,
					Math.min(
						currentSpw.hours.length - 1,
						resultsHourIndex + delta,
					),
				);
				let holder = $("results-hour-holder");
				if (holder)
					holder.outerHTML = spwHourResultCard(
						ensureResults(),
						resultsHourIndex,
					);
			}
			function spwHourResultCard(res, i) {
				let row = res.hourly[i] || {},
					cur = currentHourIndex(),
					current = i === cur,
					h = currentSpw.hours[i];
				let extras = RESULT_FIELDS.slice(2);
				return `<div id="results-hour-holder" class="results-carousel"><div class="results-hour ${current ? "current" : ""}" id="result-hour-${i}">
 <div class="hour-head"><div><div class="results-step">Hour ${i + 1} of ${currentSpw.hours.length}</div><h3>${esc(h)}</h3></div>${current ? '<span class="current-pill">CURRENT HOUR</span>' : ""}<span class="hour-complete" id="hour-complete-${i}">${resultCompletion(row, i)}/3 key metrics entered</span></div>
 <div class="result-grid result-key-grid">
  <div class="result-field result-primary"><label>Actual Sales</label><input inputmode="decimal" value="${esc(currentSpw.actual[i] || "")}" oninput="updateResultField(${i},'sales',this.value)"></div>
  <div class="result-field result-primary"><label>OEPE %</label><input inputmode="decimal" value="${esc(row.oepe_pct || "")}" oninput="updateResultField(${i},'oepe_pct',this.value)"></div>
  <div class="result-field result-primary"><label>OEPE (Seconds)</label><input inputmode="decimal" value="${esc(row.oepe_seconds || "")}" oninput="updateResultField(${i},'oepe_seconds',this.value)"></div>
 </div>
 <details class="result-advanced"><summary>Extra results</summary><div class="result-grid result-extra-grid" style="margin-top:8px">${extras.map(([k, l]) => `<div class="result-field"><label>${esc(l)}</label><input inputmode="decimal" value="${esc(row[k] || "")}" oninput="updateResultField(${i},'${k}',this.value)"></div>`).join("")}</div></details>
 </div>
 <div class="results-nav"><button class="btn dark results-arrow" onclick="changeResultsHour(-1)" ${i === 0 ? "disabled" : ""} aria-label="Previous hour">← Previous</button><div class="results-nav-centre"><strong>${i + 1} / ${currentSpw.hours.length}</strong><span>${esc(h)}</span></div><button class="btn primary results-arrow" onclick="changeResultsHour(1)" ${i === currentSpw.hours.length - 1 ? "disabled" : ""} aria-label="Next hour">Next →</button></div></div>`;
			}

			function renderStaffing() {
				let el = $("page-staffing");
				if (!currentSpw) {
					el.innerHTML =
						pageHero("Staffing & Coverage") + buildPicker();
					return;
				}
				let st = hourlyStaffing(currentSpw),
					total = currentSpw.crew.length,
					positioned = currentSpw.crew.filter(
						(c) => c.station,
					).length,
					avg = st.length
						? st.reduce((a, b) => a + b.count, 0) / st.length
						: 0,
					peak = Math.max(0, ...st.map((x) => x.count));
				el.innerHTML =
					pageHero(
						"Staffing & Coverage",
						"Crew coverage, position strength and SPCH",
					) +
					`<div class="dashboard-grid"><div class="metric"><div class="n">${total}</div><div class="l">Crew on SPW</div></div><div class="metric"><div class="n">${positioned}</div><div class="l">Positioned</div></div><div class="metric"><div class="n">${avg.toFixed(1)}</div><div class="l">Average paid crew hrs</div></div><div class="metric"><div class="n">${peak}</div><div class="l">Peak paid crew hrs</div></div></div><div class="card"><h2>Position coverage health</h2><div class="dashboard-grid">${AREA_DEFS.map(
						(a) => {
							let c = areaCoverage(a.key);
							return `<div class="metric"><div class="n">${c.score}</div><div class="l">${a.key} · ${c.state}</div></div>`;
						},
					).join(
						"",
					)}</div></div><div class="card"><h2>Sales / Crew Hours / SPCH</h2>${salesTable(currentSpw, false)}</div><div class="card"><h2>Actionable alerts</h2><div class="alerts">${renderAlerts(20)}</div></div>`;
			}
function renderPage(page, token = navRenderToken) {
    if (page === "current") return renderCurrent(token);
    if (page === "build") return renderBuild();
    if (page === "breaks") return renderBreakDashboard();
    if (page === "food") return renderFoodSafety();
    if (page === "tasks") return renderShiftTasks();
    if (page === "cash") return renderCashManagement();
    if (page === "staffing") return renderStaffing();
    if (page === "results") return renderResults();
    if (page === "skills") return renderSkills();
    if (page === "handover") return renderHandover();
    if (page === "history") return renderHistory();
}
