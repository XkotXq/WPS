"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createCurrentItem } from "@/lib/itemActions";

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";

// Length is shown everywhere in this app in km, but the API stores it as a
// plain string of meters (see stock-helpers.js/kmToMeters in the api repo's
// import script for the same conversion) - convert on the way in.
function kmToMeters(raw) {
  const km = Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(km)) return "";
  return String(Math.round(km * 1000));
}

function emptyDraft(material) {
  if (material === "frp") return { itemNumber: "", length: "", drumNumber: "", location: "", remark: "" };
  if (material === "coatedFrp") return { diameter: "", type: "XB", length: "", drumNumber: "", location: "", remark: "" };
  return { color: "GRAY", diameter: "", length: "", drumNumber: "", location: "PRZED", isincendiary: false, remark: "" };
}

// itemNumber (frp only) accepts either the catalog's own item_number
// (aliased server-side as frpItemNumber - see api/src/materials.js) - the
// catalog select below sets it to a real one, but it's a plain text field
// so a drum without a catalog match can still be recorded.
function buildBody(material, draft) {
  const base = { length: kmToMeters(draft.length), drumNumber: draft.drumNumber.trim(), location: draft.location.trim(), remark: draft.remark.trim() };
  if (material === "frp") return { ...base, itemNumber: draft.itemNumber.trim() };
  if (material === "coatedFrp") return { ...base, diameter: draft.diameter.trim(), type: draft.type };
  return { ...base, color: draft.color, diameter: draft.diameter.trim(), isincendiary: draft.isincendiary };
}

export default function AddItemPanel({ material, frpCatalog = [] }) {
  const t = useTranslations("stock.addItem");
  const tColumns = useTranslations("stock.columns");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(material));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openPanel() {
    setDraft(emptyDraft(material));
    setError("");
    setOpen(true);
  }

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyCatalogEntry(number) {
    const entry = frpCatalog.find((c) => c.number === number);
    setField("itemNumber", entry ? entry.number : number);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (material === "frp" && !draft.itemNumber.trim()) return setError(t("requiredItem"));
    if (!draft.drumNumber.trim()) return setError(t("requiredDrum"));
    if (!draft.length.trim()) return setError(t("requiredLength"));
    if (!draft.location.trim()) return setError(t("requiredLocation"));

    setSaving(true);
    setError("");
    const outcome = await createCurrentItem(material, buildBody(material, draft));
    setSaving(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={openPanel}>
        <Plus className="h-4 w-4" />
        {t("button")}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("description")}</SheetDescription>
          </SheetHeader>

          <form id="add-item-form" onSubmit={handleSave} className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {material === "frp" && (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLS}>{t("catalogLabel")}</span>
                <select
                  className={FIELD_CLS}
                  value={draft.itemNumber}
                  onChange={(e) => applyCatalogEntry(e.target.value)}
                >
                  <option value="">{t("catalogPlaceholder")}</option>
                  {frpCatalog.map((entry) => (
                    <option key={entry.number} value={entry.number}>
                      {entry.label} - {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {material !== "frp" && (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLS}>{tColumns("diameter")}</span>
                <input className={FIELD_CLS} value={draft.diameter} onChange={(e) => setField("diameter", e.target.value)} />
              </label>
            )}

            {material === "coatedFrp" && (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLS}>{tColumns("xbz")}</span>
                <select className={FIELD_CLS} value={draft.type} onChange={(e) => setField("type", e.target.value)}>
                  <option value="XB">XB</option>
                  <option value="Z">Z</option>
                </select>
              </label>
            )}

            {material === "filler" && (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLS}>{tColumns("color")}</span>
                <select className={FIELD_CLS} value={draft.color} onChange={(e) => setField("color", e.target.value)}>
                  <option value="GRAY">GRAY</option>
                  <option value="WHITE">WHITE</option>
                  <option value="BLACK">BLACK</option>
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{tColumns("length")}</span>
              <input
                className={FIELD_CLS}
                inputMode="decimal"
                placeholder="0.000"
                value={draft.length}
                onChange={(e) => setField("length", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{tColumns("spoolNumber")}</span>
              <input className={FIELD_CLS} value={draft.drumNumber} onChange={(e) => setField("drumNumber", e.target.value)} />
            </label>

            {material === "filler" ? (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLS}>{tColumns("location")}</span>
                <select className={FIELD_CLS} value={draft.location} onChange={(e) => setField("location", e.target.value)}>
                  <option value="PRZED">PRZED</option>
                  <option value="ZA">ZA</option>
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <span className={LABEL_CLS}>{tColumns("location")}</span>
                <input className={FIELD_CLS} value={draft.location} onChange={(e) => setField("location", e.target.value)} />
              </label>
            )}

            {material === "filler" && (
              <label className="flex items-center gap-2">
                <Checkbox checked={draft.isincendiary} onCheckedChange={(v) => setField("isincendiary", Boolean(v))} />
                <span className={LABEL_CLS}>{tColumns("flameRetardant")}</span>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{tColumns("note")}</span>
              <input className={FIELD_CLS} value={draft.remark} onChange={(e) => setField("remark", e.target.value)} />
            </label>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </form>

          <SheetFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="add-item-form" size="sm" className="gap-2" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? t("saving") : t("save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
