export const YEAR_RANGE = {
  START: 2018,
  END: new Date().getFullYear(),
} as const;

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export const DEFAULT_MULTIPLIER = 1.5;

export const BAND_LABELS = {
  bearZone: "魚頭區",
  fairZone: "魚身區",
  bullZone: "魚尾區",
  overvalued: "魚骨區",
  bubble: "瘋狂價",
} as const;

export const BAND_COLORS = {
  bearZone: "bg-blue-100 text-blue-800",
  fairZone: "bg-green-100 text-green-800",
  bullZone: "bg-yellow-100 text-yellow-800",
  overvalued: "bg-orange-100 text-orange-800",
  bubble: "bg-red-100 text-red-800",
} as const;

export const EDITABLE_ROW_FIELDS = [
  "eps",
  "oci",
  "other",
  "dividends",
  "otherEquityItems",
  "previousNetValue",
] as const;

export const COMPUTED_ROW_FIELDS = [
  "netValueChange",
  "netValue",
  "adjustedNetValue",
  "adjustedROE",
] as const;

export const BAND_ROW_FIELDS = [
  "bearZone",
  "fairZone",
  "bullZone",
  "overvalued",
  "bubble",
] as const;

export const ROW_LABELS: Record<string, string> = {
  eps: "EPS",
  oci: "其他綜合損益",
  other: "其他",
  dividends: "股息",
  otherEquityItems: "其他權益項目",
  previousNetValue: "期初淨值",
  netValueChange: "淨值增減",
  netValue: "淨值",
  adjustedNetValue: "調整淨值",
  adjustedROE: "調整ROE",
  bearZone: "魚頭區 (×0.85)",
  fairZone: "魚身區 (×1.00)",
  bullZone: "魚尾區 (×1.15)",
  overvalued: "魚骨區 (×1.30)",
  bubble: "瘋狂價 (×2.00)",
};
