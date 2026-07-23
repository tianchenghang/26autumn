import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

export function initLogger(): vscode.OutputChannel {
  if (channel !== null) {
    channel.dispose();
  }
  channel = vscode.window.createOutputChannel("swifty-vscode");
  return channel;
}

export function log(message: string): void {
  if (channel !== null) {
    const timestamp = new Date().toISOString().slice(11, 23);
    channel.appendLine(`[${timestamp}] ${message}`);
  }
}
