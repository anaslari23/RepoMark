import * as vscode from 'vscode';
import type { VerifierService } from '../verifier-service.js';
export declare class RepoMarkHoverProvider implements vscode.HoverProvider {
    private verifierService;
    constructor(verifierService: VerifierService);
    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.Hover | null;
}
//# sourceMappingURL=hover.d.ts.map