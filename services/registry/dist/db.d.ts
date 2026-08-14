export interface IssuanceRecord {
    digest: string;
    signature: string;
    issuerId: string;
    metadata: string;
    insertedAt: string;
}
export interface RegistryStore {
    insertRecord(record: Omit<IssuanceRecord, 'insertedAt'>): void;
    getRecord(digest: string): IssuanceRecord | undefined;
}
export declare class SQLiteRegistryStore implements RegistryStore {
    private db;
    constructor(dbPath?: string);
    private initSchema;
    insertRecord(record: Omit<IssuanceRecord, 'insertedAt'>): void;
    getRecord(digest: string): IssuanceRecord | undefined;
}
//# sourceMappingURL=db.d.ts.map