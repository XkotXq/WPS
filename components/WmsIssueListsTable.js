"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import MaterialsTable from "@/components/MaterialsTable";
import WmsIssueListForm from "@/components/WmsIssueListForm";
import WmsSignIn, { WmsSignInDialog } from "@/components/WmsSignIn";
import { listWmsIssueNotes } from "@/lib/wmsIssueApi";

function StatusBadge({ label }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
      {label}
    </span>
  );
}

// The table is **WMS's own list of issue notes**, not a note of what this
// browser once sent (`lib/wmsIssueApi.js` -> POST /api/wms/issue-notes/search,
// 2026-10-15). That is what makes it survive a reload, and it also means a
// document somebody raised on WMS's own screen is on it - this app is one of
// two ways into the same documents, never the record of them.
//
// There is therefore **no local numbering any more**. A provisional
// `WD/YYYY-MM-DD/n` used to be drawn when the form opened, from a day counter
// this component kept; it was removed on request (2026-10-15) and nothing
// should bring it back without a reason: WMS names the document, every row
// here carries that name, and a second number for the same list is a second
// thing to reconcile.
export default function WmsIssueListsTable({ wmsUser = null }) {
  const t = useTranslations("ordersWms");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Seeded from the server (page.js reads the wms_session cookie) and kept
  // from here on, because signing in and out both happen in this component
  // - there is nothing to re-read the cookie for between them. A session
  // WMS itself drops shows up where it matters, on the call that needs it.
  const [wms, setWms] = useState(wmsUser);
  const [signInOpen, setSignInOpen] = useState(false);
  // Whether the sign-in was asked for in order to start a list, or just to
  // sign in: "Nowa lista" opens the same dialog when there is no WMS
  // session, and then has to carry on where it left off.
  const [newListAfterSignIn, setNewListAfterSignIn] = useState(false);
  // Whether the form is on screen. A plain flag now that there is no number
  // to draw for it.
  const [formOpen, setFormOpen] = useState(false);
  // Bumped on every fresh sign-in, so a list already on screen knows to ask
  // WMS about its rows again - the lookups it made before the session died
  // came back as errors, and nobody should have to retype a list to recover
  // from that.
  const [resolveNonce, setResolveNonce] = useState(0);

  // `signedIn` rather than reading `wms` inside: this is called from an
  // effect and from the buttons, and the one thing it must not do is ask
  // WMS for a list with no session and report "nothing here".
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const answer = await listWmsIssueNotes();
      setNotes(answer?.notes ?? []);
      setError("");
    } catch (err) {
      // An empty table and a dead session look identical, which is the whole
      // reason wpsApi tells them apart (see its `wmsNotLoggedIn`). So a
      // failure empties the table and says why, rather than leaving the last
      // answer on screen as though it were current.
      setNotes([]);
      setError(err.message);
      if (err.code === "wms_session_expired") setWms(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Only with a session: without one there is nothing to ask and the chip
  // beside the title already says so, so an error here would be telling
  // somebody off for not having done something yet.
  useEffect(() => {
    if (wms) load();
    else {
      setNotes([]);
      setError("");
    }
  }, [wms, load]);

  // A list is a document in WMS, so it takes a WMS session - and asking for
  // one is the whole of it: the dialog opens, and the list is started as
  // soon as WMS accepts. A button that refused to work until somebody found
  // the right thing to press first would be the same number of clicks and
  // one guess worse.
  function handleNewList() {
    if (!wms) {
      setNewListAfterSignIn(true);
      setSignInOpen(true);
      return;
    }
    setFormOpen(true);
  }

  function handleSignedIn(user) {
    setWms(user);
    setSignInOpen(false);
    setResolveNonce((n) => n + 1);
    if (newListAfterSignIn) setFormOpen(true);
    setNewListAfterSignIn(false);
  }

  // The form only gets here once **WMS has taken the document**, so there is
  // nothing to add to the table by hand: it is re-read from WMS, which is
  // also the one answer to "is it really in there".
  function handleSaved() {
    setFormOpen(false);
    load();
  }

  // Memoised because MaterialsTable builds its TanStack column model off
  // this array's identity - a fresh one per render rebuilds it on every
  // keystroke in a column filter.
  const columns = useMemo(
    () => [
      { key: "outNoticeNo", headerKey: "wmsListNo", filterFn: "includesString", sortable: true },
      // WMS's own timestamp, printed as WMS wrote it: the shape of that
      // string is not captured, and reformatting a value we cannot parse is
      // how a date becomes "Invalid Date". It still sorts, the figures being
      // year-first.
      { key: "createdAt", headerKey: "wmsCreatedAt", filterFn: "includesString", sortable: true },
      { key: "positions", headerKey: "wmsPositions", filterFn: "inNumberRange", sortable: true },
      {
        key: "status",
        headerKey: "wmsStatus",
        filterFn: "multiselect",
        // WMS's own status, not a label of ours: this screen's values come
        // from WMS and are checked against WMS's own screen, the same reason
        // the header's field labels stay English here.
        render: (row) => (row.status ? <StatusBadge label={row.status} /> : null),
      },
      { key: "createdBy", headerKey: "wmsCreatedBy", filterFn: "includesString", sortable: true },
    ],
    []
  );

  // The form takes the whole screen rather than opening in a dialog: it is
  // a document with a header and a pasteable grid under it, and a grid in a
  // dialog is the thing "Przyjęcie zamówienia" has to work around. The
  // table is still there behind it, unmounted only for as long as a list is
  // being written.
  // The sign-in dialog is rendered in both branches, because WMS can drop
  // the session while a list is being written and the form asks for it back
  // from here (onSessionExpired) - a dialog that only existed on the table
  // would leave somebody holding a filled-in list and no way to sign in.
  const signInDialog = (
    <WmsSignInDialog
      open={signInOpen}
      onOpenChange={(open) => {
        setSignInOpen(open);
        if (!open) setNewListAfterSignIn(false);
      }}
      onSignedIn={handleSignedIn}
    />
  );

  if (formOpen) {
    return (
      <div>
        <WmsIssueListForm
          onCancel={() => setFormOpen(false)}
          onSave={handleSaved}
          onSessionExpired={() => {
            setWms(null);
            setNewListAfterSignIn(false);
            setSignInOpen(true);
          }}
          resolveNonce={resolveNonce}
        />
        {signInDialog}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WmsSignIn
          user={wms}
          onSignInOpen={() => {
            setNewListAfterSignIn(false);
            setSignInOpen(true);
          }}
          onSignedOut={() => setWms(null)}
        />
        <div className="flex items-center gap-2">
          {/* Only with a session, because that is the only state it can do
              anything in. */}
          {wms && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("refresh")}
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={handleNewList}>
            <Plus className="h-4 w-4" />
            {t("newList")}
          </Button>
        </div>
      </div>

      {signInDialog}

      {/* WMS's own words where it refused, for the same reason the save
          shows them: this is what somebody checks against WMS's screen. */}
      {error && (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4">
        <MaterialsTable data={notes} columns={columns} />
      </div>
    </div>
  );
}
