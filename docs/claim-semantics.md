# RepoMark Claim Semantics Specification (v1)

This document defines the formal semantics, authorization rules, and legality criteria for the three claim kinds supported by RepoMark source origin attestations.

---

## 1. Overview and Default Claim Kind

Every RepoMark source attestation asserts an immutable cryptographic statement about a file set or repository export. The semantic meaning of that assertion is strictly parameterized by `claimKind`.

> [!IMPORTANT]
> **System Default**: The default claim kind across all RepoMark tooling, CLI commands, and extension workflows is **`verified-origin`** (NOT `original-author`).

Setting `verified-origin` as the default avoids dangerous over-claiming in collaborative software development, protects against false sole-authorship assertions, and aligns with standard software supply chain attestation practices (e.g., in-toto, SLSA).

---

## 2. The Three Claim Kinds

```
                     ┌───────────────────────────────────────┐
                     │          RepoMark Claim Kinds         │
                     └───────────────────┬───────────────────┘
                                         │
       ┌─────────────────────────────────┼─────────────────────────────────┐
       ▼                                 ▼                                 ▼
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│   verified-origin    │      │  organization-origin │      │   original-author    │
│      [DEFAULT]       │      │  [Collaborative/Org] │      │  [Sole Creator Only] │
├──────────────────────┤      ├──────────────────────┤      ├──────────────────────┤
│ Issuer approves and  │      │ Entity/Org asserts   │      │ Individual asserts   │
│ seals the artifact   │      │ institutional origin │      │ sole creation / pure │
│ as genuine export.   │      │ across contributors. │      │ author record.       │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

### 2.1 `verified-origin` (Default — Recommended for Teams & CI)
- **Definition**: The issuer confirms and attests that the target artifact is an approved, authentic source tree or file recognized by the issuing identity as of the timestamped clean export.
- **Scope**: Does not assert exclusive individual creation. It asserts provenance, integrity, and organizational recognition.
- **When Legal to Use**:
  - Continuous Integration / Continuous Deployment (CI/CD) pipelines.
  - Open-source releases signed by release managers or bots.
  - Team repositories with multiple contributors or third-party dependencies.
  - Downstream distributors sharing authorized snapshots.
- **Safety Rating**: **Highest**. Safe for all team sizes, automated systems, and corporate environments.

### 2.2 `organization-origin` (Collaborative Repositories)
- **Definition**: An organization, institution, or corporate entity asserts institutional provenance over the codebase.
- **Scope**: Signifies that the codebase was authored, commissioned, or maintained under the organizational banner by authorized contributors, employees, or contractors.
- **When Legal to Use**:
  - Proprietary corporate repositories.
  - Multi-author enterprise codebases with contributor license agreements (CLAs).
  - Open-source foundations (e.g., Apache, Linux Foundation) issuing official milestone artifacts.
- **Safety Rating**: **High**. Suitable for any multi-contributor project where an entity holds distribution or IP management authority.

### 2.3 `original-author` (Strict Sole Creation)
- **Definition**: An individual natural person or tightly bound sole-creator identity asserts that they personally authored the sealed source code from first principles.
- **Scope**: Strict individual authorship. Must only cover code authored directly by the claimant or backed by verifiable, unambiguous contributor commit records.
- **When Legal to Use**:
  - Solo developer projects where 100% of the non-vendored code was authored by the claimant.
  - Individual source files where git blame / VCS provenance proves sole authorship.
  - Independent security research tools, individual libraries, and single-author algorithmic designs.
- **When ILLEGAL / PROHIBITED to Use**:
  - Multi-person team projects where one developer signs on behalf of the whole team without individual breakdown.
  - Code containing substantial third-party, copy-pasted, vendored, or AI-generated scaffolds without explicit attribution boundaries.
  - CI release bots or generic organization signing keys.
- **Safety Rating**: **Strict / Restricted**. High risk of misattribution if applied indiscriminately.

---

## 3. Claim Legality and Compliance Matrix

| Context / Scenario | `verified-origin` (Default) | `organization-origin` | `original-author` |
| :--- | :--- | :--- | :--- |
| **CI/CD Automated Build** |  **Legal** (Recommended) |  **Legal** | ❌ **Illegal** |
| **Solo Developer Project** |  **Legal** | ⚠️ Only if entity exists |  **Legal** (Permitted) |
| **Multi-Author Corporate Repo** |  **Legal** |  **Legal** (Recommended) | ❌ **Illegal** |
| **Open Source Release with Vendored Deps** |  **Legal** |  **Legal** | ❌ **Illegal** |
| **Single Isolated Utility Script (1 Author)** |  **Legal** |  **Legal** |  **Legal** |
| **Scaffolded / AI-Generated Base Project** |  **Legal** |  **Legal** | ❌ **Illegal** |

---

## 4. Attestation and Fail-Closed Invariants

1. **Explicit Selection Required for Elevation**: Any tooling invoking RepoMark must use `verified-origin` unless the user or configuration explicitly requests `organization-origin` or `original-author`.
2. **Fail-Closed on Unknown Kinds**: If a statement or capsule contains a `claimKind` outside the schema enum, verifiers MUST fail closed with status `ERROR` / `TAMPERED`.
3. **Clean Export Binding**: All claims are bound to a clean export tree (`cleanExport: true`). Dirty working directories, uncommitted changes, and temporary artifacts cannot receive any valid claim kind.
4. **Attribution Boundaries**: Third-party directories (e.g. `node_modules/`, `vendor/`, `third_party/`) should be excluded during export sealing or bounded through explicit manifest filtering so that claims do not misattribute external dependencies.
