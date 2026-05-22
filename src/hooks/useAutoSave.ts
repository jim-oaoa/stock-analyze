"use client";

import { useEffect, useRef } from "react";
import { useGridStore } from "@/store/gridStore";
import type { QuarterKey } from "@/lib/types";
import type { RawQuarterData } from "@/lib/formulas";

const DEBOUNCE_MS = 800;

const RAW_FIELDS: (keyof RawQuarterData)[] = [
  "eps",
  "oci",
  "other",
  "dividends",
  "otherEquityItems",
  "previousNetValue",
];

/**
 * Watches dirty cells in useGridStore and auto-saves them after 800ms of inactivity.
 * Uses optimistic update pattern: markSaving → PUT → confirmSave | revertCell.
 */
export function useAutoSave() {
  const { stockId, cells, dirtyKeys, markSaving, confirmSave, revertCell } =
    useGridStore();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track keys that are currently in-flight to avoid duplicate saves
  const inFlightRef = useRef<Set<QuarterKey>>(new Set());

  useEffect(() => {
    if (dirtyKeys.size === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (!stockId) return;

      // Snapshot dirty keys at flush time; avoid saving already in-flight cells
      const toSave = [...dirtyKeys].filter(
        (k) => !inFlightRef.current.has(k),
      ) as QuarterKey[];

      for (const key of toSave) {
        const cell = cells[key];
        if (!cell) continue;

        inFlightRef.current.add(key);
        markSaving(key);

        const payload: Partial<RawQuarterData> = {};
        for (const field of RAW_FIELDS) {
          payload[field] = cell[field];
        }

        const [yearStr, quarter] = key.split("-");

        fetch(`/api/financials/${stockId}/${yearStr}/${quarter}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            confirmSave(key);
          })
          .catch(() => {
            // Revert to server state by re-fetching the single quarter
            fetch(`/api/financials/${stockId}`)
              .then((r) => r.json())
              .then((rows: Array<Record<string, unknown>>) => {
                const row = rows.find(
                  (r) => r.year === cell.year && r.quarter === cell.quarter,
                );
                if (row) {
                  const serverData: RawQuarterData = {
                    eps: row.eps !== null ? parseFloat(row.eps as string) : null,
                    oci: row.oci !== null ? parseFloat(row.oci as string) : null,
                    other:
                      row.other !== null
                        ? parseFloat(row.other as string)
                        : null,
                    dividends:
                      row.dividends !== null
                        ? parseFloat(row.dividends as string)
                        : null,
                    otherEquityItems:
                      row.otherEquityItems !== null
                        ? parseFloat(row.otherEquityItems as string)
                        : null,
                    previousNetValue:
                      row.previousNetValue !== null
                        ? parseFloat(row.previousNetValue as string)
                        : null,
                  };
                  revertCell(key, serverData);
                }
              })
              .catch(() => {
                // If re-fetch also fails, just clear the saving state without revert
                confirmSave(key);
              });
          })
          .finally(() => {
            inFlightRef.current.delete(key);
          });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dirtyKeys, stockId, cells, markSaving, confirmSave, revertCell]);
}
