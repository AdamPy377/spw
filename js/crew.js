			function profileOptions(selected = "") {
				return `<option value="">No linked profile</option>${profiles.map((p) => `<option value="${p.id}" ${Number(p.id) === Number(selected) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}`;
			}
			function syncCrewProfileChoice() {
				let id = Number($("m-profile")?.value || 0),
					p = profiles.find((x) => x.id === id);
				if (p && $("m-name")) $("m-name").value = p.name;
			}
function normaliseAssignments(items = []) {
    return (Array.isArray(items) ? items : []).map((a) => ({
        mode: a?.mode === "position" ? "position" : "flex",
        area: String(a?.area || ""),
        station: String(a?.station || ""),
        start: String(a?.start || ""),
        end: String(a?.end || ""),
    })).filter((a) => a.area);
}
function assignmentStationOptions(area, selected = "", allowAny = false) {
    const def = AREA_DEFS.find((a) => a.key === area);
    const blank = allowAny ? '<option value="">Any capable position</option>' : '<option value="">Choose position</option>';
    return blank + (def?.positions || []).map((pos) => `<option value="${esc(pos)}" ${pos === selected ? "selected" : ""}>${esc(pos)}</option>`).join("");
}
function assignmentRowHtml(a = {}, index = 0) {
    const item = { mode: a.mode === "position" ? "position" : "flex", area: a.area || "", station: a.station || "", start: a.start || "", end: a.end || "" };
    return `<div class="assignment-row" data-assignment-row="${index}"><div class="field"><label>Type</label><select class="assignment-mode" onchange="assignmentModeChanged(this)"><option value="flex" ${item.mode === "flex" ? "selected" : ""}>Flex</option><option value="position" ${item.mode === "position" ? "selected" : ""}>Position</option></select></div><div class="field"><label>Area</label><select class="assignment-area" onchange="assignmentAreaChanged(this)"><option value="">Choose area</option>${AREA_DEFS.map((d) => `<option value="${esc(d.key)}" ${d.key === item.area ? "selected" : ""}>${esc(d.key)}</option>`).join("")}</select></div><div class="field assignment-wide"><label>Position</label><select class="assignment-station">${assignmentStationOptions(item.area, item.station, item.mode === "flex")}</select></div><div class="field"><label>From</label><input class="assignment-start" type="time" step="900" value="${esc(item.start)}" onchange="snapTimeInput(this,15)"></div><div class="field"><label>Until</label><input class="assignment-end" type="time" step="900" value="${esc(item.end)}" onchange="snapTimeInput(this,15)"></div><button class="btn sm danger assignment-remove" type="button" onclick="this.closest('.assignment-row').remove()">Remove</button></div>`;
}
function addAssignmentRow(mode = "flex") {
    const list = $("assignment-list");
    if (!list) return;
    const index = list.querySelectorAll(".assignment-row").length;
    list.insertAdjacentHTML("beforeend", assignmentRowHtml({ mode }, index));
}
function assignmentModeChanged(select) {
    const row = select.closest(".assignment-row");
    const area = row.querySelector(".assignment-area").value;
    const station = row.querySelector(".assignment-station");
    station.innerHTML = assignmentStationOptions(area, station.value, select.value === "flex");
}
function assignmentAreaChanged(select) {
    const row = select.closest(".assignment-row");
    const mode = row.querySelector(".assignment-mode").value;
    row.querySelector(".assignment-station").innerHTML = assignmentStationOptions(select.value, "", mode === "flex");
}
function collectAssignments() {
    return [...document.querySelectorAll("#assignment-list .assignment-row")].map((row) => ({
        mode: row.querySelector(".assignment-mode").value,
        area: row.querySelector(".assignment-area").value,
        station: row.querySelector(".assignment-station").value,
        start: row.querySelector(".assignment-start").value,
        end: row.querySelector(".assignment-end").value,
    })).filter((a) => a.area);
}
function crewAssignmentSummary(c) {
    const bits = [];
    if (c?.secondary_flex) bits.push(`<span>${esc(c.secondary_flex)}</span>`);
    for (const a of normaliseAssignments(c?.assignments)) {
        const time = a.start || a.end ? `${a.start ? fmtTime(a.start) : "start"}–${a.end ? fmtTime(a.end) : "end"} ` : "";
        const cls = a.mode === "position" ? "position-tag" : "flex-tag";
        const prefix = a.mode === "position" ? "→" : "Flex";
        bits.push(`<span class="${cls}">${esc(`${time}${prefix} ${a.area}${a.station ? ` · ${a.station}` : ""}`)}</span>`);
    }
    const handover = crewHandoverBadge(c);
    return bits.length || handover ? `<div class="assignment-summary">${bits.join("")}${handover}</div>` : "";
}
function openCrewModal(id = null) {
    if (!currentSpw) return;
    const c = id ? currentSpw.crew.find((x) => x.id === id) : null;
    const area = c?.area || "", station = c?.station || "";
    const assignments = normaliseAssignments(c?.assignments);
    const nativeTime = (id, label, value, step, preview = false) =>
        `<div class="field"><label>${label}</label><input id="${id}" type="time" step="${step * 60}" value="${esc(value || "")}" onchange="snapTimeInput(this,${step});${preview ? "previewBreakPlan();" : ""}"></div>`;
    $("modal").innerHTML = `<div class="modal-box"><div class="modal-head"><h2>${c ? "Edit" : "Add"} crew member</h2><button class="btn sm" onclick="closeModal()">✕</button></div><div class="form-grid"><div class="field full"><label>Crew profile</label><select id="m-profile" onchange="syncCrewProfileChoice()">${profileOptions(c?.profile_id || profileForCrew(c)?.id || "")}</select></div><div class="field full"><label>Name</label><input id="m-name" value="${esc(c?.name || "")}" list="crew-name-list"><datalist id="crew-name-list">${profiles.map((p) => `<option value="${esc(p.name)}"></option>`).join("")}</datalist></div><div class="field"><label>Base area</label><select id="m-area" onchange="refreshModalStations()"><option value="">Unpositioned</option>${AREA_DEFS.map((a) => `<option ${a.key === area ? "selected" : ""}>${a.key}</option>`).join("")}</select></div><div class="field"><label>Base position</label><select id="m-station"></select></div><div class="field full"><label>Secondary / notes</label><input id="m-flex" value="${esc(c?.secondary_flex || "")}"></div>${nativeTime("m-start","Shift start · 15m",c?.shift_start,15,true)}${nativeTime("m-end","Shift end · 15m",c?.shift_end,15,true)}${nativeTime("m-meal","Meal · 15m",c?.meal_time,15)}${nativeTime("m-rest1","Rest 1 · 5m",c?.rest1_time,5)}${nativeTime("m-rest2","Rest 2 · 5m",c?.rest2_time,5)}<div class="full rules" id="break-preview">Enter start/end to auto-build the break plan.</div><div class="full"><label style="display:block;font-size:11px;font-weight:800;color:#9ca3ad;margin-bottom:4px">Position changes & flex coverage</label><div class="small muted">Position blocks temporarily replace the base position. Flex entries add backup coverage without moving the crew member. Leave times blank for the whole shift.</div><div id="assignment-list" class="assignment-editor">${assignments.map(assignmentRowHtml).join("")}</div><div class="assignment-actions"><button class="btn sm" type="button" onclick="addAssignmentRow('position')">+ Position block</button><button class="btn sm" type="button" onclick="addAssignmentRow('flex')">+ Flex coverage</button></div></div><div class="full row"><button class="btn primary" onclick="autoFillBreaks()">Auto schedule breaks</button><span style="flex:1"></span>${c ? `<button class="btn danger" onclick="deleteCrew(${c.id})">Delete</button>` : ""}<button class="btn dark" onclick="saveCrewModal(${c?.id || "null"})">Save</button></div></div></div>`;
    $("modal").classList.remove("hidden");
    refreshModalStations(station);
    previewBreakPlan();
}

			function modalCrewDraft() {
				let n = $("m-name").value.trim(),
					p = findProfileByName(n),
					selected = Number($("m-profile")?.value || 0);
				return {
					name: n,
					profile_id: selected || p?.id || null,
					area: $("m-area").value,
					station: $("m-station").value,
					secondary_flex: $("m-flex").value.trim(),
					shift_start: $("m-start").value,
					shift_end: $("m-end").value,
					meal_time: $("m-meal").value,
					rest1_time: $("m-rest1").value,
					rest2_time: $("m-rest2").value,
					assignments: collectAssignments(),
				};
			}
			async function saveCrewModal(id) {
				let d = modalCrewDraft();
				if (!d.name) {
					toast("Enter a crew name");
					return;
				}
				let p = breakPlan(d);
				d.rest_count = p.rest_count;
				if (p.meal_required && !d.meal_time) d.meal_time = p.meal;
				if (p.rest_count >= 1 && !d.rest1_time) d.rest1_time = p.rest1;
				if (p.rest_count >= 2 && !d.rest2_time) d.rest2_time = p.rest2;
				if (p.rest_count < 2) d.rest2_time = "";
				if (p.rest_count < 1) d.rest1_time = "";
				d.sort_order = 0;
				if (id) {
					let c = currentSpw.crew.find((x) => x.id === id),
						old = { ...c };
					Object.assign(c, d);
					try {
						await updateCrew(c);
						cacheCurrentSpw();
						pushUndo(`${c.name} updated`, async () => {
							Object.assign(c, old);
							await updateCrew(c);
							rerenderLocalPreserveScroll(currentPage);
						});
					} catch (e) {
						Object.assign(c, old);
						toast(e.message);
						return;
					}
				} else {
					if (!navigator.onLine) {
						toast(
							"Adding new crew requires a connection so SPW can assign an ID",
						);
						return;
					}
					d.spw_id = currentSpw.id;
					let res = await api("/api/crew", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(d),
					});
					d.id = res.id;
					currentSpw.crew.push(d);
					cacheCurrentSpw();
				}
				closeModal();
				if (currentPage === "history") renderHistoryBody(currentSpw);
				else if (currentPage === "current") paintCurrent();
				else renderBuild();
			}
			async function deleteCrew(id) {
				let c = currentSpw?.crew.find((x) => x.id === id);
				if (!c) return;
				if (!navigator.onLine) {
					toast("Crew deletion requires a connection");
					return;
				}
				if (
					!(await confirmDialog(
						"Delete crew member",
						`Remove ${c.name} from this SPW?`,
						"Delete",
						true,
					))
				)
					return;
				let snapshot = { ...c, spw_id: currentSpw.id };
				await api(`/api/crew/${id}`, { method: "DELETE" });
				currentSpw.crew = currentSpw.crew.filter((x) => x.id !== id);
				for (let a of Object.keys(currentSpw.area_leaders || {}))
					if (Number(currentSpw.area_leaders[a]) === Number(id))
						delete currentSpw.area_leaders[a];
				closeModal();
				renderBuild();
				pushUndo(`${c.name} removed`, async () => {
					let r = await api("/api/crew", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(snapshot),
					});
					snapshot.id = r.id;
					currentSpw.crew.push(snapshot);
					renderBuild();
					toast("Crew restored");
				});
			}

			function openMoveModal(id) {
				let c = currentSpw?.crew.find((x) => x.id === id);
				if (!c) return;
				let area = c.area || AREA_DEFS[0].key;
				$("modal").innerHTML =
					`<div class="modal-box"><div class="modal-head"><h2>Move / swap ${esc(c.name)}</h2><button class="btn sm" onclick="closeModal()">✕</button></div><div class="form-grid"><div class="field"><label>Area</label><select id="move-area" onchange="refreshMoveStations(${id})">${AREA_DEFS.map((a) => `<option ${a.key === area ? "selected" : ""}>${a.key}</option>`).join("")}</select></div><div class="field"><label>Position</label><select id="move-station" onchange="previewMove(${id})"></select></div><div class="full rules" id="move-preview"></div><div class="full row"><button class="btn" onclick="openCrewModal(${id})">Full edit</button><span style="flex:1"></span><button class="btn primary" onclick="performMove(${id})">Move / Swap</button></div></div></div>`;
				$("modal").classList.remove("hidden");
				refreshMoveStations(id, c.station);
			}
			function refreshMoveStations(id, selected = "") {
				let area = $("move-area").value,
					def = AREA_DEFS.find((a) => a.key === area);
				$("move-station").innerHTML = (def?.positions || [])
					.map(
						(p) =>
							`<option ${p === selected ? "selected" : ""}>${esc(p)}</option>`,
					)
					.join("");
				previewMove(id);
			}
			function previewMove(id) {
				let c = currentSpw.crew.find((x) => x.id === id),
					area = $("move-area").value,
					station = $("move-station").value,
					occupants = currentSpw.crew.filter(
						(x) =>
							x.id !== id &&
							x.area === area &&
							x.station === station,
					);
				$("move-preview").innerHTML = occupants.length
					? `<b>${esc(station)}</b> is occupied by <b>${esc(occupants[0].name)}</b>. They will swap into ${c.station ? `<b>${esc(c.station)}</b>` : "Unpositioned"}.`
					: `Move <b>${esc(c.name)}</b> to <b>${esc(area)} — ${esc(station)}</b>.`;
			}
			async function performMove(id) {
				let c = currentSpw.crew.find((x) => x.id === id),
					area = $("move-area").value,
					station = $("move-station").value,
					old = {
						area: c.area,
						station: c.station,
						sort_order: c.sort_order,
					},
					other = currentSpw.crew.find(
						(x) =>
							x.id !== id &&
							x.area === area &&
							x.station === station,
					),
					otherOld = other
						? {
								area: other.area,
								station: other.station,
								sort_order: other.sort_order,
							}
						: null;
				c.area = area;
				c.station = station;
				if (other) {
					other.area = old.area;
					other.station = old.station;
					other.sort_order = old.sort_order;
				}
				let changed = other ? [c, other] : [c];
				await bulkUpdateCrew(changed);
				cacheCurrentSpw();
				closeModal();
				rerenderLocalPreserveScroll(currentPage);
				pushUndo(
					`${c.name} ${other ? `swapped with ${other.name}` : `moved to ${station}`}`,
					async () => {
						Object.assign(c, old);
						if (other) Object.assign(other, otherOld);
						await bulkUpdateCrew(changed);
						rerenderLocalPreserveScroll(currentPage);
					},
				);
			}
			async function dropCrew(e, area, station, order) {
				e.preventDefault();
				e.currentTarget.classList.remove("drop");
				let id = Number(
						e.dataTransfer.getData("text/plain") || dragCrewId,
					),
					c = currentSpw.crew.find((x) => x.id === id);
				if (!c) return;
				let old = {
						area: c.area,
						station: c.station,
						sort_order: c.sort_order,
					},
					other = currentSpw.crew.find(
						(x) =>
							x.id !== id &&
							x.area === area &&
							x.station === station,
					),
					otherOld = other
						? {
								area: other.area,
								station: other.station,
								sort_order: other.sort_order,
							}
						: null;
				c.area = area;
				c.station = station;
				c.sort_order = order;
				if (other) {
					other.area = old.area;
					other.station = old.station;
					other.sort_order = old.sort_order;
				}
				await bulkUpdateCrew(other ? [c, other] : [c]);
				renderBuild();
				pushUndo(
					`${c.name} ${other ? `swapped with ${other.name}` : "moved"}`,
					async () => {
						Object.assign(c, old);
						if (other) Object.assign(other, otherOld);
						await bulkUpdateCrew(other ? [c, other] : [c]);
						renderBuild();
					},
				);
			}
			function crewSlot(c, pos, area, idx) {
				let leader = isAreaLeader(c),
					strength = positionStrength(c), editable = buildCrewViewMinute == null;
				return `<div class="slot-row ${crewSkillClass(c)} ${leader ? "area-leader" : ""}" ${editable ? `ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropCrew(event,'${esc(area)}','${esc(pos)}',${idx})"` : ""}><div class="name"><div class="crew-chip" draggable="${editable}" ${editable ? `ondragstart="dragStart(event,${c.id})"` : ""}><span class="position-dot" style="background:${positionColour(area, pos)}"></span><span>${esc(c.name)}${leader ? '<span class="leader-star"> ★</span>' : ""}</span><span class="strength-pill">${strength.score}</span><span class="tools"><button class="leader-btn ${leader ? "active" : ""}" onclick="event.stopPropagation();toggleAreaLeader(${c.id})" title="Area leader">★</button><button class="move-btn" onclick="event.stopPropagation();openMoveModal(${c.id})" title="Move / swap">↔</button><button class="iconbtn" onclick="event.stopPropagation();openCrewModal(${c.id})" title="Edit">✎</button></span></div></div><div class="station ${stationSkillClass(c)}">${esc(pos)}</div><div class="secondary">${crewAssignmentSummary(c)}</div><div class="shift shift-cell">${fmtTime(c.shift_start)} – ${fmtTime(c.shift_end)}</div><div class="meal break-cell">${breakButton(c, "meal_sent", c.meal_time, "Meal")}</div><div class="rest1 break-cell">${breakButton(c, "rest1_sent", c.rest1_time, "Rest")}</div><div class="rest2 break-cell">${breakButton(c, "rest2_sent", c.rest2_time, "Rest")}</div></div>`;
			}

			function renderBuild() {
				let el = $("page-build");
				if (!currentSpw) {
					el.innerHTML =
						pageHero(
							"Build / Edit SPW",
							"Template-style positioning with desktop drag/drop and phone tap-to-move",
						) + buildPicker();
					return;
				}
				el.innerHTML =
					pageHero(
						"Build / Edit SPW",
						"Drag on desktop, or tap ↔ to move/swap on phone",
					) +
					buildPicker() +
					buildCrewViewOptions(currentSpw) +
					`<div class="card"><div class="row"><div class="field"><label>Shift Manager</label><input id="manager" value="${esc(currentSpw.shift_manager || "")}" oninput="syncHeaderFromDom();scheduleSave()"></div><button class="btn primary" onclick="openCrewModal()">+ Add crew</button></div></div><div class="card"><h2>Sales / Crew Hours / SPCH</h2><div class="small muted" style="margin-bottom:8px">Actual sales are best entered on Shift Results. Current hour is highlighted.</div><div id="sales-zone">${salesTable(currentSpw, true)}</div></div>${worksheet(currentSpw, true)}<div class="card"><h2>Area coverage</h2><div class="dashboard-grid">${AREA_DEFS.map(
						(a) => {
							let c = areaCoverage(a.key);
							return `<div class="metric"><div class="n">${c.score}</div><div class="l">${a.key} · ${c.state}</div><div class="metric-note">${esc(c.detail)}</div></div>`;
						},
					).join(
						"",
					)}</div></div><div class="card"><h2>Area goals</h2><div class="small muted">Reference targets for the shift.</div></div>${goalsEditor()}<div class="card"><h2>Shift Notes</h2><textarea id="notes" oninput="syncHeaderFromDom();scheduleSave()">${esc(currentSpw.notes || "")}</textarea></div>`;
			}
