/** Plan config. Owner confirms copy and price later; price is a config value, default 0. */
const price = Number(process.env.PLUS_PRICE_INR ?? 0);

export const PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceInr: 0,
    features: ["Alerts for every artist you follow", "Telegram and email alerts", "Radar, calendar and My shows"],
  },
  plus: {
    id: "plus" as const,
    name: "Plus",
    priceInr: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
    features: ["Voice call reminders when tickets launch", "More instant alerts", "Merch perks"],
  },
};
export type PlanId = keyof typeof PLANS;
