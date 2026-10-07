"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { employeeRolesApi } from "@/lib/employeeRolesApi";

// "Uprawnienia" - which role each employee number has.
//
// Built around **who has actually logged in** rather than a blank box to
// type numbers into: `login_events` is the only record that a number
// belongs to a real person, so the list is people the system has seen, and
// giving somebody a role is picking their row and choosing. A number that
// has never logged in can still be added by hand, which is what the field
// above the table is for - somebody starting on Monday.
//
// Nothing here enforces anything yet (see lib/employeeRolesApi.js).

const HEAD_CLS = "text-[11px] font-medium tracking-wide text-gray-400 dark:text-neutral-500";
const INPUT_CLS =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-navy-400 dark:focus:ring-navy-400";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function EmployeeRolesTable() {
  const t = useTranslations("employeeRoles");
  const [roles, setRoles] = useState([]);
  const [people, setPeople] = useState([]);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error
  const [search, setSearch] = useState("");
  const [newEmployeeNo, setNewEmployeeNo] = useState("");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    setLoadStatus((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const [roleList, known] = await Promise.all([employeeRolesApi.roles(), employeeRolesApi.known()]);
      setRoles(roleList);
      setPeople(known);
      setLoadStatus("ready");
    } catch {
      setLoadStatus("error");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () => (needle ? people.filter((p) => p.employeeNo.toLowerCase().includes(needle)) : people),
    [people, needle]
  );

  async function setRole(employeeNo, role, note) {
    setSaving(employeeNo);
    setError("");
    try {
      if (role === "") {
        await employeeRolesApi.remove(employeeNo);
      } else {
        await employeeRolesApi.upsert(employeeNo, { role, note: note ?? "" });
      }
      // Re-read rather than patching in place: the row carries the server's
      // own updatedAt/updatedBy, and this list is short.
      const known = await employeeRolesApi.known();
      setPeople(known);
    } catch (err) {
      setError(err?.message || t("saveError"));
    } finally {
      setSaving("");
    }
  }

  async function addByHand(event) {
    event.preventDefault();
    const employeeNo = newEmployeeNo.trim();
    if (!employeeNo) return;
    // Added with no role: the row appears in the table and the role is
    // picked there, the same way as for anybody else - rather than this
    // form growing a second control that does the same job.
    setPeople((prev) =>
      prev.some((p) => p.employeeNo === employeeNo)
        ? prev
        : [{ employeeNo, role: "", note: "", loginCount: 0, lastLoginAt: null }, ...prev]
    );
    setNewEmployeeNo("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addByHand} className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <label htmlFor="new-employee-no" className="text-xs font-medium text-gray-500 dark:text-neutral-400">
            {t("addLabel")}
          </label>
          <input
            id="new-employee-no"
            className={`${INPUT_CLS} mt-1`}
            value={newEmployeeNo}
            onChange={(e) => setNewEmployeeNo(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <Button type="submit" variant="outline" disabled={!newEmployeeNo.trim()}>
          {t("add")}
        </Button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: rows.length })}</p>
        {loadStatus === "error" && (
          <Button size="sm" variant="outline" onClick={reload}>
            {t("retry")}
          </Button>
        )}
      </div>

      <FrpFilters onGlobalFilterChange={setSearch} />

      {loadStatus === "loading" && <p className="text-sm text-gray-500 dark:text-neutral-400">{t("loading")}</p>}
      {loadStatus === "error" && <p className="text-sm text-gray-500 dark:text-neutral-400">{t("loadError")}</p>}

      {loadStatus === "ready" && rows.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("empty")}</p>
      )}

      {loadStatus === "ready" && rows.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLS}>{t("colEmployee")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colRole")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colNote")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colLogins")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colLastLogin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((person) => (
                <TableRow key={person.employeeNo}>
                  <TableCell className="font-medium text-gray-900 dark:text-neutral-100">
                    {person.employeeNo}
                  </TableCell>
                  <TableCell>
                    <select
                      className={INPUT_CLS}
                      value={person.role}
                      disabled={saving === person.employeeNo}
                      onChange={(e) => setRole(person.employeeNo, e.target.value, person.note)}
                    >
                      <option value="">{t("roleNone")}</option>
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {t(`role.${role}`)}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <input
                      className={INPUT_CLS}
                      defaultValue={person.note}
                      disabled={!person.role || saving === person.employeeNo}
                      // Saved on leaving the field, not per keystroke: this
                      // is a note somebody types a sentence into, and a PUT
                      // per character would be a write per character.
                      onBlur={(e) => {
                        if (person.role && e.target.value !== person.note) {
                          setRole(person.employeeNo, person.role, e.target.value);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-gray-600 dark:text-neutral-300">
                    {person.loginCount}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">
                    {formatDateTime(person.lastLoginAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
