"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import WmsIssueItemsGrid, { filledWmsIssueRows, newWmsIssueRow } from "@/components/WmsIssueItemsGrid";
import { lookupWmsItems } from "@/lib/wmsItemsApi";
import {
  listWmsDocumentClasses,
  listWmsOrganizations,
  listWmsPickRules,
  listWmsWarehouses,
} from "@/lib/wmsReferenceApi";
import { createWmsIssueNote } from "@/lib/wmsIssueApi";

// "Nowa lista" opens this: the header of a WMS issue note, then its
// positions. The header fields are WMS's own (its addoutnotice screen asks
// for exactly these), and the positions are a grid rather than a form
// because a list arrives as a column of item numbers out of Excel - paste
// it and every row fetches its own name, specification and unit from WMS's
// item master.

const inputClasses =
  "w-full rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400 disabled:opacity-60";

// The organization the issue note is raised in. WMS's own screen sends
// "460" and it is also what scopes the item lookup, so it is prefilled
// rather than left for somebody to discover: a blank one means every row
// comes back "unknown item".
const DEFAULT_ORG_NO = "460";

// The header fields WMS keeps a list for, and the call that fetches each.
// Every one answers `{ options: [{ code, name }] }`, so another one is a
// line here. **Nothing in this header is typed any more** except the
// remark, which is a sentence.
//
// **Two pairs of fields come off one list each**: both warehouses (said so
// 2026-10-14 - the destination of an issue note is another of this
// organization's own warehouses) and both organizations (2026-10-15 - the
// source organization is another entry of the same `bmorg` list). Each pair
// is the same request and the same options, not two lists that look alike.
const REFERENCE_LOADERS = {
  organization: listWmsOrganizations,
  sourceOrganization: listWmsOrganizations,
  sourceWarehouse: listWmsWarehouses,
  destinationWarehouse: listWmsWarehouses,
  documentClass: listWmsDocumentClasses,
  pickingRule: listWmsPickRules,
};

const REFERENCE_FIELDS = Object.keys(REFERENCE_LOADERS);

// The one list that is **not** scoped by the organization - it is the list
// of organizations (its captured body carries no `orgNo` at all). So it is
// fetched once, a blank organization does not empty it, and changing the
// organization does not re-ask for it.
const UNSCOPED_LOADERS = new Set([listWmsOrganizations]);

// The fields grouped by the call that fills them, so two fields reading one
// WMS list are **one request**: the destination warehouse wants exactly what
// the source one has just fetched, and asking WMS twice for it would be two
// answers that have to agree.
const REFERENCE_GROUPS = [...new Set(Object.values(REFERENCE_LOADERS))].map((load) => ({
  load,
  scoped: !UNSCOPED_LOADERS.has(load),
  fields: REFERENCE_FIELDS.filter((field) => REFERENCE_LOADERS[field] === load),
}));

// A code the freshly loaded list does not contain is normally dropped (see
// loadReference) - but **not the organization**: it scopes every other list
// on this screen, so clearing it empties all of them at once, and the
// prefilled "460" is what WMS own screen sends. The field spellings in that
// list are not captured yet, so a code read out of the wrong field must not
// be able to take the whole form down with it.
const NEVER_CLEARED = new Set(["organization"]);

// What a select's first option says while there is nothing to pick. Both
// cases are states rather than hints: without them an empty select looks
// exactly like a slow one.
function optionPlaceholder(t, { loading, count }) {
  if (loading) return t("form.optionsLoading");
  return count === 0 ? t("form.optionsEmpty") : "-";
}

// A select over one of WMS's lists. The code is what the document carries;
// the name is there so somebody can tell "4601" from "4602".
function ReferenceSelect({ t, value, options, loading, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={loading} className={inputClasses}>
      <option value="">{optionPlaceholder(t, { loading, count: options.length })}</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.name ? `${option.code} - ${option.name}` : option.code}
        </option>
      ))}
    </select>
  );
}

function today() {
  // The local calendar day, not UTC - toISOString() in Poland's own evening
  // is already tomorrow's date, which is the wrong day on a document.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function emptyWmsIssueList() {
  return {
    organization: DEFAULT_ORG_NO,
    sourceOrganization: "",
    documentClass: "",
    billDate: today(),
    sourceWarehouse: "",
    destinationWarehouse: "",
    pickingRule: "",
    remark: "",
  };
}

// What a document cannot be raised without, now read off WMS's **own**
// captured save rather than guessed: organization, date, document class
// and both warehouses are all filled in it, and wpsApi refuses a header
// missing any of them with the same list. The picking rule is filled in
// the capture too but is not demanded here - one document is not evidence
// that WMS insists on it, and WMS will say so if it does.
const REQUIRED_HEADER = ["organization", "billDate", "documentClass", "sourceWarehouse", "destinationWarehouse"];

function Field({ label, children, required }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
        {label}
        {required && <span className="ml-0.5 text-rose-600 dark:text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}

export default function WmsIssueListForm({ onCancel, onSave, onSessionExpired, resolveNonce = 0 }) {
  const t = useTranslations("ordersWms");
  const [form, setForm] = useState(emptyWmsIssueList);
  const [rows, setRows] = useState(() => [newWmsIssueRow(), newWmsIssueRow(), newWmsIssueRow()]);
  // itemNo -> "pending" | "ok" | "unknown", as WMS answers. The grid paints
  // an unresolved number red off this; nothing else reads it.
  const [itemStatus, setItemStatus] = useState({});
  const [error, setError] = useState("");
  // WMS's own lists for the two header selects, field -> [{ code, name }].
  // Fetched rather than typed: the codes are WMS's, and a typo in one is a
  // document WMS refuses at save time with nothing on screen saying which
  // field was wrong.
  const [options, setOptions] = useState(() =>
    Object.fromEntries(Object.keys(REFERENCE_LOADERS).map((field) => [field, []]))
  );
  // Per field, and its own flag rather than the lookup's transition: these
  // wait on different calls, and the spinner by the title is about the
  // positions.
  const [optionsLoading, setOptionsLoading] = useState({});
  const [pending, startTransition] = useTransition();
  // Its own flag again: this one is the document going to WMS, which is the
  // one action here that cannot be taken back by reloading the page.
  const [saving, setSaving] = useState(false);

  // Which (organization, item) pairs have already been asked, so leaving
  // the same cell twice is not a second call. Keyed by organization because
  // the same number can be a different material - or no material - in
  // another one.
  const askedRef = useRef(new Set());

  // Read by the re-resolve effect below, which must not re-run every time a
  // cell changes just to know which rows are filled.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const formRef = useRef(form);
  formRef.current = form;

  // Which organization each list on screen belongs to, so a re-render is
  // not a re-fetch and a failed fetch is still retried.
  const loadedOrgRef = useRef({});

  function loadReference({ load, fields, scoped }, orgNo, { force = false } = {}) {
    const key = fields.join("|");
    // An unscoped list belongs to no organization, so it is remembered
    // under a constant rather than under one - otherwise changing the
    // organization would re-fetch a list that cannot differ.
    const org = scoped ? String(orgNo ?? "").trim() : "*";
    const forEachField = (value) =>
      setOptions((prev) => ({ ...prev, ...Object.fromEntries(fields.map((field) => [field, value])) }));
    const setLoading = (value) =>
      setOptionsLoading((prev) => ({ ...prev, ...Object.fromEntries(fields.map((field) => [field, value])) }));

    if (!org) {
      loadedOrgRef.current[key] = null;
      forEachField([]);
      return;
    }
    if (!force && loadedOrgRef.current[key] === org) return;
    loadedOrgRef.current[key] = org;
    setLoading(true);
    load(org)
      .then((answer) => {
        const list = answer?.options ?? [];
        forEachField(list);
        // A code picked under another organization is not one of this
        // one's. Dropped rather than left in the field, where it would look
        // chosen while naming something nobody here can put on a document.
        setForm((prev) => {
          const stale = fields.filter(
            (field) =>
              !NEVER_CLEARED.has(field) && prev[field] && !list.some((option) => option.code === prev[field])
          );
          if (stale.length === 0) return prev;
          return { ...prev, ...Object.fromEntries(stale.map((field) => [field, ""])) };
        });
      })
      .catch((err) => {
        // Never loaded, so not recorded as loaded - otherwise one failure
        // would leave the select empty for as long as the form is open.
        loadedOrgRef.current[key] = null;
        forEachField([]);
        setError(err.message);
        if (err.code === "wms_session_expired" && onSessionExpired) onSessionExpired();
      })
      .finally(() => setLoading(false));
  }

  function loadReferences(orgNo, flags) {
    REFERENCE_GROUPS.forEach((group) => loadReference(group, orgNo, flags));
  }

  // Only the lists the organization scopes. What it does not scope is the
  // list of organizations itself, which a change of organization cannot
  // make stale.
  function loadScopedReferences(orgNo, flags) {
    REFERENCE_GROUPS.filter((group) => group.scoped).forEach((group) => loadReference(group, orgNo, flags));
  }

  // The organization is prefilled, so every list is fetched straight away -
  // waiting for somebody to touch a field they had no reason to touch would
  // leave the selects empty.
  useEffect(() => {
    loadReferences(DEFAULT_ORG_NO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function statusFor(answer) {
    // "exact" is the number somebody typed; "only" is a search that left no
    // doubt. Anything else - several hits, or none - is not something to
    // fill a position with on its own.
    return answer?.item && (answer.matched === "exact" || answer.matched === "only") ? "ok" : "unknown";
  }

  // `orgNo` is an argument rather than simply read off the form because the
  // organization select calls this **with the value just picked**: the state
  // behind it has not been applied yet, and asking WMS against the old
  // organization is the one thing this re-resolve exists to avoid.
  function resolveItemNos(itemNos, { force = false, orgNo: pickedOrgNo } = {}) {
    const orgNo = String(pickedOrgNo ?? form.organization).trim();
    if (!orgNo) return;
    const wanted = itemNos.filter((itemNo) => force || !askedRef.current.has(`${orgNo}|${itemNo}`));
    if (wanted.length === 0) return;
    wanted.forEach((itemNo) => askedRef.current.add(`${orgNo}|${itemNo}`));
    setItemStatus((prev) => ({ ...prev, ...Object.fromEntries(wanted.map((itemNo) => [itemNo, "pending"])) }));

    startTransition(async () => {
      try {
        const { items } = await lookupWmsItems(orgNo, wanted);
        setError("");
        setItemStatus((prev) => ({
          ...prev,
          ...Object.fromEntries(wanted.map((itemNo) => [itemNo, statusFor(items?.[itemNo])])),
        }));
        // Only the fields WMS owns, and only on the rows still holding the
        // number that was asked - somebody can retype a cell while the
        // answer is in flight, and that row must keep what they typed
        // rather than a reply to a question it no longer asks.
        //
        // WMS's answer **overwrites** whatever was in those three, pasted
        // or typed: the item master names a material, the same way
        // sm_catalog does for everything else in this app (see AGENTS.md's
        // "Catalog name enforcement"). A number WMS could not pin down
        // leaves them **blank** rather than keeping the last material's
        // name next to this one's number.
        setRows((prev) =>
          prev.map((row) => {
            const answer = items?.[String(row.itemNo ?? "").trim()];
            if (!answer) return row;
            return {
              ...row,
              itemName: answer.item?.itemName ?? "",
              unit: answer.item?.unit ?? "",
            };
          })
        );
      } catch (err) {
        // The question was never answered, so it has not been asked -
        // otherwise a lookup that failed once would never be retried.
        wanted.forEach((itemNo) => askedRef.current.delete(`${orgNo}|${itemNo}`));
        setItemStatus((prev) => {
          const next = { ...prev };
          wanted.forEach((itemNo) => delete next[itemNo]);
          return next;
        });
        setError(err.message);
        // A dropped WMS session is not a bad item number, and the sign-in
        // lives on the screen behind this one - so it is asked for from
        // here rather than leaving somebody with a filled-in list and an
        // error they cannot act on. WMS reports it as an ordinary empty
        // result, which is why this code exists at all (see wpsApi's
        // `wmsNotLoggedIn`).
        if (err.code === "wms_session_expired" && onSessionExpired) onSessionExpired();
      }
    });
  }

  // Signed in again with the list still on screen: ask for every filled row
  // once more, so nothing has to be retyped or tabbed through to recover.
  const nonceRef = useRef(resolveNonce);
  useEffect(() => {
    if (nonceRef.current === resolveNonce) return;
    nonceRef.current = resolveNonce;
    const filled = [...new Set(filledWmsIssueRows(rowsRef.current).map((row) => row.itemNo.trim()))];
    if (filled.length) resolveItemNos(filled, { force: true });
    // The lists came with the same session, so they went the same way and
    // come back here rather than after another blur.
    loadReferences(formRef.current.organization, { force: true });
    // resolveItemNos closes over this render's form/rows, which is what it
    // should use - the effect deliberately keys on the nonce alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveNonce]);

  // The organization scopes every lookup, so changing it makes the answers
  // already on screen answers to a different question: every filled row is
  // asked again, against the one just picked. Now that it is a select,
  // **choosing is the commit** - there is no half-typed organization to
  // wait for a blur on, which is what the old input needed.
  function handleOrganizationChange(value) {
    set("organization", value);
    const filled = filledWmsIssueRows(rows).map((row) => row.itemNo.trim());
    if (filled.length) resolveItemNos([...new Set(filled)], { force: true, orgNo: value });
    // The lists it scopes, not the organizations themselves. Only a changed
    // organization re-fetches (loadedOrgRef).
    loadScopedReferences(value);
  }

  const positions = filledWmsIssueRows(rows);
  // A position is only fit to go out when **WMS has confirmed the material**
  // and somebody has said how much. "Not confirmed" covers a number WMS
  // refused *and* one nothing has asked about yet - an item number typed
  // and never left is not a material, and the grid marks both the same way.
  const badPositions = positions.filter(
    (row) => !String(row.quantity ?? "").trim() || itemStatus[row.itemNo.trim()] !== "ok"
  );

  async function handleSave() {
    const missing = REQUIRED_HEADER.filter((field) => !String(form[field] ?? "").trim());
    if (missing.length) {
      setError(t("form.missingHeader"));
      return;
    }
    if (positions.length === 0) {
      setError(t("form.noPositions"));
      return;
    }
    if (badPositions.length) {
      setError(t("form.badPositions"));
      return;
    }
    setError("");

    // Off to WMS, where it becomes a real document. The positions carry
    // item numbers, quantities and cells only: wpsApi looks every item up
    // again and sends WMS back its own item rows, so what the document
    // holds cannot have drifted from what WMS has.
    setSaving(true);
    try {
      const created = await createWmsIssueNote(form, positions);
      onSave({ ...form, positions, outNoticeNo: created?.outNoticeNo ?? null });
    } catch (err) {
      // **Never reported as saved.** WMS's own words are what somebody
      // checks the document against, and a list believed saved when it was
      // not is the one outcome nobody can recover from.
      setError(err.message);
      if (err.code === "wms_session_expired" && onSessionExpired) onSessionExpired();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label={t("cancel")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-navy-950 dark:text-white">{t("form.title")}</h2>
        </div>
        {pending && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-neutral-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("form.lookupPending")}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("form.organization")} required>
            <ReferenceSelect
              t={t}
              value={form.organization}
              options={options.organization}
              loading={Boolean(optionsLoading.organization)}
              onChange={handleOrganizationChange}
            />
          </Field>
          <Field label={t("form.sourceOrganization")}>
            <ReferenceSelect
              t={t}
              value={form.sourceOrganization}
              options={options.sourceOrganization}
              loading={Boolean(optionsLoading.sourceOrganization)}
              onChange={(value) => set("sourceOrganization", value)}
            />
          </Field>
          <Field label={t("form.documentClass")}>
            <ReferenceSelect
              t={t}
              value={form.documentClass}
              options={options.documentClass}
              loading={Boolean(optionsLoading.documentClass)}
              onChange={(value) => set("documentClass", value)}
            />
          </Field>
          <Field label={t("form.billDate")} required>
            <input
              type="date"
              value={form.billDate}
              onChange={(event) => set("billDate", event.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label={t("form.sourceWarehouse")} required>
            <ReferenceSelect
              t={t}
              value={form.sourceWarehouse}
              options={options.sourceWarehouse}
              loading={Boolean(optionsLoading.sourceWarehouse)}
              onChange={(value) => set("sourceWarehouse", value)}
            />
          </Field>
          <Field label={t("form.destinationWarehouse")} required>
            <ReferenceSelect
              t={t}
              value={form.destinationWarehouse}
              options={options.destinationWarehouse}
              loading={Boolean(optionsLoading.destinationWarehouse)}
              onChange={(value) => set("destinationWarehouse", value)}
            />
          </Field>
          <Field label={t("form.pickingRule")}>
            <ReferenceSelect
              t={t}
              value={form.pickingRule}
              options={options.pickingRule}
              loading={Boolean(optionsLoading.pickingRule)}
              onChange={(value) => set("pickingRule", value)}
            />
          </Field>
        </div>
        {/* Free text, and the full width of the panel: it is a note
            somebody writes a sentence in, not a code picked off a list. */}
        <div className="mt-4">
          <Field label={t("form.remark")}>
            <input
              type="text"
              value={form.remark}
              onChange={(event) => set("remark", event.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-navy-950 dark:text-white">{t("form.positions")}</h3>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            {t("form.positionCount", { count: positions.length })}
          </span>
        </div>
        <WmsIssueItemsGrid
          rows={rows}
          onChange={setRows}
          onAddRow={() => setRows((prev) => [...prev, newWmsIssueRow()])}
          onResolveItemNos={resolveItemNos}
          itemStatus={itemStatus}
          t={t}
        />
      </div>

      {error && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        {/* Disabled while WMS is still answering a lookup - a list saved
            mid-lookup would have perfectly good positions marked
            unconfirmed - and while the document itself is going, so one
            click cannot become two documents. */}
        <Button size="sm" onClick={handleSave} disabled={pending || saving}>
          {saving ? t("form.saving") : t("form.save")}
        </Button>
      </div>
    </div>
  );
}
