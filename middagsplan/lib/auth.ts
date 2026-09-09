import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./db";

/**
 * To brukere i samme husstand logger inn med hver sin Google-konto for å gi
 * lesetilgang til kalenderen sin. Ikke noe rollesystem — begge ser samme
 * meny/handleliste.
 *
 * VIKTIG (se README): Google-OAuth-appen (Google Cloud Console) MÅ stå i
 * "Production"-status FØR noen av de to logger inn her, ellers utløper
 * refresh token etter 7 dager og de automatiske kjøringene (mandag/daglig)
 * stopper stille.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account?.providerAccountId || !user.email) return false;

      const existing = await prisma.user.findUnique({
        where: { googleAccountId: account.providerAccountId },
      });

      await prisma.user.upsert({
        where: { googleAccountId: account.providerAccountId },
        create: {
          googleAccountId: account.providerAccountId,
          email: user.email,
          name: user.name ?? undefined,
          // refresh_token kommer kun med ved FØRSTE samtykke (prompt=consent
          // sørger for at det skjer hver gang, men Google gjenbruker ikke
          // alltid — behold forrige hvis en ny ikke kommer).
          refreshToken: account.refresh_token ?? undefined,
        },
        update: {
          email: user.email,
          name: user.name ?? undefined,
          refreshToken: account.refresh_token ?? existing?.refreshToken ?? undefined,
        },
      });

      return true;
    },
    async session({ session }) {
      return session;
    },
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};
