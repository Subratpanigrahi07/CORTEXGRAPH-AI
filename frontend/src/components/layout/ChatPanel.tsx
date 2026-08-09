import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Sparkles, User, Loader2, X } from 'lucide-react';
import { sendChatMessage, type KnowledgeGraph } from '../../utils/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  intent?: string;
  telemetry?: any;
  activatedPath?: string[];
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  graphData?: KnowledgeGraph | null;
  rawText?: string;
  onActivatePath: (nodeIds: string[]) => void;
  onExtractText: (text?: string) => Promise<KnowledgeGraph | null>;
  isLoading: boolean;
  isDark?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  graphData,
  rawText,
  onActivatePath,
  onExtractText,
  isLoading,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'ai',
      text: 'Greetings! Ask me any question based on your uploaded document context or Knowledge Graph entities.',
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAnswering]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isAnswering) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsAnswering(true);

    let activeGraph = graphData;
    if (!activeGraph && rawText) {
      activeGraph = await onExtractText(rawText);
    }

    try {
      const historyItems = messages.map((m) => ({ sender: m.sender, text: m.text }));
      const response = await sendChatMessage({
        query: text,
        history: historyItems,
        graph: graphData,
        context_text: rawText,
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: response.answer,
        activatedPath:
          response.activated_nodes && response.activated_nodes.length > 0
            ? response.activated_nodes
            : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (response.activated_nodes && response.activated_nodes.length > 0) {
        onActivatePath(response.activated_nodes);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: err?.response?.data?.detail || err?.message || 'An error occurred while processing your request.',
        },
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(13,14,18,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Chat Panel — slides up from bottom-right */}
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{
              width: 420,
              height: 580,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px var(--border-subtle)',
            }}
            id="chat-panel"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.25)' }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-purple)' }} />
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    Cortical Assistant
                  </p>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    Gemini Graph RAG Engine
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                  id="chat-close-btn"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages feed */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.2)' }}
                    >
                      <Bot className="w-3 h-3" style={{ color: 'var(--accent-purple)' }} />
                    </div>
                  )}

                  <div
                    className="p-3 rounded-2xl text-xs leading-relaxed max-w-[85%]"
                    style={
                      msg.sender === 'user'
                        ? {
                            background: 'var(--accent-purple)',
                            color: '#fff',
                            borderTopRightRadius: 4,
                          }
                        : {
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            borderTopLeftRadius: 4,
                          }
                    }
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
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'var(--accent-purple)' }}
                    >
                      <User className="w-3 h-3 text-white" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isAnswering && (
                <div className="flex gap-2 items-center" style={{ color: 'var(--accent-purple)' }}>
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.2)' }}
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </div>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    Synthesizing from graph & document…
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="px-3 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(inputQuery); }}
                className="relative flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  disabled={isAnswering}
                  placeholder="Ask about your document or graph…"
                  className="flex-1 text-xs rounded-xl px-3 py-2.5 pr-10 outline-none transition-all"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  id="chat-input"
                />
                <button
                  type="submit"
                  disabled={isLoading || isAnswering || !inputQuery.trim()}
                  className="absolute right-1.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
                  style={{ background: 'var(--accent-purple)', color: '#fff' }}
                  id="chat-send-btn"
                >
                  {isAnswering ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
