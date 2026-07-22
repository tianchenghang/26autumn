import * as fs from "node:fs/promises";
import { parse as babelParse } from "@babel/parser";
import type * as t from "@babel/types";
import type { MethodInfo } from "../model/method-info.js";
import type { ViewFileInfo } from "../model/view-file-info.js";
import { parseEventMethodName } from "../model/method-info.js";
import { log, logError } from "../logger.js";

export async function analyzeViewFile(
  filePath: string,
): Promise<ViewFileInfo | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (e) {
    logError(`Failed to read view file: ${filePath}`, e);
    return null;
  }

  return analyzeViewContent(content, filePath);
}

async function analyzeViewContent(
  content: string,
  filePath: string,
): Promise<ViewFileInfo | null> {
  const isTs = filePath.endsWith(".ts");

  let program: t.Program;
  try {
    log("Parsing view file with @babel/parser");
    const ast = babelParse(content, {
      sourceType: "module",
      plugins: isTs ? ["typescript"] : [],
      allowImportExportEverywhere: true,
    });
    program = ast.program;
  } catch (e) {
    logError(`Failed to parse view file: ${filePath}`, e);
    return null;
  }

  const methods: MethodInfo[] = [];

  // Find View.extend({...}) or defineView({...}) call
  const objectExpr = findViewObjectExpression(program);
  if (objectExpr === null) {
    return null;
  }

  // Extract methods from the object expression
  for (const prop of objectExpr.properties) {
    if (prop.type === "SpreadElement") {
      continue;
    }
    // After filtering SpreadElement, prop is ObjectProperty | ObjectMethod
    const methodInfo = extractMethodFromProperty(
      prop as t.ObjectProperty | t.ObjectMethod,
    );
    if (methodInfo !== null) {
      methods.push(methodInfo);
    }
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (e) {
    logError(`Failed to stat view file: ${filePath}`, e);
    return null;
  }

  return {
    filePath,
    methods,
    mtime: stat.mtimeMs,
  };
}

function findViewObjectExpression(
  program: t.Program,
): t.ObjectExpression | null {
  for (const item of program.body) {
    let expr: t.Expression | null = null;

    // Babel uses ExportDefaultDeclaration.
    // The .declaration can be a FunctionDeclaration, ClassDeclaration, or Expression.
    if (item.type === "ExportDefaultDeclaration") {
      const decl = item.declaration;
      if (
        decl.type !== "FunctionDeclaration" &&
        decl.type !== "ClassDeclaration"
      ) {
        expr = decl as t.Expression;
      }
    } else if (
      item.type === "ExpressionStatement" &&
      item.expression.type === "AssignmentExpression"
    ) {
      expr = item.expression.right;
    }

    if (expr === null) {
      continue;
    }

    const result = extractObjectFromExpr(expr);
    if (result !== null) {
      return result;
    }
  }

  // Also check variable declarations with export
  for (const item of program.body) {
    if (item.type === "VariableDeclaration") {
      for (const decl of item.declarations) {
        if (decl.init !== undefined && decl.init !== null) {
          const result = extractObjectFromExpr(decl.init);
          if (result !== null) {
            return result;
          }
        }
      }
    }
  }

  return null;
}

function extractObjectFromExpr(expr: t.Expression): t.ObjectExpression | null {
  if (expr.type !== "CallExpression") {
    return null;
  }

  const call = expr as t.CallExpression;

  if (isExtendOrDefineViewCall(call) && call.arguments.length > 0) {
    const firstArg = call.arguments[0];
    if (
      firstArg !== undefined &&
      firstArg.type !== "SpreadElement" &&
      firstArg.type !== "ArgumentPlaceholder" &&
      firstArg.type === "ObjectExpression"
    ) {
      return firstArg;
    }
  }

  return null;
}

function isExtendOrDefineViewCall(call: t.CallExpression): boolean {
  // defineView({...})
  if (call.callee.type === "Identifier" && call.callee.name === "defineView") {
    return true;
  }

  // View.extend({...}) or SomeName.extend({...})
  if (
    call.callee.type === "MemberExpression" &&
    call.callee.property.type === "Identifier" &&
    !call.callee.computed &&
    call.callee.property.name === "extend"
  ) {
    return true;
  }

  return false;
}

function extractMethodFromProperty(
  prop: t.ObjectProperty | t.ObjectMethod,
): MethodInfo | null {
  if (prop.type === "ObjectProperty") {
    const key = getPropertyKeyString(prop.key);
    if (key === null) {
      return null;
    }

    // Check if value is a function
    if (
      prop.value.type === "FunctionExpression" ||
      prop.value.type === "ArrowFunctionExpression"
    ) {
      return createMethodInfo(key, prop.key);
    }
    return null;
  }

  // prop.type === "ObjectMethod"
  const key = getPropertyKeyString(prop.key);
  if (key === null) {
    return null;
  }
  return createMethodInfo(key, prop.key);
}

function getPropertyKeyString(
  key: t.Expression | t.PrivateName,
): string | null {
  if (key.type === "Identifier") {
    return key.name;
  }
  if (key.type === "StringLiteral") {
    return key.value;
  }
  return null;
}

function createMethodInfo(
  rawName: string,
  keyNode: { start?: number | null },
): MethodInfo {
  const { eventType } = parseEventMethodName(rawName);
  return {
    name: rawName,
    eventType,
    byteOffset: keyNode.start ?? 0,
  };
}
