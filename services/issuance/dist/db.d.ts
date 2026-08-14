export interface IssuanceRequest {
    id: string;
    artifactDigest: string;
    recipientInternalId: string;
    policy: string;
    operatorId: string;
    status: 'pending' | 'approved';
    createdAt: string;
}
export interface IssuanceApproval {
    requestId: string;
    approverId: string;
    approvedAt: string;
}
export interface IssuanceRecord {
    copyId: string;
    requestId: string;
    artifactDigest: string;
    recipientInternalId: string;
    issuedAt: string;
}
export interface TraceRequest {
    id: string;
    copyId: string;
    operatorId: string;
    status: 'pending' | 'approved';
    createdAt: string;
}
export interface TraceApproval {
    requestId: string;
    approverId: string;
    approvedAt: string;
}
export declare class IssuanceDB {
    private db;
    constructor(dbPath?: string);
    private initSchema;
    createIssuanceRequest(req: IssuanceRequest): void;
    getIssuanceRequest(id: string): IssuanceRequest | undefined;
    approveIssuanceRequest(approval: IssuanceApproval, record: IssuanceRecord): void;
    createTraceRequest(req: TraceRequest): void;
    getTraceRequest(id: string): TraceRequest | undefined;
    getIssuanceRecordByCopyId(copyId: string): IssuanceRecord | undefined;
    approveTraceRequest(approval: TraceApproval): void;
}
//# sourceMappingURL=db.d.ts.map