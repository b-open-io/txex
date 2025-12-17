# txex

Transaction File Extractor - Extract and transform files from BSV transactions.

![Demo](demo.gif)

## Features

- **Multi-protocol support**: B://, BCAT (chunked), 1Sat Ordinals, ORDFS Streams
- **Ordinal chain tracking**: Follow ordinals across spends for streaming content
- **Parallel fetching**: Concurrent chunk downloads with configurable concurrency
- **Image transforms**: Cloudinary-style resize, crop, format conversion
- **Smart caching**: Two-tier cache for raw transactions and transformed outputs
- **Config file**: Set defaults via `.txexrc` or `txex.config.json`
- **Beautiful CLI**: Colorized output with progress spinners

## Installation

```bash
# Global install with bun
bun add -g txex

# Or with npm
npm install -g txex
```

## CLI Usage

### Basic Extraction

```bash
# Extract from outpoint (txid_vout)
txex <outpoint> [-o output.mp4]

# Examples
txex abc123...def456_0                    # Auto-detect filename/extension
txex abc123...def456_0 -o my_file.mp4     # Custom output path
txex abc123...def456 -q                   # Quiet mode
txex abc123...def456 -c 10                # 10 parallel chunk fetches
```

### Collections

```bash
# Download entire collection (auto-detected)
txex <collection_outpoint>

# Limit number of items
txex <collection_outpoint> --limit 50

# Custom output directory
txex <collection_outpoint> -o ./my-collection
```

### Image Transforms

```bash
# Resize to width
txex <outpoint> -w 800 -o thumb.webp

# Resize with format conversion
txex <outpoint> -w 400 -h 400 -f webp --fit cover

# Grayscale thumbnail
txex <outpoint> -w 200 --grayscale -f png

# Blur for placeholder
txex <outpoint> -w 100 --blur 10 -f webp -q 60

# Full transform example
txex <outpoint> -w 1200 -h 630 --fit cover -f webp -q 85 -o og-image.webp
```

### Transform Options

| Option | Short | Description |
|--------|-------|-------------|
| `--width <px>` | `-w` | Resize width |
| `--height <px>` | `-h` | Resize height |
| `--format <fmt>` | `-f` | Output format: `webp`, `avif`, `png`, `jpg` |
| `--fit <mode>` | | Resize fit: `cover`, `contain`, `fill`, `inside` |
| `--quality <n>` | | Output quality 1-100 (default: 80) |
| `--blur <radius>` | | Blur radius 0.3-1000 |
| `--grayscale` | | Convert to grayscale |
| `--rotate <deg>` | | Rotate degrees |
| `--flip` | | Flip vertically |
| `--flop` | | Flip horizontally |

### Cache Management

```bash
# Show cache stats
txex cache --stats

# Clear all cached data
txex cache --clear
```

## Config File

Create `.txexrc` or `txex.config.json` in your project or home directory:

```json
{
  "concurrency": 10,
  "transform": {
    "format": "webp",
    "quality": 85
  }
}
```

## Library Usage

```typescript
import { extract, extractData, transformImage } from "txex";

// Get full file info
const file = await extract("abc123...def456_0");
console.log(file.protocol);   // "bcat" | "b" | "ord" | "stream"
console.log(file.mediaType);  // "video/mp4"
console.log(file.data);       // Uint8Array
console.log(file.chunks);     // Number of chunks (for BCAT/stream)

// Get raw data only
const data = await extractData("abc123...def456_0");

// Transform an image
const transformed = await transformImage(data, {
  width: 800,
  format: "webp",
  quality: 85,
});
```

### Ordinal Chain Tracking

```typescript
import {
  getNextOrdinalOutpoint,
  findOrigin,
  streamContent
} from "txex";

// Find the origin of an ordinal
const origin = await findOrigin({ txid: "abc123...", vout: 0 });

// Get next outpoint in chain (follows spends)
const next = await getNextOrdinalOutpoint({ txid: "abc123...", vout: 0 });

// Stream content chunks (async generator)
for await (const chunk of streamContent({ txid: "abc123...", vout: 0 })) {
  console.log(chunk.mediaType, chunk.data.length);
}
```

## Supported Protocols

| Protocol | Prefix | Description |
|----------|--------|-------------|
| **B://** | `19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut` | Single transaction files |
| **BCAT** | `15DHFxWZJT58f9nhyGnsRBqrgwK4W6h4Up` | Chunked files (large media) |
| **Ordinals** | `OP_FALSE OP_IF "ord"...` | 1Sat inscriptions |
| **ORDFS Stream** | `ordfs/stream` content type | Streaming content across ordinal transfers |

## Caching

txex uses a two-tier caching system:

1. **Transaction cache**: Raw tx hex stored in `~/.txex/cache/tx/`
2. **Transform cache**: Processed images stored in `~/.txex/cache/transformed/`

Transform cache keys include a hash of transform options, so different transforms are cached separately.

```bash
# First run - fetches from network
txex abc123_0 -w 800 -f webp    # ~2.5s

# Second run - instant from cache
txex abc123_0 -w 800 -f webp    # ~0.05s

# Different transform - separate cache entry
txex abc123_0 -w 400 -f png     # ~0.3s (tx cached, transform new)
```

## Performance

- **Parallel fetching**: BCAT chunks fetched concurrently (default: 5)
- **Smart caching**: Transactions cached to disk, transforms cached separately
- **Efficient transforms**: Uses sharp for native-speed image processing

## License

MIT
