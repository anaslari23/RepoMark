#!/usr/bin/env node
import { type VerificationResult } from '@repomark/core';
export declare function cmdInit(options: Record<string, string | boolean>): void;
export declare function cmdSeal(options: Record<string, string | boolean>): void;
export declare function cmdVerify(options: Record<string, string | boolean>, positionals: string[]): VerificationResult;
export declare function cmdInspect(options: Record<string, string | boolean>, positionals: string[]): void;
export declare function cmdExport(options: Record<string, string | boolean>): string;
export declare function cmdMark(options: Record<string, string | boolean>, positionals: string[]): void;
export declare function cmdIssue(options: Record<string, string | boolean>, positionals: string[]): Promise<void>;
export declare function cmdTrace(options: Record<string, string | boolean>, positionals: string[]): Promise<void>;
export declare function main(argv?: string[]): Promise<void>;
//# sourceMappingURL=index.d.ts.map