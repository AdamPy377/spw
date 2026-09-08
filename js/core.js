const AREA_DEFS = [
				{
					key: "Kitchen",
					positions: [
						"Grill / Fried",
						"Initiator Side 1",
						"Assembler Side 1",
						"Initiator Side 2",
						"Fried Products",
						"Assembler Side 2",
						"Chaser Side 1 / Initiator Side 3",
						"Chaser Side 2 / Assembler Side 3",
						"Second Fried",
						"Second Grill",
						"Initiator Side 4",
						"Assembler Side 4",
					],
				},
				{
					key: "Drive Thru",
					positions: [
						"OT Lane 1 / Cash",
						"Assembler / Presenter",
						"Presenter / OT Lane 2",
						"OT Lane 2 / Flex",
						"Cashier / Flex",
						"Coordinator",
						"Expeditor",
					],
				},
				{
					key: "In Restaurant",
					positions: [
						"Assembler",
						"Presenter / Order Taker",
						"Order Taker",
						"Expeditor",
						"Drink Drawer",
						"CEC Host",
						"CEC Kiosk / Table Delivery",
					],
				},
				{
					key: "McDelivery",
					positions: ["Delivery Assembler / Presenter"],
				},
				{
					key: "McCafé",
					positions: [
						"OT / Food / Barista Machine 1",
						"Coffee / Milk Barista Machine 1",
						"Milk Barista Machine 1",
						"OT / Food / Barista Machine 2",
						"Coffee / Milk Barista Machine 2",
					],
				},
				{
					key: "Beverage Cell",
					positions: [
						"Beverage Cell – All",
						"Beverage Cell / Shake & Sundae",
						"Beverage Cell / FSB",
					],
				},
				{ key: "Fries", positions: ["Fries"] },
				{ key: "Support", positions: ["Support"] },
			];
			const GOAL_DEFS = {
				Kitchen: [
					"MFY Time – 45 sec",
					"Accuracy / Procedure / Step Up QSC Focus",
				],
				"Drive Thru": [
					"OEPE <120 sec",
					"R2P <60 sec",
					"Accuracy / Procedure / Step Up QSC Focus",
				],
				"In Restaurant": [
					"No. Surveys Completed",
					"R2P <90 sec",
					"Accuracy / Procedure / Step Up QSC Focus",
				],
				McDelivery: [
					"McDelivery R2P <180 sec",
					"Accuracy / Procedure / Step Up QSC Focus",
				],
				McCafé: [
					"McCafé R2P <180 sec",
					"Accuracy / Procedure / Step Up QSC Focus",
				],
			};
			const ALL_POSITIONS = AREA_DEFS.flatMap((a) =>
				a.positions.map((p) => ({
					area: a.key,
					position: p,
					key: `${a.key}|||${p}`,
				})),
			);
			function normalisePosition(area, station) {
				if (
					area === "McDelivery" &&
					[
						"Delivery Presenter",
						"Delivery Coordinator",
						"Delivery Expeditor",
					].includes(station)
				)
					return "Delivery Assembler / Presenter";
				if (area === "Fries" && /^French Fries/.test(station || ""))
					return "Fries";
				if (area === "Support" && /^Dining Room/.test(station || ""))
					return "Support";
				return station || "";
			}

			const SIMPLE_SKILLS = [
				{
					group: "Kitchen",
					key: "kitchen_initiator",
					label: "Initiator",
				},
				{
					group: "Kitchen",
					key: "kitchen_assembler",
					label: "Assembler",
				},
				{ group: "Kitchen", key: "kitchen_grilled", label: "Grilled" },
				{ group: "Kitchen", key: "kitchen_fried", label: "Fried" },
				{
					group: "Drive Thru",
					key: "dt_order_taking",
					label: "Order Taking",
				},
				{
					group: "Drive Thru",
					key: "dt_assembling",
					label: "Assembling",
				},
				{
					group: "Drive Thru",
					key: "dt_presenting",
					label: "Presenting",
				},
				{
					group: "In Restaurant",
					key: "ir_assembler",
					label: "Assembler",
				},
				{
					group: "In Restaurant",
					key: "ir_presenter",
					label: "Presenter",
				},
				{
					group: "In Restaurant",
					key: "ir_order_taker",
					label: "Order Taker",
				},
				{
					group: "In Restaurant",
					key: "ir_drink_drawer",
					label: "Drink Drawer",
				},
				{
					group: "McDelivery",
					key: "delivery_assembler",
					label: "Delivery Assembler",
				},
				{
					group: "McCafé",
					key: "cafe_coffee",
					label: "Coffee Barista",
				},
				{ group: "McCafé", key: "cafe_milk", label: "Milk Barista" },
				{ group: "McCafé", key: "cafe_food", label: "Food" },
				{
					group: "McCafé",
					key: "cafe_presenting",
					label: "Presenting",
				},
				{
					group: "Beverage Cell",
					key: "beverage_all",
					label: "Beverage Cell — All",
				},
				{ group: "Fries", key: "fries", label: "Fries" },
				{ group: "Support", key: "support", label: "Support" },
			];
			const POSITION_SKILL_RULES = {
				"Kitchen|||Grill / Fried": {
					keys: ["kitchen_grilled", "kitchen_fried"],
					min: 3,
				},
				"Kitchen|||Initiator Side 1": {
					key: "kitchen_initiator",
					min: 3,
				},
				"Kitchen|||Assembler Side 1": {
					key: "kitchen_assembler",
					min: 3,
				},
				"Kitchen|||Initiator Side 2": {
					key: "kitchen_initiator",
					min: 4,
				},
				"Kitchen|||Fried Products": { key: "kitchen_fried", min: 3 },
				"Kitchen|||Assembler Side 2": {
					key: "kitchen_assembler",
					min: 4,
				},
				"Kitchen|||Chaser Side 1 / Initiator Side 3": {
					key: "kitchen_initiator",
					min: 4,
				},
				"Kitchen|||Chaser Side 2 / Assembler Side 3": {
					key: "kitchen_assembler",
					min: 4,
				},
				"Kitchen|||Second Fried": { key: "kitchen_fried", min: 4 },
				"Kitchen|||Second Grill": { key: "kitchen_grilled", min: 4 },
				"Kitchen|||Initiator Side 4": {
					key: "kitchen_initiator",
					min: 5,
				},
				"Kitchen|||Assembler Side 4": {
					key: "kitchen_assembler",
					min: 5,
				},
				"Drive Thru|||OT Lane 1 / Cash": {
					key: "dt_order_taking",
					min: 3,
				},
				"Drive Thru|||Assembler / Presenter": {
					keys: ["dt_assembling", "dt_presenting"],
					min: 3,
				},
				"Drive Thru|||Presenter / OT Lane 2": {
					keys: ["dt_presenting", "dt_order_taking"],
					min: 4,
				},
				"Drive Thru|||OT Lane 2 / Flex": {
					key: "dt_order_taking",
					min: 4,
				},
				"Drive Thru|||Cashier / Flex": {
					key: "dt_order_taking",
					min: 3,
				},
				"Drive Thru|||Coordinator": { key: "dt_assembling", min: 4 },
				"Drive Thru|||Expeditor": { key: "dt_presenting", min: 4 },
				"In Restaurant|||Assembler": { key: "ir_assembler", min: 3 },
				"In Restaurant|||Presenter / Order Taker": {
					keys: ["ir_presenter", "ir_order_taker"],
					min: 3,
				},
				"In Restaurant|||Order Taker": {
					key: "ir_order_taker",
					min: 3,
				},
				"In Restaurant|||Expeditor": { key: "ir_assembler", min: 4 },
				"In Restaurant|||Drink Drawer": {
					key: "ir_drink_drawer",
					min: 3,
				},
				"In Restaurant|||CEC Host": { key: "support", min: 2 },
				"In Restaurant|||CEC Kiosk / Table Delivery": {
					key: "support",
					min: 2,
				},
				"McDelivery|||Delivery Assembler / Presenter": {
					key: "delivery_assembler",
					min: 3,
				},
				"McCafé|||OT / Food / Barista Machine 1": {
					keys: ["cafe_food", "cafe_coffee"],
					min: 3,
				},
				"McCafé|||Coffee / Milk Barista Machine 1": {
					keys: ["cafe_coffee", "cafe_milk"],
					min: 3,
				},
				"McCafé|||Milk Barista Machine 1": { key: "cafe_milk", min: 3 },
				"McCafé|||OT / Food / Barista Machine 2": {
					keys: ["cafe_food", "cafe_coffee"],
					min: 4,
				},
				"McCafé|||Coffee / Milk Barista Machine 2": {
					keys: ["cafe_coffee", "cafe_milk"],
					min: 4,
				},
				"Beverage Cell|||Beverage Cell – All": {
					key: "beverage_all",
					min: 4,
				},
				"Beverage Cell|||Beverage Cell / Shake & Sundae": {
					key: "beverage_all",
					min: 3,
				},
				"Beverage Cell|||Beverage Cell / FSB": {
					key: "beverage_all",
					min: 3,
				},
				"Fries|||Fries": { key: "fries", min: 3 },
				"Support|||Support": { key: "support", min: 2 },
			};
			let currentSpw = null,
				currentPage = "current",
				profiles = [],
				selectedProfile = null,
				autosaveTimer = null,
				dragCrewId = null;
			let navRenderToken = 0;
			if ("serviceWorker" in navigator) {
				navigator.serviceWorker.register("sw.js").catch(() => {});
			}
			const $ = (id) => document.getElementById(id);
			const esc = (s) =>
				String(s ?? "").replace(
					/[&<>"']/g,
					(m) =>
						({
							"&": "&amp;",
							"<": "&lt;",
							">": "&gt;",
							'"': "&quot;",
							"'": "&#39;",
						})[m],
				);
			function todayStr() {
				const d = new Date();
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			}
			function fmtTime(t) {
				if (!t) return "";
				let [h, m] = t.split(":").map(Number),
					ap = h >= 12 ? "pm" : "am";
				h = ((h + 11) % 12) + 1;
				return m
					? `${h}:${String(m).padStart(2, "0")}${ap}`
					: `${h}${ap}`;
			}
			function mins(t) {
				if (!t) return null;
				let [h, m] = t.split(":").map(Number);
				return h * 60 + m;
			}
			function duration(start, end) {
				let a = mins(start),
					b = mins(end);
				if (a == null || b == null) return 0;
				if (b <= a) b += 1440;
				return b - a;
			}
			function addMins(t, n) {
				let x = (mins(t) + n) % 1440;
				if (x < 0) x += 1440;
				return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
			}
			function relativeMins(t, start) {
				let x = mins(t),
					s = mins(start);
				if (x == null || s == null) return null;
				if (x < s) x += 1440;
				return x - s;
			}
			function shiftForNow() {
				let d = new Date(),
					m = d.getHours() * 60 + d.getMinutes();
				if (m >= 420 && m < 900)
					return { type: "Day Shift", date: todayStr() };
				if (m >= 900 && m < 1380)
					return { type: "Night Shift", date: todayStr() };
				if (m >= 1380) return { type: "Overnight", date: todayStr() };
				d.setDate(d.getDate() - 1);
				return {
					type: "Overnight",
					date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
				};
			}
			function projectionTimes(type) {
				return type === "Day Shift"
					? ["7", "8", "9", "10", "11", "12", "1", "2", "3"]
					: type === "Night Shift"
						? ["3", "4", "5", "6", "7", "8", "9", "10", "11"]
						: ["11", "12", "1", "2", "3", "4", "5", "6", "7"];
			}
			function positionColour(area, position) {
				const palette = [
					"#fde4a5",
					"#d8e8ff",
					"#dcf1df",
					"#f4d9e6",
					"#e9ddff",
					"#d7f0ee",
					"#ffe2cc",
					"#e2e2e2",
				];
				let i =
					Math.abs(hashCode(area + "|" + position)) % palette.length;
				return palette[i];
			}
			function hashCode(s) {
				let h = 0;
				for (let i = 0; i < s.length; i++)
					h = ((h << 5) - h + s.charCodeAt(i)) | 0;
				return h;
			}
			function toggleNav() {
				if (window.innerWidth > 760) return;
				document.getElementById("side-nav")?.classList.toggle("open");
				document
					.getElementById("nav-overlay")
					?.classList.toggle("open");
			}
			let swipeStartX = null,
				swipeStartY = null;
			document.addEventListener(
				"touchstart",
				(e) => {
					if (window.innerWidth > 760 || !e.touches?.length) return;
					let t = e.touches[0],
						open = $("side-nav")?.classList.contains("open");
					if (open || t.clientX <= 28) {
						swipeStartX = t.clientX;
						swipeStartY = t.clientY;
					} else {
						swipeStartX = null;
					}
				},
				{ passive: true },
			);
			document.addEventListener(
				"touchend",
				(e) => {
					if (swipeStartX == null || !e.changedTouches?.length)
						return;
					let t = e.changedTouches[0],
						dx = t.clientX - swipeStartX,
						dy = Math.abs(t.clientY - swipeStartY),
						open = $("side-nav")?.classList.contains("open");
					if (dy < 70 && Math.abs(dx) > 60) {
						if (dx > 0 && !open) {
							$("side-nav")?.classList.add("open");
							$("nav-overlay")?.classList.add("open");
						} else if (dx < 0 && open) closeNav();
					}
					swipeStartX = swipeStartY = null;
				},
				{ passive: true },
			);
			function closeNav() {
				document.getElementById("side-nav")?.classList.remove("open");
				document
					.getElementById("nav-overlay")
					?.classList.remove("open");
			}
			function showPage(page) {
				let changed = page !== currentPage;
				currentPage = page;
				let token = ++navRenderToken;
				document
					.querySelectorAll(".page")
					.forEach((x) =>
						x.classList.toggle("active", x.id === `page-${page}`),
					);
				document
					.querySelectorAll(".nav button[data-page]")
					.forEach((x) =>
						x.classList.toggle("active", x.dataset.page === page),
					);
				closeNav();
				if (changed && page === "results") resultsHourIndex = 0;
				if (changed)
					window.scrollTo({ top: 0, left: 0, behavior: "auto" });
				let rendered = renderPage(page, token);
				if (changed)
					Promise.resolve(rendered).finally(() =>
						requestAnimationFrame(() =>
							window.scrollTo({
								top: 0,
								left: 0,
								behavior: "auto",
							}),
						),
					);
				return rendered;
			}
