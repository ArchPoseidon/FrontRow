import { randomUUID } from "node:crypto";
import { paymentsEnabled } from "./flag";

/**
 * Pine Labs Online (Plural v2) hosted checkout. Only ever called when PAYMENTS_ENABLED=true.
 * Endpoints/fields follow Pine Labs' public docs; see DECISIONS.md for what is unverified.
 */
const BASE = { uat: "https://pluraluat.v2.pinepg.in", prod: "https://api.pluralpay.in" } as const;

function base() {
  return process.env.PINELABS_ENV === "prod" ? BASE.prod : BASE.uat;
}

function hdrs(extra: Record<string, string> = {}) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "Request-ID": randomUUID(),
    "Request-Timestamp": new Date().toISOString(),
    ...extra,
  };
}

function assertEnabled() {
  if (!paymentsEnabled()) throw new Error("payments disabled");
}

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  const clientId = process.env.PINELABS_CLIENT_ID;
  const clientSecret = process.env.PINELABS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Pine Labs credentials missing");
  const res = await fetch(`${base()}/api/auth/v1/token`, {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Pine Labs token failed (${res.status})`);
  const j = (await res.json()) as { access_token?: string; expires_at?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Pine Labs token response had no access_token");
  const exp = j.expires_at ? Date.parse(j.expires_at) : Date.now() + (j.expires_in ?? 300) * 1000;
  tokenCache = { token: j.access_token, exp: Number.isFinite(exp) ? exp : Date.now() + 300_000 };
  return j.access_token;
}

export type OrderInput = {
  reference: string; // merchant_order_reference
  amountInr: number; // whole rupees
  customerId: string;
  email?: string | null;
  firstName?: string | null;
  callbackUrl: string;
  failureCallbackUrl: string;
  notes?: string;
  items: { id: string; name: string; qty: number; unitPriceInr: number }[];
};

export async function createOrder(o: OrderInput): Promise<{ redirectUrl: string; orderId: string | null }> {
  assertEnabled();
  if (!process.env.PINELABS_MERCHANT_ID) throw new Error("PINELABS_MERCHANT_ID missing");
  const token = await accessToken();
  const paise = (n: number) => Math.round(n * 100);
  const res = await fetch(`${base()}/api/checkout/v1/orders`, {
    method: "POST",
    headers: hdrs({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({
      merchant_order_reference: o.reference,
      order_amount: { value: paise(o.amountInr), currency: "INR" },
      integration_mode: "REDIRECT",
      pre_auth: false,
      allowed_payment_methods: ["CARD", "UPI", "NETBANKING", "WALLET"],
      notes: o.notes ?? "",
      callback_url: o.callbackUrl,
      failure_callback_url: o.failureCallbackUrl,
      purchase_details: {
        customer: { customer_id: o.customerId, ...(o.email ? { email_id: o.email } : {}), ...(o.firstName ? { first_name: o.firstName } : {}) },
        cart_details: {
          cart_items: o.items.map((i) => ({
            item_id: i.id, item_name: i.name, item_quantity: i.qty,
            item_original_unit_price: paise(i.unitPriceInr), item_discounted_unit_price: paise(i.unitPriceInr), item_currency: "INR",
          })),
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Pine Labs order failed (${res.status})`);
  const j = (await res.json()) as Record<string, unknown> & { data?: Record<string, unknown> };
  const pick = (k: string) => (j[k] ?? j.data?.[k]) as string | undefined;
  const redirectUrl = pick("redirect_url") ?? pick("checkout_url");
  if (!redirectUrl) throw new Error("Pine Labs response had no redirect_url");
  return { redirectUrl, orderId: pick("order_id") ?? null };
}
