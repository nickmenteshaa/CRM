"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useApp } from "@/context/AppContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type ColorOption = { bg: string; text: string; dot: string; label: string };
type Tag = { label: string; color: ColorOption };
type NotifKey = "newLead" | "dealClosed" | "taskDue" | "weeklyReport" | "teamActivity" | "emailOpen";

// ── Color palette ──────────────────────────────────────────────────────────────

const COLORS: ColorOption[] = [
  { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500",   label: "Blue" },
  { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500",  label: "Green" },
  { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500", label: "Yellow" },
  { bg: "bg-red-100",    text: "text-red-600",    dot: "bg-red-500",    label: "Red" },
  { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500", label: "Purple" },
  { bg: "bg-pink-100",   text: "text-pink-700",   dot: "bg-pink-500",   label: "Pink" },
  { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500", label: "Orange" },
  { bg: "bg-teal-100",   text: "text-teal-700",   dot: "bg-teal-500",   label: "Teal" },
  { bg: "bg-sky-100",    text: "text-sky-700",    dot: "bg-sky-500",    label: "Sky" },
  { bg: "bg-gray-100",   text: "text-gray-600",   dot: "bg-gray-400",   label: "Gray" },
];

// ── Default data ───────────────────────────────────────────────────────────────

const DEFAULT_STATUSES: Tag[] = [
  { label: "New",       color: COLORS[0] },
  { label: "Contacted", color: COLORS[2] },
  { label: "Qualified", color: COLORS[1] },
  { label: "Lost",      color: COLORS[9] },
];

const DEFAULT_SOURCES: Tag[] = [
  { label: "Website",   color: COLORS[4] },
  { label: "Referral",  color: COLORS[5] },
  { label: "LinkedIn",  color: COLORS[8] },
  { label: "Cold Call", color: COLORS[6] },
  { label: "Event",     color: COLORS[7] },
];

const DEFAULT_STAGES: Tag[] = [
  { label: "Prospecting", color: COLORS[4] },
  { label: "Qualified",   color: COLORS[0] },
  { label: "Proposal",    color: COLORS[2] },
  { label: "Negotiation", color: COLORS[6] },
  { label: "Closed Won",  color: COLORS[1] },
];

const ACCENT_COLORS = [
  { name: "Blue",   active: "bg-blue-600",   ring: "ring-blue-600" },
  { name: "Violet", active: "bg-violet-600", ring: "ring-violet-600" },
  { name: "Rose",   active: "bg-rose-600",   ring: "ring-rose-600" },
  { name: "Amber",  active: "bg-amber-500",  ring: "ring-amber-500" },
  { name: "Teal",   active: "bg-teal-600",   ring: "ring-teal-600" },
  { name: "Slate",  active: "bg-slate-700",  ring: "ring-slate-700" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative mb-5">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
      <input
        className="w-full border border-gray-200 bg-gray-50 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-blue-600" : "bg-gray-200"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

function SaveBar({ onSave }: { onSave: () => void }) {
  const [saved, setSaved] = useState(false);
  function handle() {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
      <button
        onClick={handle}
        className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
          saved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {saved ? "✓ Saved" : "Save Changes"}
      </button>
    </div>
  );
}

// ── Tag manager (statuses / sources / stages) ──────────────────────────────────

function TagManager({ tags, onChange }: { tags: Tag[]; onChange: (t: Tag[]) => void }) {
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<ColorOption>(COLORS[0]);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  function add() {
    if (!newLabel.trim()) return;
    onChange([...tags, { label: newLabel.trim(), color: newColor }]);
    setNewLabel("");
    setNewColor(COLORS[0]);
  }

  function remove(i: number) {
    onChange(tags.filter((_, idx) => idx !== i));
  }

  function updateLabel(i: number, label: string) {
    onChange(tags.map((t, idx) => (idx === i ? { ...t, label } : t)));
  }

  function updateColor(i: number, color: ColorOption) {
    onChange(tags.map((t, idx) => (idx === i ? { ...t, color } : t)));
    setEditIdx(null);
  }

  return (
    <div className="space-y-2">
      {tags.map((tag, i) => (
        <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
          {/* Color dot / picker trigger */}
          <div className="relative">
            <button
              onClick={() => setEditIdx(editIdx === i ? null : i)}
              className={`w-5 h-5 rounded-full ${tag.color.dot} flex-shrink-0 ring-2 ring-white border border-gray-300`}
            />
            {editIdx === i && (
              <div className="absolute top-7 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg p-3 grid grid-cols-5 gap-2 w-44">
                {COLORS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => updateColor(i, c)}
                    title={c.label}
                    className={`w-6 h-6 rounded-full ${c.dot} hover:scale-110 transition-transform border-2 ${tag.color.label === c.label ? "border-gray-800" : "border-transparent"}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Badge preview */}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.color.bg} ${tag.color.text} flex-shrink-0`}>
            {tag.label}
          </span>

          {/* Edit label */}
          <input
            className="flex-1 text-sm text-gray-900 bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none"
            value={tag.label}
            onChange={(e) => updateLabel(i, e.target.value)}
          />

          <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0">×</button>
        </div>
      ))}

      {/* Add row */}
      <div className="flex items-center gap-2 mt-3">
        <div className="relative">
          <button
            onClick={() => setEditIdx(editIdx === -1 ? null : -1)}
            className={`w-5 h-5 rounded-full ${newColor.dot} ring-2 ring-white border border-gray-300`}
          />
          {editIdx === -1 && (
            <div className="absolute top-7 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg p-3 grid grid-cols-5 gap-2 w-44">
              {COLORS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => { setNewColor(c); setEditIdx(null); }}
                  title={c.label}
                  className={`w-6 h-6 rounded-full ${c.dot} hover:scale-110 transition-transform border-2 ${newColor.label === c.label ? "border-gray-800" : "border-transparent"}`}
                />
              ))}
            </div>
          )}
        </div>
        <input
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="New item..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button
          onClick={add}
          disabled={!newLabel.trim()}
          className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────────

function GeneralSection() {
  const [company, setCompany] = useState("My CRM");
  const [timezone, setTimezone] = useState("UTC−5 (Eastern Time)");
  const [currency, setCurrency] = useState("USD ($)");
  const [dateFormat, setDateFormat] = useState("MMM DD, YYYY");
  const [language, setLanguage] = useState("English");
  const [search, setSearch] = useState("");

  const fields = [
    { label: "Company / Workspace Name", node: <Input value={company} onChange={setCompany} /> },
    { label: "Language", node: <Select value={language} onChange={setLanguage} options={["English", "Spanish", "French", "German", "Portuguese"]} /> },
    { label: "Timezone", node: <Select value={timezone} onChange={setTimezone} options={["UTC−8 (Pacific Time)", "UTC−7 (Mountain Time)", "UTC−6 (Central Time)", "UTC−5 (Eastern Time)", "UTC+0 (GMT)", "UTC+1 (CET)", "UTC+3 (Moscow)", "UTC+5:30 (IST)", "UTC+8 (CST)", "UTC+9 (JST)"]} /> },
    { label: "Currency", node: <Select value={currency} onChange={setCurrency} options={["USD ($)", "EUR (€)", "GBP (£)", "JPY (¥)", "CAD (C$)", "AUD (A$)", "GEL (₾)"]} /> },
    { label: "Date Format", node: <Select value={dateFormat} onChange={setDateFormat} options={["MMM DD, YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} /> },
  ];

  const visible = search.trim()
    ? fields.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()))
    : fields;

  return (
    <div>
      <SectionTitle title="General" sub="Basic workspace settings." />
      <SearchBar value={search} onChange={setSearch} placeholder="Search settings..." />
      <div className="space-y-5 max-w-lg">
        {visible.length > 0 ? visible.map((f) => <Field key={f.label} label={f.label}>{f.node}</Field>) : (
          <p className="text-sm text-gray-400">No settings match your search.</p>
        )}
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

function ProfileSection() {
  const [name, setName] = useState("Nikusha");
  const [email, setEmail] = useState("nikusha@company.com");
  const [role, setRole] = useState("Admin");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState("bg-blue-600");
  const [search, setSearch] = useState("");

  const avatarColors = ["bg-blue-600", "bg-violet-600", "bg-rose-500", "bg-amber-500", "bg-teal-600", "bg-slate-700"];
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const fields = [
    { label: "Full Name",     node: <Input value={name} onChange={setName} placeholder="Your name" /> },
    { label: "Email",         node: <Input value={email} onChange={setEmail} placeholder="you@example.com" /> },
    { label: "Role",          node: <Select value={role} onChange={setRole} options={["Admin", "Manager", "Sales Rep", "Viewer"]} /> },
    { label: "Bio",           node: <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} placeholder="A short bio..." value={bio} onChange={(e) => setBio(e.target.value)} /> },
    { label: "Avatar Color",  node: <div className="flex gap-1.5">{avatarColors.map((c) => (<button key={c} onClick={() => setAvatarColor(c)} className={`w-6 h-6 rounded-full ${c} border-2 transition-transform hover:scale-110 ${avatarColor === c ? "border-gray-800 scale-110" : "border-transparent"}`} />))}</div> },
  ];

  const visible = search.trim()
    ? fields.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()))
    : fields;

  return (
    <div>
      <SectionTitle title="Profile" sub="Your personal information and preferences." />
      <SearchBar value={search} onChange={setSearch} placeholder="Search profile fields..." />
      <div className="flex items-start gap-8 mb-6">
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          <div className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-white text-xl font-bold`}>
            {initials || "?"}
          </div>
        </div>
        <div className="flex-1 space-y-4 max-w-sm">
          {visible.length > 0 ? visible.map((f) => <Field key={f.label} label={f.label}>{f.node}</Field>) : (
            <p className="text-sm text-gray-400">No fields match your search.</p>
          )}
        </div>
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

function AppearanceSection() {
  const [accent, setAccent] = useState("Blue");
  const [density, setDensity] = useState("Comfortable");
  const [sidebarStyle, setSidebarStyle] = useState("Light");
  const [search, setSearch] = useState("");

  const groups = ["Accent Color", "Table Density", "Sidebar Style"];
  const visible = search.trim() ? groups.filter((g) => g.toLowerCase().includes(search.toLowerCase())) : groups;

  return (
    <div>
      <SectionTitle title="Appearance" sub="Customize the look and feel of your CRM." />
      <SearchBar value={search} onChange={setSearch} placeholder="Search appearance options..." />
      <div className="space-y-8 max-w-lg">
        {/* Accent color */}
        {visible.includes("Accent Color") && <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Accent Color</p>
          <div className="flex gap-3">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => setAccent(c.name)}
                title={c.name}
                className={`w-8 h-8 rounded-full ${c.active} transition-transform hover:scale-110 border-4 ${accent === c.name ? `border-gray-800 scale-110` : "border-transparent"}`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Selected: <span className="font-medium text-gray-600">{accent}</span></p>
        </div>}

        {/* Density */}
        {visible.includes("Table Density") && <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Table Density</p>
          <div className="flex gap-3">
            {["Compact", "Comfortable", "Spacious"].map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  density === d
                    ? "bg-blue-50 border-blue-500 text-blue-700 font-medium"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>}

        {/* Sidebar style */}
        {visible.includes("Sidebar Style") && <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Sidebar Style</p>
          <div className="flex gap-3">
            {["Light", "Dark"].map((s) => (
              <button
                key={s}
                onClick={() => setSidebarStyle(s)}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                  sidebarStyle === s
                    ? "bg-blue-50 border-blue-500 text-blue-700 font-medium"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>{s === "Light" ? "☀" : "🌙"}</span>
                {s}
              </button>
            ))}
          </div>
        </div>}
        {visible.length === 0 && <p className="text-sm text-gray-400">No options match your search.</p>}
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

function StatusesSection() {
  const [statuses, setStatuses] = useState<Tag[]>(DEFAULT_STATUSES);
  const [search, setSearch] = useState("");
  const filtered = search.trim() ? statuses.filter((t) => t.label.toLowerCase().includes(search.toLowerCase())) : statuses;
  return (
    <div>
      <SectionTitle title="Lead Statuses" sub="Define the stages a lead can be in. Click the color dot to change color, click the label to rename." />
      <div className="max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search statuses..." />
        <TagManager tags={filtered} onChange={(updated) => {
          if (!search.trim()) { setStatuses(updated); return; }
          const merged = statuses.map((t) => updated.find((u) => u.label === t.label) ?? t).filter((t) => !filtered.find((f) => f.label === t.label) || updated.find((u) => u.label === t.label));
          setStatuses(merged);
        }} />
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

function SourcesSection() {
  const [sources, setSources] = useState<Tag[]>(DEFAULT_SOURCES);
  const [search, setSearch] = useState("");
  const filtered = search.trim() ? sources.filter((t) => t.label.toLowerCase().includes(search.toLowerCase())) : sources;
  return (
    <div>
      <SectionTitle title="Lead Sources" sub="Where do your leads come from? Customize the source options here." />
      <div className="max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search sources..." />
        <TagManager tags={filtered} onChange={(updated) => {
          if (!search.trim()) { setSources(updated); return; }
          const merged = sources.map((t) => updated.find((u) => u.label === t.label) ?? t).filter((t) => !filtered.find((f) => f.label === t.label) || updated.find((u) => u.label === t.label));
          setSources(merged);
        }} />
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

function StagesSection() {
  const [stages, setStages] = useState<Tag[]>(DEFAULT_STAGES);
  const [search, setSearch] = useState("");
  const filtered = search.trim() ? stages.filter((t) => t.label.toLowerCase().includes(search.toLowerCase())) : stages;
  return (
    <div>
      <SectionTitle title="Pipeline Stages" sub="Customize the stages of your sales pipeline." />
      <div className="max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search stages..." />
        <TagManager tags={filtered} onChange={(updated) => {
          if (!search.trim()) { setStages(updated); return; }
          const merged = stages.map((t) => updated.find((u) => u.label === t.label) ?? t).filter((t) => !filtered.find((f) => f.label === t.label) || updated.find((u) => u.label === t.label));
          setStages(merged);
        }} />
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

function NotificationsSection() {
  const [notifs, setNotifs] = useState<Record<NotifKey, boolean>>({
    newLead: true,
    dealClosed: true,
    taskDue: true,
    weeklyReport: false,
    teamActivity: false,
    emailOpen: true,
  });
  const [search, setSearch] = useState("");

  const items: { key: NotifKey; label: string; sub: string }[] = [
    { key: "newLead",      label: "New Lead Created",    sub: "Get notified when a new lead is added to the system." },
    { key: "dealClosed",   label: "Deal Closed",         sub: "Receive an alert when a deal is marked as Closed Won." },
    { key: "taskDue",      label: "Task Due Reminder",   sub: "Remind me when a task is due today." },
    { key: "weeklyReport", label: "Weekly Report",       sub: "Receive a weekly summary of CRM activity every Monday." },
    { key: "teamActivity", label: "Team Activity",       sub: "Get notified when teammates add or update records." },
    { key: "emailOpen",    label: "Email Open Tracking", sub: "Alert when a lead opens a tracked email." },
  ];

  const visible = search.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()) || i.sub.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <SectionTitle title="Notifications" sub="Choose which events you want to be notified about." />
      <SearchBar value={search} onChange={setSearch} placeholder="Search notifications..." />
      <div className="space-y-4 max-w-lg">
        {visible.length === 0 && <p className="text-sm text-gray-400">No notifications match your search.</p>}
        {visible.map(({ key, label, sub }) => (
          <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
            </div>
            <Toggle enabled={notifs[key]} onChange={(v) => setNotifs({ ...notifs, [key]: v })} />
          </div>
        ))}
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

// ── Danger / Data section ──────────────────────────────────────────────────────

function DangerSection() {
  const { resetToSeedData } = useApp();
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);

  function handleReset() {
    resetToSeedData();
    setConfirmed(false);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Data & Reset</h3>
        <p className="text-sm text-gray-500 mt-1">Manage persisted data stored in your browser.</p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-sm">💾</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Auto-save active</p>
            <p className="text-xs text-gray-500 mt-0.5">All changes — leads, tasks, deals, companies, activities — are automatically saved to your browser&apos;s localStorage. Data persists across page refreshes.</p>
          </div>
        </div>
      </div>

      <div className="border border-red-200 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-red-700">Reset Demo Data</p>
          <p className="text-xs text-gray-500 mt-1">Clears all saved data from localStorage and restores the original seed data. This cannot be undone.</p>
        </div>

        {done && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            ✓ Demo data restored successfully.
          </p>
        )}

        {!confirmed ? (
          <button
            onClick={() => setConfirmed(true)}
            className="px-4 py-2 text-sm font-medium bg-red-50 text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
          >
            Reset Demo Data
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-700 font-medium">Are you sure? This cannot be undone.</p>
            <button onClick={handleReset} className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Yes, Reset</button>
            <button onClick={() => setConfirmed(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page nav ───────────────────────────────────────────────────────────────────

const sections = [
  { key: "general",       label: "General",         icon: "🏠" },
  { key: "profile",       label: "Profile",         icon: "👤" },
  { key: "appearance",    label: "Appearance",      icon: "🎨" },
  { key: "statuses",      label: "Lead Statuses",   icon: "🏷" },
  { key: "sources",       label: "Lead Sources",    icon: "🔗" },
  { key: "stages",        label: "Pipeline Stages", icon: "📊" },
  { key: "notifications", label: "Notifications",   icon: "🔔" },
  { key: "danger",        label: "Data & Reset",    icon: "⚠️" },
];

export default function SettingsPage() {
  const [active, setActive] = useState("general");

  const content: Record<string, React.ReactNode> = {
    general:       <GeneralSection />,
    profile:       <ProfileSection />,
    appearance:    <AppearanceSection />,
    statuses:      <StatusesSection />,
    sources:       <SourcesSection />,
    stages:        <StagesSection />,
    notifications: <NotificationsSection />,
    danger:        <DangerSection />,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your workspace, profile, and preferences.</p>
        </div>

        {/* Mobile section selector */}
        <div className="lg:hidden mb-4">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value)}
            className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sections.map((s) => (
              <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-6">
          {/* Left nav (desktop) */}
          <nav className="w-48 flex-shrink-0 hidden lg:block">
            <ul className="space-y-1">
              {sections.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => setActive(s.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                      active === s.key
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span>{s.icon}</span>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 min-h-96">
            {content[active]}
          </div>
        </div>
      </main>
    </div>
  );
}
