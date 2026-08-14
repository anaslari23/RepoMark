import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import { canonicalizeJSON, parseStrictJSON } from './canonicalize.js';

// Resolve CJS/ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass: any = (_Ajv2020 as any).default || _Ajv2020;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormatsFn: any = (_addFormats as any).default || _addFormats;
import type {
  ClaimKind,
  DSSEEnvelope,
  FileDigestEntry,
  InTotoStatement,
  IssuerIdentity,
  MerkleAlgorithm,
  SourceOriginPredicate,
  SourceProvenance
} from './types.js';

// Embedded Schema for source-origin-v1 Statement
export const STATEMENT_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://repomark.dev/schemas/source-origin-v1/statement.schema.json',
  type: 'object',
  required: ['_type', 'subject', 'predicateType', 'predicate'],
  additionalProperties: false,
  properties: {
    _type: {
      type: 'string',
      const: 'https://in-toto.io/Statement/v1'
    },
    subject: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'digest'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          digest: {
            type: 'object',
            minProperties: 1,
            additionalProperties: false,
            properties: {
              sha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
              sha512: { type: 'string', pattern: '^[0-9a-fA-F]{128}$' },
              'repomark-merkle-v1': { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }
            }
          }
        }
      }
    },
    predicateType: {
      type: 'string',
      const: 'https://repomark.dev/source-origin/v1'
    },
    predicate: {
      type: 'object',
      required: ['claimKind', 'issuer', 'timestamp', 'cleanExport', 'manifest'],
      additionalProperties: false,
      properties: {
        claimKind: {
          type: 'string',
          enum: ['verified-origin', 'original-author', 'organization-origin'],
          default: 'verified-origin'
        },
        issuer: {
          type: 'object',
          required: ['id', 'keyId', 'signatureAlgorithm'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1 },
            keyId: { type: 'string', minLength: 1 },
            signatureAlgorithm: {
              type: 'string',
              enum: ['ed25519', 'ecdsa-p256-sha256', 'rsa-pss-sha256']
            },
            name: { type: 'string' },
            organization: { type: 'string' },
            publicKey: { type: 'string' }
          }
        },
        timestamp: { type: 'string', format: 'date-time' },
        cleanExport: { type: 'boolean', const: true },
        manifest: {
          type: 'object',
          required: ['treeAlgorithm', 'canonicalization', 'hashAlgorithm', 'filesCount', 'totalBytes', 'rootDigest'],
          additionalProperties: false,
          properties: {
            treeAlgorithm: { type: 'string', enum: ['repomark-merkle-v1'] },
            canonicalization: { type: 'string', enum: ['repomark-c14n-v1'] },
            hashAlgorithm: { type: 'string', enum: ['sha256', 'sha512'] },
            filesCount: { type: 'integer', minimum: 1 },
            totalBytes: { type: 'integer', minimum: 0 },
            rootDigest: {
              type: 'object',
              required: ['algorithm', 'value'],
              additionalProperties: false,
              properties: {
                algorithm: { type: 'string', enum: ['repomark-merkle-v1', 'sha256', 'sha512'] },
                value: { type: 'string', pattern: '^[0-9a-fA-F]{64,128}$' }
              }
            }
          }
        },
        provenance: {
          type: 'object',
          additionalProperties: false,
          properties: {
            vcs: {
              type: 'object',
              required: ['type', 'revision'],
              additionalProperties: false,
              properties: {
                type: { type: 'string', enum: ['git'] },
                repository: { type: 'string' },
                revision: { type: 'string', pattern: '^[0-9a-fA-F]{40,64}$' },
                tag: { type: 'string' },
                branch: { type: 'string' }
              }
            },
            tool: {
              type: 'object',
              required: ['name', 'version'],
              additionalProperties: false,
              properties: {
                name: { type: 'string', const: 'repomark' },
                version: { type: 'string' }
              }
            }
          }
        },
        watermark: {
          type: 'object',
          required: ['enabled', 'scheme'],
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean' },
            scheme: { type: 'string', enum: ['repomark-ast-v1', 'repomark-token-v1', 'none'] },
            recipientMask: { type: 'string' },
            appliedAt: { type: 'string', format: 'date-time' }
          }
        },
        policy: {
          type: 'object',
          additionalProperties: false,
          properties: {
            license: { type: 'string' },
            permittedUses: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }
};

const ajv = new AjvClass({ allErrors: true, strict: false });
addFormatsFn(ajv);
const validateStatementSchema = ajv.compile(STATEMENT_SCHEMA_V1);

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
export function buildSourceOriginStatement(params: BuildStatementParams): InTotoStatement {
  const claimKind: ClaimKind = params.claimKind || 'verified-origin';
  const timestamp = params.timestamp || new Date().toISOString();
  const treeAlgorithm: MerkleAlgorithm = params.treeAlgorithm || 'repomark-merkle-v1';

  let totalBytes = 0;
  const subjects = params.files.map(f => {
    totalBytes += f.size;
    return {
      name: f.path,
      digest: {
        sha256: f.rawDigest
      }
    };
  });

  const predicate: SourceOriginPredicate = {
    claimKind,
    issuer: {
      id: params.issuer.id,
      keyId: params.issuer.keyId,
      signatureAlgorithm: params.issuer.signatureAlgorithm,
      name: params.issuer.name,
      organization: params.issuer.organization,
      publicKey: params.issuer.publicKey
    },
    timestamp,
    cleanExport: true,
    manifest: {
      treeAlgorithm,
      canonicalization: 'repomark-c14n-v1',
      hashAlgorithm: 'sha256',
      filesCount: params.files.length,
      totalBytes,
      rootDigest: {
        algorithm: treeAlgorithm,
        value: params.merkleRoot
      }
    },
    provenance: params.provenance || {
      tool: {
        name: 'repomark',
        version: '1.0.0'
      }
    }
  };

  const statement: InTotoStatement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: subjects,
    predicateType: 'https://repomark.dev/source-origin/v1',
    predicate
  };

  const valid = validateStatementSchema(statement);
  if (!valid) {
    throw new Error(`Generated statement failed schema validation: ${JSON.stringify(validateStatementSchema.errors)}`);
  }

  return statement;
}

/**
 * Strictly parses and validates a JSON string or object as an InTotoStatement.
 */
export function parseAndValidateStatement(input: string | unknown): InTotoStatement {
  let statementObj: unknown;
  if (typeof input === 'string') {
    statementObj = parseStrictJSON(input);
  } else {
    // Roundtrip through strict parser if already an object
    statementObj = parseStrictJSON(JSON.stringify(input));
  }

  const valid = validateStatementSchema(statementObj);
  if (!valid) {
    const errorMsg = validateStatementSchema.errors
      ? validateStatementSchema.errors.map((e: { instancePath?: string; message?: string }) => `${e.instancePath} ${e.message}`).join(', ')
      : 'Unknown schema validation error';
    throw new Error(`Statement schema validation failed: ${errorMsg}`);
  }

  return statementObj as InTotoStatement;
}

/**
 * Creates a DSSE Envelope v1 from a statement and digital signature.
 */
export function createDSSEEnvelope(
  statement: InTotoStatement,
  signatureHexOrBase64: string,
  keyId: string
): DSSEEnvelope {
  const canonicalJson = canonicalizeJSON(statement);
  const payloadBase64 = Buffer.from(canonicalJson, 'utf8').toString('base64');

  return {
    payloadType: 'application/vnd.in-toto+json',
    payload: payloadBase64,
    signatures: [
      {
        keyid: keyId,
        sig: signatureHexOrBase64
      }
    ]
  };
}

/**
 * Strictly parses and unpacks a DSSE Envelope v1, returning the decoded InTotoStatement.
 */
export function unpackDSSEEnvelope(envelopeInput: string | unknown): {
  envelope: DSSEEnvelope;
  statement: InTotoStatement;
  canonicalPayload: string;
} {
  let envelope: DSSEEnvelope;
  if (typeof envelopeInput === 'string') {
    envelope = parseStrictJSON<DSSEEnvelope>(envelopeInput);
  } else {
    envelope = parseStrictJSON<DSSEEnvelope>(JSON.stringify(envelopeInput));
  }

  if (envelope.payloadType !== 'application/vnd.in-toto+json') {
    throw new Error(`Unsupported DSSE payloadType: ${envelope.payloadType}`);
  }
  if (!envelope.payload || typeof envelope.payload !== 'string') {
    throw new Error('Missing or invalid DSSE payload');
  }
  if (!Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
    throw new Error('DSSE envelope must contain at least one signature');
  }

  const payloadBuffer = Buffer.from(envelope.payload, 'base64');
  const canonicalPayload = payloadBuffer.toString('utf8');
  const statement = parseAndValidateStatement(canonicalPayload);

  return {
    envelope,
    statement,
    canonicalPayload
  };
}
