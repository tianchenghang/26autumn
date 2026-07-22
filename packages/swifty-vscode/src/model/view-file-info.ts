import type { MethodInfo } from "./method-info.js";

export interface ViewFileInfo {
  readonly filePath: string;
  readonly methods: readonly MethodInfo[];
  readonly mtime: number;
}
