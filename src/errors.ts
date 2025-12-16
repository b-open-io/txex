/**
 * Custom error classes for better CLI UX
 */

export class TxexError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TxexError";
	}
}

export class NetworkError extends TxexError {
	constructor(
		message: string,
		public readonly txid?: string,
		public readonly statusCode?: number,
	) {
		super(message);
		this.name = "NetworkError";
	}
}

export class ProtocolError extends TxexError {
	constructor(
		message: string,
		public readonly protocol?: string,
	) {
		super(message);
		this.name = "ProtocolError";
	}
}

export class OutputNotFoundError extends TxexError {
	constructor(
		public readonly txid: string,
		public readonly vout: number,
	) {
		super(`Output ${vout} not found in tx ${txid}`);
		this.name = "OutputNotFoundError";
	}
}

export class ChunkNotFoundError extends TxexError {
	constructor(
		public readonly txid: string,
		public readonly chunkIndex: number,
	) {
		super(`BCAT chunk ${chunkIndex} not found in tx ${txid}`);
		this.name = "ChunkNotFoundError";
	}
}
