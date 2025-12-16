/**
 * WhatsOnChain Provider
 * Fetches raw transactions from WhatsOnChain API
 * Uses unified cache module
 */

import { Transaction } from "@bsv/sdk";
import { type CacheOptions, readTxCache, writeTxCache } from "../cache.js";
import { NetworkError } from "../errors.js";

const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";

/**
 * Fetch raw transaction hex from WhatsOnChain (with caching)
 */
export async function fetchRawTx(
	txid: string,
	cacheOptions?: CacheOptions,
): Promise<string> {
	// Check cache first
	const cached = await readTxCache(txid, cacheOptions);
	if (cached) {
		return cached;
	}

	// Fetch from WoC
	const url = `${WOC_BASE}/tx/${txid}/hex`;
	const resp = await fetch(url);

	if (!resp.ok) {
		throw new NetworkError(
			`WoC fetch failed: ${resp.status} ${resp.statusText}`,
			txid,
			resp.status,
		);
	}

	const hex = await resp.text();

	// Cache for next time
	await writeTxCache(txid, hex, cacheOptions);

	return hex;
}

/**
 * Fetch and parse transaction
 */
export async function fetchTx(
	txid: string,
	cacheOptions?: CacheOptions,
): Promise<Transaction> {
	const hex = await fetchRawTx(txid, cacheOptions);
	return Transaction.fromHex(hex);
}

/**
 * Fetch multiple transactions in parallel with rate limiting
 */
export async function fetchTxBatch(
	txids: string[],
	concurrency = 5,
	cacheOptions?: CacheOptions,
): Promise<Map<string, Transaction>> {
	const results = new Map<string, Transaction>();
	const queue = [...txids];
	const inFlight: Promise<void>[] = [];

	while (queue.length > 0 || inFlight.length > 0) {
		while (inFlight.length < concurrency && queue.length > 0) {
			const txid = queue.shift();
			if (!txid) break;
			const promise = fetchTx(txid, cacheOptions)
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
