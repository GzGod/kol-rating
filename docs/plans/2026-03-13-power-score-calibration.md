# Power Score Calibration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recalibrate Power Score so score distribution spreads out and `A` no longer captures most ordinary KOLs.

**Architecture:** Update the existing engagement, expertise, health, and tier functions in place, preserving the current score breakdown interfaces while swapping in the V2.1 calibration formulas. Use optional inputs for signals that are only available in live lookups, and skip the unsupported follow/unfollow rule instead of inventing data.

**Tech Stack:** Next.js, TypeScript, Prisma, Node test runner

---

### Task 1: Add failing calibration tests

**Files:**
- Create: `tests/scoring-calibration.test.ts`

**Step 1: Write the failing tests**

- Add unit tests for:
  - engagement scale and efficiency using the new formulas
  - posting stability step thresholds
  - health anomaly rewards and penalties
  - new tier thresholds

**Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/scoring-calibration.test.ts`

Expected: FAIL because the current formulas still use the old floors and thresholds.

### Task 2: Implement calibrated engagement and expertise

**Files:**
- Modify: `src/lib/score/engagement.ts`
- Modify: `src/lib/score/content-expertise.ts`

**Step 1: Update engagement formulas**

- Replace the scale curve with the new shifted logarithmic formula
- Replace the efficiency multiplier with `2.2`

**Step 2: Update posting stability**

- Replace linear week coverage with the V2.1 step mapping

**Step 3: Run targeted tests**

Run: `npm test -- tests/scoring-calibration.test.ts`

Expected: engagement and expertise assertions pass, health/tier assertions still fail until the next task.

### Task 3: Implement calibrated health and tiers

**Files:**
- Modify: `src/lib/score/account-health.ts`
- Modify: `src/lib/score/calculator.ts`
- Modify: `src/lib/transient-lookup.ts`
- Modify: `src/lib/utils.ts`

**Step 1: Expand health inputs to support feasible V2.1 signals**

- Add optional account-created timestamp and tweet-publish timestamps
- Implement:
  - base anomaly score `70`
  - positive rewards for high follower/following ratio, older account when known, and reach rate > 0.3
  - penalties for low follower/following ratio, low reach on >10K followers, >50 tweets in a day, and repeated tweet format >70%
- Leave `follow/unfollow > 500/90d` unimplemented

**Step 2: Update callers**

- Pass the live account creation time where available
- Pass tweet publish timestamps/texts needed for anomaly detection
- Update tier thresholds to `88 / 75 / 55 / 35`

**Step 3: Run targeted tests**

Run: `npm test -- tests/scoring-calibration.test.ts`

Expected: PASS

### Task 4: Final verification

**Files:**
- Test: `tests/scoring-calibration.test.ts`
- Test: `tests/ai-labeler.test.ts`
- Test: `tests/twitter.test.ts`
- Test: `tests/lookup-service.test.ts`
- Test: `tests/build-config.test.ts`
- Test: `tests/xhunt.test.ts`

**Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS

**Step 2: Run the production build**

Run: `npm run build`

Expected: PASS
