/**
 * Custom ESLint rule: no-await-in-promise-all
 *
 * Flags `await` expressions that appear directly inside a `Promise.all([...])` array.
 * Using `await` inside `Promise.all` defeats parallel execution — each await blocks
 * sequentially before the next element evaluates. Pass the raw promise instead.
 *
 * @example
 * // ❌ Bad — sequential
 * const [a, b] = await Promise.all([await fetchA(), await fetchB()]);
 *
 * // ✅ Good — parallel
 * const [a, b] = await Promise.all([fetchA(), fetchB()]);
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow await inside Promise.all array elements",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noAwaitInPromiseAll:
        "Using await inside Promise.all defeats parallel execution — pass the raw promise instead.",
    },
  },

  create(context) {
    return {
      AwaitExpression(node) {
        // Walk up the tree to see if this await is inside a Promise.all([...]) array
        let current = node.parent;
        let insidePromiseAllArray = false;
        let passedThroughArray = false;

        while (current) {
          // If we hit an array expression, note it
          if (current.type === "ArrayExpression") {
            passedThroughArray = true;
          }

          // If we hit a call expression, check if it's Promise.all
          if (
            current.type === "CallExpression" &&
            current.callee.type === "MemberExpression" &&
            current.callee.object.type === "Identifier" &&
            current.callee.object.name === "Promise" &&
            current.callee.property.type === "Identifier" &&
            current.callee.property.name === "all"
          ) {
            if (passedThroughArray) {
              insidePromiseAllArray = true;
            }
            break;
          }

          // Stop if we hit a function boundary — nested functions don't count
          if (
            current.type === "FunctionExpression" ||
            current.type === "ArrowFunctionExpression" ||
            current.type === "FunctionDeclaration"
          ) {
            break;
          }

          // Stop at Promise.allSettled — that's a different pattern
          if (
            current.type === "CallExpression" &&
            current.callee.type === "MemberExpression" &&
            current.callee.property.type === "Identifier" &&
            current.callee.property.name === "allSettled"
          ) {
            break;
          }

          current = current.parent;
        }

        if (insidePromiseAllArray) {
          context.report({
            node,
            messageId: "noAwaitInPromiseAll",
          });
        }
      },
    };
  },
};

export default rule;
