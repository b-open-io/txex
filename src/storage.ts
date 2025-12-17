/**
 * Storage Provider Interface
 *
 * Implement this interface to use custom storage backends
 * (Redis, S3, Cloudflare KV, IndexedDB, etc.)
 */

/**
 * Simple key-value storage interface for caching
 */
export interface StorageProvider {
	/** Get data by key, returns null if not found */
	get(key: string): Promise<Uint8Array | null>;

	/** Store data with key */
	set(key: string, data: Uint8Array): Promise<void>;

	/** Delete a key */
	delete(key: string): Promise<void>;

	/** Check if key exists (optional - defaults to get !== null) */
	has?(key: string): Promise<boolean>;

	/** List keys with prefix (optional - for stats/cleanup) */
	list?(prefix: string): Promise<string[]>;

	/** Clear all keys with prefix (optional) */
	clear?(prefix?: string): Promise<void>;
}

/**
 * Storage namespaces used by txex
 */
export const STORAGE_PREFIX = {
	TX: "tx:",           // Raw transaction hex
	TRANSFORM: "tfm:",   // Transformed outputs
} as const;

/**
 * Build storage key for transaction
 */
export function txKey(txid: string): string {
	return `${STORAGE_PREFIX.TX}${txid}`;
}

/**
 * Build storage key for transformed output
 */
export function transformKey(
	outpoint: string,
	transformHash: string,
	extension: string,
): string {
	const safeOutpoint = outpoint.replace(/[^a-zA-Z0-9_]/g, "_");
	return `${STORAGE_PREFIX.TRANSFORM}${safeOutpoint}_${transformHash}${extension}`;
}

/**
 * In-memory storage provider (for testing or ephemeral use)
 */
export class MemoryStorage implements StorageProvider {
	private store = new Map<string, Uint8Array>();

	async get(key: string): Promise<Uint8Array | null> {
		return this.store.get(key) ?? null;
	}

	async set(key: string, data: Uint8Array): Promise<void> {
		this.store.set(key, data);
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}

	async has(key: string): Promise<boolean> {
		return this.store.has(key);
	}

	async list(prefix: string): Promise<string[]> {
		return [...this.store.keys()].filter((k) => k.startsWith(prefix));
	}

	async clear(prefix?: string): Promise<void> {
		if (prefix) {
			for (const key of this.store.keys()) {
				if (key.startsWith(prefix)) {
					this.store.delete(key);
				}
			}
		} else {
			this.store.clear();
		}
	}

	/** Get stats for this storage */
	getStats(): { keys: number; bytes: number } {
		let bytes = 0;
		for (const data of this.store.values()) {
			bytes += data.length;
		}
		return { keys: this.store.size, bytes };
	}
}

// Global storage provider (can be swapped out)
let globalStorage: StorageProvider | null = null;

/**
 * Set the global storage provider
 * Call this before using txex to use custom storage
 *
 * @example
 * ```typescript
 * import { setStorageProvider, MemoryStorage } from "txex";
 *
 * // Use in-memory storage
 * setStorageProvider(new MemoryStorage());
 *
 * // Or implement your own
 * setStorageProvider({
 *   async get(key) { return redis.getBuffer(key); },
 *   async set(key, data) { await redis.set(key, Buffer.from(data)); },
 *   async delete(key) { await redis.del(key); },
 * });
 * ```
 */
export function setStorageProvider(provider: StorageProvider | null): void {
	globalStorage = provider;
}

/**
 * Get the current storage provider (null = use filesystem default)
 */
export function getStorageProvider(): StorageProvider | null {
	return globalStorage;
}
