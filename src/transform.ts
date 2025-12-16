/**
 * Image/Video Transformation Module
 * Cloudinary-style API for on-the-fly transforms
 */

import { createHash } from "node:crypto";
import sharp from "sharp";

export interface TransformOptions {
	/** Output width in pixels */
	width?: number;
	/** Output height in pixels */
	height?: number;
	/** Resize fit mode */
	fit?: "cover" | "contain" | "fill" | "inside" | "outside";
	/** Output format */
	format?: "webp" | "avif" | "png" | "jpg" | "jpeg";
	/** Quality 1-100 */
	quality?: number;
	/** Blur radius (0.3-1000) */
	blur?: number;
	/** Grayscale */
	grayscale?: boolean;
	/** Rotate degrees */
	rotate?: number;
	/** Flip vertically */
	flip?: boolean;
	/** Flop horizontally */
	flop?: boolean;
}

/**
 * Check if media type is an image that can be transformed
 */
export function isTransformableImage(mediaType?: string): boolean {
	if (!mediaType) return false;
	const supported = [
		"image/png",
		"image/jpeg",
		"image/jpg",
		"image/webp",
		"image/avif",
		"image/gif",
		"image/tiff",
	];
	return supported.includes(mediaType.toLowerCase());
}

/**
 * Generate a hash of transform options for cache key
 */
export function hashTransformOptions(options: TransformOptions): string {
	const normalized = JSON.stringify(options, Object.keys(options).sort());
	return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Transform image data using sharp
 */
export async function transformImage(
	data: Uint8Array,
	options: TransformOptions,
): Promise<Uint8Array> {
	let pipeline = sharp(data);

	// Resize
	if (options.width || options.height) {
		pipeline = pipeline.resize({
			width: options.width,
			height: options.height,
			fit: options.fit ?? "cover",
			withoutEnlargement: true,
		});
	}

	// Rotate
	if (options.rotate) {
		pipeline = pipeline.rotate(options.rotate);
	}

	// Flip/Flop
	if (options.flip) {
		pipeline = pipeline.flip();
	}
	if (options.flop) {
		pipeline = pipeline.flop();
	}

	// Grayscale
	if (options.grayscale) {
		pipeline = pipeline.grayscale();
	}

	// Blur
	if (options.blur) {
		pipeline = pipeline.blur(options.blur);
	}

	// Output format
	const quality = options.quality ?? 80;
	switch (options.format) {
		case "webp":
			pipeline = pipeline.webp({ quality });
			break;
		case "avif":
			pipeline = pipeline.avif({ quality });
			break;
		case "png":
			pipeline = pipeline.png({ quality });
			break;
		case "jpg":
		case "jpeg":
			pipeline = pipeline.jpeg({ quality });
			break;
		// Default: keep original format
	}

	const result = await pipeline.toBuffer();
	return new Uint8Array(result);
}

/**
 * Get output MIME type based on transform options
 */
export function getTransformMimeType(
	originalType: string | undefined,
	options: TransformOptions,
): string {
	if (options.format) {
		const formatMap: Record<string, string> = {
			webp: "image/webp",
			avif: "image/avif",
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
		};
		return (
			formatMap[options.format] ?? originalType ?? "application/octet-stream"
		);
	}
	return originalType ?? "application/octet-stream";
}
