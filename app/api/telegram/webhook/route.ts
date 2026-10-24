import { after } from "next/server";
import { and, count, desc, eq, gte, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { answerCallback, editCaption, editReplyMarkupOnly, editText, esc, sendMessage } from "@/lib/notify/telegram";
import { telegramButtons, ticketReplyText } from "@/lib/notify/caption";
import { loadEventCard, showDay } from "@/lib/notify/content";
import { appUrl } from "@/lib/notify/email";
import { upcomingForUser } from "@/lib/brain/scan";
import { normalizeName } from "@/lib/identity/normalize";
import { deliverTelegram, dispatchAlerts } from "@/lib/notify/dispatch";
import { reportWrongLink } from "@/lib/links/report";
import { track } from "@/lib/activity";
import { MAJOR_CITIES } from "@/lib/util/cities";
import { normalizeCity } from "@/lib/util/city";
import { verifyBatch } from "@/lib/brain/process";
import { todayIST } from "@/lib/util/ist";
import { decideForEvents } from "@/lib/brain/decide";
import { loadWatched } from "@/lib/brain/match";
import { collectArtistNews } from "@/lib/collectors/news";
import { processItems } from "@/lib/brain/process";
import { crawlersPaused, creditsUsedToday, dailyCap as fcCap, setCrawlersPaused } from "@/lib/firecrawl";
import { dailyCap as sdDayCap, monthlyCap as sdMonthCap, scrapedoUsed } from "@/lib/scrapedo";

export const maxDuration = 60;

type Update = {
  message?: { chat: { id: number; type: string }; text?: string; from?: { id: number } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number; caption?: string; text?: string } };
};

const HELP = [
  "<b>FrontRow</b> commands",
  "/new – the newest shows for your artists",
  "/tickets – ticket info for those shows (or /tickets &lt;artist&gt;)",
  "/upcoming – your next shows",
  "/artists – who you follow",
  "/mute &lt;artist&gt; – stop alerts for an artist",
  "/cities – see and change your P1 / P2 cities",
  "/calls – your voice call reminders (list, cancel)",
  "/help – this message",
].join("\n");

async function userByChat(db: Db, chatId: number) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.telegramChatId, chatId));
  return u ?? null;
}


// The user's newest shows (first seen in the last `days` days), newest first. Falls back to the latest few overall.
async function recentShows(db: Db, userId: string, limit: number, days = 7) {
  const base = and(eq(schema.userArtists.userId, userId), ne(schema.userArtists.priority, "muted"), eq(schema.events.isSample, false), ne(schema.events.status, "cancelled"), or(isNull(schema.events.eventDate), gte(schema.events.eventDate, todayIST())));
  const q = (extra?: ReturnType<typeof gte>) =>
    db
      .select({ id: schema.events.id })
      .from(schema.events)
      .innerJoin(schema.userArtists, eq(schema.userArtists.artistId, schema.events.artistId))
      .where(extra ? and(base, extra) : base)
      .orderBy(desc(schema.events.firstSeenAt))
      .limit(limit);
  const fresh = await q(gte(schema.events.firstSeenAt, new Date(Date.now() - days * 86400_000)));
  if (fresh.length) return { ids: fresh.map((r) => r.id), fresh: true };
  return { ids: (await q()).map((r) => r.id), fresh: false };
}

// Make sure the links are checked before we answer (a few seconds at most), then load the card.
async function readyCard(db: Db, eventId: string) {
  await verifyBatch(db, [eventId], { maxEvents: 1, timeMs: 12_000 }).catch(() => 0);
  return loadEventCard(db, eventId);
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
    // A chat belongs to one account: linking it here unlinks it from any other FrontRow account (said out loud below).
    const [prev] = await db.select({ email: schema.users.email, id: schema.users.id }).from(schema.users).where(eq(schema.users.telegramChatId, chatId));
    await db.update(schema.users).set({ telegramChatId: null }).where(eq(schema.users.telegramChatId, chatId));
    await db.update(schema.users).set({ telegramChatId: chatId, telegramLinkCode: null, telegramEnabled: true }).where(eq(schema.users.id, u.id));
    after(() => track("telegram_linked", u.id));
    // Linked: queue Telegram alerts for everything already found for this user's artists and send the first ones now,
    // so a new user sees the product working straight away. The scheduled dispatch job sends the rest.
    after(async () => {
      try {
        const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
        const shows = await upcomingForUser(db, u.id, fresh?.homeCity ?? null);
        await decideForEvents(db, shows.map((s) => s.eventId), u.id);
        const r = await dispatchAlerts(db, 20, u.id, 8);
        if (!r.sent && !shows.length) await sendMessage(chatId, "No India shows announced for your artists yet. I'm scanning now and will message you the moment one lands.");
      } catch (e) {
        console.error("first alerts after link", e);
      }
    });
    return sendMessage(chatId, `✅ Linked${u.name ? `, ${esc(u.name.split(" ")[0])}` : ""}! ${prev && prev.id !== u.id ? "This chat was linked to another FrontRow account; it now belongs to this one.\n" : ""}Sending your first alerts now, then I'll message you the moment one of your artists announces a show in India.\n\n${HELP}`);
  }

  const user = await userByChat(db, chatId);
  if (!user) return sendMessage(chatId, "This chat isn't linked yet. Open FrontRow and tap “Connect Telegram”.");

  switch (cmd) {
    case "/help":
      return sendMessage(chatId, HELP);
    case "/new": {
      const { ids, fresh } = await recentShows(db, user.id, 5);
      if (!ids.length) return sendMessage(chatId, "Nothing found for your artists yet. I'm watching and will message you the moment a show is announced.");
      await sendMessage(chatId, fresh ? `<b>New for your artists</b> (last 7 days). Tap <b>Ticket info</b> under any show.` : "No new shows in the last 7 days. Here are the latest found for your artists. Tap <b>Ticket info</b> under any show.");
      for (const id of ids) {
        const ev = await readyCard(db, id);
        if (!ev) continue;
        const [al] = await db.select({ id: schema.alerts.id }).from(schema.alerts).where(and(eq(schema.alerts.userId, user.id), eq(schema.alerts.eventId, id), eq(schema.alerts.channel, "telegram"), eq(schema.alerts.kind, "new_show")));
        await deliverTelegram(db, user, ev, "amber", al?.id ?? null).catch((e) => console.error("/new send", e));
      }
      return;
    }
    case "/tickets": {
      let ids: string[];
      if (arg) {
        const n = normalizeName(arg);
        const rows = await db
          .select({ id: schema.events.id, name: schema.artists.normalizedName })
          .from(schema.events)
          .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
          .innerJoin(schema.userArtists, and(eq(schema.userArtists.artistId, schema.artists.id), eq(schema.userArtists.userId, user.id)))
          .where(and(eq(schema.events.isSample, false), ne(schema.events.status, "cancelled"), or(isNull(schema.events.eventDate), gte(schema.events.eventDate, todayIST())), ilike(schema.artists.normalizedName, `%${n.replace(/[%_]/g, "")}%`)))
          .orderBy(schema.events.eventDate)
          .limit(4);
        ids = rows.map((r) => r.id);
        if (!ids.length) return sendMessage(chatId, `I don't see an upcoming show for “${esc(arg)}” among your artists. Try /new or /upcoming.`);
      } else {
        ids = (await recentShows(db, user.id, 3)).ids;
        if (!ids.length) return sendMessage(chatId, "No shows found for your artists yet. I'll message you the moment one is announced.");
      }
      for (const id of ids) {
        const ev = await readyCard(db, id);
        if (ev) await sendMessage(chatId, ticketReplyText(ev, appUrl()), ev.ticketUrl ? [[{ text: "🎟 Open ticket page", url: ev.ticketUrl }]] : undefined);
      }
      return;
    }
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
      const order = { must_see: 0, follow: 1, muted: 2 } as const;
      const sorted = [...rows].sort((x, y) => order[(x.priority ?? "follow") as keyof typeof order] - order[(y.priority ?? "follow") as keyof typeof order] || x.name.localeCompare(y.name));
      const tag = (p: string | null) => (p === "must_see" ? " ⭐" : p === "muted" ? " 🔕" : "");
      const list = sorted.map((r, i) => `${i + 1}. ${esc(r.name)}${tag(r.priority)}`);
      // Telegram caps a message at 4096 characters: send in chunks.
      const chunks: string[] = [];
      let cur = `<b>Following ${rows.length} artists</b> (⭐ must-see, 🔕 muted)\n`;
      for (const line of list) {
        if (cur.length + line.length + 1 > 3800) {
          chunks.push(cur);
          cur = "";
        }
        cur += `${line}\n`;
      }
      chunks.push(cur);
      for (const c of chunks) await sendMessage(chatId, c);
      return;
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
    case "/cities": {
      const show = (u: typeof user) => [`<b>Your cities</b>`, `P1 (instant): ${u.p1Cities?.length ? esc(u.p1Cities.join(", ")) : "none"}`, `P2 (also tell me): ${u.p2Cities?.length ? esc(u.p2Cities.join(", ")) : "none"}`, `All India (digest only): ${u.watchAllIndia ? "on" : "off"}`].join("\n");
      const [verb, ...restWords] = arg.split(/\s+/);
      const v = (verb ?? "").toLowerCase();
      if (!v) return sendMessage(chatId, `${show(user)}\n\nChange: /cities p1 Mumbai, Pune · /cities p2 Delhi NCR · /cities all on|off\nPick from: ${MAJOR_CITIES.join(", ")}`);
      if (v === "all") {
        const on = /^(on|yes|1|true)$/i.test(restWords[0] ?? "");
        await db.update(schema.users).set({ watchAllIndia: on }).where(eq(schema.users.id, user.id));
        return sendMessage(chatId, `All India is now ${on ? "on" : "off"}.`);
      }
      if (v === "p1" || v === "p2") {
        const wanted = restWords.join(" ").split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
        const picked = [...new Set(wanted.map((w) => MAJOR_CITIES.find((m) => normalizeCity(m) === normalizeCity(w))).filter(Boolean) as string[])];
        if (wanted.length && !picked.length) return sendMessage(chatId, `I didn't recognise those. Pick from: ${MAJOR_CITIES.join(", ")}`);
        const p1 = v === "p1" ? picked.slice(0, 3) : (user.p1Cities ?? []).filter((c) => !picked.includes(c));
        const p2 = v === "p2" ? picked.filter((c) => !p1.includes(c)).slice(0, 5) : (user.p2Cities ?? []).filter((c) => !p1.includes(c));
        const [fresh] = await db.update(schema.users).set({ p1Cities: p1, p2Cities: p2, homeCity: p1[0] ?? user.homeCity }).where(eq(schema.users.id, user.id)).returning();
        return sendMessage(chatId, `✅ Saved.\n\n${show(fresh)}`);
      }
      return sendMessage(chatId, "Try /cities, /cities p1 Mumbai, /cities p2 Pune or /cities all off.");
    }
    case "/calls": {
      const rows = await db
        .select({ id: schema.callReminders.id, at: schema.callReminders.scheduledFor, status: schema.callReminders.status, artist: schema.artists.name, city: schema.events.city })
        .from(schema.callReminders)
        .innerJoin(schema.artists, eq(schema.artists.id, schema.callReminders.artistId))
        .innerJoin(schema.events, eq(schema.events.id, schema.callReminders.eventId))
        .where(and(eq(schema.callReminders.userId, user.id), inArray(schema.callReminders.status, ["scheduled", "calling"])))
        .orderBy(schema.callReminders.scheduledFor);
      const [a, b] = arg.toLowerCase().split(/\s+/);
      if (a === "cancel") {
        const target = b === "all" ? rows : rows.filter((_, i) => String(i + 1) === b);
        if (!target.length) return sendMessage(chatId, "Tell me which one: /calls cancel 1, or /calls cancel all.");
        await db.update(schema.callReminders).set({ status: "cancelled" }).where(inArray(schema.callReminders.id, target.map((t) => t.id)));
        return sendMessage(chatId, `Cancelled ${target.length} call reminder${target.length === 1 ? "" : "s"}.`);
      }
      const on = process.env.VOICE_CALLS_ENABLED === "true";
      if (!rows.length) return sendMessage(chatId, `No call reminders scheduled.${on ? "" : " Voice calls switch on soon."}`);
      const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
      return sendMessage(chatId, [`<b>Your call reminders</b>${on ? "" : " (voice calls switch on soon)"}`, ...rows.map((r, i) => `${i + 1}. ${esc(r.artist)}${r.city ? ` · ${esc(r.city)}` : ""} · ${fmt(r.at)}`), "", "Cancel with /calls cancel 1 or /calls cancel all"].join("\n"));
    }
    case "/stats": {
      if (!user.isOwner) return sendMessage(chatId, "That command is for the app owner only.");
      const day = new Date(Date.now() - 86400_000);
      const week = new Date(Date.now() - 7 * 86400_000);
      const [[total], [newWeek], [dau], [linked], [alertsToday], red] = await Promise.all([
        db.select({ n: count() }).from(schema.users),
        db.select({ n: count() }).from(schema.users).where(gte(schema.users.createdAt, week)),
        db.select({ n: count() }).from(schema.users).where(gte(schema.users.lastSeenAt, day)),
        db.select({ n: count() }).from(schema.users).where(sql`${schema.users.telegramChatId} is not null`),
        db.select({ n: count() }).from(schema.alerts).where(and(eq(schema.alerts.status, "sent"), gte(schema.alerts.sentAt, day))),
        db.select({ name: schema.sources.name, f: schema.sources.consecutiveFailures }).from(schema.sources).where(gte(schema.sources.consecutiveFailures, 3)),
      ]);
      const pct = total.n ? Math.round((linked.n / total.n) * 100) : 0;
      return sendMessage(chatId, [`<b>FrontRow stats</b>`, `Users: ${total.n} (+${newWeek.n} in 7 days)`, `Active in 24h: ${dau.n}`, `Telegram linked: ${linked.n} (${pct}%)`, `Alerts sent in 24h: ${alertsToday.n}`, red.length ? `⚠️ Failing sources: ${esc(red.map((r) => r.name).join(", "))}` : "Pipeline: no red flags"].join("\n"));
    }
    case "/crawlers": {
      if (!user.isOwner) return sendMessage(chatId, "That command is for the app owner only.");
      const a = arg.trim().toLowerCase();
      if (a === "pause" || a === "resume") {
        await setCrawlersPaused(a === "pause");
        return sendMessage(chatId, a === "pause" ? "⏸ Crawlers paused. Firecrawl, Scrape.do and Jina will not be called. Send /crawlers resume to turn them back on." : "▶️ Crawlers resumed. Daily caps still apply.");
      }
      const paused = await crawlersPaused();
      const forced = ["1", "true", "yes"].includes((process.env.CRAWLERS_PAUSED ?? "").toLowerCase());
      const fc = await creditsUsedToday(db).catch(() => null);
      const sd = await scrapedoUsed().catch(() => null);
      return sendMessage(chatId, [`Crawlers: <b>${paused ? "PAUSED" : "running"}</b>${forced ? " (forced by CRAWLERS_PAUSED in the environment)" : ""}`, `Firecrawl today: ${fc ?? "?"}/${fcCap()}`, `Scrape.do: ${sd ? `${sd.day}/${sdDayCap()} today, ${sd.month}/${sdMonthCap()} this month` : "?"}`, "", "/crawlers pause · /crawlers resume"].join("\n"));
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
  if ((cq.data ?? "").startsWith("tix:") && cq.message) {
    // "Ticket info" under a show: answer in the chat with the checked ticket page, tiers and prices.
    const chatId = cq.message.chat.id;
    const user = await userByChat(db, chatId);
    await answerCallback(cq.id, user ? "Getting the ticket info…" : "Link your account first");
    if (!user) return;
    const ev = await readyCard(db, (cq.data ?? "").slice(4));
    if (!ev) return sendMessage(chatId, "That show is no longer available.");
    return sendMessage(chatId, ticketReplyText(ev, appUrl()), ev.ticketUrl ? [[{ text: "🎟 Open ticket page", url: ev.ticketUrl }]] : undefined);
  }
  const [action, alertId] = (cq.data ?? "").split(":");
  if (action === "noop" || !alertId || !cq.message) return answerCallback(cq.id);
  const chatId = cq.message.chat.id;
  const user = await userByChat(db, chatId);
  const [alert] = user ? await db.select().from(schema.alerts).where(and(eq(schema.alerts.id, alertId), eq(schema.alerts.userId, user.id))) : [];
  if (!user || !alert) return answerCallback(cq.id, "This alert is no longer available");
  if (action === "wrong") {
    await reportWrongLink(db, alert.eventId);
    after(() => track("alert_action", user.id, { action: "wrong_link" }));
    await answerCallback(cq.id, "Thanks. I pulled that link and will re-check it.");
    const ev2 = await loadEventCard(db, alert.eventId);
    if (ev2) await editReplyMarkupOnly(chatId, cq.message.message_id, telegramButtons(ev2, alert.id, appUrl()));
    return;
  }
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

