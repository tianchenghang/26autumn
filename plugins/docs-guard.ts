import { createCipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const MD_SUFFIX = "?swifty-docs";

export function docsGuardPlugin(): Plugin {
  const password = process.env.DOCS_PASSWORD;
  if (!password) {
    return { name: "docs-guard", enforce: "post" };
  }

  return {
    name: "docs-guard",
    enforce: "post",

    transform(code, id) {
      if (!id.includes(MD_SUFFIX)) return null;

      const filePath = id.split("?")[0].replace(/^\/@fs/, "");
      let raw: string;
      try {
        raw = readFileSync(filePath, "utf-8");
      } catch {
        return null;
      }

      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch || !/^protected:\s*true/m.test(fmMatch[1])) return null;

      const htmlMatch = code.match(
        /export const contentHtml = ("(?:[^"\\]|\\.)*");?\s*$/m,
      );
      if (!htmlMatch) return null;

      const html = JSON.parse(htmlMatch[1]) as string;
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const key = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(html, "utf-8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const payload = JSON.stringify({
        encrypted: encrypted.toString("base64"),
        authTag: authTag.toString("base64"),
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
      });

      return {
        code: code.replace(
          htmlMatch[0],
          `export const contentHtml = ${JSON.stringify(payload)};\nexport const __protected = true;`,
        ),
        map: null,
      };
    },
  };
}
