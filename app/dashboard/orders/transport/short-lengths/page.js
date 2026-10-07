import { getTranslations } from "next-intl/server";
import ShortLengthsTable from "@/components/ShortLengthsTable";

export default async function ShortLengthsPage() {
  const t = await getTranslations("shortLengths");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <ShortLengthsTable />
      </div>
    </div>
  );
}
