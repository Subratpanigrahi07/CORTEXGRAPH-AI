import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network, Database, Layers, ChevronLeft, ChevronRight,
  Settings, Activity, ChevronDown, Circle, Search, FileText, Share2,
  GitMerge, AlertTriangle, BarChart3
} from 'lucide-react';
import type { KnowledgeGraph, Entity } from '../../utils/api';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  graphData: KnowledgeGraph | null;
  selectedEntityId?: string | null;
  onSelectEntity: (entity: Entity) => void;
  onOpenGraph: () => void;
  onOpenSettings: () => void;
  isDark?: boolean;
  entityCount: number;
  relCount: number;
  selectedFileName?: string | null;
  onOpenDatasetPreview?: () => void;
  onOpenMergeSuggestions?: () => void;
  onOpenContradictions?: () => void;
  onOpenAnalytics?: () => void;
  mergeSuggestionsCount?: number;
  contradictionsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  graphData,
  selectedEntityId,
  onSelectEntity,
  onOpenGraph,
  onOpenSettings,
  entityCount,
  relCount,
  selectedFileName,
  onOpenDatasetPreview,
  onOpenMergeSuggestions,
  onOpenContradictions,
  onOpenAnalytics,
  mergeSuggestionsCount = 0,
  contradictionsCount = 0,
}) => {
  const [expandedSection, setExpandedSection] = useState<string>('graphs');
  const [activeScope, setActiveScope] = useState('graphs');
  const [sidebarSearch, setSidebarSearch] = useState('');

  const sidebarWidth = isOpen ? 'var(--sidebar-width)' : 'var(--sidebar-collapsed)';

  // Discovered node types
  const availableTypes = React.useMemo(() => {
    if (!graphData) return [];
    return Array.from(new Set(graphData.entities.map((e) => e.type)));
  }, [graphData]);

  // Unique relationship types
  const availableRelTypes = React.useMemo(() => {
    if (!graphData) return [];
    return Array.from(new Set(graphData.relationships.map((r) => r.type)));
  }, [graphData]);

  // Scope sections with count badges
  const scopeSections = React.useMemo(() => {
    return [
      { id: 'graphs', label: 'Graphs', icon: Network, count: graphData ? 1 : 0 },
      { id: 'datasets', label: 'Datasets', icon: Database, count: selectedFileName ? 1 : (graphData ? 1 : 0) },
      { id: 'schemas', label: 'Schemas', icon: Layers, count: availableTypes.length + availableRelTypes.length },
      { id: 'knowledge', label: 'Knowledge', icon: Activity, count: mergeSuggestionsCount + contradictionsCount },
    ];
  }, [graphData, selectedFileName, availableTypes, availableRelTypes]);

  // Group entities by type + filter search query
  const groupedEntities = React.useMemo(() => {
    if (!graphData) return {};
    const groups: Record<string, Entity[]> = {};
    const query = sidebarSearch.toLowerCase().trim();

    const filtered = graphData.entities.filter(
      (e) => e.name.toLowerCase().includes(query) || e.type.toLowerCase().includes(query)
    );

    filtered.forEach((e) => {
      if (!groups[e.type]) groups[e.type] = [];
      groups[e.type].push(e);
    });
    return groups;
  }, [graphData, sidebarSearch]);

  const getTypeDotColor = (type: string): string => {
    const t = type.toLowerCase();
    if (t.includes('person') || t.includes('user')) return '#38bdf8';
    if (t.includes('technology') || t.includes('framework') || t.includes('api')) return '#c084fc';
    if (t.includes('database') || t.includes('store')) return '#34d399';
    if (t.includes('project') || t.includes('product')) return '#f472b6';
    if (t.includes('company') || t.includes('org')) return '#fbbf24';
    return '#a78bfa';
  };

  return (
    <motion.aside
      animate={{ width: sidebarWidth }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex-shrink-0 flex flex-col h-full relative overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        minWidth: isOpen ? 'var(--sidebar-width)' : 'var(--sidebar-collapsed)',
      }}
    >
      {/* ── Toggle Button ── */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-5 w-6 h-6 rounded-full flex items-center justify-center z-10 transition-all hover:scale-110"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-muted)',
        }}
        id="sidebar-toggle"
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {/* ── Scope Navigation ── */}
      <div className="flex-shrink-0 pt-3 pb-1 px-2 overflow-hidden">
        {isOpen && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2"
            style={{ color: 'var(--text-dim)' }}
          >
            Scope
          </motion.p>
        )}
        <div className="space-y-0.5">
          {scopeSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeScope === section.id;
            return (
              <button
                key={section.id}
                onClick={() => {
                  setActiveScope(section.id);
                  setExpandedSection(section.id);
                }}
                className={`nav-item w-full text-left ${isActive ? 'active' : ''}`}
                title={!isOpen ? section.label : undefined}
                style={isOpen ? {} : { justifyContent: 'center', padding: '7px' }}
              >
                <Icon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: isActive ? 'var(--accent-purple)' : 'var(--text-muted)' }}
                />
                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="flex-1 overflow-hidden text-sm"
                    >
                      {section.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isOpen && section.count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold ml-auto flex-shrink-0"
                    style={{
                      background: isActive ? 'var(--accent-purple-dim)' : 'var(--bg-overlay)',
                      color: isActive ? 'var(--accent-purple)' : 'var(--text-dim)',
                    }}
                  >
                    {section.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-3 my-1" style={{ height: 1, background: 'var(--border-subtle)' }} />

      {/* ── Sub-Scope Render Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-2"
          >
            {/* GRAPHS / NODE REGISTRY TAB */}
            {activeScope === 'graphs' && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--text-dim)' }}>
                  Node Registry
                </p>

                {/* Registry Search Box */}
                {graphData && graphData.entities.length > 0 && (
                  <div className="px-2 mb-3">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}>
                      <Search className="w-3 h-3 text-muted-foreground" style={{ color: 'var(--text-dim)' }} />
                      <input
                        type="text"
                        placeholder="Search registry..."
                        value={sidebarSearch}
                        onChange={(e) => setSidebarSearch(e.target.value)}
                        className="bg-transparent text-[11px] outline-none w-full"
                        style={{ color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                )}

                {!graphData || graphData.entities.length === 0 ? (
                  <div className="px-2 py-4 text-center">
                    <Network className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No nodes loaded. Ingest a document to build your graph.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(groupedEntities).map(([type, entities]) => (
                      <div key={type}>
                        <button
                          onClick={() => setExpandedSection(expandedSection === type ? '' : type)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold transition-all"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: getTypeDotColor(type) }}
                          />
                          <span className="flex-1 text-left uppercase text-[10px] tracking-wider">{type}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{entities.length}</span>
                          <ChevronDown
                            className="w-3 h-3 transition-transform"
                            style={{
                              transform: expandedSection === type ? 'rotate(0deg)' : 'rotate(-90deg)',
                              color: 'var(--text-dim)',
                            }}
                          />
                        </button>

                        <AnimatePresence>
                          {expandedSection === type && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden"
                            >
                              <div className="pl-4 space-y-0.5 pb-1">
                                {entities.map((entity) => {
                                  const isSelected = selectedEntityId === entity.id;
                                  return (
                                    <button
                                      key={entity.id}
                                      onClick={() => onSelectEntity(entity)}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all text-left"
                                      style={{
                                        background: isSelected ? 'var(--accent-purple-dim)' : 'transparent',
                                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        border: isSelected ? '1px solid rgba(108,92,231,0.2)' : '1px solid transparent',
                                      }}
                                    >
                                      <Circle
                                        className="w-1.5 h-1.5 flex-shrink-0 fill-current"
                                        style={{ color: isSelected ? 'var(--accent-purple)' : getTypeDotColor(type) }}
                                      />
                                      <span className="truncate font-medium">{entity.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* DATASETS TAB */}
            {activeScope === 'datasets' && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--text-dim)' }}>
                  Ingested Datasets
                </p>
                 {selectedFileName || graphData ? (
                   <div className="px-2 space-y-2">
                     <div
                       onClick={onOpenDatasetPreview}
                       className="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-overlay)] hover:border-zinc-700 hover:scale-[1.01] transition-all active:scale-[0.98]"
                       style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}
                       title="Click to preview files and inspect RAG database"
                     >
                       <FileText className="w-4 h-4 text-purple-400" />
                       <div className="flex-1 min-w-0">
                         <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                           {selectedFileName || 'Ingested Text Input'}
                         </p>
                         <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>
                           {graphData?.entities.length || 0} nodes indexed
                         </p>
                       </div>
                     </div>
                   </div>
                ) : (
                  <div className="px-2 py-4 text-center">
                    <Database className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No datasets loaded yet.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* SCHEMAS TAB */}
            {activeScope === 'schemas' && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--text-dim)' }}>
                  Active Schema Layers
                </p>

                {availableTypes.length === 0 && availableRelTypes.length === 0 ? (
                  <div className="px-2 py-4 text-center">
                    <Layers className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No active schema mappings.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 px-2">
                    {availableTypes.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-dim)' }}>
                          Entity Labels
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {availableTypes.map((type) => (
                            <span
                              key={type}
                              className="text-[9px] font-mono px-2 py-0.5 rounded-full font-semibold uppercase flex items-center gap-1 border"
                              style={{
                                background: 'var(--bg-overlay)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: getTypeDotColor(type) }} />
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {availableRelTypes.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-dim)' }}>
                          Relationship Connectors
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {availableRelTypes.map((type) => (
                            <span
                              key={type}
                              className="text-[9px] font-mono px-2 py-0.5 rounded-full font-semibold uppercase flex items-center gap-1 border"
                              style={{
                                background: 'rgba(34, 211, 238, 0.06)',
                                borderColor: 'rgba(34, 211, 238, 0.15)',
                                color: '#22d3ee',
                              }}
                            >
                              <Share2 className="w-2.5 h-2.5" />
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* KNOWLEDGE TAB */}
            {activeScope === 'knowledge' && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--text-dim)' }}>
                  Knowledge Management
                </p>
                <div className="space-y-2 px-2">
                  <div
                    onClick={onOpenDatasetPreview}
                    className="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-overlay)] hover:scale-[1.01] transition-all"
                    style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}
                  >
                    <Activity className="w-4 h-4 text-purple-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Knowledge Dashboard</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Overview, health &amp; RAG preview</p>
                    </div>
                  </div>

                  <div
                    onClick={onOpenMergeSuggestions}
                    className="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-overlay)] hover:scale-[1.01] transition-all"
                    style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}
                  >
                    <GitMerge className="w-4 h-4 text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Merge Review</p>
                        {mergeSuggestionsCount > 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-400">
                            {mergeSuggestionsCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Entity deduplication</p>
                    </div>
                  </div>

                  <div
                    onClick={onOpenContradictions}
                    className="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-overlay)] hover:scale-[1.01] transition-all"
                    style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}
                  >
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Conflict Review</p>
                        {contradictionsCount > 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold bg-red-500/20 text-red-400">
                            {contradictionsCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Knowledge contradictions</p>
                    </div>
                  </div>

                  <div
                    onClick={onOpenAnalytics}
                    className="p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-overlay)] hover:scale-[1.01] transition-all"
                    style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}
                  >
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Graph Analytics</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>PageRank &amp; Louvain clusters</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="mx-3" style={{ height: 1, background: 'var(--border-subtle)' }} />

      {/* ── Bottom Nav ── */}
      <div className="flex-shrink-0 px-2 py-2 space-y-0.5">
        <button
          onClick={onOpenGraph}
          className="nav-item w-full"
          title={!isOpen ? 'View Graph' : undefined}
          style={isOpen ? {} : { justifyContent: 'center', padding: '7px' }}
          id="open-graph-btn"
        >
          <Network className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-cyan)' }} />
          {isOpen && <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>View Graph</span>}
        </button>
        <button
          onClick={onOpenSettings}
          className="nav-item w-full"
          title={!isOpen ? 'Settings' : undefined}
          style={isOpen ? {} : { justifyContent: 'center', padding: '7px' }}
          id="settings-btn"
        >
          <Settings className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          {isOpen && <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</span>}
        </button>
      </div>

      {/* ── Status Footer ── */}
      <div
        className="flex-shrink-0 px-3 py-2.5"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                  {entityCount} nodes
                </span>
                <span style={{ color: 'var(--text-dim)' }}>·</span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                  {relCount} edges
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--accent-emerald)', animation: 'pulse-ring 2s ease-out infinite' }}
                />
                <span className="text-[10px] font-mono font-semibold" style={{ color: 'var(--accent-emerald)' }}>
                  Neo4j · ChromaDB
                </span>
              </div>
            </div>
            <Activity className="w-4 h-4" style={{ color: 'var(--accent-purple)' }} />
          </motion.div>
        ) : (
          <div className="flex justify-center">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--accent-emerald)', animation: 'pulse-ring 2s ease-out infinite' }}
            />
          </div>
        )}
      </div>
    </motion.aside>
  );
};
