import * as vscode from "vscode";
import { log } from "../logger.js";

/**
 * Disables VS Code's built-in CSS validation for the current workspace.
 *
 * Swifty HTML templates use interpolation syntax like {{=variable}} inside
 * style="" attributes (e.g. `style="padding-top:{{=topPad}}px"`).
 * VS Code's CSS language server treats these as invalid CSS, producing
 * errors such as:
 *   - "Empty rule-set" (css(emptyRules))
 *   - "Identifier expected" (css(css-identifierexpected))
 *   - "} expected" (css(css-rcurlyexpected))
 *
 * Setting css.validate to false at workspace level suppresses these
 * false-positive diagnostics.
 */
export async function disableCssValidation(): Promise<void> {
  const config = vscode.workspace.getConfiguration("css");
  const current = config.get<boolean>("validate");

  if (current === false) {
    log("CSS validation already disabled in workspace settings");
    return;
  }

  try {
    await config.update(
      "validate",
      false,
      vscode.ConfigurationTarget.Workspace,
    );
    log(
      "CSS validation disabled in workspace settings for Swifty template compatibility",
    );
  } catch {
    log(
      "Failed to update css.validate setting (workspace may not have .vscode directory)",
    );
  }
}
