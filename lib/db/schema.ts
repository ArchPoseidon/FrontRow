import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const now = () => tstz("created_at").notNull().defaultNow();

/* ---------- Auth.js (adapter shapes: camelCase columns) ---------- */

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  homeCity: text("home_city").default("Bengaluru"),
  watchCities: text("watch_cities").array().default(sql`'{ALL_INDIA}'::text[]`),
  p1Cities: text("p1_cities").array().notNull().default(sql`'{}'::text[]`),
  p2Cities: text("p2_cities").array().notNull().default(sql`'{}'::text[]`),
  watchAllIndia: boolean("watch_all_india").notNull().default(true),
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
  telegramLinkCode: text("telegram_link_code").unique(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  telegramEnabled: boolean("telegram_enabled").notNull().default(true),
  phoneE164: text("phone_e164"),
  phoneConsentAt: tstz("phone_consent_at"),
  plan: text("plan").notNull().default("free"),
  onboardingStep: integer("onboarding_step").notNull().default(0),
  onboardedAt: tstz("onboarded_at"),
  firstScanAt: tstz("first_scan_at"),
  isOwner: boolean("is_owner").notNull().default(false),
  lastSeenAt: tstz("last_seen_at"),
  disabledAt: tstz("disabled_at"),
  createdAt: now(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const spotifyConnections = pgTable("spotify_connections", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  spotifyUserId: text("spotify_user_id"),
  displayName: text("display_name"),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: tstz("expires_at"),
  broken: boolean("broken").notNull().default(false),
});

/* ---------- Artists ---------- */

export const artists = pgTable(
  "artists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    spotifyId: text("spotify_id").unique(),
    mbid: text("mbid").unique(),
    imageUrl: text("image_url"),
    genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
    origin: text("origin").notNull().default("unknown"), // india|international|unknown
    identityStatus: text("identity_status").notNull().default("unverified"), // verified|needs_review|unverified
    lastIndiaShow: text("last_india_show"),
    lastIndiaDate: date("last_india_date"),
    lastCheckedAt: tstz("last_checked_at"),
    upcomingCount: integer("upcoming_count").notNull().default(0),
    isDeceased: boolean("is_deceased").notNull().default(false),
    deceasedCheckedAt: tstz("deceased_checked_at"),
    inactiveReason: text("inactive_reason"), // deceased|disbanded
    bioSourceUrl: text("bio_source_url"),
    createdAt: now(),
  },
  (t) => [index("artists_name_trgm").using("gin", sql`${t.normalizedName} gin_trgm_ops`)],
);

export const userArtists = pgTable(
  "user_artists",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    priority: text("priority").notNull().default("follow"), // must_see|follow|muted
    addedVia: text("added_via").notNull().default("search"),
    callMe: boolean("call_me").notNull().default(false),
    callLeadMinutes: integer("call_lead_minutes").notNull().default(60),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.artistId] }), index("user_artists_artist").on(t.artistId)],
);

export const artistCandidates = pgTable("artist_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inputText: text("input_text").notNull(),
  candidates: jsonb("candidates").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("open"), // open|resolved|removed
  createdAt: now(),
});

/* ---------- Pipeline ---------- */

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull(), // news_rss|listing|grounded_sweep|event_page
  url: text("url"),
  config: jsonb("config"),
  intervalMinutes: integer("interval_minutes").notNull().default(30),
  lastRunAt: tstz("last_run_at"),
  lastOkAt: tstz("last_ok_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastContentHash: text("last_content_hash"),
  enabled: boolean("enabled").notNull().default(true),
});

export const rawItems = pgTable(
  "raw_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    url: text("url"),
    title: text("title"),
    content: text("content"),
    contentHash: text("content_hash").notNull().unique(),
    artistHint: text("artist_hint"),
    status: text("status").notNull().default("new"), // new|processed|skipped|error
    error: text("error"),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
  },
  (t) => [index("raw_items_status").on(t.status, t.fetchedAt)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    venue: text("venue"),
    city: text("city"),
    state: text("state"),
    eventDate: date("event_date"),
    eventTime: text("event_time"),
    ticketUrl: text("ticket_url"),
    platform: text("platform"),
    status: text("status").notNull().default("announced"),
    saleOpensAt: tstz("sale_opens_at"),
    confidence: real("confidence").notNull().default(0.5),
    isFestival: boolean("is_festival").notNull().default(false),
    lineup: text("lineup").array().notNull().default(sql`'{}'::text[]`),
    ticketStatus: text("ticket_status").notNull().default("unchecked"),
    ticketCheckedAt: tstz("ticket_checked_at"),
    ticketVerifiedAt: tstz("ticket_verified_at"),
    ticketReportCount: integer("ticket_report_count").notNull().default(0),
    dedupeKey: text("dedupe_key").notNull().unique(),
    isSample: boolean("is_sample").notNull().default(false),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("events_artist_date").on(t.artistId, t.eventDate), index("events_city").on(t.city)],
);

export const eventTiers = pgTable("event_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceInr: integer("price_inr"),
  status: text("status").notNull().default("upcoming"), // upcoming|open|sold_out|closed
  opensAt: tstz("opens_at"),
  closesAt: tstz("closes_at"),
  observedAt: tstz("observed_at").defaultNow(),
});

export const eventSources = pgTable(
  "event_sources",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    rawItemId: uuid("raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    platform: text("platform"),
    status: text("status").notNull().default("unchecked"),
    httpStatus: integer("http_status"),
    finalUrl: text("final_url"),
    pageTitle: text("page_title"),
    checkedAt: tstz("checked_at"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.url] })],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // new_show|early_bird_open|sale_soon|closing_soon|tier_change|digest|test
    channel: text("channel").notNull(), // telegram|email
    urgency: text("urgency").notNull().default("info"), // red|amber|info
    status: text("status").notNull().default("pending"), // pending|digest_pending|sent|failed|skipped
    sentAt: tstz("sent_at"),
    userAction: text("user_action"), // dismissed|going|saved|bought|wrong_link
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("alerts_unique").on(t.userId, t.eventId, t.kind, t.channel),
    index("alerts_status").on(t.status, t.urgency),
  ],
);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  startedAt: tstz("started_at").notNull().defaultNow(),
  finishedAt: tstz("finished_at"),
  itemsIn: integer("items_in").notNull().default(0),
  eventsNew: integer("events_new").notNull().default(0),
  alertsSent: integer("alerts_sent").notNull().default(0),
  firecrawlCredits: integer("firecrawl_credits").notNull().default(0),
  scrapedoCredits: integer("scrapedo_credits").notNull().default(0),
  errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`),
});

export const calendarEntries = pgTable(
  "calendar_entries",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id"),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

/* ---------- New in v2 ---------- */

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: now(),
  },
  (t) => [index("activity_type_time").on(t.type, t.createdAt), index("activity_user_time").on(t.userId, t.createdAt)],
);

export const artistNews = pgTable(
  "artist_news",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    publisher: text("publisher"),
    publishedAt: tstz("published_at"),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("artist_news_url").on(t.artistId, t.url)],
);

export const merchProducts = pgTable("merch_products", {
  id: text("id").primaryKey(),
  artistId: uuid("artist_id").references(() => artists.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  priceInr: integer("price_inr").notNull(),
  category: text("category").notNull().default("tee"),
  isDemo: boolean("is_demo").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: now(),
});

export const merchVariants = pgTable(
  "merch_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id").notNull().references(() => merchProducts.id, { onDelete: "cascade" }),
    size: text("size"), // S|M|L|XL|Free
    sku: text("sku").notNull().unique(),
    stock: integer("stock").notNull().default(0),
  },
  (t) => [index("merch_variants_product").on(t.productId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => merchVariants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.variantId] })],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"), // free|plus
  status: text("status").notNull().default("pending"), // active|pending|cancelled|failed
  pinelabsOrderId: text("pinelabs_order_id"),
  amountInr: integer("amount_inr").notNull().default(0),
  currentPeriodEnd: tstz("current_period_end"),
  createdAt: now(),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull().unique(),
  payload: jsonb("payload").notNull(),
  receivedAt: tstz("received_at").notNull().defaultNow(),
});

export const callReminders = pgTable(
  "call_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    scheduledFor: tstz("scheduled_for").notNull(),
    status: text("status").notNull().default("scheduled"), // scheduled|calling|done|failed|cancelled|no_answer
    attempts: integer("attempts").notNull().default(0),
    providerCallId: text("provider_call_id"),
    outcome: jsonb("outcome"),
    createdAt: now(),
  },
  (t) => [uniqueIndex("call_reminders_unique").on(t.userId, t.eventId), index("call_reminders_due").on(t.status, t.scheduledFor)],
);
