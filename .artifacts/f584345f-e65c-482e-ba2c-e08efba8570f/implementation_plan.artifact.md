# Algorithm Sanity Check & Strategic Refinements

This plan ensures total consistency across all contextual bonuses, ensures accuracy for unit-level calculations (Modals/Gallery), and fixes the redundant "High xG" rewards.

## User Review Required

> [!IMPORTANT]
> **Unified Fallback**: The fallback logic for "Absent Leaders" will now work in individual player modals, even if pre-computation wasn't run. This ensures you see the same score in the gallery and the lineup optimizer.
> **xG Redundancy Fix**: The matchup bonus (+6%) and game state bonus (+3 pts) for high xG are now merged into a single, more balanced "Match Flow" bonus to avoid over-inflating scores.

## Proposed Changes

### [Algorithm Core]

#### [MODIFY] [optimizer.ts](file:///C:/Users/tkr/Documents/Projects/Sorare/src/utils/optimizer.ts)
- **Robust Fallback**: Implement the full "Leader / Best Defender / Scorer / Assister" absence detection inside the `calculatePlayerProjectedScore` fallback branch (using `allGalleryCards`).
- **xG Balancing**:
    - Remove the old `matchupFactor += 0.06` logic (Step 4).
    - Rely solely on the `gameStateBonus` (Step 5) which is more precise (points-based).
- **Strategy Weights Fix**: Ensure that `allAroundFactor` is correctly applied to the final score and not double-counted in both matchup and form.
- **Captain Reasoning**: Update the analysis text to explain *why* a captain was chosen based on Ceiling vs Score.

### [UI Components]

#### [MODIFY] [ProjectionBreakdownModal.tsx](file:///C:/Users/tkr/Documents/Projects/Sorare/src/components/ProjectionBreakdownModal.tsx)
- Ensure the "Regression Penalty" is only displayed if it's > 0 to avoid clutter.
- Add a tooltip explaining the `depthFactor` impact.

## Verification Plan

### Automated Logic Check
- **Consistency Test**: Verify that calling `calculatePlayerProjectedScore` for a single player returns the EXACT same result as when it's called inside `optimizeLineup`.
- **xG Test**: Verify that a player in a 2.5 xG match doesn't get both a 1.06 multiplier AND +3 pts.

### Manual Verification
- Open a player modal from the **Gallery** and check the score.
- Go to the **Lineups** and verify it's the same score for the same strategy.
