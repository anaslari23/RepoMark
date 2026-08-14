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
exports.RepoMarkHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const sanitizer_js_1 = require("../sanitizer.js");
class RepoMarkHoverProvider {
    verifierService;
    constructor(verifierService) {
        this.verifierService = verifierService;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    provideHover(document, position, _token) {
        // Only show hover on the first 3 lines of the document or on origin header
        if (position.line > 2) {
            return null;
        }
        const fsPath = document.uri.fsPath;
        const status = this.verifierService.verifyFile(fsPath);
        if (status.state === 'untracked') {
            return null;
        }
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = false;
        const issuer = (0, sanitizer_js_1.escapeMarkdown)(status.issuerName || 'Authorized Issuer');
        const keyId = (0, sanitizer_js_1.sanitizeDigest)(status.keyId || 'unknown');
        const stateBadge = status.state === 'verified-exact'
            ? '**[VERIFIED EXACT]**'
            : status.state === 'verified-modified'
                ? '**[VERIFIED SIGNATURE - MODIFIED CONTENT]**'
                : status.state === 'untrusted'
                    ? '**[UNTRUSTED SIGNER KEY]**'
                    : status.state === 'revoked'
                        ? '**[REVOKED ISSUER KEY]**'
                        : '**[INVALID PROVENANCE]**';
        md.appendMarkdown(`### RepoMark Provenance Evidence\n\n`);
        md.appendMarkdown(`Status: ${stateBadge}\n\n`);
        md.appendMarkdown(`| Fact | Value |\n`);
        md.appendMarkdown(`| :--- | :--- |\n`);
        md.appendMarkdown(`| **Claim Kind** | \`${(0, sanitizer_js_1.escapeMarkdown)(status.claimKind || 'verified-origin')}\` |\n`);
        md.appendMarkdown(`| **Issuer** | ${issuer} |\n`);
        md.appendMarkdown(`| **Signing Key ID** | \`${keyId}\` |\n`);
        md.appendMarkdown(`| **Key Trust** | ${status.signerTrusted ? 'Trusted in local snapshot' : 'Untrusted / Unpinned'} |\n`);
        md.appendMarkdown(`| **Clean Export** | ${status.cleanExport ? 'True' : 'False'} |\n`);
        if (status.vcsRevision) {
            md.appendMarkdown(`| **Git Commit** | \`${(0, sanitizer_js_1.escapeMarkdown)(status.vcsRevision.slice(0, 12))}\` |\n`);
        }
        if (status.timestamp) {
            md.appendMarkdown(`| **Sealed At** | \`${(0, sanitizer_js_1.escapeMarkdown)(status.timestamp)}\` |\n`);
        }
        if (status.expectedDigest) {
            md.appendMarkdown(`| **Expected SHA-256** | \`${(0, sanitizer_js_1.sanitizeDigest)(status.expectedDigest)}\` |\n`);
        }
        if (status.actualDigest) {
            md.appendMarkdown(`| **Current SHA-256** | \`${(0, sanitizer_js_1.sanitizeDigest)(status.actualDigest)}\` |\n`);
        }
        if (status.merkleRoot) {
            md.appendMarkdown(`| **Merkle Root** | \`${(0, sanitizer_js_1.sanitizeDigest)(status.merkleRoot)}\` |\n`);
        }
        md.appendMarkdown(`\n*Offline deterministic verification (0 network calls, 0 code executions)*\n`);
        return new vscode.Hover(md, new vscode.Range(0, 0, 2, 80));
    }
}
exports.RepoMarkHoverProvider = RepoMarkHoverProvider;
//# sourceMappingURL=hover.js.map