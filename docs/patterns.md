# Coding Patterns

Expected patterns for all code in the proletariat CLI. These rules are enforced by ESLint where possible and by code review otherwise.

## Error Handling

**Rule: Never swallow errors silently.**

Every `catch` block must either:
1. Log the error (at minimum with context about what failed)
2. Rethrow the error (possibly wrapped)
3. Return a meaningful fallback with a comment explaining why ignoring is safe

```typescript
// BAD — silent swallow, makes debugging impossible
try {
  await fetchData()
} catch {}

// GOOD — log with context
try {
  await fetchData()
} catch (error) {
  log.warn('Failed to fetch data, using cached version', { error })
}

// GOOD — cleanup where failure is truly safe to ignore (with comment)
try { db.close() } catch { /* db handle may already be invalid during cleanup */ }

// GOOD — rethrow with context
try {
  await migrate(db)
} catch (error) {
  throw new Error(`Migration failed for ${dbPath}: ${error}`)
}
```

**Enforced by:** ESLint `no-empty` (error, `allowEmptyCatch: false`)

## Return Patterns

**Rule: Use early returns for guard clauses. Keep the main logic path at the lowest indentation.**

```typescript
// GOOD — guards at the top, main logic unindented
function processTicket(ticket: Ticket | null): Result {
  if (!ticket) return { status: 'skipped' }
  if (ticket.archived) return { status: 'archived' }

  const result = doWork(ticket)
  return { status: 'done', result }
}

// BAD — deeply nested main logic
function processTicket(ticket: Ticket | null): Result {
  if (ticket) {
    if (!ticket.archived) {
      const result = doWork(ticket)
      return { status: 'done', result }
    } else {
      return { status: 'archived' }
    }
  } else {
    return { status: 'skipped' }
  }
}
```

## Null Handling

**Rule: Prefer `undefined` over `null` for optional values. Use TypeScript strict null checks.**

- Function parameters that may be absent: use `param?: Type` (which is `Type | undefined`)
- Return "not found" results: return `undefined`, not `null`
- Only use `null` when interfacing with external APIs that explicitly use it (e.g., JSON, SQL)

```typescript
// GOOD
function findTicket(id: string): Ticket | undefined {
  return tickets.get(id)
}

// BAD — mixing null into internal APIs
function findTicket(id: string): Ticket | null {
  return tickets.get(id) ?? null
}
```

**Exception:** Database columns and JSON APIs naturally use `null`. Don't convert at the boundary — let the type flow until it's consumed.

## Imports

**Rule: No unused imports. No unused variables.**

Remove imports as soon as they're no longer needed. Don't leave commented-out imports.

**Enforced by:** ESLint `@typescript-eslint/no-unused-vars` (error, with `_` prefix exception for intentionally unused parameters)

```typescript
// Unused parameters that must exist for interface compliance: prefix with _
function handler(_req: Request, res: Response) {
  res.send('ok')
}
```

## Dead Code

**Rule: Delete it. Don't comment it out.**

- No commented-out code blocks. Git history preserves everything.
- No unreachable code after `return`, `throw`, `break`, or `continue`.
- No unused exports. If nothing imports it, remove it.
- No deprecated aliases kept "just in case." If the old name isn't called, delete the alias.

**Enforced by:** ESLint `no-unreachable` (error), `@typescript-eslint/no-unused-vars` (error)

## Duplicate Code

**Rule: One canonical implementation per concept.**

When the same logic exists in multiple places:
1. Identify which implementation is more complete/correct
2. Move it to a shared module (e.g., `lib/execution/session-utils.ts`)
3. Have all callers import the shared version
4. Delete the duplicates

Example: Session name parsing lives in `session-utils.ts`. Don't create local regex copies in other modules.

## Naming

**Rule: No metadata encoded in IDs or names.**

Don't pack ticket IDs, roles, or HQ info into session names and then regex-parse them back out. Use structured fields and typed objects instead.

```typescript
// BAD — encoding and parsing metadata from strings
const sessionName = `${ticketId}-${action}-${agentName}`
const parsed = sessionName.match(/^(TKT-\d+)-(\w+)-(.+)$/)

// BETTER — pass structured data through typed interfaces
interface ExecutionContext {
  ticketId: string
  action: string
  agentName: string
}
```

**Exception:** Tmux session names are string-only by design. The `parseSessionName()` / `buildExpectedSessionName()` pair in `session-utils.ts` is the canonical way to handle this. Don't create additional parsers.

## TypeScript

**Rule: Minimize `any`. Prefer `unknown` for truly unknown types.**

- `@typescript-eslint/no-explicit-any` is set to `warn` — new code should avoid `any`
- Use `unknown` and narrow with type guards when the type is genuinely unknown
- Use generics when the type varies but is constrained

```typescript
// BAD
function parse(data: any): any { ... }

// GOOD
function parse(data: unknown): ParsedResult {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected object')
  }
  // narrow from here
}
```

## Process Exit

**Rule: Only call `process.exit()` in CLI entry points.**

Library code should throw errors. Only top-level command handlers or the CLI entry point should call `process.exit()`. This makes code testable and composable.

## Async Patterns

**Rule: Use `await` in loops only when sequential execution is required.**

```typescript
// GOOD — parallel when operations are independent
const results = await Promise.all(tickets.map(t => processTicket(t)))

// GOOD — sequential when order matters (e.g., database migrations)
for (const migration of migrations) {
  await migration.run(db)
}
```

**Enforced by:** ESLint `no-await-in-loop` (warn)
