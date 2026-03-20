"use client";

import { useMemo } from "react";
import { useChat, type ChatConversation } from "@/context/ChatContext";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Props = {
  onNewChat: () => void;
};

export default function ChatConversationList({ onNewChat }: Props) {
  const { conversations, activeConversationId, openConversation } = useChat();
  const { user, allUsers } = useAuth();

  // Build user lookup
  const userMap = useMemo(() => {
    const m = new Map<string, { name: string; role: string }>();
    for (const u of allUsers) m.set(u.id, { name: u.name, role: u.role });
    return m;
  }, [allUsers]);

  // Derive display name for each conversation
  function getDisplayName(convo: ChatConversation): string {
    if (convo.type === "group") return convo.name ?? "Group Chat";
    // Direct: show the other person's name
    const otherId = convo.members.find((m) => m !== user?.id);
    if (!otherId) return "Chat";
    const otherUser = userMap.get(otherId);
    return otherUser?.name ?? "Unknown";
  }

  function getDisplayRole(convo: ChatConversation): string {
    if (convo.type === "group") return `${convo.members.length} members`;
    const otherId = convo.members.find((m) => m !== user?.id);
    if (!otherId) return "";
    const otherUser = userMap.get(otherId);
    return otherUser ? (ROLE_LABELS[otherUser.role as keyof typeof ROLE_LABELS] ?? otherUser.role) : "";
  }

  function getInitials(name: string): string {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  // Split into DMs and groups
  const directConvos = conversations.filter((c) => c.type === "direct");
  const groupConvos = conversations.filter((c) => c.type === "group");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#1F2937]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-[#F9FAFB]">Chat</h2>
          <button
            onClick={onNewChat}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-bold"
            title="New conversation"
          >
            +
          </button>
        </div>
        <p className="text-[10px] text-gray-500">Internal employee messaging</p>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {/* Direct messages */}
        {directConvos.length > 0 && (
          <div className="px-3 pt-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-1.5">Direct Messages</p>
            {directConvos.map((c) => (
              <ConvoItem
                key={c.id}
                convo={c}
                active={c.id === activeConversationId}
                displayName={getDisplayName(c)}
                displayRole={getDisplayRole(c)}
                initials={getInitials(getDisplayName(c))}
                isGroup={false}
                userId={user?.id}
                onClick={() => openConversation(c.id)}
              />
            ))}
          </div>
        )}

        {/* Group chats */}
        {groupConvos.length > 0 && (
          <div className="px-3 pt-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 mb-1.5">Groups</p>
            {groupConvos.map((c) => (
              <ConvoItem
                key={c.id}
                convo={c}
                active={c.id === activeConversationId}
                displayName={getDisplayName(c)}
                displayRole={getDisplayRole(c)}
                initials={getInitials(getDisplayName(c))}
                isGroup={true}
                userId={user?.id}
                onClick={() => openConversation(c.id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-12 h-12 rounded-2xl bg-[#1F2937] flex items-center justify-center mb-3">
              <span className="text-xl">💬</span>
            </div>
            <p className="text-sm font-medium text-gray-400">No conversations yet</p>
            <p className="text-xs text-gray-600 mt-1">Start a chat with a teammate</p>
            <button onClick={onNewChat} className="mt-4 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 px-4 py-2 rounded-xl">
              + New Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single conversation item ────────────────────────────────────────────────────

function ConvoItem({
  convo, active, displayName, displayRole, initials, isGroup, onClick, userId,
}: {
  convo: ChatConversation;
  active: boolean;
  displayName: string;
  displayRole: string;
  initials: string;
  isGroup: boolean;
  onClick: () => void;
  userId?: string;
}) {
  const hasUnread = (convo.unreadCount ?? 0) > 0;
  const lastMsg = convo.lastMessage;

  // Check if last message mentions the current user
  const hasMention = !!(
    hasUnread &&
    lastMsg &&
    userId &&
    lastMsg.body.includes(`(${userId})`) &&
    lastMsg.senderId !== userId
  );

  // Clean mention tokens from preview text: @[Name](id) → @Name
  const previewBody = lastMsg
    ? lastMsg.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1")
    : "";
  const attachLabel = lastMsg?.attachment ? `📎 ${lastMsg.attachment.name}` : "";
  const bodyPreview = previewBody || attachLabel;
  const previewText = lastMsg
    ? `${lastMsg.senderName.split(" ")[0]}: ${bodyPreview.length > 40 ? bodyPreview.slice(0, 37) + "..." : bodyPreview}`
    : displayRole;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${
        active
          ? "bg-blue-500/15 text-blue-400"
          : hasUnread
            ? "bg-[#111827] text-gray-200 hover:bg-[#1F2937]"
            : "text-gray-400 hover:bg-[#1F2937] hover:text-gray-200"
      }`}
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        isGroup
          ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
          : "bg-gradient-to-br from-blue-500 to-blue-700 text-white"
      }`}>
        {isGroup ? "#" : initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={`text-sm truncate ${hasUnread ? "font-semibold text-[#F9FAFB]" : "font-medium"}`}>
              {displayName}
            </p>
            {hasMention && (
              <span className="flex-shrink-0 text-[9px] font-bold text-amber-400 bg-amber-500/20 px-1 py-0.5 rounded">
                @
              </span>
            )}
          </div>
          {lastMsg && (
            <span className="text-[10px] text-gray-600 flex-shrink-0 ml-2">
              {timeAgo(lastMsg.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className={`text-xs truncate ${hasUnread ? "text-gray-300" : "text-gray-600"}`}>
            {previewText}
          </p>
          {hasUnread && (
            <span className="flex-shrink-0 ml-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold px-1">
              {convo.unreadCount! > 99 ? "99+" : convo.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
