import { Node, SyntaxKind } from 'ts-morph';
/**
 * Boolean Inversion Rule
 * Variant 0: `!a` (inside an if statement condition)
 * Variant 1: `a === false`
 *
 * Precondition: `a` must be strictly typed as a boolean. If it's `any` or `number`,
 * `!a` and `a === false` have different semantics.
 */
export const BooleanInversionRule = {
    id: 'boolean-inversion-v1',
    description: 'Invert !a to a === false when a is strictly boolean',
    isEligible(node, checker) {
        if (Node.isIfStatement(node)) {
            const expr = node.getExpression();
            // Case 0: !a
            if (Node.isPrefixUnaryExpression(expr) && expr.getOperatorToken() === SyntaxKind.ExclamationToken) {
                const operand = expr.getOperand();
                const type = checker.getTypeAtLocation(operand);
                return type.isBoolean() || type.isBooleanLiteral();
            }
            // Case 1: a === false
            if (Node.isBinaryExpression(expr) && expr.getOperatorToken().getKind() === SyntaxKind.EqualsEqualsEqualsToken) {
                const left = expr.getLeft();
                const right = expr.getRight();
                const leftType = checker.getTypeAtLocation(left);
                const rightType = checker.getTypeAtLocation(right);
                if (leftType.isBoolean() && right.getText() === 'false')
                    return true;
                if (rightType.isBoolean() && left.getText() === 'false')
                    return true;
            }
        }
        return false;
    },
    applyVariant0(node) {
        if (!Node.isIfStatement(node))
            return node;
        const expr = node.getExpression();
        if (Node.isBinaryExpression(expr) && expr.getOperatorToken().getKind() === SyntaxKind.EqualsEqualsEqualsToken) {
            const left = expr.getLeft();
            const right = expr.getRight();
            const operand = right.getText() === 'false' ? left.getText() : right.getText();
            expr.replaceWithText(`!${operand}`);
        }
        return node;
    },
    applyVariant1(node) {
        if (!Node.isIfStatement(node))
            return node;
        const expr = node.getExpression();
        if (Node.isPrefixUnaryExpression(expr) && expr.getOperatorToken() === SyntaxKind.ExclamationToken) {
            const operand = expr.getOperand().getText();
            expr.replaceWithText(`${operand} === false`);
        }
        return node;
    },
    detectVariant(node) {
        if (!Node.isIfStatement(node))
            return -1;
        const expr = node.getExpression();
        if (Node.isPrefixUnaryExpression(expr) && expr.getOperatorToken() === SyntaxKind.ExclamationToken) {
            return 0;
        }
        if (Node.isBinaryExpression(expr) && expr.getOperatorToken().getKind() === SyntaxKind.EqualsEqualsEqualsToken) {
            return 1;
        }
        return -1;
    }
};
//# sourceMappingURL=boolean-inversion.js.map