import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">
        {t("welcomeTitle")}
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("welcomeSubtitle")}</p>
    </div>
  );
}
