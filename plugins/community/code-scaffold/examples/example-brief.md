# Example brief

> Scaffold a REST API with Express + TypeScript for a todo app.
> CRUD endpoints, Zod validation, Drizzle ORM with SQLite.
> Include tests with Vitest.

## Expected output

```
src/
  index.ts           — entry point, server setup
  routes/
    todos.ts         — CRUD route handlers
  db/
    schema.ts        — Drizzle schema
    client.ts        — DB connection
  middleware/
    validate.ts      — Zod validation middleware
  types/
    todo.ts          — shared types
tests/
  todos.test.ts      — endpoint tests
package.json
tsconfig.json
```

## Plugin inputs for this example

```json
{
  "brief": "REST API with Express + TypeScript for a todo app. CRUD endpoints, Zod validation, Drizzle ORM with SQLite. Include tests with Vitest.",
  "language": "TypeScript",
  "outputDir": "."
}
```
