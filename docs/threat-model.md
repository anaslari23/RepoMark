# RepoMark Threat Model and Security Guarantees (v1)

This document formalizes the security architecture, threat model, protected assets, attacker capabilities, and trust boundaries for RepoMark.

---

## 1. Fundamental Separation of Guarantees

RepoMark enforces a strict conceptual and cryptographic separation between two distinct layers of protection:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                       REPOMARK DUAL-ASSURANCE MODEL                            │
├────────────────────────────────────────┬───────────────────────────────────────┤
│    1. CRYPTOGRAPHIC PROVENANCE         │       2. WATERMARK PERSISTENCE        │
│       (Deterministic & Exact)          │       (Probabilistic & Resilient)     │
├────────────────────────────────────────┼───────────────────────────────────────┤
│ • Pure mathematical verification       │ • Statistical / structural markers    │
│ • Raw byte hashing (SHA-256 / SHA-512) │ • AST & syntax token watermarking     │
│ • Merkle tree inclusion proofs         │ • Survives reformatting, renaming,    │
│ • Digital signatures (Ed25519)         │   and benign structural refactoring   │
│ • Boolean outcome: VALID or INVALID    │ • Evaluated via confidence score [0..1]│
│ • Zero tolerance for bit alterations   │ • Degradation & collusion resistance  │
└────────────────────────────────────────┴───────────────────────────────────────┘
```

> [!IMPORTANT]
> **Deterministic vs. Probabilistic Invariant**:
> - **Provenance** is 100% deterministic. Any alteration of a single bit in the file invalidates the raw cryptographic digest and Merkle proof.
> - **Watermarking** is probabilistic and conditional. It provides forensic attribution across non-identical derivatives (e.g., refactored or reformatted code).
> 
> Verifiers, reports, and UI components must **never conflate** these two guarantees. A tampered file whose raw hash fails can still exhibit high watermark confidence, and vice-versa.

---

## 2. Assets to Protect

| Asset | Security Property | Threat / Impact of Compromise | Mitigation |
| :--- | :--- | :--- | :--- |
| **1. Issuer Signing Key** | Confidentiality & Integrity | Unauthorized third party issues forged origin attestations. | Ed25519 private keys stored in local secure keychains / HSMs; never transmitted; explicit user key confirmation. |
| **2. Statement & File-Set Root** | Integrity & Authenticity | Attacker tampers with manifest, file paths, or digests without detection. | Signed in-toto v1 Statement with raw byte SHA-256 Merkle root (`repomark-merkle-v1`). Any mutation breaks signature. |
| **3. Recipient-Mapping Records** | Confidentiality | Leaking mapping exposes confidential customer identities or distributor leak-tracking links. | Blinding / one-way key derivation for recipient identifiers (`recipientMask`); private registry isolation. |
| **4. External Registry / Transparency Logs** | Availability & Immutability | Attacker deletes or alters revocation records or public key transparency trees. | Append-only verifiable logs; offline-first cached public keys; fail-closed verification on untrusted keys. |
| **5. Verifier Execution Environment** | Sandbox Integrity | Malicious repository executes arbitrary code, Git hooks, or package scripts during verification. | Pure offline verifier; strict prohibition of shell execution, git hooks, package scripts, or dynamic code loading. |

---

## 3. Attacker Capabilities and Threat Scenarios

### 3.1 Attacker Capabilities
An adversary is assumed to have the following capabilities:
1. **Full Read/Write Access to Distributed Code**: An attacker can clone, copy, rename, reformat, reindent, change variable names, and restructure exported source code.
2. **Collusion Across Multiple Copies**: An attacker may acquire multiple distinct copies of watermarked code issued to different recipients and perform differential analysis (diffing) to isolate and eliminate watermark markers.
3. **Snippet Extraction**: An attacker can copy arbitrary snippets or individual files out of context.
4. **Malicious Workspace Crafting**: An attacker may place malicious `.git/hooks`, `package.json` install scripts, or rogue binaries in an attempt to exploit the verifier tool or VS Code extension.

### 3.2 Attacker Limitations (Security Assumptions)
1. **No Cryptographic Key Compromise**: The attacker cannot forge valid Ed25519 signatures without access to the issuer's private signing key.
2. **No Hash Collisions**: The attacker cannot find second preimages or collisions for SHA-256 within computational bounds.
3. **Key Trust Boundary**: The verifier only trusts keys explicitly configured in the local trust store or pinned by the user. An attacker cannot induce trust simply by embedding a public key URL inside an untrusted manifest.

---

## 4. Threat Scenarios & Mitigations

### Scenario A: Raw Byte Tampering & Silent Bit Modification
- **Attack**: Adversary modifies logic or inserts a backdoor into a sealed file.
- **Outcome**: The raw byte digest (`sha256`) immediately mismatches. The Merkle root recalculation fails. The verification report marks `status: "TAMPERED"` and fails closed.

### Scenario B: Line Ending Normalization Confusion
- **Attack**: Adversary alters CRLF to LF or normalizes trailing whitespace and claims the code is unmodified.
- **Defense**: RepoMark security digests are **always computed over raw bytes**. Text-normalized digests are purely diagnostic warnings (`warnings: [...]`) and cannot yield a `VERIFIED` status if raw bytes differ.

### Scenario C: Key Injection via Malicious Manifest
- **Attack**: Adversary generates a fake keypair, signs a malicious statement, and references their own remote key URL in the manifest.
- **Defense**: RepoMark never auto-trusts keys found in untrusted payloads or remote URLs. Verifier checks against local trusted key store; if key is unpinned, status is `UNTRUSTED_KEY`.

### Scenario D: Collusion Attacks on Watermarked Code
- **Attack**: Multiple recipients compare their respective copies to identify syntax perturbations.
- **Defense**: Watermark dispersion schemes (`repomark-ast-v1`) use pseudo-randomized invariant AST permutations with threshold recovery, minimizing identifiable differential patterns.

### Scenario E: Hostile Execution via Workspace Tooling
- **Attack**: Adversary distributes a RepoMark capsule accompanied by malicious npm lifecycle scripts or git hooks.
- **Defense**: The RepoMark CLI, VS Code extension, and core engine operate with zero code execution. No child processes, no `npm install`, no git hooks, and no network requests are dispatched during verification.
