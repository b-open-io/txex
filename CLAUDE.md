---
description: txex - Transaction File Extractor CLI
globs: "*.ts, *.tsx, package.json"
alwaysApply: true
---

# txex

Transaction File Extractor - Extract and transform files from BSV transactions.

## Commands

```bash
bun dev           # Run CLI in development
bun run build     # Typecheck
bun run lint      # Biome check
bun run lint:fix  # Auto-fix linting
bun test          # Run tests
```

## Updating the Demo GIF

The demo GIF in the README is generated using [VHS](https://github.com/charmbracelet/vhs) by Charmbracelet.

### Prerequisites

```bash
# Install VHS (macOS)
brew install vhs

# VHS requires ffmpeg
brew install ffmpeg
```

### Recording

1. Edit `demo.tape` to update the demo script
2. Run VHS to record:
   ```bash
   cd /Users/satchmo/code/txex
   vhs demo.tape
   ```
3. This generates `demo.gif` in the project root
4. Commit the updated GIF

### Demo Tape Syntax

```tape
Output demo.gif           # Output filename
Set FontSize 14           # Terminal font size
Set Width 1000            # Terminal width in pixels
Set Height 600            # Terminal height in pixels
Set Theme "Catppuccin Mocha"  # Terminal theme
Set TypingSpeed 40ms      # Typing animation speed

Type "command"            # Type text
Enter                     # Press enter
Sleep 2s                  # Wait for command to complete
```

## Architecture

- `src/cli.ts` - Commander CLI entry point
- `src/extract.ts` - Main extraction logic
- `src/protocols/` - Protocol parsers (B://, BCAT, Ordinals)
- `src/providers/` - Data providers (WhatsOnChain)
- `src/transform.ts` - Sharp-based image transforms
- `src/cache.ts` - Two-tier caching (tx + transforms)
- `src/config.ts` - Config file support (.txexrc)

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
