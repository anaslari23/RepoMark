import { Node } from 'ts-morph';
/**
 * Array Iteration Rule
 * Variant 0: `for (const x of arr) { ... }`
 * Variant 1: `arr.forEach(x => { ... })`
 *
 * Precondition: `arr` must be an Array type. The loop body must not contain
 * `break`, `continue`, `return`, or `await` (since forEach behaves differently).
 */
export const ArrayIterationRule = {
    id: 'array-iteration-v1',
    description: 'Swap for...of and forEach for simple arrays',
    isEligible(node, checker) {
        if (Node.isForOfStatement(node)) {
            const expr = node.getExpression();
            const type = checker.getTypeAtLocation(expr);
            if (!type.isArray())
                return false;
            // Check for forbidden control flow
            const body = node.getStatement();
            return !containsForbiddenControlFlow(body);
        }
        if (Node.isExpressionStatement(node)) {
            const expr = node.getExpression();
            if (Node.isCallExpression(expr)) {
                const propAccess = expr.getExpression();
                if (Node.isPropertyAccessExpression(propAccess) && propAccess.getName() === 'forEach') {
                    const type = checker.getTypeAtLocation(propAccess.getExpression());
                    if (!type.isArray())
                        return false;
                    const args = expr.getArguments();
                    if (args.length === 1 && (Node.isArrowFunction(args[0]) || Node.isFunctionExpression(args[0]))) {
                        return !containsForbiddenControlFlow(args[0].getBody());
                    }
                }
            }
        }
        return false;
    },
    applyVariant0(node) {
        if (Node.isForOfStatement(node))
            return node;
        if (Node.isExpressionStatement(node)) {
            const expr = node.getExpression();
            if (Node.isCallExpression(expr)) {
                const propAccess = expr.getExpression();
                if (Node.isPropertyAccessExpression(propAccess)) {
                    const arrName = propAccess.getExpression().getText();
                    const callback = expr.getArguments()[0];
                    if (Node.isArrowFunction(callback) || Node.isFunctionExpression(callback)) {
                        const param = callback.getParameters()[0]?.getText() || 'item';
                        let bodyText = callback.getBody().getText();
                        // If body is just an expression (e.g. `x => console.log(x)`), wrap in {}
                        if (!Node.isBlock(callback.getBody())) {
                            bodyText = `{ ${bodyText}; }`;
                        }
                        node.replaceWithText(`for (const ${param} of ${arrName}) ${bodyText}`);
                    }
                }
            }
        }
        return node;
    },
    applyVariant1(node) {
        if (Node.isExpressionStatement(node))
            return node; // already forEach
        if (Node.isForOfStatement(node)) {
            const init = node.getInitializer();
            const expr = node.getExpression();
            const body = node.getStatement();
            let paramName = 'item';
            if (Node.isVariableDeclarationList(init)) {
                paramName = init.getDeclarations()[0].getName();
            }
            let bodyText = body.getText();
            if (!Node.isBlock(body)) {
                bodyText = `{ ${bodyText} }`;
            }
            node.replaceWithText(`${expr.getText()}.forEach((${paramName}) => ${bodyText});`);
        }
        return node;
    },
    detectVariant(node) {
        if (Node.isForOfStatement(node))
            return 0;
        if (Node.isExpressionStatement(node)) {
            const expr = node.getExpression();
            if (Node.isCallExpression(expr)) {
                const propAccess = expr.getExpression();
                if (Node.isPropertyAccessExpression(propAccess) && propAccess.getName() === 'forEach') {
                    return 1;
                }
            }
        }
        return -1;
    }
};
function containsForbiddenControlFlow(node) {
    let forbidden = false;
    node.forEachDescendant(n => {
        if (Node.isBreakStatement(n) ||
            Node.isContinueStatement(n) ||
            Node.isReturnStatement(n) ||
            Node.isAwaitExpression(n)) {
            forbidden = true;
        }
    });
    return forbidden;
}
//# sourceMappingURL=array-iteration.js.map