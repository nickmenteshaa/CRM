"use client";

import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────

export type ColumnDef = {
  key: string;
  label: string;
  required?: boolean;
  validate?: (value: string) => string | null; // returns error message or null
};

export type ImportConfig<T> = {
  moduleName: string;          // e.g. "Companies"
  columns: ColumnDef[];
  /** Build the object to save from a validated row record */
  buildRecord: (row: Record<string, string>) => Omit<T, "id">;
  /** Find a duplicate in existing data. Return the existing record or undefined */
  findDuplicate: (row: Record<string, string>, existing: T[]) => T | undefined;
  /** Describe what makes a duplicate for UI display */
  duplicateKey: string;        // e.g. "company name"
  /** Save a single new record. Return the saved record */
  saveNew: (record: Omit<T, "id">) => Promise<void> | void;
  /** Update an existing record */
  saveUpdate: (id: string, record: Partial<T>) => Promise<void> | void;
  /** Current existing data for duplicate checking */
  existingData: T[];
  /** Optional row-level validation (e.g. "name OR company required") */
  validateRow?: (row: Record<string, string>) => string | null;
};

type ParsedRow = {
  idx: number;
  raw: Record<string, string>;
  errors: { col: string; message: string }[];
  isDuplicate: boolean;
  duplicateId?: string;
};

type ImportStep = "upload" | "preview" | "importing" | "done";

type DuplicateAction = "skip" | "update";

// ── Validators ───────────────────────────────────────────────────────────────

export function validateEmail(v: string): string | null {
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Invalid email format";
}

export function validateNumeric(v: string): string | null {
  if (!v) return null;
  return isNaN(Number(v)) ? "Must be a number" : null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportModal<T extends { id: string }>({
  config,
  onClose,
}: {
  config: ImportConfig<T>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [dupAction, setDupAction] = useState<DuplicateAction>("skip");
  const [summary, setSummary] = useState({ total: 0, imported: 0, updated: 0, skipped: 0, failed: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Parse file ─────────────────────────────────────────────────────────────

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (jsonRows.length === 0) {
          alert("The file has no data rows.");
          return;
        }

        // Normalize header keys: lowercase + trim
        const fileHeaders = Object.keys(jsonRows[0]).map((h) => h.trim().toLowerCase());
        const colMap = new Map<string, string>(); // normalized → original key
        Object.keys(jsonRows[0]).forEach((h) => {
          colMap.set(h.trim().toLowerCase(), h);
        });

        // Map config columns to file columns
        const keyMapping = new Map<string, string>(); // config.key → file original key
        for (const col of config.columns) {
          const normalized = col.label.toLowerCase();
          // Try exact label match first, then key match
          const match = fileHeaders.find((h) => h === normalized || h === col.key.toLowerCase());
          if (match) {
            keyMapping.set(col.key, colMap.get(match)!);
          }
        }

        // Parse and validate each row
        const parsed: ParsedRow[] = jsonRows.map((raw, idx) => {
          const record: Record<string, string> = {};
          const errors: { col: string; message: string }[] = [];

          for (const col of config.columns) {
            const fileKey = keyMapping.get(col.key);
            const value = fileKey ? String(raw[fileKey] ?? "").trim() : "";
            record[col.key] = value;

            // Required check
            if (col.required && !value) {
              errors.push({ col: col.label, message: `${col.label} is required` });
            }

            // Custom validation
            if (value && col.validate) {
              const err = col.validate(value);
              if (err) errors.push({ col: col.label, message: err });
            }
          }

          // Row-level validation
          if (config.validateRow) {
            const rowErr = config.validateRow(record);
            if (rowErr) errors.push({ col: "Row", message: rowErr });
          }

          // Check duplicates
          const dup = config.findDuplicate(record, config.existingData);

          return {
            idx: idx + 1,
            raw: record,
            errors,
            isDuplicate: !!dup,
            duplicateId: dup?.id,
          };
        });

        setRows(parsed);
        setStep("preview");
      } catch {
        alert("Failed to parse file. Please check it is a valid .xlsx or .csv file.");
      }
    };

    reader.readAsArrayBuffer(file);
  }, [config]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setStep("importing");
    const result = { total: rows.length, imported: 0, updated: 0, skipped: 0, failed: 0 };
    const errors: string[] = [];

    for (const row of rows) {
      // Skip rows with validation errors
      if (row.errors.length > 0) {
        result.failed++;
        continue;
      }

      // Handle duplicates
      if (row.isDuplicate) {
        if (dupAction === "skip") {
          result.skipped++;
          continue;
        }
        // Update existing
        try {
          const record = config.buildRecord(row.raw);
          await config.saveUpdate(row.duplicateId!, record as Partial<T>);
          result.updated++;
        } catch (err) {
          result.failed++;
          errors.push(`Row ${row.idx}: ${err instanceof Error ? err.message : "Update failed"}`);
        }
        continue;
      }

      // Save new
      try {
        const record = config.buildRecord(row.raw);
        await config.saveNew(record);
        result.imported++;
      } catch (err) {
        result.failed++;
        errors.push(`Row ${row.idx}: ${err instanceof Error ? err.message : "Import failed"}`);
      }
    }

    setSummary(result);
    setImportErrors(errors);
    setStep("done");
  };

  // ── Counts ─────────────────────────────────────────────────────────────────

  const validRows = rows.filter((r) => r.errors.length === 0);
  const duplicateRows = rows.filter((r) => r.isDuplicate && r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);
  const newRows = validRows.filter((r) => !r.isDuplicate);

  // ── Template columns display ───────────────────────────────────────────────

  const requiredCols = config.columns.filter((c) => c.required);
  const optionalCols = config.columns.filter((c) => !c.required);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#111827] rounded-xl shadow-xl shadow-black/40 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
          <h3 className="text-lg font-semibold text-[#F9FAFB]">
            Import {config.moduleName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Step: Upload ──────────────────────────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-6">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-[#1F2937] hover:border-gray-500 hover:bg-[#0F172A]"
                }`}
              >
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm text-gray-300 font-medium">
                  Drop your .xlsx or .csv file here
                </p>
                <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Template info */}
              <div className="bg-[#0B0F14] rounded-xl p-4 border border-[#1F2937]">
                <p className="text-sm font-medium text-gray-200 mb-3">
                  Expected columns for {config.moduleName}
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">
                      Required
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {requiredCols.map((c) => (
                        <span
                          key={c.key}
                          className="px-2 py-1 text-xs font-medium bg-red-500/15 text-red-300 rounded-lg border border-red-500/20"
                        >
                          {c.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {optionalCols.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Optional
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {optionalCols.map((c) => (
                          <span
                            key={c.key}
                            className="px-2 py-1 text-xs font-medium bg-[#1F2937] text-gray-400 rounded-lg"
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 mt-3">
                  Column headers should match the labels above (case-insensitive).
                </p>
              </div>
            </div>
          )}

          {/* ── Step: Preview ─────────────────────────────────────────────── */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <span className="text-sm text-gray-300 font-medium">{fileName}</span>
                  <span className="text-xs text-gray-500">({rows.length} rows)</span>
                </div>
                <button
                  onClick={() => { setStep("upload"); setRows([]); setFileName(""); }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Change file
                </button>
              </div>

              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 text-xs font-medium bg-green-500/15 text-green-400 rounded-lg">
                  {newRows.length} new
                </span>
                <span className="px-2.5 py-1 text-xs font-medium bg-yellow-500/15 text-yellow-400 rounded-lg">
                  {duplicateRows.length} duplicates ({config.duplicateKey})
                </span>
                {errorRows.length > 0 && (
                  <span className="px-2.5 py-1 text-xs font-medium bg-red-500/15 text-red-400 rounded-lg">
                    {errorRows.length} with errors
                  </span>
                )}
              </div>

              {/* Duplicate handling */}
              {duplicateRows.length > 0 && (
                <div className="bg-[#0B0F14] rounded-xl p-4 border border-[#1F2937]">
                  <p className="text-sm font-medium text-yellow-400 mb-2">
                    {duplicateRows.length} duplicate(s) found by {config.duplicateKey}
                  </p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="dupAction"
                        checked={dupAction === "skip"}
                        onChange={() => setDupAction("skip")}
                        className="accent-blue-500"
                      />
                      Skip duplicates
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="dupAction"
                        checked={dupAction === "update"}
                        onChange={() => setDupAction("update")}
                        className="accent-blue-500"
                      />
                      Update existing records
                    </label>
                  </div>
                </div>
              )}

              {/* Data table */}
              <div className="border border-[#1F2937] rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[40vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#0B0F14] z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">#</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                        {config.columns.map((col) => (
                          <th key={col.key} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                            {col.label}
                            {col.required && <span className="text-red-400 ml-0.5">*</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2937]">
                      {rows.map((row) => (
                        <tr
                          key={row.idx}
                          className={
                            row.errors.length > 0
                              ? "bg-red-500/5"
                              : row.isDuplicate
                              ? "bg-yellow-500/5"
                              : ""
                          }
                        >
                          <td className="px-3 py-2 text-gray-500">{row.idx}</td>
                          <td className="px-3 py-2">
                            {row.errors.length > 0 ? (
                              <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-medium" title={row.errors.map((e) => e.message).join(", ")}>
                                Error
                              </span>
                            ) : row.isDuplicate ? (
                              <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] font-medium">
                                Duplicate
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-medium">
                                New
                              </span>
                            )}
                          </td>
                          {config.columns.map((col) => {
                            const hasError = row.errors.some((e) => e.col === col.label);
                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-2 text-gray-300 whitespace-nowrap max-w-[200px] truncate ${
                                  hasError ? "text-red-400" : ""
                                }`}
                                title={
                                  hasError
                                    ? row.errors.find((e) => e.col === col.label)?.message
                                    : row.raw[col.key]
                                }
                              >
                                {row.raw[col.key] || "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Error detail */}
              {errorRows.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <p className="text-xs font-medium text-red-400 mb-1">Validation errors:</p>
                  <ul className="text-xs text-red-300/80 space-y-0.5 max-h-24 overflow-y-auto">
                    {errorRows.slice(0, 20).map((row) => (
                      <li key={row.idx}>
                        Row {row.idx}: {row.errors.map((e) => e.message).join(", ")}
                      </li>
                    ))}
                    {errorRows.length > 20 && (
                      <li className="text-gray-500">...and {errorRows.length - 20} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Importing ───────────────────────────────────────────── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-300">Importing records...</p>
            </div>
          )}

          {/* ── Step: Done ────────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2">
                  {summary.failed === 0 && summary.imported + summary.updated > 0 ? "✅" : "⚠️"}
                </div>
                <p className="text-lg font-semibold text-gray-100">Import Complete</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-gray-100">{summary.total}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-green-400">{summary.imported}</p>
                  <p className="text-xs text-gray-500">Imported</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-yellow-400">{summary.updated > 0 ? summary.updated : summary.skipped}</p>
                  <p className="text-xs text-gray-500">{summary.updated > 0 ? "Updated" : "Skipped"}</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-red-400">{summary.failed}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              </div>

              {importErrors.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <p className="text-xs font-medium text-red-400 mb-1">Errors:</p>
                  <ul className="text-xs text-red-300/80 space-y-0.5 max-h-32 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1F2937] flex justify-end gap-3">
          {step === "upload" && (
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          )}
          {step === "preview" && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm"
              >
                Import {dupAction === "update" ? `${newRows.length} new + ${duplicateRows.length} updates` : `${newRows.length} records`}
              </button>
            </>
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
