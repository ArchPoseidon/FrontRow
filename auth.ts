import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// Only `openid email profile` (non-sensitive) so the consent screen can be
// published to production without Google verification.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();
  return {
    adapter: DrizzleAdapter(db, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    session: { strategy: "database" },
    providers: [
      Google({
        authorization: { params: { scope: "openid email profile" } },
      }),
    ],
    pages: { signIn: "/" },
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    events: {
      // The owner is whoever signs in with OWNER_EMAIL.
      async signIn({ user, account }) {
        // Connecting Google Calendar is a second consent. Auth.js only stores tokens on first link,
        // so keep the fresh ones (with the calendar scope) on the existing account row.
        if (account?.provider === "google" && account.scope?.includes("calendar") && account.providerAccountId) {
          await db
            .update(schema.accounts)
            .set({
              access_token: account.access_token ?? null,
              refresh_token: account.refresh_token ?? undefined,
              expires_at: account.expires_at ?? null,
              scope: account.scope,
              token_type: account.token_type ?? null,
            })
            .where(and(eq(schema.accounts.provider, "google"), eq(schema.accounts.providerAccountId, account.providerAccountId)));
        }
        const owner = process.env.OWNER_EMAIL?.toLowerCase();
        if (owner && user.email?.toLowerCase() === owner && user.id) {
          await db.update(schema.users).set({ isOwner: true }).where(eq(schema.users.id, user.id));
        }
      },
    },
  };
});
