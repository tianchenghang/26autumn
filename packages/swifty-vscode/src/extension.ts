import * as vscode from "vscode";
import { findSwiftyRoots, setSwiftyContext } from "./activation.js";
import { ViewFileCache } from "./cache/view-file-cache.js";
import { ViewMethodCache } from "./cache/view-method-cache.js";
import { createFileWatchers } from "./watcher/file-watcher.js";
import { registerCopyViewPathCommand } from "./command/copy-view-path-command.js";
import { registerOpenInGithubCommand } from "./command/open-in-github-command.js";
import { SwiftyDefinitionProvider } from "./provider/definition-provider.js";
import { SwiftyCompletionProvider } from "./provider/completion-provider.js";
import { SwiftyFoldingRangeProvider } from "./provider/folding-range-provider.js";
import { SwiftyImageHoverProvider } from "./provider/hover-provider.js";
import { StatusBarManager } from "./status-bar/status-bar-manager.js";
import { disableCssValidation } from "./config/css-validation.js";
import { initLogger, log } from "./logger.js";

const HTML_SELECTOR: vscode.DocumentSelector = [
  { language: "html", scheme: "file" },
];
const TS_JS_SELECTOR: vscode.DocumentSelector = [
  { language: "typescript", scheme: "file" },
  { language: "javascript", scheme: "file" },
];
const ALL_SELECTOR: vscode.DocumentSelector = [
  ...HTML_SELECTOR,
  ...TS_JS_SELECTOR,
];

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = initLogger();
  context.subscriptions.push(outputChannel);

  log("Swifty vscode extension activating");

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    log("No workspace folders found, skipping activation");
    return;
  }

  const firstFolder = workspaceFolders[0];
  if (firstFolder === undefined) {
    return;
  }
  const workspaceRoot = firstFolder.uri.fsPath;
  log(`Workspace root: ${workspaceRoot}`);

  // Run project detection asynchronously to avoid blocking the extension host
  const swiftyRoots = await findSwiftyRoots(workspaceRoot);
  const isSwifty = swiftyRoots.length > 0;
  setSwiftyContext(isSwifty);
  log(
    isSwifty
      ? `Swifty project detected: ${String(swiftyRoots.length)} root(s) — ${swiftyRoots.join(", ")}`
      : "Swifty project detected: false",
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider("*", new SwiftyImageHoverProvider()),
  );

  if (!isSwifty) {
    log("Not a Swifty project, only image hover provider registered");
    return;
  }

  // Disable CSS validation in style="" attributes to avoid false-positive
  // errors from Swifty template interpolation syntax like {{=variable}}
  await disableCssValidation();

  const viewFileCache = new ViewFileCache(swiftyRoots);
  const viewMethodCache = new ViewMethodCache();

  await viewFileCache.scanWorkspace();

  const watchers = createFileWatchers(
    swiftyRoots,
    viewFileCache,
    viewMethodCache,
  );
  for (const w of watchers) {
    context.subscriptions.push(w);
  }

  // Commands
  registerCopyViewPathCommand(context, viewFileCache);
  registerOpenInGithubCommand(context, workspaceRoot);

  // Providers
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      ALL_SELECTOR,
      new SwiftyDefinitionProvider(viewFileCache, viewMethodCache),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      HTML_SELECTOR,
      new SwiftyCompletionProvider(viewFileCache, viewMethodCache),
      // "@", // TODO: May effect claude code's Command+Option+K
      '"',
      "'",
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      HTML_SELECTOR,
      new SwiftyFoldingRangeProvider(),
    ),
  );

  const statusBarManager = new StatusBarManager(context);
  statusBarManager.initialize();

  log("Swifty vscode extension activated successfully");
}

export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
}
