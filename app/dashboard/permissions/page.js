import { getTranslations } from "next-intl/server";
import EmployeeRolesTable from "@/components/EmployeeRolesTable";

export default async function PermissionsPage() {
  const t = await getTranslations("employeeRoles");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <EmployeeRolesTable />
      </div>
    </div>
  );
}
