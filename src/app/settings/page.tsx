"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { useApp } from "@/context/AppContext";
import { useAuth, ROLE_LABELS, type Role } from "@/context/AuthContext";
import { useFontSize, type FontSize } from "@/context/FontSizeContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type ColorOption = { bg: string; text: string; dot: string; label: string };
type Tag = { label: string; color: ColorOption };
type NotifKey = "newLead" | "dealClosed" | "taskDue" | "weeklyReport" | "teamActivity" | "emailOpen";
type LayoutDensity = "compact" | "comfortable";

// ── Color palette (restored from original) ─────────────────────────────────────

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

// ── Default data (restored from original) ──────────────────────────────────────

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

// ── Shared sub-components ──────────────────────────────────────────────────────

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-[#F9FAFB]">{title}</h3>
      {sub && <p className="text-sm text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative mb-5">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">⌕</span>
      <input
        className="w-full border border-[#1F2937] bg-[#0F172A] rounded-xl pl-8 pr-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">×</button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]"
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-blue-600" : "bg-gray-700"}`}
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
    <div className="flex justify-end pt-6 border-t border-[#1F2937] mt-6">
      <button onClick={handle} className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-all shadow-sm ${saved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
        {saved ? "✓ Saved" : "Save Changes"}
      </button>
    </div>
  );
}

// ── Tag manager (restored from original) ───────────────────────────────────────

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
        <div key={i} className="flex items-center gap-3 bg-[#0F172A] rounded-xl px-3 py-2.5 border border-[#1F2937]">
          <div className="relative">
            <button
              onClick={() => setEditIdx(editIdx === i ? null : i)}
              className={`w-5 h-5 rounded-full ${tag.color.dot} flex-shrink-0 ring-2 ring-[#111827] border border-[#374151]`}
            />
            {editIdx === i && (
              <div className="absolute top-7 left-0 z-10 bg-[#111827] border border-[#1F2937] rounded-xl shadow-lg p-3 grid grid-cols-5 gap-2 w-44">
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
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag.color.bg} ${tag.color.text} flex-shrink-0`}>
            {tag.label}
          </span>
          <input
            className="flex-1 text-sm text-[#F9FAFB] bg-transparent border-b border-transparent focus:border-gray-600 focus:outline-none"
            value={tag.label}
            onChange={(e) => updateLabel(i, e.target.value)}
          />
          <button onClick={() => remove(i)} className="text-gray-600 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0">×</button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-3">
        <div className="relative">
          <button
            onClick={() => setEditIdx(editIdx === -1 ? null : -1)}
            className={`w-5 h-5 rounded-full ${newColor.dot} ring-2 ring-[#111827] border border-[#374151]`}
          />
          {editIdx === -1 && (
            <div className="absolute top-7 left-0 z-10 bg-[#111827] border border-[#1F2937] rounded-xl shadow-lg p-3 grid grid-cols-5 gap-2 w-44">
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
          className="flex-1 border border-[#1F2937] rounded-xl px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]"
          placeholder="New item..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button
          onClick={add}
          disabled={!newLabel.trim()}
          className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Layout density hook (V2 new) ───────────────────────────────────────────────

function useLayoutDensity(): [LayoutDensity, (d: LayoutDensity) => void] {
  const [density, setDensityState] = useState<LayoutDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    return (localStorage.getItem("crm_layout_density") as LayoutDensity) || "comfortable";
  });
  function setDensity(d: LayoutDensity) {
    setDensityState(d);
    localStorage.setItem("crm_layout_density", d);
    document.documentElement.setAttribute("data-density", d);
  }
  return [density, setDensity];
}

// ── Sections ───────────────────────────────────────────────────────────────────

// ── General (restored from original) ───────────────────────────────────────────

function GeneralSection() {
  const [company, setCompany] = useState("AutoCRM");
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
          <p className="text-sm text-gray-500">No settings match your search.</p>
        )}
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

// ── Profile (V2 with AuthContext + restored bio & avatar color from V1) ────────

function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState("bg-blue-600");

  function handleSave() {
    updateProfile({ name, email });
  }

  const avatarColors = ["bg-blue-600", "bg-violet-600", "bg-rose-500", "bg-amber-500", "bg-teal-600", "bg-slate-700"];
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div>
      <SectionTitle title="Profile" sub="Your personal information and preferences." />
      <div className="flex items-start gap-8 mb-6">
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          <div className={`w-16 h-16 rounded-2xl ${avatarColor} flex items-center justify-center text-white text-xl font-bold shadow-md`}>
            {initials || "?"}
          </div>
        </div>
        <div className="flex-1 space-y-4 max-w-sm">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
            <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
            <div className="px-3 py-2.5 bg-[#1F2937] rounded-xl text-sm text-gray-400 font-medium">
              {user ? ROLE_LABELS[user.role] : "—"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Bio</label>
            <textarea className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" rows={3} placeholder="A short bio..." value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Avatar Color</label>
            <div className="flex gap-1.5">
              {avatarColors.map((c) => (
                <button key={c} onClick={() => setAvatarColor(c)} className={`w-7 h-7 rounded-full ${c} border-2 transition-transform hover:scale-110 ${avatarColor === c ? "border-gray-800 scale-110" : "border-transparent"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <SaveBar onSave={handleSave} />
    </div>
  );
}

// ── Change Password (V2 new) ──────────────────────────────────────────────────

function PasswordSection() {
  const { changePassword } = useAuth();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSave() {
    if (newPw !== confirmPw) { setMsg({ ok: false, text: "Passwords do not match" }); return; }
    const result = await changePassword(oldPw, newPw);
    if (result.ok) {
      setMsg({ ok: true, text: "Password changed successfully" });
      setOldPw(""); setNewPw(""); setConfirmPw("");
    } else {
      setMsg({ ok: false, text: result.error ?? "Error" });
    }
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div>
      <SectionTitle title="Change Password" sub="Update your account password." />
      <div className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Current Password</label>
          <input type="password" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Enter current password" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
          <input type="password" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
          <input type="password" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
        </div>
        {msg && (
          <p className={`text-sm px-3 py-2 rounded-xl ${msg.ok ? "bg-green-900/20 text-green-400 border border-green-800" : "bg-red-900/20 text-red-700 border border-red-800"}`}>{msg.text}</p>
        )}
      </div>
      <SaveBar onSave={handleSave} />
    </div>
  );
}

// ── Appearance (restored from V1 + merged V2 font size & layout density) ──────

function AppearanceSection() {
  const [accent, setAccent] = useState("Blue");
  const [sidebarStyle, setSidebarStyle] = useState("Light");
  const [search, setSearch] = useState("");
  const { fontSize, setFontSize } = useFontSize();
  const [density, setDensity] = useLayoutDensity();

  const sizes: { key: FontSize; label: string; desc: string }[] = [
    { key: "small",  label: "Small",  desc: "Compact layout, more content visible" },
    { key: "medium", label: "Medium", desc: "Default comfortable reading size" },
    { key: "large",  label: "Large",  desc: "Larger text for accessibility" },
  ];

  const densities: { key: LayoutDensity; label: string; desc: string }[] = [
    { key: "compact",     label: "Compact",     desc: "Tighter spacing, more content on screen" },
    { key: "comfortable", label: "Comfortable", desc: "Relaxed spacing for easier reading" },
  ];

  const groups = ["Accent Color", "Font Size", "Layout Density", "Sidebar Style"];
  const visible = search.trim() ? groups.filter((g) => g.toLowerCase().includes(search.toLowerCase())) : groups;

  return (
    <div>
      <SectionTitle title="Appearance" sub="Customize the look and feel of your CRM." />
      <SearchBar value={search} onChange={setSearch} placeholder="Search appearance options..." />
      <div className="space-y-8 max-w-lg">
        {/* Accent color (restored from original) */}
        {visible.includes("Accent Color") && <div>
          <p className="text-sm font-medium text-gray-300 mb-3">Accent Color</p>
          <div className="flex gap-3">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => setAccent(c.name)}
                title={c.name}
                className={`w-8 h-8 rounded-full ${c.active} transition-transform hover:scale-110 border-4 ${accent === c.name ? "border-gray-800 scale-110" : "border-transparent"}`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Selected: <span className="font-medium text-gray-400">{accent}</span></p>
        </div>}

        {/* Font Size (V2 new — merged into Appearance) */}
        {visible.includes("Font Size") && <div>
          <p className="text-sm font-medium text-gray-300 mb-3">Font Size</p>
          <div className="space-y-2.5">
            {sizes.map((s) => (
              <button
                key={s.key}
                onClick={() => setFontSize(s.key)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border transition-all text-left ${
                  fontSize === s.key
                    ? "bg-blue-900/20 border-blue-500 ring-2 ring-blue-900"
                    : "border-[#1F2937] hover:bg-[#1F2937]"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-sm text-sm ${fontSize === s.key ? "bg-blue-600 text-white" : "bg-[#1F2937] text-gray-400"}`}>
                  A
                </div>
                <div>
                  <p className={`text-sm font-semibold ${fontSize === s.key ? "text-blue-400" : "text-gray-100"}`}>{s.label}</p>
                  <p className="text-xs text-[#9CA3AF]">{s.desc}</p>
                </div>
                {fontSize === s.key && <span className="ml-auto text-blue-600 font-bold">✓</span>}
              </button>
            ))}
          </div>
        </div>}

        {/* Layout Density (V2 new — merged into Appearance) */}
        {visible.includes("Layout Density") && <div>
          <p className="text-sm font-medium text-gray-300 mb-3">Layout Density</p>
          <div className="space-y-2.5">
            {densities.map((d) => (
              <button
                key={d.key}
                onClick={() => setDensity(d.key)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border transition-all text-left ${
                  density === d.key
                    ? "bg-blue-900/20 border-blue-500 ring-2 ring-blue-900"
                    : "border-[#1F2937] hover:bg-[#1F2937]"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm ${density === d.key ? "bg-blue-600 text-white" : "bg-[#1F2937] text-gray-400"}`}>
                  {d.key === "compact" ? "▤" : "▦"}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${density === d.key ? "text-blue-400" : "text-gray-100"}`}>{d.label}</p>
                  <p className="text-xs text-[#9CA3AF]">{d.desc}</p>
                </div>
                {density === d.key && <span className="ml-auto text-blue-600 font-bold">✓</span>}
              </button>
            ))}
          </div>
        </div>}

        {/* Sidebar style (restored from original) */}
        {visible.includes("Sidebar Style") && <div>
          <p className="text-sm font-medium text-gray-300 mb-3">Sidebar Style</p>
          <div className="flex gap-3">
            {["Light", "Dark"].map((s) => (
              <button
                key={s}
                onClick={() => setSidebarStyle(s)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl border transition-colors ${
                  sidebarStyle === s
                    ? "bg-blue-900/20 border-blue-500 text-blue-400 font-medium"
                    : "border-[#1F2937] text-gray-400 hover:bg-[#1F2937]"
                }`}
              >
                <span>{s === "Light" ? "☀" : "🌙"}</span>
                {s}
              </button>
            ))}
          </div>
        </div>}

        {visible.length === 0 && <p className="text-sm text-gray-500">No options match your search.</p>}
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

// ── Lead Statuses (restored from original) ─────────────────────────────────────

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

// ── Lead Sources (restored from original) ──────────────────────────────────────

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

// ── Pipeline Stages (restored from original) ──────────────────────────────────

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

// ── Notifications (restored from original) ────────────────────────────────────

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
        {visible.length === 0 && <p className="text-sm text-gray-500">No notifications match your search.</p>}
        {visible.map(({ key, label, sub }) => (
          <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-[#1F2937] last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-100">{label}</p>
              <p className="text-xs text-[#9CA3AF] mt-0.5">{sub}</p>
            </div>
            <Toggle enabled={notifs[key]} onChange={(v) => setNotifs({ ...notifs, [key]: v })} />
          </div>
        ))}
      </div>
      <SaveBar onSave={() => {}} />
    </div>
  );
}

// ── User Management Section (V2 new — Admin Only) ─────────────────────────────

const roleStyles: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  sales_rep: "bg-blue-100 text-blue-700",
  senior_rep: "bg-emerald-100 text-emerald-700",
  manager: "bg-amber-100 text-amber-700",
};

function UsersSection() {
  const { user, allUsers, createUser, deleteUser, isAdmin } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "sales_rep" as Role });
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div>
        <SectionTitle title="Users & Roles" sub="Only admins can manage users." />
        <p className="text-sm text-[#9CA3AF]">You don&apos;t have permission to manage users. Contact an administrator.</p>
      </div>
    );
  }

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) { setError("All fields required"); return; }
    const result = await createUser(form);
    if (result.ok) {
      setForm({ name: "", email: "", password: "", role: "sales_rep" });
      setAddOpen(false);
      setError("");
    } else {
      setError(result.error ?? "Error");
    }
  }

  async function handleDelete(id: string) {
    await deleteUser(id);
    setDeleteConfirm(null);
  }

  return (
    <div>
      <SectionTitle title="Users & Roles" sub="Manage team members and their roles. Only admins can add or remove users." />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#9CA3AF]">{allUsers.length} users</p>
        <button onClick={() => setAddOpen(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-sm">+ Invite User</button>
      </div>

      <div className="space-y-2">
        {allUsers.map((u) => (
          <div key={u.id} className="flex items-center gap-4 bg-[#0F172A] rounded-xl px-4 py-3 border border-[#1F2937]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0">
              {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-100 truncate">{u.name}</p>
              <p className="text-xs text-gray-500 truncate">{u.email}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${roleStyles[u.role] ?? "bg-gray-100 text-gray-600"}`}>
              {ROLE_LABELS[u.role] ?? u.role}
            </span>
            {u.id !== user?.id && (
              <button onClick={() => setDeleteConfirm(u.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-900/20 transition-colors flex-shrink-0">
                Remove
              </button>
            )}
            {u.id === user?.id && (
              <span className="text-xs text-gray-500 flex-shrink-0">You</span>
            )}
          </div>
        ))}
      </div>

      {addOpen && (
        <Modal title="Invite User" onClose={() => { setAddOpen(false); setError(""); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Full Name *</label>
              <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
              <input className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password *</label>
              <input type="password" className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Role *</label>
              <select className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B]" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="sales_rep">Sales Rep</option>
                <option value="senior_rep">Senior Rep</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setAddOpen(false); setError(""); }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleCreate} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm">Create User</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title="Remove User" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Are you sure you want to remove this user? They will no longer be able to log in.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Remove User</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Danger / Data section ──────────────────────────────────────────────────────

function DangerSection() {
  const { purgeAllData } = useApp();
  const { isAdmin } = useAuth();

  // Production reset state
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ ok: boolean; counts: Record<string, number> } | null>(null);
  const [purgeError, setPurgeError] = useState("");

  async function handlePurge() {
    setPurging(true);
    setPurgeError("");
    try {
      // Calls server action via AppContext (same path as all other working server actions)
      const result = await purgeAllData();
      if (!result.ok) throw new Error("Server returned failure");
      setPurgeResult(result);
      setPurgeConfirmText("");
      setShowPurgeModal(false);
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "Reset failed. Please try again.");
    } finally {
      setPurging(false);
    }
  }

  const totalDeleted = purgeResult ? Object.values(purgeResult.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-6">
      <SectionTitle title="Data & Reset" sub="Manage application data." />

      <div className="bg-[#0F172A] border border-[#1F2937] rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-sm">💾</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-100">Auto-save active</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">All changes are automatically saved to the database.</p>
          </div>
        </div>
      </div>

      {/* Production: Reset System Data (admin-only) */}
      {isAdmin && (
        <div className="border border-red-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm">🗑️</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-400">Reset System Data</p>
              <p className="text-xs text-[#9CA3AF] mt-1">
                Permanently delete <strong className="text-gray-300">ALL</strong> business data from the database:
                leads, companies, deals/orders, tasks, parts, suppliers, inventory, chat, activities, and messages.
                Users, roles, and settings are kept.
              </p>
            </div>
          </div>

          {purgeResult && (
            <div className="bg-green-900/20 border border-green-800 rounded-xl px-4 py-3">
              <p className="text-sm text-green-400 font-medium">✓ System data reset complete — {totalDeleted} records deleted.</p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-gray-400">
                {Object.entries(purgeResult.counts).filter(([, v]) => v > 0).map(([k, v]) => (
                  <span key={k}>{k}: {v}</span>
                ))}
              </div>
            </div>
          )}

          {purgeError && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">{purgeError}</p>
          )}

          <button
            onClick={() => { setShowPurgeModal(true); setPurgeConfirmText(""); setPurgeError(""); }}
            className="px-4 py-2.5 text-sm font-medium bg-red-900/20 text-red-400 border border-red-800 rounded-xl hover:bg-red-900/40 transition-colors"
          >
            Reset System Data
          </button>

          {showPurgeModal && (
            <Modal title="Reset System Data" onClose={() => setShowPurgeModal(false)}>
              <div className="space-y-4">
                <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
                  <p className="text-sm text-red-400 font-semibold">⚠️ This will permanently delete ALL business data</p>
                  <ul className="mt-2 text-xs text-red-300/80 space-y-0.5 list-disc list-inside">
                    <li>All customers / leads</li>
                    <li>All companies</li>
                    <li>All deals and orders (including order lines)</li>
                    <li>All tasks</li>
                    <li>All parts, categories, and inventory</li>
                    <li>All suppliers and supplier-part links</li>
                    <li>All warehouses</li>
                    <li>All chat conversations and messages</li>
                    <li>All activities and communication records</li>
                  </ul>
                </div>

                <div>
                  <p className="text-sm text-gray-300 mb-2">
                    Type <span className="font-mono font-bold text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">DELETE</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={purgeConfirmText}
                    onChange={(e) => setPurgeConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full border border-[#374151] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] placeholder-gray-600 bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
                    autoFocus
                  />
                </div>

                {purgeError && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">{purgeError}</p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowPurgeModal(false)}
                    className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200"
                    disabled={purging}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePurge}
                    disabled={purgeConfirmText !== "DELETE" || purging}
                    className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {purging ? "Deleting…" : "Permanently Delete All Data"}
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

    </div>
  );
}

// ── Page nav ───────────────────────────────────────────────────────────────────

const sections = [
  { key: "general",       label: "General",         icon: "🏠" },
  { key: "profile",       label: "Profile",         icon: "👤" },
  { key: "password",      label: "Password",        icon: "🔒" },
  { key: "appearance",    label: "Appearance",       icon: "🎨" },
  { key: "statuses",      label: "Lead Statuses",   icon: "🏷" },
  { key: "sources",       label: "Lead Sources",    icon: "🔗" },
  { key: "stages",        label: "Pipeline Stages", icon: "📊" },
  { key: "notifications", label: "Notifications",   icon: "🔔" },
  { key: "users",         label: "Users & Roles",   icon: "👥" },
  { key: "danger",        label: "Data & Reset",    icon: "⚠️" },
];

export default function SettingsPage() {
  const [active, setActive] = useState("general");

  const content: Record<string, React.ReactNode> = {
    general:       <GeneralSection />,
    profile:       <ProfileSection />,
    password:      <PasswordSection />,
    appearance:    <AppearanceSection />,
    statuses:      <StatusesSection />,
    sources:       <SourcesSection />,
    stages:        <StagesSection />,
    notifications: <NotificationsSection />,
    users:         <UsersSection />,
    danger:        <DangerSection />,
  };

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[#F9FAFB]">Settings</h2>
          <p className="text-sm text-[#9CA3AF] mt-1">Manage your workspace, profile, and preferences.</p>
        </div>

        {/* Mobile section selector */}
        <div className="lg:hidden mb-4">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value)}
            className="w-full border border-[#1F2937] bg-[#111827] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                      active === s.key
                        ? "bg-blue-500/15 text-blue-400 shadow-sm"
                        : "text-gray-400 hover:bg-[#1F2937] hover:text-gray-100"
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
          <div className="flex-1 bg-[#111827] rounded-2xl border border-[#1F2937] p-4 sm:p-6 lg:p-8 min-h-96 shadow-sm">
            {content[active]}
          </div>
        </div>
      </main>
    </div>
  );
}
