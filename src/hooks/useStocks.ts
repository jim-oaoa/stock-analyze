"use client";

import { useEffect, useState } from "react";
import type { ApiStock } from "@/lib/types";

interface UseStocksResult {
  data: ApiStock[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStocks(): UseStocksResult {
  const [data, setData] = useState<ApiStock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/stocks");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = (await res.json()) as ApiStock[];
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
  }, [tick]);

  return {
    data,
    isLoading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
