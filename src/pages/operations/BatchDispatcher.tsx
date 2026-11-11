/* Hallmark · component: OperationsDualRunDigitalTwinEngine · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import { useOperations } from '../../context/OperationsContext';
import { useMasterData } from '../../context/MasterDataContext';
import { ESignatureModal } from '../../components/ESignatureModal';
import * as api from '../../services/api';
import { 
  Radio, 
  Download, 
  Play, 
  Pause, 
  RotateCw, 
  Square, 
  RefreshCcw, 
  AlertOctagon, 
  ArrowRight, 
  CheckCircle2, 
  Lock, 
  Send,
  Sparkles,
  Droplets,
  Settings,
  GitCompare,
  Check,
  Gauge,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Sliders
} from 'lucide-react';
import { extractDroppedOpcTag } from '../../components/PinnedTagPalette';
import { 
  Isa88BatchState, 
  getIsa88State,
  ExecutionMode,
  DigitalTwinDeviationRow,
  SpTrackingStatus,
  TwinSyncStatus
} from '../../types/operations';
import { MaterialStock } from '../../types/inventory';
import { WatchdogStatus, AiDosingAdvisorResponse, AiDosingChannel } from '../../types/masterData';
import { OperationsTagMappingModal } from '../../components/operations/OperationsTagMappingModal';
import { useGatewayStatus } from '../../context/ConfigContext';

export const BatchDispatcher: React.FC = () => {
  const {
    scadaGatewayUrl,
    targetProcessLine,
    executionMode,
    setExecutionMode,
    handshakeStatus,
    handshakeLoadedOk,
    cell1Ack,
    cell2Ack,
    cell1Complete,
    cell2Complete,
    cell1Duration,
    cell2Duration,
    stateSource,
    virtualStateFallback,
    deviationMatrix,
    benchmarkSummary,
    refreshDeviationMatrix,
    completeCellSimulation,
    cipStatus,
    setCipStatus,
    lastCipTimestamp,
    sterilityWindowHours,
    cipProgressRemaining,
    startCipCycle,
    resetCipToExpired,
    newOrders,
    runningOrders,
    finishedOrders,
    selectedOrderId,
    setSelectedOrderId,
    dispatchOrder,
    currentBatchState,
    executeBatchCommand,
    lastCommandFeedback,
  } = useOperations();

  const { refetchData, recipes } = useMasterData();
  const { isGatewayOnline, gatewayStatus } = useGatewayStatus();

  // ==========================================================================
  // OPERATIONAL OPC UA TAG MAPPINGS & TELEMETRY
  // ==========================================================================
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [opsTags, setOpsTags] = useState<Record<string, api.ModuleTagItem>>({});
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const handleDropOnOpsSlot = async (
    e: React.DragEvent,
    primaryKey: string,
    aliasKeys: string[] = [],
    label: string = primaryKey,
    unit: string = ''
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    const dropped = extractDroppedOpcTag(e);
    if (!dropped || !dropped.node_id) return;

    const tagsPayload: Record<string, { node_id: string; role?: string; unit?: string }> = {
      [primaryKey]: { node_id: dropped.node_id, role: 'PV', unit },
    };
    aliasKeys.forEach((ak) => {
      tagsPayload[ak] = { node_id: dropped.node_id, role: 'PV', unit };
    });

    try {
      await api.updateModuleTagMappings('operations', tagsPayload, 'admin', 'ADMIN');
      setSyncError(false);
      setSyncSuccess(true);
      setSyncToast(`✔ Đã gán kéo-thả [${label}] ← ${dropped.node_id} và lưu vào tag_mappings.json!`);
      await fetchOpsTags();
      refreshDeviationMatrix();
      setTimeout(() => setSyncSuccess(false), 4500);
    } catch (err: any) {
      setSyncError(true);
      setSyncToast(`Lỗi gán Tag [${label}]: ${err.message || 'Không thể lưu'}`);
      setTimeout(() => setSyncError(false), 4500);
    }
  };

  const getOpsTag = (key: string, ...aliases: string[]): api.ModuleTagItem | undefined => {
    const allKeys = [key, ...aliases];
    for (const k of allKeys) {
      const tag = opsTags[k];
      if (tag && tag.node_id && tag.node_id.trim() && tag.node_id.trim() !== '[CHƯA ÁNH XẠ]') {
        return tag;
      }
    }
    return undefined;
  };

  const fetchOpsTags = async () => {
    try {
      const res = await api.getModuleTagMappings('operations');
      if (res.success && res.tags) {
        setOpsTags(res.tags);
        // Auto-disengage CIP Safety Interlock only if PLC reports mapped CIP_CLEAN_STATUS = 1
        const cipTag = res.tags['cip_clean_status'] || res.tags['CIP_CLEAN_STATUS'];
        if (cipTag && cipTag.node_id && (cipTag.value === 1 || cipTag.value === true || cipTag.value === '1' || cipTag.value === 'true')) {
          if (cipStatus !== 'CLEAN' && cipStatus !== 'IN_PROGRESS' && setCipStatus) {
            setCipStatus('CLEAN');
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  };

  useEffect(() => {
    fetchOpsTags();
    const interval = setInterval(fetchOpsTags, 2500);
    return () => clearInterval(interval);
  }, [cipStatus]);

  // ==========================================================================
  // IEC 61508 / PM-CONTROL LIFEBIT WATCHDOG & AI DOSING ADVISOR STATE
  // ==========================================================================
  const [watchdog, setWatchdog] = useState<WatchdogStatus | null>(null);
  const [aiAdvisor, setAiAdvisor] = useState<AiDosingAdvisorResponse | null>(null);
  const [isAiAdvisorExpanded, setIsAiAdvisorExpanded] = useState<boolean>(true);
  const [applyingOffsetChannel, setApplyingOffsetChannel] = useState<string | null>(null);
  const [aiNotification, setAiNotification] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchWatchdogAndAi = async () => {
      try {
        const [wdRes, aiRes] = await Promise.allSettled([
          api.getWatchdogStatus(),
          api.getAiDosingOffsetAdvisor(),
        ]);
        if (isMounted) {
          if (wdRes.status === 'fulfilled') setWatchdog(wdRes.value);
          if (aiRes.status === 'fulfilled') setAiAdvisor(aiRes.value);
        }
      } catch {
        // safe fallback
      }
    };

    fetchWatchdogAndAi();
    const interval = setInterval(fetchWatchdogAndAi, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleApplyDosingOffset = async (channel: AiDosingChannel) => {
    setApplyingOffsetChannel(channel.channel_id);
    try {
      await api.applyDosingOffset({
        hopper_id: channel.channel_id,
        recommended_offset_kg: channel.recommended_offset_kg,
        operator: 'Process_Engineer',
        reason: `HITL in-flight cut-off trim: offset ${channel.recommended_offset_kg} ${channel.unit}`,
      });
      setAiNotification(`Đã áp dụng bù trừ quán tính ${channel.recommended_offset_kg} ${channel.unit} cho [${channel.channel_id}]`);
      setTimeout(() => setAiNotification(null), 4000);
      const updated = await api.getAiDosingOffsetAdvisor();
      setAiAdvisor(updated);
    } catch (err: any) {
      setAiNotification(`Lỗi áp dụng bù trừ: ${err?.message || 'Lỗi mạng'}`);
      setTimeout(() => setAiNotification(null), 4000);
    } finally {
      setApplyingOffsetChannel(null);
    }
  };

  // ==========================================================================
  // ISA-95 LEVEL 4 (ERP) ODOO INTEGRATION STATE & HANDLERS
  // ==========================================================================
  const [odooStatus, setOdooStatus] = useState<api.OdooStatusResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const probeOdoo = async () => {
      try {
        const res = await api.getOdooStatus();
        if (isMounted) setOdooStatus(res);
      } catch {
        if (isMounted) {
          setOdooStatus({
            connected: false,
            latency_ms: 0,
            status: 'OFFLINE'
          });
        }
      }
    };

    probeOdoo();
    const interval = setInterval(probeOdoo, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSyncOdoo = async () => {
    setIsSyncing(true);
    setSyncError(false);
    setSyncSuccess(false);
    try {
      const res = await api.getErpOrders();
      if (res.success) {
        setSyncSuccess(true);
        const feedback = res.synced_count > 0
          ? `Đã đồng bộ ${res.synced_count} lệnh sản xuất từ Odoo ERP vào hệ thống MES.`
          : `Đã kiểm tra Odoo ERP: ${res.already_existed_count || 0} đơn hàng đã tồn tại trong MES.`;
        setSyncToast(feedback);
        if (refetchData) {
          await refetchData();
        }
        setTimeout(() => setSyncSuccess(false), 3500);
      } else {
        setSyncError(true);
        setSyncToast(res.message || 'Lỗi khi đồng bộ đơn hàng từ Odoo ERP');
        setTimeout(() => setSyncError(false), 4000);
      }
    } catch (err: any) {
      setSyncError(true);
      setSyncToast(`[LỖI ĐỒNG BỘ]: ${err.message || 'Không thể kết nối Odoo ERP'}`);
      setTimeout(() => setSyncError(false), 4500);
    } finally {
      setIsSyncing(false);
    }
  };

  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [odooClosedOrders, setOdooClosedOrders] = useState<Record<string, boolean>>({});

  const handleCompleteOdooOrder = async (orderId: string, volume?: number) => {
    setCompletingOrderId(orderId);
    try {
      const res = await api.completeOdooManufacturingOrder(orderId, volume || 2.0);
      if (res.success) {
        setOdooClosedOrders((prev) => ({ ...prev, [orderId]: true }));
        setSyncToast(`[ODOO UPLINK THÀNH CÔNG] Lệnh ${orderId} đã chuyển sang trạng thái DONE trên Odoo 18 (Đã nhập kho thành phẩm & khấu trừ nguyên liệu).`);
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 5000);
      } else {
        setSyncToast(`[ODOO UPLINK LỖI] ${res.error || res.message || 'Không thể đóng lệnh trên Odoo ERP'}`);
        setSyncError(true);
        setTimeout(() => setSyncError(false), 5000);
      }
    } catch (err: any) {
      setSyncToast(`[LỖI KẾT NỐI ERP] ${err.message || 'Lỗi khi gọi Odoo ERP API'}`);
      setSyncError(true);
      setTimeout(() => setSyncError(false), 5000);
    } finally {
      setCompletingOrderId(null);
    }
  };

  const isOdooOnline = Boolean(odooStatus?.connected);
  const syncButtonState = isSyncing
    ? 'loading'
    : syncError
    ? 'error'
    : syncSuccess
    ? 'success'
    : 'default';

  const [isEsignOpen, setIsEsignOpen] = useState(false);
  // Strict separation: Only show manufacturing orders (WH/MO/...), strictly exclude warehouse inbound receipts (WH/IN/...)
  const moOrders = newOrders.filter((o) => !o.id.startsWith('WH/IN') && !o.id.startsWith('INB-'));
  const activeOrder = moOrders.find((o) => o.id === selectedOrderId) || moOrders[0];

  // ISA-88 Vessel Constraints & Campaign Optimizer State
  const vesselCapacity = 5.0; // 5.0 L physical geometric vessel
  const [safeHeadroomRatio, setSafeHeadroomRatio] = useState<number>(0.90); // 90% (4.50 L safe limit)
  const [activeCampaignBatch, setActiveCampaignBatch] = useState<number>(1);

  const orderVolume = Number(activeOrder?.volume || 0);
  const safeMaxVolume = vesselCapacity * safeHeadroomRatio; // e.g. 5.0 * 0.90 = 4.50 L
  const isCampaignNeeded = orderVolume > safeMaxVolume;
  const campaignBatchCount = isCampaignNeeded ? Math.ceil(orderVolume / safeMaxVolume) : 1;
  const equalizedBatchVolume = isCampaignNeeded ? Number((orderVolume / campaignBatchCount).toFixed(2)) : orderVolume;
  const loadFactorPct = vesselCapacity > 0 ? (equalizedBatchVolume / vesselCapacity) * 100 : 0;

  const naiveFullBatches = Math.floor(orderVolume / vesselCapacity);
  const naiveRemnant = Number((orderVolume - naiveFullBatches * vesselCapacity).toFixed(2));

  // ==========================================================================
  // VIRTUAL ERP SILO STOCK AUDIT & RECIPE SETPOINTS
  // ==========================================================================
  const [stocks, setStocks] = useState<MaterialStock[]>([]);
  const fetchStocks = async () => {
    try {
      const data = await api.getInventoryStocks();
      setStocks(data);
    } catch (err) {
      console.warn('Failed to fetch inventory stocks:', err);
    }
  };

  useEffect(() => {
    fetchStocks();
    const iv = setInterval(fetchStocks, 4000);
    return () => clearInterval(iv);
  }, []);

  const tank1Stock = stocks.find(s => s.tankId === 'TANK-01' || s.assignedTank === 'TANK-01' || s.materialCode === 'RAW_MILK' || s.materialCode === 'RAW-MILK-01')?.currentStock ?? 0;
  const tank2Stock = stocks.find(s => s.tankId === 'TANK-02' || s.assignedTank === 'TANK-02' || s.materialCode === 'SUGAR' || s.materialCode === 'SUGAR-01')?.currentStock ?? 0;
  const tank3Stock = stocks.find(s => s.tankId === 'TANK-03' || s.assignedTank === 'TANK-03' || s.materialCode === 'ADDITIVE' || s.materialCode === 'ADDITIVE-01')?.currentStock ?? 0;

  const currentVolume = activeOrder?.volume || 5.0;
  const effectiveVolume = isCampaignNeeded ? equalizedBatchVolume : currentVolume;

  const matchedRecipe = (recipes && recipes.length > 0)
    ? (recipes.find((r) => r.name === activeOrder?.recipeName || r.code === activeOrder?.recipeName) || recipes[0])
    : null;
  const params = matchedRecipe?.parameters || [];

  const milkParam = params.find((p) => p.phaseId === 'PH_SUPPLYMILK' || p.phaseId === 'PH_DOSING_MILK' || /milk|sữa/i.test(p.parameterName || ''));
  const sugarParam = params.find((p) => p.phaseId === 'PH_SUPPLYSUGAR' || p.phaseId === 'PH_DOSING_SUGAR' || /sugar|đường/i.test(p.parameterName || ''));
  const additiveParam = params.find((p) => p.phaseId === 'PH_SUPPLYADDITIVE' || p.phaseId === 'PH_DOSING_ADDITIVE' || /additive|phụ gia/i.test(p.parameterName || ''));

  const milkPct = milkParam ? (Number(milkParam.targetSetpoint ?? milkParam.targetValue ?? milkParam.percentage) || 70.0) : 70.0;
  const sugarPct = sugarParam ? (Number(sugarParam.targetSetpoint ?? sugarParam.targetValue ?? sugarParam.percentage) || 20.0) : 20.0;
  const additivePct = additiveParam ? (Number(additiveParam.targetSetpoint ?? additiveParam.targetValue ?? additiveParam.percentage) || 10.0) : 10.0;

  const milkSp = isCampaignNeeded
    ? parseFloat(((effectiveVolume * milkPct) / 100).toFixed(2))
    : (activeOrder?.setpoints?.milkSp ?? parseFloat(((currentVolume * milkPct) / 100).toFixed(1)));
  const sugarSp = isCampaignNeeded
    ? parseFloat(((effectiveVolume * sugarPct) / 100).toFixed(2))
    : (activeOrder?.setpoints?.sugarSp ?? parseFloat(((currentVolume * sugarPct) / 100).toFixed(1)));
  const additiveSp = isCampaignNeeded
    ? parseFloat(((effectiveVolume * additivePct) / 100).toFixed(2))
    : (activeOrder?.setpoints?.additiveSp ?? parseFloat(((currentVolume * additivePct) / 100).toFixed(1)));

  const isMilkStockOk = tank1Stock >= milkSp;
  const isSugarStockOk = tank2Stock >= sugarSp;
  const isAdditiveStockOk = tank3Stock >= additiveSp;
  const isVirtualStockInsufficient = Boolean(activeOrder && (!isMilkStockOk || !isSugarStockOk || !isAdditiveStockOk));

  // Live telemetry for the 5 loadcells
  const pvWeigh1Tag = getOpsTag('weigh1_weight_pv', 'Weigh1_Weight_PV', 'weigh_hopper_1_pv');
  const pvWeigh1 = pvWeigh1Tag?.value != null ? Number(pvWeigh1Tag.value) : 0.0;

  const pvWeigh2Tag = getOpsTag('weigh2_weight_pv', 'Weigh2_Weight_PV', 'weigh_hopper_2_pv');
  const pvWeigh2 = pvWeigh2Tag?.value != null ? Number(pvWeigh2Tag.value) : 0.0;

  const pvWeigh3Tag = getOpsTag('weigh3_weight_pv', 'Weigh3_Weight_PV', 'weigh_hopper_3_pv');
  const pvWeigh3 = pvWeigh3Tag?.value != null ? Number(pvWeigh3Tag.value) : 0.0;

  const pvMixingTag = getOpsTag('cell1.Mixing_Weight_PV', 'Mixing_Weight_PV', 'mixing_weight_pv', 'TANK_ALL_ACT_KL');
  const pvMixing = pvMixingTag?.value != null ? Number(pvMixingTag.value) : 0.0;

  const pvOutputTag = getOpsTag('out_weight_pv', 'Out_Weight_PV', 'OUT01_WEIGHT_PV');
  const pvOutput = pvOutputTag?.value != null ? Number(pvOutputTag.value) : 0.0;

  // Heater Interlock Telemetry
  const uhtTag = getOpsTag('uht_temp_pv', 'Heat_Temp_ACT', 'Heating_PV', 'UHT_TEMP_PV', 'pasteur_hold_temp');
  const uhtSpTag = getOpsTag('uht_temp_sp', 'Recipe_Temp_SP', 'Heat_Temp_SP', 'UHT_TEMP_SP');
  const readyTag = getOpsTag('heater_ready_flag', 'Heater_Ready_Flag', 'HEATER_TEMP_OK', 'cell1.Heater_Ready_Flag');
  const uhtPv = uhtTag?.value != null ? Number(uhtTag.value) : 0.0;
  const uhtSp = uhtSpTag?.value != null ? Number(uhtSpTag.value) : (activeOrder?.setpoints?.tempHotSp || 138.0);
  const isFlagAsserted = readyTag?.value === 1 || readyTag?.value === true || readyTag?.value === '1' || readyTag?.value === 'true';
  const isTempReached = uhtPv > 0 && uhtSp > 0 && uhtPv >= (uhtSp - 2.0);
  const isHeaterReady = Boolean(isFlagAsserted || (!readyTag?.node_id && isTempReached));

  // Tolerance ±2.0% evaluation
  const calcTolState = (pv: number, sp: number) => {
    if (sp <= 0) return { status: 'WEIGHT_OK', devPct: 0, text: 'READY' };
    const dev = pv - sp;
    const devPct = (dev / sp) * 100;
    if (Math.abs(devPct) <= 2.0) {
      return { status: 'WEIGHT_OK', devPct, text: 'WEIGHT_OK (±2%)' };
    } else if (pv < sp) {
      return { status: 'UNDER_WEIGHT', devPct, text: 'UNDER_WEIGHT' };
    } else {
      return { status: 'OVER_WEIGHT', devPct, text: 'OVER_WEIGHT' };
    }
  };

  const tol1 = calcTolState(pvWeigh1, milkSp);
  const tol2 = calcTolState(pvWeigh2, sugarSp);
  const tol3 = calcTolState(pvWeigh3, additiveSp);

  // Automated PLC 3-Hopper Pre-Weighing Dosing Complete Flag
  const dosingDoneTag = getOpsTag(
    'dosing_complete_flag',
    'Dosing_Complete_Flag',
    'Flag_Dosing_Done',
    'dosing_done',
    'cell1.Dosing_Complete_Flag',
    'cell1.Flag_Dosing_Done',
    'weighing_complete_flag',
    'Hoppers_Dosing_Done',
    'Modbus_TCP_1.Device1.Run'
  );
  const isPlcDosingComplete = Boolean(
    dosingDoneTag?.value === 1 ||
    dosingDoneTag?.value === true ||
    dosingDoneTag?.value === '1' ||
    dosingDoneTag?.value === 'true'
  );

  const [isToleranceOverridden, setIsToleranceOverridden] = useState(false);
  const isAllWeighedReady = 
    (tol1.status === 'WEIGHT_OK' || isToleranceOverridden) &&
    (tol2.status === 'WEIGHT_OK' || isToleranceOverridden) &&
    (tol3.status === 'WEIGHT_OK' || isToleranceOverridden);

  const [latchedWeights, setLatchedWeights] = useState<{ milk: number; sugar: number; additive: number } | null>(null);
  const [isDischarging, setIsDischarging] = useState(false);
  const [isDischargeComplete, setIsDischargeComplete] = useState(false);

  const handleSimultaneousDischarge = async () => {
    setIsDischarging(true);
    const w1 = pvWeigh1 > 0 ? pvWeigh1 : milkSp;
    const w2 = pvWeigh2 > 0 ? pvWeigh2 : sugarSp;
    const w3 = pvWeigh3 > 0 ? pvWeigh3 : additiveSp;
    setLatchedWeights({ milk: w1, sugar: w2, additive: w3 });

    try {
      const v1Tag = getOpsTag('valve_weigh1_out', 'Valve_Weigh1_Out');
      const v2Tag = getOpsTag('valve_weigh2_out', 'Valve_Weigh2_Out');
      const v3Tag = getOpsTag('valve_weigh3_out', 'Valve_Weigh3_Out');
      if (v1Tag?.node_id) await api.writeOpcTag(v1Tag.node_id, true, 'Boolean');
      if (v2Tag?.node_id) await api.writeOpcTag(v2Tag.node_id, true, 'Boolean');
      if (v3Tag?.node_id) await api.writeOpcTag(v3Tag.node_id, true, 'Boolean');

      setTimeout(() => {
        setIsDischarging(false);
        setIsDischargeComplete(true);
      }, 2500);
    } catch (err) {
      console.warn('Discharge trigger error:', err);
      setIsDischarging(false);
    }
  };

  const isZeroReturn1 = pvWeigh1 <= 0.05;
  const isZeroReturn2 = pvWeigh2 <= 0.05;
  const isZeroReturn3 = pvWeigh3 <= 0.05;
  const isZeroReturnAll = isZeroReturn1 && isZeroReturn2 && isZeroReturn3;

  const latchedSum = latchedWeights ? (latchedWeights.milk + latchedWeights.sugar + latchedWeights.additive) : (milkSp + sugarSp + additiveSp);
  const massBalanceDiff = Math.abs(pvMixing - latchedSum);
  const isMassBalancePass = massBalanceDiff <= 0.15;

  const [isDeducting, setIsDeducting] = useState(false);
  const [singleShotResult, setSingleShotResult] = useState<api.SingleShotDeductionResponse | null>(null);

  const handleSingleShotDeduct = async () => {
    if (!activeOrder) return;
    setIsDeducting(true);
    try {
      const w1 = latchedWeights?.milk || (pvWeigh1 > 0 ? pvWeigh1 : milkSp);
      const w2 = latchedWeights?.sugar || (pvWeigh2 > 0 ? pvWeigh2 : sugarSp);
      const w3 = latchedWeights?.additive || (pvWeigh3 > 0 ? pvWeigh3 : additiveSp);

      const res = await api.deductBatchSingleShot({
        order_code: activeOrder.id,
        user: 'Batch_Operator_01',
        milk_qty: w1,
        sugar_qty: w2,
        additive_qty: w3,
      });
      setSingleShotResult(res);
      await fetchStocks();
    } catch (err: any) {
      console.error('Single-shot deduction error:', err);
    } finally {
      setIsDeducting(false);
    }
  };

  // Automated inventory deduction triggered by lower-level PLC dosing complete tag OR 3-hopper setpoint completion
  const autoDeductedOrdersRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!activeOrder || isDeducting) return;
    const orderId = activeOrder.id;

    if (autoDeductedOrdersRef.current.has(orderId)) return;
    if (singleShotResult?.order_code === orderId && (singleShotResult.status === 'success' || singleShotResult.is_idempotent_replay)) {
      autoDeductedOrdersRef.current.add(orderId);
      return;
    }

    // Trigger condition:
    // 1) Explicit PLC dosing done tag is ON (1/true)
    // 2) OR all 3 hoppers weighed within tolerance (±2%)
    const shouldAutoDeduct = Boolean(
      isPlcDosingComplete || 
      (isAllWeighedReady && (pvWeigh1 > 0 || pvWeigh2 > 0 || pvWeigh3 > 0 || isToleranceOverridden))
    );

    if (shouldAutoDeduct) {
      autoDeductedOrdersRef.current.add(orderId);
      handleSingleShotDeduct();
    }
  }, [isPlcDosingComplete, isAllWeighedReady, activeOrder?.id, pvWeigh1, pvWeigh2, pvWeigh3, isToleranceOverridden]);

  const isCipLocked = cipStatus !== 'CLEAN';
  const isBatchRunning = currentBatchState === 'RUNNING';
  const isBatchHeld = currentBatchState === 'HELD';
  const isStartDisabled = !isGatewayOnline || !handshakeLoadedOk || isBatchRunning || moOrders.length === 0 || isCipLocked || isVirtualStockInsufficient;
  const isDownloadDisabled = !isGatewayOnline || isBatchRunning || moOrders.length === 0 || handshakeStatus === 'DOWNLOADING' || isCipLocked || isVirtualStockInsufficient;

  const renderStateBadge = (state: Isa88BatchState | string | number) => {
    const meta = getIsa88State(state);
    return (
      <span
        className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${meta.badgeClass} ${
          meta.id === 1 ? 'animate-pulse' : ''
        }`}
        style={{ color: meta.color, borderColor: `${meta.color}60` }}
      >
        {meta.name}
      </span>
    );
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Operational Safety Interlock: Silo Stock Availability Banner */}
      {isVirtualStockInsufficient && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-900 uppercase">
                Khóa liên động ISA-101: Thiếu Tồn Kho Nguyên Liệu (Insufficient Silo Stock)
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                Lệnh sản xuất [{activeOrder?.id}] yêu cầu định lượng vượt quá tồn kho thực tế: Sữa tươi ({milkSp.toFixed(2)}L vs tồn {tank1Stock.toFixed(2)}L {isMilkStockOk ? '✓' : '✗ THIẾU'}), Đường ({sugarSp.toFixed(2)}kg vs tồn {tank2Stock.toFixed(2)}kg {isSugarStockOk ? '✓' : '✗ THIẾU'}), Phụ gia ({additiveSp.toFixed(2)}kg vs tồn {tank3Stock.toFixed(2)}kg {isAdditiveStockOk ? '✓' : '✗ THIẾU'}). Hệ thống tự động khóa lệnh DOWNLOAD TO SCADA và START BATCH cho đến khi hoàn tất nhập bổ sung nguyên liệu.
              </div>
            </div>
          </div>
          <span className="px-2 py-1 bg-amber-600 text-white font-bold text-[10px] uppercase shrink-0">
            LỆNH BỊ KHÓA
          </span>
        </div>
      )}

      {/* Smart Factory Closed-Loop: Awaiting Output Tank Auto-Drain Banner */}
      {(currentBatchState === 'AWAITING_DRAIN' || (currentBatchState as string) === 'WAITING_DRAIN') && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <RefreshCcw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 animate-spin" />
            <div>
              <div className="font-bold text-amber-900 uppercase flex items-center gap-2">
                <span>⚡ NHÀ MÁY THÔNG MINH: TỰ ĐỘNG THEO DÕI XẢ BỒN ĐỂ NẠP MẺ TIẾP THEO</span>
                <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 text-[10px] border border-amber-400">
                  AUTO-SENSING CLOSED LOOP
                </span>
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                Mẻ vừa hoàn tất đã xả sang bồn output. Cảm biến Loadcell hiện đang đo:{' '}
                <strong className="text-amber-950 font-bold">{pvOutput.toFixed(2)} L</strong> (Ngưỡng tự động chuyển mẻ: ≤ 0.80 L).
                Khi sữa được xả ra ngoài và mức cân tụt xuống ≤ 0.80 L (mức cặn đáy), hệ thống sẽ <strong>TỰ ĐỘNG NẠP CÔNG THỨC VÀ KÍCH HOẠT MẺ TIẾP THEO</strong> mà không cần bấm chuột.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.confirmBatchDrain();
              } catch (e) {
                console.error(e);
              }
            }}
            className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] uppercase tracking-wider shrink-0 border border-amber-700 active:translate-y-px transition-none hallmark-focus"
            title="Bỏ qua chờ cảm biến và kích hoạt nạp mẻ tiếp theo ngay lập tức"
          >
            BỎ QUA CHỜ / CHẠY TIẾP NGAY
          </button>
        </div>
      )}

      {/* Operational Safety Interlock: CIP Hygiene Required Banner */}
      {isCipLocked && (
        <div className="p-3 bg-rose-50 border border-rose-300 text-rose-950 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-rose-900 uppercase">
                Operational Safety Interlock: CIP Hygiene Required
              </div>
              <div className="text-[11px] text-rose-800 mt-0.5">
                Operational Safety Interlock: Unit Mixing requires automated Clean-In-Place (CIP) cycle before fresh batch execution.
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={cipStatus === 'IN_PROGRESS' || isBatchRunning}
            onClick={() => startCipCycle()}
            className="h-8 px-3 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start sm:self-auto transition-none active:translate-y-px"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{cipStatus === 'IN_PROGRESS' ? `Sanitizing (${cipProgressRemaining}s)...` : 'START CIP SANITIZATION CYCLE'}</span>
          </button>
        </div>
      )}

      {/* Feedback Notification Banner */}
      {lastCommandFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-mono flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{lastCommandFeedback}</span>
          </div>
          <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
            SCADA GATEWAY ACK
          </span>
        </div>
      )}

      {/* 3-Column Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* =======================================================
            LEFT PANEL: Batch Supervisory Commands & Gateway Link
           ======================================================= */}
        <div className="lg:col-span-3 space-y-4">
          {/* Connection Status Card */}
          <div className="bg-white border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider">
                Kepware Gateway Link
              </span>
              <span className={`w-2.5 h-2.5 rounded-full inline-block ${
                isGatewayOnline ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'
              }`} />
            </div>

            {/* Centralized Gateway Status Indicator */}
            <div className={`p-2.5 border text-[11px] flex items-start gap-2 transition-colors ${
              isGatewayOnline 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}>
              <Radio className={`w-4 h-4 shrink-0 mt-0.5 ${isGatewayOnline ? 'text-emerald-700' : 'text-rose-600'}`} />
              <div>
                <div className="font-bold flex items-center gap-1.5 font-mono">
                  <span>{isGatewayOnline ? '● KEPWARE GATEWAY: ONLINE (Port 49320)' : '● KEPWARE GATEWAY: OFFLINE'}</span>
                </div>
                <div className={`text-[10px] font-mono mt-0.5 ${isGatewayOnline ? 'text-emerald-800' : 'text-rose-800'}`}>
                  ENDPOINT: {gatewayStatus?.endpoint || scadaGatewayUrl}{!isGatewayOnline ? ' [DISCONNECTED]' : ''}
                </div>
              </div>
            </div>

            {/* IEC 61508 Bidirectional PLC Lifebit Watchdog Badge */}
            <div className={`p-2 border text-[11px] font-mono flex items-center justify-between transition-colors ${
              watchdog?.status === 'WATCHDOG_TIMEOUT_SAFE_HOLD'
                ? 'bg-rose-50 border-rose-400 text-rose-950 font-bold'
                : watchdog?.status === 'DEGRADED'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full inline-block transition-transform duration-200 ${
                  watchdog?.status === 'WATCHDOG_TIMEOUT_SAFE_HOLD'
                    ? 'bg-rose-600 animate-ping'
                    : watchdog?.lifebit_pulse
                    ? 'bg-emerald-600 scale-125'
                    : 'bg-emerald-400 scale-90'
                }`} />
                <span className="font-bold">
                  {watchdog?.status === 'WATCHDOG_TIMEOUT_SAFE_HOLD' ? (
                    '⚠ WATCHDOG TIMEOUT (>3.0s) · SAFE-HOLD INTERLOCK'
                  ) : (
                    `♥ LIFEBIT #${watchdog?.lifebit_counter ?? 0} · ${Math.round(watchdog?.latency_ms ?? 10)} ms`
                  )}
                </span>
              </div>
              <span className={`px-1.5 py-0.5 text-[9.5px] font-bold uppercase border ${
                watchdog?.status === 'WATCHDOG_TIMEOUT_SAFE_HOLD'
                  ? 'bg-rose-200 text-rose-900 border-rose-400'
                  : watchdog?.status === 'DEGRADED'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {watchdog?.status ?? 'HEALTHY'}
              </span>
            </div>

            {/* 3-Way Execution Mode Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                  Chế độ Thực thi (Execution Mode)
                </label>
                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 border border-slate-300 font-bold text-slate-700">
                  {executionMode === 'mode3_dual' ? 'DUAL-RUN' : executionMode === 'mode2_simit' ? 'SIMIT ONLY' : 'HARDWARE ONLY'}
                </span>
              </div>
              <div className="relative">
                <select
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value as ExecutionMode)}
                  className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 font-bold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none cursor-pointer"
                >
                  <option value="mode1_physical">
                    Mode 1: Process Cell 1 (Physical S7-1500 Hardware Only)
                  </option>
                  <option value="mode2_simit">
                    Mode 2: Process Cell 2 (SIMIT Digital Twin Only)
                  </option>
                  <option value="mode3_dual">
                    Mode 3: Dual-Run Benchmark (Physical + SIMIT Twin Synchronized)
                  </option>
                </select>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                {executionMode === 'mode3_dual' && 'Đồng bộ song song phần cứng S7-1500 và mô hình SIMIT Digital Twin để so sánh sai lệch thời gian thực.'}
                {executionMode === 'mode1_physical' && 'Thực thi độc lập trên bộ điều khiển phần cứng Siemens S7-1500 thực tế.'}
                {executionMode === 'mode2_simit' && 'Mô phỏng độc lập trên mô hình bản sao số Siemens SIMIT Virtual Twin.'}
              </p>
            </div>

            {/* Handshake & Independent Cell Supervision Indicators */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">HANDSHAKE:</span>
                <span className={`font-bold ${handshakeLoadedOk ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {handshakeLoadedOk ? 'LOADED_OK = TRUE' : 'PENDING DOWNLINK'}
                </span>
              </div>

              {executionMode === 'mode3_dual' && (
                <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 border-t border-dashed border-slate-200">
                  <div className="flex items-center justify-between px-1.5 py-0.5 bg-slate-50 border border-slate-200">
                    <span className="text-slate-500">CELL 1 (HW):</span>
                    <span className={`font-bold ${cell1Ack ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {cell1Ack ? 'ACK OK' : 'WAIT'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-1.5 py-0.5 bg-slate-50 border border-slate-200">
                    <span className="text-slate-500">CELL 2 (TWIN):</span>
                    <span className={`font-bold ${cell2Ack ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {cell2Ack ? 'ACK OK' : 'WAIT'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-slate-500">ACTIVE STATE:</span>
                <span className="font-bold text-slate-900">{currentBatchState}</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200">
                <span className="text-slate-500 text-[10px]">STATE AUTHORITY:</span>
                {stateSource === 'PLC_HARDWARE' && !virtualStateFallback ? (
                  <span
                    className="px-1.5 py-0.5 text-[9.5px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300"
                    title="State_ID is actively driven by physical PLC hardware feedback via Kepware OPC UA"
                  >
                    ● PLC HARDWARE FEEDBACK
                  </span>
                ) : (
                  <span
                    className="px-1.5 py-0.5 text-[9.5px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300"
                    title="State_ID unmapped or passive simulator tag (800ms timeout) — running in Safe Virtual Commissioning Fallback"
                  >
                    ● VIRTUAL SIM FALLBACK
                  </span>
                )}
              </div>

              {/* Independent Completion Badges in Dual-Run mode */}
              {executionMode === 'mode3_dual' && (currentBatchState === 'RUNNING' || currentBatchState === 'COMPLETED' || cell1Complete || cell2Complete) && (
                <div className="space-y-1 pt-1.5 border-t border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Tiến độ hoàn thành độc lập:
                  </div>
                  <div className="space-y-1">
                    {/* SIMIT Twin Badge */}
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] border border-slate-200 bg-white">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cell2Complete ? 'bg-emerald-600' : 'bg-sky-500 animate-pulse'}`} />
                        <span className="font-bold text-slate-700">SIMIT TWIN:</span>
                      </div>
                      <span className={`font-mono font-bold ${cell2Complete ? 'text-emerald-800' : 'text-sky-800'}`}>
                        {cell2Complete ? `COMPLETED (${cell2Duration})` : `RUNNING (${cell2Duration})`}
                      </span>
                    </div>
                    {/* Physical Hardware Badge */}
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] border border-slate-200 bg-white">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cell1Complete ? 'bg-emerald-600' : 'bg-sky-500 animate-pulse'}`} />
                        <span className="font-bold text-slate-700">HARDWARE S7-1500:</span>
                      </div>
                      <span className={`font-mono font-bold ${cell1Complete ? 'text-emerald-800' : 'text-sky-800'}`}>
                        {cell1Complete ? `COMPLETED (${cell1Duration})` : `RUNNING (${cell1Duration})`}
                      </span>
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-400">
                    * Lệnh sản xuất chỉ hoàn tất hoàn toàn khi phần cứng vật lý Cell 1 báo Complete.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Siemens PM-CONTROL Clean-In-Place (CIP) Hygiene Interlock Card */}
          <div className="bg-white border border-slate-200 p-4 shadow-xs space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Unit CIP Hygiene Gateway
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">PM-CONTROL</span>
            </div>

            {/* Unit Readiness Badge */}
            {cipStatus === 'CLEAN' && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block animate-pulse" />
                    CIP HYGIENE: VALID (CLEAN)
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 border border-emerald-300">
                    INTERLOCK CLEAR
                  </span>
                </div>
                <div className="text-[10px] text-emerald-800 font-mono pt-1 border-t border-emerald-200/60">
                  <div>LAST RINSE: {lastCipTimestamp}</div>
                  <div>STERILITY WINDOW: Max {sterilityWindowHours}h (Active)</div>
                </div>
              </div>
            )}

            {cipStatus === 'DIRTY_EXPIRED' && (
              <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-950 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-600 inline-block" />
                    CIP HYGIENE: EXPIRED / REQUIRED
                  </span>
                  <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 border border-rose-300">
                    LOCKED
                  </span>
                </div>
                <div className="text-[10px] text-rose-800 font-mono pt-1 border-t border-rose-200/60">
                  <div>LAST RINSE: {lastCipTimestamp} (&gt; 8h ago)</div>
                  <div className="text-rose-900 font-semibold">GATING: SCADA download &amp; start locked</div>
                </div>
              </div>
            )}

            {cipStatus === 'IN_PROGRESS' && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                    CIP HYGIENE: IN PROGRESS
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 border border-amber-300">
                    {cipProgressRemaining}s REMAINING
                  </span>
                </div>
                <div className="text-[10px] text-amber-800 font-mono">
                  Caustic wash &amp; hot steam sanitation active...
                </div>
                <div className="w-full bg-amber-200 h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-600 h-full transition-all duration-1000"
                    style={{ width: `${((5 - cipProgressRemaining) / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                disabled={cipStatus === 'IN_PROGRESS' || isBatchRunning}
                onClick={() => startCipCycle()}
                className="w-full h-8 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 text-slate-800 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
                title="Run 5-second Clean-In-Place rinse and sanitation cycle"
              >
                <Droplets className="w-3.5 h-3.5 text-sky-600" />
                <span>
                  {cipStatus === 'IN_PROGRESS'
                    ? `SANITIZING (${cipProgressRemaining}s)...`
                    : cipStatus === 'CLEAN'
                    ? 'RE-RUN CIP CYCLE'
                    : 'START CIP SANITIZATION CYCLE'}
                </span>
              </button>

              {/* Test Interlock Toggle Button */}
              {cipStatus === 'CLEAN' && (
                <button
                  type="button"
                  onClick={resetCipToExpired}
                  className="w-full h-6 text-[10px] text-slate-500 hover:text-slate-800 border border-slate-200 bg-white uppercase font-mono tracking-wider flex items-center justify-center gap-1"
                  title="Simulate CIP expiration to test safety lockout"
                >
                  <span>[Simulate Expired CIP]</span>
                </button>
              )}
            </div>
          </div>

          {/* Siemens PM-CONTROL Supervisory Action Buttons Card */}
          <div className="bg-white border border-slate-200 p-4 shadow-xs space-y-2.5">
            <div className="text-xs font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 flex items-center justify-between">
              <span>PM-CONTROL Commands</span>
              <span className="text-[9px] text-slate-500 font-mono">ANSI/ISA-88</span>
            </div>

            {/* Siemens PM-CONTROL Material Availability Interlock Status Badge */}
            <div
              className={`p-2 rounded-xs border text-[11px] font-mono font-bold flex items-center justify-between gap-2 ${
                !isVirtualStockInsufficient
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900 animate-pulse'
              }`}
              title="Siemens PM-CONTROL Chapter 5.8 Material Availability Check"
            >
              <div className="flex items-center gap-1.5 truncate">
                {!isVirtualStockInsufficient ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                )}
                <span className="truncate">
                  {!isVirtualStockInsufficient
                    ? 'MATERIAL AVAILABILITY: ALL STOCKS OK'
                    : 'MATERIAL INTERLOCK: INSUFFICIENT STOCK'}
                </span>
              </div>
              <span className={`px-1.5 py-0.2 text-[9px] uppercase font-mono rounded-xs border shrink-0 ${
                !isVirtualStockInsufficient
                  ? 'bg-emerald-200/60 text-emerald-800 border-emerald-300'
                  : 'bg-rose-200 text-rose-900 border-rose-300'
              }`}>
                {!isVirtualStockInsufficient ? 'PERMISSIVE' : 'LOCKED'}
              </span>
            </div>

            {/* Heater Pre-Heat Thermal Interlock Badge */}
            <div
              className={`p-2 rounded-xs border text-[11px] font-mono font-bold flex items-center justify-between gap-2 ${
                isHeaterReady
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
              title="Heater Pre-Heat Thermal Interlock: Allows product transfer only when target temp reached"
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  isHeaterReady ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'
                }`} />
                <span className="truncate">
                  {isHeaterReady ? 'HEATER INTERLOCK: READY (TEMP OK)' : 'HEATER INTERLOCK: PRE-HEATING'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-normal shrink-0">
                {uhtPv.toFixed(1)}°C / {uhtSp.toFixed(1)}°C
              </span>
            </div>

            {/* [DOWNLOAD TO SCADA] (Industrial Dark Slate) */}
            <button
              type="button"
              disabled={isDownloadDisabled}
              onClick={() => setIsEsignOpen(true)}
              className={`w-full h-9 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px ${
                handshakeStatus === 'DOWNLOADING'
                  ? 'bg-sky-600 text-white border-sky-600 animate-pulse'
                  : isDownloadDisabled
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
              }`}
              title={
                isCipLocked
                  ? 'Operational Safety Interlock: Unit Mixing requires automated Clean-In-Place (CIP) cycle'
                  : 'Transmit Selected Recipe Setpoints to Kepware Controller Buffer'
              }
            >
              {isCipLocked ? <Lock className="w-3.5 h-3.5 text-slate-400" /> : <Download className="w-3.5 h-3.5" />}
              <span>{handshakeStatus === 'DOWNLOADING' ? 'DOWNLOADING...' : 'DOWNLOAD TO SCADA'}</span>
            </button>

            {/* [START BATCH] (Emerald Green - Handshake & CIP Interlocked) */}
            <button
              type="button"
              disabled={isStartDisabled}
              onClick={() => executeBatchCommand('START')}
              className={`w-full h-9 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px ${
                isStartDisabled
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs animate-pulse'
              }`}
              title={
                isCipLocked
                  ? 'Operational Safety Interlock: Unit Mixing requires automated Clean-In-Place (CIP) cycle'
                  : !handshakeLoadedOk
                  ? 'Interlocked: Must execute [DOWNLOAD TO SCADA] first'
                  : 'Issue ISA-88 #START Command'
              }
            >
              {isStartDisabled ? <Lock className="w-3.5 h-3.5 text-slate-400" /> : <Play className="w-3.5 h-3.5" />}
              <span>START BATCH</span>
            </button>

            {/* [HOLD] (Industrial Amber - ISA-101 Pause) */}
            <button
              type="button"
              disabled={!isBatchRunning}
              onClick={() => executeBatchCommand('HOLD')}
              className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-600 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
              title="Issue ISA-88 #HOLD Command"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>HOLD</span>
            </button>

            {/* [RESUME / RESTART] (Industrial Slate Neutral) */}
            <button
              type="button"
              disabled={!isBatchHeld}
              onClick={() => executeBatchCommand('RESUME')}
              className={`w-full h-9 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px ${
                isBatchHeld
                  ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900 animate-pulse'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-40'
              }`}
              title="Resume paused batch execution"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>RESUME / RESTART</span>
            </button>

            {/* [STOP] (Controlled Shutdown) */}
            <button
              type="button"
              disabled={!isBatchRunning && !isBatchHeld}
              onClick={() => executeBatchCommand('STOP')}
              className="w-full h-9 bg-slate-700 hover:bg-slate-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
              title="Controlled batch completion and shutdown"
            >
              <Square className="w-3.5 h-3.5" />
              <span>STOP</span>
            </button>

            {/* [RESET] */}
            <button
              type="button"
              onClick={() => executeBatchCommand('RESET')}
              className="w-full h-9 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
              title="Reset state machine to IDLE"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>RESET</span>
            </button>

            {/* [ABORT] (Crimson Red - Emergency) */}
            <button
              type="button"
              disabled={!isBatchRunning && !isBatchHeld}
              onClick={() => executeBatchCommand('ABORT')}
              className="w-full h-9 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border border-rose-700 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
              title="Immediate emergency batch abort"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>ABORT</span>
            </button>
          </div>
        </div>

        {/* =======================================================
            CENTER PANEL: 3-Tier Synchronized Work Order Queue
           ======================================================= */}
        <div className="lg:col-span-5 space-y-4">
          {/* Top Table: New Orders (Dispatched from Master Data) */}
          <div className="bg-white border border-slate-200 shadow-xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Send className="w-3.5 h-3.5 text-slate-600" />
                <span className="font-bold text-slate-900 uppercase">
                  New Orders (Awaiting Handshake)
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 font-semibold">
                  {newOrders.length} Order(s)
                </span>
              </div>

              {/* ISA-95 Level 4 (ERP) Status Badge & Sync Action */}
              <div className="flex items-center gap-2">
                {/* ODOO ERP Status Badge */}
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 h-9 text-[11px] font-mono font-medium border bg-[#F8FAFC] border-[#E2E8F0]"
                  title={odooStatus?.error || (isOdooOnline ? `Odoo 18 Community (v${odooStatus?.server_version || '18.0'}) - DB: ${odooStatus?.database || 'dairy_erp'}` : 'Odoo ERP Offline')}
                >
                  <span className="text-slate-700 font-bold tracking-wide">ODOO ERP:</span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isOdooOnline ? 'bg-[#10B981]' : 'bg-[#F43F5E]'
                    }`}
                  />
                  <span className={`font-bold ${isOdooOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {isOdooOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>

                {/* Explicit Action Button with 8-State Support */}
                <button
                  type="button"
                  onClick={handleSyncOdoo}
                  disabled={isSyncing}
                  data-state={syncButtonState}
                  aria-disabled={isSyncing}
                  className={`h-9 px-3 text-xs font-mono font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px ${
                    isSyncing
                      ? 'bg-slate-100 border-[#E2E8F0] text-slate-400 cursor-wait'
                      : syncSuccess
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : syncError
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9]'
                  }`}
                  title="Synchronize confirmed manufacturing orders from Odoo 18 ERP into MES Level 3 queue"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : 'text-slate-700'}`} />
                  <span>{isSyncing ? 'ĐANG ĐỒNG BỘ...' : '[↻ SYNC TỪ ODOO ERP]'}</span>
                </button>

                {/* Module Tag Mapping Button */}
                <button
                  type="button"
                  onClick={() => setIsTagModalOpen(true)}
                  className="h-9 px-3 text-xs font-mono font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 border bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
                  title="Cấu hình ánh xạ Kepware OPC UA Tags cho module Vận hành & Batch (ISA-88)"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-700" />
                  <span>[⚙️ CẤU HÌNH TAG VẬN HÀNH]</span>
                </button>
              </div>
            </div>

            {/* Live Operational Process Telemetry Strip */}
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-mono space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Mixing Tank Weight (Loadcell PV with Linear % against Batch Volume) */}
                  {(() => {
                    const tag = getOpsTag('cell1.Mixing_Weight_PV', 'Mixing_Weight_PV', 'mixing_weight_pv', 'TANK_ALL_ACT_KL');
                    const isMapped = Boolean(tag?.node_id);
                    const valNum = tag?.value !== undefined && tag?.value !== null ? Number(tag.value) : null;
                    const targetVol = activeOrder?.volume || 1000.0;
                    const fillPct = valNum !== null ? Math.min(100, Math.max(0, (valNum / (targetVol || 1)) * 100)) : null;

                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('mixing_weight_pv');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'mixing_weight_pv') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'mixing_weight_pv',
                            ['cell1.Mixing_Weight_PV', 'Mixing_Weight_PV'],
                            'Khối lượng bồn trộn',
                            'kg'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'mixing_weight_pv' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán Loadcell Bồn trộn'}
                      >
                        <span className="text-slate-500 uppercase font-bold">Khối lượng bồn trộn:</span>
                        {isMapped && valNum !== null ? (
                          <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-200">
                            {valNum.toFixed(1)} / {targetVol.toFixed(0)} kg ({fillPct?.toFixed(0)}%)
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mixing Tank Temperature (PT100 PV) */}
                  {(() => {
                    const tag = getOpsTag('cell1.Mixing_Temp_PV', 'Mixing_Temp_PV', 'mixing_temp_pv');
                    const isMapped = Boolean(tag?.node_id);
                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('mixing_temp_pv');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'mixing_temp_pv') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'mixing_temp_pv',
                            ['cell1.Mixing_Temp_PV', 'Mixing_Temp_PV'],
                            'Nhiệt bồn trộn',
                            '°C'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'mixing_temp_pv' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán PT100 Bồn trộn'}
                      >
                        <span className="text-slate-500 uppercase font-bold">Nhiệt bồn trộn:</span>
                        {isMapped && tag?.value !== undefined && tag?.value !== null ? (
                          <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-200">
                            {Number(tag.value).toFixed(1)} °C
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* UHT Temp PV */}
                  {(() => {
                    const tag = getOpsTag('uht_temp_pv', 'Heat_Temp_ACT', 'Temp_Sterilizer_PV', 'UHT_TEMP_PV');
                    const isMapped = Boolean(tag?.node_id);
                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('uht_temp_pv');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'uht_temp_pv') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'uht_temp_pv',
                            ['cell1.Heating_PV', 'UHT_TEMP_PV'],
                            'Nhiệt độ đun/TT',
                            '°C'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'uht_temp_pv' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán Nhiệt độ UHT'}
                      >
                        <span className="text-slate-500 uppercase font-bold">Nhiệt độ đun/TT:</span>
                        {isMapped && tag?.value !== undefined && tag?.value !== null ? (
                          <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-200">
                            {Number(tag.value).toFixed(1)} °C
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Cooling Temp PV */}
                  {(() => {
                    const tag = getOpsTag('cooling_temp_pv', 'Cold_Temp_ACT', 'Cooling_Temp_PV', 'COOLING_TEMP_PV');
                    const isMapped = Boolean(tag?.node_id);
                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('cooling_temp_pv');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'cooling_temp_pv') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'cooling_temp_pv',
                            ['cell1.Cooling_PV', 'COOLING_TEMP_PV'],
                            'Làm lạnh Buffer',
                            '°C'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'cooling_temp_pv' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán Nhiệt độ làm lạnh'}
                      >
                        <span className="text-slate-500 uppercase font-bold">Làm lạnh Buffer:</span>
                        {isMapped && tag?.value !== undefined && tag?.value !== null ? (
                          <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-200">
                            {Number(tag.value).toFixed(1)} °C
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Agitator Speed PV */}
                  {(() => {
                    const tag = getOpsTag('agitator_speed_pv', 'MOTOR_SPEED_ACT', 'Agitator_Speed_PV', 'AGITATOR_SPEED_PV');
                    const isMapped = Boolean(tag?.node_id);
                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('agitator_speed_pv');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'agitator_speed_pv') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'agitator_speed_pv',
                            ['cell1.Agitator_PV', 'AGITATOR_SPEED_PV'],
                            'Tốc độ khuấy',
                            'RPM'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'agitator_speed_pv' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán Tốc độ khuấy'}
                      >
                        <span className="text-slate-500 uppercase font-bold">Tốc độ khuấy:</span>
                        {isMapped && tag?.value !== undefined && tag?.value !== null ? (
                          <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 border border-slate-200">
                            {Number(tag.value).toFixed(0)} RPM
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* SSR Heater Status */}
                  {(() => {
                    const tag = getOpsTag('cell1.SSR_Heater_Status', 'SSR_Heater_Status', 'ssr_heater_status', 'PID_OUT_SSR', 'HEATER_RUN_STATUS');
                    const isMapped = Boolean(tag?.node_id);
                    const isSsrOn = Boolean(tag?.value === 1 || tag?.value === true || tag?.value === '1' || tag?.value === 'true');
                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('ssr_heater_status');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'ssr_heater_status') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'ssr_heater_status',
                            ['cell1.SSR_Heater_Status', 'SSR_Heater_Status'],
                            'SSR Heater',
                            'Bool'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'ssr_heater_status' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán SSR Heater'}
                      >
                        <span className="text-slate-500 uppercase font-bold">SSR Heater:</span>
                        {isMapped ? (
                          <span className={`font-bold px-1.5 py-0.5 border ${
                            isSsrOn
                              ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {isSsrOn ? '● SSR HEATING ON' : '○ SSR OFF'}
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* CIP Sensor (Read) */}
                  {(() => {
                    const tag = getOpsTag('cip_clean_status', 'CIP_CLEAN_STATUS');
                    const isMapped = Boolean(tag?.node_id);
                    return (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverSlot('cip_clean_status');
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === 'cip_clean_status') setDragOverSlot(null);
                        }}
                        onDrop={(e) =>
                          handleDropOnOpsSlot(
                            e,
                            'cip_clean_status',
                            ['CIP_CLEAN_STATUS'],
                            'CIP Sensor',
                            'Bool'
                          )
                        }
                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs transition-all ${
                          dragOverSlot === 'cip_clean_status' ? 'ring-2 ring-emerald-500 bg-emerald-50/70' : ''
                        }`}
                        title={isMapped ? `Node: ${tag?.node_id} (Thả Tag vào đây để đổi)` : 'Thả Tag Kepware vào đây để gán CIP Sensor'}
                      >
                        <span className="text-slate-500 uppercase font-bold">CIP Sensor:</span>
                        {isMapped ? (
                          <span className={`font-bold px-1.5 py-0.5 border ${
                            tag?.value === 1 || tag?.value === true || tag?.value === '1'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}>
                            {tag?.value === 1 || tag?.value === true || tag?.value === '1'
                              ? '● CLEAN (1)'
                              : '○ DIRTY (0)'}
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 border border-slate-300">
                            [CHƯA ÁNH XẠ] (--)
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="text-[10px] text-slate-500 flex items-center gap-1 shrink-0">
                  <span>OPC UA HOT-SYNC:</span>
                  <span className="text-emerald-700 font-bold">ACTIVE</span>
                </div>
              </div>

              {/* Heater Ready Interlock Status Strip (ISA-88 Procedural Interlock: Mixing -> Heater Transfer Permissive) */}
              {(() => {
                const readyTag = getOpsTag('cell1.Heater_Ready_Flag', 'Heater_Ready_Flag', 'heater_ready_flag', 'HEATER_TEMP_OK');
                const uhtTag = getOpsTag('uht_temp_pv', 'Heat_Temp_ACT', 'Temp_Sterilizer_PV', 'UHT_TEMP_PV');
                const uhtSpTag = getOpsTag('uht_temp_sp', 'Recipe_Temp_SP', 'Heat_Temp_SP', 'UHT_TEMP_SP');
                const uhtPv = uhtTag?.value != null ? Number(uhtTag.value) : null;
                const uhtSp = uhtSpTag?.value != null ? Number(uhtSpTag.value) : (activeOrder?.setpoints?.tempHotSp || 138.0);

                const isFlagAsserted = readyTag?.value === 1 || readyTag?.value === true || readyTag?.value === '1' || readyTag?.value === 'true';
                const isTempReached = uhtPv !== null && uhtSp > 0 && uhtPv >= (uhtSp - 1.0);
                const isHeaterReady = Boolean(isFlagAsserted || (!readyTag?.node_id && isTempReached));

                return (
                  <div className={`p-2 border flex items-center justify-between text-[11px] font-mono transition-colors shadow-2xs ${
                    isHeaterReady
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : isBatchRunning
                      ? 'bg-amber-50 border-amber-300 text-amber-950 animate-pulse'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full inline-block ${
                        isHeaterReady
                          ? 'bg-emerald-600 animate-pulse'
                          : isBatchRunning
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-slate-400'
                      }`} />
                      <span className="font-bold uppercase tracking-wide">
                        {isHeaterReady
                          ? '● HEATER ĐỦ NHIỆT: CHO PHÉP CHUYỂN LIỆU TỪ MIXING -> HEATER'
                          : isBatchRunning
                          ? '⏳ ĐANG GIA NHIỆT SSR: CHỜ HEATER ĐỦ NHIỆT (KHÓA VAN MIXING -> HEATER)'
                          : '○ HEATER CHƯA ĐỦ NHIỆT (KHÓA LIÊN ĐỘNG CHUYỂN LIỆU: BẢO VỆ NHIỆT BỒN TRỘN & HEATER)'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {readyTag?.node_id ? `PLC Tag: ${readyTag.node_id}` : `Interlock Logic: UHT PV (≥${(uhtSp - 1.0).toFixed(1)}°C)`}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Non-blocking Sync Toast */}
            {syncToast && (
              <div
                className={`mx-4 mt-2.5 p-2 border font-mono text-xs flex items-center justify-between shadow-xs ${
                  syncError
                    ? 'bg-rose-50 border-rose-200 text-rose-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {syncError ? (
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span>{syncToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncToast(null)}
                  className="text-slate-500 hover:text-slate-800 text-[10px] font-bold px-1.5 py-0.5 ml-2 cursor-pointer"
                >
                  [✕]
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[10px] uppercase">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Recipe Formulation</th>
                    <th className="py-2 px-3 text-right">Vol (L)</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Select / Arm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {moOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <span className="font-semibold text-slate-700">Chưa có đơn hàng trong hàng đợi. Vui lòng bấm [SYNC TỪ ODOO ERP] hoặc tạo đơn mới.</span>
                          <span className="text-[11px] text-slate-400">Trạng thái: Sẵn sàng nhận lệnh sản xuất thực tế từ Level 4 ERP hoặc Work Order Dispatcher.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    moOrders.map((order) => {
                      const isSelected = selectedOrderId === order.id;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedOrderId(order.id)}
                          className={`cursor-pointer transition-none ${
                            isSelected
                              ? 'bg-sky-50/70 border-l-2 border-l-sky-600 text-slate-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <td className="py-2 px-3 font-bold text-slate-900">
                            <div>{order.id}</div>
                            <div className="text-[10px] text-slate-400 font-normal">Level 3 Queue</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="truncate max-w-[150px] font-semibold text-slate-900" title={order.customerName}>
                              {order.customerName || 'Khách hàng Tiêu chuẩn'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {order.customerCode || 'CUS-01'} · Priority: {order.orderPriority || 2}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="truncate max-w-[150px] font-semibold text-slate-900">{order.recipeName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{order.recipeVersion || 'v1.2'}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            {order.volume.toLocaleString()} L
                          </td>
                          <td className="py-2 px-3 text-center">
                            {renderStateBadge(order.status)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatchOrder(order.id);
                              }}
                              className={`h-6 px-2 text-[10px] uppercase tracking-wider font-mono border transition-none inline-flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              <span>{isSelected ? 'Armed' : 'Select'}</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* =========================================================================
              ISA-88 3-HOPPER PARALLEL PRE-WEIGHING & DISCHARGE MATRIX (5 LOADCELL HARDWARE)
             ========================================================================= */}
          <div className="bg-white border border-slate-200 shadow-xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-slate-800" />
                <span className="font-bold text-slate-900 uppercase">
                  Hệ thống 3 Bồn Cân Trung Gian &amp; Xả Phối Trộn (ISA-88 Pre-Weighing Hoppers)
                </span>
                <span className="text-[10px] bg-sky-50 text-sky-800 border border-sky-300 px-2 py-0.5 font-bold uppercase">
                  5 Loadcells
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Operator Tolerance Override Button */}
                <button
                  type="button"
                  onClick={() => setIsToleranceOverridden((prev) => !prev)}
                  className={`h-7 px-2.5 text-[10px] font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1 border transition-none active:translate-y-px ${
                    isToleranceOverridden
                      ? 'bg-amber-100 border-amber-400 text-amber-900'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Cho phép người vận hành chấp nhận dung sai khối lượng vượt ngoài ±2.0%"
                >
                  <span>{isToleranceOverridden ? '● ĐÃ GHI ĐÈ DUNG SAI (OVERRIDDEN)' : '○ GHI ĐÈ DUNG SAI (OVERRIDE)'}</span>
                </button>

                {/* Simultaneous Discharge Button */}
                <button
                  type="button"
                  onClick={handleSimultaneousDischarge}
                  disabled={!isAllWeighedReady || isDischarging}
                  className={`h-7 px-3 text-[10px] font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border transition-none active:translate-y-px ${
                    !isAllWeighedReady
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : isDischarging
                      ? 'bg-sky-600 text-white border-sky-700 cursor-wait animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                  }`}
                  title="Mở van xả đồng thời cả 3 bồn cân trung gian vào bồn phối trộn MIX-01"
                >
                  <RotateCw className={`w-3 h-3 ${isDischarging ? 'animate-spin' : ''}`} />
                  <span>{isDischarging ? 'ĐANG XẢ ĐỒNG LOẠT...' : '[⚡ MỞ VAN XẢ ĐỒNG LOẠT]'}</span>
                </button>
              </div>
            </div>

            {/* 3 Hoppers + Output Tank Grid */}
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/50">
              {/* Hopper 1: Raw Milk */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverSlot('weigh1_weight_pv');
                }}
                onDragLeave={() => {
                  if (dragOverSlot === 'weigh1_weight_pv') setDragOverSlot(null);
                }}
                onDrop={(e) =>
                  handleDropOnOpsSlot(
                    e,
                    'weigh1_weight_pv',
                    ['Weigh1_Weight_PV', 'weigh_hopper_1_pv'],
                    'WEIGH-01 (Sữa tươi)',
                    'L'
                  )
                }
                className={`p-2.5 bg-white border space-y-1.5 shadow-2xs transition-all ${
                  dragOverSlot === 'weigh1_weight_pv'
                    ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                    : 'border-slate-200'
                }`}
                title="Thả Tag Kepware vào đây để gán Loadcell PV cho WEIGH-01 (Sữa tươi)"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="font-bold text-slate-900 text-[11px] uppercase">WEIGH-01 (SỮA TƯƠI)</span>
                  <span className={`text-[9px] px-1.5 py-0.2 font-bold uppercase border ${
                    tol1.status === 'WEIGHT_OK' || isToleranceOverridden
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : tol1.status === 'UNDER_WEIGHT'
                      ? 'bg-sky-50 text-sky-800 border-sky-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}>
                    {isToleranceOverridden ? 'OVERRIDDEN' : tol1.text}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Khối lượng PV:</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {pvWeigh1.toFixed(3)} <span className="text-[10px] text-slate-500 font-normal">L</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Mục tiêu (SP):</span>
                  <span className="font-semibold text-slate-700">{milkSp.toFixed(2)} L</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Độ lệch (Δ):</span>
                  <span className={`font-semibold ${Math.abs(tol1.devPct) <= 2.0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {(pvWeigh1 - milkSp).toFixed(3)} L ({tol1.devPct >= 0 ? '+' : ''}{tol1.devPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
                  <span>Van xả: {pvWeigh1Tag?.node_id ? 'TỰ ĐỘNG' : 'SẴN SÀNG'}</span>
                  <span className={`font-bold ${pvWeigh1 <= 0.05 ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {pvWeigh1 <= 0.05 ? '● BỒN RỖNG' : '○ CÓ LIỆU'}
                  </span>
                </div>
              </div>

              {/* Hopper 2: Sugar */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverSlot('weigh2_weight_pv');
                }}
                onDragLeave={() => {
                  if (dragOverSlot === 'weigh2_weight_pv') setDragOverSlot(null);
                }}
                onDrop={(e) =>
                  handleDropOnOpsSlot(
                    e,
                    'weigh2_weight_pv',
                    ['Weigh2_Weight_PV', 'weigh_hopper_2_pv'],
                    'WEIGH-02 (Đường)',
                    'kg'
                  )
                }
                className={`p-2.5 bg-white border space-y-1.5 shadow-2xs transition-all ${
                  dragOverSlot === 'weigh2_weight_pv'
                    ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                    : 'border-slate-200'
                }`}
                title="Thả Tag Kepware vào đây để gán Loadcell PV cho WEIGH-02 (Đường)"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="font-bold text-slate-900 text-[11px] uppercase">WEIGH-02 (ĐƯỜNG)</span>
                  <span className={`text-[9px] px-1.5 py-0.2 font-bold uppercase border ${
                    tol2.status === 'WEIGHT_OK' || isToleranceOverridden
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : tol2.status === 'UNDER_WEIGHT'
                      ? 'bg-sky-50 text-sky-800 border-sky-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}>
                    {isToleranceOverridden ? 'OVERRIDDEN' : tol2.text}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Khối lượng PV:</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {pvWeigh2.toFixed(3)} <span className="text-[10px] text-slate-500 font-normal">kg</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Mục tiêu (SP):</span>
                  <span className="font-semibold text-slate-700">{sugarSp.toFixed(2)} kg</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Độ lệch (Δ):</span>
                  <span className={`font-semibold ${Math.abs(tol2.devPct) <= 2.0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {(pvWeigh2 - sugarSp).toFixed(3)} kg ({tol2.devPct >= 0 ? '+' : ''}{tol2.devPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
                  <span>Van xả: {pvWeigh2Tag?.node_id ? 'TỰ ĐỘNG' : 'SẴN SÀNG'}</span>
                  <span className={`font-bold ${pvWeigh2 <= 0.05 ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {pvWeigh2 <= 0.05 ? '● BỒN RỖNG' : '○ CÓ LIỆU'}
                  </span>
                </div>
              </div>

              {/* Hopper 3: Additives */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverSlot('weigh3_weight_pv');
                }}
                onDragLeave={() => {
                  if (dragOverSlot === 'weigh3_weight_pv') setDragOverSlot(null);
                }}
                onDrop={(e) =>
                  handleDropOnOpsSlot(
                    e,
                    'weigh3_weight_pv',
                    ['Weigh3_Weight_PV', 'weigh_hopper_3_pv'],
                    'WEIGH-03 (Phụ gia)',
                    'kg'
                  )
                }
                className={`p-2.5 bg-white border space-y-1.5 shadow-2xs transition-all ${
                  dragOverSlot === 'weigh3_weight_pv'
                    ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                    : 'border-slate-200'
                }`}
                title="Thả Tag Kepware vào đây để gán Loadcell PV cho WEIGH-03 (Phụ gia)"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="font-bold text-slate-900 text-[11px] uppercase">WEIGH-03 (PHỤ GIA)</span>
                  <span className={`text-[9px] px-1.5 py-0.2 font-bold uppercase border ${
                    tol3.status === 'WEIGHT_OK' || isToleranceOverridden
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : tol3.status === 'UNDER_WEIGHT'
                      ? 'bg-sky-50 text-sky-800 border-sky-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}>
                    {isToleranceOverridden ? 'OVERRIDDEN' : tol3.text}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Khối lượng PV:</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {pvWeigh3.toFixed(3)} <span className="text-[10px] text-slate-500 font-normal">kg</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Mục tiêu (SP):</span>
                  <span className="font-semibold text-slate-700">{additiveSp.toFixed(2)} kg</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Độ lệch (Δ):</span>
                  <span className={`font-semibold ${Math.abs(tol3.devPct) <= 2.0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {(pvWeigh3 - additiveSp).toFixed(3)} kg ({tol3.devPct >= 0 ? '+' : ''}{tol3.devPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
                  <span>Van xả: {pvWeigh3Tag?.node_id ? 'TỰ ĐỘNG' : 'SẴN SÀNG'}</span>
                  <span className={`font-bold ${pvWeigh3 <= 0.05 ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {pvWeigh3 <= 0.05 ? '● BỒN RỖNG' : '○ CÓ LIỆU'}
                  </span>
                </div>
              </div>

              {/* Output Tank: OUT-01 */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverSlot('out_weight_pv');
                }}
                onDragLeave={() => {
                  if (dragOverSlot === 'out_weight_pv') setDragOverSlot(null);
                }}
                onDrop={(e) =>
                  handleDropOnOpsSlot(
                    e,
                    'out_weight_pv',
                    ['Out_Weight_PV', 'OUT01_WEIGHT_PV'],
                    'OUT-01 (Thành phẩm)',
                    'L'
                  )
                }
                className={`p-2.5 bg-white border space-y-1.5 shadow-2xs transition-all ${
                  dragOverSlot === 'out_weight_pv'
                    ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                    : 'border-slate-200'
                }`}
                title="Thả Tag Kepware vào đây để gán Loadcell PV cho OUT-01 (Thành phẩm)"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="font-bold text-slate-900 text-[11px] uppercase">OUT-01 (THÀNH PHẨM)</span>
                  <span className="text-[9px] px-1.5 py-0.2 font-bold uppercase border bg-slate-100 text-slate-700 border-slate-300">
                    BUFFER BUFFER
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Khối lượng PV:</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {pvOutput.toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">/ 5.0 L</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Mức bồn:</span>
                  <span className="font-semibold text-slate-700">{((pvOutput / 5.0) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Trạng thái:</span>
                  <span className={`font-semibold ${pvOutput <= 0.8 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {pvOutput <= 0.8 ? '● Bồn rỗng (Sẵn sàng đón mẻ)' : '⏳ Chờ xả rỗng (Đang lưu trữ)'}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
                  <span>Tự động chuyển mẻ:</span>
                  <span className="font-bold text-slate-700">≤ 0.80 L (Auto-Advance)</span>
                </div>
              </div>
            </div>

            {/* Interlock Permissive Bar & Single-Shot Deduction Action */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <div className="flex flex-wrap items-center gap-3">
                {/* All 3 Ready Indicator */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase">Khóa liên động nạp liệu:</span>
                  <span className={`font-bold px-2 py-0.5 border ${
                    isAllWeighedReady
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                  }`}>
                    {isAllWeighedReady ? '✓ ALL 3 HOPPERS READY (PERMISSIVE PASS)' : '⏳ CHỜ CÂN ĐỦ 3 BỒN TRUNG GIAN'}
                  </span>
                </div>

                {/* Mass Balance Check */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase">Cân bằng vật chất (Mixing Tank):</span>
                  <span className={`font-bold px-2 py-0.5 border ${
                    isMassBalancePass
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}>
                    {isMassBalancePass ? `✓ KHỚP (Δ = ${massBalanceDiff.toFixed(2)}kg ≤ 0.15)` : `○ THEO DÕI (Δ = ${massBalanceDiff.toFixed(2)}kg)`}
                  </span>
                </div>

                {/* Zero Return Check */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase">Bồn rỗng (Zero-return):</span>
                  <span className={`font-bold px-2 py-0.5 border ${
                    isZeroReturnAll
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : isDischarging
                      ? 'bg-sky-50 text-sky-800 border-sky-300 animate-pulse'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}>
                    {isZeroReturnAll ? (isDischargeComplete ? '● BỒN RỖNG (XẢ HOÀN TẤT)' : '● ĐÃ XẢ HẾT (EMPTY)') : isDischarging ? '⏳ ĐANG XẢ...' : '○ CÒN NGUYÊN LIỆU'}
                  </span>
                </div>

                {/* PLC Dosing Complete Signal Indicator */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold uppercase">Tín hiệu PLC Nạp liệu:</span>
                  <span className={`font-bold px-2 py-0.5 border ${
                    isPlcDosingComplete
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}>
                    {isPlcDosingComplete ? '● PLC: HOÀN TẤT NẠP LIỆU (1)' : '○ PLC: ĐANG CÂN ĐỊNH LƯỢNG (0)'}
                  </span>
                </div>
              </div>

              {/* Automated Single-Shot Deduction Action Status */}
              <div>
                {singleShotResult?.status === 'success' || singleShotResult?.is_idempotent_replay ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>✓ ĐÃ TỰ ĐỘNG KHẤU TRỪ TỒN KHO NGUYÊN LIỆU (BỒN TỔNG 1000L)</span>
                  </div>
                ) : isDeducting ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 text-amber-800 font-bold text-[11px]">
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                    <span>⏳ ĐANG TỰ ĐỘNG KHẤU TRỪ TỒN KHO...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 italic hidden sm:inline">
                      {isPlcDosingComplete ? 'Đang tự động khấu trừ...' : '⚡ Tự động khấu trừ kho khi PLC bật tag xong nạp liệu'}
                    </span>
                    <button
                      type="button"
                      onClick={handleSingleShotDeduct}
                      disabled={isDeducting || !activeOrder}
                      className="h-8 px-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-mono text-[10px] font-bold inline-flex items-center gap-1 border border-slate-900 active:translate-y-px transition-all rounded-xs shadow-2xs hallmark-focus"
                      title="Hệ thống tự động khấu trừ kho khi nhận tín hiệu PLC. Bấm vào đây nếu muốn khấu trừ thủ công ngay lập tức."
                    >
                      <Check className="w-3 h-3 text-white" />
                      <span>[THỦ CÔNG: KHẤU TRỪ NGAY]</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Deduction Result Lot Genealogy Strip */}
            {singleShotResult && singleShotResult.deductions && singleShotResult.deductions.length > 0 && (
              <div className="p-3 bg-slate-100 border-t border-slate-200 text-[10px] font-mono space-y-1">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>TRUY XUẤT NGUỒN GỐC LÔ (LOT &amp; RECEIPT GENEALOGY - FDA 21 CFR PART 11):</span>
                  <span className="text-emerald-700 font-semibold">{singleShotResult.timestamp}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {singleShotResult.deductions.map((d, i) => (
                    <div key={i} className="p-1.5 bg-white border border-slate-200">
                      <div className="font-bold text-slate-900">{d.tank_id} - {d.material_name}</div>
                      <div className="text-slate-600">Khấu trừ: <strong className="text-rose-700">-{d.deducted_qty} {d.unit}</strong> (Còn: {d.remaining_stock} {d.unit})</div>
                      <div className="text-slate-500 text-[9px]">Lô NCC: {d.supplier_lot} | Phiếu: {d.receipt_code}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Middle Table: Running Orders (Active SCADA Batch) */}
          <div className="bg-white border border-slate-200 shadow-xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-bold text-slate-900 uppercase">
                  Running Orders (Active SCADA Batch)
                </span>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 font-bold">
                {runningOrders.length} Executing
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[10px] uppercase">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Recipe Name</th>
                    <th className="py-2 px-3 text-center">State</th>
                    <th className="py-2 px-3">Controller Sync Status</th>
                    <th className="py-2 px-3 text-right">Elapsed Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {runningOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 font-mono">
                        Hệ thống đang ở trạng thái Chờ (Cold Standby).
                      </td>
                    </tr>
                  ) : (
                    runningOrders.map((order) => (
                      <tr key={order.id} className="bg-emerald-50/20 hover:bg-emerald-50/40">
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {order.id}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {order.recipeName}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {renderStateBadge(order.status)}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-emerald-800 font-semibold">
                          {order.scadaSyncStatus}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                          {order.elapsedTime}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Table: Finished Orders (Archived) */}
          <div className="bg-white border border-slate-200 shadow-xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-900 uppercase">
                Finished Orders (Historian Archived)
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 font-semibold">
                {finishedOrders.length} Completed
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[10px] uppercase">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Recipe Formulation</th>
                    <th className="py-2 px-3 text-center">State</th>
                    <th className="py-2 px-3 text-right">Completion Time</th>
                    <th className="py-2 px-3 text-right">Odoo ERP (Level 4)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {finishedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 font-mono">
                        Chưa có đơn hàng nào hoàn thành trong lịch sử lưu trữ.
                      </td>
                    </tr>
                  ) : (
                    finishedOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {order.id}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-700">
                          {order.recipeName}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {renderStateBadge(order.status)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 text-[11px]">
                          {order.completionTime || '---'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {order.id.startsWith('WH/MO') || order.id.includes('MO') ? (
                            odooClosedOrders[order.id] ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                ODOO DONE
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCompleteOdooOrder(order.id, (order as any).actualVolume || order.volume)}
                                disabled={completingOrderId === order.id}
                                className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-mono text-[10px] font-bold inline-flex items-center gap-1.5 border border-slate-900 active:translate-y-px transition-all rounded-xs shadow-2xs hallmark-focus"
                                title="Uplink đóng lệnh sản xuất, nhập kho thành phẩm và khấu trừ nguyên liệu trên Odoo ERP"
                              >
                                {completingOrderId === order.id ? (
                                  <>
                                    <RefreshCcw className="w-3 h-3 animate-spin text-white" />
                                    <span>ĐANG ĐÓNG...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3 text-sky-400" />
                                    <span>ĐÓNG LỆNH ERP</span>
                                  </>
                                )}
                              </button>
                            )
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400">---</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* =======================================================
            RIGHT PANEL: Digital Twin Deviation & Telemetry Matrix
           ======================================================= */}
        <div className="lg:col-span-4 bg-white border border-slate-200 shadow-xs font-mono text-xs flex flex-col justify-between">
          <div>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-slate-800" />
                  <span className="font-bold text-slate-900 uppercase tracking-tight">
                    DIGITAL TWIN DEVIATION &amp; TELEMETRY MATRIX
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Real-time benchmark: Master Recipe SP vs Cell 1 Physical vs Cell 2 SIMIT Twin
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => refreshDeviationMatrix()}
                  className="h-6 px-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-bold flex items-center gap-1 active:translate-y-px transition-none hallmark-focus"
                  title="Cập nhật ma trận sai lệch thời gian thực"
                >
                  <RefreshCcw className="w-2.5 h-2.5" />
                  <span>REFRESH</span>
                </button>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" title="Central Cache Active" />
              </div>
            </div>

            {activeOrder && (
              <div className="px-4 py-2 bg-sky-50/60 border-b border-sky-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Khách hàng:</span>
                  <span className="font-bold text-slate-900 text-xs">
                    {activeOrder.customerName || 'Khách hàng Tiêu chuẩn'}
                  </span>
                  <span className="px-1.5 py-0.5 bg-white border border-sky-200 text-sky-800 text-[9px] font-mono font-bold">
                    Ưu tiên: {activeOrder.orderPriority || 2}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-600">
                  <span className="font-bold text-slate-900">{activeOrder.id}</span> · {activeOrder.volume?.toLocaleString()} L
                </div>
              </div>
            )}

            {/* =======================================================
                ISA-88 CAMPAIGN OPTIMIZER & LOAD EQUALIZATION WORKBENCH
               ======================================================= */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2.5 font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-600 font-bold">⚡</span>
                  <span className="font-bold text-slate-900 uppercase text-[11px] tracking-wide">
                    TỐI ƯU HÓA CHIA MẺ &amp; CÂN BẰNG TẢI NĂNG LƯỢNG (ISA-88)
                  </span>
                </div>
                {/* Equipment Safe Limit Selector */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-slate-500 font-semibold">Headroom bồn:</span>
                  <button
                    type="button"
                    onClick={() => setSafeHeadroomRatio(0.90)}
                    className={`px-1.5 py-0.5 border font-bold transition-none ${
                      safeHeadroomRatio === 0.90
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    90% (4.50L)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSafeHeadroomRatio(0.80)}
                    className={`px-1.5 py-0.5 border font-bold transition-none ${
                      safeHeadroomRatio === 0.80
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    80% (4.00L)
                  </button>
                </div>
              </div>

              {/* Campaign Status Summary Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white border border-slate-200">
                <div className="space-y-0.5">
                  <div className="text-[10px] text-slate-500 uppercase">
                    Quy mô đơn hàng: <strong className="text-slate-900">{orderVolume.toFixed(1)} L</strong> | Bồn trộn: <strong className="text-slate-900">{vesselCapacity.toFixed(1)} L</strong> (Max an toàn: {safeMaxVolume.toFixed(2)} L)
                  </div>
                  <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                    {isCampaignNeeded ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        CHIẾN DỊCH {campaignBatchCount} MẺ × {equalizedBatchVolume.toFixed(2)} L/MẺ (Tải {loadFactorPct.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-sky-700 font-bold">
                        ○ 1 MẺ ĐƠN TIÊU CHUẨN: {orderVolume.toFixed(1)} L (Tải {loadFactorPct.toFixed(1)}% ≤ {safeMaxVolume.toFixed(1)}L)
                      </span>
                    )}
                  </div>
                </div>

                {isCampaignNeeded && (
                  <span className="px-2 py-0.5 text-[10px] font-bold font-mono uppercase bg-emerald-50 text-emerald-800 border border-emerald-300">
                    ⚡ TIẾT KIỆM 20% CHU KỲ SSR
                  </span>
                )}
              </div>

              {/* If Campaign Needed: Show Stepper Pills & Naive vs Equalized Comparison */}
              {isCampaignNeeded && (
                <div className="space-y-2">
                  {/* Campaign Batch Stepper Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">TIẾN TRÌNH:</span>
                    {Array.from({ length: campaignBatchCount }, (_, idx) => {
                      const bNum = idx + 1;
                      const isActive = activeCampaignBatch === bNum;
                      return (
                        <button
                          key={bNum}
                          type="button"
                          onClick={() => setActiveCampaignBatch(bNum)}
                          className={`h-6 px-2 text-[10px] font-mono font-bold shrink-0 border transition-none flex items-center gap-1 ${
                            isActive
                              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>{isActive ? '●' : '○'} Mẻ {bNum}/{campaignBatchCount}</span>
                          <span className="text-[9px] opacity-80">({equalizedBatchVolume.toFixed(2)}L)</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Contrast comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 bg-rose-50/70 border border-rose-200 text-rose-950">
                      <div className="font-bold text-rose-800 uppercase flex items-center gap-1 mb-1">
                        <AlertOctagon className="w-3 h-3 text-rose-600 shrink-0" />
                        <span>⚠️ CHIA TẢI MAX DUNG TÍCH (NAIVE)</span>
                      </div>
                      <div className="font-semibold text-rose-900">
                        {naiveFullBatches} × {vesselCapacity.toFixed(1)}L + 1 × {naiveRemnant.toFixed(1)}L mẻ dư
                      </div>
                      <div className="text-[9.5px] text-rose-700 mt-0.5 leading-tight">
                        Nguy cơ: Mẻ cuối {naiveRemnant.toFixed(1)}L hở đầu đo PT100, quá nhiệt SSR bồn trống, sai lệch hệ số vortex khuấy.
                      </div>
                    </div>

                    <div className="p-2 bg-emerald-50/70 border border-emerald-200 text-emerald-950">
                      <div className="font-bold text-emerald-800 uppercase flex items-center gap-1 mb-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>✓ ISA-88 CÂN BẰNG TẢI TỐI ƯU</span>
                      </div>
                      <div className="font-semibold text-emerald-900">
                        {campaignBatchCount} × {equalizedBatchVolume.toFixed(2)}L (Đều {loadFactorPct.toFixed(1)}% dung tích)
                      </div>
                      <div className="text-[9.5px] text-emerald-700 mt-0.5 leading-tight">
                        Lợi ích: Ngập sâu PT100 &amp; cánh khuấy, 10% headspace chống tràn, ổn định truyền nhiệt SSR, bảo toàn chất lượng mẻ.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Campaign Setpoint Scaling Subtitle Strip */}
            {isCampaignNeeded && (
              <div className="px-4 py-1.5 bg-emerald-50/40 border-b border-emerald-200/60 text-[10px] text-emerald-900 font-mono flex items-center justify-between">
                <span>
                  <strong>SETPOINTS QUY ĐỔI THEO MẺ HIỆN TẠI ({activeCampaignBatch}/{campaignBatchCount}):</strong> {equalizedBatchVolume.toFixed(2)} L
                </span>
                <span className="text-slate-500 font-semibold">
                  Tổng đơn ERP: {orderVolume.toFixed(1)} L
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[10px] uppercase">
                    <th className="py-2 px-2.5">THÔNG SỐ / PHA</th>
                    <th className="py-2 px-2 text-center">SP (CÔNG THỨC)</th>
                    <th className="py-2 px-2 text-center">PV PHẦN CỨNG</th>
                    <th className="py-2 px-2 text-center">PV SIMIT TWIN</th>
                    <th className="py-2 px-2 text-center">SAI SỐ Δ SP / TWIN</th>
                    <th className="py-2 px-2 text-center">TRẠNG THÁI (SP vs PV)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-[11px]">
                  {(() => {
                    const currentVolume = activeOrder?.volume || 1000.0;
                    const effectiveBatchVolume = isCampaignNeeded ? equalizedBatchVolume : currentVolume;

                    const matchedRecipe = (recipes && recipes.length > 0)
                      ? (recipes.find((r) => r.name === activeOrder?.recipeName || r.code === activeOrder?.recipeName) || recipes[0])
                      : null;
                    const params = matchedRecipe?.parameters || [];

                    const milkParam = params.find((p) => p.phaseId === 'PH_SUPPLYMILK' || p.phaseId === 'PH_DOSING_MILK' || /milk|sữa/i.test(p.parameterName || ''));
                    const sugarParam = params.find((p) => p.phaseId === 'PH_SUPPLYSUGAR' || p.phaseId === 'PH_DOSING_SUGAR' || /sugar|đường/i.test(p.parameterName || ''));
                    const additiveParam = params.find((p) => p.phaseId === 'PH_SUPPLYADDITIVE' || p.phaseId === 'PH_DOSING_ADDITIVE' || /additive|phụ gia/i.test(p.parameterName || ''));
                    const heatParam = params.find((p) => p.phaseId === 'PH_HEAT' || p.phaseId === 'PH_HEATING' || /temp|nhiệt|steril/i.test(p.parameterName || '') || p.unit === '°C');
                    const coolParam = params.find((p) => p.phaseId === 'PH_CHILL' || p.phaseId === 'PH_COOLING' || /cool|làm lạnh/i.test(p.parameterName || ''));
                    const agitatorParam = params.find((p) => p.phaseId === 'PH_AGITATE' || /agit|khuấy|rpm/i.test(p.parameterName || '') || p.unit === 'RPM');

                    const milkPct = milkParam ? (Number(milkParam.targetSetpoint ?? milkParam.targetValue ?? milkParam.percentage) || 70.0) : 70.0;
                    const sugarPct = sugarParam ? (Number(sugarParam.targetSetpoint ?? sugarParam.targetValue ?? sugarParam.percentage) || 20.0) : 20.0;
                    const additivePct = additiveParam ? (Number(additiveParam.targetSetpoint ?? additiveParam.targetValue ?? additiveParam.percentage) || 10.0) : 10.0;

                    // When campaign load equalization is active, calculate SP strictly against effectiveBatchVolume (e.g. 4.50L)
                    const milkSp = isCampaignNeeded
                      ? parseFloat(((effectiveBatchVolume * milkPct) / 100).toFixed(2))
                      : (activeOrder?.setpoints?.milkSp ?? parseFloat(((currentVolume * milkPct) / 100).toFixed(1)));
                    const sugarSp = isCampaignNeeded
                      ? parseFloat(((effectiveBatchVolume * sugarPct) / 100).toFixed(2))
                      : (activeOrder?.setpoints?.sugarSp ?? parseFloat(((currentVolume * sugarPct) / 100).toFixed(1)));
                    const additiveSp = isCampaignNeeded
                      ? parseFloat(((effectiveBatchVolume * additivePct) / 100).toFixed(2))
                      : (activeOrder?.setpoints?.additiveSp ?? parseFloat(((currentVolume * additivePct) / 100).toFixed(1)));
                    const heatSp = activeOrder?.setpoints?.tempHotSp ?? (heatParam ? Number(heatParam.targetSetpoint ?? heatParam.targetValue) : (matchedRecipe?.tempHot || 138.0));
                    const coolSp = activeOrder?.setpoints?.tempColdSp ?? (coolParam ? Number(coolParam.targetSetpoint ?? coolParam.targetValue) : (matchedRecipe?.tempCold || 4.0));
                    const agitatorSp = agitatorParam ? Number(agitatorParam.targetSetpoint ?? agitatorParam.targetValue) : 1200.0;

                    const calcTolerance = (unit: string, spVal: number): number => {
                      if (unit === '°C') return 2.0;
                      if (unit === 'RPM') return Math.max(25.0, Number((Math.abs(spVal) * 0.02).toFixed(1)));
                      return Math.max(0.05, Number((Math.abs(spVal) * 0.02).toFixed(3)));
                    };

                    const calcSpStatus = (c1: boolean, pvH: number | null, spVal: number, tol: number): SpTrackingStatus => {
                      if (!c1 || pvH === null || Number.isNaN(pvH)) return 'UNMAPPED';
                      const absDeltaSp = Math.abs(pvH - spVal);
                      if (spVal > 0 && absDeltaSp <= tol) return 'MATCHED (IN TOLERANCE)';
                      if (pvH > spVal + tol) return 'DEVIATING / OVERSHOOT';
                      if (currentBatchState === 'RUNNING' && pvH < spVal - tol) return 'RAMPING / DOSING';
                      return 'DEVIATING / OVERSHOOT';
                    };

                    const buildFallbackRow = (
                      id: string,
                      name: string,
                      phase: string,
                      unit: string,
                      spVal: number,
                      fullScale: number,
                      pvH: number | null,
                      pvS: number | null,
                      c1: boolean,
                      c2: boolean
                    ): DigitalTwinDeviationRow => {
                      const tol = calcTolerance(unit, spVal);
                      const deltaSp = c1 && pvH !== null ? Number((pvH - spVal).toFixed(2)) : null;
                      const absDeltaSp = deltaSp !== null ? Number(Math.abs(deltaSp).toFixed(2)) : null;
                      const deltaTwin = c1 && c2 && pvH !== null && pvS !== null ? Number(Math.abs(pvH - pvS).toFixed(2)) : null;
                      const denom = Math.max(Math.abs(spVal), Math.abs(fullScale), 1.0);
                      const paramFidelity = deltaTwin !== null
                        ? Number(Math.max(0.0, 100.0 - (deltaTwin / denom) * 100.0).toFixed(1))
                        : null;
                      const spStatus = calcSpStatus(c1, pvH, spVal, tol);
                      const twinStatus: TwinSyncStatus = deltaTwin === null
                        ? 'UNMAPPED'
                        : deltaTwin <= tol
                        ? 'TWIN_SYNCHRONIZED'
                        : 'TWIN_DRIFT';

                      return {
                        id,
                        name,
                        phase,
                        unit,
                        sp: spVal,
                        pvHardware: pvH,
                        pvSimit: pvS,
                        delta: absDeltaSp ?? deltaTwin,
                        deltaSp,
                        absDeltaSp,
                        deltaTwin,
                        tolerance: tol,
                        status: spStatus,
                        spTrackingStatus: spStatus,
                        twinSyncStatus: twinStatus,
                        parameterFidelity: paramFidelity,
                        c1Mapped: c1,
                        c2Mapped: c2,
                      };
                    };

                    const milkPvH = getOpsTag('cell1.Milk_PV', 'Milk_PV')?.value != null ? Number(getOpsTag('cell1.Milk_PV', 'Milk_PV')?.value) : null;
                    const milkPvS = getOpsTag('cell2_simit.Milk_PV')?.value != null ? Number(getOpsTag('cell2_simit.Milk_PV')?.value) : null;
                    const milkC1 = Boolean(getOpsTag('cell1.Milk_PV', 'Milk_PV')?.node_id);
                    const milkC2 = Boolean(getOpsTag('cell2_simit.Milk_PV')?.node_id);

                    const sugarPvH = getOpsTag('cell1.Sugar_PV', 'Sugar_PV')?.value != null ? Number(getOpsTag('cell1.Sugar_PV', 'Sugar_PV')?.value) : null;
                    const sugarPvS = getOpsTag('cell2_simit.Sugar_PV')?.value != null ? Number(getOpsTag('cell2_simit.Sugar_PV')?.value) : null;
                    const sugarC1 = Boolean(getOpsTag('cell1.Sugar_PV', 'Sugar_PV')?.node_id);
                    const sugarC2 = Boolean(getOpsTag('cell2_simit.Sugar_PV')?.node_id);

                    const addPvH = getOpsTag('cell1.Additive_PV', 'Additive_PV')?.value != null ? Number(getOpsTag('cell1.Additive_PV', 'Additive_PV')?.value) : null;
                    const addPvS = getOpsTag('cell2_simit.Additive_PV')?.value != null ? Number(getOpsTag('cell2_simit.Additive_PV')?.value) : null;
                    const addC1 = Boolean(getOpsTag('cell1.Additive_PV', 'Additive_PV')?.node_id);
                    const addC2 = Boolean(getOpsTag('cell2_simit.Additive_PV')?.node_id);

                    const heatPvH = getOpsTag('cell1.Heating_PV', 'uht_temp_pv', 'pc1_uht_temp_pv')?.value != null ? Number(getOpsTag('cell1.Heating_PV', 'uht_temp_pv', 'pc1_uht_temp_pv')?.value) : null;
                    const heatPvS = getOpsTag('cell2_simit.Heating_PV', 'pc2_simit_uht_temp_pv')?.value != null ? Number(getOpsTag('cell2_simit.Heating_PV', 'pc2_simit_uht_temp_pv')?.value) : null;
                    const heatC1 = Boolean(getOpsTag('cell1.Heating_PV', 'uht_temp_pv', 'pc1_uht_temp_pv')?.node_id);
                    const heatC2 = Boolean(getOpsTag('cell2_simit.Heating_PV', 'pc2_simit_uht_temp_pv')?.node_id);

                    const coolPvH = getOpsTag('cell1.Cooling_PV', 'cooling_temp_pv')?.value != null ? Number(getOpsTag('cell1.Cooling_PV', 'cooling_temp_pv')?.value) : null;
                    const coolPvS = getOpsTag('cell2_simit.Cooling_PV')?.value != null ? Number(getOpsTag('cell2_simit.Cooling_PV')?.value) : null;
                    const coolC1 = Boolean(getOpsTag('cell1.Cooling_PV', 'cooling_temp_pv')?.node_id);
                    const coolC2 = Boolean(getOpsTag('cell2_simit.Cooling_PV')?.node_id);

                    const agitPvH = getOpsTag('cell1.Agitator_PV', 'agitator_speed_pv')?.value != null ? Number(getOpsTag('cell1.Agitator_PV', 'agitator_speed_pv')?.value) : null;
                    const agitPvS = getOpsTag('cell2_simit.Agitator_PV')?.value != null ? Number(getOpsTag('cell2_simit.Agitator_PV')?.value) : null;
                    const agitC1 = Boolean(getOpsTag('cell1.Agitator_PV', 'agitator_speed_pv')?.node_id);
                    const agitC2 = Boolean(getOpsTag('cell2_simit.Agitator_PV')?.node_id);

                    const fallbackRows: DigitalTwinDeviationRow[] = [
                      buildFallbackRow('milk', 'Cấp sữa tươi (Milk Dosing)', 'PH_SUPPLYMILK', 'L', milkSp, 5.0, milkPvH, milkPvS, milkC1, milkC2),
                      buildFallbackRow('sugar', 'Định lượng đường (Sugar Dosing)', 'PH_SUPPLYSUGAR', 'kg', sugarSp, 5.0, sugarPvH, sugarPvS, sugarC1, sugarC2),
                      buildFallbackRow('additive', 'Vi chất dinh dưỡng (Additive)', 'PH_SUPPLYADDITIVE', 'L', additiveSp, 5.0, addPvH, addPvS, addC1, addC2),
                      buildFallbackRow('heat', 'Tiệt trùng UHT (Sterilization Temp)', 'PH_HEAT', '°C', heatSp, 150.0, heatPvH, heatPvS, heatC1, heatC2),
                      buildFallbackRow('cool', 'Làm lạnh vô trùng (Cooling Temp)', 'PH_CHILL', '°C', coolSp, 100.0, coolPvH, coolPvS, coolC1, coolC2),
                      buildFallbackRow('agitator', 'Tốc độ cánh khuấy (Agitator Speed)', 'PH_AGITATE', 'RPM', agitatorSp, 1500.0, agitPvH, agitPvS, agitC1, agitC2),
                    ];

                    const rows = (deviationMatrix && deviationMatrix.length > 0) ? deviationMatrix : fallbackRows;

                    return rows.map((item) => {
                      const tol = item.tolerance ?? calcTolerance(item.unit, item.sp);
                      const deltaSpVal = item.deltaSp !== undefined && item.deltaSp !== null
                        ? item.deltaSp
                        : (item.c1Mapped && item.pvHardware !== null ? Number((item.pvHardware - item.sp).toFixed(2)) : null);
                      const absDeltaSpVal = deltaSpVal !== null ? Math.abs(deltaSpVal) : null;
                      const deltaTwinVal = item.deltaTwin !== undefined && item.deltaTwin !== null
                        ? item.deltaTwin
                        : (item.c1Mapped && item.c2Mapped && item.pvHardware !== null && item.pvSimit !== null
                            ? Number(Math.abs(item.pvHardware - item.pvSimit).toFixed(2))
                            : null);
                      const paramFidelity = item.parameterFidelity !== undefined && item.parameterFidelity !== null
                        ? item.parameterFidelity
                        : (deltaTwinVal !== null
                            ? Number(Math.max(0.0, 100.0 - (deltaTwinVal / Math.max(Math.abs(item.sp), 1.0)) * 100.0).toFixed(1))
                            : null);

                      // Strict 4-tier evaluation on the frontend as well so no false MATCHED badge can ever render
                      const spStatus: SpTrackingStatus = item.spTrackingStatus
                        ? item.spTrackingStatus
                        : calcSpStatus(item.c1Mapped, item.pvHardware, item.sp, tol);

                      const twinSync: TwinSyncStatus = item.twinSyncStatus
                        ? item.twinSyncStatus
                        : (deltaTwinVal === null ? 'UNMAPPED' : deltaTwinVal <= tol ? 'TWIN_SYNCHRONIZED' : 'TWIN_DRIFT');

                      const rowTagMap: Record<string, { primary: string; aliases: string[]; simit: string }> = {
                        milk: { primary: 'cell1.Milk_PV', aliases: ['Milk_PV'], simit: 'cell2_simit.Milk_PV' },
                        sugar: { primary: 'cell1.Sugar_PV', aliases: ['Sugar_PV'], simit: 'cell2_simit.Sugar_PV' },
                        additive: { primary: 'cell1.Additive_PV', aliases: ['Additive_PV'], simit: 'cell2_simit.Additive_PV' },
                        heat: { primary: 'cell1.Heating_PV', aliases: ['uht_temp_pv', 'pc1_uht_temp_pv'], simit: 'cell2_simit.Heating_PV' },
                        cool: { primary: 'cell1.Cooling_PV', aliases: ['cooling_temp_pv'], simit: 'cell2_simit.Cooling_PV' },
                        agitator: { primary: 'cell1.Agitator_PV', aliases: ['agitator_speed_pv'], simit: 'cell2_simit.Agitator_PV' },
                      };
                      const tagMappingInfo = rowTagMap[item.id] || { primary: `cell1.${item.id}_PV`, aliases: [], simit: `cell2_simit.${item.id}_PV` };

                      return (
                        <tr
                          key={item.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            setDragOverSlot(`dev:${item.id}`);
                          }}
                          onDragLeave={() => {
                            if (dragOverSlot === `dev:${item.id}`) setDragOverSlot(null);
                          }}
                          onDrop={(e) =>
                            handleDropOnOpsSlot(
                              e,
                              tagMappingInfo.primary,
                              tagMappingInfo.aliases,
                              item.name,
                              item.unit
                            )
                          }
                          className={`transition-colors ${
                            dragOverSlot === `dev:${item.id}`
                              ? 'ring-2 ring-emerald-500 bg-emerald-50/70'
                              : 'hover:bg-slate-50'
                          }`}
                          title={`Thả Tag Kepware vào dòng này để gán PV Phần cứng cho [${item.name}]`}
                        >
                          <td className="py-2.5 px-2.5">
                            <div className="font-bold text-slate-900 leading-tight">{item.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {item.phase} · <span className="font-semibold text-slate-600">Tol: ±{tol} {item.unit}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-blue-700 tabular-nums">
                            {item.sp.toFixed(2)} {item.unit}
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-slate-900 tabular-nums">
                            {item.c1Mapped && item.pvHardware !== null ? (
                              `${item.pvHardware.toFixed(2)} ${item.unit}`
                            ) : (
                              <span className="text-slate-400 font-normal">--</span>
                            )}
                          </td>
                          <td
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'copy';
                              setDragOverSlot(`dev-simit:${item.id}`);
                            }}
                            onDragLeave={() => {
                              if (dragOverSlot === `dev-simit:${item.id}`) setDragOverSlot(null);
                            }}
                            onDrop={(e) =>
                              handleDropOnOpsSlot(
                                e,
                                tagMappingInfo.simit,
                                [],
                                `${item.name} (SIMIT Twin)`,
                                item.unit
                              )
                            }
                            className={`py-2.5 px-2 text-center font-bold text-slate-900 tabular-nums transition-all ${
                              dragOverSlot === `dev-simit:${item.id}`
                                ? 'ring-2 ring-emerald-500 bg-emerald-100/70'
                                : ''
                            }`}
                            title={`Thả Tag Kepware vào ô này để gán PV SIMIT Digital Twin cho [${item.name}]`}
                          >
                            {item.c2Mapped && item.pvSimit !== null ? (
                              `${item.pvSimit.toFixed(2)} ${item.unit}`
                            ) : (
                              <span className="text-slate-400 font-normal">--</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono tabular-nums">
                            {deltaSpVal !== null ? (
                              <div className="space-y-0.5">
                                <div className={`font-bold text-[10.5px] ${
                                  absDeltaSpVal! <= tol
                                    ? 'text-emerald-700'
                                    : deltaSpVal > tol
                                    ? 'text-rose-700'
                                    : 'text-sky-700'
                                }`}>
                                  ΔSP: {deltaSpVal > 0 ? `+${deltaSpVal.toFixed(2)}` : deltaSpVal.toFixed(2)} {item.unit}
                                </div>
                                {deltaTwinVal !== null && paramFidelity !== null ? (
                                  <div className="text-[9.5px] text-slate-600">
                                    Twin: <span className={twinSync === 'TWIN_SYNCHRONIZED' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>{paramFidelity.toFixed(1)}%</span> (Δ={deltaTwinVal.toFixed(2)})
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-slate-400">Twin: UNMAPPED</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              {spStatus === 'UNMAPPED' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 border border-slate-300 font-bold text-[9.5px] whitespace-nowrap">
                                  ○ UNMAPPED
                                </span>
                              ) : spStatus === 'MATCHED (IN TOLERANCE)' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[9.5px] whitespace-nowrap">
                                  ● MATCHED (IN TOL)
                                </span>
                              ) : spStatus === 'RAMPING / DOSING' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-800 border border-sky-300 font-bold text-[9.5px] whitespace-nowrap">
                                  ↗ RAMPING / DOSING
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-300 font-bold text-[9.5px] whitespace-nowrap">
                                  ▲ DEVIATING / OVERSHOOT
                                </span>
                              )}
                              {twinSync === 'TWIN_SYNCHRONIZED' && (
                                <span className="text-[8.5px] font-bold text-emerald-700 uppercase">
                                  ✓ TWIN_SYNCHRONIZED
                                </span>
                              )}
                              {twinSync === 'TWIN_DRIFT' && (
                                <span className="text-[8.5px] font-bold text-amber-700 uppercase">
                                  ! TWIN_DRIFT
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* =======================================================
              BOTTOM BENCHMARK SUMMARY CARD
             ======================================================= */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-900 uppercase text-[11px] tracking-wider">
                  BẢNG SO SÁNH BENCHMARK SIMIT DIGITAL TWIN
                </span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-700 border border-slate-300">
                {executionMode === 'mode3_dual' ? 'DUAL-RUN ACTIVE' : executionMode.toUpperCase()}
              </span>
            </div>

            {/* Metric Row 1: Cycle Time Comparison */}
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="p-2 bg-white border border-slate-200">
                <div className="text-[9px] text-slate-500 uppercase font-semibold">T_Hardware (Cell 1)</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {benchmarkSummary?.tHardwareFormatted || (cell1Duration !== '--' ? cell1Duration : '--')}
                </div>
                <div className="text-[9px] text-slate-400">
                  {cell1Complete ? 'Hoàn tất' : currentBatchState === 'RUNNING' ? 'Đang chạy...' : 'Chờ lệnh'}
                </div>
              </div>

              <div className="p-2 bg-white border border-slate-200">
                <div className="text-[9px] text-slate-500 uppercase font-semibold">T_SIMIT (Cell 2 Twin)</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {benchmarkSummary?.tSimitFormatted || (cell2Duration !== '--' ? cell2Duration : '--')}
                </div>
                <div className="text-[9px] text-slate-400">
                  {cell2Complete ? 'Hoàn tất' : currentBatchState === 'RUNNING' ? 'Đang chạy...' : 'Chờ lệnh'}
                </div>
              </div>

              <div className="p-2 bg-white border border-slate-200">
                <div className="text-[9px] text-slate-500 uppercase font-semibold">Độ lệch chu kỳ (Δ T)</div>
                <div className="text-sm font-bold text-indigo-700 mt-0.5">
                  {benchmarkSummary?.deltaTFormatted || '--'}
                </div>
                <div className="text-[9px] text-slate-400">|T_HW - T_SIMIT|</div>
              </div>
            </div>

            {/* Metric Row 2: Model Fidelity Index & SP Tracking Summary */}
            <div className="p-2 bg-white border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">
                  Twin Model Fidelity Index (|PV_PLC - PV_SIMIT|)
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                  Twin Sync: <strong className="text-slate-800">{benchmarkSummary?.synchronizedParameters ?? 0}/{benchmarkSummary?.mappedTwinParameters ?? 0}</strong> | SP Matched: <strong className="text-slate-800">{benchmarkSummary?.matchedParameters ?? 0}/{benchmarkSummary?.mappedParameters ?? 0}</strong>
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-base font-extrabold text-emerald-700">
                  {benchmarkSummary?.fidelityIndex != null ? `${benchmarkSummary.fidelityIndex.toFixed(1)}%` : '--'}
                </span>
                <div className="text-[9px] text-slate-400 font-bold uppercase">
                  {benchmarkSummary?.fidelityIndex != null && benchmarkSummary.fidelityIndex >= 90 ? 'TWIN SYNCHRONIZED' : 'CALIBRATING'}
                </div>
              </div>
            </div>

            {/* Quick Validation / Simulation Trigger Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-200">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => completeCellSimulation('cell2')}
                  disabled={cell2Complete || currentBatchState !== 'RUNNING'}
                  className="h-7 px-2 bg-white hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 text-slate-800 text-[10px] font-bold border border-slate-300 flex items-center gap-1 active:translate-y-px transition-none hallmark-focus"
                  title="Mô phỏng sự kiện SIMIT Digital Twin hoàn thành chu trình trước"
                >
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>XÁC NHẬN SIMIT XONG</span>
                </button>
                <button
                  type="button"
                  onClick={() => completeCellSimulation('cell1')}
                  disabled={cell1Complete || currentBatchState !== 'RUNNING'}
                  className="h-7 px-2 bg-white hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 text-slate-800 text-[10px] font-bold border border-slate-300 flex items-center gap-1 active:translate-y-px transition-none hallmark-focus"
                  title="Mô phỏng sự kiện Phần cứng S7-1500 báo Flag_Complete = True"
                >
                  <Check className="w-3 h-3 text-sky-600" />
                  <span>XÁC NHẬN HW XONG</span>
                </button>
              </div>
              <div className="text-[9px] text-slate-400 uppercase">
                ISA-88 PART 1 · SIEMENS SIMIT TWIN
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =======================================================================
          INDUSTRIAL AI IN-FLIGHT DOSING OFFSET & CPK ADVISOR (HUMAN-IN-THE-LOOP)
         ======================================================================= */}
      <div className="bg-white border border-slate-200 shadow-xs font-mono text-xs">
        {/* Panel Header */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <div>
              <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                AI IN-FLIGHT DOSING OFFSET & CPK ADVISOR (HUMAN-IN-THE-LOOP)
              </span>
              <span className="text-[10px] text-slate-500 block">
                Tối ưu hóa thời gian ngắt sớm van khí nén (Pre-Act Cut-Off) dựa trên mô hình toán quán tính vật liệu rơi tự do
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {aiAdvisor && (
              <span className={`px-2 py-0.5 text-[10px] font-bold border uppercase ${
                aiAdvisor.global_status === 'OPTIMAL_SIX_SIGMA'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              }`}>
                {aiAdvisor.global_status === 'OPTIMAL_SIX_SIGMA' ? '● SIX SIGMA CPK ≥ 1.33' : '⚠ CẦN BÙ TRỪ QUÁN TÍNH'}
              </span>
            )}
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold">
              ĐỘ TIN CẬY: 98% (SPC GAUSS)
            </span>
            <button
              type="button"
              onClick={() => setIsAiAdvisorExpanded(!isAiAdvisorExpanded)}
              className="h-7 px-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold flex items-center gap-1 active:translate-y-px transition-none"
            >
              {isAiAdvisorExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                  <span>Thu gọn</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>Mở rộng</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Success Toast Banner */}
        {aiNotification && (
          <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-300 text-emerald-950 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold">{aiNotification}</span>
            </div>
            <span className="text-[10px] text-emerald-800">ISO 9001 / HACCP COMPLIANT</span>
          </div>
        )}

        {/* Collapsible Panel Content */}
        {isAiAdvisorExpanded && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(aiAdvisor?.channels || []).map((ch) => {
                const isApplying = applyingOffsetChannel === ch.channel_id;
                const isOptimal = ch.cpk >= 1.33;
                const hasAppliedOffset = Math.abs(ch.active_applied_offset_kg) > 0.001;

                return (
                  <div
                    key={ch.channel_id}
                    className={`border p-4 flex flex-col justify-between space-y-3 transition-colors ${
                      isOptimal
                        ? 'bg-emerald-50/20 border-emerald-300'
                        : ch.status === 'OUT_OF_SPEC'
                        ? 'bg-rose-50/30 border-rose-300'
                        : 'bg-amber-50/20 border-amber-300'
                    }`}
                  >
                    {/* Header */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">
                          {ch.channel_id}
                        </span>
                        <span className={`px-1.5 py-0.2 text-[9.5px] font-bold border uppercase ${
                          isOptimal
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : ch.status === 'OUT_OF_SPEC'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {ch.status}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-700 mt-0.5 truncate" title={ch.channel_name}>
                        {ch.channel_name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Mã NVL: <strong className="text-slate-800">{ch.material_code}</strong> · Target SP: <strong className="text-slate-800">{ch.target_sp} {ch.unit}</strong>
                      </div>
                    </div>

                    {/* Metrics Body */}
                    <div className="space-y-2 py-2 border-y border-dashed border-slate-200 text-[11px]">
                      {/* Cpk Index */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Chỉ số Năng lực (Cpk):</span>
                        <span className={`text-base font-bold tabular-nums ${
                          isOptimal ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {ch.cpk.toFixed(2)}
                        </span>
                      </div>

                      {/* Mean Error */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Sai số quán tính (ē):</span>
                        <span className={`font-bold tabular-nums ${
                          ch.mean_error_kg > 0 ? 'text-amber-700' : 'text-slate-800'
                        }`}>
                          {ch.mean_error_kg > 0 ? `+${ch.mean_error_kg.toFixed(3)}` : ch.mean_error_kg.toFixed(3)} {ch.unit}
                        </span>
                      </div>

                      {/* Standard Deviation */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Độ lệch chuẩn (σ):</span>
                        <span className="text-slate-700 tabular-nums">±{ch.std_dev_kg.toFixed(3)} {ch.unit}</span>
                      </div>

                      {/* Tolerance Band */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Dải dung sai (±{ch.tolerance_percent}%):</span>
                        <span className="text-slate-700 font-mono">[{ch.lsl} .. {ch.usl}]</span>
                      </div>

                      {/* Active Offset */}
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200">
                        <span className="text-slate-500">Bù trừ đang áp dụng:</span>
                        <span className="font-bold text-slate-800 tabular-nums">
                          {hasAppliedOffset ? `${ch.active_applied_offset_kg > 0 ? '+' : ''}${ch.active_applied_offset_kg} ${ch.unit}` : '0.000 (Chưa bù)'}
                        </span>
                      </div>
                    </div>

                    {/* Recommended Offset & Action */}
                    <div className="space-y-2">
                      <div className="p-2 bg-white border border-slate-200 text-[10.5px]">
                        <span className="text-slate-500 block text-[9.5px]">Khuyến nghị Pre-Act Trim (AI):</span>
                        <span className="font-bold text-sky-800 text-xs">
                          {ch.recommended_offset_kg > 0 ? `+${ch.recommended_offset_kg}` : ch.recommended_offset_kg} {ch.unit}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          (Đóng sớm van trước điểm cắt {Math.abs(ch.recommended_offset_kg)} {ch.unit})
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={isApplying || (isOptimal && Math.abs(ch.recommended_offset_kg) < 0.05)}
                        onClick={() => handleApplyDosingOffset(ch)}
                        className={`w-full h-8 px-2 text-[10px] font-bold uppercase tracking-wider border flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-1 active:translate-y-px transition-none ${
                          isOptimal && Math.abs(ch.recommended_offset_kg) < 0.05
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 cursor-default'
                            : 'bg-sky-600 hover:bg-sky-700 text-white border-sky-700 disabled:opacity-50'
                        }`}
                      >
                        {isApplying ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Đang áp dụng...</span>
                          </>
                        ) : isOptimal && Math.abs(ch.recommended_offset_kg) < 0.05 ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span>ĐÃ BÙ TRỪ CHUẨN (Cpk ≥ 1.33)</span>
                          </>
                        ) : (
                          <>
                            <Sliders className="w-3 h-3" />
                            <span>✔ Phê duyệt Bù trừ (HITL)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scientific Explanation Footnote */}
            <div className="p-3 bg-slate-50 border border-slate-200 text-[10.5px] text-slate-500 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-600" />
                <span>
                  <strong>Nguyên lý Vật lý:</strong> Vật liệu trong không gian giữa miệng van xả và mặt cân rơi tự do (In-Flight Fall) gây sai số vượt ngưỡng (Overshoot). Thuật toán AI tính toán thời điểm ngắt sớm (Pre-Act Cut-Off SP = SP + Offset) để triệt tiêu quán tính.
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">
                TUÂN THỦ: ISA-88.01 BATCH CONTROL & ISO 22000 CCP TOLERANCE
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 21 CFR Part 11 Electronic Signature Modal */}
      <ESignatureModal
        isOpen={isEsignOpen}
        onClose={() => setIsEsignOpen(false)}
        onSuccess={async () => {
          await executeBatchCommand('DOWNLOAD');
        }}
        actionName="SCADA_DOWNLOAD"
        fieldName="RECIPE_DISPATCH"
        oldValue="IDLE_BUFFER"
        newValue={activeOrder ? `${activeOrder.recipeName} -> ${targetProcessLine}` : targetProcessLine}
        defaultMeaning="Responsibility"
        detail={activeOrder ? `Transmitted recipe setpoints for work order [${activeOrder.orderName}] to Kepware controller buffer` : 'Transmitted recipe setpoints to SCADA buffer'}
      />

      {/* Dedicated Operations Tag Mapping Modal: Strict Empty-Baseline & Incremental Persistence */}
      <OperationsTagMappingModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        onSaved={fetchOpsTags}
      />
    </div>
  );
};

export default BatchDispatcher;
