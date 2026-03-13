# XHunt Cross Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add XHunt rank cross validation to homepage lookup results without affecting the existing Power Score pipeline.

**Architecture:** The lookup API remains the single aggregation point. After the existing lookup result is built, the server fetches XHunt rank, evaluates a cross-validation matrix, and returns the additional fields for homepage rendering. XHunt failures degrade gracefully and never fail the main lookup request.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner, server-side fetch

---

### Task 1: XHunt domain model and matrix

**Files:**
- Create: `src/lib/xhunt.ts`
- Test: `tests/xhunt.test.ts`

**Step 1: Write the failing test**

- Add tests for:
  - extracting a username/rank record from nested XHunt payloads
  - evaluating `实力认证`
  - evaluating `待激活`
  - evaluating `潜力新星`
  - returning `常规表现` or `unavailable`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/xhunt.test.ts`

Expected: FAIL because `src/lib/xhunt.ts` does not exist yet.

**Step 3: Write minimal implementation**

- Add XHunt parsing helpers
- Add XHunt fetch helper with graceful failure
- Add matrix evaluator and response types

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/xhunt.test.ts`

Expected: PASS

### Task 2: Lookup API enrichment

**Files:**
- Modify: `src/lib/lookup-types.ts`
- Modify: `src/app/api/lookup/route.ts`
- Test: `tests/xhunt.test.ts`

**Step 1: Write the failing test**

- Add a test that enriches an existing lookup result with XHunt data and verifies the extra fields are present.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/xhunt.test.ts`

Expected: FAIL because lookup response types and enrichment logic are missing.

**Step 3: Write minimal implementation**

- Extend lookup response types
- Enrich the final lookup result in `/api/lookup`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/xhunt.test.ts`

Expected: PASS

### Task 3: Homepage rendering

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Implement the UI**

- Render a new XHunt cross-validation card on the result page
- Show rank, status badge, explanation, and operator hint
- Show an unavailable state when XHunt cannot be fetched

**Step 2: Run build verification**

Run: `npm run build`

Expected: PASS

### Task 4: Final verification

**Files:**
- Test: `tests/xhunt.test.ts`
- Test: `tests/twitter.test.ts`
- Test: `tests/lookup-service.test.ts`
- Test: `tests/build-config.test.ts`

**Step 1: Run full test suite**

Run: `npm test`

Expected: PASS

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS
