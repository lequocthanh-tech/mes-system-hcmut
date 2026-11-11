/* Hallmark · component: InventoryView · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState } from 'react';
import { InboundReceipt } from '../pages/inventory/InboundReceipt';
import { RealTimeStock } from '../pages/inventory/RealTimeStock';
import { useInventory } from '../context/InventoryContext';
import { useConfig } from '../context/ConfigContext';
import { 
  PackagePlus, 
  Database, 
  Layers, 
  Boxes,
  UploadCloud,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import * as api from '../services/api';

const useSafeConfig = () => {
  try {
    return useConfig();
  } catch {
    return null;
  }
};

export type InventorySubTab = 'inbound' | 'stock_overview';

export const InventoryView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('inbound');
  const { receipts, stocks, refreshStockBalance, fetchLiveStocks } = useInventory();
  const config = useSafeConfig();
  const sqlOnline = config?.sqlConfig?.connectionState === 'connected';
  const prevSqlOnlineRef = React.useRef<boolean>(false);

  const [isUplinking, setIsUplinking] = useState(false);
  const [lastUplinkTime, setLastUplinkTime] = useState<string | null>(null);
  const [uplinkToast, setUplinkToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleUplinkOdoo = async () => {
    setIsUplinking(true);
    setUplinkToast(null);
    try {
      const res = await api.uplinkTankStocks();
      if (res.success) {
        const ts = res.timestamp || new Date().toLocaleTimeString();
        setLastUplinkTime(ts);
        setUplinkToast({
          text: `Đã cập nhật số dư 3 bồn lên Odoo ERP thành công! (${ts})`,
          type: 'success',
        });
      } else {
        setUplinkToast({
          text: `Lỗi đồng bộ Odoo: ${res.error || 'Thao tác không thành công'}`,
          type: 'error',
        });
      }
    } catch (err: any) {
      setUplinkToast({
        text: `Lỗi kết nối Odoo ERP: ${err.message || 'Không thể đồng bộ'}`,
        type: 'error',
      });
    } finally {
      setIsUplinking(false);
      setTimeout(() => setUplinkToast(null), 5000);
    }
  };

  React.useEffect(() => {
    if (sqlOnline && !prevSqlOnlineRef.current) {
      if (fetchLiveStocks) {
        fetchLiveStocks(3, 300);
      } else {
        refreshStockBalance();
      }
    }
    prevSqlOnlineRef.current = !!sqlOnline;
  }, [sqlOnline]);

  const lowStockCount = stocks.filter((s: any) => {
    const rawStock = [s.currentStock, s.CurrentStock, s.current_stock, s.Total_Quantity].find((v) => v !== undefined && v !== null && v !== '' && !isNaN(Number(v)));
    const cur = rawStock !== undefined ? Number(rawStock) : 0;
    const thresh = Number(s.minThreshold || s.MinSafetyThreshold || 1000);
    return cur < thresh;
  }).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-mono">
      {/* Module 6 Header Banner */}
      <div className="bg-white border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider font-semibold">
              ISA-95 LEVEL 3 · INVENTORY OPERATIONS MANAGEMENT
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 leading-snug flex items-center gap-2 not-italic">
            <Boxes className="w-5 h-5 text-slate-800" />
            MATERIAL INVENTORY & CONSUMPTION SUITE
          </h1>
          <p className="text-xs text-slate-600 mt-0.5 font-sans font-normal">
            Quản lý tiếp nhận nguyên vật liệu, kiểm soát dung tích bồn chứa an toàn và tự động khấu trừ sau mẻ sản xuất.
          </p>
        </div>

        {/* Live Badges Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2.5 rounded-xs">
            <Layers className="w-4 h-4 text-slate-600" />
            <div className="text-left font-mono">
              <div className="text-[10px] text-slate-500 uppercase leading-none font-bold">Bồn giám sát</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">3 Silos / Tanks</div>
            </div>
          </div>

          <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 flex items-center gap-2.5 rounded-xs">
            <PackagePlus className="w-4 h-4 text-slate-600" />
            <div className="text-left font-mono">
              <div className="text-[10px] text-slate-500 uppercase leading-none font-bold">Phiếu nhập kho</div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{receipts.length} Receipts</div>
            </div>
          </div>

          <div
            className={`px-3.5 py-1.5 border flex items-center gap-2.5 rounded-xs ${
              lowStockCount > 0
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="text-left font-mono">
              <div className="text-[10px] opacity-75 uppercase leading-none font-bold">Cảnh báo tồn kho</div>
              <div className="text-xs font-bold leading-tight">
                {lowStockCount > 0 ? `${lowStockCount} Low Alert(s)` : 'Tất cả đạt chuẩn'}
              </div>
            </div>
          </div>

          {/* Odoo Uplink Action Button */}
          <button
            type="button"
            onClick={handleUplinkOdoo}
            disabled={isUplinking}
            data-state={isUplinking ? 'loading' : 'default'}
            className={`h-9 px-3.5 text-xs font-mono font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 border transition-none hallmark-focus active:translate-y-px rounded-xs ${
              isUplinking
                ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-wait'
                : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
            }`}
            title={lastUplinkTime ? `Lần đồng bộ Odoo cuối: ${lastUplinkTime}` : 'Đồng bộ số dư 3 bồn lên Odoo ERP'}
          >
            <UploadCloud className={`w-3.5 h-3.5 ${isUplinking ? 'animate-bounce text-sky-600' : 'text-slate-700'}`} />
            <span>{isUplinking ? 'ĐANG ĐỒNG BỘ...' : '↑ ĐỒNG BỘ TỒN BỒN LÊN ODOO'}</span>
          </button>
        </div>
      </div>

      {/* Non-blocking Uplink Toast Alert */}
      {uplinkToast && (
        <div
          className={`p-3 border font-mono text-xs flex items-center justify-between shadow-xs ${
            uplinkToast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-950'
              : 'bg-emerald-50 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {uplinkToast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-semibold">{uplinkToast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setUplinkToast(null)}
            className="text-slate-500 hover:text-slate-800 text-[10px] font-bold px-1.5 py-0.5 ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-Tabs Bar */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-2 gap-2 shadow-xs select-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('inbound')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all font-mono hallmark-focus active:translate-y-px ${
            activeSubTab === 'inbound'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <PackagePlus className="w-4 h-4 text-slate-700" />
          <span>CÀI ĐẶT NHẬP NGUYÊN LIỆU (INBOUND MATERIAL RECEIPT)</span>
          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-mono rounded-xs font-bold">
            {receipts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('stock_overview')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all font-mono hallmark-focus active:translate-y-px ${
            activeSubTab === 'stock_overview'
              ? 'border-slate-900 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4 text-slate-700" />
          <span>GIÁM SÁT TỔNG KHO & BỒN CHỨA (REAL-TIME STOCK & SILOS)</span>
          {lowStockCount > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-mono rounded-xs font-bold">
              !
            </span>
          )}
        </button>
      </div>

      {/* Sub-View Content */}
      <section aria-label="Inventory View Content">
        {activeSubTab === 'inbound' && <InboundReceipt />}
        {activeSubTab === 'stock_overview' && <RealTimeStock />}
      </section>
    </div>
  );
};

export default InventoryView;
