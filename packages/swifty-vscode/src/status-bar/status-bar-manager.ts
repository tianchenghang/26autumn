import * as vscode from "vscode";
import { z } from "zod";

const ShortcutSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
});

const ShortcutListSchema = z.array(ShortcutSchema);

type Shortcut = z.infer<typeof ShortcutSchema>;

export class StatusBarManager {
  private readonly context: vscode.ExtensionContext;
  private readonly items: vscode.StatusBarItem[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  initialize(): void {
    this.refresh();

    // Listen for configuration changes
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("swifty.statusBar.shortcuts")) {
          this.refresh();
        }
      }),
    );
  }

  private refresh(): void {
    this.disposeItems();

    const config = vscode.workspace.getConfiguration("swifty");
    const raw: unknown = config.get("statusBar.shortcuts");

    const result = ShortcutListSchema.safeParse(raw);
    if (!result.success) {
      return;
    }

    for (const shortcut of result.data) {
      this.createStatusBarItem(shortcut);
    }
  }

  private createStatusBarItem(shortcut: Shortcut): void {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    item.text = `$(link-external) ${shortcut.name}`;
    item.tooltip = shortcut.url;
    item.command = {
      title: `Open ${shortcut.name}`,
      command: "vscode.open",
      arguments: [vscode.Uri.parse(shortcut.url)],
    };
    item.show();
    this.items.push(item);
  }

  private disposeItems(): void {
    for (const item of this.items) {
      item.dispose();
    }
    this.items.length = 0;
  }
}
