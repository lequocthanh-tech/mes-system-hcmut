/* Hallmark · component: QualityDetailTab · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled
 * contrast: WCAG AA Pass
 */

import React, { useState } from 'react';
import { useQuality } from '../../context/QualityContext';
import { 
  FileCheck2, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowLeft, 
  Layers, 
  Scale, 
  Clock, 
  Flame, 
  Lock, 
  Download, 
  ShieldAlert, 
  UserCheck, 
  FileText,
  ThermometerSnowflake,
  RotateCw,
  GitFork,
  PackageCheck,
  FileSignature,
  Server,
  ShieldCheck,
  Activity,
  FileCode
} from 'lucide-react';
import { BatchDisposition } from '../../types/quality';
import { EbrSignatureModal } from './EbrSignatureModal';
import { IsaB2mmlExportModal } from '../isa/IsaB2mmlExportModal';

export const QualityDetailTab: React.FC = () => {
  const { 
    selectedReportId, 
    selectedBatch, 
    currentBatchDetails, 
    hasCriticalFailure,
    dispositionBatch,
    setActiveSubTab,
    lotGenealogy
  } = useQuality();

  const [notes, setNotes] = useState<string>(selectedBatch?.reviewerNotes || '');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [isEbrSignModalOpen, setIsEbrSignModalOpen] = useState<boolean>(false);
  const [isIsaModalOpen, setIsIsaModalOpen] = useState<boolean>(false);

  const isPass = selectedBatch?.status === 'PASS (RELEASE READY)' || (selectedBatch?.status === 'PASS' && selectedBatch?.disposition === 'RELEASED');
  const isWarning = selectedBatch?.status === 'WARNING (HOLD)';
  const currentDisposition: BatchDisposition = selectedBatch?.disposition || (isPass ? 'RELEASED' : 'QUARANTINED');

  const handleQuarantine = () => {
    const res = dispositionBatch(selectedReportId, 'QUARANTINED', notes);
    setFeedbackMsg({ text: res.message, type: res.success ? 'error' : 'info' });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleApproveRelease = () => {
    setIsEbrSignModalOpen(true);
  };

  const handleExportCertificate = () => {
    setShowPdfModal(true);
  };

  const getParameterIcon = (phaseId: string, paramName: string) => {
    if (paramName.includes('Temp') || phaseId.includes('HEATING')) {
      return <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    }
    if (phaseId.includes('COOLING')) {
      return <ThermometerSnowflake className="w-3.5 h-3.5 text-sky-600 shrink-0" />;
    }
    if (phaseId.includes('MIXING')) {
      return <RotateCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    }
    return <Scale className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Top Breadcrumb & Return Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          className="h-9 flex items-center gap-1.5 px-3.5 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 text-xs font-semibold uppercase tracking-wider transition-all hallmark-focus active:translate-y-px rounded-xs shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Quality Overview</span>
        </button>

        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
          <span>REPORT: <strong className="text-slate-900">{selectedBatch?.reportCode || `QAR-2026-${selectedReportId.toString().padStart(3, '0')}`}</strong></span>
          <span>•</span>
          <span>WORK ORDER: <strong className="text-slate-900">{selectedBatch?.orderId || 'WO-2026-001'}</strong></span>
          <span>•</span>
          <span>RECIPE: <strong className="text-slate-900">{selectedBatch?.recipeId || 'RCP-MILK-UHT-01'}</strong></span>
        </div>
      </div>

      {/* 1. Batch Information Banner Card */}
      <div className="bg-white border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Left: Batch Title & Checked Timestamp */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-slate-900 text-white flex items-center justify-center font-bold text-sm font-mono rounded-xs shadow-xs">
            Q{selectedReportId}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 tracking-tight font-mono not-italic uppercase">
                Batch #{selectedReportId} Quality Verification
              </h2>
              <span className="text-[11px] text-slate-500 font-normal">
                ({selectedBatch?.recipeName} {selectedBatch?.recipeVersion})
              </span>
            </div>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1 font-mono">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Checked at: <strong className="text-slate-700">{selectedBatch?.checkedAt || '2026-09-07 08:46 AM'}</strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                Lead Inspector: <strong className="text-slate-700">QA-ENG-LEAD (HACCP Level 3)</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Overall Status Badge & Aggregate Error */}
        <div className="flex items-center gap-5">
          {/* Aggregate Deviation Metric */}
          <div className="text-right border-r border-slate-200 pr-5">
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Mean Deviation</span>
            <span className={`text-base font-bold font-mono ${isPass ? 'text-emerald-700' : isWarning ? 'text-amber-700' : 'text-rose-700'}`}>
              {selectedBatch ? (selectedBatch.avgError > 0 ? `+${selectedBatch.avgError.toFixed(2)}%` : `${selectedBatch.avgError.toFixed(2)}%`) : '0.00%'}
            </span>
          </div>

          {/* Overall Status Badge */}
          <div>
            {isPass ? (
              <div className="px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center gap-2 rounded-xs shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>OVERALL: PASS (RELEASE READY)</span>
              </div>
            ) : isWarning ? (
              <div className="px-4 py-2 bg-amber-50 border border-amber-300 text-amber-800 font-bold text-xs flex items-center gap-2 rounded-xs shadow-xs">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>OVERALL: WARNING (HOLD)</span>
              </div>
            ) : (
              <div className="px-4 py-2 bg-rose-50 border border-rose-300 text-rose-800 font-bold text-xs flex items-center gap-2 rounded-xs shadow-xs">
                <ShieldAlert className="w-4 h-4 text-rose-700 animate-pulse" />
                <span>OVERALL: FAIL (QUARANTINE)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Critical Deviation Warning (if FAIL or CCP Breach) */}
      {!isPass && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3 shadow-xs">
          <Flame className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[11px] text-rose-900 bg-rose-200/80 px-2 py-0.5 rounded-xs border border-rose-300">
                CRITICAL QUALITY DEFECT IDENTIFIED (CCP-1 BREACH)
              </span>
              <span className="text-[11px] text-rose-700 font-semibold">
                Automatic Quarantine Interlock Engaged
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-800 font-mono">
              Parameter <strong>PH_HEATING (Sterilization Temp)</strong> reached only <strong>131.5 °C</strong> against scripted setpoint <strong>138.0 °C</strong> (Diff: -4.71%, exceeding critical safety tolerance ±1.0%). Batch fails microbiological safety hold criteria under HACCP Annex 4.
            </p>
          </div>
        </div>
      )}

      {/* Feedback Toast Notification */}
      {feedbackMsg && (
        <div className={`p-3 border text-xs flex items-center gap-2 font-mono ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : feedbackMsg.type === 'error'
            ? 'bg-rose-50 border-rose-300 text-rose-900'
            : 'bg-blue-50 border-blue-300 text-blue-900'
        }`}>
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 2. Dynamic Inspection Matrix Table */}
      <div className="bg-white border border-slate-200 shadow-xs flex flex-col">
        <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-slate-700" />
            <span className="font-bold text-slate-900 uppercase tracking-wide">
              ISA-88 Dynamic Process Parameter Inspection Matrix
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Automated evaluation of SCADA Historian readback vs Formulation Setpoints
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] uppercase font-bold">
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-36">Phase ID</th>
                <th className="py-2.5 px-3 border-r border-slate-200">Parameter / Material Name</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-32">Set Value (SP)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-32">Actual Value (PV)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Diff %</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">Tolerance (±%)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">Result</th>
                <th className="py-2.5 px-3 text-center w-40">HACCP Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[11px]">
              {currentBatchDetails.map((item) => {
                const isItemPass = item.result === 'PASS';
                const isCcp = item.isCritical;

                return (
                  <tr
                    key={item.qualityId}
                    className={`hover:bg-slate-50 transition-colors ${!isItemPass ? 'bg-rose-50/25' : ''}`}
                  >
                    {/* Phase ID */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-800 text-center">
                      <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded-xs text-[10px]">
                        {item.phaseId || `PH_${item.qualityId}`}
                      </span>
                    </td>

                    {/* Parameter / Material Name */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        {getParameterIcon(item.phaseId || '', item.parameterName)}
                        <span>{item.parameterName}</span>
                      </div>
                    </td>

                    {/* Set Value (SP) */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right font-bold text-blue-700">
                      {item.setValue.toFixed(1)} {item.unit}
                    </td>

                    {/* Actual Value (PV) */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right font-bold text-slate-900">
                      {item.actualValue.toFixed(1)} {item.unit}
                    </td>

                    {/* Diff % */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right font-bold">
                      <span className={isItemPass ? 'text-slate-800' : 'text-rose-700 font-bold'}>
                        {item.diffPercent > 0 ? `+${item.diffPercent.toFixed(2)}%` : `${item.diffPercent.toFixed(2)}%`}
                      </span>
                    </td>

                    {/* Tolerance (±%) */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center text-slate-600">
                      ±{item.tolerancePercent.toFixed(1)}%
                    </td>

                    {/* Result */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center">
                      {isItemPass ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-[#DCFCE7] text-[#166534] border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-[#166534]" />
                          PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-[#FEE2E2] text-[#991B1B] border border-rose-300 animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-[#991B1B]" />
                          FAIL
                        </span>
                      )}
                    </td>

                    {/* HACCP Category */}
                    <td className="py-2.5 px-3 text-center">
                      {isCcp ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-rose-100 text-rose-800 border border-rose-300">
                          <ShieldAlert className="w-3 h-3 text-rose-700" />
                          CRITICAL (CCP)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-300">
                          STANDARD QUALITY
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-[10px] text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>DISPENSING &amp; THERMAL PARAMETER COMPLIANCE MATRIX</span>
          </div>
          <div>
            <span>FORMULA: Diff% = ((PV - SP) / SP) * 100%</span>
          </div>
        </div>
      </div>

      {/* 3. HACCP CRITICAL CONTROL POINTS (CCP) AUDIT CARDS */}
      <div className="border border-slate-200 bg-white rounded-xs shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 uppercase">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>HACCP CRITICAL CONTROL POINTS (CCP) CONFORMITY AUDIT</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">ISO 22000 / PM-QUALITY VETO STANDARD</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* CCP-01 */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-600" />
                CCP-01: Thermal Sterilization
              </span>
              <span className="px-1.5 py-0.5 rounded-xs font-bold text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                PASS
              </span>
            </div>
            <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
              <div>Target: <strong className="text-slate-800">138.0 °C</strong> (Tol: ±1.0°C)</div>
              <div>Actual (PV): <strong className="text-emerald-700">138.2 °C</strong> (Diff: +0.14%)</div>
              <div className="text-[10px] text-slate-500">Pathogen Log-Reduction Destruction</div>
            </div>
          </div>

          {/* CCP-02 */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-600" />
                CCP-02: Holding Residence
              </span>
              <span className="px-1.5 py-0.5 rounded-xs font-bold text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                PASS
              </span>
            </div>
            <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
              <div>Target: <strong className="text-slate-800">≥ 4.0 s</strong> (UHT Tube)</div>
              <div>Actual (PV): <strong className="text-emerald-700">4.2 s</strong> (Conforming)</div>
              <div className="text-[10px] text-slate-500">Continuous Holding Tube Resident Time</div>
            </div>
          </div>

          {/* CCP-03 */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-600" />
                CCP-03: pH &amp; Brix Limits
              </span>
              <span className="px-1.5 py-0.5 rounded-xs font-bold text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                PASS
              </span>
            </div>
            <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
              <div>pH: <strong className="text-emerald-700">6.68</strong> (Spec: [6.50-6.85])</div>
              <div>Brix: <strong className="text-emerald-700">12.05 °Bx</strong> (Spec: [11.5-12.5])</div>
              <div className="text-[10px] text-slate-500">Inline Sensory &amp; Acid-Base Verification</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. END-TO-END LOT GENEALOGY & FOOD SAFETY TRACEABILITY TREE */}
      <div className="bg-white border border-slate-200 shadow-xs flex flex-col rounded-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-emerald-400" />
            <span className="font-bold uppercase tracking-wider text-xs not-italic">
              End-to-End Lot Genealogy &amp; Food Safety Traceability (Phả Hệ Lô Hàng)
            </span>
          </div>
          <span className="text-[11px] text-slate-300 font-mono">
            Inbound Silo Lots ➔ Process Trace &amp; Mass Balance ➔ Finished Goods Lot
          </span>
        </div>

        <div className="p-5 space-y-4 bg-slate-50/50">
          {/* Tier 1: Inbound Raw Material Lots */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[10px]">1</span>
              <span>Nguyên Liệu Đầu Vào (Inbound Raw Material Lots from Material_Stock / Input):</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Tank 1 */}
              <div className="p-3 bg-white border border-slate-200 rounded-xs shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">TANK-01 (Sữa Tươi)</span>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] rounded-xs">VERIFIED</span>
                </div>
                <div className="text-[11px] text-slate-600 font-mono space-y-0.5">
                  <div>Mã Lô: <strong className="text-slate-900">{lotGenealogy?.raw_materials?.[0]?.lot_number || 'LOT-RM-20261028-01'}</strong></div>
                  <div>Nhà Cung Cấp: <span className="text-slate-700">{lotGenealogy?.raw_materials?.[0]?.supplier || 'Vinamilk Farm #3 (Lâm Đồng)'}</span></div>
                  <div>Lượng Dosed: <strong className="text-slate-900">{lotGenealogy?.raw_materials?.[0]?.dosed_quantity || 850.0} L</strong> (85.0%)</div>
                </div>
              </div>

              {/* Tank 2 */}
              <div className="p-3 bg-white border border-slate-200 rounded-xs shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">TANK-02 (Đường RE)</span>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] rounded-xs">VERIFIED</span>
                </div>
                <div className="text-[11px] text-slate-600 font-mono space-y-0.5">
                  <div>Mã Lô: <strong className="text-slate-900">{lotGenealogy?.raw_materials?.[1]?.lot_number || 'LOT-SUG-20261027-04'}</strong></div>
                  <div>Nhà Cung Cấp: <span className="text-slate-700">{lotGenealogy?.raw_materials?.[1]?.supplier || 'Biên Hòa Sugar Corporation'}</span></div>
                  <div>Lượng Dosed: <strong className="text-slate-900">{lotGenealogy?.raw_materials?.[1]?.dosed_quantity || 100.0} kg</strong> (10.0%)</div>
                </div>
              </div>

              {/* Tank 3 */}
              <div className="p-3 bg-white border border-slate-200 rounded-xs shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">TANK-03 (Phụ Gia Vi Chất)</span>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] rounded-xs">VERIFIED</span>
                </div>
                <div className="text-[11px] text-slate-600 font-mono space-y-0.5">
                  <div>Mã Lô: <strong className="text-slate-900">{lotGenealogy?.raw_materials?.[2]?.lot_number || 'LOT-ADD-20261026-02'}</strong></div>
                  <div>Nhà Cung Cấp: <span className="text-slate-700">{lotGenealogy?.raw_materials?.[2]?.supplier || 'DSM Nutritional Products'}</span></div>
                  <div>Lượng Dosed: <strong className="text-slate-900">{lotGenealogy?.raw_materials?.[2]?.dosed_quantity || 50.0} L</strong> (5.0%)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Connecting Flow Arrow */}
          <div className="flex items-center justify-center">
            <div className="h-4 w-px bg-slate-300"></div>
          </div>

          {/* Tier 2: Process Execution Trace & Mass Balance */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center text-[10px]">2</span>
              <span>Thực Thi Chế Biến &amp; Cân Bằng Vật Chất (Process Execution Trace &amp; Mass Balance):</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Process Cell Trace */}
              <div className="p-3.5 bg-white border border-slate-200 rounded-xs space-y-1.5">
                <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1">
                  PROCESS CELL 1 (MIXING &amp; UHT STERILIZATION):
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-700">
                  <div>Nhiệt Độ Đỉnh: <strong className="text-emerald-700">138.2 °C</strong> (CCP-01 PASS)</div>
                  <div>Thời Gian Giữ Ống: <strong className="text-emerald-700">4.2 s</strong> (CCP-02 PASS)</div>
                  <div>Độ Kiềm/Axit: <strong className="text-emerald-700">6.68 pH</strong> (CCP-03 PASS)</div>
                  <div>Độ Ngọt Brix: <strong className="text-emerald-700">12.05 °Bx</strong> (CCP-03 PASS)</div>
                </div>
              </div>

              {/* Mass Balance Verification */}
              <div className="p-3.5 bg-white border border-slate-200 rounded-xs space-y-1.5">
                <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1">
                  CÂN BẰNG VẬT CHẤT &amp; HAO HỤT (MASS BALANCE):
                </span>
                <div className="space-y-1 text-[11px] font-mono text-slate-700">
                  <div className="flex justify-between">
                    <span>Tổng nạp nguyên liệu (Input In):</span>
                    <strong>{lotGenealogy?.process_execution_trace?.mass_balance?.total_input_kg_l || 1000.0} L</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Sản lượng thành phẩm (Output Out):</span>
                    <strong>{lotGenealogy?.process_execution_trace?.mass_balance?.total_output_l || selectedBatch?.totalProduced || 998.5} L</strong>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-100 pt-1">
                    <span>Hao hụt bay hơi / đọng ống:</span>
                    <span className="text-emerald-700">
                      {lotGenealogy?.process_execution_trace?.mass_balance?.loss_quantity || 1.5} L 
                      ({lotGenealogy?.process_execution_trace?.mass_balance?.loss_percent || 0.15}%, Limit ≤ 0.50%) - VERIFIED
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connecting Flow Arrow */}
          <div className="flex items-center justify-center">
            <div className="h-4 w-px bg-slate-300"></div>
          </div>

          {/* Tier 3: Output Finished Goods Lot */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">3</span>
              <span>Lô Thành Phẩm Xuất Xưởng (Output Finished Goods Lot):</span>
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-300 rounded-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-sm text-slate-900 uppercase">
                    {lotGenealogy?.finished_goods_lot?.lot_id || `LOT-FG-${selectedBatch?.orderId || 'WO-001'}-20261029`}
                  </span>
                  <span className="px-2 py-0.5 rounded-xs font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {lotGenealogy?.finished_goods_lot?.disposition || 'RELEASED'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 font-mono flex flex-wrap gap-4">
                  <span>Sản phẩm: <strong className="text-slate-800">{selectedBatch?.recipeName}</strong></span>
                  <span>Thể tích: <strong className="text-slate-800">{selectedBatch?.totalProduced} L</strong></span>
                  <span>HSD: <strong className="text-slate-800">{lotGenealogy?.finished_goods_lot?.expiry_date || '2026-11-28'}</strong></span>
                </div>
              </div>

              {/* Odoo ERP Uplink Badge */}
              <div className="flex items-center gap-2 text-xs font-mono bg-white border border-emerald-300 px-3 py-2 rounded-xs shadow-2xs">
                <Server className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="font-bold text-slate-900">ODOO ERP UPLINK</div>
                  <div className="text-[10px] text-slate-500">
                    MO Ref: <strong>{lotGenealogy?.finished_goods_lot?.erp_mo_reference || `MO/${selectedBatch?.orderId}`}</strong> · Trạng thái: <strong className="text-emerald-700">DONE (ĐÃ ĐÓNG)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Electronic Batch Release & QA Decision Panel (Bottom Card) */}
      <div className="bg-white border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-800" />
            <h3 className="font-bold text-slate-900 uppercase tracking-wide text-xs">
              FDA 21 CFR Part 11 Electronic Batch Record (EBR) Release &amp; QA Decision
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-slate-500">CURRENT STATUS:</span>
            {currentDisposition === 'RELEASED' ? (
              <span className="px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xs">
                RELEASED TO PACKAGING
              </span>
            ) : currentDisposition === 'QUARANTINED' ? (
              <span className="px-2 py-0.5 font-bold bg-rose-100 text-rose-800 border border-rose-300 rounded-xs">
                QUARANTINED / HOLD
              </span>
            ) : (
              <span className="px-2 py-0.5 font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-xs">
                PENDING REVIEW
              </span>
            )}
          </div>
        </div>

        {/* If Electronically Signed: Show Official Digital Signature Verification Badge */}
        {(selectedBatch?.isElectronicallySigned || lotGenealogy?.signature?.is_signed) && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>ELECTRONICALLY SIGNED &amp; VERIFIED UNDER FDA 21 CFR PART 11</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono text-emerald-900">
              <div>Người ký (Signer): <strong>{selectedBatch?.signedBy || lotGenealogy?.signature?.signed_by || 'qa_supervisor_01'} ({selectedBatch?.signerRole || lotGenealogy?.signature?.signer_role || 'Supervisor'})</strong></div>
              <div>Thời gian ký: <strong>{selectedBatch?.signedAt || lotGenealogy?.signature?.timestamp || selectedBatch?.checkedAt}</strong></div>
              <div className="col-span-1 md:col-span-2">
                Ý nghĩa chữ ký: <em>"{lotGenealogy?.signature?.signature_meaning || 'I verify that all CCPs meet HACCP standards and authorize batch release'}"</em>
              </div>
              <div className="col-span-1 md:col-span-2">
                Cryptographic SHA-256 Hash: <code className="bg-emerald-100/80 px-1 py-0.5 rounded-xs text-[10px] break-all">{selectedBatch?.signatureHash || lotGenealogy?.signature?.signature_hash || '7f9a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b'}</code>
              </div>
            </div>
          </div>
        )}

        {/* Disposition Form & Reviewer Notes */}
        <div className="space-y-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
            QA Reviewer Notes &amp; Root Cause Observations:
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document QA evaluation, deviation root causes, lab assay results, and disposition rationale..."
            className="w-full bg-slate-50 border border-slate-300 p-3 text-xs font-mono text-slate-800 rounded-xs focus:bg-white focus:border-slate-800 focus:outline-none transition-colors"
          />
        </div>

        {/* Safety Gate Warning on Critical Breach */}
        {hasCriticalFailure && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2 font-mono">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-bold uppercase tracking-wider">
              HACCP CCP VETO INTERLOCK ENGAGED:
            </span>
            <span>
              Critical Control Point (CCP) breached. Industrial food safety interlock prevents releasing this batch without authorized CAPA justification.
            </span>
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Left: Certificate & BatchML EBR Export */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCertificate}
              className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export QA Certificate (PDF)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsIsaModalOpen(true)}
              className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
              title="Preview and Export ANSI/ISA-88 BatchML Electronic Batch Record (.json)"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-600" />
              <span>Export BatchML EBR</span>
            </button>
          </div>

          {/* Right: Decision Actions (Reject/Quarantine vs Approve/Release) */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleQuarantine}
              className="h-9 px-4 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Reject &amp; Quarantine Batch</span>
            </button>

            <button
              type="button"
              onClick={handleApproveRelease}
              className="h-9 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
              title="Ký số điện tử và phát hành lô theo chuẩn FDA 21 CFR Part 11"
            >
              <FileSignature className="w-3.5 h-3.5 text-white" />
              <span>✍ Ký Số &amp; Phát Hành Lô (EBR Release)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Standard Industrial Batch Certificate Export Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-2xl w-full p-6 space-y-5 font-mono text-xs">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase">
                  Certificate of Quality Analysis (CoA)
                </h3>
                <span className="text-[10px] text-slate-500">
                  ISO 22000 / HACCP COMPLIANCE RECORD • ISA-95 LEVEL 3 MOM
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="h-8 px-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 space-y-2 text-slate-800">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><strong>Certificate Ref:</strong> CoA-2026-{selectedReportId.toString().padStart(4, '0')}</div>
                <div><strong>Inspection Date:</strong> {selectedBatch?.checkedAt}</div>
                <div><strong>Work Order:</strong> {selectedBatch?.orderId}</div>
                <div><strong>Recipe:</strong> {selectedBatch?.recipeId} ({selectedBatch?.recipeName})</div>
                <div><strong>Batch Volume:</strong> {selectedBatch?.totalProduced} L</div>
                <div><strong>Quality Disposition:</strong> <span className={isPass ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{currentDisposition}</span></div>
              </div>

              <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
                <strong>Auditor Assessment:</strong> {notes || selectedBatch?.reviewerNotes || 'Standard evaluation recorded.'}
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Digital Certificate Signed: SHA-256 Validated • Authorized by Quality Engineering Lead</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs uppercase rounded-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  alert(`Certificate of Analysis (CoA-2026-${selectedReportId.toString().padStart(4, '0')}) exported to MES Document Store.`);
                  setShowPdfModal(false);
                }}
                className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs uppercase flex items-center gap-1.5 rounded-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Certified PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FDA 21 CFR Part 11 Electronic Signature Modal */}
      {selectedBatch && (
        <EbrSignatureModal
          isOpen={isEbrSignModalOpen}
          onClose={() => setIsEbrSignModalOpen(false)}
          orderCode={selectedBatch.orderId}
          reportCode={selectedBatch.reportCode}
          recipeName={selectedBatch.recipeName}
          volume={selectedBatch.totalProduced}
          initialDisposition={currentDisposition === 'QUARANTINED' ? 'QUARANTINED' : 'RELEASED'}
          onSuccess={(res) => {
            setFeedbackMsg({
              text: `EBR released with FDA 21 CFR Part 11 signature. Hash: ${res.signature_hash.substring(0, 12)}...`,
              type: 'success'
            });
            setTimeout(() => setFeedbackMsg(null), 5000);
          }}
        />
      )}

      {/* MESA BATCHML EBR EXPORT MODAL */}
      <IsaB2mmlExportModal
        isOpen={isIsaModalOpen}
        onClose={() => setIsIsaModalOpen(false)}
        initialSchema="bpr"
        initialOrderId={selectedBatch?.orderId || 'WH/MO/00002'}
      />
    </div>
  );
};
