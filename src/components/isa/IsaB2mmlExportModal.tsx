/* Hallmark · component: IsaB2mmlExportModal · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  FileCode,
  ShieldCheck,
  Layers,
  Database,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import * as api from '../../services/api';

export type IsaExportSchemaType = 'bpr' | 'recipe' | 'performance' | 'matrix';

export interface IsaB2mmlExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSchema?: IsaExportSchemaType;
  initialOrderId?: string;
  initialRecipeId?: string | number;
  availableOrders?: Array<{ orderId: string; recipeApplied?: string }>;
  availableRecipes?: Array<{ id: number | string; code: string; name: string }>;
}

export const IsaB2mmlExportModal: React.FC<IsaB2mmlExportModalProps> = ({
  isOpen,
  onClose,
  initialSchema = 'bpr',
  initialOrderId = 'WH/MO/00002',
  initialRecipeId = 1,
  availableOrders = [],
  availableRecipes = [],
}) => {
  const [selectedSchema, setSelectedSchema] = useState<IsaExportSchemaType>(initialSchema);
  const [targetOrderId, setTargetOrderId] = useState<string>(initialOrderId);
  const [targetRecipeId, setTargetRecipeId] = useState<string | number>(initialRecipeId);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadData, setPayloadData] = useState<any>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedSchema(initialSchema);
      if (initialOrderId) setTargetOrderId(initialOrderId);
      if (initialRecipeId) setTargetRecipeId(initialRecipeId);
      setCopied(false);
      setError(null);
    }
  }, [isOpen, initialSchema, initialOrderId, initialRecipeId]);

  useEffect(() => {
    if (isOpen) {
      fetchPayload();
    }
  }, [isOpen, selectedSchema, targetOrderId, targetRecipeId]);

  const fetchPayload = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let res: any = null;
      if (selectedSchema === 'bpr') {
        const orderKey = targetOrderId.trim() || 'WH/MO/00002';
        res = await api.getIsaBatchmlEbr(orderKey);
      } else if (selectedSchema === 'recipe') {
        const recipeKey = targetRecipeId || 1;
        res = await api.getIsaBatchmlRecipe(recipeKey);
      } else if (selectedSchema === 'performance') {
        const orderKey = targetOrderId.trim() || 'WH/MO/00002';
        res = await api.getIsaB2mmlPerformance(orderKey);
      } else if (selectedSchema === 'matrix') {
        res = await api.getIsaMappingMatrix();
      }
      setPayloadData(res?.data || res);
    } catch (err: any) {
      setError(err?.message || 'Failed to serialize standard payload.');
      setPayloadData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const jsonString = payloadData ? JSON.stringify(payloadData, null, 2) : '';

  const handleCopy = () => {
    if (!jsonString) return;
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    if (!jsonString) return;
    let fileName = 'BatchML-Export.json';
    if (selectedSchema === 'bpr') {
      fileName = `BatchML-BPR-${targetOrderId.replace(/[/\\?%*:|"<>]/g, '_')}.json`;
    } else if (selectedSchema === 'recipe') {
      fileName = `BatchML-MasterRecipe-${targetRecipeId}.json`;
    } else if (selectedSchema === 'performance') {
      fileName = `B2MML-OperationsPerformance-${targetOrderId.replace(/[/\\?%*:|"<>]/g, '_')}.json`;
    } else if (selectedSchema === 'matrix') {
      fileName = 'SQL-to-B2MML-SemanticMappingMatrix.json';
    }

    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="isa-export-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="bg-white border border-slate-300 shadow-xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* MODAL HEADER */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="isa-export-title"
                className="text-xs font-bold uppercase tracking-wider font-mono text-white"
                style={{ fontStyle: 'normal' }}
              >
                MESA B2MML &amp; BatchML Standard Export Center
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                ANSI/ISA-88 Part 1-4 &amp; ANSI/ISA-95 Part 2 · Schema Version 0600 · FDA 21 CFR Part 11
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-none"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SCHEMA SELECTOR STRIP (8-STATE DISCIPLINE) */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedSchema('bpr')}
              className={`h-9 px-3 text-xs font-mono font-semibold uppercase tracking-wider border flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none ${
                selectedSchema === 'bpr'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>BatchML EBR (BPR)</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSchema('recipe')}
              className={`h-9 px-3 text-xs font-mono font-semibold uppercase tracking-wider border flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none ${
                selectedSchema === 'recipe'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>BatchML Master Recipe</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSchema('performance')}
              className={`h-9 px-3 text-xs font-mono font-semibold uppercase tracking-wider border flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none ${
                selectedSchema === 'performance'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>B2MML Operations Performance</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSchema('matrix')}
              className={`h-9 px-3 text-xs font-mono font-semibold uppercase tracking-wider border flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none ${
                selectedSchema === 'matrix'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Mapping Matrix</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchPayload}
            disabled={isLoading}
            className="h-9 px-3 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-800 text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
            title="Refresh serialization payload"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
        </div>

        {/* TARGET CONTEXT PARAMETER BAR */}
        {(selectedSchema === 'bpr' || selectedSchema === 'performance' || selectedSchema === 'recipe') && (
          <div className="bg-slate-100/70 border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center gap-4 text-xs font-mono shrink-0">
            {selectedSchema !== 'recipe' ? (
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase">
                  Target Work Order (OrderCode / Order_ID):
                </label>
                {availableOrders.length > 0 ? (
                  <select
                    value={targetOrderId}
                    onChange={(e) => setTargetOrderId(e.target.value)}
                    className="h-9 px-3 bg-white border border-slate-300 text-slate-900 font-bold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                  >
                    {availableOrders.map((o) => (
                      <option key={o.orderId} value={o.orderId}>
                        {o.orderId} {o.recipeApplied ? `(${o.recipeApplied})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={targetOrderId}
                    onChange={(e) => setTargetOrderId(e.target.value)}
                    placeholder="e.g. WH/MO/00002"
                    className="h-9 px-3 bg-white border border-slate-300 text-slate-900 font-bold w-48 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase">
                  Target Master Recipe (Recipe_ID / Code):
                </label>
                {availableRecipes.length > 0 ? (
                  <select
                    value={targetRecipeId}
                    onChange={(e) => setTargetRecipeId(e.target.value)}
                    className="h-9 px-3 bg-white border border-slate-300 text-slate-900 font-bold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                  >
                    {availableRecipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.code}] {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(targetRecipeId)}
                    onChange={(e) => setTargetRecipeId(e.target.value)}
                    placeholder="e.g. 1 or RCP-01"
                    className="h-9 px-3 bg-white border border-slate-300 text-slate-900 font-bold w-48 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                  />
                )}
              </div>
            )}

            <div className="ml-auto text-[11px] text-slate-500 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-white border border-slate-300 font-bold text-slate-700">
                Namespace: {selectedSchema === 'performance' ? 'B2MML-V0600' : 'B2MML-V0600-BatchML'}
              </span>
            </div>
          </div>
        )}

        {/* ERROR NOTICE */}
        {error && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-2.5 text-xs font-mono text-rose-800 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* JSON PREVIEW AREA */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs text-slate-200 select-text">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
              <span>Serializing standardized MESA B2MML / BatchML payload...</span>
            </div>
          ) : jsonString ? (
            <pre className="whitespace-pre font-mono leading-relaxed text-[11.5px] text-slate-100">
              {jsonString}
            </pre>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">
              No payload data returned.
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] font-mono text-slate-500">
            {jsonString ? (
              <span>
                Payload Size:{' '}
                <strong className="text-slate-800">{(jsonString.length / 1024).toFixed(1)} KB</strong> (
                {jsonString.split('\n').length} lines)
              </span>
            ) : (
              <span>Standby</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!jsonString || isLoading}
              className="h-9 px-4 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-800 text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied JSON</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={!jsonString || isLoading}
              className="h-9 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .json</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-mono uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IsaB2mmlExportModal;
