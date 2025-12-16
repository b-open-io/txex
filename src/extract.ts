/**
 * Main extraction logic
 * Supports: B://, BCAT, 1Sat Ordinals
 */

import type { Script, LockingScript } from "@bsv/sdk";
import { parseB, isB, B_PREFIX } from "./protocols/b.js";
import { parseOrdinals, isOrdinals } from "./protocols/ordinals.js";
import {
  parseBCATMetadata,
  parseBCATChunk,
  isBCATMetadata,
  isBCATChunk,
  BCAT_PREFIX,
  BCATPART_PREFIX,
} from "./protocols/bcat.js";
import { fetchTx } from "./providers/woc.js";

export interface ExtractedFile {
  data: Uint8Array;
  mediaType?: string;
  filename?: string;
  protocol: "b" | "bcat" | "ord";
}

export interface ExtractOptions {
  /** Output index for outpoint format (default: 0) */
  vout?: number;
  /** Progress callback for chunked files */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Parse outpoint string into txid and vout
 */
export function parseOutpoint(outpoint: string): { txid: string; vout: number } {
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
  script: Script | LockingScript
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
function extractFromScript(script: Script | LockingScript): ExtractedFile | null {
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
 * Extract file from BCAT metadata tx (reassembles chunks)
 */
async function extractBCAT(
  metadata: ReturnType<typeof parseBCATMetadata>,
  options?: ExtractOptions
): Promise<ExtractedFile> {
  if (!metadata) throw new Error("Invalid BCAT metadata");

  const chunks: Uint8Array[] = [];
  const total = metadata.chunkTxids.length;

  console.log(`Fetching ${total} BCAT chunks...`);

  for (let i = 0; i < total; i++) {
    const txid = metadata.chunkTxids[i];
    options?.onProgress?.(i + 1, total);

    console.log(`  [${i + 1}/${total}] ${txid}`);

    const tx = await fetchTx(txid);

    // Find the BCAT chunk in outputs
    let found = false;
    for (const output of tx.outputs) {
      const chunkData = parseBCATChunk(output.lockingScript);
      if (chunkData) {
        chunks.push(chunkData.data);
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`BCAT chunk not found in tx ${txid}`);
    }
  }

  // Concatenate all chunks
  const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`Reassembled ${totalSize} bytes from ${total} chunks`);

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
  options?: ExtractOptions
): Promise<ExtractedFile> {
  const { txid, vout } = parseOutpoint(outpoint);

  console.log(`Fetching tx: ${txid}`);
  const tx = await fetchTx(txid);

  const output = tx.outputs[vout];
  if (!output) {
    throw new Error(`Output ${vout} not found in tx ${txid}`);
  }

  const script = output.lockingScript;
  const protocol = detectProtocol(script);

  // Handle BCAT metadata specially - need to fetch chunks
  if (protocol === "bcat") {
    const metadata = parseBCATMetadata(script);
    return extractBCAT(metadata, options);
  }

  // Handle single-tx protocols
  const file = extractFromScript(script);
  if (!file) {
    throw new Error(`Could not extract file from ${outpoint} - unknown protocol`);
  }

  return file;
}

/**
 * Extract and return just the raw data (convenience function)
 */
export async function extractData(
  outpoint: string,
  options?: ExtractOptions
): Promise<Uint8Array> {
  const file = await extract(outpoint, options);
  return file.data;
}
