# Data layer — Mongoose, queries, yup, error contract

Data-layer fingerprint from the developer's real Node/Express/Mongoose backends.

## Mongoose schemas / models

- `new Schema<DocInterface>({...}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })` —
  typed off an imported domain interface (e.g. `IUser`, `IOrder`, kept in `types/` and imported with `.js`);
  `export default model('snake_case', Schema)` as the last line.
- Field defs are verbose objects: `{ type, required, min/maxLength, unique, index, enum, default }`. Closed
  sets as `enum: ['Good', 'Bad', 'VeryBad', 'Bonus']`. Inline sub-schemas with `{ _id: false }`.
- **Indexes:** field-level `index: true`, plus compound uniqueness via
  `Schema.index({ userId: 1, itemId: 1 }, { unique: true })`.
- **TTL idiom (distinctive):** `expires: 0` with a dynamic default —
  `{ type: Date, expires: 0, default: () => ms('24h') + Date.now() }`. Also
  `index: { expireAfterSeconds: 0, sparse: true }` on a nullable date.

## Queries

Fluent builder ending in **`.lean()`** for reads, with type generics: `.lean<LeanUser>()`. Chains like
`.find(filter).sort({ createdAt: -1 }).limit(limit + 1).skip(page * limit)`, projections via
`.select('-payload -__v')`, relations via `.populate('itemId', '-__v')`. Pagination fetches `limit + 1` to
compute `hasMore`. Aggregation pipelines are avoided in favour of the fluent builder.

## yup validation (backend)

`object().shape({...})` (or `object({...})`), PascalCase const (`RegisterSchema`), messages in the target
language, `.trim()` on strings, `.oneOf([...])`, `.matches(regex, msg)`, `.stripUnknown()` on patch schemas.
Validate with `await Schema.validate(body, { abortEarly: true })` in a try/catch that emits on failure:

```ts
let body;
try {
  body = await RegisterSchema.validate(req.body, { abortEarly: true });
} catch {
  throwHttpError(httpErrors.badRequest, Reason.MissingOrInvalidFields, res);
  return;
}
```

Schemas live **inline in the controller**, above the handlers.

## Error contract (HttpError / throwHttpError / Reason)

- `interface HttpError { statusCode: number; type: string; because: string | null; stack?: unknown }`.
- `httpErrors` is an object literal of status presets (`badRequest`, `unauthorized`, `notFound`, …) plus
  `serverError: (error) => ({...})`.
- `Reason` is a **real `enum`** with snake_case string values (`LoginRequired = 'login_required'`) — the
  one sanctioned `enum` use (closed value sets are otherwise string-union literals). It is **per-project**:
  add members to the error utils as new failure cases arise (e.g. `NotFound`, `MissingOrInvalidFields`);
  pass `null` when no specific reason fits.
- `throwHttpError(error, reason?, res?)`: with `res` it does `res.status(x).json(error)` and returns;
  without `res` it throws (for the service layer). **Always followed by a bare `return;`.**
- Global `errorHandler(error, _req, res, _next)` normalizes `SyntaxError`/unknown → serverError, logs
  `error.stack`, and **deletes the stack unless `DEBUG_MODE`**.
- ⚠️ Error-shape can drift between layers (an edge/proxy layer may use snake_case `status_code`/`because`
  and no shared interface) — **match the file you're editing**, don't blindly copy one shape across.

## Sanitization

At the trust boundary (e.g. an API gateway/proxy), strip Mongo operators + prototype pollution via
`stripDollarSign(stripPrototype(body))` and a per-path-segment `__proto__ → proto` map. Trim/empty-string-
to-null happens at the **yup `.trim()`** layer, not a universal body interceptor.
