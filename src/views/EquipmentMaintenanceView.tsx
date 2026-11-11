/* Hallmark · component: EquipmentMaintenanceView · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState } from 'react';
import { EquipmentManagement } from '../pages/maintenance/EquipmentManagement';
import { PreventiveMaintenance } from '../pages/maintenance/PreventiveMaintenance';
import { EquipmentAuditTrail } from '../pages/maintenance/EquipmentAuditTrail';
import { LogMaintenanceModal } from '../components/maintenance/LogMaintenanceModal';
import { useEquipment } from '../context/EquipmentContext';
import { 
  Wrench, 
  Cpu, 
  ClipboardList, 
  Activity,
  CheckCircle2,
  Lock,
  PlusCircle,
  RefreshCw,
  Settings
} from 'lucide-react';
import { ModuleTagMappingModal } from '../components/ModuleTagMappingModal';

export type MaintenanceSubTab = 'inventory' | 'preventive' | 'transitions';

export const EquipmentMaintenanceView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<MaintenanceSubTab>('inventory');
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState<boolean>(false);
  const { equipmentList, maintenanceLogs, transitionEvents, isEquipmentInterlocked, refreshData, isLoading, selectEquipment } = useEquipment();

  const totalAssets = equipmentList.length;
  const runningCount = equipmentList.filter((e) => e.status === 'RUNNING').length;
  const faultCount = equipmentList.filter((e) => e.status === 'FAULT').length;
  const overdueCount = equipmentList.filter((e) => e.runtimeHours >= e.maintenanceLimit).length;
  const interlockedCount = equipmentList.filter((e) => isEquipmentInterlocked(e)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-mono">
      {/* Module 7 Header Banner */}
      <div className="bg-white border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider font-semibold">
              ISA-95 LEVEL 3 · MAINTENANCE OPERATIONS MANAGEMENT
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 leading-snug flex items-center gap-2 not-italic">
            <Wrench className="w-5 h-5 text-slate-800" />
            PLANT EQUIPMENT & MAINTENANCE MANAGEMENT
          </h1>
          <p className="text-xs text-slate-600 mt-0.5 font-sans font-normal">
            Sổ bộ thiết bị, liên kết OPC UA Node ID, bảo trì phòng ngừa theo giờ chạy và nhật ký kiểm toán trạng thái bất biến.
          </p>
        </div>

        {/* Live Badges Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2.5 rounded-xs">
            <Cpu className="w-4 h-4 text-slate-600" />
            <div className="text-left font-mono">
              <div className="text-[10px] text-slate-500 uppercase leading-none font-bold">Tài sản theo dõi</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{totalAssets} Units ({runningCount} RUNNING)</div>
            </div>
          </div>

          <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2.5 rounded-xs">
            <ClipboardList className="w-4 h-4 text-slate-600" />
            <div className="text-left font-mono">
              <div className="text-[10px] text-slate-500 uppercase leading-none font-bold">Phiếu bảo dưỡng</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{maintenanceLogs.length} Records</div>
            </div>
          </div>

          <div
            className={`px-3.5 py-1.5 border flex items-center gap-2.5 rounded-xs ${
              interlockedCount > 0
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="text-left font-mono">
              <div className="text-[10px] opacity-75 uppercase leading-none font-bold">Khóa liên động an toàn</div>
              <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                {interlockedCount > 0 ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    <span>{interlockedCount} Interlocked ({faultCount} Fault, {overdueCount} Due)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Toàn bộ thiết bị sẵn sàng</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons: Manual Sync, OPC UA Sensor Mapping & Log Record Modal */}
          <button
            type="button"
            onClick={() => refreshData()}
            className="h-9 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center gap-1.5 rounded-xs hallmark-focus active:translate-y-px shadow-xs"
            title="Đồng bộ trực tiếp với Microsoft SQL Server (dbo.Equipment_Master)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Đồng bộ SQL</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTagModalOpen(true)}
            className="h-9 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold text-xs flex items-center gap-1.5 rounded-xs hallmark-focus active:translate-y-px shadow-xs"
            title="Cấu hình ánh xạ Kepware OPC UA Sensors cho động cơ và thiết bị (M-101, P-101...)"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span>CẤU HÌNH SENSOR THIẾT BỊ</span>
          </button>

          <button
            type="button"
            onClick={() => setIsLogModalOpen(true)}
            className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 rounded-xs hallmark-focus active:translate-y-px shadow-xs"
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>Ghi nhận bảo trì</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-2 gap-2 shadow-xs select-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('inventory')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all font-mono hallmark-focus active:translate-y-px ${
            activeSubTab === 'inventory'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Cpu className="w-4 h-4 text-slate-700" />
          <span>SỔ BỘ THIẾT BỊ & LIVE STATUS (EQUIPMENT INVENTORY)</span>
          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-mono rounded-xs font-bold">
            {equipmentList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('preventive')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all font-mono hallmark-focus active:translate-y-px ${
            activeSubTab === 'preventive'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Wrench className="w-4 h-4 text-slate-700" />
          <span>BẢO TRÌ ĐỊNH KỲ & DỊCH VỤ (PREVENTIVE MAINTENANCE)</span>
          {overdueCount > 0 && (
            <span className="px-1.5 py-0.5 bg-rose-200 text-rose-900 text-[10px] font-mono rounded-xs font-bold">
              {overdueCount} DUE
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('transitions')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all font-mono hallmark-focus active:translate-y-px ${
            activeSubTab === 'transitions'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Activity className="w-4 h-4 text-slate-700" />
          <span>NHẬT KÝ CHUYỂN TRẠNG THÁI (STATE AUDIT TRAIL)</span>
          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-mono rounded-xs font-bold">
            {transitionEvents.length}
          </span>
        </button>
      </div>

      {/* Sub-View Content */}
      <section aria-label="Maintenance View Content">
        {activeSubTab === 'inventory' && (
          <EquipmentManagement
            onDispatchToPreventive={(eqCode) => {
              selectEquipment(eqCode);
              setActiveSubTab('preventive');
            }}
          />
        )}
        {activeSubTab === 'preventive' && <PreventiveMaintenance />}
        {activeSubTab === 'transitions' && <EquipmentAuditTrail />}
      </section>

      {/* Log Maintenance Modal */}
      <LogMaintenanceModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
      />

      {/* Equipment Sensor & OPC UA Tag Mapping Modal */}
      <ModuleTagMappingModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        moduleKey="maintenance"
        moduleTitle="CẤU HÌNH SENSOR THIẾT BỊ & BẢO TRÌ (M-101, P-101)"
        onSaved={() => refreshData()}
      />
    </div>
  );
};

export default EquipmentMaintenanceView;
