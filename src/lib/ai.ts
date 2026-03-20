"use server";

import Anthropic from "@anthropic-ai/sdk";

// ── Client (lazy singleton) ──────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;

// ── Shared helper ────────────────────────────────────────────────────────────

type ActivityEntry = { type: string; note: string; date: string };
type MessageEntry = {
  channel: string; direction: string; subject?: string | null;
  body: string; sender: string; date: string;
};

function formatActivities(activities: ActivityEntry[]): string {
  if (activities.length === 0) return "No activities.";
  return activities.map((a) => `[${a.date}] ${a.type}: ${a.note}`).join("\n");
}

function formatMessages(messages: MessageEntry[]): string {
  if (messages.length === 0) return "";
  const lines = messages.map((m) => {
    const subj = m.subject ? ` — Subject: ${m.subject}` : "";
    return `[${m.date}] ${m.channel} (${m.direction}) from ${m.sender}${subj}: ${m.body.slice(0, 200)}`;
  });
  return "\nCommunication history:\n" + lines.join("\n");
}

async function ask(system: string, user: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content[0];
    if (block.type === "text") return block.text.trim();
    return null;
  } catch {
    return null;
  }
}

// ── 1. Summarize lead activities ─────────────────────────────────────────────

export async function aiSummarizeActivities(
  leadName: string,
  status: string,
  activities: ActivityEntry[],
  messages: MessageEntry[] = []
): Promise<string | null> {
  if (activities.length === 0 && messages.length === 0) return null;
  const log = formatActivities(activities.slice(0, 10));
  const comms = formatMessages(messages.slice(0, 10));
  return ask(
    "You are a CRM assistant. Summarize recent sales interactions and communications for a lead in 2-3 concise sentences. Include engagement level, key topics discussed, communication channels used, and current relationship status. Do not use markdown.",
    `Lead: ${leadName}\nStatus: ${status}\n\nActivity log:\n${log}${comms}`
  );
}

// ── 2. Generate next best action ─────────────────────────────────────────────

export async function aiNextBestAction(
  leadName: string,
  status: string,
  activities: ActivityEntry[],
  summary?: string,
  messages: MessageEntry[] = []
): Promise<string | null> {
  const log = formatActivities(activities.slice(0, 5));
  const comms = formatMessages(messages.slice(0, 5));
  return ask(
    "You are a CRM assistant. Suggest the single most important next action for a sales rep to take with this lead. Consider all communication channels. Be specific and actionable. Reply in one sentence. Do not use markdown.",
    `Lead: ${leadName}\nStatus: ${status}\n${summary ? `Summary: ${summary}\n` : ""}\nRecent activity:\n${log}${comms}`
  );
}

// ── 3. Summarize pasted conversation ─────────────────────────────────────────

export async function aiSummarizeConversation(
  leadName: string,
  conversationText: string
): Promise<string | null> {
  if (!conversationText.trim()) return null;
  return ask(
    "You are a CRM assistant. Summarize the following conversation between a sales rep and a lead. Extract key points: what was discussed, any commitments made, objections raised, and overall sentiment. Keep it to 3-4 sentences. Do not use markdown.",
    `Lead: ${leadName}\n\nConversation:\n${conversationText.slice(0, 3000)}`
  );
}

// ── 4. Suggest follow-up message draft ───────────────────────────────────────

export async function aiFollowUpDraft(
  leadName: string,
  status: string,
  activities: ActivityEntry[],
  summary?: string,
  messages: MessageEntry[] = []
): Promise<string | null> {
  const log = formatActivities(activities.slice(0, 5));
  const comms = formatMessages(messages.slice(0, 5));
  return ask(
    "You are a CRM assistant. Draft a short, professional follow-up email or message from a sales rep to this lead. Reference recent interactions and communications where relevant. Keep it under 100 words. Write only the message body — no subject line, no greeting placeholder. Do not use markdown.",
    `Lead: ${leadName}\nStatus: ${status}\n${summary ? `Summary: ${summary}\n` : ""}\nRecent activity:\n${log}${comms}`
  );
}
