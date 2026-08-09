import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, Loader2, User, Mic, Plus,
  Network, GitBranch, Zap, Search, BookOpen
} from 'lucide-react';
import { sendChatMessage, type KnowledgeGraph } from '../../utils/api';
import { useCursorProximity, GoogleAiSparkleIcon } from '../../utils/useCursorProximity';
import { OnlineAudioRecorder, type VoiceState } from '../../utils/onlineAudioRecorder';
import { HeroKnowledgeGraphCanvas } from '../studio/HeroKnowledgeGraphCanvas';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  activatedPath?: string[];
}

interface CortexStudioProps {
  graphData?: KnowledgeGraph | null;
  rawText?: string;
  onActivatePath: (nodeIds: string[]) => void;
  onExtractText: (text?: string) => Promise<KnowledgeGraph | null>;
  isLoading: boolean;
  onOpenIngest: () => void;
  onOpenGraph: () => void;
  isDark?: boolean;
}

const SUGGESTIONS = [
  { icon: GitBranch, label: 'Find entity connections', query: 'What are the key connections in my knowledge graph?' },
  { icon: Search, label: 'Summarize entities', query: 'Summarize all the entities extracted from the document.' },
  { icon: Zap, label: 'Trace reasoning paths', query: 'What are the most important relationships in the graph?' },
  { icon: BookOpen, label: 'Explain the graph', query: 'Explain the knowledge graph structure and its key insights.' },
  { icon: Network, label: 'Explore node clusters', query: 'Which entities are most densely connected?' },
];

export const CortexStudio: React.FC<CortexStudioProps> = ({
  graphData,
  rawText,
  onActivatePath,
  onExtractText,
  isLoading: _isLoading,
  onOpenIngest,
  onOpenGraph,
  isDark = true,
}) => {
  const [query, setQuery] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { ref: searchWrapperRef, bindHandlers } = useCursorProximity<HTMLDivElement>(240);
  const hasMessages = messages.length > 0;

  // Online AI Voice Assistant STT State
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const recorderRef = useRef<OnlineAudioRecorder | null>(null);

  useEffect(() => {
    recorderRef.current = new OnlineAudioRecorder({
      onStateChange: (state, msg) => {
        setVoiceState(state);
        if (msg) setVoiceMessage(msg);
        if (state === 'idle' || state === 'done') {
          setTimeout(() => setVoiceState('idle'), 2500);
        }
      },
      onTranscription: (text, engine) => {
        setQuery(text);
        setVoiceMessage(`Transcribed via ${engine}`);
        setTimeout(() => setVoiceMessage(null), 4000);
      },
      onError: (errMsg) => {
        setVoiceMessage(errMsg);
        setTimeout(() => setVoiceMessage(null), 5000);
      },
    });

    return () => {
      recorderRef.current?.cancelRecording();
    };
  }, []);

  const toggleListening = () => {
    if (voiceState === 'listening') {
      recorderRef.current?.stopRecording();
    } else if (voiceState === 'idle' || voiceState === 'error' || voiceState === 'done') {
      recorderRef.current?.startRecording();
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAnswering]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [query]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isAnswering) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setIsAnswering(true);

    let activeGraph = graphData;
    if (!activeGraph && rawText) activeGraph = await onExtractText(rawText);

    try {
      const response = await sendChatMessage({ query: text, graph: activeGraph, context_text: rawText });
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: response.answer,
        activatedPath: response.activated_nodes?.length > 0 ? response.activated_nodes : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (response.activated_nodes?.length > 0) onActivatePath(response.activated_nodes);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: err?.response?.data?.detail || err?.message || 'An error occurred.',
        },
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(query);
    }
  };

  const handleHeroNodeClick = useCallback((label: string) => {
    setQuery(`Tell me about ${label}`);
  }, []);

  return (
    <div
      className="flex flex-col h-full w-full relative overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* ── Ambient background glow ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(108,92,231,0.12) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(108,92,231,0.06) 0%, transparent 70%)',
        }}
      />
      <div className={`${isDark ? 'dot-grid-dark' : 'dot-grid-light'} absolute inset-0 pointer-events-none opacity-60`} />

      {/* ── Messages feed (only visible after first message) ── */}
      <AnimatePresence>
        {hasMessages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-6 relative z-10"
          >
            <div className="max-w-2xl mx-auto space-y-6 pb-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: 'linear-gradient(135deg, #6c5ce7, #22d3ee)',
                      }}
                    >
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className="rounded-2xl text-sm leading-relaxed max-w-[80%] px-4 py-3"
                    style={
                      msg.sender === 'user'
                        ? {
                            background: isDark ? 'rgba(108,92,231,0.18)' : 'rgba(108,92,231,0.08)',
                            border: isDark ? '1px solid rgba(108,92,231,0.3)' : '1px solid rgba(108,92,231,0.18)',
                            color: 'var(--text-primary)',
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
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.activatedPath && msg.activatedPath.length > 0 && (
                      <div
                        className="mt-3 pt-2.5 text-[11px] font-mono flex items-center gap-1.5 flex-wrap"
                        style={{
                          borderTop: '1px solid rgba(108,92,231,0.2)',
                          color: 'var(--accent-purple)',
                        }}
                      >
                        <Zap className="w-3 h-3 flex-shrink-0" />
                        <span>Activated path: {msg.activatedPath.join(' → ')}</span>
                      </div>
                    )}
                  </div>
                  {msg.sender === 'user' && (
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
                    >
                      <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                </motion.div>
              ))}

              {isAnswering && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 justify-start"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6c5ce7, #22d3ee)' }}
                  >
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </div>
                  <div
                    className="px-4 py-3 rounded-2xl text-sm"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      borderTopLeftRadius: 4,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span>Synthesizing from graph &amp; document</span>
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full inline-block"
                            style={{ background: 'var(--accent-purple)' }}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero section (only shown when no messages) ── */}
      <AnimatePresence>
        {!hasMessages && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 pb-8 overflow-hidden min-h-[380px]"
          >
            {/* Interactive 60 FPS Knowledge Graph Canvas Background */}
            <HeroKnowledgeGraphCanvas onNodeClick={handleHeroNodeClick} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input area (fixed at bottom) ── */}
      <div className="relative z-10 px-4 pb-6 pt-2 flex-shrink-0">
        <div className="max-w-2xl mx-auto">

          {/* Google AI Mode Search Input Box */}
          <div
            ref={searchWrapperRef}
            {...bindHandlers}
            className="google-ai-search-wrapper relative"
            style={{ borderRadius: 24 }}
          >
            {/* Voice Error/Status Banner */}
            <AnimatePresence>
              {voiceMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute -top-12 left-0 right-0 mx-auto w-max max-w-full px-4 py-2 rounded-xl text-xs font-semibold shadow-xl border flex items-center gap-2 backdrop-blur-md z-30"
                  style={{
                    background: voiceState === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(108, 92, 231, 0.15)',
                    borderColor: voiceState === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(108, 92, 231, 0.35)',
                    color: voiceState === 'error' ? '#fca5a5' : '#c084fc',
                  }}
                >
                  <span>{voiceState === 'error' ? '⚠️' : '🎙️'}</span>
                  <span>{voiceMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ambient & Border Glowing Shimmer */}
            <div className="google-ai-ambient-glow" style={{ borderRadius: 26 }} />
            <div className="google-ai-border-glow" style={{ borderRadius: 25 }} />

            {/* Inner Content Box */}
            <div className="google-ai-inner-pill relative px-4 pt-3.5 pb-3 rounded-2xl">
              <div className="flex items-start gap-2.5">
                <GoogleAiSparkleIcon size={20} className="flex-shrink-0 mt-1" />
                {voiceState === 'listening' ? (
                  <div className="flex-1 flex items-center justify-between min-h-[28px] px-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-semibold animate-pulse" style={{ color: 'var(--text-secondary)' }}>
                        Listening... Speak into microphone
                      </span>
                    </div>
                    {/* Animated Soundwave Visualizer */}
                    <div className="flex items-center gap-1 h-6">
                      <span className="w-1 h-3 rounded-full bg-blue-500 soundwave-bar" style={{ animationDelay: '0.15s' }} />
                      <span className="w-1 h-5 rounded-full bg-red-500 soundwave-bar" style={{ animationDelay: '0.45s' }} />
                      <span className="w-1 h-4 rounded-full bg-yellow-500 soundwave-bar" style={{ animationDelay: '0.3s' }} />
                      <span className="w-1 h-5 rounded-full bg-green-500 soundwave-bar" style={{ animationDelay: '0.6s' }} />
                      <span className="w-1 h-3 rounded-full bg-purple-500 soundwave-bar" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                ) : voiceState === 'processing' || voiceState === 'transcribing' ? (
                  <div className="flex-1 flex items-center gap-2 min-h-[28px] px-1">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {voiceState === 'processing' ? 'Uploading audio...' : 'Transcribing speech with online API...'}
                    </span>
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={bindHandlers.onFocus}
                    onBlur={bindHandlers.onBlur}
                    disabled={isAnswering}
                    placeholder="Ask about your document, entities, or graph connections…"
                    rows={1}
                    className="w-full bg-transparent text-sm leading-relaxed resize-none outline-none font-medium"
                    style={{
                      color: 'var(--text-primary)',
                      minHeight: '28px',
                      maxHeight: '160px',
                    }}
                    id="cortex-studio-input"
                  />
                )}
              </div>

              {/* Toolbar row */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  {/* Attach / Plus */}
                  <button
                    onClick={onOpenIngest}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 text-slate-500"
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                    title="Ingest Document"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {/* Mic */}
                  <button
                    onClick={toggleListening}
                    disabled={voiceState === 'processing' || voiceState === 'transcribing'}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      background: voiceState === 'listening' ? '#ef4444' : 'var(--bg-overlay)',
                      border: voiceState === 'listening' ? '1px solid #ef4444' : '1px solid var(--border-subtle)',
                      color: voiceState === 'listening' ? '#ffffff' : 'var(--text-muted)',
                    }}
                    title={
                      voiceState === 'listening'
                        ? 'Stop Recording'
                        : voiceState === 'processing' || voiceState === 'transcribing'
                        ? 'Transcribing Speech...'
                        : 'Record Voice Input'
                    }
                  >
                    {voiceState === 'processing' || voiceState === 'transcribing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    ) : (
                      <Mic className={`w-3.5 h-3.5 ${voiceState === 'listening' ? 'animate-pulse' : ''}`} />
                    )}
                  </button>
                  {/* View Graph */}
                  <button
                    onClick={onOpenGraph}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium transition-all hover:scale-105"
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                    title="View Knowledge Graph"
                  >
                    <Network className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View Graph</span>
                  </button>
                </div>

                {/* Send action */}
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSend(query)}
                    disabled={isAnswering || !query.trim()}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
                    style={{ background: 'var(--accent-purple)', color: '#fff' }}
                    id="studio-send-btn"
                  >
                    {isAnswering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Suggestion chips ── */}
          <AnimatePresence>
            {!hasMessages && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-2 mt-4 flex-wrap justify-center"
              >
                {SUGGESTIONS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleSend(s.query)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: 'var(--bg-overlay)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />
                      {s.label}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
