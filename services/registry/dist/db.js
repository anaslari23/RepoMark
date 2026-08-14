import Database from 'better-sqlite3';
export class SQLiteRegistryStore {
    db;
    constructor(dbPath = ':memory:') {
        this.db = new Database(dbPath);
        this.initSchema();
    }
    initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS statement_records_v1 (
        digest TEXT PRIMARY KEY,
        signature TEXT NOT NULL,
        issuerId TEXT NOT NULL,
        metadata TEXT NOT NULL,
        insertedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
        // Enforce append-only at the database layer using triggers
        this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS prevent_update_statement_records_v1
      BEFORE UPDATE ON statement_records_v1
      BEGIN
        SELECT RAISE(ABORT, 'UPDATE not allowed on append-only registry table');
      END;
    `);
        this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS prevent_delete_statement_records_v1
      BEFORE DELETE ON statement_records_v1
      BEGIN
        SELECT RAISE(ABORT, 'DELETE not allowed on append-only registry table');
      END;
    `);
    }
    insertRecord(record) {
        const stmt = this.db.prepare(`
      INSERT INTO statement_records_v1 (digest, signature, issuerId, metadata)
      VALUES (@digest, @signature, @issuerId, @metadata)
    `);
        stmt.run({
            digest: record.digest,
            signature: record.signature,
            issuerId: record.issuerId,
            metadata: record.metadata
        });
    }
    getRecord(digest) {
        const stmt = this.db.prepare(`
      SELECT digest, signature, issuerId, metadata, insertedAt 
      FROM statement_records_v1 
      WHERE digest = ?
    `);
        return stmt.get(digest);
    }
}
//# sourceMappingURL=db.js.map