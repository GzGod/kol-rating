# Engagement Efficiency Smoothing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fixed efficiency multiplier with a smooth impression-aware coefficient in engagement scoring.

**Architecture:** Update `calculateEngagement` so the efficiency multiplier scales continuously with average impressions instead of staying fixed at `2.2`. Keep every other calibrated scoring rule unchanged and pin the new behavior with unit tests across representative impression tiers.

**Tech Stack:** Next.js, TypeScript, Node test runner

---

### Task 1: Add failing tests for the smooth efficiency curve

**Files:**
- Modify: `tests/scoring-calibration.test.ts`

**Step 1: Write the failing tests**

- Update the existing engagement calibration test for the new 5K-impression output
- Add one test covering multiple impression tiers to verify the curve increases smoothly

**Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/scoring-calibration.test.ts`

Expected: FAIL because the current implementation still uses a fixed `2.2` multiplier.

### Task 2: Implement the smooth multiplier

**Files:**
- Modify: `src/lib/score/engagement.ts`

**Step 1: Replace the fixed multiplier**

- Compute the coefficient with:
  - `2.2 + 9.8 * avgImpressions / (avgImpressions + 30000)`
- Use it in `efficiencyScore = min(100, engagementRate * coefficient)`

**Step 2: Run targeted tests**

Run: `npm test -- tests/scoring-calibration.test.ts`

Expected: PASS

### Task 3: Final verification

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
