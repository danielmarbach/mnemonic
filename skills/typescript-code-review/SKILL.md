---
name: typescript-code-review
description: Review TypeScript code for type safety, security, performance, and maintainability. Emphasizes making invalid states unrepresentable through advanced type patterns (branded types, discriminated unions, template literals, satisfies, infer). Use when reviewing TypeScript, auditing types, checking antipatterns, or improving type-level correctness.
---

# TypeScript Code Review

Review TypeScript code with a focus on **making invalid states unrepresentable**. The type system is the most powerful correctness tool available — when types prevent invalid states at compile time, LLMs and humans alike produce fewer bugs because mistakes don't compile.

## Review Workflow

Copy this checklist and track progress:

```
TypeScript Review Progress:
- [ ] Step 1: Check tsconfig.json strictness
- [ ] Step 2: Audit for impossible-state patterns
- [ ] Step 3: Scan for type safety issues
- [ ] Step 4: Check for security vulnerabilities
- [ ] Step 5: Identify performance problems
- [ ] Step 6: Evaluate code quality and patterns
- [ ] Step 7: Structure findings with severity levels
```

### Step 1: Check tsconfig Configuration

Read tsconfig.json first — it establishes the type-safety baseline.

**Minimum required**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Flag missing strict settings. Document which checks are disabled and why.

### Step 2: Audit for Impossible-State Patterns

This is the highest-value review area. Improving types to make invalid states unrepresentable is the single most impactful change for long-term maintainability — especially when LLMs edit the codebase, because the compiler catches mistakes before they ship.

For detailed patterns and examples, see [references/impossible-states.md](references/impossible-states.md).

**Check for these opportunities**:

1. **Branded types** — Are domain primitives distinguished? A `UserId` and `OrderId` are both strings but must not be interchangeable. See [references/impossible-states.md](references/impossible-states.md) for branded type patterns.

2. **Discriminated unions with mutual exclusion** — Can two properties be set simultaneously when only one should be? Use `type` discriminators and `?: never` to make invalid combinations unrepresentable.

3. **`never` for exhaustiveness** — Do switch statements cover all cases? A `default: const exhaustive: never = value` pattern ensures new union members trigger compile errors.

4. **`satisfies` over type assertions** — Does `as X` lose literal type information? `satisfies` validates structure while preserving narrow types.

5. **Template literal types** — Are string formats (CSS values, API paths, event names) typed as `string` when they could be constrained to valid patterns?

6. **Literal unions with `string & {}`** — Could autocomplete be improved while still accepting unknown values? `type MimeType = 'image/png' | 'image/jpeg' | (string & {})` gives IDE suggestions without restricting valid inputs.

7. **`infer` for type extraction** — Are complex types manually constructed when they could be derived from source types using conditional inference?

### Step 3: Type Safety Scan

Search for these issues in order of severity:

1. **`any` usage** — Replace with `unknown` + type guards or proper interfaces. Every `any` makes invalid states representable.
2. **Unsafe type assertions** — `as X` bypasses the type system. Prefer type guards, `satisfies`, or narrowing.
3. **Missing return types** — Explicit return types catch errors at function boundaries.
4. **Improper null handling** — Use `?.` and `??` instead of manual checks. Check array index access with `noUncheckedIndexedAccess`.
5. **Unnarrowed unions** — Discriminated unions need a `type` field for reliable narrowing. See [references/common-antipatterns.md](references/common-antipatterns.md).

6. **Runtime/runtime type sync** — Are type definitions and runtime values defined separately? Use `as const` + `typeof X[number]` to derive types from a single runtime source, or Zod schemas with `z.infer<>` as the single source of truth.

7. **Missing runtime validation at trust boundaries** — External data (API responses, form input, env vars) needs runtime validation. Define schemas once with Zod and infer types: `type User = z.infer<typeof UserSchema>`. Use `parse` at trust boundaries (throws on invalid) and `safeParse` for user input (expected failures).

### Step 4: Security Review

Check for high-impact issues first. See [references/security-checklist.md](references/security-checklist.md).

1. **SQL/NoSQL injection** — String concatenation in queries → parameterized queries.
2. **XSS** — `innerHTML` with unsanitized input → `textContent` or DOMPurify.
3. **Hardcoded secrets** — Source code secrets → environment variables with Zod validation.
4. **Path traversal** — Unvalidated file paths → normalize and validate against base directory.
5. **Missing input validation** — External data needs runtime validation at trust boundaries (Zod, io-ts).

### Step 5: Performance Review

See [references/performance-tips.md](references/performance-tips.md).

1. **Sequential awaits** — `Promise.all` for independent operations.
2. **O(n²) algorithms** — `Map`/`Set` for O(1) lookups.
3. **Memory leaks** — Event listeners, subscriptions, timers without cleanup.
4. **Bundle size** — Named imports over whole-library. Dynamic imports for heavy modules.
5. **React specifics** — Missing `memo`/`useMemo`/`useCallback`, unstable object deps.

### Step 6: Code Quality Evaluation

1. **Naming** — camelCase variables/functions, PascalCase types/interfaces. Use `is`/`has` prefixes for booleans (`isActive`, `hasPermission`). Names should reveal intent: `isLegalDrinkingAge()` over `isOverEighteen()`.
2. **Immutability** — `const`, `readonly`, spread over mutation. `readonly T[]` for input arrays. Prefer pure functions (same input → same output, no side effects).
3. **Magic numbers** — Replace unnamed literals with named constants: `const MS_PER_DAY = 24 * 60 * 60 * 1000;` instead of `86400000`.
4. **Function parameters** — Limit to 2-3 parameters. Use object parameters for more. Avoid boolean flags that change behavior — split into separate functions or use discriminated unions.
5. **Error handling** — Catch `unknown` errors. Throw `Error` objects (custom error classes for domain). Never throw strings or plain objects.
6. **Import hygiene** — `import type` for type-only imports. No barrel exports that load everything.
7. **Modern patterns** — `satisfies`, `as const`, template literal types, branded types.

### Step 7: Structure Findings

```markdown
## Summary
[1-2 sentence overview and main concern]

## Critical Issues 🔴
[Must-fix: security, type errors, bugs]

## Important Improvements 🟡
[Should-fix: impossible-state patterns, anti-patterns, maintainability]

## Suggestions 🔵
[Nice-to-have: style, modern syntax, minor optimizations]

## Positive Observations ✅
[What the code does well]

## Detailed Findings
### [Category]
**File**: `path/to/file.ts:line`
- **Issue**: [Description]
- **Current**:
  ```typescript
  [code]
  ```
- **Recommended**:
  ```typescript
  [code]
  ```
- **Reasoning**: [Why]
```

## Framework-Specific Checks

**React + TypeScript**:
- Component prop interfaces over inline types
- Proper hook return types (`useState<User | null>(null)`)
- Event handler types (`React.MouseEvent<HTMLButtonElement>`)
- `useRef<HTMLDivElement>(null)` for DOM refs
- `React.ReactNode` for children, not `React.ReactElement`

**Node.js + TypeScript**:
- Typed Express/Fastify handlers
- Async error handling middleware
- Zod-validated environment variables at startup
- Database result typing (never `any` from query results)

## Automated Checks

Recommend these tools if not already in use:

```bash
tsc --noEmit                    # Type checking
npx eslint . --ext .ts,.tsx    # Linting with @typescript-eslint
npx ts-prune                   # Find unused exports
npx depcheck                   # Find unused dependencies
npx madge --circular src/      # Detect circular dependencies
```