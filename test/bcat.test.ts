/**
 * BCAT Protocol Tests
 *
 * Test vectors:
 * - SHUAA metadata tx: fb3c1b442b352f6dcf503dcfa8ad274897184487f41928832858122c1e669da1
 * - First chunk tx: a2b1f5b9e96164af01ad5f2d88b2c9ca32f2c83d54ea9c33d12e1a1ff82ef0d1
 */

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Transaction } from "@bsv/sdk";
import {
	BCAT_PREFIX,
	BCATPART_PREFIX,
	parseBCATMetadata,
} from "../src/protocols/bcat";

// Known test vectors - txids in display format (big-endian)
const _SHUAA_METADATA_TXID =
	"fb3c1b442b352f6dcf503dcfa8ad274897184487f41928832858122c1e669da1";

// Expected chunk txids (stored as-is in the script, not reversed)
const EXPECTED_CHUNK_TXIDS = [
	"a2b1f5b9e96164af01ad5f2d88b2c9ca32f2c83d54ea9c33d12e1a1ff82ef0d1",
	"d6f3a4facfd30a9a49d5a62853bb0be638826bc8de73749aefcc5657bfbaeedb",
	"449d1f166a3982e42c111563553198e4bbe6ac75d6c374b23085a51a2aa88c1f",
	"f14ce05e74d6368ef1a6db1100df17f42ea0195d3f64049864d94def06f529ed",
	"f1c826eb030871ebff1430af4a2a14b7aaa37d1457c1b05b9fc78430c3298e69",
	"ec499a6655b5eb8f56ddc25609418bafd929366bfe7501148559310d0a864e11",
	"707fb7ba5575fa0d4b4c4c98ce7e9842a3d14962ce6670fb155d742a4d096657",
	"eb346820a88ca52ccd015aa5da81879f02f44b2d36a19ba5e089186c2c52a9c2",
	"c6d06408d88d7026051701c69c114ad7d6df3d732a4610c509fd8cf2556b0146",
];

describe("BCAT Protocol", () => {
	test("parse BCAT metadata from fixture", async () => {
		const hex = await readFile("test/fixtures/bcat-metadata.hex", "utf8");
		const tx = Transaction.fromHex(hex.trim());

		// Get first output (OP_RETURN)
		const script = tx.outputs[0].lockingScript;
		const metadata = parseBCATMetadata(script);

		expect(metadata).not.toBeNull();
		expect(metadata?.mediaType).toBe("video/mp4");
		expect(metadata?.filename).toContain("SHUA");
		expect(metadata?.chunkTxids.length).toBe(9);
		expect(metadata?.chunkTxids).toEqual(EXPECTED_CHUNK_TXIDS);
	});

	test("BCAT prefix constant is correct", () => {
		expect(BCAT_PREFIX).toBe("15DHFxWZJT58f9nhyGnsRBqrgwK4W6h4Up");
	});

	test("BCATPART prefix constant is correct", () => {
		expect(BCATPART_PREFIX).toBe("1ChDHzdd1H4wSjgGMHyndZm6qxEDGjqpJL");
	});
});
