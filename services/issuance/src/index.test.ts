import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from './index.js';

test('Issuance Service Flow: success', async () => {
  // 1. Request issuance
  const req1 = await request(app)
    .post('/issuance/request')
    .set('x-operator-id', 'operator-a')
    .send({
      artifactDigest: 'abcd',
      recipientInternalId: 'emp-1234',
      payloadTemplate: {
        issuerId: 'my-issuer',
        claimKind: 'verified-origin',
        repositoryRoot: 'origin',
        originalPath: 'test.ts',
        markerlessSha256: 'abcd'
      }
    });
  
  assert.strictEqual(req1.status, 201);
  const requestId = req1.body.requestId;
  assert.ok(requestId);

  // 2. Try to approve with same operator (should fail)
  const req2 = await request(app)
    .post(`/issuance/approve/${requestId}`)
    .set('x-operator-id', 'operator-a');
  
  assert.strictEqual(req2.status, 403);
  assert.match(req2.body.error, /dual-approval required/);

  // 3. Approve with different operator
  const req3 = await request(app)
    .post(`/issuance/approve/${requestId}`)
    .set('x-operator-id', 'operator-b');
  if (req3.status !== 200) console.log(req3.body);
  assert.strictEqual(req3.status, 200);
  assert.strictEqual(req3.body.status, 'approved');
  assert.ok(req3.body.copyId);
  assert.ok(req3.body.capsuleBlock);

  const copyId = req3.body.copyId;

  // 4. Trace request
  const req4 = await request(app)
    .post('/trace/request')
    .set('x-operator-id', 'operator-c')
    .send({ copyId });
  
  assert.strictEqual(req4.status, 201);
  const traceReqId = req4.body.requestId;

  // 5. Trace approve
  const req5 = await request(app)
    .post(`/trace/approve/${traceReqId}`)
    .set('x-operator-id', 'operator-d');
  
  assert.strictEqual(req5.status, 200);
  assert.strictEqual(req5.body.recipientInternalId, 'emp-1234');
  assert.match(req5.body.disclaimer, /evidence requiring corroboration/);
});
