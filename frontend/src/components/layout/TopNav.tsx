import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network, ChevronRight, Sun, Moon, FileText, User, Bell, Settings, X
} from 'lucide-react';
import { useCursorProximity, GoogleAiSparkleIcon } from '../../utils/useCursorProximity';
import type { Entity } from '../../utils/api';

interface TopNavProps {
  isDark: boolean;
  onToggleTheme: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenIngest: () => void;
  selectedNodeName?: string | null;
  isEngineOnline: boolean;
  entities: Entity[];
  onSelectEntity: (entity: Entity) => void;
  onOpenGraph: () => void;
  onOpenSettings: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  isDark,
  onToggleTheme,
  onOpenIngest,
  selectedNodeName,
  isEngineOnline,
  entities,
  onSelectEntity,
  onOpenGraph,
  onOpenSettings,
}) => {
  const { ref: searchRef, bindHandlers } = useCursorProximity<HTMLDivElement>(220);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const filteredEntities = (entities || []).filter(
    (e) =>
      !query ||
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.type.toLowerCase().includes(query.toLowerCase()) ||
      e.id.toLowerCase().includes(query.toLowerCase())
  );

  const actions = [
    {
      kind: 'action' as const,
      label: 'Open Knowledge Graph Canvas',
      description: 'View the full interactive 2D graph canvas',
      icon: Network,
      action: () => {
        onOpenGraph?.();
      }
    },
    {
      kind: 'action' as const,
      label: 'Open Settings',
      description: 'Configure active LLM model, speed, and status',
      icon: Settings,
      action: () => {
        onOpenSettings?.();
      }
    },
    {
      kind: 'action' as const,
      label: 'Ingest Document',
      description: 'Upload a new document to extract entities',
      icon: FileText,
      action: () => {
        onOpenIngest?.();
      }
    }
  ];

  const filteredActions = actions.filter(
    (a) =>
      !query ||
      a.label.toLowerCase().includes(query.toLowerCase()) ||
      a.description.toLowerCase().includes(query.toLowerCase())
  );

  type ResultItem =
    | { kind: 'entity'; entity: Entity }
    | { kind: 'action'; label: string; description: string; icon: React.ElementType; action: () => void };

  const results: ResultItem[] = [
    ...filteredEntities.slice(0, 5).map((e): ResultItem => ({ kind: 'entity', entity: e })),
    ...filteredActions,
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
      if (active) {
        if (active.kind === 'entity') {
          onSelectEntity(active.entity);
        } else {
          active.action();
        }
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
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
    <header
      className="flex-shrink-0 flex items-center justify-between px-4 z-50"
      style={{
        height: 'var(--topnav-height)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* LEFT — Logo + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Logo mark */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6c5ce7 0%, #22d3ee 100%)' }}
          >
            <Network className="w-4 h-4 text-white" />
          </div>
          <span
            className="text-sm font-bold tracking-tight hidden sm:block"
            style={{ color: 'var(--text-primary)' }}
          >
            CortexGraph
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold hidden sm:block"
            style={{
              background: 'var(--accent-purple-dim)',
              color: 'var(--accent-purple)',
              border: '1px solid rgba(108,92,231,0.25)',
            }}
          >
            AI
          </span>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs overflow-hidden">
          <span style={{ color: 'var(--text-muted)' }} className="hidden md:block">Workspace</span>
          <ChevronRight className="w-3 h-3 flex-shrink-0 hidden md:block" style={{ color: 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-muted)' }} className="hidden md:block">Knowledge Graph</span>
          {selectedNodeName && (
            <>
              <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
              <motion.span
                key={selectedNodeName}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="truncate max-w-[120px] font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {selectedNodeName}
              </motion.span>
            </>
          )}
        </div>
      </div>

      {/* CENTER — Inline Search Box (Google AI Mode Search Bar) */}
      <div
        ref={searchRef}
        {...bindHandlers}
        className="google-ai-search-wrapper hidden sm:block flex-1 max-w-sm mx-4 relative"
      >
        <div className="google-ai-ambient-glow" />
        <div className="google-ai-border-glow" />
        <div
          className="google-ai-inner-pill w-full flex items-center gap-2.5 px-3.5 py-1.5 cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          <GoogleAiSparkleIcon size={16} className="flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            id="topnav-search-input"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
              setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              bindHandlers.onFocus();
            }}
            onBlur={() => {
              bindHandlers.onBlur();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes, graphs, settings…"
            className="flex-1 bg-transparent text-xs outline-none font-medium"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded-full hover:bg-[var(--bg-overlay)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-mono flex-shrink-0 font-semibold"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            ⌘K
          </span>
        </div>

        {/* Dropdown Results */}
        <AnimatePresence>
          {isOpen && results.length > 0 && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-[calc(100%+8px)] left-0 right-0 z-50 rounded-xl border shadow-2xl max-h-80 overflow-y-auto"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'var(--border-default)',
              }}
            >
              <div className="py-1">
                {results.map((item, i) => {
                  const isActive = activeIdx === i;
                  if (item.kind === 'entity') {
                    const entity = item.entity;
                    return (
                      <button
                        key={entity.id}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEntity(entity);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all text-left"
                        style={{
                          background: isActive ? 'var(--accent-purple-dim)' : 'transparent',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: getTypeDotColor(entity.type) }}
                        />
                        <span className="flex-1 font-medium truncate">{entity.name}</span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                          style={{ background: 'var(--bg-overlay)', color: 'var(--text-dim)' }}
                        >
                          {entity.type}
                        </span>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />}
                      </button>
                    );
                  } else {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={(e) => {
                          e.stopPropagation();
                          item.action();
                          setIsOpen(false);
                          setQuery('');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all text-left"
                        style={{
                          background: isActive ? 'var(--accent-purple-dim)' : 'transparent',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold block truncate">{item.label}</span>
                          <span className="text-[9px] block truncate" style={{ color: 'var(--text-muted)' }}>
                            {item.description}
                          </span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />}
                      </button>
                    );
                  }
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT — Status + Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Engine status */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold"
          style={{
            background: isEngineOnline ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${isEngineOnline ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
            color: isEngineOnline ? 'var(--accent-emerald)' : '#ef4444',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              background: isEngineOnline ? 'var(--accent-emerald)' : '#ef4444',
              animation: isEngineOnline ? 'pulse-ring 2s ease-out infinite' : 'none',
            }}
          />
          {isEngineOnline ? 'Engine Online' : 'Offline'}
        </div>

        {/* Ingest button */}
        <motion.button
          onClick={onOpenIngest}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: 'var(--accent-purple)',
            color: '#ffffff',
            boxShadow: '0 0 0 0 transparent',
          }}
          id="ingest-doc-btn"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ingest</span>
        </motion.button>

        {/* Notifications placeholder */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
          title="Notifications"
        >
          <Bell className="w-3.5 h-3.5" />
        </button>

        {/* Theme toggle */}
        <motion.button
          onClick={onToggleTheme}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          title="Toggle Theme"
          id="theme-toggle-btn"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </motion.button>

        {/* User avatar */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #6c5ce7, #22d3ee)',
            color: '#fff',
          }}
          title="User Profile"
        >
          <User className="w-3.5 h-3.5" />
        </div>
      </div>
    </header>
  );
};
