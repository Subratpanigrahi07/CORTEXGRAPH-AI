import React from 'react';
import { Layers, Tag, Activity, Info } from 'lucide-react';
import type { Entity, Relationship } from '../utils/api';

interface ContextPanelProps {
  selectedEntity: Entity | null;
  relationships: Relationship[];
  isDark: boolean;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  selectedEntity,
  relationships,
  isDark,
}) => {
  const cardBg = isDark
    ? 'bg-slate-900/60 border-slate-800/80 backdrop-blur-xl shadow-xl shadow-black/40 text-slate-100'
    : 'bg-white/85 border-slate-200/90 backdrop-blur-xl shadow-xl shadow-indigo-900/5 text-slate-900';

  const innerBox = isDark
    ? 'bg-slate-950/50 border-slate-800/60 text-slate-200'
    : 'bg-slate-50/90 border-slate-200/80 text-slate-800 shadow-sm';

  const textMuted = isDark ? 'text-slate-400' : 'text-slate-600';
  const textDim = isDark ? 'text-slate-500' : 'text-slate-500';
  
  const pill = isDark
    ? 'bg-purple-950/60 text-purple-300 border-purple-800/60 font-medium'
    : 'bg-purple-100 text-purple-900 border-purple-300 font-bold';

  if (!selectedEntity) {
    return (
      <div className={`rounded-2xl border p-4 flex flex-col justify-center items-center text-center h-full ${cardBg}`}>
        <div className="p-3 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-500 mb-2">
          <Info size={18} />
        </div>
        <span className="text-xs font-mono font-bold text-cyan-600 uppercase tracking-wider">
          Node Inspector
        </span>
        <p className={`text-xs mt-1 max-w-[200px] ${textMuted}`}>
          Hover over or click any node in the Cortical Nexus to inspect its underlying properties and pathways.
        </p>
      </div>
    );
  }

  // Find connections
  const connectedRels = relationships.filter(
    (r) => r.source === selectedEntity.id || r.target === selectedEntity.id
  );

  return (
    <div className={`rounded-2xl border p-4 flex flex-col h-full min-h-0 overflow-hidden ${cardBg}`}>
      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/40 dark:border-slate-800/40 mb-3 flex-shrink-0">
        <span className="text-[10px] font-mono tracking-wider text-cyan-600 dark:text-cyan-400 uppercase font-bold flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-500" /> Node Inspector
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono border uppercase ${pill}`}>
          {selectedEntity.type}
        </span>
      </div>

      {/* BODY CONTENT - SCROLLABLE */}
      <div className="overflow-y-auto flex-1 min-h-0 pr-1 space-y-4">
        {/* ENTITY TITLE & STATS */}
        <div>
          <h2 className="text-lg font-extrabold tracking-tight leading-tight text-slate-900 dark:text-slate-100">
            {selectedEntity.name}
          </h2>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className={`p-2 rounded-xl border ${innerBox}`}>
              <span className={`text-[9px] block font-mono uppercase font-semibold ${textDim}`}>ENTITY ID</span>
              <span className="text-xs font-mono font-bold truncate block text-cyan-600 dark:text-cyan-400">
                {selectedEntity.id}
              </span>
            </div>
            <div className={`p-2 rounded-xl border ${innerBox}`}>
              <span className={`text-[9px] block font-mono uppercase font-semibold ${textDim}`}>CONNECTIONS</span>
              <span className="text-xs font-mono font-extrabold block text-purple-600 dark:text-purple-400">
                {connectedRels.length} Link(s)
              </span>
            </div>
          </div>
        </div>

        {/* EXTRACTED PROPERTIES */}
        <div className="space-y-2">
          <span className={`text-[10px] font-mono font-bold tracking-wider block uppercase flex items-center gap-1.5 ${textMuted}`}>
            <Tag size={12} className="text-cyan-500" /> Extracted Properties
          </span>
          {selectedEntity.properties.length > 0 ? (
            <div className="space-y-2">
              {selectedEntity.properties.map((p, idx) => (
                <div key={idx} className={`p-3 rounded-xl border text-xs leading-relaxed flex flex-col gap-1 ${innerBox}`}>
                  <span className="font-mono text-[10px] text-cyan-700 dark:text-cyan-400 font-bold uppercase tracking-wide">
                    {p.key}
                  </span>
                  <p className="text-xs leading-relaxed font-medium text-slate-900 dark:text-slate-200">
                    {p.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className={`text-xs italic ${textDim}`}>No additional metadata attached.</p>
          )}
        </div>

        {/* NEURAL PATHWAYS */}
        <div className="space-y-2">
          <span className={`text-[10px] font-mono font-bold tracking-wider block uppercase flex items-center gap-1.5 ${textMuted}`}>
            <Activity size={12} className="text-purple-500" /> Neural Pathways
          </span>
          <div className="space-y-1.5">
            {connectedRels.length > 0 ? (
              connectedRels.map((r, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl border text-xs flex flex-wrap items-center gap-1.5 ${innerBox}`}
                >
                  <span className="font-mono text-[10px] text-slate-700 dark:text-slate-400 font-medium break-all">{r.source}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border break-all ${pill}`}>
                    {r.type}
                  </span>
                  <span className="font-mono text-[10px] text-cyan-700 dark:text-cyan-400 font-bold break-all">{r.target}</span>
                </div>
              ))
            ) : (
              <p className={`text-xs italic ${textDim}`}>No active edge connections.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
