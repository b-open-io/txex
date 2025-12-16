/**
 * Config File Support
 * Reads .txexrc or txex.config.json for default options
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TransformOptions } from "./transform.js";

export interface TxexConfig {
	/** Default concurrency for parallel fetching */
	concurrency?: number;
	/** Default transform options */
	transform?: TransformOptions;
	/** Cache directory override */
	cacheDir?: string;
	/** Disable caching */
	noCache?: boolean;
}

const CONFIG_NAMES = ["txex.config.json", ".txexrc", ".txexrc.json"];

/**
 * Find and load config file
 * Searches: cwd -> home directory
 */
export async function loadConfig(): Promise<TxexConfig | null> {
	const searchPaths = [process.cwd(), homedir()];

	for (const dir of searchPaths) {
		for (const name of CONFIG_NAMES) {
			const configPath = join(dir, name);
			if (existsSync(configPath)) {
				try {
					const content = await readFile(configPath, "utf-8");
					return JSON.parse(content) as TxexConfig;
				} catch {
					// Invalid config, skip
				}
			}
		}
	}

	return null;
}

/**
 * Generate config hash for cache invalidation
 */
export function hashConfig(config: TxexConfig): string {
	const normalized = JSON.stringify(config, Object.keys(config).sort());
	return createHash("sha256").update(normalized).digest("hex").slice(0, 8);
}

/**
 * Merge CLI options with config file defaults
 */
export function mergeWithConfig<T extends Record<string, unknown>>(
	cliOptions: T,
	config: TxexConfig | null,
): T {
	if (!config) return cliOptions;

	const merged = { ...cliOptions };

	// Only apply config defaults for undefined CLI options
	for (const [key, value] of Object.entries(config)) {
		if (key in merged && merged[key as keyof T] === undefined) {
			(merged as Record<string, unknown>)[key] = value;
		}
	}

	return merged;
}
