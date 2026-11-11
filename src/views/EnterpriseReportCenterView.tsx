/* Hallmark · component: EnterpriseReportCenterView · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React from 'react';
import { useReports } from '../context/ReportContext';
import { BatchProductionReportTab } from '../components/reports/BatchProductionReportTab';
import { QualityInspectionReportTab } from '../components/reports/QualityInspectionReportTab';
import { MaterialConsumptionReportTab } from '../components/reports/MaterialConsumptionReportTab';
import { AlarmIncidentReportTab } from '../components/reports/AlarmIncidentReportTab';
import { UserAuditTrailTab } from '../components/reports/UserAuditTrailTab';
import { FoodSafetyTraceabilityTab } from '../components/reports/FoodSafetyTraceabilityTab';
import { 
  FileSpreadsheet, 
  Calendar, 
  Search, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  FileCheck2, 
  Award, 
  Boxes, 
  Bell, 
  ShieldCheck, 
  GitFork,
  X,
  Loader2,
  FileCode
} from 'lucide-react';
import { IsaB2mmlExportModal } from '../components/isa/IsaB2mmlExportModal';

export const EnterpriseReportCenterView: React.FC = () => {
  const {
    activeSubTab,
    setActiveSubTab,
    fromDate,
    toDate,
    searchQuery,
    setFromDate,
    setToDate,
    setSearchQuery,
    runQuery,
    isQuerying,
    isExporting,
    exportReportToExcel,
    exportReportToPdf,
    toastNotice,
    setToastNotice,
    batchMasters,
    qualityRecords,
    alarmItems,
  } = useReports();

  const [isIsaModalOpen, setIsIsaModalOpen] = React.useState(false);

  const handleExportExcel = async () => {
    let reportName = 'Batch_Production_Report';
    if (activeSubTab === 'quality_inspection') reportName = 'Quality_Inspection_Report';
    if (activeSubTab === 'material_consumption') reportName = 'Material_Consumption_Report';
    if (activeSubTab === 'alarm_incident') reportName = 'Alarm_Incident_Report';
    if (activeSubTab === 'user_audit') reportName = 'User_Security_Audit_Trail';
    if (activeSubTab === 'traceability') reportName = 'Food_Safety_Traceability_Report';
    await exportReportToExcel(reportName);
  };

  const handleExportPdf = async () => {
    let reportName = 'Batch Production Report';
    if (activeSubTab === 'quality_inspection') reportName = 'Quality Inspection Archive';
    if (activeSubTab === 'material_consumption') reportName = 'Material Consumption Ledger';
    if (activeSubTab === 'alarm_incident') reportName = 'Alarm Incident Report';
    if (activeSubTab === 'user_audit') reportName = 'User Audit Trail';
    if (activeSubTab === 'traceability') reportName = 'Food Safety Traceability Audit';
    await exportReportToPdf(reportName);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Feedback Notification */}
      {toastNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 px-4 py-3 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-mono">{toastNotice}</span>
          </div>
          <button 
            type="button"
            onClick={() => setToastNotice(null)} 
            className="text-slate-500 hover:text-slate-800 font-bold p-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Module Header Banner */}
      <div className="bg-white border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-slate-900 text-white font-mono text-[10px] font-bold">
              PERFORMANCE ANALYSIS
            </span>
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider font-semibold">
              ISA-95 LEVEL 3 MOM • ELECTRONIC BATCH RECORDS (EBR) • FDA 21 CFR PART 11
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 leading-snug flex items-center gap-2" style={{ fontStyle: 'normal' }}>
            <FileSpreadsheet className="w-5 h-5 text-slate-800" />
            ENTERPRISE REPORT CENTER &amp; PRODUCTION TRACEABILITY
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Electronic Batch Records (EBR), QA/QC release archives, raw material genealogy, and industrial audit ledgers
          </p>
        </div>

        {/* Live Badges */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2 font-mono">
            <FileCheck2 className="w-4 h-4 text-slate-600" />
            <div className="text-left">
              <div className="text-[10px] text-slate-500 uppercase leading-none">Archived Batches</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{batchMasters.length} Recorded</div>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2 font-mono">
            <Award className="w-4 h-4 text-slate-600" />
            <div className="text-left">
              <div className="text-[10px] text-slate-500 uppercase leading-none">QA Certificates</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{qualityRecords.length} Audited</div>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2 font-mono">
            <Bell className="w-4 h-4 text-slate-600" />
            <div className="text-left">
              <div className="text-[10px] text-slate-500 uppercase leading-none">Alarms Logged</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{alarmItems.length} Events</div>
            </div>
          </div>
        </div>
      </div>

      {/* TOP GLOBAL TOOLBAR & FILTER BAR */}
      <div className="bg-white border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          {/* Filters: Date Range + Search Input */}
          <div className="flex flex-wrap items-end gap-3 text-xs">
            {/* From Date */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px] uppercase">From Date</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="pl-8 pr-3 h-9 border border-slate-300 font-mono text-xs rounded-xs bg-white hallmark-focus"
                />
              </div>
            </div>

            {/* To Date */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px] uppercase">To Date</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="pl-8 pr-3 h-9 border border-slate-300 font-mono text-xs rounded-xs bg-white hallmark-focus"
                />
              </div>
            </div>

            {/* Search Input with quick clear */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-[11px] uppercase">Batch / Order Search</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Batch_12, RPT-10, Milk..."
                  className="pl-8 pr-7 h-9 border border-slate-300 font-mono text-xs w-48 sm:w-60 rounded-xs bg-white hallmark-focus"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Command Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Query / Show Data (Industrial Dark Slate Primary) */}
            <button
              type="button"
              onClick={runQuery}
              disabled={isQuerying}
              className="h-9 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isQuerying ? 'animate-spin' : ''}`} />
              <span>Query Data</span>
            </button>

            {/* Export Excel (.XLS) with Multi-Sheet & SHA-256 Stamp */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 disabled:opacity-50 text-slate-800 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
              title="Export Multi-Sheet Excel Workbook with 21 CFR Part 11 Header & Signatures"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>Export Excel</span>
            </button>

            {/* Export PDF Report with ISO 22000 Banner & Verification Blocks */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting}
              className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 disabled:opacity-50 text-slate-800 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
              title="Generate Printable EBR with ISO 22000 / HACCP Banner & Cryptographic Seal"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>Export PDF</span>
            </button>

            {/* Export Standard MESA BatchML / B2MML JSON Payload */}
            <button
              type="button"
              onClick={() => setIsIsaModalOpen(true)}
              className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs"
              title="Preview and Download ANSI/ISA-88 BatchML Electronic Batch Record & B2MML JSON"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-600" />
              <span>Export BatchML / B2MML</span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-2 gap-2 shadow-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('batch_production')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-all hallmark-focus ${
            activeSubTab === 'batch_production'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <FileCheck2 className="w-4 h-4 text-slate-700" />
          <span>Batch Production Report</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('quality_inspection')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-all hallmark-focus ${
            activeSubTab === 'quality_inspection'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Award className="w-4 h-4 text-slate-700" />
          <span>Quality Inspection Report</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('material_consumption')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-all hallmark-focus ${
            activeSubTab === 'material_consumption'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Boxes className="w-4 h-4 text-slate-700" />
          <span>Material Consumption Report</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('alarm_incident')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-all hallmark-focus ${
            activeSubTab === 'alarm_incident'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Bell className="w-4 h-4 text-slate-700" />
          <span>Alarm Incident Report</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('user_audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-all hallmark-focus ${
            activeSubTab === 'user_audit'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-slate-700" />
          <span>User Audit Trail</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('traceability')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-all hallmark-focus ${
            activeSubTab === 'traceability'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <GitFork className="w-4 h-4 text-slate-700" />
          <span>Food Safety Traceability</span>
        </button>
      </div>

      {/* SUB-TAB CONTENT DISPLAY */}
      <div>
        {activeSubTab === 'batch_production' && <BatchProductionReportTab />}
        {activeSubTab === 'quality_inspection' && <QualityInspectionReportTab />}
        {activeSubTab === 'material_consumption' && <MaterialConsumptionReportTab />}
        {activeSubTab === 'alarm_incident' && <AlarmIncidentReportTab />}
        {activeSubTab === 'user_audit' && <UserAuditTrailTab />}
        {activeSubTab === 'traceability' && <FoodSafetyTraceabilityTab />}
      </div>

      {/* MESA B2MML & BATCHML STANDARD EXPORT MODAL */}
      <IsaB2mmlExportModal
        isOpen={isIsaModalOpen}
        onClose={() => setIsIsaModalOpen(false)}
        initialSchema={activeSubTab === 'traceability' ? 'performance' : 'bpr'}
        initialOrderId={batchMasters[0]?.orderId || 'WH/MO/00002'}
        availableOrders={batchMasters.map(m => ({ orderId: m.orderId, recipeApplied: m.recipeApplied }))}
      />
    </div>
  );
};
