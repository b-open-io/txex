/**
 * JungleBus Provider
 * Fetches transactions and spend data from JungleBus API
 * Required for ordfs/stream protocol support
 */

import { Transaction, Utils } from "@bsv/sdk";
import { type CacheOptions, readTxCache, writeTxCache } from "../cache.js";
import { NetworkError } from "../errors.js";

const JUNGLEBUS_BASE = "https://junglebus.gorillapool.io";

/**
 * Fetch raw transaction from JungleBus (binary format, with caching)
 */
export async function fetchRawTxBin(
	txid: string,
	cacheOptions?: CacheOptions,
): Promise<Uint8Array> {
	// Check cache first (stored as hex)
	const cached = await readTxCache(txid, cacheOptions);
	if (cached) {
		return Utils.toArray(cached, "hex");
	}

	const url = `${JUNGLEBUS_BASE}/v1/transaction/get/${txid}/bin`;
	const resp = await fetch(url);

	if (!resp.ok) {
		throw new NetworkError(
			`JungleBus fetch failed: ${resp.status} ${resp.statusText}`,
			txid,
			resp.status,
		);
	}

	const buffer = await resp.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	// Cache as hex for compatibility
	await writeTxCache(txid, Utils.toHex(bytes), cacheOptions);

	return bytes;
}

/**
 * Fetch and parse transaction from JungleBus
 */
export async function fetchTxJB(
	txid: string,
	cacheOptions?: CacheOptions,
): Promise<Transaction> {
	const bytes = await fetchRawTxBin(txid, cacheOptions);
	return Transaction.fromBinary(Array.from(bytes));
}

/**
 * Output data from JungleBus txo endpoint
 */
export interface TxOutput {
	satoshis: bigint;
	script: Uint8Array;
}

/**
 * Fetch a specific output from JungleBus
 * Format: 8 bytes satoshis (LE) + varint script length + script
 */
export async function fetchOutput(
	txid: string,
	vout: number,
	_cacheOptions?: CacheOptions,
): Promise<TxOutput> {
	const outpoint = `${txid}_${vout}`;
	const url = `${JUNGLEBUS_BASE}/v1/txo/get/${outpoint}`;

	const resp = await fetch(url);

	if (resp.status === 404) {
		throw new NetworkError(`Output not found: ${outpoint}`, txid, 404);
	}

	if (!resp.ok) {
		throw new NetworkError(
			`JungleBus fetch failed: ${resp.status} ${resp.statusText}`,
			txid,
			resp.status,
		);
	}

	const buffer = await resp.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	if (bytes.length < 8) {
		throw new NetworkError(`Output too short: ${bytes.length} bytes`, txid);
	}

	// Parse satoshis (8 bytes, little-endian)
	const view = new DataView(bytes.buffer);
	const satoshis = view.getBigUint64(0, true);

	// Parse varint for script length
	const { value: scriptLen, bytesRead } = readVarint(bytes.subarray(8));

	// Extract script
	const scriptStart = 8 + bytesRead;
	const script = bytes.subarray(scriptStart, scriptStart + scriptLen);

	return { satoshis, script };
}

/**
 * Fetch the txid of the transaction that spends a given output
 * Returns null if output is unspent
 */
export async function fetchSpend(
	txid: string,
	vout: number,
): Promise<string | null> {
	const outpoint = `${txid}_${vout}`;
	const url = `${JUNGLEBUS_BASE}/v1/txo/spend/${outpoint}`;

	const resp = await fetch(url);

	if (resp.status >= 300) {
		// Output not spent or error
		return null;
	}

	const buffer = await resp.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	if (bytes.length === 0) {
		return null;
	}

	// Response is raw bytes of txid (32 bytes)
	return Utils.toHex(bytes);
}

/**
 * Read a Bitcoin varint from bytes
 */
function readVarint(bytes: Uint8Array): { value: number; bytesRead: number } {
	const first = bytes[0];

	if (first < 0xfd) {
		return { value: first, bytesRead: 1 };
	}
	if (first === 0xfd) {
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		return { value: view.getUint16(1, true), bytesRead: 3 };
	}
	if (first === 0xfe) {
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		return { value: view.getUint32(1, true), bytesRead: 5 };
	}
	// 0xff - 8 bytes, but we don't support scripts that large
	throw new Error("Varint too large");
}
