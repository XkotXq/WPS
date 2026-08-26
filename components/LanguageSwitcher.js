"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Check, ChevronDown, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, localeLabels } from "@/i18n/config";
import { setLocale } from "@/app/actions";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const current = localeLabels[locale];

  function handleSelect(nextLocale) {
    if (nextLocale === locale) return;
    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            className="gap-2 text-gray-700 dark:text-neutral-300"
          >
            <Languages className="size-4" />
            {current.label}
            <ChevronDown className="size-3.5 text-gray-400 dark:text-neutral-500" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {locales.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleSelect(code)}
            className="justify-between gap-4"
          >
            {localeLabels[code].name}
            {locale === code && <Check className="size-4 text-navy-600 dark:text-navy-300" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
