import * as vscode from "vscode";
import { registerOpenInGithubCommand } from "./command/open-in-github-command.js";
import { ImageHoverProvider } from "./provider/hover-provider.js";
import { StatusBarManager } from "./status-bar/status-bar-manager.js";
import { initLogger, log } from "./logger.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = initLogger();
  context.subscriptions.push(outputChannel);

  log("Extension activating");

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    log("No workspace folders found, skipping activation");
    return;
  }

  const firstFolder = workspaceFolders[0];
  if (firstFolder === undefined) {
    return;
  }
  const workspaceRoot = firstFolder.uri.fsPath;

  context.subscriptions.push(vscode.languages.registerHoverProvider("*", new ImageHoverProvider()));

  registerOpenInGithubCommand(context, workspaceRoot);

  const statusBarManager = new StatusBarManager(context);
  statusBarManager.initialize();

  log("Extension activated successfully");
}

export function deactivate(): void {}
