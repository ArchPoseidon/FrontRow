import { getDb } from "@/lib/db";
import { getCallMeData } from "@/lib/calls/store";
import { voiceCallsEnabled } from "@/lib/calls/flag";
import { CallMeSection } from "./CallMeSection";

/** Async server wrapper for the Radar page: render inside <Suspense>. `<CallMeServer userId={user.id} />` */
export async function CallMeServer({ userId }: { userId: string }) {
  const data = await getCallMeData(getDb(), userId);
  return <CallMeSection data={data} voiceOn={voiceCallsEnabled()} />;
}
