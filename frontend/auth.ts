import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { matchAuthUser } from "@/lib/authUsers";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        const user = matchAuthUser(
          credentials?.email as string | undefined,
          credentials?.password as string | undefined,
        );
        if (!user) return null;
        return { id: user.id, name: user.email, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
});
