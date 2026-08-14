"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepoMarkCodeLensProvider = void 0;
const vscode = __importStar(require("vscode"));
const sanitizer_js_1 = require("../sanitizer.js");
class RepoMarkCodeLensProvider {
    verifierService;
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    constructor(verifierService) {
        this.verifierService = verifierService;
    }
    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    provideCodeLenses(document, _token) {
        const fsPath = document.uri.fsPath;
        const status = this.verifierService.verifyFile(fsPath);
        if (status.state === 'untracked') {
            return [];
        }
        const range = new vscode.Range(0, 0, 0, 0);
        const authorName = (0, sanitizer_js_1.sanitizeString)(status.issuerName || 'Authorized Issuer');
        let title = '';
        if (status.state === 'verified-exact') {
            if (status.claimKind === 'original-author') {
                title = `$(shield) Originally authored by ${authorName} - verified`;
            }
            else if (status.claimKind === 'organization-origin') {
                title = `$(organization) Organization origin: ${authorName} - verified`;
            }
            else {
                title = `$(verified) Verified origin: ${authorName} - verified`;
            }
        }
        else if (status.state === 'verified-modified') {
            title = `$(diff-modified) Signed origin: ${authorName} - modified since sealing`;
        }
        else if (status.state === 'untrusted') {
            title = `$(warning) Signed origin: ${authorName} - untrusted key`;
        }
        else if (status.state === 'revoked') {
            title = `$(error) Signed origin: ${authorName} - revoked key`;
        }
        else {
            title = `$(error) Signed origin: invalid signature or tampered`;
        }
        const codeLens = new vscode.CodeLens(range, {
            title,
            command: 'repomark.showEvidence',
            arguments: [fsPath]
        });
        return [codeLens];
    }
}
exports.RepoMarkCodeLensProvider = RepoMarkCodeLensProvider;
//# sourceMappingURL=codelens.js.map