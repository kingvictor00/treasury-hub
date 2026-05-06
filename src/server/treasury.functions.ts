import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { safeEqual, rateLimit } from "./treasury.server";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------- Guest payment submission ----------
const submitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  state_code: z.string().trim().min(1).max(20),
  amount: z.number().positive().max(1_000_000_000),
  receiptBase64: z.string().min(1), // data URL or raw base64
  receiptType: z.string().min(1).max(64),
  receiptName: z.string().min(1).max(255),
});

export const submitPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!rateLimit(`submit:${ip}`, 5, 60_000)) {
      throw new Error("Too many submissions. Please try again in a minute.");
    }

    if (!ALLOWED_MIME.includes(data.receiptType)) {
      throw new Error("Receipt must be a JPG, PNG, or WEBP image.");
    }

    const b64 = data.receiptBase64.includes(",")
      ? data.receiptBase64.split(",")[1]
      : data.receiptBase64;
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0) throw new Error("Empty receipt file.");
    if (buf.length > MAX_FILE_BYTES) throw new Error("Receipt exceeds 5MB limit.");

    const ext = data.receiptType === "image/png" ? "png" : data.receiptType === "image/webp" ? "webp" : "jpg";
    const id = crypto.randomUUID();
    const path = `${new Date().getFullYear()}/${id}.${ext}`;

    const up = await supabaseAdmin.storage.from("receipts").upload(path, buf, {
      contentType: data.receiptType,
      upsert: false,
    });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

    const ins = await supabaseAdmin
      .from("payments")
      .insert({
        id,
        name: data.name,
        state_code: data.state_code,
        amount: data.amount,
        receipt_path: path,
      })
      .select("id, created_at")
      .single();
    if (ins.error) {
      // best-effort cleanup
      await supabaseAdmin.storage.from("receipts").remove([path]);
      throw new Error(`Save failed: ${ins.error.message}`);
    }
    return { id: ins.data.id, created_at: ins.data.created_at };
  });

// ---------- Treasurer auth ----------
export const treasurerLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!rateLimit(`login:${ip}`, 5, 60_000)) {
      return { ok: false as const, error: "Too many attempts. Try again in a minute." };
    }
    const expected = process.env.TREASURER_TOKEN;
    if (!expected) return { ok: false as const, error: "Treasurer token not configured on server." };
    if (!safeEqual(data.token, expected)) {
      return { ok: false as const, error: "Invalid token." };
    }
    return { ok: true as const };
  });

export const treasurerLogout = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true };
});

export const treasurerStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env.TREASURER_TOKEN;
    return { authenticated: !!(expected && data.token && safeEqual(data.token, expected)) };
  });

function requireAuth(token?: string) {
  const expected = process.env.TREASURER_TOKEN;
  if (!expected || !token || !safeEqual(token, expected)) throw new Error("Unauthorized");
}


// ---------- Treasurer dashboard data ----------
export const getDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }) => {
    requireAuth(data.token);
  const [paymentsRes, expRes] = await Promise.all([
    supabaseAdmin.from("payments").select("id, name, state_code, amount, receipt_path, created_at").order("created_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("expenditures").select("id, description, amount, date, created_at").order("date", { ascending: false }).limit(1000),
  ]);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (expRes.error) throw new Error(expRes.error.message);
  const totalDeposits = paymentsRes.data.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenditures = expRes.data.reduce((s, e) => s + Number(e.amount), 0);
  return {
    payments: paymentsRes.data,
    expenditures: expRes.data,
    totals: {
      deposits: totalDeposits,
      expenditures: totalExpenditures,
      balance: totalDeposits - totalExpenditures,
    },
  };
});

// Signed URL for a receipt (treasurer only)
export const getReceiptUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1).max(512), path: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }) => {
    requireAuth(data.token);
    const { data: signed, error } = await supabaseAdmin.storage
      .from("receipts")
      .createSignedUrl(data.path, 60 * 5);
    if (error || !signed) throw new Error(error?.message ?? "Could not sign URL");
    return { url: signed.signedUrl };
  });

// ---------- Expenditure CRUD ----------
const expSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive().max(1_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
});

export const createExpenditure = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => expSchema.extend({ token: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }) => {
    const { token, ...rest } = data;
    requireAuth(token);
    const { data: row, error } = await supabaseAdmin
      .from("expenditures")
      .insert(rest)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateExpenditure = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => expSchema.extend({ id: z.string().uuid(), token: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }) => {
    const { id, token, ...rest } = data;
    requireAuth(token);
    const { data: row, error } = await supabaseAdmin
      .from("expenditures")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExpenditure = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), token: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data }) => {
    requireAuth(data.token);
    const { error } = await supabaseAdmin.from("expenditures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });