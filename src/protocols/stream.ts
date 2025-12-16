/**
 * ORDFS Stream Protocol
 * Handles streaming content stored across multiple ordinal transfers
 *
 * Content type "ordfs/stream" indicates this is a continuation chunk.
 * Follow the ordinal chain until content type changes.
 */

import { LockingScript } from "@bsv/sdk";
import { getNextOrdinalOutpoint, type Outpoint } from "../ordinal.js";
import { fetchOutput } from "../providers/junglebus.js";
import { parseOrdinals } from "./ordinals.js";

export interface StreamChunk {
	data: Uint8Array;
	mediaType?: string;
	outpoint: Outpoint;
}

/**
 * Check if content type indicates a stream continuation
 */
export function isStreamContinuation(mediaType?: string): boolean {
	return mediaType === "ordfs/stream";
}

/**
 * Parse content from a JungleBus output
 */
export function parseOutputContent(
	script: Uint8Array,
): { data: Uint8Array; mediaType?: string } | null {
	// Convert to LockingScript for parsing
	const lockingScript = LockingScript.fromBinary(Array.from(script));

	// Try ordinals parsing
	const ordFile = parseOrdinals(lockingScript);
	if (ordFile) {
		return {
			data: ordFile.data,
			mediaType: ordFile.mediaType,
		};
	}

	return null;
}

/**
 * Stream content by following the ordinal chain
 * Yields chunks as they are fetched
 */
export async function* streamContent(
	startOutpoint: Outpoint,
	options?: {
		onProgress?: (seq: number) => void;
	},
): AsyncGenerator<StreamChunk> {
	let current: Outpoint | null = startOutpoint;
	let seq = 0;
	let initialMediaType: string | undefined;

	while (current) {
		// Load output from JungleBus
		const output = await fetchOutput(current.txid, current.vout);
		const parsed = parseOutputContent(output.script);

		if (!parsed) {
			// No parseable content - stream ends
			break;
		}

		// First chunk sets the content type
		if (seq === 0) {
			initialMediaType = parsed.mediaType;
		} else if (parsed.mediaType !== "ordfs/stream") {
			// Content type changed - stream ended
			break;
		}

		options?.onProgress?.(seq);

		yield {
			data: parsed.data,
			mediaType: seq === 0 ? initialMediaType : "ordfs/stream",
			outpoint: current,
		};

		seq++;

		// Get next in chain
		current = await getNextOrdinalOutpoint(current);
	}
}

/**
 * Extract complete streamed file
 * Follows the ordinal chain and concatenates all chunks
 */
export async function extractStream(
	outpoint: Outpoint,
	options?: {
		onProgress?: (current: number, total: number) => void;
	},
): Promise<{
	data: Uint8Array;
	mediaType?: string;
	chunks: number;
}> {
	const chunks: Uint8Array[] = [];
	let mediaType: string | undefined;
	let chunkCount = 0;

	for await (const chunk of streamContent(outpoint)) {
		if (chunkCount === 0) {
			mediaType = chunk.mediaType;
		}
		chunks.push(chunk.data);
		chunkCount++;
		options?.onProgress?.(chunkCount, -1); // Total unknown during streaming
	}

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
		mediaType,
		chunks: chunkCount,
	};
}
