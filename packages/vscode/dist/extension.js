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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    // The server is implemented in the LSP package
    const serverModule = context.asAbsolutePath(path.join('..', 'lsp', 'dist', 'server.js'));
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for all relevant documents
        documentSelector: [{ scheme: 'file' }],
        synchronize: {
            // Notify the server about file changes in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*')
        }
    };
    // Create the language client and start the client.
    client = new node_1.LanguageClient('repomark', 'RepoMark Language Server', serverOptions, clientOptions);
    // Start the client. This will also launch the server
    client.start();
    // Register the command that the CodeLens will trigger
    context.subscriptions.push(vscode.commands.registerCommand('repomark.showEvidence', (status) => {
        if (!status)
            return;
        const items = [
            { label: 'State', description: status.state?.toUpperCase() || 'UNKNOWN' },
            { label: 'Claim Kind', description: status.claimKind || 'verified-origin' },
            { label: 'Issuer', description: status.issuerName || status.issuerId || 'unknown' },
            { label: 'Signing Key ID', description: status.keyId || 'unknown' },
            { label: 'Key Trust', description: status.signerTrusted ? 'Trusted' : 'Untrusted / Unpinned' },
            { label: 'Clean Export', description: status.cleanExport ? 'True' : 'False' },
            { label: 'Expected SHA-256', description: status.expectedDigest || 'n/a' },
            { label: 'Current SHA-256', description: status.actualDigest || 'n/a' },
            { label: 'Merkle Root', description: status.merkleRoot || 'n/a' }
        ];
        vscode.window.showQuickPick(items, {
            placeHolder: `Provenance Evidence`
        });
    }));
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
//# sourceMappingURL=extension.js.map