/**
 * Unified Cache Module
 * Supports raw tx caching and transformed output caching
 *
 * Uses StorageProvider if set, otherwise falls back to filesystem
 */

import { existsSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	STORAGE_PREFIX,
	getStorageProvider,
	transformKey,
	txKey,
} from "./storage.js";

const DEFAULT_CACHE_DIR = join(homedir(), ".txex", "cache");

export interface CacheOptions {
	/** Custom cache directory (filesystem only) */
	cacheDir?: string;
	/** Disable caching */
	disabled?: boolean;
}

/**
 * Get cache directory (filesystem mode)
 */
export function getCacheDir(options?: CacheOptions): string {
	return options?.cacheDir ?? DEFAULT_CACHE_DIR;
}

/**
 * Ensure cache directory exists (filesystem mode)
 */
async function ensureDir(dir: string): Promise<void> {
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
}

/**
 * Get cache path for raw transaction (filesystem mode)
 */
export function getTxCachePath(txid: string, options?: CacheOptions): string {
	const cacheDir = getCacheDir(options);
	const subdir = txid.slice(0, 2);
	return join(cacheDir, "tx", subdir, `${txid}.hex`);
}

/**
 * Get cache path for transformed output (filesystem mode)
 */
export function getTransformCachePath(
	outpoint: string,
	transformHash: string,
	extension: string,
	options?: CacheOptions,
): string {
	const cacheDir = getCacheDir(options);
	const safeOutpoint = outpoint.replace(/[^a-zA-Z0-9_]/g, "_");
	return join(
		cacheDir,
		"transformed",
		`${safeOutpoint}_${transformHash}${extension}`,
	);
}

/**
 * Read from transaction cache
 * Uses StorageProvider if set, otherwise filesystem
 */
export async function readTxCache(
	txid: string,
	options?: CacheOptions,
): Promise<string | null> {
	if (options?.disabled) return null;

	const storage = getStorageProvider();
	if (storage) {
		const data = await storage.get(txKey(txid));
		return data ? new TextDecoder().decode(data) : null;
	}

	// Filesystem fallback
	const path = getTxCachePath(txid, options);
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

/**
 * Write to transaction cache
 * Uses StorageProvider if set, otherwise filesystem
 */
export async function writeTxCache(
	txid: string,
	hex: string,
	options?: CacheOptions,
): Promise<void> {
	if (options?.disabled) return;

	const storage = getStorageProvider();
	if (storage) {
		await storage.set(txKey(txid), new TextEncoder().encode(hex));
		return;
	}

	// Filesystem fallback
	const path = getTxCachePath(txid, options);
	const dir = join(path, "..");
	await ensureDir(dir);
	await writeFile(path, hex);
}

/**
 * Read from transform cache
 * Uses StorageProvider if set, otherwise filesystem
 */
export async function readTransformCache(
	outpoint: string,
	transformHash: string,
	extension: string,
	options?: CacheOptions,
): Promise<Uint8Array | null> {
	if (options?.disabled) return null;

	const storage = getStorageProvider();
	if (storage) {
		return storage.get(transformKey(outpoint, transformHash, extension));
	}

	// Filesystem fallback
	const path = getTransformCachePath(outpoint, transformHash, extension, options);
	try {
		const buffer = await readFile(path);
		return new Uint8Array(buffer);
	} catch {
		return null;
	}
}

/**
 * Write to transform cache
 * Uses StorageProvider if set, otherwise filesystem
 */
export async function writeTransformCache(
	outpoint: string,
	transformHash: string,
	extension: string,
	data: Uint8Array,
	options?: CacheOptions,
): Promise<void> {
	if (options?.disabled) return;

	const storage = getStorageProvider();
	if (storage) {
		await storage.set(transformKey(outpoint, transformHash, extension), data);
		return;
	}

	// Filesystem fallback
	const path = getTransformCachePath(outpoint, transformHash, extension, options);
	const dir = join(path, "..");
	await ensureDir(dir);
	await writeFile(path, data);
}

/**
 * Clear entire cache
 */
export async function clearCache(options?: CacheOptions): Promise<void> {
	const storage = getStorageProvider();
	if (storage?.clear) {
		await storage.clear();
		return;
	}

	// Filesystem fallback
	const cacheDir = getCacheDir(options);
	await rm(cacheDir, { recursive: true, force: true });
}

/**
 * Get cache statistics
 */
export async function getCacheStats(options?: CacheOptions): Promise<{
	txFiles: number;
	txSize: number;
	transformFiles: number;
	transformSize: number;
}> {
	const storage = getStorageProvider();
	if (storage?.list) {
		// Storage provider mode
		const txKeys = await storage.list(STORAGE_PREFIX.TX);
		const transformKeys = await storage.list(STORAGE_PREFIX.TRANSFORM);

		let txSize = 0;
		let transformSize = 0;

		for (const key of txKeys) {
			const data = await storage.get(key);
			if (data) txSize += data.length;
		}
		for (const key of transformKeys) {
			const data = await storage.get(key);
			if (data) transformSize += data.length;
		}

		return {
			txFiles: txKeys.length,
			txSize,
			transformFiles: transformKeys.length,
			transformSize,
		};
	}

	// Filesystem fallback
	const cacheDir = getCacheDir(options);
	const stats = { txFiles: 0, txSize: 0, transformFiles: 0, transformSize: 0 };

	async function walkDir(dir: string, type: "tx" | "transform"): Promise<void> {
		try {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) {
					await walkDir(path, type);
				} else if (entry.isFile()) {
					const s = await stat(path);
					if (type === "tx") {
						stats.txFiles++;
						stats.txSize += s.size;
					} else {
						stats.transformFiles++;
						stats.transformSize += s.size;
					}
				}
			}
		} catch {
			// Directory doesn't exist
		}
	}

	await Promise.all([
		walkDir(join(cacheDir, "tx"), "tx"),
		walkDir(join(cacheDir, "transformed"), "transform"),
	]);

	return stats;
}
