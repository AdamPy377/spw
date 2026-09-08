			function profileFlagBadges(p) {
				let f = p?.flags || {},
					out = [];
				if (f.can_train)
					out.push('<span class="profile-badge">Can train</span>');
				if (f.trainee)
					out.push('<span class="profile-badge">Trainee</span>');
				if (f.area_leader)
					out.push(
						'<span class="profile-badge gold">★ Area leader</span>',
					);
				if (f.crew_trainer)
					out.push(
						'<span class="profile-badge gold">Crew trainer</span>',
					);
				if (f.prefers)
					out.push(
						`<span class="profile-badge">Prefers ${esc(f.prefers)}</span>`,
					);
				return out.join("");
			}
			function renderSkillsLoaded() {
				let el = $("page-skills");
				if (!selectedProfile && profiles.length)
					selectedProfile = profiles[0].id;
				let p = profiles.find((x) => x.id === selectedProfile),
					names = profiles
						.map((x) => `<option value="${esc(x.name)}"></option>`)
						.join("");
				el.innerHTML =
					pageHero(
						"Crew & Skills",
						"Persistent profile IDs, editable names, skills and operational flags",
					) +
					`<div class="card"><div class="row"><div class="field"><label>Find or add crew profile</label><input id="profile-new" list="profile-names" placeholder="Start typing a crew name" oninput="profileNameLookup()" onkeydown="if(event.key==='Enter'){event.preventDefault();newProfile()}"><datalist id="profile-names">${names}</datalist><div id="profile-match" class="profile-match">Type an existing name to open it, or a new name to create one.</div></div><button class="btn primary" onclick="newProfile()">Open / Add profile</button>${currentSpw ? '<button class="btn dark" onclick="renderRecommendations()">Optimise positioning</button>' : ""}</div></div><div id="recommendations"></div><div class="skill-layout"><div class="card"><h2>Crew profiles</h2><div class="profile-list">${profiles.length ? profiles.map((x) => `<button class="profile-btn ${x.id === selectedProfile ? "active" : ""}" onclick="selectProfile(${x.id})"><strong>${esc(x.name)}</strong><div class="profile-badges">${profileFlagBadges(x)}</div></button>`).join("") : '<span class="muted small">No profiles yet.</span>'}</div></div><div class="card">${p ? profileEditor(p) : '<div class="muted">Add a crew profile to begin.</div>'}</div></div>`;
			}
			function profileEditor(p) {
				let groups = [...new Set(SIMPLE_SKILLS.map((x) => x.group))],
					f = p.flags || {};
				return `<div class="row"><div class="field" style="margin:0;min-width:220px"><label>Editable profile name</label><input id="profile-name-edit" class="profile-name-edit" value="${esc(p.name)}" oninput="saveProfileDebounced(${p.id})"></div><span style="flex:1"></span><button class="btn danger sm" onclick="deleteProfile(${p.id})">Delete profile</button></div><div class="profile-badges">${profileFlagBadges(p)}</div><div class="field" style="margin:10px 0"><label>Experience / notes</label><textarea id="profile-notes" oninput="saveProfileDebounced(${p.id})">${esc(p.notes || "")}</textarea></div><div class="rules" style="margin-bottom:10px">Profile ID #${p.id} stays stable if the name changes. Linked shift records follow profile renames.</div><div class="flag-row">${PROFILE_FLAG_DEFS.map((x) => `<label class="flag-toggle"><input type="checkbox" id="flag-${x.key}" ${f[x.key] ? "checked" : ""} onchange="saveProfileDebounced(${p.id})"><span>${esc(x.label)}</span></label>`).join("")}</div><div class="field" style="margin:8px 0 14px"><label>Prefers area</label><select id="flag-prefers" onchange="saveProfileDebounced(${p.id})"><option value="">No preference</option>${AREA_DEFS.map((a) => `<option value="${esc(a.key)}" ${f.prefers === a.key ? "selected" : ""}>${esc(a.key)}</option>`).join("")}</select></div><div class="rules" style="margin-bottom:10px">0 = not trained · 1 = learning · 2 = basic · 3 = independent · 4 = strong · 5 = expert/ideal.</div>${groups
					.map(
						(g) =>
							`<div class="skill-group"><h3>${esc(g)}</h3>${SIMPLE_SKILLS.filter(
								(x) => x.group === g,
							)
								.map((sk) => {
									let v = skillValue(p, sk.key);
									return `<div class="skill-simple-row"><div><strong>${esc(sk.label)}</strong></div><div class="rating-buttons" data-skill-group="${esc(sk.key)}">${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" class="rating-btn ${v === n ? "active" : ""}" onclick="setSkillRating(${p.id},'${sk.key}',${n},this)">${n}</button>`).join("")}</div></div>`;
								})
								.join("")}</div>`,
					)
					.join("")}`;
			}
			async function saveProfileNow(id) {
				let p = profiles.find((x) => x.id === id);
				if (!p) return;
				let oldName = p.name;
				p.name = $("profile-name-edit")?.value.trim() || p.name;
				p.notes = $("profile-notes")?.value || p.notes || "";
				p.flags = p.flags || {};
				for (let d of PROFILE_FLAG_DEFS)
					p.flags[d.key] = !!$(`flag-${d.key}`)?.checked;
				p.flags.prefers = $("flag-prefers")?.value || "";
				try {
					await api(`/api/profiles/${id}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(p),
					});
					for (let c of currentSpw?.crew || [])
						if (Number(c.profile_id) === Number(id))
							c.name = p.name;
					setAutosave("Profile saved ✓");
					cacheJson("/api/profiles", profiles);
				} catch (e) {
					p.name = oldName;
					setAutosave("Profile save failed", "bad");
					toast(e.message || "Could not save profile");
				}
			}
			async function deleteProfile(id) {
				let p = profiles.find((x) => x.id === id);
				if (!p) return;
				if (
					!(await confirmDialog(
						"Delete profile",
						`Delete ${p.name}'s crew profile? Shift crew records will remain.`,
						"Delete",
						true,
					))
				)
					return;
				await api(`/api/profiles/${id}`, { method: "DELETE" });
				if (selectedProfile === id) selectedProfile = null;
				await loadProfiles();
				renderSkillsLoaded();
			}

			function recommendationValue(c, p, slot) {
				let q = positionSkillScore(p, slot),
					v = q.fit;
				let flags = p?.flags || {};
				if (flags.prefers === slot.area) v += 10;
				if (flags.trainee && q.min >= 4) v -= 18;
				if ((flags.crew_trainer || flags.can_train) && q.score >= q.min)
					v += 4;
				if (flags.area_leader && q.score >= q.min) v += 3;
				if (c.area === slot.area && c.station === slot.position) v += 5;
				let critical = (ESSENTIAL_POSITIONS[slot.area] || []).includes(
					slot.position,
				);
				if (critical) v += q.score >= q.min ? 24 : -15;
				return { ...q, value: v };
			}
			function hungarianMax(matrix) {
				let n = matrix.length,
					m = matrix[0]?.length || 0,
					N = Math.max(n, m),
					maxV = 0;
				for (let r of matrix) for (let v of r) maxV = Math.max(maxV, v);
				let a = Array.from({ length: N }, (_, i) =>
					Array.from(
						{ length: N },
						(_, j) => maxV - (matrix[i]?.[j] ?? 0),
					),
				);
				let u = Array(N + 1).fill(0),
					v = Array(N + 1).fill(0),
					p = Array(N + 1).fill(0),
					way = Array(N + 1).fill(0);
				for (let i = 1; i <= N; i++) {
					p[0] = i;
					let j0 = 0,
						minv = Array(N + 1).fill(Infinity),
						used = Array(N + 1).fill(false);
					do {
						used[j0] = true;
						let i0 = p[j0],
							delta = Infinity,
							j1 = 0;
						for (let j = 1; j <= N; j++)
							if (!used[j]) {
								let cur = a[i0 - 1][j - 1] - u[i0] - v[j];
								if (cur < minv[j]) {
									minv[j] = cur;
									way[j] = j0;
								}
								if (minv[j] < delta) {
									delta = minv[j];
									j1 = j;
								}
							}
						for (let j = 0; j <= N; j++)
							if (used[j]) {
								u[p[j]] += delta;
								v[j] -= delta;
							} else minv[j] -= delta;
						j0 = j1;
					} while (p[j0] !== 0);
					do {
						let j1 = way[j0];
						p[j0] = p[j1];
						j0 = j1;
					} while (j0);
				}
				let ans = Array(n).fill(-1);
				for (let j = 1; j <= N; j++)
					if (p[j] && p[j] - 1 < n && j - 1 < m)
						ans[p[j] - 1] = j - 1;
				return ans;
			}
			function recommendPositions() {
				if (!currentSpw) return [];
				let crew = currentSpw.crew.map((c) => ({
						c,
						p: profileForCrew(c),
					})),
					slots = [...ALL_POSITIONS],
					matrix = crew.map((x) =>
						slots.map(
							(slot) => recommendationValue(x.c, x.p, slot).value,
						),
					);
				let assignment = hungarianMax(matrix);
				return crew.map((x, i) => {
					let j = assignment[i];
					if (j < 0)
						return {
							c: x.c,
							slot: null,
							score: 0,
							min: 0,
							fit: 0,
							value: 0,
						};
					let slot = slots[j],
						q = recommendationValue(x.c, x.p, slot);
					if (q.score <= 0)
						return {
							c: x.c,
							slot: null,
							score: 0,
							min: 0,
							fit: 0,
							value: 0,
						};
					return {
						c: x.c,
						slot,
						score: q.score,
						min: q.min,
						fit: q.fit,
						value: q.value,
					};
				});
			}
			function renderRecommendations() {
				let el = $("recommendations"),
					r = recommendPositions();
				el.innerHTML = `<div class="card"><div class="row"><div><h2>Whole-board positioning optimiser</h2><div class="small muted">Optimises all crew together instead of greedily filling one position at a time. It considers skills, essential positions, current placement, trainee status, trainer/leader capability and preferred area.</div></div><span style="flex:1"></span><button class="btn primary" onclick="applyRecommendations()">Apply all</button></div><div class="rec-grid" style="margin-top:10px">${r.map((x) => `<div class="rec"><strong>${esc(x.c.name)}</strong><div>${x.slot ? `${esc(x.slot.area)} — ${esc(x.slot.position)}` : "No rated position found"}</div><div class="score">Strength ${x.slot ? positionStrength({ ...x.c, area: x.slot.area, station: x.slot.position }).score : 0}/100 · skill ${x.score}/5${x.slot ? ` · recommended ${x.min}+` : ""}</div></div>`).join("")}</div></div>`;
			}
			async function applyRecommendations() {
				let r = recommendPositions(),
					changed = [],
					old = [];
				for (let x of r) {
					if (!x.slot) continue;
					old.push({
						id: x.c.id,
						area: x.c.area,
						station: x.c.station,
						sort_order: x.c.sort_order,
					});
					x.c.area = x.slot.area;
					x.c.station = x.slot.position;
					changed.push(x.c);
				}
				renderBuild();
				try {
					await bulkUpdateCrew(changed);
					pushUndo(
						"Positioning recommendations applied",
						async () => {
							for (let o of old) {
								let c = currentSpw.crew.find(
									(x) => x.id === o.id,
								);
								if (c) Object.assign(c, o);
							}
							await bulkUpdateCrew(changed);
							renderBuild();
						},
					);
					setAutosave("Recommendations saved ✓");
				} catch (e) {
					setAutosave("Recommendation save failed", "bad");
					toast(e.message);
				}
			}

