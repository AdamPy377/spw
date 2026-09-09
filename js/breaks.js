			function liveFoodSafetyCard() {
				if (!currentSpw) return "";
				let defs = FOOD_SAFETY_DEFS[currentSpw.shift_type] || [];
				if (!defs.length) return "";
				return `<div class="card live-food"><h2>Food Safety</h2><div class="small muted" style="margin-bottom:9px">Quick food-safety checklist. Full details are available from Food Safety.</div><div class="check-list">${defs
					.map((d) => {
						let st = fsState(d.id),
							avail = fsAvailable(d);
						return `<button class="check-row ${st.done ? "done" : ""} ${!avail ? "locked" : ""}" ${!avail ? "disabled" : ""} data-fs-id="${d.id}" onclick="toggleFoodSafety('${d.id}',this)"><span class="check-box">${st.done ? "✓" : ""}</span><span class="check-copy"><strong>${esc(d.label)}</strong><span>${esc(foodMeta(d))}${!avail ? " · Locked" : ""}</span></span><span class="check-time">${st.done ? esc(taskTimeText(st.done_at)) : ""}</span></button>`;
					})
					.join("")}</div></div>`;
			}
			function buildPicker() {
				return `<div class="card"><div class="picker"><div><label>Date</label><input id="pick-date" type="date" value="${currentSpw?.shift_date || todayStr()}"></div><div><label>Shift</label><select id="pick-type"><option ${currentSpw?.shift_type === "Day Shift" ? "selected" : ""}>Day Shift</option><option ${currentSpw?.shift_type === "Night Shift" ? "selected" : ""}>Night Shift</option><option ${currentSpw?.shift_type === "Overnight" ? "selected" : ""}>Overnight</option></select></div><button class="btn primary" onclick="openBuildSpw()">Load / Start SPW</button></div></div>`;
			}
			async function openBuildSpw() {
				let date = $("pick-date").value,
					type = $("pick-type").value;
				await loadSpw(date, type, true);
				renderBuild();
			}
			function refreshModalStations(selected = "") {
				let a = $("m-area").value,
					def = AREA_DEFS.find((x) => x.key === a),
					s = $("m-station");
				s.innerHTML = `<option value="">Unpositioned</option>${(def?.positions || []).map((p) => `<option ${p === selected ? "selected" : ""}>${esc(p)}</option>`).join("")}`;
			}
			function previewBreakPlan() {
				let c = modalCrewDraft(),
					p = breakPlan(c),
					warn = p.warnings.length
						? `<div class="warning-text">${p.warnings.join(" ")}</div>`
						: "";
				$("break-preview").innerHTML =
					`Shift length: <b>${Math.floor(p.duration / 60)}h ${p.duration % 60}m</b> · Required: <b>${p.meal_required ? "meal + " : ""}${p.rest_count} rest${p.rest_count === 1 ? "" : "s"}</b>.<br>Rules used: 4h+ = 1 rest; 9h30+ = 2 rests; over 5h = meal. Breaks stay out of the first/last hour, avoid 8–9am, 12–1pm and 6–7pm where possible, prefer lower-sales periods, and rest breaks get extra priority when another crew member clocks on. Breaks are kept at least 60 minutes apart. Meal start no later than 4h45 after start and a 30-minute meal must finish no earlier than 4h45 before shift end. ${warn}`;
			}
			function autoFillBreaks() {
				let c = modalCrewDraft(),
					p = breakPlan(c);
				$("m-meal").value = p.meal || "";
				$("m-rest1").value = p.rest1 || "";
				$("m-rest2").value = p.rest2 || "";
				previewBreakPlan();
			}
			function closeModal() {
				$("modal").classList.add("hidden");
				$("modal").innerHTML = "";
			}
			async function bulkUpdateCrew(items) {
				if (!items?.length) return;
				await api("/api/crew/bulk", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ items }),
				});
			}
			async function recalculateAllBreaks() {
				if (!currentSpw) return;
				let btn = event?.currentTarget;
				btn?.classList.add("is-saving");
				let changed = [];
				for (let c of currentSpw.crew) {
					let p = breakPlan(c);
					c.rest_count = p.rest_count;
					if (!c.meal_sent)
						c.meal_time = p.meal_required ? p.meal : "";
					if (!c.rest1_sent)
						c.rest1_time = p.rest_count >= 1 ? p.rest1 : "";
					if (!c.rest2_sent)
						c.rest2_time = p.rest_count >= 2 ? p.rest2 : "";
					changed.push(c);
				}
				renderBreakDashboard();
				try {
					await bulkUpdateCrew(changed);
					setAutosave("Break plan updated ✓");
				} catch (e) {
					setAutosave("Break update failed", "bad");
				} finally {
					btn?.classList.remove("is-saving");
				}
			}
			function renderBreakDashboard() {
				let el = $("page-breaks");
				if (!currentSpw) {
					el.innerHTML =
						pageHero(
							"Break Dashboard",
							"Load an SPW in Build / Edit first",
						) + buildPicker();
					return;
				}
				let items = [];
				for (let c of currentSpw.crew) {
					[
						["meal_sent", "meal_time", "Meal"],
						["rest1_sent", "rest1_time", "Rest"],
						["rest2_sent", "rest2_time", "Rest"],
					].forEach(([f, t, l]) => {
						if (c[t]) {
							let when = crewMomentForTime(c, c[t]);
							items.push({
								c,
								f,
								t: c[t],
								label: l,
								state: breakState(c, c[t], f),
								at: when ? when.getTime() : Number.MAX_SAFE_INTEGER,
							});
						}
					});
				}
				items.sort((a, b) => {
					let rank = (s) => s === "late" ? 0 : s === "due" ? 1 : s === "sent" ? 3 : 2;
					let ra = rank(a.state), rb = rank(b.state);
					if (ra !== rb) return ra - rb;
					// For overdue breaks, show the most recently missed break first.
					// For due/upcoming breaks, show the next chronological break first.
					if (a.state === "late") return b.at - a.at;
					return a.at - b.at;
				});
				let sent = items.filter((x) => x.c[x.f]).length,
					late = items.filter((x) => x.state === "late").length,
					due = items.filter((x) => x.state === "due").length;
				el.innerHTML =
					pageHero(
						"Break Dashboard",
						"One tap records the actual time the break was sent",
					) +
					breakNotificationCard() +
					`<div class="card"><div class="row"><div class="small muted">Projected break times use current sales, peak avoidance and clock-on coverage. Recalculate after major sales changes.</div><span style="flex:1"></span><button class="btn primary" onclick="recalculateAllBreaks()">Recalculate projected breaks</button></div></div><div class="dashboard-grid"><div class="metric"><div class="n">${items.length}</div><div class="l">Scheduled breaks</div></div><div class="metric"><div class="n">${sent}</div><div class="l">Sent</div></div><div class="metric"><div class="n">${due}</div><div class="l">Due now</div></div><div class="metric"><div class="n">${late}</div><div class="l">Overdue</div></div></div><div class="card"><h2>Break queue</h2><div class="break-list">${items.length ? items.map((x) => `<div class="break-item ${x.state}"><div><b>${esc(x.c.name)}</b><div class="small muted">${esc(x.c.station || "Unpositioned")}</div></div><div class="detail"><b>${x.label}</b> · ${fmtTime(x.t)}</div><div><span class="pill ${x.state === "late" ? "bad" : x.state === "due" ? "warn" : x.state === "sent" ? "ok" : ""}">${x.state || "Upcoming"}</span></div><div class="last">${breakButton(x.c, x.f, x.t, x.label)}</div></div>`).join("") : "No scheduled breaks."}</div></div>`;
				refreshBreakNotificationStatus();
			}

			const FOOD_SAFETY_DEFS = {
				"Day Shift": [
					{
						id: "day_10_1_p4",
						label: "10:1 — Platen 4",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_10_1_p5",
						label: "10:1 — Platen 5",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_10_1_p6",
						label: "10:1 — Platen 6",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_4_1_p5",
						label: "4:1 — Platen 5",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_4_1_p6",
						label: "4:1 — Platen 6",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_spicy",
						label: "Spicy — Fryer test",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_filet",
						label: "Filet — Fryer test",
						due: "10:30",
						group: "Main Food Safety",
					},
					{
						id: "day_rts_retests",
						label: "RTS Retests",
						available: "10:15",
						group: "RTS",
					},
					{
						id: "day_rts_verify",
						label: "RTS Verification",
						requires: ["day_rts_retests"],
						group: "RTS",
					},
				],
				"Night Shift": [],
				Overnight: [
					{
						id: "on_startup",
						label: "Food Safety Start Up Checklist",
						available: "00:00",
						group: "Start Up",
					},
					{
						id: "on_shake1",
						label: "Shake / Sundae Machine 1",
						target: "01:00",
						requires: ["on_startup"],
						group: "Shake / Sundae",
					},
					{
						id: "on_shake2",
						label: "Shake / Sundae Machine 2",
						target: "01:00",
						requires: ["on_startup"],
						group: "Shake / Sundae",
					},
					{
						id: "on_10_1_p1",
						label: "10:1 — Platen 1",
						target: "01:30",
						requires: ["on_startup"],
						group: "Main Food Safety",
					},
					{
						id: "on_10_1_p2",
						label: "10:1 — Platen 2",
						target: "01:30",
						requires: ["on_startup"],
						group: "Main Food Safety",
					},
					{
						id: "on_10_1_p3",
						label: "10:1 — Platen 3",
						target: "01:30",
						requires: ["on_startup"],
						group: "Main Food Safety",
					},
					{
						id: "on_4_1_p2",
						label: "4:1 — Platen 2",
						target: "01:30",
						requires: ["on_startup"],
						group: "Main Food Safety",
					},
					{
						id: "on_4_1_p3",
						label: "4:1 — Platen 3",
						target: "01:30",
						requires: ["on_startup"],
						group: "Main Food Safety",
					},
					{
						id: "on_sausage_p1",
						label: "Breakfast — Sausage Platen 1",
						due: "04:00",
						requires: ["on_startup"],
						group: "Breakfast Testing",
					},
					{
						id: "on_sausage_p2",
						label: "Breakfast — Sausage Platen 2",
						due: "04:00",
						requires: ["on_startup"],
						group: "Breakfast Testing",
					},
					{
						id: "on_egg1",
						label: "Breakfast — Egg Cooker 1",
						due: "04:00",
						requires: ["on_startup"],
						group: "Breakfast Testing",
					},
					{
						id: "on_egg2",
						label: "Breakfast — Egg Cooker 2",
						due: "04:00",
						requires: ["on_startup"],
						group: "Breakfast Testing",
					},
				],
			};
			const SHIFT_TASK_DEFS = {
				"Day Shift": ["Food Safety", "Washup", "Waste Count"],
				"Night Shift": [
					"Hotcakes",
					"Pockets",
					"Filtering",
					"Filter Box",
					"Grill Filters",
					"Fried Filters",
					"Front Filters",
					"Washup",
					"Waste Count",
				],
				Overnight: [
					"Check Washup",
					"Check HotCakes/Pockets",
					"Check Filtering/Filter Box",
					"Check Filters",
					"Grill Close Left",
					"Food Safety Start Up",
					"Shake/Sundae",
					"Food Safety",
					"Grill Close Right",
					"Daily BIC Clean",
					"Frankie Clean",
					"Fry Station Clean",
					"Stocktake",
					"EBOS Close",
					"Clean and Stock",
					"Waste Count",
				],
			};
