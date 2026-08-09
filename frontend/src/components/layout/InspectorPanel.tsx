import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Tabs from '@radix-ui/react-tabs';
import {
  X, Layers, Tag, Activity, FileCode2, Brain, Terminal,
  Copy, GitBranch, Zap, Hash
} from 'lucide-react';
import type { Entity, Relationship } from '../../utils/api';

interface InspectorPanelProps {
  entity: Entity | null;
  relationships: Relationship[];
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
  activatedPath?: string[];
}

function getTypeBadgeClass(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('person') || t.includes('user')) return 'badge-person';
  if (t.includes('tech') || t.includes('framework') || t.includes('api')) return 'badge-tech';
  if (t.includes('database') || t.includes('store')) return 'badge-database';
  if (t.includes('project') || t.includes('product')) return 'badge-project';
  if (t.includes('company') || t.includes('org')) return 'badge-company';
  return 'badge-default';
}

function buildCypherQuery(entity: Entity, rels: Relationship[]): string {
  const matchLine = `MATCH (n {id: "${entity.id}"})`;
  const relLines = rels.map((r) =>
    r.source === entity.id
      ? `MATCH (n)-[:${r.type}]->(m {id: "${r.target}"})`
      : `MATCH (m {id: "${r.source}"})-[:${r.type}]->(n)`
  );
  return [matchLine, ...relLines.slice(0, 3), 'RETURN n, m'].join('\n');
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'schema', label: 'Schema', icon: FileCode2 },
  { id: 'ai', label: 'AI Intel', icon: Brain },
  { id: 'logs', label: 'Logs', icon: Terminal },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  entity,
  relationships,
  isOpen,
  onClose,
  activatedPath,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [copied, setCopied] = useState(false);

  const connectedRels = entity
    ? relationships.filter((r) => r.source === entity.id || r.target === entity.id)
    : [];

  const cypherQuery = entity ? buildCypherQuery(entity, connectedRels) : '';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && entity && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex-shrink-0 flex flex-col h-full overflow-hidden"
          style={{
            width: 'var(--inspector-width)',
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border-subtle)',
          }}
          id="inspector-panel"
        >
          {/* ── Header ── */}
          <div
            className="flex items-start justify-between p-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-semibold uppercase ${getTypeBadgeClass(entity.type)}`}
                >
                  {entity.type}
                </span>
              </div>
              <h2
                className="text-sm font-bold leading-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {entity.name}
              </h2>
              <p
                className="text-[11px] font-mono mt-0.5 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {entity.id}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
              id="inspector-close-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Stats Bar ── */}
          <div
            className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
          >
            <div className="flex items-center gap-1.5 text-[11px]">
              <GitBranch className="w-3 h-3" style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>{connectedRels.length} connections</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Tag className="w-3 h-3" style={{ color: 'var(--accent-purple)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>{entity.properties.length} props</span>
            </div>
          </div>

          {/* ── Tabs ── */}
          <Tabs.Root
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {/* Tab list */}
            <Tabs.List
              className="flex-shrink-0 flex px-4 gap-1"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Tabs.Trigger
                    key={tab.id}
                    value={tab.id}
                    className="inspector-tab flex items-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-all cursor-pointer"
                    style={{ background: 'transparent', border: 'none', outline: 'none' }}
                  >
                    <Icon className="w-3 h-3" />
                    {tab.label}
                  </Tabs.Trigger>
                );
              })}
            </Tabs.List>

            {/* ── OVERVIEW TAB ── */}
            <Tabs.Content
              value="overview"
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {/* Properties */}
              <section>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <Tag className="w-3 h-3" /> Extracted Properties
                </p>
                {entity.properties.length > 0 ? (
                  <div className="space-y-1.5">
                    {entity.properties.map((p, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                      >
                        <p className="text-[10px] font-mono font-semibold uppercase mb-1" style={{ color: 'var(--accent-cyan)' }}>
                          {p.key}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {p.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-dim)' }}>
                    No additional metadata attached.
                  </p>
                )}
              </section>

              {/* Neural Pathways */}
              <section>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <Activity className="w-3 h-3" /> Neural Pathways
                </p>
                {connectedRels.length > 0 ? (
                  <div className="space-y-1.5">
                    {connectedRels.map((r, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg flex items-center gap-1.5 flex-wrap text-xs"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                      >
                        <span className="font-mono text-[10px] truncate max-w-[80px]" style={{ color: 'var(--text-secondary)' }}>
                          {r.source}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
                          style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)', border: '1px solid rgba(108,92,231,0.2)' }}
                        >
                          {r.type}
                        </span>
                        <span className="font-mono text-[10px] truncate max-w-[80px]" style={{ color: 'var(--accent-cyan)' }}>
                          {r.target}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-dim)' }}>
                    No active edge connections.
                  </p>
                )}
              </section>
            </Tabs.Content>

            {/* ── SCHEMA / QUERY TAB ── */}
            <Tabs.Content
              value="schema"
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <FileCode2 className="w-3 h-3" /> Cypher Query
                </p>
                <button
                  onClick={() => handleCopy(cypherQuery)}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-all"
                  style={{
                    background: copied ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: copied ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  }}
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="code-block whitespace-pre-wrap break-all text-[11px]">
                {cypherQuery}
              </pre>

              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <Hash className="w-3 h-3" /> Entity Schema
                </p>
                <div className="code-block text-[11px]">
                  <span style={{ color: '#c084fc' }}>type</span>{' '}
                  <span style={{ color: '#38bdf8' }}>{entity.type}</span>{' '}{`{`}<br />
                  {'  '}<span style={{ color: '#94a3b8' }}>id:</span>{' '}
                  <span style={{ color: '#34d399' }}>"{entity.id}"</span>,<br />
                  {'  '}<span style={{ color: '#94a3b8' }}>name:</span>{' '}
                  <span style={{ color: '#34d399' }}>"{entity.name}"</span>,<br />
                  {'  '}<span style={{ color: '#94a3b8' }}>connections:</span>{' '}
                  <span style={{ color: '#f472b6' }}>{connectedRels.length}</span><br />
                  {`}`}
                </div>
              </div>
            </Tabs.Content>

            {/* ── AI INTELLIGENCE TAB ── */}
            <Tabs.Content
              value="ai"
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {/* Reasoning path */}
              {activatedPath && activatedPath.length > 0 ? (
                <section>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    <Zap className="w-3 h-3" style={{ color: 'var(--accent-purple)' }} /> Activated Reasoning Path
                  </p>
                  <div
                    className="p-3 rounded-lg"
                    style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.2)' }}
                  >
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {activatedPath.map((node, i) => (
                        <React.Fragment key={node}>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold"
                            style={{ background: 'var(--accent-purple)', color: '#fff' }}
                          >
                            {node}
                          </span>
                          {i < activatedPath.length - 1 && (
                            <span style={{ color: 'var(--accent-purple)' }}>→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </section>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Brain className="w-8 h-8 mb-2" style={{ color: 'var(--text-dim)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    No reasoning path activated. Ask a question in the Cortical Assistant to see graph traversal results.
                  </p>
                </div>
              )}

              {/* Vector embedding placeholder */}
              <section>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <Brain className="w-3 h-3" /> Vector Embedding Preview
                </p>
                <div
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="grid grid-cols-8 gap-0.5">
                    {Array.from({ length: 32 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-3 rounded-sm"
                        style={{
                          background: `hsl(${(i * 37 + entity.name.length * 13) % 360}, 60%, 50%)`,
                          opacity: 0.4 + (Math.sin(i + entity.name.length) * 0.3),
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] mt-2 font-mono" style={{ color: 'var(--text-dim)' }}>
                    ChromaDB vector — dim: 768 · model: text-embedding-004
                  </p>
                </div>
              </section>
            </Tabs.Content>

            {/* ── LOGS TAB ── */}
            <Tabs.Content
              value="logs"
              className="flex-1 overflow-y-auto p-4 space-y-2"
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--text-dim)' }}
              >
                <Terminal className="w-3 h-3" /> Execution Logs
              </p>
              {[
                { time: '10:49:01', level: 'INFO', msg: `Entity extracted: ${entity.name} [${entity.type}]`, color: 'var(--accent-cyan)' },
                { time: '10:49:02', level: 'INFO', msg: `${connectedRels.length} relationship(s) resolved`, color: 'var(--accent-cyan)' },
                { time: '10:49:03', level: 'INFO', msg: 'ChromaDB vector indexed successfully', color: 'var(--accent-emerald)' },
                { time: '10:49:04', level: 'INFO', msg: 'Neo4j MERGE committed', color: 'var(--accent-emerald)' },
                ...(activatedPath && activatedPath.length > 0
                  ? [{ time: '10:49:10', level: 'TRACE', msg: `Graph traversal: ${activatedPath.join(' → ')}`, color: 'var(--accent-purple)' }]
                  : []),
              ].map((log, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg font-mono text-[10px] flex gap-2"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <span style={{ color: 'var(--text-dim)' }}>{log.time}</span>
                  <span className="font-semibold" style={{ color: log.color }}>[{log.level}]</span>
                  <span style={{ color: 'var(--text-secondary)' }} className="flex-1">{log.msg}</span>
                </div>
              ))}
            </Tabs.Content>
          </Tabs.Root>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
