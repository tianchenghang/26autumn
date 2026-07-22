import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/remove.js <publisher.extension-version>");
  console.error(
    "Example: node scripts/remove.js hangtiancheng.swifty-vscode-0.1.0",
  );
  process.exit(1);
}

const extDir = join(homedir(), ".vscode", "extensions");
const entries = readdirSync(extDir).filter((e) => e.includes(name));

if (entries.length === 0) {
  console.log(`No extensions matching "${name}" found`);
  process.exit(0);
}

for (const entry of entries) {
  const target = join(extDir, entry);
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${entry}`);
}
