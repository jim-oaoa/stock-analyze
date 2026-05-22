"use client";

import { useEffect, useState } from "react";
import type { ApiFinancialRow } from "@/lib/types";

interface UseFinancialsResult {
  data: ApiFinancialRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFinancials(stockId: string | null): UseFinancialsResult {
  const [data, setData] = useState<ApiFinancialRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!stockId) return;

    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/financials/${stockId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = (await res.json()) as ApiFinancialRow[];
        if (!cancelled) {
          setData(rows);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stockId, tick]);

  return {
    data,
    isLoading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
