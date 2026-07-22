# Swifty MVC - VS Code Extension

A VS Code extension for developers working with the Swifty MVC framework (`@swifty.js/mvc`). It provides go-to-definition, intelligent autocompletion, syntax highlighting, template folding, image hover previews, and utility commands to streamline day-to-day development.

## Table of Contents

- [Installation](#installation)
- [Activation and Project Detection](#activation-and-project-detection)
- [Features](#features)
  - [Go-to-Definition](#go-to-definition)
  - [Autocompletion](#autocompletion)
  - [Syntax Highlighting](#syntax-highlighting)
  - [Template Folding](#template-folding)
  - [Image Hover Preview](#image-hover-preview)
  - [Status Bar Shortcuts](#status-bar-shortcuts)
- [Commands](#commands)
- [Configuration](#configuration)
- [Output Logs](#output-logs)
- [Architecture](#architecture)
- [Development](#development)
- [Dependencies](#dependencies)
- [License](#license)

## Installation

Build from source and install the packaged `.vsix`:

```bash
pnpm build
pnpm package
code --install-extension swifty-vscode-0.0.1.vsix
```

Or use the included script shortcut after packaging:

```bash
pnpm code
```

## Activation and Project Detection

The extension activates when the workspace contains any `package.json` file (`workspaceContains:**/package.json`).

Once activated, it determines whether the workspace is a Swifty project through a two-step detection process:

1. **Package scan**: Uses `git ls-files` to locate all `package.json` files (falling back to a manual recursive scan up to 5 levels deep, skipping `node_modules`, `dist`, `.git`, etc.). Checks whether each `package.json` lists `@swifty.js/mvc` under `dependencies` or `devDependencies`.
2. **Bundler fallback**: If step 1 does not match, scans bundler configuration files (`vite.config.*`, `webpack.config.*`) for references to `swiftyMvcPlugin` or `swiftyMvcLoader`.

When detection succeeds the extension sets the context key `vs-swifty:isSwifty`. All Swifty-specific features (definition, completion, folding, copy view path) are gated behind this context and remain inactive in non-Swifty workspaces.

## Features

### Go-to-Definition

Cmd+Click (macOS) or Ctrl+Click (Windows/Linux) to jump to the precise source location.

In HTML templates:

- `v-swifty="components/child"` resolves to `src/components/child.ts`, `.js`, or `.html` under the detected Swifty root.
- `@click="handlerName(...)"` jumps to the method definition in the paired TypeScript file. Methods following the Swifty naming convention `"handlerName<click>"` are matched first; plain `handlerName` is used as a fallback.

In TypeScript/JavaScript files:

- `import template from "./home.html"` jumps to the referenced HTML template file.

Jump targets include exact line and column positions, computed from character offsets in the Babel AST (byte offsets are converted to character offsets for correct UTF-16 positioning).

### Autocompletion

Event type suggestions:

When you type `@` inside an HTML template, the extension offers all 22 supported DOM event types as completion items with snippet insertion:

```
click, dblclick, change, input, submit,
focus, blur, keyup, keydown, keypress,
mouseenter, mouseleave, mouseover, mouseout, mousedown,
mouseup, scroll, wheel, contextmenu, touchstart,
touchend, touchmove
```

Selecting an item inserts the full attribute pattern, e.g. `@click="$1()"`.

> Note: The `@` trigger character is currently disabled to avoid conflicting with external tool shortcuts (e.g. Claude Code's Cmd+Option+K). Completion triggers on `"` and `'` instead.

Handler method suggestions:

After typing `@eventType="`, the extension parses the paired View TypeScript file and presents all available method names. Methods that use the `<eventType>` suffix convention are displayed without the suffix for readability.

Template variable suggestions:

Inside `{{= }}`, `{{! }}`, `{{: }}`, or `{{@ }}` expressions, the extension offers variable names extracted from the template context through `@swifty.js/mvc`'s `extractGlobalVars` utility. Results are cached per document version to avoid redundant parsing.

### Syntax Highlighting

A TextMate grammar (`text.html.swifty-template`) is injected into `text.html.basic`, providing highlighting for:

- Output expressions: `{{=expr}}`, `{{!expr}}`, `{{@expr}}`, `{{:expr}}`
- Control flow: `{{if ...}}`, `{{else if ...}}`, `{{else}}`, `{{/if}}`
- Loops: `{{forOf list as item idx}}...{{/forOf}}`, `{{forIn obj as val key}}...{{/forIn}}`, `{{for(...)}}...{{/for}}`
- Assignment: `{{set var = expr}}`
- Comment blocks: `{{!-- comment --}}`
- Event binding attributes: `@click="handler()"`
- Sub-view directives: `v-swifty="path"`
- Optimization attributes: `ldk`, `lak`, `lvk`

The language configuration (`language-configuration.json`) also enables `{{` / `}}` auto-closing and bracket matching for template expressions.

### Template Folding

The extension provides folding ranges for Swifty template control-flow blocks. A stack-based algorithm correctly handles arbitrary nesting depth:

- `{{if ...}}` / `{{/if}}`
- `{{forOf ...}}` / `{{/forOf}}`
- `{{forIn ...}}` / `{{/forIn}}`
- `{{for(...)}}` / `{{/for}}`

### Image Hover Preview

Hovering over an image path in any file displays an inline preview of the image. This feature works in all projects regardless of whether the workspace is a Swifty project.

Supported formats: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.ico`

Supported path types:

- Absolute URLs: `https://example.com/logo.png`
- Relative paths: `./assets/icon.png`

### Status Bar Shortcuts

Custom shortcut buttons appear in the status bar. Clicking a shortcut opens its configured URL in the default browser. Buttons update in real time when the configuration changes.

## Commands

| Command               | Title                  | Context Menu | Condition            |
| --------------------- | ---------------------- | ------------ | -------------------- |
| `swifty.copyViewPath` | Swifty: Copy View Path | Yes          | Swifty projects only |
| `swifty.openInGithub` | Swifty: Open in GitHub | Yes          | All projects         |

Copy View Path:

Copies the current file path formatted for use in `v-swifty` directives. The transformation strips the `src/` prefix and removes the file extension:

```
src/views/home.ts           -> views/home
src/components/counter.html -> components/counter
```

Open in GitHub:

Opens the current file (or directory) in the browser on GitHub. The extension reads the git remote URL (SSH and HTTPS formats are both supported) and the current branch name to construct the correct link. Files open as `blob` links; directories open as `tree` links.

## Configuration

All settings live under the `swifty` namespace in VS Code settings.

### swifty.statusBar.shortcuts

Type: `Array<{ name: string; url: string }>`
Default: `[]`

Defines status bar shortcut buttons. Each entry must include a display `name` and a target `url`. The schema is validated at runtime with zod (`z.url()` for URL validation).

Example (`settings.json`):

```json
{
  "swifty.statusBar.shortcuts": [
    { "name": "Wiki", "url": "https://wiki.example.com" },
    { "name": "CI/CD", "url": "https://ci.example.com" }
  ]
}
```

### CSS Validation

When the extension detects a Swifty project, it automatically disables VS Code's built-in CSS validation (`css.validate: false`) at workspace level. This suppresses false-positive errors from Swifty template interpolation syntax inside `style=""` attributes (e.g. `style="padding-top:{{=topPad}}px"` triggers errors like "Empty rule-set", "Identifier expected", or "} expected" from the CSS language server).

## Output Logs

Runtime diagnostics are written to the VS Code Output panel under the channel name "Swifty vscode". To view logs:

1. Open the bottom panel (Cmd+J / Ctrl+J).
2. Switch to the Output tab.
3. Select "Swifty vscode" from the channel dropdown.

Logs include: activation status, project detection results, file index counts, file change events, Babel parser usage, definition resolution steps, and error details. Each log line is timestamped with millisecond precision (`HH:mm:ss.SSS`).

## Architecture

```
src/
  extension.ts                  Entry point (activate/deactivate)
  activation.ts                 Swifty project detection (git ls-files + fallback recursive scan)
  logger.ts                     Output channel logger ("Swifty vscode", timestamped)
  config/
    css-validation.ts           Disables CSS validation for template syntax compatibility
  model/
    constants.ts                Shared regex patterns for template import detection
    method-info.ts              MethodInfo type + parseEventMethodName()
    view-file-info.ts           ViewFileInfo type
  analyzer/
    view-analyzer.ts            Babel-based parser for View.extend() / defineView() methods
    template-analyzer.ts        Extracts events, v-swifty refs, and template variables
  cache/
    view-file-cache.ts          Bidirectional HTML <-> TS file mapping with fallback resolution
    view-method-cache.ts        LRU cache (max 500 entries) with mtime-based invalidation
  provider/
    completion-provider.ts      Event type, handler method, and template variable completions
    definition-provider.ts      Go-to-definition for v-swifty, @event, and template imports
    folding-range-provider.ts   Stack-based folding for template control-flow blocks
    hover-provider.ts           Image path hover preview (local + remote URLs)
  command/
    copy-view-path-command.ts   Copies stripped view path to clipboard
    open-in-github-command.ts   Opens file/directory in GitHub (SSH + HTTPS remotes)
  status-bar/
    status-bar-manager.ts       Configurable shortcut buttons with zod schema validation
  watcher/
    file-watcher.ts             File system watchers for cache invalidation (src/**/*.{ts,js,html})
syntaxes/
  swifty-template.tmLanguage.json TextMate grammar injection into HTML
language-configuration.json     Bracket pairs, auto-closing, and folding markers for {{ }}
```

### Key Design Decisions

- Babel (@babel/parser) is used for TypeScript/JavaScript AST parsing. The pure-JS parser avoids native binding distribution issues and works across all platforms without per-OS binaries.
- The view method cache uses an LRU eviction strategy (500 entries max) backed by `Map` insertion order and checks file `mtime` before returning cached results, ensuring stale data is never served after edits.
- The view file cache maintains a bidirectional mapping between HTML templates and their paired TypeScript/JavaScript files. Pairing is detected first by `import ... from "*.html"` statements, then by same-name co-location as a fallback. A secondary `fallbackCache` map avoids repeated `fs.existsSync` calls for files without explicit imports.
- File watchers target `src/**/*.{ts,js,html}` and invalidate relevant cache entries on create, change, and delete events.
- Template analysis results are cached per document version (`document.version`) so that repeated completions on the same unchanged document are instant.
- Project detection uses `git ls-files` for fast package.json discovery, falling back to a depth-limited recursive scan that skips common non-source directories (`node_modules`, `dist`, `.git`, `.turbo`, etc.).
- CSS validation is disabled at workspace level on activation because Swifty's `{{=variable}}` interpolation inside `style=""` attributes triggers false-positive diagnostics from VS Code's CSS language server.

## Development

Prerequisites: Node.js, pnpm

```bash
# Install dependencies
pnpm install

# Build once
pnpm build

# Watch mode (rebuild on change)
pnpm watch

# Type-check without emitting
pnpm lint

# Package .vsix for distribution
pnpm package

# Install the packaged extension locally
pnpm code
```

The build is handled by tsup (CJS format, target node18). `vscode` is external; all other dependencies (including `zod`) are bundled into the output. Packaging uses `@vscode/vsce` with `--no-dependencies` since all runtime dependencies are bundled.

## Dependencies

Runtime:

- `@babel/parser` + `@babel/types` -- AST parsing for TypeScript View files (pure JS, no native bindings)
- `@swifty.js/mvc` -- provides `extractGlobalVars` for template variable extraction
- `zod` -- runtime validation of configuration schemas (bundled via `noExternal`)

Development / Build:

- `tsup` -- bundler
- `@vscode/vsce` -- extension packaging
- `typescript` -- type checking
- `oxfmt` -- code formatter

Engine requirement: VS Code ^1.120.0

## License

MIT
