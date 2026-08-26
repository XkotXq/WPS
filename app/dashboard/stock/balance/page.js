import { getTranslations } from "next-intl/server";

export default async function StockBalancePage() {
  const t = await getTranslations("stockBalance");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>
    </div>
  );
}
