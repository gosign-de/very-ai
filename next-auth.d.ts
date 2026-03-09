// next-auth.d.ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Group {
    displayName: string;
    id: string;
  }

  interface User {
    userPrincipalName: string;
    accessToken: string;
    groups?: Group[];
    displayName?: string;
    name?: string;
    givenName?: string;
    surname?: string;
    mail?: string;
    id?: string;
  }

  interface Session {
    user: User;
  }
}
