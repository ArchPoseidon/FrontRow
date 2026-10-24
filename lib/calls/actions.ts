"use server";

import { after } from "next/server";
import { auth } from "@/auth";
import { track } from "@/lib/activity";
import { savePhone, setCallMe, setConsent, setLead, suggestCallList, type Result } from "./store";

async function uid() {
  const s = await auth();
  if (!s?.user?.id) throw new Error("unauthorized");
  return s.user.id;
}

export async function savePhoneAction(input: string, consent: boolean): Promise<Result<{ masked: string }>> {
  const userId = await uid();
  const r = await savePhone(userId, input, consent);
  if (r.ok && consent && r.masked) after(() => track("call_optin", userId, { step: "consent" })); // never the number
  return r;
}

export async function setLeadAction(minutes: number): Promise<Result> {
  return setLead(await uid(), minutes);
}

export async function suggestAction(): Promise<Result<{ added: number }>> {
  const userId = await uid();
  const r = await suggestCallList(userId);
  if (r.ok && r.added) after(() => track("call_optin", userId, { step: "suggested", count: r.added }));
  return r;
}

export async function toggleCallMeAction(artistId: string, on: boolean): Promise<Result<{ count: number; needsPhone: boolean }>> {
  const userId = await uid();
  const r = await setCallMe(userId, artistId, on);
  if (r.ok && on) after(() => track("call_optin", userId, { artistId }));
  return r;
}

export async function setConsentAction(consent: boolean): Promise<Result<{ masked: string }>> {
  const userId = await uid();
  const r = await setConsent(userId, consent);
  if (r.ok && consent) after(() => track("call_optin", userId, { step: "consent" }));
  return r;
}

export async function removePhoneAction(): Promise<Result<{ masked: string }>> {
  return savePhone(await uid(), "", false);
}
