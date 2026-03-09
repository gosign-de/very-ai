import { Button } from "@/components/ui/button";
import initTranslations from "@/lib/i18n";

async function Subscription({ params: { locale } }) {
  const i18nNamespaces = ["translation"];
  const { t } = await initTranslations(locale, i18nNamespaces);

  return (
    <div className="flex h-screen items-center justify-center	">
      <div className="max-w-4xl p-4">
        <div className="flex flex-col">
          <div>
            <h2 className="tracki mt-12 text-center text-3xl font-bold sm:text-5xl ">
              {t("subscription.pricing")}
            </h2>
          </div>
          <div className="container mt-24 space-y-12 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:space-y-0">
            <div className="relative flex flex-col rounded-2xl border p-8 shadow-sm">
              <h2 className="tracki mb-4 text-center text-xl font-bold">
                {t("subscription.free")}
              </h2>
              <Button variant="outline" size="lg">
                {t("subscription.remainOnFree")}
              </Button>
            </div>
            <div className="relative flex flex-col rounded-2xl border p-8 shadow-sm">
              <h2 className="tracki mb-4 text-center text-xl font-bold">
                {t("subscription.paid")}
              </h2>
              <Button variant="default" size="lg">
                {t("subscription.upgradeToPro")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Subscription;
