"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);

  function reset() {
    setSymbol("");
    setName("");
    setIndustry("");
    setError(null);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    const nm  = name.trim();
    if (!sym || !nm) {
      setError("股票代碼與名稱為必填");
      return;
    }

    setLoading(true);
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
        // Already exists — just navigate
        handleClose();
        router.push(`/stocks/${sym}`);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "新增失敗，請再試一次");
        setLoading(false);
        return;
      }

      handleClose();
      router.push(`/stocks/${sym}`);
      router.refresh();
    } catch {
      setError("網路錯誤，請確認伺服器狀態");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>新增股票</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">股票代碼 *</label>
            <Input
              placeholder="例：2330"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              autoFocus
              disabled={loading}
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">公司名稱 *</label>
            <Input
              placeholder="例：台積電"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">產業（選填）</label>
            <Input
              placeholder="例：半導體"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading || !symbol.trim() || !name.trim()}>
              {loading ? "新增中…" : "新增並前往"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
