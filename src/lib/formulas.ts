export interface RawQuarterData {
  eps: number | null;
  oci: number | null;
  other: number | null;
  dividends: number | null;
  otherEquityItems: number | null;
  previousNetValue: number | null;
}

export interface ComputedQuarterData {
  netValueChange: number | null;
  netValue: number | null;
  adjustedNetValue: number | null;
  adjustedROE: number | null;
}

export interface ValuationBands {
  baseValue: number | null;
  bearZone: number | null;
  fairZone: number | null;
  bullZone: number | null;
  overvalued: number | null;
  bubble: number | null;
}

// Q1×4, Q2×2, Q3×(4/3), Q4×1
export const ANNUALIZATION_FACTORS: Record<1 | 2 | 3 | 4, number> = {
  1: 4,
  2: 2,
  3: 4 / 3,
  4: 1,
};

export const BAND_RATIOS = {
  bearZone: 0.85,
  fairZone: 1.0,
  bullZone: 1.15,
  overvalued: 1.3,
  bubble: 2.0,
} as const;

/**
 * Computes 淨值增減, 淨值, 調整淨值 for a single quarter.
 * Returns null for any field whose required inputs are missing.
 */
export function computeQuarterFields(raw: RawQuarterData): ComputedQuarterData {
  const { eps, oci, other, dividends, otherEquityItems, previousNetValue } =
    raw;

  const netValueChange =
    eps !== null && oci !== null && other !== null && dividends !== null
      ? eps + oci + other + dividends
      : null;

  const netValue =
    previousNetValue !== null && netValueChange !== null
      ? previousNetValue + netValueChange
      : null;

  const adjustedNetValue =
    netValue !== null && otherEquityItems !== null
      ? netValue - otherEquityItems
      : null;

  return { netValueChange, netValue, adjustedNetValue, adjustedROE: null };
}

/**
 * Computes 調整ROE using cumulative EPS from Q1 through the current quarter.
 * @param epsAccumulated - Sum of EPS from Q1 to current quarter
 * @param quarterIndex   - 1-based quarter position within the year
 * @param adjustedNetValue - 調整淨值 for this quarter
 */
export function computeAdjustedROE(
  epsAccumulated: number,
  quarterIndex: 1 | 2 | 3 | 4,
  adjustedNetValue: number | null,
): number | null {
  if (adjustedNetValue === null || adjustedNetValue === 0) return null;
  const annualizedEPS = epsAccumulated * ANNUALIZATION_FACTORS[quarterIndex];
  return annualizedEPS / adjustedNetValue;
}

/**
 * Computes all five valuation band prices for a quarter.
 * baseValue = multiplier × 調整淨值 × (1 + 調整ROE)
 */
export function computeValuationBands(
  adjustedNetValue: number | null,
  adjustedROE: number | null,
  multiplier: number,
): ValuationBands {
  if (adjustedNetValue === null || adjustedROE === null) {
    return {
      baseValue: null,
      bearZone: null,
      fairZone: null,
      bullZone: null,
      overvalued: null,
      bubble: null,
    };
  }

  const baseValue = multiplier * adjustedNetValue * (1 + adjustedROE);

  return {
    baseValue,
    bearZone: baseValue * BAND_RATIOS.bearZone,
    fairZone: baseValue * BAND_RATIOS.fairZone,
    bullZone: baseValue * BAND_RATIOS.bullZone,
    overvalued: baseValue * BAND_RATIOS.overvalued,
    bubble: baseValue * BAND_RATIOS.bubble,
  };
}
