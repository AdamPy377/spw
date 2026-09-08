			function salesTable(spw, editable = false) {
				let st = hourlyStaffing(spw),
					cur = currentHourIndex(spw);
				let td = (i, html, extra = "") =>
					`<td class="${i === cur ? "current-hour " : ""}${extra}">${html}</td>`;
				return `<div class="sales-wrap"><table class="sales"><tr><td class="rowhead">Time</td>${spw.hours.map((h, i) => `<th class="${i === cur ? "current-hour" : ""}">${h}${i === cur ? " · NOW" : ""}</th>`).join("")}</tr><tr><td class="rowhead">Projected Sales</td>${spw.projected.map((v, i) => td(i, editable ? `<input inputmode="decimal" value="${esc(v)}" oninput="currentSpw.projected[${i}]=this.value;scheduleSave();updateSalesMetricsCells()">` : esc(v || "—"))).join("")}</tr><tr><td class="rowhead">Actual Sales</td>${spw.actual.map((v, i) => td(i, editable ? `<input inputmode="decimal" value="${esc(v)}" oninput="currentSpw.actual[${i}]=this.value;scheduleSave();updateSalesMetricsCells()">` : esc(v || "—"))).join("")}</tr><tr><td class="rowhead">Crew Hours</td>${st.map((x, i) => td(i, x.count.toFixed(2).replace(/\.00$/, "").replace(/0$/, ""))).join("")}</tr><tr><td class="rowhead">SPCH <span class="muted">145+</span></td>${st
					.map((x, i) => {
						let has = x.sales > 0,
							cls = !has ? "na" : x.spch >= 145 ? "good" : "bad";
						return td(
							i,
							has && x.count ? x.spch.toFixed(0) : "—",
							`spch ${cls}`,
						);
					})
					.join("")}</tr></table></div>`;
			}

			function defaultTaskCategory(label) {
				if (/food safety|shake\s*\/\s*sundae/i.test(label))
					return "Food Safety";
				if (/ebos|stocktake/i.test(label)) return "Admin";
				if (/clean|wash|filter|grill close|fry station/i.test(label))
					return "Cleaning";
				if (/stock/i.test(label)) return "Stock";
				return "Operations";
			}
			function defaultShiftTasks() {
				return (SHIFT_TASK_DEFS[currentSpw.shift_type] || []).map(
					(label, i) => ({
						id: `default_${i}`,
						label,
						category: defaultTaskCategory(label),
						custom: false,
					}),
				);
			}
			async function toggleShiftTask(id, btn = null) {
				let key = `task:${id}`;
				if (actionLocks.has(key)) return;
				actionLocks.add(key);
				let store = taskStore(),
					old = {
						...(store.items[id] || { done: false, done_at: "" }),
					},
					done = !old.done;
				store.items[id] = {
					done,
					done_at: done ? localIsoMinute() : "",
				};
				refreshTaskButtons(id);
				try {
					await saveSpw(true);
					pushUndo(
						`${done ? "Completed" : "Reopened"} task`,
						async () => {
							store.items[id] = old;
							await saveSpw(true);
							renderShiftTasks();
						},
					);
					if (currentPage === "tasks") renderShiftTasks();
				} catch (e) {
					store.items[id] = old;
					refreshTaskButtons(id);
					toast(e.message);
				} finally {
					actionLocks.delete(key);
				}
			}
			async function addShiftTask() {
				let input = $("new-shift-task"),
					label = input?.value.trim();
				if (!label) return;
				let store = taskStore(),
					item = {
						id: `custom_${Date.now()}`,
						label,
						category: $("new-task-category")?.value || "Operations",
						custom: true,
					};
				store.custom.push(item);
				input.value = "";
				renderShiftTasks();
				try {
					await saveSpw(true);
				} catch (e) {
					store.custom = store.custom.filter((x) => x.id !== item.id);
					renderShiftTasks();
				}
			}
			async function deleteShiftTask(id) {
				let store = taskStore(),
					item = store.custom.find((x) => x.id === id);
				if (!item) return;
				if (
					!(await confirmDialog(
						"Delete task",
						`Delete “${item.label}”?`,
						"Delete",
						true,
					))
				)
					return;
				let oldCustom = [...store.custom],
					oldItem = store.items[id];
				store.custom = store.custom.filter((x) => x.id !== id);
				delete store.items[id];
				renderShiftTasks();
				try {
					await saveSpw(true);
					pushUndo("Task deleted", async () => {
						store.custom = oldCustom;
						if (oldItem) store.items[id] = oldItem;
						await saveSpw(true);
						renderShiftTasks();
					});
				} catch (e) {
					store.custom = oldCustom;
					if (oldItem) store.items[id] = oldItem;
					renderShiftTasks();
				}
			}
function renderShiftTasks() {
    const el = $("page-tasks");
    if (!currentSpw) { el.innerHTML = pageHero("Shift Tasks") + buildPicker(); return; }
    const store = taskStore();
    const all = [...defaultShiftTasks(), ...store.custom];
    const items = showCompletedTasks ? all : all.filter((t) => !store.items[t.id]?.done);
    const done = all.filter((t) => store.items[t.id]?.done).length;
    el.innerHTML = pageHero("Shift Tasks", `${done}/${all.length} complete · outstanding shown by default`) +
        cashCriticalCard() +
        `<div class="card"><div class="task-toolbar"><span class="pill ${done === all.length && all.length ? "ok" : "warn"}">${all.length - done} outstanding</span><button class="btn sm" onclick="showCompletedTasks=!showCompletedTasks;renderShiftTasks()">${showCompletedTasks ? "Hide completed" : `Show completed (${done})`}</button></div><div class="check-list">${items.length ? items.map((t) => { const st = store.items[t.id] || {}; return `<div class="task-wrap ${t.custom ? "has-delete" : "no-delete"}"><button class="check-row ${st.done ? "done" : ""}" data-task-id="${t.id}" onclick="toggleShiftTask('${t.id}',this)"><span class="check-box">${st.done ? "✓" : ""}</span><span class="check-copy"><span class="task-category">${esc(t.category || defaultTaskCategory(t.label))}</span><strong>${esc(t.label)}</strong><span>${st.done ? esc(taskTimeText(st.done_at)) : "Tap to complete"}</span></span></button>${t.custom ? `<button class="task-delete" onclick="deleteShiftTask('${t.id}')">✕</button>` : ""}</div>`; }).join("") : '<div class="task-empty">Nothing outstanding. Nice work.</div>'}</div></div><div class="card"><h2>Add task for this shift</h2><div class="row"><div class="field"><label>Category</label><select id="new-task-category">${TASK_CATEGORIES.map((x) => `<option>${x}</option>`).join("")}</select></div><div class="field" style="flex:2"><label>Task</label><input id="new-shift-task" placeholder="Task name" onkeydown="if(event.key==='Enter')addShiftTask()"></div><button class="btn primary" onclick="addShiftTask()">Add Task</button></div></div>`;
}

			async function toggleFoodSafety(id, btn = null) {
				let key = `fs:${id}`;
				if (actionLocks.has(key)) return;
				let def = (FOOD_SAFETY_DEFS[currentSpw.shift_type] || []).find(
					(x) => x.id === id,
				);
				if (!def || !fsAvailable(def)) return;
				actionLocks.add(key);
				let old = { ...fsState(id) },
					done = !old.done;
				if (
					old.done &&
					!(await confirmDialog(
						"Reopen food-safety item",
						`Mark ${def.label} incomplete?`,
						"Reopen",
						true,
					))
				) {
					actionLocks.delete(key);
					return;
				}
				currentSpw.food_safety[id] = {
					done,
					done_at: done ? localIsoMinute() : "",
				};
				refreshFoodSafetyButtons();
				try {
					await saveSpw(true);
					pushUndo(
						`${def.label} ${done ? "completed" : "reopened"}`,
						async () => {
							currentSpw.food_safety[id] = old;
							await saveSpw(true);
							refreshFoodSafetyButtons();
						},
					);
				} catch (e) {
					currentSpw.food_safety[id] = old;
					refreshFoodSafetyButtons();
					toast(e.message);
				} finally {
					actionLocks.delete(key);
				}
			}

