function normaliseLoadedSpw(spw, type) {
    if (!spw) return spw;
    if (!spw.hours?.length) spw.hours = projectionTimes(type || spw.shift_type);
    if (!spw.projected?.length) spw.projected = spw.hours.map(() => "");
    if (!spw.actual?.length) spw.actual = spw.hours.map(() => "");
    spw.goals = spw.goals || {};
    spw.area_leaders = spw.area_leaders || {};
    spw.crew = spw.crew || [];
    spw.crew.forEach((c) => {
        c.station = normalisePosition(c.area, c.station);
        c.assignments = Array.isArray(c.assignments) ? c.assignments : [];
    });
    spw.food_safety = spw.food_safety || {};
    spw.tasks = spw.tasks || {};
    spw.results = spw.results || {};
    spw.cash = normaliseCash(spw.cash);
    return spw;
}
			async function loadSpw(date, type, ensure = false) {
				if (ensure)
					await api("/api/spw/ensure", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							shift_date: date,
							shift_type: type,
						}),
					});
				currentSpw = normaliseLoadedSpw(
					await api(
						`/api/spw?date=${date}&shift_type=${encodeURIComponent(type)}`,
					),
					type,
				);
				return currentSpw;
			}
			function setAutosave(text, state = "") {
				let el = $("autosave");
				if (!el) return;
				el.textContent = text;
				el.className = "autosave " + state;
			}
function spwPayload(spw = currentSpw) {
    if (!spw) return {};
    return {
        shift_manager: spw.shift_manager || "",
        safety_champion: spw.safety_champion || "",
        hours: spw.hours || [],
        projected: spw.projected || [],
        actual: spw.actual || [],
        goals: spw.goals || {},
        area_leaders: spw.area_leaders || {},
        notes: spw.notes || "",
        handover: spw.handover || "",
        food_safety: spw.food_safety || {},
        tasks: spw.tasks || {},
        results: spw.results || {},
        cash: normaliseCash(spw.cash),
    };
}
			function scheduleSave() {
				if (!currentSpw) return;
				setAutosave("Unsaved…");
				clearTimeout(autosaveTimer);
				autosaveTimer = setTimeout(() => saveSpw(), 500);
			}
			function syncHeaderFromDom() {
				if (!$("manager")) return;
				currentSpw.shift_manager = $("manager").value;
				currentSpw.notes = $("notes")?.value || currentSpw.notes;
			}
			function salesValueForHour(spw, i) {
				let actualRaw = spw?.actual?.[i],
					hasActual =
						actualRaw !== "" &&
						actualRaw != null &&
						!Number.isNaN(
							parseFloat(
								String(actualRaw).replace(/[^0-9.-]/g, ""),
							),
						);
				return hasActual ? num(actualRaw) : num(spw?.projected?.[i]);
			}
			function salesAtAbsoluteMinute(absMinute, spw = currentSpw) {
				if (!spw?.hours?.length) return 0;
				let hs = hourStarts(spw);
				while (absMinute < hs[0]) absMinute += 1440;
				let i = Math.floor((absMinute - hs[0]) / 60);
				return i >= 0 && i < hs.length ? salesValueForHour(spw, i) : 0;
			}
			function isPeakAbsoluteMinute(absMinute) {
				let m = ((absMinute % 1440) + 1440) % 1440;
				return (
					(m >= 8 * 60 && m < 9 * 60) ||
					(m >= 12 * 60 && m < 13 * 60) ||
					(m >= 18 * 60 && m < 19 * 60)
				);
			}
			function crewShiftBounds(c, referenceStart = null) {
				if (!c?.shift_start || !c?.shift_end) return null;
				let start = mins(c.shift_start);
				if (referenceStart != null) {
					while (start < referenceStart - 720) start += 1440;
					while (start > referenceStart + 720) start -= 1440;
				}
				return { start, end: start + duration(c.shift_start, c.shift_end) };
			}
			function crewAreaAtAbsolute(c, absMinute, referenceStart = null) {
				let bounds = crewShiftBounds(c, referenceStart ?? absMinute);
				if (!bounds || absMinute < bounds.start || absMinute >= bounds.end)
					return "";
				let area = c.area || "";
				for (let a of normaliseAssignments(c.assignments)) {
					if (a.mode !== "position") continue;
					let from = a.start ? relativeMins(a.start, c.shift_start) : 0,
						to = a.end ? relativeMins(a.end, c.shift_start) : bounds.end - bounds.start,
						rel = absMinute - bounds.start;
					if (rel >= from && rel < to) area = a.area || area;
				}
				return area;
			}
			function coworkerClockOnAt(absMinute, c, area = c.area) {
				if (!currentSpw?.crew) return false;
				let own = crewShiftBounds(c), reference = own?.start ?? absMinute;
				return currentSpw.crew.some((x) => {
					if (x === c || (c.id && x.id === c.id) || !x.shift_start) return false;
					let b = crewShiftBounds(x, reference);
					return b && Math.abs(b.start - absMinute) <= 5 &&
						crewAreaAtAbsolute(x, b.start, reference) === area;
				});
			}
			function breakAreaConflict(c, start, length, scheduled = []) {
				let area = crewAreaAtAbsolute(c, start, crewShiftBounds(c)?.start);
				if (!area) return false;
				return scheduled.some((b) =>
					b.crewId !== c.id && b.area === area && start < b.end && start + length > b.start,
				);
			}
			function areaReliefCount(c, absMinute) {
				let area = crewAreaAtAbsolute(c, absMinute, crewShiftBounds(c)?.start);
				if (!area || !currentSpw?.crew) return 0;
				return currentSpw.crew.filter((x) =>
					x !== c && (!c.id || x.id !== c.id) &&
					crewAreaAtAbsolute(x, absMinute, crewShiftBounds(c)?.start) === area,
				).length;
			}
			function chooseBreakMinute(
				c,
				kind,
				minAbs,
				maxAbs,
				idealAbs,
				used = [],
				scheduled = [],
			) {
				if (maxAbs < minAbs) return null;
				let candidates = [];
				for (
					let t = Math.ceil(minAbs / 15) * 15;
					t <= maxAbs;
					t += kind === "rest" ? 5 : 15
				) {
					let area = crewAreaAtAbsolute(c, t, crewShiftBounds(c)?.start),
						clockOn = kind === "rest" && coworkerClockOnAt(t, c, area),
						length = kind === "meal" ? 30 : 10;
					let peak = isPeakAbsoluteMinute(t);
					let sales = salesAtAbsoluteMinute(t);
					let gapOK = used.every((u) => Math.abs(t - u) >= 60);
					if (!gapOK || breakAreaConflict(c, t, length, scheduled)) continue;
					let score = kind === "rest"
						? (t - minAbs) * 3 + sales * 0.1
						: sales + Math.abs(t - idealAbs) * 0.35;
					if (peak && !clockOn) score += kind === "rest" ? 500 : 10000;
					if (areaReliefCount(c, t) === 0) score += 20000;
					if (clockOn) score -= 25000;
					candidates.push({ t, score });
				}
				if (!candidates.length) {
					for (
						let t = Math.ceil(minAbs / 15) * 15;
						t <= maxAbs;
					t += kind === "rest" ? 5 : 15
					) {
						let length = kind === "meal" ? 30 : 10;
						if (used.every((u) => Math.abs(t - u) >= 45) &&
							!breakAreaConflict(c, t, length, scheduled))
							candidates.push({
								t,
								score:
									salesAtAbsoluteMinute(t) +
									Math.abs(t - idealAbs),
							});
					}
				}
				candidates.sort((a, b) => a.score - b.score);
				return candidates[0]?.t ?? null;
			}
			function breakPlan(c, scheduled = []) {
				let d = duration(c.shift_start, c.shift_end),
					rests = d >= 570 ? 2 : d >= 240 ? 1 : 0,
					meal = d > 300;
				let plan = {
					duration: d,
					rest_count: rests,
					meal_required: meal,
					meal: "",
					rest1: "",
					rest2: "",
					warnings: [],
				};
				if (!c.shift_start || !c.shift_end) return plan;
				let start = mins(c.shift_start),
					end = start + d;
				let firstAllowed = start + 60,
					lastAllowed = end - 60,
					used = [];
				// First rests are planned first: they should happen as early as coverage allows.
				if (rests >= 1) {
					let r1Latest = meal ? Math.min(lastAllowed, start + 225) : lastAllowed,
						r1 = c.rest1_sent && c.rest1_time
							? start + relativeMins(c.rest1_time, c.shift_start)
							: chooseBreakMinute(c, "rest", firstAllowed, r1Latest,
								firstAllowed, used, scheduled);
					if (r1 != null) {
						plan.rest1 = addMins("00:00", r1);
						used.push(r1);
						if (!c.rest1_sent) scheduled.push({ crewId: c.id, area: crewAreaAtAbsolute(c, r1, start), start: r1, end: r1 + 10, kind: "rest1" });
					}
				}
				if (meal) {
					let earliest = Math.max(firstAllowed, end - 315),
						latest = Math.min(lastAllowed - 30, start + 285);
					let ideal = start + Math.floor(d / 2) - 15;
					let ms = c.meal_sent && c.meal_time
						? start + relativeMins(c.meal_time, c.shift_start)
						: chooseBreakMinute(c, "meal", earliest, latest, ideal, used, scheduled);
					if (ms == null) {
						plan.warnings.push(
							"No meal window fits all timing rules.",
						);
						ms = Math.max(earliest, Math.min(latest, ideal));
					}
					if (ms != null) {
						plan.meal = addMins("00:00", ms);
						used.push(ms);
						if (!c.meal_sent) scheduled.push({ crewId: c.id, area: crewAreaAtAbsolute(c, ms, start), start: ms, end: ms + 30, kind: "meal" });
					}
				}
				if (rests >= 2) {
					let mealAbs = plan.meal
						? mins(plan.meal) < start
							? mins(plan.meal) + 1440
							: mins(plan.meal)
						: start + Math.floor(d / 2);
					let min2 = Math.max(firstAllowed, mealAbs + 90);
					let ideal =
						mealAbs + 30 + Math.floor((end - (mealAbs + 30)) / 2);
					let r2 = c.rest2_sent && c.rest2_time
						? start + relativeMins(c.rest2_time, c.shift_start)
						: chooseBreakMinute(c, "rest", min2, lastAllowed, ideal, used, scheduled);
					if (r2 != null) {
						plan.rest2 = addMins("00:00", r2);
						used.push(r2);
						if (!c.rest2_sent) scheduled.push({ crewId: c.id, area: crewAreaAtAbsolute(c, r2, start), start: r2, end: r2 + 10, kind: "rest2" });
					}
				}
				return plan;
			}
			function buildShiftBreakPlan(crew = currentSpw?.crew || []) {
				let scheduled = [], plans = new Map();
				// Completed/in-progress breaks stay fixed and reserve their area window.
				for (let c of crew) {
					let start = crewShiftBounds(c)?.start;
					if (start == null) continue;
					for (let [sentField, timeField, length, kind] of [
						["meal_sent", "meal_time", 30, "meal"],
						["rest1_sent", "rest1_time", 10, "rest1"],
						["rest2_sent", "rest2_time", 10, "rest2"],
					]) {
						if (!c[sentField] || !c[timeField]) continue;
						let rel = relativeMins(c[timeField], c.shift_start), at = start + rel;
						scheduled.push({ crewId: c.id, area: crewAreaAtAbsolute(c, at, start), start: at, end: at + length, kind });
					}
				}
				// Short shifts are less flexible, so secure their early rest windows first.
				let ordered = [...crew].sort((a, b) =>
					duration(a.shift_start, a.shift_end) - duration(b.shift_start, b.shift_end) ||
					mins(a.shift_start) - mins(b.shift_start));
				for (let c of ordered) plans.set(c, breakPlan(c, scheduled));
				return plans;
			}
			function validateCrew(c) {
				let a = [],
					d = duration(c.shift_start, c.shift_end),
					expectedRests = d >= 570 ? 2 : d >= 240 ? 1 : 0,
					mealRequired = d > 300;
				if (!c.station) a.push("No position assigned");
				if (Number(c.rest_count || 0) !== expectedRests)
					a.push(
						`Should have ${expectedRests} rest break${expectedRests === 1 ? "" : "s"}`,
					);
				if (mealRequired && !c.meal_time)
					a.push("Meal required for shift over 5 hours");
				if (!mealRequired && c.meal_time)
					a.push("Meal is not required by the entered shift length");
				let times = [
					["Meal", c.meal_time],
					["Rest", c.rest1_time],
					["Rest", c.rest2_time],
				].filter((x) => x[1]);
				for (let [label, t] of times) {
					let rel = relativeMins(t, c.shift_start);
					if (rel < 60) a.push(`${label} is in the first hour`);
					if (rel > d - 60) a.push(`${label} is in the last hour`);
				}
				if (mealRequired && c.meal_time) {
					let rel = relativeMins(c.meal_time, c.shift_start);
					if (rel > 285)
						a.push("Meal starts more than 4h45 after shift start");
					if (rel + 30 < d - 285)
						a.push("Meal finishes more than 4h45 before shift end");
				}
				let rels = times
					.map((x) => ({
						label: x[0],
						rel: relativeMins(x[1], c.shift_start),
					}))
					.sort((a, b) => a.rel - b.rel);
				for (let i = 1; i < rels.length; i++)
					if (rels[i].rel - rels[i - 1].rel < 60)
						a.push(
							`${rels[i - 1].label} and ${rels[i].label} are too close together`,
						);
				return a;
			}
			function parseShiftDate(dateStr) {
				let [a, b, c] = String(dateStr || todayStr())
					.split("-")
					.map(Number);
				return new Date(a, b - 1, c, 0, 0, 0, 0);
			}
			function crewStartDateTime(c, spw = currentSpw) {
				if (!c?.shift_start || !spw?.shift_date) return null;
				let d = parseShiftDate(spw.shift_date),
					m = mins(c.shift_start);
				if (spw.shift_type === "Overnight" && m != null && m < 12 * 60)
					d.setDate(d.getDate() + 1);
				d.setHours(Math.floor(m / 60), m % 60, 0, 0);
				return d;
			}
			function crewMomentForTime(c, time, spw = currentSpw) {
				let start = crewStartDateTime(c, spw),
					rel = relativeMins(time, c.shift_start);
				return start && rel != null
					? new Date(start.getTime() + rel * 60000)
					: null;
			}
			function getNowShiftMinute(c, spw = currentSpw) {
				let start = crewStartDateTime(c, spw);
				return start ? (Date.now() - start.getTime()) / 60000 : null;
			}
			function breakState(c, time, field, spw = currentSpw) {
				if (!time) return "";
				if (c[field]) return "sent";
				let when = crewMomentForTime(c, time, spw);
				if (!when) return "";
				let delta = (Date.now() - when.getTime()) / 60000;
				if (delta > 15) return "late";
				if (delta >= -10) return "due";
				return "";
			}
			function fmtDateTime(v) {
				if (!v) return "";
				let d = new Date(v);
				if (isNaN(d)) return v;
				return d.toLocaleTimeString([], {
					hour: "numeric",
					minute: "2-digit",
				});
			}
			function refreshFoodSafetyButtons() {
				if (!currentSpw) return;
				let defs = FOOD_SAFETY_DEFS[currentSpw.shift_type] || [];
				for (let d of defs) {
					let st = fsState(d.id),
						avail = fsAvailable(d);
					document
						.querySelectorAll(`[data-fs-id="${d.id}"]`)
						.forEach((btn) => {
							btn.classList.toggle("done", !!st.done);
							btn.classList.toggle("locked", !avail);
							btn.disabled = !avail;
							let box = btn.querySelector(".check-box");
							if (box) box.textContent = st.done ? "✓" : "";
							let tm = btn.querySelector(".check-time");
							if (tm)
								tm.textContent = st.done
									? taskTimeText(st.done_at)
									: "";
							let meta = btn.querySelector(".check-copy span");
							if (meta)
								meta.textContent =
									foodMeta(d) + (!avail ? " · Locked" : "");
						});
				}
			}
			function refreshTaskButtons(id) {
				let st = taskStore().items[id] || {};
				document
					.querySelectorAll(`[data-task-id="${id}"]`)
					.forEach((btn) => {
						btn.classList.toggle("done", !!st.done);
						let box = btn.querySelector(".check-box");
						if (box) box.textContent = st.done ? "✓" : "";
						let sub = btn.querySelector(".check-copy span");
						if (sub)
							sub.textContent = st.done
								? taskTimeText(st.done_at)
								: "Tap to complete";
					});
			}

			function localIsoMinute() {
				let d = new Date(),
					z = (n) => String(n).padStart(2, "0");
				return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
			}
			function restoreScroll(y) {
				requestAnimationFrame(() =>
					window.scrollTo({ top: y, left: 0, behavior: "auto" }),
				);
			}
			function rerenderLocalPreserveScroll(page = currentPage) {
				let y = window.scrollY;
				if (page === "current") paintCurrent(currentSpw);
				else if (page === "history") renderHistoryBody(currentSpw);
				else if (page === "breaks") renderBreakDashboard();
				else if (page === "food") renderFoodSafety();
				else if (page === "tasks") renderShiftTasks();
				else renderPage(page);
				restoreScroll(y);
			}
			const actionLocks = new Set();
			function assignedSkillFit(c) {
				if (!c?.station) return null;
				let slot = {
						area: c.area,
						position: c.station,
						key: `${c.area}|||${c.station}`,
					},
					p = profileForCrew(c),
					q = positionSkillScore(p, slot);
				return { ...q, profile: p, slot };
			}
			function positionHierarchy(area, station) {
				let s = String(station || "");
				if (area === "Kitchen") {
					if (/Assembler/.test(s))
						return { family: "kitchen", rank: 0 };
					if (/Initiator|Chaser Side 1/.test(s))
						return { family: "kitchen", rank: 1 };
					if (/Grill|Fried/.test(s))
						return { family: "kitchen", rank: 2 };
				}
				if (area === "Drive Thru") {
					if (/Assembler|Coordinator/.test(s))
						return { family: "dt", rank: 0 };
					if (/Presenter|Expeditor/.test(s))
						return { family: "dt", rank: 1 };
					if (/OT|Cash/.test(s)) return { family: "dt", rank: 2 };
					if (/Drink Drawer/.test(s))
						return { family: "dt", rank: 3 };
				}
				if (area === "In Restaurant") {
					if (/Assembler|Expeditor/.test(s))
						return { family: "counter", rank: 0 };
					if (/Presenter/.test(s))
						return { family: "counter", rank: 1 };
					if (/Order Taker/.test(s))
						return { family: "counter", rank: 2 };
					if (/Drink Drawer/.test(s))
						return { family: "counter", rank: 3 };
				}
				if (area === "McCafé") {
					if (/Milk/.test(s) && !/Coffee/.test(s))
						return { family: "cafe", rank: 0 };
					if (/Coffee/.test(s)) return { family: "cafe", rank: 1 };
					if (/Food/.test(s)) return { family: "cafe", rank: 2 };
					if (/OT/.test(s)) return { family: "cafe", rank: 3 };
				}
				return null;
			}
			function candidateCanReplaceWithoutWeakening(
				candidate,
				targetCrew,
			) {
				let target = positionHierarchy(
						targetCrew.area,
						targetCrew.station,
					),
					cur = positionHierarchy(candidate.area, candidate.station);
				if (!target || !cur) return false;
				if (target.family !== cur.family) return false;
				return cur.rank >= target.rank;
			}
			function betterCandidatesFor(c) {
				let fit = assignedSkillFit(c);
				if (!fit || !fit.profile || fit.score >= fit.min) return [];
				return (currentSpw?.crew || [])
					.filter(
						(x) =>
							x.id !== c.id &&
							candidateCanReplaceWithoutWeakening(x, c),
					)
					.map((x) => ({
						c: x,
						fit: positionSkillScore(profileForCrew(x), fit.slot),
					}))
					.filter(
						(x) =>
							x.fit.score >= fit.min &&
							x.fit.score >= fit.score + 2,
					)
					.sort((a, b) => b.fit.score - a.fit.score);
			}
			function num(v) {
				let n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
				return isFinite(n) ? n : 0;
			}
			function hourStarts(spw) {
				let base =
					spw.shift_type === "Day Shift"
						? 7 * 60
						: spw.shift_type === "Night Shift"
							? 15 * 60
							: 23 * 60;
				return spw.hours.map((_, i) => base + i * 60);
			}
			function hourlyStaffing(spw) {
				let hs = hourStarts(spw);
				return hs.map((h, i) => {
					let crewHours = 0;
					for (let c of spw.crew) {
						let st = mins(c.shift_start),
							d = duration(c.shift_start, c.shift_end);
						if (st == null || !d) continue;
						if (st < hs[0] - 360) st += 1440;
						let en = st + d,
							he = h + 60;
						let worked = Math.max(
							0,
							Math.min(en, he) - Math.max(st, h),
						);
						if (worked <= 0) continue;
						let unpaid = 0;
						if (c.meal_time) {
							let mt = mins(c.meal_time);
							if (mt < st) mt += 1440;
							let me = mt + 30;
							unpaid = Math.max(
								0,
								Math.min(me, he) - Math.max(mt, h),
							);
						}
						crewHours += Math.max(0, worked - unpaid) / 60;
					}
					let sales = salesValueForHour(spw, i);
					return {
						count: crewHours,
						sales,
						source:
							spw.actual?.[i] !== "" &&
							spw.actual?.[i] != null &&
							spw.actual?.[i] !== null
								? "actual"
								: "projected",
						spch: crewHours ? sales / crewHours : 0,
					};
				});
			}
			function updateSalesMetricsCells() {
				if (!currentSpw) return;
				let st = hourlyStaffing(currentSpw);
				st.forEach((x, i) => {
					let c = $(`crew-metric-${i}`);
					if (c)
						c.textContent = x.count
							.toFixed(2)
							.replace(/\.00$/, "")
							.replace(/0$/, "");
					let q = $(`spch-metric-${i}`);
					if (q) {
						let has = x.sales > 0;
						q.textContent =
							has && x.count ? x.spch.toFixed(0) : "—";
						q.className = `spch ${!has ? "na" : x.spch >= 145 ? "good" : "bad"}`;
						q.title = `Using ${x.source} sales`;
					}
				});
			}
			function renderSalesMetricsOnly() {
				updateSalesMetricsCells();
			}
			function goalsEditor() {
				let html = "";
				for (let [a, keys] of Object.entries(GOAL_DEFS)) {
					html += `<div class="card"><h2>${a} Goals</h2>${keys.map((k) => `<div class="static-goal">${esc(k)}</div>`).join("")}</div>`;
				}
				return html;
			}
			function crewAt(area, pos) {
				return currentSpw.crew
					.filter((c) => c.area === area && c.station === pos)
					.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
			}
			function slotRows(area) {
				return area.positions
					.map((pos, idx) => {
						let members = crewAt(area.key, pos);
						if (!members.length)
							return `<div class="slot-row" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropCrew(event,'${esc(area.key)}','${esc(pos)}',${idx})"><div class="name"><span class="empty-slot">Drop crew here</span></div><div class="station">${esc(pos)}</div><div class="secondary"></div><div class="shift shift-cell"></div><div class="meal break-cell"></div><div class="rest1 break-cell"></div><div class="rest2 break-cell"></div></div>`;
						return members
							.map((c) => crewSlot(c, pos, area.key, idx))
							.join("");
					})
					.join("");
			}
			function worksheet(spw, build = false) {
				let areas = AREA_DEFS.map(
					(a) =>
						`<div class="area-sheet"><div class="area-side">${esc(a.key)}</div><div class="area-body"><div class="area-head"><div>Name</div><div>Station</div><div>Secondary / Flex</div><div>Shift</div><div>Meal</div><div>Rest</div><div>Rest</div></div>${build ? slotRows(a) : viewAreaRows(spw, a)}</div></div>`,
				).join("");
				let unpos = build
					? spw.crew.filter(
							(c) =>
								!c.station ||
								!AREA_DEFS.some(
									(a) =>
										a.key === c.area &&
										a.positions.includes(c.station),
								),
						)
					: [];
				return `<div class="worksheet">${areas}${build ? `<div class="card" style="margin:10px 0 0"><h2>Unpositioned crew</h2><div class="unpositioned">${unpos.length ? unpos.map((c) => `<div class="crew-chip" draggable="true" ondragstart="dragStart(event,${c.id})"><span>${esc(c.name)}</span><button class="iconbtn" onclick="openCrewModal(${c.id})">✎</button></div>`).join("") : '<span class="muted small">Everyone is positioned.</span>'}</div></div>` : ""}</div>`;
			}
			function viewAreaRows(spw, a) {
				let rows = [];
				for (let pos of a.positions) {
					let members = spw.crew.filter(
						(c) => c.area === a.key && c.station === pos,
					);
					for (let c of members)
						rows.push(crewSlot(c, pos, a.key, 0));
				}
				return rows.length
					? rows.join("")
					: `<div class="slot-row"><div class="name"><span class="empty-slot">No crew positioned</span></div><div class="station"></div><div class="secondary"></div><div class="shift"></div><div class="meal"></div><div class="rest1"></div><div class="rest2"></div></div>`;
			}

			// View SPW is intentionally more compact than Build/Edit. Core operating areas always
			// remain visible, while secondary areas only appear when somebody is positioned there.
			const HISTORY_ALWAYS_AREAS = new Set([
				"Kitchen",
				"Drive Thru",
				"In Restaurant",
				"McCafé",
				"Fries",
			]);
			const HISTORY_MAJOR_POSITIONS = {
				Kitchen: new Set([
					"Grill / Fried",
					"Initiator Side 1",
					"Assembler Side 1",
				]),
				"Drive Thru": new Set([
					"Assembler / Presenter",
					"OT Lane 1 / Cash",
				]),
				"In Restaurant": new Set([
					"Assembler",
					"Presenter / Order Taker",
				]),
				McCafé: new Set([
					"Milk Barista Machine 1",
					"Coffee / Milk Barista Machine 1",
				]),
				Fries: new Set(["Fries"]),
			};
			function historyEmptySlot(pos) {
				return `<div class="slot-row"><div class="name"><span class="empty-slot">Unfilled</span></div><div class="station">${esc(pos)}</div><div class="secondary"></div><div class="shift shift-cell"></div><div class="meal break-cell"></div><div class="rest1 break-cell"></div><div class="rest2 break-cell"></div></div>`;
			}
			function historyAreaRows(spw, a) {
				let rows = [],
					major = HISTORY_MAJOR_POSITIONS[a.key] || new Set();
				for (let pos of a.positions) {
					let members = spw.crew.filter(
						(c) => c.area === a.key && c.station === pos,
					);
					if (members.length) {
						for (let c of members)
							rows.push(crewSlot(c, pos, a.key, 0));
					} else if (major.has(pos)) {
						rows.push(historyEmptySlot(pos));
					}
				}
				return rows.join("");
			}
			function historyWorksheet(spw) {
				let areas = AREA_DEFS.map((a) => {
					let hasCrew = spw.crew.some(
						(c) => c.area === a.key && c.station,
					);
					if (!HISTORY_ALWAYS_AREAS.has(a.key) && !hasCrew) return "";
					let rows = historyAreaRows(spw, a);
					if (!rows && !HISTORY_ALWAYS_AREAS.has(a.key)) return "";
					return `<div class="area-sheet"><div class="area-side">${esc(a.key)}</div><div class="area-body"><div class="area-head"><div>Name</div><div>Station</div><div>Secondary / Flex</div><div>Shift</div><div>Meal</div><div>Rest</div><div>Rest</div></div>${rows}</div></div>`;
				}).join("");
				return `<div class="worksheet">${areas}</div>`;
			}
			function dragStart(e, id) {
				dragCrewId = id;
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", String(id));
			}
			function dragOver(e) {
				e.preventDefault();
				e.currentTarget.classList.add("drop");
			}
			function dragLeave(e) {
				e.currentTarget.classList.remove("drop");
			}
			async function updateCrew(c) {
				await api(`/api/crew/${c.id}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(c),
				});
			}
			function pageHero(title, sub = "") {
				return `<div class="hero"><div><h1>${title}</h1>${sub ? `<div class="small">${sub}</div>` : ""}</div><div class="spacer"></div>${currentSpw ? `<strong>${esc(currentSpw.shift_date)} · ${esc(currentSpw.shift_type)}</strong>` : ""}</div>`;
			}
