import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitMerge, Check, X, RefreshCw, ChevronDown, Sparkles } from 'lucide-react';
import { getMergeSuggestions, approveMerge, rejectMerge, type MergeSuggestion } from '../utils/api';

interface MergeSuggestionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

export function MergeSuggestionsPanel({ isOpen, onClose, isDark }: MergeSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMergeSuggestions();
      setSuggestions(data.suggestions);
    } catch {
      console.warn('Failed to fetch merge suggestions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchSuggestions();
  }, [isOpen, fetchSuggestions]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await approveMerge(id);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Merge approval failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await rejectMerge(id);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Merge rejection failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ background: 'rgba(13,14,18,0.8)', backdropFilter: 'blur(10px)' }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            maxHeight: '80vh',
          }}
          id="merge-suggestions-panel"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' }}
              >
                <GitMerge className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Entity Merge Suggestions
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {suggestions.length} pending duplicate candidates for review
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchSuggestions}
                disabled={loading}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--accent-emerald)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No pending merge suggestions
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Upload more documents to discover potential entity duplicates
                </p>
              </div>
            ) : (
              suggestions.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="rounded-xl border p-4"
                  style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}
                >
                  {/* Side-by-side comparison */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Candidate */}
                    <div className="flex-1 rounded-lg p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <p className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>Candidate</p>
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{s.candidate_name}</p>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
                        {s.candidate_type}
                      </span>
                    </div>

                    {/* Arrow */}
                    <div className="flex-shrink-0">
                      <GitMerge className="w-5 h-5" style={{ color: 'var(--accent-cyan)' }} />
                    </div>

                    {/* Canonical */}
                    <div className="flex-1 rounded-lg p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <p className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>Canonical</p>
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{s.canonical_name}</p>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ background: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)' }}>
                        EXISTING
                      </span>
                    </div>
                  </div>

                  {/* Similarity scores */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <ScoreBar label="Combined" value={s.similarity_score} color="#6c5ce7" />
                    <ScoreBar label="String" value={s.string_similarity} color="#22d3ee" />
                    <ScoreBar label="Embedding" value={s.embedding_similarity} color="#10b981" />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleReject(s.id)}
                      disabled={actionLoading === s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02]"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                    <button
                      onClick={() => handleApprove(s.id)}
                      disabled={actionLoading === s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:scale-[1.02]"
                      style={{ background: '#10b981', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}
                    >
                      {actionLoading === s.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Approve Merge
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono uppercase" style={{ color: 'var(--text-dim)' }}>{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
