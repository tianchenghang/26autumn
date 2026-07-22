import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { ViewFileCache } from "../cache/view-file-cache.js";
import type { ViewMethodCache } from "../cache/view-method-cache.js";
import { analyzeTemplate } from "../analyzer/template-analyzer.js";
import { log, logError } from "../logger.js";
import { TEMPLATE_IMPORT_REGEX } from "../model/constants.js";

export class SwiftyDefinitionProvider implements vscode.DefinitionProvider {
  private readonly viewFileCache: ViewFileCache;
  private readonly viewMethodCache: ViewMethodCache;

  constructor(viewFileCache: ViewFileCache, viewMethodCache: ViewMethodCache) {
    this.viewFileCache = viewFileCache;
    this.viewMethodCache = viewMethodCache;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location | null> {
    const line = document.lineAt(position).text;
    const languageId = document.languageId;

    if (languageId === "html") {
      return this.provideHtmlDefinition(document, position, line);
    }

    if (languageId === "typescript" || languageId === "javascript") {
      return this.provideTsDefinition(document, position, line);
    }

    return null;
  }

  private async provideHtmlDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    line: string,
  ): Promise<vscode.Location | null> {
    const vSwiftyResult = await this.resolveVSwifty(document, line, position);
    if (vSwiftyResult !== null) {
      return vSwiftyResult;
    }

    const eventResult = await this.resolveEventHandler(
      document,
      position,
      line,
    );
    if (eventResult !== null) {
      return eventResult;
    }

    return null;
  }

  private async resolveVSwifty(
    document: vscode.TextDocument,
    line: string,
    position: vscode.Position,
  ): Promise<vscode.Location | null> {
    const analysis = await analyzeTemplate(line);
    if (analysis.viewRefs.length === 0) {
      return null;
    }

    for (const ref of analysis.viewRefs) {
      const valueStart = line.indexOf(ref.path);
      if (valueStart === -1) continue;
      const valueEnd = valueStart + ref.path.length;

      if (position.character < valueStart || position.character > valueEnd) {
        continue;
      }

      const root = this.viewFileCache.findRootForFile(document.fileName);
      if (root === undefined) {
        return null;
      }

      log(`v-swifty definition: resolving "${ref.path}" from root ${root}`);
      const srcDir = path.join(root, "src");

      for (const ext of [".ts", ".js", ".html"]) {
        const candidate = path.join(srcDir, ref.path + ext);
        if (await fileExists(candidate)) {
          return new vscode.Location(
            vscode.Uri.file(candidate),
            new vscode.Position(0, 0),
          );
        }
      }
    }

    return null;
  }

  private async resolveEventHandler(
    document: vscode.TextDocument,
    position: vscode.Position,
    line: string,
  ): Promise<vscode.Location | null> {
    const analysis = await analyzeTemplate(line);
    if (analysis.events.length === 0) {
      return null;
    }

    for (const event of analysis.events) {
      const handlerStart = line.indexOf(
        event.handlerName,
        line.indexOf(`@${event.eventType}`),
      );
      if (handlerStart === -1) continue;
      const handlerEnd = handlerStart + event.handlerName.length;

      if (
        position.character < handlerStart ||
        position.character > handlerEnd
      ) {
        continue;
      }

      const tsPath = this.viewFileCache.getTsForHtml(document.fileName);
      if (tsPath === undefined) {
        return null;
      }

      const viewInfo = await this.viewMethodCache.resolve(tsPath);
      if (viewInfo === null) {
        return null;
      }

      const candidates = [
        `${event.handlerName}<${event.eventType}>`,
        event.handlerName,
      ];
      log(
        `Event handler definition: resolving "${event.handlerName}" for @${event.eventType}`,
      );

      for (const candidate of candidates) {
        const method = viewInfo.methods.find((m) => m.name === candidate);
        if (method !== undefined) {
          return this.createLocationFromOffset(tsPath, method.byteOffset);
        }
      }
    }

    return null;
  }

  private async provideTsDefinition(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    line: string,
  ): Promise<vscode.Location | null> {
    const importMatch = TEMPLATE_IMPORT_REGEX.exec(line);
    if (importMatch?.[1] !== undefined) {
      const importPath = importMatch[1];
      const resolved = path.resolve(
        path.dirname(_document.fileName),
        importPath,
      );
      if (await fileExists(resolved)) {
        return new vscode.Location(
          vscode.Uri.file(resolved),
          new vscode.Position(0, 0),
        );
      }
    }

    return null;
  }

  private async createLocationFromOffset(
    filePath: string,
    byteOffset: number,
  ): Promise<vscode.Location> {
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      const charOffset = byteOffsetToCharOffset(doc.getText(), byteOffset);
      let line = 0;
      let col = 0;
      const text = doc.getText();
      for (let i = 0; i < charOffset && i < text.length; i++) {
        if (text[i] === "\n") {
          line++;
          col = 0;
        } else {
          col++;
        }
      }
      return new vscode.Location(doc.uri, new vscode.Position(line, col));
    } catch (e) {
      logError(`Failed to create location from offset for ${filePath}`, e);
      return new vscode.Location(
        vscode.Uri.file(filePath),
        new vscode.Position(0, 0),
      );
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function byteOffsetToCharOffset(content: string, byteOffset: number): number {
  const encoder = new TextEncoder();
  let bytes = 0;
  for (let i = 0; i < content.length; i++) {
    if (bytes >= byteOffset) return i;
    const code = content.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return content.length;
}
