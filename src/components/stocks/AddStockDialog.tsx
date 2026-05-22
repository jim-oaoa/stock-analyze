"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddStockDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddStockDialog({ open, onClose }: AddStockDialogProps) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "not_found"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    setSymbol("");
    setName("");
    setIndustry("");
    setError(null);
    setLookupState("idle");
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Auto-lookup when symbol changes (debounced 600ms)
  function handleSymbolChange(val: string) {
    setSymbol(val);
    setLookupState("idle");
    setName("");
    setIndustry("");
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = val.trim();
    if (!trimmed) return;

    debounceRef.current = setTimeout(() => {
      void (async () => {
        setLookupState("loading");
        try {
          const res = await fetch(
            `/api/stocks/lookup?symbol=${encodeURIComponent(trimmed)}`,
          );
          if (res.ok) {
            const data = (await res.json()) as {
              name: string;
              industry: string | null;
            };
            setName(data.name);
            setIndustry(data.industry ?? "");
            setLookupState("found");
          } else {
            setLookupState("not_found");
          }
        } catch {
          setLookupState("not_found");
        }
      })();
    }, 600);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    const nm = name.trim();
    if (!sym || !nm) {
      setError("股票代碼與名稱為必填");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym,
          name: nm,
          industry: industry.trim() || undefined,
        }),
      });

      if (res.status === 409) {
        handleClose();
        router.push(`/stocks/${sym}`);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "新增失敗，請再試一次");
        setSubmitting(false);
        return;
      }

      handleClose();
      router.push(`/stocks/${sym}`);
      router.refresh();
    } catch {
      setError("網路錯誤，請確認伺服器狀態");
      setSubmitting(false);
    }
  }

  const isLoading = submitting || lookupState === "loading";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>新增股票</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 py-2">
          {/* 股票代碼 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">股票代碼 *</label>
            <div className="relative">
              <Input
                placeholder="輸入代碼，例：2330"
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                autoFocus
                disabled={submitting}
                className="font-mono pr-8"
              />
              {lookupState === "loading" && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 animate-pulse">
                  查詢中…
                </span>
              )}
              {lookupState === "found" && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-green-500">
                  ✓
                </span>
              )}
              {lookupState === "not_found" && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                  ?
                </span>
              )}
            </div>
            {lookupState === "not_found" && (
              <p className="text-xs text-zinc-400">
                查無此代碼，可手動輸入名稱
              </p>
            )}
          </div>

          {/* 公司名稱 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">公司名稱 *</label>
            <Input
              placeholder="自動填入，或手動輸入"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* 產業 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">產業（選填）</label>
            <Input
              placeholder="自動填入，或手動輸入"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !symbol.trim() || !name.trim()}
            >
              {submitting ? "新增中…" : "新增並前往"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
