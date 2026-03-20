"use client";

import { useState } from "react";

export type FilterField = { key: string; label: string };

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  fields: FilterField[];
  activeFields: string[];
  onFieldsChange: (fields: string[]) => void;
  placeholder?: string;
};

export default function SearchFilter({
  query,
  onQueryChange,
  fields,
  activeFields,
  onFieldsChange,
  placeholder = "Search...",
}: Props) {
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    onFieldsChange(
      activeFields.includes(key)
        ? activeFields.filter((f) => f !== key)
        : [...activeFields, key]
    );
  }

  return (
    <div className="flex items-center gap-2 mb-5">
      {/* Search input */}
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">⌕</span>
        <input
          className="w-full border border-[#1F2937] bg-[#0F172A] rounded-lg pl-8 pr-8 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query && (
          <button
            onClick={() => onQueryChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ×
          </button>
        )}
      </div>

      {/* Filter by dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
            open ? "bg-blue-900/20 border-blue-500 text-blue-400" : "bg-[#111827] border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"
          }`}
        >
          <span>Filter by</span>
          <span className={`text-xs bg-blue-100 text-blue-700 font-semibold rounded-full px-1.5 py-0.5 ${activeFields.length === fields.length ? "hidden" : ""}`}>
            {activeFields.length}/{fields.length}
          </span>
          <span className="text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="absolute right-0 top-10 z-20 bg-[#111827] border border-[#1F2937] rounded-xl shadow-lg p-3 w-44 space-y-1">
            <div className="flex justify-between items-center pb-2 border-b border-[#1F2937] mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fields</span>
              <button
                onClick={() => onFieldsChange(activeFields.length === fields.length ? [] : fields.map((f) => f.key))}
                className="text-xs text-blue-600 hover:underline"
              >
                {activeFields.length === fields.length ? "Clear" : "All"}
              </button>
            </div>
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2.5 px-1 py-1 rounded hover:bg-[#1F2937] cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeFields.includes(f.key)}
                  onChange={() => toggle(f.key)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
                <span className="text-sm text-gray-300">{f.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
