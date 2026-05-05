import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  treasurerLogin, treasurerLogout, treasurerStatus,
  getDashboard, createExpenditure, updateExpenditure, deleteExpenditure, getReceiptUrl,
} from "@/server/treasury.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Lock, LogOut, Plus, Pencil, Trash2, ArrowDownCircle, ArrowUpCircle, Wallet, Receipt as ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/treasurer")({
  head: () => ({
    meta: [
      { title: "Treasurer Dashboard — Treasury" },
      { name: "description", content: "Manage expenditures and view financial summaries." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TreasurerPage,
});

type Payment = { id: string; name: string; state_code: string; amount: number; receipt_path: string; created_at: string };
type Expenditure = { id: string; description: string; amount: number; date: string; created_at: string };
type Dashboard = { payments: Payment[]; expenditures: Expenditure[]; totals: { deposits: number; expenditures: number; balance: number } };

const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);

function TreasurerPage() {
  const status = useServerFn(treasurerStatus);
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { status().then((r) => setAuthed(r.authenticated)).catch(() => setAuthed(false)); }, [status]);
  if (authed === null) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  return authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <Login onSuccess={() => setAuthed(true)} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const login = useServerFn(treasurerLogin);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login({ data: { token } });
      if (res.ok) onSuccess();
      else toast.error(res.error);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Login failed"); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <Card className="w-full p-6 sm:p-8" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--gradient-primary)" }}>
              <Lock className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Treasurer Access</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter the secret token to continue.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Secret Token</Label>
              <Input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" required />
            </div>
            <Button type="submit" disabled={loading || !token} className="w-full" size="lg">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to home</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const fetchDash = useServerFn(getDashboard);
  const logout = useServerFn(treasurerLogout);
  const create = useServerFn(createExpenditure);
  const update = useServerFn(updateExpenditure);
  const remove = useServerFn(deleteExpenditure);
  const sign = useServerFn(getReceiptUrl);

  const [data, setData] = useState<Dashboard | null>(null);
  const [editing, setEditing] = useState<Expenditure | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const refresh = useCallback(async () => {
    try { setData(await fetchDash() as Dashboard); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to load"); }
  }, [fetchDash]);
  useEffect(() => { refresh(); }, [refresh]);

  const onSave = async (vals: { description: string; amount: number; date: string }) => {
    try {
      if (editing) await update({ data: { id: editing.id, ...vals } });
      else await create({ data: vals });
      toast.success(editing ? "Expenditure updated" : "Expenditure added");
      setOpenForm(false); setEditing(null);
      await refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this expenditure?")) return;
    try { await remove({ data: { id } }); toast.success("Deleted"); await refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
  };

  const viewReceipt = async (path: string) => {
    try { const { url } = await sign({ data: { path } }); window.open(url, "_blank"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not open receipt"); }
  };

  const doLogout = async () => { await logout(); onLogout(); };

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Treasurer Dashboard</span>
          </div>
          <Button variant="ghost" size="sm" onClick={doLogout}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Summary */}
        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Total Deposits" value={fmt(data.totals.deposits)} icon={<ArrowDownCircle className="h-5 w-5 text-success" />} />
          <SummaryCard label="Total Expenditures" value={fmt(data.totals.expenditures)} icon={<ArrowUpCircle className="h-5 w-5 text-destructive" />} />
          <SummaryCard label="Balance" value={fmt(data.totals.balance)} icon={<Wallet className="h-5 w-5 text-primary" />} highlight />
        </section>

        {/* Expenditures */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Expenditures</h2>
            <Button size="sm" onClick={() => { setEditing(null); setOpenForm(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <Card className="overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            {data.expenditures.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No expenditures yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr>
                  </thead>
                  <tbody>
                    {data.expenditures.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3 whitespace-nowrap">{e.date}</td>
                        <td className="px-4 py-3">{e.description}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(Number(e.amount))}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(e); setOpenForm(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => onDelete(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>

        {/* Deposits */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">Deposits ({data.payments.length})</h2>
          <Card className="overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            {data.payments.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No deposits yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">State</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{p.name}</td>
                        <td className="px-4 py-3">{p.state_code}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(Number(p.amount))}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => viewReceipt(p.receipt_path)}>
                            <ReceiptIcon className="mr-1 h-4 w-4" />View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </main>

      <ExpenditureDialog
        open={openForm}
        onOpenChange={(o) => { setOpenForm(o); if (!o) setEditing(null); }}
        initial={editing}
        onSave={onSave}
      />
    </div>
  );
}

function SummaryCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card
      className="p-6"
      style={highlight ? { background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" } : { boxShadow: "var(--shadow-card)" }}
    >
      <div className={`flex items-center justify-between text-sm font-medium ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        <span>{label}</span>
        {icon}
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight sm:text-4xl ${highlight ? "text-primary-foreground" : "text-foreground"}`}>
        {value}
      </p>
    </Card>
  );
}

function ExpenditureDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Expenditure | null;
  onSave: (v: { description: string; amount: number; date: string }) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDescription(initial?.description ?? "");
      setAmount(initial ? String(initial.amount) : "");
      setDate(initial?.date ?? new Date().toISOString().slice(0, 10));
    }
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!description.trim() || !(amt > 0) || !date) { toast.error("Fill all fields with valid values."); return; }
    setSaving(true);
    try { await onSave({ description: description.trim(), amount: amt, date }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit Expenditure" : "Add Expenditure"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="d">Description</Label>
            <Input id="d" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a">Amount</Label>
              <Input id="a" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dt">Date</Label>
              <Input id="dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}