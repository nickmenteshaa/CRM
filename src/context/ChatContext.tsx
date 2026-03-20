"use client";

import {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef, ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import {
  dbGetConversations, dbGetChatMessages, dbFindOrCreateDirectConversation,
  dbCreateGroupConversation, dbSendChatMessage, dbMarkConversationRead,
  dbDeleteConversation, dbToggleChatReaction, dbGetChatAttachment,
  type ChatConversation, type ChatMessage, type ChatReaction, type ChatAttachment, type ChatReplyPreview,
} from "@/lib/actions-chat";

export type { ChatConversation, ChatMessage, ChatReaction, ChatAttachment, ChatReplyPreview };

// ── Permission helper (client-side mirror of server logic) ──────────────────────

type PermUser = { id: string; role: string; managerId?: string; teamId?: string };

function computeMessageableUserIds(user: PermUser, allUsers: PermUser[]): string[] {
  const allowed = new Set<string>();

  if (user.role === "admin") {
    for (const u of allUsers) allowed.add(u.id);
  } else if (user.role === "manager") {
    allowed.add(user.id);
    for (const u of allUsers) {
      if (u.role === "admin") allowed.add(u.id);
      if (u.managerId === user.id) allowed.add(u.id);
      if (user.teamId && u.teamId === user.teamId) allowed.add(u.id);
    }
  } else {
    allowed.add(user.id);
    for (const u of allUsers) {
      if (u.role === "admin") allowed.add(u.id);
      if (u.id === user.managerId) allowed.add(u.id);
      if (user.teamId && u.teamId === user.teamId) allowed.add(u.id);
    }
  }

  allowed.delete(user.id); // can't message yourself
  return [...allowed];
}

// ── Context type ────────────────────────────────────────────────────────────────

type ChatContextType = {
  /** All conversations this user belongs to */
  conversations: ChatConversation[];
  /** Messages for the currently active conversation */
  activeMessages: ChatMessage[];
  /** Currently active conversation ID */
  activeConversationId: string | null;
  /** Total unread count across all conversations */
  totalUnread: number;
  /** Whether initial load is done */
  loaded: boolean;
  /** User IDs this user is allowed to message */
  messageableUserIds: string[];

  /** Select a conversation and load its messages */
  openConversation: (id: string) => void;
  /** Close the active conversation */
  closeConversation: () => void;
  /** Start or open a direct conversation with another user */
  startDirectChat: (otherUserId: string) => Promise<string | null>;
  /** Create a group conversation */
  createGroup: (name: string, memberIds: string[]) => Promise<string | null>;
  /** Send a message to the active conversation (optionally with attachment and/or reply) */
  sendMessage: (body: string, attachment?: { name: string; type: string; size: number; data: string }, replyToId?: string) => void;
  /** Download an attachment by message ID */
  downloadAttachment: (messageId: string) => Promise<{ name: string; type: string; data: string } | null>;
  /** Toggle a reaction on a message */
  toggleReaction: (messageId: string, emoji: string) => void;
  /** Delete a conversation */
  deleteConversation: (id: string) => Promise<boolean>;
  /** Refresh conversations list */
  refresh: () => void;
};

const ChatContext = createContext<ChatContextType | null>(null);

// ── Poll interval ────────────────────────────────────────────────────────────────

const POLL_MS = 8000; // 8 seconds

// ── Provider ────────────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, allUsers } = useAuth();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Messageable users ───────────────────────────────────────────────────────

  const messageableUserIds = useMemo(() => {
    if (!user) return [];
    const permUser = { id: user.id, role: user.role, managerId: user.managerId, teamId: user.teamId };
    const permAll = allUsers.map((u) => ({ id: u.id, role: u.role, managerId: u.managerId, teamId: u.teamId }));
    return computeMessageableUserIds(permUser, permAll);
  }, [user, allUsers]);

  // ── Load conversations ─────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const convos = await dbGetConversations(user.id);
      setConversations(convos);
      if (!loaded) setLoaded(true);
    } catch {
      // silent fail for polling
    }
  }, [user, loaded]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Polling
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(() => {
      loadConversations();
      // Also refresh active messages if a conversation is open
      if (activeConversationId) {
        dbGetChatMessages(activeConversationId, user.id).then(setActiveMessages).catch(() => {});
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, loadConversations, activeConversationId]);

  // ── Total unread ────────────────────────────────────────────────────────────

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [conversations]
  );

  // ── Open conversation ──────────────────────────────────────────────────────

  const openConversation = useCallback(async (id: string) => {
    if (!user) return;
    setActiveConversationId(id);
    try {
      const msgs = await dbGetChatMessages(id, user.id);
      setActiveMessages(msgs);
      // Mark as read
      await dbMarkConversationRead(id, user.id);
      // Update local unread count
      setConversations((prev) =>
        prev.map((c) => c.id === id ? { ...c, unreadCount: 0 } : c)
      );
    } catch {
      setActiveMessages([]);
    }
  }, [user]);

  const closeConversation = useCallback(() => {
    setActiveConversationId(null);
    setActiveMessages([]);
  }, []);

  // ── Start direct chat ──────────────────────────────────────────────────────

  const startDirectChat = useCallback(async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;
    const permUser = { id: user.id, role: user.role, managerId: user.managerId, teamId: user.teamId };
    const permAll = allUsers.map((u) => ({ id: u.id, role: u.role, managerId: u.managerId, teamId: u.teamId }));
    const convo = await dbFindOrCreateDirectConversation(permUser, otherUserId, permAll);
    if (!convo) return null;
    await loadConversations();
    openConversation(convo.id);
    return convo.id;
  }, [user, allUsers, loadConversations, openConversation]);

  // ── Create group ───────────────────────────────────────────────────────────

  const createGroup = useCallback(async (name: string, memberIds: string[]): Promise<string | null> => {
    if (!user) return null;
    const permUser = { id: user.id, role: user.role, managerId: user.managerId, teamId: user.teamId };
    const permAll = allUsers.map((u) => ({ id: u.id, role: u.role, managerId: u.managerId, teamId: u.teamId }));
    const convo = await dbCreateGroupConversation(permUser, name, memberIds, permAll);
    if (!convo) return null;
    await loadConversations();
    openConversation(convo.id);
    return convo.id;
  }, [user, allUsers, loadConversations, openConversation]);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (body: string, attachment?: { name: string; type: string; size: number; data: string }, replyToId?: string) => {
    if (!user || !activeConversationId) return;
    // Must have either body or attachment
    if (!body.trim() && !attachment) return;
    const msg = await dbSendChatMessage(
      activeConversationId,
      user.id,
      user.name,
      user.role,
      body.trim(),
      attachment,
      replyToId
    );
    if (msg) {
      setActiveMessages((prev) => [...prev, msg]);
      // Update last message in conversation list
      setConversations((prev) =>
        prev.map((c) => c.id === activeConversationId
          ? { ...c, lastMessage: msg, updatedAt: msg.createdAt }
          : c
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
    }
  }, [user, activeConversationId]);

  // ── Download attachment ───────────────────────────────────────────────────

  const downloadAttachment = useCallback(async (messageId: string) => {
    if (!user) return null;
    return dbGetChatAttachment(messageId, user.id);
  }, [user]);

  // ── Toggle reaction ─────────────────────────────────────────────────────────

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const updatedReactions = await dbToggleChatReaction(messageId, user.id, user.name, emoji);
    // Update the message's reactions in local state
    setActiveMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, reactions: updatedReactions } : m)
    );
  }, [user]);

  // ── Delete conversation ────────────────────────────────────────────────────

  const deleteConversationFn = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;
    const ok = await dbDeleteConversation(id, user.id, user.role);
    if (ok) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setActiveMessages([]);
      }
    }
    return ok;
  }, [user, activeConversationId]);

  // ── Refresh ────────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <ChatContext.Provider value={{
      conversations, activeMessages, activeConversationId,
      totalUnread, loaded, messageableUserIds,
      openConversation, closeConversation, startDirectChat,
      createGroup, sendMessage, downloadAttachment, toggleReaction, deleteConversation: deleteConversationFn, refresh,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}
