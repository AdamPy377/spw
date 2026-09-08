			async function loadProfiles() {
				profiles = await api("/api/profiles");
			}
			function renderSkills() {
				let el = $("page-skills"),
					token = navRenderToken;
				el.innerHTML =
					pageHero(
						"Skills & Recommended Positioning",
						"All-time crew profiles — update a rating only when someone’s skill or experience changes",
					) + '<div class="card">Loading skills…</div>';
				loadProfiles()
					.then(() => {
						if (
							currentPage === "skills" &&
							token === navRenderToken
						)
							renderSkillsLoaded();
					})
					.catch((e) => console.error(e));
			}
			function legacySkillFallback(p, key) {
				let old = p.skills || {},
					vals = [];
				const add = (area, match) => {
					AREA_DEFS.find((a) => a.key === area)?.positions.forEach(
						(pos) => {
							if (match(pos)) {
								let v = Number(old[`${area}|||${pos}`] || 0);
								if (v) vals.push(v);
							}
						},
					);
				};
				if (key === "kitchen_initiator")
					add("Kitchen", (p) => /Initiator|Chaser Side 1/.test(p));
				if (key === "kitchen_assembler")
					add("Kitchen", (p) => /Assembler|Chaser Side 2/.test(p));
				if (key === "kitchen_grilled")
					add("Kitchen", (p) => /Grill/.test(p));
				if (key === "kitchen_fried")
					add("Kitchen", (p) => /Fried/.test(p));
				if (key === "dt_order_taking")
					add("Drive Thru", (p) => /OT|Cash/.test(p));
				if (key === "dt_assembling")
					add("Drive Thru", (p) => /Assembler|Coordinator/.test(p));
				if (key === "dt_presenting")
					add("Drive Thru", (p) => /Presenter|Expeditor/.test(p));
				if (key === "ir_assembler")
					add("In Restaurant", (p) => /Assembler|Expeditor/.test(p));
				if (key === "ir_presenter")
					add("In Restaurant", (p) => /Presenter/.test(p));
				if (key === "ir_order_taker")
					add("In Restaurant", (p) => /Order Taker/.test(p));
				if (key === "ir_drink_drawer")
					add("In Restaurant", (p) => /Drink Drawer/.test(p));
				if (key === "delivery_assembler")
					add("McDelivery", (p) => true);
				if (key === "cafe_coffee")
					add("McCafé", (p) => /Coffee/.test(p));
				if (key === "cafe_milk") add("McCafé", (p) => /Milk/.test(p));
				if (key === "cafe_food") add("McCafé", (p) => /Food/.test(p));
				if (key === "cafe_presenting")
					add("McCafé", (p) => /OT/.test(p));
				if (key === "beverage_all") add("Beverage Cell", (p) => true);
				if (key === "fries") add("Fries", (p) => true);
				if (key === "support") add("Support", (p) => true);
				return vals.length ? Math.min(5, Math.max(...vals) + 1) : 0;
			}
			function skillValue(p, key) {
				let v = p.skills?.[key];
				return v == null ? legacySkillFallback(p, key) : Number(v || 0);
			}
			function setSkillRating(id, key, value, btn) {
				let p = profiles.find((x) => x.id === id);
				if (!p) return;
				p.skills = p.skills || {};
				p.skills[key] = Number(value);
				btn.parentElement
					.querySelectorAll(".rating-btn")
					.forEach((b) => b.classList.toggle("active", b === btn));
				saveProfileDebounced(id);
			}
			function findProfileByName(n) {
				let q = String(n || "")
					.trim()
					.toLowerCase();
				return (
					profiles.find((p) => p.name.trim().toLowerCase() === q) ||
					null
				);
			}
			function profileNameLookup() {
				let input = $("profile-new"),
					msg = $("profile-match");
				if (!input || !msg) return;
				let n = input.value.trim(),
					p = findProfileByName(n);
				msg.classList.toggle("found", !!p);
				msg.textContent = p
					? `Existing profile found — ${p.name}. Open it to edit without changing any ratings.`
					: n
						? "No exact profile match — this will create a new profile."
						: "Type an existing name to open that profile, or a new name to create one.";
			}
			function selectProfile(id) {
				let y = window.scrollY,
					list = $("page-skills")?.querySelector(".profile-list"),
					listY = list?.scrollTop || 0;
				selectedProfile = id;
				renderSkillsLoaded();
				requestAnimationFrame(() => {
					window.scrollTo({ top: y, left: 0, behavior: "auto" });
					let next = $("page-skills")?.querySelector(".profile-list");
					if (next) next.scrollTop = listY;
				});
			}
			let profTimer = null;
			function saveProfileDebounced(id) {
				clearTimeout(profTimer);
				profTimer = setTimeout(() => saveProfileNow(id), 500);
			}
			function positionSkillScore(p, slot) {
				if (!p) return { score: 0, min: 0, fit: 0 };
				let r = POSITION_SKILL_RULES[slot.key];
				if (!r) return { score: 0, min: 0, fit: 0 };
				let vals = (r.keys || [r.key]).map((k) => skillValue(p, k));
				let score = vals.length ? Math.min(...vals) : 0;
				let fit =
					score >= r.min
						? 100 + (score - r.min) * 10
						: score * 10 - r.min * 5;
				return { score, min: r.min, fit };
			}
			function renderHistory() {
				let el = $("page-history");
				el.innerHTML =
					pageHero("View Saved SPW") +
					`<div class="card"><div class="picker"><div><label>Date</label><input id="history-date" type="date" value="${todayStr()}"></div><div><label>Shift</label><select id="history-type"><option>Day Shift</option><option>Night Shift</option><option>Overnight</option></select></div><button class="btn primary" onclick="loadHistory()">Show SPW</button></div></div><div id="history-body"></div>`;
			}
			function renderHistoryBody(spw = currentSpw) {
				let body = $("history-body");
				if (!body) return;
				if (!spw) {
					body.innerHTML =
						'<div class="card">No saved SPW for that date and shift.</div>';
					return;
				}
				body.innerHTML = `<div class="card"><h2>${esc(spw.shift_date)} · ${esc(spw.shift_type)}</h2><div class="small muted">Manager: ${esc(spw.shift_manager || "—")}</div><div class="view-edit-note">Breaks and edits update this saved SPW without closing the view.</div></div><div class="card"><h2>Sales / Crew Hours / SPCH</h2>${salesTable(spw, false)}</div>${historyWorksheet(spw)}${spw.notes ? `<div class="card"><h2>Shift Notes</h2>${esc(spw.notes).replace(/\n/g, "<br>")}</div>` : ""}`;
			}
			async function loadHistory() {
				let date = $("history-date").value,
					type = $("history-type").value,
					spw = await api(
						`/api/spw?date=${date}&shift_type=${encodeURIComponent(type)}`,
					);
				if (spw) {
					currentSpw = normaliseLoadedSpw(spw, type);
				}
				renderHistoryBody(spw);
			}
			/* ---------------- SPW v14 enhancements ---------------- */
			const V14_VERSION = "14";
			const TASK_CATEGORIES = [
				"Operations",
				"Cleaning",
				"Food Safety",
				"Stock",
				"Admin",
				"Maintenance",
			];
			const PROFILE_FLAG_DEFS = [
				{ key: "can_train", label: "Can train others" },
				{ key: "trainee", label: "Trainee" },
				{ key: "area_leader", label: "Area leader" },
				{ key: "crew_trainer", label: "Crew trainer" },
			];
			const ESSENTIAL_POSITIONS = {
				Kitchen: [
					"Grill / Fried",
					"Initiator Side 1",
					"Assembler Side 1",
				],
				"Drive Thru": ["OT Lane 1 / Cash", "Assembler / Presenter"],
				"In Restaurant": ["Assembler", "Presenter / Order Taker"],
				McDelivery: ["Delivery Assembler / Presenter"],
				McCafé: [
					"Coffee / Milk Barista Machine 1",
					"Milk Barista Machine 1",
				],
				"Beverage Cell": ["Beverage Cell – All"],
				Fries: ["Fries"],
				Support: ["Support"],
			};
			const RESULT_FIELDS = [
				["oepe_pct", "OEPE %"],
				["oepe_seconds", "OEPE (Seconds)"],
				["kvs_cafe1", "KVS Café Side 1"],
				["kvs_cafe2", "KVS Café Side 2"],
				["kvs_kitchen1", "KVS Kitchen Side 1"],
				["kvs_kitchen2", "KVS Kitchen Side 2"],
				["kvs_fc", "KVS FC"],
				["kvs_dt", "KVS DT"],
				["cod1", "COD 1"],
				["cod2", "COD 2"],
				["cashier", "Cashier"],
				["present", "Present"],
				["pull_forward", "Pull Forward"],
				["tet", "TET"],
			];
			let showCompletedTasks = false;
			let undoSerial = 0;
			let resultsHourIndex = 0;

