import type { TransformRule } from '../registry.js';
/**
 * Array Iteration Rule
 * Variant 0: `for (const x of arr) { ... }`
 * Variant 1: `arr.forEach(x => { ... })`
 *
 * Precondition: `arr` must be an Array type. The loop body must not contain
 * `break`, `continue`, `return`, or `await` (since forEach behaves differently).
 */
export declare const ArrayIterationRule: TransformRule;
//# sourceMappingURL=array-iteration.d.ts.map