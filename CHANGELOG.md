# Changelog

## [0.0.4] - 2025-12-16

### Added
- **Audio transforms**: Format conversion (mp3/wav/ogg/flac/aac/m4a), bitrate, sample rate, channels, trim, normalize
- **`txex info` command**: Metadata inspection without extraction (protocol, media type, size, origin)
- **`txex color` command**: Extract dominant color, palette, and BlurHash from images
- **SVG rasterization**: SVGs auto-convert to PNG with 150 DPI density
- **Position/gravity for crops**: `--position` flag (center, top, entropy, attention, etc.)
- **StorageProvider interface**: Pluggable storage backends (Redis, S3, Cloudflare KV, etc.)
- **MemoryStorage**: In-memory storage for testing/ephemeral use

### Changed
- Removed WhatsOnChain fallback - JungleBus only
- Consolidated providers into single junglebus.ts module

## [0.0.3] - 2025-12-16

### Added
- **Collection support**: Auto-detect and download entire 1Sat Ordinal collections
  - Pass a collection outpoint and all items download in parallel
  - Progress bar UI shows download status
  - `--limit` flag to cap number of items
- **Origin lookup**: Automatically trace marketplace listings to their origin inscription
- **ORDFS Stream protocol**: Follow ordinal chains for streaming content (`ordfs/stream`)
- **JungleBus provider**: Transaction data provider

### Changed
- CLI output now shows clickable absolute file paths
- Improved progress UI for chunked downloads

## [0.0.2] - 2025-12-16

### Added
- Image transforms via sharp (resize, crop, format conversion, blur, grayscale, rotate, flip)
- Transform caching with content-addressed keys
- Config file support (`.txexrc` or `txex.config.json`)
- Parallel chunk fetching with configurable concurrency

### Changed
- Unified two-tier caching system (transactions + transforms)

## [0.0.1] - 2025-12-16

### Added
- Initial release
- B://, BCAT, and 1Sat Ordinals protocol support
- Basic CLI for extraction
- Transaction caching
