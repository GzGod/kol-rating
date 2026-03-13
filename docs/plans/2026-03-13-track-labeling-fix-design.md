# Track Labeling Fix Design

## Goal

Fix the AI labeling pipeline so Web3 tweets no longer collapse into `Other` due to prompt corruption, strict validation, batch-level fallback behavior, or slow serial AI orchestration.

## Architecture

- Replace the corrupted Chinese prompts with the approved V2.1 prompts.
- Expand the track taxonomy to include `RWA` and `SocialFi`.
- Split labeling into four stages: AI output, normalization, heuristic fallback, and final `Other` fallback.
- Keep `Other` only for truly non-Web3 or unclassifiable tweets.
- Add timeout, retry, and latency logging around AI calls so slow upstream responses do not silently degrade labeling quality.
- Remove the fixed one-second delay between track-label batches.
- Run track labeling and style labeling in parallel anywhere both results are needed.

## Scope

- Modify only the track-labeling chain in `src/lib/ai-labeler.ts`
- Update lookup and persistence orchestration to reuse the new parallel labeling helper
- Keep scoring weights unchanged
- Keep style labeling aligned with the new prompt wording while improving latency behavior

## Validation

- Add unit tests for:
  - new allowed tags
  - normalization of common synonyms
  - heuristic fallback for obvious Web3 text
  - avoiding batch-wide `Other` collapse on malformed AI responses
- Add unit tests for:
  - retrying timeout-like AI failures
  - launching track/style labeling in parallel
- Run the full test suite and production build after changes
