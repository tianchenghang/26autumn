import * as fs from "node:fs/promises";
import { analyzeViewFile } from "../analyzer/view-analyzer.js";
import type { ViewFileInfo } from "../model/view-file-info.js";

const MAX_CACHE_SIZE = 500;

export class ViewMethodCache {
  // Map preserves insertion order — delete + set gives O(1) LRU
  private readonly cache = new Map<string, ViewFileInfo>();

  async resolve(filePath: string): Promise<ViewFileInfo | null> {
    const cached = this.cache.get(filePath);
    if (cached !== undefined) {
      // Touch: move to end (most recently used)
      this.cache.delete(filePath);
      this.cache.set(filePath, cached);

      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs === cached.mtime) {
          return cached;
        }
      } catch {
        // stat failed, reparse
      }
    }

    const info = await analyzeViewFile(filePath);
    if (info !== null) {
      this.set(filePath, info);
    }
    return info;
  }

  set(filePath: string, info: ViewFileInfo): void {
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(filePath)) {
      this.evict();
    }
    this.cache.delete(filePath);
    this.cache.set(filePath, info);
  }

  remove(filePath: string): void {
    this.cache.delete(filePath);
  }

  private evict(): void {
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) {
      this.cache.delete(oldest);
    }
  }
}
