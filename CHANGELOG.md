# Changelog

## [0.0.3] - 2025-12-16

### Added
- **Collection support**: Auto-detect and download entire 1Sat Ordinal collections
  - Pass a collection outpoint and all items download in parallel
  - Progress bar UI shows download status
  - `--limit` flag to cap number of items
- **Origin lookup**: Automatically trace marketplace listings to their origin inscription
- **ORDFS Stream protocol**: Follow ordinal chains for streaming content (`ordfs/stream`)
- **JungleBus provider**: Primary transaction provider with WhatsOnChain fallback

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
