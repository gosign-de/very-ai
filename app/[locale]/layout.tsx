import { Toaster } from "@/components/ui/sonner";
import { GlobalState } from "@/components/utility/global-state";
import { Providers } from "@/components/utility/providers";
import TranslationsProvider from "@/components/utility/translations-provider";
import initTranslations from "@/lib/i18n";
import { Database } from "@/supabase/types";
import { createServerClient } from "@supabase/ssr";
import { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/app/_lib/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const APP_NAME = "Very AI";
const APP_DEFAULT_TITLE = "Very AI";
const APP_TITLE_TEMPLATE = "%s - Very AI";
const APP_DESCRIPTION = "Very AI PWA!";

interface RootLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: APP_DEFAULT_TITLE,
    // startUpImage: [],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const i18nNamespaces = ["translation"];

export default async function RootLayout({
  children,
  params,
}: RootLayoutProps) {
  const { locale } = await params;
  let nextAuthSession = null;
  try {
    nextAuthSession = await auth();
  } catch (err) {
    const isEntraConfigured =
      !!process.env.AUTH_AZURE_AD_ID &&
      !!process.env.AUTH_AZURE_AD_SECRET &&
      !!process.env.AUTH_AZURE_AD_TENANT_ID;
    if (isEntraConfigured) {
      throw err; // Real auth error — do not swallow
    }
    // Entra ID not configured — continue without NextAuth session
  }
  const cookieStore = await cookies();

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabase = createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: "sb-veryai-auth-token",
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    },
  );
  const session = (await supabase.auth.getSession()).data.session;

  const { resources } = await initTranslations(locale, i18nNamespaces);

  return (
    <SessionProvider session={nextAuthSession}>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <Providers attribute="class" defaultTheme="dark">
            <TranslationsProvider
              namespaces={i18nNamespaces}
              locale={locale}
              resources={resources}
            >
              <Toaster richColors position="top-center" duration={3000} />
              <ErrorBoundary>
                <div className="bg-background text-foreground flex h-dvh flex-col items-center overflow-x-auto">
                  {session ? <GlobalState>{children}</GlobalState> : children}
                </div>
              </ErrorBoundary>
            </TranslationsProvider>
          </Providers>
        </body>
      </html>
    </SessionProvider>
  );
}
