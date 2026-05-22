"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useGridStore } from "@/store/gridStore";
import { useValuationStore } from "@/store/valuationStore";
import { useAutoSave } from "@/hooks/useAutoSave";
import { EditableCell } from "./EditableCell";
import { ComputedCell } from "./ComputedCell";
import { ValuationBandCell } from "./ValuationBandCell";
import { GridToolbar } from "./GridToolbar";
import { cn } from "@/lib/utils";
import {
  YEAR_RANGE,
  QUARTERS,
  ROW_LABELS,
  EDITABLE_ROW_FIELDS,
  COMPUTED_ROW_FIELDS,
  BAND_ROW_FIELDS,
} from "@/lib/constants";
import type { QuarterKey } from "@/lib/types";
import type { RawQuarterData, ComputedQuarterData, ValuationBands } from "@/lib/formulas";

// ─── Row definition ───────────────────────────────────────────────────────────

type RowType = "editable" | "computed" | "band";

interface RowDef {
  field: string;
  label: string;
  type: RowType;
}

const ROW_DEFS: RowDef[] = [
  ...EDITABLE_ROW_FIELDS.map((f) => ({
    field: f,
    label: ROW_LABELS[f] ?? f,
    type: "editable" as RowType,
  })),
  ...COMPUTED_ROW_FIELDS.map((f) => ({
    field: f,
    label: ROW_LABELS[f] ?? f,
    type: "computed" as RowType,
  })),
  ...BAND_ROW_FIELDS.map((f) => ({
    field: f,
    label: ROW_LABELS[f] ?? f,
    type: "band" as RowType,
  })),
];

// ─── Column helper ────────────────────────────────────────────────────────────

const columnHelper = createColumnHelper<RowDef>();

// ─── Component ────────────────────────────────────────────────────────────────

interface ValuationGridProps {
  stockId: string;
  initialData: import("@/lib/types").ApiFinancialRow[];
}

export function ValuationGrid({ stockId, initialData }: ValuationGridProps) {
  const { loadFinancials, cells } = useGridStore();
  const { recomputeBands, multiplier } = useValuationStore();

  // Track active cell: "YEAR-Qn|field"
  const [activeCell, setActiveCell] = useState<string | null>(null);

  // Hydrate store on mount
  useEffect(() => {
    loadFinancials(stockId, initialData);
  }, [stockId, initialData, loadFinancials]);

  // Recompute valuation bands when cells or multiplier change
  useEffect(() => {
    recomputeBands(cells);
  }, [cells, multiplier, recomputeBands]);

  // Auto-save dirty cells
  useAutoSave();

  // Build year range for columns
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = YEAR_RANGE.START; y <= YEAR_RANGE.END; y++) arr.push(y);
    return arr;
  }, []);

  // Build TanStack column definitions
  const columns = useMemo(
    () => [
      // Sticky row-label column
      columnHelper.display({
        id: "label",
        header: () => (
          <span className="text-xs text-zinc-400">指標</span>
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              "block px-2 py-1 text-xs whitespace-nowrap",
              row.original.type === "editable"
                ? "text-zinc-700 font-medium"
                : row.original.type === "computed"
                  ? "text-zinc-500"
                  : "text-zinc-600 font-semibold",
            )}
          >
            {row.original.label}
          </span>
        ),
        size: 120,
      }),

      // Year groups with Q1-Q4 sub-columns
      ...years.map((year) =>
        columnHelper.group({
          id: `year-${year}`,
          header: () => (
            <span className="text-xs font-semibold text-zinc-600">{year}</span>
          ),
          columns: QUARTERS.map((q) => {
            const quarterKey = `${year}-${q}` as QuarterKey;
            return columnHelper.display({
              id: quarterKey,
              header: () => (
                <span className="text-[11px] text-zinc-400">{q}</span>
              ),
              cell: ({ row }) => {
                const { field, type } = row.original;
                const cellId = `${quarterKey}|${field}`;
                const isActive = activeCell === cellId;

                if (type === "editable") {
                  return (
                    <EditableCell
                      quarterKey={quarterKey}
                      field={field as keyof RawQuarterData}
                      isActive={isActive}
                      onActivate={() => setActiveCell(cellId)}
                    />
                  );
                }
                if (type === "computed") {
                  return (
                    <ComputedCell
                      quarterKey={quarterKey}
                      field={field as keyof ComputedQuarterData}
                    />
                  );
                }
                // band
                return (
                  <ValuationBandCell
                    quarterKey={quarterKey}
                    bandField={field as keyof ValuationBands}
                  />
                );
              },
            });
          }),
        }),
      ),
    ],
    [years, activeCell],
  );

  const table = useReactTable({
    data: ROW_DEFS,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Close active cell when clicking outside
  function handleTableClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest("input")) {
      setActiveCell(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <GridToolbar />

      <div
        className="overflow-auto flex-1"
        onClick={handleTableClick}
        role="grid"
        aria-label="估值矩陣"
      >
        <table className="border-collapse text-sm" style={{ minWidth: "max-content" }}>
          <thead className="sticky top-0 z-20 bg-white">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b">
                {headerGroup.headers.map((header, i) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(
                      "px-1 py-1 text-center border-r border-zinc-200",
                      i === 0 && "sticky left-0 z-30 bg-white border-r-2 border-zinc-300 min-w-[120px]",
                    )}
                    style={{ width: i === 0 ? 120 : undefined }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, ri) => {
              const isComputedSection = row.original.type === "computed";
              const isBandSection = row.original.type === "band";
              const isFirstBand =
                isBandSection &&
                ri > 0 &&
                table.getRowModel().rows[ri - 1]?.original.type !== "band";

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-zinc-100 hover:bg-zinc-50/50",
                    isComputedSection && "bg-zinc-50/80",
                    isBandSection && "bg-white",
                    isFirstBand && "border-t-2 border-zinc-300",
                  )}
                >
                  {row.getVisibleCells().map((cell, ci) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "border-r border-zinc-100 p-0",
                        ci === 0 &&
                          "sticky left-0 z-10 bg-inherit border-r-2 border-zinc-200",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
