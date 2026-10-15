"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LogIn, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signInToWms, signOutOfWms } from "@/lib/wmsAuthApi";

// The WMS half of this screen's sign-in state: who is signed into WMS (a
// different system from CIP, with its own accounts - see lib/wmsSession.js),
// and the form that gets them there.
//
// It is a second sign-in on a screen somebody already reached by logging in,
// so it is a chip and a button and not a page: the CIP session is what got
// them here and is never touched by either action.

const inputClasses =
  "w-full rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";

export function WmsStatusChip({ user }) {
  const t = useTranslations("ordersWms");
  const Icon = user ? ShieldCheck : ShieldOff;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
        (user
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300")
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {user ? t("wmsSignedInAs", { user: user.name || user.userNo }) : t("wmsNotSignedIn")}
    </span>
  );
}

/**
 * The sign-in dialog. `open`/`onOpenChange` are the parent's, because the
 * same dialog is opened two ways: from the button here, and by "Nowa lista"
 * when there is no WMS session to create one with.
 *
 * `onSignedIn` gets the name WMS answered with; nothing else about the
 * session ever reaches this file.
 */
export function WmsSignInDialog({ open, onOpenChange, onSignedIn }) {
  const t = useTranslations("ordersWms");
  const [userNo, setUserNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const userRef = useRef(null);

  // The password is never kept a moment longer than the attempt it was
  // typed for - not while the dialog sits closed, and not after a refusal
  // that the person will retype anyway.
  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
      return;
    }
    setUserNo("");
    setPassword("");
    setError("");
  }, [open]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!userNo.trim() || !password) {
      setError(t("wmsSignInMissing"));
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const user = await signInToWms(userNo.trim(), password);
        setPassword("");
        onSignedIn(user);
      } catch (err) {
        setPassword("");
        setError(err.message);
        userRef.current?.focus();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("wmsSignInTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="wms-user" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              {t("wmsSignInUser")}
            </label>
            <input
              id="wms-user"
              ref={userRef}
              type="text"
              // A WMS account of its own, so the browser's saved CIP login
              // must not be offered for it.
              autoComplete="off"
              autoFocus
              value={userNo}
              onChange={(event) => setUserNo(event.target.value)}
              className={inputClasses}
            />
          </div>

          <div>
            <label
              htmlFor="wms-password"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
            >
              {t("wmsSignInPassword")}
            </label>
            <input
              id="wms-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClasses}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t("wmsSignInPending") : t("wmsSignIn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The chip plus whichever of the two actions applies. */
export default function WmsSignIn({ user, onSignInOpen, onSignedOut }) {
  const t = useTranslations("ordersWms");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <WmsStatusChip user={user} />
      {user ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={pending}
          onClick={() => startTransition(async () => {
            await signOutOfWms();
            onSignedOut();
          })}
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("wmsSignOut")}
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onSignInOpen}>
          <LogIn className="h-3.5 w-3.5" />
          {t("wmsSignIn")}
        </Button>
      )}
    </div>
  );
}
