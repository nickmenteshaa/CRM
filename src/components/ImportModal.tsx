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
  /**
   * Optional: write a single DB batch via server action.
   */
  bulkSaveBatch?: (batch: Omit<T, "id">[]) => Promise<{ created: number; skipped: number; error?: string }>;
  /**
   * Optional: API route URL for bulk import writes (bypasses server actions).
   * When set, ImportModal POSTs batches to this URL instead of calling bulkSaveBatch.
   * The API route should use a direct (non-pooler) DB connection.
   */
  bulkApiRoute?: string;
};

type ParsedRow = {
  idx: number;
  raw: Record<string, string>;
  errors: { col: string; message: string }[];
  isDuplicate: boolean;
  duplicateId?: string;
};

type ImportStep = "upload" | "preview" | "importing" | "done" | "dry-run";

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

  // ── Progress tracking ───────────────────────────────────────────────────
  const [progress, setProgress] = useState({
    processedRows: 0, totalRows: 0,
    imported: 0, skipped: 0, failed: 0,
    batchNum: 0, totalBatches: 0,
    phase: "", elapsedMs: 0, avgBatchMs: 0,
  });
  const cancelledRef = useRef(false);

  // ── Parse file ─────────────────────────────────────────────────────────────

  // Helper: yield to browser so React can repaint
  const yieldToBrowser = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        setStep("importing");
        setProgress({ processedRows: 0, totalRows: 1, imported: 0, skipped: 0, failed: 0, batchNum: 0, totalBatches: 0, phase: "Reading file...", elapsedMs: 0, avgBatchMs: 0 });
        await yieldToBrowser();

        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (jsonRows.length === 0) {
          alert("The file has no data rows.");
          setStep("upload");
          return;
        }

        setProgress((p) => ({ ...p, totalRows: jsonRows.length, phase: `Parsed ${jsonRows.length.toLocaleString()} rows. Validating...` }));
        await yieldToBrowser();

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

        // Skip client-side duplicate checking for large datasets when server handles it
        const skipDupCheck = (config.bulkSaveBatch || config.bulkApiRoute) && config.existingData.length === 0;

        // Parse and validate rows in chunks to yield to browser
        const VALIDATE_CHUNK = 500;
        const parsed: ParsedRow[] = [];

        for (let i = 0; i < jsonRows.length; i += VALIDATE_CHUNK) {
          const chunkEnd = Math.min(i + VALIDATE_CHUNK, jsonRows.length);

          for (let j = i; j < chunkEnd; j++) {
            const raw = jsonRows[j];
            const record: Record<string, string> = {};
            const errors: { col: string; message: string }[] = [];

            for (const col of config.columns) {
              const fileKey = keyMapping.get(col.key);
              const value = fileKey ? String(raw[fileKey] ?? "").trim() : "";
              record[col.key] = value;

              if (col.required && !value) {
                errors.push({ col: col.label, message: `${col.label} is required` });
              }

              if (value && col.validate) {
                const err = col.validate(value);
                if (err) errors.push({ col: col.label, message: err });
              }
            }

            if (config.validateRow) {
              const rowErr = config.validateRow(record);
              if (rowErr) errors.push({ col: "Row", message: rowErr });
            }

            let dup: T | undefined;
            if (!skipDupCheck) {
              dup = config.findDuplicate(record, config.existingData);
            }

            parsed.push({
              idx: j + 1,
              raw: record,
              errors,
              isDuplicate: !!dup,
              duplicateId: dup?.id,
            });
          }

          // Yield after each chunk so React repaints
          setProgress((p) => ({
            ...p,
            processedRows: chunkEnd,
            totalRows: jsonRows.length,
            phase: `Validating rows... ${chunkEnd.toLocaleString()} / ${jsonRows.length.toLocaleString()}`,
          }));
          await yieldToBrowser();
        }

        setRows(parsed);
        setStep("preview");
      } catch {
        alert("Failed to parse file. Please check it is a valid .xlsx or .csv file.");
        setStep("upload");
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

  const [timing, setTiming] = useState({ totalMs: 0, avgBatchMs: 0, batchCount: 0 });
  const BATCH_SIZE = 200; // rows per server action call — smaller for Neon pooler reliability

  const handleImport = async () => {
    cancelledRef.current = false;
    setStep("importing");
    const t0 = performance.now();
    const result = { total: rows.length, imported: 0, updated: 0, skipped: 0, failed: 0 };
    const errors: string[] = [];
    const batchTimings: number[] = [];
    let processedRows = 0;
    const totalRows = rows.length;

    const validNewRows = rows.filter((r) => r.errors.length === 0 && !r.isDuplicate);
    const dupRows = rows.filter((r) => r.errors.length === 0 && r.isDuplicate);
    const errRows = rows.filter((r) => r.errors.length > 0);
    result.failed = errRows.length;
    processedRows += errRows.length;

    /** Emit progress + yield so React repaints */
    async function emit(phase: string, batchNum: number, totalBatches: number) {
      const elapsed = performance.now() - t0;
      const avg = batchTimings.length > 0 ? batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length : 0;
      setProgress({ processedRows, totalRows, imported: result.imported, skipped: result.skipped, failed: result.failed, batchNum, totalBatches, phase, elapsedMs: elapsed, avgBatchMs: avg });
      await yieldToBrowser();
    }

    await emit("Validating rows...", 0, 0);
    if (cancelledRef.current) { done(); return; }

    // ── Bulk import: prefer API route, fall back to server action ──
    const useBulk = !!(config.bulkApiRoute || config.bulkSaveBatch);
    if (useBulk && validNewRows.length > 0) {
      // Build records in chunks to avoid blocking
      const BUILD_CHUNK = 500;
      const records: Omit<T, "id">[] = [];
      for (let i = 0; i < validNewRows.length; i += BUILD_CHUNK) {
        const chunkEnd = Math.min(i + BUILD_CHUNK, validNewRows.length);
        for (let j = i; j < chunkEnd; j++) {
          records.push(config.buildRecord(validNewRows[j].raw));
        }
        await emit(`Preparing records... ${chunkEnd.toLocaleString()} / ${validNewRows.length.toLocaleString()}`, 0, 0);
      }

      const totalBatches = Math.ceil(records.length / BATCH_SIZE);

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        if (cancelledRef.current) { errors.push("Cancelled by user"); break; }
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batch = records.slice(i, i + BATCH_SIZE);
        await emit(`Writing batch ${batchNum} of ${totalBatches}...`, batchNum, totalBatches);

        const bt0 = performance.now();
        let br: { created: number; skipped: number; error?: string };

        if (config.bulkApiRoute) {
          // API route: POST JSON directly, bypasses server action serialization
          try {
            const resp = await fetch(config.bulkApiRoute, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ records: batch }),
            });
            br = await resp.json();
            if (!resp.ok && !br.error) br.error = `HTTP ${resp.status}`;
          } catch (fetchErr) {
            br = { created: 0, skipped: 0, error: fetchErr instanceof Error ? fetchErr.message : "Network error" };
          }
        } else {
          br = await config.bulkSaveBatch!(batch);
        }

        batchTimings.push(performance.now() - bt0);

        if (br.error) {
          const rowStart = i + 1;
          const rowEnd = Math.min(i + BATCH_SIZE, records.length);
          errors.push(`Batch ${batchNum}/${totalBatches} (rows ${rowStart.toLocaleString()}–${rowEnd.toLocaleString()}): ${br.error}`);
          result.failed += batch.length;
        } else {
          result.imported += br.created;
          result.skipped += br.skipped;
        }
        processedRows += batch.length;
        await emit(`Wrote batch ${batchNum} of ${totalBatches}`, batchNum, totalBatches);
      }
    } else if (validNewRows.length > 0) {
      // ── Row-by-row fallback ──
      const total = validNewRows.length;
      for (let i = 0; i < total; i++) {
        if (cancelledRef.current) { errors.push("Cancelled by user"); break; }
        const row = validNewRows[i];
        const bt0 = performance.now();
        try { await config.saveNew(config.buildRecord(row.raw)); result.imported++; }
        catch (err) { result.failed++; errors.push(`Row ${row.idx}: ${err instanceof Error ? err.message : "Failed"}`); }
        batchTimings.push(performance.now() - bt0);
        processedRows++;
        if ((i + 1) % 10 === 0 || i === total - 1) await emit("Writing to database...", i + 1, total);
      }
    }

    // ── Duplicates ──
    if (!cancelledRef.current && dupRows.length > 0 && dupAction !== "skip") {
      for (let i = 0; i < dupRows.length; i++) {
        if (cancelledRef.current) { errors.push("Cancelled by user"); break; }
        const row = dupRows[i];
        try { await config.saveUpdate(row.duplicateId!, config.buildRecord(row.raw) as Partial<T>); result.updated++; }
        catch (err) { result.failed++; errors.push(`Row ${row.idx}: ${err instanceof Error ? err.message : "Update failed"}`); }
        processedRows++;
        if ((i + 1) % 10 === 0 || i === dupRows.length - 1) await emit("Updating duplicates...", i + 1, dupRows.length);
      }
    } else if (!cancelledRef.current) {
      result.skipped += dupRows.length;
      processedRows += dupRows.length;
    }

    done();

    function done() {
      const totalMs = performance.now() - t0;
      const avgBatchMs = batchTimings.length > 0 ? batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length : 0;
      setTiming({ totalMs, avgBatchMs, batchCount: batchTimings.length });
      setSummary(result);
      setImportErrors(errors);
      setStep("done");
    }
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
      <div className="absolute inset-0 bg-black/60" onClick={step === "importing" ? undefined : onClose} />
      <div className="relative bg-[#111827] rounded-xl shadow-xl shadow-black/40 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2937]">
          <h3 className="text-lg font-semibold text-[#F9FAFB]">
            Import {config.moduleName}
          </h3>
          {step !== "importing" && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-xl leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs font-bold text-red-500 bg-red-900/30 px-2 py-1 rounded mb-2">IMPORT MODAL BUILD MARKER 1</p>
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
                      {rows.slice(0, 200).map((row) => (
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

              {/* Truncation notice */}
              {rows.length > 200 && (
                <p className="text-xs text-gray-500 text-center">
                  Showing first 200 of {rows.length.toLocaleString()} rows in preview. All rows will be imported.
                </p>
              )}

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

          {/* ── Step: Importing (live progress) ────────────────────────── */}
          {step === "importing" && (
            <div className="space-y-4 py-4">
              {/* Debug marker */}
              <p className="text-center text-xs font-bold text-red-500 bg-red-900/30 rounded-lg py-1">IMPORT PROGRESS BUILD MARKER 1</p>
              <p className="text-center text-xs font-bold text-green-400 bg-green-900/20 rounded-lg py-1">PROGRESS UI ACTIVE — {Math.floor((progress.processedRows / (progress.totalRows || 1)) * 100)}% — {progress.processedRows.toLocaleString()}/{progress.totalRows.toLocaleString()} rows — batch {progress.batchNum}/{progress.totalBatches}</p>
              {/* File info */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-base">📄</span>
                <span className="text-sm text-gray-300 font-medium truncate">{fileName}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">{rows.length.toLocaleString()} rows</span>
              </div>

              {/* Phase + spinner */}
              <div className="flex items-center gap-3 bg-[#0B0F14] rounded-xl px-4 py-3 border border-[#1F2937]">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm text-gray-200">{progress.phase || "Preparing..."}</p>
              </div>

              {/* Progress bar — driven by processedRows / totalRows */}
              {progress.totalRows > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-gray-400">
                      {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows processed
                      {progress.totalBatches > 0 && ` (batch ${progress.batchNum}/${progress.totalBatches})`}
                    </span>
                    <span className="font-semibold text-gray-200 text-sm">{Math.floor((progress.processedRows / progress.totalRows) * 100)}%</span>
                  </div>
                  <div className="w-full h-3 bg-[#1F2937] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.processedRows / progress.totalRows) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Live counters */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-xl font-bold text-green-400">{progress.imported.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Imported</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-xl font-bold text-yellow-400">{progress.skipped.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Skipped</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-xl font-bold text-red-400">{progress.failed.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Failed</p>
                </div>
              </div>

              {/* Timing metrics */}
              <div className="flex items-center justify-between text-[10px] text-gray-600 px-1">
                <span>Elapsed: {(progress.elapsedMs / 1000).toFixed(1)}s</span>
                {progress.avgBatchMs > 0 && <span>Avg/batch: {(progress.avgBatchMs / 1000).toFixed(2)}s</span>}
                {progress.avgBatchMs > 0 && progress.processedRows < progress.totalRows && (() => {
                  const rowsLeft = progress.totalRows - progress.processedRows;
                  const batchesLeft = Math.ceil(rowsLeft / BATCH_SIZE);
                  return <span>ETA: ~{((batchesLeft * progress.avgBatchMs) / 1000).toFixed(0)}s</span>;
                })()}
              </div>
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
                  <p className="text-2xl font-bold text-gray-100">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-green-400">{summary.imported.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Imported</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-yellow-400">{(summary.updated + summary.skipped).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{summary.updated > 0 && summary.skipped > 0 ? `${summary.updated.toLocaleString()} Updated / ${summary.skipped.toLocaleString()} Skipped` : summary.updated > 0 ? "Updated" : "Skipped"}</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-red-400">{summary.failed.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              </div>

              {/* Timing metrics */}
              <div className="bg-[#0B0F14] rounded-xl p-3 border border-[#1F2937]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Total time</span>
                  <span className="text-gray-200 font-medium">{(timing.totalMs / 1000).toFixed(1)}s</span>
                </div>
                {timing.batchCount > 1 && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-gray-400">Avg per batch ({timing.batchCount} batches × {BATCH_SIZE} rows)</span>
                    <span className="text-gray-200 font-medium">{(timing.avgBatchMs / 1000).toFixed(2)}s</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-400">Throughput</span>
                  <span className="text-gray-200 font-medium">{timing.totalMs > 0 ? Math.round((summary.imported / (timing.totalMs / 1000))) : 0} records/sec</span>
                </div>
              </div>

              {importErrors.length > 0 && (() => {
                const batchErrors = importErrors.filter((e) => e.startsWith("Batch "));
                const rowErrors = importErrors.filter((e) => e.startsWith("Row "));
                const otherErrors = importErrors.filter((e) => !e.startsWith("Batch ") && !e.startsWith("Row "));
                return (
                  <div className="space-y-3">
                    {/* Failed batches with row ranges */}
                    {batchErrors.length > 0 && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-red-400 mb-2">Failed batches ({batchErrors.length})</p>
                        <ul className="text-xs text-red-300/80 space-y-1 max-h-40 overflow-y-auto">
                          {batchErrors.map((err, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-red-500 mt-px">✕</span>
                              <span>{err}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 bg-[#0B0F14] rounded-lg p-2.5 border border-[#1F2937]">
                          <p className="text-[10px] text-gray-400">
                            <span className="text-gray-300 font-medium">To retry failed rows:</span> Create a new file containing only the rows shown above and re-import.
                            Already-imported rows will be skipped automatically (duplicate SKU detection).
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Row-level errors */}
                    {rowErrors.length > 0 && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-red-400 mb-1">Row errors ({rowErrors.length})</p>
                        <ul className="text-xs text-red-300/80 space-y-0.5 max-h-24 overflow-y-auto">
                          {rowErrors.slice(0, 30).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {rowErrors.length > 30 && (
                            <li className="text-gray-500">...and {rowErrors.length - 30} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Other errors (cancel, etc) */}
                    {otherErrors.length > 0 && (
                      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                        <ul className="text-xs text-yellow-300/80 space-y-0.5">
                          {otherErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Step: Dry Run ──────────────────────────────────────────────── */}
          {step === "dry-run" && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-lg font-semibold text-gray-100">Dry Run Report</p>
                <p className="text-xs text-gray-500 mt-1">No data was written. This is a preview of what would happen.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-gray-100">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-green-400">{summary.imported.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Would Import</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-yellow-400">{(summary.skipped + summary.updated).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{summary.updated > 0 ? "Would Update" : "Would Skip"}</p>
                </div>
                <div className="bg-[#0B0F14] rounded-xl p-3 text-center border border-[#1F2937]">
                  <p className="text-2xl font-bold text-red-400">{summary.failed.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Would Fail</p>
                </div>
              </div>

              {importErrors.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <p className="text-xs font-medium text-red-400 mb-1">Validation errors that would cause failures:</p>
                  <ul className="text-xs text-red-300/80 space-y-0.5 max-h-32 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {errorRows.length > 50 && (
                      <li className="text-gray-500">...and {errorRows.length - 50} more</li>
                    )}
                  </ul>
                </div>
              )}

              {summary.failed === 0 && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                  <p className="text-xs font-medium text-green-400">All {summary.imported.toLocaleString()} records are valid and ready to import.</p>
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
                onClick={() => {
                  setSummary({
                    total: rows.length,
                    imported: newRows.length,
                    updated: dupAction === "update" ? duplicateRows.length : 0,
                    skipped: dupAction === "skip" ? duplicateRows.length : 0,
                    failed: errorRows.length,
                  });
                  setImportErrors(
                    errorRows.slice(0, 50).map((r) => `Row ${r.idx}: ${r.errors.map((e) => e.message).join(", ")}`)
                  );
                  setStep("dry-run" as ImportStep);
                }}
                className="px-4 py-2.5 text-sm font-medium text-gray-300 border border-[#374151] rounded-xl hover:bg-[#1F2937] transition-colors"
              >
                Dry Run
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
          {step === "importing" && (
            <button
              onClick={() => { cancelledRef.current = true; }}
              className="px-4 py-2.5 text-sm font-medium text-red-400 border border-red-800 rounded-xl hover:bg-red-900/20 transition-colors"
            >
              Cancel Import
            </button>
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm"
            >
              Close
            </button>
          )}
          {step === "dry-run" && (
            <>
              <button
                onClick={() => setStep("preview")}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm"
              >
                Proceed with Import
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
