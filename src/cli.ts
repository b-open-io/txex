#!/usr/bin/env bun

/**
 * txex CLI - Transaction File Extractor
 *
 * Extract files from BSV transactions with optional transforms
 * Supports: B://, BCAT (chunked), 1Sat Ordinals
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { extension } from "mime-types";
import ora from "ora";
import {
	clearCache,
	getCacheStats,
	readTransformCache,
	writeTransformCache,
} from "./cache.js";
import { loadConfig, mergeWithConfig } from "./config.js";
import {
	ChunkNotFoundError,
	NetworkError,
	OutputNotFoundError,
	ProtocolError,
} from "./errors.js";
import { extract, parseOutpoint } from "./extract.js";
import {
	getTransformMimeType,
	hashTransformOptions,
	isTransformableImage,
	type TransformOptions,
	transformImage,
} from "./transform.js";

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
	await readFile(join(__dirname, "../package.json"), "utf-8"),
);

const program = new Command();

// Protocol colors
const protocolColor = (protocol: string) => {
	switch (protocol) {
		case "bcat":
			return chalk.magenta(protocol.toUpperCase());
		case "b":
			return chalk.blue(protocol.toUpperCase());
		case "ord":
			return chalk.yellow(protocol.toUpperCase());
		default:
			return chalk.white(protocol);
	}
};

// Size formatter
const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Get file extension from MIME type
const getExtension = (mediaType?: string): string => {
	if (!mediaType) return "";
	const ext = extension(mediaType);
	return ext ? `.${ext}` : "";
};

// Format error for display
const formatError = (err: unknown): string => {
	if (err instanceof NetworkError) {
		return `Network error: ${err.message}`;
	}
	if (err instanceof ProtocolError) {
		return `Protocol error: ${err.message}`;
	}
	if (err instanceof OutputNotFoundError) {
		return `Output not found: vout ${err.vout} in tx ${err.txid.slice(0, 16)}...`;
	}
	if (err instanceof ChunkNotFoundError) {
		return `Missing chunk ${err.chunkIndex}: ${err.txid.slice(0, 16)}...`;
	}
	return (err as Error).message;
};

program
	.name("txex")
	.description(
		chalk.cyan.bold("txex") + chalk.dim(" - Transaction File Extractor"),
	)
	.version(pkg.version, "-V, --version", "Output the version number");

// Main extract command
program
	.argument(
		"<outpoint>",
		"Transaction outpoint (txid_vout or just txid for vout 0)",
	)
	.option("-o, --output <path>", "Output file path")
	.option("-c, --concurrency <n>", "Parallel chunk fetches", "5")
	.option("-q, --quiet", "Suppress all output except errors")
	// Transform options
	.option("-w, --width <px>", "Resize width")
	.option("-h, --height <px>", "Resize height")
	.option("-f, --format <fmt>", "Output format (webp, avif, png, jpg)")
	.option("--fit <mode>", "Resize fit (cover, contain, fill, inside)", "cover")
	.option("--quality <n>", "Output quality 1-100", "80")
	.option("--blur <radius>", "Blur radius (0.3-1000)")
	.option("--grayscale", "Convert to grayscale")
	.option("--rotate <deg>", "Rotate degrees")
	.option("--flip", "Flip vertically")
	.option("--flop", "Flip horizontally")
	.option("--no-cache", "Disable caching")
	.action(
		async (
			outpoint: string,
			cliOptions: Record<string, string | boolean | undefined>,
		) => {
			const spinner = ora({ color: "cyan", spinner: "dots" });

			try {
				// Load config and merge with CLI options
				const config = await loadConfig();
				const options = mergeWithConfig(cliOptions, config);

				const { txid, vout } = parseOutpoint(outpoint);
				const shortTxid = `${txid.slice(0, 8)}...${txid.slice(-8)}`;
				const concurrency = Number.parseInt(
					(options.concurrency as string) ?? "5",
					10,
				);
				const quiet = options.quiet as boolean;

				// Build transform options - only include fit/quality if there's an actual transform
				const transformOpts: TransformOptions = {};
				if (options.width)
					transformOpts.width = Number.parseInt(options.width as string, 10);
				if (options.height)
					transformOpts.height = Number.parseInt(options.height as string, 10);
				if (options.format)
					transformOpts.format = options.format as TransformOptions["format"];
				if (options.blur)
					transformOpts.blur = Number.parseFloat(options.blur as string);
				if (options.grayscale) transformOpts.grayscale = true;
				if (options.rotate)
					transformOpts.rotate = Number.parseInt(options.rotate as string, 10);
				if (options.flip) transformOpts.flip = true;
				if (options.flop) transformOpts.flop = true;

				// Only include fit/quality if there's a resize or format conversion
				const hasTransforms = Object.keys(transformOpts).length > 0;
				if (hasTransforms) {
					if (options.fit && options.fit !== "cover")
						transformOpts.fit = options.fit as TransformOptions["fit"];
					if (options.quality && options.quality !== "80")
						transformOpts.quality = Number.parseInt(
							options.quality as string,
							10,
						);
				}
				const transformHash = hasTransforms
					? hashTransformOptions(transformOpts)
					: "";
				const cacheDisabled = options.cache === false;

				// Check transform cache first
				if (hasTransforms && !cacheDisabled) {
					const ext = transformOpts.format
						? `.${transformOpts.format}`
						: getExtension(undefined);
					const cached = await readTransformCache(outpoint, transformHash, ext);
					if (cached) {
						// Determine output path
						let outputPath = options.output as string | undefined;
						if (!outputPath) {
							outputPath = `${txid}_${vout}_${transformHash}${ext}`;
						}

						await writeFile(outputPath, cached);

						if (!quiet) {
							console.log(
								chalk.green("✓"),
								chalk.green(outputPath),
								chalk.dim("(cached)"),
							);
							console.log(
								chalk.dim("  └─ ") +
									chalk.dim("Size: ") +
									chalk.green(formatBytes(cached.length)),
							);
						}
						return;
					}
				}

				if (!quiet) {
					spinner.start(
						`Extracting ${chalk.cyan(shortTxid)}${chalk.dim(`_${vout}`)}`,
					);
				}

				let totalChunks = 0;
				const file = await extract(outpoint, {
					concurrency,
					onProgress: (current, total) => {
						totalChunks = total;
						if (!quiet && total > 1) {
							spinner.text = `Fetching chunks ${chalk.dim(`${current}/${total}`)}`;
						}
					},
				});

				let outputData = file.data;
				let outputMimeType = file.mediaType;

				// Apply transforms if requested and file is an image
				if (hasTransforms) {
					if (!isTransformableImage(file.mediaType)) {
						throw new ProtocolError(
							`Cannot transform ${file.mediaType} - only images supported`,
						);
					}

					if (!quiet) {
						spinner.text = "Applying transforms...";
					}

					outputData = await transformImage(file.data, transformOpts);
					outputMimeType = getTransformMimeType(file.mediaType, transformOpts);

					// Cache the transformed result
					if (!cacheDisabled) {
						const ext = getExtension(outputMimeType);
						await writeTransformCache(outpoint, transformHash, ext, outputData);
					}
				}

				// Determine output path
				let outputPath = options.output as string | undefined;
				if (!outputPath) {
					if (file.filename && !hasTransforms) {
						outputPath = file.filename;
					} else {
						const ext = getExtension(outputMimeType);
						const suffix = hasTransforms ? `_${transformHash}` : "";
						outputPath = `${txid}_${vout}${suffix}${ext}`;
					}
				}

				// Ensure output directory exists
				const dir = dirname(outputPath);
				if (dir && dir !== ".") {
					await mkdir(dir, { recursive: true });
				}

				// Write file
				await writeFile(outputPath, outputData);

				if (!quiet) {
					spinner.succeed(chalk.green(outputPath));

					// Show details
					const details = [
						chalk.dim("Protocol: ") + protocolColor(file.protocol),
						chalk.dim("Type: ") + chalk.white(outputMimeType || "unknown"),
						chalk.dim("Size: ") + chalk.green(formatBytes(outputData.length)),
					];

					if (totalChunks > 1) {
						details.push(
							chalk.dim("Chunks: ") + chalk.cyan(totalChunks.toString()),
						);
					}

					if (hasTransforms) {
						details.push(
							chalk.dim("Transform: ") + chalk.yellow(transformHash),
						);
					}

					console.log(chalk.dim("  └─ ") + details.join(chalk.dim(" │ ")));
				}
			} catch (err) {
				const message = formatError(err);
				if (!(cliOptions.quiet as boolean)) {
					spinner.fail(chalk.red(message));
				} else {
					console.error("Error:", message);
				}
				process.exit(1);
			}
		},
	);

// Cache subcommand
program
	.command("cache")
	.description("Manage the txex cache")
	.option("--stats", "Show cache statistics")
	.option("--clear", "Clear all cached data")
	.action(async (options: { stats?: boolean; clear?: boolean }) => {
		if (options.clear) {
			await clearCache();
			console.log(chalk.green("✓"), "Cache cleared");
			return;
		}

		if (options.stats) {
			const stats = await getCacheStats();
			console.log(chalk.cyan.bold("\nCache Statistics\n"));
			console.log(chalk.dim("Transactions:"));
			console.log(`  Files: ${chalk.white(stats.txFiles)}`);
			console.log(`  Size:  ${chalk.green(formatBytes(stats.txSize))}`);
			console.log(chalk.dim("\nTransformed:"));
			console.log(`  Files: ${chalk.white(stats.transformFiles)}`);
			console.log(`  Size:  ${chalk.green(formatBytes(stats.transformSize))}`);
			console.log();
			return;
		}

		// Default: show stats
		const stats = await getCacheStats();
		console.log(
			`Cache: ${stats.txFiles} txs (${formatBytes(stats.txSize)}), ` +
				`${stats.transformFiles} transforms (${formatBytes(stats.transformSize)})`,
		);
	});

program.parse();
