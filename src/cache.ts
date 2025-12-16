/**
 * Unified Cache Module
 * Supports raw tx caching and transformed output caching
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

const DEFAULT_CACHE_DIR = join(homedir(), ".txex", "cache");

export interface CacheOptions {
	/** Custom cache directory */
	cacheDir?: string;
	/** Disable caching */
	disabled?: boolean;
}

/**
 * Get cache directory
 */
export function getCacheDir(options?: CacheOptions): string {
	return options?.cacheDir ?? DEFAULT_CACHE_DIR;
}

/**
 * Ensure cache directory exists
 */
async function ensureDir(dir: string): Promise<void> {
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
}

/**
 * Get cache path for raw transaction
 */
export function getTxCachePath(txid: string, options?: CacheOptions): string {
	const cacheDir = getCacheDir(options);
	const subdir = txid.slice(0, 2);
	return join(cacheDir, "tx", subdir, `${txid}.hex`);
}

/**
 * Get cache path for transformed output
 * Uses outpoint + transform hash for unique key
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
 */
export async function readTxCache(
	txid: string,
	options?: CacheOptions,
): Promise<string | null> {
	if (options?.disabled) return null;

	const path = getTxCachePath(txid, options);
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

/**
 * Write to transaction cache
 */
export async function writeTxCache(
	txid: string,
	hex: string,
	options?: CacheOptions,
): Promise<void> {
	if (options?.disabled) return;

	const path = getTxCachePath(txid, options);
	const dir = join(path, "..");
	await ensureDir(dir);
	await writeFile(path, hex);
}

/**
 * Read from transform cache
 */
export async function readTransformCache(
	outpoint: string,
	transformHash: string,
	extension: string,
	options?: CacheOptions,
): Promise<Uint8Array | null> {
	if (options?.disabled) return null;

	const path = getTransformCachePath(
		outpoint,
		transformHash,
		extension,
		options,
	);
	try {
		const buffer = await readFile(path);
		return new Uint8Array(buffer);
	} catch {
		return null;
	}
}

/**
 * Write to transform cache
 */
export async function writeTransformCache(
	outpoint: string,
	transformHash: string,
	extension: string,
	data: Uint8Array,
	options?: CacheOptions,
): Promise<void> {
	if (options?.disabled) return;

	const path = getTransformCachePath(
		outpoint,
		transformHash,
		extension,
		options,
	);
	const dir = join(path, "..");
	await ensureDir(dir);
	await writeFile(path, data);
}

/**
 * Clear entire cache
 */
export async function clearCache(options?: CacheOptions): Promise<void> {
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
