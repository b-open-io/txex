/**
 * WhatsOnChain Provider with File Cache
 * Fetches raw transactions from WhatsOnChain API
 * Caches to ~/.txex for fast repeated access
 */

import { Transaction } from "@bsv/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";
const CACHE_DIR = join(homedir(), ".txex", "cache");

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cache file path for a txid
 */
function getCachePath(txid: string): string {
  // Use first 2 chars as subdirectory for better filesystem performance
  const subdir = txid.slice(0, 2);
  return join(CACHE_DIR, subdir, `${txid}.hex`);
}

/**
 * Read from cache
 */
async function readCache(txid: string): Promise<string | null> {
  const path = getCachePath(txid);
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Write to cache
 */
async function writeCache(txid: string, hex: string): Promise<void> {
  await ensureCacheDir();
  const path = getCachePath(txid);
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, hex);
}

/**
 * Fetch raw transaction hex from WhatsOnChain (with caching)
 */
export async function fetchRawTx(txid: string): Promise<string> {
  // Check cache first
  const cached = await readCache(txid);
  if (cached) {
    return cached;
  }

  // Fetch from WoC
  const url = `${WOC_BASE}/tx/${txid}/hex`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`WoC fetch failed for ${txid}: ${resp.status} ${resp.statusText}`);
  }

  const hex = await resp.text();

  // Cache for next time
  await writeCache(txid, hex);

  return hex;
}

/**
 * Fetch and parse transaction
 */
export async function fetchTx(txid: string): Promise<Transaction> {
  const hex = await fetchRawTx(txid);
  return Transaction.fromHex(hex);
}

/**
 * Fetch multiple transactions in parallel with rate limiting
 */
export async function fetchTxBatch(
  txids: string[],
  concurrency = 5
): Promise<Map<string, Transaction>> {
  const results = new Map<string, Transaction>();
  const queue = [...txids];
  const inFlight: Promise<void>[] = [];

  while (queue.length > 0 || inFlight.length > 0) {
    while (inFlight.length < concurrency && queue.length > 0) {
      const txid = queue.shift()!;
      const promise = fetchTx(txid)
        .then((tx) => {
          results.set(txid, tx);
        })
        .catch((err) => {
          console.error(`Failed to fetch ${txid}:`, err.message);
        })
        .finally(() => {
          const idx = inFlight.indexOf(promise);
          if (idx > -1) inFlight.splice(idx, 1);
        });
      inFlight.push(promise);
    }

    if (inFlight.length > 0) {
      await Promise.race(inFlight);
    }
  }

  return results;
}

/**
 * Clear the cache
 */
export async function clearCache(): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(CACHE_DIR, { recursive: true, force: true });
}

/**
 * Get cache stats
 */
export async function getCacheStats(): Promise<{ files: number; size: number }> {
  const { readdir, stat } = await import("node:fs/promises");

  let files = 0;
  let size = 0;

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(path);
        } else if (entry.isFile() && entry.name.endsWith(".hex")) {
          files++;
          const s = await stat(path);
          size += s.size;
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  await walkDir(CACHE_DIR);
  return { files, size };
}
