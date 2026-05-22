"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AutoImportProps {
  stockId: string;
  symbol: string;
}

type ImportState = "importing" | "done" | "error";

export function AutoImport({ stockId, symbol }: AutoImportProps) {
  const router = useRouter();
  const [state, setState] = useState<ImportState>("importing");
  const [message, setMessage] = useState("正在從公開資料庫匯入財務資料…");

  useEffect(() => {
    void (async () => {
      try {
        setMessage(`正在取得 ${symbol} 的財務資料（約需 5–10 秒）…`);
        const res = await fetch(`/api/financials/${stockId}/import`, {
          method: "POST",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setMessage(
            (err as { error?: string }).error ?? "匯入失敗，請重新整理頁面",
          );
          setState("error");
          return;
        }
        const data = (await res.json()) as { imported: number };
        setMessage(`匯入完成，共 ${data.imported} 筆季度資料`);
        setState("done");
        // Refresh the page to load the new data into the grid
        setTimeout(() => router.refresh(), 800);
      } catch {
        setMessage("網路錯誤，請重新整理頁面");
        setState("error");
      }
    })();
  }, [stockId, symbol, router]);

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-sm text-zinc-500">
      {state === "importing" && (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          <p>{message}</p>
        </>
      )}
      {state === "done" && (
        <>
          <div className="text-2xl">✓</div>
          <p className="text-green-600">{message}</p>
          <p className="text-xs text-zinc-400">載入中…</p>
        </>
      )}
      {state === "error" && (
        <>
          <div className="text-2xl">✗</div>
          <p className="text-red-500">{message}</p>
          <button
            onClick={() => router.refresh()}
            className="mt-1 rounded border px-3 py-1 text-xs hover:bg-zinc-50"
          >
            重新整理
          </button>
        </>
      )}
    </div>
  );
}
