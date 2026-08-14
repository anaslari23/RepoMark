import type { TransformRule } from '../registry.js';
/**
 * Boolean Inversion Rule
 * Variant 0: `!a` (inside an if statement condition)
 * Variant 1: `a === false`
 *
 * Precondition: `a` must be strictly typed as a boolean. If it's `any` or `number`,
 * `!a` and `a === false` have different semantics.
 */
export declare const BooleanInversionRule: TransformRule;
//# sourceMappingURL=boolean-inversion.d.ts.map