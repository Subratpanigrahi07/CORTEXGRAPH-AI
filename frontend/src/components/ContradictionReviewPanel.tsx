import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, X, RefreshCw, FileText, ArrowRight } from 'lucide-react';
import { getContradictions, resolveContradiction, type Contradiction } from '../utils/api';

interface ContradictionReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

export function ContradictionReviewPanel({ isOpen, onClose, isDark }: ContradictionReviewPanelProps) {
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchContradictions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getContradictions();
      setContradictions(data.contradictions);
    } catch {
      console.warn('Failed to fetch contradictions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchContradictions();
  }, [isOpen, fetchContradictions]);

  const handleResolve = async (id: string, resolution: 'kept_a' | 'kept_b' | 'kept_both') => {
    setResolving(id);
    try {
      await resolveContradiction(id, resolution);
      setContradictions(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Resolution failed:', err);
    } finally {
      setResolving(null);
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
          className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            maxHeight: '85vh',
          }}
          id="contradiction-review-panel"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Knowledge Conflict Review
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {contradictions.length} open contradiction{contradictions.length !== 1 ? 's' : ''} detected
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchContradictions}
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
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading && contradictions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : contradictions.length === 0 ? (
              <div className="text-center py-12">
                <Check className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No open contradictions
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Your knowledge graph is consistent across all sources
                </p>
              </div>
            ) : (
              contradictions.map((c) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="rounded-xl border overflow-hidden"
                  style={{ background: 'var(--bg-overlay)', borderColor: 'rgba(239,68,68,0.2)' }}
                >
                  {/* Classification badge */}
                  <div
                    className="px-4 py-2 flex items-center justify-between"
                    style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.1)' }}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-400">
                        {c.classification || 'TRUE CONTRADICTION'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                      {c.relationship_type}
                    </span>
                  </div>

                  {/* Source excerpts side by side */}
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {/* Source A */}
                      <div className="rounded-lg p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <FileText className="w-3 h-3" style={{ color: 'var(--accent-purple)' }} />
                          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                            Source A
                          </span>
                        </div>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                          {c.entity_a_name}
                        </p>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {c.source_span_a || 'No source excerpt available'}
                        </p>
                        <p className="text-[9px] font-mono mt-2" style={{ color: 'var(--text-dim)' }}>
                          📄 {c.source_doc_a}
                        </p>
                      </div>

                      {/* Source B */}
                      <div className="rounded-lg p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <FileText className="w-3 h-3" style={{ color: 'var(--accent-cyan)' }} />
                          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                            Source B
                          </span>
                        </div>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                          {c.entity_b_name}
                        </p>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {c.source_span_b || 'No source excerpt available'}
                        </p>
                        <p className="text-[9px] font-mono mt-2" style={{ color: 'var(--text-dim)' }}>
                          📄 {c.source_doc_b}
                        </p>
                      </div>
                    </div>

                    {/* Resolution actions */}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleResolve(c.id, 'kept_a')}
                        disabled={resolving === c.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-[1.02]"
                        style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.2)', color: 'var(--accent-purple)' }}
                      >
                        Keep A
                      </button>
                      <button
                        onClick={() => handleResolve(c.id, 'kept_b')}
                        disabled={resolving === c.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-[1.02]"
                        style={{ background: 'var(--accent-cyan-dim)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}
                      >
                        Keep B
                      </button>
                      <button
                        onClick={() => handleResolve(c.id, 'kept_both')}
                        disabled={resolving === c.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:scale-[1.02]"
                        style={{ background: '#10b981', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}
                      >
                        {resolving === c.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Keep Both
                      </button>
                    </div>
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
