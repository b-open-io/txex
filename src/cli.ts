#!/usr/bin/env bun

/**
 * txex CLI - Transaction File Extractor
 *
 * Extract files from BSV transactions with optional transforms
 * Supports: B://, BCAT (chunked), 1Sat Ordinals
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
import {
	type CollectionItem,
	checkIfCollection,
	fetchCollectionItems,
} from "./collection.js";
import { loadConfig, mergeWithConfig } from "./config.js";
import {
	ChunkNotFoundError,
	NetworkError,
	OutputNotFoundError,
	ProtocolError,
} from "./errors.js";
import { detectProtocol, extract, parseOutpoint } from "./extract.js";
import { findOrigin } from "./ordinal.js";
import { fetchTx } from "./providers/junglebus.js";
import {
	generateBlurHash,
	getColorPalette,
	getDominantColor,
	getTransformMimeType,
	hashTransformOptions,
	isTransformableImage,
	type TransformOptions,
	transformImage,
} from "./transform.js";
import {
	type AudioTransformOptions,
	checkFfmpeg,
	getAudioTransformMimeType,
	getVideoTransformMimeType,
	hashAudioTransformOptions,
	hashVideoTransformOptions,
	isTransformableAudio,
	isTransformableVideo,
	transformAudio,
	transformVideo,
	type VideoTransformOptions,
} from "./video.js";

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
		case "stream":
			return chalk.cyan("STREAM");
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

// Handle collection download
async function handleCollection(
	collectionId: string,
	collectionName: string | undefined,
	options: {
		output?: string;
		concurrency: number;
		limit?: number;
		quiet: boolean;
	},
): Promise<void> {
	const outputDir = options.output ?? `./${collectionName ?? "collection"}`;

	// Ensure output directory exists
	await mkdir(outputDir, { recursive: true });

	if (!options.quiet) {
		console.log(chalk.cyan.bold("\nCollection Detected\n"));
		if (collectionName) {
			console.log(chalk.dim("Name:  "), chalk.white(collectionName));
		}
		console.log(chalk.dim("Output:"), chalk.white(resolve(outputDir)));
		console.log();
	}

	// Fetch collection items
	const spinner = ora({
		text: "Fetching collection items...",
		color: "cyan",
	});
	if (!options.quiet) spinner.start();

	let items: CollectionItem[];
	try {
		items = await fetchCollectionItems(collectionId, {
			limit: options.limit,
			onProgress: (count) => {
				if (!options.quiet) {
					spinner.text = `Found ${count} items...`;
				}
			},
		});
	} catch (err) {
		if (!options.quiet) spinner.fail("Failed to fetch collection");
		console.error(chalk.red((err as Error).message));
		process.exit(1);
	}

	if (items.length === 0) {
		if (!options.quiet) spinner.fail("No items found in collection");
		process.exit(1);
	}

	if (!options.quiet) {
		spinner.succeed(`Found ${chalk.cyan(items.length)} items`);
		console.log();
	}

	// Download items in parallel
	let completed = 0;
	let failed = 0;
	const total = items.length;

	const updateProgress = () => {
		if (!options.quiet) {
			const pct = Math.round((completed / total) * 100);
			const bar =
				"█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
			process.stdout.write(
				`\r${chalk.cyan(bar)} ${chalk.white(`${completed}/${total}`)} ` +
					`${chalk.green(`✓${completed - failed}`)} ` +
					`${failed > 0 ? chalk.red(`✗${failed}`) : ""}`,
			);
		}
	};

	const downloadItem = async (item: CollectionItem, index: number) => {
		try {
			const file = await extract(item.outpoint, { concurrency: 1 });
			const ext = getExtension(file.mediaType);
			const baseName = item.name
				? item.name.replace(/[^a-zA-Z0-9_-]/g, "_")
				: "item";
			const filename = `${String(index).padStart(4, "0")}_${baseName}${ext}`;
			const filepath = join(outputDir, filename);
			await writeFile(filepath, file.data);
			completed++;
		} catch {
			completed++;
			failed++;
		}
		updateProgress();
	};

	// Process in batches for concurrency
	const queue = [...items];
	const inFlight: Promise<void>[] = [];

	while (queue.length > 0 || inFlight.length > 0) {
		while (inFlight.length < options.concurrency && queue.length > 0) {
			const item = queue.shift()!;
			const index = items.indexOf(item);
			const promise = downloadItem(item, index).finally(() => {
				const idx = inFlight.indexOf(promise);
				if (idx > -1) inFlight.splice(idx, 1);
			});
			inFlight.push(promise);
		}

		if (inFlight.length > 0) {
			await Promise.race(inFlight);
		}
	}

	if (!options.quiet) {
		console.log("\n");
		if (failed > 0) {
			console.log(
				chalk.yellow("⚠"),
				`Downloaded ${completed - failed}/${total} items`,
				chalk.dim(`(${failed} failed)`),
			);
		} else {
			console.log(chalk.green("✓"), `Downloaded all ${total} items`);
		}
		console.log(chalk.dim("  → ") + chalk.underline.cyan(resolve(outputDir)));
	}
}

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
	.option("-l, --limit <n>", "Max items for collections (default: all)")
	.option("-q, --quiet", "Suppress all output except errors")
	// Transform options
	.option("-w, --width <px>", "Resize width")
	.option("-h, --height <px>", "Resize height")
	.option("-f, --format <fmt>", "Output format (webp, avif, png, jpg)")
	.option("--fit <mode>", "Resize fit (cover, contain, fill, inside)", "cover")
	.option("--position <pos>", "Crop position (center, top, bottom, left, right, entropy, attention)")
	.option("--quality <n>", "Output quality 1-100", "80")
	.option("--blur <radius>", "Blur radius (0.3-1000)")
	.option("--grayscale", "Convert to grayscale")
	.option("--rotate <deg>", "Rotate degrees")
	.option("--flip", "Flip vertically")
	.option("--flop", "Flip horizontally")
	// Video-specific options
	.option(
		"--thumbnail <time>",
		"Extract frame at timestamp (e.g., 00:00:05 or 5)",
	)
	.option(
		"--thumbnail-format <fmt>",
		"Thumbnail format (jpg, png, webp)",
		"jpg",
	)
	.option("--start <time>", "Trim start time")
	.option("--duration <time>", "Trim duration")
	.option("--fps <n>", "Output frames per second")
	.option("--no-audio", "Strip audio from video")
	// Audio-specific options
	.option("--bitrate <rate>", "Audio bitrate (e.g., 128k, 320k)")
	.option("--sample-rate <hz>", "Audio sample rate (e.g., 44100, 48000)")
	.option("--channels <n>", "Audio channels (1=mono, 2=stereo)")
	.option("--normalize", "Normalize audio volume")
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

				// Auto-detect if this is a collection
				const collectionInfo = await checkIfCollection(outpoint);
				if (collectionInfo.isCollection) {
					const limit = options.limit
						? Number.parseInt(options.limit as string, 10)
						: undefined;
					await handleCollection(outpoint, collectionInfo.name, {
						output: options.output as string | undefined,
						concurrency,
						limit,
						quiet,
					});
					return;
				}

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

				// Only include fit/quality/position if there's a resize or format conversion
				const hasTransforms = Object.keys(transformOpts).length > 0;
				if (hasTransforms) {
					if (options.fit && options.fit !== "cover")
						transformOpts.fit = options.fit as TransformOptions["fit"];
					if (options.position)
						transformOpts.position = options.position as TransformOptions["position"];
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

						const absolutePath = resolve(outputPath);
						await writeFile(absolutePath, cached);

						if (!quiet) {
							console.log(
								chalk.green("✓"),
								chalk.green("Extracted"),
								chalk.dim("(cached)"),
							);
							console.log(
								chalk.dim("  → ") + chalk.underline.cyan(absolutePath),
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

				// Build video transform options
				const videoOpts: VideoTransformOptions = {};
				if (options.width)
					videoOpts.width = Number.parseInt(options.width as string, 10);
				if (options.height)
					videoOpts.height = Number.parseInt(options.height as string, 10);
				if (options.thumbnail)
					videoOpts.thumbnail = options.thumbnail as string;
				if (options.thumbnailFormat)
					videoOpts.thumbnailFormat =
						options.thumbnailFormat as VideoTransformOptions["thumbnailFormat"];
				if (options.start) videoOpts.start = options.start as string;
				if (options.duration) videoOpts.duration = options.duration as string;
				if (options.fps)
					videoOpts.fps = Number.parseInt(options.fps as string, 10);
				if (options.audio === false) videoOpts.noAudio = true;
				if (
					options.format &&
					["mp4", "webm", "gif", "mov"].includes(options.format as string)
				)
					videoOpts.format = options.format as VideoTransformOptions["format"];
				// Only pass quality to video if explicitly set (not the default "80")
				if (options.quality && options.quality !== "80")
					videoOpts.quality = Number.parseInt(options.quality as string, 10);
				if (options.fit)
					videoOpts.fit = options.fit as VideoTransformOptions["fit"];

				// Build audio transform options
				const audioOpts: AudioTransformOptions = {};
				if (options.start) audioOpts.start = options.start as string;
				if (options.duration) audioOpts.duration = options.duration as string;
				if (options.bitrate) audioOpts.bitrate = options.bitrate as string;
				if (options.sampleRate)
					audioOpts.sampleRate = Number.parseInt(
						options.sampleRate as string,
						10,
					);
				if (options.channels)
					audioOpts.channels = Number.parseInt(options.channels as string, 10);
				if (options.normalize) audioOpts.normalize = true;
				if (
					options.format &&
					["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(
						options.format as string,
					)
				)
					audioOpts.format = options.format as AudioTransformOptions["format"];

				const hasVideoTransforms = Object.keys(videoOpts).length > 0;
				const hasAudioTransforms = Object.keys(audioOpts).length > 0;
				const isVideo = isTransformableVideo(file.mediaType);
				const isAudio = isTransformableAudio(file.mediaType);
				const isImage = isTransformableImage(file.mediaType);

				// Apply transforms based on media type
				if (hasTransforms || hasVideoTransforms || hasAudioTransforms) {
					if (isAudio && hasAudioTransforms) {
						// Audio transforms via ffmpeg
						const ffmpegOk = await checkFfmpeg();
						if (!ffmpegOk) {
							throw new ProtocolError(
								"ffmpeg not found. Install ffmpeg for audio transforms: https://ffmpeg.org/download.html",
							);
						}

						if (!quiet) {
							spinner.text = "Applying audio transforms...";
						}

						outputData = await transformAudio(
							file.data,
							audioOpts,
							file.mediaType,
						);
						outputMimeType = getAudioTransformMimeType(
							file.mediaType,
							audioOpts,
						);

						// Cache the transformed result
						if (!cacheDisabled) {
							const audioHash = hashAudioTransformOptions(audioOpts);
							const ext = getExtension(outputMimeType);
							await writeTransformCache(outpoint, audioHash, ext, outputData);
						}
					} else if (isVideo) {
						// Video transforms via ffmpeg
						const ffmpegOk = await checkFfmpeg();
						if (!ffmpegOk) {
							throw new ProtocolError(
								"ffmpeg not found. Install ffmpeg for video transforms: https://ffmpeg.org/download.html",
							);
						}

						if (!quiet) {
							spinner.text = "Applying video transforms...";
						}

						outputData = await transformVideo(
							file.data,
							videoOpts,
							file.mediaType,
						);
						outputMimeType = getVideoTransformMimeType(
							file.mediaType,
							videoOpts,
						);

						// Cache the transformed result
						if (!cacheDisabled) {
							const videoHash = hashVideoTransformOptions(videoOpts);
							const ext = getExtension(outputMimeType);
							await writeTransformCache(outpoint, videoHash, ext, outputData);
						}
					} else if (isImage && hasTransforms) {
						// Image transforms via sharp
						if (!quiet) {
							spinner.text = "Applying image transforms...";
						}

						outputData = await transformImage(file.data, transformOpts, file.mediaType);
						outputMimeType = getTransformMimeType(
							file.mediaType,
							transformOpts,
						);

						// Cache the transformed result
						if (!cacheDisabled) {
							const ext = getExtension(outputMimeType);
							await writeTransformCache(
								outpoint,
								transformHash,
								ext,
								outputData,
							);
						}
					} else {
						throw new ProtocolError(
							`Cannot transform ${file.mediaType} - unsupported media type`,
						);
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
				const absolutePath = resolve(outputPath);
				await writeFile(absolutePath, outputData);

				if (!quiet) {
					spinner.succeed(chalk.green("Extracted"));

					// Show saved path (underlined for clickability)
					console.log(chalk.dim("  → ") + chalk.underline.cyan(absolutePath));

					// Show details
					const details = [
						chalk.dim("Protocol: ") + protocolColor(file.protocol),
						chalk.dim("Type: ") + chalk.white(outputMimeType || "unknown"),
						chalk.dim("Size: ") + chalk.green(formatBytes(outputData.length)),
					];

					// Show chunks for BCAT or stream protocols
					const chunkCount = file.chunks ?? totalChunks;
					if (chunkCount > 1) {
						details.push(
							chalk.dim("Chunks: ") + chalk.cyan(chunkCount.toString()),
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

// Info subcommand
program
	.command("info")
	.description("Show metadata about a transaction without extracting")
	.argument("<outpoint>", "Transaction outpoint (txid_vout or just txid)")
	.option("--json", "Output as JSON")
	.action(async (outpoint: string, options: { json?: boolean }) => {
		const isInteractive = process.stdout.isTTY && !options.json;
		const spinner = ora({
			color: "cyan",
			spinner: "dots",
			isSilent: !isInteractive,
		});

		try {
			const { txid, vout } = parseOutpoint(outpoint);

			if (isInteractive) {
				spinner.start("Fetching transaction...");
			}

			// Fetch the transaction
			const tx = await fetchTx(txid);
			const output = tx.outputs[vout];

			if (!output) {
				throw new OutputNotFoundError(txid, vout);
			}

			// Detect protocol
			const protocol = detectProtocol(output.lockingScript);

			// Extract full file info (gets chunks, media type, etc.)
			const file = await extract(outpoint, { concurrency: 5 });

			// Check if origin differs (for ordinals)
			let origin: { txid: string; vout: number } | undefined;
			if (output.satoshis === 1) {
				const originResult = await findOrigin({ txid, vout });
				if (originResult.txid !== txid || originResult.vout !== vout) {
					origin = originResult;
				}
			}

			const info = {
				outpoint: `${txid}_${vout}`,
				protocol: file.protocol,
				mediaType: file.mediaType ?? "unknown",
				size: file.data.length,
				sizeFormatted: formatBytes(file.data.length),
				filename: file.filename,
				chunks: file.chunks,
				origin: origin ? `${origin.txid}_${origin.vout}` : undefined,
				satoshis: Number(output.satoshis),
			};

			spinner.stop();

			if (options.json) {
				console.log(JSON.stringify(info, null, 2));
				return;
			}

			console.log(chalk.cyan.bold("\nTransaction Info\n"));
			console.log(chalk.dim("Outpoint:  "), chalk.white(info.outpoint));
			console.log(chalk.dim("Protocol:  "), protocolColor(info.protocol));
			console.log(chalk.dim("Media Type:"), chalk.white(info.mediaType));
			console.log(chalk.dim("Size:      "), chalk.green(info.sizeFormatted));
			if (info.filename) {
				console.log(chalk.dim("Filename:  "), chalk.white(info.filename));
			}
			if (info.chunks && info.chunks > 1) {
				console.log(
					chalk.dim("Chunks:    "),
					chalk.cyan(info.chunks.toString()),
				);
			}
			if (info.origin) {
				console.log(chalk.dim("Origin:    "), chalk.yellow(info.origin));
			}
			console.log(
				chalk.dim("Satoshis:  "),
				chalk.white(info.satoshis.toString()),
			);
			console.log();
		} catch (err) {
			const message = formatError(err);
			if (!options.json) {
				spinner.fail(chalk.red(message));
			} else {
				console.error(JSON.stringify({ error: message }));
			}
			process.exit(1);
		}
	});

// Color subcommand
program
	.command("color")
	.description("Extract dominant color, palette, and BlurHash from an image")
	.argument("<outpoint>", "Transaction outpoint (txid_vout or just txid)")
	.option("-n, --count <n>", "Number of palette colors", "5")
	.option("--no-blurhash", "Skip BlurHash generation")
	.option("--json", "Output as JSON")
	.action(
		async (
			outpoint: string,
			options: { count?: string; blurhash?: boolean; json?: boolean },
		) => {
			const isInteractive = process.stdout.isTTY && !options.json;
			const spinner = ora({
				color: "cyan",
				spinner: "dots",
				isSilent: !isInteractive,
			});

			try {
				if (isInteractive) {
					spinner.start("Extracting colors...");
				}

				// Extract the file
				const file = await extract(outpoint, { concurrency: 5 });

				// Check if it's an image
				if (!isTransformableImage(file.mediaType)) {
					throw new ProtocolError(
						`Cannot extract colors from ${file.mediaType} - not an image`,
					);
				}

				// Get dominant color, palette, and optionally blurhash
				const includeBlurhash = options.blurhash !== false;
				const [dominant, palette, blurhash] = await Promise.all([
					getDominantColor(file.data),
					getColorPalette(file.data, Number.parseInt(options.count ?? "5", 10)),
					includeBlurhash ? generateBlurHash(file.data) : Promise.resolve(undefined),
				]);

				spinner.stop();

				if (options.json) {
					const result: Record<string, unknown> = { dominant, palette };
					if (blurhash) result.blurhash = blurhash;
					console.log(JSON.stringify(result, null, 2));
					return;
				}

				console.log(chalk.cyan.bold("\nColors\n"));
				console.log(
					chalk.dim("Dominant:"),
					chalk.hex(dominant).bold("████"),
					chalk.white(dominant),
				);
				console.log(chalk.dim("Palette: "));
				for (const color of palette) {
					console.log(
						chalk.dim("         "),
						chalk.hex(color).bold("██"),
						chalk.white(color),
					);
				}
				if (blurhash) {
					console.log(chalk.dim("BlurHash:"), chalk.white(blurhash));
				}
				console.log();
			} catch (err) {
				const message = formatError(err);
				if (!options.json) {
					spinner.fail(chalk.red(message));
				} else {
					console.error(JSON.stringify({ error: message }));
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
