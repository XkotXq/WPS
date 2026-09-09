"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { loginCip } from "@/lib/cipSession";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError(t("missingFields"));
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await loginCip(username.trim(), password);
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err.message);
      }
    });
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
            SM
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
              htmlFor="username"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
            >
              {t("emailLabel")}
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("emailPlaceholder")}
              className="w-full rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
            >
              {t("passwordLabel")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("passwordPlaceholder")}
              className="w-full rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
            />
          </div>

          {error && (
            <p className="mb-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full cursor-pointer rounded-xl bg-navy-950 dark:bg-navy-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 dark:hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("submitting") : t("submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
