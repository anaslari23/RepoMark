import * as vscode from 'vscode';
import type { VerifierService } from '../verifier-service.js';
export declare class RepoMarkCodeLensProvider implements vscode.CodeLensProvider {
    private verifierService;
    private _onDidChangeCodeLenses;
    readonly onDidChangeCodeLenses: vscode.Event<void>;
    constructor(verifierService: VerifierService);
    refresh(): void;
    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[];
}
//# sourceMappingURL=codelens.d.ts.map