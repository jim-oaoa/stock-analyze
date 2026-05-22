"use client";

import { useEffect, useRef, useState } from "react";
import { useGridStore } from "@/store/gridStore";
import { cn } from "@/lib/utils";
import type { QuarterKey } from "@/lib/types";
import type { RawQuarterData } from "@/lib/formulas";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EditableCellProps {
  quarterKey: QuarterKey;
  field: keyof RawQuarterData;
  isActive: boolean;
  onActivate: () => void;
}

export function EditableCell({
  quarterKey,
  field,
  isActive,
  onActivate,
}: EditableCellProps) {
  const { cells, setCellField } = useGridStore();
  const cell = cells[quarterKey];
  const value = cell?.[field] ?? null;

  const [editValue, setEditValue] = useState<string>(
    value !== null ? String(value) : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync edit buffer when external value changes (e.g., cascade update)
  useEffect(() => {
    void (async () => {
      if (!isActive) {
        setEditValue(value !== null ? String(value) : "");
      }
    })();
  }, [value, isActive]);

  // Focus input when this cell becomes active
  useEffect(() => {
    if (isActive) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isActive]);

  function commit() {
    const trimmed = editValue.trim();
    const parsed = trimmed === "" ? null : parseFloat(trimmed);
    const next = parsed !== null && !isNaN(parsed) ? parsed : null;
    if (next !== value) {
      setCellField(quarterKey, field, next);
    }
  }

  function revert() {
    setEditValue(value !== null ? String(value) : "");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      revert();
      inputRef.current?.blur();
    } else if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      // Allow bubbling so the grid can handle row navigation
    }
  }

  const isDirty = cell?.isDirty ?? false;
  const isSaving = cell?.isSaving ?? false;
  const saveError = cell?.saveError ?? null;

  const cellContent = (
    <div
      className={cn(
        "relative h-full w-full min-w-[72px]",
        isDirty && !isSaving && "ring-2 ring-yellow-400 ring-inset rounded-sm",
        isSaving && "ring-2 ring-blue-400 ring-inset rounded-sm",
        saveError && "ring-2 ring-red-400 ring-inset rounded-sm",
      )}
      onClick={onActivate}
    >
      {isActive ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="w-full h-full px-1.5 py-1 text-right text-xs font-mono bg-blue-50 outline-none border-0"
          aria-label={`${field} for ${quarterKey}`}
        />
      ) : (
        <span className="block w-full px-1.5 py-1 text-right text-xs font-mono text-zinc-700 cursor-pointer hover:bg-zinc-50">
          {value !== null ? value.toFixed(2) : ""}
        </span>
      )}
      {isSaving && (
        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
      )}
    </div>
  );

  if (saveError) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-48">
          {saveError}
        </TooltipContent>
      </Tooltip>
    );
  }

  return cellContent;
}
