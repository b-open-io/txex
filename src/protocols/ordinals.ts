/**
 * 1Sat Ordinals Protocol Parser
 * Pattern: OP_FALSE OP_IF "ord" ... OP_ENDIF
 *
 * Fields:
 * - OP_0: content data
 * - OP_1: content type (MIME)
 */

import { Script, LockingScript, OP, Utils } from "@bsv/sdk";

export interface OrdFile {
  data: Uint8Array;
  mediaType?: string;
}

/**
 * Parse 1Sat Ordinals inscription from script
 * Handles the envelope pattern: OP_FALSE OP_IF "ord" <fields> OP_ENDIF
 */
export function parseOrdinals(script: Script | LockingScript): OrdFile | null {
  const chunks = script.chunks;

  let opFalseIdx = -1;
  let opIfIdx = -1;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.op === OP.OP_FALSE || chunk.op === OP.OP_0) {
      opFalseIdx = i;
    }

    if (chunk.op === OP.OP_IF) {
      opIfIdx = i;
    }

    // Check for "ord" marker after OP_FALSE OP_IF
    if (chunk.data && opFalseIdx === i - 2 && opIfIdx === i - 1) {
      let marker: string;
      try {
        marker = Utils.toUTF8(chunk.data);
      } catch {
        continue;
      }
      if (marker !== "ord") continue;

      // Found inscription envelope
      const file: OrdFile = { data: new Uint8Array() };

      // Parse fields (pairs of opcode + data)
      for (let j = i + 1; j < chunks.length; j += 2) {
        const opChunk = chunks[j];
        const dataChunk = chunks[j + 1];

        // Stop at data or OP_ENDIF
        if (opChunk.data) break;
        if (opChunk.op === OP.OP_ENDIF) break;

        switch (opChunk.op) {
          case OP.OP_0:
            // Content data
            if (dataChunk?.data) {
              file.data = new Uint8Array(dataChunk.data);
            }
            return file;

          case OP.OP_1:
            // Content type
            if (dataChunk?.data) {
              file.mediaType = Utils.toUTF8(dataChunk.data);
            }
            break;
        }
      }

      return file;
    }
  }

  return null;
}

/**
 * Check if script contains a 1Sat Ordinals inscription
 */
export function isOrdinals(script: Script | LockingScript): boolean {
  const chunks = script.chunks;

  let opFalseIdx = -1;
  let opIfIdx = -1;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.op === OP.OP_FALSE || chunk.op === OP.OP_0) {
      opFalseIdx = i;
    }

    if (chunk.op === OP.OP_IF) {
      opIfIdx = i;
    }

    if (chunk.data && opFalseIdx === i - 2 && opIfIdx === i - 1) {
      try {
        const marker = Utils.toUTF8(chunk.data);
        if (marker === "ord") return true;
      } catch {
        continue;
      }
    }
  }

  return false;
}
