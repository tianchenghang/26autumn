import * as vscode from "vscode";
import * as path from "node:path";
import type { ViewFileCache } from "../cache/view-file-cache.js";
import type { ViewMethodCache } from "../cache/view-method-cache.js";
import { log } from "../logger.js";

export function createFileWatchers(
  swiftyRoots: readonly string[],
  viewFileCache: ViewFileCache,
  viewMethodCache: ViewMethodCache,
): vscode.Disposable[] {
  return swiftyRoots.map((root) =>
    createSingleWatcher(root, viewFileCache, viewMethodCache),
  );
}

function createSingleWatcher(
  rootPath: string,
  viewFileCache: ViewFileCache,
  viewMethodCache: ViewMethodCache,
): vscode.Disposable {
  const pattern = path.join(rootPath, "src", "**/*.{ts,js,html}");
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  log(`File watcher created for ${pattern}`);

  const onChange = (uri: vscode.Uri) => {
    const filePath = uri.fsPath;
    const ext = path.extname(filePath);

    if (ext === ".ts" || ext === ".js") {
      log(`File changed: ${filePath}`);
      viewFileCache.indexTsFile(filePath);
      viewMethodCache.remove(filePath);
    }
  };

  const onCreate = (uri: vscode.Uri) => {
    log(`File created: ${uri.fsPath}`);
    onChange(uri);
  };

  const onDelete = (uri: vscode.Uri) => {
    const filePath = uri.fsPath;
    log(`File deleted: ${filePath}`);
    viewFileCache.removeFile(filePath);
    viewMethodCache.remove(filePath);
  };

  watcher.onDidChange(onChange);
  watcher.onDidCreate(onCreate);
  watcher.onDidDelete(onDelete);

  return watcher;
}
