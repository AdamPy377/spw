			function confirmDialog(
				title,
				message,
				confirmLabel = "Confirm",
				danger = false,
			) {
				return new Promise((resolve) => {
					let modal = $("modal");
					modal.innerHTML = `<div class="modal-box"><div class="modal-head"><h2>${esc(title)}</h2><button class="btn sm" id="confirm-x">✕</button></div><div>${esc(message)}</div><div class="confirm-actions"><button class="btn" id="confirm-cancel">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" id="confirm-ok">${esc(confirmLabel)}</button></div></div>`;
					modal.classList.remove("hidden");
					let done = (v) => {
						modal.classList.add("hidden");
						modal.innerHTML = "";
						resolve(v);
					};
					$("confirm-x").onclick = () => done(false);
					$("confirm-cancel").onclick = () => done(false);
					$("confirm-ok").onclick = () => done(true);
				});
			}

			function humanShiftName(type) {
				return type === "Day Shift"
					? "Day / Lunch"
					: type === "Night Shift"
						? "Night / Dinner"
						: "Overnight";
			}
			function currentHourIndex(spw = currentSpw) {
				if (!spw?.shift_date) return -1;
				let base = parseShiftDate(spw.shift_date),
					starts = hourStarts(spw);
				for (let i = 0; i < starts.length; i++) {
					let d = new Date(base);
					let abs = starts[i];
					if (spw.shift_type === "Overnight" && abs >= 1440) {
					}
					if (abs >= 1440) {
						d.setDate(d.getDate() + Math.floor(abs / 1440));
						abs %= 1440;
					}
					d.setHours(Math.floor(abs / 60), abs % 60, 0, 0);
					let e = new Date(d.getTime() + 3600000);
					if (Date.now() >= d && Date.now() < e) return i;
				}
				return -1;
			}
			function minutesUntilCrewBoundary(c, kind) {
				let t =
					kind === "start"
						? crewStartDateTime(c)
						: crewMomentForTime(c, c.shift_end);
				if (kind === "end") {
					let s = crewStartDateTime(c);
					if (s) {
						let d = duration(c.shift_start, c.shift_end);
						t = new Date(s.getTime() + d * 60000);
					}
				}
				return t
					? Math.round((t.getTime() - Date.now()) / 60000)
					: null;
			}
			function activeBreak(c) {
				let defs = [
					["meal_sent", "meal_sent_at", "Meal", 30],
					["rest1_sent", "rest1_sent_at", "Rest", 10],
					["rest2_sent", "rest2_sent_at", "Rest", 10],
				];
				for (let [f, af, label, len] of defs) {
					if (!c[f] || !c[af]) continue;
					let d = new Date(c[af]);
					if (isNaN(d)) continue;
					let elapsed = (Date.now() - d.getTime()) / 60000;
					if (elapsed >= 0 && elapsed < len)
						return {
							field: f,
							label,
							length: len,
							remaining: Math.max(0, Math.ceil(len - elapsed)),
							elapsed,
						};
				}
				return null;
			}
			function breakCountdownText(c, time, field) {
				if (!time) return "";
				if (c[field]) {
					let a = activeBreak(c);
					if (a?.field === field)
						return `On ${a.label} · ${a.remaining}m left`;
					return c[field + "_at"]
						? `Sent ${fmtDateTime(c[field + "_at"])}`
						: "Sent";
				}
				let when = crewMomentForTime(c, time),
					delta = when
						? Math.round((when - Date.now()) / 60000)
						: null;
				if (delta == null) return "";
				if (delta > 0) return `in ${delta}m`;
				if (delta === 0) return "Due now";
				return `${Math.abs(delta)}m late`;
			}
			function breakButtonContents(c, field, time, label) {
				let sent = !!c[field],
					sentAt = c[field + "_at"] || "",
					a = activeBreak(c),
					active = a?.field === field;
				return `${sent ? "✓ " : ""}${active ? "ON " + label.toUpperCase() : label + " " + fmtTime(time)}<span class="countdown">${esc(breakCountdownText(c, time, field))}</span>${sentAt && !active ? `<span class="time-sub">sent ${fmtDateTime(sentAt)}</span>` : ""}`;
			}
			function breakButton(c, field, time, label) {
				if (!time) return "";
				let state = breakState(c, time, field),
					active = activeBreak(c)?.field === field;
				let cls = active ? "active-break" : state || "upcoming";
				return `<button class="break-btn ${cls}" data-crew="${c.id}" data-field="${field}" onclick="toggleBreak(${c.id},'${field}',this)">${breakButtonContents(c, field, time, label)}</button>`;
			}
			function refreshBreakButtons(c, field) {
				document
					.querySelectorAll(
						`.break-btn[data-crew="${c.id}"][data-field="${field}"]`,
					)
					.forEach((btn) => {
						let time =
								field === "meal_sent"
									? c.meal_time
									: field === "rest1_sent"
										? c.rest1_time
										: c.rest2_time,
							label = field === "meal_sent" ? "Meal" : "Rest",
							state = breakState(c, time, field),
							active = activeBreak(c)?.field === field;
						btn.className = `break-btn ${active ? "active-break" : state || "upcoming"}`;
						btn.innerHTML = breakButtonContents(
							c,
							field,
							time,
							label,
						);
					});
				document
					.querySelectorAll(`[data-live-crew="${c.id}"]`)
					.forEach((card) =>
						card.classList.toggle("onbreak", !!activeBreak(c)),
					);
			}
			async function setBreakState(id, field, sent, sent_at) {
				let c = currentSpw?.crew.find((x) => x.id === id);
				if (!c) return;
				let res = await api(`/api/crew/${id}/breaks`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ field, sent, sent_at }),
				});
				c[field] = (res?.sent ?? sent) ? 1 : 0;
				c[field + "_at"] = res?.sent_at ?? sent_at;
				refreshBreakButtons(c, field);
				cacheCurrentSpw();
			}
			async function toggleBreak(id, field, btn = null) {
				let key = `break:${id}:${field}`;
				if (actionLocks.has(key)) return;
				let c = currentSpw?.crew.find((x) => x.id === id);
				if (!c) return;
				actionLocks.add(key);
				btn?.classList.add("is-saving");
				let previous = !!c[field],
					previousAt = c[field + "_at"] || "",
					sent = !previous,
					sent_at = sent ? localIsoMinute() : "";
				c[field] = sent ? 1 : 0;
				c[field + "_at"] = sent_at;
				refreshBreakButtons(c, field);
				try {
					await setBreakState(id, field, sent, sent_at);
					setAutosave(
						getQueue().length ? "Queued offline" : "Saved ✓",
					);
					pushUndo(
						`${c.name} ${sent ? "sent on" : "removed from"} ${field === "meal_sent" ? "meal" : "rest"}`,
						async () => {
							await setBreakState(
								id,
								field,
								previous,
								previousAt,
							);
							if (currentPage === "breaks")
								renderBreakDashboard();
							toast("Change undone");
						},
					);
					if (currentPage === "breaks") renderBreakDashboard();
				} catch (e) {
					c[field] = previous ? 1 : 0;
					c[field + "_at"] = previousAt;
					refreshBreakButtons(c, field);
					setAutosave("Save failed", "bad");
					toast(e.message || "Break update failed");
				} finally {
					actionLocks.delete(key);
					btn?.classList.remove("is-saving");
				}
			}

			function profileForCrew(c) {
				return (
					profiles.find(
						(p) => Number(p.id) === Number(c?.profile_id),
					) ||
					profiles.find(
						(p) =>
							p.name.trim().toLowerCase() ===
							String(c?.name || "")
								.trim()
								.toLowerCase(),
					) ||
					null
				);
			}
			function crewSkillClass(c) {
				let f = assignedSkillFit(c);
				if (!f || !f.profile) return "";
				return f.score < f.min ? "skill-attention" : "skill-good";
			}
			function stationSkillClass(c) {
				return crewSkillClass(c) === "skill-attention"
					? "skill-attention-cell"
					: "";
			}
			function positionStrength(c) {
				let f = assignedSkillFit(c);
				if (!c?.station) return { score: 0, label: "Unpositioned" };
				if (!f?.profile) return { score: 60, label: "Unrated" };
				let pct = f.min
					? Math.max(
							0,
							Math.min(
								100,
								Math.round(
									(f.score / f.min) * 85 +
										(f.score >= f.min ? 15 : 0),
								),
							),
						)
					: Math.round(f.score * 20);
				return { score: pct, label: `${f.score}/5` };
			}
			function areaCoverage(area, spw = currentSpw) {
				let essentials = ESSENTIAL_POSITIONS[area] || [],
					crew = (spw?.crew || []).filter(
						(c) => c.area === area && c.station,
					);
				if (!essentials.length)
					return {
						score: crew.length ? 75 : 0,
						state: crew.length ? "thin" : "critical",
					};
				let scores = essentials.map((pos) => {
					let member = crew.find((c) => c.station === pos);
					if (!member) return 0;
					let strength = positionStrength(member);
					return strength.score;
				});
				let score = Math.round(
					scores.reduce((a, b) => a + b, 0) / scores.length,
				);
				let state =
					score >= 80 ? "strong" : score >= 55 ? "thin" : "critical";
				return { score, state };
			}
			function isAreaLeader(c) {
				return (
					Number(currentSpw?.area_leaders?.[c.area]) === Number(c.id)
				);
			}
			async function toggleAreaLeader(id) {
				let c = currentSpw?.crew.find((x) => x.id === id);
				if (!c) return;
				currentSpw.area_leaders = currentSpw.area_leaders || {};
				let old = currentSpw.area_leaders[c.area];
				if (Number(old) === Number(id))
					delete currentSpw.area_leaders[c.area];
				else currentSpw.area_leaders[c.area] = id;
				rerenderLocalPreserveScroll(currentPage);
				await saveSpw(true);
				pushUndo(
					`${c.name} ${old == id ? "removed as" : "set as"} ${c.area} leader`,
					async () => {
						if (old) currentSpw.area_leaders[c.area] = old;
						else delete currentSpw.area_leaders[c.area];
						await saveSpw(true);
						rerenderLocalPreserveScroll(currentPage);
					},
				);
			}

			function clockStatusHtml(c) {
				let a = activeBreak(c);
				if (a)
					return `<div class="crew-startoff offsoon return-count">${a.label}: back in ${a.remaining}m</div>`;
				let off = minutesUntilCrewBoundary(c, "end"),
					start = minutesUntilCrewBoundary(c, "start");
				if (start != null && start > 0 && start <= 30)
					return `<div class="crew-startoff startsoon">★ STARTS IN ${start} MIN</div>`;
				if (off != null && off >= 0 && off <= 30)
					return `<div class="crew-startoff offsoon">OFF IN ${off} MIN</div>`;
				return `<div class="crew-startoff normal">${fmtTime(c.shift_start)} – ${fmtTime(c.shift_end)}</div>`;
			}
			function liveBoard(spw) {
				return (
					AREA_DEFS.map((a) => {
						let ms = spw.crew.filter(
							(c) => c.area === a.key && c.station,
						);
						if (!ms.length) return "";
						let cov = areaCoverage(a.key, spw);
						return `<div class="live-area"><div class="live-title"><span>${a.key}</span><span class="area-score ${cov.state}">${cov.score}/100 · ${cov.state === "strong" ? "Strong" : cov.state === "thin" ? "Thin" : "Critical"}</span></div>${ms
							.map((c) => {
								let strength = positionStrength(c),
									leader = isAreaLeader(c);
								return `<div class="live-card ${activeBreak(c) ? "onbreak" : ""} ${crewSkillClass(c)} ${leader ? "area-leader" : ""}" data-live-crew="${c.id}"><div><div class="name">${esc(c.name)}${leader ? '<span class="leader-star" title="Area leader">★</span>' : ""}<span class="strength-pill">${strength.score}/100</span></div><span class="station-badge" style="background:${positionColour(c.area, c.station)};color:#111">${esc(c.station)}</span>${clockStatusHtml(c)}${c.secondary_flex ? `<div class="small muted" style="margin-top:3px">${esc(c.secondary_flex)}</div>` : ""}<div class="mobile-action-row"><button class="move-btn" onclick="openMoveModal(${c.id})" title="Move or swap">↔</button><button class="leader-btn ${leader ? "active" : ""}" onclick="toggleAreaLeader(${c.id})" title="Toggle area leader">★</button></div></div><div class="live-breaks">${breakButton(c, "meal_sent", c.meal_time, "Meal")}${breakButton(c, "rest1_sent", c.rest1_time, "Rest")}${breakButton(c, "rest2_sent", c.rest2_time, "Rest")}</div></div>`;
							})
							.join("")}</div>`;
					}).join("") || '<div class="card">No positioned crew.</div>'
				);
			}

			function smartAlerts(spw = currentSpw) {
				if (!spw) return [];
				let out = [],
					now = Date.now();
				const cashStatus = cashCompletionStatus(spw);
				if (!cashStatus.complete) out.push({ severity: "urgent", text: "Critical: drawer counts and safe count are still outstanding.", action: "Cash Management", run: `showPage('cash')`, rank: 2 });
				else if (cashStatus.hasVariance) out.push({ severity: "warn", text: `Cash Management has a variance of ${formatMoney(cashStatus.totalVariance)}.`, action: "Review cash", run: `showPage('cash')`, rank: 6 });
				for (let c of spw.crew) {
					if (!c.station)
						out.push({
							severity: "urgent",
							text: `${c.name} is unpositioned.`,
							action: "Position",
							run: `openMoveModal(${c.id})`,
							rank: 5,
						});
					let off = minutesUntilCrewBoundary(c, "end");
					if (off != null && off >= 0 && off <= 20)
						out.push({
							severity: "urgent",
							text: `${c.name} clocks off in ${off} min from ${c.station || "their current role"}.`,
							action: "Plan move",
							run: `openMoveModal(${c.id})`,
							rank: 8,
						});
					let start = minutesUntilCrewBoundary(c, "start");
					if (start != null && start > 0 && start <= 20)
						out.push({
							severity: "info",
							text: `${c.name} starts in ${start} min.`,
							action: "Review board",
							run: `showPage('build')`,
							rank: 18,
						});
					for (let [f, t, l] of [
						["meal_sent", "meal_time", "Meal"],
						["rest1_sent", "rest1_time", "Rest"],
						["rest2_sent", "rest2_time", "Rest"],
					]) {
						if (!c[t] || c[f]) continue;
						let st = breakState(c, c[t], f);
						if (st === "late")
							out.push({
								severity: "urgent",
								text: `${c.name}'s ${l.toLowerCase()} is ${breakCountdownText(c, c[t], f)}.`,
								action: "Send now",
								run: `toggleBreak(${c.id},'${f}')`,
								rank: 2,
							});
						else if (st === "due")
							out.push({
								severity: "warn",
								text: `${c.name}'s ${l.toLowerCase()} is ${breakCountdownText(c, c[t], f)}.`,
								action: "Open breaks",
								run: `showPage('breaks')`,
								rank: 10,
							});
					}
					let fit = assignedSkillFit(c);
					if (fit?.profile && fit.score < fit.min)
						out.push({
							severity: "warn",
							text: `${c.name} is ${fit.score}/5 in ${c.station}; recommended ${fit.min}+.`,
							action: "Find move",
							run: `openMoveModal(${c.id})`,
							rank: 26,
						});
				}
				for (let a of AREA_DEFS) {
					let cov = areaCoverage(a.key, spw);
					if (
						cov.state === "critical" &&
						spw.crew.some((c) => c.area === a.key)
					)
						out.push({
							severity: "urgent",
							text: `${a.key} coverage is critical (${cov.score}/100).`,
							action: "Review",
							run: `showPage('build')`,
							rank: 6,
						});
					else if (
						cov.state === "thin" &&
						spw.crew.some((c) => c.area === a.key)
					)
						out.push({
							severity: "warn",
							text: `${a.key} coverage is thin (${cov.score}/100).`,
							action: "Review",
							run: `showPage('build')`,
							rank: 30,
						});
				}
				let staff = hourlyStaffing(spw),
					hi = currentHourIndex(spw);
				if (hi >= 0) {
					let x = staff[hi];
					if (x?.sales > 0 && x.spch < 145)
						out.push({
							severity: "warn",
							text: `Current-hour SPCH is ${x.spch.toFixed(0)}, below 145 target.`,
							action: "Results",
							run: `showPage('results')`,
							rank: 22,
						});
				}
				let defs = FOOD_SAFETY_DEFS[spw.shift_type] || [];
				for (let d of defs) {
					let st = fsState(d.id);
					if (st.done) continue;
					let due = d.due || d.target;
					if (!due) continue;
					let when = shiftDateTimeForClock(due, spw);
					if (when) {
						let minsLeft = Math.round((when - Date.now()) / 60000);
						if (minsLeft < 0)
							out.push({
								severity: "urgent",
								text: `Food Safety: ${d.label} is ${Math.abs(minsLeft)}m overdue.`,
								action: "Open",
								run: `showPage('food')`,
								rank: 1,
							});
						else if (minsLeft <= 10)
							out.push({
								severity: "warn",
								text: `Food Safety: ${d.label} due in ${minsLeft}m.`,
								action: "Open",
								run: `showPage('food')`,
								rank: 9,
							});
					}
				}
				return out.sort((a, b) => a.rank - b.rank);
			}
			function collectAlerts(spw = currentSpw) {
				let a = smartAlerts(spw);
				if (!a.length)
					return [
						{
							good: true,
							severity: "good",
							text: "No current automatic flags.",
							rank: 99,
						},
					];
				return a.map((x) => ({
					...x,
					bad: x.severity === "urgent" || x.severity === "warn",
					good: x.severity === "good",
				}));
			}
			function renderAlerts(limit = 8) {
				return collectAlerts()
					.slice(0, limit)
					.map(
						(a) =>
							`<div class="alert ${a.severity || ""}"><div>${esc(a.text)}</div>${a.action ? `<button class="btn sm alert-action" onclick="${a.run}">${esc(a.action)}</button>` : ""}</div>`,
					)
					.join("");
			}
			setInterval(refreshDynamicTimeUi, 30000);

