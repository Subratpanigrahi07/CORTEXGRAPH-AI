import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Filter } from 'lucide-react';
import { useCursorProximity, GoogleAiSparkleIcon } from '../utils/useCursorProximity';

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  selectedTypeFilter: string;
  onFilterChange: (type: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableTypes: string[];
  isDark: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const GraphControls: React.FC<GraphControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetZoom,
  selectedTypeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  availableTypes,
  isDark,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const { ref: searchRef, bindHandlers } = useCursorProximity<HTMLDivElement>(180);

  const headerBg = isDark
    ? 'bg-slate-950/80 border-slate-800/80 text-white'
    : 'bg-white/80 border-slate-200/80 text-slate-800';

  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="flex items-center justify-between w-full pointer-events-none">
      {/* SEARCH & FILTER (Google AI Mode Search Bar) */}
      <div
        ref={searchRef}
        {...bindHandlers}
        className="google-ai-search-wrapper pointer-events-auto max-w-full"
        style={{ borderRadius: 14 }}
      >
        <div className="google-ai-ambient-glow" style={{ borderRadius: 16 }} />
        <div className="google-ai-border-glow" style={{ borderRadius: 15 }} />

        <div className={`google-ai-inner-pill flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-lg overflow-hidden ${headerBg}`}>
          <GoogleAiSparkleIcon size={14} className="flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={bindHandlers.onFocus}
            onBlur={bindHandlers.onBlur}
            placeholder="Search..."
            className={`bg-transparent text-xs focus:outline-none w-20 min-w-0 font-medium ${isDark ? 'text-white' : 'text-slate-800'}`}
          />
          <span className="text-slate-600 text-xs">|</span>
          <Filter className={`w-3.5 h-3.5 flex-shrink-0 ${textMuted}`} />
          <select
            value={selectedTypeFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className={`bg-transparent text-xs font-semibold focus:outline-none cursor-pointer max-w-[80px] truncate ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
          >
            <option value="ALL" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
              All Layers
            </option>
            {availableTypes.map((type) => (
              <option
                key={type}
                value={type}
                className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}
              >
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ZOOM & RECENTER / FULLSCREEN BUTTONS */}
      <div className={`pointer-events-auto flex items-center gap-1 p-1 rounded-xl border backdrop-blur-md shadow-lg ${headerBg}`}>
        <button
          onClick={onZoomIn}
          className={`p-1.5 rounded-lg hover:bg-slate-800/20 transition-all ${textMuted}`}
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onZoomOut}
          className={`p-1.5 rounded-lg hover:bg-slate-800/20 transition-all ${textMuted}`}
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleFullscreen || onResetZoom}
          className={`p-1.5 rounded-lg hover:bg-slate-800/20 transition-all ${
            isFullscreen ? 'text-cyan-400 font-bold bg-cyan-500/20' : textMuted
          }`}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Canvas'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
