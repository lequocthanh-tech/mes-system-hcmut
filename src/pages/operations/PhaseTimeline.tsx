/* Hallmark · component: PhaseTimeline · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled
 * contrast: WCAG AA Pass
 */

import React, { useState } from 'react';
import { useOperations } from '../../context/OperationsContext';
import { 
  Clock, 
  Play, 
  CheckCircle2, 
  Pause, 
  AlertTriangle, 
  Radio, 
  Layers, 
  Settings,
  Lock
} from 'lucide-react';
import * as api from '../../services/api';
import { extractDroppedOpcTag } from '../../components/PinnedTagPalette';
import { 
  getIsa88State, 
  ISA88_STATES, 
  Isa88StateCode,
  TimelineNode 
} from '../../types/operations';
import { OperationsTagMappingModal } from '../../components/operations/OperationsTagMappingModal';
import { PhaseDurationModal } from './PhaseDurationModal';

export const PhaseTimeline: React.FC = () => {
  const { 
    timelineNodes, 
    targetProcessLine, 
    setTargetProcessLine, 
    currentBatchState, 
    runningOrders 
  } = useOperations();

  // Local active cell view toggle: Cell 1, Cell 2 (SIMIT), or Split View
  const [selectedCellView, setSelectedCellView] = useState<string>(
    targetProcessLine.includes('Cell 2') ? 'Process Cell 2 (SIMIT Digital Twin)' : 'Process Cell 1 (Physical S7-1500)'
  );

  // Modal States
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);
  const [dragOverPhaseId, setDragOverPhaseId] = useState<string | null>(null);
  const [dropBanner, setDropBanner] = useState<string | null>(null);

  const handleDropOnPhaseRow = async (e: React.DragEvent, node: TimelineNode, isSimit: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPhaseId(null);
    const dropped = extractDroppedOpcTag(e);
    if (!dropped || !dropped.node_id) return;

    const prefix = isSimit ? 'pc2_simit_phases' : 'pc1_phases';
    const fullKey = `${prefix}.${node.code}`;
    try {
      await api.updateModuleTagMappings(
        'operations',
        {
          [fullKey]: { node_id: dropped.node_id, role: 'STATE', unit: 'Int16' },
          [`${prefix}.${node.code}.run_cmd`]: { node_id: dropped.node_id, role: 'STATE', unit: 'Int16' },
        },
        'admin',
        'ADMIN'
      );
      setDropBanner(
        `✔ Đã ánh xạ kéo-thả Pha [${node.code} - ${node.name}] (${isSimit ? 'SIMIT Twin' : 'Cell 1 HW'}) ← ${dropped.node_id} và lưu vĩnh viễn vào tag_mappings.json!`
      );
      setTimeout(() => setDropBanner(null), 5000);
    } catch (err: any) {
      setDropBanner(`Lỗi gán Tag Pha [${node.code}]: ${err.message || 'Không thể lưu'}`);
      setTimeout(() => setDropBanner(null), 5000);
    }
  };

  // Derive runtime scrubber position from active running order
  const activeRunningOrder = runningOrders[0];
  let currentElapsedMinutes = 0.0; // Cold standby: 0.0
  if (activeRunningOrder) {
    const parts = activeRunningOrder.elapsedTime.split(':').map(Number);
    if (parts.length === 3) {
      currentElapsedMinutes = parts[0] * 60 + parts[1] + parts[2] / 60;
    }
  }

  // Dynamic Gantt horizon calculation based on procedural nodes
  const maxNodeEnd = timelineNodes.reduce((max, node) => {
    const dur = Math.max(node.durationMinutes || 0, node.nominalDurationMinutes || 0, 5);
    return Math.max(max, (node.startMinute || 0) + dur);
  }, 30);
  const totalMinutes = Math.max(30, Math.ceil(maxNodeEnd / 10) * 10);
  const tickStep = totalMinutes <= 30 ? 5 : 10;
  const timeTicks: number[] = [];
  for (let t = 0; t <= totalMinutes; t += tickStep) {
    timeTicks.push(t);
  }

  const isHeld = currentBatchState === 'HELD' || currentBatchState === 'HOLDING';

  // Group or filter nodes based on selectedCellView
  const cell1Nodes = timelineNodes.filter((n) => !n.targetCell || n.targetCell.includes('Cell 1'));
  const cell2Nodes = timelineNodes.filter((n) => n.targetCell && n.targetCell.includes('Cell 2'));

  const renderTimelineRows = (nodes: TimelineNode[], cellLabel?: string) => {
    if (nodes.length === 0) {
      return (
        <div className="py-8 text-center text-slate-400 font-mono">
          Chưa có procedural node nào được cấu hình cho phân vùng này.
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-200">
        {cellLabel && (
          <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-slate-600" />
              {cellLabel} ({nodes.length} nodes)
            </span>
            <span className="text-slate-500 font-normal">
              {cellLabel.includes('SIMIT') ? 'SIMULATION DIGITAL TWIN' : 'PHYSICAL HARDWARE S7-1500'}
            </span>
          </div>
        )}

        {nodes.map((node) => {
          const meta = getIsa88State(node.stateId !== undefined ? node.stateId : node.status);
          const isNodeRunning = meta.id === 1;
          const isNodeCompleted = meta.id === 11;
          const isNodeHeld = meta.id === 2 || meta.id === 3 || isHeld;
          const isIdle = meta.id === 0;

          const leftPercent = Math.max(0, Math.min(100, (node.startMinute / totalMinutes) * 100));
          const widthPercent = Math.max(0, Math.min(100 - leftPercent, (node.durationMinutes / totalMinutes) * 100));

          const isUp = node.type === 'UP';
          const isOp = node.type === 'OP';
          const isSimitRow = Boolean((cellLabel && cellLabel.includes('SIMIT')) || (node.targetCell && node.targetCell.includes('Cell 2')));

          return (
            <div
              key={node.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDragOverPhaseId(node.id);
              }}
              onDragLeave={() => {
                if (dragOverPhaseId === node.id) setDragOverPhaseId(null);
              }}
              onDrop={(e) => handleDropOnPhaseRow(e, node, isSimitRow)}
              className={`grid grid-cols-12 items-center transition-colors ${
                dragOverPhaseId === node.id
                  ? 'ring-2 ring-emerald-500 bg-emerald-50/70'
                  : isUp
                  ? 'bg-slate-50/80 font-bold hover:bg-slate-50'
                  : isOp
                  ? 'bg-white font-semibold hover:bg-slate-50'
                  : 'bg-white hover:bg-slate-50'
              }`}
              title={`Thả Tag từ Kho Tag Ghim vào dòng này để gán OPC UA Node ID cho [${node.code} - ${node.name}]`}
            >
              {/* Left Column: Procedural Node Code & Name & State */}
              <div className="col-span-4 sm:col-span-3 p-2.5 border-r border-slate-200 flex items-center justify-between gap-1 overflow-hidden">
                <div className="flex items-center gap-1.5 truncate">
                  {/* Node Type Badge */}
                  <span
                    className={`text-[9px] px-1 py-0.2 font-mono font-bold shrink-0 ${
                      isUp
                        ? 'bg-slate-900 text-white'
                        : isOp
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {node.type}
                  </span>

                  <span className="text-slate-900 truncate" title={`${node.code} - ${node.name}`}>
                    {node.code} <span className="text-slate-500 text-[10px] font-normal">{node.name}</span>
                  </span>
                </div>

                {/* State Mini Badge */}
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase border"
                    style={{
                      color: meta.color,
                      borderColor: `${meta.color}60`,
                      backgroundColor: `${meta.color}15`,
                    }}
                  >
                    {meta.name}
                  </span>

                  {isNodeRunning && !isNodeHeld && <Play className="w-3 h-3 text-emerald-600 animate-pulse" />}
                  {isNodeCompleted && <CheckCircle2 className="w-3 h-3 text-blue-600" />}
                  {isNodeHeld && <Pause className="w-3 h-3 text-amber-600" />}
                </div>
              </div>

              {/* Right Area: Dynamic Gantt Bar Track */}
              <div className="col-span-8 sm:col-span-9 p-2 relative h-9 flex items-center">
                {/* Background Grid Guidelines every 5 min */}
                <div className="absolute inset-0 flex justify-between pointer-events-none px-3">
                  {timeTicks.map((tick) => (
                    <div key={tick} className="h-full border-r border-slate-100" />
                  ))}
                </div>

                {/* Scrubber Line (Live Marker at current runtime) */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-600 z-20 pointer-events-none shadow-xs"
                  style={{ left: `${Math.min(100, (currentElapsedMinutes / totalMinutes) * 100)}%` }}
                />

                {/* Horizontal Progress Bar: Planned Horizon Slot & Actual Dynamic Fill */}
                {(() => {
                  const nominalDuration = node.nominalDurationMinutes || 5.0;
                  const plannedWidthPercent = Math.max(2.0, Math.min(100 - leftPercent, (nominalDuration / totalMinutes) * 100));

                  if (isIdle && node.durationMinutes === 0) {
                    /* Idle state: Light gray dashed box showing configured planned duration */
                    return (
                      <div
                        className="h-5 border border-dashed text-[9px] font-mono flex items-center justify-between px-1.5 z-10 bg-slate-50/90 text-slate-500 border-slate-300 select-none shadow-2xs"
                        style={{
                          marginLeft: `${leftPercent}%`,
                          width: `${plannedWidthPercent}%`,
                        }}
                        title={`${node.code}: IDLE (Định mức: ${nominalDuration.toFixed(1)}m · Dự kiến T+${node.startMinute}m -> T+${(node.startMinute + nominalDuration).toFixed(1)}m)`}
                      >
                        <span className="truncate">{node.code}</span>
                        <span className="text-[8px] text-slate-400 font-normal shrink-0 ml-1">
                          {nominalDuration.toFixed(1)}m
                        </span>
                      </div>
                    );
                  }

                  /* Running, Held, or Frozen Completed Bar with Planned Horizon Slot */
                  return (
                    <div 
                      className="relative h-5 flex items-center z-10"
                      style={{
                        marginLeft: `${leftPercent}%`,
                        width: `${Math.max(plannedWidthPercent, widthPercent)}%`,
                      }}
                    >
                      {/* Planned dashed outline boundary behind running bar */}
                      {isNodeRunning && (
                        <div
                          className="absolute inset-y-0 left-0 border border-dashed border-slate-300 bg-slate-100/40 pointer-events-none"
                          style={{ width: `${Math.min(100, (plannedWidthPercent / Math.max(plannedWidthPercent, widthPercent)) * 100)}%` }}
                          title={`Kế hoạch định mức: ${nominalDuration.toFixed(1)} phút`}
                        />
                      )}

                      {/* Active running or completed bar */}
                      <div
                        className={`h-5 border text-[10px] font-mono font-semibold flex items-center justify-between px-2 z-10 transition-none shadow-xs ${
                          isNodeRunning ? 'animate-pulse ring-1 ring-emerald-400/50' : ''
                        }`}
                        style={{
                          width: `${Math.max(2.5, Math.min(100, (widthPercent / Math.max(plannedWidthPercent, widthPercent)) * 100))}%`,
                          backgroundColor: meta.color,
                          borderColor: `${meta.color}`,
                          color: '#FFFFFF',
                        }}
                        title={`${node.code}: ${meta.name} · Thực tế: ${node.durationMinutes.toFixed(1)}m / Định mức: ${nominalDuration.toFixed(1)}m`}
                      >
                        <span className="truncate flex items-center gap-1">
                          {node.isFrozen && <Lock className="w-2.5 h-2.5 opacity-80 shrink-0" />}
                          <span>{node.code}</span>
                        </span>
                        <span className="text-[9px] opacity-95 shrink-0 ml-1">
                          {node.durationMinutes.toFixed(1)}m
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Delay Warning Badge if Held */}
                {isNodeHeld && isNodeRunning && (
                  <span className="absolute right-4 text-[9px] bg-amber-100 border border-amber-300 text-amber-800 px-1.5 py-0.2 font-bold z-20 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                    <span>HOLD / DELAY</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Sub-view Header */}
      <div className="bg-white border border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight uppercase">
              Phase Timeline Monitoring (Sliding Gantt Horizon)
            </h2>
            <p className="text-xs text-slate-500">
              Dynamic ISA-88 recipe execution timeline with active elapsed-time scrubber &amp; delay detection
            </p>
          </div>
        </div>

        {/* Runtime Scrubber Indicator & Calibration & Quick Mapping Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1 font-bold text-slate-900">
            <span className={`w-2.5 h-2.5 rounded-full ${isHeld ? 'bg-amber-500' : 'bg-rose-600'} inline-block animate-pulse`} />
            <span>CURRENT TIME: T+{currentElapsedMinutes.toFixed(1)} MIN</span>
          </div>

          <button
            type="button"
            onClick={() => setIsDurationModalOpen(true)}
            className="h-8 px-3 text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border bg-white border-indigo-300 text-indigo-900 hover:bg-indigo-50 transition-none focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 active:translate-y-px shadow-xs"
            title="Cài đặt thời gian định mức từng bước quy trình ISA-88 cho Cell 1 và Cell 2"
          >
            <Clock className="w-3.5 h-3.5 text-indigo-700" />
            <span>[⏱️ Cài đặt thời gian Pha]</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTagModalOpen(true)}
            className="h-8 px-3 text-xs font-mono font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 border bg-white border-slate-300 text-slate-800 hover:bg-slate-50 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
            title="Cấu hình ánh xạ Kepware OPC UA Tags cho module Vận hành (ISA-88)"
          >
            <Settings className="w-3.5 h-3.5 text-slate-700" />
            <span>[⚙️ Cấu hình Tag Vận hành]</span>
          </button>
        </div>
      </div>

      {/* Drag-and-Drop Feedback Banner */}
      {dropBanner && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-4 py-2.5 text-xs font-mono font-bold flex items-center justify-between shadow-xs">
          <span>{dropBanner}</span>
          <button
            type="button"
            onClick={() => setDropBanner(null)}
            className="text-emerald-700 hover:text-emerald-950 px-1.5 font-bold"
          >
            [✕]
          </button>
        </div>
      )}

      {/* 11-State ISA-88 Color Legend Strip (Standardized 0 to 11) */}
      <div className="bg-white border border-slate-200 px-4 py-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-slate-700 uppercase tracking-wider mr-1 text-[10px]">
            CHUẨN 11 TRẠNG THÁI ISA-88:
          </span>
          {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as Isa88StateCode[]).map((stId) => {
            const meta = ISA88_STATES[stId];
            return (
              <div
                key={stId}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px]"
                style={{
                  borderColor: `${meta.color}50`,
                  backgroundColor: `${meta.color}10`,
                }}
              >
                <span
                  className="w-2 h-2 inline-block shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="font-bold" style={{ color: meta.color }}>
                  {stId}: {meta.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Process Line Switcher Toolbar */}
      <div className="bg-white border border-slate-200 p-2 px-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-700 uppercase">Chọn Chế độ Quan sát:</span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCellView('Process Cell 1 (Physical S7-1500)');
                setTargetProcessLine('Process Cell 1 (Physical S7-1500)');
              }}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                selectedCellView === 'Process Cell 1 (Physical S7-1500)'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <Radio className="w-3 h-3 text-emerald-400" />
              <span>Process Cell 1 (Physical S7-1500)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedCellView('Process Cell 2 (SIMIT Digital Twin)');
                setTargetProcessLine('Process Cell 2 (SIMIT Digital Twin)');
              }}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                selectedCellView === 'Process Cell 2 (SIMIT Digital Twin)'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <Radio className="w-3 h-3 text-sky-400" />
              <span>Process Cell 2 (SIMIT Digital Twin)</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCellView('SPLIT_VIEW')}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                selectedCellView === 'SPLIT_VIEW'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <Layers className="w-3 h-3 text-amber-400" />
              <span>Split View (Cả 2 Cell Đồng thời)</span>
            </button>
          </div>
        </div>

        {/* Delay Status Notice */}
        {isHeld && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 px-2.5 py-1 text-amber-800 font-bold text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>INTERLOCK: BATCH ĐANG TẠM DỪNG (HELD) · PHASES ON HOLD</span>
          </div>
        )}
      </div>

      {/* Main Gantt Chart Container */}
      <div className="bg-white border border-slate-200 shadow-xs flex flex-col">
        {/* Timeline Header Row (Labels & Time Marks) */}
        <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50">
          {/* Left Column Header (Entities) */}
          <div className="col-span-4 sm:col-span-3 p-3 font-bold text-slate-800 uppercase text-[11px] border-r border-slate-200">
            Procedural Node / Phase State
          </div>

          {/* Right Gantt Axis Header */}
          <div className="col-span-8 sm:col-span-9 relative py-3 px-2">
            <div className="flex justify-between text-[11px] text-slate-600 font-bold px-1">
              {timeTicks.map((tick) => (
                <div key={tick} className="flex flex-col items-center">
                  <span>T+{tick}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline Rows Area */}
        <div className="max-h-[640px] overflow-y-auto relative">
          {selectedCellView === 'SPLIT_VIEW' ? (
            <>
              {renderTimelineRows(cell1Nodes, 'Process Cell 1 (Physical S7-1500)')}
              {renderTimelineRows(cell2Nodes, 'Process Cell 2 (SIMIT Digital Twin)')}
            </>
          ) : selectedCellView.includes('Cell 2') ? (
            renderTimelineRows(cell2Nodes, 'Process Cell 2 (SIMIT Digital Twin)')
          ) : (
            renderTimelineRows(cell1Nodes, 'Process Cell 1 (Physical S7-1500)')
          )}
        </div>

        {/* Footer Timeline Info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>ANSI/ISA-88 PART 1 EXECUTION HORIZON · REAL-TIME SCRUBBER SYNCHRONIZATION</span>
          </div>
          <div>
            <span>CHẾ ĐỘ HIỂN THỊ: {selectedCellView}</span>
          </div>
        </div>
      </div>

      {/* Operations Tag Mapping Modal */}
      <OperationsTagMappingModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
      />

      {/* Phase Duration Calibration Modal */}
      <PhaseDurationModal
        isOpen={isDurationModalOpen}
        onClose={() => setIsDurationModalOpen(false)}
      />
    </div>
  );
};

export default PhaseTimeline;
