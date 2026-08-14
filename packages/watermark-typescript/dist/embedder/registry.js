export class SafetyRegistry {
    rules = new Map();
    register(rule) {
        if (this.rules.has(rule.id)) {
            throw new Error(`Rule ${rule.id} is already registered.`);
        }
        this.rules.set(rule.id, rule);
    }
    getRules() {
        return Array.from(this.rules.values());
    }
}
//# sourceMappingURL=registry.js.map