import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { signInWithDiscord } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isDemoBackend } from "@/lib/demo/mode";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { I18nProvider } from "@/components/app/i18n-provider";
import { LanguageSelector } from "@/components/app/language-selector";
import { resolveAuthErrorCode } from "@/lib/auth-errors";
import { getI18nPayload, getLocale, getServerTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isDemoBackend()) {
    const supabase = await createClient();
    const user = await getSessionUser(supabase);

    if (user) redirect("/swipe");
  }

  const params = await searchParams;
  const locale = await getLocale();
  const auth = await getServerTranslator("auth", locale);
  const legal = await getServerTranslator("legal", locale);
  const commonI18n = await getI18nPayload(["common"], locale);
  const errorCode = resolveAuthErrorCode(params.error);

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4">
      <div className="absolute right-4 top-4">
        <I18nProvider {...commonI18n}>
          <LanguageSelector compact initialLocale={locale} />
        </I18nProvider>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{auth("login.title")}</CardTitle>
          <CardDescription>{auth("login.discordDescription")}</CardDescription>
          {errorCode ? <p className="text-sm text-red-300">{auth(`errors.${errorCode}`)}</p> : null}
        </CardHeader>
        <CardContent>
          <form action={signInWithDiscord}>
            <Button size="lg" className="w-full">
              <MessageCircle className="h-5 w-5" />
              {auth("login.discordLogin")}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-zinc-500">
            {auth("login.termsPrefix")}{" "}
            <Link href="/privacy" className="text-lime-300 hover:text-lime-200">
              {legal("privacy")}
            </Link>{" "}
            {auth("login.termsConnector")}{" "}
            <Link href="/terms" className="text-lime-300 hover:text-lime-200">
              {legal("terms")}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
