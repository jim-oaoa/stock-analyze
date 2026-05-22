"use client";

import { useCallback } from "react";
import { useGridStore } from "@/store/gridStore";
import { YEAR_RANGE, QUARTERS, EDITABLE_ROW_FIELDS } from "@/lib/constants";
import type { QuarterKey, QuarterLabel } from "@/lib/types";

type EditableField = (typeof EDITABLE_ROW_FIELDS)[number];

interface UseKeyboardNavOptions {
  currentField: EditableField;
  currentKey: QuarterKey;
  onCommit: () => void;
  onRevert: () => void;
}

/**
 * Returns a keydown handler for grid cell navigation.
 * Arrow keys move focus; Enter/Tab commit and advance; Escape reverts.
 */
export function useKeyboardNav({
  currentField,
  currentKey,
  onCommit,
  onRevert,
}: UseKeyboardNavOptions) {
  const { setActiveKey } = useGridStore();

  const allQuarterKeys = buildAllKeys();
  const allFields = EDITABLE_ROW_FIELDS as readonly EditableField[];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const [yearStr, quarter] = currentKey.split("-") as [string, QuarterLabel];
      const year = parseInt(yearStr, 10);
      const colIndex = allQuarterKeys.indexOf(currentKey);
      const rowIndex = allFields.indexOf(currentField);

      switch (e.key) {
        case "Enter": {
          e.preventDefault();
          onCommit();
          // Move down to next editable row, same column
          const nextRow = (rowIndex + 1) % allFields.length;
          const nextField = allFields[nextRow];
          if (nextField) {
            setActiveKey(encodeKey(currentField, nextField, currentKey));
          }
          break;
        }
        case "Tab": {
          e.preventDefault();
          onCommit();
          // Move right to next column, same row
          const nextColKey = allQuarterKeys[colIndex + (e.shiftKey ? -1 : 1)];
          if (nextColKey) setActiveKey(nextColKey);
          break;
        }
        case "Escape": {
          e.preventDefault();
          onRevert();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevRow = Math.max(0, rowIndex - 1);
          const prevField = allFields[prevRow];
          if (prevField && prevField !== currentField) {
            setActiveKey(encodeKey(currentField, prevField, currentKey));
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const nextRow = Math.min(allFields.length - 1, rowIndex + 1);
          const nextField = allFields[nextRow];
          if (nextField && nextField !== currentField) {
            setActiveKey(encodeKey(currentField, nextField, currentKey));
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const prevKey = allQuarterKeys[colIndex - 1];
          if (prevKey) setActiveKey(prevKey);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const nextKey = allQuarterKeys[colIndex + 1];
          if (nextKey) setActiveKey(nextKey);
          break;
        }
      }

      void year;
      void quarter;
    },
    [
      currentField,
      currentKey,
      allQuarterKeys,
      allFields,
      onCommit,
      onRevert,
      setActiveKey,
    ],
  );

  return { handleKeyDown };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAllKeys(): QuarterKey[] {
  const keys: QuarterKey[] = [];
  for (let y = YEAR_RANGE.START; y <= YEAR_RANGE.END; y++) {
    for (const q of QUARTERS) {
      keys.push(`${y}-${q}` as QuarterKey);
    }
  }
  return keys;
}

/**
 * The activeKey encodes both the column (QuarterKey) and the row (field).
 * Format: "YEAR-Q#|field" — the grid reads both parts to focus the right cell.
 */
function encodeKey(
  _fromField: EditableField,
  toField: EditableField,
  columnKey: QuarterKey,
): QuarterKey {
  // We re-use QuarterKey type but extend it with a field suffix for active-cell tracking.
  // The grid component splits on "|" to extract the field.
  return `${columnKey}|${toField}` as QuarterKey;
}
