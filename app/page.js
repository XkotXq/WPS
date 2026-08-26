"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("login");

  function handleSubmit(event) {
    event.preventDefault();
    router.push("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-gray-100 dark:bg-neutral-950 px-4 py-12">
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-950 dark:bg-navy-500 text-lg font-bold text-white">
            WMS
          </div>
          <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-white dark:bg-neutral-900 p-8 shadow-lg shadow-gray-200/60 dark:shadow-none dark:border dark:border-neutral-800"
        >
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
            >
              {t("emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              className="w-full rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
            >
              {t("passwordLabel")}
            </label>
            <input
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              className="w-full rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
            />
          </div>

          <div className="mb-6 flex items-center text-sm">
            <label className="flex items-center gap-2 text-gray-600 dark:text-neutral-400">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 dark:border-neutral-700 text-navy-950 focus:ring-navy-700"
              />
              {t("rememberMe")}
            </label>
          </div>

          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl bg-navy-950 dark:bg-navy-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 dark:hover:bg-navy-600"
          >
            {t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-neutral-600">{t("demoNote")}</p>
      </div>
    </div>
  );
}
