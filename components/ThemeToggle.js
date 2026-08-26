"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/app/theme-provider";
import { useTranslations } from "next-intl";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const options = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = options.find((option) => option.value === theme) ?? options[2];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" disabled={!mounted}>
            <CurrentIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {options.map(({ value, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="justify-between gap-4"
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4" />
              {t(value)}
            </span>
            {theme === value && <Check className="size-4 text-navy-600 dark:text-navy-300" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
