export type QuarterLabel = "Q1" | "Q2" | "Q3" | "Q4";
export type QuarterKey = `${number}-${QuarterLabel}`;

export interface ApiStock {
  id: string;
  symbol: string;
  name: string;
  industry: string | null;
  updatedAt: string;
}

export interface ApiFinancialRow {
  id: string;
  stockId: string;
  year: number;
  quarter: QuarterLabel;
  eps: string | null;
  oci: string | null;
  other: string | null;
  dividends: string | null;
  otherEquityItems: string | null;
  previousNetValue: string | null;
  updatedAt: string;
}

export interface CreateStockInput {
  symbol: string;
  name: string;
  industry?: string;
}

export interface UpsertQuarterInput {
  eps?: number | null;
  oci?: number | null;
  other?: number | null;
  dividends?: number | null;
  otherEquityItems?: number | null;
  previousNetValue?: number | null;
}
