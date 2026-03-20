"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import PageLoading from "@/components/PageLoading";
import Modal from "@/components/Modal";
import { useChat } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import ChatConversationList from "@/components/ChatConversationList";
import ChatMessageList from "@/components/ChatMessageList";
import ChatNewConversation from "@/components/ChatNewConversation";

export default function ChatPage() {
  const { conversations, activeConversationId, closeConversation, deleteConversation, loaded } = useChat();
  const { user } = useAuth();

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (!loaded) return <PageLoading />;

  const activeConvo = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId) ?? null
    : null;

  async function handleDelete() {
    if (!activeConversationId) return;
    await deleteConversation(activeConversationId);
    setDeleteConfirm(false);
  }

  return (
    <div className="flex min-h-screen bg-[#070B10]">
      <Sidebar />
      <main className="flex-1 lg:ml-64 flex">
        {/* Left panel: conversation list */}
        <div className={`w-full lg:w-80 border-r border-[#1F2937] bg-[#0B0F14] flex-shrink-0 ${
          activeConvo ? "hidden lg:flex lg:flex-col" : "flex flex-col"
        }`}>
          <ChatConversationList onNewChat={() => setNewChatOpen(true)} />
        </div>

        {/* Right panel: active conversation or empty state */}
        <div className={`flex-1 flex flex-col ${
          activeConvo ? "flex" : "hidden lg:flex"
        }`}>
          {activeConvo ? (
            <ChatMessageList
              conversation={activeConvo}
              onBack={closeConversation}
              onDelete={() => setDeleteConfirm(true)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-[#1F2937] flex items-center justify-center mb-4">
                <span className="text-3xl">💬</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-300 mb-1">Employee Chat</h3>
              <p className="text-sm text-gray-500 max-w-xs">
                Select a conversation or start a new chat with a teammate.
              </p>
              <button
                onClick={() => setNewChatOpen(true)}
                className="mt-6 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 px-5 py-2.5 rounded-xl transition-colors"
              >
                + New Conversation
              </button>
            </div>
          )}
        </div>
      </main>

      {/* New conversation modal */}
      {newChatOpen && (
        <ChatNewConversation onClose={() => setNewChatOpen(false)} />
      )}

      {/* Delete confirm */}
      {deleteConfirm && activeConvo && (
        <Modal title="Delete Conversation" onClose={() => setDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Delete this {activeConvo.type === "group" ? "group" : "conversation"}
              {activeConvo.name ? ` "${activeConvo.name}"` : ""}?
              All messages will be permanently removed.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-sm">Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
