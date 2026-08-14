import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  CodeLens,
  Hover,
  Position,
  Range,
  MarkupKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { VerifierService, FileVerificationStatus } from './verifier.js';

function formatEvidence(status: FileVerificationStatus): string {
  const issuer = status.issuerName || 'Authorized Issuer';
  const keyId = status.keyId || 'unknown';
  const stateBadge =
    status.state === 'verified-exact'
      ? '**[VERIFIED EXACT]**'
      : status.state === 'verified-modified'
      ? '**[VERIFIED SIGNATURE - MODIFIED CONTENT]**'
      : status.state === 'untrusted'
      ? '**[UNTRUSTED SIGNER KEY]**'
      : status.state === 'revoked'
      ? '**[REVOKED ISSUER KEY]**'
      : '**[INVALID PROVENANCE]**';

  let md = `### RepoMark Provenance Evidence\n\n`;
  md += `Status: ${stateBadge}\n\n`;
  md += `| Fact | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Claim Kind** | \`${status.claimKind || 'verified-origin'}\` |\n`;
  md += `| **Issuer** | ${issuer} |\n`;
  md += `| **Signing Key ID** | \`${keyId}\` |\n`;
  md += `| **Key Trust** | ${status.signerTrusted ? 'Trusted in local snapshot' : 'Untrusted / Unpinned'} |\n`;
  md += `| **Clean Export** | ${status.cleanExport ? 'True' : 'False'} |\n`;
  if (status.vcsRevision) {
    md += `| **Git Commit** | \`${status.vcsRevision.slice(0, 12)}\` |\n`;
  }
  if (status.timestamp) {
    md += `| **Sealed At** | \`${status.timestamp}\` |\n`;
  }
  if (status.expectedDigest) {
    md += `| **Expected SHA-256** | \`${status.expectedDigest}\` |\n`;
  }
  if (status.actualDigest) {
    md += `| **Current SHA-256** | \`${status.actualDigest}\` |\n`;
  }
  if (status.merkleRoot) {
    md += `| **Merkle Root** | \`${status.merkleRoot}\` |\n`;
  }

  md += `\n*Offline deterministic verification (0 network calls, 0 code executions)*\n`;
  return md;
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let workspaceRoot: string | null = null;
let verifier: VerifierService | null = null;

connection.onInitialize((params: InitializeParams) => {
  const workspaceFolders = params.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    workspaceRoot = new URL(workspaceFolders[0].uri).pathname;
  } else if (params.rootUri) {
    workspaceRoot = new URL(params.rootUri).pathname;
  }
  
  if (workspaceRoot) {
    verifier = new VerifierService(workspaceRoot);
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      codeLensProvider: {
        resolveProvider: false
      },
      hoverProvider: true
    }
  };
  return result;
});

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change: any) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  if (!workspaceRoot || !verifier) return;

  const diagnostics: Diagnostic[] = [];
  const uri = textDocument.uri;

  try {
    const filePath = new URL(uri).pathname;
    const status = verifier.verifyFile(filePath);

    if (status.state === 'invalid' || status.state === 'revoked') {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: {
          start: Position.create(0, 0),
          end: Position.create(0, 100)
        },
        message: `RepoMark: ${status.state === 'invalid' ? 'Signature invalid or file modified.' : 'Signer key revoked.'}`,
        source: 'repomark'
      };
      diagnostics.push(diagnostic);
    }
  } catch (err: unknown) {
    // Silently ignore verification failures for untracked files
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCodeLens(async (params: any) => {
  if (!workspaceRoot || !verifier) return [];

  const uri = params.textDocument.uri;
  const filePath = new URL(uri).pathname;
  const document = documents.get(uri);
  
  console.error(`[CodeLens] workspaceRoot: ${workspaceRoot}`);
  console.error(`[CodeLens] URI: ${uri}`);
  console.error(`[CodeLens] Document exists: ${!!document}`);

  if (!document) return [];

  try {
    const status = verifier.verifyFile(filePath);
    console.error(`[CodeLens] Verify status state: ${status.state}`);

    if (status.state === 'untracked') {
      return [];
    }

    let title = 'RepoMark: Untrusted';
    const authorName = status.issuerName || 'Authorized Issuer';

    if (status.state === 'verified-exact') {
      if (status.claimKind === 'original-author') {
        title = `✓ Originally authored by ${authorName} - verified`;
      } else if (status.claimKind === 'organization-origin') {
        title = `✓ Organization origin: ${authorName} - verified`;
      } else {
        title = `✓ Verified origin: ${authorName} - verified`;
      }
    } else if (status.state === 'verified-modified') {
      title = `⚠ Signed origin: ${authorName} - modified since sealing`;
    } else if (status.state === 'untrusted') {
      title = `⚠ Signed origin: ${authorName} - untrusted key`;
    } else if (status.state === 'revoked') {
      title = `❌ Signed origin: ${authorName} - revoked key`;
    } else {
      title = `❌ Signed origin: invalid signature or tampered`;
    }

    const codeLens: CodeLens = {
      range: Range.create(0, 0, 0, 0),
      command: {
        title,
        command: 'repomark.showEvidence',
        arguments: [status] // We send the status (or VerificationResult) back to the client
      }
    };
    return [codeLens];
  } catch {
    return [];
  }
});

connection.onHover(async (params: any) => {
  if (!workspaceRoot || !verifier) return null;

  const uri = params.textDocument.uri;
  const filePath = new URL(uri).pathname;
  const document = documents.get(uri);
  if (!document) return null;

  // Only trigger hover on the first line
  if (params.position.line > 5) return null;

  try {
    const status = verifier.verifyFile(filePath);

    if (status.state === 'untrusted' || status.state === 'inconclusive' || status.state === 'untracked') {
      return null;
    }
    
    const evidenceMarkdown = formatEvidence(status);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: evidenceMarkdown
      }
    };
  } catch {
    return null;
  }
});

documents.listen(connection);
connection.listen();
