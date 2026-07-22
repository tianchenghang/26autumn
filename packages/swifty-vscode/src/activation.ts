import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { log, logError } from "./logger.js";

const BUNDLER_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
  "webpack.config.ts",
  "webpack.config.js",
  "webpack.config.mjs",
] as const;
const BUNDLER_KEYWORDS = ["swiftyMvcPlugin", "swiftyMvcLoader"] as const;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
  ".next",
  ".nuxt",
  ".vite",
  ".cache",
  ".turbo",
  ".nx",
  ".pnpm-store",
  ".yarn",
]);

export async function findSwiftyRoots(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const packageJsonPaths = await findAllPackageJsons(workspaceRoot);
  log(`Found ${String(packageJsonPaths.length)} package.json file(s)`);

  const swiftyRoots: string[] = [];
  for (const pkgPath of packageJsonPaths) {
    const dir = path.dirname(pkgPath);
    if (await isSwiftyProject(dir)) {
      log(`Swifty project found: ${dir}`);
      swiftyRoots.push(dir);
    }
  }

  return swiftyRoots;
}

function findAllPackageJsons(
  workspaceRoot: string,
): Promise<readonly string[]> {
  return new Promise((resolve) => {
    exec(
      'git ls-files --cached --others --exclude-standard -- "package.json" "**/package.json"',
      { cwd: workspaceRoot, encoding: "utf-8", timeout: 5000 },
      (error, stdout) => {
        if (error !== null) {
          log("git ls-files failed, falling back to manual scan");
          void scanForPackageJsons(workspaceRoot).then(resolve);
          return;
        }
        const output = stdout.trim();
        if (output.length === 0) {
          resolve([]);
          return;
        }
        resolve(output.split("\n").map((rel) => path.join(workspaceRoot, rel)));
      },
    );
  });
}

async function scanForPackageJsons(dir: string): Promise<readonly string[]> {
  const results: string[] = [];
  await scanDirectory(dir, results, 0);
  return results;
}

async function scanDirectory(
  dir: string,
  out: string[],
  depth: number,
): Promise<void> {
  if (depth > 5) {
    return;
  }

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name === "package.json") {
      out.push(path.join(dir, entry.name));
    } else if (
      entry.isDirectory() &&
      !SKIP_DIRS.has(entry.name) &&
      !entry.name.startsWith(".")
    ) {
      await scanDirectory(path.join(dir, entry.name), out, depth + 1);
    }
  }
}

async function isSwiftyProject(dir: string): Promise<boolean> {
  const packageJsonPath = path.join(dir, "package.json");

  try {
    await fs.access(packageJsonPath);
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg: unknown = JSON.parse(content);
    if (hasSwiftyDependency(pkg)) {
      return true;
    }
  } catch {
    // package.json doesn't exist or can't be read, fall through to bundler check
  }

  return hasBundlerConfig(dir);
}

function hasSwiftyDependency(pkg: unknown): boolean {
  if (typeof pkg !== "object" || pkg === null) {
    return false;
  }

  const record = pkg as Record<string, unknown>;
  const deps = record["dependencies"];
  const devDeps = record["devDependencies"];

  if (
    isRecordWithKey(deps, "@swifty.js/mvc") ||
    isRecordWithKey(devDeps, "@swifty.js/mvc")
  ) {
    return true;
  }

  return false;
}

function isRecordWithKey(
  value: unknown,
  key: string,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

async function hasBundlerConfig(dir: string): Promise<boolean> {
  for (const configFile of BUNDLER_CONFIG_FILES) {
    const configPath = path.join(dir, configFile);
    try {
      await fs.access(configPath);
      const content = await fs.readFile(configPath, "utf-8");
      for (const keyword of BUNDLER_KEYWORDS) {
        if (content.includes(keyword)) {
          return true;
        }
      }
    } catch {
      continue;
    }
  }
  return false;
}

export function setSwiftyContext(isSwifty: boolean): void {
  void vscode.commands.executeCommand(
    "setContext",
    "vs-swifty:isSwifty",
    isSwifty || undefined,
  );
}
