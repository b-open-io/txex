/**
 * BCAT (Bitcoin Concatenate) Protocol Parser
 * Extends BitCom pattern from ts-templates
 *
 * Two transaction types:
 * 1. Metadata tx - prefix: 15DHFxWZJT58f9nhyGnsRBqrgwK4W6h4Up
 *    Format: OP_RETURN <BCAT_PREFIX> <info> <mime_type> <encoding> <filename> <flag> <chunk_txid>...
 *
 * 2. Chunk tx - prefix: 1ChDHzdd1H4wSjgGMHyndZm6qxEDGjqpJL
 *    Format: OP_RETURN <BCATPART_PREFIX> <raw_data>
 */

import { Script, LockingScript, OP, Utils } from "@bsv/sdk";

export const BCAT_PREFIX = "15DHFxWZJT58f9nhyGnsRBqrgwK4W6h4Up";
export const BCATPART_PREFIX = "1ChDHzdd1H4wSjgGMHyndZm6qxEDGjqpJL";

export interface BCATMetadata {
  info?: string;
  mediaType: string;
  encoding?: string;
  filename?: string;
  chunkTxids: string[];
}

export interface BCATChunk {
  data: Uint8Array;
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
function parseChunksAfterReturn(script: Script | LockingScript): ReturnType<typeof Script.prototype.chunks> | null {
  const scriptBytes = script.toBinary();
  const pos = findReturn(scriptBytes);
  if (pos === -1) return null;

  // Re-parse from after OP_RETURN to get proper chunks
  const remaining = scriptBytes.slice(pos + 1);
  const remainingScript = Script.fromBinary(remaining);
  return remainingScript.chunks;
}

/**
 * Parse BCAT metadata transaction to get chunk list
 */
export function parseBCATMetadata(script: Script | LockingScript): BCATMetadata | null {
  const chunks = parseChunksAfterReturn(script);
  if (!chunks || chunks.length === 0) return null;

  // First chunk should be BCAT prefix
  const firstChunk = chunks[0];
  if (!firstChunk.data) return null;

  const prefix = Utils.toUTF8(firstChunk.data);
  if (prefix !== BCAT_PREFIX) return null;

  const result: BCATMetadata = {
    mediaType: "",
    chunkTxids: [],
  };

  // Parse remaining chunks
  // Format: info, mime_type, encoding, filename, flag, [chunk_txids...]
  let fieldIdx = 0;
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk.data) continue;

    // 32-byte data is a chunk txid (stored as-is, not reversed)
    if (chunk.data.length === 32) {
      const txid = Utils.toHex(chunk.data);
      result.chunkTxids.push(txid);
      continue;
    }

    // Parse text fields
    const text = Utils.toUTF8(chunk.data);

    switch (fieldIdx) {
      case 0:
        result.info = text;
        break;
      case 1:
        result.mediaType = text;
        break;
      case 2:
        result.encoding = text;
        break;
      case 3:
        result.filename = text;
        break;
      // Additional fields (flags) are ignored
    }
    fieldIdx++;
  }

  return result.chunkTxids.length > 0 ? result : null;
}

/**
 * Parse BCAT part/chunk transaction to get raw data
 */
export function parseBCATChunk(script: Script | LockingScript): BCATChunk | null {
  const chunks = parseChunksAfterReturn(script);
  if (!chunks || chunks.length < 2) return null;

  // First chunk should be BCATPART prefix
  const firstChunk = chunks[0];
  if (!firstChunk.data) return null;

  const prefix = Utils.toUTF8(firstChunk.data);
  if (prefix !== BCATPART_PREFIX) return null;

  // Second chunk is the raw data
  const dataChunk = chunks[1];
  if (!dataChunk.data) return null;

  return {
    data: new Uint8Array(dataChunk.data),
  };
}

/**
 * Check if script is a BCAT metadata transaction
 */
export function isBCATMetadata(script: Script | LockingScript): boolean {
  const chunks = parseChunksAfterReturn(script);
  if (!chunks || chunks.length === 0) return false;

  const firstChunk = chunks[0];
  if (!firstChunk.data) return false;

  try {
    return Utils.toUTF8(firstChunk.data) === BCAT_PREFIX;
  } catch {
    return false;
  }
}

/**
 * Check if script is a BCAT chunk transaction
 */
export function isBCATChunk(script: Script | LockingScript): boolean {
  const chunks = parseChunksAfterReturn(script);
  if (!chunks || chunks.length === 0) return false;

  const firstChunk = chunks[0];
  if (!firstChunk.data) return false;

  try {
    return Utils.toUTF8(firstChunk.data) === BCATPART_PREFIX;
  } catch {
    return false;
  }
}
