/* Hallmark · component: QualityOverviewTab · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import { useQuality } from '../../context/QualityContext';
import { 
  Filter, 
  Eye, 
  Calendar, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Lock, 
  CheckCheck, 
  Layers,
  Settings,
  PlusCircle,
  RotateCw,
  Activity,
  Zap,
  FileSignature,
  ShieldAlert,
  FileCheck
} from 'lucide-react';
import { BatchQualityRecord, BatchDisposition, QualityTagConfigItem } from '../../types/quality';
import { QualityTagMappingModal } from './QualityTagMappingModal';
import { EbrSignatureModal } from './EbrSignatureModal';
import * as api from '../../services/api';

export const QualityOverviewTab: React.FC = () => {
  const {
    filteredBatchRecords,
    selectedReportId,
    setSelectedReportId,
    viewBatchDetail,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    applyDateFilter,
  } = useQuality();

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASS' | 'FAIL'>('ALL');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [isEbrSignModalOpen, setIsEbrSignModalOpen] = useState(false);
  const [qaTags, setQaTags] = useState<Record<string, QualityTagConfigItem | api.ModuleTagItem>>({});

  // New QA Inspection Form State
  const [formOrderCode, setFormOrderCode] = useState('WO-2026-001');
  const [formRecipeName, setFormRecipeName] = useState('Fresh Pasteurized UHT Milk');
  const [formPh, setFormPh] = useState<string>('6.70');
  const [formBrix, setFormBrix] = useState<string>('12.00');
  const [formTemp, setFormTemp] = useState<string>('138.0');
  const [formDisposition, setFormDisposition] = useState<BatchDisposition>('RELEASED');
  const [formInspector, setFormInspector] = useState('QA Lead Engineer');
  const [formNotes, setFormNotes] = useState('Automated inline sensor acquisition verified. Formulation compliant with ISO 22000 CCP standards.');
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);

  const fetchQaTags = async () => {
    try {
      const res = await api.getQualityTagMappings();
      if (res && res.tags) {
        setQaTags(res.tags);
      } else {
        const fallbackRes = await api.getModuleTagMappings('quality');
        if (fallbackRes.success && fallbackRes.tags) {
          setQaTags(fallbackRes.tags);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchQaTags();
    const interval = setInterval(fetchQaTags, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleAutoCaptureSensors = async () => {
    setIsAutoCapturing(true);
    setCaptureMessage(null);
    try {
      const res = await api.getQualityTagMappings();
      if (res && res.tags) {
        setQaTags(res.tags);
        const ph = res.tags['inline_ph_pv'] || res.tags['INLINE_PH_PV'];
        const brix = res.tags['inline_brix_pv'] || res.tags['INLINE_BRIX_PV'];
        const temp = res.tags['pasteur_hold_temp'] || res.tags['PASTEUR_HOLD_TEMP'];

        const isAnyMapped = Boolean(
          (ph?.node_id && ph.node_id.trim() && ph.node_id !== '[CHƯA ÁNH XẠ]') ||
          (brix?.node_id && brix.node_id.trim() && brix.node_id !== '[CHƯA ÁNH XẠ]') ||
          (temp?.node_id && temp.node_id.trim() && temp.node_id !== '[CHƯA ÁNH XẠ]')
        );

        if (!isAnyMapped) {
          setCaptureMessage('[THÔNG BÁO]: Các cảm biến chưa được ánh xạ Node ID. Vui lòng vào [CẤU HÌNH INLINE SENSORS] trước.');
          setTimeout(() => setCaptureMessage(null), 6000);
          return;
        }

        const phVal = ph?.value !== null && ph?.value !== undefined ? Number(ph.value).toFixed(2) : null;
        const brixVal = brix?.value !== null && brix?.value !== undefined ? Number(brix.value).toFixed(2) : null;
        const tempVal = temp?.value !== null && temp?.value !== undefined ? Number(temp.value).toFixed(1) : null;

        if (phVal) setFormPh(phVal);
        if (brixVal) setFormBrix(brixVal);
        if (tempVal) setFormTemp(tempVal);

        setCaptureMessage(`[ĐÃ LẤY SỐ ĐO TỰ ĐỘNG]: pH = ${phVal ?? '--'}, Brix = ${brixVal ?? '--'} °Bx, Temp = ${tempVal ?? '--'} °C từ Kepware OPC UA.`);
        setTimeout(() => setCaptureMessage(null), 6000);
      }
    } catch {
      setCaptureMessage('[CẢNH BÁO]: Không thể kết nối Kepware Gateway. Vui lòng kiểm tra cổng dịch vụ.');
    } finally {
      setIsAutoCapturing(false);
    }
  };

  const handleRowClick = (batch: BatchQualityRecord) => {
    setSelectedReportId(batch.reportId);
  };

  const handleRowDoubleClick = (batch: BatchQualityRecord) => {
    viewBatchDetail(batch.reportId);
  };

  const handleViewDetailClick = () => {
    viewBatchDetail(selectedReportId);
  };

  const displayedBatches = filteredBatchRecords.filter((b) => {
    if (statusFilter === 'PASS') return b.status === 'PASS';
    if (statusFilter === 'FAIL') return b.status === 'FAIL' || b.disposition === 'QUARANTINED';
    return true;
  });

  const getDispositionBadge = (disposition: BatchDisposition) => {
    switch (disposition) {
      case 'RELEASED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-emerald-100/70 text-emerald-800 border border-emerald-300">
            <CheckCheck className="w-3 h-3 text-emerald-700" />
            RELEASED
          </span>
        );
      case 'QUARANTINED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-rose-100/70 text-rose-800 border border-rose-300">
            <Lock className="w-3 h-3 text-rose-700" />
            QUARANTINED
          </span>
        );
      case 'PENDING_REVIEW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[10px] bg-amber-100/70 text-amber-800 border border-amber-300">
            <Clock className="w-3 h-3 text-amber-700" />
            PENDING REVIEW
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Filter Bar (Batch Filter) */}
      <div className="bg-white border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Left: Date Range Selectors & Quick Preset Filter */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Date Range Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="font-bold text-[11px] uppercase tracking-wider">
                Date Range:
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px]">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-white border border-slate-300 h-9 px-2.5 text-xs font-mono rounded-xs hallmark-focus"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px]">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-white border border-slate-300 h-9 px-2.5 text-xs font-mono rounded-xs hallmark-focus"
              />
            </div>

            <button
              type="button"
              onClick={applyDateFilter}
              className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Apply</span>
            </button>
          </div>

          {/* Quick Filter Presets */}
          <div className="flex items-center border border-slate-300 rounded-xs overflow-hidden h-9">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 h-full text-xs font-bold uppercase tracking-wider transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              All Batches
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PASS')}
              className={`px-3 h-full text-xs font-bold uppercase tracking-wider border-l border-slate-300 transition-colors ${
                statusFilter === 'PASS'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white text-slate-700 hover:bg-emerald-50'
              }`}
            >
              Pass Only
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('FAIL')}
              className={`px-3 h-full text-xs font-bold uppercase tracking-wider border-l border-slate-300 transition-colors ${
                statusFilter === 'FAIL'
                  ? 'bg-rose-700 text-white'
                  : 'bg-white text-slate-700 hover:bg-rose-50'
              }`}
            >
              Fail / Quarantined
            </button>
          </div>
        </div>

        {/* Right: Inspection Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEbrSignModalOpen(true)}
            className="h-9 px-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            title="Ký số điện tử và phát hành lệnh xuất xưởng hồ sơ lô điện tử (FDA 21 CFR Part 11)"
          >
            <FileSignature className="w-3.5 h-3.5 text-emerald-200" />
            <span>✍ KÝ SỐ &amp; PHÁT HÀNH LÔ (EBR)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTagModalOpen(true)}
            className="h-9 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            title="Cấu hình ánh xạ Kepware OPC UA Inline Quality Sensors (pH, Brix, Temp)"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span>CẤU HÌNH INLINE SENSORS</span>
          </button>

          <button
            type="button"
            onClick={() => setIsInspectionModalOpen(true)}
            className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>LẬP PHIẾU KIỂM NGHIỆM</span>
          </button>

          <button
            type="button"
            onClick={handleViewDetailClick}
            className="h-9 px-3.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            title="Open comprehensive batch quality inspection breakdown"
          >
            <Eye className="w-3.5 h-3.5 text-slate-700" />
            <span>Chi tiết mẻ</span>
          </button>
        </div>
      </div>

      {/* Live Quality Inline Sensor Telemetry Strip */}
      {(() => {
        const phTag = (qaTags['inline_ph_pv'] || qaTags['INLINE_PH_PV']) as (QualityTagConfigItem | undefined);
        const brixTag = (qaTags['inline_brix_pv'] || qaTags['INLINE_BRIX_PV']) as (QualityTagConfigItem | undefined);
        const tempTag = (qaTags['pasteur_hold_temp'] || qaTags['PASTEUR_HOLD_TEMP']) as (QualityTagConfigItem | undefined);

        const isPhMapped = Boolean(phTag?.node_id && phTag.node_id.trim() && phTag.node_id !== '[CHƯA ÁNH XẠ]');
        const isBrixMapped = Boolean(brixTag?.node_id && brixTag.node_id.trim() && brixTag.node_id !== '[CHƯA ÁNH XẠ]');
        const isTempMapped = Boolean(tempTag?.node_id && tempTag.node_id.trim() && tempTag.node_id !== '[CHƯA ÁNH XẠ]');

        const hasPhValue = isPhMapped && phTag?.value !== null && phTag?.value !== undefined;
        const isPhOutOfSpec = hasPhValue && (Number(phTag?.value) < (phTag?.spec_min ?? 6.5) || Number(phTag?.value) > (phTag?.spec_max ?? 6.8));

        const hasBrixValue = isBrixMapped && brixTag?.value !== null && brixTag?.value !== undefined;
        const isBrixOutOfSpec = hasBrixValue && (Number(brixTag?.value) < (brixTag?.spec_min ?? 11.5) || Number(brixTag?.value) > (brixTag?.spec_max ?? 12.5));

        const hasTempValue = isTempMapped && tempTag?.value !== null && tempTag?.value !== undefined;
        const isTempOutOfSpec = hasTempValue && (Number(tempTag?.value) < (tempTag?.spec_min ?? 137.0) || Number(tempTag?.value) > (tempTag?.spec_max ?? 140.0));

        return (
          <div className="p-3 bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs rounded-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span className="uppercase tracking-wider text-[11px]">Inline Analytical Telemetry (Kepware):</span>
              </div>

              {/* pH Sensor */}
              <div 
                className={`px-2.5 py-1.5 border rounded-xs flex items-center gap-2 ${
                  !isPhMapped
                    ? 'bg-slate-50 border-slate-200 text-slate-500'
                    : isPhOutOfSpec
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                }`}
                title={`Node: ${phTag?.node_id || '[CHƯA ÁNH XẠ]'}`}
              >
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Độ pH Dòng SP:</span>
                <span className={`font-mono font-bold ${
                  !isPhMapped
                    ? 'text-slate-400'
                    : isPhOutOfSpec
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}>
                  {hasPhValue ? `${Number(phTag?.value).toFixed(2)} pH` : '-- pH'}
                </span>
                {!isPhMapped ? (
                  <span className="text-[9px] px-1 py-0.5 bg-slate-100 text-slate-500 border border-slate-300 font-mono rounded-xs font-semibold">
                    [CHƯA ÁNH XẠ]
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-mono">[Spec: 6.5-6.8]</span>
                )}
              </div>

              {/* Brix Refractometer */}
              <div 
                className={`px-2.5 py-1.5 border rounded-xs flex items-center gap-2 ${
                  !isBrixMapped
                    ? 'bg-slate-50 border-slate-200 text-slate-500'
                    : isBrixOutOfSpec
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                }`}
                title={`Node: ${brixTag?.node_id || '[CHƯA ÁNH XẠ]'}`}
              >
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Độ Brix Đường:</span>
                <span className={`font-mono font-bold ${
                  !isBrixMapped
                    ? 'text-slate-400'
                    : isBrixOutOfSpec
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}>
                  {hasBrixValue ? `${Number(brixTag?.value).toFixed(2)} °Bx` : '-- °Bx'}
                </span>
                {!isBrixMapped ? (
                  <span className="text-[9px] px-1 py-0.5 bg-slate-100 text-slate-500 border border-slate-300 font-mono rounded-xs font-semibold">
                    [CHƯA ÁNH XẠ]
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-mono">[Spec: 11.5-12.5]</span>
                )}
              </div>

              {/* Critical Pasteurization Temp (CCP-1) */}
              <div 
                className={`px-2.5 py-1.5 border rounded-xs flex items-center gap-2 ${
                  !isTempMapped
                    ? 'bg-slate-50 border-slate-200 text-slate-500'
                    : isTempOutOfSpec
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                }`}
                title={`Node: ${tempTag?.node_id || '[CHƯA ÁNH XẠ]'}`}
              >
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Nhiệt Độ Giữ TT (CCP):</span>
                <span className={`font-mono font-bold ${
                  !isTempMapped
                    ? 'text-slate-400'
                    : isTempOutOfSpec
                      ? 'text-rose-700 animate-pulse'
                      : 'text-emerald-700'
                }`}>
                  {hasTempValue ? `${Number(tempTag?.value).toFixed(1)} °C` : '-- °C'}
                </span>
                {!isTempMapped ? (
                  <span className="text-[9px] px-1 py-0.5 bg-slate-100 text-slate-500 border border-slate-300 font-mono rounded-xs font-semibold">
                    [CHƯA ÁNH XẠ]
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-mono">[CCP: 137-140°C]</span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsTagModalOpen(true)}
              className="h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 rounded-xs hallmark-focus active:translate-y-px"
              title="Cấu hình địa chỉ Node ID cảm biến Inline"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600" />
              <span>Cấu hình Sensor</span>
            </button>
          </div>
        );
      })()}

      {/* Batch Quality Records Table */}
      <div className="bg-white border border-slate-200 shadow-xs flex flex-col">
        <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-700" />
            <span className="font-bold text-slate-900 uppercase tracking-wide">
              ISA-95 Level 3 Batch Quality Inspection Log
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Click row to select • Double-click to open inspection matrix
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] uppercase font-bold">
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">Report ID</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">Work Order</th>
                <th className="py-2.5 px-3 border-r border-slate-200">Recipe & Version</th>
                <th className="py-2.5 px-3 border-r border-slate-200">Start Time</th>
                <th className="py-2.5 px-3 border-r border-slate-200">End Time</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Volume (L)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Avg Deviation</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">QA Status</th>
                <th className="py-2.5 px-3 text-center w-36">Disposition / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[11px]">
              {displayedBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No batch quality records found matching the active filter criteria.
                  </td>
                </tr>
              ) : (
                displayedBatches.map((batch) => {
                  const isSelected = selectedReportId === batch.reportId;
                  const isPass = batch.status === 'PASS (RELEASE READY)' || (batch.status === 'PASS' && batch.disposition === 'RELEASED');
                  const isWarning = batch.status === 'WARNING (HOLD)';

                  return (
                    <tr
                      key={batch.reportId}
                      onClick={() => handleRowClick(batch)}
                      onDoubleClick={() => handleRowDoubleClick(batch)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#E0F2FE] text-slate-900 font-semibold border-l-4 border-l-sky-600'
                          : isPass
                          ? 'hover:bg-emerald-50/40'
                          : isWarning
                          ? 'bg-amber-50/20 hover:bg-amber-50/40'
                          : 'bg-rose-50/20 hover:bg-rose-50/40'
                      }`}
                    >
                      {/* Report ID */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-center font-bold font-mono text-slate-900">
                        {batch.reportCode || `QAR-2026-${batch.reportId.toString().padStart(3, '0')}`}
                      </td>

                      {/* Work Order */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-center font-mono font-semibold text-slate-700">
                        {batch.orderId}
                      </td>

                      {/* Recipe & Version */}
                      <td className="py-2.5 px-3 border-r border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900">{batch.recipeId}</span>
                          <span className="text-[10px] text-slate-500">({batch.recipeVersion || 'v1.0'})</span>
                          <span className="text-[10px] text-slate-400 hidden sm:inline">— {batch.recipeName}</span>
                        </div>
                      </td>

                      {/* Start Time */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-slate-600 font-mono">
                        {batch.startTime}
                      </td>

                      {/* End Time */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-slate-600 font-mono">
                        {batch.endTime}
                      </td>

                      {/* Volume (L) */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-right font-bold font-mono text-slate-900">
                        {batch.totalProduced.toLocaleString()} L
                      </td>

                      {/* Avg Deviation (%) */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-right font-bold font-mono">
                        <span className={isPass ? 'text-emerald-700' : isWarning ? 'text-amber-700' : 'text-rose-700'}>
                          {batch.avgError > 0 ? `+${batch.avgError.toFixed(2)}%` : `${batch.avgError.toFixed(2)}%`}
                        </span>
                      </td>

                      {/* QA Status - Strict HACCP CCP Veto Evaluated */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-center">
                        {isPass ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xs font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            PASS
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xs font-bold text-[10px] bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-700" />
                            HOLD
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xs font-bold text-[10px] bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                            <ShieldAlert className="w-3 h-3 text-rose-700" />
                            QUARANTINE
                          </span>
                        )}
                      </td>

                      {/* Disposition / Action */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {getDispositionBadge(batch.disposition || (isPass ? 'RELEASED' : 'QUARANTINED'))}
                          {batch.isElectronicallySigned && (
                            <span 
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xs text-[9px] font-bold bg-sky-50 text-sky-800 border border-sky-300"
                              title={`Signed by ${batch.signedBy || 'QA'}: ${batch.signatureHash?.substring(0, 10)}...`}
                            >
                              <FileCheck className="w-2.5 h-2.5 text-sky-600" />
                              SIGNED
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-[10px] text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span>SELECTED: <strong className="text-slate-800">QAR-2026-{selectedReportId.toString().padStart(3, '0')}</strong></span>
            <span>•</span>
            <span>SHOWING: <strong className="text-slate-800">{displayedBatches.length}</strong> OF {filteredBatchRecords.length} INSPECTIONS</span>
          </div>
          <div className="flex items-center gap-2">
            <span>AUDIT COMPLIANCE: HACCP / ISO 22000 CCP INTERLOCKED</span>
          </div>
        </div>
      </div>

      {/* New QA Inspection Modal with Auto Sensor Acquisition */}
      {isInspectionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-2xl w-full font-mono text-xs overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wide not-italic text-white">
                    LẬP PHIẾU KIỂM NGHIỆM CHẤT LƯỢNG MẺ (QA INSPECTION)
                  </h3>
                  <div className="text-[10px] text-slate-300">
                    ISA-95 Quality Operations · Inline Sensor Acquisition &amp; Spec Tolerance Gate
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInspectionModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Order Information Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Mã Lệnh Sản Xuất (Work Order)
                  </label>
                  <input
                    type="text"
                    value={formOrderCode}
                    onChange={(e) => setFormOrderCode(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 text-xs font-mono text-slate-900 hallmark-focus"
                    placeholder="VD: WO-2026-001 hoặc WH/MO/00005"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Công Thức Sản Phẩm (Recipe)
                  </label>
                  <input
                    type="text"
                    value={formRecipeName}
                    onChange={(e) => setFormRecipeName(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 text-xs font-mono text-slate-900 hallmark-focus"
                  />
                </div>
              </div>

              {/* Automatic Sensor Acquisition Button */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-300 rounded-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-emerald-950 text-xs uppercase">
                      Đồng bộ số đo tự động từ cảm biến Inline (Kepware OPC UA)
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 border border-emerald-300">
                    REAL-TIME PV
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isAutoCapturing}
                  onClick={handleAutoCaptureSensors}
                  className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-emerald-600 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isAutoCapturing ? 'animate-spin' : ''}`} />
                  <span>{isAutoCapturing ? 'ĐANG ĐỌC TỪ KEPWARE OPC UA...' : '⚡ LẤY SỐ ĐO TỰ ĐỘNG TỪ SENSOR'}</span>
                </button>

                {captureMessage && (
                  <div className="text-[11px] font-semibold text-emerald-900 bg-white p-2 border border-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{captureMessage}</span>
                  </div>
                )}
              </div>

              {/* Parameters Table Grid */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-1.5">
                  Chỉ tiêu phân tích &amp; Tiêu chuẩn dung sai (Tolerance Specs)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* pH Parameter */}
                  <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 uppercase text-[11px]">Độ pH</span>
                      <span className="text-[10px] text-slate-500 font-mono">[6.50 – 6.80]</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={formPh}
                      onChange={(e) => setFormPh(e.target.value)}
                      className="w-full h-9 px-2.5 bg-white border border-slate-300 font-bold font-mono text-xs hallmark-focus"
                    />
                    <div className="text-[10px] text-right font-bold">
                      {parseFloat(formPh) >= 6.5 && parseFloat(formPh) <= 6.8 ? (
                        <span className="text-emerald-700">● ĐẠT TIÊU CHUẨN</span>
                      ) : (
                        <span className="text-amber-700">▲ NGOÀI DUNG SAI</span>
                      )}
                    </div>
                  </div>

                  {/* Brix Parameter */}
                  <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 uppercase text-[11px]">Độ Brix Đường</span>
                      <span className="text-[10px] text-slate-500 font-mono">[11.5 – 12.5 °Bx]</span>
                    </div>
                    <input
                      type="number"
                      step="0.05"
                      value={formBrix}
                      onChange={(e) => setFormBrix(e.target.value)}
                      className="w-full h-9 px-2.5 bg-white border border-slate-300 font-bold font-mono text-xs hallmark-focus"
                    />
                    <div className="text-[10px] text-right font-bold">
                      {parseFloat(formBrix) >= 11.5 && parseFloat(formBrix) <= 12.5 ? (
                        <span className="text-emerald-700">● ĐẠT TIÊU CHUẨN</span>
                      ) : (
                        <span className="text-amber-700">▲ NGOÀI DUNG SAI</span>
                      )}
                    </div>
                  </div>

                  {/* Pasteurization Temp (CCP) */}
                  <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 uppercase text-[11px]">Nhiệt Độ TT (CCP)</span>
                      <span className="text-[10px] text-slate-500 font-mono">[137 – 140 °C]</span>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={formTemp}
                      onChange={(e) => setFormTemp(e.target.value)}
                      className="w-full h-9 px-2.5 bg-white border border-slate-300 font-bold font-mono text-xs hallmark-focus"
                    />
                    <div className="text-[10px] text-right font-bold">
                      {parseFloat(formTemp) >= 137.0 && parseFloat(formTemp) <= 140.0 ? (
                        <span className="text-emerald-700">● CCP ĐẠT CHUẨN</span>
                      ) : (
                        <span className="text-rose-700">▲ LỖI CCP NGUY CẤP</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Disposition Action & Reviewer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Quyết Định Đánh Giá (Disposition)
                  </label>
                  <select
                    value={formDisposition}
                    onChange={(e) => setFormDisposition(e.target.value as BatchDisposition)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 font-bold font-mono text-xs hallmark-focus"
                  >
                    <option value="RELEASED">RELEASED (Xuất xưởng / Đạt chuẩn)</option>
                    <option value="PENDING_REVIEW">PENDING_REVIEW (Chờ thẩm định)</option>
                    <option value="QUARANTINED">QUARANTINED (Cách ly / Không đạt)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Chuyên Viên Kiểm Nghiệm (Inspector)
                  </label>
                  <input
                    type="text"
                    value={formInspector}
                    onChange={(e) => setFormInspector(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-300 font-mono text-xs hallmark-focus"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  Ghi Chú Phân Tích &amp; Kiểm Nghiệm (QA Remarks)
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 font-mono text-xs text-slate-900 hallmark-focus"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsInspectionModalOpen(false)}
                className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs uppercase tracking-wider hallmark-focus active:translate-y-px"
              >
                HỦY BỎ
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsInspectionModalOpen(false);
                }}
                className="h-9 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>LƯU &amp; PHÁT HÀNH PHIẾU KIỂM NGHIỆM</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Quality Sensors Tag Mapping Modal */}
      <QualityTagMappingModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        onSaved={fetchQaTags}
      />

      {/* FDA 21 CFR Part 11 Electronic Signature Modal */}
      {(() => {
        const activeBatch = filteredBatchRecords.find((b) => b.reportId === selectedReportId) || filteredBatchRecords[0];
        if (!activeBatch) return null;
        return (
          <EbrSignatureModal
            isOpen={isEbrSignModalOpen}
            onClose={() => setIsEbrSignModalOpen(false)}
            orderCode={activeBatch.orderId}
            reportCode={activeBatch.reportCode}
            recipeName={activeBatch.recipeName}
            volume={activeBatch.totalProduced}
            initialDisposition={activeBatch.disposition === 'QUARANTINED' ? 'QUARANTINED' : 'RELEASED'}
          />
        );
      })()}
    </div>
  );
};
