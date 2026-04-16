# Contributing to Taxeasy

## Development setup

```bash
pnpm install
pnpm dev        # Vite dev server (web preview)
pnpm test:run   # Vitest unit tests
pnpm lint       # Biome lint + format check
pnpm tsc --noEmit  # TypeScript type check
```

## Commit conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `style`

## UI changes

Every PR that touches UI must pass the checklist in [`docs/UI-CHECKLIST.md`](docs/UI-CHECKLIST.md).

## Branch workflow

- Feature work: branch off `main`, open a PR
- Do not push directly to `main`
- CI must be green before merging

## Lint baseline

Running `pnpm lint` will report errors. Do not increase the error count in your PR.
Pre-existing errors in files you did not touch are acceptable; new errors are not.
