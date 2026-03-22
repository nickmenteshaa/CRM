"use server";

import { prisma } from "@/lib/db";

/** Get all admin user IDs — admins are auto-included in every conversation */
async function getAdminIds(): Promise<string[]> {
  const admins = await prisma.employee.findMany({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

// ── Types ────────────────────────────────────────────────────────────────────────

export type ChatConversation = {
  id: string;
  type: "direct" | "group";
  name: string | null;
  createdBy: string;
  members: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
};

export type ChatReaction = {
  id: string;
  messageId: string;
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
};

export type ChatAttachment = {
  name: string;
  type: string;
  size: number;
};

export type ChatReplyPreview = {
  id: string;
  senderName: string;
  body: string;
  hasAttachment: boolean;
  attachmentName?: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  readBy: string[];
  attachment?: ChatAttachment | null;
  replyTo?: ChatReplyPreview | null;
  createdAt: string;
  reactions: ChatReaction[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────────

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapConversation(r: {
  id: string; type: string; name: string | null; createdBy: string;
  members: string; createdAt: Date; updatedAt: Date;
}): ChatConversation {
  return {
    id: r.id,
    type: r.type as "direct" | "group",
    name: r.name,
    createdBy: r.createdBy,
    members: parseJsonArray(r.members),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function mapReaction(r: {
  id: string; messageId: string; userId: string;
  userName: string; emoji: string; createdAt: Date;
}): ChatReaction {
  return {
    id: r.id, messageId: r.messageId, userId: r.userId,
    userName: r.userName, emoji: r.emoji, createdAt: r.createdAt.toISOString(),
  };
}

function mapMessage(r: {
  id: string; conversationId: string; senderId: string;
  senderName: string; senderRole: string; body: string;
  readBy: string; createdAt: Date;
  attachmentName?: string | null; attachmentType?: string | null; attachmentSize?: number | null;
  replyTo?: { id: string; senderName: string; body: string; attachmentName?: string | null } | null;
  reactions?: { id: string; messageId: string; userId: string; userName: string; emoji: string; createdAt: Date }[];
}): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversationId,
    senderId: r.senderId,
    senderName: r.senderName,
    senderRole: r.senderRole,
    body: r.body,
    readBy: parseJsonArray(r.readBy),
    attachment: r.attachmentName ? {
      name: r.attachmentName,
      type: r.attachmentType ?? "application/octet-stream",
      size: r.attachmentSize ?? 0,
    } : null,
    replyTo: r.replyTo ? {
      id: r.replyTo.id,
      senderName: r.replyTo.senderName,
      body: r.replyTo.body,
      hasAttachment: !!r.replyTo.attachmentName,
      attachmentName: r.replyTo.attachmentName ?? undefined,
    } : null,
    createdAt: r.createdAt.toISOString(),
    reactions: (r.reactions ?? []).map(mapReaction),
  };
}

/** Canonical key for a direct conversation between two users (order-independent) */
function directKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

// ── Permission helpers ───────────────────────────────────────────────────────────

type PermUser = { id: string; role: string; managerId?: string; teamId?: string };
type PermAllUsers = { id: string; role: string; managerId?: string; teamId?: string }[];

/**
 * Returns the set of user IDs the current user is allowed to message.
 * Mirrors the AuthContext hierarchy:
 *  - admin → everyone
 *  - manager → admin + own reports + same team
 *  - senior_rep / sales_rep → admin + manager + same team
 */
function getAllowedRecipients(user: PermUser, allUsers: PermAllUsers): Set<string> {
  const allowed = new Set<string>();

  if (user.role === "admin") {
    // admin can message everyone
    for (const u of allUsers) allowed.add(u.id);
  } else if (user.role === "manager") {
    // manager can message: admins, own direct reports, same-team members
    allowed.add(user.id);
    for (const u of allUsers) {
      if (u.role === "admin") allowed.add(u.id);
      if (u.managerId === user.id) allowed.add(u.id);
      if (user.teamId && u.teamId === user.teamId) allowed.add(u.id);
    }
  } else {
    // sales_rep / senior_rep → admin, own manager, same-team members
    allowed.add(user.id);
    for (const u of allUsers) {
      if (u.role === "admin") allowed.add(u.id);
      if (u.id === user.managerId) allowed.add(u.id);
      if (user.teamId && u.teamId === user.teamId) allowed.add(u.id);
    }
  }

  return allowed;
}

function canUserAccessConversation(userId: string, members: string[]): boolean {
  return members.includes(userId);
}

// ── Server actions ───────────────────────────────────────────────────────────────

/**
 * Get all conversations the user is a member of, with last message and unread count.
 */
export async function dbGetConversations(
  userId: string
): Promise<ChatConversation[]> {
  const allConvos = await prisma.chatConversation.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const result: ChatConversation[] = [];

  for (const c of allConvos) {
    const members = parseJsonArray(c.members);
    if (!members.includes(userId)) continue;

    const convo = mapConversation(c);

    // Last message
    if (c.messages.length > 0) {
      convo.lastMessage = mapMessage(c.messages[0]);
    }

    // Unread count: messages not read by this user and not sent by this user
    const allMessages = await prisma.chatMessage.findMany({
      where: { conversationId: c.id },
      select: { readBy: true, senderId: true },
    });
    convo.unreadCount = allMessages.filter((m) => {
      if (m.senderId === userId) return false;
      const readByArr = parseJsonArray(m.readBy);
      return !readByArr.includes(userId);
    }).length;

    result.push(convo);
  }

  return result;
}

/**
 * Get messages for a conversation. Permission-checked.
 */
export async function dbGetChatMessages(
  conversationId: string,
  userId: string
): Promise<ChatMessage[]> {
  // Check membership
  const convo = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { members: true },
  });
  if (!convo) return [];
  const members = parseJsonArray(convo.members);
  if (!canUserAccessConversation(userId, members)) return [];

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: {
      reactions: true,
      replyTo: {
        select: { id: true, senderName: true, body: true, attachmentName: true },
      },
    },
  });

  return rows.map(mapMessage);
}

/**
 * Find or create a direct conversation between two users.
 * Prevents duplicates by checking both orderings.
 */
export async function dbFindOrCreateDirectConversation(
  user: PermUser,
  otherUserId: string,
  allUsers: PermAllUsers
): Promise<ChatConversation | null> {
  // Permission check
  const allowed = getAllowedRecipients(user, allUsers);
  if (!allowed.has(otherUserId)) return null;

  const key = directKey(user.id, otherUserId);
  const membersA = JSON.stringify([user.id, otherUserId].sort());

  // Find existing direct conversation between these two users
  const all = await prisma.chatConversation.findMany({
    where: { type: "direct" },
  });

  for (const c of all) {
    const members = parseJsonArray(c.members);
    const existingKey = members.length === 2 ? directKey(members[0], members[1]) : "";
    if (existingKey === key) {
      return mapConversation(c);
    }
  }

  // Create new — auto-include admin(s)
  const adminIds = await getAdminIds();
  const allMembers = [...new Set([...JSON.parse(membersA) as string[], ...adminIds])];

  const row = await prisma.chatConversation.create({
    data: {
      type: "direct",
      name: null,
      createdBy: user.id,
      members: JSON.stringify(allMembers),
    },
  });

  return mapConversation(row);
}

/**
 * Create a group conversation. Only admin and manager can create groups.
 */
export async function dbCreateGroupConversation(
  user: PermUser,
  name: string,
  memberIds: string[],
  allUsers: PermAllUsers
): Promise<ChatConversation | null> {
  // Only admin and manager can create groups
  if (user.role !== "admin" && user.role !== "manager") return null;

  // Ensure creator + admin(s) are in members
  const adminIds = await getAdminIds();
  const uniqueMembers = [...new Set([user.id, ...memberIds, ...adminIds])];

  // Permission check: creator must be allowed to message non-admin members
  const allowed = getAllowedRecipients(user, allUsers);
  for (const mid of uniqueMembers) {
    if (adminIds.includes(mid)) continue; // admin auto-included, skip perm check
    if (!allowed.has(mid)) return null;
  }

  const row = await prisma.chatConversation.create({
    data: {
      type: "group",
      name: name.trim() || "Group Chat",
      createdBy: user.id,
      members: JSON.stringify(uniqueMembers),
    },
  });

  return mapConversation(row);
}

/** Allowed attachment MIME types */
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "text/csv",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
]);

/** Max attachment size: 10 MB */
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/**
 * Send a message to a conversation. Permission-checked.
 * Optionally includes a file attachment (base64 encoded).
 */
export async function dbSendChatMessage(
  conversationId: string,
  senderId: string,
  senderName: string,
  senderRole: string,
  body: string,
  attachment?: {
    name: string;
    type: string;
    size: number;
    data: string; // base64
  },
  replyToId?: string
): Promise<ChatMessage | null> {
  // Check membership
  const convo = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { members: true },
  });
  if (!convo) return null;
  const members = parseJsonArray(convo.members);
  if (!canUserAccessConversation(senderId, members)) return null;

  // Validate attachment if present
  if (attachment) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(attachment.type)) return null;
    if (attachment.size > MAX_ATTACHMENT_SIZE) return null;
  }

  const [msg] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId,
        senderId,
        senderName,
        senderRole,
        body,
        readBy: JSON.stringify([senderId]),
        ...(attachment ? {
          attachmentName: attachment.name,
          attachmentType: attachment.type,
          attachmentSize: attachment.size,
          attachmentData: attachment.data,
        } : {}),
        ...(replyToId ? { replyToId } : {}),
      },
      include: {
        replyTo: {
          select: { id: true, senderName: true, body: true, attachmentName: true },
        },
      },
    }),
    // Touch conversation updatedAt so it sorts to top
    prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return mapMessage(msg);
}

/**
 * Download an attachment. Returns base64 data. Permission-checked via conversation membership.
 */
export async function dbGetChatAttachment(
  messageId: string,
  userId: string
): Promise<{ name: string; type: string; data: string } | null> {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      attachmentName: true,
      attachmentType: true,
      attachmentData: true,
    },
  });
  if (!msg || !msg.attachmentData || !msg.attachmentName) return null;

  // Check membership
  const convo = await prisma.chatConversation.findUnique({
    where: { id: msg.conversationId },
    select: { members: true },
  });
  if (!convo) return null;
  const members = parseJsonArray(convo.members);
  if (!canUserAccessConversation(userId, members)) return null;

  return {
    name: msg.attachmentName,
    type: msg.attachmentType ?? "application/octet-stream",
    data: msg.attachmentData,
  };
}

/**
 * Mark all messages in a conversation as read by this user.
 */
export async function dbMarkConversationRead(
  conversationId: string,
  userId: string
): Promise<void> {
  // Check membership
  const convo = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { members: true },
  });
  if (!convo) return;
  const members = parseJsonArray(convo.members);
  if (!canUserAccessConversation(userId, members)) return;

  // Get all unread messages not sent by this user
  const unread = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      NOT: { senderId: userId },
    },
    select: { id: true, readBy: true },
  });

  // Update each message's readBy to include this user
  const updates = unread
    .filter((m) => {
      const arr = parseJsonArray(m.readBy);
      return !arr.includes(userId);
    })
    .map((m) => {
      const arr = parseJsonArray(m.readBy);
      arr.push(userId);
      return prisma.chatMessage.update({
        where: { id: m.id },
        data: { readBy: JSON.stringify(arr) },
      });
    });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

/**
 * Delete a conversation. Only the creator or admin can delete.
 */
export async function dbDeleteConversation(
  conversationId: string,
  userId: string,
  userRole: string
): Promise<boolean> {
  const convo = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { createdBy: true, members: true },
  });
  if (!convo) return false;

  // Only admin or creator can delete
  if (userRole !== "admin" && convo.createdBy !== userId) return false;

  await prisma.chatConversation.delete({ where: { id: conversationId } });
  return true;
}

/**
 * Toggle a reaction on a message. If the user already reacted with this emoji,
 * remove it; otherwise add it. Permission-checked via conversation membership.
 * Returns the updated reactions for the message.
 */
export async function dbToggleChatReaction(
  messageId: string,
  userId: string,
  userName: string,
  emoji: string
): Promise<ChatReaction[]> {
  // Get the message and its conversation to check membership
  const msg = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });
  if (!msg) return [];

  const convo = await prisma.chatConversation.findUnique({
    where: { id: msg.conversationId },
    select: { members: true },
  });
  if (!convo) return [];
  const members = parseJsonArray(convo.members);
  if (!canUserAccessConversation(userId, members)) return [];

  // Check if reaction already exists
  const existing = await prisma.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  if (existing) {
    // Remove it
    await prisma.chatReaction.delete({ where: { id: existing.id } });
  } else {
    // Add it
    await prisma.chatReaction.create({
      data: { messageId, userId, userName, emoji },
    });
  }

  // Return updated reactions for this message
  const reactions = await prisma.chatReaction.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" },
  });
  return reactions.map(mapReaction);
}
