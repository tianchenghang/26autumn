# swifty-vscode

A lightweight VS Code utility extension providing image hover previews, an "Open in GitHub" command, and configurable status bar shortcuts.

## Features

### Image Hover Preview

Hovering over an image path in any file displays an inline preview. Works in all projects and all languages.

Supported formats: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.ico`

Supported path types:

- Absolute URLs: `https://example.com/logo.png`
- Relative paths: `./assets/icon.png`

### Open in GitHub

Opens the current file or directory in the browser on GitHub. Reads the git remote URL (SSH and HTTPS formats supported) and current branch to construct the correct `blob` or `tree` link.

Available from the editor and explorer context menus.

### Status Bar Shortcuts

Configurable shortcut buttons in the status bar. Clicking a button opens its URL in the default browser. Buttons update in real time when configuration changes.

## Configuration

### swifty.statusBar.shortcuts

Type: `Array<{ name: string; url: string }>`
Default: `[]`

Example (`settings.json`):

```json
{
  "swifty.statusBar.shortcuts": [
    { "name": "Wiki", "url": "https://wiki.example.com" },
    { "name": "CI/CD", "url": "https://ci.example.com" }
  ]
}
```

## Development

```bash
pnpm install
pnpm build       # Build once
pnpm watch       # Watch mode
pnpm lint        # Type-check
pnpm package     # Package .vsix
pnpm code        # Install locally
```

## License

MIT
