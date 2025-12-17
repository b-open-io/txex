/**
 * Main extraction logic
 * Supports: B://, BCAT, 1Sat Ordinals, ORDFS Streams
 */

import type { LockingScript, Script } from "@bsv/sdk";
import {
	ChunkNotFoundError,
	OutputNotFoundError,
	ProtocolError,
} from "./errors.js";
import { findOrigin } from "./ordinal.js";
import { isB, parseB } from "./protocols/b.js";
import {
	isBCATChunk,
	isBCATMetadata,
	parseBCATChunk,
	parseBCATMetadata,
} from "./protocols/bcat.js";
import { isOrdinals, parseOrdinals } from "./protocols/ordinals.js";
import { extractStream, isStreamContinuation } from "./protocols/stream.js";
import { fetchTx } from "./providers/junglebus.js";

export interface ExtractedFile {
	data: Uint8Array;
	mediaType?: string;
	filename?: string;
	protocol: "b" | "bcat" | "ord" | "stream";
	/** Number of chunks (for BCAT and stream protocols) */
	chunks?: number;
}

export interface ExtractOptions {
	/** Output index for outpoint format (default: 0) */
	vout?: number;
	/** Progress callback for chunked files */
	onProgress?: (current: number, total: number) => void;
	/** Concurrency limit for parallel chunk fetching (default: 5) */
	concurrency?: number;
	/** Enable ordfs/stream protocol - follow ordinal chain (default: true) */
	stream?: boolean;
}

/**
 * Parse outpoint string into txid and vout
 */
export function parseOutpoint(outpoint: string): {
	txid: string;
	vout: number;
} {
	// Handle formats: txid_vout, txid (defaults to vout 0)
	if (outpoint.includes("_")) {
		const [txid, voutStr] = outpoint.split("_");
		return { txid, vout: Number.parseInt(voutStr, 10) };
	}
	return { txid: outpoint, vout: 0 };
}

/**
 * Detect protocol from transaction output script
 */
export function detectProtocol(
	script: Script | LockingScript,
): "b" | "bcat" | "bcat-chunk" | "ord" | null {
	// Check in order of specificity
	if (isOrdinals(script)) return "ord";
	if (isBCATMetadata(script)) return "bcat";
	if (isBCATChunk(script)) return "bcat-chunk";
	if (isB(script)) return "b";

	return null;
}

/**
 * Extract file from a single transaction output
 */
function extractFromScript(
	script: Script | LockingScript,
): ExtractedFile | null {
	// Try Ordinals first (most common for new inscriptions)
	const ordFile = parseOrdinals(script);
	if (ordFile) {
		return {
			data: ordFile.data,
			mediaType: ordFile.mediaType,
			protocol: "ord",
		};
	}

	// Try B://
	const bFile = parseB(script);
	if (bFile) {
		return {
			data: bFile.data,
			mediaType: bFile.mediaType,
			filename: bFile.filename,
			protocol: "b",
		};
	}

	// Try BCAT chunk (single chunk, not metadata)
	const chunk = parseBCATChunk(script);
	if (chunk) {
		return {
			data: chunk.data,
			protocol: "bcat",
		};
	}

	return null;
}

/**
 * Simple concurrent map with limited parallelism
 */
async function pMap<T, R>(
	items: T[],
	mapper: (item: T, index: number) => Promise<R>,
	concurrency: number,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let currentIndex = 0;

	async function worker(): Promise<void> {
		while (currentIndex < items.length) {
			const index = currentIndex++;
			results[index] = await mapper(items[index], index);
		}
	}

	// Start workers up to concurrency limit
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		() => worker(),
	);
	await Promise.all(workers);

	return results;
}

/**
 * Extract file from BCAT metadata tx (reassembles chunks)
 * Uses parallel fetching for better performance
 */
async function extractBCAT(
	metadata: ReturnType<typeof parseBCATMetadata>,
	options?: ExtractOptions,
): Promise<ExtractedFile> {
	if (!metadata) throw new ProtocolError("Invalid BCAT metadata", "bcat");

	const total = metadata.chunkTxids.length;
	const concurrency = options?.concurrency ?? 5;
	let completed = 0;

	// Fetch chunks in parallel with progress reporting
	const chunks = await pMap(
		metadata.chunkTxids,
		async (txid, index) => {
			const tx = await fetchTx(txid);

			// Find the BCAT chunk in outputs
			for (const output of tx.outputs) {
				const chunkData = parseBCATChunk(output.lockingScript);
				if (chunkData) {
					completed++;
					options?.onProgress?.(completed, total);
					return chunkData.data;
				}
			}

			throw new ChunkNotFoundError(txid, index);
		},
		concurrency,
	);

	// Concatenate all chunks
	const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
	const result = new Uint8Array(totalSize);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return {
		data: result,
		mediaType: metadata.mediaType,
		filename: metadata.filename,
		protocol: "bcat",
	};
}

/**
 * Extract file from outpoint
 */
export async function extract(
	outpoint: string,
	options?: ExtractOptions,
): Promise<ExtractedFile> {
	const { txid, vout } = parseOutpoint(outpoint);
	const tx = await fetchTx(txid);

	const output = tx.outputs[vout];
	if (!output) {
		throw new OutputNotFoundError(txid, vout);
	}

	const script = output.lockingScript;
	const protocol = detectProtocol(script);

	// Handle BCAT metadata specially - need to fetch chunks
	if (protocol === "bcat") {
		const metadata = parseBCATMetadata(script);
		return extractBCAT(metadata, options);
	}

	// Handle single-tx protocols
	let file = extractFromScript(script);

	// If no recognized protocol but it's a 1-sat output, try finding the origin
	if (!file && output.satoshis === 1) {
		const origin = await findOrigin({ txid, vout });

		// If origin is different from current, extract from origin
		if (origin.txid !== txid || origin.vout !== vout) {
			const originTx = await fetchTx(origin.txid);
			const originOutput = originTx.outputs[origin.vout];
			if (originOutput) {
				file = extractFromScript(originOutput.lockingScript);
			}
		}
	}

	if (!file) {
		throw new ProtocolError(
			`Could not extract file from ${outpoint} - unknown protocol`,
		);
	}

	// Check for ordfs/stream - follow ordinal chain if enabled
	const streamEnabled = options?.stream !== false;
	if (
		streamEnabled &&
		file.protocol === "ord" &&
		isStreamContinuation(file.mediaType)
	) {
		// This is a stream continuation - need to find origin and extract full stream
		// For now, start from this outpoint and go forward
		const streamResult = await extractStream(
			{ txid, vout },
			{ onProgress: (seq) => options?.onProgress?.(seq, -1) },
		);

		return {
			data: streamResult.data,
			mediaType: streamResult.mediaType,
			protocol: "stream",
			chunks: streamResult.chunks,
		};
	}

	// Check if this ordinal starts a stream (has ordfs/stream continuations)
	if (streamEnabled && file.protocol === "ord") {
		// Try to extract as stream - will return single chunk if no continuations
		const streamResult = await extractStream(
			{ txid, vout },
			{ onProgress: (seq) => options?.onProgress?.(seq, -1) },
		);

		// If more than one chunk, it's a stream
		if (streamResult.chunks > 1) {
			return {
				data: streamResult.data,
				mediaType: streamResult.mediaType,
				protocol: "stream",
				chunks: streamResult.chunks,
			};
		}
	}

	return file;
}

/**
 * Extract and return just the raw data (convenience function)
 */
export async function extractData(
	outpoint: string,
	options?: ExtractOptions,
): Promise<Uint8Array> {
	const file = await extract(outpoint, options);
	return file.data;
}
