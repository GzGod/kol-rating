# XClaw Official Rank Integration Design

## Goal

Replace the brittle public XHunt rank fetch with the official XClaw API and use only the Chinese community rank for cross-validation.

## Recommendation

- Switch rank fetching in `src/lib/xhunt.ts` from the public proxy to the official `POST https://pro.xclaw.info/data/rank`
- Authenticate with `X-API-KEY` from a server-side environment variable
- Parse `kolCnRank` only
- Keep the existing cross-validation verdict logic unchanged, feeding it the Chinese-community rank as the canonical XHunt rank

## Scope

- Modify `src/lib/xhunt.ts`
- Update `tests/xhunt.test.ts`
- Do not hardcode the provided API key in source code
- Do not change cross-validation copy or thresholds in this step

## Error Handling

- Missing `XCLAW_API_KEY` -> return `unavailable`
- Non-200 or invalid JSON -> return `unavailable`
- Missing `kolCnRank` in an otherwise valid response -> return `unranked`

## Validation

- Add tests that prove:
  - `kolCnRank` is preferred
  - the official endpoint is called with `POST`, JSON body, and `X-API-KEY`
  - auth/API failures degrade gracefully
- Run the full test suite and production build
