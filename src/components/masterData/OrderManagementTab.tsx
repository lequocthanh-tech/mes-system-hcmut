/* Hallmark · component: OrderManagementTab · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  useMasterData,
  calculateControlRecipeSetpoints,
  calculatePmControlJobSummary
} from '../../context/MasterDataContext';
import { useConfig } from '../../context/ConfigContext';
import { useIsa88 } from '../../context/Isa88Context';
import { useOperations } from '../../context/OperationsContext';
import { 
  ClipboardList, 
  Send, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Droplet, 
  Thermometer, 
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Scale,
  Calculator
} from 'lucide-react';
import { searchOrders, OrderSearchParams } from '../../services/api';
import { WorkOrder } from '../../types/masterData';

const useSafeConfig = () => {
  try {
    return useConfig();
  } catch {
    return null;
  }
};

export const OrderManagementTab: React.FC = () => {
  const { 
    workOrders, 
    customers, 
    recipes, 
    addWorkOrder, 
    deleteWorkOrder,
    dispatchWorkOrder,
    refetchData
  } = useMasterData();

  const config = useSafeConfig();
  const sqlOnline = config?.sqlConfig?.connectionState === 'connected';

  // Resilient initial fetch with exponential backoff & SQL online listener
  useEffect(() => {
    let isMounted = true;
    const fetchWithRetry = async (retries = 3, delay = 1000) => {
      try {
        await refetchData();
      } catch (err) {
        if (retries > 0 && isMounted) {
          setTimeout(() => fetchWithRetry(retries - 1, Math.round(delay * 1.5)), delay);
        }
      }
    };

    fetchWithRetry();
    return () => {
      isMounted = false;
    };
  }, [sqlOnline]);


  const { telemetryMap, gatewayConnected } = useIsa88();
  const { cipStatus } = useOperations();

  // Strict Quality Gate: Released Recipes Only (Case-Insensitive)
  const releasedRecipes = useMemo(() => {
    return recipes.filter((r) => (r.status || '').toUpperCase() === 'RELEASED');
  }, [recipes]);

  // Form State
  const [formData, setFormData] = useState<{
    orderId: string;
    customerId: number;
    recipeId: number;
    volume: number;
    scheduledStartTime: string;
  }>({
    orderId: `WO-${new Date().getFullYear()}-00${workOrders.length + 1}`,
    customerId: customers[0]?.id || 1,
    recipeId: releasedRecipes[0]?.id || recipes[0]?.id || 1,
    volume: 1000,
    scheduledStartTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
  });

  // Auto-align selected recipe in form with released recipe when recipes are approved
  useEffect(() => {
    if (releasedRecipes.length > 0) {
      const current = recipes.find((r) => r.id === formData.recipeId);
      if (!current || (current.status || '').toUpperCase() !== 'RELEASED') {
        setFormData((prev) => ({ ...prev, recipeId: releasedRecipes[0].id }));
      }
    }
  }, [releasedRecipes, recipes]);

  // Selected Order for detail inspection in table
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(workOrders[0]?.id || 1);

  // Notification State
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  // Historical Search & Filter State
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [enableDateFilter, setEnableDateFilter] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7days' | 'this_month'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [filteredOrders, setFilteredOrders] = useState<WorkOrder[] | null>(null);

  const displayOrders = useMemo(() => {
    return filteredOrders !== null ? filteredOrders : workOrders;
  }, [filteredOrders, workOrders]);

  const handlePresetChange = (preset: 'all' | 'today' | '7days' | 'this_month') => {
    setDatePreset(preset);
    setEnableDateFilter(true);
    const now = new Date();
    const formatYMD = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'today') {
      const todayStr = formatYMD(now);
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setFromDate(formatYMD(past));
      setToDate(formatYMD(now));
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFromDate(formatYMD(firstDay));
      setToDate(formatYMD(lastDay));
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const handleExecuteFilter = async () => {
    setIsSearching(true);
    try {
      const params: OrderSearchParams = {};
      if (searchKeyword.trim()) {
        params.keyword = searchKeyword.trim();
      }
      if (enableDateFilter) {
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
      }
      if (statusFilter && statusFilter !== 'All') {
        params.status = statusFilter;
      }

      const results = await searchOrders(params);
      setFilteredOrders(results);
    } catch (err: any) {
      console.warn('[OrderManagementTab] Backend search endpoint error, using local fallback:', err);
      // Resilient Client-Side Fallback Filtering
      const kw = searchKeyword.trim().toLowerCase();
      const localFiltered = workOrders.filter((wo) => {
        if (kw) {
          const matchCode = (wo.orderId || '').toLowerCase().includes(kw);
          const matchCust = (wo.customerName || '').toLowerCase().includes(kw) || (wo.customerCode || '').toLowerCase().includes(kw);
          const matchRcp = (wo.recipeName || '').toLowerCase().includes(kw) || (wo.recipeCode || '').toLowerCase().includes(kw);
          if (!matchCode && !matchCust && !matchRcp) return false;
        }
        if (statusFilter && statusFilter !== 'All') {
          if ((wo.status || '').toUpperCase() !== statusFilter.toUpperCase()) return false;
        }
        if (enableDateFilter) {
          const rawDate = (wo.scheduledStartTime || wo.startTime || '').substring(0, 10);
          if (rawDate) {
            if (fromDate && rawDate < fromDate) return false;
            if (toDate && rawDate > toDate) return false;
          }
        }
        return true;
      });
      setFilteredOrders(localFiltered);
      showNotification('info', 'Chế độ ngoại tuyến: Đã áp dụng bộ lọc đơn hàng cục bộ.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleResetFilters = () => {
    setSearchKeyword('');
    setEnableDateFilter(false);
    setFromDate('');
    setToDate('');
    setDatePreset('all');
    setStatusFilter('All');
    setFilteredOrders(null);
  };

  // Currently selected recipe from form
  const selectedRecipe = useMemo(() => {
    return recipes.find((r) => r.id === formData.recipeId) || releasedRecipes[0] || recipes[0];
  }, [recipes, formData.recipeId, releasedRecipes]);

  // Dynamic Control Recipe Setpoint Calculation & Siemens PM-CONTROL Sec. 5.8 Job Summary
  const dynamicSetpoints = useMemo(() => {
    if (!selectedRecipe || !formData.volume) return [];
    return calculateControlRecipeSetpoints(formData.volume, selectedRecipe);
  }, [formData.volume, selectedRecipe]);

  const pmJobSummary = useMemo(() => {
    if (!selectedRecipe) return null;
    return calculatePmControlJobSummary(formData.volume || 0, selectedRecipe);
  }, [formData.volume, selectedRecipe]);

  // Selected Customer details
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === formData.customerId) || customers[0];
  }, [customers, formData.customerId]);

  // Equipment Pre-Check: Unit Mixing Live Status (ISA-88 State Matrix)
  const unitMixingState = useMemo(() => {
    const rawState = telemetryMap['Batch_State']?.value ?? telemetryMap['pc1_batch_state']?.value;
    if (rawState === undefined || rawState === null) return 'IDLE (Ready)';
    if (rawState === 0 || rawState === 'IDLE' || rawState === 'Ready') return 'IDLE (Ready)';
    if (rawState === 1 || rawState === 'RUNNING') return 'RUNNING';
    if (rawState === 2 || rawState === 'HOLDING') return 'HOLDING';
    if (rawState === 3 || rawState === 'HELD') return 'HELD';
    if (rawState === 11 || rawState === 'COMPLETE') return 'COMPLETE';
    return String(rawState);
  }, [telemetryMap]);

  // Handle Form Reset / Clear
  const handleClear = () => {
    const nextNum = workOrders.length + 1;
    setFormData({
      orderId: `WO-${new Date().getFullYear()}-${nextNum.toString().padStart(3, '0')}`,
      customerId: customers[0]?.id || 1,
      recipeId: releasedRecipes[0]?.id || recipes[0]?.id || 1,
      volume: 1000,
      scheduledStartTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
    });
  };

  // Handle Create Work Order
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRecipe) {
      showNotification('error', 'Please select a valid Master Recipe.');
      return;
    }

    // Strict Quality Gate Verification
    if ((selectedRecipe.status || '').toUpperCase() !== 'RELEASED') {
      showNotification('error', `Quality Gate Rejection: Recipe [${selectedRecipe.code}] is in ${selectedRecipe.status} state. Only RELEASED recipes can be dispatched into production.`);
      return;
    }

    if (formData.volume <= 0) {
      showNotification('error', 'Target Batch Volume must be greater than 0 Liters.');
      return;
    }

    const calculated = calculateControlRecipeSetpoints(formData.volume, selectedRecipe);

    try {
      const success = await addWorkOrder({
        orderId: formData.orderId.trim().toUpperCase(),
        customerId: formData.customerId,
        customerCode: selectedCustomer?.code || `CUS-${formData.customerId}`,
        customerName: selectedCustomer?.name || 'Standard Client',
        recipeId: selectedRecipe.id,
        recipeCode: selectedRecipe.code,
        recipeName: selectedRecipe.name,
        recipeVersion: selectedRecipe.version,
        volume: Number(formData.volume),
        quantity: Number(formData.volume),
        calculatedSetpoints: calculated,
        status: 'NEW',
        targetUnit: 'UNIT MIXING',
        scheduledStartTime: formData.scheduledStartTime,
      });

      if (success) {
        showNotification('success', `Đã tạo lệnh sản xuất ${formData.orderId.trim().toUpperCase()} thành công!`);
        handleClear();
        await refetchData();
      } else {
        showNotification('error', 'Database Write Failed: Unable to create work order');
      }
    } catch (err: any) {
      showNotification('error', `Database Write Failed: ${err?.message || 'Physical SQL Server connection failed'}`);
    }
  };

  // Dispatch to Operations
  const handleDispatch = async (woId: number) => {
    const target = displayOrders.find((w) => w.id === woId) || workOrders.find((w) => w.id === woId);
    if (!target) return;

    try {
      const success = await dispatchWorkOrder(woId);
      if (success) {
        if (filteredOrders !== null) {
          setFilteredOrders((prev) => 
            prev ? prev.map((w) => w.id === woId ? { ...w, status: 'READY' } : w) : null
          );
        }
        showNotification('success', `Đã chuyển giao đơn hàng ${target.orderId} sang hàng đợi vận hành (Operations)!`);
        await refetchData();
      } else {
        showNotification('error', 'Database Dispatch Failed: Unable to update order state');
      }
    } catch (err: any) {
      showNotification('error', `Database Dispatch Failed: ${err?.message || 'Physical SQL Server connection failed'}`);
    }
  };

  // Delete Work Order
  const handleDelete = async (woId: number) => {
    const target = displayOrders.find((w) => w.id === woId) || workOrders.find((w) => w.id === woId);
    if (!target) return;
    try {
      await deleteWorkOrder(woId);
      if (filteredOrders !== null) {
        setFilteredOrders((prev) => prev ? prev.filter((w) => w.id !== woId) : null);
      }
      showNotification('info', `Work Order [${target.orderId}] removed from schedule.`);
    } catch (err: any) {
      showNotification('error', `Database Delete Failed: ${err?.message || 'Failed to remove work order'}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-Header Industrial Strip */}
      <div className="bg-white border border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-mono tracking-tight uppercase">
              Order Dispatching & Control Recipe Generation
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              ISA-95 Level 3 Work Order Scheduling & Dynamic Control Recipe Formulation
            </p>
          </div>
        </div>

        {/* Telemetry Counter Pills */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-slate-50 border border-slate-200 px-3 py-1 flex items-center gap-2">
            <span className="text-slate-500 uppercase text-[10px]">TOTAL ORDERS:</span>
            <span className="font-bold text-slate-900">{workOrders.length}</span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-1 flex items-center gap-2">
            <span className="text-emerald-600 uppercase text-[10px]">RELEASED RECIPES:</span>
            <span className="font-bold text-emerald-800">{releasedRecipes.length}</span>
          </div>
          <div className="bg-sky-50 border border-sky-200 px-3 py-1 flex items-center gap-2">
            <span className="text-sky-600 uppercase text-[10px]">TARGET UNIT:</span>
            <span className="font-bold text-sky-800">UNIT MIXING</span>
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          role="alert"
          className={`p-3 text-xs font-mono border flex items-center justify-between gap-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : notification.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-sky-50 border-sky-300 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.type === 'info' && <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-[11px] underline hover:no-underline font-mono"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Split Top Section: Left Form & Right Real-Time Control Recipe Preview Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT CARD: Work Order Creation Form */}
        <div className="lg:col-span-6 bg-white border border-slate-200 shadow-xs">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-700" />
              <span className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider">
                Work Order Creation Form
              </span>
            </div>
            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-300 px-2 py-0.5">
              NEW BATCH DISPATCH
            </span>
          </div>

          <form onSubmit={handleCreateOrder} className="p-5 space-y-4 text-xs font-mono">
            {/* Row 1: Order ID & Target Volume */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Work Order ID *
                </label>
                <input
                  type="text"
                  required
                  value={formData.orderId}
                  onChange={(e) => setFormData({ ...formData, orderId: e.target.value.toUpperCase() })}
                  placeholder="e.g. WO-2026-001"
                  className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Target Volume (Liters) *
                </label>
                <div className="relative">
                  <Droplet className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="number"
                    min="100"
                    step="50"
                    required
                    value={formData.volume}
                    onChange={(e) => setFormData({ ...formData, volume: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full h-9 pl-8 pr-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 font-bold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Customer Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Customer Account *
              </label>
              <select
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: parseInt(e.target.value, 10) })}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name} - Priority P{c.priority}
                  </option>
                ))}
              </select>
            </div>

            {/* Row 3: Recipe Selection (Strict Quality Gate) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                  Master Recipe Selection (Strict Quality Gate) *
                </label>
                <span className="text-[10px] text-emerald-700 font-bold uppercase">
                  ✓ RELEASED ONLY
                </span>
              </div>
              <select
                value={formData.recipeId}
                onChange={(e) => setFormData({ ...formData, recipeId: parseInt(e.target.value, 10) })}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 font-semibold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              >
                {recipes.map((r) => {
                  const isReleased = (r.status || '').toUpperCase() === 'RELEASED';
                  return (
                    <option 
                      key={r.id} 
                      value={r.id}
                      disabled={!isReleased}
                      className={!isReleased ? 'text-slate-400 bg-slate-50' : 'text-slate-900 font-bold'}
                    >
                      [{r.code}] {r.name} ({r.version}) — {r.status} {!isReleased ? '(LOCKED / UNAPPROVED)' : '✓ VALIDATED'}
                    </option>
                  );
                })}
              </select>
              {selectedRecipe && (selectedRecipe.status || '').toUpperCase() !== 'RELEASED' && (
                <p className="mt-1 text-[11px] text-rose-600 font-mono flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Selected recipe is in {selectedRecipe.status} mode and cannot be dispatched to operations.</span>
                </p>
              )}
            </div>

            {/* Row 4: Scheduled Start Time & Target Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Scheduled Start Time
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={formData.scheduledStartTime}
                    onChange={(e) => setFormData({ ...formData, scheduledStartTime: e.target.value })}
                    className="w-full h-9 pl-8 pr-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                    Target Process Cell
                  </label>
                  <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border ${
                    cipStatus === 'CLEAN'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : cipStatus === 'IN_PROGRESS'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}>
                    {cipStatus === 'CLEAN' ? '● CIP: VALID' : cipStatus === 'IN_PROGRESS' ? '● CIP: RUNNING' : '● CIP: EXPIRED'}
                  </span>
                </div>
                <input
                  type="text"
                  disabled
                  value="UNIT MIXING (Physical Cell 1)"
                  className="w-full h-9 px-3 text-xs font-mono bg-slate-100 border border-slate-300 text-slate-800 font-semibold"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={(selectedRecipe?.status || '').toUpperCase() !== 'RELEASED'}
                className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Work Order</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT CARD: Real-Time Dynamic Control Recipe Preview Box */}
        <div className="lg:col-span-6 bg-white border border-slate-200 shadow-xs">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-700" />
              <span className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider">
                Dynamic Control Recipe Generation Box
              </span>
            </div>
            <span className="text-[10px] font-mono text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 font-bold">
              SIEMENS PM-CONTROL SEC. 5.8 ENGINE
            </span>
          </div>

          <div className="p-5 space-y-4 text-xs font-mono">
            {/* Siemens PM-CONTROL Sec. 5.8 Job Control Math Header */}
            <div className="bg-slate-50 border border-slate-200 p-3 space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">BATCH TYPE:</span>
                  <span className="font-bold text-slate-900 block">
                    {pmJobSummary?.batchType === 'NORMALIZED_ABSOLUTE'
                      ? 'Normalized Base / Absolute'
                      : pmJobSummary?.batchType === 'ABSOLUTE_FIXED'
                      ? 'Fixed Batch / Absolute'
                      : 'Normalized Base / Percentage'}
                  </span>
                  <span className="text-[10px] text-slate-500">{pmJobSummary?.sectionRef}</span>
                </div>

                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">NORMALIZING BASE:</span>
                  <span className="font-bold text-slate-900 tabular-nums block">
                    {pmJobSummary
                      ? `${pmJobSummary.normalizingBase.toFixed(2)} ${pmJobSummary.normalizingBaseUnit}`
                      : '100.00 %'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Recipe: {selectedRecipe?.code || '---'} ({selectedRecipe?.version})
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">TARGET ORDER QTY:</span>
                  <span className="font-bold text-slate-900 tabular-nums block">
                    {formData.volume.toLocaleString()} L
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Customer: {selectedCustomer?.code || '---'}
                  </span>
                </div>

                <div className="bg-white border border-slate-300 px-2.5 py-1.5">
                  <span className="text-sky-700 font-bold block uppercase text-[10px]">
                    CONVERSION FACTOR:
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums block">
                    × {pmJobSummary ? pmJobSummary.conversionFactor.toFixed(4) : '1.0000'}
                  </span>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    {pmJobSummary?.conversionFormulaText}
                  </span>
                </div>
              </div>

              {/* Explicit PM-CONTROL Formula Strip */}
              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Calculator className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                  <span className="font-semibold uppercase">PM-CONTROL Job Control Math:</span>
                  <span className="text-slate-900 font-bold tabular-nums">
                    {pmJobSummary?.batchType === 'NORMALIZED_ABSOLUTE' &&
                      `Factor = Target Qty (${formData.volume.toLocaleString()} L) / Normalizing Base (${pmJobSummary.normalizingBase.toFixed(2)} L) = ${pmJobSummary.conversionFactor.toFixed(4)}`}
                    {pmJobSummary?.batchType === 'NORMALIZED_PERCENTAGE' &&
                      `Factor = Target Qty (${formData.volume.toLocaleString()} L) / 100 = ${pmJobSummary.conversionFactor.toFixed(4)}`}
                    {pmJobSummary?.batchType === 'ABSOLUTE_FIXED' &&
                      `Factor = 1.0000 (Sec. 5.8.1 Fixed Product — Job Control does not scale quantities)`}
                  </span>
                </div>
              </div>
            </div>

            {/* ISA-88 Multi-Batch Campaign Badge (When volume > 4.5L safe limit) */}
            {formData.volume > 4.5 && (() => {
              const vesselCap = 5.0;
              const safeMax = 4.5;
              const N = Math.ceil(formData.volume / safeMax);
              const vBatch = formData.volume / N;
              const loadFactor = ((vBatch / vesselCap) * 100).toFixed(1);
              return (
                <div className="p-2.5 bg-sky-50 border border-sky-200 text-sky-950 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 font-bold text-sky-900 text-xs uppercase tabular-nums">
                      ⚡ CHIẾN DỊCH ISA-88: {N} MẺ × {vBatch.toFixed(2)} L/MẺ (TẢI AN TOÀN {loadFactor}%)
                    </span>
                    <span className="px-1.5 py-0.2 bg-white text-sky-800 border border-sky-300 font-mono text-[9px] font-bold">
                      BỒN 5.0L
                    </span>
                  </div>
                  <p className="text-[10.5px] text-sky-800 leading-tight">
                    Sản lượng đơn hàng ({formData.volume.toLocaleString()} L) vượt ngưỡng an toàn đơn mẻ (&gt; 4.50 L với 10% headspace). Hệ thống MES sẽ tự động triển khai thành chiến dịch {N} mẻ cân bằng tải khi nạp công thức xuống PLC.
                  </p>
                </div>
              );
            })()}

            {/* Calculated Setpoints Matrix */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Automated PLC Control Setpoints (Master × Conversion Factor)
                </span>
                <span className="text-[10px] text-slate-500">
                  Scaled from Master Recipe {selectedRecipe?.version}
                </span>
              </div>

              <div className="space-y-2">
                {dynamicSetpoints.map((sp, idx) => {
                  const isScalable = sp.scalingRule !== 'FIXED';
                  const factorVal = sp.conversionFactor ?? pmJobSummary?.conversionFactor ?? 1.0;
                  return (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50/80 border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        {sp.unit === '°C' ? (
                          <Thermometer className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : (
                          <Droplet className="w-4 h-4 text-sky-600 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{sp.name}</span>
                            {isScalable ? (
                              <span className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[9px] font-bold uppercase">
                                SCALABLE (× Factor)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-300 text-amber-800 text-[9px] font-bold uppercase">
                                FIXED (Non-Scalable)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                            {isScalable ? (
                              <span>
                                Control SP = Master ({sp.masterValue ?? sp.percentage}{sp.masterUnit || '%'}) × Factor ({factorVal.toFixed(4)})
                              </span>
                            ) : (
                              <span>
                                Control SP = Master ({sp.masterValue ?? sp.calculatedValue}{sp.masterUnit || sp.unit}) — Unchanged Thermal/Process Parameter
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                          {sp.calculatedValue.toLocaleString()} {sp.unit}
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 inline-block">
                          {sp.targetNodeId || 'OPC UA SP'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary Line: Total Raw Material Input vs. Expected Net Output Volume */}
              {pmJobSummary && (
                <div className="mt-3 p-3 bg-slate-900 text-white border border-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">
                        TOTAL RAW MATERIAL INPUT (SCALED DOSING SUM)
                      </span>
                      <span className="font-bold text-sm text-white">
                        {pmJobSummary.totalRawMaterialInput.toLocaleString()} L/kg
                      </span>
                    </div>
                  </div>

                  <div className="h-7 w-px bg-slate-700 hidden sm:block" />

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">
                      EXPECTED NET OUTPUT VOLUME
                    </span>
                    <span className="font-bold text-sm text-emerald-400">
                      {pmJobSummary.expectedNetOutputVolume.toLocaleString()} L
                    </span>
                  </div>

                  <div className="h-7 w-px bg-slate-700 hidden sm:block" />

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block">
                      PROCESS LOSS ALLOWANCE (EVAPORATION / PIPING)
                    </span>
                    <span className="font-bold text-xs text-sky-300">
                      {pmJobSummary.expectedLossVolume > 0
                        ? `+${pmJobSummary.expectedLossVolume.toLocaleString()} L (+${pmJobSummary.expectedLossPercent.toFixed(1)}%)`
                        : pmJobSummary.expectedLossPercent > 0
                        ? `+${pmJobSummary.expectedLossPercent.toFixed(1)}% Compensation`
                        : '0.0 L (0.0% Nominal Balance)'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Equipment Pre-Check Indicator */}
            <div className="pt-2 border-t border-slate-200">
              <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                Equipment Pre-Check & Readiness Indicator
              </span>

              <div className={`p-3 border flex flex-wrap items-center justify-between gap-3 text-xs ${
                cipStatus === 'CLEAN'
                  ? 'bg-emerald-50/60 border-emerald-300'
                  : cipStatus === 'IN_PROGRESS'
                  ? 'bg-amber-50/60 border-amber-300'
                  : 'bg-rose-50/60 border-rose-300'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${
                    cipStatus === 'CLEAN'
                      ? 'bg-emerald-600 animate-pulse'
                      : cipStatus === 'IN_PROGRESS'
                      ? 'bg-amber-600 animate-spin'
                      : 'bg-rose-600'
                  }`} />
                  <div>
                    <span className="font-bold text-slate-900 uppercase">TARGET UNIT: UNIT MIXING</span>
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="font-semibold text-slate-800">STATUS: {unitMixingState}</span>
                    <span className="mx-2 text-slate-400">|</span>
                    <span className={`font-bold uppercase ${
                      cipStatus === 'CLEAN'
                        ? 'text-emerald-800'
                        : cipStatus === 'IN_PROGRESS'
                        ? 'text-amber-800'
                        : 'text-rose-800'
                    }`}>
                      CIP HYGIENE: {cipStatus === 'CLEAN' ? 'VALID (CLEAN)' : cipStatus === 'IN_PROGRESS' ? 'IN PROGRESS' : 'EXPIRED (RINSE REQUIRED)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className={`px-2 py-0.5 border font-bold ${
                    gatewayConnected 
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-900' 
                      : 'bg-amber-100 border-amber-300 text-amber-900'
                  }`}>
                    {gatewayConnected ? 'GATEWAY: ONLINE' : 'GATEWAY: STANDBY'}
                  </span>
                  <span className={cipStatus === 'CLEAN' ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                    {cipStatus === 'CLEAN' ? 'Ready for batch execution' : 'Interlock: CIP cycle required in Operations'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Work Order Records Table & Dispatch Actions */}
      <div className="bg-white border border-slate-200 shadow-xs">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider">
              Work Order Records & Dispatch Operations Table
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              ({displayOrders.length} / {workOrders.length} Scheduled Batches)
            </span>
          </div>

          <div className="text-xs font-mono text-slate-500">
            Click [Dispatch to Operations] to transfer Control Recipe to live execution queue
          </div>
        </div>

        {/* Hallmark Industrial Filter Toolstrip */}
        <div className="bg-slate-50/70 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Keyword Search Input */}
            <div className="relative min-w-[220px] flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteFilter();
                  }
                }}
                placeholder="Tìm kiếm mã ĐH, KH, công thức..."
                className="w-full h-9 pl-8 pr-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>

            {/* Date Filter Checkbox Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none px-2.5 h-9 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-mono text-xs">
              <input
                type="checkbox"
                checked={enableDateFilter}
                onChange={(e) => {
                  setEnableDateFilter(e.target.checked);
                  if (!e.target.checked) {
                    setDatePreset('all');
                  }
                }}
                className="w-3.5 h-3.5 accent-slate-900 cursor-pointer"
              />
              <span className="text-[11px] font-semibold uppercase">Lọc theo ngày</span>
            </label>

            {/* Quick Presets Dropdown */}
            <select
              value={datePreset}
              disabled={!enableDateFilter}
              onChange={(e) => handlePresetChange(e.target.value as any)}
              className="h-9 px-2 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              title="Khoảng thời gian nhanh"
            >
              <option value="all">-- Mốc thời gian --</option>
              <option value="today">Hôm nay</option>
              <option value="7days">7 ngày qua</option>
              <option value="this_month">Tháng này</option>
            </select>

            {/* From Date Picker */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 uppercase">Từ:</span>
              <input
                type="date"
                value={fromDate}
                disabled={!enableDateFilter}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setDatePreset('all');
                }}
                className="h-9 px-2 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>

            {/* To Date Picker */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 uppercase">Đến:</span>
              <input
                type="date"
                value={toDate}
                disabled={!enableDateFilter}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setDatePreset('all');
                }}
                className="h-9 px-2 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>

            {/* Status Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-2 text-xs font-mono bg-white border border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              title="Lọc trạng thái đơn hàng"
            >
              <option value="All">Tất cả trạng thái</option>
              <option value="Completed">Completed (Hoàn thành)</option>
              <option value="Running">Running (Đang chạy)</option>
              <option value="Ready">Ready (Sẵn sàng)</option>
              <option value="Held">Held (Tạm dừng)</option>
            </select>

            {/* Primary & Secondary Action Buttons */}
            <button
              type="button"
              onClick={handleExecuteFilter}
              disabled={isSearching}
              className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px disabled:opacity-60 transition-none"
            >
              {isSearching ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Filter className="w-3.5 h-3.5" />
              )}
              <span>Tra cứu / Lọc</span>
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              className="h-9 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              title="Đặt lại bộ lọc về mặc định"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Đặt lại</span>
            </button>
          </div>

          {/* Live Results Counter Badge */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-1 bg-white border border-slate-300 text-slate-700 font-semibold shadow-2xs whitespace-nowrap">
              Hiển thị <span className="text-slate-900 font-bold">{displayOrders.length}</span> / {workOrders.length} đơn hàng
              {filteredOrders !== null && (
                <span className="ml-1.5 text-[10px] text-sky-700 font-bold uppercase">(ĐÃ LỌC)</span>
              )}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Order ID</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Recipe & Version</th>
                <th className="py-2.5 px-3 text-right">Volume</th>
                <th className="py-2.5 px-3">Calculated Control Setpoints</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Scheduled Time</th>
                <th className="py-2.5 px-3 text-right">Operations Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {displayOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <AlertCircle className="w-5 h-5 text-slate-400" />
                      <span className="font-semibold text-xs text-slate-700 uppercase">
                        {workOrders.length === 0 ? 'Chưa có đơn hàng nào. Sẵn sàng tạo đơn mới.' : 'Không tìm thấy đơn sản xuất phù hợp'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {workOrders.length === 0 ? 'Hệ thống đang ở trạng thái Chờ (Cold Standby). Điền biểu mẫu phía trên để lên lịch mẻ mới.' : 'Vui lòng điều chỉnh tiêu chí tìm kiếm hoặc nhấn "Đặt lại" để xem toàn bộ danh sách.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                displayOrders.map((wo) => {
                  const isSelected = selectedOrderId === wo.id;
                  const st = String(wo.status || '').toUpperCase();
                  const isNew = st === 'NEW';
                  const isReady = st === 'READY';
                  const isRunning = st === 'RUNNING';
                  const isCompleted = st === 'COMPLETED';
                  const isHeld = st === 'HELD' || st === 'STOPPED' || st === 'STOPPING' || st === 'ABORTED' || st === 'ABORTING';

                  return (
                    <tr
                      key={wo.id}
                      onClick={() => setSelectedOrderId(wo.id)}
                      className={`hover:bg-slate-50 transition-none cursor-pointer ${
                        isSelected ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      {/* Order ID */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {wo.orderId}
                      </td>

                      {/* Customer */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{wo.customerName}</div>
                        <div className="text-[10px] text-slate-500">{wo.customerCode || '---'}</div>
                      </td>

                      {/* Recipe & Version */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{wo.recipeName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {wo.recipeCode || 'RCP-BASE'} <span className="font-bold text-slate-700">({wo.recipeVersion || 'v1.2'})</span>
                        </div>
                      </td>

                      {/* Volume */}
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {wo.volume.toLocaleString()} L
                      </td>

                      {/* Calculated Setpoints */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          {wo.calculatedSetpoints && wo.calculatedSetpoints.length > 0 ? (
                            wo.calculatedSetpoints.map((sp, sIdx) => (
                              <span
                                key={sIdx}
                                className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-800"
                                title={`${sp.name}: ${sp.calculatedValue}${sp.unit}`}
                              >
                                {sp.name.replace(' Setpoint', '').replace(' Dosing', '')}: <span className="font-bold">{sp.calculatedValue}{sp.unit}</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">---</span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge (ISA-101 Standard) */}
                      <td className="py-2.5 px-3 text-center">
                        {isNew && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 text-[10px] font-bold">
                            NEW
                          </span>
                        )}
                        {isReady && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-300 text-[10px] font-bold">
                            READY
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            RUNNING
                          </span>
                        )}
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-semibold">
                            COMPLETED
                          </span>
                        )}
                        {isHeld && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold">
                            {st}
                          </span>
                        )}
                        {!isNew && !isReady && !isRunning && !isCompleted && !isHeld && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 text-[10px]">
                            {wo.status}
                          </span>
                        )}
                      </td>

                      {/* Scheduled Time */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {wo.scheduledStartTime || wo.startTime || '---'}
                      </td>

                      {/* Operations Action */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isNew ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDispatch(wo.id);
                              }}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>[DISPATCH]</span>
                            </button>
                          ) : isReady ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-300 text-[11px] font-bold font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                              <span>ĐÃ CHUYỂN GIAO (READY)</span>
                            </span>
                          ) : isRunning ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold font-mono">
                              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                              <span>● RUNNING</span>
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>● COMPLETED {wo.endTime ? `(${wo.endTime.substring(11, 16) || wo.endTime})` : ''}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">
                              {st}
                            </span>
                          )}

                          {!isRunning && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(wo.id);
                              }}
                              className="h-8 px-2 bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-500 hover:text-rose-600 text-xs focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                              title="Delete Work Order"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 font-mono flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Dispatched orders automatically bind to ISA-88 recipe execution phases in UNIT MIXING.</span>
          </div>
          <div className="text-[10px] text-slate-400">
            SCHEMA: [dbo].[WORK_ORDERS] & [dbo].[CONTROL_RECIPES]
          </div>
        </div>
      </div>
    </div>
  );
};
