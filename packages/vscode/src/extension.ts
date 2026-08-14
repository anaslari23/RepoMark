import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  // The server is implemented in the LSP package
  const serverModule = context.asAbsolutePath(
    path.join('..', 'lsp', 'dist', 'server.js')
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for all relevant documents
    documentSelector: [{ scheme: 'file' }],
    synchronize: {
      // Notify the server about file changes in the workspace
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*')
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'repomark',
    'RepoMark Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();

  // Register the command that the CodeLens will trigger
  context.subscriptions.push(
    vscode.commands.registerCommand('repomark.showEvidence', (status: any) => {
      if (!status) return;

      const items: vscode.QuickPickItem[] = [
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
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
