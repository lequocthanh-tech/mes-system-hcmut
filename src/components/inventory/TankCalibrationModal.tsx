/* Hallmark · component: TankCalibrationModal · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import * as api from '../../services/api';
import { MaterialStock } from '../../types/inventory';
import { 
  Settings2, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Save, 
  ShieldCheck 
} from 'lucide-react';
import { extractDroppedOpcTag } from '../PinnedTagPalette';

export function sanitizeMaterialName(name?: string, _tankId?: string): string {
  if (!name) return '';
  let clean = name.trim();
  const pattern = /^(?:Bồn chứa|Silo chứa|Storage)\s+[\w-]+\s*\((.*)\)$/i;
  while (pattern.test(clean)) {
    clean = clean.replace(pattern, '$1').trim();
  }
  return clean;
}

export interface TankCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tank: MaterialStock | null;
  onSaved?: (updated: any) => void;
}

export const TankCalibrationModal: React.FC<TankCalibrationModalProps> = ({
  isOpen,
  onClose,
  tank,
  onSaved,
}) => {
  const { user } = useAuth();
  const { updateTankInState, fetchLiveStocks } = useInventory();
  const isAdmin = (user?.role?.toUpperCase() === 'ADMIN') || (user?.username?.toLowerCase() === 'admin');

  // Form Fields - Essential Storage Silo Parameters
  const [tankName, setTankName] = useState('');
  const [capacity, setCapacity] = useState<number>(5.0);
  const [minSafety, setMinSafety] = useState<number>(0.5);
  const [currentStock, setCurrentStock] = useState<number>(0.0);
  const [unit, setUnit] = useState('L');
  const [opcNodeId, setOpcNodeId] = useState('');
  const [opcHighNodeId, setOpcHighNodeId] = useState('');
  const [opcLowNodeId, setOpcLowNodeId] = useState('');
  const [dragOverField, setDragOverField] = useState<'pv' | 'lsh' | 'lsl' | null>(null);

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && tank) {
      const rawName = tank.materialName || tank.material_name || tank.tankName || tank.tank_name || '';
      const clean = sanitizeMaterialName(rawName, tank.tankId || tank.tank_id);
      setTankName(clean || rawName);
      setCapacity(Number(tank.tank_capacity || tank.tankCapacity || (tank as any).TankCapacity || tank.capacity || tank.max_capacity || 5.0));
      setMinSafety(Number(tank.min_safety_threshold || tank.minSafetyThreshold || (tank as any).MinSafetyThreshold || tank.minThreshold || tank.safety_min || 0.5));
      setUnit(tank.unit || 'L');

      const rawStock = [
        tank.currentStock,
        (tank as any).CurrentStock,
        tank.current_stock,
        (tank as any).Total_Quantity,
      ].find((v) => v !== undefined && v !== null && v !== '' && !isNaN(Number(v)));
      setCurrentStock(rawStock !== undefined ? Number(rawStock) : 0);
      setOpcNodeId(tank.opc_node_id || (tank as any).opcNodeId || (tank as any).opc_tag || '');
      setOpcHighNodeId((tank as any).opc_high_node_id || (tank as any).opcHighNodeId || '');
      setOpcLowNodeId((tank as any).opc_low_node_id || (tank as any).opcLowNodeId || '');

      setFeedback(null);
    }
  }, [isOpen, tank]);

  if (!isOpen || !tank) return null;

  const targetTankId = tank.tankId || tank.tank_id || (tank as any).assigned_tank || (tank as any).AssignedTank || 'TANK-01';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setFeedback({
        type: 'error',
        message: 'Chỉ quản trị viên (Admin) mới có quyền hiệu chuẩn thông số bồn chứa! (FDA 21 CFR Part 11)',
      });
      return;
    }

    const numCap = Number(capacity);
    if (isNaN(numCap) || numCap <= 0) {
      setFeedback({
        type: 'error',
        message: 'Dung tích tối đa (Capacity) phải lớn hơn 0!',
      });
      return;
    }

    const numStock = Number(currentStock);
    if (isNaN(numStock) || numStock < 0) {
      setFeedback({
        type: 'error',
        message: 'Tồn kho hiện tại không được là số âm!',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const payload: api.CalibrateTankPayload & { current_stock?: number; currentStock?: number } = {
      tank_name: tankName.trim() || targetTankId,
      material_name: tankName.trim() || targetTankId,
      tank_capacity: numCap,
      capacity: numCap,
      min_safety_threshold: Number(minSafety) >= 0 ? Number(minSafety) : 0.5,
      min_safety: Number(minSafety) >= 0 ? Number(minSafety) : 0.5,
      unit: unit.trim() || 'L',
      current_stock: numStock,
      currentStock: numStock,
      opc_node_id: opcNodeId.trim(),
      opc_high_node_id: opcHighNodeId.trim(),
      opc_low_node_id: opcLowNodeId.trim(),
      user: user?.username || 'admin',
      role: user?.role || 'ADMIN',
    };

    try {
      const res = await api.calibrateTank(targetTankId, payload);

      // Optimistic parent state dispatch: Update ONLY that specific tank in InventoryContext
      if (updateTankInState) {
        updateTankInState(targetTankId, {
          tankName: tankName.trim() || targetTankId,
          materialName: tankName.trim() || targetTankId,
          capacity: numCap,
          tankCapacity: numCap,
          tank_capacity: numCap,
          minThreshold: Number(minSafety) >= 0 ? Number(minSafety) : 0.5,
          minSafetyThreshold: Number(minSafety) >= 0 ? Number(minSafety) : 0.5,
          min_safety_threshold: Number(minSafety) >= 0 ? Number(minSafety) : 0.5,
          unit: unit.trim() || 'L',
          currentStock: numStock,
          current_stock: numStock,
          last_synced: new Date().toLocaleTimeString(),
          lastSynced: new Date().toLocaleTimeString(),
        });
      }

      if (onSaved) onSaved(res || payload);
      if (fetchLiveStocks) {
        fetchLiveStocks(3, 300);
      }

      // Immediately close modal on success
      onClose();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Lỗi khi lưu cấu hình thông số bồn chứa.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-mono">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-xl rounded-xs overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings2 className="w-4 h-4 text-slate-800" />
            <div>
              <h3 className="font-bold text-slate-900 uppercase tracking-wide text-xs not-italic">
                CẤU HÌNH THÔNG SỐ BỒN CHỨA NGUYÊN LIỆU: {targetTankId}
              </h3>
              <p className="text-[10px] text-slate-500 font-normal">
                ISA-95 Level 3 Storage Silo Master Parameters · Capacity &amp; Safety Thresholds
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-bold rounded-xs flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>ADMIN CLEARANCE</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 font-bold p-1 rounded-xs transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-5 py-2.5 border-b text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Form Body - Essential Storage Silo Parameters */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Material Name & Unit */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Tên nguyên vật liệu / Bồn chứa *
              </label>
              <input
                type="text"
                value={tankName}
                onChange={(e) => setTankName(e.target.value)}
                required
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs rounded-xs hallmark-focus"
                placeholder="VD: Sữa tươi nguyên liệu Silo 01"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Đơn vị đo lường (Unit) *
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs text-center rounded-xs hallmark-focus font-bold"
                placeholder="L / kg"
              />
            </div>
          </div>

          {/* Capacity, Safety Min & Current Stock Balance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Dung tích tối đa (Capacity) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={capacity}
                onChange={(e) => setCapacity(parseFloat(e.target.value) || 0)}
                required
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs text-right rounded-xs hallmark-focus font-mono font-bold"
              />
              <p className="text-[10px] text-slate-400 font-mono">Dung tích hình học tối đa</p>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Ngưỡng an toàn tối thiểu (Safety Min) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minSafety}
                onChange={(e) => setMinSafety(parseFloat(e.target.value) || 0)}
                required
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs text-right rounded-xs hallmark-focus font-mono"
              />
              <p className="text-[10px] text-slate-400 font-mono">Ngưỡng cảnh báo cạn silo</p>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Tồn kho hiện tại (Current Stock) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={currentStock}
                onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                required
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs text-right rounded-xs hallmark-focus font-mono font-bold text-emerald-800 bg-emerald-50/20"
              />
              <p className="text-[10px] text-slate-400 font-mono">Số dư kiểm kê thực tế</p>
            </div>
          </div>

          {/* Kepware OPC UA Drag-and-Drop Sensor Node Mapping */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 uppercase">
                Ánh xạ Cảm biến Kepware OPC UA (Hỗ trợ Kéo-Thả từ Kho Tag Ghim)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  PV (Loadcell / Level)
                </label>
                <input
                  type="text"
                  value={opcNodeId}
                  onChange={(e) => setOpcNodeId(e.target.value)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setDragOverField('pv');
                  }}
                  onDragLeave={() => {
                    if (dragOverField === 'pv') setDragOverField(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverField(null);
                    const dropped = extractDroppedOpcTag(e);
                    if (dropped?.node_id) setOpcNodeId(dropped.node_id);
                  }}
                  placeholder="Thả Tag PV vào đây..."
                  className={`w-full h-8 px-2 text-[11px] font-mono bg-white border rounded-xs hallmark-focus ${
                    dragOverField === 'pv'
                      ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                      : 'border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  High Level (LSH)
                </label>
                <input
                  type="text"
                  value={opcHighNodeId}
                  onChange={(e) => setOpcHighNodeId(e.target.value)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setDragOverField('lsh');
                  }}
                  onDragLeave={() => {
                    if (dragOverField === 'lsh') setDragOverField(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverField(null);
                    const dropped = extractDroppedOpcTag(e);
                    if (dropped?.node_id) setOpcHighNodeId(dropped.node_id);
                  }}
                  placeholder="Thả Tag LSH vào đây..."
                  className={`w-full h-8 px-2 text-[11px] font-mono bg-white border rounded-xs hallmark-focus ${
                    dragOverField === 'lsh'
                      ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                      : 'border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Low Level (LSL)
                </label>
                <input
                  type="text"
                  value={opcLowNodeId}
                  onChange={(e) => setOpcLowNodeId(e.target.value)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setDragOverField('lsl');
                  }}
                  onDragLeave={() => {
                    if (dragOverField === 'lsl') setDragOverField(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverField(null);
                    const dropped = extractDroppedOpcTag(e);
                    if (dropped?.node_id) setOpcLowNodeId(dropped.node_id);
                  }}
                  placeholder="Thả Tag LSL vào đây..."
                  className={`w-full h-8 px-2 text-[11px] font-mono bg-white border rounded-xs hallmark-focus ${
                    dragOverField === 'lsl'
                      ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                      : 'border-slate-300'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Informational Guidance */}
          <div className="p-3 bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-600 rounded-xs space-y-1">
            <div className="font-bold text-slate-800 uppercase flex items-center gap-1.5">
              <span>● QUY TRÌNH QUẢN TRỊ TỒN KHO ISA-95 (FDA 21 CFR PART 11):</span>
            </div>
            <div>
              - Khi lưu thông số, hệ thống sẽ tự động cập nhật bảng <code>dbo.Material_Stock</code> trên Microsoft SQL Server và ghi nhật ký kiểm toán hành động người dùng.
            </div>
            <div>
              - Số dư tồn kho sẽ được bảo toàn nhất quán và tự động trừ nguyên liệu khi hoàn tất định lượng mẻ qua bồn cân trung gian.
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs uppercase tracking-wider rounded-xs hallmark-focus shadow-xs active:translate-y-px"
            >
              HỦY
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isAdmin}
              className="h-9 px-4 bg-[#0F172A] hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 rounded-xs hallmark-focus shadow-xs active:translate-y-px"
            >
              <Save className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'ĐANG LƯU...' : 'LƯU & ÁP DỤNG NGAY'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TankCalibrationModal;
