/** Voice calls stay off until the owner confirms the provider and places a first test call. */
export const voiceCallsEnabled = () => process.env.VOICE_CALLS_ENABLED === "true";
export const CALL_ME_MAX = 5;
export const LEAD_OPTIONS = [
  { minutes: 15, label: "15 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
] as const;
