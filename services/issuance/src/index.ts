import express from 'express';
import crypto from 'node:crypto';
import { Ed25519Signer, buildEmbeddedCapsule, deriveCopyId, type EmbeddedCapsulePayload } from '@repomark/core';
import { IssuanceDB } from './db.js';

export const app = express();
app.use(express.json());

// In a real app, this key would be in a KMS or HSM.
// For the reference implementation, we generate one in memory or read from env.
const HMAC_ISSUANCE_KEY = process.env.ISSUANCE_HMAC_KEY || 'test-issuance-hmac-key';

// The signing key for the service. Same as MockKmsSigner in CLI.
const SIGNING_KEY_PEM = process.env.ISSUANCE_SIGNING_KEY || crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const signer = new Ed25519Signer(SIGNING_KEY_PEM);

const db = new IssuanceDB(':memory:'); // For reference, use memory or a file

// Helper to extract Operator ID from pseudo-auth header
function getOperatorId(req: express.Request): string {
  const operator = req.headers['x-operator-id'];
  if (!operator || typeof operator !== 'string') {
    throw new Error('Missing or invalid X-Operator-Id header');
  }
  return operator;
}

app.post('/issuance/request', (req, res) => {
  try {
    const operatorId = getOperatorId(req);
    const { artifactDigest, recipientInternalId, payloadTemplate } = req.body;
    
    if (!artifactDigest || !recipientInternalId || !payloadTemplate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const requestId = crypto.randomUUID();
    db.createIssuanceRequest({
      id: requestId,
      artifactDigest,
      recipientInternalId,
      policy: JSON.stringify(payloadTemplate),
      operatorId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({ requestId, status: 'pending' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/issuance/approve/:requestId', (req, res) => {
  try {
    const approverId = getOperatorId(req);
    const { requestId } = req.params;

    const request = db.getIssuanceRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }
    if (request.operatorId === approverId) {
      return res.status(403).json({ error: 'Approver must be distinct from the requester (dual-approval required)' });
    }

    // 1. Derive copyId
    const copyId = deriveCopyId(HMAC_ISSUANCE_KEY, request.recipientInternalId);

    // 2. Build full payload
    const payloadTemplate = JSON.parse(request.policy) as EmbeddedCapsulePayload;
    payloadTemplate.copyId = copyId;
    payloadTemplate.keyId = signer.keyId; // Override with the service's actual signing key ID
    payloadTemplate.issuedAt = new Date().toISOString();

    // 3. Sign the capsule payload
    const capsuleBlock = buildEmbeddedCapsule(payloadTemplate, (buf) => signer.sign(buf) as string);

    // 4. Save approval and record in DB
    db.approveIssuanceRequest(
      { requestId, approverId, approvedAt: new Date().toISOString() },
      {
        copyId,
        requestId,
        artifactDigest: request.artifactDigest,
        recipientInternalId: request.recipientInternalId,
        issuedAt: new Date().toISOString()
      }
    );

    // 5. Return signed block to the CLI
    return res.status(200).json({ 
      copyId, 
      capsuleBlock, 
      status: 'approved' 
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/trace/request', (req, res) => {
  try {
    const operatorId = getOperatorId(req);
    const { copyId } = req.body;
    
    if (!copyId) {
      return res.status(400).json({ error: 'Missing copyId' });
    }

    const requestId = crypto.randomUUID();
    db.createTraceRequest({
      id: requestId,
      copyId,
      operatorId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({ requestId, status: 'pending' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/trace/approve/:requestId', (req, res) => {
  try {
    const approverId = getOperatorId(req);
    const { requestId } = req.params;

    const request = db.getTraceRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Trace request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Trace request is already ${request.status}` });
    }
    if (request.operatorId === approverId) {
      return res.status(403).json({ error: 'Approver must be distinct from the requester (dual-approval required)' });
    }

    // Approve the request
    db.approveTraceRequest({
      requestId,
      approverId,
      approvedAt: new Date().toISOString()
    });

    // Lookup recipient mapping
    const record = db.getIssuanceRecordByCopyId(request.copyId);
    if (!record) {
      return res.status(404).json({ error: 'No issuance record found for this copyId' });
    }

    return res.status(200).json({
      status: 'approved',
      recipientInternalId: record.recipientInternalId,
      artifactDigest: record.artifactDigest,
      issuedAt: record.issuedAt,
      disclaimer: "WARNING: This is evidence requiring corroboration, not for automated disciplinary action. Collusion resistance is not yet implemented."
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`Issuance service listening on port ${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
