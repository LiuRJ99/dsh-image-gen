import * as dshSettings from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { IMAGE_GENERATION_SERVICE } from "@LiuRJ99/dsh-cpa-plugin/image-generation";
import z from "@deepseek-ai/schemastery";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import sharp from "sharp";
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
/** Full immutable snapshot ref used by remote Inspiration refresh and cache keys. */
const INSPIRATION_SOURCE_REF = "ff0a9d45e2f2903fe987cf476cda95d38d500e05";
const INSPIRATION_CACHE_NAMESPACE = `v1-${INSPIRATION_SOURCE_REF}`;
/** Namespace persisted through DSH Settings. */
const IMAGE_GENERATION_NAMESPACE = "image-generation";
/** Engines exposed by the CPA image-generation service. */
const IMAGE_ENGINES = ["gpt", "gemini"];
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
/** Cordis configuration schema. */
const ConfigSchema = z.object({
	engine: z.union(IMAGE_ENGINES).default("gpt"),
	saveToWorkspace: z.boolean().default(true),
	workspaceFolder: z.string().default("dsh-image-gen")
});
/**
* Keep the schema as an object for DSH serialization/rendering, while using
* schemastery's public strict resolver to drop legacy and unknown fields.
*/
const Config = new Proxy(ConfigSchema, {
	apply(target, _thisArg, args) {
		return z.resolve(args[0], target, args[1], true)[0];
	},
	construct(target, args) {
		return z.resolve(args[0], target, args[1], true)[0];
	}
});
//#endregion
//#region lib/types/engine-options.js
/** CPA-only image engine option normalization shared by Host routes and tools. */
/** GPT Image sizes accepted by the CPA image service. */
const GPT_IMAGE_SIZES = [
	"1024x1024",
	"1024x1792",
	"1792x1024"
];
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
/** Keep a GPT size only when it is one of the declared CPA options. */
function normalizeGptSize(value) {
	return typeof value === "string" && GPT_IMAGE_SIZES.includes(value.trim()) ? value.trim() : void 0;
}
/** Keep a Gemini aspect ratio only when it is one of the declared CPA options. */
function normalizeGeminiAspectRatio(value) {
	return typeof value === "string" && GEMINI_ASPECT_RATIOS.includes(value.trim()) ? value.trim() : void 0;
}
/** Keep a Gemini resolution tier only when it is one of the declared CPA options. */
function normalizeGeminiImageSize(value) {
	return typeof value === "string" && GEMINI_IMAGE_SIZES.includes(value.trim()) ? value.trim() : void 0;
}
/** Human-readable metadata for a CPA request without claiming native provider state. */
function outputLabel(options) {
	if (options.engine === "gpt") return options.size ?? "1024x1024";
	return [options.aspectRatio, options.imageSize].filter((value) => value !== void 0).join(", ");
}
//#endregion
//#region lib/types/workspace-save.js
/** Persist one generated image as a file under the session workspace. */
/** File extension for each supported image media type. */
const EXTENSION = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif"
};
/**
* Build the deterministic file name for a generated image:
* `image-<digest>.<ext>` for canonical SHA-256 IDs (and the historical
* eight-character prefix for legacy IDs). The digest comes from the
* content-addressed attachment id, so the same image bytes always map to the
* same file name regardless of when they were generated, and re-saving simply
* overwrites the previous copy in place.
* @param attachmentId - durable attachment id (`sha256:<hex>`).
* @param mediaType - verified image media type.
* @returns the file name (no directory).
*/
function workspaceImageName(attachmentId, mediaType) {
	const extension = EXTENSION[mediaType];
	if (extension === void 0) throw new Error(`unsupported image media type '${String(mediaType)}'`);
	const digest = attachmentId.startsWith("sha256:") ? attachmentId.slice(7) : attachmentId;
	if (!/^[0-9a-f]+$/i.test(digest) || digest.length > 128) throw new Error("attachmentId must contain a hexadecimal digest");
	return `image-${/^sha256:[0-9a-f]{64}$/i.test(attachmentId) ? digest : digest.slice(0, 8).padEnd(8, "0")}.${extension}`;
}
/**
* Resolve the configured image folder inside the session workspace. The
* folder may nest, but must stay inside the workspace: absolute paths and
* parent-traversal segments are rejected for both separator styles.
*
* This lexical pass is necessary but not sufficient: `saveImageToWorkspace`
* additionally verifies the on-disk resolution so symlinked folders cannot
* escape the workspace.
* @param workspaceRoot - the session workspace directory.
* @param folder - configured subfolder; empty/blank means the workspace root.
* @returns the absolute image directory.
* @throws when the folder would escape the workspace root.
*/
function workspaceImageDir(workspaceRoot, folder) {
	const trimmed = (folder ?? "").trim();
	const root = resolve(workspaceRoot);
	const normalized = trimmed.replace(/\\/g, "/");
	if (normalized.includes("\0") || isAnyAbsolutePath(trimmed) || normalized.split("/").some((segment) => segment === "..")) throw new Error(`image workspace folder '${folder}' must stay inside the session workspace`);
	const dir = normalized === "" ? root : resolve(root, normalized);
	if (!containsPath$1(root, dir)) throw new Error(`image workspace folder '${folder}' must stay inside the session workspace`);
	return dir;
}
/** Detect POSIX and Windows absolute-path spellings on every host OS. */
function isAnyAbsolutePath(value) {
	return isAbsolute(value) || /^[/\\]/u.test(value) || /^[A-Za-z]:/u.test(value);
}
function isAbsoluteWorkspacePath(value) {
	return isAbsolute(value) || /^[/\\]/u.test(value) || /^[A-Za-z]:[/\\]/u.test(value);
}
function reserveHashBytes(size, budget) {
	if (budget === void 0) return true;
	if (!Number.isSafeInteger(size) || size < 0 || !Number.isFinite(budget.remaining) || budget.remaining < size) return false;
	budget.remaining -= size;
	return true;
}
/** True when `child` equals `parent` or lives underneath it (lexically). */
function containsPath$1(parent, child) {
	const rel = relative(parent, child);
	return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
/**
* Real path of the closest existing ancestor of `dir` (inclusive). Walking up
* lets us validate symlinked folder segments before creating anything under
* them.
*/
async function nearestExistingRealPath(dir) {
	let probe = dir;
	for (;;) try {
		return await realpath(probe);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
		const parent = dirname(probe);
		if (parent === probe) throw error;
		probe = parent;
	}
}
/** Reject a directory whose on-disk resolution lands outside the workspace. */
function assertInsideWorkspace(realRoot, candidate, folder) {
	if (containsPath$1(realRoot, candidate)) return;
	throw new Error(`image workspace folder '${folder ?? ""}' must stay inside the session workspace (${candidate} resolves outside ${realRoot})`);
}
/**
* Write one generated image durably under the session workspace.
*
* Containment is enforced twice: lexically by `workspaceImageDir`, then
* against real paths, so a configured folder (or any intermediate segment)
* that is a symlink pointing outside the workspace is rejected before and
* after anything is created.
*
* The bytes are written to a same-directory staging file and renamed onto the
* target, so a crash never leaves a half-written image under its final name.
* Re-saving identical bytes rewrites the same file (the name is content-
* addressed), which keeps repeated generations idempotent. A cancellation is
* honoured up to and including the final rename: an aborted save never
* resolves successfully and never leaves the image behind under its final
* name.
* @param options - workspace root, configured folder, attachment identity, and image bytes.
* @returns the absolute path of the written file.
*/
async function saveImageToWorkspace(options) {
	const dir = workspaceImageDir(options.workspaceRoot, options.folder);
	options.signal?.throwIfAborted();
	const realRoot = await realpath(resolve(options.workspaceRoot));
	assertInsideWorkspace(realRoot, await nearestExistingRealPath(dir), options.folder);
	const name = workspaceImageName(options.attachmentId, options.mediaType);
	await mkdir(dir, { recursive: true });
	const realDir = await realpath(dir);
	assertInsideWorkspace(realRoot, realDir, options.folder);
	const target = join(realDir, name);
	const returnedTarget = join(dir, name);
	const staging = join(realDir, `.${name}.${process.pid}-${randomUUID()}.tmp`);
	const backup = join(realDir, `.${name}.${process.pid}-${randomUUID()}.bak`);
	let backedUp = false;
	try {
		options.signal?.throwIfAborted();
		try {
			const existing = await lstat(target);
			if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`generated image target '${returnedTarget}' is not a regular file`);
			await rename(target, backup);
			backedUp = true;
			options.signal?.throwIfAborted();
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		await writeFile(staging, options.data, {
			flag: "wx",
			signal: options.signal
		});
		options.signal?.throwIfAborted();
		await rename(staging, target);
		try {
			options.signal?.throwIfAborted();
		} catch (error) {
			await unlink(target).catch(() => {});
			if (backedUp) {
				await rename(backup, target).catch(() => {});
				backedUp = false;
			}
			throw error;
		}
		if (backedUp) {
			await unlink(backup).catch(() => {});
			backedUp = false;
		}
		if (/^sha256:[0-9a-f]{64}$/i.test(options.attachmentId)) await removeMatchingLegacyFile(realDir, options.attachmentId, extensionOf(options.mediaType));
		return returnedTarget;
	} catch (error) {
		await unlink(staging).catch(() => {});
		if (backedUp) {
			await unlink(target).catch(() => {});
			await rename(backup, target).catch(() => {});
		}
		throw error;
	}
}
function extensionOf(mediaType) {
	return EXTENSION[mediaType];
}
/** Remove a legacy eight-character file only when its bytes prove the same SHA-256. */
async function removeMatchingLegacyFile(directory, attachmentId, extension) {
	const digest = attachmentId.slice(7).toLowerCase();
	const legacy = join(directory, `image-${digest.slice(0, 8)}.${extension}`);
	if (legacy === join(directory, `image-${digest}.${extension}`)) return;
	try {
		const file = await lstat(legacy);
		if (file.isSymbolicLink() || !file.isFile() || file.size > 16777216) return;
		const data = await readFile(legacy);
		if (createHash("sha256").update(data).digest("hex") !== digest) return;
		await unlink(legacy);
	} catch {}
}
/** Strictly generated image names accepted by the deletion helpers. */
const GENERATED_IMAGE_NAME_REGEX = /^image-(?:[0-9a-f]{8}|[0-9a-f]{64})\.(png|jpg|jpeg|webp|gif)$/i;
const CANONICAL_GENERATED_IMAGE_NAME_REGEX = /^image-([0-9a-f]{64})\.(png|jpg|jpeg|webp|gif)$/i;
const MAX_HASH_VERIFY_BYTES = 67108864;
const ATTACHMENT_ID_REGEX = /^sha256:([0-9a-f]{64})$/i;
const MAX_WORKSPACE_STORAGE_BYTES = 1048576;
const MAX_WORKSPACE_ROWS = 256;
const MAX_WORKSPACE_PATH_LENGTH = 4096;
const MAX_SESSION_IDS = 256;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Resolve the storage file without importing any workspace/provider architecture. */
function dshWorkspaceStoragePath() {
	const home = process.env.USERPROFILE || process.env.HOME || "";
	return typeof home === "string" && home.trim() !== "" ? join(home, ".dsh", "storages", "workspace.json") : void 0;
}
/** Read valid workspace rows from local DSH storage; malformed storage is treated as empty. */
async function readDshWorkspaceRows() {
	const storagePath = dshWorkspaceStoragePath();
	if (storagePath === void 0) return [];
	try {
		const info = await lstat(storagePath);
		if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_WORKSPACE_STORAGE_BYTES) return [];
		const parsed = JSON.parse(await readFile(storagePath, "utf8"));
		const tables = isRecord(parsed) ? parsed.tables : void 0;
		const workspaces = isRecord(tables) ? tables.workspaces : void 0;
		if (!isRecord(workspaces)) return [];
		const rows = [];
		for (const [workspaceId, value] of Object.entries(workspaces).slice(0, MAX_WORKSPACE_ROWS)) if (workspaceId.length <= 256 && isRecord(value)) rows.push([workspaceId, value]);
		return rows;
	} catch {
		return [];
	}
}
/** Discover all workspace paths currently recorded in ~/.dsh/storages/workspace.json. */
async function getDshWorkspaceRoots() {
	const roots = [];
	const seen = /* @__PURE__ */ new Set();
	for (const [, row] of await readDshWorkspaceRows()) {
		if (typeof row.path !== "string") continue;
		const path = row.path.trim();
		if (!isAbsoluteWorkspacePath(path) || path.length > MAX_WORKSPACE_PATH_LENGTH || seen.has(path)) continue;
		seen.add(path);
		roots.push(path);
	}
	return roots;
}
/** Discover detailed workspace records without exposing provider or credential state. */
async function getDshWorkspacesFull() {
	const workspaces = [];
	for (const [workspaceId, row] of await readDshWorkspaceRows()) {
		if (typeof row.path !== "string") continue;
		const path = row.path.trim();
		if (!isAbsoluteWorkspacePath(path) || path.length > MAX_WORKSPACE_PATH_LENGTH) continue;
		const title = typeof row.title === "string" && row.title.trim() !== "" ? row.title.trim().slice(0, 256) : basename(path);
		const sessionIds = Array.isArray(row.sessionIds) ? row.sessionIds.filter((value) => typeof value === "string" && value.length <= 256).slice(0, MAX_SESSION_IDS) : [];
		workspaces.push({
			workspaceId,
			path,
			title,
			sessionIds
		});
	}
	return workspaces;
}
/**
* Resolve a candidate path and prove that it is inside one of the caller's
* explicitly supplied workspace roots. No implicit process.cwd() root is used.
*/
async function assertWorkspaceAllowed(candidateRoot, allowedRoots) {
	if (typeof candidateRoot !== "string" || candidateRoot.trim() === "" || !isAbsoluteWorkspacePath(candidateRoot.trim())) throw new Error(`Directory '${candidateRoot}' is not within an allowed DSH workspace`);
	const realCandidate = await realpath(resolve(candidateRoot));
	if ((await canonicalWorkspaceRoots(allowedRoots)).some((root) => containsPath$1(root, realCandidate))) return realCandidate;
	throw new Error(`Directory '${candidateRoot}' is not within an allowed DSH workspace`);
}
/** Canonicalize caller-supplied roots for containment checks. */
async function canonicalWorkspaceRoots(roots) {
	if (roots === void 0) return [];
	const values = typeof roots === "string" ? [roots] : roots;
	const canonical = [];
	const seen = /* @__PURE__ */ new Set();
	for (const value of values) {
		if (typeof value !== "string" || value.trim() === "" || !isAbsoluteWorkspacePath(value.trim())) continue;
		try {
			const root = await realpath(resolve(value.trim()));
			if (!seen.has(root)) {
				seen.add(root);
				canonical.push(root);
			}
		} catch {}
	}
	return canonical;
}
/** Safely delete one generated image file under explicitly allowed roots. */
async function deleteImageFromWorkspace(filePath, allowedWorkspaceRoots, options = {}) {
	if (typeof filePath !== "string" || filePath.trim() === "" || !isAbsoluteWorkspacePath(filePath.trim())) return false;
	const resolved = resolve(filePath);
	const fileName = basename(resolved);
	if (!GENERATED_IMAGE_NAME_REGEX.test(fileName)) return false;
	if (options.allowLegacy !== true && !CANONICAL_GENERATED_IMAGE_NAME_REGEX.test(fileName)) return false;
	try {
		const file = await lstat(resolved);
		if (file.isSymbolicLink() || !file.isFile()) return false;
	} catch (error) {
		if (error?.code === "ENOENT") return true;
		throw error;
	}
	let realFile;
	try {
		realFile = await realpath(resolved);
	} catch (error) {
		if (error?.code === "ENOENT") return true;
		throw error;
	}
	if (!GENERATED_IMAGE_NAME_REGEX.test(basename(realFile))) return false;
	if (!(await canonicalWorkspaceRoots(allowedWorkspaceRoots)).some((root) => containsPath$1(root, realFile))) return false;
	try {
		const file = await lstat(resolved);
		if (file.isSymbolicLink() || !file.isFile()) return false;
	} catch (error) {
		if (error?.code === "ENOENT") return true;
		throw error;
	}
	const canonicalMatch = CANONICAL_GENERATED_IMAGE_NAME_REGEX.exec(basename(realFile));
	const expectedDigest = typeof options.expectedAttachmentId === "string" ? ATTACHMENT_ID_REGEX.exec(options.expectedAttachmentId)?.[1]?.toLowerCase() : void 0;
	if (canonicalMatch === null && expectedDigest !== void 0) {
		const verified = await lstat(realFile);
		if (!verified.isFile() || verified.size > MAX_HASH_VERIFY_BYTES || !reserveHashBytes(verified.size, options.hashBudget)) return false;
		if (createHash("sha256").update(await readFile(realFile)).digest("hex") !== expectedDigest) return false;
	}
	if (canonicalMatch?.[1] !== void 0) {
		const verified = await lstat(realFile);
		if (!verified.isFile() || verified.size > MAX_HASH_VERIFY_BYTES || !reserveHashBytes(verified.size, options.hashBudget)) return false;
		if (createHash("sha256").update(await readFile(realFile)).digest("hex") !== canonicalMatch[1].toLowerCase()) return false;
	}
	try {
		await unlink(realFile);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return true;
		throw error;
	}
}
//#endregion
//#region lib/types/cpa-generate-route.js
const MAX_BODY_BYTES$1 = 32768;
const MAX_PROMPT_LENGTH$1 = 16e3;
const CPA_GENERATE_TIMEOUT_MS = 12e4;
const SUPPORTED_MEDIA_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
const GENERATE_INPUT_KEYS = /* @__PURE__ */ new Set([
	"engine",
	"prompt",
	"size",
	"aspect_ratio",
	"image_size"
]);
/** Handle a browser-initiated CPA generation without exposing credentials. */
async function serveCpaGenerate(req, res, deps) {
	if (req.method !== "POST") return jsonError$2(res, 405, "method-not-allowed");
	if (!sameOrigin$2(req)) return jsonError$2(res, 403, "origin-rejected");
	if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return jsonError$2(res, 415, "json-required");
	let body;
	try {
		body = JSON.parse(await readBody$1(req));
	} catch {
		return jsonError$2(res, 400, "invalid-request");
	}
	const input = parseInput(body);
	if (input === void 0) return jsonError$2(res, 400, "invalid-generation-request");
	const service = deps.getService();
	if (service === void 0 || service === null || typeof service !== "object" || typeof service.generate !== "function") return jsonError$2(res, 503, "image-service-unavailable");
	const controller = new AbortController();
	let clientAborted = false;
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, CPA_GENERATE_TIMEOUT_MS);
	const onClose = () => {
		clientAborted = true;
		controller.abort();
	};
	req.once?.("close", onClose);
	try {
		const generated = await service.generate({
			engine: input.engine,
			prompt: input.prompt,
			...input.engine === "gpt" ? { size: input.size ?? "1024x1024" } : {
				...input.aspectRatio === void 0 ? {} : { aspectRatio: input.aspectRatio },
				...input.imageSize === void 0 ? {} : { imageSize: input.imageSize }
			},
			signal: controller.signal
		});
		assertImageResult(generated, deps);
		controller.signal.throwIfAborted();
		const attachment = await deps.saveImage({
			data: generated.data,
			mediaType: generated.mediaType,
			name: "generated-image"
		});
		controller.signal.throwIfAborted();
		let savedTo;
		let saveError;
		const workspace = deps.getWorkspaceOptions?.();
		if (workspace?.enabled && deps.saveToWorkspace !== void 0 && deps.readImage !== void 0) {
			const requestedRoot = workspace.activeRoot;
			if (requestedRoot !== void 0) try {
				const workspaceRoot = await assertWorkspaceAllowed(requestedRoot, await (deps.getAllowedWorkspaceRoots?.() ?? []));
				const stored = await deps.readImage(attachment, controller.signal);
				savedTo = await deps.saveToWorkspace({
					workspaceRoot,
					folder: workspace.folder,
					attachmentId: stored.ref.attachmentId,
					mediaType: stored.ref.mediaType,
					data: stored.data,
					signal: controller.signal
				});
			} catch (error) {
				controller.signal.throwIfAborted();
				saveError = "workspace-save-failed";
			}
		}
		controller.signal.throwIfAborted();
		return json$2(res, 200, {
			attachment: attachmentMeta(attachment),
			engine: input.engine,
			output: outputLabel({
				engine: input.engine,
				size: input.size,
				aspectRatio: input.aspectRatio,
				imageSize: input.imageSize
			}),
			...input.aspectRatio === void 0 ? {} : { aspectRatio: input.aspectRatio },
			...input.imageSize === void 0 ? {} : { imageSize: input.imageSize },
			...savedTo === void 0 ? {} : { savedTo },
			...saveError === void 0 ? {} : { saveError },
			createdAt: Math.floor(Date.now() / 1e3) * 1e3
		});
	} catch (error) {
		if (clientAborted && !timedOut) return jsonError$2(res, 499, "aborted");
		if (timedOut) return jsonError$2(res, 504, "generation-timeout");
		if (isAbortError(error)) return jsonError$2(res, 499, "aborted");
		return jsonError$2(res, 502, "generation-failed");
	} finally {
		clearTimeout(timeout);
		req.removeListener?.("close", onClose);
	}
}
function parseInput(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const root = value;
	if (root.engine !== "gpt" && root.engine !== "gemini") return void 0;
	if (Object.keys(root).some((key) => !GENERATE_INPUT_KEYS.has(key))) return void 0;
	if (typeof root.prompt !== "string") return void 0;
	const prompt = root.prompt.trim();
	if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH$1 || root.workspaceRoot !== void 0) return void 0;
	if (root.engine === "gpt") return {
		engine: "gpt",
		prompt,
		size: normalizeGptSize(root.size) ?? gptSizeFromAspectRatio(typeof root.aspect_ratio === "string" ? root.aspect_ratio : void 0) ?? "1024x1024"
	};
	const aspectRatio = normalizeGeminiAspectRatio(root.aspect_ratio);
	const imageSize = normalizeGeminiImageSize(root.image_size);
	return {
		engine: "gemini",
		prompt,
		...aspectRatio === void 0 ? {} : { aspectRatio },
		...imageSize === void 0 ? {} : { imageSize }
	};
}
function assertImageResult(value, deps) {
	if (!(value.data instanceof Uint8Array) || value.data.byteLength === 0 || !Number.isFinite(deps.maxImageBytes) || deps.maxImageBytes <= 0 || value.data.byteLength > deps.maxImageBytes) throw new Error("CPA image service returned invalid image data");
	if (!SUPPORTED_MEDIA_TYPES.has(value.mediaType) || deps.mediaTypes.length === 0 || !deps.mediaTypes.includes(value.mediaType)) throw new Error(`This DSH deployment does not accept ${String(value.mediaType)} generated images`);
}
function sameOrigin$2(req) {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (origin === void 0) return true;
	if (host === void 0) return false;
	return origin === `http://${host}` || origin === `https://${host}`;
}
async function readBody$1(req) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > MAX_BODY_BYTES$1) throw new Error("request-too-large");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function isAbortError(error) {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ABORTED";
}
function json$2(res, status, value) {
	if (res.headersSent || res.writableEnded || res.destroyed) return;
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function jsonError$2(res, status, error) {
	json$2(res, status, { error });
}
//#endregion
//#region lib/types/inspiration.js
/**
* Provider-neutral Inspiration Library primitives.
*
* The host owns the catalog/image fetches and this module deliberately keeps
* the remote surface closed: only the small built-in case allowlist and the
* three fixed repository origins below can ever be addressed. Browser callers
* pass case ids, never URLs.
*/
/** Same-origin route prefix used by the host and browser faces. */
const INSPIRATION_ROUTE_PREFIX = "/plugins/dsh-image-gen/inspiration";
const INSPIRATION_CATALOG_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/catalog`;
const INSPIRATION_REFRESH_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/refresh`;
const INSPIRATION_CACHE_CLEAR_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/cache-clear`;
const INSPIRATION_IMAGE_ROUTE = `${INSPIRATION_ROUTE_PREFIX}/image`;
/** Fixed allowlists. These are intentionally small and provider independent. */
const INSPIRATION_CATEGORIES = [
	"portrait",
	"landscape",
	"product",
	"architecture",
	"nature",
	"illustration"
];
const INSPIRATION_STYLES = [
	"photorealistic",
	"cinematic",
	"editorial",
	"minimal",
	"watercolor",
	"anime"
];
const INSPIRATION_SCENES = [
	"studio",
	"urban",
	"coastal",
	"interior",
	"forest",
	"fantasy"
];
/** Fixed remote repository used for optional catalog/image refreshes. */
const INSPIRATION_REPOSITORY = {
	owner: "LiuRJ99",
	name: "dsh-image-gen",
	ref: INSPIRATION_SOURCE_REF,
	directory: "inspiration"
};
/** Only these hosts and path prefixes are ever fetched by the host. */
const INSPIRATION_SOURCE_URLS = {
	mirror: `https://cdn.statically.io/gh/${INSPIRATION_REPOSITORY.owner}/${INSPIRATION_REPOSITORY.name}/${INSPIRATION_REPOSITORY.ref}/${INSPIRATION_REPOSITORY.directory}`,
	jsdelivr: `https://cdn.jsdelivr.net/gh/${INSPIRATION_REPOSITORY.owner}/${INSPIRATION_REPOSITORY.name}@${INSPIRATION_REPOSITORY.ref}/${INSPIRATION_REPOSITORY.directory}`,
	github: `https://raw.githubusercontent.com/${INSPIRATION_REPOSITORY.owner}/${INSPIRATION_REPOSITORY.name}/${INSPIRATION_REPOSITORY.ref}/${INSPIRATION_REPOSITORY.directory}`
};
INSPIRATION_SOURCE_URLS.mirror, INSPIRATION_SOURCE_URLS.jsdelivr, INSPIRATION_SOURCE_URLS.github;
const INSPIRATION_SOURCE_IDS = [
	"mirror",
	"jsdelivr",
	"github"
];
/** Limits used by the host fetcher and disk cache. */
const MAX_INSPIRATION_CATALOG_BYTES = 524288;
const MAX_INSPIRATION_IMAGE_BYTES = 8388608;
const MAX_INSPIRATION_DISK_CACHE_BYTES = 33554432;
function inspirationDiskCacheDir() {
	const home = process.env.USERPROFILE || process.env.HOME || homedir();
	return join(home, ".dsh", "cache", "dsh-image-gen", "inspiration");
}
inspirationDiskCacheDir();
const INSPIRATION_CATALOG_FILE = "catalog.json";
const CASE_IDS = [
	"golden-hour-portrait",
	"neon-city-rain",
	"quiet-coastal-house",
	"ceramic-still-life",
	"misty-pine-forest",
	"editorial-sneaker",
	"watercolor-market",
	"fantasy-library"
];
/** Built-in records keep the feature useful offline without shipping binaries. */
const BUILTIN_INSPIRATION_CASES = [
	{
		id: "golden-hour-portrait",
		title: "Golden-hour portrait",
		description: "Warm editorial portrait with a gentle late-afternoon glow.",
		prompt: "Editorial portrait of a thoughtful person by a sunlit window, warm golden-hour rim light, soft film grain, natural skin texture, quiet contemporary styling, balanced negative space.",
		category: "portrait",
		style: "editorial",
		scene: "studio",
		imagePath: "images/golden-hour-portrait.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "neon-city-rain",
		title: "Neon city rain",
		description: "Cinematic night street scene with reflections and color contrast.",
		prompt: "Cinematic rainy city street at night, magenta and cyan neon reflected in puddles, one umbrella in the distance, atmospheric haze, detailed wide composition, no logos or text.",
		category: "landscape",
		style: "cinematic",
		scene: "urban",
		imagePath: "images/neon-city-rain.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "quiet-coastal-house",
		title: "Quiet coastal house",
		description: "Minimal architecture study in calm morning light.",
		prompt: "Minimal coastal house on a low cliff above a calm sea, pale morning light, clean concrete and warm wood, a few windswept grasses, architectural photography, generous negative space.",
		category: "architecture",
		style: "minimal",
		scene: "coastal",
		imagePath: "images/quiet-coastal-house.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "ceramic-still-life",
		title: "Ceramic still life",
		description: "A small product composition with tactile studio shadows.",
		prompt: "Product still life of handmade ceramic vessels in sand, ivory, and terracotta, soft side lighting, subtle shadows, matte paper backdrop, premium catalog photography, centered composition.",
		category: "product",
		style: "photorealistic",
		scene: "studio",
		imagePath: "images/ceramic-still-life.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "misty-pine-forest",
		title: "Misty pine forest",
		description: "Layered natural depth for a quiet, atmospheric landscape.",
		prompt: "Misty pine forest at dawn, layered blue-green hills, a narrow trail disappearing into fog, soft diffused light, peaceful natural color palette, detailed landscape photography.",
		category: "nature",
		style: "photorealistic",
		scene: "forest",
		imagePath: "images/misty-pine-forest.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "editorial-sneaker",
		title: "Editorial sneaker",
		description: "Graphic fashion still life with a crisp magazine feel.",
		prompt: "Editorial fashion still life of a white sneaker floating above a cobalt geometric plinth, hard directional light, crisp shadows, clean magazine art direction, high detail, no brand marks.",
		category: "product",
		style: "editorial",
		scene: "studio",
		imagePath: "images/editorial-sneaker.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "watercolor-market",
		title: "Watercolor market",
		description: "Loose hand-painted color and people in a lively square.",
		prompt: "Loose watercolor illustration of a lively morning market square, striped awnings, flower stalls, small figures in motion, paper texture, airy washes, joyful but restrained palette.",
		category: "illustration",
		style: "watercolor",
		scene: "urban",
		imagePath: "images/watercolor-market.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	},
	{
		id: "fantasy-library",
		title: "Fantasy library",
		description: "A storybook interior with a luminous impossible ceiling.",
		prompt: "Whimsical fantasy library with towering shelves, spiral staircases, floating candles, and a starlit glass ceiling, richly detailed storybook illustration, warm amber and indigo lighting.",
		category: "illustration",
		style: "anime",
		scene: "fantasy",
		imagePath: "images/fantasy-library.svg",
		imageMediaType: "image/svg+xml",
		source: "builtin"
	}
];
const CASE_BY_ID = new Map(BUILTIN_INSPIRATION_CASES.map((item) => [item.id, item]));
/** Create the offline catalog. The returned arrays are fresh and safe to filter. */
function builtinInspirationCatalog(now = Date.now()) {
	return {
		version: 1,
		updatedAt: now,
		source: "builtin",
		categories: [...INSPIRATION_CATEGORIES],
		styles: [...INSPIRATION_STYLES],
		scenes: [...INSPIRATION_SCENES],
		cases: BUILTIN_INSPIRATION_CASES.map((item) => ({ ...item }))
	};
}
function isInspirationCaseId(value) {
	return typeof value === "string" && CASE_IDS.includes(value);
}
function isInspirationCategory(value) {
	return typeof value === "string" && INSPIRATION_CATEGORIES.includes(value);
}
function isInspirationStyle(value) {
	return typeof value === "string" && INSPIRATION_STYLES.includes(value);
}
function isInspirationScene(value) {
	return typeof value === "string" && INSPIRATION_SCENES.includes(value);
}
function isInspirationSource(value) {
	return value === "builtin" || typeof value === "string" && INSPIRATION_SOURCE_IDS.includes(value);
}
/**
* Parse only absolute HTTP(S) URLs without credentials, fragments, or query
* strings. Returning a URL object avoids string-prefix parsing pitfalls.
*/
function parseHttpSourceUrl(value) {
	if (typeof value !== "string") return void 0;
	const text = value.trim();
	if (text.length === 0 || text.length > 2048) return void 0;
	let parsed;
	try {
		parsed = new URL(text);
	} catch {
		return;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
	if (parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" || parsed.search !== "") return void 0;
	if (parsed.hostname === "") return void 0;
	return parsed;
}
/**
* Check a source URL against the fixed repository host/path allowlist. The
* optional relative path makes the check suitable for a specific case asset.
*/
function isAllowedInspirationSourceUrl(value, relativePath) {
	const parsed = parseHttpSourceUrl(value);
	if (!parsed) return false;
	if (relativePath !== void 0 && !safeImagePath(relativePath)) return false;
	return INSPIRATION_SOURCE_IDS.some((source) => {
		const base = new URL(INSPIRATION_SOURCE_URLS[source]);
		if (parsed.origin !== base.origin) return false;
		const prefix = `${base.pathname.replace(/\/$/, "")}/`;
		if (!parsed.pathname.startsWith(prefix)) return false;
		const candidatePath = parsed.pathname.slice(prefix.length);
		if (relativePath !== void 0) return candidatePath === relativePath;
		if (candidatePath === "catalog.json") return true;
		if (!safeImagePath(candidatePath)) return false;
		return CASE_IDS.some((caseId) => CASE_BY_ID.get(caseId)?.imagePath === candidatePath);
	});
}
function safeImagePath(value) {
	return /^images\/(?:[a-z0-9]+-)*[a-z0-9]+\.(?:svg|webp|png|jpe?g)$/u.test(value);
}
function sourceUrlForPath(source, relativePath) {
	return `${INSPIRATION_SOURCE_URLS[source]}/${relativePath}`;
}
/** Candidate order is intentionally mirror → jsDelivr → GitHub. */
function inspirationCatalogSourceUrls() {
	return INSPIRATION_SOURCE_IDS.map((source) => sourceUrlForPath(source, INSPIRATION_CATALOG_FILE));
}
function inspirationImageSourceUrls(item) {
	const caseRecord = typeof item === "string" ? CASE_BY_ID.get(item) : item;
	if (!caseRecord || !isInspirationCaseId(caseRecord.id) || !safeImagePath(caseRecord.imagePath)) return [];
	return INSPIRATION_SOURCE_IDS.map((source) => sourceUrlForPath(source, caseRecord.imagePath));
}
/** Read a record without trusting inherited/prototype properties. */
function record$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function boundedString(value, maxLength) {
	return typeof value === "string" && value.trim() !== "" && value.length <= maxLength ? value.trim() : void 0;
}
function parseSourceField(value, expectedPath) {
	if (value === void 0 || value === "builtin") return { source: "builtin" };
	if (typeof value === "string" && INSPIRATION_SOURCE_IDS.includes(value)) return { source: value };
	const sourceUrl = parseHttpSourceUrl(value);
	if (!sourceUrl || !isAllowedInspirationSourceUrl(sourceUrl.href, expectedPath)) return void 0;
	const sourceId = INSPIRATION_SOURCE_IDS.find((candidate) => {
		const base = new URL(INSPIRATION_SOURCE_URLS[candidate]);
		return sourceUrl.origin === base.origin && sourceUrl.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`);
	});
	if (sourceId === void 0) return void 0;
	return {
		source: sourceId,
		sourceUrl: sourceUrl.href
	};
}
function parseCase(value) {
	const root = record$1(value);
	if (!root || !isInspirationCaseId(root.id)) return void 0;
	const id = root.id;
	const title = boundedString(root.title, 160);
	const description = boundedString(root.description, 320);
	const prompt = boundedString(root.prompt, 4e3);
	const category = root.category;
	const style = root.style;
	const scene = root.scene;
	const imagePath = boundedString(root.imagePath, 180);
	const imageMediaType = root.imageMediaType;
	const expectedImagePath = CASE_BY_ID.get(id)?.imagePath;
	if (!title || !description || !prompt || !isInspirationCategory(category) || !isInspirationStyle(style) || !isInspirationScene(scene) || !imagePath || !safeImagePath(imagePath) || imagePath !== expectedImagePath) return void 0;
	if (imageMediaType !== "image/svg+xml" && imageMediaType !== "image/webp" && imageMediaType !== "image/png" && imageMediaType !== "image/jpeg" && imageMediaType !== "image/gif") return void 0;
	const sourceInfo = parseSourceField(root.sourceUrl ?? root.source, imagePath);
	if (!sourceInfo) return void 0;
	return {
		id,
		title,
		description,
		prompt,
		category,
		style,
		scene,
		imagePath,
		imageMediaType,
		source: sourceInfo.source,
		...sourceInfo.sourceUrl === void 0 ? {} : { sourceUrl: sourceInfo.sourceUrl }
	};
}
/**
* Validate a remote catalog while retaining only the fixed schema/case set.
* Unknown fields are ignored; unknown case ids/categories/styles/scenes reject
* the catalog rather than silently broadening the allowlist.
*/
function parseInspirationCatalog(value) {
	const root = record$1(value);
	if (!root || root.version !== void 0 && root.version !== 1) return void 0;
	if (!Array.isArray(root.cases) || root.cases.length === 0 || root.cases.length > CASE_IDS.length) return void 0;
	const parsedCases = [];
	const seen = /* @__PURE__ */ new Set();
	for (const item of root.cases) {
		const parsed = parseCase(item);
		if (!parsed || seen.has(parsed.id)) return void 0;
		seen.add(parsed.id);
		parsedCases.push(parsed);
	}
	return {
		version: 1,
		updatedAt: typeof root.updatedAt === "number" && Number.isFinite(root.updatedAt) ? root.updatedAt : Date.now(),
		source: isInspirationSource(root.source) ? root.source : "builtin",
		categories: [...INSPIRATION_CATEGORIES],
		styles: [...INSPIRATION_STYLES],
		scenes: [...INSPIRATION_SCENES],
		cases: parsedCases
	};
}
/** Parse URL query/record filters against the fixed category/style/scene sets. */
function parseInspirationFilters(value) {
	const entries = /* @__PURE__ */ new Map();
	const allowedKeys = /* @__PURE__ */ new Set([
		"category",
		"style",
		"scene",
		"caseId",
		"case",
		"source",
		"sourceUrl"
	]);
	if (typeof value === "string") {
		let query = value;
		try {
			if (query.includes("://")) query = new URL(query).search;
		} catch {
			return;
		}
		const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
		for (const [key, raw] of params.entries()) {
			if (!allowedKeys.has(key) || entries.has(key)) return void 0;
			entries.set(key, raw);
		}
	} else if (value instanceof URLSearchParams) for (const [key, raw] of value.entries()) {
		if (!allowedKeys.has(key) || entries.has(key)) return void 0;
		entries.set(key, raw);
	}
	else {
		const root = record$1(value);
		if (!root) return value === void 0 || value === null ? {} : void 0;
		for (const key of Object.keys(root)) {
			if (!allowedKeys.has(key)) return void 0;
			if (root[key] !== void 0) entries.set(key, root[key]);
		}
	}
	if (entries.has("caseId") && entries.has("case")) return void 0;
	const result = {};
	const category = entries.get("category");
	const style = entries.get("style");
	const scene = entries.get("scene");
	const caseId = entries.get("caseId") ?? entries.get("case");
	const source = entries.get("source");
	const sourceUrl = entries.get("sourceUrl");
	if (category !== void 0 && category !== "" && !isInspirationCategory(category)) return void 0;
	if (style !== void 0 && style !== "" && !isInspirationStyle(style)) return void 0;
	if (scene !== void 0 && scene !== "" && !isInspirationScene(scene)) return void 0;
	if (caseId !== void 0 && caseId !== "" && !isInspirationCaseId(caseId)) return void 0;
	if (source !== void 0 && source !== "" && !isInspirationSource(source)) return void 0;
	if (sourceUrl !== void 0 && sourceUrl !== "" && !isAllowedInspirationSourceUrl(sourceUrl)) return void 0;
	if (isInspirationCategory(category)) result.category = category;
	if (isInspirationStyle(style)) result.style = style;
	if (isInspirationScene(scene)) result.scene = scene;
	if (isInspirationCaseId(caseId)) result.caseId = caseId;
	if (isInspirationSource(source)) result.source = source;
	if (typeof sourceUrl === "string" && sourceUrl !== "") result.sourceUrl = parseHttpSourceUrl(sourceUrl).href;
	return result;
}
/** Filter a catalog without mutating its case array. */
function filterInspirationCases(cases, filters = {}) {
	return cases.filter((item) => {
		if (filters.category !== void 0 && item.category !== filters.category) return false;
		if (filters.style !== void 0 && item.style !== filters.style) return false;
		if (filters.scene !== void 0 && item.scene !== filters.scene) return false;
		if (filters.caseId !== void 0 && item.id !== filters.caseId) return false;
		if (filters.source !== void 0 && item.source !== filters.source) return false;
		if (filters.sourceUrl !== void 0 && item.sourceUrl !== filters.sourceUrl) return false;
		return true;
	}).map((item) => ({ ...item }));
}
/** Resolve only a case from the built-in allowlist. */
function getInspirationCase(caseId) {
	if (!isInspirationCaseId(caseId)) return void 0;
	const item = CASE_BY_ID.get(caseId);
	return item === void 0 ? void 0 : { ...item };
}
/** Read a bounded HTTP response stream; never buffers beyond `maxBytes`. */
async function readResponseBytes(response, maxBytes) {
	const limit = Number.isFinite(maxBytes) && maxBytes >= 0 ? Math.floor(maxBytes) : 0;
	const contentLength = response.headers.get("content-length");
	if (contentLength !== null) {
		const advertised = Number(contentLength);
		if (Number.isFinite(advertised) && advertised > limit) {
			await response.body?.cancel().catch(() => void 0);
			throw new InspirationPayloadTooLargeError(limit);
		}
	}
	if (!response.body) {
		const data = new Uint8Array(await response.arrayBuffer());
		if (data.byteLength > limit) throw new InspirationPayloadTooLargeError(limit);
		return data;
	}
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			const chunk = next.value;
			total += chunk.byteLength;
			if (total > limit) throw new InspirationPayloadTooLargeError(limit);
			chunks.push(chunk);
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
var InspirationPayloadTooLargeError = class extends Error {
	code = "inspiration-payload-too-large";
	limit;
	constructor(limit) {
		super(`Inspiration response exceeds the ${limit}-byte limit`);
		this.name = "InspirationPayloadTooLargeError";
		this.limit = limit;
	}
};
/** Fetch fixed candidates in order, rejecting redirects and oversized streams. */
async function fetchInspirationCandidates(urls, options) {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
	let lastError;
	for (const url of urls) {
		if (options.signal?.aborted) throw inspirationAbortError();
		if (!isAllowedInspirationSourceUrl(url) && !inspirationCatalogSourceUrls().includes(url)) {
			lastError = /* @__PURE__ */ new Error("Source URL is not allowlisted");
			continue;
		}
		try {
			const response = await fetchImpl(url, {
				method: "GET",
				redirect: "error",
				headers: { accept: "application/json,image/*" },
				...options.signal === void 0 ? {} : { signal: options.signal }
			});
			if (!response.ok) {
				await response.body?.cancel().catch(() => void 0);
				lastError = /* @__PURE__ */ new Error(`HTTP ${response.status}`);
				continue;
			}
			return {
				data: await readResponseBytes(response, options.maxBytes),
				url,
				response
			};
		} catch (error) {
			if (options.signal?.aborted) throw inspirationAbortError();
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : /* @__PURE__ */ new Error("All inspiration sources failed");
}
function inspirationAbortError() {
	const error = /* @__PURE__ */ new Error("Inspiration request aborted");
	error.name = "AbortError";
	return error;
}
/** Small deterministic offline preview; no binary assets are shipped. */
function builtinInspirationSvg(item) {
	const resolved = typeof item === "string" ? CASE_BY_ID.get(item) : item;
	if (!resolved) return "";
	const [start, middle, end] = {
		"golden-hour-portrait": [
			"#2b1b2d",
			"#e58d5c",
			"#ffd9a0"
		],
		"neon-city-rain": [
			"#11183f",
			"#d94b9b",
			"#55e9e0"
		],
		"quiet-coastal-house": [
			"#7da8b5",
			"#e5d4b0",
			"#f8f1de"
		],
		"ceramic-still-life": [
			"#4b3430",
			"#c98766",
			"#f1ddc4"
		],
		"misty-pine-forest": [
			"#1d3940",
			"#6e9b91",
			"#d6e5cf"
		],
		"editorial-sneaker": [
			"#152a64",
			"#3d6be0",
			"#f3f4f6"
		],
		"watercolor-market": [
			"#ee9b65",
			"#f4d06f",
			"#7097b5"
		],
		"fantasy-library": [
			"#171837",
			"#5b4c9c",
			"#f1bf67"
		]
	}[resolved.id];
	const title = escapeXml(resolved.title);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img" aria-labelledby="title"><title id="title">${title}</title><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset=".55" stop-color="${middle}"/><stop offset="1" stop-color="${end}"/></linearGradient><radialGradient id="glow"><stop stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="960" height="640" fill="url(#bg)"/><circle cx="760" cy="120" r="180" fill="url(#glow)" opacity=".45"/><path d="M0 510 Q180 430 360 510 T720 490 T960 500 V640 H0Z" fill="#101727" opacity=".42"/><path d="M70 115h360M70 145h260" stroke="#fff" stroke-opacity=".65" stroke-width="8" stroke-linecap="round"/><text x="70" y="560" fill="#fff" fill-opacity=".9" font-family="system-ui,sans-serif" font-size="32" font-weight="600">${title}</text></svg>`;
}
function escapeXml(value) {
	return value.replace(/[&<>"']/gu, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&apos;"
	})[character] ?? character);
}
var InspirationDiskCache = class {
	directory;
	maxBytes;
	queue = Promise.resolve();
	constructor(options = {}) {
		this.directory = options.directory ?? inspirationDiskCacheDir();
		this.maxBytes = Number.isFinite(options.maxBytes) && (options.maxBytes ?? 0) > 0 ? Math.floor(options.maxBytes) : MAX_INSPIRATION_DISK_CACHE_BYTES;
	}
	get(key) {
		return this.enqueue(async () => {
			const path = this.pathForKey(key);
			try {
				const info = await lstat(path);
				if (info.isSymbolicLink() || !info.isFile() || info.size > this.maxBytes) return void 0;
				const data = new Uint8Array(await readFile(path));
				try {
					const now = /* @__PURE__ */ new Date();
					await utimes(path, now, now);
				} catch {}
				return data;
			} catch {
				return;
			}
		}, void 0);
	}
	set(key, data) {
		return this.enqueue(async () => {
			if (data.byteLength > this.maxBytes) return;
			try {
				await mkdir(this.directory, { recursive: true });
				const path = this.pathForKey(key);
				const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
				await writeFile(temporary, data);
				await rename(temporary, path);
				await this.trim();
			} catch {}
		}, void 0);
	}
	/** Alias for clients that use read/write terminology. */
	read(key) {
		return this.get(key);
	}
	write(key, data) {
		return this.set(key, data);
	}
	delete(key) {
		return this.enqueue(async () => {
			try {
				await rm(this.pathForKey(key), { force: true });
			} catch {}
		}, void 0);
	}
	clear() {
		return this.enqueue(async () => {
			try {
				await rm(this.directory, {
					recursive: true,
					force: true
				});
			} catch {}
		}, void 0);
	}
	pathForKey(key) {
		const digest = createHash("sha256").update(String(key)).digest("hex");
		return join(this.directory, `${digest}.bin`);
	}
	async trim() {
		const entries = [];
		let total = 0;
		try {
			const names = await readdir(this.directory);
			for (const name of names) {
				if (!name.endsWith(".bin")) continue;
				try {
					const path = join(this.directory, name);
					const info = await stat(path);
					if (!info.isFile()) continue;
					entries.push({
						path,
						bytes: info.size,
						mtimeMs: info.mtimeMs
					});
					total += info.size;
				} catch {}
			}
			entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
			for (const entry of entries) {
				if (total <= this.maxBytes) break;
				try {
					await rm(entry.path, { force: true });
					total -= entry.bytes;
				} catch {}
			}
		} catch {}
	}
	enqueue(operation, fallback) {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(() => void 0, () => void 0);
		return result.catch(() => fallback);
	}
};
//#endregion
//#region lib/types/inspiration-route.js
const MAX_REQUEST_BODY_BYTES = 4096;
const CATALOG_CACHE_KEY = `${INSPIRATION_CACHE_NAMESPACE}:catalog`;
const IMAGE_CACHE_KEY_PREFIX = `${INSPIRATION_CACHE_NAMESPACE}:image:`;
const IMAGE_CACHE_MAX_AGE = 3600;
const defaultCache = new InspirationDiskCache();
const defaultState = { catalog: void 0 };
const customStates = /* @__PURE__ */ new WeakMap();
/**
* Handle every Inspiration route. Register the prefix with the host web server;
* this function performs its own exact path dispatch and same-origin check.
*/
async function serveInspirationRoute(req, res, deps = {}) {
	if (!sameOrigin$1(req)) return jsonError$1(res, 403, "origin-rejected");
	const pathname = requestPath(req);
	const state = deps.state ?? stateFor(deps);
	if (pathname === INSPIRATION_CATALOG_ROUTE) return serveCatalog(req, res, deps, state, false);
	if (pathname === INSPIRATION_REFRESH_ROUTE) return serveCatalog(req, res, deps, state, true);
	if (pathname === INSPIRATION_CACHE_CLEAR_ROUTE) return serveCacheClear(req, res, deps, state);
	if (pathname === INSPIRATION_IMAGE_ROUTE || pathname.startsWith(`${INSPIRATION_IMAGE_ROUTE}/`)) return serveInspirationImage(req, res, deps);
	return jsonError$1(res, 404, "not-found");
}
async function serveCatalog(req, res, deps, state, forceRefresh) {
	if (forceRefresh && req.method !== "POST") return jsonError$1(res, 405, "method-not-allowed");
	if (!forceRefresh && req.method !== "GET") return jsonError$1(res, 405, "method-not-allowed");
	if (forceRefresh) try {
		await readRequestBody(req);
	} catch {
		return jsonError$1(res, 413, "request-too-large");
	}
	let query;
	try {
		query = new URL(req.url ?? "/", requestBase(req)).search;
	} catch {
		return jsonError$1(res, 400, "invalid-request");
	}
	const filters = parseInspirationFilters(query);
	if (filters === void 0) return jsonError$1(res, 400, "invalid-filter");
	const deadlineController = new AbortController();
	const deadline = setTimeout(() => deadlineController.abort(), 15e3);
	const onClose = () => deadlineController.abort();
	req.once?.("close", onClose);
	let catalog;
	try {
		catalog = await loadCatalog(deps, state, forceRefresh, deadlineController.signal);
	} finally {
		clearTimeout(deadline);
		req.removeListener?.("close", onClose);
	}
	json$1(res, 200, {
		...catalog,
		cases: filterInspirationCases(catalog.cases, filters)
	}, forceRefresh ? "no-store" : "private, max-age=60");
}
async function loadCatalog(deps, state, forceRefresh, signal) {
	const cache = deps.cache ?? defaultCache;
	const now = deps.now ?? Date.now;
	if (!forceRefresh && state.catalog !== void 0) return state.catalog;
	if (!forceRefresh) {
		const parsed = parseCatalogBytes(await cache.get(CATALOG_CACHE_KEY));
		if (parsed !== void 0) {
			state.catalog = parsed;
			return parsed;
		}
	}
	if (forceRefresh) {
		const remote = await fetchRemoteCatalog(deps.fetch, signal);
		if (remote !== void 0) {
			state.catalog = remote.catalog;
			cache.set(CATALOG_CACHE_KEY, new TextEncoder().encode(JSON.stringify(remote.catalog)));
			return remote.catalog;
		}
		const stale = parseCatalogBytes(await cache.get(CATALOG_CACHE_KEY));
		if (stale !== void 0) {
			state.catalog = stale;
			return stale;
		}
	}
	const builtin = builtinInspirationCatalog(now());
	state.catalog = builtin;
	cache.set(CATALOG_CACHE_KEY, new TextEncoder().encode(JSON.stringify(builtin)));
	return builtin;
}
async function fetchRemoteCatalog(fetchImpl, signal) {
	const implementation = fetchImpl ?? globalThis.fetch;
	if (typeof implementation !== "function") return void 0;
	for (const url of inspirationCatalogSourceUrls()) {
		if (signal?.aborted) return void 0;
		const requestController = new AbortController();
		const timeout = setTimeout(() => requestController.abort(), 15e3);
		const onAbort = () => requestController.abort();
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			const response = await implementation(url, {
				method: "GET",
				redirect: "error",
				headers: { accept: "application/json" },
				signal: requestController.signal
			});
			if (!response.ok) {
				await response.body?.cancel().catch(() => void 0);
				`${response.status}`;
				continue;
			}
			const parsed = parseCatalogBytes(await readResponseBytes(response, MAX_INSPIRATION_CATALOG_BYTES));
			if (parsed === void 0) continue;
			const source = sourceKind(url);
			return { catalog: {
				...parsed,
				source,
				updatedAt: parsed.updatedAt
			} };
		} catch (error) {
			if (signal?.aborted) return void 0;
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
		}
	}
}
function sourceKind(url) {
	if (url.includes("cdn.jsdelivr.net")) return "jsdelivr";
	if (url.includes("raw.githubusercontent.com")) return "github";
	return "mirror";
}
function parseCatalogBytes(bytes) {
	if (bytes === void 0) return void 0;
	try {
		return parseInspirationCatalog(JSON.parse(new TextDecoder().decode(bytes)));
	} catch {
		return;
	}
}
async function serveCacheClear(req, res, deps, state) {
	if (req.method !== "POST") return jsonError$1(res, 405, "method-not-allowed");
	try {
		await readRequestBody(req);
	} catch {
		return jsonError$1(res, 413, "request-too-large");
	}
	state.catalog = void 0;
	await (deps.cache ?? defaultCache).clear();
	json$1(res, 200, { ok: true });
}
async function serveInspirationImage(req, res, deps = {}) {
	if (!sameOrigin$1(req)) return jsonError$1(res, 403, "origin-rejected");
	if (req.method !== "GET" && req.method !== "POST") return jsonError$1(res, 405, "method-not-allowed");
	let caseId;
	try {
		caseId = await imageCaseId(req);
	} catch {
		return jsonError$1(res, 400, "invalid-request");
	}
	if (!isInspirationCaseId(caseId)) return jsonError$1(res, 400, "invalid-case");
	const item = getInspirationCase(caseId);
	if (!item) return jsonError$1(res, 404, "case-not-found");
	const cache = deps.cache ?? defaultCache;
	const cacheKey = `${IMAGE_CACHE_KEY_PREFIX}${caseId}`;
	const cached = await cache.get(cacheKey);
	if (cached !== void 0 && cached.byteLength <= 8388608) {
		const cachedType = sniffImageContentType(cached);
		if (cachedType !== void 0) return imageResponse(res, cached, cachedType, true);
		cache.delete(cacheKey);
	} else if (cached !== void 0) cache.delete(cacheKey);
	const controller = new AbortController();
	let clientAborted = false;
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, 15e3);
	const onClose = () => {
		clientAborted = true;
		controller.abort();
	};
	req.once?.("close", onClose);
	let bytes;
	try {
		const fetched = await fetchInspirationCandidates(inspirationImageSourceUrls(item), {
			maxBytes: MAX_INSPIRATION_IMAGE_BYTES,
			signal: controller.signal,
			...deps.fetch === void 0 ? {} : { fetch: deps.fetch }
		});
		const declaredType = safeImageContentType(fetched.response.headers.get("content-type"));
		bytes = fetched.data;
		const detectedType = sniffImageContentType(bytes);
		if (detectedType === void 0 || declaredType !== void 0 && declaredType !== detectedType) throw new Error("invalid-image-content");
		cache.set(cacheKey, bytes);
		return imageResponse(res, bytes, detectedType, false);
	} catch {
		if (clientAborted && !timedOut) return jsonError$1(res, 499, "request-aborted");
		bytes = new TextEncoder().encode(builtinInspirationSvg(item));
		if (bytes.byteLength > 8388608) return jsonError$1(res, 502, "image-unavailable");
		return imageResponse(res, bytes, "image/svg+xml", false, true);
	} finally {
		clearTimeout(timeout);
		req.removeListener?.("close", onClose);
	}
}
function imageResponse(res, data, contentType, fromCache, fallback = false) {
	if (res.headersSent || res.writableEnded || res.destroyed) return;
	res.writeHead(200, {
		"content-type": contentType,
		"content-length": String(data.byteLength),
		"cache-control": `public, max-age=${IMAGE_CACHE_MAX_AGE}, must-revalidate`,
		"x-content-type-options": "nosniff",
		...fromCache ? { "x-dsh-cache": "disk" } : {},
		...fallback ? { "x-dsh-inspiration-fallback": "1" } : {}
	});
	res.end(data);
}
function sniffImageContentType(data) {
	if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) return "image/png";
	if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
	if (data.length >= 6 && data[0] === 71 && data[1] === 73 && data[2] === 70) return "image/gif";
	if (data.length >= 12 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) return "image/webp";
	const prefix = new TextDecoder().decode(data.subarray(0, 256)).trimStart().toLowerCase();
	return prefix.startsWith("<svg") || prefix.startsWith("<?xml") ? "image/svg+xml" : void 0;
}
function safeImageContentType(value) {
	const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
	if (normalized === "image/svg+xml" || normalized === "image/webp" || normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/gif") return normalized;
}
async function imageCaseId(req) {
	const parsed = new URL(req.url ?? "/", requestBase(req));
	const pathPrefix = `${INSPIRATION_IMAGE_ROUTE}/`;
	let pathId;
	if (parsed.pathname.startsWith(pathPrefix)) {
		const remainder = parsed.pathname.slice(pathPrefix.length);
		if (remainder !== "" && !remainder.includes("/")) try {
			pathId = decodeURIComponent(remainder);
		} catch {
			return;
		}
	}
	const queryId = parsed.searchParams.get("caseId") ?? parsed.searchParams.get("id");
	if (parsed.searchParams.has("url") || parsed.searchParams.has("sourceUrl")) return void 0;
	if (req.method === "GET") return pathId ?? queryId ?? void 0;
	let body;
	let raw = "";
	try {
		raw = await readRequestBody(req);
		body = raw === "" ? void 0 : JSON.parse(raw);
	} catch {
		return;
	}
	if (raw === "") return pathId ?? queryId ?? void 0;
	const root = objectRecord(body);
	if (!root || Object.keys(root).some((key) => !["caseId", "id"].includes(key))) return void 0;
	const bodyId = root.caseId ?? root.id;
	if (pathId !== void 0 && bodyId !== void 0 && bodyId !== pathId) return void 0;
	return pathId ?? queryId ?? (typeof bodyId === "string" ? bodyId : void 0);
}
async function readRequestBody(req) {
	if (typeof req[Symbol.asyncIterator] !== "function") return "";
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > MAX_REQUEST_BODY_BYTES) throw new Error("request-too-large");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function objectRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function sameOrigin$1(req) {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (origin === void 0) return true;
	if (host === void 0) return false;
	return origin === `http://${host}` || origin === `https://${host}`;
}
function requestBase(req) {
	return `http://${req.headers.host ?? "localhost"}`;
}
function requestPath(req) {
	try {
		return new URL(req.url ?? "/", requestBase(req)).pathname;
	} catch {
		return "";
	}
}
function json$1(res, status, value, cacheControl = "no-store") {
	if (res.headersSent || res.writableEnded || res.destroyed) return;
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(Buffer.byteLength(body)),
		"cache-control": cacheControl,
		"x-content-type-options": "nosniff"
	});
	res.end(body);
}
function jsonError$1(res, status, code) {
	json$1(res, status, { error: code });
}
function stateFor(deps) {
	if (Object.keys(deps).length === 0) return defaultState;
	const key = deps;
	const existing = customStates.get(key);
	if (existing !== void 0) return existing;
	const state = { catalog: void 0 };
	customStates.set(key, state);
	return state;
}
//#endregion
//#region lib/types/image-route.js
const MAX_BODY_BYTES = 4096;
/** Upper bound a client may request for a thumbnail width; larger requests are clamped. */
const MAX_THUMB_WIDTH = 1024;
/** Long immutable cache window for content-addressed thumbnails (seconds). */
const THUMB_CACHE_MAX_AGE = 604800;
/** Serve one verified durable image reference to a same-origin browser request. */
async function serveImage(req, res, deps) {
	if (req.method !== "POST") return jsonError(res, 405, "method-not-allowed");
	if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return jsonError(res, 415, "json-required");
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (origin !== void 0 && (host === void 0 || origin !== `http://${host}` && origin !== `https://${host}`)) return jsonError(res, 403, "origin-rejected");
	let body;
	try {
		body = JSON.parse(await readBody(req));
	} catch {
		return jsonError(res, 400, "invalid-request");
	}
	const request = imageRequestFromBody(body);
	if (request === void 0) return jsonError(res, 400, "invalid-attachment");
	const controller = new AbortController();
	const onClose = () => controller.abort();
	req.once?.("close", onClose);
	try {
		const stored = await deps.readImage(request.attachment, controller.signal);
		if (request.kind === "thumb") {
			const thumb = await renderThumbnail(stored, request.thumbWidth);
			if (res.headersSent || res.writableEnded || res.destroyed) return;
			res.writeHead(200, {
				"content-type": "image/webp",
				"content-length": String(thumb.byteLength),
				"cache-control": `public, max-age=${THUMB_CACHE_MAX_AGE}, immutable`,
				"x-content-type-options": "nosniff"
			});
			res.end(thumb);
			return;
		}
		if (res.headersSent || res.writableEnded || res.destroyed) return;
		res.writeHead(200, {
			"content-type": stored.ref.mediaType,
			"content-length": String(stored.data.byteLength),
			"cache-control": `private, max-age=300`,
			"x-content-type-options": "nosniff"
		});
		res.end(stored.data);
	} catch {
		if (!controller.signal.aborted) jsonError(res, 404, "image-unavailable");
	} finally {
		req.removeListener?.("close", onClose);
	}
}
/**
* Decode a stored image and produce a downscaled WebP thumbnail. GIFs are
* flattened to their first frame (sharp has no animated output here), and the
* image is never upscaled beyond its intrinsic size.
*/
async function renderThumbnail(stored, width) {
	const target = clampThumbWidth(width);
	return sharp(stored.data, {
		failOn: "error",
		limitInputPixels: 4e7
	}).rotate().resize({
		width: target,
		withoutEnlargement: true
	}).webp({ quality: 70 }).toBuffer();
}
/** Clamp a requested thumbnail width into the supported 1..MAX_THUMB_WIDTH range. */
function clampThumbWidth(width) {
	if (!Number.isFinite(width) || width <= 0) return 300;
	return Math.min(Math.floor(width), MAX_THUMB_WIDTH);
}
function imageRequestFromBody(value) {
	const root = record$2(value);
	if (root === void 0) return void 0;
	const attachment = imageAttachment(root.attachment);
	if (attachment === void 0) return void 0;
	const kind = root.kind === void 0 || root.kind === "full" ? "full" : root.kind === "thumb" ? "thumb" : void 0;
	if (kind === void 0) return void 0;
	return {
		attachment,
		kind,
		thumbWidth: clampThumbWidth(typeof root.thumbWidth === "number" ? root.thumbWidth : 300)
	};
}
async function readBody(req) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > MAX_BODY_BYTES) throw new Error("request too large");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function jsonError(res, status, code) {
	if (res.headersSent || res.writableEnded || res.destroyed) return;
	res.writeHead(status, {
		"content-type": "application/json",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify({ error: code }));
}
const DELETE_BODY_BYTES = 65536;
const MAX_DELETE_ITEMS = 100;
const MAX_DELETE_HASH_BYTES = 268435456;
const CANONICAL_DELETE_NAME = /^image-[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|gif)$/iu;
function isCanonicalDeletePath(value) {
	const normalized = value.replace(/\\/g, "/");
	if (!(normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized))) return false;
	return CANONICAL_DELETE_NAME.test(normalized.slice(normalized.lastIndexOf("/") + 1));
}
/** Delete only explicitly selected generated files; this route never writes files. */
async function serveDelete(req, res, deps) {
	if (req.method !== "POST") return jsonError(res, 405, "method-not-allowed");
	if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return jsonError(res, 415, "json-required");
	if (!sameOrigin(req)) return jsonError(res, 403, "origin-rejected");
	let body;
	try {
		body = JSON.parse(await readBodyLimited(req, DELETE_BODY_BYTES));
	} catch {
		return jsonError(res, 400, "invalid-request");
	}
	const root = record$2(body);
	if (root !== void 0 && Object.keys(root).some((key) => key !== "paths")) return jsonError(res, 400, "invalid-request");
	const rawPaths = Array.isArray(root?.paths) ? root.paths : [];
	if (rawPaths.length > MAX_DELETE_ITEMS) return jsonError(res, 413, "too-many-items");
	const hashBudget = { remaining: MAX_DELETE_HASH_BYTES };
	const deletedFiles = [];
	const failedFiles = [];
	for (const rawPath of rawPaths) {
		if (typeof rawPath !== "string" || rawPath.trim() === "" || rawPath.length > 4096 || !isCanonicalDeletePath(rawPath.trim())) {
			failedFiles.push({
				path: String(rawPath),
				error: "invalid-path"
			});
			continue;
		}
		try {
			if (await deps.deleteWorkspaceImage(rawPath, { hashBudget })) deletedFiles.push(rawPath);
			else failedFiles.push({
				path: rawPath,
				error: "path-rejected"
			});
		} catch {
			failedFiles.push({
				path: rawPath,
				error: "delete-failed"
			});
		}
	}
	return json(res, 200, {
		ok: failedFiles.length === 0,
		deletedCount: deletedFiles.length,
		deletedFiles,
		failedFiles
	});
}
/** Return discovered workspace metadata without exposing credentials or settings. */
async function serveWorkspaces(req, res, deps) {
	if (req.method !== "GET") return jsonError(res, 405, "method-not-allowed");
	if (!sameOrigin(req)) return jsonError(res, 403, "origin-rejected");
	try {
		return json(res, 200, { workspaces: await deps.getWorkspaces() });
	} catch {
		return json(res, 200, { workspaces: [] });
	}
}
function sameOrigin(req) {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (origin === void 0) return true;
	if (host === void 0) return false;
	return origin === `http://${host}` || origin === `https://${host}`;
}
async function readBodyLimited(req, maxBytes) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > maxBytes) throw new Error("request too large");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function json(res, status, value) {
	if (res.headersSent || res.writableEnded || res.destroyed) return;
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
//#endregion
//#region lib/types/reference-image.js
/** Safe Host-side resolution of DSH conversation and workspace image references. */
/** Resolve one or more references in caller order or latest-user upload order. */
async function resolveReferenceImages(input) {
	const attachmentIds = mergeSelectors({
		single: input.sourceAttachmentId,
		multiple: input.sourceAttachmentIds,
		singleName: "source_attachment_id",
		multipleName: "source_attachment_ids",
		equal: attachmentIdsEqual
	});
	const paths = mergeSelectors({
		single: input.sourcePath,
		multiple: input.sourcePaths,
		singleName: "source_path",
		multipleName: "source_paths",
		equal: (left, right) => left.trim() === right.trim()
	});
	if (attachmentIds !== void 0 && paths !== void 0) throw new Error("edit_image accepts only one of source_attachment_id, source_attachment_ids, source_path, or source_paths");
	if (paths !== void 0) return Promise.all(paths.map((sourcePath) => readWorkspaceReferenceImage({
		sourcePath,
		...input.agent?.session.header?.cwd === void 0 ? {} : { workspaceRoot: input.agent.session.header.cwd },
		...input.maxBytes === void 0 ? {} : { maxBytes: input.maxBytes },
		signal: input.signal
	})));
	if (input.agent === void 0) throw new Error("edit_image requires an active DSH agent session to resolve a reference image");
	const refs = findReferenceImages(input.agent.session.deriveMessages(), attachmentIds);
	if (refs.length === 0) {
		if (attachmentIds !== void 0) throw new Error(`edit_image could not find image attachment ${attachmentIds[0] ?? "unknown"} in the current conversation`);
		throw new Error("edit_image requires an image in the current conversation; upload or generate an image first");
	}
	if (attachmentIds !== void 0 && refs.length !== attachmentIds.length) {
		const missing = attachmentIds.find((id) => !refs.some((ref) => attachmentIdsEqual(String(ref.attachmentId), id)));
		throw new Error(`edit_image could not find image attachment ${missing ?? "unknown"} in the current conversation`);
	}
	return Promise.all(refs.map(async (ref) => {
		const stored = await input.attachments.readImage(ref, input.signal);
		if (input.maxBytes !== void 0 && stored.data.byteLength > input.maxBytes) throw new Error(`edit_image source image is too large (${stored.data.byteLength} bytes; maximum ${input.maxBytes})`);
		return {
			data: new Uint8Array(stored.data),
			mediaType: stored.ref.mediaType
		};
	}));
}
/** Find explicit references in caller order, or all images from the newest user upload. */
function findReferenceImages(messages, sourceAttachmentIds) {
	if (sourceAttachmentIds !== void 0) return sourceAttachmentIds.flatMap((id) => {
		const ref = findReferenceImage(messages, id);
		return ref === void 0 ? [] : [ref];
	});
	const latestHuman = [...messages].reverse().find((message) => isHumanMessage(message));
	if (latestHuman !== void 0) {
		const refs = collectInBlocks(record(latestHuman)?.content);
		if (refs.length > 0) return refs;
	}
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const refs = collectInBlocks(record(messages[index])?.content);
		if (refs.length > 0) return refs;
	}
	return [];
}
/** Find one matching image recursively through message and tool-result content. */
function findReferenceImage(messages, sourceAttachmentId) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const found = findInBlocks(record(messages[index])?.content, sourceAttachmentId);
		if (found !== void 0) return found;
	}
}
async function readWorkspaceReferenceImage(input) {
	const requested = input.sourcePath.trim();
	if (requested.length === 0) throw new Error("edit_image source_path must not be empty");
	if (input.workspaceRoot === void 0) throw new Error("edit_image source_path requires an active DSH session workspace");
	const root = resolve(input.workspaceRoot);
	const candidate = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
	if (!containsPath(root, candidate)) throw new Error(`edit_image source_path must stay inside the session workspace: ${requested}`);
	let realRoot;
	let realCandidate;
	try {
		[realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
	} catch (error) {
		if (error.code === "ENOENT") throw new Error(`edit_image could not find workspace image: ${requested}`);
		throw error;
	}
	if (!containsPath(realRoot, realCandidate)) throw new Error(`edit_image source_path resolves outside the session workspace: ${requested}`);
	const file = await stat(realCandidate);
	if (!file.isFile()) throw new Error(`edit_image source_path is not a file: ${requested}`);
	if (input.maxBytes !== void 0 && file.size > input.maxBytes) throw new Error(`edit_image source image is too large (${file.size} bytes; maximum ${input.maxBytes})`);
	const data = new Uint8Array(await readFile(realCandidate, { signal: input.signal }));
	const mediaType = detectImageMediaType(data);
	if (mediaType === void 0) throw new Error(`edit_image source_path is not a supported image: ${requested}`);
	return {
		data,
		mediaType
	};
}
function isHumanMessage(value) {
	const message = record(value);
	return record(message?.source)?.kind === "user" || message?.role === "user";
}
function collectInBlocks(value) {
	if (!Array.isArray(value)) return [];
	const refs = [];
	for (const block of value) {
		const entry = record(block);
		if (entry?.type === "image") {
			const ref = imageAttachmentRef(entry.attachment);
			if (ref !== void 0) refs.push(ref);
		}
		if (entry?.type === "tool-result") refs.push(...collectInBlocks(entry.content));
	}
	return refs;
}
function findInBlocks(value, sourceAttachmentId) {
	if (!Array.isArray(value)) return void 0;
	for (let index = value.length - 1; index >= 0; index -= 1) {
		const entry = record(value[index]);
		if (entry?.type === "image") {
			const ref = imageAttachmentRef(entry.attachment);
			if (ref !== void 0 && (sourceAttachmentId === void 0 || attachmentIdsEqual(String(ref.attachmentId), sourceAttachmentId))) return ref;
		}
		if (entry?.type === "tool-result") {
			const nested = findInBlocks(entry.content, sourceAttachmentId);
			if (nested !== void 0) return nested;
		}
	}
}
function imageAttachmentRef(value) {
	const ref = record(value);
	if (ref === void 0) return void 0;
	if (typeof ref.attachmentId !== "string" || !imageMediaType(ref.mediaType)) return void 0;
	if (!nonNegativeInteger(ref.bytes) || !positiveInteger(ref.width) || !positiveInteger(ref.height)) return void 0;
	return ref;
}
function mergeSelectors(input) {
	if (input.multiple === void 0) return input.single === void 0 ? void 0 : [input.single];
	if (input.multiple.length === 0) {
		if (input.single !== void 0) return [input.single];
		throw new Error(`edit_image ${input.multipleName} must not be empty`);
	}
	if (input.single !== void 0 && !input.multiple.some((value) => input.equal(input.single, value))) throw new Error(`edit_image ${input.singleName} must also appear in ${input.multipleName} when both are provided`);
	return input.multiple;
}
function attachmentIdsEqual(actual, requested) {
	if (actual === requested) return true;
	const actualDigest = sha256Digest(actual);
	const requestedDigest = sha256Digest(requested);
	return actualDigest !== void 0 && actualDigest === requestedDigest;
}
function sha256Digest(value) {
	return /^(?:sha256:)?([0-9a-f]{64})$/iu.exec(value.trim())?.[1]?.toLowerCase();
}
function detectImageMediaType(data) {
	if (startsWith(data, [
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	])) return "image/png";
	if (startsWith(data, [
		255,
		216,
		255
	])) return "image/jpeg";
	if (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a") return "image/gif";
	if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "image/webp";
}
function imageMediaType(value) {
	return value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "image/gif";
}
function startsWith(data, signature) {
	return signature.every((byte, index) => data[index] === byte);
}
function ascii(data, offset, length) {
	return String.fromCharCode(...data.subarray(offset, offset + length));
}
function containsPath(parent, child) {
	const rel = relative(parent, child);
	return rel === "" || rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function nonNegativeInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
//#endregion
//#region lib/types/index.js
/** Cordis plugin name. */
const name = "dsh-image-gen";
/** Cordis plugin version. */
const version = "0.5.0";
/** Host services required by the Bundle. */
const inject = [
	"tools",
	"attachments",
	"webServer"
];
const SUPPORTED_IMAGE_MEDIA_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
const MAX_PROMPT_LENGTH = 16e3;
function toolOutputSpec(operation = "generate") {
	return {
		schema: {
			type: "object",
			additionalProperties: false,
			properties: {
				attachment: {
					type: "object",
					required: true,
					additionalProperties: false,
					properties: {
						attachmentId: {
							type: "string",
							required: true
						},
						mediaType: {
							type: "string",
							required: true
						},
						bytes: {
							type: "integer",
							required: true
						},
						width: {
							type: "integer",
							required: true
						},
						height: {
							type: "integer",
							required: true
						},
						name: { type: "string" },
						originalDimensions: {
							type: "object",
							additionalProperties: false,
							properties: {
								width: {
									type: "integer",
									required: true
								},
								height: {
									type: "integer",
									required: true
								}
							}
						}
					}
				},
				engine: {
					type: "string",
					required: true
				},
				operation: { type: "string" },
				output: {
					type: "string",
					required: true
				},
				aspectRatio: { type: "string" },
				imageSize: { type: "string" },
				createdAt: {
					type: "integer",
					required: true
				},
				savedTo: { type: "string" },
				saveError: { type: "string" }
			}
		},
		render: (_args, value) => {
			const saved = typeof value.savedTo === "string" ? ` It was also saved to the workspace as ${value.savedTo}.` : typeof value.saveError === "string" ? ` Saving it to the workspace failed: ${value.saveError}.` : " It has no local file path.";
			return [{
				type: "text",
				text: `${(value.operation ?? operation) === "edit" ? "Edited one image" : "Generated one image"} with the ${value.engine} engine (${value.output}). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the image.`
			}, {
				type: "image",
				attachment: value.attachment
			}];
		},
		presentationMeta: (args, value) => ({
			kind: "dsh-image-gen",
			attachment: attachmentMeta(value.attachment),
			engine: value.engine,
			...typeof value.operation === "string" ? { operation: value.operation } : { operation },
			output: value.output,
			...typeof value.aspectRatio === "string" ? { aspectRatio: value.aspectRatio } : {},
			...typeof value.imageSize === "string" ? { imageSize: value.imageSize } : {},
			createdAt: value.createdAt,
			...typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {},
			...typeof value.saveError === "string" ? { saveError: value.saveError } : {},
			prompt: args.prompt
		})
	};
}
function createGptTool(imageService, ctx, attachments, currentConfig, knownWorkspaceRoots) {
	return defineTool({
		name: "generate_image",
		description: "Generate one image with the GPT Image engine. Use the size parameter to control framing (\"1024x1792\" for vertical 9:16 portrait / wallpaper, \"1792x1024\" for horizontal 16:9 landscape, \"1024x1024\" for square). Give a complete visual prompt including subject, composition, style, lighting, and any exact text that should appear. A successful image is already attached directly to the conversation; with workspace saving enabled (the default) it is also written as a file under the session workspace, and the result's savedTo field carries that absolute file path. Do not call read, glob, or other tools to locate or verify the image.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Complete description of the image to generate."
			},
			size: {
				type: "string",
				enum: [
					"1024x1024",
					"1024x1792",
					"1792x1024"
				],
				description: "Optional framing size: \"1024x1024\" (square), \"1024x1792\" (vertical 9:16 portrait / wallpaper), \"1792x1024\" (horizontal 16:9 landscape). Defaults to 1024x1024."
			}
		},
		output: toolOutputSpec(),
		async execute(args, exec) {
			const prompt = checkedPrompt(args.prompt);
			const active = currentConfig();
			const rawRatio = args.aspect_ratio;
			const reqSize = normalizeGptSize(args.size) ?? gptSizeFromAspectRatio(typeof rawRatio === "string" ? rawRatio : void 0) ?? "1024x1024";
			exec.signal.throwIfAborted();
			return saveGenerated(ctx, attachments, await imageService.generate({
				engine: "gpt",
				prompt,
				size: reqSize,
				signal: exec.signal
			}), "gpt", outputLabel({
				engine: "gpt",
				size: reqSize
			}), active, exec, {}, knownWorkspaceRoots);
		},
		presentResult: (_args, result) => imagePresentation(result)
	});
}
function createGeminiTool(imageService, ctx, attachments, currentConfig, knownWorkspaceRoots) {
	return defineTool({
		name: "generate_image",
		description: "Generate one image with the Gemini Image engine. Use aspect_ratio to control composition framing (e.g. \"9:16\" for vertical portrait, \"16:9\" for landscape) and image_size for resolution tier. Give a complete visual prompt including subject, composition, style, lighting, and any exact text that should appear. A successful image is already attached directly to the conversation; with workspace saving enabled (the default) it is also written as a file under the session workspace, and the result's savedTo field carries that absolute file path. Do not call read, glob, or other tools to locate or verify the image.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Complete description of the image to generate."
			},
			aspect_ratio: {
				type: "string",
				enum: [
					"1:1",
					"16:9",
					"9:16",
					"4:3",
					"3:4",
					"3:2",
					"2:3"
				],
				description: "Optional output aspect ratio (e.g. \"9:16\" for vertical portrait, \"16:9\" for landscape)."
			},
			image_size: {
				type: "string",
				enum: [
					"1K",
					"2K",
					"4K"
				],
				description: "Optional output resolution tier. Defaults to 1K."
			}
		},
		output: toolOutputSpec(),
		async execute(args, exec) {
			const prompt = checkedPrompt(args.prompt);
			const active = currentConfig();
			const aspectRatio = normalizeGeminiAspectRatio(args.aspect_ratio);
			const imageSize = normalizeGeminiImageSize(args.image_size);
			exec.signal.throwIfAborted();
			return saveGenerated(ctx, attachments, await imageService.generate({
				engine: "gemini",
				prompt,
				...aspectRatio === void 0 ? {} : { aspectRatio },
				...imageSize === void 0 ? {} : { imageSize },
				signal: exec.signal
			}), "gemini", outputLabel({
				engine: "gemini",
				aspectRatio,
				imageSize
			}), active, exec, {
				aspectRatio,
				imageSize
			}, knownWorkspaceRoots);
		},
		presentResult: (_args, result) => imagePresentation(result)
	});
}
function createEditTool(engine, imageService, ctx, attachments, currentConfig, knownWorkspaceRoots) {
	return defineTool({
		name: "edit_image",
		description: "Edit, combine, or restyle existing images with the configured image engine. Images attached inline to the latest human message are already durable DSH attachments: call edit_image directly with a precise prompt and they will be used in upload order. For specific older conversation images, use source_attachment_id or source_attachment_ids. For files explicitly named in the session workspace, use source_path or source_paths. Never use bash, read, glob, or file copying to locate inline attachments, and only claim success after this tool returns an image result.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Describe the edit while preserving everything else that should remain unchanged."
			},
			source_attachment_id: {
				type: "string",
				description: "Optional attachment id of one specific image in the current conversation."
			},
			source_attachment_ids: {
				type: "array",
				items: { type: "string" },
				description: "Optional ordered attachment ids for multiple conversation images."
			},
			source_path: {
				type: "string",
				description: "Optional workspace-relative or absolute path to one named image."
			},
			source_paths: {
				type: "array",
				items: { type: "string" },
				description: "Optional ordered workspace paths for multiple named images."
			},
			...engine === "gpt" ? { size: {
				type: "string",
				enum: [
					"1024x1024",
					"1024x1792",
					"1792x1024"
				],
				description: "Optional output framing size."
			} } : {
				aspect_ratio: {
					type: "string",
					enum: [
						"1:1",
						"16:9",
						"9:16",
						"4:3",
						"3:4",
						"3:2",
						"2:3"
					],
					description: "Optional output aspect ratio."
				},
				image_size: {
					type: "string",
					enum: [
						"1K",
						"2K",
						"4K"
					],
					description: "Optional output resolution tier."
				}
			}
		},
		output: toolOutputSpec("edit"),
		async execute(args, exec) {
			if (typeof imageService.edit !== "function") throw new Error("image-editing-unavailable");
			const prompt = checkedPrompt(args.prompt);
			const raw = args;
			const sourceAttachmentId = typeof raw.source_attachment_id === "string" ? raw.source_attachment_id : void 0;
			const sourceAttachmentIds = Array.isArray(raw.source_attachment_ids) ? raw.source_attachment_ids.filter((value) => typeof value === "string") : void 0;
			const sourcePath = typeof raw.source_path === "string" ? raw.source_path : void 0;
			const sourcePaths = Array.isArray(raw.source_paths) ? raw.source_paths.filter((value) => typeof value === "string") : void 0;
			const agent = exec.agent;
			const referenceImages = await resolveReferenceImages({
				...agent === void 0 ? {} : { agent },
				attachments,
				...sourceAttachmentId === void 0 ? {} : { sourceAttachmentId },
				...sourceAttachmentIds === void 0 ? {} : { sourceAttachmentIds },
				...sourcePath === void 0 ? {} : { sourcePath },
				...sourcePaths === void 0 ? {} : { sourcePaths },
				maxBytes: attachments.imageLimits.maxImageBytes,
				signal: exec.signal
			});
			const active = currentConfig();
			exec.signal.throwIfAborted();
			if (engine === "gpt") {
				const rawRatio = typeof raw.aspect_ratio === "string" ? raw.aspect_ratio : void 0;
				const size = normalizeGptSize(raw.size) ?? gptSizeFromAspectRatio(rawRatio) ?? "1024x1024";
				return saveGenerated(ctx, attachments, await imageService.edit({
					engine,
					prompt,
					referenceImages,
					size,
					signal: exec.signal
				}), engine, outputLabel({
					engine,
					size
				}), active, exec, { operation: "edit" }, knownWorkspaceRoots);
			}
			const aspectRatio = normalizeGeminiAspectRatio(raw.aspect_ratio);
			const imageSize = normalizeGeminiImageSize(raw.image_size);
			return saveGenerated(ctx, attachments, await imageService.edit({
				engine,
				prompt,
				referenceImages,
				...aspectRatio === void 0 ? {} : { aspectRatio },
				...imageSize === void 0 ? {} : { imageSize },
				signal: exec.signal
			}), engine, outputLabel({
				engine,
				aspectRatio,
				imageSize
			}), active, exec, {
				operation: "edit",
				aspectRatio,
				imageSize
			}, knownWorkspaceRoots);
		},
		presentResult: (_args, result) => imagePresentation(result)
	});
}
function checkedPrompt(value) {
	const prompt = value.trim();
	if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH) throw new Error("prompt-invalid");
	return prompt;
}
/** Define specialized tool parameters, descriptions, and adapters by engine. */
function toolDefinitionForEngine(engine, imageService, ctx, attachments, currentConfig, knownWorkspaceRoots = /* @__PURE__ */ new Set()) {
	if (engine !== "gpt" && engine !== "gemini") throw new Error(`Unsupported CPA image engine: ${String(engine)}`);
	return engine === "gemini" ? createGeminiTool(imageService, ctx, attachments, currentConfig, knownWorkspaceRoots) : createGptTool(imageService, ctx, attachments, currentConfig, knownWorkspaceRoots);
}
function editToolDefinitionForEngine(engine, imageService, ctx, attachments, currentConfig, knownWorkspaceRoots = /* @__PURE__ */ new Set()) {
	if (engine !== "gpt" && engine !== "gemini") throw new Error(`Unsupported CPA image engine: ${String(engine)}`);
	return createEditTool(engine, imageService, ctx, attachments, currentConfig, knownWorkspaceRoots);
}
/** Register settings, the image route, and the model-callable tool. */
function apply(ctx, config = {}) {
	let current = () => config;
	let activeEngine = config.engine ?? "gpt";
	let cachedService;
	let toolDisposers = [];
	const knownWorkspaceRoots = /* @__PURE__ */ new Set();
	const attachments = ctx.attachments;
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: IMAGE_ROUTE,
		handler: (req, res) => serveImage(req, res, { readImage: (ref, signal) => attachments.readImage(ref, signal) })
	}), "dsh-image-gen: image route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: CPA_GENERATE_ROUTE,
		handler: (req, res) => serveCpaGenerate(req, res, {
			getService: () => cachedService,
			saveImage: (input) => attachments.saveImage(input),
			readImage: (ref, signal) => attachments.readImage(ref, signal),
			getWorkspaceOptions: () => ({ enabled: false }),
			getAllowedWorkspaceRoots: allowedWorkspaceRoots,
			saveToWorkspace: (options) => {
				if (options.workspaceRoot.length <= 4096 && knownWorkspaceRoots.size < 256) knownWorkspaceRoots.add(options.workspaceRoot);
				return saveImageToWorkspace(options);
			},
			maxImageBytes: attachments.imageLimits.maxImageBytes,
			mediaTypes: attachments.imageLimits.mediaTypes
		})
	}), "dsh-image-gen: CPA generation route");
	const allowedWorkspaceRoots = async () => {
		const discovered = await getDshWorkspaceRoots().catch(() => []);
		return /* @__PURE__ */ new Set([...knownWorkspaceRoots, ...discovered]);
	};
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: DELETE_ROUTE,
		handler: (req, res) => serveDelete(req, res, { deleteWorkspaceImage: async (filePath, options) => deleteImageFromWorkspace(filePath, await allowedWorkspaceRoots(), options) })
	}), "dsh-image-gen: workspace image delete route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: WORKSPACES_ROUTE,
		handler: (req, res) => serveWorkspaces(req, res, { getWorkspaces: getDshWorkspacesFull })
	}), "dsh-image-gen: workspace discovery route");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: INSPIRATION_ROUTE,
		handler: (req, res) => serveInspirationRoute(req, res)
	}), "dsh-image-gen: inspiration route");
	let warnedServiceUnavailable = false;
	function disposeTools() {
		for (const disposer of toolDisposers.splice(0)) disposer();
	}
	function syncTool(engine) {
		disposeTools();
		if (cachedService === void 0) {
			if (!warnedServiceUnavailable) {
				warnedServiceUnavailable = true;
				ctx.logger.warn("dsh-image-gen: CPA image generation service is unavailable; image tools are not registered");
			}
			return;
		}
		activeEngine = engine;
		const toolDef = toolDefinitionForEngine(engine, cachedService, ctx, attachments, () => current(), knownWorkspaceRoots);
		toolDisposers.push(ctx.tools.register(toolDef));
		if (typeof cachedService.edit === "function") {
			const editToolDef = editToolDefinitionForEngine(engine, cachedService, ctx, attachments, () => current(), knownWorkspaceRoots);
			toolDisposers.push(ctx.tools.register(editToolDef));
		}
	}
	installImageSettings(ctx, config, {
		setSource: (source) => {
			current = source;
			syncTool(source().engine ?? "gpt");
		},
		onChange: () => {
			syncTool(current().engine ?? "gpt");
		}
	});
	syncTool(activeEngine);
	ctx.inject([IMAGE_GENERATION_SERVICE], (imageCtx) => {
		const service = imageCtx.get(IMAGE_GENERATION_SERVICE);
		if (service === void 0 || typeof service.generate !== "function") {
			cachedService = void 0;
			syncTool(activeEngine);
			return;
		}
		cachedService = service;
		warnedServiceUnavailable = false;
		syncTool(activeEngine);
		ctx.effect(() => () => {
			if (cachedService !== service) return;
			cachedService = void 0;
			disposeTools();
			syncTool(activeEngine);
		}, "dsh-image-gen: CPA service lifecycle cleanup");
	});
	ctx.effect(() => () => {
		disposeTools();
		knownWorkspaceRoots.clear();
	}, "dsh-image-gen: active tool cleanup");
}
/** Validate a CPA response before it reaches Attachment or workspace storage. */
function assertGeneratedImage(value, limits) {
	if (typeof value !== "object" || value === null) throw new Error("CPA image service returned an invalid image result");
	const result = value;
	if (!(result.data instanceof Uint8Array) || result.data.byteLength === 0) throw new Error("CPA image service returned empty image data");
	if (!Number.isFinite(limits.maxImageBytes) || result.data.byteLength > limits.maxImageBytes) throw new Error("CPA image service returned an image larger than the DSH attachment limit");
	if (typeof result.mediaType !== "string" || !SUPPORTED_IMAGE_MEDIA_TYPES.has(result.mediaType) || !limits.mediaTypes.includes(result.mediaType)) throw new Error(`This DSH deployment does not accept ${String(result.mediaType)} generated images`);
}
async function saveGenerated(ctx, attachments, generated, engine, output, config, exec, metadata = {}, knownWorkspaceRoots = /* @__PURE__ */ new Set()) {
	assertGeneratedImage(generated, attachments.imageLimits);
	exec.signal.throwIfAborted();
	const attachment = await attachments.saveImage({
		data: generated.data,
		mediaType: generated.mediaType,
		name: "generated-image"
	});
	exec.signal.throwIfAborted();
	const value = {
		attachment,
		engine,
		output,
		...metadata.operation === void 0 ? {} : { operation: metadata.operation },
		...metadata.aspectRatio === void 0 ? {} : { aspectRatio: metadata.aspectRatio },
		...metadata.imageSize === void 0 ? {} : { imageSize: metadata.imageSize },
		createdAt: Math.floor(Date.now() / 1e3) * 1e3
	};
	if (config.saveToWorkspace === false) return value;
	const workspaceRoot = exec.agent?.session.header.cwd;
	if (workspaceRoot === void 0) return value;
	if (workspaceRoot.length <= 4096 && knownWorkspaceRoots.size < 256) knownWorkspaceRoots.add(workspaceRoot);
	try {
		const stored = await attachments.readImage(attachment, exec.signal);
		value.savedTo = await saveImageToWorkspace({
			workspaceRoot,
			folder: config.workspaceFolder,
			attachmentId: stored.ref.attachmentId,
			mediaType: stored.ref.mediaType,
			data: stored.data,
			signal: exec.signal
		});
	} catch (error) {
		exec.signal.throwIfAborted();
		ctx.logger.warn(`dsh-image-gen: failed to save image to workspace: ${error instanceof Error ? error.message : String(error)}`);
		value.saveError = "workspace-save-failed";
	}
	return value;
}
function imagePresentation(result) {
	const attachment = imageAttachmentFromMeta(result.meta);
	return attachment === void 0 ? void 0 : {
		card: "generic",
		title: "Generated image",
		content: [{
			type: "image",
			attachment
		}]
	};
}
/**
* Keep the fork compatible with both the 0.1.2 settings service and the older
* top-level relay without changing the CPA-only configuration surface. The
* fallback is deliberately best-effort: tools still register if settings are
* unavailable, and no credential/provider fields are added to Config.
*/
function installImageSettings(ctx, config, hooks) {
	const namespace = dshSettings;
	if (typeof namespace.SettingsProvider?.prototype?.installSection === "function") {
		ctx.inject(["settings"], (settingsCtx) => {
			settingsCtx.settings.installSection(ctx, IMAGE_GENERATION_NAMESPACE, Config, config, hooks);
		});
		return;
	}
	if (typeof namespace.installSettingsSection === "function" && typeof namespace.settingsNamespace === "function") {
		namespace.installSettingsSection(ctx, namespace.settingsNamespace(IMAGE_GENERATION_NAMESPACE), Config, config, hooks);
		return;
	}
	ctx.logger.warn("dsh-image-gen: neither settings API generation is available; using composition defaults");
}
//#endregion
export { CPA_GENERATE_ROUTE, Config, DELETE_ROUTE, IMAGE_ROUTE, INSPIRATION_ROUTE, WORKSPACES_ROUTE, apply, assertGeneratedImage, editToolDefinitionForEngine, gptSizeFromAspectRatio, imageAttachmentFromMeta, inject, name, toolDefinitionForEngine, version };
