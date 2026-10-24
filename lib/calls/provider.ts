// Outbound voice reminder provider: Voibz (telephony) bridged to an ElevenLabs Conversational AI agent.
//
// TODO(owner): the exact Voibz API is UNCONFIRMED. Everything below the interface is a placeholder shape.
// Before VOICE_CALLS_ENABLED is ever set to "true": confirm the provider and its API with the owner, then place
// ONE test call to the owner's own number and write what happened into DECISIONS.md.

export type CallRequest = {
  reminderId: string;
  to: string; // E.164, never logged
  firstName: string;
  artist: string;
  city: string;
  date: string; // spoken, e.g. "Saturday 14 March"
  goLive: string; // spoken, e.g. "6 pm today"
};

export interface CallProvider {
  /** Starts the call and returns the provider's call id. Final outcome arrives on /api/calls/webhook. */
  placeCall(req: CallRequest): Promise<{ providerCallId: string }>;
}

export class VoibzElevenLabsProvider implements CallProvider {
  async placeCall(req: CallRequest): Promise<{ providerCallId: string }> {
    const base = process.env.VOIBZ_API_URL; // UNCONFIRMED: no documented base URL yet
    const key = process.env.VOIBZ_API_KEY;
    const agent = process.env.ELEVENLABS_AGENT_ID;
    if (!base || !key || !agent || !process.env.ELEVENLABS_API_KEY) throw new Error("Voice provider is not configured");
    // TODO(owner): UNCONFIRMED endpoint and body. Replace with the real Voibz outbound-call request once known.
    const res = await fetch(`${base.replace(/\/$/, "")}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        to: req.to,
        agent_id: agent,
        elevenlabs_api_key: process.env.ELEVENLABS_API_KEY,
        reference: req.reminderId,
        dynamic_variables: { first_name: req.firstName, artist: req.artist, city: req.city, date: req.date, go_live: req.goLive },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Voice provider returned ${res.status}`); // never include the body: it may echo the number
    const j = (await res.json().catch(() => ({}))) as { id?: string; call_id?: string };
    const id = j.call_id ?? j.id;
    if (!id) throw new Error("Voice provider returned no call id");
    return { providerCallId: String(id) };
  }
}

let provider: CallProvider | null = null;
export const getProvider = (): CallProvider => (provider ??= new VoibzElevenLabsProvider());
export const setProviderForTests = (p: CallProvider | null) => { provider = p; };
