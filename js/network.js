function toast(
				message,
				actionLabel = "",
				actionFn = null,
				timeout = 4500,
			) {
				let stack = $("toast-stack");
				if (!stack) return;
				let id = "toast-" + ++undoSerial,
					el = document.createElement("div");
				el.className = "toast";
				el.id = id;
				el.innerHTML = `<div class="copy">${esc(message)}</div>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ""}`;
				if (actionLabel && actionFn)
					el.querySelector("button").onclick = async () => {
						try {
							await actionFn();
						} finally {
							el.remove();
						}
					};
				stack.appendChild(el);
				setTimeout(() => el.remove(), timeout);
			}
			function pushUndo(message, fn) {
				document
					.querySelectorAll("#toast-stack .toast")
					.forEach((el) => {
						if (el.querySelector("button")?.textContent === "Undo")
							el.remove();
					});
				toast(message, "Undo", fn, 8000);
			}
			function setConnection(state, detail = "") {
				let el = $("connection");
				if (!el) return;
				el.className =
					"connection " +
					(state === "offline"
						? "offline"
						: state === "syncing"
							? "syncing"
							: "");
				el.textContent =
					state === "offline"
						? "Offline"
						: state === "syncing"
							? "Syncing…"
							: "Online";
				if (detail) el.title = detail;
			}
			function queueKey() {
				return "spwOfflineQueueV14";
			}
			function getQueue() {
				try {
					return JSON.parse(localStorage.getItem(queueKey()) || "[]");
				} catch {
					return [];
				}
			}
			function saveQueue(q) {
				localStorage.setItem(queueKey(), JSON.stringify(q));
				setConnection(
					navigator.onLine
						? q.length
							? "syncing"
							: "online"
						: "offline",
					q.length ? `${q.length} change(s) waiting` : "",
				);
			}
			function cacheKeyForUrl(url) {
				return "spwCache:" + url;
			}
			function cacheJson(url, data) {
				try {
					localStorage.setItem(
						cacheKeyForUrl(url),
						JSON.stringify({ at: Date.now(), data }),
					);
				} catch {}
			}
			function cachedJson(url) {
				try {
					return (
						JSON.parse(
							localStorage.getItem(cacheKeyForUrl(url)) || "null",
						)?.data ?? null
					);
				} catch {
					return null;
				}
			}
			function isQueueable(url, opt) {
				let m = (opt.method || "GET").toUpperCase();
				if (m === "GET" || m === "POST") return false;
				return (
					url.startsWith("/api/spw/") ||
					url.startsWith("/api/crew/") ||
					url.startsWith("/api/profiles/")
				);
			}
			function syntheticQueuedResponse(url, opt) {
				try {
					let b = JSON.parse(opt.body || "{}");
					if (url.includes("/breaks"))
						return {
							sent: !!b.sent,
							sent_at: b.sent_at || "",
							queued: true,
						};
				} catch {}
				return { queued: true };
			}
async function api(url, opt = {}) {
    const method = (opt.method || "GET").toUpperCase();
    const parseError = async (r) => {
        let body;
        try { body = await r.json(); } catch { body = { error: await r.text() }; }
        const error = new Error(body?.error || `HTTP ${r.status}`);
        error.status = r.status;
        return error;
    };
    if (method === "GET") {
        try {
            const r = await fetch(url, opt);
            if (!r.ok) throw await parseError(r);
            const data = r.status === 204 ? null : await r.json();
            cacheJson(url, data);
            setConnection(getQueue().length ? "syncing" : "online");
            return data;
        } catch (e) {
            const c = cachedJson(url);
            if (c !== null) {
                setConnection("offline", "Showing last saved local copy");
                return c;
            }
            setConnection("offline");
            throw e;
        }
    }
    if (!navigator.onLine && isQueueable(url, opt)) {
        const q = getQueue();
        q.push({ url, opt: { method, headers: opt.headers || { "Content-Type": "application/json" }, body: opt.body || null }, at: Date.now() });
        saveQueue(q);
        setAutosave("Queued offline");
        return syntheticQueuedResponse(url, opt);
    }
    try {
        const r = await fetch(url, opt);
        if (!r.ok) throw await parseError(r);
        setConnection(getQueue().length ? "syncing" : "online");
        if (r.status === 204) return null;
        return await r.json();
    } catch (e) {
        if (isQueueable(url, opt)) {
            const q = getQueue();
            q.push({ url, opt: { method, headers: opt.headers || { "Content-Type": "application/json" }, body: opt.body || null }, at: Date.now() });
            saveQueue(q);
            setAutosave("Queued offline");
            toast("Saved locally — will sync when connection returns");
            return syntheticQueuedResponse(url, opt);
        }
        setConnection("offline");
        throw e;
    }
}
			async function flushOfflineQueue() {
				if (!navigator.onLine) return;
				let q = getQueue();
				if (!q.length) {
					setConnection("online");
					return;
				}
				setConnection("syncing");
				let left = [];
				for (let item of q) {
					try {
						let r = await fetch(item.url, item.opt);
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
					} catch (e) {
						left.push(item);
						break;
					}
				}
				if (left.length) {
					let first = q.indexOf(left[0]);
					left = [...left, ...q.slice(first + 1)];
				}
				saveQueue(left);
				if (!left.length) {
					setConnection("online");
					toast("Offline changes synced");
					if (currentSpw)
						cacheJson(
							`/api/spw?date=${currentSpw.shift_date}&shift_type=${encodeURIComponent(currentSpw.shift_type)}`,
							currentSpw,
						);
				}
			}
			window.addEventListener("online", flushOfflineQueue);
			window.addEventListener("offline", () => setConnection("offline"));

			function cacheCurrentSpw() {
				if (currentSpw)
					cacheJson(
						`/api/spw?date=${currentSpw.shift_date}&shift_type=${encodeURIComponent(currentSpw.shift_type)}`,
						currentSpw,
					);
			}
			async function saveSpw(silent = false) {
				if (!currentSpw) return;
				try {
					if (!silent) setAutosave("Saving…");
					let r = await api(`/api/spw/${currentSpw.id}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(spwPayload()),
					});
					cacheCurrentSpw();
					setAutosave(r?.queued ? "Queued offline" : "Saved ✓");
				} catch (e) {
					setAutosave("Save failed", "bad");
					toast(e.message || "Could not save");
					throw e;
				}
			}

