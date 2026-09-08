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
async function parseApiError(response) {
				let message = `HTTP ${response.status}`;
				try {
					const contentType = response.headers.get("content-type") || "";
					if (contentType.includes("application/json")) {
						const body = await response.json();
						message = body?.error || body?.message || message;
					} else {
						const text = await response.text();
						if (text.trim()) message = text.trim();
					}
				} catch {}
				const error = new Error(message);
				error.status = response.status;
				error.isHttpError = true;
				return error;
			}

			function isNetworkError(error) {
				// fetch() rejects for genuine transport failures. HTTP 4xx/5xx responses
				// are handled separately and must never be treated as "offline".
				return !error?.isHttpError &&
					(error instanceof TypeError || error?.name === "TypeError" || !navigator.onLine);
			}

			function queuedRequest(url, opt, method) {
				return {
					url,
					opt: {
						method,
						headers: opt.headers || { "Content-Type": "application/json" },
						body: opt.body || null,
					},
					at: Date.now(),
				};
			}

			async function api(url, opt = {}) {
				const method = (opt.method || "GET").toUpperCase();

				if (method === "GET") {
					try {
						const response = await fetch(url, opt);
						if (!response.ok) throw await parseApiError(response);
						const data = response.status === 204 ? null : await response.json();
						cacheJson(url, data);
						setConnection(getQueue().length ? "syncing" : "online");
						return data;
					} catch (error) {
						if (!isNetworkError(error)) {
							setConnection(getQueue().length ? "syncing" : "online");
							throw error;
						}
						const cached = cachedJson(url);
						if (cached !== null) {
							setConnection("offline", "Showing last saved local copy");
							return cached;
						}
						setConnection("offline");
						throw error;
					}
				}

				if (!navigator.onLine && isQueueable(url, opt)) {
					const queue = getQueue();
					queue.push(queuedRequest(url, opt, method));
					saveQueue(queue);
					setAutosave("Queued offline");
					toast("Saved locally — will sync when connection returns");
					return syntheticQueuedResponse(url, opt);
				}

				try {
					const response = await fetch(url, opt);
					if (!response.ok) throw await parseApiError(response);
					setConnection(getQueue().length ? "syncing" : "online");
					if (response.status === 204) return null;
					return await response.json();
				} catch (error) {
					if (isNetworkError(error) && isQueueable(url, opt)) {
						const queue = getQueue();
						queue.push(queuedRequest(url, opt, method));
						saveQueue(queue);
						setAutosave("Queued offline");
						toast("Saved locally — will sync when connection returns");
						return syntheticQueuedResponse(url, opt);
					}

					// The server answered, so the connection is healthy. Surface the real
					// validation/database/server error instead of pretending it is offline.
					setConnection(getQueue().length ? "syncing" : "online");
					throw error;
				}
			}

			async function flushOfflineQueue() {
				if (!navigator.onLine) return;
				const queue = getQueue();
				if (!queue.length) {
					setConnection("online");
					return;
				}

				setConnection("syncing", `${queue.length} change(s) waiting`);
				const remaining = [];
				let stoppedForNetwork = false;

				for (let index = 0; index < queue.length; index++) {
					const item = queue[index];
					try {
						const response = await fetch(item.url, item.opt);
						if (!response.ok) {
							const error = await parseApiError(response);
							// A queued request can become invalid later (deleted profile, validation
							// change, etc.). Do not leave the app "syncing" forever. Drop that one
							// request and tell the user exactly what the server said.
							console.error("Queued SPW change rejected:", item, error);
							toast(`A queued change could not be saved: ${error.message}`);
							continue;
						}
					} catch (error) {
						if (isNetworkError(error)) {
							remaining.push(...queue.slice(index));
							stoppedForNetwork = true;
							break;
						}
						console.error("Queued SPW change failed:", item, error);
						toast(`A queued change could not be saved: ${error.message || "Unknown error"}`);
					}
				}

				saveQueue(remaining);
				if (stoppedForNetwork) {
					setConnection("offline", `${remaining.length} change(s) waiting`);
					return;
				}
				setConnection("online");
				toast("Offline changes synced");
				if (currentSpw)
					cacheJson(
						`/api/spw?date=${currentSpw.shift_date}&shift_type=${encodeURIComponent(currentSpw.shift_type)}`,
						currentSpw,
					);
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

