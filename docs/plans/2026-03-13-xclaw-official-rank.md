# XClaw Official Rank Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch XHunt rank fetching to the official XClaw rank API and use only Chinese community rank for cross-validation.

**Architecture:** Replace the public proxy call in `src/lib/xhunt.ts` with a server-side `POST /data/rank` request against `https://pro.xclaw.info`, authenticated via `XCLAW_API_KEY`. Parse `kolCnRank` as the canonical rank signal and preserve the existing cross-validation logic.

**Tech Stack:** Next.js, TypeScript, Node test runner

---

### Task 1: Add failing tests for official rank fetching

**Files:**
- Modify: `tests/xhunt.test.ts`

**Step 1: Write the failing tests**

- Add tests for:
  - extracting `kolCnRank` from the official response
  - sending `POST /data/rank` with `X-API-KEY` and `{ handle }`
  - returning `unavailable` when the key is missing or the API errors

**Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/xhunt.test.ts`

Expected: FAIL because the current implementation still calls the public proxy and reads `kolRank`.

### Task 2: Implement official XClaw rank fetching

**Files:**
- Modify: `src/lib/xhunt.ts`

**Step 1: Replace public proxy fetching**

- Build a `POST https://pro.xclaw.info/data/rank` request
- Send `X-API-KEY` from `process.env.XCLAW_API_KEY`
- Parse `kolCnRank` as the only rank signal

**Step 2: Preserve graceful degradation**

- Keep `available / unavailable / unranked` semantics
- Do not hardcode secrets

**Step 3: Run targeted tests**

Run: `npm test -- tests/xhunt.test.ts`

Expected: PASS

### Task 3: Final verification

**Files:**
- Test: `tests/xhunt.test.ts`
- Test: `tests/scoring-calibration.test.ts`
- Test: `tests/ai-labeler.test.ts`
- Test: `tests/twitter.test.ts`
- Test: `tests/lookup-service.test.ts`
- Test: `tests/build-config.test.ts`

**Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS

**Step 2: Run the production build**

Run: `npm run build`

Expected: PASS
