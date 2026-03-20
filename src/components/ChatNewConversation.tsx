"use client";

import { useState, useMemo } from "react";
import Modal from "@/components/Modal";
import { useChat } from "@/context/ChatContext";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";

type Props = {
  onClose: () => void;
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-amber-100 text-amber-700",
  senior_rep: "bg-emerald-100 text-emerald-700",
  sales_rep: "bg-blue-100 text-blue-700",
};

export default function ChatNewConversation({ onClose }: Props) {
  const { messageableUserIds, startDirectChat, createGroup } = useChat();
  const { user, allUsers } = useAuth();

  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Users that the current user can message
  const messageableUsers = useMemo(() => {
    return allUsers.filter((u) => messageableUserIds.includes(u.id));
  }, [allUsers, messageableUserIds]);

  // Filtered by search
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return messageableUsers;
    const q = search.toLowerCase();
    return messageableUsers.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [messageableUsers, search]);

  // Can current user create groups? (admin or manager only)
  const canCreateGroup = user?.role === "admin" || user?.role === "manager";

  async function handleStartDirect(otherUserId: string) {
    setLoading(true);
    await startDirectChat(otherUserId);
    setLoading(false);
    onClose();
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setLoading(true);
    await createGroup(groupName.trim(), selectedMembers);
    setLoading(false);
    onClose();
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function getInitials(name: string): string {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  return (
    <Modal title="New Conversation" onClose={onClose}>
      <div className="space-y-4">
        {/* Tabs */}
        {canCreateGroup && (
          <div className="flex border-b border-[#1F2937]">
            <button
              onClick={() => setTab("direct")}
              className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${
                tab === "direct"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Direct Message
            </button>
            <button
              onClick={() => setTab("group")}
              className={`flex-1 text-sm font-medium py-2.5 text-center border-b-2 transition-colors ${
                tab === "group"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Group Chat
            </button>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder={tab === "direct" ? "Search employees..." : "Search members to add..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] placeholder-gray-500 transition-colors"
          autoFocus
        />

        {/* Group name (group tab only) */}
        {tab === "group" && (
          <input
            type="text"
            placeholder="Group name..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full border border-[#1F2937] rounded-xl px-3 py-2.5 text-sm text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0F172A] focus:bg-[#1E293B] placeholder-gray-500 transition-colors"
          />
        )}

        {/* Selected members (group tab) */}
        {tab === "group" && selectedMembers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedMembers.map((id) => {
              const u = allUsers.find((u) => u.id === id);
              if (!u) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 text-xs font-medium bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full">
                  {u.name}
                  <button onClick={() => toggleMember(id)} className="hover:text-blue-200 text-sm leading-none">×</button>
                </span>
              );
            })}
          </div>
        )}

        {/* User list */}
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filteredUsers.length === 0 ? (
            <p className="text-xs text-gray-500 italic text-center py-4">No teammates found</p>
          ) : (
            filteredUsers.map((u) => {
              const isSelected = selectedMembers.includes(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => tab === "direct" ? handleStartDirect(u.id) : toggleMember(u.id)}
                  disabled={loading}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isSelected
                      ? "bg-blue-500/15 text-blue-400"
                      : "hover:bg-[#1F2937] text-gray-300"
                  } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {getInitials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{u.email}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleColors[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  {tab === "group" && (
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-[#2D3748]"
                    }`}>
                      {isSelected && <span className="text-xs">✓</span>}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Create group button */}
        {tab === "group" && (
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedMembers.length === 0 || loading}
              className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {loading ? "Creating..." : "Create Group"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
