import React from 'react';
import { Activity, Cpu, Database, Network } from 'lucide-react';
import type { KnowledgeGraph } from '../utils/api';

interface SystemStatusProps {
  graphData: KnowledgeGraph | null;
  isDark: boolean;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ graphData, isDark }) => {
  const entityCount = graphData?.entities.length || 0;
  const relCount = graphData?.relationships.length || 0;

  const cardBg = isDark
    ? 'bg-slate-900/60 border-slate-800/80 backdrop-blur-xl shadow-xl shadow-black/40 text-slate-100'
    : 'bg-white/85 border-slate-200/90 backdrop-blur-xl shadow-xl shadow-indigo-900/5 text-slate-900';

  const innerBox = isDark
    ? 'bg-slate-950/50 border-slate-800/60 text-slate-200'
    : 'bg-slate-50/90 border-slate-200/80 text-slate-800 shadow-sm';

  const textMuted = isDark ? 'text-slate-400' : 'text-slate-600';
  const textDim = isDark ? 'text-slate-500' : 'text-slate-500';

  return (
    <div className={`h-44 rounded-2xl border p-4 flex flex-col justify-between ${cardBg}`}>
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Metrics & Status
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> ONLINE
        </span>
      </div>

      {/* COUNTERS */}
      <div className="grid grid-cols-2 gap-2 my-2">
        <div className={`p-2.5 rounded-xl border ${innerBox}`}>
          <div className="flex justify-between items-center">
            <span className={`text-[9px] font-bold font-mono ${textDim}`}>TOTAL NODES</span>
            <Network size={12} className="text-cyan-500" />
          </div>
          <span className="text-xl font-extrabold font-mono text-cyan-600 dark:text-cyan-400">{entityCount}</span>
        </div>

        <div className={`p-2.5 rounded-xl border ${innerBox}`}>
          <div className="flex justify-between items-center">
            <span className={`text-[9px] font-bold font-mono ${textDim}`}>GRAPH EDGES</span>
            <Database size={12} className="text-purple-500" />
          </div>
          <span className="text-xl font-extrabold font-mono text-purple-600 dark:text-purple-400">{relCount}</span>
        </div>
      </div>

      {/* DUAL-ENGINE FOOTER */}
      <div className={`flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl border ${innerBox}`}>
        <span className={`flex items-center gap-1 font-mono text-[10px] ${textMuted}`}>
          <Cpu size={12} className="text-indigo-500" /> Graph Engine:
        </span>
        <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-400">Neo4j + ChromaDB</span>
      </div>
    </div>
  );
};
