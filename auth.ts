import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
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
      async signIn({ user }) {
        const owner = process.env.OWNER_EMAIL?.toLowerCase();
        if (owner && user.email?.toLowerCase() === owner && user.id) {
          await db.update(schema.users).set({ isOwner: true }).where(eq(schema.users.id, user.id));
        }
      },
    },
  };
});
