import { after } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { answerCallback, editCaption, editText, esc, sendMessage } from "@/lib/notify/telegram";
import { telegramButtons } from "@/lib/notify/caption";
import { loadEventCard, showDay } from "@/lib/notify/content";
import { appUrl } from "@/lib/notify/email";
import { upcomingForUser } from "@/lib/brain/scan";
import { normalizeName } from "@/lib/identity/normalize";
import { dispatchAlerts } from "@/lib/notify/dispatch";
import { loadWatched } from "@/lib/brain/match";
import { collectArtistNews } from "@/lib/collectors/news";
import { processItems } from "@/lib/brain/process";

export const maxDuration = 60;

type Update = {
  message?: { chat: { id: number; type: string }; text?: string; from?: { id: number } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number; caption?: string; text?: string } };
};

const HELP = [
  "<b>FrontRow</b> commands",
  "/upcoming – your next shows",
  "/artists – who you follow",
  "/mute &lt;artist&gt; – stop alerts for an artist",
  "/help – this message",
].join("\n");

async function userByChat(db: Db, chatId: number) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.telegramChatId, chatId));
  return u ?? null;
}

async function handleMessage(db: Db, chatId: number, text: string) {
  const [cmdRaw, ...rest] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, "");
  const arg = rest.join(" ").trim();

  if (cmd === "/start") {
    if (!arg) {
      const known = await userByChat(db, chatId);
      return sendMessage(chatId, known ? `You're linked as ${esc(known.name ?? known.email ?? "your account")}. Send /help to see what I can do.` : "Hi! To link this chat, open FrontRow and tap “Connect Telegram”.");
    }
    const [u] = await db.select().from(schema.users).where(eq(schema.users.telegramLinkCode, arg));
    if (!u) return sendMessage(chatId, "That link has expired. Open FrontRow and tap “Connect Telegram” again to get a fresh one.");
    // A chat belongs to one account.
    await db.update(schema.users).set({ telegramChatId: null }).where(eq(schema.users.telegramChatId, chatId));
    await db.update(schema.users).set({ telegramChatId: chatId, telegramLinkCode: null, telegramEnabled: true }).where(eq(schema.users.id, u.id));
    return sendMessage(chatId, `✅ Linked${u.name ? `, ${esc(u.name.split(" ")[0])}` : ""}! I'll message you here the moment one of your artists announces a show in India.\n\n${HELP}`);
  }

  const user = await userByChat(db, chatId);
  if (!user) return sendMessage(chatId, "This chat isn't linked yet. Open FrontRow and tap “Connect Telegram”.");

  switch (cmd) {
    case "/help":
      return sendMessage(chatId, HELP);
    case "/upcoming": {
      const shows = (await upcomingForUser(db, user.id, user.homeCity)).slice(0, 8);
      if (!shows.length) return sendMessage(chatId, "No upcoming India shows for your artists right now. I'm watching and will message you the moment one is announced.");
      return sendMessage(chatId, "<b>Your next shows</b>\n" + shows.map((s) => `• <b>${esc(s.artistName)}</b> · ${esc(s.city ?? "city TBA")} · ${esc(showDay(s.date))}`).join("\n"));
    }
    case "/artists": {
      const rows = await db
        .select({ name: schema.artists.name, priority: schema.userArtists.priority })
        .from(schema.userArtists)
        .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
        .where(eq(schema.userArtists.userId, user.id));
      if (!rows.length) return sendMessage(chatId, "You're not following any artists yet.");
      const must = rows.filter((r) => r.priority === "must_see").map((r) => esc(r.name));
      const rest = rows.filter((r) => r.priority === "follow").length;
      const muted = rows.filter((r) => r.priority === "muted").length;
      return sendMessage(chatId, `Following ${rows.length} artists (${must.length} must-see, ${rest} follow, ${muted} muted).${must.length ? `\n<b>Must-see:</b> ${must.slice(0, 25).join(", ")}` : ""}`);
    }
    case "/mute": {
      if (!arg) return sendMessage(chatId, "Tell me who: /mute &lt;artist&gt;");
      const n = normalizeName(arg);
      const rows = await db
        .select({ id: schema.artists.id, name: schema.artists.name })
        .from(schema.userArtists)
        .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
        .where(and(eq(schema.userArtists.userId, user.id), ilike(schema.artists.normalizedName, `%${n.replace(/[%_]/g, "")}%`)));
      const exact = rows.find((r) => normalizeName(r.name) === n);
      const pick = exact ?? (rows.length === 1 ? rows[0] : null);
      if (!pick) return sendMessage(chatId, rows.length ? `Which one? ${rows.slice(0, 6).map((r) => esc(r.name)).join(", ")}. Send /mute with the full name.` : `You don't follow “${esc(arg)}”.`);
      await db.update(schema.userArtists).set({ priority: "muted" }).where(and(eq(schema.userArtists.userId, user.id), eq(schema.userArtists.artistId, pick.id)));
      return sendMessage(chatId, `🔕 Muted ${esc(pick.name)}. You can unmute in FrontRow.`);
    }
    case "/scan": {
      if (!user.isOwner) return sendMessage(chatId, "That command is for the app owner only.");
      await sendMessage(chatId, "Scanning news for all watched artists…");
      after(async () => {
        try {
          const w = await loadWatched(db);
          const n = await collectArtistNews(db, null, w, { perArtist: 3 });
          const p = await processItems(db, { ids: n.itemIds.slice(0, 30), limit: 30, concurrency: 5 });
          const d = await dispatchAlerts(db, 20);
          await sendMessage(chatId, `Done. ${n.feeds - n.failedFeeds}/${n.feeds} feeds, ${n.newItems} new headlines, ${p.eventsNew} new events, ${d.sent} alerts sent.`);
        } catch (e) {
          await sendMessage(chatId, `Scan failed: ${esc(e instanceof Error ? e.message.slice(0, 120) : "error")}`).catch(() => {});
        }
      });
      return;
    }
    default:
      return sendMessage(chatId, "I didn't get that. Try /help.");
  }
}

async function handleCallback(db: Db, cq: NonNullable<Update["callback_query"]>) {
  const [action, alertId] = (cq.data ?? "").split(":");
  if (action === "noop" || !alertId || !cq.message) return answerCallback(cq.id);
  const chatId = cq.message.chat.id;
  const user = await userByChat(db, chatId);
  const [alert] = user ? await db.select().from(schema.alerts).where(and(eq(schema.alerts.id, alertId), eq(schema.alerts.userId, user.id))) : [];
  if (!user || !alert) return answerCallback(cq.id, "This alert is no longer available");
  const acted = action === "bought" ? "bought" : "dismissed";
  await db.update(schema.alerts).set({ userAction: acted }).where(eq(schema.alerts.id, alert.id));
  const ev = await loadEventCard(db, alert.eventId);
  await answerCallback(cq.id, acted === "bought" ? "Going 🎉" : "Got it");
  if (!ev) return;
  const buttons = telegramButtons(ev, alert.id, appUrl(), acted);
  const base = cq.message.caption ?? cq.message.text ?? "";
  const next = `${base}\n\n${acted === "bought" ? "Going 🎉" : "Dismissed"}`;
  // Photo alerts edit the caption; text fallbacks edit the text.
  await (cq.message.caption !== undefined ? editCaption(chatId, cq.message.message_id, esc(next), buttons) : editText(chatId, cq.message.message_id, esc(next), buttons)).catch(() => {});
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new Response("Forbidden", { status: 403 });
  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update) return Response.json({ ok: true });
  const db = getDb();
  try {
    if (update.callback_query) await handleCallback(db, update.callback_query);
    else if (update.message?.text && update.message.chat.type === "private") await handleMessage(db, update.message.chat.id, update.message.text);
  } catch (e) {
    console.error("telegram webhook", e);
  }
  // Always 200 so Telegram does not retry a poison update forever.
  return Response.json({ ok: true });
}

