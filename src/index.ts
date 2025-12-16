/**
 * txex - Transaction File Extractor
 *
 * Library exports for programmatic usage
 */

// Main extraction
export { extract, extractData, parseOutpoint, detectProtocol } from "./extract.js";
export type { ExtractedFile, ExtractOptions } from "./extract.js";

// Protocol parsers
export { parseB, isB, B_PREFIX } from "./protocols/b.js";
export type { BFile } from "./protocols/b.js";

export { parseOrdinals, isOrdinals } from "./protocols/ordinals.js";
export type { OrdFile } from "./protocols/ordinals.js";

export {
  parseBCATMetadata,
  parseBCATChunk,
  isBCATMetadata,
  isBCATChunk,
  BCAT_PREFIX,
  BCATPART_PREFIX,
} from "./protocols/bcat.js";
export type { BCATMetadata, BCATChunk } from "./protocols/bcat.js";

// Providers
export { fetchTx, fetchRawTx, fetchTxBatch, clearCache, getCacheStats } from "./providers/woc.js";
