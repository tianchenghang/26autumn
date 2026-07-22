import * as vscode from "vscode";
import * as path from "node:path";
import type { ViewFileCache } from "../cache/view-file-cache.js";

export function registerCopyViewPathCommand(
  context: vscode.ExtensionContext,
  viewFileCache: ViewFileCache,
): void {
  const command = vscode.commands.registerCommand(
    "swifty.copyViewPath",
    (uri?: vscode.Uri) => {
      const filePath =
        uri?.fsPath ?? vscode.window.activeTextEditor?.document.fileName;
      if (filePath === undefined) {
        return;
      }

      const root = viewFileCache.findRootForFile(filePath);
      if (root === undefined) {
        return;
      }

      const viewPath = toViewPath(filePath, root);
      if (viewPath !== null) {
        void vscode.env.clipboard.writeText(viewPath);
        void vscode.window.showInformationMessage(
          `Copied view path: ${viewPath}`,
        );
      }
    },
  );

  context.subscriptions.push(command);
}

export function toViewPath(filePath: string, rootPath: string): string | null {
  const srcPrefix = path.join(rootPath, "src") + path.sep;
  if (!filePath.startsWith(srcPrefix)) {
    return null;
  }

  const relativePath = filePath.slice(srcPrefix.length);
  const ext = path.extname(relativePath);
  const withoutExt = relativePath.slice(0, relativePath.length - ext.length);

  return withoutExt.split(path.sep).join("/");
}
