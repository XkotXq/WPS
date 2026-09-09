"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

// Local, dependency-free toast stack (this app has no toast lib yet) - a
// page owns its own queue via useToastStack() and renders it once with
// <ToastStack>, fixed to the viewport's bottom-right corner regardless of
// where in the page tree it's mounted. Each toast auto-dismisses on its
// own timer; the X lets it be dismissed early too.
export function useToastStack() {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => dismissToast(id), 3500);
    },
    [dismissToast]
  );

  return { toasts, pushToast, dismissToast };
}

export function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white py-3 pl-4 pr-3 text-sm text-gray-700 shadow-lg duration-200 animate-in fade-in-0 slide-in-from-bottom-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="ml-1 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
