/**
 * Custom ESLint rule: no-bare-try-catch
 *
 * Flags try/catch statements that are NOT wrapped inside an `attempt()` or
 * `attemptSync()` call. Fail-soft operations should use `attempt()` from
 * `error-utils.ts` instead of raw try/catch — it auto-logs failures via
 * `debugLog` and returns `Result<T, E>`.
 *
 * Exempted files (where raw try/catch is expected):
 * - src/git.ts, src/cli/**, src/index.ts, src/startup.ts
 * - src/migration.ts, src/embeddings.ts, src/error-utils.ts
 *
 * @example
 * // ❌ Bad
 * try {
 *   const data = JSON.parse(raw);
 * } catch { /* silent *\/ }
 *
 * // ✅ Good
 * const result = await attempt("config:read", () => JSON.parse(raw));
 * if (!result.ok) return defaults;
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require attempt() instead of bare try/catch for fail-soft operations",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noBareTryCatch:
        "Use attempt() from error-utils instead of bare try/catch for fail-soft operations.",
    },
  },

  create(context) {
    return {
      TryStatement(node) {
        // Walk up to check if this try/catch is inside an attempt() or attemptSync() call
        let current = node.parent;

        while (current) {
          // If we find ourselves inside an attempt/attemptSync call, this is fine
          if (
            current.type === "CallExpression" &&
            current.callee.type === "Identifier" &&
            (current.callee.name === "attempt" || current.callee.name === "attemptSync")
          ) {
            return;
          }

          // If we find ourselves inside a function passed to attempt, also fine
          // e.g. attempt("scope", async () => { try { ... } })
          // The arrow/function parent of the try would be the callback arg of attempt

          // Stop at function boundaries — but check if the function is the
          // body of an attempt() call
          if (
            current.type === "ArrowFunctionExpression" ||
            current.type === "FunctionExpression"
          ) {
            const callParent = current.parent;
            if (
              callParent?.type === "CallExpression" &&
              callParent.callee.type === "Identifier" &&
              (callParent.callee.name === "attempt" || callParent.callee.name === "attemptSync")
            ) {
              return;
            }
            // Function boundary not inside attempt — stop walking
            break;
          }

          // Stop at class method / object method boundaries (not inside attempt)
          if (current.type === "FunctionDeclaration") {
            break;
          }

          current = current.parent;
        }

        context.report({
          node,
          messageId: "noBareTryCatch",
        });
      },
    };
  },
};

export default rule;
