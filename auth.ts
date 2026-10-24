import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { accounts, getDb, sessions, users, verificationTokens } from "@/lib/db";
import { track } from "@/lib/activity";
import { persistGoogleTokens } from "@/lib/gcal";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();
  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: "database" },
    providers: [
      Google({
        authorization: {
          params: {
            scope: "openid email profile https://www.googleapis.com/auth/calendar.events",
            access_type: "offline",
            prompt: "consent",
          },
        },
      }),
    ],
    callbacks: {
      async session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
      async signIn({ user }) {
        // Disabled accounts cannot sign in.
        if (user.id) {
          const [row] = await db.select({ d: users.disabledAt }).from(users).where(eq(users.id, user.id));
          if (row?.d) return false;
        }
        return true;
      },
    },
    events: {
      async createUser({ user }) {
        if (user.id) await track("signup", user.id);
      },
      async signIn({ user, account }) {
        if (user.id) await track("login", user.id);
        // Re-consent hands us fresh tokens and scope; the adapter only stores them on first link.
        if (user.id && account) await persistGoogleTokens(db, user.id, account).catch(() => {});
        const owner = process.env.OWNER_EMAIL?.toLowerCase();
        if (user.id && owner && user.email?.toLowerCase() === owner) {
          await db.update(users).set({ isOwner: true }).where(eq(users.id, user.id));
        }
      },
    },
  };
});
