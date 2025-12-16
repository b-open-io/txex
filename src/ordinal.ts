/**
 * 1Sat Ordinal Tracking
 * Tracks ordinal position through transaction chains
 */

import type { Transaction } from "@bsv/sdk";
import { fetchOutput, fetchSpend, fetchTxJB } from "./providers/junglebus.js";

export interface Outpoint {
	txid: string;
	vout: number;
}

/**
 * Calculate which output receives the ordinal from a spent input
 * Uses 1Sat Ordinals model: first-in-first-out satoshi tracking
 *
 * @param spendTx The transaction that spends the ordinal
 * @param spentOutpoint The outpoint being spent (contains the ordinal)
 * @returns The outpoint where the ordinal lands, or null if not a 1-sat output
 */
export async function calculateOrdinalOutput(
	spendTx: Transaction,
	spentOutpoint: Outpoint,
): Promise<Outpoint | null> {
	let inputIndex = -1;
	let ordinalOffset = 0n;

	// Find the input that spends our outpoint and calculate ordinal offset
	for (let i = 0; i < spendTx.inputs.length; i++) {
		const input = spendTx.inputs[i];
		const sourceTxid = input.sourceTXID;
		const sourceVout = input.sourceOutputIndex;

		if (
			sourceTxid === spentOutpoint.txid &&
			sourceVout === spentOutpoint.vout
		) {
			inputIndex = i;
			break;
		}

		// Sum satoshis from previous inputs
		const prevOutput = await fetchOutput(sourceTxid, sourceVout);
		ordinalOffset += prevOutput.satoshis;
	}

	if (inputIndex === -1) {
		throw new Error("Outpoint not found in spending transaction inputs");
	}

	// Find the output at the ordinal offset
	let cumulativeSats = 0n;
	for (let i = 0; i < spendTx.outputs.length; i++) {
		const output = spendTx.outputs[i];
		const satoshis = BigInt(output.satoshis ?? 0);

		if (satoshis === 0n) {
			continue;
		}

		if (cumulativeSats === ordinalOffset) {
			// Found the ordinal position - must be 1-sat
			if (satoshis !== 1n) {
				return null;
			}
			return {
				txid: spendTx.id("hex"),
				vout: i,
			};
		}

		cumulativeSats += satoshis;
		if (cumulativeSats > ordinalOffset) {
			break;
		}
	}

	return null;
}

/**
 * Calculate which input provided the ordinal for a given output
 * Used for backward chain traversal
 *
 * @param tx The transaction containing the output
 * @param outpoint The output to trace back
 * @returns The input outpoint that provided the ordinal, or null
 */
export async function calculatePreviousOrdinalInput(
	tx: Transaction,
	outpoint: Outpoint,
): Promise<Outpoint | null> {
	if (outpoint.vout >= tx.outputs.length) {
		throw new Error("Invalid outpoint index");
	}

	const currentOutput = tx.outputs[outpoint.vout];
	if ((currentOutput.satoshis ?? 0) !== 1) {
		return null; // Not a 1-sat ordinal output
	}

	// Calculate ordinal offset (sum of satoshis in outputs before this one)
	let ordinalOffset = 0n;
	for (let i = 0; i < outpoint.vout; i++) {
		const sats = tx.outputs[i].satoshis ?? 0;
		if (sats > 0) {
			ordinalOffset += BigInt(sats);
		}
	}

	// Find the input at this ordinal offset
	let cumulativeSats = 0n;
	for (let i = 0; i < tx.inputs.length; i++) {
		const input = tx.inputs[i];
		const prevOutpoint = {
			txid: input.sourceTXID,
			vout: input.sourceOutputIndex,
		};

		const prevOutput = await fetchOutput(prevOutpoint.txid, prevOutpoint.vout);

		if (cumulativeSats === ordinalOffset) {
			// Found the ordinal position - must be 1-sat
			if (prevOutput.satoshis !== 1n) {
				return null;
			}
			return prevOutpoint;
		}

		cumulativeSats += prevOutput.satoshis;
		if (cumulativeSats > ordinalOffset) {
			break;
		}
	}

	return null;
}

/**
 * Find the origin of an ordinal by walking backward through the chain
 *
 * @param outpoint Starting point
 * @returns The origin outpoint (where the ordinal was inscribed)
 */
export async function findOrigin(outpoint: Outpoint): Promise<Outpoint> {
	let current = outpoint;

	while (true) {
		const tx = await fetchTxJB(current.txid);
		const prevInput = await calculatePreviousOrdinalInput(tx, current);

		if (!prevInput) {
			// No valid previous input - this is the origin
			return current;
		}

		current = prevInput;
	}
}

/**
 * Get the next outpoint in the ordinal chain (forward traversal)
 *
 * @param outpoint Current outpoint
 * @returns Next outpoint, or null if unspent or chain ends
 */
export async function getNextOrdinalOutpoint(
	outpoint: Outpoint,
): Promise<Outpoint | null> {
	// Find which tx spends this output
	const spendTxid = await fetchSpend(outpoint.txid, outpoint.vout);
	if (!spendTxid) {
		return null; // Unspent
	}

	// Load the spending tx
	const spendTx = await fetchTxJB(spendTxid);

	// Calculate where the ordinal lands
	return calculateOrdinalOutput(spendTx, outpoint);
}
