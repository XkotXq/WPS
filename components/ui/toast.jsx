"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, X } from "lucide-react";

// Local, dependency-free toast stack (this app has no toast lib yet) - a
// page owns its own queue via useToastStack() and renders it once with
// <ToastStack>, fixed to the viewport's bottom-right corner regardless of
// where in the page tree it's mounted. Each toast auto-dismisses on its
// own timer; the X lets it be dismissed early too.
export function useToastStack() {
  const [toasts, setToasts] = useState([]);
  // Timers live outside React state (a ref, not useState) since they're
  // an imperative side effect, not something that should trigger a
  // re-render on their own - pauseToast/resumeToast (hovering a toast,
  // e.g. to read its expanded details) just clear/reschedule the entry
  // here without touching `toasts` itself.
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    timersRef.current.delete(id);
  }, []);

  // `details` is an optional array of strings, one per affected row -
  // backs the expand arrow a multi-item confirmation gets (e.g. "Przyjęto
  // 3 pozycji." expands to show exactly which 3). ToastStack only shows
  // the arrow once there's more than one line, so passing a one-entry (or
  // omitted) `details` renders a plain toast, same as before this existed.
  const pushToast = useCallback(
    (message, details) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, details }]);
      timersRef.current.set(id, setTimeout(() => dismissToast(id), 3500));
    },
    [dismissToast]
  );

  const pauseToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
  }, []);

  const resumeToast = useCallback(
    (id) => {
      timersRef.current.set(id, setTimeout(() => dismissToast(id), 3500));
    },
    [dismissToast]
  );

  return { toasts, pushToast, dismissToast, pauseToast, resumeToast };
}

export function ToastStack({ toasts, onDismiss, onPause, onResume }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  if (toasts.length === 0) return null;

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => {
        const hasDetails = (toast.details?.length ?? 0) > 1;
        const isExpanded = expandedIds.has(toast.id);
        return (
          <div
            key={toast.id}
            onMouseEnter={() => onPause?.(toast.id)}
            onMouseLeave={() => onResume?.(toast.id)}
            className="flex max-w-sm flex-col gap-1.5 rounded-lg border border-gray-200 bg-white py-3 pl-4 pr-3 text-sm text-gray-700 shadow-lg duration-200 animate-in fade-in-0 slide-in-from-bottom-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="flex-1">{toast.message}</span>
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(toast.id)}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {hasDetails && isExpanded && (
              <ul className="ml-6 flex flex-col gap-0.5 border-t border-gray-100 pt-1.5 text-xs text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
                {toast.details.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
