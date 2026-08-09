import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Sparkles, Loader2, X, Upload, Network, Settings, Database, Cpu, Check } from 'lucide-react';
import { extractGraphData, uploadDocument, checkEngineHealth, type KnowledgeGraph, type Entity } from './utils/api';
import { GraphVisualizer, type GraphVisualizerRef } from './components/GraphVisualizer';
import { TopNav } from './components/layout/TopNav';
import { Sidebar } from './components/layout/Sidebar';
import { InspectorPanel } from './components/layout/InspectorPanel';
import { CortexStudio } from './components/layout/CortexStudio';
import { DatasetsDashboard } from './components/DatasetsDashboard';
import { MergeSuggestionsPanel } from './components/MergeSuggestionsPanel';
import { ContradictionReviewPanel } from './components/ContradictionReviewPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';

function App() {
  // ── Theme ──────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const isDark = theme === 'dark';
  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    if (!(document as any).startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;

    const transition = (document as any).startViewTransition(() => {
      setTheme(nextTheme);
    });

    transition.ready.then(() => {
      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 700,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Engine Status & Settings ──────────────────────
  const [isEngineOnline, setIsEngineOnline] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsModel, setSettingsModel] = useState('gemini-1.5-flash');
  const [physicsSpeed, setPhysicsSpeed] = useState('normal');

  useEffect(() => {
    const ping = async () => {
      const online = await checkEngineHealth();
      setIsEngineOnline(online);
    };
    ping();
    const interval = setInterval(ping, 10000);
    return () => clearInterval(interval);
  }, []);
  const [inputText, setInputText] = useState(
    'Subrat developed CortexGraph AI. CortexGraph AI is a Graph RAG system built using React, FastAPI, Neo4j, and ChromaDB. It uses the Gemini API to analyze document text.'
  );
  const [rawText, setRawText] = useState<string>(
    'Subrat developed CortexGraph AI. CortexGraph AI is a Graph RAG system built using React, FastAPI, Neo4j, and ChromaDB. It uses the Gemini API to analyze document text.'
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [graphData, setGraphData] = useState<KnowledgeGraph | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [activatedNodeIds, setActivatedNodeIds] = useState<string[]>([]);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── Panel Visibility ───────────────────────────────
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isDatasetPreviewOpen, setIsDatasetPreviewOpen] = useState(false);
  const [isMergeSuggestionsOpen, setIsMergeSuggestionsOpen] = useState(false);
  const [isContradictionsOpen, setIsContradictionsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  // Graph is now a fullscreen overlay
  const [isGraphOpen, setIsGraphOpen] = useState(false);

  const visualizerRef = useRef<GraphVisualizerRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInspectorOpen = !!selectedEntity;

  // ── ⌘K shortcut ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('topnav-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Graph Extraction ───────────────────────────────
  const handleExtract = async (overrideText?: string): Promise<KnowledgeGraph | null> => {
    const textToExtract = overrideText || inputText;
    if (!textToExtract.trim()) return null;
    setIsLoading(true);
    setError(null);
    try {
      const data = await extractGraphData({ text: textToExtract, model: settingsModel });
      setGraphData(data);
      setRawText(textToExtract);
      if (data.entities.length > 0) setSelectedEntity(data.entities[0]);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Extraction failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { handleExtract(); }, []);

  // Recenter when graph opens
  useEffect(() => {
    if (isGraphOpen && visualizerRef.current) {
      const t1 = setTimeout(() => visualizerRef.current?.recenter(), 150);
      const t2 = setTimeout(() => visualizerRef.current?.recenter(), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [isGraphOpen]);

  // ── File Upload ────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setSelectedFileName(file.name);
    try {
      const result = await uploadDocument(file);
      setRawText(result.text);
      setInputText(result.text.slice(0, 1000) + (result.text.length > 1000 ? '…' : ''));
      setGraphData(result.graph);
      if (result.graph.entities.length > 0) setSelectedEntity(result.graph.entities[0]);
      setIsIngestOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Document processing failed');
    } finally {
      setIsLoading(false);
    }
  };

  const availableTypes = Array.from(new Set(graphData?.entities.map((e) => e.type) || []));

  const handleSelectEntity = useCallback((entity: Entity | null) => {
    setSelectedEntity(entity);
  }, []);

  return (
    <div
      className="h-screen max-h-screen overflow-hidden flex flex-col"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* ── TOP NAV ── */}
      <TopNav
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onOpenIngest={() => setIsIngestOpen(true)}
        selectedNodeName={selectedEntity?.name}
        isEngineOnline={isEngineOnline}
        entities={graphData?.entities || []}
        onSelectEntity={handleSelectEntity}
        onOpenGraph={() => setIsGraphOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── SIDEBAR ── */}
        <Sidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((o) => !o)}
          graphData={graphData}
          selectedEntityId={selectedEntity?.id}
          onSelectEntity={handleSelectEntity}
          onOpenGraph={() => setIsGraphOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isDark={isDark}
          entityCount={graphData?.entities.length || 0}
          relCount={graphData?.relationships.length || 0}
          selectedFileName={selectedFileName}
          onOpenDatasetPreview={() => setIsDatasetPreviewOpen(true)}
          onOpenMergeSuggestions={() => setIsMergeSuggestionsOpen(true)}
          onOpenContradictions={() => setIsContradictionsOpen(true)}
          onOpenAnalytics={() => setIsAnalyticsOpen(true)}
        />

        {/* ── CENTER: CORTEX STUDIO (Gemini-style) ── */}
        <main className="flex-1 min-w-0 overflow-hidden">
          <CortexStudio
            graphData={graphData}
            rawText={rawText}
            onActivatePath={(path) => setActivatedNodeIds(path)}
            onExtractText={handleExtract}
            isLoading={isLoading}
            onOpenIngest={() => setIsIngestOpen(true)}
            onOpenGraph={() => setIsGraphOpen(true)}
            isDark={isDark}
          />
        </main>

        {/* ── RIGHT INSPECTOR DRAWER ── */}
        <InspectorPanel
          entity={selectedEntity}
          relationships={graphData?.relationships || []}
          isOpen={isInspectorOpen}
          onClose={() => setSelectedEntity(null)}
          isDark={isDark}
          activatedPath={activatedNodeIds}
        />
      </div>

      {/* ── GRAPH FULLSCREEN OVERLAY ── */}
      <AnimatePresence>
        {isGraphOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: 'var(--bg-base)' }}
          >
            {/* Graph header bar */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-4"
              style={{
                height: 'var(--topnav-height)',
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #6c5ce7, #22d3ee)' }}
                >
                  <Network className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    Knowledge Graph Canvas
                  </p>
                  <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {graphData?.entities.length || 0} nodes · {graphData?.relationships.length || 0} edges
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGraphOpen(false)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                }}
                id="close-graph-btn"
              >
                <X className="w-3.5 h-3.5" />
                Close Graph
              </button>
            </div>

            {/* Graph canvas */}
            <div className="flex-1 min-h-0">
              <GraphVisualizer
                ref={visualizerRef}
                data={graphData}
                activatedNodeIds={activatedNodeIds}
                selectedTypeFilter={selectedTypeFilter}
                searchQuery={searchQuery}
                onSelectEntity={handleSelectEntity}
                selectedEntityId={selectedEntity?.id}
                isDark={isDark}
                isLoading={isLoading}
                isFullscreen={true}
                onToggleFullscreen={() => setIsGraphOpen(false)}
                onSearchChange={setSearchQuery}
                onFilterChange={setSelectedTypeFilter}
                availableTypes={availableTypes}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* ── INGEST MODAL ── */}
      <AnimatePresence>
        {isIngestOpen && (
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
              className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
              id="ingest-modal"
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.25)' }}
                  >
                    <FileText className="w-4 h-4" style={{ color: 'var(--accent-purple)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Document Ingestion Pipeline
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Gemini extracts entities & relationships automatically
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsIngestOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                  id="ingest-close-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* File upload zone */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer flex flex-col items-center gap-3 transition-all"
                  style={{ borderColor: 'var(--border-default)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-purple)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--accent-purple-dim)', border: '1px solid rgba(108,92,231,0.25)' }}
                  >
                    <Upload className="w-5 h-5" style={{ color: 'var(--accent-purple)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Click to upload PDF, DOCX, TXT, MD
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Supports structured & unstructured formats
                    </p>
                  </div>
                  {selectedFileName && (
                    <span
                      className="text-xs font-mono px-2 py-1 rounded"
                      style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}
                    >
                      📄 {selectedFileName}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                    OR PASTE TEXT
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                </div>

                {/* Textarea */}
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl p-3 text-xs font-mono leading-relaxed outline-none resize-none transition-all"
                  style={{
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent-purple)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  id="ingest-textarea"
                />

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1">
                  <button
                    onClick={() => setIsIngestOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold"
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    onClick={() => { handleExtract(); setIsIngestOpen(false); }}
                    disabled={isLoading || !inputText.trim()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--accent-purple)', boxShadow: '0 4px 14px rgba(108,92,231,0.4)' }}
                    id="build-graph-btn"
                  >
                    {isLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /> Build Graph</>
                    )}
                  </motion.button>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs p-3 rounded-lg"
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#ef4444',
                    }}
                  >
                    {error}
                  </motion.p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── KNOWLEDGE BASE DASHBOARD ── */}
      <DatasetsDashboard
        isOpen={isDatasetPreviewOpen}
        onClose={() => setIsDatasetPreviewOpen(false)}
        graphData={graphData}
        rawText={rawText}
        selectedFileName={selectedFileName}
        isDark={isDark}
        onSelectEntity={handleSelectEntity}
        onOpenGraph={() => {
          setIsDatasetPreviewOpen(false);
          setIsGraphOpen(true);
        }}
        onOpenContradictionReview={() => {
          setIsDatasetPreviewOpen(false);
          setIsContradictionsOpen(true);
        }}
        onOpenMergeSuggestions={() => {
          setIsDatasetPreviewOpen(false);
          setIsMergeSuggestionsOpen(true);
        }}
        onUpdateRawText={(newText) => {
          setRawText(newText);
          setInputText(newText);
          handleExtract(newText);
        }}
        isExtractingText={isLoading}
      />

      {/* ── PHASE 2 PANELS ── */}
      <MergeSuggestionsPanel
        isOpen={isMergeSuggestionsOpen}
        onClose={() => setIsMergeSuggestionsOpen(false)}
        isDark={isDark}
      />

      <ContradictionReviewPanel
        isOpen={isContradictionsOpen}
        onClose={() => setIsContradictionsOpen(false)}
        isDark={isDark}
      />

      <AnalyticsDashboard
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        isDark={isDark}
      />


      {/* ── Global loading toast ── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono font-semibold"
            style={{
              background: 'var(--accent-purple)',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(108,92,231,0.5)',
            }}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing with Gemini…
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SETTINGS MODAL ── */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(13,14,18,0.78)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--accent-cyan-dim)', border: '1px solid rgba(34,211,238,0.25)' }}
                  >
                    <Settings className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      CortexGraph Settings
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Manage AI engines, models, and simulators
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* AI Model Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
                    Active LLM Provider &amp; Model
                  </label>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {/* Gemini Group */}
                    <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-purple-400 mt-1 mb-1">
                      Google Gemini Models
                    </p>
                    {[
                      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Fast, efficient context reasoning & extraction (Default)' },
                      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', desc: 'Deep structure extraction and reasoning' },
                      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Next-gen high speed entity mapping' }
                    ].map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setSettingsModel(model.id)}
                        className="w-full text-left px-3 py-2 rounded-xl border flex items-start gap-2.5 transition-all"
                        style={{
                          background: settingsModel === model.id ? 'var(--accent-purple-dim)' : 'var(--bg-overlay)',
                          borderColor: settingsModel === model.id ? 'var(--accent-purple)' : 'var(--border-subtle)'
                        }}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {settingsModel === model.id ? (
                            <div className="w-4 h-4 rounded-full bg-[#6c5ce7] flex items-center justify-center text-white">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-zinc-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {model.label}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {model.desc}
                          </p>
                        </div>
                      </button>
                    ))}

                    {/* Groq LPU Group */}
                    <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400 mt-3 mb-1 flex items-center justify-between">
                      <span>Groq LPU Models (Ultra High Speed)</span>
                      <span className="text-[8px] bg-cyan-500/10 px-1.5 py-0.5 rounded text-cyan-400 border border-cyan-500/20 font-bold">CONFIGURED</span>
                    </p>
                    {[
                      { id: 'groq/llama-3.3-70b-versatile', label: 'Groq Llama 3.3 70B', desc: '70B state-of-the-art Llama model on Groq LPU' },
                      { id: 'groq/llama-3.1-8b-instant', label: 'Groq Llama 3.1 8B Instant', desc: 'Sub-100ms ultra low-latency extraction' },
                      { id: 'groq/mixtral-8x7b-32768', label: 'Groq Mixtral 8x7B', desc: '32K context MoE architecture on Groq' },
                      { id: 'groq/gemma2-9b-it', label: 'Groq Gemma 2 9B', desc: 'Gemma 2 instruction-tuned model on Groq' }
                    ].map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setSettingsModel(model.id)}
                        className="w-full text-left px-3 py-2 rounded-xl border flex items-start gap-2.5 transition-all"
                        style={{
                          background: settingsModel === model.id ? 'rgba(34,211,238,0.12)' : 'var(--bg-overlay)',
                          borderColor: settingsModel === model.id ? 'var(--accent-cyan)' : 'var(--border-subtle)'
                        }}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {settingsModel === model.id ? (
                            <div className="w-4 h-4 rounded-full bg-[#22d3ee] flex items-center justify-center text-black font-bold">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-zinc-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {model.label}
                            </p>
                            <span className="text-[8px] font-mono px-1 py-0.2 rounded text-cyan-400 bg-cyan-500/10">GROQ</span>
                          </div>
                          <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {model.desc}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Physics settings */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
                    Graph Physics Speed
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['slow', 'normal', 'fast'].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setPhysicsSpeed(speed)}
                        className="py-1.5 rounded-lg border text-xs font-mono font-semibold uppercase transition-all"
                        style={{
                          background: physicsSpeed === speed ? 'rgba(34,211,238,0.1)' : 'var(--bg-overlay)',
                          borderColor: physicsSpeed === speed ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                          color: physicsSpeed === speed ? 'var(--accent-cyan)' : 'var(--text-secondary)'
                        }}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Engine Connectivity Status */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
                    Integration Status
                  </label>
                  <div className="p-3 rounded-xl border space-y-2" style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <Database className="w-3.5 h-3.5" /> Neo4j Engine
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-emerald-400">ONLINE</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <Cpu className="w-3.5 h-3.5" /> FastAPI Service
                      </span>
                      <span className={`font-mono text-[10px] font-semibold ${isEngineOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isEngineOnline ? 'ONLINE' : 'STANDALONE FALLBACK'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: 'var(--accent-purple)',
                    color: '#fff',
                  }}
                >
                  Save Settings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
