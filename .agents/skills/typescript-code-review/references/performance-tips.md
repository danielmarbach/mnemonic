# TypeScript Performance Tips

Runtime and compilation performance strategies. Both matter — slow builds hurt developer experience, slow runtime hurts users.

## Compilation Performance

These tips come from the official TypeScript wiki and address slow type-checking and editor responsiveness.

### Prefer Interfaces Over Intersections

Interfaces create a single flat object type with cached relationships. Intersections recursively merge properties and can produce `never` on conflicts. Intersections also display worse in error messages.

```typescript
// Bad — intersection (no caching, worse display)
type Foo = Bar & Baz & {
  someProp: string;
};

// Good — interface extends (cached, flat, conflict detection)
interface Foo extends Bar, Baz {
  someProp: string;
}
```

### Add Type Annotations (Especially Return Types)

Named types are more compact than inferred anonymous types. This reduces time spent reading/writing declaration files and speeds incremental builds. Particularly helpful when `--declaration` emit contains `import("./path").SomeType` or extremely large inferred types.

```typescript
// Bad — inferred return type (large anonymous type computed each check)
export function func() {
  return otherFunc();
}

// Good — explicit return type (cached, compact)
export function func(): OtherType {
  return otherFunc();
}
```

### Prefer Base Types Over Large Unions

Every union element must be checked on each call. Redundancy elimination is quadratic. Use subtypes with shared base types instead.

```typescript
// Bad — large union checked pairwise
interface WeekdaySchedule {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  wake: Time;
  startWork: Time;
  endWork: Time;
  sleep: Time;
}

interface WeekendSchedule {
  day: 'Saturday' | 'Sunday';
  wake: Time;
  familyMeal: Time;
  sleep: Time;
}

declare function printSchedule(schedule: WeekdaySchedule | WeekendSchedule);

// Good — base type with subtypes
interface Schedule {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  wake: Time;
  sleep: Time;
}

interface WeekdaySchedule extends Schedule {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startWork: Time;
  endWork: Time;
}

declare function printSchedule(schedule: Schedule);
```

### Name Complex Types

Inline conditional types are re-evaluated on every call. Extract them to named type aliases so the compiler can cache results.

```typescript
// Bad — inline conditional type, re-evaluated every call
interface SomeType<T> {
  foo<U>(x: U): U extends TypeA<T> ? ProcessTypeA<U, T>
    : U extends TypeB<T> ? ProcessTypeB<U, T>
    : U;
}

// Good — named type, cached
type FooResult<U, T> =
  U extends TypeA<T> ? ProcessTypeA<U, T>
  : U extends TypeB<T> ? ProcessTypeB<U, T>
  : U;

interface SomeType<T> {
  foo<U>(x: U): FooResult<U, T>;
}
```

### Limit Deeply Recursive Types

```typescript
// Bad — unbounded recursion, slow compilation
type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

// Good — bounded recursion
type DeepPartial<T, Depth extends number = 5> = Depth extends 0
  ? T
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P], Prev[Depth]> }
  : T;

type Prev = [never, 0, 1, 2, 3, 4, ...0[]];
```

### Use Project References for Large Codebases

Split large codebases into independent projects with their own `tsconfig.json`. Each project is type-checked independently, reducing memory and time.

```
Shared ← Client
       ← Server
```

Aim for 5-20 projects. Separate test code into its own project to prevent product code from depending on it.

### Configure tsconfig for Speed

```json
{
  "compilerOptions": {
    "incremental": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "strict": true
  },
  "include": ["src"],
  "exclude": ["**/node_modules", "**/.*/"]
}
```

**Key settings**:
- `incremental`: Saves build state to `.tsbuildinfo` for faster recompiles
- `skipLibCheck`: Skips checking `.d.ts` files (use for build speed, not correctness)
- `isolatedModules`: Ensures code works with transpilers like Babel/esbuild
- `strict`: Enables `strictFunctionTypes` which enables faster variance checks
- `include`: Only specify source directories — avoid scanning `node_modules`
- `exclude`: Always include `**/node_modules` and `**/.*/` (hidden dirs like `.git`)

### Control `@types` Inclusion

By default TypeScript includes every `@types` package in `node_modules`. This can slow compilation and cause conflicts.

```json
// Only include needed @types
{
  "compilerOptions": {
    "types": ["node", "mocha"]
  }
}
```

### Diagnose Slow Builds

```bash
# See where time is spent
tsc --extendedDiagnostics

# See which files are included
tsc --listFilesOnly

# See why files were included
tsc --explainFiles > explanations.txt

# Generate performance trace for analysis
tsc --generateTrace tracing_output_folder

# Analyze trace with
npx @typescript/analyze-trace
```

### Concurrent Type-Checking in Build Tools

Type-checking can block the dev loop. Use concurrent type-checking to unblock builds:

- Webpack: `fork-ts-checker-webpack-plugin`
- Vite: Built-in with `vue-tsc` or `@vue/typescript`
- Rollup: `@rollup/plugin-typescript` with `isolatedModules`

## Runtime Performance

### Algorithm Choice

```typescript
// Bad — O(n) lookup
const users: User[] = [...];
function findUser(id: string): User | undefined {
  return users.find(u => u.id === id);
}

// Good — O(1) lookup
const users = new Map<string, User>();
function findUser(id: string): User | undefined {
  return users.get(id);
}

// Good — O(1) membership test
const activeUserIds = new Set<string>();
function isUserActive(id: string): boolean {
  return activeUserIds.has(id);
}

// Bad — O(n²) intersection
function findCommon(list1: string[], list2: string[]): string[] {
  return list1.filter(a => list2.includes(a));
}

// Good — O(n) intersection
function findCommon(list1: string[], list2: string[]): string[] {
  const set2 = new Set(list2);
  return list1.filter(a => set2.has(a));
}
```

### Parallel Async Operations

```typescript
// Bad — sequential (slow)
async function loadData() {
  const users = await fetchUsers();
  const posts = await fetchPosts();
  return { users, posts };
}

// Good — parallel (fast)
async function loadData() {
  const [users, posts] = await Promise.all([
    fetchUsers(),
    fetchPosts(),
  ]);
  return { users, posts };
}
```

### Avoid Unnecessary Iterations

```typescript
// Bad — multiple iterations
const active = users.filter(u => u.isActive);
const names = active.map(u => u.name);

// Good — single chain
const names = users.filter(u => u.isActive).map(u => u.name);

// Good — early termination
function findFirstActive(users: User[]): User | undefined {
  return users.find(u => u.isActive);
}
```

### Bundle Size

```typescript
// Bad — imports entire library
import _ from 'lodash';

// Good — import only what you need
import debounce from 'lodash/debounce';

// Good — dynamic import for heavy modules
const { HeavyComponent } = await import('./HeavyComponent');
```

### React Performance

```typescript
// Memoize expensive components
const UserCard = React.memo(({ user }: { user: User }) => (
  <div>{user.name}</div>
));

// Memoize expensive calculations
const stats = useMemo(() => calculateComplexStats(data), [data]);

// Stable callbacks
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []);

// Stable object deps — primitive deps only
useEffect(() => {
  fetchUser({ id: userId });
}, [userId]); // NOT [{ id: userId }] which recreates every render
```

### Memory Leak Prevention

```typescript
// Bad — no cleanup
function Component() {
  useEffect(() => {
    window.addEventListener('resize', handler);
  }, []);
}

// Good — cleanup on unmount
function Component() {
  useEffect(() => {
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
}

// Good — cleanup timers
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);

// Good — cleanup subscriptions
useEffect(() => {
  const sub = observable$.subscribe(handler);
  return () => sub.unsubscribe();
}, []);
```

## Performance Review Checklist

### Compilation
- [ ] `strict: true` enabled (enables faster variance checks via `strictFunctionTypes`)
- [ ] `incremental: true` for faster recompiles
- [ ] `skipLibCheck: true` for build speed
- [ ] `include` limited to source directories only
- [ ] `exclude` includes `**/node_modules` and `**/.*/`
- [ ] `types` field explicitly set (avoid loading all `@types`)
- [ ] Interfaces preferred over intersections for object types
- [ ] Return type annotations on complex functions
- [ ] Large unions replaced with base type + subtypes
- [ ] Complex conditional types extracted to named aliases
- [ ] Recursion depth bounded in recursive types

### Runtime
- [ ] No O(n²) algorithms where O(n) is possible
- [ ] Map/Set for lookups instead of Array.find/includes
- [ ] Promise.all for independent async operations
- [ ] Event listeners, subscriptions, timers cleaned up
- [ ] Named imports instead of whole-library imports
- [ ] Dynamic imports for heavy modules
- [ ] React: memo/useMemo/useCallback where needed