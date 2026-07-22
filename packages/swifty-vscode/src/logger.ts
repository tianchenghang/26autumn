import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

export function initLogger(): vscode.OutputChannel {
  if (channel !== null) {
    channel.dispose();
  }
  channel = vscode.window.createOutputChannel("Swifty vscode");
  return channel;
}

export function log(message: string): void {
  if (channel !== null) {
    const timestamp = new Date().toISOString().slice(11, 23);
    channel.appendLine(`[${timestamp}] ${message}`);
  }
}

export function logError(message: string, error?: unknown): void {
  if (channel !== null) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const detail =
      error instanceof Error
        ? `: ${error.message}`
        : error !== undefined
          ? `: ${String(error)}`
          : "";
    channel.appendLine(`[${timestamp}] ERROR ${message}${detail}`);
  }
}
