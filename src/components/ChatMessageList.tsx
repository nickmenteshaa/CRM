"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import { useChat, type ChatConversation, type ChatMessage, type ChatReaction, type ChatAttachment, type ChatReplyPreview } from "@/context/ChatContext";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";

// ── Emoji Data ──────────────────────────────────────────────────────────────────

type EmojiCategory = { label: string; icon: string; emojis: string[] };

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    label: "Frequently Used",
    icon: "🕐",
    emojis: ["👍","❤️","😂","🔥","✅","👀","🎉","💯","👏","🙌","😍","🥳","💪","🤝","😊"],
  },
  {
    label: "Smileys",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊",
      "😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋",
      "😛","😜","🤪","😝","🤑","🤗","🤭","🫣","🤫","🤔",
      "🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄",
      "😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕",
      "🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸",
      "😎","🤓","🧐","😕","🫤","😟","🙁","😮","😯","😲",
      "😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭",
      "😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡",
      "😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺",
    ],
  },
  {
    label: "People",
    icon: "👋",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌",
      "🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉",
      "👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛",
      "🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅",
      "🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠",
      "🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦","👶",
      "🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴",
      "👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦",
    ],
  },
  {
    label: "Animals",
    icon: "🐾",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨",
      "🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒",
      "🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇",
      "🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞",
      "🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🕸️","🦂","🐢",
      "🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡",
      "🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓",
    ],
  },
  {
    label: "Food",
    icon: "🍔",
    emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐",
      "🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑",
      "🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅",
      "🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳",
      "🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟",
      "🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘",
      "🫕","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤",
      "🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨",
      "🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿",
    ],
  },
  {
    label: "Travel",
    icon: "✈️",
    emojis: [
      "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐",
      "🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛴","🚃",
      "🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊",
      "🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁",
      "🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","🗿","🗽","🗼",
      "🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️",
    ],
  },
  {
    label: "Objects",
    icon: "💡",
    emojis: [
      "⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️",
      "💾","💿","📀","📼","📷","📸","📹","🎥","📽️","🎞️",
      "📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭",
      "⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🔌","💡",
      "🔦","🕯️","🧯","🛢️","💸","💵","💴","💶","💷","🪙",
      "💰","💳","💎","⚖️","🪜","🧰","🪛","🔧","🔨","⚒️",
    ],
  },
  {
    label: "Symbols",
    icon: "❤️",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝",
      "⭐","🌟","💫","✨","⚡","🔥","💥","☄️","🌈","☀️",
      "✅","❌","❓","❗","‼️","⁉️","💤","💢","♻️","✳️",
      "⭕","✔️","☑️","✖️","➕","➖","➗","🟰","🔘","🔴",
      "🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻",
    ],
  },
  {
    label: "Flags",
    icon: "🏁",
    emojis: [
      "🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️",
      "🇺🇸","🇬🇧","🇫🇷","🇩🇪","🇮🇹","🇪🇸","🇵🇹","🇧🇷",
      "🇯🇵","🇰🇷","🇨🇳","🇮🇳","🇷🇺","🇦🇺","🇨🇦","🇲🇽",
      "🇦🇷","🇨🇱","🇨🇴","🇵🇪","🇳🇱","🇧🇪","🇸🇪","🇳🇴",
      "🇩🇰","🇫🇮","🇵🇱","🇨🇿","🇦🇹","🇨🇭","🇮🇪","🇬🇷",
      "🇹🇷","🇪🇬","🇿🇦","🇳🇬","🇰🇪","🇬🇭","🇲🇦","🇹🇳",
      "🇸🇦","🇦🇪","🇮🇱","🇹🇭","🇻🇳","🇵🇭","🇮🇩","🇲🇾",
      "🇸🇬","🇳🇿","🇺🇦","🇬🇪","🇦🇲","🇦🇿","🇰🇿","🇺🇿",
    ],
  },
];

// ── Mention regex ───────────────────────────────────────────────────────────────

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

function parseMentions(body: string): { type: "text" | "mention"; value: string; userId?: string }[] {
  const parts: { type: "text" | "mention"; value: string; userId?: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_REGEX.source, "g");
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    parts.push({ type: "mention", value: match[1], userId: match[2] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < body.length) {
    parts.push({ type: "text", value: body.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: body }];
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
  } catch {
    return iso;
  }
}

function shouldShowDateSeparator(msgs: ChatMessage[], idx: number): string | null {
  if (idx === 0) return formatDateLabel(msgs[0].createdAt);
  const prev = new Date(msgs[idx - 1].createdAt).toDateString();
  const curr = new Date(msgs[idx].createdAt).toDateString();
  if (prev !== curr) return formatDateLabel(msgs[idx].createdAt);
  return null;
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ── File attachment constants ────────────────────────────────────────────────

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/csv": "CSV",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

const ALLOWED_EXTENSIONS = ".pdf,.xlsx,.csv,.jpg,.jpeg,.png,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function fileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type === "application/pdf") return "📄";
  if (type.includes("spreadsheet") || type === "text/csv") return "📊";
  if (type.includes("wordprocessing")) return "📝";
  return "📎";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const roleColors: Record<string, string> = {
  admin: "bg-purple-500/20 text-purple-400",
  manager: "bg-amber-500/20 text-amber-400",
  senior_rep: "bg-emerald-500/20 text-emerald-400",
  sales_rep: "bg-blue-500/20 text-blue-400",
};

// ── Emoji Picker Portal Component ───────────────────────────────────────────────

function EmojiPickerPortal({
  anchorRect,
  onSelect,
  onClose,
}: {
  anchorRect: DOMRect;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(0);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Position: above the anchor button
  const top = anchorRect.top - 340;
  const left = Math.max(8, Math.min(anchorRect.left - 140, window.innerWidth - 330));
  const finalTop = top < 8 ? anchorRect.bottom + 8 : top;

  return createPortal(
    <div
      ref={ref}
      className="fixed w-[320px] bg-[#111827] border border-[#2D3748] rounded-xl shadow-2xl overflow-hidden"
      style={{ top: finalTop, left, zIndex: 9999 }}
    >
      {/* Search */}
      <div className="p-2 border-b border-[#1F2937]">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji..."
          className="w-full bg-[#1F2937] text-xs text-[#F9FAFB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 border border-[#2D3748]"
        />
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[#1F2937] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {EMOJI_CATEGORIES.map((cat, ci) => (
          <button
            key={cat.label}
            onClick={() => { setCategory(ci); setSearch(""); }}
            className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-sm transition-colors ${
              category === ci && !search ? "bg-[#2D3748]" : "hover:bg-[#1F2937]"
            }`}
            title={cat.label}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="h-[220px] overflow-y-auto p-2" style={{ scrollbarWidth: "thin" }}>
        {(() => {
          const q = search.toLowerCase().trim();
          if (q) {
            const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
            return (
              <>
                <p className="text-[10px] text-gray-600 mb-1.5 px-0.5">All Emojis</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {all.slice(0, 100).map((emoji, ei) => (
                    <button
                      key={`${emoji}-${ei}`}
                      onClick={() => onSelect(emoji)}
                      className="w-8 h-8 rounded-lg hover:bg-[#2D3748] flex items-center justify-center text-lg transition-colors hover:scale-110"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            );
          }
          const cat = EMOJI_CATEGORIES[category];
          return (
            <>
              <p className="text-[10px] text-gray-600 mb-1.5 px-0.5">{cat.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji, ei) => (
                  <button
                    key={`${emoji}-${ei}`}
                    onClick={() => onSelect(emoji)}
                    className="w-8 h-8 rounded-lg hover:bg-[#2D3748] flex items-center justify-center text-lg transition-colors hover:scale-110"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>,
    document.body
  );
}

// ── MessageBody Component (renders text + @mentions highlighted) ────────────────

function MessageBody({ body, isMe }: { body: string; isMe: boolean }) {
  const parts = parseMentions(body);
  const hasMentions = parts.some((p) => p.type === "mention");
  if (!hasMentions) return <p className="whitespace-pre-wrap break-words">{body}</p>;

  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span
            key={i}
            className={`font-semibold ${isMe ? "text-blue-200 bg-blue-500/30" : "text-blue-400 bg-blue-500/15"} rounded px-0.5`}
          >
            @{part.value}
          </span>
        ) : (
          <Fragment key={i}>{part.value}</Fragment>
        )
      )}
    </p>
  );
}

// ── Component ────────────────────────────────────────────────────────────────────

type Props = {
  conversation: ChatConversation;
  onBack: () => void;
  onDelete: () => void;
};

export default function ChatMessageList({ conversation, onBack, onDelete }: Props) {
  const { activeMessages, sendMessage, downloadAttachment } = useChat();
  const { user, allUsers } = useAuth();

  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerRect, setEmojiPickerRect] = useState<DOMRect | null>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);

  // File attachment state
  const [pendingFile, setPendingFile] = useState<{ name: string; type: string; size: number; data: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Reply state
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; body: string; hasAttachment: boolean; attachmentName?: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build user lookup for display names
  const userMap = useMemo(() => {
    const m = new Map<string, { name: string; role: string }>();
    for (const u of allUsers) m.set(u.id, { name: u.name, role: u.role });
    return m;
  }, [allUsers]);

  // Users who can be mentioned in this conversation
  const mentionableUsers = useMemo(() => {
    return conversation.members
      .filter((id) => id !== user?.id)
      .map((id) => {
        const u = userMap.get(id);
        return u ? { id, name: u.name, role: u.role } : null;
      })
      .filter(Boolean) as { id: string; name: string; role: string }[];
  }, [conversation.members, user, userMap]);

  // Filtered mention suggestions
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers.filter((u) => u.name.toLowerCase().includes(q));
  }, [mentionQuery, mentionableUsers]);

  // Display name for the conversation header
  const displayName = useMemo(() => {
    if (conversation.type === "group") return conversation.name ?? "Group Chat";
    const otherId = conversation.members.find((m) => m !== user?.id);
    if (!otherId) return "Chat";
    return userMap.get(otherId)?.name ?? "Unknown";
  }, [conversation, user, userMap]);

  const displaySubtitle = useMemo(() => {
    if (conversation.type === "group") {
      const count = conversation.members.length;
      if (count > 8) return `${count} members`;
      const names = conversation.members
        .slice(0, 8)
        .map((id) => userMap.get(id)?.name?.split(" ")[0] ?? "Unknown")
        .join(", ");
      return `${count} members: ${names}`;
    }
    const otherId = conversation.members.find((m) => m !== user?.id);
    if (!otherId) return "";
    const otherUser = userMap.get(otherId);
    return otherUser ? (ROLE_LABELS[otherUser.role as keyof typeof ROLE_LABELS] ?? otherUser.role) : "";
  }, [conversation, user, userMap]);

  // Group info for group chats
  const createdByName = useMemo(() => {
    return userMap.get(conversation.createdBy)?.name ?? "Unknown";
  }, [conversation.createdBy, userMap]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages.length]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation.id]);

  // File handling
  function validateAndSetFile(file: File) {
    setFileError(null);
    if (!Object.keys(ALLOWED_TYPES).includes(file.type)) {
      setFileError(`Unsupported file type. Allowed: ${Object.values(ALLOWED_TYPES).join(", ")}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (${formatFileSize(file.size)}). Maximum is 10 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPendingFile({ name: file.name, type: file.type, size: file.size, data: base64 });
    };
    reader.readAsDataURL(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  }

  async function handleDownload(messageId: string) {
    const result = await downloadAttachment(messageId);
    if (!result) return;
    const byteChars = atob(result.data);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: result.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleReply(msg: ChatMessage) {
    setReplyTo({
      id: msg.id,
      senderName: msg.senderName,
      body: msg.body,
      hasAttachment: !!msg.attachment,
      attachmentName: msg.attachment?.name,
    });
    inputRef.current?.focus();
  }

  function scrollToMessage(messageId: string) {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-blue-500/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-blue-500/50"), 2000);
    }
  }

  function handleSend() {
    const body = text.trim();
    if (!body && !pendingFile) return;
    sendMessage(body, pendingFile ?? undefined, replyTo?.id);
    setText("");
    setPendingFile(null);
    setFileError(null);
    setReplyTo(null);
    setMentionQuery(null);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Handle mention navigation
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    setText(val);
    setCursorPos(pos);

    // Detect @mention trigger
    const beforeCursor = val.slice(0, pos);
    const atIdx = beforeCursor.lastIndexOf("@");
    if (atIdx >= 0) {
      const afterAt = beforeCursor.slice(atIdx + 1);
      if (atIdx > 0 && beforeCursor[atIdx - 1] === "[") {
        setMentionQuery(null);
      } else if (!afterAt.includes(" ") || afterAt.length <= 20) {
        setMentionQuery(afterAt);
        setMentionIndex(0);
      } else {
        setMentionQuery(null);
      }
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(mentionUser: { id: string; name: string }) {
    const beforeCursor = text.slice(0, cursorPos);
    const atIdx = beforeCursor.lastIndexOf("@");
    if (atIdx < 0) return;
    const before = text.slice(0, atIdx);
    const after = text.slice(cursorPos);
    const mention = `@[${mentionUser.name}](${mentionUser.id}) `;
    const newText = before + mention + after;
    setText(newText);
    setMentionQuery(null);
    const newPos = before.length + mention.length;
    setCursorPos(newPos);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }

  // Insert emoji into text input at cursor position
  const insertEmoji = useCallback((emoji: string) => {
    const input = inputRef.current;
    const pos = input?.selectionStart ?? text.length;
    const newText = text.slice(0, pos) + emoji + text.slice(pos);
    setText(newText);
    setShowEmojiPicker(false);
    setEmojiPickerRect(null);
    const newPos = pos + emoji.length;
    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [text]);

  // Toggle emoji picker from input bar button
  function toggleEmojiPicker() {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      setEmojiPickerRect(null);
    } else {
      if (emojiButtonRef.current) {
        setEmojiPickerRect(emojiButtonRef.current.getBoundingClientRect());
      }
      setShowEmojiPicker(true);
    }
  }

  // Read status for a message
  function readStatus(msg: ChatMessage): string {
    if (msg.senderId !== user?.id) return "";
    const readers = msg.readBy.filter((id) => id !== user?.id);
    if (conversation.type === "direct") {
      return readers.length > 0 ? "Read" : "Sent";
    }
    const totalOthers = conversation.members.length - 1;
    if (readers.length >= totalOthers) return "Read by all";
    if (readers.length > 0) return `Read by ${readers.length}/${totalOthers}`;
    return "Sent";
  }

  const canDelete = user?.role === "admin" || conversation.createdBy === user?.id;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1F2937] bg-[#0B0F14] flex items-center gap-3">
        <button onClick={onBack} className="lg:hidden text-gray-400 hover:text-gray-200 p-1 -ml-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          conversation.type === "group"
            ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
            : "bg-gradient-to-br from-blue-500 to-blue-700 text-white"
        }`}>
          {conversation.type === "group" ? "#" : displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#F9FAFB] truncate">{displayName}</h3>
          <p className="text-[10px] text-gray-500 truncate">{displaySubtitle}</p>
        </div>

        {canDelete && (
          <button
            onClick={onDelete}
            className="text-gray-600 hover:text-red-400 text-xs p-1.5 rounded-lg hover:bg-[#1F2937] transition-colors"
            title="Delete conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Group info bar */}
      {conversation.type === "group" && (
        <div className="px-4 py-1.5 bg-[#0B0F14]/60 border-b border-[#1F2937]/50 text-[10px] text-gray-600">
          Created by {createdByName}
        </div>
      )}

      {/* Messages (with drag-and-drop) */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-1 transition-colors ${isDragOver ? "bg-blue-500/5 ring-2 ring-inset ring-blue-500/30 rounded-lg" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {activeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-[#1F2937] flex items-center justify-center mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm font-medium text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-600 mt-1">Send the first message</p>
          </div>
        ) : (
          activeMessages.map((msg, i) => {
            const isMe = msg.senderId === user?.id;
            const showHeader = i === 0 || activeMessages[i - 1].senderId !== msg.senderId;
            const dateSep = shouldShowDateSeparator(activeMessages, i);
            const status = readStatus(msg);

            // Clean body snippet for reply preview
            const replySnippet = msg.replyTo
              ? (msg.replyTo.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").slice(0, 60) + (msg.replyTo.body.length > 60 ? "..." : ""))
              : "";

            return (
              <div key={msg.id} id={`msg-${msg.id}`} className="transition-all duration-500 rounded-xl">
                {/* Date separator */}
                {dateSep && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-[#1F2937]" />
                    <span className="text-[10px] font-medium text-gray-600">{dateSep}</span>
                    <div className="flex-1 h-px bg-[#1F2937]" />
                  </div>
                )}

                <div className={`group/msg flex ${isMe ? "justify-end" : "justify-start"} ${showHeader ? "mt-3" : "mt-0.5"}`}>
                  <div className="max-w-[75%]">
                    {showHeader && (
                      <div className={`flex items-center gap-2 mb-1 ${isMe ? "justify-end" : "justify-start"}`}>
                        <span className={`text-xs font-semibold ${isMe ? "text-blue-400" : "text-gray-300"}`}>
                          {isMe ? "You" : msg.senderName}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleColors[msg.senderRole] ?? "bg-gray-500/20 text-gray-400"}`}>
                          {ROLE_LABELS[msg.senderRole as keyof typeof ROLE_LABELS] ?? msg.senderRole}
                        </span>
                      </div>
                    )}

                    {/* Quoted reply preview */}
                    {msg.replyTo && (
                      <button
                        onClick={() => scrollToMessage(msg.replyTo!.id)}
                        className={`flex items-start gap-1.5 mb-1 px-3 py-1.5 rounded-xl text-[11px] text-left w-full transition-colors ${
                          isMe
                            ? "bg-blue-700/30 hover:bg-blue-700/50 text-blue-200"
                            : "bg-[#111827] hover:bg-[#1a2332] text-gray-400"
                        }`}
                      >
                        <div className={`w-0.5 self-stretch rounded-full flex-shrink-0 ${isMe ? "bg-blue-300" : "bg-gray-500"}`} />
                        <div className="min-w-0">
                          <p className={`font-semibold text-[10px] ${isMe ? "text-blue-200" : "text-gray-300"}`}>{msg.replyTo.senderName}</p>
                          <p className="truncate">
                            {replySnippet || (msg.replyTo.hasAttachment ? `📎 ${msg.replyTo.attachmentName ?? "Attachment"}` : "")}
                          </p>
                        </div>
                      </button>
                    )}

                    {/* Message bubble + reply button */}
                    <div className={`flex items-center gap-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                      <div
                        className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed flex-1 min-w-0 ${
                          isMe
                            ? "bg-blue-600 text-white rounded-br-md"
                            : "bg-[#1F2937] text-gray-200 rounded-bl-md"
                        }`}
                      >
                        {msg.body && <MessageBody body={msg.body} isMe={isMe} />}
                        {msg.attachment && (
                          <button
                            onClick={() => handleDownload(msg.id)}
                            className={`flex items-center gap-2 mt-1 px-2.5 py-1.5 rounded-xl text-xs transition-colors w-full text-left ${
                              isMe
                                ? "bg-blue-700/50 hover:bg-blue-700/70 text-blue-100"
                                : "bg-[#111827] hover:bg-[#1a2332] text-gray-300"
                            }`}
                          >
                            <span className="text-base flex-shrink-0">{fileIcon(msg.attachment.type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{msg.attachment.name}</p>
                              <p className={`text-[10px] ${isMe ? "text-blue-200/70" : "text-gray-500"}`}>
                                {ALLOWED_TYPES[msg.attachment.type] ?? "FILE"} · {formatFileSize(msg.attachment.size)}
                              </p>
                            </div>
                            <svg className={`w-4 h-4 flex-shrink-0 ${isMe ? "text-blue-200" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Reply button (visible on hover) */}
                      <button
                        onClick={() => handleReply(msg)}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[#1F2937] text-gray-600 hover:text-gray-300 flex-shrink-0"
                        title="Reply"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                    </div>

                    <div className={`flex items-center gap-2 mt-0.5 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] text-gray-600">{formatTime(msg.createdAt)}</span>
                      {isMe && status && (
                        <span className={`text-[10px] ${status === "Read" || status === "Read by all" ? "text-blue-400" : "text-gray-600"}`}>
                          {status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Emoji picker (portal, opens above input bar) */}
      {showEmojiPicker && emojiPickerRect && (
        <EmojiPickerPortal
          anchorRect={emojiPickerRect}
          onSelect={insertEmoji}
          onClose={() => { setShowEmojiPicker(false); setEmojiPickerRect(null); }}
        />
      )}

      {/* @mention suggestions dropdown */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <div className="px-4 pb-1">
          <div className="bg-[#111827] border border-[#2D3748] rounded-xl shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
            {mentionSuggestions.map((u, idx) => (
              <button
                key={u.id}
                onClick={() => insertMention(u)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  idx === mentionIndex ? "bg-[#1F2937]" : "hover:bg-[#1F2937]/50"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#F9FAFB] truncate">{u.name}</p>
                  <p className="text-[10px] text-gray-500">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-[#1F2937] bg-[#0B0F14]">
        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[#111827] border border-[#2D3748] rounded-xl">
            <div className="w-0.5 self-stretch rounded-full bg-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-blue-400">Replying to {replyTo.senderName}</p>
              <p className="text-xs text-gray-400 truncate">
                {replyTo.body
                  ? replyTo.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").slice(0, 80)
                  : replyTo.hasAttachment
                    ? `📎 ${replyTo.attachmentName ?? "Attachment"}`
                    : ""}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              title="Cancel reply"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Pending file preview */}
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[#111827] border border-[#2D3748] rounded-xl">
            <span className="text-base">{fileIcon(pendingFile.type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#F9FAFB] truncate font-medium">{pendingFile.name}</p>
              <p className="text-[10px] text-gray-500">{ALLOWED_TYPES[pendingFile.type] ?? "FILE"} · {formatFileSize(pendingFile.size)}</p>
            </div>
            <button
              onClick={() => { setPendingFile(null); setFileError(null); }}
              className="text-gray-500 hover:text-red-400 transition-colors p-1"
              title="Remove file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* File error */}
        {fileError && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl">
            <span className="text-xs text-red-400">{fileError}</span>
            <button onClick={() => setFileError(null)} className="text-red-400 hover:text-red-300 ml-auto">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex items-center gap-2">
          {/* Attach file button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors flex-shrink-0 ${
              pendingFile
                ? "bg-[#2D3748] border-blue-500 text-blue-400"
                : "bg-[#1F2937] border-[#2D3748] text-gray-400 hover:text-blue-400 hover:border-gray-500"
            }`}
            title="Attach file (PDF, XLSX, CSV, JPG, PNG, DOCX — max 10 MB)"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {/* Emoji button */}
          <button
            ref={emojiButtonRef}
            onClick={toggleEmojiPicker}
            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors flex-shrink-0 ${
              showEmojiPicker
                ? "bg-[#2D3748] border-blue-500 text-yellow-400"
                : "bg-[#1F2937] border-[#2D3748] text-gray-400 hover:text-yellow-400 hover:border-gray-500"
            }`}
            title="Emoji"
          >
            <span className="text-lg">😊</span>
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${displayName}... (@ to mention)`}
            className="flex-1 bg-[#1F2937] text-sm text-[#F9FAFB] rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 border border-[#2D3748] transition-colors"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!text.trim() && !pendingFile}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
