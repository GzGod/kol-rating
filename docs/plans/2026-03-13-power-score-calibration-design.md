# Power Score Calibration Design

## Goal

Recalibrate Power Score so ordinary KOLs no longer cluster in `A`, while keeping the existing three-factor structure and UI surfaces intact.

## Approach Options

### Option 1: Formula-only recalibration in the existing score modules

- Update the engagement, expertise, health, and tier functions in place.
- Keep the score breakdown shape unchanged so existing UI continues to work.
- Apply new results whenever a KOL is rescored or looked up.

Pros:
- Smallest change surface
- No migration or backfill job required
- Fastest path to restore score separation

Cons:
- Persisted KOLs keep old scores until their next refresh
- One health signal from the spec (`follow/unfollow > 500/90d`) cannot be implemented with current data

### Option 2: Formula recalibration plus automatic full backfill

- Implement Option 1
- Add a one-off batch recomputation path for all persisted KOLs

Pros:
- Historical list and admin ranking update immediately

Cons:
- More operational risk
- Requires coordinated DB access and rerun job

### Option 3: Percentile-based dynamic tiers now

- Keep or lightly adjust formulas
- Set S/A/B/C/D via percentile cutoffs from current production data

Pros:
- Guarantees distribution targets

Cons:
- Harder to reason about
- Needs production distribution job and ongoing recalibration logic
- Does not address inflated factor floors by itself

## Recommendation

Use Option 1 now. It directly solves the inflated-floor problem with minimal operational risk. The new fixed thresholds from the spec go live immediately for new lookups and rescoring, and persisted rows converge as they refresh. Percentile tuning can happen later based on real post-calibration data.

## Architecture

- Engagement:
  - Change scale score from `min(100, 13 * ln(avgImpressions + 1))` to `max(0, min(100, 8.5 * ln(avgImpressions + 1) - 20))`
  - Change efficiency score from `min(100, rate * 3)` to `min(100, rate * 2.2)`
- Expertise:
  - Keep track-focus and originality logic
  - Replace linear 12-week posting stability with the new step function
- Health:
  - Keep reach authenticity and growth health structure
  - Replace anomaly scoring with `70 + rewards - penalties`
  - Implement feasible signals with existing data:
    - rewards: high follower/following ratio, older account when known, high reach
    - penalties: low follower/following ratio, low reach on 10K+ followers, >50 tweets in a single day, repeated tweet format >70%
  - Skip `follow/unfollow > 500/90d` until the data exists
- Tiers:
  - Update thresholds to `S 88+`, `A 75-87`, `B 55-74`, `C 35-54`, `D <35`

## Data Availability Assumptions

- `account age > 2 years` is available for transient lookups from Twitter API data.
- Persisted scoring does not currently store Twitter account creation time. The implementation should support an optional account-created timestamp so refreshed live data can use it immediately, while persisted-only cases safely omit that reward until the data is available.
- `follow/unfollow > 500/90d` is not currently available in the schema or API ingestion path and will be left unimplemented for now.

## Validation

- Add unit tests for:
  - new engagement curve and efficiency scaling
  - posting stability step thresholds
  - new anomaly score rewards and penalties
  - new tier cutoffs
- Run the full test suite and production build
