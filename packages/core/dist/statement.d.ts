import type { ClaimKind, DSSEEnvelope, FileDigestEntry, InTotoStatement, IssuerIdentity, MerkleAlgorithm, SourceProvenance } from './types.js';
export declare const STATEMENT_SCHEMA_V1: {
    $schema: string;
    $id: string;
    type: string;
    required: string[];
    additionalProperties: boolean;
    properties: {
        _type: {
            type: string;
            const: string;
        };
        subject: {
            type: string;
            minItems: number;
            items: {
                type: string;
                required: string[];
                additionalProperties: boolean;
                properties: {
                    name: {
                        type: string;
                        minLength: number;
                    };
                    digest: {
                        type: string;
                        minProperties: number;
                        additionalProperties: boolean;
                        properties: {
                            sha256: {
                                type: string;
                                pattern: string;
                            };
                            sha512: {
                                type: string;
                                pattern: string;
                            };
                            'repomark-merkle-v1': {
                                type: string;
                                pattern: string;
                            };
                        };
                    };
                };
            };
        };
        predicateType: {
            type: string;
            const: string;
        };
        predicate: {
            type: string;
            required: string[];
            additionalProperties: boolean;
            properties: {
                claimKind: {
                    type: string;
                    enum: string[];
                    default: string;
                };
                issuer: {
                    type: string;
                    required: string[];
                    additionalProperties: boolean;
                    properties: {
                        id: {
                            type: string;
                            minLength: number;
                        };
                        keyId: {
                            type: string;
                            minLength: number;
                        };
                        signatureAlgorithm: {
                            type: string;
                            enum: string[];
                        };
                        name: {
                            type: string;
                        };
                        organization: {
                            type: string;
                        };
                        publicKey: {
                            type: string;
                        };
                    };
                };
                timestamp: {
                    type: string;
                    format: string;
                };
                cleanExport: {
                    type: string;
                    const: boolean;
                };
                manifest: {
                    type: string;
                    required: string[];
                    additionalProperties: boolean;
                    properties: {
                        treeAlgorithm: {
                            type: string;
                            enum: string[];
                        };
                        canonicalization: {
                            type: string;
                            enum: string[];
                        };
                        hashAlgorithm: {
                            type: string;
                            enum: string[];
                        };
                        filesCount: {
                            type: string;
                            minimum: number;
                        };
                        totalBytes: {
                            type: string;
                            minimum: number;
                        };
                        rootDigest: {
                            type: string;
                            required: string[];
                            additionalProperties: boolean;
                            properties: {
                                algorithm: {
                                    type: string;
                                    enum: string[];
                                };
                                value: {
                                    type: string;
                                    pattern: string;
                                };
                            };
                        };
                    };
                };
                provenance: {
                    type: string;
                    additionalProperties: boolean;
                    properties: {
                        vcs: {
                            type: string;
                            required: string[];
                            additionalProperties: boolean;
                            properties: {
                                type: {
                                    type: string;
                                    enum: string[];
                                };
                                repository: {
                                    type: string;
                                };
                                revision: {
                                    type: string;
                                    pattern: string;
                                };
                                tag: {
                                    type: string;
                                };
                                branch: {
                                    type: string;
                                };
                            };
                        };
                        tool: {
                            type: string;
                            required: string[];
                            additionalProperties: boolean;
                            properties: {
                                name: {
                                    type: string;
                                    const: string;
                                };
                                version: {
                                    type: string;
                                };
                            };
                        };
                    };
                };
                watermark: {
                    type: string;
                    required: string[];
                    additionalProperties: boolean;
                    properties: {
                        enabled: {
                            type: string;
                        };
                        scheme: {
                            type: string;
                            enum: string[];
                        };
                        recipientMask: {
                            type: string;
                        };
                        appliedAt: {
                            type: string;
                            format: string;
                        };
                    };
                };
                policy: {
                    type: string;
                    additionalProperties: boolean;
                    properties: {
                        license: {
                            type: string;
                        };
                        permittedUses: {
                            type: string;
                            items: {
                                type: string;
                            };
                        };
                    };
                };
            };
        };
    };
};
export interface BuildStatementParams {
    claimKind?: ClaimKind;
    issuer: IssuerIdentity;
    files: FileDigestEntry[];
    merkleRoot: string;
    timestamp?: string;
    provenance?: SourceProvenance;
    treeAlgorithm?: MerkleAlgorithm;
}
/**
 * Builds an in-toto v1 Statement with source-origin-v1 predicate.
 */
export declare function buildSourceOriginStatement(params: BuildStatementParams): InTotoStatement;
/**
 * Strictly parses and validates a JSON string or object as an InTotoStatement.
 */
export declare function parseAndValidateStatement(input: string | unknown): InTotoStatement;
/**
 * Creates a DSSE Envelope v1 from a statement and digital signature.
 */
export declare function createDSSEEnvelope(statement: InTotoStatement, signatureHexOrBase64: string, keyId: string): DSSEEnvelope;
/**
 * Strictly parses and unpacks a DSSE Envelope v1, returning the decoded InTotoStatement.
 */
export declare function unpackDSSEEnvelope(envelopeInput: string | unknown): {
    envelope: DSSEEnvelope;
    statement: InTotoStatement;
    canonicalPayload: string;
};
//# sourceMappingURL=statement.d.ts.map