import type { Node, TypeChecker } from 'ts-morph';

export interface TransformRule {
  id: string;
  description: string;
  
  /**
   * Evaluates if a node is eligible for this transformation.
   * MUST use TypeChecker to verify semantic safety, not just structural pattern matching.
   */
  isEligible(node: Node, checker: TypeChecker): boolean;

  /**
   * Replaces the node with variant 0 (the "0" bit).
   * MUST preserve full semantic equivalence.
   */
  applyVariant0(node: Node): Node;

  /**
   * Replaces the node with variant 1 (the "1" bit).
   * MUST preserve full semantic equivalence.
   */
  applyVariant1(node: Node): Node;

  /**
   * Detects whether the node is currently in the 0 variant or 1 variant.
   * Returns -1 if it matches neither strictly.
   */
  detectVariant(node: Node): 0 | 1 | -1;
}

export class SafetyRegistry {
  private rules = new Map<string, TransformRule>();

  register(rule: TransformRule) {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule ${rule.id} is already registered.`);
    }
    this.rules.set(rule.id, rule);
  }

  getRules(): TransformRule[] {
    return Array.from(this.rules.values());
  }
}
