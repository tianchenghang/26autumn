import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { log, logError } from "../logger.js";
import { TEMPLATE_IMPORT_REGEX_GLOBAL } from "../model/constants.js";

export class ViewFileCache {
  private readonly swiftyRoots: readonly string[];
  private readonly htmlToTs = new Map<string, string>();
  private readonly tsToHtml = new Map<string, string>();
  private readonly fallbackCache = new Map<string, string | null>();

  constructor(swiftyRoots: readonly string[]) {
    this.swiftyRoots = swiftyRoots;
  }

  async scanWorkspace(): Promise<void> {
    for (const root of this.swiftyRoots) {
      const srcPath = path.join(root, "src");
      try {
        await fs.access(srcPath);
      } catch {
        log(`src/ directory not found in ${root}, skipping`);
        continue;
      }
      await this.scanDirectory(srcPath);
    }
    log(
      `Workspace scan complete: ${String(this.tsToHtml.size)} view file pairs indexed across ${String(this.swiftyRoots.length)} root(s)`,
    );
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        await this.scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (ext === ".ts" || ext === ".js") {
          await this.indexTsFile(fullPath);
        }
      }
    }
  }

  async indexTsFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      this.indexTsContent(content, filePath);
    } catch (e) {
      logError(`Failed to read view file for indexing: ${filePath}`, e);
    }
  }

  indexTsContent(content: string, filePath: string): void {
    const oldHtml = this.tsToHtml.get(filePath);
    if (oldHtml !== undefined) {
      this.htmlToTs.delete(oldHtml);
      this.tsToHtml.delete(filePath);
    }

    const htmlPath = this.extractTemplateImport(content, filePath);
    if (htmlPath !== null) {
      this.addMapping(filePath, htmlPath);
    } else {
      const sameNameHtml = filePath.replace(/\.(ts|js)$/, ".html");
      if (fsSync.existsSync(sameNameHtml)) {
        this.addMapping(filePath, sameNameHtml);
      }
    }
  }

  private extractTemplateImport(
    content: string,
    tsFilePath: string,
  ): string | null {
    TEMPLATE_IMPORT_REGEX_GLOBAL.lastIndex = 0;
    const match = TEMPLATE_IMPORT_REGEX_GLOBAL.exec(content);
    if (match?.[1] !== undefined) {
      const importPath = match[1];
      return path.resolve(path.dirname(tsFilePath), importPath);
    }
    return null;
  }

  private addMapping(tsFilePath: string, htmlFilePath: string): void {
    this.htmlToTs.set(htmlFilePath, tsFilePath);
    this.tsToHtml.set(tsFilePath, htmlFilePath);
  }

  removeFile(filePath: string): void {
    const ext = path.extname(filePath);
    if (ext === ".ts" || ext === ".js") {
      const html = this.tsToHtml.get(filePath);
      if (html !== undefined) {
        this.htmlToTs.delete(html);
        this.fallbackCache.delete(html);
      }
      this.tsToHtml.delete(filePath);
    } else if (ext === ".html") {
      const ts = this.htmlToTs.get(filePath);
      if (ts !== undefined) {
        this.tsToHtml.delete(ts);
      }
      this.htmlToTs.delete(filePath);
      this.fallbackCache.delete(filePath);
    }
  }

  getTsForHtml(htmlPath: string): string | undefined {
    const mapped = this.htmlToTs.get(htmlPath);
    if (mapped !== undefined) {
      return mapped;
    }

    if (this.fallbackCache.has(htmlPath)) {
      const cached = this.fallbackCache.get(htmlPath);
      return cached === null ? undefined : cached;
    }

    const tsPath = htmlPath.replace(/\.html$/, ".ts");
    if (fsSync.existsSync(tsPath)) {
      this.fallbackCache.set(htmlPath, tsPath);
      return tsPath;
    }
    const jsPath = htmlPath.replace(/\.html$/, ".js");
    if (fsSync.existsSync(jsPath)) {
      this.fallbackCache.set(htmlPath, jsPath);
      return jsPath;
    }

    this.fallbackCache.set(htmlPath, null);
    return undefined;
  }

  findRootForFile(filePath: string): string | undefined {
    for (const root of this.swiftyRoots) {
      if (filePath.startsWith(root + path.sep) || filePath === root) {
        return root;
      }
    }
    return undefined;
  }
}
