# TypeScript Security Checklist

Security considerations for TypeScript code reviews. Check these during every review.

## Input Validation & Sanitization

### Validate All External Data

External data (request bodies, query params, env vars, file contents) must be validated at trust boundaries before use.

```typescript
// Bad — no validation
function createUser(data: any) {
  return db.insert('users', data);
}

// Good — schema validation with Zod
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

type User = z.infer<typeof UserSchema>;

function createUser(data: unknown): User {
  return UserSchema.parse(data); // Throws if invalid
}
```

### Validate at Trust Boundaries

Validate once at the boundary, then trust types internally. Don't re-validate inside pure functions.

```typescript
// API boundary — validate once
app.post('/users', (req, res) => {
  const user = UserSchema.parse(req.body); // Trust boundary
  processUser(user); // Typed, no re-validation needed
});

// Internal — trust the type
function processUser(user: User): void {
  // user is already validated
}
```

---

## XSS Prevention

### Never Use `innerHTML` with Unsanitized Input

```typescript
// Bad — XSS vulnerability
function displayComment(comment: string) {
  document.getElementById('comment')!.innerHTML = comment;
}

// Good — use textContent for plain text
function displayComment(comment: string) {
  const el = document.getElementById('comment');
  if (el) el.textContent = comment;
}

// Good — sanitize for rich content
import DOMPurify from 'dompurify';

function displayRichContent(html: string) {
  const el = document.getElementById('content');
  if (el) el.innerHTML = DOMPurify.sanitize(html);
}
```

### Never Use `eval` or `Function` Constructor

```typescript
// Bad — arbitrary code execution
const result = eval(userExpression);
const fn = new Function('return ' + userInput);

// Good — use safe parsers
import { evaluate } from 'mathjs';
const result = evaluate(userExpression);
```

---

## SQL/NoSQL Injection Prevention

### Use Parameterized Queries

```typescript
// Bad — SQL injection
function getUser(email: string) {
  return db.query(`SELECT * FROM users WHERE email = '${email}'`);
}

// Good — parameterized query
function getUser(email: string) {
  return db.query('SELECT * FROM users WHERE email = $1', [email]);
}

// Good — ORM with type safety
function getUser(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}
```

### Validate Query Parameters

```typescript
// Good — validate against known values before query
type UserRole = 'admin' | 'user' | 'guest';

function isRole(role: string): role is UserRole {
  return ['admin', 'user', 'guest'].includes(role);
}

function getUsersByRole(role: string) {
  if (!isRole(role)) throw new Error('Invalid role');
  return db.query('SELECT * FROM users WHERE role = $1', [role]);
}
```

---

## Secrets Management

### Never Hardcode Secrets

```typescript
// Bad — secrets in source code
const API_KEY = 'sk_live_abc123xyz789';
const DB_URL = 'postgresql://user:password@localhost:5432/db';

// Good — environment variables with validation
const EnvSchema = z.object({
  API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

const env = EnvSchema.parse(process.env);
// env is fully typed — no string | undefined

export const config = {
  apiKey: env.API_KEY,
  databaseUrl: env.DATABASE_URL,
};
```

### Don't Log Sensitive Data

```typescript
// Bad — logging secrets
console.log(`Login: ${email}:${password}`);

// Good — log only non-sensitive data
logger.info('Login attempt', { email, timestamp: new Date().toISOString() });
```

---

## CSRF Protection

### Set Proper CORS and CSRF Headers

```typescript
// Bad — allow all origins
app.use(cors({ origin: '*' }));

// Good — specific allowed origins
app.use(cors({
  origin: ['https://example.com', 'https://app.example.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

---

## Authentication & Authorization

### Hash Passwords, Never Store Plain Text

```typescript
import bcrypt from 'bcrypt';

async function createUser(email: string, password: string): Promise<User> {
  const hashedPassword = await bcrypt.hash(password, 10);
  return db.insert('users', { email, password: hashedPassword });
}

async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}
```

### Cryptographically Secure Session Tokens

```typescript
import crypto from 'crypto';

// Good — use crypto.randomBytes for tokens
function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
```

### Rate Limit Authentication Endpoints

```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/login', loginLimiter, handleLogin);
```

### Don't Expose Sensitive Data in API Responses

```typescript
// Bad — exposing password hash
interface User {
  id: string;
  email: string;
  password: string;
}

// Good — separate public type
type PublicUser = Omit<User, 'password'>;

function toPublicUser(user: User): PublicUser {
  const { password, ...publicUser } = user;
  return publicUser;
}
```

---

## Path Traversal Prevention

### Validate File Paths

```typescript
import path from 'path';

function readFile(filename: string): string {
  const safeDir = '/app/uploads';
  const safePath = path.normalize(path.join(safeDir, filename));

  if (!safePath.startsWith(safeDir)) {
    throw new Error('Invalid file path');
  }

  return fs.readFileSync(safePath, 'utf-8');
}
```

---

## Type Safety as Security

### Branded Types Prevent Mixing Primitives

```typescript
type UserId = Branded<string, 'UserId'>;
type OrderId = Branded<string, 'OrderId'>;

// Can't accidentally pass OrderId where UserId is expected
function getUser(id: UserId): Promise<User> { /* ... */ }
```

### Tagged Template Literals for SQL

```typescript
import { sql } from 'your-db-library';

function getUserByEmail(email: string) {
  return db.query(sql`SELECT * FROM users WHERE email = ${email}`);
}
```

---

## Security Headers

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---

## Security Review Checklist

- [ ] All user input validated at trust boundaries (Zod/io-ts)
- [ ] No hardcoded secrets or credentials
- [ ] Environment variables validated at startup
- [ ] SQL/NoSQL queries use parameterization
- [ ] Passwords hashed (never stored plain text)
- [ ] Authentication has rate limiting
- [ ] Session tokens are cryptographically secure
- [ ] CORS properly configured (not `*`)
- [ ] CSRF protection implemented
- [ ] Sensitive data not exposed in API responses
- [ ] Authorization checks on all protected operations
- [ ] Dependencies audited (`npm audit`)
- [ ] File paths validated (no path traversal)
- [ ] No `eval()` or `Function` constructor
- [ ] HTML output sanitized (XSS prevention)
- [ ] Security headers set (CSP, HSTS, X-Frame-Options)
- [ ] Sensitive data not logged
- [ ] Error messages don't expose system details
- [ ] HTTPS enforced in production