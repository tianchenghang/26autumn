import * as vscode from "vscode";

interface BlockPair {
  readonly openPattern: RegExp;
  readonly closePattern: RegExp;
}

const BLOCK_PAIRS: readonly BlockPair[] = [
  { openPattern: /\{\{\s*if\b/, closePattern: /\{\{\s*\/if\s*\}\}/ },
  { openPattern: /\{\{\s*forOf\b/, closePattern: /\{\{\s*\/forOf\s*\}\}/ },
  { openPattern: /\{\{\s*forIn\b/, closePattern: /\{\{\s*\/forIn\s*\}\}/ },
  { openPattern: /\{\{\s*for\s*\(/, closePattern: /\{\{\s*\/for\s*\}\}/ },
];

export class SwiftyFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];

    for (const pair of BLOCK_PAIRS) {
      const pairRanges = this.findBlockRanges(document, pair);
      ranges.push(...pairRanges);
    }

    return ranges;
  }

  private findBlockRanges(
    document: vscode.TextDocument,
    pair: BlockPair,
  ): vscode.FoldingRange[] {
    const stack: number[] = [];
    const ranges: vscode.FoldingRange[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;

      // Check for open tags on this line
      if (pair.openPattern.test(lineText)) {
        stack.push(i);
      }

      // Check for close tags on this line
      if (pair.closePattern.test(lineText)) {
        const openLine = stack.pop();
        if (openLine !== undefined && openLine < i) {
          ranges.push(
            new vscode.FoldingRange(
              openLine,
              i,
              vscode.FoldingRangeKind.Region,
            ),
          );
        }
      }
    }

    return ranges;
  }
}
