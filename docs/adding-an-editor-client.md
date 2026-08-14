# Adding a New Editor Client

RepoMark's verification logic is centralized in the `repomarkd` Language Server (LSP). This ensures that cryptographic verification, policy evaluation, and trust decisions are completely decoupled from any single editor. All editors (VS Code, NeoVim, IntelliJ, etc.) act as "thin clients" that simply display the server's findings.

This guide explains how to integrate a new editor by connecting it to the `repomarkd` LSP.

## 1. Launching the Language Server

The Language Server is distributed as a Node.js script. Your client must spawn it as a child process using the `--stdio` flag to communicate via standard input/output.

```bash
node path/to/@repomark/lsp/dist/server.js --stdio
```

## 2. LSP Initialization

When initializing the Language Server, your client must provide the workspace root via standard LSP `initialize` parameters. The server uses this root to locate the `.repomark/` directory and perform verification.

You can provide the root using either:
- `workspaceFolders`: An array of workspace folders. The server will use the `uri` of the first folder.
- `rootUri`: The URI of the workspace root (fallback if `workspaceFolders` is not provided).

## 3. Supported LSP Features

Once initialized, the server automatically monitors files and provides the following features:

### CodeLens (File Status Badges)

The server implements the `textDocument/codeLens` request to provide a high-level verification badge at the top of every tracked file (Line 1).

**Request:** `textDocument/codeLens`
**Response:**
Returns an array of `CodeLens` objects. If the file is verified, it will include a lens with a command title like `✓ Verified origin: Issuer Name`.

When the user clicks the CodeLens, the client should execute the associated command (`repomark.showEvidence`), passing the verification result payload as an argument.

### Hover (Detailed Evidence)

The server implements the `textDocument/hover` request to provide detailed cryptographic evidence when the user hovers over the first line of a tracked file.

**Request:** `textDocument/hover`
**Response:**
Returns a `Hover` object containing Markdown-formatted text. This text includes a table of all cryptographic facts (Claim Kind, Issuer, Signing Key ID, Expected/Actual SHA-256 digests, etc.).

### Diagnostics (Optional Error Reporting)

Currently, the server also pushes diagnostics via `textDocument/publishDiagnostics`. If a file fails verification (e.g. untrusted key, invalid signature, modified content), the server can emit warnings or errors directly in the editor's problems view.

## 4. Client-Side Commands

Your client must register the `repomark.showEvidence` command to handle clicks on the CodeLens badge.

The server will pass a JSON object representing the `VerificationResult` as the first argument to this command. Your client should display this data in a user-friendly UI (like a QuickPick, modal, or side panel).

Example payload:
```json
{
  "state": "verified-exact",
  "claimKind": "verified-origin",
  "issuerName": "Issuer Name",
  "keyId": "key-1234",
  "signerTrusted": true,
  "cleanExport": true,
  "expectedDigest": "...",
  "actualDigest": "..."
}
```

## 5. Reference Implementation

For a bare-metal reference implementation, see the Headless Client test harness located at `packages/lsp/test/headless-client.ts`. This script demonstrates exactly how to spawn the server, send the `initialize` request, trigger `textDocument/didOpen`, and request `CodeLens` and `Hover` data.
