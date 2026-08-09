import React, { useState } from 'react';
import { Bot, Send, Sparkles, User, Loader2 } from 'lucide-react';
import { sendChatMessage, type KnowledgeGraph } from '../utils/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  intent?: string;
  telemetry?: any;
  activatedPath?: string[];
}

interface ChatInterfaceProps {
  graphData?: KnowledgeGraph | null;
  rawText?: string;
  onActivatePath: (nodeIds: string[]) => void;
  onExtractText: (text?: string) => Promise<KnowledgeGraph | null>;
  isLoading: boolean;
  isDark: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  graphData,
  rawText,
  onActivatePath,
  onExtractText,
  isLoading,
  isDark,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am CortexGraph AI assistant. Ask me anything, chat casually, or explore your knowledge graph!',
      intent: 'CASUAL_CONVERSATION',
    },
  ]);
  const [isAnswering, setIsAnswering] = useState(false);

  const cardBg = isDark ? 'bg-[#0f1117]/90 border-slate-800' : 'bg-white/90 border-slate-200 shadow-sm';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-600';
  const textMain = isDark ? 'text-slate-100' : 'text-slate-800';
  const innerBox = isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200';

  const textDim = isDark ? 'text-slate-500' : 'text-slate-500';

  const inputBg = isDark
    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-cyan-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600 shadow-sm';



  const handleSend = async (text: string) => {
    if (!text.trim() || isAnswering) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsAnswering(true);

    try {
      const historyItems = messages.map((m) => ({ sender: m.sender, text: m.text }));
      const response = await sendChatMessage({
        query: text,
        history: historyItems,
        graph: graphData,
        context_text: rawText || sampleText,
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: response.answer,
        intent: response.intent,
        telemetry: response.telemetry,
        activatedPath: response.activated_nodes && response.activated_nodes.length > 0 ? response.activated_nodes : undefined,
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (response.activated_nodes && response.activated_nodes.length > 0) {
        onActivatePath(response.activated_nodes);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: err?.response?.data?.detail || err?.message || 'Sorry, an error occurred while processing your request.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <div className={`rounded-2xl border flex flex-col h-full min-h-0 overflow-hidden ${cardBg}`}>
      {/* CHAT HEADER */}
      <div className="p-4 border-b border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold tracking-wide uppercase text-slate-900 dark:text-slate-100">
              Cortical Assistant
            </h3>
            <span className={`text-[10px] block font-mono font-medium ${textDim}`}>
              Gemini Graph RAG Reasoning Engine
            </span>
          </div>
        </div>
      </div>

      {/* CHAT MESSAGES FEED */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 text-xs">

        {/* CONVERSATION FEED */}
        <div className="space-y-3 pt-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-6 h-6 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={12} />
                </div>
              )}

              <div
                className={`p-3 rounded-2xl border leading-relaxed max-w-[85%] font-medium ${
                  msg.sender === 'user'
                    ? 'bg-cyan-600 text-white border-cyan-500 shadow-md rounded-tr-none font-semibold'
                    : `${innerBox} rounded-tl-none`
                }`}
              >
                {msg.sender === 'ai' && (msg.intent || msg.telemetry) && (
                  <div className="mb-1.5 flex items-center justify-between gap-1 flex-wrap text-[9px] font-mono">
                    {msg.intent && (
                      <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                        msg.intent === 'CASUAL_CONVERSATION' ? 'bg-purple-500/20 text-purple-400' :
                        msg.intent === 'GENERAL_KNOWLEDGE' ? 'bg-cyan-500/20 text-cyan-400' :
                        msg.intent === 'HYBRID_QUERY' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {msg.intent === 'CASUAL_CONVERSATION' ? '💬 Casual Chat' :
                         msg.intent === 'GENERAL_KNOWLEDGE' ? '🌐 General Knowledge' :
                         msg.intent === 'HYBRID_QUERY' ? '⚡ Hybrid RAG' :
                         '🧠 Knowledge Base'}
                      </span>
                    )}
                    {msg.telemetry && (
                      <span style={{ color: 'var(--text-dim)' }}>
                        ⚡ {msg.telemetry.total_request_ms}ms
                      </span>
                    )}
                  </div>
                )}
                <p>{msg.text}</p>
              </div>

              {msg.sender === 'user' && (
                <div className="w-6 h-6 rounded-lg bg-cyan-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                  <User size={12} />
                </div>
              )}
            </div>
          ))}

          {isAnswering && (
            <div className="flex gap-2 justify-start items-center text-xs text-cyan-500 font-mono py-1">
              <Bot size={14} className="animate-spin text-purple-500" />
              <span>Synthesizing answer from document & graph...</span>
            </div>
          )}
        </div>
      </div>

      {/* CHAT INPUT AREA */}
      <div className="p-3 border-t border-slate-200/40 dark:border-slate-800/40 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(inputQuery);
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isAnswering}
            placeholder="Ask questions about your PDF document..."
            className={`w-full text-xs rounded-xl pr-10 py-2.5 px-3 border transition-all font-medium ${inputBg}`}
          />
          <button
            type="submit"
            disabled={isLoading || isAnswering || !inputQuery.trim()}
            className="absolute right-1.5 p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-md shadow-cyan-600/30 disabled:opacity-40"
          >
            {isAnswering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
};

