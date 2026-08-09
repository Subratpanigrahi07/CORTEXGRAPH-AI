import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, Clock, Cpu, Search, Shield, GitMerge, Database } from 'lucide-react';
import { getPipelineStatus, type PipelineStatus as PipelineStatusType } from '../utils/api';

interface PipelineStatusProps {
  jobId: string | null;
  documentId?: string | null;
  onComplete?: () => void;
}

const STEP_CONFIG: Record<string, { icon: typeof Cpu; label: string; color: string }> = {
  EXTRACTING: { icon: Search, label: 'Extracting Entities', color: '#6c5ce7' },
  VERIFYING: { icon: Shield, label: 'Verifying Claims', color: '#f59e0b' },
  RESOLVING: { icon: GitMerge, label: 'Resolving Entities', color: '#22d3ee' },
  BUILDING: { icon: Database, label: 'Building Graph', color: '#10b981' },
  COMPLETED: { icon: Check, label: 'Pipeline Complete', color: '#10b981' },
  FAILED: { icon: AlertCircle, label: 'Pipeline Failed', color: '#ef4444' },
  DIFFING: { icon: Search, label: 'Diffing Changes', color: '#8b5cf6' },
};

const PIPELINE_STEPS = ['EXTRACTING', 'VERIFYING', 'RESOLVING', 'BUILDING'];

export function PipelineStatusIndicator({ jobId, documentId, onComplete }: PipelineStatusProps) {
  const [status, setStatus] = useState<PipelineStatusType | null>(null);
  const [polling, setPolling] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getPipelineStatus(jobId);
      setStatus(data);

      if (data.overall_status === 'completed' || data.overall_status === 'failed') {
        setPolling(false);
        if (data.overall_status === 'completed' && onComplete) {
          onComplete();
        }
      }
    } catch {
      console.warn('Failed to fetch pipeline status');
    }
  }, [jobId, onComplete]);

  useEffect(() => {
    if (jobId) {
      setPolling(true);
      fetchStatus();
    }
  }, [jobId, fetchStatus]);

  useEffect(() => {
    if (!polling || !jobId) return;
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [polling, jobId, fetchStatus]);

  if (!jobId || !status) return null;

  const currentStep = status.current_step?.toUpperCase() || status.celery_state || 'PENDING';
  const isComplete = status.overall_status === 'completed';
  const isFailed = status.overall_status === 'failed';
  const isPending = status.overall_status === 'pending';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        className="rounded-xl border overflow-hidden"
        style={{
          background: 'var(--bg-overlay)',
          borderColor: isComplete ? 'rgba(16,185,129,0.2)' : isFailed ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-emerald-400" />
              </div>
            ) : isFailed ? (
              <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-3 h-3 text-red-400" />
              </div>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-purple)' }} />
            )}
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {isComplete ? 'Agent Pipeline Complete' : isFailed ? 'Pipeline Failed' : 'Agent Pipeline Running'}
            </span>
          </div>
          {status.detail && (
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
              {status.detail}
            </span>
          )}
        </div>

        {/* Step progress bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1">
            {PIPELINE_STEPS.map((step, i) => {
              const stepIdx = PIPELINE_STEPS.indexOf(currentStep);
              const isActive = step === currentStep;
              const isDone = isComplete || (stepIdx >= 0 && i < stepIdx);
              const config = STEP_CONFIG[step] || STEP_CONFIG['EXTRACTING'];
              const StepIcon = config.icon;

              return (
                <div key={step} className="flex items-center gap-1 flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-all"
                      style={{
                        background: isDone ? config.color : isActive ? `${config.color}80` : 'var(--bg-base)',
                        border: `1.5px solid ${isDone || isActive ? config.color : 'var(--border-subtle)'}`,
                      }}
                    >
                      {isDone ? (
                        <Check className="w-3 h-3" />
                      ) : isActive ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <StepIcon className="w-3 h-3" style={{ color: 'var(--text-dim)' }} />
                      )}
                    </div>
                    <span className="text-[8px] font-mono mt-1 text-center" style={{
                      color: isDone || isActive ? config.color : 'var(--text-dim)'
                    }}>
                      {config.label.split(' ')[0]}
                    </span>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div
                      className="h-0.5 flex-1 rounded-full mt-[-12px]"
                      style={{
                        background: isDone ? config.color : 'var(--border-subtle)',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Result summary */}
        {isComplete && status.result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 pb-3"
          >
            <div className="flex gap-3 flex-wrap">
              {status.result.entities_created != null && (
                <ResultBadge label="Entities" value={status.result.entities_created} color="#6c5ce7" />
              )}
              {status.result.relationships_created != null && (
                <ResultBadge label="Relations" value={status.result.relationships_created} color="#22d3ee" />
              )}
              {status.result.entities_merged != null && status.result.entities_merged > 0 && (
                <ResultBadge label="Merged" value={status.result.entities_merged} color="#f59e0b" />
              )}
              {status.result.contradictions_found != null && status.result.contradictions_found > 0 && (
                <ResultBadge label="Conflicts" value={status.result.contradictions_found} color="#ef4444" />
              )}
            </div>
          </motion.div>
        )}

        {/* Error */}
        {isFailed && status.error && (
          <div className="px-4 pb-3">
            <p className="text-[11px] p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {status.error}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function ResultBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="text-[10px] font-mono px-2 py-1 rounded-lg flex items-center gap-1"
      style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
      <span className="font-bold">{value}</span> {label}
    </span>
  );
}
