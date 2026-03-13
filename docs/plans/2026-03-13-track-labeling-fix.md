# Track Labeling Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the AI labeling pipeline so classification returns stable Web3 track labels instead of collapsing to `Other`, and reduce latency by removing avoidable serial AI waits.

**Architecture:** The fix keeps AI as the first classifier, then normalizes model output into the approved taxonomy, applies lightweight keyword fallback for still-unclassified Web3 tweets, and uses `Other` only as the last resort. The AI client also gains timeout, retry, and latency logging, and shared callers switch to a parallel helper for track/style labeling. This preserves the existing score model while repairing both label quality and response time.

**Tech Stack:** Next.js, TypeScript, Node test runner

---

### Task 1: Add failing tests for track-labeling behavior

**Files:**
- Modify: `tests/xhunt.test.ts`
- Create: `tests/ai-labeler.test.ts`

**Step 1: Write the failing test**

- Add tests for:
  - `RWA` and `SocialFi` surviving validation
  - common synonyms mapping to standard tags
  - malformed AI output falling back per tweet rather than to all-`Other`
  - obvious Web3 tweets avoiding `Other`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ai-labeler.test.ts`

Expected: FAIL because the current labeler does not expose or support the new behavior.

**Step 3: Write minimal implementation**

- Add helpers for normalization and heuristic fallback
- Export only the minimal helpers needed for tests

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ai-labeler.test.ts`

Expected: PASS

### Task 2: Repair prompt and label taxonomy

**Files:**
- Modify: `src/lib/ai-labeler.ts`

**Step 1: Replace broken prompt text**

- Use the approved V2.1 Chinese prompt text
- Add `RWA` and `SocialFi` to the allowed taxonomy

**Step 2: Implement normalization and fallback**

- Normalize AI output to canonical tags
- Heuristically classify obvious Web3 content when AI output is unusable
- Add timeout/retry handling for AI requests
- Remove fixed inter-batch sleep
- Add a shared helper that runs track/style labeling in parallel

**Step 3: Verify targeted tests**

Run: `npm test -- tests/ai-labeler.test.ts`

Expected: PASS

### Task 3: Final verification

**Files:**
- Test: `tests/ai-labeler.test.ts`
- Modify: `src/app/api/lookup/route.ts`
- Modify: `src/lib/pipeline.ts`
- Test: `tests/twitter.test.ts`
- Test: `tests/lookup-service.test.ts`
- Test: `tests/build-config.test.ts`
- Test: `tests/xhunt.test.ts`

**Step 1: Run full test suite**

Run: `npm test`

Expected: PASS

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS
