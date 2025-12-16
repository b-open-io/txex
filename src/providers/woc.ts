/**
 * Transaction Provider
 * Fetches raw transactions from JungleBus API (primary)
 * Falls back to WhatsOnChain if needed
 * Uses unified cache module
 */

import { Transaction, Utils } from "@bsv/sdk";
import { type CacheOptions, readTxCache, writeTxCache } from "../cache.js";
import { NetworkError } from "../errors.js";

const JUNGLEBUS_BASE = "https://junglebus.gorillapool.io";
const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";

/**
 * Fetch raw transaction hex (with caching)
 * Uses JungleBus as primary, WoC as fallback
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

	// Try JungleBus first (binary format)
	try {
		const jbUrl = `${JUNGLEBUS_BASE}/v1/transaction/get/${txid}/bin`;
		const jbResp = await fetch(jbUrl);

		if (jbResp.ok) {
			const buffer = await jbResp.arrayBuffer();
			const bytes = new Uint8Array(buffer);

			// Check if it's an error response
			if (bytes.length < 100) {
				const text = new TextDecoder().decode(bytes);
				if (text.includes("not-found")) {
					throw new Error("Not found on JungleBus");
				}
			}

			const hex = Utils.toHex(bytes);
			await writeTxCache(txid, hex, cacheOptions);
			return hex;
		}
	} catch {
		// Fall through to WoC
	}

	// Fallback to WhatsOnChain
	const wocUrl = `${WOC_BASE}/tx/${txid}/hex`;
	const wocResp = await fetch(wocUrl);

	if (!wocResp.ok) {
		throw new NetworkError(
			`Transaction not found: ${txid}`,
			txid,
			wocResp.status,
		);
	}

	const hex = await wocResp.text();
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
