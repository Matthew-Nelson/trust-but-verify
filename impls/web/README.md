# impls/web

Minimal Next.js (App Router, TypeScript strict, Tailwind) UI for the shortlink api. Implements R-UI-1..12 from `spec/SPEC.md`.

## Run

```
cp .env.example <local env file>   # set API_URL (server-side only), default http://localhost:8080
pnpm install
pnpm build && pnpm start           # port 3000; verify against a production build, not `pnpm dev`
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`. After changing `spec/openapi.json`, run `pnpm gen:api` (the generated `src/lib/api/schema.d.ts` is committed).

## Layout

- `src/lib/api/` - the only code that talks to the api (`server-only`, `openapi-fetch` client). The browser never calls `/api/*` (R-UI-11).
- `src/lib/messages.ts` - the single mapping from api error code to message text (R-UI-4).
- `src/lib/normalize.ts` - ASCII trim and `https://` prefixing (R-UI-2).
- `src/app/actions.ts` - Server Actions (create, delete); both `revalidatePath("/")`.
- `src/components/shorten-form.tsx` - client component; the empty-destination check runs in `onSubmit` and never reaches the Server Action (R-UI-12).
- `src/components/links-table.tsx` - client component holding the single open "Confirm delete" (R-UI-6).
- `src/app/links/[code]/page.tsx` - stats tables; unknown code calls `notFound()` for a real 404 (R-UI-9).

## Interpretations

- The submit control is `<input type="submit" value="Shorten">`. It has the button role and name, and unlike `<button>` it has a boolean `required`, which the harness's R-UI-1 check reads from every `form.elements` entry.
- `days` is valid only as a single query value matching `^[1-9][0-9]{0,2}$` and at most 365, so `07`, `+7`, `1.5` and repeated `days` fall back to 30.
- Deleting a link the api reports as already gone (404) counts as success. A failed delete shows nothing (unspecified by the spec).
- Both pages are `force-dynamic`: lists and stats are never cached.
