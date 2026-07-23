// @ts-check

import { execSync } from "child_process";
import { existsSync, rmSync, cpSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO = "https://github.com/hangtiancheng/h.git";
const TEMP_DIR = resolve(__dirname, "h");
const DOCS_DIR = resolve(__dirname, "docs");

try {
  // Clone first — only delete the existing docs dir after a successful
  // clone so a clone failure does not wipe the current docs.
  execSync(`git clone --depth 1 ${REPO} ${TEMP_DIR}`, { stdio: "inherit" });
  if (existsSync(DOCS_DIR)) {
    rmSync(DOCS_DIR, { recursive: true, force: true });
  }
  cpSync(join(TEMP_DIR, "docs"), DOCS_DIR, { recursive: true });
  console.log("Sync OK");
} catch (e) {
  console.error("Sync failed:", e);
  process.exit(1);
} finally {
  // Always clean up the temp clone, even on failure.
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}
