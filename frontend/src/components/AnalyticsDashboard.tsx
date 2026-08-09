import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Network, TrendingUp, Users, X, RefreshCw, Layers, Zap } from 'lucide-react';
import {
  getAnalyticsOverview, getCentrality, getCommunities,
  type AnalyticsOverview, type CentralityResult, type CommunitiesResult,
} from '../utils/api';

interface AnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

type TabId = 'overview' | 'centrality' | 'communities';

const ENTITY_TYPE_COLORS: Record<string, string> = {
  PERSON: '#6c5ce7',
  ORGANIZATION: '#22d3ee',
  TECHNOLOGY: '#10b981',
  PROJECT: '#f59e0b',
  CONCEPT: '#8b5cf6',
  EVENT: '#ef4444',
  DATASET: '#3b82f6',
  PAPER: '#ec4899',
};

const COMMUNITY_COLORS = [
  '#6c5ce7', '#22d3ee', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#3b82f6', '#ec4899', '#f97316', '#14b8a6',
];

export function AnalyticsDashboard({ isOpen, onClose, isDark }: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [centrality, setCentrality] = useState<CentralityResult | null>(null);
  const [betweenness, setBetweenness] = useState<CentralityResult | null>(null);
  const [communities, setCommunities] = useState<CommunitiesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [centralityType, setCentralityType] = useState<'pagerank' | 'betweenness'>('pagerank');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, pr, bt, cm] = await Promise.all([
        getAnalyticsOverview(),
        getCentrality('pagerank', 10),
        getCentrality('betweenness', 10),
        getCommunities(),
      ]);
      setOverview(ov);
      setCentrality(pr);
      setBetweenness(bt);
      setCommunities(cm);
    } catch {
      console.warn('Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchAll();
  }, [isOpen, fetchAll]);

  if (!isOpen) return null;

  const currentCentrality = centralityType === 'pagerank' ? centrality : betweenness;
  const maxScore = currentCentrality?.entries?.[0]?.score || 1;

  const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'centrality', label: 'Centrality', icon: TrendingUp },
    { id: 'communities', label: 'Communities', icon: Users },
  ];

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
          className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            maxHeight: '85vh',
          }}
          id="analytics-dashboard"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(108,92,231,0.2), rgba(34,211,238,0.2))', border: '1px solid rgba(108,92,231,0.25)' }}
              >
                <BarChart3 className="w-4 h-4" style={{ color: 'var(--accent-purple)' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Graph Analytics Dashboard
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {overview ? `${overview.total_entities} entities · ${overview.total_relationships} relationships` : 'Loading...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAll}
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

          {/* Tab bar */}
          <div className="flex gap-1 px-6 pt-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all"
                  style={{
                    color: isActive ? 'var(--accent-purple)' : 'var(--text-muted)',
                    background: isActive ? 'var(--bg-overlay)' : 'transparent',
                    borderBottom: isActive ? '2px solid var(--accent-purple)' : '2px solid transparent',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading && !overview ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : (
              <>
                {/* ── Overview Tab ── */}
                {activeTab === 'overview' && overview && (
                  <div className="space-y-6">
                    {/* Stat cards */}
                    <div className="grid grid-cols-4 gap-3">
                      <StatCard icon={<Network className="w-4 h-4" />} label="Entities" value={overview.total_entities} color="#6c5ce7" />
                      <StatCard icon={<Zap className="w-4 h-4" />} label="Relationships" value={overview.total_relationships} color="#22d3ee" />
                      <StatCard icon={<Layers className="w-4 h-4" />} label="Documents" value={overview.documents_indexed} color="#10b981" />
                      <StatCard icon={<Users className="w-4 h-4" />} label="Communities" value={communities?.total_communities || 0} color="#f59e0b" />
                    </div>

                    {/* Entity types breakdown */}
                    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-dim)' }}>
                        Entities by Type
                      </p>
                      <div className="space-y-2">
                        {Object.entries(overview.entities_by_type)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => {
                            const total = overview.total_entities || 1;
                            const pct = Math.round((count / total) * 100);
                            const color = ENTITY_TYPE_COLORS[type] || '#94a3b8';
                            return (
                              <div key={type} className="flex items-center gap-3">
                                <span className="text-[10px] font-mono w-24 truncate" style={{ color: 'var(--text-secondary)' }}>{type}</span>
                                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{ background: color }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono font-bold w-10 text-right" style={{ color }}>{count}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Relationship types breakdown */}
                    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-dim)' }}>
                        Relationships by Type
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(overview.relationships_by_type)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <span key={type} className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-semibold"
                              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              {type} <span style={{ color: 'var(--accent-cyan)' }}>×{count}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Centrality Tab ── */}
                {activeTab === 'centrality' && (
                  <div className="space-y-4">
                    {/* Algorithm toggle */}
                    <div className="flex gap-2">
                      {(['pagerank', 'betweenness'] as const).map((algo) => (
                        <button
                          key={algo}
                          onClick={() => setCentralityType(algo)}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: centralityType === algo ? 'var(--accent-purple-dim)' : 'var(--bg-overlay)',
                            border: `1px solid ${centralityType === algo ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                            color: centralityType === algo ? 'var(--accent-purple)' : 'var(--text-secondary)',
                          }}
                        >
                          {algo === 'pagerank' ? '📊 PageRank' : '🌉 Betweenness'}
                        </button>
                      ))}
                    </div>

                    {currentCentrality && (
                      <>
                        <p className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                          Algorithm: {currentCentrality.algorithm}
                        </p>

                        {/* Horizontal bar chart */}
                        <div className="space-y-2">
                          {currentCentrality.entries.map((entry, i) => {
                            const barPct = maxScore > 0 ? (entry.score / maxScore) * 100 : 0;
                            const color = ENTITY_TYPE_COLORS[entry.entity_type] || '#6c5ce7';
                            return (
                              <motion.div
                                key={entry.entity_id || i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-3 rounded-lg p-2"
                                style={{ background: 'var(--bg-overlay)' }}
                              >
                                <span className="text-[10px] font-mono w-5 text-right font-bold" style={{ color: 'var(--text-dim)' }}>
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                      {entry.entity_name}
                                    </span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                                        {entry.entity_type}
                                      </span>
                                      <span className="text-[10px] font-mono font-bold" style={{ color }}>
                                        {entry.score.toFixed(4)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${barPct}%` }}
                                      transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                                      className="h-full rounded-full"
                                      style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>

                        {currentCentrality.entries.length === 0 && (
                          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                            No entities in graph yet. Upload documents to compute centrality.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── Communities Tab ── */}
                {activeTab === 'communities' && communities && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {communities.total_communities} knowledge domain{communities.total_communities !== 1 ? 's' : ''} detected
                      </p>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                        Louvain algorithm
                      </span>
                    </div>

                    {communities.communities.length === 0 ? (
                      <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                        No communities detected. Upload more documents to discover clusters.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {communities.communities.map((community, i) => {
                          const color = COMMUNITY_COLORS[i % COMMUNITY_COLORS.length];
                          return (
                            <motion.div
                              key={community.community_id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: i * 0.05 }}
                              className="rounded-xl border p-4"
                              style={{ background: 'var(--bg-overlay)', borderColor: `${color}30` }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                                    Cluster {community.community_id}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono font-bold" style={{ color }}>
                                  {community.size} entities
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {community.entities.slice(0, 8).map((entity) => (
                                  <span
                                    key={entity}
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-[120px]"
                                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                                  >
                                    {entity}
                                  </span>
                                ))}
                                {community.entities.length > 8 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: 'var(--text-dim)' }}>
                                    +{community.entities.length - 8} more
                                  </span>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border p-3.5" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-2xl font-bold font-mono"
        style={{ color }}
      >
        {value.toLocaleString()}
      </motion.p>
    </div>
  );
}
