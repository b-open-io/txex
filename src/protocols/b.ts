/**
 * B:// Protocol Parser
 * Extends BitCom pattern from ts-templates
 * Prefix: 19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut
 *
 * Format: OP_RETURN <B_PREFIX> <data> <media_type> <encoding> [<filename>]
 */

import { type LockingScript, OP, Script, Utils } from "@bsv/sdk";

export const B_PREFIX = "19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut";

export interface BFile {
	data: Uint8Array;
	mediaType: string;
	encoding?: string;
	filename?: string;
}

/**
 * Find OP_RETURN position in script bytes
 */
function findReturn(scriptBytes: number[]): number {
	for (let i = 0; i < scriptBytes.length; i++) {
		if (scriptBytes[i] === OP.OP_RETURN) {
			return i;
		}
	}
	return -1;
}

/**
 * Parse chunks from script after OP_RETURN (BitCom pattern)
 */
function parseChunksAfterReturn(
	script: Script | LockingScript,
): ReturnType<typeof Script.prototype.chunks> | null {
	const scriptBytes = script.toBinary();
	const pos = findReturn(scriptBytes);
	if (pos === -1) return null;

	// Re-parse from after OP_RETURN to get proper chunks
	const remaining = scriptBytes.slice(pos + 1);
	const remainingScript = Script.fromBinary(remaining);
	return remainingScript.chunks;
}

/**
 * Parse B:// protocol from script
 */
export function parseB(script: Script | LockingScript): BFile | null {
	const chunks = parseChunksAfterReturn(script);
	if (!chunks || chunks.length < 3) return null;

	// First chunk should be B prefix
	const firstChunk = chunks[0];
	if (!firstChunk.data) return null;

	const prefix = Utils.toUTF8(firstChunk.data);
	if (prefix !== B_PREFIX) return null;

	// Format: B_PREFIX, data, media_type, encoding, [filename]
	const dataChunk = chunks[1];
	const mediaTypeChunk = chunks[2];
	const encodingChunk = chunks[3];
	const filenameChunk = chunks[4];

	if (!dataChunk?.data || !mediaTypeChunk?.data) return null;

	return {
		data: new Uint8Array(dataChunk.data),
		mediaType: Utils.toUTF8(mediaTypeChunk.data),
		encoding: encodingChunk?.data
			? Utils.toUTF8(encodingChunk.data)
			: undefined,
		filename: filenameChunk?.data
			? Utils.toUTF8(filenameChunk.data)
			: undefined,
	};
}

/**
 * Check if script is a B:// protocol transaction
 */
export function isB(script: Script | LockingScript): boolean {
	const chunks = parseChunksAfterReturn(script);
	if (!chunks || chunks.length === 0) return false;

	const firstChunk = chunks[0];
	if (!firstChunk.data) return false;

	try {
		return Utils.toUTF8(firstChunk.data) === B_PREFIX;
	} catch {
		return false;
	}
}
