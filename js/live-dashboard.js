			function renderHandover() {
				let el = $("page-handover");
				if (!currentSpw) {
					el.innerHTML = pageHero("Shift Handover") + buildPicker();
					return;
				}
				el.innerHTML =
					pageHero(
						"Shift Handover",
						"Persistent notes for the next manager / shift",
					) +
					`<div class="card"><h2>Handover</h2><textarea class="handover" oninput="currentSpw.handover=this.value;scheduleSave()" placeholder="Staffing issues, maintenance, stock, customer follow-ups, pending actions…">${esc(currentSpw.handover || "")}</textarea></div><div class="card"><h2>Current actionable flags</h2><div class="alerts">${renderAlerts(20)}</div></div>`;
			}

			(function v14Init() {
				setConnection(navigator.onLine ? "online" : "offline");
				flushOfflineQueue();
				document.addEventListener("visibilitychange", () => {
					if (document.visibilityState === "hidden" && currentSpw)
						saveSpw(true).catch(() => {});
					else refreshDynamicTimeUi();
				});
				window.addEventListener("beforeunload", () =>
					cacheCurrentSpw(),
				);
			})();
function liveTasksCard() {
    if (!currentSpw) return "";
    const store = taskStore();
    const items = [...defaultShiftTasks(), ...store.custom].filter((t) => !store.items[t.id]?.done);
    const standard = items.length ? `<div class="card live-tasks"><h2>Outstanding Shift Tasks</h2><div class="small muted" style="margin-bottom:9px">Completed items stay hidden here; open Tasks to review them.</div><div class="check-list">${items.map((t) => `<button class="check-row" data-task-id="${t.id}" onclick="toggleShiftTask('${t.id}',this)"><span class="check-box"></span><span class="check-copy"><span class="task-category">${esc(t.category || defaultTaskCategory(t.label))}</span><strong>${esc(t.label)}</strong><span>Tap to complete</span></span></button>`).join("")}</div></div>` : `<div class="card live-tasks"><h2>Shift Tasks</h2><div class="alert good"><div>All standard shift tasks are complete.</div></div></div>`;
    return cashCriticalCard() + standard;
}
			async function newProfile() {
				let n = $("profile-new")?.value.trim();
				if (!n) return;
				let existing = findProfileByName(n);
				if (existing) {
					selectedProfile = existing.id;
					renderSkillsLoaded();
					return;
				}
				if (!navigator.onLine) {
					toast("Creating a new crew profile requires a connection");
					return;
				}
				try {
					let r = await api("/api/profiles", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							name: n,
							notes: "",
							skills: {},
							flags: {},
						}),
					});
					selectedProfile = r.id;
					await loadProfiles();
					renderSkillsLoaded();
				} catch (e) {
					toast(e.message || "Could not create profile");
				}
			}

			/* v14.2 — Live SPW look-ahead (maximum two shift slots) */
			let liveViewMode = {
				isPreview: false,
				offset: 0,
				currentSlot: null,
				shownSlot: null,
				startsAt: null,
			};
			function nextShiftSlot(slot) {
				let d = parseShiftDate(slot.date);
				if (slot.type === "Day Shift")
					return { date: slot.date, type: "Night Shift" };
				if (slot.type === "Night Shift")
					return { date: slot.date, type: "Overnight" };
				d.setDate(d.getDate() + 1);
				return {
					date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
					type: "Day Shift",
				};
			}
			function liveCandidateSlots() {
				let out = [shiftForNow()];
				out.push(nextShiftSlot(out[0]));
				out.push(nextShiftSlot(out[1]));
				return out;
			}
			function shiftSlotStart(slot) {
				let d = parseShiftDate(slot.date),
					m =
						slot.type === "Day Shift"
							? 7 * 60
							: slot.type === "Night Shift"
								? 15 * 60
								: 23 * 60;
				d.setHours(Math.floor(m / 60), m % 60, 0, 0);
				return d;
			}
			function previewStartsText() {
				if (!liveViewMode.isPreview || !liveViewMode.startsAt)
					return "";
				let minsLeft = Math.max(
					0,
					Math.ceil((liveViewMode.startsAt - Date.now()) / 60000),
				);
				if (minsLeft < 60) return `Starts in ${minsLeft}m`;
				let h = Math.floor(minsLeft / 60),
					m = minsLeft % 60;
				return `Starts in ${h}h${m ? ` ${m}m` : ""}`;
			}
			async function renderCurrent(token = navRenderToken) {
				let el = $("page-current"),
					slots = liveCandidateSlots();
				el.innerHTML =
					pageHero(
						"Live SPW",
						"Finding the current or next available shift…",
					) + '<div class="card">Loading Live SPW…</div>';
				try {
					let found = null,
						foundSlot = null,
						foundOffset = -1;
					for (let i = 0; i < slots.length; i++) {
						let slot = slots[i],
							raw;
						if (
							currentSpw?.shift_date === slot.date &&
							currentSpw?.shift_type === slot.type
						)
							raw = currentSpw;
						else
							raw = await api(
								`/api/spw?date=${slot.date}&shift_type=${encodeURIComponent(slot.type)}`,
							);
						if (
							currentPage !== "current" ||
							token !== navRenderToken
						)
							return;
						if (raw) {
							found = normaliseLoadedSpw(raw, slot.type);
							foundSlot = slot;
							foundOffset = i;
							break;
						}
					}
					if (!found) {
						liveViewMode = {
							isPreview: false,
							offset: 0,
							currentSlot: slots[0],
							shownSlot: null,
							startsAt: null,
						};
						el.innerHTML =
							pageHero(
								"Live SPW",
								"No nearby shift is currently available",
							) +
							`<div class="card"><b>No SPW found for the current shift or the next two shift slots.</b><div class="small muted" style="margin-top:6px">Live SPW will not jump further ahead than two shifts. Create or load a shift from Build / Edit.</div></div>`;
						return;
					}
					currentSpw = found;
					liveViewMode = {
						isPreview: foundOffset > 0,
						offset: foundOffset,
						currentSlot: slots[0],
						shownSlot: foundSlot,
						startsAt: shiftSlotStart(foundSlot),
					};
					paintCurrent(found);
				} catch (e) {
					if (currentPage === "current" && token === navRenderToken)
						el.innerHTML =
							pageHero("Live SPW") +
							`<div class="card"><b>Could not load the Live SPW.</b><div class="small muted">${esc(e.message)}</div></div>`;
					console.error(e);
				}
			}
			function nextAction() {
				if (liveViewMode.isPreview)
					return {
						severity: "info",
						text: `${humanShiftName(currentSpw.shift_type)} ${previewStartsText().toLowerCase()}.`,
						action: "Build / Edit",
						run: `showPage('build')`,
					};
				let a = smartAlerts()[0];
				if (a) return a;
				let next = [];
				for (let c of currentSpw?.crew || []) {
					for (let [f, t, l] of [
						["meal_sent", "meal_time", "Meal"],
						["rest1_sent", "rest1_time", "Rest"],
						["rest2_sent", "rest2_time", "Rest"],
					]) {
						if (c[t] && !c[f]) {
							let d = crewMomentForTime(c, c[t]);
							if (d)
								next.push({
									at: d.getTime(),
									text: `${c.name} ${l.toLowerCase()} at ${fmtTime(c[t])}`,
									action: "Open breaks",
									run: `showPage('breaks')`,
								});
						}
					}
				}
				next.sort((a, b) => a.at - b.at);
				return next[0]
					? { severity: "info", ...next[0] }
					: {
							severity: "good",
							text: "Shift is on track. No immediate action is due.",
						};
			}
			function commandCentreInner() {
				let preview = liveViewMode.isPreview,
					alerts = preview ? [] : smartAlerts(),
					positioned =
						currentSpw?.crew.filter((c) => c.station).length || 0,
					total = currentSpw?.crew.length || 0,
					hi = preview ? -1 : currentHourIndex(),
					st = hi >= 0 ? hourlyStaffing(currentSpw)[hi] : null,
					na = nextAction(),
					score = shiftScore(currentSpw);
				return `<div class="command-head"><div><div class="small muted">${preview ? '<span class="upcoming-label">UPCOMING SPW</span> · ' : ""}${esc(humanShiftName(currentSpw.shift_type))} · ${esc(currentSpw.shift_date)}</div><div class="clock now-clock">${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>${preview ? `<div class="preview-start">${esc(previewStartsText())}</div>` : ""}</div><span style="flex:1"></span><div class="pill ${preview ? "info" : alerts.some((a) => a.severity === "urgent") ? "bad" : alerts.length ? "warn" : "ok"}">${preview ? "Preview" : alerts.length ? `${alerts.length} attention` : "On track"}</div></div><div class="command-grid"><div class="command-metric"><div class="v">${total}</div><div class="k">Crew</div></div><div class="command-metric"><div class="v">${positioned}/${total}</div><div class="k">Positioned</div></div><div class="command-metric"><div class="v">${preview ? "—" : st?.sales ? Math.round(st.spch) : "—"}</div><div class="k">Current SPCH</div></div><div class="command-metric"><div class="v">${score.total}</div><div class="k">Shift score</div></div></div><div class="next-action info"><div class="copy"><div class="eyebrow">${preview ? "Upcoming shift" : "Next action"}</div><strong>${esc(na.text)}</strong></div>${na.action ? `<button class="btn primary" onclick="${na.run}">${esc(na.action)}</button>` : ""}</div>`;
			}
			function nowBarHtml() {
				let preview = liveViewMode.isPreview,
					urgent = preview
						? 0
						: smartAlerts().filter((a) => a.severity === "urgent")
								.length;
				return `<div class="nowbar ${preview ? "preview" : ""}"><div class="now-time now-clock">${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div><div class="now-summary">${preview ? `Upcoming · ${previewStartsText()}` : urgent ? `${urgent} urgent item${urgent === 1 ? "" : "s"} · ${currentSpw?.crew.length || 0} crew` : `No urgent items · ${currentSpw?.crew.length || 0} crew`}</div><div class="spacer"></div><button class="btn sm" onclick="window.scrollTo({top:0,behavior:'smooth'})">Top</button></div>`;
			}
			function paintCurrent(spw = currentSpw) {
				let el = $("page-current");
				if (!el || !spw) return;
				let preview = liveViewMode.isPreview;
				el.innerHTML =
					nowBarHtml() +
					`<div id="command-centre" class="command-centre ${preview ? "preview-mode" : ""}">${commandCentreInner()}</div>` +
					(preview
						? `<div class="card upcoming-preview-card"><h2>Upcoming shift preview</h2><div class="small muted">This is the next available SPW within two shift slots. Live urgency is paused until this shift actually starts, so future breaks, clock-offs, current-hour sales and food-safety timing will not be shown as overdue.</div></div>`
						: `<div class="card"><h2>Actionable alerts</h2><div class="alerts">${renderAlerts(6)}</div></div>`) +
					liveBoard(spw) +
					liveFoodSafetyCard() +
					liveTasksCard();
			}
			function refreshDynamicTimeUi() {
				document.querySelectorAll(".now-clock").forEach(
					(x) =>
						(x.textContent = new Date().toLocaleTimeString([], {
							hour: "numeric",
							minute: "2-digit",
						})),
				);
				if (
					currentPage === "current" &&
					liveViewMode.isPreview &&
					liveViewMode.startsAt &&
					Date.now() >= liveViewMode.startsAt.getTime()
				) {
					renderCurrent(navRenderToken);
					return;
				}
				if (!currentSpw) return;
				for (let c of currentSpw.crew) {
					["meal_sent", "rest1_sent", "rest2_sent"].forEach((f) =>
						refreshBreakButtons(c, f),
					);
					document
						.querySelectorAll(
							`[data-live-crew="${c.id}"] .crew-startoff`,
						)
						.forEach((el) => (el.outerHTML = clockStatusHtml(c)));
				}
				let cc = $("command-centre");
				if (cc && currentPage === "current")
					cc.innerHTML = commandCentreInner();
				let nb = document.querySelector(".nowbar");
				if (nb && currentPage === "current")
					nb.outerHTML = nowBarHtml();
			}

			

