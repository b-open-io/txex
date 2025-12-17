/**
 * Video Transformation Module
 * Uses ffmpeg for video processing
 */

import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface VideoTransformOptions {
	/** Output width in pixels */
	width?: number;
	/** Output height in pixels */
	height?: number;
	/** Output format */
	format?: "mp4" | "webm" | "gif" | "mov";
	/** Quality (crf) - lower is better, 18-28 typical */
	quality?: number;
	/** Extract frame at timestamp (e.g., "00:00:01" or "5" for 5 seconds) */
	thumbnail?: string;
	/** Thumbnail format */
	thumbnailFormat?: "jpg" | "png" | "webp";
	/** Start time for trim */
	start?: string;
	/** Duration for trim */
	duration?: string;
	/** Resize fit mode */
	fit?: "cover" | "contain";
	/** Strip audio */
	noAudio?: boolean;
	/** Frames per second */
	fps?: number;
}

export interface AudioTransformOptions {
	/** Output format */
	format?: "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a";
	/** Bitrate (e.g., "128k", "320k") */
	bitrate?: string;
	/** Sample rate (e.g., 44100, 48000) */
	sampleRate?: number;
	/** Number of channels (1 = mono, 2 = stereo) */
	channels?: number;
	/** Start time for trim */
	start?: string;
	/** Duration for trim */
	duration?: string;
	/** Normalize volume */
	normalize?: boolean;
}

let ffmpegChecked = false;
let ffmpegAvailable = false;

/**
 * Check if ffmpeg is installed
 */
export async function checkFfmpeg(): Promise<boolean> {
	if (ffmpegChecked) return ffmpegAvailable;

	try {
		await execAsync("ffmpeg -version");
		ffmpegChecked = true;
		ffmpegAvailable = true;
		return true;
	} catch {
		ffmpegChecked = true;
		ffmpegAvailable = false;
		return false;
	}
}

/**
 * Check if media type is a video that can be transformed
 */
export function isTransformableVideo(mediaType?: string): boolean {
	if (!mediaType) return false;
	const supported = [
		"video/mp4",
		"video/webm",
		"video/quicktime",
		"video/x-msvideo",
		"video/x-matroska",
		"video/ogg",
		"video/mpeg",
	];
	return supported.includes(mediaType.toLowerCase());
}

/**
 * Check if media type is audio
 */
export function isTransformableAudio(mediaType?: string): boolean {
	if (!mediaType) return false;
	const supported = [
		"audio/mpeg",
		"audio/mp3",
		"audio/wav",
		"audio/ogg",
		"audio/flac",
		"audio/aac",
		"audio/webm",
	];
	return supported.includes(mediaType.toLowerCase());
}

/**
 * Generate a hash of video transform options for cache key
 */
export function hashVideoTransformOptions(
	options: VideoTransformOptions,
): string {
	const normalized = JSON.stringify(options, Object.keys(options).sort());
	return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Generate a hash of audio transform options for cache key
 */
export function hashAudioTransformOptions(
	options: AudioTransformOptions,
): string {
	const normalized = JSON.stringify(options, Object.keys(options).sort());
	return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Get file extension for format
 */
function getExtension(format: string): string {
	const map: Record<string, string> = {
		mp4: "mp4",
		webm: "webm",
		gif: "gif",
		mov: "mov",
		jpg: "jpg",
		png: "png",
		webp: "webp",
	};
	return map[format] || format;
}

/**
 * Build ffmpeg filter string for scaling
 */
function buildScaleFilter(options: VideoTransformOptions): string {
	if (!options.width && !options.height) return "";

	const w = options.width ?? -2;
	const h = options.height ?? -2;

	if (options.fit === "contain") {
		// Scale to fit within dimensions, maintaining aspect ratio
		return `scale='min(${w === -2 ? "iw" : w},iw)':'min(${h === -2 ? "ih" : h},ih)':force_original_aspect_ratio=decrease`;
	}

	// Default cover: scale and crop to fill dimensions
	if (options.width && options.height) {
		return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${options.width}:${options.height}`;
	}

	// Single dimension: scale proportionally
	return `scale=${w}:${h}`;
}

/**
 * Transform video using ffmpeg
 */
export async function transformVideo(
	data: Uint8Array,
	options: VideoTransformOptions,
	inputFormat?: string,
): Promise<Uint8Array> {
	const available = await checkFfmpeg();
	if (!available) {
		throw new Error(
			"ffmpeg not found. Install ffmpeg to use video transforms: https://ffmpeg.org/download.html",
		);
	}

	// Create temp directory
	const tempDir = join(tmpdir(), "txex-video");
	await mkdir(tempDir, { recursive: true });

	const inputExt = inputFormat?.split("/")[1] || "mp4";
	const inputPath = join(tempDir, `input-${Date.now()}.${inputExt}`);

	// Determine output format
	let outputExt: string;
	if (options.thumbnail) {
		outputExt = getExtension(options.thumbnailFormat || "jpg");
	} else {
		outputExt = getExtension(options.format || inputExt);
	}
	const outputPath = join(tempDir, `output-${Date.now()}.${outputExt}`);

	try {
		// Write input file
		await writeFile(inputPath, data);

		// Build ffmpeg command
		const args: string[] = ["-y", "-i", inputPath];

		// Thumbnail extraction
		if (options.thumbnail) {
			args.push("-ss", options.thumbnail);
			args.push("-vframes", "1");

			// Scale filter for thumbnail
			const scale = buildScaleFilter(options);
			if (scale) {
				args.push("-vf", scale);
			}

			args.push(outputPath);
		} else {
			// Video processing
			const filters: string[] = [];

			// Scale filter
			const scale = buildScaleFilter(options);
			if (scale) {
				filters.push(scale);
			}

			// FPS filter
			if (options.fps) {
				filters.push(`fps=${options.fps}`);
			}

			// Apply filters
			if (filters.length > 0) {
				args.push("-vf", filters.join(","));
			}

			// Trim options
			if (options.start) {
				args.push("-ss", options.start);
			}
			if (options.duration) {
				args.push("-t", options.duration);
			}

			// Quality (CRF) - map 1-100 quality to CRF (lower CRF = better quality)
			// VP9: 0-63, H264: 0-51, default to 23 (good quality)
			if (options.quality) {
				// Convert 1-100 to CRF: 100 quality = CRF 18, 1 quality = CRF 51
				const crf = Math.round(51 - (options.quality / 100) * 33);
				args.push("-crf", crf.toString());
			}

			// No audio
			if (options.noAudio) {
				args.push("-an");
			}

			// Format-specific options
			if (options.format === "webm") {
				args.push("-c:v", "libvpx-vp9", "-c:a", "libopus");
			} else if (options.format === "gif") {
				// GIF needs special handling
				args.push("-loop", "0");
			} else if (options.format === "mp4" || !options.format) {
				args.push(
					"-c:v",
					"libx264",
					"-preset",
					"fast",
					"-movflags",
					"+faststart",
				);
			}

			args.push(outputPath);
		}

		// Run ffmpeg
		const cmd = `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
		await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 }); // 100MB buffer

		// Read output
		const result = await readFile(outputPath);
		return new Uint8Array(result);
	} finally {
		// Cleanup temp files
		try {
			await unlink(inputPath);
		} catch {}
		try {
			await unlink(outputPath);
		} catch {}
	}
}

/**
 * Get output MIME type based on transform options
 */
export function getVideoTransformMimeType(
	originalType: string | undefined,
	options: VideoTransformOptions,
): string {
	if (options.thumbnail) {
		const formatMap: Record<string, string> = {
			jpg: "image/jpeg",
			png: "image/png",
			webp: "image/webp",
		};
		return formatMap[options.thumbnailFormat || "jpg"] || "image/jpeg";
	}

	if (options.format) {
		const formatMap: Record<string, string> = {
			mp4: "video/mp4",
			webm: "video/webm",
			gif: "image/gif",
			mov: "video/quicktime",
		};
		return formatMap[options.format] || originalType || "video/mp4";
	}

	return originalType || "video/mp4";
}

/**
 * Transform audio using ffmpeg
 */
export async function transformAudio(
	data: Uint8Array,
	options: AudioTransformOptions,
	inputFormat?: string,
): Promise<Uint8Array> {
	const available = await checkFfmpeg();
	if (!available) {
		throw new Error(
			"ffmpeg not found. Install ffmpeg to use audio transforms: https://ffmpeg.org/download.html",
		);
	}

	// Create temp directory
	const tempDir = join(tmpdir(), "txex-audio");
	await mkdir(tempDir, { recursive: true });

	const inputExt = inputFormat?.split("/")[1]?.replace("mpeg", "mp3") || "mp3";
	const inputPath = join(tempDir, `input-${Date.now()}.${inputExt}`);
	const outputExt = options.format || inputExt;
	const outputPath = join(tempDir, `output-${Date.now()}.${outputExt}`);

	try {
		// Write input file
		await writeFile(inputPath, data);

		// Build ffmpeg command
		const args: string[] = ["-y", "-i", inputPath];

		// Trim options
		if (options.start) {
			args.push("-ss", options.start);
		}
		if (options.duration) {
			args.push("-t", options.duration);
		}

		// Bitrate
		if (options.bitrate) {
			args.push("-b:a", options.bitrate);
		}

		// Sample rate
		if (options.sampleRate) {
			args.push("-ar", options.sampleRate.toString());
		}

		// Channels
		if (options.channels) {
			args.push("-ac", options.channels.toString());
		}

		// Normalize volume
		if (options.normalize) {
			args.push("-af", "loudnorm");
		}

		// Format-specific codecs
		if (options.format === "mp3") {
			args.push("-c:a", "libmp3lame");
		} else if (options.format === "ogg") {
			args.push("-c:a", "libvorbis");
		} else if (options.format === "flac") {
			args.push("-c:a", "flac");
		} else if (options.format === "aac" || options.format === "m4a") {
			args.push("-c:a", "aac");
		}

		args.push(outputPath);

		// Run ffmpeg
		const cmd = `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
		await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });

		// Read output
		const result = await readFile(outputPath);
		return new Uint8Array(result);
	} finally {
		// Cleanup temp files
		try {
			await unlink(inputPath);
		} catch {}
		try {
			await unlink(outputPath);
		} catch {}
	}
}

/**
 * Get output MIME type for audio transforms
 */
export function getAudioTransformMimeType(
	originalType: string | undefined,
	options: AudioTransformOptions,
): string {
	if (options.format) {
		const formatMap: Record<string, string> = {
			mp3: "audio/mpeg",
			wav: "audio/wav",
			ogg: "audio/ogg",
			flac: "audio/flac",
			aac: "audio/aac",
			m4a: "audio/mp4",
		};
		return formatMap[options.format] || originalType || "audio/mpeg";
	}
	return originalType || "audio/mpeg";
}
