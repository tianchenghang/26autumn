# Changelog

## [Unreleased]

### Fixed

- **Critical: globalThis pollution breaking other extensions' command registration**

  The extension injected a DOM shim into `globalThis` at load time, which polluted the shared Extension Host process and caused other extensions (e.g. Claude Code) to fail to activate, resulting in `command not found` errors for commands such as `claude-code.insertAtMentioned` and `claude-vscode.editor.openLast`.

  #### Root Cause Analysis

  VS Code extensions run inside a shared Node.js process called the Extension Host. All extensions installed in the same window share the same JavaScript runtime, including the `globalThis` object. This is a fundamental constraint of the VS Code extension architecture.

  The `tsup.config.ts` build configuration contained a `banner` block that injected a DOM shim script at the top of the bundled output (`dist/extension.cjs`). This shim unconditionally assigned fake DOM objects to `globalThis` whenever the module was loaded:

  ```js
  if (typeof document === "undefined") {
    globalThis.document = _doc; // fake document object
    globalThis.window = globalThis; // alias window to globalThis
    globalThis.Element = function Element() {};
    globalThis.HTMLElement = Element;
    globalThis.navigator = { userAgent: "" };
  }
  ```

  This was originally added to satisfy a transitive dependency (`@swifty.js/mvc`) that expected a browser environment. However, `@swifty.js/mvc` was never actually imported at runtime — it only appeared as a string literal in project detection logic and generated code output. The shim was entirely unnecessary.

  #### Impact

  Many VS Code extensions use feature detection to determine their runtime environment. A common pattern is:

  ```js
  if (typeof document === "undefined") {
    // Node.js environment — extension host
  } else {
    // Browser environment — webview or web
  }
  ```

  Once swifty-vscode loaded and set `globalThis.document` to a fake object, every subsequent extension that performed this check would incorrectly conclude it was running in a browser context. The affected extension would then attempt to call browser APIs on the fake DOM stubs, which silently failed or threw errors during activation. The extension's `activate()` function would not complete successfully, and none of its commands would be registered.

  This made the failure non-obvious: the affected extension appeared in the extension list without errors, but its commands were simply missing. The error only surfaced when the user triggered a keybinding bound to an unregistered command.

  #### Resolution
  - Removed the entire `domShim` banner from `tsup.config.ts`
  - Removed `@swifty.js/mvc` from the `noExternal` bundling list, as it was never imported
  - Verified the build output (`dist/extension.cjs`) no longer contains any `globalThis` DOM assignments

  #### Additional Fix: Synchronous Extension Host Blocking

  The `activate()` function used `execSync` to run `git ls-files`, which blocked the Extension Host thread synchronously for up to 5 seconds (the configured timeout). In large workspaces with many `package.json` files, each followed by a synchronous `readFileSync` and `JSON.parse`, the total blocking time could be significant. During this window, no other extension could activate or respond to user input.

  This was resolved by:
  - Replacing `execSync` with the asynchronous `exec` from `node:child_process`
  - Converting `findSwiftyRoots()` to return a `Promise`
  - Converting `activate()` to `async`, awaiting the project detection

  This ensures the Extension Host event loop remains responsive during activation.
