/**
 * txex - Transaction File Extractor
 *
 * Library exports for programmatic usage
 */

// Cache
export type { CacheOptions } from "./cache.js";
export {
	clearCache,
	getCacheDir,
	getCacheStats,
	getTransformCachePath,
	getTxCachePath,
	readTransformCache,
	readTxCache,
	writeTransformCache,
	writeTxCache,
} from "./cache.js";

// Config
export type { TxexConfig } from "./config.js";
export { hashConfig, loadConfig, mergeWithConfig } from "./config.js";

// Error types
export {
	ChunkNotFoundError,
	NetworkError,
	OutputNotFoundError,
	ProtocolError,
	TxexError,
} from "./errors.js";

// Main extraction
export type { ExtractedFile, ExtractOptions } from "./extract.js";
export {
	detectProtocol,
	extract,
	extractData,
	parseOutpoint,
} from "./extract.js";
// Ordinal tracking
export type { Outpoint } from "./ordinal.js";
export {
	calculateOrdinalOutput,
	calculatePreviousOrdinalInput,
	findOrigin,
	getNextOrdinalOutpoint,
} from "./ordinal.js";
// Protocol parsers
export type { BFile } from "./protocols/b.js";
export { B_PREFIX, isB, parseB } from "./protocols/b.js";
export type { BCATChunk, BCATMetadata } from "./protocols/bcat.js";
export {
	BCAT_PREFIX,
	BCATPART_PREFIX,
	isBCATChunk,
	isBCATMetadata,
	parseBCATChunk,
	parseBCATMetadata,
} from "./protocols/bcat.js";
export type { OrdFile } from "./protocols/ordinals.js";
export { isOrdinals, parseOrdinals } from "./protocols/ordinals.js";
export type { StreamChunk } from "./protocols/stream.js";
export {
	extractStream,
	isStreamContinuation,
	parseOutputContent,
	streamContent,
} from "./protocols/stream.js";
export {
	fetchOutput,
	fetchRawTxBin,
	fetchSpend,
	fetchTxJB,
} from "./providers/junglebus.js";
// Providers
export { fetchRawTx, fetchTx, fetchTxBatch } from "./providers/woc.js";

// Transforms
export type { TransformOptions } from "./transform.js";
export {
	getTransformMimeType,
	hashTransformOptions,
	isTransformableImage,
	transformImage,
} from "./transform.js";
