# TypeScript Common Anti-Patterns

Mistakes and anti-patterns to avoid, with better alternatives.

## Type System Anti-Patterns

### Using `any` as an Escape Hatch

```typescript
// Bad — defeats type safety
function processData(data: any): any {
  return data.value * 2;
}

// Good — validate with unknown
function processData(data: unknown): number {
  if (isValidData(data)) {
    return data.value * 2;
  }
  throw new Error('Invalid data');
}

function isValidData(data: unknown): data is DataInput {
  return (
    typeof data === 'object' &&
    data !== null &&
    'value' in data &&
    typeof (data as DataInput).value === 'number'
  );
}
```

Every `any` makes invalid states representable. Replace with `unknown` + type guards.

### Excessive Type Assertions

```typescript
// Bad — bypasses type checking
const user = data as User;

// Good — validate structure with type guard
if (isUser(data)) {
  const user = data; // TypeScript narrows to User
}
```

### Regular Enums

```typescript
// Bad — generates runtime code, tree-shaking issues
enum Status {
  Pending,
  Approved,
  Rejected,
}

// Good — union type (no runtime code)
type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

// Best — const object + union (both types and values)
const Status = {
  Pending: 'PENDING',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
} as const;

type Status = typeof Status[keyof typeof Status];
```

### Missing Discriminator on Unions

```typescript
// Bad — no discriminator, unreliable narrowing
type Result = { data: string } | { error: string };

// Good — discriminator enables reliable narrowing
type Result = { type: 'success'; data: string } | { type: 'error'; error: string };
```

### Type Widening

```typescript
// Bad — literal widened to string
let status = 'pending';
status = 'approved'; // OK, but lose specificity

// Good — explicit literal type or const assertion
let status: 'pending' | 'approved' | 'rejected' = 'pending';
const status = 'pending' as const;
```

### Unsafe Type Coercion

```typescript
// Bad — unsafe cast
const value: number = someValue as number;

// Good — validate before converting
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  throw new Error('Value is not a number');
}
```

## Function Anti-Patterns

### Too Many Parameters

```typescript
// Bad — hard to remember, prone to mistakes
function createUser(id: string, name: string, email: string, age: number, role: string) {}

// Good — object parameter with named properties
interface CreateUserParams {
  id: string;
  name: string;
  email: string;
  age: number;
  role: string;
}

function createUser(params: CreateUserParams) {}
```

Limit to 2-3 parameters. More than that should use an object parameter.

### Boolean Flags for Behavior

```typescript
// Bad — flag changes behavior, unclear at call site
function getUsers(includeInactive: boolean) {}

// Good — separate functions with clear intent
function getActiveUsers() {}
function getAllUsers() {}

// Or discriminated union for complex cases
type UserFilter = { type: 'all' } | { type: 'active' } | { type: 'byRole'; role: string };
function getUsers(filter: UserFilter) {}
```

### Optional Parameters Before Required

```typescript
// Bad — optional before required
function createUser(name?: string, id: string) {}

// Good — required before optional
function createUser(id: string, name?: string) {}
```

### Side Effects in Functions

```typescript
// Bad — hidden side effect
function getUser(id: string): User {
  void cache.set(id, user); // side effect
  return user;
}

// Good — pure function, side effects explicit
function getUser(id: string): User {
  return user;
}

// Side effect handled separately
cache.set(id, user);
```

Prefer pure functions: same input always produces same output, no observable side effects. Pure functions are easier to reason about, test, debug, parallelize, and compose.

## Async Anti-Patterns

### Mixing Callbacks and Promises

```typescript
// Bad — confusing mix of async styles
function fetchData(callback: (data: Data) => void): Promise<void> {
  return fetch('/api/data')
    .then(r => r.json())
    .then(data => callback(data));
}

// Good — consistent async/await
async function fetchData(): Promise<Data> {
  const response = await fetch('/api/data');
  return response.json();
}
```

### Unhandled Promise Rejections

```typescript
// Bad — may crash or cause unexpected behavior
async function loadUser() {
  const user = await fetchUser();
  return user;
}

// Good — proper error handling
async function loadUser(): Promise<User> {
  try {
    const user = await fetchUser();
    return user;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to load user:', error.message);
    }
    throw error;
  }
}
```

### Sequential Awaits When Parallel Is Possible

```typescript
// Bad — sequential (slow)
async function getData() {
  const users = await fetchUsers();
  const posts = await fetchPosts();
  const comments = await fetchComments();
  return { users, posts, comments };
}

// Good — parallel (fast)
async function getData() {
  const [users, posts, comments] = await Promise.all([
    fetchUsers(),
    fetchPosts(),
    fetchComments(),
  ]);
  return { users, posts, comments };
}
```

## Array & Object Anti-Patterns

### Mutating Instead of Creating New

```typescript
// Bad — mutates input
function addItem(users: User[], newUser: User) {
  users.push(newUser);
  return users;
}

// Good — immutable, readonly input
function addItem(users: readonly User[], newUser: User): User[] {
  return [...users, newUser];
}
```

### Using `delete` to Remove Properties

```typescript
// Bad — slow, mutable, confuses type inference
function removePassword(user: User): PublicUser {
  const result = { ...user };
  delete result.password;
  return result;
}

// Good — destructuring with rest
function removePassword(user: User): PublicUser {
  const { password, ...publicUser } = user;
  return publicUser;
}
```

### `forEach` When `map`/`filter`/`reduce` Are Better

```typescript
// Bad — imperative, pushes to external array
const names: string[] = [];
users.forEach(user => names.push(user.name));

// Good — declarative
const names = users.map(user => user.name);
```

Use `map`, `filter`, `reduce` — they express intent and are more composable.

## Class Anti-Patterns

### Classes When Interfaces Would Suffice

```typescript
// Bad — unnecessary class for data
class User {
  constructor(public id: string, public name: string, public email: string) {}
}

// Good — simple interface + object literal
interface User {
  id: string;
  name: string;
  email: string;
}

const user: User = { id: '1', name: 'Alice', email: 'alice@example.com' };
```

## Import/Export Anti-Patterns

### Missing `import type`

```typescript
// Bad — type imported as value, may be bundled
import { User } from './types';

// Good — type-only import, tree-shakeable
import type { User } from './types';
```

### Circular Dependencies

```typescript
// Bad — file1 imports file2, file2 imports file1
// Extract shared code to a third module or refactor to remove the cycle.
```

### Barrel Exports with Side Effects

```typescript
// Bad — imports everything
export * from './module1';
export * from './module2';
// Importing one thing loads all modules

// Good — import directly from the module
import { oneFunction } from './modules/module1';
```

## Error Handling Anti-Patterns

### Catching Without Proper Typing

```typescript
// Bad — error is unknown
try {
  await fetchData();
} catch (error) {
  console.log(error.message); // Error: 'error' is of type 'unknown'
}

// Good — check error type
try {
  await fetchData();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('An unknown error occurred');
  }
}
```

### Throwing Non-Error Objects

```typescript
// Bad — no stack trace
throw 'User not found';
throw { message: 'User not found', code: 404 };

// Good — Error objects have stack traces
throw new Error('User not found');

// Best — custom error classes for domain errors
class UserNotFoundError extends Error {
  constructor(public userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}
```

## Naming & Readability Anti-Patterns

### Magic Numbers

```typescript
// Bad — what does 86400000 mean?
setTimeout(refresh, 86400000);

// Good — named constant with intent
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
setTimeout(refresh, MILLISECONDS_PER_DAY);
```

### Boolean Naming

```typescript
// Bad — unclear what true/false means
function process(enabled: boolean) {}
const active = true;

// Good — is/has prefix for booleans
function process(isEnabled: boolean) {}
const isActive = true;
const hasPermission = checkPermission(user);
```

### Vague Names

```typescript
// Bad
const x1 = getData();
const fe2 = process(x1);

// Good
const users = fetchUsers();
const activeUsers = filterActiveUsers(users);
```

Names should reveal intent. `isLegalDrinkingAge()` is better than `isOverEighteen()` because the legal age varies by context.

## Type Inference Anti-Patterns

### Over-Specifying Types

```typescript
// Bad — unnecessary annotations on simple assignments
const name: string = 'Alice';
const age: number = 30;

// Good — let TypeScript infer
const name = 'Alice';
const age = 30;
```

Still annotate function parameters and return types — those are contract boundaries.

### Not Using `satisfies`

```typescript
// Bad — assertion loses literal types
const config: Record<string, string | number> = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
};
// config.apiUrl is string, not 'https://api.example.com'

// Good — validates without widening
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} satisfies Record<string, string | number>;
// config.apiUrl is 'https://api.example.com'
```

## Testing Anti-Patterns

### Using `any` in Tests

```typescript
// Bad — defeats type safety
const mockUser: any = { name: 'Alice' };

// Good — proper typing
const mockUser: User = { id: '1', name: 'Alice', email: 'alice@example.com' };
```

### Not Testing Type Failures

```typescript
// Good — verify types prevent invalid usage
// @ts-expect-error — should not accept number
createUser(123);

// @ts-expect-error — should require email
createUser({ name: 'Alice' });
```

## Performance Anti-Patterns

### Deeply Recursive Types

```typescript
// Bad — very slow compilation
type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

// Good — limit recursion depth
type DeepPartial<T, Depth extends number = 5> = Depth extends 0
  ? T
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P], Prev[Depth]> }
  : T;

type Prev = [never, 0, 1, 2, 3, 4, ...0[]];
```

### Missing `as const`

```typescript
// Bad — widens to general types
const config = { apiUrl: 'https://api.example.com', timeout: 5000 };
// config.apiUrl is string

// Good — preserves literal types
const config = { apiUrl: 'https://api.example.com', timeout: 5000 } as const;
// config.apiUrl is 'https://api.example.com'
```