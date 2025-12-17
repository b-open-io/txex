/**
 * Image/Video Transformation Module
 * Cloudinary-style API for on-the-fly transforms
 */

import { createHash } from "node:crypto";
import { encode } from "blurhash";
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
		"image/svg+xml",
	];
	return supported.includes(mediaType.toLowerCase());
}

/**
 * Check if media type is an SVG
 */
export function isSvg(mediaType?: string): boolean {
	return mediaType?.toLowerCase() === "image/svg+xml";
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
	inputMediaType?: string,
): Promise<Uint8Array> {
	// For SVGs, set a default density for crisp rasterization
	const sharpOptions = isSvg(inputMediaType) ? { density: 150 } : {};
	let pipeline = sharp(data, sharpOptions);

	// Resize
	if (options.width || options.height) {
		pipeline = pipeline.resize({
			width: options.width,
			height: options.height,
			fit: options.fit ?? "cover",
			withoutEnlargement: !isSvg(inputMediaType), // SVGs can be upscaled
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

	// Output format - SVGs must be converted to a raster format
	const quality = options.quality ?? 80;
	const needsRasterFormat = isSvg(inputMediaType) && !options.format;
	const format = needsRasterFormat ? "png" : options.format;

	switch (format) {
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
		// Default: keep original format (except SVG which needs raster)
	}

	const result = await pipeline.toBuffer();
	return new Uint8Array(result);
}

/**
 * Get output MIME type based on transform options
 */
/**
 * Extract dominant color from image
 * Returns hex color string (e.g., "#ff5733")
 */
export async function getDominantColor(data: Uint8Array): Promise<string> {
	// Resize to 1x1 pixel to get average/dominant color
	const { data: pixels } = await sharp(data)
		.resize(1, 1, { fit: "cover" })
		.raw()
		.toBuffer({ resolveWithObject: true });

	const r = pixels[0];
	const g = pixels[1];
	const b = pixels[2];

	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Extract color palette from image
 * Returns array of hex color strings
 */
export async function getColorPalette(
	data: Uint8Array,
	count = 5,
): Promise<string[]> {
	// Resize to small grid to sample colors
	const gridSize = Math.ceil(Math.sqrt(count * 4)); // oversample
	const { data: pixels } = await sharp(data)
		.resize(gridSize, gridSize, { fit: "cover" })
		.raw()
		.toBuffer({ resolveWithObject: true });

	// Collect unique-ish colors
	const colors: Map<string, number> = new Map();
	for (let i = 0; i < pixels.length; i += 3) {
		// Quantize to reduce similar colors
		const r = Math.round(pixels[i] / 32) * 32;
		const g = Math.round(pixels[i + 1] / 32) * 32;
		const b = Math.round(pixels[i + 2] / 32) * 32;
		const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
		colors.set(hex, (colors.get(hex) ?? 0) + 1);
	}

	// Sort by frequency and take top N
	const sorted = [...colors.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, count)
		.map(([hex]) => hex);

	return sorted;
}

/**
 * Generate BlurHash for an image
 * Returns a compact string that can be decoded to a blurred placeholder
 */
export async function generateBlurHash(
	data: Uint8Array,
	componentX = 4,
	componentY = 3,
): Promise<string> {
	// Resize to small dimensions for faster processing
	const size = 32;
	const { data: pixels, info } = await sharp(data)
		.resize(size, size, { fit: "inside" })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	// BlurHash expects RGBA data
	return encode(
		new Uint8ClampedArray(pixels),
		info.width,
		info.height,
		componentX,
		componentY,
	);
}

export function getTransformMimeType(
	originalType: string | undefined,
	options: TransformOptions,
): string {
	const formatMap: Record<string, string> = {
		webp: "image/webp",
		avif: "image/avif",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
	};

	if (options.format) {
		return (
			formatMap[options.format] ?? originalType ?? "application/octet-stream"
		);
	}

	// SVGs without explicit format convert to PNG
	if (isSvg(originalType)) {
		return "image/png";
	}

	return originalType ?? "application/octet-stream";
}
