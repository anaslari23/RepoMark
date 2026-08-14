import Database from 'better-sqlite3';
export class IssuanceDB {
    db;
    constructor(dbPath = ':memory:') {
        this.db = new Database(dbPath);
        this.initSchema();
    }
    initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS issuance_requests (
        id TEXT PRIMARY KEY,
        artifact_digest TEXT NOT NULL,
        recipient_internal_id TEXT NOT NULL,
        policy TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS issuance_approvals (
        request_id TEXT PRIMARY KEY,
        approver_id TEXT NOT NULL,
        approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(request_id) REFERENCES issuance_requests(id)
      );

      CREATE TABLE IF NOT EXISTS issuance_records (
        copy_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        artifact_digest TEXT NOT NULL,
        recipient_internal_id TEXT NOT NULL,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(request_id) REFERENCES issuance_requests(id)
      );

      CREATE TABLE IF NOT EXISTS trace_requests (
        id TEXT PRIMARY KEY,
        copy_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS trace_approvals (
        request_id TEXT PRIMARY KEY,
        approver_id TEXT NOT NULL,
        approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(request_id) REFERENCES trace_requests(id)
      );
    `);
    }
    createIssuanceRequest(req) {
        const stmt = this.db.prepare(`
      INSERT INTO issuance_requests (id, artifact_digest, recipient_internal_id, policy, operator_id, status)
      VALUES (@id, @artifactDigest, @recipientInternalId, @policy, @operatorId, @status)
    `);
        stmt.run(req);
    }
    getIssuanceRequest(id) {
        const row = this.db.prepare('SELECT * FROM issuance_requests WHERE id = ?').get(id);
        if (!row)
            return undefined;
        return {
            id: row.id,
            artifactDigest: row.artifact_digest,
            recipientInternalId: row.recipient_internal_id,
            policy: row.policy,
            operatorId: row.operator_id,
            status: row.status,
            createdAt: row.created_at
        };
    }
    approveIssuanceRequest(approval, record) {
        // Transaction to ensure atomicity
        const transaction = this.db.transaction(() => {
            this.db.prepare("UPDATE issuance_requests SET status = 'approved' WHERE id = ?").run(approval.requestId);
            this.db.prepare(`
        INSERT INTO issuance_approvals (request_id, approver_id)
        VALUES (@requestId, @approverId)
      `).run(approval);
            this.db.prepare(`
        INSERT INTO issuance_records (copy_id, request_id, artifact_digest, recipient_internal_id)
        VALUES (@copyId, @requestId, @artifactDigest, @recipientInternalId)
      `).run(record);
        });
        transaction();
    }
    createTraceRequest(req) {
        const stmt = this.db.prepare(`
      INSERT INTO trace_requests (id, copy_id, operator_id, status)
      VALUES (@id, @copyId, @operatorId, @status)
    `);
        stmt.run(req);
    }
    getTraceRequest(id) {
        const row = this.db.prepare('SELECT * FROM trace_requests WHERE id = ?').get(id);
        if (!row)
            return undefined;
        return {
            id: row.id,
            copyId: row.copy_id,
            operatorId: row.operator_id,
            status: row.status,
            createdAt: row.created_at
        };
    }
    getIssuanceRecordByCopyId(copyId) {
        const row = this.db.prepare('SELECT * FROM issuance_records WHERE copy_id = ?').get(copyId);
        if (!row)
            return undefined;
        return {
            copyId: row.copy_id,
            requestId: row.request_id,
            artifactDigest: row.artifact_digest,
            recipientInternalId: row.recipient_internal_id,
            issuedAt: row.issued_at
        };
    }
    approveTraceRequest(approval) {
        const transaction = this.db.transaction(() => {
            this.db.prepare("UPDATE trace_requests SET status = 'approved' WHERE id = ?").run(approval.requestId);
            this.db.prepare(`
        INSERT INTO trace_approvals (request_id, approver_id)
        VALUES (@requestId, @approverId)
      `).run(approval);
        });
        transaction();
    }
}
//# sourceMappingURL=db.js.map