# Engagement Efficiency Smoothing Design

## Goal

Replace the fixed engagement-efficiency multiplier with a smooth impression-aware coefficient so larger accounts are scored against a more realistic efficiency baseline without introducing hard step boundaries.

## Recommendation

Use the smooth coefficient formula:

`coefficient = 2.2 + 9.8 * avgImpressions / (avgImpressions + 30000)`

and keep:

`efficiencyScore = min(100, engagementRate * coefficient)`

This preserves the calibrated floor for small accounts, gradually increases the efficiency multiplier for larger accounts, and avoids the cliff effects of impression bands.

## Scope

- Modify only `src/lib/score/engagement.ts`
- Keep the calibrated scale score, expertise, health, and tier thresholds unchanged
- Add tests for representative impression tiers so the curve is pinned down

## Validation

- Add tests covering:
  - the updated 5K-impression example
  - coefficient behavior at low, mid, and high impression levels via score outputs
- Run the full test suite and production build
