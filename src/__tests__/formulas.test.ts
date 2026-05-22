import { describe, it, expect } from "vitest";
import {
  computeQuarterFields,
  computeAdjustedROE,
  computeValuationBands,
  ANNUALIZATION_FACTORS,
} from "@/lib/formulas";

describe("computeQuarterFields", () => {
  it("computes all fields when all inputs are provided", () => {
    const result = computeQuarterFields({
      eps: 2.0,
      oci: 0.1,
      other: 0.0,
      dividends: -1.0,
      otherEquityItems: 0.5,
      previousNetValue: 20.0,
    });
    // netValueChange = 2.0 + 0.1 + 0.0 + (-1.0) = 1.1
    expect(result.netValueChange).toBeCloseTo(1.1);
    // netValue = 20.0 + 1.1 = 21.1
    expect(result.netValue).toBeCloseTo(21.1);
    // adjustedNetValue = 21.1 - 0.5 = 20.6
    expect(result.adjustedNetValue).toBeCloseTo(20.6);
  });

  it("returns null for netValueChange if any input is null", () => {
    const result = computeQuarterFields({
      eps: null,
      oci: 0.1,
      other: 0.0,
      dividends: -1.0,
      otherEquityItems: 0.5,
      previousNetValue: 20.0,
    });
    expect(result.netValueChange).toBeNull();
    expect(result.netValue).toBeNull();
    expect(result.adjustedNetValue).toBeNull();
  });

  it("returns null for netValue if previousNetValue is null", () => {
    const result = computeQuarterFields({
      eps: 2.0,
      oci: 0.1,
      other: 0.0,
      dividends: -1.0,
      otherEquityItems: 0.5,
      previousNetValue: null,
    });
    expect(result.netValueChange).toBeCloseTo(1.1);
    expect(result.netValue).toBeNull();
  });

  it("returns null for adjustedNetValue if otherEquityItems is null", () => {
    const result = computeQuarterFields({
      eps: 2.0,
      oci: 0.0,
      other: 0.0,
      dividends: 0.0,
      otherEquityItems: null,
      previousNetValue: 20.0,
    });
    expect(result.netValue).toBeCloseTo(22.0);
    // otherEquityItems null → treated as 0, so adjustedNetValue = netValue
    expect(result.adjustedNetValue).toBeCloseTo(22.0);
  });
});

describe("ANNUALIZATION_FACTORS", () => {
  it("applies correct annualization per quarter", () => {
    expect(ANNUALIZATION_FACTORS[1]).toBe(4);
    expect(ANNUALIZATION_FACTORS[2]).toBe(2);
    expect(ANNUALIZATION_FACTORS[3]).toBeCloseTo(4 / 3);
    expect(ANNUALIZATION_FACTORS[4]).toBe(1);
  });
});

describe("computeAdjustedROE", () => {
  it("annualizes Q1 EPS correctly", () => {
    // Q1 EPS=1.0, annualized=4.0, adjustedNetValue=20 → ROE=20%
    expect(computeAdjustedROE(1.0, 1, 20.0)).toBeCloseTo(0.2);
  });

  it("annualizes Q2 cumulative EPS correctly", () => {
    // cumulative EPS over Q1+Q2 = 2.5, annualized = 2.5*2 = 5.0, ROE = 5.0/25 = 0.2
    expect(computeAdjustedROE(2.5, 2, 25.0)).toBeCloseTo(0.2);
  });

  it("annualizes Q3 cumulative EPS correctly", () => {
    // cumulative EPS over Q1+Q2+Q3 = 3.0, annualized = 3.0*(4/3)=4.0
    expect(computeAdjustedROE(3.0, 3, 20.0)).toBeCloseTo(0.2);
  });

  it("Q4 uses full-year EPS without annualization", () => {
    expect(computeAdjustedROE(4.0, 4, 20.0)).toBeCloseTo(0.2);
  });

  it("returns null when adjustedNetValue is null", () => {
    expect(computeAdjustedROE(2.0, 1, null)).toBeNull();
  });

  it("returns null when adjustedNetValue is zero", () => {
    expect(computeAdjustedROE(2.0, 1, 0)).toBeNull();
  });
});

describe("computeValuationBands", () => {
  it("computes all five bands correctly", () => {
    // multiplier=1.5, adjustedNetValue=20, adjustedROE=0.2
    // baseValue = 1.5 * 20 * 1.2 = 36
    const result = computeValuationBands(20, 0.2, 1.5);
    expect(result.baseValue).toBeCloseTo(36);
    expect(result.bearZone).toBeCloseTo(36 * 0.85);
    expect(result.fairZone).toBeCloseTo(36 * 1.0);
    expect(result.bullZone).toBeCloseTo(36 * 1.15);
    expect(result.overvalued).toBeCloseTo(36 * 1.3);
    expect(result.bubble).toBeCloseTo(36 * 2.0);
  });

  it("returns all null when inputs are null", () => {
    const result = computeValuationBands(null, null, 1.5);
    expect(result.baseValue).toBeNull();
    expect(result.bearZone).toBeNull();
  });

  it("returns all null when adjustedNetValue is null", () => {
    const result = computeValuationBands(null, 0.2, 1.5);
    expect(result.baseValue).toBeNull();
  });
});
