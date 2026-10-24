export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}
