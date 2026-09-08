window.__ModuleLoader__.load({
	id: "dsh-image-gen",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/shared.js
		/** Browser route used by the generated-image card. */
		const IMAGE_ROUTE = "/plugins/dsh-image-gen/image";
		/** Same-origin route used by Gallery regeneration and Inspiration actions. */
		const CPA_GENERATE_ROUTE = "/plugins/dsh-image-gen/generate";
		/** Same-origin read-only route exposing discovered workspace metadata. */
		const WORKSPACES_ROUTE = "/plugins/dsh-image-gen/workspaces";
		/** Same-origin route used by Gallery batch cleanup for generated files only. */
		const DELETE_ROUTE = "/plugins/dsh-image-gen/delete";
		/** Same-origin prefix for the provider-neutral Inspiration Library. */
		const INSPIRATION_ROUTE = "/plugins/dsh-image-gen/inspiration";
		const INSPIRATION_CACHE_NAMESPACE = `v1-ff0a9d45e2f2903fe987cf476cda95d38d500e05`;
		/** Namespace persisted through DSH Settings. */
		const IMAGE_GENERATION_NAMESPACE = "image-generation";
		/**
		* Validate the persisted reference carried by a tool presentation.
		* Shared between host and browser so request/event body extraction stays unified.
		*/
		function imageAttachmentFromMeta(meta) {
			const value = record$2(meta);
			if (value?.kind !== "dsh-image-gen") return void 0;
			return imageAttachment(value.attachment);
		}
		function imageAttachment(value) {
			const ref = record$2(value);
			if (ref === void 0) return void 0;
			if (typeof ref.attachmentId !== "string" || ref.attachmentId.trim() === "" || ref.attachmentId.length > 256 || !mediaType(ref.mediaType) || !finiteIntegerNonNegative(ref.bytes) || !finiteIntegerPositive(ref.width) || !finiteIntegerPositive(ref.height)) return void 0;
			if (ref.name !== void 0 && (typeof ref.name !== "string" || ref.name.length > 256 || /[\\/\u0000-\u001f\u007f]/u.test(ref.name))) return void 0;
			if (ref.originalDimensions !== void 0) {
				const dimensions = record$2(ref.originalDimensions);
				if (dimensions === void 0 || !finiteIntegerPositive(dimensions.width) || !finiteIntegerPositive(dimensions.height)) return void 0;
			}
			return ref;
		}
		/** JSON-safe attachment metadata for DSH result/presentation compatibility. */
		function attachmentMeta(ref) {
			return {
				attachmentId: String(ref.attachmentId),
				mediaType: ref.mediaType,
				bytes: ref.bytes,
				width: ref.width,
				height: ref.height,
				...ref.name === void 0 ? {} : { name: ref.name },
				...ref.originalDimensions === void 0 ? {} : { originalDimensions: {
					width: ref.originalDimensions.width,
					height: ref.originalDimensions.height
				} }
			};
		}
		function mediaType(value) {
			return value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "image/gif";
		}
		function record$2(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function finiteIntegerNonNegative(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
		}
		function finiteIntegerPositive(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		/** Ordered sort options for the toolbar dropdown. */
		const SORT_OPTIONS = [
			"time-desc",
			"time-asc",
			"prompt-asc",
			"prompt-desc",
			"size-desc"
		];
		/** Ordered ratio buckets for the toolbar dropdown. */
		const ASPECT_RATIO_FILTERS = [
			"all",
			"1:1",
			"16:9",
			"9:16",
			"4:3",
			"3:4",
			"3:2",
			"2:3"
		];
		/** Display label for a normalized engine, including an explicit unknown case. */
		function galleryEngineLabel(engine) {
			if (engine === "gpt") return "GPT Image 2";
			if (engine === "gemini") return "Gemini Image";
			return "Unknown image engine";
		}
		/** Canonical aspect-ratio bucket for a gallery item, or `undefined` when unknown. */
		function extractAspectRatio(item) {
			const value = item.aspectRatio ?? item.output;
			if (typeof value === "string" && value.trim() !== "") {
				const match = value.match(/(\d+)\s*:\s*(\d+)/);
				if (match) {
					const w = Number(match[1]);
					const h = Number(match[2]);
					if (w > 0 && h > 0) {
						const gcd = greatestCommonDivisor(w, h);
						return `${w / gcd}:${h / gcd}`;
					}
				}
			}
			const width = item.attachment?.width;
			const height = item.attachment?.height;
			if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
				const gcd = greatestCommonDivisor(width, height);
				return `${width / gcd}:${height / gcd}`;
			}
			return "all";
		}
		/** Format an image resolution, e.g. `1024×1024`, or an empty string when unknown. */
		function formatResolution(item) {
			const width = item.attachment?.width;
			const height = item.attachment?.height;
			if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) return `${width}×${height}`;
			const ratio = extractAspectRatio(item);
			return ratio === "all" ? "" : ratio;
		}
		/** Human-readable file size, e.g. `1.4 MB` / `340 KB` / `12 B`. */
		function formatBytes(bytes) {
			if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
			if (bytes < 1024) return `${bytes} B`;
			const kb = bytes / 1024;
			if (kb < 1024) return `${roundOne(kb)} KB`;
			const mb = kb / 1024;
			if (mb < 1024) return `${roundOne(mb)} MB`;
			return `${roundOne(mb / 1024)} GB`;
		}
		/** Formatted creation time, e.g. `2025-05-18 14:30:45`. */
		function formatDate(timestamp, lang = "zh") {
			if (!Number.isFinite(timestamp)) return "—";
			const ms = timestamp < 1e11 ? timestamp * 1e3 : timestamp;
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) return "—";
			const pad = (n) => String(n).padStart(2, "0");
			const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
			const hms = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
			return lang === "en" ? `${ymd} ${hms}` : `${ymd} ${hms}`;
		}
		const PROMPT_COLLATOR = new Intl.Collator("zh-CN-u-co-pinyin", {
			sensitivity: "base",
			numeric: true
		});
		/** Compare two gallery items with a deterministic locale and id tie-breaker. */
		function compareGalleryItems(a, b, sortOption) {
			let result;
			switch (sortOption) {
				case "time-asc":
					result = a.createdAt - b.createdAt;
					break;
				case "prompt-asc":
					result = PROMPT_COLLATOR.compare(a.prompt || "", b.prompt || "");
					break;
				case "prompt-desc":
					result = PROMPT_COLLATOR.compare(b.prompt || "", a.prompt || "");
					break;
				case "size-desc":
					result = (b.attachment?.bytes || 0) - (a.attachment?.bytes || 0);
					break;
				default: result = b.createdAt - a.createdAt;
			}
			return result !== 0 ? result : PROMPT_COLLATOR.compare(a.id, b.id);
		}
		/** Memoizable filter + sort pipeline over the raw gallery list. */
		function processGalleryItems(items, options) {
			const query = options.search.trim().toLowerCase();
			return items.filter((item) => {
				if (options.selectedEngine !== "all" && item.engine !== options.selectedEngine) return false;
				if (options.selectedRatio !== "all" && extractAspectRatio(item) !== options.selectedRatio) return false;
				if (query !== "" && !(item.prompt || "").toLowerCase().includes(query)) return false;
				return true;
			}).sort((a, b) => compareGalleryItems(a, b, options.sortOption));
		}
		/** Count of gallery items for one engine bucket (`all` counts everything). */
		function countByEngine(items, engine) {
			if (engine === "all") return items.length;
			return items.reduce((count, item) => item.engine === engine ? count + 1 : count, 0);
		}
		function greatestCommonDivisor(a, b) {
			let x = a;
			let y = b;
			while (y !== 0) {
				const next = x % y;
				x = y;
				y = next;
			}
			return x;
		}
		function roundOne(value) {
			const rounded = Math.round(value * 10) / 10;
			return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
		}
		function sanitizeGalleryRest(value) {
			const result = {};
			if (typeof value.id === "string" && value.id.trim() !== "") result.id = value.id;
			const attachment = imageAttachment(value.attachment);
			if (attachment !== void 0) result.attachment = imageAttachment(attachmentMeta(attachment));
			if (typeof value.prompt === "string") result.prompt = value.prompt.slice(0, 32e3);
			const limits = {
				aspectRatio: 32,
				imageSize: 32,
				output: 256,
				workspacePath: 4096,
				workspaceId: 256,
				sessionId: 256,
				savedTo: 4096,
				saveError: 256
			};
			for (const key of Object.keys(limits)) if (typeof value[key] === "string") result[key] = value[key].slice(0, limits[key] ?? 256);
			if (typeof value.isFavorite === "boolean") result.isFavorite = value.isFavorite;
			if (Array.isArray(value.tags)) result.tags = value.tags.filter((tag) => typeof tag === "string").slice(0, 64);
			if (typeof value.createdAt === "number" && Number.isFinite(value.createdAt)) result.createdAt = value.createdAt;
			return result;
		}
		/**
		* Normalize current and legacy Gallery metadata without inferring unknown
		* providers. Legacy OpenAI/Google records are mapped to the CPA engines;
		* unsupported values remain visible as an explicit unknown record.
		*/
		function normalizeGalleryItem(item) {
			if (typeof item !== "object" || item === null || Array.isArray(item)) return {
				engine: "unknown",
				model: "",
				normalizationError: "Invalid gallery metadata"
			};
			const { engine: rawEngine, provider: rawProvider, model: rawModel, legacyProvider: rawLegacyProvider, legacyEngine: rawLegacyEngine, normalizationError: rawNormalizationError, ...rest } = item;
			const normalizedRest = sanitizeGalleryRest(rest);
			const model = typeof rawModel === "string" ? rawModel.slice(0, 256) : "";
			const previousLegacyProvider = typeof rawLegacyProvider === "string" ? rawLegacyProvider.slice(0, 128) : void 0;
			const previousLegacyEngine = typeof rawLegacyEngine === "string" ? rawLegacyEngine.slice(0, 128) : void 0;
			const previousError = typeof rawNormalizationError === "string" ? rawNormalizationError.slice(0, 256) : void 0;
			if (rawEngine === "gpt" || rawEngine === "gemini") return {
				...normalizedRest,
				engine: rawEngine,
				model
			};
			if (rawEngine === "unknown") {
				const legacyProvider = previousLegacyProvider ?? (typeof rawProvider === "string" ? rawProvider.slice(0, 128) : void 0);
				return {
					...normalizedRest,
					engine: "unknown",
					model,
					...legacyProvider === void 0 ? {} : { legacyProvider },
					...previousLegacyEngine === void 0 ? {} : { legacyEngine: previousLegacyEngine },
					normalizationError: previousError ?? "Unknown image engine metadata"
				};
			}
			if (rawEngine !== void 0) {
				const legacyEngine = typeof rawEngine === "string" ? rawEngine : typeof rawEngine === "number" || typeof rawEngine === "boolean" ? String(rawEngine) : "invalid";
				return {
					...normalizedRest,
					engine: "unknown",
					model,
					legacyEngine,
					normalizationError: `Unknown gallery engine "${legacyEngine}"`
				};
			}
			if (rawProvider === "openai") return {
				...normalizedRest,
				engine: "gpt",
				model
			};
			if (rawProvider === "google") return {
				...normalizedRest,
				engine: "gemini",
				model
			};
			const legacyProvider = typeof rawProvider === "string" ? rawProvider.slice(0, 128) : previousLegacyProvider;
			return {
				...normalizedRest,
				engine: "unknown",
				model,
				...legacyProvider === void 0 ? {} : { legacyProvider },
				normalizationError: legacyProvider === void 0 ? "Missing image engine metadata" : `Unknown legacy image provider "${legacyProvider}"`
			};
		}
		const DB_NAME = "dsh_image_gen_db";
		const DB_VERSION = 3;
		const STORE_NAME = "gallery_history";
		const TOMBSTONE_STORE = "gallery_tombstones";
		let dbPromise = null;
		let tombstonesCache = null;
		function getDB() {
			if (dbPromise) return dbPromise;
			if (typeof indexedDB === "undefined") return Promise.reject(/* @__PURE__ */ new Error("IndexedDB is not supported in this environment."));
			let request;
			try {
				request = indexedDB.open(DB_NAME, DB_VERSION);
			} catch (error) {
				return Promise.reject(error);
			}
			const promise = new Promise((resolve, reject) => {
				const reset = () => {
					if (dbPromise === promise) {
						dbPromise = null;
						tombstonesCache = null;
					}
				};
				request.onupgradeneeded = (event) => {
					const db = event.target.result;
					if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" }).createIndex("createdAt", "createdAt", { unique: false });
					else {
						const upgradeTransaction = event.target.transaction;
						if (upgradeTransaction !== null && !upgradeTransaction.objectStore(STORE_NAME).indexNames.contains("createdAt")) upgradeTransaction.objectStore(STORE_NAME).createIndex("createdAt", "createdAt", { unique: false });
					}
					if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
				};
				request.onsuccess = () => {
					const db = request.result;
					db.onversionchange = () => {
						db.close();
						reset();
					};
					resolve(db);
				};
				request.onerror = () => {
					reset();
					reject(request.error ?? /* @__PURE__ */ new Error("IndexedDB open failed"));
				};
				request.onblocked = () => {
					reset();
					reject(/* @__PURE__ */ new Error("IndexedDB open blocked by another tab"));
				};
			});
			dbPromise = promise;
			return promise;
		}
		async function loadTombstones(db) {
			if (tombstonesCache) return tombstonesCache;
			return new Promise((resolve) => {
				if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
					tombstonesCache = /* @__PURE__ */ new Set();
					resolve(tombstonesCache);
					return;
				}
				try {
					const req = db.transaction(TOMBSTONE_STORE, "readonly").objectStore(TOMBSTONE_STORE).getAllKeys();
					req.onsuccess = () => {
						tombstonesCache = new Set(req.result.map(String));
						resolve(tombstonesCache);
					};
					req.onerror = () => {
						tombstonesCache = /* @__PURE__ */ new Set();
						resolve(tombstonesCache);
					};
				} catch {
					tombstonesCache = /* @__PURE__ */ new Set();
					resolve(tombstonesCache);
				}
			});
		}
		const listeners = /* @__PURE__ */ new Set();
		function notifyListeners() {
			for (const listener of listeners) try {
				listener();
			} catch (err) {
				console.error("[dsh-image-gen] Gallery listener error:", err);
			}
		}
		/**
		* Subscribe to gallery mutations (insert/delete/clear).
		*/
		function subscribeGallery(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		/**
		* Save or update a gallery record by attachmentId.
		* Skipped if the item was previously deleted (tombstoned). Existing user
		* metadata (favorite, tags and workspace path) survives automatic re-indexing.
		*/
		async function saveGalleryItem(item) {
			try {
				if (await upsertGalleryItem(await getDB(), normalizeGalleryItem({
					...item,
					createdAt: item.createdAt ?? Math.floor(Date.now() / 1e3) * 1e3
				}))) notifyListeners();
			} catch (err) {
				console.warn("[dsh-image-gen] Failed to save gallery item to IndexedDB:", err);
			}
		}
		async function upsertGalleryItem(db, candidate) {
			return new Promise((resolve, reject) => {
				const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], "readwrite");
				const store = tx.objectStore(STORE_NAME);
				const tombstoneStore = tx.objectStore(TOMBSTONE_STORE);
				let changed = false;
				let blocked = false;
				const tombstoneRequest = tombstoneStore.get(candidate.id);
				tombstoneRequest.onsuccess = () => {
					if (tombstoneRequest.result !== void 0) {
						blocked = true;
						return;
					}
					const req = store.get(candidate.id);
					req.onsuccess = () => {
						const existingRaw = req.result;
						const existing = existingRaw === void 0 ? void 0 : normalizePersistedGalleryItem(existingRaw);
						const merged = mergeGalleryItem(existing, candidate);
						if (existing !== void 0 && galleryItemsEqual(existing, merged)) return;
						changed = true;
						const put = store.put(merged);
						put.onerror = () => reject(put.error);
					};
					req.onerror = () => reject(req.error);
				};
				tombstoneRequest.onerror = () => reject(tombstoneRequest.error);
				tx.oncomplete = () => resolve(!blocked && changed);
				tx.onerror = () => reject(tx.error ?? /* @__PURE__ */ new Error("IndexedDB transaction failed"));
				tx.onabort = () => reject(tx.error ?? /* @__PURE__ */ new Error("IndexedDB transaction aborted"));
			});
		}
		function mergeGalleryItem(existing, candidate) {
			if (existing === void 0) return candidate;
			const merged = {
				...existing,
				...candidate,
				createdAt: existing.createdAt > 0 ? existing.createdAt : candidate.createdAt
			};
			if (candidate.isFavorite === void 0 && existing.isFavorite !== void 0) merged.isFavorite = existing.isFavorite;
			if (candidate.tags === void 0 && existing.tags !== void 0) merged.tags = existing.tags;
			if (candidate.savedTo === void 0 && existing.savedTo !== void 0) merged.savedTo = existing.savedTo;
			if (candidate.saveError === void 0 && existing.saveError !== void 0) merged.saveError = existing.saveError;
			if (candidate.workspacePath === void 0 && existing.workspacePath !== void 0) merged.workspacePath = existing.workspacePath;
			if (candidate.workspaceId === void 0 && existing.workspaceId !== void 0) merged.workspaceId = existing.workspaceId;
			if (candidate.sessionId === void 0 && existing.sessionId !== void 0) merged.sessionId = existing.sessionId;
			return merged;
		}
		function galleryItemsEqual(a, b) {
			return a.id === b.id && attachmentsEqual(a.attachment, b.attachment) && a.prompt === b.prompt && a.engine === b.engine && a.model === b.model && a.createdAt === b.createdAt && a.aspectRatio === b.aspectRatio && a.imageSize === b.imageSize && a.output === b.output && a.isFavorite === b.isFavorite && JSON.stringify(a.tags ?? []) === JSON.stringify(b.tags ?? []) && a.workspacePath === b.workspacePath && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.savedTo === b.savedTo && a.saveError === b.saveError && a.normalizationError === b.normalizationError;
		}
		function attachmentsEqual(a, b) {
			return a.attachmentId === b.attachmentId && a.mediaType === b.mediaType && a.bytes === b.bytes && a.width === b.width && a.height === b.height && a.name === b.name && JSON.stringify(a.originalDimensions ?? null) === JSON.stringify(b.originalDimensions ?? null);
		}
		/** Validate a row before exposing it to gallery image components. */
		function normalizePersistedGalleryItem(value) {
			const normalized = normalizeGalleryItem(value);
			const attachment = imageAttachment(normalized.attachment);
			if (typeof normalized.id !== "string" || normalized.id.trim() === "" || attachment === void 0 || typeof normalized.prompt !== "string") return void 0;
			return {
				...normalized,
				attachment,
				createdAt: typeof normalized.createdAt === "number" && Number.isFinite(normalized.createdAt) ? normalized.createdAt : 0
			};
		}
		/**
		* Retrieve all gallery records sorted by createdAt descending. Reading the
		* object store rather than only the index keeps legacy rows without a timestamp
		* visible; malformed rows are quarantined from the returned list.
		*/
		async function getGalleryItems() {
			try {
				const db = await getDB();
				return await new Promise((resolve, reject) => {
					const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
					req.onsuccess = () => {
						resolve(req.result.flatMap((value) => {
							try {
								const item = normalizePersistedGalleryItem(value);
								return item === void 0 ? [] : [item];
							} catch {
								return [];
							}
						}).sort((a, b) => b.createdAt - a.createdAt));
					};
					req.onerror = () => reject(req.error);
				});
			} catch (err) {
				console.warn("[dsh-image-gen] Failed to read gallery items from IndexedDB:", err);
				return [];
			}
		}
		/** Toggle the persisted favorite flag and return the new state. */
		async function toggleFavoriteGalleryItem(id) {
			try {
				const db = await getDB();
				return await new Promise((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, "readwrite");
					const store = tx.objectStore(STORE_NAME);
					let changed = false;
					let nextStatus = false;
					const request = store.get(id);
					request.onsuccess = () => {
						const raw = request.result;
						if (raw === void 0) return;
						const item = normalizePersistedGalleryItem(raw);
						if (item === void 0) return;
						changed = true;
						nextStatus = item.isFavorite !== true;
						const put = store.put({
							...item,
							isFavorite: nextStatus
						});
						put.onerror = () => reject(put.error);
					};
					request.onerror = () => reject(request.error);
					tx.oncomplete = () => {
						if (changed) notifyListeners();
						resolve(changed ? nextStatus : void 0);
					};
					tx.onerror = () => reject(tx.error ?? /* @__PURE__ */ new Error("IndexedDB transaction failed"));
					tx.onabort = () => reject(tx.error ?? /* @__PURE__ */ new Error("IndexedDB transaction aborted"));
				});
			} catch (err) {
				console.warn("[dsh-image-gen] Failed to toggle favorite item in IndexedDB:", err);
				return;
			}
		}
		/** Delete multiple gallery records and write tombstones in one transaction. */
		async function bulkDeleteGalleryItems(ids) {
			const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && id.trim() !== ""))];
			if (uniqueIds.length === 0) return;
			const db = await getDB();
			const tombstones = await loadTombstones(db);
			await new Promise((resolve, reject) => {
				const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], "readwrite");
				const store = tx.objectStore(STORE_NAME);
				const tombstoneStore = tx.objectStore(TOMBSTONE_STORE);
				const deletedAt = Date.now();
				for (const id of uniqueIds) {
					store.delete(id);
					tombstoneStore.put({
						id,
						deletedAt
					});
				}
				tx.oncomplete = () => {
					for (const id of uniqueIds) tombstones.add(id);
					resolve();
				};
				tx.onerror = () => reject(tx.error ?? /* @__PURE__ */ new Error("IndexedDB transaction failed"));
				tx.onabort = () => reject(tx.error ?? /* @__PURE__ */ new Error("IndexedDB transaction aborted"));
			});
			notifyListeners();
		}
		/** Delete a single gallery record by ID and record a tombstone. */
		async function deleteGalleryItem(id) {
			try {
				await bulkDeleteGalleryItems([id]);
				return true;
			} catch (err) {
				console.warn("[dsh-image-gen] Failed to delete gallery item from IndexedDB:", err);
				return false;
			}
		}
		/** Normalize path separators and case for cross-platform workspace matching. */
		function normalizeWorkspacePath(rawPath) {
			const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
			return /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith("//") ? normalized.toLowerCase() : normalized;
		}
		/** Determine whether an item belongs to a workspace using stable metadata or its saved path. */
		function isItemInWorkspace(item, workspace) {
			if (!workspace || !workspace.workspaceId && !workspace.path && (!workspace.sessionIds || workspace.sessionIds.length === 0)) return true;
			if (item.workspaceId && workspace.workspaceId && item.workspaceId === workspace.workspaceId) return true;
			if (item.sessionId && workspace.sessionIds?.includes(item.sessionId)) return true;
			if (item.workspacePath && workspace.path && normalizeWorkspacePath(item.workspacePath) === normalizeWorkspacePath(workspace.path)) return true;
			if (item.savedTo && workspace.path) {
				const saved = normalizeWorkspacePath(item.savedTo);
				const root = normalizeWorkspacePath(workspace.path);
				if (saved === root || saved.startsWith(`${root}/`)) return true;
			}
			return false;
		}
		//#endregion
		//#region lib/types/engine-options.js
		/** Gemini Image aspect ratios accepted by the CPA image service. */
		const GEMINI_ASPECT_RATIOS = [
			"1:1",
			"3:2",
			"2:3",
			"4:3",
			"3:4",
			"16:9",
			"9:16"
		];
		/** Gemini Image resolution tiers accepted by the CPA image service. */
		const GEMINI_IMAGE_SIZES = [
			"1K",
			"2K",
			"4K"
		];
		/** Map common aspect ratios to the three GPT Image framing dimensions. */
		function gptSizeFromAspectRatio(ratio) {
			if (typeof ratio !== "string") return void 0;
			switch (ratio.trim()) {
				case "9:16":
				case "2:3":
				case "3:4": return "1024x1792";
				case "16:9":
				case "3:2":
				case "4:3": return "1792x1024";
				case "1:1": return "1024x1024";
				default: return;
			}
		}
		/** Keep a Gemini aspect ratio only when it is one of the declared CPA options. */
		function normalizeGeminiAspectRatio(value) {
			return typeof value === "string" && GEMINI_ASPECT_RATIOS.includes(value.trim()) ? value.trim() : void 0;
		}
		/** Keep a Gemini resolution tier only when it is one of the declared CPA options. */
		function normalizeGeminiImageSize(value) {
			return typeof value === "string" && GEMINI_IMAGE_SIZES.includes(value.trim()) ? value.trim() : void 0;
		}
		/** Build the POST body the image route expects (kept in one place). */
		function buildImageRequestBody(ref, kind, thumbWidth) {
			return kind === "thumb" ? JSON.stringify({
				attachment: ref,
				kind,
				thumbWidth
			}) : JSON.stringify({
				attachment: ref,
				kind
			});
		}
		/**
		* Load one gallery image and keep its object URL alive only while the calling
		* component is mounted. Pass `kind: 'thumb'` for card/list/table thumbnails and
		* `kind: 'full'` for the lightbox.
		*/
		function useGalleryImage(ref, kind = "full", thumbWidth = 300) {
			const [url, setUrl] = (0, react.useState)();
			const [blob, setBlob] = (0, react.useState)();
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)();
			const key = `${ref.attachmentId}:${kind}:${kind === "thumb" ? thumbWidth : 0}`;
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				setUrl(void 0);
				setBlob(void 0);
				setError(void 0);
				setLoading(true);
				let objectUrl;
				let active = true;
				fetch(IMAGE_ROUTE, {
					method: "POST",
					signal: controller.signal,
					headers: { "content-type": "application/json" },
					body: buildImageRequestBody(ref, kind, thumbWidth)
				}).then(async (response) => {
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const resBlob = await response.blob();
					if (!active || controller.signal.aborted) return;
					setBlob(resBlob);
					objectUrl = URL.createObjectURL(resBlob);
					setUrl(objectUrl);
					setLoading(false);
				}).catch((err) => {
					if (active && !controller.signal.aborted) {
						setError(err instanceof Error ? err.message : String(err));
						setLoading(false);
					}
				});
				return () => {
					active = false;
					controller.abort();
					if (objectUrl !== void 0) URL.revokeObjectURL(objectUrl);
				};
			}, [
				key,
				kind,
				thumbWidth
			]);
			return {
				url,
				blob,
				loading,
				error
			};
		}
		//#endregion
		//#region lib/types/client/inspiration-catalog-cache.js
		/** Catalog metadata is intentionally capped well below browser quota limits. */
		const MAX_INSPIRATION_CATALOG_CACHE_BYTES = 524288;
		const INSPIRATION_CATALOG_CACHE_DB = `dsh_image_gen_inspiration_${INSPIRATION_CACHE_NAMESPACE}`;
		const CATALOG_KEY = `${INSPIRATION_CACHE_NAMESPACE}:catalog`;
		const dbs$1 = /* @__PURE__ */ new Map();
		/**
		* Persist one validated catalog. All browser storage errors are swallowed so a
		* private-mode/quota failure never prevents gallery UI from using the network.
		*/
		var InspirationCatalogCache = class {
			dbName;
			storeName;
			maxBytes;
			now;
			mutationQueue = Promise.resolve();
			constructor(options = {}) {
				this.dbName = options.dbName ?? INSPIRATION_CATALOG_CACHE_DB;
				this.storeName = options.storeName ?? "catalog";
				this.maxBytes = Number.isFinite(options.maxBytes) && (options.maxBytes ?? 0) > 0 ? Math.floor(options.maxBytes) : MAX_INSPIRATION_CATALOG_CACHE_BYTES;
				this.now = options.now ?? Date.now;
			}
			async get() {
				return this.safe(async () => {
					const record = asRecord$1(await requestResult$1((await openDatabase$1(this.dbName, this.storeName)).transaction(this.storeName, "readonly").objectStore(this.storeName).get(CATALOG_KEY)));
					const cachedBytes = typeof record?.bytes === "number" ? record.bytes : void 0;
					if (!record || record.id !== CATALOG_KEY || cachedBytes === void 0 || !Number.isSafeInteger(cachedBytes) || cachedBytes < 0 || cachedBytes > this.maxBytes || !validCatalog(record.catalog)) return void 0;
					const encoded = encodedBytes(JSON.stringify(record.catalog));
					if (encoded !== cachedBytes || encoded > this.maxBytes) return void 0;
					return cloneCatalog(record.catalog);
				}, void 0);
			}
			async put(catalog) {
				return this.enqueueMutation(() => this.safe(async () => {
					const normalized = validCatalog(catalog) ? cloneCatalog(catalog) : void 0;
					if (!normalized) return false;
					const bytes = encodedBytes(JSON.stringify(normalized));
					if (bytes > this.maxBytes) return false;
					const tx = (await openDatabase$1(this.dbName, this.storeName)).transaction(this.storeName, "readwrite");
					tx.objectStore(this.storeName).put({
						id: CATALOG_KEY,
						catalog: normalized,
						bytes,
						savedAt: this.now()
					});
					await transactionDone$1(tx);
					return true;
				}, false));
			}
			async clear() {
				await this.enqueueMutation(() => this.safe(async () => {
					const tx = (await openDatabase$1(this.dbName, this.storeName)).transaction(this.storeName, "readwrite");
					tx.objectStore(this.storeName).clear();
					await transactionDone$1(tx);
				}, void 0));
			}
			/** Alias useful to cache-owning clients. */
			delete() {
				return this.clear();
			}
			async safe(operation, fallback) {
				try {
					return await operation();
				} catch {
					return fallback;
				}
			}
			enqueueMutation(operation) {
				const next = this.mutationQueue.then(operation, operation);
				this.mutationQueue = next.then(() => void 0, () => void 0);
				return next;
			}
		};
		let defaultCache$1;
		function getInspirationCatalogCache(options) {
			if (options !== void 0) return new InspirationCatalogCache(options);
			defaultCache$1 ??= new InspirationCatalogCache();
			return defaultCache$1;
		}
		async function getCachedInspirationCatalog() {
			return getInspirationCatalogCache().get();
		}
		async function cacheInspirationCatalog(catalog) {
			return getInspirationCatalogCache().put(catalog);
		}
		async function clearInspirationCatalogCache() {
			await getInspirationCatalogCache().clear();
		}
		async function readBoundedCatalogBytes(response, maxBytes = MAX_INSPIRATION_CATALOG_CACHE_BYTES) {
			const advertised = Number(response.headers.get("content-length"));
			if (Number.isFinite(advertised) && advertised > maxBytes) {
				await response.body?.cancel().catch(() => void 0);
				throw new Error("catalog-too-large");
			}
			if (!response.body) {
				const data = new Uint8Array(await response.arrayBuffer());
				if (data.byteLength > maxBytes) throw new Error("catalog-too-large");
				return data;
			}
			const reader = response.body.getReader();
			const chunks = [];
			let total = 0;
			try {
				while (true) {
					const next = await reader.read();
					if (next.done) break;
					total += next.value.byteLength;
					if (total > maxBytes) throw new Error("catalog-too-large");
					chunks.push(next.value);
				}
			} catch (error) {
				await reader.cancel().catch(() => void 0);
				throw error;
			} finally {
				reader.releaseLock();
			}
			const result = new Uint8Array(total);
			let offset = 0;
			for (const chunk of chunks) {
				result.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return result;
		}
		function openDatabase$1(dbName, storeName) {
			const key = `${dbName}\u0000${storeName}`;
			const existing = dbs$1.get(key);
			if (existing) return existing;
			if (typeof indexedDB === "undefined") return Promise.reject(/* @__PURE__ */ new Error("IndexedDB is unavailable"));
			let request;
			try {
				request = indexedDB.open(dbName, 1);
			} catch (error) {
				return Promise.reject(error);
			}
			const promise = new Promise((resolve, reject) => {
				const reset = () => {
					if (dbs$1.get(key) === promise) dbs$1.delete(key);
				};
				request.onupgradeneeded = () => {
					const db = request.result;
					if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "id" });
				};
				request.onsuccess = () => {
					const db = request.result;
					db.onversionchange = () => {
						db.close();
						reset();
					};
					resolve(db);
				};
				request.onerror = () => {
					reset();
					reject(request.error ?? /* @__PURE__ */ new Error("IndexedDB open failed"));
				};
				request.onblocked = () => {
					reset();
					reject(/* @__PURE__ */ new Error("IndexedDB open blocked by another tab"));
				};
			});
			dbs$1.set(key, promise);
			return promise;
		}
		function requestResult$1(request) {
			return new Promise((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error ?? /* @__PURE__ */ new Error("IndexedDB request failed"));
			});
		}
		function transactionDone$1(transaction) {
			return new Promise((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error ?? /* @__PURE__ */ new Error("IndexedDB transaction failed"));
				transaction.onabort = () => reject(transaction.error ?? /* @__PURE__ */ new Error("IndexedDB transaction aborted"));
			});
		}
		function encodedBytes(value) {
			return new TextEncoder().encode(value).byteLength;
		}
		function asRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		const KNOWN_CASE_IDS$1 = /* @__PURE__ */ new Set([
			"golden-hour-portrait",
			"neon-city-rain",
			"quiet-coastal-house",
			"ceramic-still-life",
			"misty-pine-forest",
			"editorial-sneaker",
			"watercolor-market",
			"fantasy-library"
		]);
		const KNOWN_CATEGORIES = /* @__PURE__ */ new Set([
			"portrait",
			"landscape",
			"product",
			"architecture",
			"nature",
			"illustration"
		]);
		const KNOWN_STYLES = /* @__PURE__ */ new Set([
			"photorealistic",
			"cinematic",
			"editorial",
			"minimal",
			"watercolor",
			"anime"
		]);
		const KNOWN_SCENES = /* @__PURE__ */ new Set([
			"studio",
			"urban",
			"coastal",
			"interior",
			"forest",
			"fantasy"
		]);
		const KNOWN_SOURCES = /* @__PURE__ */ new Set([
			"builtin",
			"mirror",
			"jsdelivr",
			"github"
		]);
		/** Defensive browser-side validation prevents poisoned cache records. */
		function validCatalog(value) {
			const root = asRecord$1(value);
			if (!root || root.version !== 1 || !Array.isArray(root.cases) || root.cases.length === 0 || root.cases.length > 8) return false;
			if (!Array.isArray(root.categories) || !root.categories.every((entry) => typeof entry === "string" && KNOWN_CATEGORIES.has(entry))) return false;
			if (!Array.isArray(root.styles) || !root.styles.every((entry) => typeof entry === "string" && KNOWN_STYLES.has(entry))) return false;
			if (!Array.isArray(root.scenes) || !root.scenes.every((entry) => typeof entry === "string" && KNOWN_SCENES.has(entry))) return false;
			if (root.categories.length > 6 || root.styles.length > 6 || root.scenes.length > 6) return false;
			const ids = /* @__PURE__ */ new Set();
			for (const raw of root.cases) {
				const item = asRecord$1(raw);
				if (!item || typeof item.id !== "string" || !KNOWN_CASE_IDS$1.has(item.id) || ids.has(item.id)) return false;
				if (typeof item.title !== "string" || item.title.length > 256 || typeof item.description !== "string" || item.description.length > 1024 || typeof item.prompt !== "string" || item.prompt.length > 32e3) return false;
				if (typeof item.category !== "string" || !KNOWN_CATEGORIES.has(item.category)) return false;
				if (typeof item.style !== "string" || !KNOWN_STYLES.has(item.style)) return false;
				if (typeof item.scene !== "string" || !KNOWN_SCENES.has(item.scene)) return false;
				if (typeof item.imagePath !== "string" || item.imagePath.length > 128 || !/^images\/[a-z0-9-]+\.(?:svg|webp|png|jpe?g)$/u.test(item.imagePath)) return false;
				if (item.imageMediaType !== void 0 && item.imageMediaType !== "image/svg+xml" && item.imageMediaType !== "image/webp" && item.imageMediaType !== "image/png" && item.imageMediaType !== "image/jpeg" && item.imageMediaType !== "image/gif") return false;
				if (item.source !== void 0 && (typeof item.source !== "string" || !KNOWN_SOURCES.has(item.source))) return false;
				if (item.sourceUrl !== void 0 && (typeof item.sourceUrl !== "string" || item.sourceUrl.length > 2048)) return false;
				ids.add(item.id);
			}
			return typeof root.updatedAt === "number" && Number.isFinite(root.updatedAt);
		}
		function cloneCatalog(catalog) {
			return JSON.parse(JSON.stringify(catalog));
		}
		//#endregion
		//#region lib/types/client/inspiration-image-cache.js
		/** Bounded, failure-tolerant IndexedDB cache for Inspiration images. */
		/** Browser image bytes are capped independently of the catalog metadata. */
		const MAX_INSPIRATION_IMAGE_CACHE_BYTES = 8388608;
		const INSPIRATION_IMAGE_CACHE_DB = `dsh_image_gen_inspiration_images_${INSPIRATION_CACHE_NAMESPACE}`;
		const dbs = /* @__PURE__ */ new Map();
		/**
		* Store image blobs under case ids only. Arbitrary URL keys are rejected before
		* they can affect IndexedDB, and all storage/quota errors are swallowed.
		*/
		var InspirationImageCache = class {
			dbName;
			storeName;
			maxBytes;
			now;
			mutationQueue = Promise.resolve();
			constructor(options = {}) {
				this.dbName = options.dbName ?? INSPIRATION_IMAGE_CACHE_DB;
				this.storeName = options.storeName ?? "images";
				this.maxBytes = Number.isFinite(options.maxBytes) && (options.maxBytes ?? 0) > 0 ? Math.floor(options.maxBytes) : MAX_INSPIRATION_IMAGE_CACHE_BYTES;
				this.now = options.now ?? Date.now;
			}
			async get(id) {
				return (await this.getEntry(id))?.blob;
			}
			async getEntry(id) {
				if (!isSafeImageKey(id)) return void 0;
				try {
					const record = asRecord(await requestResult((await openDatabase(this.dbName, this.storeName)).transaction(this.storeName, "readonly").objectStore(this.storeName).get(id)));
					if (!validRecord(record, id, this.maxBytes)) return void 0;
					const entry = record;
					this.touch(id);
					return { ...entry };
				} catch {
					return;
				}
			}
			async put(id, image, mediaType = typeof Blob !== "undefined" && image instanceof Blob ? image.type : "image/webp") {
				if (!isSafeImageKey(id) || typeof Blob === "undefined") return false;
				return this.enqueueMutation(async () => {
					try {
						const blob = image instanceof Blob ? image : new Blob([image], { type: mediaType });
						const bytes = blob.size;
						if (bytes > this.maxBytes) return false;
						const db = await openDatabase(this.dbName, this.storeName);
						const oldRecords = await readAll(db, this.storeName);
						const now = this.now();
						const next = {
							id,
							blob,
							bytes,
							mediaType: mediaType || blob.type || "application/octet-stream",
							savedAt: now,
							lastAccessedAt: now
						};
						const records = oldRecords.filter((record) => record.id !== id);
						records.push(next);
						records.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
						let total = records.reduce((sum, record) => sum + record.bytes, 0);
						const evicted = /* @__PURE__ */ new Set();
						for (const record of records) {
							if (total <= this.maxBytes) break;
							total -= record.bytes;
							evicted.add(record.id);
						}
						if (evicted.has(id)) return false;
						const tx = db.transaction(this.storeName, "readwrite");
						const store = tx.objectStore(this.storeName);
						for (const record of oldRecords) if (record.id === id || evicted.has(record.id)) store.delete(record.id);
						store.put(next);
						await transactionDone(tx);
						return true;
					} catch {
						return false;
					}
				});
			}
			async delete(id) {
				if (!isSafeImageKey(id)) return;
				await this.enqueueMutation(async () => {
					try {
						const tx = (await openDatabase(this.dbName, this.storeName)).transaction(this.storeName, "readwrite");
						tx.objectStore(this.storeName).delete(id);
						await transactionDone(tx);
					} catch {}
				});
			}
			async clear() {
				await this.enqueueMutation(async () => {
					try {
						const tx = (await openDatabase(this.dbName, this.storeName)).transaction(this.storeName, "readwrite");
						tx.objectStore(this.storeName).clear();
						await transactionDone(tx);
					} catch {}
				});
			}
			/** Return the currently persisted byte count, or zero when IDB is absent. */
			async sizeBytes() {
				try {
					return (await readAll(await openDatabase(this.dbName, this.storeName), this.storeName)).reduce((sum, record) => sum + record.bytes, 0);
				} catch {
					return 0;
				}
			}
			async touch(id) {
				await this.enqueueMutation(async () => {
					try {
						const tx = (await openDatabase(this.dbName, this.storeName)).transaction(this.storeName, "readwrite");
						const store = tx.objectStore(this.storeName);
						const request = store.get(id);
						request.onsuccess = () => {
							const record = asRecord(request.result);
							if (record && record.id === id) store.put({
								...record,
								lastAccessedAt: this.now()
							});
						};
						await transactionDone(tx);
					} catch {}
				});
			}
			enqueueMutation(operation) {
				const next = this.mutationQueue.then(operation, operation);
				this.mutationQueue = next.then(() => void 0, () => void 0);
				return next;
			}
		};
		let defaultCache;
		function getInspirationImageCache(options) {
			if (options !== void 0) return new InspirationImageCache(options);
			defaultCache ??= new InspirationImageCache();
			return defaultCache;
		}
		async function clearInspirationImageCache() {
			await getInspirationImageCache().clear();
		}
		/** Read an image response without buffering beyond the shared cache limit. */
		async function readBoundedImageBlob(response, maxBytes = MAX_INSPIRATION_IMAGE_CACHE_BYTES) {
			const advertised = Number(response.headers.get("content-length"));
			if (Number.isFinite(advertised) && advertised > maxBytes) {
				await response.body?.cancel().catch(() => void 0);
				throw new Error("image-too-large");
			}
			if (!response.body) {
				const blob = await response.blob();
				if (blob.size > maxBytes) throw new Error("image-too-large");
				return blob;
			}
			const reader = response.body.getReader();
			const chunks = [];
			let total = 0;
			try {
				while (true) {
					const next = await reader.read();
					if (next.done) break;
					total += next.value.byteLength;
					if (total > maxBytes) throw new Error("image-too-large");
					chunks.push(next.value);
				}
			} catch (error) {
				await reader.cancel().catch(() => void 0);
				throw error;
			} finally {
				reader.releaseLock();
			}
			return new Blob(chunks, { type: response.headers.get("content-type") ?? "image/webp" });
		}
		function isSafeImageKey(value) {
			return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && KNOWN_CASE_IDS.has(value);
		}
		function openDatabase(dbName, storeName) {
			const key = `${dbName}\u0000${storeName}`;
			const existing = dbs.get(key);
			if (existing) return existing;
			if (typeof indexedDB === "undefined") return Promise.reject(/* @__PURE__ */ new Error("IndexedDB is unavailable"));
			let request;
			try {
				request = indexedDB.open(dbName, 1);
			} catch (error) {
				return Promise.reject(error);
			}
			const promise = new Promise((resolve, reject) => {
				const reset = () => {
					if (dbs.get(key) === promise) dbs.delete(key);
				};
				request.onupgradeneeded = () => {
					const db = request.result;
					if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "id" });
				};
				request.onsuccess = () => {
					const db = request.result;
					db.onversionchange = () => {
						db.close();
						reset();
					};
					resolve(db);
				};
				request.onerror = () => {
					reset();
					reject(request.error ?? /* @__PURE__ */ new Error("IndexedDB open failed"));
				};
				request.onblocked = () => {
					reset();
					reject(/* @__PURE__ */ new Error("IndexedDB open blocked by another tab"));
				};
			});
			dbs.set(key, promise);
			return promise;
		}
		function requestResult(request) {
			return new Promise((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error ?? /* @__PURE__ */ new Error("IndexedDB request failed"));
			});
		}
		function transactionDone(transaction) {
			return new Promise((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error ?? /* @__PURE__ */ new Error("IndexedDB transaction failed"));
				transaction.onabort = () => reject(transaction.error ?? /* @__PURE__ */ new Error("IndexedDB transaction aborted"));
			});
		}
		async function readAll(db, storeName) {
			return (await requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll())).map(asRecord).filter((value) => value !== void 0 && typeof value.id === "string").filter((value) => validRecord(value, value.id, Number.MAX_SAFE_INTEGER));
		}
		function validRecord(value, expectedId, maxBytes) {
			if (!value || value.id !== expectedId || !isSafeImageKey(value.id)) return false;
			if (!(typeof Blob !== "undefined" && value.blob instanceof Blob)) return false;
			if (typeof value.bytes !== "number" || !Number.isFinite(value.bytes) || value.bytes < 0 || value.bytes !== value.blob.size || value.bytes > maxBytes) return false;
			if (typeof value.mediaType !== "string" || typeof value.savedAt !== "number" || typeof value.lastAccessedAt !== "number") return false;
			return true;
		}
		function asRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		const KNOWN_CASE_IDS = /* @__PURE__ */ new Set([
			"golden-hour-portrait",
			"neon-city-rain",
			"quiet-coastal-house",
			"ceramic-still-life",
			"misty-pine-forest",
			"editorial-sneaker",
			"watercolor-market",
			"fantasy-library"
		]);
		//#endregion
		//#region lib/types/client/inspiration-view.js
		/** Provider-neutral Inspiration Library for the Better Sidebar Gallery. */
		const FAVORITES_KEY = "dsh-image-gen:inspiration-favorites";
		const COPY = {
			zh: {
				title: "灵感素材",
				subtitle: "浏览公开案例，复制 Prompt，或直接用 CPA 引擎生成。",
				search: "搜索案例、Prompt、风格…",
				all: "全部",
				category: "分类",
				style: "风格",
				scene: "场景",
				favorites: "仅收藏",
				refresh: "刷新素材",
				refreshing: "刷新中…",
				clearCache: "清理缓存",
				loading: "正在加载灵感素材…",
				failed: "灵感素材加载失败",
				retry: "重试",
				noResults: "没有匹配的素材。",
				copy: "复制 Prompt",
				copied: "已复制",
				useGpt: "用 GPT 生成",
				useGemini: "用 Gemini 生成",
				featured: "精选",
				prompt: "完整 Prompt",
				close: "关闭",
				generated: "已提交 CPA 生成",
				cacheCleared: "缓存已清理",
				clearFailed: "清理缓存失败",
				source: "来源"
			},
			en: {
				title: "Inspiration",
				subtitle: "Explore public examples, copy a prompt, or generate it directly with a CPA engine.",
				search: "Search examples, prompts, styles…",
				all: "All",
				category: "Category",
				style: "Style",
				scene: "Scene",
				favorites: "Favorites only",
				refresh: "Refresh library",
				refreshing: "Refreshing…",
				clearCache: "Clear cache",
				loading: "Loading inspiration…",
				failed: "Could not load inspiration",
				retry: "Retry",
				noResults: "No matching examples.",
				copy: "Copy prompt",
				copied: "Copied",
				useGpt: "Generate with GPT",
				useGemini: "Generate with Gemini",
				featured: "Featured",
				prompt: "Full prompt",
				close: "Close",
				generated: "CPA generation submitted",
				cacheCleared: "Cache cleared",
				clearFailed: "Could not clear cache",
				source: "Source"
			}
		};
		const InspirationView = ({ locale, defaultEngine = "gpt", busy = false, onUsePrompt }) => {
			const [lang, setLang] = (0, react.useState)(() => locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("");
			const [style, setStyle] = (0, react.useState)("");
			const [scene, setScene] = (0, react.useState)("");
			const [onlyFavorites, setOnlyFavorites] = (0, react.useState)(false);
			const [selected, setSelected] = (0, react.useState)(null);
			const [favorites, setFavorites] = (0, react.useState)(() => readFavorites());
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const [toast, setToast] = (0, react.useState)(null);
			const hasCatalogRef = (0, react.useRef)(false);
			const catalogRequestRef = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				if (!locale?.subscribe) return;
				return locale.subscribe(() => setLang(locale.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh"));
			}, [locale]);
			(0, react.useEffect)(() => {
				const styleNode = document.createElement("style");
				styleNode.dataset.plugin = "dsh-image-gen-inspiration";
				styleNode.textContent = INSPIRATION_STYLE;
				document.head.appendChild(styleNode);
				return () => styleNode.remove();
			}, []);
			const t = (key) => COPY[lang][key] ?? COPY.zh[key];
			const loadCatalog = async (refresh = false) => {
				const requestId = catalogRequestRef.current + 1;
				catalogRequestRef.current = requestId;
				setError(false);
				try {
					const cached = refresh ? void 0 : await getCachedInspirationCatalog();
					if (requestId !== catalogRequestRef.current) return;
					if (cached) {
						hasCatalogRef.current = true;
						setCatalog(cached);
						setSelected((old) => old ?? cached.cases[0] ?? null);
					}
					const response = await fetch(`${INSPIRATION_ROUTE}/${refresh ? "refresh" : "catalog"}`, {
						method: refresh ? "POST" : "GET",
						credentials: "same-origin"
					});
					if (!response.ok) {
						await response.body?.cancel().catch(() => void 0);
						throw new Error("invalid-catalog");
					}
					const bytes = await readBoundedCatalogBytes(response);
					const value = JSON.parse(new TextDecoder().decode(bytes));
					if (value.version !== 1 || !Array.isArray(value.cases)) throw new Error("invalid-catalog");
					if (requestId !== catalogRequestRef.current) return;
					hasCatalogRef.current = true;
					setCatalog(value);
					setSelected((old) => old && value.cases.some((item) => item.id === old.id) ? old : value.cases[0] ?? null);
					cacheInspirationCatalog(value);
				} catch {
					if (requestId === catalogRequestRef.current && !hasCatalogRef.current) setError(true);
				}
			};
			(0, react.useEffect)(() => {
				loadCatalog();
			}, []);
			const matching = (0, react.useMemo)(() => {
				const source = catalog?.cases ?? [];
				const needle = query.trim().toLowerCase();
				return source.filter((item) => {
					if (onlyFavorites && !favorites.has(item.id)) return false;
					if (category && item.category !== category) return false;
					if (style && item.style !== style) return false;
					if (scene && item.scene !== scene) return false;
					if (!needle) return true;
					return [
						item.title,
						item.description,
						item.prompt,
						item.category,
						item.style,
						item.scene
					].some((value) => value.toLowerCase().includes(needle));
				});
			}, [
				catalog,
				query,
				category,
				style,
				scene,
				onlyFavorites,
				favorites
			]);
			(0, react.useEffect)(() => {
				setSelected((current) => current && matching.some((item) => item.id === current.id) ? current : matching[0] ?? null);
			}, [matching]);
			const toggleFavorite = (id) => {
				setFavorites((old) => {
					const next = new Set(old);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					writeFavorites(next);
					return next;
				});
			};
			const copyPrompt = async (item) => {
				if (!item) return;
				try {
					await copyText$1(item.prompt);
					setToast(t("copied"));
				} catch {
					setToast(t("failed"));
				}
			};
			const generate = async (engine) => {
				if (busy || !selected) return;
				try {
					await onUsePrompt(selected.prompt, engine);
					setToast(t("generated"));
				} catch (cause) {
					setToast(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const refresh = async () => {
				if (refreshing) return;
				setRefreshing(true);
				try {
					await loadCatalog(true);
				} finally {
					setRefreshing(false);
				}
			};
			const clearCache = async () => {
				try {
					await Promise.all([clearInspirationCatalogCache(), clearInspirationImageCache()]);
					if (!(await fetch(`/plugins/dsh-image-gen/inspiration/cache-clear`, {
						method: "POST",
						credentials: "same-origin"
					})).ok) throw new Error("cache-clear");
					setToast(t("cacheCleared"));
				} catch {
					setToast(t("clearFailed"));
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-ig-inspiration-page",
				"aria-label": t("title"),
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: "dsh-ig-inspiration-header",
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h2", { children: t("title") }), (0, react_jsx_runtime.jsx)("p", { children: t("subtitle") })] }), (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-inspiration-header-actions",
							children: [(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => void clearCache(),
								children: t("clearCache")
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => void refresh(),
								disabled: refreshing,
								children: refreshing ? t("refreshing") : t("refresh")
							})]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-inspiration-toolbar",
						children: [
							(0, react_jsx_runtime.jsx)("input", {
								value: query,
								onChange: (event) => setQuery(event.target.value),
								placeholder: t("search"),
								"aria-label": t("search")
							}),
							(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("category") }), (0, react_jsx_runtime.jsxs)("select", {
								value: category,
								onChange: (event) => setCategory(event.target.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("all")
								}), catalog?.categories.map((value) => (0, react_jsx_runtime.jsx)("option", {
									value,
									children: value
								}, value))]
							})] }),
							(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("style") }), (0, react_jsx_runtime.jsxs)("select", {
								value: style,
								onChange: (event) => setStyle(event.target.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("all")
								}), catalog?.styles.map((value) => (0, react_jsx_runtime.jsx)("option", {
									value,
									children: value
								}, value))]
							})] }),
							(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("scene") }), (0, react_jsx_runtime.jsxs)("select", {
								value: scene,
								onChange: (event) => setScene(event.target.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("all")
								}), catalog?.scenes.map((value) => (0, react_jsx_runtime.jsx)("option", {
									value,
									children: value
								}, value))]
							})] }),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: onlyFavorites ? "is-active" : "",
								onClick: () => setOnlyFavorites((value) => !value),
								children: [
									"★ ",
									t("favorites"),
									" ",
									favorites.size > 0 ? `(${favorites.size})` : ""
								]
							})
						]
					}),
					error ? (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-inspiration-empty",
						children: [(0, react_jsx_runtime.jsx)("p", { children: t("failed") }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => void loadCatalog(),
							children: t("retry")
						})]
					}) : catalog === null ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-inspiration-empty",
						children: t("loading")
					}) : matching.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-inspiration-empty",
						children: t("noResults")
					}) : (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-inspiration-body",
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-inspiration-grid",
							children: matching.map((item) => (0, react_jsx_runtime.jsx)(InspirationCard, {
								item,
								selected: selected?.id === item.id,
								favorite: favorites.has(item.id),
								featured: t("featured"),
								onSelect: () => setSelected(item),
								onFavorite: () => toggleFavorite(item.id)
							}, item.id))
						}), (0, react_jsx_runtime.jsx)("aside", {
							className: "dsh-ig-inspiration-inspector",
							children: selected ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(InspirationImage, {
								id: selected.id,
								alt: selected.title
							}), (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-ig-inspiration-inspector-copy",
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-inspiration-inspector-title",
										children: [(0, react_jsx_runtime.jsx)("h3", { children: selected.title }), (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											onClick: () => toggleFavorite(selected.id),
											"aria-label": t("favorites"),
											children: favorites.has(selected.id) ? "★" : "☆"
										})]
									}),
									(0, react_jsx_runtime.jsx)("p", { children: selected.description }),
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-inspiration-tags",
										children: [
											(0, react_jsx_runtime.jsx)("span", { children: selected.category }),
											(0, react_jsx_runtime.jsx)("span", { children: selected.style }),
											(0, react_jsx_runtime.jsx)("span", { children: selected.scene })
										]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-ig-inspiration-prompt-label",
										children: [t("prompt"), (0, react_jsx_runtime.jsx)("textarea", {
											readOnly: true,
											value: selected.prompt
										})]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-inspiration-actions",
										children: [
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => void copyPrompt(selected),
												children: t("copy")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: busy,
												onClick: () => void generate(defaultEngine),
												children: defaultEngine === "gemini" ? t("useGemini") : t("useGpt")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: busy,
												onClick: () => void generate(defaultEngine === "gemini" ? "gpt" : "gemini"),
												children: defaultEngine === "gemini" ? t("useGpt") : t("useGemini")
											})
										]
									})
								]
							})] }) : null
						})]
					}),
					toast ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-inspiration-toast",
						role: "status",
						children: toast
					}) : null
				]
			});
		};
		const InspirationCard = ({ item, selected, favorite, featured, onSelect, onFavorite }) => (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: `dsh-ig-inspiration-card ${selected ? "is-selected" : ""}`,
			onClick: onSelect,
			children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-ig-inspiration-card-media",
					children: [
						(0, react_jsx_runtime.jsx)(InspirationImage, {
							id: item.id,
							alt: item.title
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ig-inspiration-card-favorite",
							role: "button",
							onClick: (event) => {
								event.stopPropagation();
								onFavorite();
							},
							children: favorite ? "★" : "☆"
						}),
						item.id === "golden-hour-portrait" ? (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-ig-inspiration-featured",
							children: ["✦ ", featured]
						}) : null
					]
				}),
				(0, react_jsx_runtime.jsx)("strong", { children: item.title }),
				(0, react_jsx_runtime.jsxs)("small", { children: [
					item.category,
					" · ",
					item.style
				] })
			]
		});
		const InspirationImage = ({ id, alt }) => {
			const [url, setUrl] = (0, react.useState)();
			const [failed, setFailed] = (0, react.useState)(false);
			const urlRef = (0, react.useRef)();
			(0, react.useEffect)(() => {
				let active = true;
				const controller = new AbortController();
				setFailed(false);
				setUrl(void 0);
				if (urlRef.current !== void 0) {
					URL.revokeObjectURL(urlRef.current);
					urlRef.current = void 0;
				}
				const cache = getInspirationImageCache();
				cache.get(id).then(async (cached) => {
					if (cached) return cached;
					const response = await fetch(`${INSPIRATION_ROUTE}/image/${encodeURIComponent(id)}`, {
						credentials: "same-origin",
						signal: controller.signal,
						headers: { accept: "image/*" }
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const blob = await readBoundedImageBlob(response, MAX_INSPIRATION_IMAGE_CACHE_BYTES);
					if (blob.size === 0) throw new Error("empty-image");
					if (response.headers.get("x-dsh-inspiration-fallback") !== "1") await cache.put(id, blob, blob.type);
					return blob;
				}).then((blob) => {
					if (!active) return;
					const objectUrl = URL.createObjectURL(blob);
					urlRef.current = objectUrl;
					setUrl(objectUrl);
				}).catch(() => {
					if (active) setFailed(true);
				});
				return () => {
					active = false;
					controller.abort();
					if (urlRef.current !== void 0) {
						URL.revokeObjectURL(urlRef.current);
						urlRef.current = void 0;
					}
				};
			}, [id]);
			return url && !failed ? (0, react_jsx_runtime.jsx)("img", {
				src: url,
				alt,
				loading: "lazy"
			}) : (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-ig-inspiration-placeholder",
				children: failed ? "⚠️" : "…"
			});
		};
		function readFavorites() {
			try {
				const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
				return Array.isArray(value) ? new Set(value.filter((entry) => typeof entry === "string")) : /* @__PURE__ */ new Set();
			} catch {
				return /* @__PURE__ */ new Set();
			}
		}
		function writeFavorites(value) {
			try {
				localStorage.setItem(FAVORITES_KEY, JSON.stringify([...value]));
			} catch {}
		}
		async function copyText$1(value) {
			if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
			const input = document.createElement("textarea");
			input.value = value;
			input.style.position = "fixed";
			input.style.opacity = "0";
			document.body.appendChild(input);
			input.select();
			if (!document.execCommand("copy")) throw new Error("copy-failed");
			input.remove();
		}
		const INSPIRATION_STYLE = `
.dsh-ig-inspiration-page{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff)}
.dsh-ig-inspiration-header{display:flex;justify-content:space-between;gap:14px;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}
.dsh-ig-inspiration-header h2{margin:0;font-size:17px}.dsh-ig-inspiration-header p{margin:5px 0 0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px}.dsh-ig-inspiration-header-actions,.dsh-ig-inspiration-actions{display:flex;gap:6px;flex-wrap:wrap}.dsh-ig-inspiration-page button{border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer}.dsh-ig-inspiration-page button:hover,.dsh-ig-inspiration-page button.is-active{border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-inspiration-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}.dsh-ig-inspiration-toolbar input,.dsh-ig-inspiration-toolbar select{border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;padding:6px 8px;font:inherit;font-size:12px}.dsh-ig-inspiration-toolbar input{flex:1;min-width:160px}.dsh-ig-inspiration-toolbar label{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-inspiration-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,32%);gap:12px;min-height:0;flex:1;overflow:hidden;padding:12px 14px}.dsh-ig-inspiration-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));align-content:start;gap:10px;overflow:auto;padding-right:3px}.dsh-ig-inspiration-card{display:flex;flex-direction:column;width:100%;box-sizing:border-box;padding:0!important;text-align:left;overflow:hidden}.dsh-ig-inspiration-card-media{position:relative;width:100%;aspect-ratio:1/1;flex-shrink:0;background:#f2f3f5}.dsh-ig-inspiration-card-media img{width:100%;height:100%;object-fit:cover;display:block}.dsh-ig-inspiration-card strong,.dsh-ig-inspiration-card small{display:block;padding:5px 8px 0}.dsh-ig-inspiration-card small{padding-top:2px;padding-bottom:8px;color:var(--dsw-alias-label-tertiary,#7b818b)}.dsh-ig-inspiration-card-favorite{position:absolute;right:6px;top:5px;color:#f5b301;background:rgba(0,0,0,.55);border-radius:50%;width:23px;height:23px;text-align:center;line-height:23px}.dsh-ig-inspiration-featured{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:5px;padding:3px 5px;font-size:10px}.dsh-ig-inspiration-placeholder{height:100%;display:grid;place-items:center;color:#a0a6af}.dsh-ig-inspiration-inspector{overflow:auto;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#fff)}.dsh-ig-inspiration-inspector>img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover}.dsh-ig-inspiration-inspector-copy{padding:12px}.dsh-ig-inspiration-inspector-title{display:flex;align-items:center;justify-content:space-between}.dsh-ig-inspiration-inspector-title h3{margin:0;font-size:15px}.dsh-ig-inspiration-inspector-copy p{font-size:12px;line-height:1.45;color:var(--dsw-alias-label-tertiary,#7b818b)}.dsh-ig-inspiration-tags{display:flex;gap:5px;flex-wrap:wrap}.dsh-ig-inspiration-tags span{font-size:10px;padding:3px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#eef1f4)}.dsh-ig-inspiration-prompt-label{display:grid;gap:5px;margin-top:10px;font-size:11px;font-weight:600}.dsh-ig-inspiration-prompt-label textarea{min-height:130px;resize:vertical;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;padding:7px;font:inherit;font-size:11px;line-height:1.4}.dsh-ig-inspiration-empty{display:grid;place-items:center;align-content:center;gap:9px;min-height:260px;flex:1;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}.dsh-ig-inspiration-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100000;padding:7px 12px;border-radius:7px;background:rgba(0,0,0,.82);color:#fff;font-size:12px}
@media(max-width:800px){.dsh-ig-inspiration-body{grid-template-columns:1fr}.dsh-ig-inspiration-inspector{display:none}.dsh-ig-inspiration-header{flex-direction:column}}
`;
		/** Number of grid columns that fit a content width. */
		function gridColumns(contentWidth) {
			if (!Number.isFinite(contentWidth) || contentWidth <= 240) return 1;
			return Math.max(1, Math.floor((contentWidth + 20) / 260));
		}
		/** Fixed grid cell width for a content width and column count. */
		function gridCellWidth(contentWidth, columns) {
			if (columns <= 1) return Math.max(240, contentWidth);
			return (contentWidth - (columns - 1) * 20) / columns;
		}
		/** Fixed grid row height (media square + meta + row gap). */
		function gridRowHeight(cellWidth) {
			return cellWidth + 90 + 20;
		}
		/**
		* Pure window calculation (exported for tests).
		* @param scrollTop     current scroll offset of the container.
		* @param viewportHeight container client height.
		* @param rowCount      total number of virtualized rows.
		* @param rowHeight     fixed height of one row in px (gap folded in).
		* @param offsetTop     fixed content height above the rows (e.g. table header).
		*/
		function computeWindow(scrollTop, viewportHeight, rowCount, rowHeight, offsetTop = 0) {
			const safeRowHeight = Math.max(rowHeight, 1);
			const totalHeight = offsetTop + rowCount * rowHeight;
			if (rowCount <= 0) return {
				start: 0,
				end: 0,
				totalHeight,
				padTop: 0,
				padBottom: 0
			};
			const viewport = viewportHeight > 0 ? viewportHeight : 600;
			const first = Math.floor(Math.max(0, scrollTop - offsetTop) / safeRowHeight);
			const visibleCount = Math.ceil(viewport / safeRowHeight) + 1;
			const start = Math.min(rowCount, Math.max(0, first - 3));
			const end = Math.min(rowCount, Math.max(start, first + visibleCount + 3));
			return {
				start,
				end,
				totalHeight,
				padTop: start * rowHeight,
				padBottom: Math.max(0, rowCount * rowHeight - end * rowHeight)
			};
		}
		/** Track a scroll container's scrollTop and viewport height. */
		function useVirtualWindow(scrollRef, rowCount, rowHeight, offsetTop = 0) {
			const [scrollTop, setScrollTop] = (0, react.useState)(0);
			const [viewportHeight, setViewportHeight] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const el = scrollRef.current;
				if (!el || rowCount <= 0) return;
				const measure = () => {
					setScrollTop(el.scrollTop);
					setViewportHeight(el.clientHeight);
				};
				measure();
				el.addEventListener("scroll", measure, { passive: true });
				let observer;
				if (typeof ResizeObserver !== "undefined") {
					observer = new ResizeObserver(measure);
					observer.observe(el);
				}
				return () => {
					el.removeEventListener("scroll", measure);
					observer?.disconnect();
				};
			}, [scrollRef, rowCount]);
			return computeWindow(scrollTop, viewportHeight, rowCount, rowHeight, offsetTop);
		}
		/** Track an element's content width (clientWidth), re-measured on resize. */
		function useContainerWidth(ref) {
			const [width, setWidth] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const el = ref.current;
				if (!el) return;
				const measure = () => setWidth(el.clientWidth);
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(el);
				return () => observer.disconnect();
			}, [ref]);
			return width;
		}
		//#endregion
		//#region lib/types/client/gallery-view.js
		/**
		* Native Workspace Gallery View Component for DSH `conversation.view` slot.
		* Fully i18n-reactive (Chinese & English) with multi-mode sorting, engine/ratio
		* filtering, grid/list/table view modes, localStorage preference persistence,
		* virtualized rendering, and thumbnail-vs-full image loading.
		*/
		const DICT$2 = {
			zh: {
				galleryTitle: "画廊",
				inspiration: "灵感",
				favoritesOnly: "仅收藏",
				manage: "批量管理",
				exitManage: "退出管理",
				selectedCount: "已选 {count} 项",
				selectAll: "全选",
				clearSelect: "清空选择",
				batchDelete: "批量删除",
				confirmBatchDelete: "确定删除选中的 {count} 张图片吗？（不会影响聊天记录）",
				deleteWorkspaceFilesOpt: "同时清理工作区生成文件（不可恢复）",
				workspaceOnly: "当前工作区",
				workspaceAll: "所有工作区",
				workspaceUnavailable: "当前工作区（需要会话范围）",
				regenerate: "重新生成",
				regenerating: "生成中…",
				regenerateSuccess: "已生成新图片",
				regenerateFailed: "重新生成失败",
				usePrompt: "使用 Prompt",
				totalCount: "共 {count} 张生成图片",
				searchPlaceholder: "搜索 Prompt 关键词…",
				clearSearch: "清空搜索",
				engineAll: "全部",
				filterGPT: "GPT Image 2",
				filterGemini: "Gemini Image",
				filterUnknown: "未知引擎",
				ratioFilter: "比例",
				ratioAll: "全部比例",
				sortBy: "排序",
				sortTimeDesc: "最新生成",
				sortTimeAsc: "最早生成",
				sortPromptAsc: "Prompt A→Z",
				sortPromptDesc: "Prompt Z→A",
				sortSizeDesc: "文件从大到小",
				viewGrid: "网格视图",
				viewList: "列表视图",
				viewTable: "表格视图",
				emptyTitle: "暂无生图记录",
				emptyDesc: "在对话中让 Agent 生图后，生成的图片会自动收录到这里。",
				noMatchTitle: "未找到匹配结果",
				noMatchDesc: "尝试更换搜索关键词或选择其他引擎。",
				copiedPrompt: "已复制 Prompt",
				copiedImage: "已复制图片",
				copyFailed: "复制失败",
				favoriteAdded: "已添加到收藏",
				favoriteRemoved: "已取消收藏",
				preview: "查看大图",
				download: "下载图片",
				copyImg: "复制图片",
				copyPpt: "复制 Prompt",
				delete: "从画廊删除",
				confirmDelete: "确定要从画廊中删除这张图片吗？（不会影响原聊天记录）",
				deleted: "已从画廊删除",
				deleteFailed: "工作区文件清理失败，未删除画廊记录",
				confirmDeleteWorkspace: "同时删除这张图片的工作区文件吗？此操作不可恢复。",
				prompt: "Prompt",
				close: "关闭 (Esc)",
				prev: "上一张",
				next: "下一张",
				colPrompt: "Prompt",
				colEngine: "引擎",
				colResolution: "分辨率",
				colSize: "文件大小",
				colTime: "生成时间",
				colActions: "操作"
			},
			en: {
				galleryTitle: "Gallery",
				inspiration: "Inspiration",
				favoritesOnly: "Favorites",
				manage: "Batch manage",
				exitManage: "Done",
				selectedCount: "{count} selected",
				selectAll: "Select all",
				clearSelect: "Clear selection",
				batchDelete: "Delete selected",
				confirmBatchDelete: "Delete {count} selected images? (Chat history is not affected)",
				deleteWorkspaceFilesOpt: "Also delete generated workspace files (cannot be undone)",
				workspaceOnly: "Current workspace",
				workspaceAll: "All workspaces",
				workspaceUnavailable: "Current workspace (session scope required)",
				regenerate: "Regenerate",
				regenerating: "Generating…",
				regenerateSuccess: "New image generated",
				regenerateFailed: "Regeneration failed",
				usePrompt: "Use prompt",
				totalCount: "{count} images total",
				searchPlaceholder: "Search prompt keywords…",
				clearSearch: "Clear search",
				engineAll: "All",
				filterGPT: "GPT Image 2",
				filterGemini: "Gemini Image",
				filterUnknown: "Unknown engine",
				ratioFilter: "Aspect ratio",
				ratioAll: "All ratios",
				sortBy: "Sort",
				sortTimeDesc: "Newest first",
				sortTimeAsc: "Oldest first",
				sortPromptAsc: "Prompt A→Z",
				sortPromptDesc: "Prompt Z→A",
				sortSizeDesc: "Largest file",
				viewGrid: "Grid view",
				viewList: "List view",
				viewTable: "Table view",
				emptyTitle: "No images generated yet",
				emptyDesc: "Images generated during conversations will automatically appear here.",
				noMatchTitle: "No matching images",
				noMatchDesc: "Try a different search keyword or engine filter.",
				copiedPrompt: "Prompt copied",
				copiedImage: "Image copied",
				copyFailed: "Copy failed",
				favoriteAdded: "Added to favorites",
				favoriteRemoved: "Removed from favorites",
				preview: "Full Preview",
				download: "Download",
				copyImg: "Copy Image",
				copyPpt: "Copy Prompt",
				delete: "Delete from gallery",
				confirmDelete: "Are you sure you want to remove this image from the gallery? (Chat history will not be affected)",
				deleted: "Deleted from gallery",
				deleteFailed: "Workspace cleanup failed; gallery record was kept",
				confirmDeleteWorkspace: "Also delete this image's workspace file? This cannot be undone.",
				prompt: "Prompt",
				close: "Close (Esc)",
				prev: "Previous",
				next: "Next",
				colPrompt: "Prompt",
				colEngine: "Engine / Model",
				colResolution: "Resolution",
				colSize: "Size",
				colTime: "Created",
				colActions: "Actions"
			}
		};
		const STORAGE_VIEW_KEY = "dsh-image-gen:viewMode";
		const STORAGE_SORT_KEY = "dsh-image-gen:sortOption";
		const STORAGE_WORKSPACE_ONLY_KEY = "dsh-image-gen:workspaceOnly";
		function safeStorageRead(key) {
			try {
				return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
			} catch {
				return null;
			}
		}
		function safeStorageWrite(key, value) {
			try {
				if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
			} catch {}
		}
		function isViewMode(value) {
			return value === "grid" || value === "list" || value === "table";
		}
		function isSortOption(value) {
			return SORT_OPTIONS.includes(value ?? "");
		}
		const ENGINE_FILTERS = [
			{
				value: "all",
				labelKey: "engineAll"
			},
			{
				value: "gpt",
				labelKey: "filterGPT"
			},
			{
				value: "gemini",
				labelKey: "filterGemini"
			},
			{
				value: "unknown",
				labelKey: "filterUnknown"
			}
		];
		const GalleryViewTab = ({ locale, scope, visible: _visible }) => {
			const [activeTab, setActiveTab] = (0, react.useState)("gallery");
			const [items, setItems] = (0, react.useState)([]);
			const [search, setSearch] = (0, react.useState)("");
			const [favoritesOnly, setFavoritesOnly] = (0, react.useState)(false);
			const [workspaceOnly, setWorkspaceOnly] = (0, react.useState)(() => safeStorageRead(STORAGE_WORKSPACE_ONLY_KEY) === "true");
			const [selectedIds, setSelectedIds] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [manageMode, setManageMode] = (0, react.useState)(false);
			const [deleteWorkspaceFiles, setDeleteWorkspaceFiles] = (0, react.useState)(false);
			const [workspaceRecords, setWorkspaceRecords] = (0, react.useState)([]);
			const [generating, setGenerating] = (0, react.useState)(false);
			const generatingRef = (0, react.useRef)(false);
			const [selectedEngine, setSelectedEngine] = (0, react.useState)("all");
			const [selectedRatio, setSelectedRatio] = (0, react.useState)("all");
			const [viewMode, setViewMode] = (0, react.useState)(() => {
				const saved = safeStorageRead(STORAGE_VIEW_KEY);
				return isViewMode(saved) ? saved : "grid";
			});
			const [sortOption, setSortOption] = (0, react.useState)(() => {
				const saved = safeStorageRead(STORAGE_SORT_KEY);
				return isSortOption(saved) ? saved : "time-desc";
			});
			const [previewId, setPreviewId] = (0, react.useState)(null);
			const [toast, setToast] = (0, react.useState)(null);
			const [lang, setLang] = (0, react.useState)(() => {
				return (locale?.getSnapshot?.()?.active)?.startsWith("en") ? "en" : "zh";
			});
			const bodyRef = (0, react.useRef)(null);
			const galleryLoadIdRef = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				if (!locale?.subscribe) return;
				return locale.subscribe(() => {
					const active = locale.getSnapshot?.()?.active;
					setLang(active?.startsWith("en") ? "en" : "zh");
				});
			}, [locale]);
			(0, react.useEffect)(() => {
				safeStorageWrite(STORAGE_VIEW_KEY, viewMode);
			}, [viewMode]);
			(0, react.useEffect)(() => {
				safeStorageWrite(STORAGE_SORT_KEY, sortOption);
			}, [sortOption]);
			(0, react.useEffect)(() => {
				safeStorageWrite(STORAGE_WORKSPACE_ONLY_KEY, String(workspaceOnly));
			}, [workspaceOnly]);
			const dict = lang === "en" ? DICT$2.en : DICT$2.zh;
			const t = (key, params) => {
				let text = dict[key] || DICT$2.zh[key] || key;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};
			const showToast = (msg) => {
				setToast(msg);
				setTimeout(() => {
					setToast(null);
				}, 2e3);
			};
			(0, react.useEffect)(() => {
				let active = true;
				fetch(WORKSPACES_ROUTE, { credentials: "same-origin" }).then(async (response) => response.ok ? await response.json() : void 0).then((value) => {
					if (!active) return;
					const rows = recordArray(value, "workspaces");
					setWorkspaceRecords(rows.map((row) => ({
						...typeof row.workspaceId === "string" ? { workspaceId: row.workspaceId } : {},
						...typeof row.path === "string" ? { path: row.path } : {},
						...typeof row.title === "string" ? { title: row.title } : {},
						...Array.isArray(row.sessionIds) ? { sessionIds: row.sessionIds.filter((id) => typeof id === "string") } : {}
					})));
				}).catch(() => {});
				return () => {
					active = false;
				};
			}, []);
			const activeWorkspace = (0, react.useMemo)(() => {
				const sessionId = scope?.sessionId;
				const cwd = scope?.cwd;
				const bySession = sessionId === void 0 ? void 0 : workspaceRecords.find((workspace) => workspace.sessionIds?.includes(sessionId));
				if (bySession) return bySession;
				const byPath = cwd === void 0 ? void 0 : workspaceRecords.find((workspace) => workspace.path !== void 0 && normalizeWorkspacePath(workspace.path) === normalizeWorkspacePath(cwd));
				if (byPath) return byPath;
				if (cwd !== void 0 || sessionId !== void 0) return {
					...cwd === void 0 ? {} : { path: cwd },
					...sessionId === void 0 ? {} : { sessionIds: [sessionId] }
				};
				return null;
			}, [
				scope?.cwd,
				scope?.sessionId,
				workspaceRecords
			]);
			const workspaceScopeKey = activeWorkspace === null ? "none" : `${activeWorkspace.workspaceId ?? ""}|${activeWorkspace.path ?? ""}|${activeWorkspace.sessionIds?.join("\0") ?? ""}`;
			(0, react.useEffect)(() => {
				setSelectedIds(/* @__PURE__ */ new Set());
				setManageMode(false);
			}, [
				activeTab,
				favoritesOnly,
				workspaceOnly,
				search,
				selectedEngine,
				selectedRatio,
				sortOption,
				workspaceScopeKey
			]);
			const reloadItems = () => {
				const currentRequest = ++galleryLoadIdRef.current;
				getGalleryItems().then((res) => {
					if (currentRequest === galleryLoadIdRef.current) setItems(res);
				});
			};
			const toggleFavorite = async (item) => {
				const next = await toggleFavoriteGalleryItem(item.id);
				if (next === void 0) showToast(t("deleteFailed"));
				else showToast(next ? t("favoriteAdded") : t("favoriteRemoved"));
			};
			const toggleSelected = (item) => {
				setSelectedIds((current) => {
					const next = new Set(current);
					if (next.has(item.id)) next.delete(item.id);
					else next.add(item.id);
					return next;
				});
			};
			const selectAllVisible = () => {
				setSelectedIds(new Set(processedItems.map((item) => item.id)));
			};
			const deleteSelected = async () => {
				const ids = [...selectedIds];
				if (ids.length === 0 || !window.confirm(t("confirmBatchDelete", { count: String(ids.length) }))) return;
				const selectedItems = items.filter((item) => selectedIds.has(item.id));
				try {
					if (deleteWorkspaceFiles) {
						const paths = selectedItems.flatMap((item) => typeof item.savedTo === "string" && isCanonicalSavedToPath(item.savedTo) ? [item.savedTo] : []);
						const response = await fetch(DELETE_ROUTE, {
							method: "POST",
							credentials: "same-origin",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ paths })
						});
						const payload = await response.json().catch(() => null);
						if (!response.ok || payload?.ok !== true || Array.isArray(payload.failedFiles) && payload.failedFiles.length > 0) throw new Error("workspace-delete-failed");
					}
					await bulkDeleteGalleryItems(ids);
					setSelectedIds(/* @__PURE__ */ new Set());
					setManageMode(false);
					showToast(t("deleted"));
					reloadItems();
				} catch (cause) {
					showToast(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const generateThroughCpa = async (prompt, engine, source) => {
				if (generatingRef.current) throw new Error("generation-in-progress");
				generatingRef.current = true;
				setGenerating(true);
				try {
					const sourceOutput = typeof source?.output === "string" ? source.output : "";
					const sourceSize = sourceOutput.match(/\b(?:1024x1024|1024x1792|1792x1024)\b/)?.[0] ?? gptSizeFromAspectRatio(source?.aspectRatio);
					const sourceAspectRatio = normalizeGeminiAspectRatio(source?.aspectRatio) ?? normalizeGeminiAspectRatio(sourceOutput.match(/\b(?:1:1|16:9|9:16|4:3|3:4|3:2|2:3)\b/)?.[0]);
					const sourceImageSize = normalizeGeminiImageSize(source?.imageSize) ?? normalizeGeminiImageSize(sourceOutput.match(/\b(?:1K|2K|4K)\b/)?.[0]);
					const response = await fetch(CPA_GENERATE_ROUTE, {
						method: "POST",
						credentials: "same-origin",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							engine,
							prompt,
							...engine === "gpt" ? sourceSize === void 0 ? {} : { size: sourceSize } : {
								...sourceAspectRatio === void 0 ? {} : { aspect_ratio: sourceAspectRatio },
								...sourceImageSize === void 0 ? {} : { image_size: sourceImageSize }
							}
						})
					});
					const payload = await response.json().catch(() => null);
					const attachment = imageAttachment(payload?.attachment);
					if (!response.ok || attachment === void 0) throw new Error(typeof payload?.error === "string" ? payload.error : t("regenerateFailed"));
					const workspacePath = activeWorkspace?.path ?? scope?.cwd;
					const item = normalizeGalleryItem({
						id: attachment.attachmentId,
						attachment,
						prompt,
						engine,
						model: "",
						...typeof payload?.output === "string" ? { output: payload.output } : {},
						...typeof payload?.aspectRatio === "string" ? { aspectRatio: payload.aspectRatio } : {},
						...typeof payload?.imageSize === "string" ? { imageSize: payload.imageSize } : {},
						...typeof payload?.savedTo === "string" ? { savedTo: payload.savedTo } : {},
						...workspacePath === void 0 ? {} : { workspacePath },
						...activeWorkspace?.workspaceId === void 0 ? {} : { workspaceId: activeWorkspace.workspaceId },
						...scope?.sessionId === void 0 ? {} : { sessionId: scope.sessionId },
						createdAt: typeof payload?.createdAt === "number" ? payload.createdAt : Date.now()
					});
					await saveGalleryItem(item);
					reloadItems();
					return item;
				} finally {
					generatingRef.current = false;
					setGenerating(false);
				}
			};
			const regenerateItem = async (item) => {
				if (generating || item.engine !== "gpt" && item.engine !== "gemini") {
					showToast(t("regenerateFailed"));
					return;
				}
				const prompt = window.prompt(t("usePrompt"), item.prompt);
				if (prompt === null || prompt.trim() === "") return;
				try {
					await generateThroughCpa(prompt, item.engine, item);
					showToast(t("regenerateSuccess"));
				} catch (cause) {
					showToast(cause instanceof Error ? cause.message : t("regenerateFailed"));
				}
			};
			(0, react.useEffect)(() => {
				let active = true;
				const load = () => {
					const currentRequest = ++galleryLoadIdRef.current;
					getGalleryItems().then((res) => {
						if (active && currentRequest === galleryLoadIdRef.current) setItems(res);
					});
				};
				load();
				const unsubscribe = subscribeGallery(load);
				return () => {
					active = false;
					unsubscribe();
				};
			}, []);
			(0, react.useEffect)(() => {
				if (!previewId) return;
				const onKeyDown = (e) => {
					if (e.key === "Escape") setPreviewId(null);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [previewId]);
			const workspaceFilteredItems = (0, react.useMemo)(() => {
				return items.filter((item) => {
					if (favoritesOnly && item.isFavorite !== true) return false;
					if (workspaceOnly && activeWorkspace !== null && !isItemInWorkspace(item, activeWorkspace)) return false;
					return true;
				});
			}, [
				items,
				favoritesOnly,
				workspaceOnly,
				activeWorkspace
			]);
			const processedItems = (0, react.useMemo)(() => processGalleryItems(workspaceFilteredItems, {
				search,
				selectedEngine,
				selectedRatio,
				sortOption
			}), [
				workspaceFilteredItems,
				search,
				selectedEngine,
				selectedRatio,
				sortOption
			]);
			(0, react.useEffect)(() => {
				if (viewMode !== "list") bodyRef.current?.scrollTo({ top: 0 });
			}, [
				viewMode,
				search,
				selectedEngine,
				selectedRatio,
				sortOption,
				workspaceOnly,
				favoritesOnly
			]);
			const previewIndex = (0, react.useMemo)(() => {
				if (previewId === null) return -1;
				return processedItems.findIndex((item) => item.id === previewId);
			}, [previewId, processedItems]);
			const previewItem = previewIndex >= 0 ? processedItems[previewIndex] ?? null : null;
			const openPreview = (item) => {
				setPreviewId(item.id);
			};
			const closePreview = () => {
				setPreviewId(null);
			};
			const stepPreview = (delta) => {
				if (previewIndex < 0) return;
				const next = processedItems[previewIndex + delta];
				if (next) setPreviewId(next.id);
			};
			const bodyWidth = useContainerWidth(bodyRef);
			const contentWidth = Math.max(0, bodyWidth - 28);
			const columns = viewMode === "grid" ? gridColumns(contentWidth) : 1;
			const cellWidth = gridCellWidth(contentWidth, columns);
			const rowHeight = viewMode === "grid" ? gridRowHeight(cellWidth) : viewMode === "list" ? 144 : 64;
			const win = useVirtualWindow(bodyRef, viewMode === "list" ? 0 : viewMode === "grid" ? Math.ceil(processedItems.length / columns) : processedItems.length, rowHeight, viewMode === "table" ? 41 : 0);
			const visibleStart = viewMode === "grid" ? win.start * columns : win.start;
			const visibleEnd = viewMode === "grid" ? Math.min(win.end * columns, processedItems.length) : win.end;
			const visibleItems = (0, react.useMemo)(() => processedItems.slice(visibleStart, visibleEnd), [
				processedItems,
				visibleStart,
				visibleEnd
			]);
			const visibleGridRows = (0, react.useMemo)(() => {
				if (viewMode !== "grid") return [];
				const rows = [];
				for (let r = win.start; r < win.end; r++) rows.push(processedItems.slice(r * columns, r * columns + columns));
				return rows;
			}, [
				processedItems,
				win.start,
				win.end,
				columns,
				viewMode
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-ig-gallery-page",
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: "dsh-ig-gallery-page-header",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-ig-gallery-page-top",
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-gallery-page-title-row",
										children: [(0, react_jsx_runtime.jsxs)("span", {
											className: "dsh-ig-gallery-page-title",
											children: ["🖼️ ", t("galleryTitle")]
										}), (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-ig-gallery-page-count",
											children: t("totalCount", { count: String(items.length) })
										})]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-gallery-tab-toggle",
										role: "tablist",
										children: [(0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "tab",
											"aria-selected": activeTab === "gallery",
											className: `dsh-ig-gallery-tab-btn ${activeTab === "gallery" ? "is-active" : ""}`,
											onClick: () => setActiveTab("gallery"),
											children: ["🖼️ ", t("galleryTitle")]
										}), (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "tab",
											"aria-selected": activeTab === "inspiration",
											className: `dsh-ig-gallery-tab-btn ${activeTab === "inspiration" ? "is-active" : ""}`,
											onClick: () => setActiveTab("inspiration"),
											children: ["✦ ", t("inspiration")]
										})]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-gallery-view-toggle",
										role: "group",
										"aria-label": t("viewGrid"),
										children: [
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `dsh-ig-view-toggle-btn ${viewMode === "grid" ? "is-active" : ""}`,
												title: t("viewGrid"),
												"aria-pressed": viewMode === "grid",
												onClick: () => setViewMode("grid"),
												children: (0, react_jsx_runtime.jsxs)("svg", {
													width: "15",
													height: "15",
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "2",
													strokeLinecap: "round",
													strokeLinejoin: "round",
													children: [
														(0, react_jsx_runtime.jsx)("rect", {
															x: "3",
															y: "3",
															width: "7",
															height: "7",
															rx: "1"
														}),
														(0, react_jsx_runtime.jsx)("rect", {
															x: "14",
															y: "3",
															width: "7",
															height: "7",
															rx: "1"
														}),
														(0, react_jsx_runtime.jsx)("rect", {
															x: "3",
															y: "14",
															width: "7",
															height: "7",
															rx: "1"
														}),
														(0, react_jsx_runtime.jsx)("rect", {
															x: "14",
															y: "14",
															width: "7",
															height: "7",
															rx: "1"
														})
													]
												})
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `dsh-ig-view-toggle-btn ${viewMode === "list" ? "is-active" : ""}`,
												title: t("viewList"),
												"aria-pressed": viewMode === "list",
												onClick: () => setViewMode("list"),
												children: (0, react_jsx_runtime.jsxs)("svg", {
													width: "15",
													height: "15",
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "2",
													strokeLinecap: "round",
													strokeLinejoin: "round",
													children: [
														(0, react_jsx_runtime.jsx)("line", {
															x1: "8",
															y1: "6",
															x2: "21",
															y2: "6"
														}),
														(0, react_jsx_runtime.jsx)("line", {
															x1: "8",
															y1: "12",
															x2: "21",
															y2: "12"
														}),
														(0, react_jsx_runtime.jsx)("line", {
															x1: "8",
															y1: "18",
															x2: "21",
															y2: "18"
														}),
														(0, react_jsx_runtime.jsx)("circle", {
															cx: "4",
															cy: "6",
															r: "1"
														}),
														(0, react_jsx_runtime.jsx)("circle", {
															cx: "4",
															cy: "12",
															r: "1"
														}),
														(0, react_jsx_runtime.jsx)("circle", {
															cx: "4",
															cy: "18",
															r: "1"
														})
													]
												})
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `dsh-ig-view-toggle-btn ${viewMode === "table" ? "is-active" : ""}`,
												title: t("viewTable"),
												"aria-pressed": viewMode === "table",
												onClick: () => setViewMode("table"),
												children: (0, react_jsx_runtime.jsxs)("svg", {
													width: "15",
													height: "15",
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "2",
													strokeLinecap: "round",
													strokeLinejoin: "round",
													children: [
														(0, react_jsx_runtime.jsx)("rect", {
															x: "3",
															y: "4",
															width: "18",
															height: "16",
															rx: "2"
														}),
														(0, react_jsx_runtime.jsx)("line", {
															x1: "3",
															y1: "10",
															x2: "21",
															y2: "10"
														}),
														(0, react_jsx_runtime.jsx)("line", {
															x1: "9",
															y1: "10",
															x2: "9",
															y2: "20"
														})
													]
												})
											})
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: "dsh-ig-gallery-pills",
								role: "tablist",
								"aria-label": t("engineAll"),
								children: ENGINE_FILTERS.map((filter) => (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "tab",
									"aria-selected": selectedEngine === filter.value,
									className: `dsh-ig-gallery-pill ${selectedEngine === filter.value ? "is-active" : ""}`,
									onClick: () => setSelectedEngine(filter.value),
									children: [(0, react_jsx_runtime.jsx)("span", { children: t(filter.labelKey) }), (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-ig-gallery-pill-badge",
										children: countByEngine(items, filter.value)
									})]
								}, filter.value))
							}),
							activeTab === "gallery" ? (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-ig-gallery-management-row",
								children: [
									(0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: `dsh-ig-gallery-manage-btn ${favoritesOnly ? "is-active" : ""}`,
										onClick: () => setFavoritesOnly((value) => !value),
										children: ["★ ", t("favoritesOnly")]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-ig-gallery-workspace-toggle",
										title: activeWorkspace === null ? t("workspaceUnavailable") : void 0,
										children: [(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											disabled: activeWorkspace === null,
											checked: activeWorkspace === null ? false : workspaceOnly,
											onChange: (event) => setWorkspaceOnly(event.target.checked)
										}), (0, react_jsx_runtime.jsx)("span", { children: activeWorkspace === null ? t("workspaceUnavailable") : workspaceOnly ? t("workspaceOnly") : t("workspaceAll") })]
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `dsh-ig-gallery-manage-btn ${manageMode ? "is-active" : ""}`,
										onClick: () => {
											setManageMode((value) => !value);
											setSelectedIds(/* @__PURE__ */ new Set());
										},
										children: manageMode ? t("exitManage") : t("manage")
									}),
									manageMode ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsh-ig-gallery-manage-btn",
											onClick: selectAllVisible,
											children: t("selectAll")
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsh-ig-gallery-manage-btn",
											onClick: () => setSelectedIds(/* @__PURE__ */ new Set()),
											children: t("clearSelect")
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: "dsh-ig-gallery-selected-count",
											children: t("selectedCount", { count: String(selectedIds.size) })
										}),
										(0, react_jsx_runtime.jsxs)("label", {
											className: "dsh-ig-gallery-workspace-toggle",
											children: [(0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: deleteWorkspaceFiles,
												onChange: (event) => setDeleteWorkspaceFiles(event.target.checked)
											}), (0, react_jsx_runtime.jsx)("span", { children: t("deleteWorkspaceFilesOpt") })]
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsh-ig-gallery-manage-btn dsh-ig-gallery-manage-danger",
											disabled: selectedIds.size === 0 || generating,
											onClick: () => {
												deleteSelected();
											},
											children: t("batchDelete")
										})
									] }) : null
								]
							}) : null,
							activeTab === "gallery" ? (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-ig-gallery-page-tools",
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-ig-gallery-search-wrap",
										children: [
											(0, react_jsx_runtime.jsxs)("svg", {
												className: "dsh-ig-gallery-search-icon",
												width: "14",
												height: "14",
												viewBox: "0 0 24 24",
												fill: "none",
												stroke: "currentColor",
												strokeWidth: "2",
												strokeLinecap: "round",
												strokeLinejoin: "round",
												children: [(0, react_jsx_runtime.jsx)("circle", {
													cx: "11",
													cy: "11",
													r: "8"
												}), (0, react_jsx_runtime.jsx)("line", {
													x1: "21",
													y1: "21",
													x2: "16.65",
													y2: "16.65"
												})]
											}),
											(0, react_jsx_runtime.jsx)("input", {
												type: "text",
												className: "dsh-ig-gallery-search-input",
												placeholder: t("searchPlaceholder"),
												value: search,
												onChange: (e) => setSearch(e.target.value)
											}),
											search !== "" && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "dsh-ig-gallery-search-clear",
												title: t("clearSearch"),
												"aria-label": t("clearSearch"),
												onClick: () => setSearch(""),
												children: (0, react_jsx_runtime.jsxs)("svg", {
													width: "12",
													height: "12",
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "2.5",
													strokeLinecap: "round",
													strokeLinejoin: "round",
													children: [(0, react_jsx_runtime.jsx)("line", {
														x1: "18",
														y1: "6",
														x2: "6",
														y2: "18"
													}), (0, react_jsx_runtime.jsx)("line", {
														x1: "6",
														y1: "6",
														x2: "18",
														y2: "18"
													})]
												})
											})
										]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-ig-gallery-select-wrap",
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: "dsh-ig-gallery-select-label",
											children: t("ratioFilter")
										}), (0, react_jsx_runtime.jsx)("select", {
											className: "dsh-ig-gallery-select",
											value: selectedRatio,
											onChange: (e) => setSelectedRatio(e.target.value),
											children: ASPECT_RATIO_FILTERS.map((ratio) => (0, react_jsx_runtime.jsx)("option", {
												value: ratio,
												children: ratio === "all" ? t("ratioAll") : ratio
											}, ratio))
										})]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-ig-gallery-select-wrap",
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: "dsh-ig-gallery-select-label",
											children: t("sortBy")
										}), (0, react_jsx_runtime.jsxs)("select", {
											className: "dsh-ig-gallery-select",
											value: sortOption,
											onChange: (e) => setSortOption(e.target.value),
											children: [
												(0, react_jsx_runtime.jsx)("option", {
													value: "time-desc",
													children: t("sortTimeDesc")
												}),
												(0, react_jsx_runtime.jsx)("option", {
													value: "time-asc",
													children: t("sortTimeAsc")
												}),
												(0, react_jsx_runtime.jsx)("option", {
													value: "prompt-asc",
													children: t("sortPromptAsc")
												}),
												(0, react_jsx_runtime.jsx)("option", {
													value: "prompt-desc",
													children: t("sortPromptDesc")
												}),
												(0, react_jsx_runtime.jsx)("option", {
													value: "size-desc",
													children: t("sortSizeDesc")
												})
											]
										})]
									})
								]
							}) : null
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-gallery-page-body",
						ref: bodyRef,
						children: activeTab === "inspiration" ? (0, react_jsx_runtime.jsx)(InspirationView, {
							locale,
							defaultEngine: selectedEngine === "gemini" ? "gemini" : "gpt",
							busy: generating,
							onUsePrompt: async (prompt, engine) => {
								await generateThroughCpa(prompt, engine);
								showToast(t("regenerateSuccess"));
							}
						}) : items.length === 0 ? (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-gallery-empty",
							children: [
								(0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-empty-icon",
									children: "🖼️"
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-empty-title",
									children: t("emptyTitle")
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-empty-desc",
									children: t("emptyDesc")
								})
							]
						}) : processedItems.length === 0 ? (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-gallery-empty",
							children: [
								(0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-empty-icon",
									children: "🔍"
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-empty-title",
									children: t("noMatchTitle")
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-empty-desc",
									children: t("noMatchDesc")
								})
							]
						}) : viewMode === "grid" ? (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-gallery-virtual",
							style: {
								position: "relative",
								height: win.totalHeight
							},
							children: visibleGridRows.map((rowItems, ri) => {
								const rowIndex = win.start + ri;
								return (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-grid-row",
									style: {
										top: rowIndex * rowHeight,
										height: rowHeight - 20,
										gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
									},
									children: rowItems.map((item) => (0, react_jsx_runtime.jsx)(GalleryGridCard, {
										item,
										lang,
										t,
										onPreview: openPreview,
										manage: manageMode,
										selected: selectedIds.has(item.id),
										onSelect: toggleSelected,
										onToggleFavorite: toggleFavorite,
										onRegenerate: regenerateItem,
										onToast: showToast
									}, item.id))
								}, rowIndex);
							})
						}) : viewMode === "list" ? (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-gallery-list-flow",
							children: processedItems.map((item) => (0, react_jsx_runtime.jsx)(GalleryListItem, {
								item,
								lang,
								t,
								onPreview: openPreview,
								manage: manageMode,
								selected: selectedIds.has(item.id),
								onSelect: toggleSelected,
								onToggleFavorite: toggleFavorite,
								onRegenerate: regenerateItem,
								onToast: showToast
							}, item.id))
						}) : (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-gallery-table-wrap",
							children: (0, react_jsx_runtime.jsxs)("table", {
								className: "dsh-ig-gallery-table",
								children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
									(0, react_jsx_runtime.jsx)("th", { className: "dsh-ig-table-th-thumb" }),
									(0, react_jsx_runtime.jsx)("th", { children: t("colPrompt") }),
									(0, react_jsx_runtime.jsx)("th", { children: t("colEngine") }),
									(0, react_jsx_runtime.jsx)("th", { children: t("colResolution") }),
									(0, react_jsx_runtime.jsx)("th", { children: t("colSize") }),
									(0, react_jsx_runtime.jsx)("th", { children: t("colTime") }),
									(0, react_jsx_runtime.jsx)("th", { children: t("colActions") })
								] }) }), (0, react_jsx_runtime.jsxs)("tbody", { children: [
									win.padTop > 0 && (0, react_jsx_runtime.jsx)("tr", {
										className: "dsh-ig-gallery-spacer",
										style: { height: win.padTop },
										children: (0, react_jsx_runtime.jsx)("td", { colSpan: 7 })
									}),
									visibleItems.map((item) => (0, react_jsx_runtime.jsx)(GalleryTableRow, {
										item,
										lang,
										t,
										onPreview: openPreview,
										manage: manageMode,
										selected: selectedIds.has(item.id),
										onSelect: toggleSelected,
										onToggleFavorite: toggleFavorite,
										onRegenerate: regenerateItem,
										onToast: showToast
									}, item.id)),
									win.padBottom > 0 && (0, react_jsx_runtime.jsx)("tr", {
										className: "dsh-ig-gallery-spacer",
										style: { height: win.padBottom },
										children: (0, react_jsx_runtime.jsx)("td", { colSpan: 7 })
									})
								] })]
							})
						})
					}),
					toast && (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-gallery-page-toast",
						children: toast
					}),
					previewItem && (0, react_jsx_runtime.jsx)(GalleryLightbox, {
						item: previewItem,
						index: previewIndex,
						total: processedItems.length,
						t,
						onPrev: () => stepPreview(-1),
						onNext: () => stepPreview(1),
						onClose: closePreview,
						onToast: showToast
					})
				]
			});
		};
		/** Pure centered lightbox with self-loaded full image, prev/next nav, and a position counter. */
		const GalleryLightbox = ({ item, index, total, t, onPrev, onNext, onClose, onToast }) => {
			const { url, blob, loading, error } = useGalleryImage(item.attachment, "full");
			(0, react.useEffect)(() => {
				const onKeyDown = (e) => {
					if (e.key === "ArrowLeft") onPrev();
					else if (e.key === "ArrowRight") onNext();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [onPrev, onNext]);
			const hasPrev = index > 0;
			const hasNext = index >= 0 && index < total - 1;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-ig-lightbox-backdrop",
				onClick: onClose,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-lightbox-topbar",
						onClick: (e) => e.stopPropagation(),
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-lightbox-meta",
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-tag",
									title: item.normalizationError ?? item.saveError,
									children: galleryEngineLabel(item.engine)
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-lightbox-meta-text",
									children: formatResolution(item)
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-lightbox-meta-text",
									children: formatBytes(item.attachment?.bytes)
								}),
								index >= 0 && (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-ig-lightbox-meta-text",
									children: [
										index + 1,
										" / ",
										total
									]
								})
							]
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-ig-lightbox-close-btn",
							title: t("close"),
							onClick: onClose,
							children: (0, react_jsx_runtime.jsxs)("svg", {
								width: "18",
								height: "18",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								strokeLinecap: "round",
								strokeLinejoin: "round",
								children: [(0, react_jsx_runtime.jsx)("line", {
									x1: "18",
									y1: "6",
									x2: "6",
									y2: "18"
								}), (0, react_jsx_runtime.jsx)("line", {
									x1: "6",
									y1: "6",
									x2: "18",
									y2: "18"
								})]
							})
						})]
					}),
					hasPrev && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-lightbox-nav dsh-ig-lightbox-nav-prev",
						title: t("prev"),
						onClick: (e) => {
							e.stopPropagation();
							onPrev();
						},
						children: (0, react_jsx_runtime.jsx)("svg", {
							width: "22",
							height: "22",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: (0, react_jsx_runtime.jsx)("polyline", { points: "15 18 9 12 15 6" })
						})
					}),
					hasNext && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-lightbox-nav dsh-ig-lightbox-nav-next",
						title: t("next"),
						onClick: (e) => {
							e.stopPropagation();
							onNext();
						},
						children: (0, react_jsx_runtime.jsx)("svg", {
							width: "22",
							height: "22",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: (0, react_jsx_runtime.jsx)("polyline", { points: "9 18 15 12 9 6" })
						})
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-lightbox-img-wrap",
						onClick: (e) => e.stopPropagation(),
						children: [
							loading && (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-ig-lightbox-loading",
								children: "…"
							}),
							error && (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-ig-lightbox-error",
								children: ["⚠️ ", error]
							}),
							url && (0, react_jsx_runtime.jsx)("img", {
								className: "dsh-ig-lightbox-img",
								src: url,
								alt: item.prompt
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-lightbox-bottombar",
						onClick: (e) => e.stopPropagation(),
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-lightbox-prompt-text",
							title: item.prompt,
							children: item.prompt
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-lightbox-actions",
							children: [
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dsh-ig-lightbox-btn",
									title: t("copyPpt"),
									onClick: () => {
										handleCopyPrompt(item, t, onToast);
									},
									children: [(0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [(0, react_jsx_runtime.jsx)("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }), (0, react_jsx_runtime.jsx)("rect", {
											x: "8",
											y: "2",
											width: "8",
											height: "4",
											rx: "1",
											ry: "1"
										})]
									}), (0, react_jsx_runtime.jsx)("span", { children: t("copyPpt") })]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dsh-ig-lightbox-btn",
									title: t("copyImg"),
									onClick: () => {
										if (blob) handleCopyImage(blob, t, onToast);
									},
									children: [(0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [(0, react_jsx_runtime.jsx)("rect", {
											x: "9",
											y: "9",
											width: "13",
											height: "13",
											rx: "2",
											ry: "2"
										}), (0, react_jsx_runtime.jsx)("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
									}), (0, react_jsx_runtime.jsx)("span", { children: t("copyImg") })]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dsh-ig-lightbox-btn",
									title: t("download"),
									onClick: () => {
										if (url) handleDownload(item, url);
									},
									children: [(0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											(0, react_jsx_runtime.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
											(0, react_jsx_runtime.jsx)("polyline", { points: "7 10 12 15 17 10" }),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "12",
												y1: "15",
												x2: "12",
												y2: "3"
											})
										]
									}), (0, react_jsx_runtime.jsx)("span", { children: t("download") })]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dsh-ig-lightbox-btn dsh-ig-lightbox-btn-danger",
									title: t("delete"),
									onClick: () => {
										handleDelete(item, t, onToast).then((deleted) => {
											if (deleted) onClose();
										});
									},
									children: [(0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											(0, react_jsx_runtime.jsx)("polyline", { points: "3 6 5 6 21 6" }),
											(0, react_jsx_runtime.jsx)("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "10",
												y1: "11",
												x2: "10",
												y2: "17"
											}),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "14",
												y1: "11",
												x2: "14",
												y2: "17"
											})
										]
									}), (0, react_jsx_runtime.jsx)("span", { children: t("delete") })]
								})
							]
						})]
					})
				]
			});
		};
		/** Grid card: visual-first thumbnail with floating quick actions. */
		const GalleryGridCard = ({ item, t, onPreview, onToast, manage = false, selected = false, onSelect, onToggleFavorite, onRegenerate }) => {
			const { url, loading, error } = useGalleryImage(item.attachment, "thumb");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-ig-gallery-card",
				onClick: () => {
					if (manage) onSelect?.(item);
					else if (url) onPreview(item);
				},
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-ig-gallery-card-media",
					children: [
						manage ? (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							className: "dsh-ig-gallery-select-checkbox",
							checked: selected,
							onChange: () => onSelect?.(item),
							onClick: (event) => event.stopPropagation(),
							"aria-label": item.prompt
						}) : null,
						loading && (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-gallery-card-loading",
							children: "..."
						}),
						error && (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-gallery-card-error",
							children: ["⚠️ ", error]
						}),
						url && (0, react_jsx_runtime.jsx)("img", {
							className: "dsh-ig-gallery-card-img",
							src: url,
							alt: item.prompt,
							loading: "lazy",
							decoding: "async"
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-card-toolbar",
							children: [
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("copyImg"),
									onClick: (e) => {
										e.stopPropagation();
										handleCopyImageFull(item, t, onToast);
									},
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [(0, react_jsx_runtime.jsx)("rect", {
											x: "9",
											y: "9",
											width: "13",
											height: "13",
											rx: "2",
											ry: "2"
										}), (0, react_jsx_runtime.jsx)("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
									})
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("download"),
									onClick: (e) => {
										e.stopPropagation();
										handleDownloadFull(item, t, onToast);
									},
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											(0, react_jsx_runtime.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
											(0, react_jsx_runtime.jsx)("polyline", { points: "7 10 12 15 17 10" }),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "12",
												y1: "15",
												x2: "12",
												y2: "3"
											})
										]
									})
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("copyPpt"),
									onClick: (e) => {
										e.stopPropagation();
										handleCopyPrompt(item, t, onToast);
									},
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [(0, react_jsx_runtime.jsx)("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }), (0, react_jsx_runtime.jsx)("rect", {
											x: "8",
											y: "2",
											width: "8",
											height: "4",
											rx: "1",
											ry: "1"
										})]
									})
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("favoritesOnly"),
									"aria-pressed": item.isFavorite === true,
									onClick: (e) => {
										e.stopPropagation();
										onToggleFavorite?.(item);
									},
									children: item.isFavorite === true ? "★" : "☆"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("regenerate"),
									onClick: (e) => {
										e.stopPropagation();
										onRegenerate?.(item);
									},
									children: "↻"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn dsh-ig-tool-btn-danger",
									title: t("delete"),
									onClick: (e) => {
										e.stopPropagation();
										handleDelete(item, t, onToast);
									},
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											(0, react_jsx_runtime.jsx)("polyline", { points: "3 6 5 6 21 6" }),
											(0, react_jsx_runtime.jsx)("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "10",
												y1: "11",
												x2: "10",
												y2: "17"
											}),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "14",
												y1: "11",
												x2: "14",
												y2: "17"
											})
										]
									})
								})
							]
						})
					]
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-ig-gallery-card-meta",
					children: [(0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-gallery-card-header",
						children: (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ig-tag",
							title: item.normalizationError ?? item.saveError,
							children: galleryEngineLabel(item.engine)
						})
					}), (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-ig-gallery-card-prompt",
						title: item.prompt,
						children: item.prompt
					})]
				})]
			});
		};
		/** List row: horizontal thumbnail + full prompt + metadata + action bar. */
		const GalleryListItem = ({ item, lang, t, onPreview, onToast, manage = false, selected = false, onSelect, onToggleFavorite, onRegenerate }) => {
			const { url, loading, error } = useGalleryImage(item.attachment, "thumb");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-ig-gallery-list-item",
				onClick: () => {
					if (manage) onSelect?.(item);
					else if (url) onPreview(item);
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-gallery-list-thumb",
						children: [
							manage ? (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								className: "dsh-ig-gallery-select-checkbox",
								checked: selected,
								onChange: () => onSelect?.(item),
								onClick: (event) => event.stopPropagation(),
								"aria-label": item.prompt
							}) : null,
							loading && (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-ig-gallery-card-loading",
								children: "..."
							}),
							error && (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-ig-gallery-card-error",
								children: "⚠️"
							}),
							url && (0, react_jsx_runtime.jsx)("img", {
								src: url,
								alt: item.prompt,
								loading: "lazy",
								decoding: "async"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-gallery-list-main",
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								className: "dsh-ig-gallery-list-tags",
								children: (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-tag",
									title: item.normalizationError ?? item.saveError,
									children: galleryEngineLabel(item.engine)
								})
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: "dsh-ig-gallery-list-prompt",
								title: item.prompt,
								children: item.prompt
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-ig-gallery-list-meta",
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										title: t("colResolution"),
										children: formatResolution(item)
									}),
									(0, react_jsx_runtime.jsx)("span", {
										title: t("colSize"),
										children: formatBytes(item.attachment?.bytes)
									}),
									(0, react_jsx_runtime.jsx)("span", {
										title: t("colTime"),
										children: formatDate(item.createdAt, lang)
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)(GalleryActionsBar, {
						item,
						t,
						onToast,
						onToggleFavorite,
						onRegenerate
					})
				]
			});
		};
		const GalleryTableRow = ({ item, lang, t, onPreview, onToast, manage = false, selected = false, onSelect, onToggleFavorite, onRegenerate }) => {
			const { url, loading, error } = useGalleryImage(item.attachment, "thumb");
			return (0, react_jsx_runtime.jsxs)("tr", {
				className: "dsh-ig-gallery-table-row",
				onClick: () => {
					if (manage) onSelect?.(item);
					else if (url) onPreview(item);
				},
				children: [
					(0, react_jsx_runtime.jsxs)("td", {
						className: "dsh-ig-table-cell-thumb",
						children: [manage ? (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							className: "dsh-ig-gallery-select-checkbox",
							checked: selected,
							onChange: () => onSelect?.(item),
							onClick: (event) => event.stopPropagation(),
							"aria-label": item.prompt
						}) : null, (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-gallery-table-thumb",
							children: [
								loading && (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-card-loading",
									children: "..."
								}),
								error && (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-gallery-card-error",
									children: "⚠️"
								}),
								url && (0, react_jsx_runtime.jsx)("img", {
									src: url,
									alt: item.prompt,
									loading: "lazy",
									decoding: "async"
								})
							]
						})]
					}),
					(0, react_jsx_runtime.jsx)("td", {
						className: "dsh-ig-table-cell-prompt",
						children: (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ig-gallery-table-prompt",
							title: item.prompt,
							children: item.prompt
						})
					}),
					(0, react_jsx_runtime.jsx)("td", { children: (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-gallery-table-engine",
						children: (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ig-tag",
							title: item.normalizationError ?? item.saveError,
							children: galleryEngineLabel(item.engine)
						})
					}) }),
					(0, react_jsx_runtime.jsx)("td", { children: formatResolution(item) || "—" }),
					(0, react_jsx_runtime.jsx)("td", { children: formatBytes(item.attachment?.bytes) }),
					(0, react_jsx_runtime.jsx)("td", { children: formatDate(item.createdAt, lang) }),
					(0, react_jsx_runtime.jsx)("td", {
						onClick: (e) => e.stopPropagation(),
						children: (0, react_jsx_runtime.jsx)(GalleryActionsBar, {
							item,
							t,
							onToast,
							onToggleFavorite,
							onRegenerate
						})
					})
				]
			});
		};
		/** Inline icon action bar shared by list and table views. */
		const GalleryActionsBar = ({ item, t, onToast, onToggleFavorite, onRegenerate }) => {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-ig-gallery-actions-row",
				children: [
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-action-btn",
						title: t("copyPpt"),
						onClick: (e) => {
							e.stopPropagation();
							handleCopyPrompt(item, t, onToast);
						},
						children: (0, react_jsx_runtime.jsxs)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: [(0, react_jsx_runtime.jsx)("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }), (0, react_jsx_runtime.jsx)("rect", {
								x: "8",
								y: "2",
								width: "8",
								height: "4",
								rx: "1",
								ry: "1"
							})]
						})
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-action-btn",
						title: t("copyImg"),
						onClick: (e) => {
							e.stopPropagation();
							handleCopyImageFull(item, t, onToast);
						},
						children: (0, react_jsx_runtime.jsxs)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: [(0, react_jsx_runtime.jsx)("rect", {
								x: "9",
								y: "9",
								width: "13",
								height: "13",
								rx: "2",
								ry: "2"
							}), (0, react_jsx_runtime.jsx)("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
						})
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-action-btn",
						title: t("download"),
						onClick: (e) => {
							e.stopPropagation();
							handleDownloadFull(item, t, onToast);
						},
						children: (0, react_jsx_runtime.jsxs)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: [
								(0, react_jsx_runtime.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
								(0, react_jsx_runtime.jsx)("polyline", { points: "7 10 12 15 17 10" }),
								(0, react_jsx_runtime.jsx)("line", {
									x1: "12",
									y1: "15",
									x2: "12",
									y2: "3"
								})
							]
						})
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-action-btn",
						title: t("favoritesOnly"),
						"aria-pressed": item.isFavorite === true,
						onClick: (e) => {
							e.stopPropagation();
							onToggleFavorite?.(item);
						},
						children: item.isFavorite === true ? "★" : "☆"
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-action-btn",
						title: t("regenerate"),
						onClick: (e) => {
							e.stopPropagation();
							onRegenerate?.(item);
						},
						children: "↻"
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ig-action-btn dsh-ig-action-btn-danger",
						title: t("delete"),
						onClick: (e) => {
							e.stopPropagation();
							handleDelete(item, t, onToast);
						},
						children: (0, react_jsx_runtime.jsxs)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: [
								(0, react_jsx_runtime.jsx)("polyline", { points: "3 6 5 6 21 6" }),
								(0, react_jsx_runtime.jsx)("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
								(0, react_jsx_runtime.jsx)("line", {
									x1: "10",
									y1: "11",
									x2: "10",
									y2: "17"
								}),
								(0, react_jsx_runtime.jsx)("line", {
									x1: "14",
									y1: "11",
									x2: "14",
									y2: "17"
								})
							]
						})
					})
				]
			});
		};
		async function handleCopyPrompt(item, t, onToast) {
			try {
				await copyText(item.prompt);
				onToast(t("copiedPrompt"));
			} catch {
				onToast(t("copyFailed"));
			}
		}
		async function copyText(value) {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
				return;
			}
			const textarea = document.createElement("textarea");
			textarea.value = value;
			textarea.setAttribute("readonly", "");
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			try {
				if (!document.execCommand("copy")) throw new Error("copy-failed");
			} finally {
				document.body.removeChild(textarea);
			}
		}
		async function handleCopyImage(blob, t, onToast) {
			onToast(await copyImageBlob(blob) ? t("copiedImage") : t("copyFailed"));
		}
		async function handleDelete(item, t, onToast) {
			if (!window.confirm(t("confirmDelete"))) return false;
			if (typeof item.savedTo === "string" && item.savedTo.trim() !== "" && isCanonicalSavedToPath(item.savedTo) && window.confirm(t("confirmDeleteWorkspace"))) try {
				const response = await fetch(DELETE_ROUTE, {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ paths: [item.savedTo] })
				});
				const payload = await response.json().catch(() => null);
				if (!response.ok || payload?.ok !== true || Array.isArray(payload.failedFiles) && payload.failedFiles.length > 0) {
					onToast(t("deleteFailed"));
					return false;
				}
			} catch {
				onToast(t("deleteFailed"));
				return false;
			}
			if (!await deleteGalleryItem(item.id)) {
				onToast(t("deleteFailed"));
				return false;
			}
			onToast(t("deleted"));
			return true;
		}
		function isCanonicalSavedToPath(value) {
			const normalized = value.replace(/\\/g, "/");
			if (!(normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized))) return false;
			return /^image-[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|gif)$/iu.test(normalized.slice(normalized.lastIndexOf("/") + 1));
		}
		function handleDownload(item, url) {
			const extension = item.attachment.mediaType === "image/jpeg" ? "jpg" : item.attachment.mediaType.split("/")[1] ?? "png";
			const a = document.createElement("a");
			a.href = url;
			a.download = `dsh-${item.engine}-${item.id}.${extension}`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
		/** Lazily fetch the full-resolution bytes for a card's copy/download action. */
		async function fetchFullImage(ref) {
			const response = await fetch(IMAGE_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: buildImageRequestBody(ref, "full", 0)
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.blob();
		}
		async function handleDownloadFull(item, t, onToast) {
			try {
				const blob = await fetchFullImage(item.attachment);
				const url = URL.createObjectURL(blob);
				handleDownload(item, url);
				setTimeout(() => URL.revokeObjectURL(url), 1e3);
			} catch {
				onToast(t("copyFailed"));
			}
		}
		async function handleCopyImageFull(item, t, onToast) {
			try {
				await handleCopyImage(await fetchFullImage(item.attachment), t, onToast);
			} catch {
				onToast(t("copyFailed"));
			}
		}
		function record$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function recordArray(value, key) {
			const root = record$1(value);
			if (!Array.isArray(root?.[key])) return [];
			return root[key].filter((item) => record$1(item) !== void 0);
		}
		async function copyImageBlob(blob) {
			try {
				if (blob.type === "image/png") {
					await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
					return true;
				}
				const img = new Image();
				const url = URL.createObjectURL(blob);
				try {
					await new Promise((resolve, reject) => {
						img.onload = resolve;
						img.onerror = reject;
						img.src = url;
					});
					const canvas = document.createElement("canvas");
					canvas.width = img.naturalWidth;
					canvas.height = img.naturalHeight;
					const ctx = canvas.getContext("2d");
					if (!ctx) throw new Error("Canvas unavailable");
					ctx.drawImage(img, 0, 0);
					const pngBlob = await new Promise((res) => {
						canvas.toBlob(res, "image/png");
					});
					if (!pngBlob) throw new Error("Blob conversion failed");
					await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
					return true;
				} finally {
					URL.revokeObjectURL(url);
				}
			} catch (_err) {
				return false;
			}
		}
		//#endregion
		//#region lib/types/client/sidebar-tab.js
		/** The stable tab type owned by this plugin. */
		const GALLERY_TAB_ID = "dsh-image-gen:gallery";
		/** Safely read the optional service from a Cordis context. */
		function getBetterSidebarService(ctx) {
			try {
				const service = ctx.get?.("betterSidebar");
				if (service === void 0 || typeof service.registerTab !== "function") return void 0;
				return service;
			} catch {
				return;
			}
		}
		/**
		* Register the Gallery as one Better Sidebar tab when the optional plugin is present.
		*/
		function registerBetterSidebarTab(ctx, locale) {
			const service = getBetterSidebarService(ctx);
			if (service === void 0) return { available: false };
			const descriptor = {
				id: GALLERY_TAB_ID,
				title: () => {
					return (locale?.getSnapshot?.()?.active)?.startsWith("en") ? "Gallery" : "画廊";
				},
				order: 70,
				single: true,
				icon: (size) => (0, react_jsx_runtime.jsxs)("svg", {
					width: size,
					height: size,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					style: { display: "block" },
					children: [
						(0, react_jsx_runtime.jsx)("rect", {
							x: "3",
							y: "3",
							width: "18",
							height: "18",
							rx: "2",
							ry: "2"
						}),
						(0, react_jsx_runtime.jsx)("circle", {
							cx: "8.5",
							cy: "8.5",
							r: "1.5"
						}),
						(0, react_jsx_runtime.jsx)("polyline", { points: "21 15 16 10 5 21" })
					]
				}),
				component: ({ scope, visible }) => {
					return (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-sidebar-tab",
						"data-dsh-ig-sidebar-tab": "",
						style: {
							height: "100%",
							width: "100%",
							overflow: "hidden"
						},
						children: (0, react_jsx_runtime.jsx)(GalleryViewTab, {
							locale,
							scope,
							visible
						})
					});
				}
			};
			try {
				return {
					available: true,
					service,
					disposer: service.registerTab(descriptor)
				};
			} catch (error) {
				console.warn("[dsh-image-gen] Failed to register better-sidebar tab:", error);
				return { available: false };
			}
		}
		//#endregion
		//#region lib/types/client/turn-tail.js
		/**
		* Turn-tail deliverable representation for generated images.
		* Renders directly at the tail of the closing assistant message,
		* outside of the collapsed Turn Process.
		*/
		const IMAGE_DELIVERABLES_KIND = "image-generation-deliverables";
		/** Pure conversation definition accumulating generated images for the turn. */
		const imageDeliverablesDefinition = {
			kind: IMAGE_DELIVERABLES_KIND,
			match: (event) => {
				if (event.type === "turn/start" && event.data?.turn !== void 0) return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type === "tool/call" && event.data?.turn !== void 0) return {
					id: String(event.data.turn),
					role: "update"
				};
				if (event.type === "tool/result" && event.surfaceOp === "append") {
					const turn = event.data?.turn;
					if (turn !== void 0) return {
						id: String(turn),
						role: "update"
					};
				}
				return null;
			},
			start: (_context, match) => {
				return {
					turn: match.event.data.turn,
					calls: /* @__PURE__ */ new Map(),
					images: []
				};
			},
			update: (context, match) => {
				const event = match.event;
				if (event.type === "tool/call") {
					const data = event.data;
					if ((data?.name === "generate_image" || data?.name === "edit_image") && data.callId) {
						let prompt;
						try {
							const parsed = JSON.parse(data.arguments || "{}");
							if (typeof parsed?.prompt === "string") prompt = parsed.prompt;
						} catch {}
						const calls = new Map(context.state.calls);
						calls.set(String(data.callId), { prompt });
						return {
							...context.state,
							calls
						};
					}
					return context.state;
				}
				if (event.type === "tool/result") {
					const data = event.data;
					const rawCallId = data?.message?.source?.callId;
					if (typeof rawCallId !== "string" || rawCallId.trim() === "") return context.state;
					const callId = rawCallId;
					if (contentHasError(data?.message?.content)) return context.state;
					let attachment = imageAttachmentFromMeta(data?.meta) ?? imageAttachmentFromMeta(data?.message?.meta);
					if (attachment === void 0) attachment = attachmentFromContent(data?.message?.content);
					if (attachment === void 0) return context.state;
					const meta = {
						...imageMetaRecord$1(data?.message?.meta) ?? {},
						...imageMetaRecord$1(data?.meta) ?? {}
					};
					const callInfo = context.state.calls.get(callId);
					const prompt = typeof meta.prompt === "string" ? meta.prompt : callInfo?.prompt || "Generated Image";
					const engine = meta.engine;
					const operation = meta.operation;
					const model = meta.model;
					const output = meta.output;
					const aspectRatio = meta.aspectRatio;
					const imageSize = meta.imageSize;
					const saveError = meta.saveError;
					const savedTo = typeof meta.savedTo === "string" ? meta.savedTo : void 0;
					const createdAt = typeof meta.createdAt === "number" && Number.isFinite(meta.createdAt) ? meta.createdAt : typeof event.time === "number" && Number.isFinite(event.time) ? event.time : typeof event.seq === "number" && Number.isFinite(event.seq) ? event.seq : 0;
					if (context.state.images.some((img) => img.callId === callId)) return context.state;
					const newImage = {
						seq: typeof event.seq === "number" ? event.seq : 0,
						callId,
						attachment,
						prompt,
						engine,
						...operation === void 0 ? {} : { operation },
						...model === void 0 ? {} : { model },
						...output === void 0 ? {} : { output },
						...aspectRatio === void 0 ? {} : { aspectRatio },
						...imageSize === void 0 ? {} : { imageSize },
						...saveError === void 0 ? {} : { saveError },
						...savedTo === void 0 ? {} : { savedTo },
						createdAt
					};
					return {
						...context.state,
						images: [...context.state.images, newImage]
					};
				}
				return context.state;
			},
			buildLocationData: (context, scope, previous) => {
				if (scope !== "turn" || context.state === void 0) return null;
				const prev = previous;
				if (prev?.kind === "turn" && prev.turn === context.state.turn && prev.key === "image-generation-deliverables" && prev.value?.images === context.state.images) return prev;
				return {
					kind: "turn",
					turn: context.state.turn,
					key: IMAGE_DELIVERABLES_KIND,
					value: { images: context.state.images }
				};
			}
		};
		/** Selector for conversation.chat.turnTail. */
		function selectGeneratedImages(owner) {
			const images = record$2(owner.turn.data.get(IMAGE_DELIVERABLES_KIND))?.images;
			if (!Array.isArray(images)) return null;
			const valid = images.flatMap((candidate) => {
				const image = record$2(candidate);
				const attachment = imageAttachment(image?.attachment);
				if (image === void 0 || attachment === void 0 || typeof image.callId !== "string" || image.callId.trim() === "" || typeof image.seq !== "number" || !Number.isFinite(image.seq) || image.seq > owner.seq || typeof image.prompt !== "string") return [];
				return [{
					...image,
					attachment
				}];
			});
			return valid.length === 0 ? null : valid;
		}
		function contentHasError(value) {
			if (Array.isArray(value)) return value.some(contentHasError);
			const entry = record$2(value);
			if (entry === void 0) return false;
			if (entry.isError === true) return true;
			return contentHasError(entry.content);
		}
		function attachmentFromContent(value) {
			if (Array.isArray(value)) {
				for (const entry of value) {
					const attachment = attachmentFromContent(entry);
					if (attachment !== void 0) return attachment;
				}
				return;
			}
			const entry = record$2(value);
			if (entry === void 0) return void 0;
			if (entry.type === "image") {
				const attachment = imageAttachment(entry.attachment);
				if (attachment !== void 0) return attachment;
			}
			return attachmentFromContent(entry.content);
		}
		const DICT$1 = {
			zh: {
				generatedTitle: "已生成图片",
				editedTitle: "已编辑图片",
				copyImg: "复制图片",
				download: "下载图片",
				openNewTab: "新标签页打开",
				copiedImage: "已复制图片",
				copyFailed: "复制失败",
				savedToPath: "已保存到",
				loading: "正在加载图片…",
				loadFailed: "图片读取失败 ({status})"
			},
			en: {
				generatedTitle: "Generated image",
				editedTitle: "Edited image",
				copyImg: "Copy Image",
				download: "Download Image",
				openNewTab: "Open in new tab",
				copiedImage: "Image copied",
				copyFailed: "Copy failed",
				savedToPath: "Saved to",
				loading: "Loading image…",
				loadFailed: "Failed to load image ({status})"
			}
		};
		function TurnTailImagesCard({ matched, locale }) {
			if (!matched || matched.length === 0) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-ig-turntail-wrap",
				"data-deliverables-images": "true",
				children: matched.map((item) => (0, react_jsx_runtime.jsx)(SingleGeneratedImageView, {
					attachment: item.attachment,
					engine: item.engine,
					operation: item.operation,
					model: item.model,
					output: item.output,
					aspectRatio: item.aspectRatio,
					imageSize: item.imageSize,
					saveError: item.saveError,
					savedTo: item.savedTo,
					prompt: item.prompt,
					createdAt: item.createdAt,
					locale
				}, item.callId || item.attachment.attachmentId))
			});
		}
		function SingleGeneratedImageView({ attachment, engine, operation, model, output, aspectRatio, imageSize, saveError, savedTo, prompt, createdAt, locale }) {
			const normalizedMetadata = normalizeGalleryItem({ engine });
			const [url, setUrl] = (0, react.useState)();
			const [blob, setBlob] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [previewOpen, setPreviewOpen] = (0, react.useState)(false);
			const [toast, setToast] = (0, react.useState)();
			const [lang, setLang] = (0, react.useState)(() => locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			(0, react.useEffect)(() => {
				return locale?.subscribe?.(() => {
					setLang(locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
				});
			}, [locale]);
			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT$1.en : DICT$1.zh)[keyName] || DICT$1.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};
			const attachmentKey = JSON.stringify({
				id: attachment.attachmentId,
				mediaType: attachment.mediaType,
				bytes: attachment.bytes,
				width: attachment.width,
				height: attachment.height,
				name: attachment.name,
				originalDimensions: attachment.originalDimensions
			});
			(0, react.useEffect)(() => {
				saveGalleryItem(normalizeGalleryItem({
					id: attachment.attachmentId,
					attachment,
					prompt,
					engine,
					...typeof model === "string" ? { model } : {},
					...typeof output === "string" ? { output } : {},
					...typeof aspectRatio === "string" ? { aspectRatio } : {},
					...typeof imageSize === "string" ? { imageSize } : {},
					...typeof saveError === "string" ? { saveError } : {},
					...savedTo === void 0 ? {} : { savedTo },
					createdAt
				}));
			}, [
				attachmentKey,
				createdAt,
				prompt,
				engine,
				model,
				output,
				aspectRatio,
				imageSize,
				saveError,
				savedTo
			]);
			(0, react.useEffect)(() => {
				if (!previewOpen) return;
				const onKeyDown = (e) => {
					if (e.key === "Escape") setPreviewOpen(false);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [previewOpen]);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let objectUrl;
				setUrl(void 0);
				setBlob(void 0);
				setError(void 0);
				fetch(IMAGE_ROUTE, {
					method: "POST",
					signal: controller.signal,
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ attachment })
				}).then(async (response) => {
					if (!response.ok) throw new Error(t("loadFailed", { status: String(response.status) }));
					const resBlob = await response.blob();
					if (controller.signal.aborted) return;
					setBlob(resBlob);
					objectUrl = URL.createObjectURL(resBlob);
					setUrl(objectUrl);
				}).catch((cause) => {
					if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
				});
				return () => {
					controller.abort();
					if (objectUrl !== void 0) URL.revokeObjectURL(objectUrl);
				};
			}, [attachmentKey, lang]);
			const copy = async (e) => {
				e.stopPropagation();
				if (!blob) return;
				const ok = await copyImageBlob(blob);
				setToast(ok ? t("copiedImage") : t("copyFailed"));
				setTimeout(() => {
					setToast(void 0);
				}, 2e3);
			};
			const download = (e) => {
				e.stopPropagation();
				if (!url) return;
				const a = document.createElement("a");
				a.href = url;
				const extension = extensionForMediaType(attachment.mediaType);
				const safeName = typeof attachment.name === "string" && /^[a-z0-9._-]+$/iu.test(attachment.name) ? attachment.name : `dsh-image-${Date.now()}`;
				a.download = /\.(?:png|jpe?g|webp|gif)$/iu.test(safeName) ? safeName : `${safeName}.${extension}`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			};
			const openNewTab = (e) => {
				e.stopPropagation();
				if (!url) return;
				window.open(url, "_blank", "noopener,noreferrer");
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-ig-result",
				"aria-label": t(operation === "edit" ? "editedTitle" : "generatedTitle"),
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-result-title",
						title: normalizedMetadata.normalizationError,
						children: [
							t(operation === "edit" ? "editedTitle" : "generatedTitle"),
							" · ",
							galleryEngineLabel(normalizedMetadata.engine)
						]
					}),
					typeof saveError === "string" ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-error",
						children: saveError
					}) : null,
					savedTo !== void 0 ? (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-savedto",
						children: [
							t("savedToPath"),
							":",
							" ",
							(0, react_jsx_runtime.jsx)("span", { children: savedTo })
						]
					}) : null,
					error !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-error",
						children: error
					}) : null,
					url === void 0 && error === void 0 ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-loading",
						children: t("loading")
					}) : null,
					url !== void 0 ? (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ig-container",
						children: [(0, react_jsx_runtime.jsx)("img", {
							className: "dsh-ig-image",
							src: url,
							alt: attachment.name ?? "Generated image",
							onClick: () => {
								setPreviewOpen(true);
							}
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-toolbar",
							children: [
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("copyImg"),
									onClick: (e) => {
										copy(e);
									},
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "15",
										height: "15",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [(0, react_jsx_runtime.jsx)("rect", {
											x: "9",
											y: "9",
											width: "13",
											height: "13",
											rx: "2",
											ry: "2"
										}), (0, react_jsx_runtime.jsx)("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
									})
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("download"),
									onClick: download,
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "15",
										height: "15",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											(0, react_jsx_runtime.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
											(0, react_jsx_runtime.jsx)("polyline", { points: "7 10 12 15 17 10" }),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "12",
												y1: "15",
												x2: "12",
												y2: "3"
											})
										]
									})
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-ig-tool-btn",
									title: t("openNewTab"),
									onClick: openNewTab,
									children: (0, react_jsx_runtime.jsxs)("svg", {
										width: "15",
										height: "15",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											(0, react_jsx_runtime.jsx)("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
											(0, react_jsx_runtime.jsx)("polyline", { points: "15 3 21 3 21 9" }),
											(0, react_jsx_runtime.jsx)("line", {
												x1: "10",
												y1: "14",
												x2: "21",
												y2: "3"
											})
										]
									})
								}),
								toast ? (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-ig-toast",
									children: toast
								}) : null
							]
						})]
					}) : null,
					previewOpen && url !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-ig-lightbox-backdrop",
						onClick: () => {
							setPreviewOpen(false);
						},
						children: (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-ig-lightbox-img-wrap",
							onClick: (e) => {
								e.stopPropagation();
							},
							children: (0, react_jsx_runtime.jsx)("img", {
								className: "dsh-ig-lightbox-img",
								src: url,
								alt: attachment.name ?? "Generated image preview"
							})
						})
					}) : null
				]
			});
		}
		function imageMetaRecord$1(value) {
			const candidate = record$2(value);
			return candidate?.kind === "dsh-image-gen" ? candidate : void 0;
		}
		function extensionForMediaType(mediaType) {
			if (mediaType === "image/jpeg") return "jpg";
			if (mediaType === "image/webp") return "webp";
			if (mediaType === "image/gif") return "gif";
			return "png";
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Web settings and generated-image cards contributed by the Bundle. */
		const DICT = {
			zh: {
				title: "图像生成",
				description: "选择图片生成引擎并配置工作区保存。",
				engine: "生成引擎",
				engineGPT: "GPT Image 2",
				engineGemini: "Gemini Image",
				saveToWorkspace: "保存到工作区",
				saveToWorkspaceHint: "每次生成后，把图片文件保存到当前会话工作区。",
				folder: "工作区文件夹",
				folderHint: "相对当前会话工作区的子目录；留空表示工作区根目录。",
				saving: "保存中…",
				save: "保存",
				saved: "已保存",
				saveFailed: "设置保存失败",
				savedToPath: "已保存到",
				generating: "正在生成图片…",
				loading: "正在加载图片…",
				loadFailed: "图片读取失败 ({status})",
				generatedTitle: "已生成图片",
				copyImg: "复制图片",
				download: "下载图片",
				openNewTab: "新标签页打开",
				copiedImage: "已复制图片",
				copyFailed: "复制失败"
			},
			en: {
				title: "Image Generation",
				description: "Select an image engine and configure workspace saving.",
				engine: "Image engine",
				engineGPT: "GPT Image 2",
				engineGemini: "Gemini Image",
				saveToWorkspace: "Save to workspace",
				saveToWorkspaceHint: "Write each generated image as a file into the session workspace.",
				folder: "Workspace folder",
				folderHint: "Subdirectory of the session workspace; empty means the workspace root.",
				saving: "Saving…",
				save: "Save",
				saved: "Saved",
				saveFailed: "Could not save settings",
				savedToPath: "Saved to",
				generating: "Generating image…",
				loading: "Loading image…",
				loadFailed: "Failed to load image ({status})",
				generatedTitle: "Generated image",
				copyImg: "Copy Image",
				download: "Download Image",
				openNewTab: "Open in new tab",
				copiedImage: "Image copied",
				copyFailed: "Copy failed"
			}
		};
		const STYLE = `
.dsh-ig-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;overflow:hidden}
.dsh-ig-card:hover{border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px}
.dsh-ig-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c78ff);outline-offset:-2px}
.dsh-ig-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-ig-title{display:block;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-desc{display:block;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#7b818b);transition:transform .16s;display:inline-flex;align-items:center}
.dsh-ig-chevron-open{transform:rotate(180deg)}
.dsh-ig-body{border-top:1px solid var(--dsw-alias-border-l2,#eee);padding:0 16px 16px}
.dsh-ig-field{display:grid;gap:6px;margin-top:14px}
.dsh-ig-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-input{box-sizing:border-box;width:100%;padding:8px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;outline:none;transition:border-color .15s}
.dsh-ig-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-input-group{display:flex;gap:8px;align-items:center}
.dsh-ig-btn-reset{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;padding:7px 12px;background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.dsh-ig-btn-reset:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-ig-hint,.dsh-ig-status{margin:0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px;line-height:1.4}
.dsh-ig-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.dsh-ig-check-row{display:flex;align-items:center;gap:8px;cursor:pointer}
.dsh-ig-check-row input[type=checkbox]{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#4c78ff);margin:0}
.dsh-ig-savedto{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b);word-break:break-all}
.dsh-ig-save{appearance:none;border:0;border-radius:8px;padding:6px 16px;background:var(--dsw-alias-label-primary,#111827);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s}
.dsh-ig-save:disabled{opacity:.4;cursor:default}

.dsh-ig-result{display:grid;gap:10px;max-width:520px}
.dsh-ig-result-title{font-size:14px;font-weight:600}
.dsh-ig-container{position:relative;display:inline-block;width:fit-content;max-width:100%;justify-self:start;border-radius:12px;overflow:hidden;line-height:0}
.dsh-ig-container:hover .dsh-ig-toolbar{opacity:1;pointer-events:auto}
.dsh-ig-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}
.dsh-ig-tool-btn{appearance:none;border:0;background:transparent;color:#fff;padding:5px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-ig-tool-btn:hover{background:rgba(255,255,255,0.25)}
.dsh-ig-tool-btn-danger:hover{background:rgba(239,68,68,0.75)!important;color:#fff!important}
.dsh-ig-toast{position:absolute;top:100%;left:0;margin-top:5px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;white-space:nowrap;pointer-events:none;z-index:20}
.dsh-ig-image{display:block;max-width:100%;max-height:520px;border-radius:12px;background:#f2f3f5;cursor:pointer}
@keyframes dsh-ig-fade{from{opacity:0}to{opacity:1}}
.dsh-ig-error{color:var(--dsw-alias-label-error,#d33);font-size:13px}
.dsh-ig-loading{color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}
.dsh-ig-turntail-wrap{display:flex;flex-direction:column;gap:12px;margin:8px 0}
.dsh-ig-file-btn{appearance:none;border:0;background:none;padding:0;font:inherit;color:var(--dsw-alias-brand-primary,#4c78ff);cursor:pointer;text-decoration:underline;word-break:break-all}
.dsh-ig-file-btn:hover{color:var(--dsw-alias-brand-hover,#3b66e8)}

/* Gallery View (Optimized for both Sidebar Panels and Floating Windows) */
.dsh-ig-sidebar-tab{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden}
.dsh-ig-gallery-page{width:100%;height:100%;background:var(--dsw-alias-bg-layer-1,#ffffff);display:flex;flex-direction:column;overflow:hidden;flex:1;box-sizing:border-box}
.dsh-ig-gallery-page-header{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#ffffff);flex-shrink:0}
.dsh-ig-gallery-page-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dsh-ig-gallery-tab-toggle{display:inline-flex;align-items:center;gap:3px;padding:2px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,#f3f4f6)}
.dsh-ig-gallery-tab-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#4b5563);border-radius:6px;padding:5px 8px;font:inherit;font-size:12px;cursor:pointer}.dsh-ig-gallery-tab-btn.is-active{background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-brand-primary,#4c78ff);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.dsh-ig-gallery-management-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.dsh-ig-gallery-manage-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:7px;padding:4px 8px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary,#4b5563);font:inherit;font-size:11px;cursor:pointer}.dsh-ig-gallery-manage-btn:hover,.dsh-ig-gallery-manage-btn.is-active{border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-brand-primary,#4c78ff)}.dsh-ig-gallery-manage-btn:disabled{opacity:.45;cursor:default}.dsh-ig-gallery-manage-danger{color:#ef4444}.dsh-ig-gallery-workspace-toggle{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:11px}.dsh-ig-gallery-workspace-toggle input,.dsh-ig-gallery-select-checkbox{accent-color:var(--dsw-alias-brand-primary,#4c78ff)}.dsh-ig-gallery-selected-count{font-size:11px;color:var(--dsw-alias-label-secondary,#4b5563)}.dsh-ig-gallery-select-checkbox{position:absolute;z-index:12;top:7px;left:7px;width:17px;height:17px}.dsh-ig-gallery-list-thumb,.dsh-ig-gallery-table-thumb{position:relative}
.dsh-ig-gallery-page-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-ig-gallery-page-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap}
.dsh-ig-gallery-page-count{font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-3,#f3f4f6);padding:2px 8px;border-radius:20px;white-space:nowrap}
.dsh-ig-gallery-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dsh-ig-gallery-pill{appearance:none;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-2,#fff);cursor:pointer;transition:background .15s,border-color .15s,color .15s}
.dsh-ig-gallery-pill:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-gallery-pill.is-active{background:var(--dsw-alias-brand-primary,#4c78ff);border-color:var(--dsw-alias-brand-primary,#4c78ff);color:#fff}
.dsh-ig-gallery-pill-badge{font-size:11px;font-weight:600;line-height:1;background:var(--dsw-alias-bg-layer-3,#eef1f4);color:var(--dsw-alias-label-secondary,inherit);border-radius:999px;padding:2px 6px;min-width:14px;text-align:center}
.dsh-ig-gallery-pill.is-active .dsh-ig-gallery-pill-badge{background:rgba(255,255,255,0.25);color:#fff}
.dsh-ig-gallery-page-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-ig-gallery-search-wrap{position:relative;display:flex;align-items:center;flex:1;min-width:110px;max-width:260px}
.dsh-ig-gallery-search-icon{position:absolute;left:8px;color:var(--dsw-alias-label-tertiary,#9ca3af);pointer-events:none}
.dsh-ig-gallery-search-input{padding:5px 24px 5px 28px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;width:100%;box-sizing:border-box;transition:border-color .15s}
.dsh-ig-gallery-search-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-gallery-search-clear{appearance:none;border:0;background:transparent;position:absolute;right:4px;padding:3px;border-radius:50%;color:var(--dsw-alias-label-tertiary,#9ca3af);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-ig-gallery-search-clear:hover{background:var(--dsw-alias-bg-layer-3,#eef1f4);color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-gallery-select-wrap{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-gallery-select{padding:5px 8px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;cursor:pointer}
.dsh-ig-gallery-select:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-gallery-view-toggle{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,#f3f4f6)}
.dsh-ig-view-toggle-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#7b818b);border-radius:6px;padding:4px 6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-ig-view-toggle-btn:hover{color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-view-toggle-btn.is-active{background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-brand-primary,#4c78ff);box-shadow:0 1px 3px rgba(0,0,0,0.12)}
.dsh-ig-gallery-page-body{flex:1;overflow-y:auto;padding:12px 14px;box-sizing:border-box}
.dsh-ig-gallery-virtual{width:100%}
.dsh-ig-gallery-grid-row{position:absolute;left:0;right:0;display:grid;gap:20px}
.dsh-ig-gallery-list-flow{display:flex;flex-direction:column;gap:12px;min-height:100%;padding:0 2px 12px}.dsh-ig-gallery-list-flow .dsh-ig-gallery-list-item{flex:0 0 auto}
.dsh-ig-gallery-spacer td{padding:0;border:0}
.dsh-ig-gallery-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;height:100%}
.dsh-ig-gallery-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.06);border-color:var(--dsw-alias-border-l1,#cfd4dc)}
.dsh-ig-gallery-card-media{position:relative;width:100%;aspect-ratio:1/1;flex:none;background:#f3f4f6;overflow:hidden;display:flex;align-items:center;justify-content:center}
.dsh-ig-gallery-card-img{width:100%;height:100%;object-fit:cover;transition:transform .2s}
.dsh-ig-gallery-card:hover .dsh-ig-gallery-card-img{transform:scale(1.03)}
.dsh-ig-gallery-card-loading{font-size:12px;color:#9ca3af}
.dsh-ig-gallery-card-error{font-size:12px;color:#ef4444;padding:8px;text-align:center}

/* List view */
.dsh-ig-gallery-list{display:flex;flex-direction:column;gap:12px}
.dsh-ig-gallery-list-item{display:flex;align-items:stretch;gap:16px;background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;padding:12px;cursor:pointer;transition:border-color .15s,box-shadow .15s;height:100%;box-sizing:border-box}
.dsh-ig-gallery-list-item:hover{border-color:var(--dsw-alias-brand-primary,#4c78ff);box-shadow:0 4px 16px rgba(0,0,0,0.06)}
.dsh-ig-gallery-list-thumb{flex:none;width:96px;height:96px;border-radius:8px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center;align-self:center}
.dsh-ig-gallery-list-thumb img{width:100%;height:100%;object-fit:cover}
.dsh-ig-gallery-list-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.dsh-ig-gallery-list-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dsh-ig-tag-muted{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-tertiary,#7b818b);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);text-transform:none;font-weight:400}
.dsh-ig-gallery-list-prompt{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:block;white-space:pre-wrap;overflow:visible;word-break:break-word}
.dsh-ig-gallery-list-meta{display:flex;align-items:center;gap:14px;font-size:12px;color:var(--dsw-alias-label-tertiary,#7b818b);margin-top:auto}
.dsh-ig-gallery-actions-row{display:flex;align-items:center;gap:4px}
.dsh-ig-action-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);border-radius:7px;padding:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s,border-color .15s}
.dsh-ig-action-btn:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-brand-primary,#4c78ff);color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-ig-action-btn-danger:hover{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.5);color:#ef4444}

/* Table view */
.dsh-ig-gallery-table-wrap{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;overflow:hidden}
.dsh-ig-gallery-table{width:100%;border-collapse:collapse;font-size:13px}
.dsh-ig-gallery-table thead th{text-align:left;padding:10px 14px;background:var(--dsw-alias-bg-layer-3,#f3f4f6);color:var(--dsw-alias-label-secondary,#4b5563);font-weight:600;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);white-space:nowrap}
.dsh-ig-table-th-thumb{width:56px}
.dsh-ig-gallery-table-row{cursor:pointer;transition:background .12s}
.dsh-ig-gallery-table-row:hover{background:var(--dsw-alias-bg-layer-1,#fafbfc)}
.dsh-ig-gallery-table-row td{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#eef0f3);color:var(--dsw-alias-label-secondary,inherit);vertical-align:middle}
.dsh-ig-gallery-table-row:last-child td{border-bottom:0}
.dsh-ig-table-cell-thumb{width:56px;position:relative}
.dsh-ig-gallery-table-thumb{width:44px;height:44px;border-radius:6px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center}
.dsh-ig-gallery-table-thumb img{width:100%;height:100%;object-fit:cover}
.dsh-ig-table-cell-prompt{max-width:380px}
.dsh-ig-gallery-table-prompt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;color:var(--dsw-alias-label-primary,inherit)}
.dsh-ig-gallery-table-engine{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.dsh-ig-table-model{font-size:11px;color:var(--dsw-alias-label-tertiary,#7b818b);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Floating Action Toolbar (Matches Chat Image Toolbar) */
.dsh-ig-gallery-card:hover .dsh-ig-card-toolbar{opacity:1;pointer-events:auto}
.dsh-ig-card-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:4px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}

.dsh-ig-gallery-card-meta{padding:10px 14px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2,#fff);flex:1;min-height:70px;box-sizing:border-box}
.dsh-ig-gallery-card-header{display:flex;align-items:center;justify-content:space-between;font-size:11px}
.dsh-ig-tag{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#edf0f3);color:var(--dsw-alias-label-secondary,inherit);font-weight:500;text-transform:uppercase;font-size:10px}
.dsh-ig-gallery-card-prompt{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-ig-gallery-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:360px;text-align:center;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-ig-gallery-empty-icon{font-size:48px;margin-bottom:12px}
.dsh-ig-gallery-empty-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);margin-bottom:6px}
.dsh-ig-gallery-empty-desc{font-size:13px;max-width:360px;line-height:1.5}

/* Pure Centered Lightbox */
.dsh-ig-lightbox-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;cursor:zoom-out;animation:dsh-ig-fade .15s ease-out}
.dsh-ig-lightbox-topbar{position:absolute;top:20px;left:24px;right:24px;display:flex;align-items:center;justify-content:space-between;z-index:10;pointer-events:none}
.dsh-ig-lightbox-meta{display:flex;align-items:center;gap:8px;pointer-events:auto}
.dsh-ig-lightbox-meta-text{font-size:12px;color:rgba(255,255,255,0.75);background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:6px}
.dsh-ig-lightbox-close-btn{appearance:none;border:0;background:rgba(255,255,255,0.15);color:#fff;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;pointer-events:auto}
.dsh-ig-lightbox-close-btn:hover{background:rgba(255,255,255,0.3)}
.dsh-ig-lightbox-img-wrap{max-width:86vw;max-height:78vh;display:flex;align-items:center;justify-content:center;cursor:default}
.dsh-ig-lightbox-img{max-width:100%;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,0.7);user-select:none}
.dsh-ig-lightbox-loading{color:rgba(255,255,255,0.6);font-size:13px}
.dsh-ig-lightbox-error{color:#fca5a5;font-size:13px;text-align:center;max-width:60vw}
.dsh-ig-lightbox-nav{appearance:none;border:0;background:rgba(255,255,255,0.12);color:#fff;border-radius:50%;width:44px;height:44px;font-size:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;position:absolute;top:50%;margin-top:-22px;z-index:11}
.dsh-ig-lightbox-nav:hover{background:rgba(255,255,255,0.28)}
.dsh-ig-lightbox-nav-prev{left:20px}
.dsh-ig-lightbox-nav-next{right:20px}
.dsh-ig-lightbox-bottombar{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);max-width:min(90vw,640px);background:rgba(20,22,26,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:10px 16px;display:flex;flex-direction:column;gap:8px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,0.5);cursor:default}
.dsh-ig-lightbox-prompt-text{font-size:13px;line-height:1.4;color:rgba(255,255,255,0.92);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-ig-lightbox-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px}
.dsh-ig-lightbox-btn{appearance:none;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#fff;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .15s,border-color .15s,color .15s}
.dsh-ig-lightbox-btn:hover{background:rgba(255,255,255,0.22)}
.dsh-ig-lightbox-btn-danger{border-color:rgba(239,68,68,0.4);color:#fca5a5}
.dsh-ig-lightbox-btn-danger:hover{background:rgba(239,68,68,0.35)!important;color:#fff!important;border-color:rgba(239,68,68,0.7)!important}
.dsh-ig-gallery-page-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;z-index:99999;animation:dsh-ig-fade .15s}

/* Responsive: stack gallery toolbar rows on narrow viewports */
@media (max-width:720px){
  .dsh-ig-gallery-page-top{flex-direction:column;align-items:flex-start;gap:8px}
  .dsh-ig-gallery-page-header{padding:10px 12px}
  .dsh-ig-gallery-page-body{padding:10px 12px}
}
@media (max-width:600px){
  .dsh-ig-gallery-list-item{flex-direction:column;align-items:flex-start;gap:10px}
  .dsh-ig-gallery-list-thumb{width:100%;height:180px;align-self:stretch}
  .dsh-ig-gallery-list-main{width:100%;flex:0 1 auto}
  .dsh-ig-gallery-list-meta{margin-top:0;flex-wrap:wrap;gap:8px 14px}
  .dsh-ig-gallery-actions-row{width:100%;flex-wrap:wrap;justify-content:flex-start}
}
`;
		/** Required browser services. */
		const inject = [
			"slots",
			"connection",
			"remote",
			"settingsScope",
			"locale",
			"uiConversation"
		];
		/** Mount the settings card, generated-image card, and native conversation gallery view. */
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: IMAGE_GENERATION_NAMESPACE });
			const locale = ctx.get("locale");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "dsh-image-gen";
				style.textContent = STYLE;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "dsh-image-gen: styles");
			const register = ctx.slots.register.bind(ctx.slots);
			ctx.slots.inject("settings.plugin.item", () => register({
				name: "settings.plugin.item",
				key: IMAGE_GENERATION_NAMESPACE,
				inject: () => ({
					scope,
					locale
				})
			}, ImageGenerationSettingsCard));
			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: "generate_image",
				inject: () => ({ locale })
			}, GeneratedImageCard));
			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: "edit_image",
				inject: () => ({ locale })
			}, GeneratedImageCard));
			ctx.inject(["uiConversation"], (convCtx) => {
				const uiConv = convCtx.get("uiConversation");
				if (uiConv?.events?.register) convCtx.effect(() => uiConv.events.register(imageDeliverablesDefinition), "dsh-image-gen: deliverables definition");
			});
			ctx.slots.inject("conversation.chat.turnTail", () => register({
				name: "conversation.chat.turnTail",
				select: selectGeneratedImages,
				locale: IMAGE_GENERATION_NAMESPACE,
				inject: () => ({ locale })
			}, TurnTailImagesCard));
			ctx.effect(() => {
				let unregister;
				const tryRegister = () => {
					if (unregister !== void 0) return;
					const reg = registerBetterSidebarTab(ctx, locale);
					if (reg.available) unregister = reg.disposer;
				};
				tryRegister();
				const timer = setInterval(tryRegister, 1e3);
				return () => {
					clearInterval(timer);
					unregister?.();
				};
			}, "dsh-image-gen: better-sidebar tab registration");
		}
		/** Edit the selected image engine and workspace output settings. */
		function ImageGenerationSettingsCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const [snapshot, setSnapshot] = (0, react.useState)(() => props.scope.getSnapshot());
			const [lang, setLang] = (0, react.useState)(() => props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			const [engine, setEngine] = (0, react.useState)("gpt");
			const [saveToWorkspace, setSaveToWorkspace] = (0, react.useState)(true);
			const [workspaceFolder, setWorkspaceFolder] = (0, react.useState)("dsh-image-gen");
			const [saving, setSaving] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)("");
			(0, react.useEffect)(() => props.scope.subscribe(() => {
				setSnapshot(props.scope.getSnapshot());
			}), [props.scope]);
			(0, react.useEffect)(() => {
				return props.locale?.subscribe?.(() => {
					setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
				});
			}, [props.locale]);
			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};
			(0, react.useEffect)(() => {
				const value = snapshot.value;
				setEngine(value?.engine ?? "gpt");
				setSaveToWorkspace(value?.saveToWorkspace ?? true);
				setWorkspaceFolder(value?.workspaceFolder ?? "dsh-image-gen");
			}, [snapshot]);
			const save = async (event) => {
				event.preventDefault();
				setSaving(true);
				setMessage("");
				try {
					await props.scope.set("engine", engine);
					await props.scope.set("saveToWorkspace", saveToWorkspace);
					await props.scope.set("workspaceFolder", workspaceFolder.trim());
					setMessage(t("saved"));
				} catch {
					console.warn("[dsh-image-gen] settings save failed");
					setMessage(t("saveFailed"));
				} finally {
					setSaving(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("li", {
				className: `dsh-ig-card ${open ? "dsh-ig-card-open" : ""}`,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-ig-head",
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [(0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-ig-head-text",
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ig-title",
							children: t("title")
						}), (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ig-desc",
							children: t("description")
						})]
					}), (0, react_jsx_runtime.jsx)("span", {
						className: `dsh-ig-chevron ${open ? "dsh-ig-chevron-open" : ""}`,
						"aria-hidden": "true",
						children: (0, react_jsx_runtime.jsx)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 16 16",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: (0, react_jsx_runtime.jsx)("path", { d: "M4 6l4 4 4-4" })
						})
					})]
				}), open ? (0, react_jsx_runtime.jsxs)("form", {
					className: "dsh-ig-body",
					onSubmit: (event) => {
						save(event);
					},
					children: [
						(0, react_jsx_runtime.jsxs)("label", {
							className: "dsh-ig-field",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "dsh-ig-label",
								children: t("engine")
							}), (0, react_jsx_runtime.jsxs)("select", {
								className: "dsh-ig-input",
								value: engine,
								onChange: (event) => {
									setEngine(event.target.value);
								},
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "gpt",
									children: t("engineGPT")
								}), (0, react_jsx_runtime.jsx)("option", {
									value: "gemini",
									children: t("engineGemini")
								})]
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-field",
							children: [(0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-ig-check-row",
								children: [(0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: saveToWorkspace,
									onChange: (event) => {
										setSaveToWorkspace(event.target.checked);
									}
								}), (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-label",
									children: t("saveToWorkspace")
								})]
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-ig-hint",
								children: t("saveToWorkspaceHint")
							})]
						}),
						saveToWorkspace ? (0, react_jsx_runtime.jsxs)("label", {
							className: "dsh-ig-field",
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-label",
									children: t("folder")
								}),
								(0, react_jsx_runtime.jsx)("input", {
									className: "dsh-ig-input",
									value: workspaceFolder,
									onChange: (event) => {
										setWorkspaceFolder(event.target.value);
									},
									placeholder: "dsh-image-gen"
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: "dsh-ig-hint",
									children: t("folderHint")
								})
							]
						}) : null,
						(0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-ig-actions",
							children: [(0, react_jsx_runtime.jsx)("p", {
								className: "dsh-ig-status",
								role: "status",
								children: message
							}), (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-ig-save",
								type: "submit",
								disabled: saving || !snapshot.writable,
								children: saving ? t("saving") : t("save")
							})]
						})
					]
				}) : null]
			});
		}
		/** Render the durable attachment referenced by a completed image tool call inside the tool details. */
		function GeneratedImageCard(props) {
			const attachment = imageRef(props.block);
			const savedTo = imageSavedTo(props.block);
			const metadata = imageMetadata(props.block);
			const generatingText = (props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh") === "en" ? DICT.en.generating : DICT.zh.generating;
			if (attachment === void 0) return (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-ig-loading",
				children: generatingText
			});
			return (0, react_jsx_runtime.jsx)(SingleGeneratedImageView, {
				attachment,
				engine: metadata.engine,
				model: metadata.model,
				output: metadata.output,
				aspectRatio: metadata.aspectRatio,
				imageSize: metadata.imageSize,
				saveError: metadata.saveError,
				savedTo,
				prompt: metadata.prompt,
				createdAt: metadata.createdAt,
				locale: props.locale
			});
		}
		function imageRef(block) {
			if (!("kind" in block) || block.kind !== "tool-result" || block.isError === true) return void 0;
			const fromMeta = imageAttachmentFromMeta(block.meta);
			if (fromMeta !== void 0) return fromMeta;
			const legacyView = record(block.resultView);
			if (legacyView?.card === "generic" && Array.isArray(legacyView.content)) {
				const legacyAttachment = imageAttachment(record(legacyView.content.find((item) => record(item)?.type === "image"))?.attachment);
				if (legacyAttachment !== void 0) return legacyAttachment;
			}
			const image = (Array.isArray(block.content) ? block.content : []).find((item) => record(item)?.type === "image");
			return image?.type === "image" ? imageAttachment(image.attachment) : void 0;
		}
		function imageMetadata(block) {
			const meta = {
				...imageMetaRecord(record(block.resultView)?.meta) ?? {},
				...imageMetaRecord("meta" in block ? block.meta : void 0) ?? {}
			};
			const call = record("call" in block ? block.call : void 0);
			const prompt = call !== void 0 ? promptFromArgs(typeof call.argsRaw === "string" ? call.argsRaw : call.args) : void 0;
			return {
				prompt: typeof meta?.prompt === "string" ? meta.prompt : prompt ?? "Generated Image",
				engine: meta?.engine,
				model: meta?.model,
				output: meta?.output,
				aspectRatio: meta?.aspectRatio,
				imageSize: meta?.imageSize,
				saveError: meta?.saveError,
				createdAt: typeof meta?.createdAt === "number" ? meta.createdAt : void 0
			};
		}
		/** The workspace file path a completed image call saved, when the result meta carries one. */
		function imageSavedTo(block) {
			if (!("kind" in block) || block.kind !== "tool-result") return void 0;
			const meta = imageMetaRecord(block.meta);
			const legacyMeta = imageMetaRecord(block.resultView?.meta);
			const savedTo = meta?.savedTo ?? legacyMeta?.savedTo;
			return typeof savedTo === "string" ? savedTo : void 0;
		}
		function promptFromArgs(args) {
			try {
				const prompt = record(typeof args === "string" ? JSON.parse(args) : args)?.prompt;
				return typeof prompt === "string" ? prompt : void 0;
			} catch {
				return;
			}
		}
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function imageMetaRecord(value) {
			const candidate = record(value);
			return candidate?.kind === "dsh-image-gen" ? candidate : void 0;
		}
		//#endregion
		exports.GeneratedImageCard = GeneratedImageCard;
		exports.ImageGenerationSettingsCard = ImageGenerationSettingsCard;
		exports.apply = apply;
		exports.imageRef = imageRef;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map