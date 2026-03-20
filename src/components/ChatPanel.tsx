"use client";

import { useState, useRef, useEffect } from "react";
import type { Message } from "@/context/AppContext";

type ChatPanelProps = {
  messages: Message[];
  currentUserId: string;
  currentUserName: string;
  /** Called when the user sends a message */
  onSend: (body: string) => void;
  /** Placeholder for the input */
  placeholder?: string;
};

function formatTime(dateStr: string): string {
  return dateStr;
}

export default function ChatPanel({
  messages,
  currentUserId,
  currentUserName,
  onSend,
  placeholder = "Type a message...",
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function handleSend() {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group consecutive messages from same sender
  const sorted = [...messages].sort(
    (a, b) => (a.id > b.id ? 1 : -1)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-12 h-12 rounded-full bg-[#1F2937] flex items-center justify-center mb-3">
              <span className="text-xl">💬</span>
            </div>
            <p className="text-sm font-medium text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-600 mt-1">Start the conversation below</p>
          </div>
        ) : (
          sorted.map((msg, i) => {
            const isMe = msg.sender === currentUserName || msg.sender === currentUserId;
            const showSender = i === 0 || sorted[i - 1].sender !== msg.sender;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                {showSender && (
                  <span className={`text-[10px] font-medium mb-0.5 px-1 ${
                    isMe ? "text-blue-400" : "text-gray-500"
                  }`}>
                    {isMe ? "You" : msg.sender}
                  </span>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-[#1F2937] text-gray-200 rounded-bl-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                </div>
                <span className={`text-[10px] mt-0.5 px-1 ${
                  isMe ? "text-gray-500" : "text-gray-600"
                }`}>
                  {formatTime(msg.date)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="px-3 py-2.5 border-t border-[#1F2937] bg-[#0B0F14]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-[#1F2937] text-sm text-[#F9FAFB] rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 border border-[#2D3748] transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
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
