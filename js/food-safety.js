			function taskTimeText(v) {
				return v ? `Done ${fmtDateTime(v)}` : "";
			}
			function fsState(id) {
				return (
					currentSpw.food_safety?.[id] || { done: false, done_at: "" }
				);
			}
			function shiftDateTimeForClock(clock, spw = currentSpw) {
				if (!clock || !spw?.shift_date) return null;
				let d = parseShiftDate(spw.shift_date),
					m = mins(clock);
				if (spw.shift_type === "Overnight" && m < 12 * 60)
					d.setDate(d.getDate() + 1);
				d.setHours(Math.floor(m / 60), m % 60, 0, 0);
				return d;
			}
			function fsAvailable(def) {
				if (def.requires?.some((id) => !fsState(id).done)) return false;
				if (!def.available) return true;
				let when = shiftDateTimeForClock(def.available, currentSpw);
				return when ? Date.now() >= when.getTime() : true;
			}
			function foodMeta(def) {
				let out = [];
				if (def.due) out.push(`Before ${fmtTime(def.due)}`);
				if (def.target) out.push(`Around ${fmtTime(def.target)}`);
				if (def.available)
					out.push(`Available ${fmtTime(def.available)}`);
				if (def.requires?.length) out.push("Prerequisite required");
				return out.join(" · ");
			}
			function renderFoodSafety() {
				let el = $("page-food");
				if (!currentSpw) {
					el.innerHTML = pageHero("Food Safety") + buildPicker();
					return;
				}
				let defs = FOOD_SAFETY_DEFS[currentSpw.shift_type] || [];
				if (!defs.length) {
					el.innerHTML =
						pageHero(
							"Food Safety",
							`${currentSpw.shift_type} has no automatic food-safety checklist configured.`,
						) +
						'<div class="card muted">No food safety items for this shift.</div>';
					return;
				}
				let groups = [...new Set(defs.map((x) => x.group))];
				el.innerHTML =
					pageHero(
						"Food Safety",
						"Shift-specific checklist. Completion times use this device’s local time.",
					) +
					groups
						.map(
							(g) =>
								`<div class="card"><h2>${esc(g)}</h2><div class="check-list">${defs
									.filter((x) => x.group === g)
									.map((d) => {
										let st = fsState(d.id),
											avail = fsAvailable(d);
										return `<button class="check-row ${st.done ? "done" : ""} ${!avail ? "locked" : ""}" ${!avail ? "disabled" : ""} data-fs-id="${d.id}" onclick="toggleFoodSafety('${d.id}',this)"><span class="check-box">${st.done ? "✓" : ""}</span><span class="check-copy"><strong>${esc(d.label)}</strong><span>${esc(foodMeta(d))}${!avail ? " · Locked until prerequisite/time is met" : ""}</span></span><span class="check-time">${st.done ? esc(taskTimeText(st.done_at)) : ""}</span></button>`;
									})
									.join("")}</div></div>`,
						)
						.join("");
			}
			function taskStore() {
				currentSpw.tasks = currentSpw.tasks || {};
				currentSpw.tasks.items = currentSpw.tasks.items || {};
				currentSpw.tasks.custom = currentSpw.tasks.custom || [];
				return currentSpw.tasks;
			}
