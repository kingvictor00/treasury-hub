import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitPayment, getPublicTotals } from "@/server/treasury.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, ChevronDown, Loader2, Receipt, ShieldCheck, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Submit Payment — Treasury" },
      { name: "description", content: "Log a payment you made externally by submitting your details and a receipt image." },
    ],
  }),
  component: SubmitPaymentPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(n);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function SubmitPaymentPage() {
  const submit = useServerFn(submitPayment);
  const fetchTotals = useServerFn(getPublicTotals);
  const [totals, setTotals] = useState<{ deposits: number; expenditures: number; balance: number } | null>(null);
  const [showArrow, setShowArrow] = useState(false);

  useEffect(() => {
    fetchTotals().then(setTotals).catch(() => {});
  }, [fetchTotals]);

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight > 40;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40;
      setShowArrow(scrollable && !atBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [totals, success]);

  const [name, setName] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ id: string } | null>(null);

  const onFile = (f: File | null) => {
    if (!f) { setFile(null); setPreview(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      toast.error("Receipt must be JPG, PNG, or WEBP."); return;
    }
    if (f.size > 5 * 1024 * 1024) { toast.error("File exceeds 5MB."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim() || !stateCode.trim() || !file || !(amt > 0)) {
      toast.error("Please fill in all fields with valid values.");
      return;
    }
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const res = await submit({
        data: {
          name: name.trim(),
          state_code: stateCode.trim(),
          amount: amt,
          receiptBase64: b64,
          receiptType: file.type,
          receiptName: file.name,
        },
      });
      setSuccess({ id: res.id });
      setName(""); setStateCode(""); setAmount(""); setFile(null); setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Receipt className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Treasury</span>
          </div>
          <Link to="/treasurer" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Treasurer login →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Log a Payment</h1>
          <p className="mt-2 text-muted-foreground">
            Submit your details and the receipt for the payment you made externally.
          </p>
        </div>

        {success ? (
          <Card className="border-success/30 p-8 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h2 className="mt-4 text-2xl font-semibold">Payment submitted!</h2>
            <p className="mt-2 text-muted-foreground">Your reference ID:</p>
            <code className="mt-2 inline-block rounded-md bg-muted px-3 py-1 font-mono text-sm break-all">{success.id}</code>
            <div className="mt-6">
              <Button onClick={() => setSuccess(null)}>Submit another payment</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8" style={{ boxShadow: "var(--shadow-card)" }}>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="state">State Code</Label>
                  <Input id="state" value={stateCode} onChange={(e) => setStateCode(e.target.value)} maxLength={20} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount Paid</Label>
                  <Input id="amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt (JPG / PNG / WEBP, max 5MB)</Label>
                <label htmlFor="receipt" className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/40 px-4 py-8 transition-colors hover:border-primary/40 hover:bg-muted/60">
                  {preview ? (
                    <img src={preview} alt="Receipt preview" className="max-h-48 rounded" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="mt-2 text-sm text-muted-foreground">Click to upload receipt image</span>
                    </>
                  )}
                  <input id="receipt" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} required />
                </label>
                {file && <p className="text-xs text-muted-foreground">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
              </div>
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>) : "Submit Payment"}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Your data is stored securely.
              </p>
            </form>
          </Card>
        )}

        {totals && (
          <section className="mt-10">
            <h2 className="mb-4 text-center text-lg font-semibold tracking-tight">Treasury Summary</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowDownCircle className="h-4 w-4 text-success" /> Total Deposits
                </div>
                <div className="mt-2 text-2xl font-bold">{fmt(totals.deposits)}</div>
              </Card>
              <Card className="p-5" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowUpCircle className="h-4 w-4 text-destructive" /> Total Expenditures
                </div>
                <div className="mt-2 text-2xl font-bold">{fmt(totals.expenditures)}</div>
              </Card>
              <Card className="p-5" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4 text-primary" /> Balance
                </div>
                <div className="mt-2 text-2xl font-bold">{fmt(totals.balance)}</div>
              </Card>
            </div>
          </section>
        )}
      </main>

      <div
        aria-hidden={!showArrow}
        className={`pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300 ${
          showArrow ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg animate-bounce">
          <ChevronDown className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}