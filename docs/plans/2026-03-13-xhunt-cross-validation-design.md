# XHunt Cross Validation Design

## Goal

Show XHunt-based cross validation on the homepage lookup result without changing the existing Power Score model or requiring database persistence.

## Architecture

- Keep Power Score as the primary real-time score produced by the existing lookup pipeline.
- Add a server-side XHunt integration layer that fetches rank data by username and never blocks the main lookup result if XHunt is unavailable.
- Derive a separate cross-validation verdict from `XHunt rank + Power Score tier` and return it in the lookup API response.

## Data Flow

1. Homepage posts a username to `/api/lookup`.
2. Existing persisted/transient lookup path resolves the KOL profile and Power Score.
3. Server fetches XHunt rank for the username.
4. Server evaluates the cross-validation matrix and attaches:
   - XHunt rank metadata
   - Cross-validation label
   - Short explanation
   - Operator hint
5. Homepage renders a dedicated XHunt card between the profile header and score breakdown.

## XHunt Integration

- Use the same public endpoint referenced by the XHunt browser extension.
- Treat XHunt as best-effort only.
- If the response is blocked, HTML, malformed, or missing rank data:
  - log diagnostics server-side
  - return an `unavailable` XHunt status
  - keep the Power Score response intact

## Cross Validation Matrix

- `XHunt top 200 + Power B/C/D` => `待激活` / `大将低迷`
- `XHunt 201-1000 + Power C/D` => `待激活` / `一般性掉队`
- `Power S + XHunt >2000 or unranked` => `潜力新星` / `强势新人`
- `Power A/B + XHunt >1000 or unranked` => `潜力新星` / `稳步上升型`
- `XHunt <=1000 + Power S/A` => `实力认证`
- Otherwise => `常规表现`

## Testing

- Unit test XHunt response parsing for nested payloads.
- Unit test cross-validation matrix behavior.
- Keep tests fully mocked and deterministic.
- Verify the project build still passes after the new API and UI fields are added.
