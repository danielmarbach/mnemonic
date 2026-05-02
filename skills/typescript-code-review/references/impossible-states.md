# Making Invalid States Unrepresentable

Advanced TypeScript patterns that prevent invalid states at compile time. When types make invalid states impossible, LLMs and humans produce fewer bugs because mistakes don't compile.

## Branded Types — Distinguish Domain Primitives

When two values share the same primitive type but represent different domains, the type system can't prevent mixing them. Branded types fix this.

```typescript
declare const __brand: unique symbol;
type Branded<T, Brand> = T & { readonly [__brand]: Brand };

type UserId = Branded<string, 'UserId'>;
type OrderId = Branded<string, 'OrderId'>;
type Email = Branded<string, 'Email'>;
```

### Problem: Interchangeable Primitives

```typescript
function getUser(id: string): Promise<User> { /* ... */ }
function deleteOrder(id: string): Promise<void> { /* ... */ }

const userId = 'user_123';
const orderId = 'order_456';

// No compile error — but wrong!
deleteOrder(userId);
```

### Solution: Branded Types

```typescript
function createUserId(id: string): UserId {
  return id as UserId;
}

function getUser(id: UserId): Promise<User> { /* ... */ }
function deleteOrder(id: OrderId): Promise<void> { /* ... */ }

const userId = createUserId('user_123');

deleteOrder(userId);
//             ^? Error: UserId is not assignable to OrderId
```

### Smart Constructors with Validation

Branded types are most powerful when paired with validation — the only way to create a branded value is through a validated constructor:

```typescript
type Email = Branded<string, 'Email'>;

function parseEmail(input: string): Email | null {
  const trimmed = input.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }
  return trimmed as Email;
}

function sendEmail(to: Email, body: string): void {
  // Guaranteed valid — only creatable through parseEmail
}

// Must validate before calling sendEmail
const maybeEmail = parseEmail(userInput);
if (maybeEmail) {
  sendEmail(maybeEmail, 'Hello'); // Type-safe
}
```

### Assertion Variant

For cases where you'd rather throw than return null:

```typescript
function assertEmail(input: string): asserts input is Email {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())) {
    throw new Error(`Invalid email: ${input}`);
  }
}

let address: string = 'user@example.com';
assertEmail(address);
// address is now typed as Email
```

---

## Discriminated Unions with Mutual Exclusion

Prevent invalid combinations of properties by using `type` discriminators and `?: never` for mutual exclusion.

### Problem: Impossible Combinations Allowed

```typescript
interface Message {
  timestamp: number;
  sender: string;
  text?: string;
  imgPath?: string;
}

const ambiguous: Message = {
  timestamp: Date.now(),
  sender: 'alice',
  text: 'Hello',
  imgPath: '/image.png',
  // Both text AND imgPath — what does this mean?
};

const empty: Message = {
  timestamp: Date.now(),
  sender: 'alice',
  // Neither text NOR imgPath — is this valid?
};
```

### Solution: Discriminated Union with `never`

```typescript
type TextMessage = {
  type: 'text';
  timestamp: number;
  sender: string;
  text: string;
  imgPath?: never;  // Cannot coexist with text
};

type ImageMessage = {
  type: 'image';
  timestamp: number;
  sender: string;
  imgPath: string;
  text?: never;      // Cannot coexist with imgPath
};

type Message = TextMessage | ImageMessage;

const text: Message = {
  type: 'text',
  timestamp: Date.now(),
  sender: 'alice',
  text: 'Hello',
};

const image: Message = {
  type: 'image',
  timestamp: Date.now(),
  sender: 'alice',
  imgPath: '/image.png',
};

// Compiler catches invalid combinations:
const invalid: Message = {
  type: 'text',
  text: 'Hello',
  imgPath: '/image.png', // Error: imgPath is never
};
```

### Exhaustive Matching

Discriminated unions enable exhaustive pattern matching:

```typescript
function handleMessage(msg: Message): string {
  switch (msg.type) {
    case 'text': return msg.text.toUpperCase();
    case 'image': return msg.imgPath;
  }
}

// If a new type is added later, the above still compiles
// but exhaustive check catches it:
function handleMessageExhaustive(msg: Message): string {
  switch (msg.type) {
    case 'text': return msg.text.toUpperCase();
    case 'image': return msg.imgPath;
    default: {
      const exhaustive: never = msg;
      throw new Error(`Unhandled: ${exhaustive}`);
    }
  }
}
```

### API Response Pattern

```typescript
type SuccessResponse<T> = {
  status: 'success';
  data: T;
  error?: never;
};

type ErrorResponse<E = string> = {
  status: 'error';
  error: E;
  data?: never;
};

type ApiResponse<T, E = string> = SuccessResponse<T> | ErrorResponse<E>;

function handleResponse<T>(response: ApiResponse<T>): T {
  switch (response.status) {
    case 'success': return response.data;
    case 'error': throw new Error(response.error);
  }
}
```

---

## `never` for Exhaustiveness Checking

`never` is the type that has no values. Use it to guarantee all cases are handled.

### Exhaustive Switch

```typescript
type Status = 'pending' | 'approved' | 'rejected';

function handleStatus(status: Status): string {
  switch (status) {
    case 'pending': return 'Processing';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    default: {
      // If a new Status variant is added, this will error
      const exhaustive: never = status;
      throw new Error(`Unhandled status: ${exhaustive}`);
    }
  }
}
```

When someone adds `'cancelled'` to `Status`, the default branch fails to compile because `status` is no longer `never` — it's `string` (the unhandled case).

### Exhaustive Object Mapping

```typescript
type EventType = 'click' | 'hover' | 'focus';

// Error if any event is missing — the type doesn't satisfy the index signature
const handlers: { [K in EventType]: (e: Event) => void } = {
  click: handleClick,
  hover: handleHover,
  focus: handleFocus,
};
```

### Assert Unreachable

```typescript
function assertUnreachable(x: never): never {
  throw new Error(`Unreachable: ${x}`);
}

// Usage in switch/if chains
function processValue(value: string | number | boolean): string {
  if (typeof value === 'string') return value.toUpperCase();
  if (typeof value === 'number') return value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return assertUnreachable(value);
}
```

---

## `satisfies` over Type Assertions

`satisfies` (TypeScript 4.9+) validates a value against a type without widening or losing literal type information.

### Problem: Type Assertion Loses Literals

```typescript
const config: Record<string, string | number> = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
};

config.apiUrl;
// ^? string — lost the literal 'https://api.example.com'
```

### Solution: `satisfies`

```typescript
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} satisfies Record<string, string | number>;

config.apiUrl;
// ^? 'https://api.example.com' — literal preserved

config.timeout;
// ^? 5000 — literal preserved

// Still validates structure:
const badConfig = {
  apiUrl: 'https://api.example.com',
  timeout: false, // Error: boolean not assignable to string | number
} satisfies Record<string, string | number>;
```

### Ensuring Required Keys with `satisfies`

```typescript
const routes = {
  home: '/',
  about: '/about',
  contact: '/contact',
} satisfies Record<string, string>;

// routes.home is '/' not string
```

### Validating Object Shape Without Losing Types

```typescript
interface EnvConfig {
  DATABASE_URL: string;
  API_KEY: string;
  NODE_ENV: 'development' | 'production' | 'test';
}

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  API_KEY: process.env.API_KEY ?? '',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
} satisfies EnvConfig;

// env.NODE_ENV is 'development' | 'production' | 'test', not string
```

---

## Template Literal Types

Constrain strings to valid formats at the type level. Invalid formats don't compile.

### CSS-Value Patterns

```typescript
type SizeUnit = 'rem' | 'px' | 'em' | '%';
type Size = `${number}${SizeUnit}`;

const margin: Size = '1rem';   // OK
const padding: Size = '16px';  // OK
const broken: Size = 'abc';    // Error
const unitless: Size = '16';   // Error
```

### API Route Patterns

```typescript
type Version = 'v1' | 'v2';
type Resource = 'users' | 'orders' | 'products';
type ApiRoute = `/api/${Version}/${Resource}`;

const route: ApiRoute = '/api/v1/users';    // OK
const badRoute: ApiRoute = '/api/v3/users';  // Error
```

### Event Name Derivation

```typescript
type Events = {
  add: string;
  delete: string;
  move: string;
};

type On<T extends object> = {
  [K in keyof T as K extends string
    ? `on${Capitalize<K>}` : never]: () => void;
};

type Handlers = On<Events>;
// { onAdd: () => void; onDelete: () => void; onMove: () => void }
```

### RGB Parsing with `infer`

```typescript
type RgbInfer<T> = T extends `rgb(${infer R},${infer G},${infer B})`
  ? [R, G, B] : never;

type Valid = RgbInfer<'rgb(255,0,128)'>;
//   ^? ['255', '0', '128']

type Invalid = RgbInfer<'hsl(120, 100%, 50%)'>;
//   ^? never
```

### Constrained `infer` (TypeScript 4.7+)

```typescript
type RgbNumber<T> = T extends
  `rgb(${infer R extends number},${infer G extends number},${infer B extends number})`
  ? [R, G, B] : never;

type Valid = RgbNumber<'rgb(255,0,128)'>;
//   ^? [255, 0, 128]

type Invalid = RgbNumber<'rgb(red,0,128)'>;
//   ^? never — 'red' doesn't match number
```

---

## Literal Unions with `string & {}`

Get IDE autocomplete for known values while still accepting any string. This prevents typos for common values without restricting extensibility.

```typescript
type ImageMimeType =
  | 'image/bmp'
  | 'image/gif'
  | 'image/png'
  | 'image/svg+xml'
  | 'image/webp'
  | (string & {});

let mime: ImageMimeType = 'image/png';     // Autocomplete works
let custom: ImageMimeType = 'image/avif';  // Also valid
let invalid: ImageMimeType = 42;           // Error: not string
```

The `string & {}` trick works because `string & {}` simplifies to `string`, but the union with the literal types gives the IDE the autocomplete list.

---

## `as const` for Literal Types

Prevent type widening so the type system tracks exact values.

### Problem: Widened Types

```typescript
const colors = ['red', 'green', 'blue'];
//    ^? string[] — lost literal types

const config = { timeout: 5000, retries: 3 };
//    ^? { timeout: number; retries: number } — lost exact values
```

### Solution: `as const`

```typescript
const colors = ['red', 'green', 'blue'] as const;
//    ^? readonly ['red', 'green', 'blue']

type Color = typeof colors[number];
//   ^? 'red' | 'green' | 'blue'

const config = { timeout: 5000, retries: 3 } as const;
//    ^? { readonly timeout: 5000; readonly retries: 3 }
```

### Derived Type from Const Object

A common pattern combining `as const`, `satisfies`, and derived types:

```typescript
const HttpStatus = {
  Ok: 200,
  Created: 201,
  BadRequest: 400,
  Unauthorized: 401,
  NotFound: 404,
  InternalServerError: 500,
} as const;

type StatusCode = typeof HttpStatus[keyof typeof HttpStatus];
//   200 | 201 | 400 | 401 | 404 | 500

function handleStatus(code: StatusCode): string {
  // Exhaustive — adding a new status requires handling it here
  switch (code) {
    case HttpStatus.Ok: return 'OK';
    case HttpStatus.Created: return 'Created';
    case HttpStatus.BadRequest: return 'Bad Request';
    case HttpStatus.Unauthorized: return 'Unauthorized';
    case HttpStatus.NotFound: return 'Not Found';
    case HttpStatus.InternalServerError: return 'Internal Server Error';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled: ${exhaustive}`);
    }
  }
}
```

### Runtime + Type Sync with `as const` Arrays

Keep runtime values and type unions in sync — add a value in one place and the type updates automatically:

```typescript
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'user' | 'guest'

// Runtime validation using the same source
function isValidRole(role: string): role is Role {
  return ROLES.includes(role as Role);
}

// Adding 'moderator' to ROLES automatically updates the Role type
const ROLES = ['admin', 'user', 'guest', 'moderator'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'user' | 'guest' | 'moderator'
```

---

## Mapped Types for Event Handlers

Create type-safe handler objects from event definitions:

```typescript
type Events = {
  add: { id: string; name: string };
  delete: { id: string };
  move: { id: string; x: number; y: number };
};

type EventHandler<T extends object> = {
  [K in keyof T as K extends string
    ? `on${Capitalize<K>}` : never
  ]: (payload: T[K]) => void;
};

type Handlers = EventHandler<Events>;
// {
//   onAdd: (payload: { id: string; name: string }) => void;
//   onDelete: (payload: { id: string }) => void;
//   onMove: (payload: { id: string; x: number; y: number }) => void;
// }
```

This is a special case of template literal types in mapped types — the `on${Capitalize<K>}` pattern derives handler names from event names, maintaining type safety across the entire mapping.

---

## Recursive Type Patterns

### Deep Path Extraction

Create type-safe paths for nested objects:

```typescript
type Path<T> = T extends object
  ? { [K in keyof T]: [K] | [K, ...Path<T[K]>] }[keyof T]
  : never;

interface Form {
  a: string;
  b: { c: { d: string } };
}

type FormPath = Path<Form>;
// ['a'] | ['b'] | ['b', 'c'] | ['b', 'c', 'd']
```

### Tuple Generation with Fixed Length

```typescript
type Tuple<T, N extends number, R extends T[] = []> =
  R['length'] extends N ? R : Tuple<T, N, [...R, T]>;

type ThreeStrings = Tuple<string, 3>;
// [string, string, string]
```

### Promisify Callback-Based APIs

```typescript
type Callback = ((err?: Error) => void) | ((err: Error | null, result: unknown) => void);
type GetResult<Cb extends Callback> =
  Parameters<Cb>['length'] extends 2 ? Parameters<Cb>[1] : void;

type Promisified<Fn extends Function> =
  Fn extends (...args: [...infer Args, infer Cb extends Callback]) => void
    ? (...args: Args) => Promise<GetResult<Cb>>
    : never;
```

---

## Runtime Validation: Zod as Single Source of Truth

Define validation schemas once and infer TypeScript types from them. This eliminates the drift between runtime validation and compile-time types.

### Schema-First Type Inference

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'user', 'guest']),
  createdAt: z.string().transform(s => new Date(s)),
});

type User = z.infer<typeof UserSchema>;
// { id: string; email: string; name: string; role: 'admin' | 'user' | 'guest'; createdAt: Date }
```

No duplicate type + schema definitions. The schema is the source of truth.

### `parse` vs `safeParse`

```typescript
// parse — throws on invalid data (for trust boundaries where invalid data is a bug)
const user = UserSchema.parse(apiResponse);

// safeParse — returns result object (for user input where failure is expected)
const result = UserSchema.safeParse(formData);
if (!result.success) {
  setErrors(result.error.flatten().fieldErrors);
  return;
}
const user = result.data;
```

### Composing Schemas

```typescript
const BaseSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
});

const CreateUserSchema = BaseSchema.omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1),
  email: z.string().email(),
});

const UpdateUserSchema = CreateUserSchema.partial();
```

### Environment Variable Validation

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

const env = EnvSchema.parse(process.env);
// env is fully typed — no `string | undefined`
```

### Advanced: type-fest Utilities

For advanced type utilities beyond built-ins, [type-fest](https://github.com/sindresorhus/type-fest) provides:

- `Opaque<T, Token>` — cleaner branded types than manual `& { __brand }`
- `PartialDeep<T>` — recursive partial for nested objects
- `ReadonlyDeep<T>` — recursive readonly for immutable data
- `SetRequired<T, K>` / `SetOptional<T, K>` — targeted field modifications
- `Simplify<T>` — flatten complex intersection types in IDE tooltips

```typescript
import type { Opaque, PartialDeep, ReadonlyDeep } from 'type-fest';

type UserId = Opaque<string, 'UserId'>;
type UserPatch = PartialDeep<User>;
type ImmutableUser = ReadonlyDeep<User>;
```

---

## Review Checklist: Impossible States

When reviewing code, ask these questions:

- [ ] Can a `string` represent multiple domain concepts that should be distinct? → Branded types
- [ ] Can two properties be set simultaneously when only one should be? → Discriminated union with `?: never`
- [ ] Could a new union member be added without updating all handlers? → `never` exhaustiveness check
- [ ] Does `as X` lose literal type information? → `satisfies`
- [ ] Is a string type too broad when it could match a pattern? → Template literal types
- [ ] Could autocomplete help users pick known values while accepting custom ones? → Literal union with `string & {}`
- [ ] Can type widening lose information about exact values? → `as const`
- [ ] Could derived types (event handlers, route maps) be generated from source types? → Mapped types with template literals