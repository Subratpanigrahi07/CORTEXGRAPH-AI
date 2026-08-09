import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import type { Entity } from '../../utils/api';
import { useCursorProximity, GoogleAiSparkleIcon } from '../../utils/useCursorProximity';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  entities: Entity[];
  onSelectEntity: (entity: Entity) => void;
  isDark?: boolean;
}

type ResultItem =
  | { kind: 'entity'; entity: Entity }
  | { kind: 'action'; label: string; description: string; icon: React.ElementType; action: () => void };

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  entities,
  onSelectEntity,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref: paletteRef, bindHandlers } = useCursorProximity<HTMLDivElement>(260);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setActiveIdx(0);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Filter entities
  const filteredEntities = entities.filter(
    (e) =>
      !query ||
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.type.toLowerCase().includes(query.toLowerCase()) ||
      e.id.toLowerCase().includes(query.toLowerCase())
  );

  const results: ResultItem[] = [
    ...filteredEntities.slice(0, 8).map((e): ResultItem => ({ kind: 'entity', entity: e })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = results[activeIdx];
      if (active?.kind === 'entity') {
        onSelectEntity(active.entity);
        onClose();
      } else if (active?.kind === 'action') {
        active.action();
        onClose();
      }
    }
  };

  function getTypeDotColor(type: string): string {
    const t = type.toLowerCase();
    if (t.includes('person') || t.includes('user')) return '#38bdf8';
    if (t.includes('tech') || t.includes('framework') || t.includes('api')) return '#c084fc';
    if (t.includes('database') || t.includes('store')) return '#34d399';
    if (t.includes('project') || t.includes('product')) return '#f472b6';
    if (t.includes('company') || t.includes('org')) return '#fbbf24';
    return '#94a3b8';
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 cmd-backdrop"
            onClick={onClose}
          />

          {/* Palette (Google AI Mode Search Container) */}
          <motion.div
            ref={paletteRef}
            {...bindHandlers}
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="google-ai-search-wrapper fixed left-1/2 top-[15%] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl shadow-2xl"
            id="command-palette"
          >
            <div className="google-ai-ambient-glow" style={{ borderRadius: 18 }} />
            <div className="google-ai-border-glow" style={{ borderRadius: 18 }} />

            <div className="google-ai-inner-pill overflow-hidden rounded-2xl">
              {/* Search Input Header */}
              <div
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <GoogleAiSparkleIcon size={20} className="flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                  onKeyDown={handleKeyDown}
                  onFocus={bindHandlers.onFocus}
                  onBlur={bindHandlers.onBlur}
                  placeholder="Search nodes, graphs, settings…"
                  className="flex-1 bg-transparent text-sm outline-none font-medium"
                  style={{ color: 'var(--text-primary)' }}
                  id="cmd-palette-input"
                />
                <button
                  onClick={onClose}
                  className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-colors"
                  style={{ background: 'var(--bg-overlay)', color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto py-1">
                {results.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No results for "{query}"</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Try a node name, type, or ID</p>
                  </div>
                ) : (
                  <>
                    {filteredEntities.length > 0 && (
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-[10px] font-semibold uppercase tracking-widest px-1" style={{ color: 'var(--text-dim)' }}>
                          Graph Nodes
                        </p>
                      </div>
                    )}
                    {filteredEntities.slice(0, 8).map((entity, i) => {
                      const isActive = activeIdx === i;
                      return (
                        <button
                          key={entity.id}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => { onSelectEntity(entity); onClose(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left"
                          style={{
                            background: isActive ? 'var(--accent-purple-dim)' : 'transparent',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: getTypeDotColor(entity.type) }}
                          />
                          <span className="flex-1 font-medium truncate">{entity.name}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                            style={{ background: 'var(--bg-overlay)', color: 'var(--text-dim)' }}
                          >
                            {entity.type}
                          </span>
                          {isActive && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Footer hint */}
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
              >
                <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 rounded" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace' }}>↑↓</kbd> navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 rounded" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace' }}>↵</kbd> select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 rounded" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace' }}>Esc</kbd> close
                  </span>
                </div>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                  {filteredEntities.length} nodes
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
