import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

function loadJSON(filePath) {
  const fullPath = path.resolve(rootDir, filePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

// Load Schemas
const statementSchema = loadJSON('schemas/source-origin-v1/statement.schema.json');
const capsuleSchema = loadJSON('schemas/portable-file-v1/capsule.schema.json');
const reportSchema = loadJSON('schemas/verification-report-v1/report.schema.json');

const validateStatement = ajv.compile(statementSchema);
const validateCapsule = ajv.compile(capsuleSchema);
const validateReport = ajv.compile(reportSchema);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`PASS: ${message}`);
    passed++;
  } else {
    console.error(`FAIL: ${message}`);
    failed++;
  }
}

console.log('=== RepoMark Phase 0 Schema Validation Suite ===\n');

// 1. Positive Tests
console.log('--- Positive Test Vectors ---');

const statementExample = loadJSON('schemas/examples/statement.example.json');
const isStatementValid = validateStatement(statementExample);
assert(isStatementValid, 'statement.example.json matches statement.schema.json');
if (!isStatementValid) console.error(validateStatement.errors);

const capsuleExample = loadJSON('schemas/examples/capsule.example.json');
const isCapsuleValid = validateCapsule(capsuleExample);
assert(isCapsuleValid, 'capsule.example.json matches capsule.schema.json');
if (!isCapsuleValid) console.error(validateCapsule.errors);

const reportExample = loadJSON('schemas/examples/report.example.json');
const isReportValid = validateReport(reportExample);
assert(isReportValid, 'report.example.json matches report.schema.json');
if (!isReportValid) console.error(validateReport.errors);

// 2. Negative Tests (Must Fail Closed)
console.log('\n--- Negative Test Vectors (Fail Closed) ---');

const invalidStmtAlgo = loadJSON('schemas/examples/invalid-statement-unknown-algo.json');
const isStmtAlgoInvalid = !validateStatement(invalidStmtAlgo);
assert(isStmtAlgoInvalid, 'invalid-statement-unknown-algo.json rejected by schema');

const invalidStmtClaim = loadJSON('schemas/examples/invalid-statement-bad-claim.json');
const isStmtClaimInvalid = !validateStatement(invalidStmtClaim);
assert(isStmtClaimInvalid, 'invalid-statement-bad-claim.json rejected by schema');

const invalidCapsuleRaw = loadJSON('schemas/examples/invalid-capsule-missing-raw.json');
const isCapsuleRawInvalid = !validateCapsule(invalidCapsuleRaw);
assert(isCapsuleRawInvalid, 'invalid-capsule-missing-raw.json rejected by schema');

const invalidReportNet = loadJSON('schemas/examples/invalid-report-network-call.json');
const isReportNetInvalid = !validateReport(invalidReportNet);
assert(isReportNetInvalid, 'invalid-report-network-call.json rejected by schema (networkCallsAttempted > 0)');

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
