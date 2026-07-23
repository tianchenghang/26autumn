import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".bmp",
  ".ico",
]);

const IMAGE_PATH_REGEX = /['"]([^'"]*\.(png|jpe?g|gif|svg|webp|bmp|ico))['"]/i;

export class ImageHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position, IMAGE_PATH_REGEX);
    if (range === undefined) {
      return null;
    }

    const text = document.getText(range);
    const match = IMAGE_PATH_REGEX.exec(text);
    if (match === null || match[1] === undefined) {
      return null;
    }

    const imagePath = match[1];

    // Handle absolute URLs
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      const markdown = new vscode.MarkdownString(
        `![preview](${imagePath}|width=200)`,
      );
      markdown.supportHtml = true;
      return new vscode.Hover(markdown, range);
    }

    // Handle relative paths
    const documentDir = path.dirname(document.fileName);
    const resolvedPath = path.resolve(documentDir, imagePath);

    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return null;
    }

    const fileUri = vscode.Uri.file(resolvedPath);
    const markdown = new vscode.MarkdownString(
      `![preview](${fileUri.toString()}|width=200)`,
    );
    markdown.supportHtml = true;

    return new vscode.Hover(markdown, range);
  }
}
