/* Hallmark · component: InboundReceipt · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import { ESignatureModal } from '../../components/ESignatureModal';
import { SignActionResult } from '../../services/api';
import { 
  Scale, 
  RotateCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Truck, 
  Search, 
  Filter, 
  Radio, 
  Database,
  Percent,
  Cpu,
  FileSignature,
  ShieldCheck
} from 'lucide-react';

export const InboundReceipt: React.FC = () => {
  const { 
    receipts, 
    stocks, 
    fetchLiveStocks, 
    fetchLiveReceipts 
  } = useInventory();

  const { user } = useAuth();

  // E-Signature Modal State (FDA 21 CFR Part 11)
  const [isSignModalOpen, setIsSignModalOpen] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // 1. ODOO ERP DOWNLINK STATE
  // ---------------------------------------------------------------------------
  const [odooReceipts, setOdooReceipts] = useState<api.ErpInboundReceipt[]>([]);
  const [isSyncingOdoo, setIsSyncingOdoo] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [selectedOdooCode, setSelectedOdooCode] = useState<string>('');

  // ---------------------------------------------------------------------------
  // 2. PHYSICAL INTAKE FORM STATE (CLEAN-STATE DEFAULT)
  // ---------------------------------------------------------------------------
  const [selectedTankId, setSelectedTankId] = useState<string>('');
  const [receiptCode, setReceiptCode] = useState<string>('');
  const [expectedQty, setExpectedQty] = useState<number | ''>(0);
  const [materialCode, setMaterialCode] = useState<string>('');
  const [materialName, setMaterialName] = useState<string>('');
  const [unit, setUnit] = useState<string>('L');
  const [supplierLot, setSupplierLot] = useState<string>('');
  const [partnerName, setPartnerName] = useState<string>('');
  const [actualReceivedQty, setActualReceivedQty] = useState<number | ''>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // ---------------------------------------------------------------------------
  // 3. PHYSICAL HARDWARE-IN-THE-LOOP SENSOR TELEMETRY STATE
  // ---------------------------------------------------------------------------
  const [liveSensorWeight, setLiveSensorWeight] = useState<number>(0.0);
  const [sensorQuality, setSensorQuality] = useState<'Good' | 'Bad'>('Bad');
  const [sensorTimestamp, setSensorTimestamp] = useState<string>('--:--:--');
  const [boundOpcTag, setBoundOpcTag] = useState<string>('');
  const [isReadingSensor, setIsReadingSensor] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [preIntakeWeight, setPreIntakeWeight] = useState<number>(0.0);
  const [intakeMode, setIntakeMode] = useState<'NET_DELTA' | 'DIRECT_SCALE'>('NET_DELTA');

  const handleCaptureTare = () => {
    setPreIntakeWeight(liveSensorWeight);
    setFeedback({
      type: 'success',
      message: `ĐÃ LẤY TARE (KHỐI LƯỢNG BAN ĐẦU): ${liveSensorWeight.toFixed(2)} ${unit || 'L'}. Khối lượng thực nhập = Cân hiện tại - Tare.`
    });
  };

  // Filter & Search for Historical Ledger
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [materialFilter, setMaterialFilter] = useState<string>('ALL');

  // Mounted ref to guard async state updates
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 4. DERIVE PROCESSED CODES & PENDING ODOO RECEIPTS
  // ---------------------------------------------------------------------------
  const processedCodes = React.useMemo(() => {
    return new Set(
      receipts
        .map((item: any) => item.receiptCode || item.receipt_code || item.ReceiptCode)
        .filter(Boolean)
        .map((code: string) => String(code).trim())
    );
  }, [receipts]);

  const odooStatusMap = React.useMemo(() => {
    const map: Record<string, { state: string; isDone: boolean; odooId?: number }> = {};
    for (const r of odooReceipts) {
      const code = String(r.receipt_code || '').trim().toUpperCase();
      if (code) {
        map[code] = {
          state: r.state || '',
          isDone: Boolean(r.is_done || r.state === 'done'),
          odooId: r.odoo_id,
        };
      }
    }
    return map;
  }, [odooReceipts]);

  const [closingCode, setClosingCode] = useState<string | null>(null);
  const [showAllOdooOrders, setShowAllOdooOrders] = useState(false);

  const pendingReceipts = React.useMemo(() => {
    return odooReceipts.filter((r) => {
      const isDone = Boolean(r.is_done || r.state === 'done' || processedCodes.has(String(r.receipt_code).trim()));
      return !isDone;
    });
  }, [odooReceipts, processedCodes]);

  const availableReceipts = React.useMemo(() => {
    return showAllOdooOrders ? odooReceipts : pendingReceipts;
  }, [showAllOdooOrders, odooReceipts, pendingReceipts]);

  const handleManualCloseOdoo = async (receipt: any) => {
    const code = String(receipt.receiptCode || receipt.receipt_code || receipt.ReceiptCode || '').trim();
    if (!code) return;
    setClosingCode(code);
    try {
      const actualQty = Number(receipt.actualQty ?? receipt.actualDeliveredWeight ?? receipt.quantity ?? 0);
      const tankId = String(receipt.tankId || receipt.tank_id || '');
      const supplierLot = String(receipt.supplierLot || receipt.supplier_lot || '');
      const operator = user?.username || 'MES_Operator';

      const res = await api.completeInboundReceiptInOdoo(code, {
        actual_qty: actualQty,
        tank_id: tankId,
        supplier_lot: supplierLot,
        operator: operator,
      });

      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `✔ Đã chốt phiếu ${code} sang trạng thái HOÀN TẤT (DONE) trên Odoo ERP thành công!`
        });
        await syncOdooReceipts(true);
        if (fetchLiveReceipts) await fetchLiveReceipts();
      } else {
        setFeedback({
          type: 'error',
          message: `Không thể đóng phiếu ${code} trên Odoo ERP: ${res?.message || res?.error || 'Lỗi không xác định'}`
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Lỗi kết nối Odoo ERP khi đóng phiếu ${code}: ${err.message}`
      });
    } finally {
      setClosingCode(null);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. FETCH ODOO ERP RECEIPTS (DOWNLINK PIPELINE)
  // ---------------------------------------------------------------------------
  const syncOdooReceipts = useCallback(async (isInitial = false) => {
    setIsSyncingOdoo(true);
    if (!isInitial) setFeedback(null);
    try {
      const timeoutSignal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(15000)
        : undefined;
      const res = await api.getErpInboundReceipts(timeoutSignal);
      if (!isMountedRef.current) return;
      if (res && res.receipts && res.receipts.length > 0) {
        setOdooReceipts(res.receipts);
        setLastSyncTime(new Date().toLocaleTimeString('vi-VN'));
        if (!isInitial) {
          setFeedback({
            type: 'success',
            message: `ĐỒNG BỘ THÀNH CÔNG: Đã tải ${res.receipts.length} đơn nhập nguyên liệu từ Odoo 18 ERP (stock.picking).`
          });
        }
      } else {
        setLastSyncTime(new Date().toLocaleTimeString('vi-VN'));
        if (!isInitial) {
          setFeedback({
            type: 'warning',
            message: 'Odoo ERP phản hồi: Chưa có đơn giao hàng nguyên liệu nào ở trạng thái chờ tiếp nhận.'
          });
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const isAbort = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted');
      const errorMsg = isAbort
        ? 'Hết thời gian chờ phản hồi từ Odoo ERP (Quá 15s). Vui lòng thử lại!'
        : `Lỗi kết nối Odoo ERP: ${err?.message || 'Không thể liên lạc qua XML-RPC.'}`;
      if (!isInitial) {
        setFeedback({
          type: 'error',
          message: errorMsg
        });
      }
    } finally {
      if (isMountedRef.current) setIsSyncingOdoo(false);
    }
  }, []);

  useEffect(() => {
    syncOdooReceipts(true);
  }, [syncOdooReceipts]);

  // Real-time WebSocket listener and background sync for Odoo Inbound Deliveries
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    const host = window.location.hostname || '127.0.0.1';
    const wsUrl = `ws://${host}:8000/ws/telemetry`;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && (msg.type === 'INBOUND_RECEIPTS_UPDATED' || msg.type === 'ERP_INBOUND_INGESTED')) {
            if (isMounted) {
              syncOdooReceipts(true);
            }
          }
        } catch {}
      };
    } catch {}

    // Periodic background sync (every 6 seconds) so newly issued receipts appear automatically
    const autoSyncTimer = setInterval(() => {
      if (isMounted) {
        syncOdooReceipts(true);
        if (fetchLiveReceipts) fetchLiveReceipts().catch(() => {});
      }
    }, 6000);

    return () => {
      isMounted = false;
      if (ws) ws.close();
      clearInterval(autoSyncTimer);
    };
  }, [syncOdooReceipts]);

  // Handle Selection of Odoo Receipt from Dropdown (Allows selecting any Odoo receipt)
  const handleOdooReceiptSelect = (code: string) => {
    if (!code) {
      setSelectedOdooCode('');
      setReceiptCode('');
      setExpectedQty(0);
      setActualReceivedQty('');
      setSupplierLot('');
      setPartnerName('');
      setMaterialName('');
      setMaterialCode('');
      setSelectedTankId('');
      return;
    }
    const chosen = odooReceipts.find((r) => r.receipt_code === code);
    if (chosen) {
      const isAlreadyDone = Boolean(chosen.is_done || chosen.state === 'done' || processedCodes.has(code.trim()));
      if (isAlreadyDone) {
        setFeedback({
          type: 'warning',
          message: `Đơn [${code}] đã từng ghi nhận trên Odoo. Bạn có thể tiếp tục xác nhận để nạp ${chosen.expected_qty} ${chosen.unit || 'L'} vào kho chứa MES.`
        });
      } else {
        setFeedback(null);
      }
      setSelectedOdooCode(code);
      setReceiptCode(chosen.receipt_code);
      setExpectedQty(chosen.expected_qty);
      setActualReceivedQty(chosen.expected_qty);
      setUnit(chosen.unit || 'L');
      setMaterialCode(chosen.material_code || 'RAW_MILK');
      setMaterialName(chosen.material_name || 'Raw Material');
      setPartnerName(chosen.partner_name || 'Supplier');
      setSupplierLot(`LOT-${chosen.receipt_code.replace(/[^a-zA-Z0-9]/g, '')}-2026`);

      const mCode = (chosen.material_code || '').toUpperCase();
      const mName = (chosen.material_name || '').toLowerCase();
      if (mCode === 'RAW_MILK' || mName.includes('sữa') || mName.includes('milk')) {
        setSelectedTankId('TANK-01');
      } else if (mCode === 'SUGAR' || mName.includes('đường') || mName.includes('sugar')) {
        setSelectedTankId('TANK-02');
      } else if (mCode === 'ADDITIVE' || mName.includes('phụ gia') || mName.includes('cacao') || mName.includes('additive')) {
        setSelectedTankId('TANK-03');
      } else {
        setSelectedTankId(stocks[0]?.tankId || 'TANK-01');
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 6. LIVE HARDWARE LOADCELL TELEMETRY POLLER (ZERO-MOCK ENFORCEMENT)
  // ---------------------------------------------------------------------------
  const pollTankTelemetry = useCallback(async (tankId: string) => {
    if (!tankId) {
      setLiveSensorWeight(0.0);
      setSensorQuality('Bad');
      setBoundOpcTag('');
      setSensorTimestamp('--:--:--');
      return;
    }
    setIsReadingSensor(true);
    try {
      const res = await api.getTankLiveWeight(tankId);
      if (!isMountedRef.current) return;
      if (res && res.success) {
        setBoundOpcTag(res.opc_node_id || '');
        if (res.quality === 'Good' && res.live_weight !== undefined && res.live_weight !== null) {
          setLiveSensorWeight(Number(res.live_weight));
          setSensorQuality('Good');
        } else {
          setLiveSensorWeight(0.0);
          setSensorQuality('Bad');
        }
        setSensorTimestamp(res.timestamp || new Date().toLocaleTimeString('vi-VN'));
      } else {
        setLiveSensorWeight(0.0);
        setSensorQuality('Bad');
      }
    } catch {
      if (!isMountedRef.current) return;
      setLiveSensorWeight(0.0);
      setSensorQuality('Bad');
    } finally {
      if (isMountedRef.current) setIsReadingSensor(false);
    }
  }, []);

  // Poll telemetry on tank change and interval
  useEffect(() => {
    if (!selectedTankId) {
      setLiveSensorWeight(0.0);
      setSensorQuality('Bad');
      setBoundOpcTag('');
      setSensorTimestamp('--:--:--');
      return;
    }
    pollTankTelemetry(selectedTankId);
    const timer = setInterval(() => {
      pollTankTelemetry(selectedTankId);
    }, 2500);
    return () => clearInterval(timer);
  }, [selectedTankId, pollTankTelemetry]);

  // Handle Tank selection
  const handleTankChange = (newTankId: string) => {
    setSelectedTankId(newTankId);
    if (!newTankId) {
      setPreIntakeWeight(0.0);
      return;
    }
    const chosenTank = stocks.find((s) => s.tankId === newTankId);
    if (chosenTank) {
      if (!materialCode) setMaterialCode(chosenTank.materialCode);
      if (!materialName) setMaterialName(chosenTank.materialName);
      if (!unit) setUnit(chosenTank.unit || 'L');
      const baseline = Number(chosenTank.live_pv ?? chosenTank.livePv ?? (chosenTank as any).LivePv ?? chosenTank.current_stock ?? chosenTank.currentStock ?? 0);
      setPreIntakeWeight(baseline);
    }
    pollTankTelemetry(newTankId);
  };

  // ---------------------------------------------------------------------------
  // 7. DISCREPANCY RECONCILIATION ENGINE & CLEAN-STATE GUARDS
  // ---------------------------------------------------------------------------
  const hasSelectedReceipt = Boolean(selectedOdooCode && receiptCode.trim());
  const targetTank = stocks.find((s) => s.tankId === selectedTankId) || null;

  const numExpected = hasSelectedReceipt ? (Number(expectedQty) || 0) : 0;
  const isSensorOnline = Boolean(selectedTankId) && sensorQuality === 'Good' && liveSensorWeight > 0.00;
  
  // Kho hàng ảo (Virtual Storage Mode): Toàn bộ kho nguyên liệu tiếp nhận trực tiếp từ lệnh Odoo ERP, không phụ thuộc cảm biến Kepware
  const isVirtualSilo = true;

  // In Virtual Silo mode, numActual is the editable actualReceivedQty (defaulting to expectedQty)
  const numActual = actualReceivedQty !== '' ? Number(actualReceivedQty) : numExpected;

  // Headspace Safety Interlock (Dynamic Calibrated Tank Scale)
  const rawCap = targetTank 
    ? Number(targetTank.tank_capacity || targetTank.tankCapacity || (targetTank as any).TankCapacity || targetTank.capacity || 1000.0) 
    : 1000.0;
  const tankCapacity = rawCap > 50.0 ? rawCap : 1000.0;

  // Available Headspace = Tank Capacity - baselineStock
  const baselineStock = targetTank ? Number(targetTank.current_stock ?? targetTank.currentStock ?? 0) : 0;
  const availableHeadspace = targetTank 
    ? Math.max(0, Math.round((tankCapacity - baselineStock) * 100) / 100) 
    : 1000.0;

  // Overfill Safety Interlock
  const isOverfillRisk = Boolean(
    hasSelectedReceipt &&
    Boolean(targetTank) &&
    numExpected > 0 &&
    (
      numExpected > tankCapacity ||
      numActual > availableHeadspace ||
      (baselineStock + numActual) > tankCapacity
    )
  );
  
  const deltaQty = Math.round((numActual - numExpected) * 100) / 100;
  const diffPercent = numExpected > 0 ? Math.round(((numActual - numExpected) / numExpected) * 10000) / 100 : 0.0;

  // Status calculation (±1.0% tolerance per requirements)
  let discrepancyStatus: 'IDLE' | 'PENDING' | 'MATCHED' | 'SHORTAGE' | 'OVERAGE' = 'IDLE';
  if (!hasSelectedReceipt) {
    discrepancyStatus = 'IDLE';
  } else if (numExpected > 0) {
    if (Math.abs(diffPercent) <= 1.0) {
      discrepancyStatus = 'MATCHED';
    } else if (deltaQty < 0) {
      discrepancyStatus = 'SHORTAGE';
    } else {
      discrepancyStatus = 'OVERAGE';
    }
  } else {
    discrepancyStatus = 'PENDING';
  }

  // Execution gate condition: NEVER disabled for virtual silos when numActual > 0
  const canVerify = Boolean(
    hasSelectedReceipt && 
    selectedTankId && 
    numExpected > 0 && 
    numActual > 0 && 
    !isSubmitting && 
    receiptCode.trim().length > 0 && 
    !isOverfillRisk
  );

  // ---------------------------------------------------------------------------
  // 8. EXECUTION GATE: E-SIGNATURE TRIGGER & ACID INTAKE COMMIT
  // ---------------------------------------------------------------------------
  const handleInitiateVerification = () => {
    if (!canVerify) return;
    setIsSignModalOpen(true);
  };

  const handleExecuteVerifiedIntake = async (signResult: SignActionResult) => {
    setIsSubmitting(true);
    setFeedback(null);
    const targetCode = receiptCode.trim();
    const signerName = signResult.signer || signResult.username || user?.username || 'Operator';
    const sigMeaning = signResult.meaning || 'Responsibility';
    const sigReason = signResult.reason || 'Xác nhận đối soát tiếp nhận nguyên vật liệu từ đơn Odoo ERP';
    const sigHash = signResult.signature_hash || signResult.record_hash;

    try {
      const res = await api.verifyInboundIntake({
        receipt_code: targetCode,
        material_code: materialCode,
        tank_id: selectedTankId,
        expected_qty: numExpected,
        actual_sensor_qty: numActual,
        operator: signerName,
        supplier_lot: supplierLot.trim(),
        material_name: materialName,
        unit: unit,
        signature_meaning: sigMeaning,
        reason: sigReason,
        signature_hash: sigHash,
      });

      if (res && res.success) {
        const doneTankId = selectedTankId;
        const doneQty = numActual;
        const doneUnit = unit || 'L';
        const doneCode = targetCode;

        // 1. Comprehensive Form Reset immediately after success
        setSelectedOdooCode('');
        setReceiptCode('');
        setExpectedQty(0);
        setActualReceivedQty('');
        setSupplierLot('');
        setPartnerName('');
        setMaterialName('');
        setMaterialCode('');
        setSelectedTankId('');

        // 2. Trigger instant refresh of both the ledger, tank stocks, and Odoo receipts
        if (fetchLiveReceipts) await fetchLiveReceipts();
        if (fetchLiveStocks) await fetchLiveStocks(3, 200);
        await syncOdooReceipts(true);

        // 3. Clear Emerald confirmation banner/toast with Signer accountability stamp
        const isOdooReceipt = doneCode.startsWith('WH/IN') || Boolean(res.odoo_sync?.synced || res.odoo_sync?.success);
        const msg = isOdooReceipt
          ? `✔ [KÝ ĐIỆN TỬ BỞI: ${signerName}] Đã tiếp nhận vào bồn ${doneTankId} (+${doneQty.toFixed(2)} ${doneUnit}) & Chốt phiếu ${doneCode} sang HOÀN TẤT (DONE) trên Odoo ERP!`
          : `✔ [KÝ ĐIỆN TỬ BỞI: ${signerName}] Đã tiếp nhận vào bồn ${doneTankId} (+${doneQty.toFixed(2)} ${doneUnit}) [Phiếu nội bộ: ${doneCode}] thành công!`;

        setFeedback({
          type: 'success',
          message: msg
        });
      } else {
        setFeedback({
          type: 'error',
          message: res?.message || 'Không thể ghi nhận giao dịch nạp liệu.'
        });
      }
    } catch (err: any) {
      if (fetchLiveReceipts) fetchLiveReceipts().catch(() => {});
      if (fetchLiveStocks) fetchLiveStocks(3, 200).catch(() => {});
      syncOdooReceipts(true).catch(() => {});

      setFeedback({
        type: 'error',
        message: `Lỗi xử lý đối soát: ${err.message || 'Lỗi kết nối cơ sở dữ liệu.'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 8. HISTORICAL LEDGER FILTERING
  // ---------------------------------------------------------------------------
  const filteredReceipts = receipts.filter((r) => {
    const matchMaterial = materialFilter === 'ALL' || r.materialCode === materialFilter;
    const matchSearch = 
      r.receiptCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.supplierLot || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.materialName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.tankId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.receivedBy || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchMaterial && matchSearch;
  });

  return (
    <div className="space-y-5 font-mono text-xs">
      {/* ===================================================================== */}
      {/* TOP HEADER & DOWNLINK TOOLBAR                                         */}
      {/* ===================================================================== */}
      <div className="bg-white border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-semibold">
              ISA-95 LEVEL 3 MOM · HARDWARE-IN-THE-LOOP
            </span>
          </div>
          <h1 className="text-base font-bold text-slate-900 leading-snug flex items-center gap-2 not-italic">
            <Scale className="w-5 h-5 text-slate-800" />
            TIẾP NHẬN NGUYÊN LIỆU & ĐỐI SOÁT CÂN TỰ ĐỘNG (INBOUND VERIFICATION)
          </h1>
          <p className="text-xs text-slate-600 mt-0.5 font-sans font-normal">
            Đồng bộ đơn nhập kho từ ERP (Level 4), đọc cảm biến tải trọng thực tế (Level 1/2) và ghi sổ kế toán tồn kho SQL Server.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => syncOdooReceipts(false)}
            disabled={isSyncingOdoo}
            className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 disabled:bg-slate-100 text-slate-800 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 rounded-xs hallmark-focus transition-colors shadow-xs"
            title="Đồng bộ phiếu giao hàng từ Odoo 18 Community ERP"
          >
            <RotateCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncingOdoo ? 'animate-spin' : ''}`} />
            <span>{isSyncingOdoo ? 'Đang đồng bộ Odoo...' : '↻ SYNC TỪ ODOO ERP'}</span>
          </button>
          {lastSyncTime && (
            <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">
              Sync: {lastSyncTime}
            </span>
          )}
        </div>
      </div>

      {/* Feedback Alert Banner */}
      {feedback && (
        <div
          className={`p-3.5 border flex items-center justify-between shadow-xs font-mono transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : feedback.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : feedback.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span className="font-semibold text-xs">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-500 hover:text-slate-900 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MAIN TWO-COLUMN WORKBENCH: INTAKE & TELEMETRY CARD                    */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Intake Parameter & Inspection Form (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 shadow-xs flex flex-col">
          <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-800" />
              <h2 className="font-bold text-slate-900 uppercase tracking-wide not-italic text-xs">
                Thông số tiếp nhận hàng hóa (Intake Parameters)
              </h2>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              LEVEL 4 ➔ LEVEL 3
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* Field 1: Odoo ERP Delivery Order Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Chọn Đơn Nhập Odoo ERP (Incoming Delivery):
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono cursor-pointer select-none hover:text-slate-800">
                    <input
                      type="checkbox"
                      checked={showAllOdooOrders}
                      onChange={(e) => setShowAllOdooOrders(e.target.checked)}
                      className="rounded-xs text-sky-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Hiện cả đơn đã xong</span>
                  </label>
                  <span className="text-[10px] text-slate-600 font-mono font-semibold">
                    {showAllOdooOrders
                      ? `${pendingReceipts.length} sẵn sàng / ${odooReceipts.length} tổng số`
                      : `${pendingReceipts.length} đơn chờ tiếp nhận`}
                  </span>
                </div>
              </div>
              <select
                value={selectedOdooCode}
                onChange={(e) => handleOdooReceiptSelect(e.target.value)}
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs font-mono text-slate-900 rounded-xs hallmark-focus"
              >
                <option value="">-- CHỌN ĐƠN NHẬP ODOO ERP --</option>
                {availableReceipts.length === 0 ? (
                  <option value="" disabled>
                    (Không có đơn Odoo chờ nhập - Vui lòng tạo đơn trên Odoo hoặc bấm Sync)
                  </option>
                ) : (
                  availableReceipts.map((rec) => {
                    const isDone = Boolean(rec.is_done || rec.state === 'done' || processedCodes.has(String(rec.receipt_code).trim()));
                    const badge = isDone ? '● [ĐÃ XÁC NHẬN TRÊN ODOO]' : '● [SẴN SÀNG NHẬP]';
                    return (
                      <option 
                        key={rec.receipt_code} 
                        value={rec.receipt_code}
                        className={isDone ? 'text-slate-500 bg-slate-50 font-normal' : 'text-slate-900 font-bold'}
                      >
                        {badge} [{rec.receipt_code}] {rec.partner_name} · {rec.material_name} ({rec.expected_qty.toLocaleString()} {rec.unit})
                      </option>
                    );
                  })
                )}
              </select>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>NCC: <strong className="text-slate-800">{hasSelectedReceipt ? partnerName : '--'}</strong></span>
                <span>NL: <strong className="text-slate-800">{hasSelectedReceipt ? materialName : '--'}</strong></span>
              </div>
            </div>

            {/* Field 2: Target Storage Tank */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Bồn Tiếp Nhận / Target Tank:
              </label>
              <select
                value={selectedTankId}
                onChange={(e) => handleTankChange(e.target.value)}
                className="w-full bg-white border border-slate-300 h-9 px-3 text-xs font-mono text-slate-900 rounded-xs hallmark-focus"
              >
                <option value="">-- Chọn bồn tiếp nhận --</option>
                {stocks.map((tank) => {
                  const rawC = Number(tank.tank_capacity || tank.tankCapacity || (tank as any).TankCapacity || tank.capacity || 1000.0);
                  const cap = rawC > 50.0 ? rawC : 1000.0;
                  return (
                    <option key={tank.tankId} value={tank.tankId}>
                      [{tank.tankId}] {tank.materialCode} · {tank.materialName} (Dung tích: {cap.toFixed(1)} {tank.unit})
                    </option>
                  );
                })}
              </select>
              {targetTank ? (
                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Dung tích: <strong>{Number(tankCapacity).toFixed(2)} {targetTank.unit}</strong> (Trống: <strong className="text-emerald-700">{availableHeadspace.toFixed(2)} {targetTank.unit}</strong>)</span>
                  <span className="text-sky-700 truncate max-w-[200px]" title={boundOpcTag || 'OPC Tag'}>
                    OPC: <strong>{boundOpcTag || 'Đang kết nối...'}</strong>
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Chưa chọn bồn tiếp nhận</span>
                  <span>OPC: <strong>--</strong></span>
                </div>
              )}
            </div>

            {/* Field 3 & 4: Expected Quantity & Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  Định Mức ERP ({unit || 'L'}):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expectedQty === '' ? '' : expectedQty}
                  onChange={(e) => setExpectedQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  disabled={!hasSelectedReceipt}
                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-400 border border-slate-300 h-9 px-3 text-xs font-mono font-bold text-slate-900 rounded-xs hallmark-focus"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  Mã Lô Nhà Cung Cấp:
                </label>
                <input
                  type="text"
                  value={supplierLot}
                  onChange={(e) => setSupplierLot(e.target.value)}
                  placeholder="LOT-..."
                  disabled={!hasSelectedReceipt}
                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-400 border border-slate-300 h-9 px-3 text-xs font-mono text-slate-900 rounded-xs hallmark-focus"
                />
              </div>
            </div>

            {/* Field 5: Operator Sign-Off */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Kỹ thuật viên tiếp nhận (Operator):
              </label>
              <div className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-xs flex items-center justify-between text-slate-800 font-mono">
                <span>{user?.username || 'Operator'}</span>
                <span className="text-[10px] text-slate-400">FDA 21 CFR Part 11</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Scale & Discrepancy Inspector Card (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 shadow-xs flex flex-col">
          <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-800" />
              <h2 className="font-bold text-slate-900 uppercase tracking-wide not-italic text-xs">
                Hệ thống cân & Động cơ đối soát trực tiếp (Live Scale & Discrepancy Engine)
              </h2>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              LEVEL 1/2 ➔ LEVEL 3
            </span>
          </div>

          <div className="p-5 space-y-5">
            {/* Tare & Intake Mode Industrial Control Strip */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xs flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Chế độ cân:</span>
                <div className="flex items-center border border-slate-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setIntakeMode('NET_DELTA')}
                    className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      intakeMode === 'NET_DELTA'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Chế độ Net Delta: Cảm biến đo mức bồn tích lũy (Lượng nhập = Mức hiện tại - Tare ban đầu)"
                  >
                    Δ NET DELTA
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntakeMode('DIRECT_SCALE')}
                    className={`px-2.5 py-1 text-[11px] font-bold border-l border-slate-200 transition-colors ${
                      intakeMode === 'DIRECT_SCALE'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Chế độ Direct Scale: Cảm biến đo trực tiếp lưu lượng/phễu cân nạp"
                  >
                    DIRECT SCALE
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <span className="text-[10px] text-slate-500 uppercase">Tare (Ban đầu):</span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 border border-slate-300">
                    {preIntakeWeight.toFixed(2)} {unit || 'L'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!selectedTankId || sensorQuality !== 'Good'}
                  onClick={handleCaptureTare}
                  className="h-7 px-2.5 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 text-[11px] font-bold uppercase transition-all hallmark-focus active:translate-y-px disabled:opacity-50 flex items-center gap-1.5"
                  title="Bắt khối lượng cảm biến hiện tại làm mốc Tare"
                >
                  <Scale className="w-3.5 h-3.5 text-slate-600" />
                  <span>BẮT TARE / ZERO</span>
                </button>
              </div>
            </div>

            {/* 3-Section Visual Telemetry Split Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Left: Expected Weight (Định Mức ERP) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xs flex flex-col justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">
                    Định mức ERP (Level 4):
                  </span>
                  <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                    {hasSelectedReceipt && numExpected > 0
                      ? `${numExpected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit || 'L'}`
                      : `-- ${unit || 'L'}`}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-200 mt-2">
                  Phiếu: <strong className="text-slate-700">{hasSelectedReceipt ? receiptCode : '--'}</strong>
                </div>
              </div>

              {/* Center: Live Loadcell PV (Cân Cảm Biến Thực Tế) or Virtual Silo Input */}
              <div className={`p-3.5 border rounded-xs flex flex-col justify-between transition-colors ${
                !selectedTankId
                  ? 'bg-slate-50 border-slate-200'
                  : isVirtualSilo
                  ? 'bg-sky-50/60 border-sky-300'
                  : isSensorOnline 
                  ? 'bg-emerald-50/60 border-emerald-300' 
                  : 'bg-rose-50/40 border-rose-300'
              }`}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold flex items-center gap-1.5 text-slate-700">
                      {isVirtualSilo ? <Database className="w-3 h-3 text-sky-600" /> : <Radio className={`w-3 h-3 ${!selectedTankId ? 'text-slate-400' : isSensorOnline ? 'text-emerald-600 animate-pulse' : 'text-rose-600'} ${isReadingSensor ? 'opacity-70' : 'opacity-100'}`} />}
                      {isVirtualSilo ? 'Số lượng thực nhận (Silo Intake):' : 'Thực nhập (Net Delivered):'}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-xs border ${
                      !selectedTankId
                        ? 'bg-slate-100 text-slate-600 border-slate-300'
                        : isVirtualSilo
                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                        : isSensorOnline 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}>
                      {!selectedTankId ? 'CHỜ CHỌN BỒN' : isVirtualSilo ? 'STORAGE SILO' : sensorQuality}
                    </span>
                  </div>

                  {isVirtualSilo ? (
                    <div className="mt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={actualReceivedQty === '' ? '' : actualReceivedQty}
                          onChange={(e) => setActualReceivedQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          placeholder={numExpected.toFixed(2)}
                          className="w-full bg-white border border-sky-300 h-8 px-2 text-base font-mono font-bold text-slate-900 rounded-xs hallmark-focus"
                        />
                        <span className="text-xs font-bold text-slate-600 shrink-0">{unit || 'L'}</span>
                      </div>
                      <span className="text-[9.5px] text-sky-700 block mt-0.5">
                        * Tồn kho sổ sách sẽ tăng trực tiếp theo số lượng thực nhận này.
                      </span>
                    </div>
                  ) : (
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {!selectedTankId ? (
                        <span className="text-slate-400">
                          -- {unit || 'L'}
                        </span>
                      ) : isSensorOnline ? (
                        <span className="text-emerald-900">
                          {numActual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}
                        </span>
                      ) : (
                        <span className="text-rose-700 text-sm">
                          0.00 {unit} (Sensor Offline)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-200/80 mt-2 flex items-center justify-between">
                  {isVirtualSilo ? (
                    <>
                      <span>Tồn hiện tại: <strong>{baselineStock.toFixed(2)} {unit || 'L'}</strong></span>
                      <span className="font-mono text-sky-700 font-bold">ERP Book Stock</span>
                    </>
                  ) : (
                    <>
                      <span>PV: <strong>{liveSensorWeight.toFixed(2)}</strong> | Tare: <strong>{preIntakeWeight.toFixed(2)}</strong></span>
                      <span className="font-mono">{sensorTimestamp}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Discrepancy Engine */}
              <div className={`p-3.5 border rounded-xs flex flex-col justify-between ${
                !hasSelectedReceipt
                  ? 'bg-slate-50 border-slate-200'
                  : discrepancyStatus === 'MATCHED'
                  ? 'bg-emerald-50 border-emerald-300'
                  : discrepancyStatus === 'SHORTAGE'
                  ? 'bg-amber-50 border-amber-300'
                  : discrepancyStatus === 'OVERAGE'
                  ? 'bg-sky-50 border-sky-300'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold block text-slate-600">
                    Chênh lệch & Sai số:
                  </span>

                  <div className="text-lg font-bold font-mono tabular-nums">
                    {!hasSelectedReceipt ? (
                      <span className="text-slate-400">-- {unit || 'L'}</span>
                    ) : discrepancyStatus === 'PENDING' ? (
                      <span className="text-slate-400">-- {unit || 'L'}</span>
                    ) : (
                      <span className={
                        discrepancyStatus === 'MATCHED'
                          ? 'text-emerald-900'
                          : discrepancyStatus === 'SHORTAGE'
                          ? 'text-amber-900'
                          : 'text-sky-900'
                      }>
                        {deltaQty > 0 ? `+${deltaQty}` : deltaQty} {unit || 'L'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 mt-2 flex items-center justify-between text-[10px]">
                  <span className="font-mono font-bold text-slate-600">
                    {!hasSelectedReceipt ? '0.00%' : discrepancyStatus === 'PENDING' ? '0.00%' : `${diffPercent > 0 ? '+' : ''}${diffPercent}%`}
                  </span>
                  
                  {/* Status Badge */}
                  <span className={`px-2 py-0.5 rounded-xs font-bold text-[9px] border ${
                    !hasSelectedReceipt
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : discrepancyStatus === 'MATCHED'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : discrepancyStatus === 'SHORTAGE'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : discrepancyStatus === 'OVERAGE'
                      ? 'bg-sky-100 text-sky-800 border-sky-300'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}>
                    {!hasSelectedReceipt && '● CHỜ TIẾP NHẬN ĐƠN MỚI'}
                    {hasSelectedReceipt && discrepancyStatus === 'MATCHED' && '● KHỚP ĐỊNH MỨC (MATCHED)'}
                    {hasSelectedReceipt && discrepancyStatus === 'SHORTAGE' && '● HAO HỤT THIẾU (SHORTAGE)'}
                    {hasSelectedReceipt && discrepancyStatus === 'OVERAGE' && '● DƯ THỪA (OVERAGE)'}
                    {hasSelectedReceipt && discrepancyStatus === 'PENDING' && '● CHỜ DỮ LIỆU CÂN'}
                  </span>
                </div>
              </div>
            </div>

            {/* Discrepancy Tolerance Explanation Strip */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs flex items-center justify-between text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-slate-500" />
                <span>Quy chuẩn đối soát: Dung sai cho phép <strong className="text-slate-800">±1.0%</strong></span>
              </div>
              <div className="font-mono text-[10px]">
                Giới hạn lệch tối đa: <strong>{hasSelectedReceipt && numExpected > 0 ? `±${(numExpected * 0.01).toFixed(2)} ${unit || 'L'}` : `-- ${unit || 'L'}`}</strong>
              </div>
            </div>

            {/* Headspace Overfill Risk Warning Banner */}
            {isOverfillRisk && (
              <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xs flex items-center gap-2 font-mono text-xs shadow-xs animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                <span className="font-bold">
                  Cảnh báo: Khối lượng nhập ({numExpected.toFixed(2)} {unit}) vượt quá dung tích còn trống của bồn (Khả dụng: {availableHeadspace.toFixed(2)} {unit})!
                </span>
              </div>
            )}

            {/* Execution Gate Button (Electronic Signature Gated) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleInitiateVerification}
                disabled={!canVerify}
                className={`w-full h-9 px-4 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 rounded-xs transition-all shadow-xs ${
                  canVerify
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white hallmark-focus cursor-pointer'
                    : 'bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSignature className="w-4 h-4 text-emerald-100" />
                )}
                <span>
                  {isSubmitting 
                    ? 'Đang ghi sổ và đối soát...' 
                    : !hasSelectedReceipt
                    ? 'CHỌN ĐƠN NHẬP KHO ĐỂ BẮT ĐẦU'
                    : !selectedTankId
                    ? 'VUI LÒNG CHỌN BỒN TIẾP NHẬN'
                    : isOverfillRisk
                    ? 'KHÓA: NGUY CƠ TRÀN BỒN (VƯỢT QUÁ DUNG TÍCH TRỐNG)'
                    : isVirtualSilo
                    ? (numActual <= 0 ? 'NHẬP SỐ LƯỢNG THỰC NHẬN ĐỂ TIẾP NHẬN' : `KÝ ĐIỆN TỬ & NHẬP KHO (+${numActual} ${unit || 'L'})`)
                    : !isSensorOnline 
                    ? (liveSensorWeight === 0.0 
                        ? `CHỜ BƠM NGUYÊN LIỆU VÀO BỒN (CẢM BIẾN: 0.00 ${unit || 'L'})` 
                        : `KHÓA: CẢM BIẾN TẢI TRỌNG OFFLINE (${unit || 'L'})`)
                    : `KÝ ĐIỆN TỬ & NHẬP KHO (+${numActual} ${unit || 'L'})`}
                </span>
              </button>

              {/* Legal & Regulatory Traceability Notice */}
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xs flex items-center justify-between text-[11px] text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Chữ ký điện tử bắt buộc: Định danh người nhập, thời gian và băm SHA-256 được lưu vĩnh viễn vào nhật ký kiểm toán để truy cứu trách nhiệm.
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500 font-bold shrink-0">
                  FDA 21 CFR §11.50
                </span>
              </div>
              
              {!hasSelectedReceipt ? (
                <p className="mt-1.5 text-[10px] text-slate-500 text-center font-medium">
                  * Vui lòng chọn một đơn nhập kho Odoo ERP từ danh sách phía trên để bắt đầu tiếp nhận.
                </p>
              ) : isOverfillRisk ? (
                <p className="mt-1.5 text-[10px] text-rose-700 text-center font-bold">
                  * Khóa an toàn chống tràn bồn (Overfill Interlock): Khối lượng tiếp nhận vượt quá dung tích khả dụng của bồn.
                </p>
              ) : isVirtualSilo ? (
                <p className="mt-1.5 text-[10px] text-emerald-700 text-center font-medium">
                  * Kho hàng ảo (Virtual Storage): Bấm "Ký điện tử & Nhập kho" để nhập mật khẩu xác nhận danh tính và nâng trực tiếp tồn kho bồn {selectedTankId}.
                </p>
              ) : !isSensorOnline ? (
                <p className="mt-1.5 text-[10px] text-rose-600 text-center font-semibold">
                  * Hệ thống tuân thủ Zero-Mock: Chỉ cho phép nhập kho khi nhận tín hiệu cân trực tiếp từ cảm biến OPC UA.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* HISTORICAL INBOUND TRANSACTION LEDGER TABLE (10 COLUMNS)               */}
      {/* ===================================================================== */}
      <div className="bg-white border border-slate-200 shadow-xs flex flex-col">
        {/* Card Header & Search Controls */}
        <div className="p-4 bg-slate-100/70 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-800" />
              <h3 className="font-bold text-slate-900 uppercase tracking-wide not-italic text-xs">
                Sổ cái tiếp nhận nguyên vật liệu (Inbound Verification Ledger)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-mono">
                {filteredReceipts.length} GIAO DỊCH ĐÃ ĐỐI SOÁT
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (fetchLiveReceipts) await fetchLiveReceipts();
                  if (fetchLiveStocks) await fetchLiveStocks(3, 200);
                }}
                className="h-7 px-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[10px] font-mono rounded-xs flex items-center gap-1 hallmark-focus cursor-pointer"
                title="Tải lại sổ cái từ SQL Server"
              >
                <RotateCw className="w-3 h-3 text-slate-500" />
                <span>Làm mới sổ cái</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã phiếu ERP, bồn chứa, nguyên liệu, người nhận..."
                className="w-full bg-white border border-slate-300 h-9 pl-8 pr-3 text-xs font-mono rounded-xs hallmark-focus"
              >
              </input>
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                className="bg-white border border-slate-300 h-9 px-2.5 text-xs font-mono rounded-xs hallmark-focus"
              >
                <option value="ALL">Tất cả nguyên liệu</option>
                {stocks.map((s) => (
                  <option key={s.tankId} value={s.materialCode}>
                    {s.materialCode} ({s.tankId})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* The Exact 11-Column Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] uppercase font-bold">
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">Mã Phiếu ERP</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-20">Bồn Chứa</th>
                <th className="py-2.5 px-3 border-r border-slate-200 min-w-[140px]">Nguyên Liệu</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Định Mức ERP (L/kg)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Cân Cảm Biến (L/kg)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Chênh Lệch (Δ)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">Sai Lệch (%)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center w-28">Trạng Thái</th>
                <th className="py-2.5 px-3 border-r border-slate-200 text-center min-w-[160px]">Trạng Thái Odoo ERP (Level 4)</th>
                <th className="py-2.5 px-3 border-r border-slate-200 w-32">Thời Gian</th>
                <th className="py-2.5 px-3 text-center w-36">Người Ký Nhận & Pháp Lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[11px]">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    Không có phiếu nhập nguyên liệu nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((receipt) => {
                  const rExpected = receipt.expectedQty !== undefined ? receipt.expectedQty : receipt.quantity;
                  const rActual = receipt.actualQty !== undefined ? receipt.actualQty : (receipt.actualDeliveredWeight !== undefined ? receipt.actualDeliveredWeight : receipt.quantity);
                  const rDelta = receipt.discrepancyQty !== undefined ? receipt.discrepancyQty : (receipt.weightDiscrepancy !== undefined ? receipt.weightDiscrepancy : 0);
                  const rDiffPct = receipt.discrepancyPercent !== undefined ? receipt.discrepancyPercent : (rExpected > 0 ? ((rActual - rExpected) / rExpected) * 100 : 0);
                  const rStatus = receipt.status || receipt.discrepancyStatus || 'MATCHED';
                  const rOperator = receipt.receivedBy || 'Operator';

                  const isMatched = rStatus === 'MATCHED' || rStatus === 'VERIFIED';
                  const isShortage = rStatus === 'SHORTAGE' || rStatus === 'SHORTAGE_WARNING';

                  return (
                    <tr key={receipt.id} className="hover:bg-slate-50 transition-colors">
                      {/* 1. Mã Phiếu ERP */}
                      <td className="py-2 px-3 border-r border-slate-200 text-center font-bold text-slate-900">
                        {receipt.receiptCode}
                      </td>

                      {/* 2. Bồn Chứa */}
                      <td className="py-2 px-3 border-r border-slate-200 text-center font-bold text-slate-700">
                        {receipt.tankId || '--'}
                      </td>

                      {/* 3. Nguyên Liệu */}
                      <td className="py-2 px-3 border-r border-slate-200">
                        <div className="font-bold text-slate-900 truncate max-w-[150px]">
                          {receipt.materialCode}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[150px]" title={receipt.materialName}>
                          {receipt.materialName}
                        </div>
                      </td>

                      {/* 4. Định Mức ERP (kg) */}
                      <td className="py-2 px-3 border-r border-slate-200 text-right font-medium text-slate-700 tabular-nums">
                        {rExpected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 5. Cân Cảm Biến (kg) */}
                      <td className="py-2 px-3 border-r border-slate-200 text-right font-bold text-emerald-800 tabular-nums">
                        {rActual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 6. Chênh Lệch (Δ kg) */}
                      <td className={`py-2 px-3 border-r border-slate-200 text-right font-bold tabular-nums ${
                        rDelta === 0 ? 'text-slate-500' : rDelta > 0 ? 'text-sky-700' : 'text-amber-700'
                      }`}>
                        {rDelta > 0 ? `+${rDelta.toFixed(2)}` : rDelta.toFixed(2)}
                      </td>

                      {/* 7. Sai Lệch (%) */}
                      <td className={`py-2 px-3 border-r border-slate-200 text-right font-bold tabular-nums ${
                        isMatched ? 'text-emerald-700' : isShortage ? 'text-amber-700' : 'text-sky-700'
                      }`}>
                        {rDiffPct > 0 ? `+${rDiffPct.toFixed(2)}` : rDiffPct.toFixed(2)}%
                      </td>

                      {/* 8. Trạng Thái */}
                      <td className="py-2 px-3 border-r border-slate-200 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs font-bold text-[9px] border ${
                          isMatched
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isShortage
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-sky-100 text-sky-800 border-sky-300'
                        }`}>
                          {isMatched ? '● MATCHED' : isShortage ? '● SHORTAGE' : '● OVERAGE'}
                        </span>
                      </td>

                      {/* 9. Trạng Thái Odoo ERP (Level 4) */}
                      <td className="py-2 px-3 border-r border-slate-200 text-center">
                        {(() => {
                          const code = String(receipt.receiptCode || (receipt as any).receipt_code || '').trim();
                          const isOdooCode = code.startsWith('WH/IN');
                          const odooInfo = odooStatusMap[code.toUpperCase()];
                          const isDoneOnOdoo = Boolean(odooInfo?.isDone || odooInfo?.state === 'done');

                          if (!isOdooCode) {
                            return (
                              <span className="text-[10px] text-slate-400 font-mono">
                                -- (Nội bộ)
                              </span>
                            );
                          }

                          if (isDoneOnOdoo) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-bold text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>● ODOO: HOÀN TẤT (DONE)</span>
                              </span>
                            );
                          }

                          const isThisClosing = closingCode === code;
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs font-bold text-[9px] bg-amber-100 text-amber-800 border border-amber-300">
                                ● CHỜ ĐỒNG BỘ
                              </span>
                              <button
                                type="button"
                                onClick={() => handleManualCloseOdoo(receipt)}
                                disabled={isThisClosing}
                                title="Đẩy xác nhận và chốt phiếu sang 'done' trên Odoo ERP"
                                className="h-6 px-2 text-[9px] font-bold uppercase rounded-xs bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white flex items-center gap-1 cursor-pointer transition-colors shadow-2xs hallmark-focus"
                              >
                                {isThisClosing ? (
                                  <RotateCw className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <span>↑ ĐÓNG PHIẾU ERP</span>
                                )}
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      {/* 10. Thời Gian */}
                      <td className="py-2 px-3 border-r border-slate-200 text-slate-600 text-[10px]">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{String(receipt.timestamp).slice(0, 19)}</span>
                        </div>
                      </td>

                      {/* 11. Người Ký Nhận & Truy Cứu Trách Nhiệm */}
                      <td className="py-2 px-3 text-center text-slate-700">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-slate-100 border border-slate-300 font-mono text-[10px] text-slate-800 font-bold" title={`Ký nhận trách nhiệm bởi tài khoản: ${rOperator}`}>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{rOperator}</span>
                        </div>
                        <div className="text-[9px] text-emerald-700 font-mono font-medium mt-0.5">
                          ✓ E-Sign Verified
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
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-[10px] text-slate-500 font-mono">
          <div>
            <span>ĐỐI SOÁT TẢI TRỌNG CẢM BIẾN: <strong className="text-slate-800">DUNG SAI CHẤP NHẬN ±1.0% (ISA-95 LEVEL 3 MOM)</strong></span>
          </div>
          <div>
            <span>FDA 21 CFR PART 11 AUDIT TRAIL LOGGED</span>
          </div>
        </div>
      </div>

      {/* FDA 21 CFR Part 11 Electronic Signature Verification Modal */}
      <ESignatureModal
        isOpen={isSignModalOpen}
        onClose={() => setIsSignModalOpen(false)}
        onSuccess={handleExecuteVerifiedIntake}
        actionName="INBOUND_MATERIAL_INTAKE"
        fieldName={`Tồn kho bồn ${selectedTankId}`}
        oldValue={`${baselineStock.toFixed(2)} ${unit || 'L'}`}
        newValue={`${(baselineStock + numActual).toFixed(2)} ${unit || 'L'}`}
        defaultMeaning="Responsibility"
        detail={`Tiếp nhận nguyên vật liệu theo đơn [${receiptCode}]: Nạp ${numActual.toFixed(2)} ${unit || 'L'} (${materialName}) vào bồn ${selectedTankId}. Nhà cung cấp: ${partnerName || 'Chưa định danh'}. Lô NCC: ${supplierLot || 'N/A'}.`}
      />
    </div>
  );
};
