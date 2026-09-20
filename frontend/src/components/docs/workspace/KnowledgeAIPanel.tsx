"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  FileText,
  BookOpen,
  X,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import {
  streamKnowledgeChat,
  type AICitation,
  type AIChatRequest,
} from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";
import { MarkdownPreview } from "@/components/ds/MarkdownPreview";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AICitation[];
}

export function KnowledgeAIPanel({
  activePageId,
  activePageTitle,
}: {
  activePageId?: string;
  activePageTitle?: string;
}) {
  const {
    selectedContextPageIds,
    selectedContextSourceIds,
    toggleContextPage,
    toggleContextSource,
    clearContextSelection,
    openTab,
  } = useKnowledgeWorkspace();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (customPrompt?: string, action?: AIChatRequest["action"]) => {
    const promptToSend = customPrompt || inputPrompt;
    if (!promptToSend.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: promptToSend.trim(),
    };

    const asstMsgId = `asst-${Date.now()}`;
    const initialAsstMsg: ChatMessage = {
      id: asstMsgId,
      role: "assistant",
      content: "",
      citations: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAsstMsg]);
    setInputPrompt("");
    setIsStreaming(true);

    const contextPages = selectedContextPageIds.length > 0
      ? selectedContextPageIds
      : (activePageId ? [activePageId] : []);

    let accumulatedContent = "";
    let accumulatedCitations: AICitation[] = [];

    await streamKnowledgeChat(
      {
        question: promptToSend.trim(),
        context_page_ids: contextPages,
        context_source_ids: selectedContextSourceIds,
        action,
      },
      {
        onCitations: (citations) => {
          accumulatedCitations = citations;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstMsgId ? { ...m, citations } : m
            )
          );
        },
        onToken: (token) => {
          accumulatedContent += token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstMsgId
                ? { ...m, content: accumulatedContent, citations: accumulatedCitations }
                : m
            )
          );
        },
        onDone: () => {
          setIsStreaming(false);
        },
        onError: (err) => {
          console.error("AI Streaming error:", err);
          setIsStreaming(false);
        },
      }
    );
  };

  const copyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 text-xs select-none">
      {/* Context Drawer Header */}
      <div className="p-3 border-b border-white/5 bg-slate-900/40">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-white flex items-center gap-1.5">
            <Sparkles size={13} className="text-indigo-400" />
            Grounded Context Budget
          </span>
          {(selectedContextPageIds.length > 0 || selectedContextSourceIds.length > 0) && (
            <button
              type="button"
              onClick={clearContextSelection}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Selected Context Badges */}
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {activePageId && !selectedContextPageIds.includes(activePageId) && (
            <button
              type="button"
              onClick={() => toggleContextPage(activePageId)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/5"
            >
              <FileText size={10} className="text-indigo-400" />
              <span>+ Current Page ({activePageTitle || "Doc"})</span>
            </button>
          )}

          {selectedContextPageIds.map((pid) => (
            <span
              key={pid}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium"
            >
              <FileText size={10} />
              <span>Doc</span>
              <button
                type="button"
                onClick={() => toggleContextPage(pid)}
                className="hover:text-white"
              >
                <X size={10} />
              </button>
            </span>
          ))}

          {selectedContextSourceIds.map((sid) => (
            <span
              key={sid}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium"
            >
              <BookOpen size={10} />
              <span>Source</span>
              <button
                type="button"
                onClick={() => toggleContextSource(sid)}
                className="hover:text-white"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Quick Action Chips */}
      <div className="flex items-center gap-1.5 p-2 overflow-x-auto border-b border-white/5 no-scrollbar bg-slate-950">
        <button
          type="button"
          onClick={() => handleSend("Summarize key concepts, constraints, and architecture decisions.", "summarize")}
          disabled={isStreaming}
          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 whitespace-nowrap hover:text-white transition-colors"
        >
          ⚡ Summarize
        </button>
        <button
          type="button"
          onClick={() => handleSend("Extract formal Architecture Decision Record (ADR) including Context, Decision, and Consequences.", "adr")}
          disabled={isStreaming}
          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 whitespace-nowrap hover:text-white transition-colors"
        >
          📋 Extract ADR
        </button>
        <button
          type="button"
          onClick={() => handleSend("Generate a step-by-step production runbook with prerequisites and rollback steps.", "runbook")}
          disabled={isStreaming}
          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 whitespace-nowrap hover:text-white transition-colors"
        >
          🛠️ Runbook
        </button>
        <button
          type="button"
          onClick={() => handleSend("Identify any contradictions, security risks, or missing edge cases in this specification.", "contradictions")}
          disabled={isStreaming}
          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 whitespace-nowrap hover:text-white transition-colors"
        >
          🔍 Contradictions
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            <Sparkles size={24} className="mx-auto text-indigo-400/50 mb-2" />
            <p className="font-medium text-slate-400">Knowledge Workspace AI</p>
            <p className="text-[11px] mt-1 max-w-xs mx-auto text-slate-500">
              Ask questions strictly grounded in your active documents and sources. Every claim will be verified with citations.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-xl px-3.5 py-2.5 ${
                m.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-900 border border-white/5 text-slate-200"
              }`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              ) : (
                <div>
                  <MarkdownPreview value={m.content} />

                  {/* Citations Footer */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/5 space-y-1">
                      <span className="text-[10px] font-semibold uppercase text-slate-500 block">
                        Referenced Sources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {m.citations.map((c) => (
                          <button
                            key={c.citation_index}
                            type="button"
                            onClick={() => {
                              if (c.page_id) {
                                openTab({
                                  id: c.page_id,
                                  pageId: c.page_id,
                                  title: c.source_title,
                                  viewMode: "editor",
                                });
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono text-[10px]"
                            title={c.text_anchor || undefined}
                          >
                            <span className="font-bold text-emerald-400">[{c.citation_index}]</span>
                            <span className="truncate max-w-[120px]">{c.source_title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Copy Button */}
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => copyMessage(m.id, m.content)}
                      className="text-slate-500 hover:text-slate-300 p-1"
                      title="Copy response"
                    >
                      {copiedId === m.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-2 border-t border-white/5 bg-slate-900/60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask AI based on grounded workspace docs..."
            disabled={isStreaming}
            className="flex-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isStreaming}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
