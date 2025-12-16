#!/usr/bin/env bun
/**
 * txex CLI - Transaction File Extractor
 *
 * Extract files from BSV transactions
 * Supports: B://, BCAT (chunked), 1Sat Ordinals
 */

import { Command } from "commander";
import { extract, parseOutpoint } from "./extract.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, basename } from "node:path";

const program = new Command();

program
  .name("txex")
  .description("Extract files from BSV transactions")
  .version("0.1.0");

program
  .argument("<outpoint>", "Transaction outpoint (txid_vout or just txid for vout 0)")
  .option("-o, --output <path>", "Output file path")
  .option("-v, --verbose", "Verbose output")
  .action(async (outpoint: string, options: { output?: string; verbose?: boolean }) => {
    try {
      const { txid, vout } = parseOutpoint(outpoint);

      if (options.verbose) {
        console.log(`Extracting from: ${txid}_${vout}`);
      }

      const file = await extract(outpoint, {
        onProgress: (current, total) => {
          if (options.verbose) {
            process.stdout.write(`\rProgress: ${current}/${total}`);
          }
        },
      });

      if (options.verbose) {
        console.log(`\nProtocol: ${file.protocol}`);
        console.log(`Media type: ${file.mediaType || "unknown"}`);
        console.log(`Size: ${file.data.length} bytes`);
      }

      // Determine output path
      let outputPath = options.output;
      if (!outputPath) {
        // Use filename from metadata or generate from txid
        if (file.filename) {
          outputPath = file.filename;
        } else {
          // Generate extension from media type
          const ext = getExtension(file.mediaType);
          outputPath = `${txid}_${vout}${ext}`;
        }
      }

      // Ensure output directory exists
      const dir = dirname(outputPath);
      if (dir && dir !== ".") {
        await mkdir(dir, { recursive: true });
      }

      // Write file
      await writeFile(outputPath, file.data);
      console.log(`Wrote ${file.data.length} bytes to ${outputPath}`);

    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

/**
 * Get file extension from MIME type
 */
function getExtension(mediaType?: string): string {
  if (!mediaType) return "";

  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "text/plain": ".txt",
    "text/html": ".html",
    "application/json": ".json",
    "application/pdf": ".pdf",
  };

  return map[mediaType] || "";
}

program.parse();
