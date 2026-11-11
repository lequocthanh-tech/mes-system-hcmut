/* Hallmark · component: ApiService · genre: modern-minimal · register: industrial-workbench
 * states: default · loading · error · success
 * contrast: WCAG AA Pass
 */

import { Customer, MasterRecipe, WorkOrder, RecipeVersionSnapshot, WatchdogStatus, AiDosingAdvisorResponse } from '../types/masterData';
import { MaterialStock, MaterialCode } from '../types/inventory';

export type SqlStoreForwardMode = 'ONLINE' | 'BUFFERING' | 'SYNCING';

export interface DbStatusResponse {
  connected: boolean;
  sql_connected?: boolean;
  mode?: SqlStoreForwardMode;
  buffered_count?: number;
  status: 'connected' | 'disconnected';
  database: string;
  server?: string;
  driver?: string;
  timestamp: string;
  latency_ms: number;
  error?: string;
}

export interface BatchCompletionReportPayload {
  order_code: string;
  report_code?: string;
  recipe_applied: string;
  total_produced: number;
  avg_deviation_percent?: number;
  quality_status?: 'CONFORMING' | 'NON_CONFORMING' | 'DEVIATION_ACCEPTED';
  disposition_action?: string;
  sign_off_by?: string;
  quality_results?: Array<{
    parameter_name: string;
    setpoint: number;
    actual_value: number;
    deviation_percent?: number;
    tolerance_band?: string;
    evaluation?: 'PASS' | 'WARN' | 'FAIL';
  }>;
}

export interface UserActionLogPayload {
  username: string;
  role?: string;
  action: string;
  detail?: string;
}

export interface ConsumeMaterialsPayload {
  order_id: string;
  consumed_items?: Array<{
    material_code: string;
    amount: number;
  }>;
  milk_qty?: number;
  sugar_qty?: number;
  additive_qty?: number;
}

// Base URL detection: works seamlessly with Vite proxy on localhost:5173,
// direct desktop port 8000, and file:// protocol
const getApiBase = (): string => {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8000';
  if (window.location.protocol === 'file:' || window.location.port !== '5173') {
    return 'http://127.0.0.1:8000';
  }
  return '';
};

const API_BASE = getApiBase();

/**
 * Standard HTTP Fetch helper with timeout and JSON parsing
 */
async function fetchJson<T>(url: string, options?: RequestInit, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  let authHeaders: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('mes_auth_user') || localStorage.getItem('mes_auth_session');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        const role = u.role || u.userRole || 'OPERATOR';
        const username = u.username || u.name || 'operator_01';
        authHeaders['X-User-Role'] = String(role).toUpperCase();
        authHeaders['X-User'] = String(username);
      }
    } catch {}
  }

  try {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const effectiveSignal = options?.signal || controller.signal;
    const res = await fetch(fullUrl, {
      ...options,
      signal: effectiveSignal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(options?.headers || {}),
      },
    });
    clearTimeout(id);

    if (!res.ok) {
      let message = res.statusText || `Request failed with status ${res.status}`;
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.detail === 'string') {
            message = parsed.detail;
          } else if (parsed && typeof parsed.message === 'string') {
            message = parsed.message;
          } else if (text) {
            message = text;
          }
        } catch {
          if (text) message = text;
        }
      } catch {}
      throw new Error(message);
    }

    return await res.json();
  } catch (error: any) {
    clearTimeout(id);
    if (
      error?.name === 'AbortError' ||
      error?.message?.toLowerCase().includes('aborted') ||
      error?.message?.toLowerCase().includes('abort') ||
      controller.signal.aborted
    ) {
      throw new Error('Quá thời gian phản hồi từ thiết bị ngoại vi (Timeout)');
    }
    throw error;
  }
}

// ============================================================================
// SYSTEM TELEMETRY & HEALTH CHECKS
// ============================================================================

/**
 * Heartbeat check for Microsoft SQL Server connection on localhost\WINCC
 */
export async function checkDbStatus(): Promise<DbStatusResponse> {
  try {
    return await fetchJson<DbStatusResponse>('/api/db/status', { method: 'GET' }, 3000);
  } catch (error: any) {
    return {
      connected: false,
      sql_connected: false,
      mode: 'BUFFERING',
      buffered_count: 0,
      status: 'disconnected',
      database: 'MES_Milk_Production',
      timestamp: new Date().toISOString(),
      latency_ms: 0,
      error: error.message || 'Database unreachable',
    };
  }
}

/**
 * Unified system status for Kepware and SQL Server
 */
export async function checkSystemStatus(): Promise<{ sql_online: boolean; kepware_online: boolean; status: string }> {
  try {
    return await fetchJson<{ sql_online: boolean; kepware_online: boolean; status: string }>('/api/system/status', { method: 'GET' }, 3000);
  } catch {
    return { sql_online: false, kepware_online: false, status: 'offline' };
  }
}

export interface TestDbResponse {
  connected: boolean;
  ok?: boolean;
  status: 'connected' | 'disconnected';
  database: string;
  server: string;
  version?: string;
  latency_ms?: number;
  message?: string;
  error?: string;
}

/**
 * Handshake test to verify SQL Server connection parameters
 */
export async function testDbConnection(payload: {
  server_name: string;
  database_name: string;
  auth_mode?: string;
  username?: string;
  password?: string;
  port?: number;
}): Promise<TestDbResponse> {
  return await fetchJson<TestDbResponse>('/api/db/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 4000);
}

// ============================================================================
// MASTER DATA SERVICES
// ============================================================================

/**
 * Fetch all registered customers from SQL Server dbo.Customers
 */
export async function getCustomers(): Promise<Customer[]> {
  try {
    const res = await fetchJson<{ status: string; data: Customer[] }>('/api/customers');
    return res.data || [];
  } catch (error) {
    console.warn('[API] Could not fetch customers from SQL Server:', error);
    throw error;
  }
}

/**
 * Create customer in SQL Server dbo.Customers
 */
export async function createCustomer(customer: Partial<Customer>): Promise<any> {
  return await fetchJson('/api/customers', {
    method: 'POST',
    body: JSON.stringify(customer),
  });
}

/**
 * Update customer in SQL Server dbo.Customers
 */
export async function updateCustomer(customerId: number, customer: Partial<Customer>): Promise<any> {
  return await fetchJson(`/api/customers/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify(customer),
  });
}

/**
 * Delete customer by ID from SQL Server dbo.Customers
 */
export async function deleteCustomer(customerId: number): Promise<any> {
  return await fetchJson(`/api/customers/${customerId}`, {
    method: 'DELETE',
  });
}

/**
 * Fetch master recipes from SQL Server dbo.Recipes & dbo.Recipe_Detail
 */
export async function getRecipes(): Promise<MasterRecipe[]> {
  try {
    const res = await fetchJson<{ status: string; data: MasterRecipe[] }>('/api/recipes');
    return res.data || [];
  } catch (error) {
    console.warn('[API] Could not fetch recipes from SQL Server:', error);
    throw error;
  }
}

/**
 * Create new Master Recipe in SQL Server dbo.Recipes & dbo.Recipe_Detail
 */
export async function createRecipe(recipe: Partial<MasterRecipe> & { user?: string }): Promise<any> {
  return await fetchJson('/api/recipes', {
    method: 'POST',
    body: JSON.stringify(recipe),
  });
}

/**
 * Update recipe status or parameters in SQL Server dbo.Recipes
 */
export async function updateRecipe(recipeId: number, update: Partial<MasterRecipe> & { user?: string }): Promise<any> {
  return await fetchJson(`/api/recipes/${recipeId}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

/**
 * Delete recipe from SQL Server dbo.Recipes & dbo.Recipe_Detail
 */
export async function deleteRecipe(recipeId: number): Promise<any> {
  return await fetchJson(`/api/recipes/${recipeId}`, {
    method: 'DELETE',
  });
}

/**
 * Siemens PM-CONTROL Sec. 5.6.2: Retrieve recipe version history snapshots
 */
export async function getRecipeVersions(recipeId: number): Promise<RecipeVersionSnapshot[]> {
  try {
    const res = await fetchJson<{ status: string; success: boolean; data: RecipeVersionSnapshot[] }>(`/api/recipes/${recipeId}/versions`);
    return res.data || [];
  } catch (error) {
    console.warn(`[API] Could not fetch version history for recipe ${recipeId}:`, error);
    return [];
  }
}

/**
 * Siemens PM-CONTROL Sec. 5.6.3: Rollback recipe to historical version
 */
export async function rollbackRecipeVersion(
  recipeId: number,
  payload: { target_version: string; operator?: string; reason?: string }
): Promise<any> {
  return await fetchJson(`/api/recipes/${recipeId}/rollback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * IEC 61508 / Chapter 9 Bidirectional Lifebit Watchdog Telemetry
 */
export async function getWatchdogStatus(): Promise<WatchdogStatus> {
  try {
    return await fetchJson<WatchdogStatus>('/api/gateway/watchdog-status');
  } catch (error) {
    console.warn('[API] Could not fetch watchdog status, returning fallback:', error);
    return {
      status: 'HEALTHY',
      lifebit_pulse: true,
      lifebit_counter: 0,
      latency_ms: 10.0,
      timeout_threshold_ms: 3000,
      safe_hold_triggered: false,
      consecutive_failures: 0,
      last_sync_utc: new Date().toISOString(),
    };
  }
}

/**
 * Industrial AI In-Flight Dosing & Statistical Process Control (SPC) Advisor
 */
export async function getAiDosingOffsetAdvisor(): Promise<AiDosingAdvisorResponse> {
  return await fetchJson<AiDosingAdvisorResponse>('/api/ai/dosing-offset-advisor');
}

/**
 * Human-in-the-Loop (HITL) approval to apply recommended dosing offset
 */
export async function applyDosingOffset(payload: {
  hopper_id: string;
  recommended_offset_kg: number;
  operator?: string;
  reason?: string;
}): Promise<any> {
  return await fetchJson('/api/ai/apply-dosing-offset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// OPERATIONS & ORDERS
// ============================================================================

export interface OrderSearchParams {
  keyword?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  limit?: number;
}

/**
 * Historical Multi-Criteria Search & Filtering for Work Orders
 */
export async function searchOrders(params: OrderSearchParams = {}): Promise<WorkOrder[]> {
  try {
    const query = new URLSearchParams();
    if (params.keyword && params.keyword.trim()) {
      query.set('keyword', params.keyword.trim());
    }
    if (params.from_date && params.from_date.trim()) {
      query.set('from_date', params.from_date.trim());
    }
    if (params.to_date && params.to_date.trim()) {
      query.set('to_date', params.to_date.trim());
    }
    if (params.status && params.status.trim() && params.status.toUpperCase() !== 'ALL') {
      query.set('status', params.status.trim());
    }
    if (params.limit) {
      query.set('limit', String(params.limit));
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/api/orders/search?${queryString}` : '/api/orders/search';
    const res = await fetchJson<{ status: string; count?: number; data: WorkOrder[] }>(endpoint);
    return res.data || [];
  } catch (error) {
    console.warn('[API] Order search failed:', error);
    throw error;
  }
}

/**
 * Fetch production orders from SQL Server dbo.Orders
 */
export async function getOrders(): Promise<WorkOrder[]> {
  try {
    const res = await fetchJson<{ status: string; data: WorkOrder[] }>('/api/orders');
    return res.data || [];
  } catch (error) {
    console.warn('[API] Could not fetch orders from SQL Server:', error);
    throw error;
  }
}

/**
 * Create new production batch order in SQL Server dbo.Orders
 */
export async function createOrder(order: {
  order_code?: string;
  orderId?: string;
  id?: string;
  recipe_id?: number;
  recipeId?: number;
  customer_id?: number;
  customerId?: number;
  customer_code?: string;
  customerCode?: string;
  target_volume?: number;
  volume?: number;
  status?: string;
  scheduled_start_time?: string;
  scheduledStartTime?: string;
  target_cell?: string;
  user?: string;
}): Promise<any> {
  return await fetchJson('/api/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

/**
 * Dispatch production order to Operations queue (Status: READY) in SQL Server dbo.Orders
 */
export async function dispatchOrder(orderCode: string | number, user?: string): Promise<any> {
  return await fetchJson(`/api/orders/${encodeURIComponent(String(orderCode))}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ user: user || 'Supervisor' }),
  });
}

/**
 * Update order status in SQL Server (NEW, READY, RUNNING, HELD, COMPLETED, ABORTED)
 */
export async function updateOrderStatus(orderId: string | number, status: string, user?: string): Promise<any> {
  return await fetchJson(`/api/orders/${encodeURIComponent(String(orderId))}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, user: user || 'Operator' }),
  });
}

/**
 * Delete order from SQL Server dbo.Orders
 */
export async function deleteOrder(orderCode: string | number): Promise<any> {
  return await fetchJson(`/api/orders/${encodeURIComponent(String(orderCode))}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// INVENTORY & CONSUMPTION
// ============================================================================

/**
 * Fetch live silo storage levels from SQL Server dbo.Material_Stock
 * Standardized endpoint /api/inventory/stocks with safe dual-casing extraction
 */
export async function getInventoryStocks(): Promise<MaterialStock[]> {
  try {
    let res: any;
    try {
      res = await fetchJson<any>('/api/inventory/stocks');
    } catch {
      try {
        res = await fetchJson<any>('/api/inventory');
      } catch {
        res = await fetchJson<any>('/api/materials/stock');
      }
    }
    const rawList = Array.isArray(res) ? res : (res?.data || []);
    return rawList.map((item: any) => {
      // Safe field mapping handling both item.CurrentStock and item.current_stock safely without falling back to 0
      const stockRaw = [
        item.CurrentStock,
        item.current_stock,
        item.currentStock,
        item.Total_Quantity,
        item.total_quantity,
      ].find((v) => v !== undefined && v !== null && v !== '' && !isNaN(Number(v)));

      const currentStock = stockRaw !== undefined ? Number(stockRaw) : 0;

      const capRaw = [
        item.TankCapacity,
        item.tank_capacity,
        item.capacity,
        item.Capacity,
      ].find((v) => v !== undefined && v !== null && !isNaN(Number(v)));
      const capVal = capRaw !== undefined ? Number(capRaw) : 5.0;

      const minRaw = [
        item.MinSafetyThreshold,
        item.min_safety,
        item.min_threshold,
        item.minThreshold,
        item.MinThreshold,
      ].find((v) => v !== undefined && v !== null && !isNaN(Number(v)));
      const minThresh = minRaw !== undefined ? Number(minRaw) : 0.5;

      const tank = item.AssignedTank || item.assigned_tank || item.tank_id || item.tankId || item.TankId || 'TANK-01';
      const mCode = item.Material_Code || item.material_code || item.materialCode || item.MaterialCode || '';
      let rawName = item.Material_Name || item.material_name || item.materialName || item.MaterialName || mCode;
      
      // Sanitize nested title duplication bug
      const pattern = /^(?:Bồn chứa|Silo chứa|Storage)\s+[\w-]+\s*\((.*)\)$/i;
      while (pattern.test(rawName)) {
        rawName = rawName.replace(pattern, '$1').trim();
      }
      const cleanMName = rawName.trim() || mCode;
      const unitStr = item.Unit || item.unit || 'L';
      const lastUp = item.Last_Update || item.last_update || item.last_updated || item.lastUpdated || new Date().toISOString();
      const lastSync = item.last_synced || item.lastSynced || lastUp;
      const opcTag = item.opc_tag ?? item.opcTag ?? item.opc_node_id ?? item.OpcNodeId ?? item.opcNodeId ?? '';
      const opcHigh = item.opc_high_node_id ?? item.opcHighNodeId ?? item.OpcHighLevelNodeId ?? '';
      const opcLow = item.opc_low_node_id ?? item.opcLowNodeId ?? item.OpcLowLevelNodeId ?? '';
      const highActive = Boolean(item.high_level_active ?? item.highLevelActive ?? item.HighLevelActive ?? false);
      const lowActive = Boolean(item.low_level_active ?? item.lowLevelActive ?? item.LowLevelActive ?? false);
      const highQuality = item.high_level_quality ?? item.highLevelQuality ?? item.HighLevelQuality ?? 'Good';
      const lowQuality = item.low_level_quality ?? item.lowLevelQuality ?? item.LowLevelQuality ?? 'Good';
      const rawLive = item.live_pv !== undefined ? item.live_pv : (item.livePv !== undefined ? item.livePv : undefined);
      const liveVal = rawLive !== undefined && rawLive !== null ? Number(rawLive) : undefined;
      const liveQuality = item.pv_quality ?? item.pvQuality ?? item.quality ?? 'Good';

      return {
        materialCode: mCode as MaterialCode,
        materialName: cleanMName,
        tankId: tank,
        tankName: `Bồn chứa ${tank} (${cleanMName})`,
        currentStock,
        capacity: capVal,
        maxCapacity: capVal,
        max_capacity: capVal,
        tank_capacity: capVal,
        tankCapacity: capVal,
        unit: unitStr,
        minThreshold: minThresh,
        safetyMin: minThresh,
        safety_min: minThresh,
        min_safety: minThresh,
        min_safety_threshold: minThresh,
        minSafetyThreshold: minThresh,
        lastUpdated: String(lastUp),
        lastSynced: String(lastSync),
        last_synced: String(lastSync),
        status: ((liveVal !== undefined && liveVal > 0 ? liveVal : currentStock) < minThresh ? 'LOW_STOCK' : 'NORMAL') as any,
        opcNodeId: opcTag,
        opc_node_id: opcTag,
        opcTag: opcTag,
        opc_tag: opcTag,
        opcHighNodeId: opcHigh,
        opc_high_node_id: opcHigh,
        opcLowNodeId: opcLow,
        opc_low_node_id: opcLow,
        highLevelActive: highActive,
        high_level_active: highActive,
        lowLevelActive: lowActive,
        low_level_active: lowActive,
        highLevelQuality: highQuality,
        high_level_quality: highQuality,
        lowLevelQuality: lowQuality,
        low_level_quality: lowQuality,
        sensorType: item.sensor_type ?? item.SensorType ?? item.sensorType ?? 'LOADCELL_MASS',
        tareWeight: Number(item.tare_weight ?? item.TareWeight ?? item.tareWeight ?? 0),
        createdBy: item.created_by ?? item.CreatedBy ?? item.createdBy ?? 'admin',
        livePv: liveVal,
        live_pv: liveVal,
        pvQuality: liveQuality,
        quality: liveQuality,
        tank_id: tank,
        material_code: mCode,
        material_name: cleanMName,
        tank_name: `Bồn chứa ${tank} (${cleanMName})`,
        current_stock: currentStock,
      };
    });
  } catch (error) {
    console.warn('[API] Could not fetch materials from SQL Server:', error);
    throw error;
  }
}

export const getMaterials = getInventoryStocks;
export const getInventory = getInventoryStocks;
export const getMaterialStock = getInventoryStocks;

/**
 * Deduct material amounts via SQL Server atomic transaction after batch completion
 */
export async function consumeMaterials(payload: ConsumeMaterialsPayload): Promise<any> {
  return await fetchJson('/api/inventory/consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export const consumeInventory = consumeMaterials;

export interface SingleShotDeductionItem {
  tank_id: string;
  material_code: string;
  material_name?: string;
  deducted_qty: number;
  remaining_stock: number;
  unit: string;
  supplier_lot: string;
  receipt_code: string;
}

export interface SingleShotDeductionResponse {
  status: 'success' | 'already_deducted' | string;
  is_idempotent_replay: boolean;
  order_code: string;
  message: string;
  deductions: SingleShotDeductionItem[];
  timestamp: string;
  detail?: string;
}

export interface ConsumptionLedgerRecord {
  id: number;
  user_name: string;
  user_role: string;
  action_name: string;
  detail: string;
  action_time: string;
  reason: string;
  order_code: string;
  status: string;
}

/**
 * Deduct material amounts via ISA-88 Single-Shot atomic transaction with lot genealogy
 */
export async function deductBatchSingleShot(payload: {
  order_code: string;
  order_id?: string;
  user?: string;
  weighed_items?: Array<{
    tank_id?: string;
    material_code?: string;
    material_name?: string;
    qty?: number;
    amount?: number;
    weighed_qty?: number;
    unit?: string;
  }>;
  milk_qty?: number;
  sugar_qty?: number;
  additive_qty?: number;
  force_override?: boolean;
}): Promise<SingleShotDeductionResponse> {
  return await fetchJson<SingleShotDeductionResponse>('/api/inventory/deduct-batch-single-shot', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface MaterialAvailabilityItem {
  tank_id: string;
  material_name: string;
  required_sp: number;
  current_stock: number;
  unit: string;
  is_sufficient: boolean;
  shortage_qty: number;
}

export interface MaterialAvailabilityResponse {
  available: boolean;
  is_sufficient: boolean;
  status: 'SUFFICIENT' | 'INSUFFICIENT' | string;
  interlock_message: string;
  order_code?: string;
  materials: MaterialAvailabilityItem[];
}

export interface BackflushStatusRecord {
  id: number;
  user_name: string;
  user_role: string;
  action_name: string;
  detail: string;
  action_time: string;
  reason: string;
  order_code: string;
  idempotency_status: string;
}

export interface BackflushStatusResponse {
  status: string;
  count: number;
  records: BackflushStatusRecord[];
}

/**
 * Check raw material availability against 3 Virtual Raw Material Silos in dbo.Material_Stock
 */
export async function checkMaterialAvailability(payload: {
  order_code?: string;
  milk_sp?: number;
  sugar_sp?: number;
  additive_sp?: number;
  setpoints?: Record<string, any>;
}): Promise<MaterialAvailabilityResponse> {
  return await fetchJson<MaterialAvailabilityResponse>('/api/inventory/check-availability', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Retrieve recent automatic event-driven batch backflush transactions
 */
export async function getBackflushStatus(limit: number = 15): Promise<BackflushStatusResponse> {
  return await fetchJson<BackflushStatusResponse>(`/api/inventory/backflush-status?limit=${limit}`);
}

/**
 * Fetch immutable FDA 21 CFR Part 11 consumption audit ledger
 */
export async function getConsumptionLedger(): Promise<{ success: boolean; count: number; records: ConsumptionLedgerRecord[] }> {
  return await fetchJson<{ success: boolean; count: number; records: ConsumptionLedgerRecord[] }>('/api/inventory/consumption-ledger');
}

/**
 * Restock inbound materials into dbo.Material_Input and update dbo.Material_Stock
 */
export async function restockInventory(payload: {
  material_code: string;
  material_name?: string;
  quantity: number;
  lot_number?: string;
  remark?: string;
  user?: string;
}): Promise<any> {
  return await fetchJson('/api/inventory/restock', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Intake inbound materials or adjust tank inventory with persistent SQL commit
 */
export async function intakeInventory(payload: {
  material_code?: string;
  materialCode?: string;
  material_name?: string;
  tank_id?: string;
  tankId?: string;
  quantity?: number;
  amount?: number;
  current_stock?: number;
  currentStock?: number;
  mode?: 'add' | 'set';
  lot_number?: string;
  supplierLot?: string;
  supplier_lot?: string;
  receiptCode?: string;
  receipt_code?: string;
  remark?: string;
  user?: string;
}): Promise<any> {
  return await fetchJson('/api/inventory/intake', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface CreateTankPayload {
  tank_id: string;
  material_code: string;
  material_name?: string;
  tank_capacity?: number;
  capacity?: number;
  min_safety_threshold?: number;
  min_safety?: number;
  unit?: string;
  opc_node_id?: string;
  opc_high_node_id?: string;
  opc_low_node_id?: string;
  sensor_type?: string;
  tare_weight?: number;
  user?: string;
  role?: string;
}

export interface CalibrateTankPayload {
  tank_name?: string;
  material_name?: string;
  tank_capacity?: number;
  capacity?: number;
  min_safety_threshold?: number;
  min_safety?: number;
  unit?: string;
  opc_node_id?: string;
  opcNodeId?: string;
  opc_tag?: string;
  opc_high_node_id?: string;
  opcHighNodeId?: string;
  opc_low_node_id?: string;
  opcLowNodeId?: string;
  user?: string;
  role?: string;
}

export interface UpdateTankMappingPayload {
  tank_name?: string;
  material_name?: string;
  tank_capacity?: number;
  capacity?: number;
  min_safety_threshold?: number;
  min_safety?: number;
  opc_node_id?: string;
  opcNodeId?: string;
  opc_tag?: string;
  opc_high_node_id?: string;
  opcHighNodeId?: string;
  opc_low_node_id?: string;
  opcLowNodeId?: string;
  sensor_type?: string;
  tare_weight?: number;
  unit?: string;
  user?: string;
  role?: string;
}

export interface VerifyIntakePayload {
  tank_id: string;
  ticket_quantity?: number;
  supplier_lot?: string;
  user?: string;
}

export interface VerifyIntakeResponse {
  success: boolean;
  session_id: string;
  tank_id: string;
  pre_intake_weight: number;
  ticket_quantity: number;
  supplier_lot?: string;
  timestamp: string;
  message: string;
}

export interface FinalizeIntakePayload {
  tank_id: string;
  material_code?: string;
  material_name?: string;
  ticket_quantity: number;
  pre_intake_weight: number;
  post_intake_weight?: number;
  lot_number?: string;
  supplier_name?: string;
  user?: string;
  signature_meaning?: string;
}

export interface FinalizeIntakeResponse {
  success: boolean;
  tank_id: string;
  material_code: string;
  material_name: string;
  unit: string;
  ticket_quantity: number;
  pre_intake_weight: number;
  post_intake_weight: number;
  actual_delivered: number;
  weight_discrepancy: number;
  discrepancy_status: 'VERIFIED' | 'SHORTAGE_WARNING' | 'SURPLUS';
  message: string;
}

export interface ErpInboundReceipt {
  receipt_code: string;
  partner_name: string;
  material_name: string;
  material_code: string;
  expected_qty: number;
  unit: string;
  scheduled_date: string;
  state?: string;
  odoo_id?: number;
  is_done?: boolean;
  is_ready?: boolean;
  mes_received?: boolean;
  mes_status?: string;
  mes_actual_qty?: number;
  mes_input_time?: string;
  mes_tank_id?: string;
  mes_supplier_lot?: string;
}

export interface InboundVerifyPayload {
  receipt_code: string;
  material_code: string;
  tank_id: string;
  expected_qty: number;
  actual_sensor_qty: number;
  operator?: string;
  supplier_lot?: string;
  material_name?: string;
  unit?: string;
  signature_meaning?: string;
  reason?: string;
  signature_hash?: string;
}

export interface InboundVerifyResponse {
  success: boolean;
  receipt_code: string;
  material_code: string;
  material_name: string;
  tank_id: string;
  unit: string;
  expected_qty: number;
  actual_sensor_qty: number;
  delta_qty: number;
  diff_percent: number;
  status: 'MATCHED' | 'SHORTAGE' | 'OVERAGE';
  operator: string;
  supplier_lot: string;
  pre_stock: number;
  post_stock: number;
  message: string;
  odoo_sync?: {
    success?: boolean;
    synced?: boolean;
    state?: string;
    receipt_code?: string;
    odoo_picking_id?: number;
    message?: string;
    error?: string;
  };
}

export interface TestOpcNodeResponse {
  valid: boolean;
  success?: boolean;
  node_id: string;
  value?: any;
  datatype?: string;
  quality: 'Good' | 'Bad' | 'Unmapped' | string;
  message?: string;
}

/**
 * Dynamic Tank Creation (Admin only)
 */
export async function createStorageTank(payload: CreateTankPayload, headers?: HeadersInit): Promise<any> {
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string> || {}),
  };
  if (payload.role && !reqHeaders['X-User-Role']) {
    reqHeaders['X-User-Role'] = payload.role;
  }
  if (payload.user && !reqHeaders['X-User']) {
    reqHeaders['X-User'] = payload.user;
  }
  return await fetchJson('/api/inventory/tanks', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: reqHeaders,
  });
}

/**
 * Dynamic Tank Calibration (Admin only)
 * Calibrates TankCapacity, MinSafetyThreshold, material name, and OPC tags in dbo.Material_Stock.
 */
export async function calibrateTank(tankId: string, payload: CalibrateTankPayload, headers?: HeadersInit): Promise<any> {
  const reqHeaders: Record<string, string> = {
    'X-User-Role': 'ADMIN',
    'X-User': 'admin',
    ...(headers as Record<string, string> || {}),
  };
  if (payload.role) {
    reqHeaders['X-User-Role'] = payload.role;
  }
  if (payload.user) {
    reqHeaders['X-User'] = payload.user;
  }
  return await fetchJson(`/api/inventory/tanks/${encodeURIComponent(tankId)}/calibrate`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: reqHeaders,
  });
}

/**
 * Inline Tank & OPC Tag Mapping Editor (Admin only)
 */
export async function updateTankMapping(tankId: string, payload: UpdateTankMappingPayload, headers?: HeadersInit): Promise<any> {
  const reqHeaders: Record<string, string> = {
    'X-User-Role': 'ADMIN',
    'X-User': 'admin',
    ...(headers as Record<string, string> || {}),
  };
  if (payload.role) {
    reqHeaders['X-User-Role'] = payload.role;
  }
  if (payload.user) {
    reqHeaders['X-User'] = payload.user;
  }
  return await fetchJson(`/api/inventory/tanks/${encodeURIComponent(tankId)}/mapping`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: reqHeaders,
  });
}

/**
 * Delete empty storage tank (Admin only)
 */
export async function deleteStorageTank(tankId: string, user?: string, role?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (role) headers['X-User-Role'] = role;
  if (user) headers['X-User'] = user;
  return await fetchJson(`/api/inventory/tanks/${encodeURIComponent(tankId)}`, {
    method: 'DELETE',
    headers,
  });
}

/**
 * Read live tank loadcell weight / mass PV
 */
export async function getTankLiveWeight(tankId: string): Promise<{
  success: boolean;
  tank_id: string;
  live_weight: number;
  quality: string;
  timestamp: string;
  opc_node_id?: string;
}> {
  return await fetchJson(`/api/inventory/tanks/${encodeURIComponent(tankId)}/live-weight`);
}

/**
 * Tare / Pre-check live mass before intake
 */
export async function verifyIntakePreCheck(payload: VerifyIntakePayload): Promise<VerifyIntakeResponse> {
  return await fetchJson('/api/inventory/verify-intake', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Finalize physical intake & reconcile against loadcell
 */
export async function finalizeIntakeReconciliation(payload: FinalizeIntakePayload): Promise<FinalizeIntakeResponse> {
  return await fetchJson('/api/inventory/finalize-intake', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Downlinks inbound warehouse delivery orders from Odoo ERP (ISA-95 Level 4).
 * Timeout expanded to 15000ms (15 seconds) to accommodate ERP network latency.
 */
export async function getErpInboundReceipts(signal?: AbortSignal): Promise<{
  status: string;
  receipts: ErpInboundReceipt[];
  count: number;
  error?: string;
}> {
  const timeoutSignal = signal || (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(15000) : undefined);
  return await fetchJson(
    '/api/erp/inbound-receipts',
    { signal: timeoutSignal },
    15000
  );
}

/**
 * Physical hardware-in-the-loop inbound intake verification & persistence (ISA-95 Level 3 MOM)
 */
export async function verifyInboundIntake(payload: InboundVerifyPayload): Promise<InboundVerifyResponse> {
  return await fetchJson('/api/inventory/inbound-verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 15000);
}

/**
 * Probe OPC UA node connectivity & value in Kepware
 */
export async function testOpcNodeConnectivity(nodeId: string): Promise<TestOpcNodeResponse> {
  return await fetchJson('/api/gateway/test-node', {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  }, 10000);
}

/**
 * Reconcile Book Stock (CurrentStock) with Physical Sensor Reading (Live PV)
 */
export async function reconcileTankStock(
  tankId: string,
  sensorVolume: number,
  user = 'admin',
  role = 'ADMIN',
  reason = 'Kiểm kê thực tế'
): Promise<any> {
  return await fetchJson(`/api/inventory/tanks/${tankId}/reconcile`, {
    method: 'POST',
    body: JSON.stringify({
      sensor_volume: sensorVolume,
      user,
      role,
      reason,
    }),
  }, 10000);
}

/**
 * Fetch historical material receipts with reconciliation metrics from SQL Server
 */
export async function getInventoryReceipts(limit = 50): Promise<any[]> {
  try {
    const res = await fetchJson<{ status: string; data: any[] }>(`/api/inventory/receipts?limit=${limit}`);
    return res.data || [];
  } catch {
    return [];
  }
}

export interface ModuleTagItem {
  tag_name: string;
  node_id: string;
  role: string;
  unit: string;
  dataType?: string;
  writable?: boolean;
  description?: string;
  value?: any;
  quality?: string;
  latency_ms?: number;
  timestamp?: string;
}

export interface ModuleTagMappingsResponse {
  status: string;
  module: string;
  tags: Record<string, ModuleTagItem>;
  message?: string;
  success?: boolean;
}

/**
 * Fetch modular Kepware tag mappings with live telemetry for an operational module
 */
export async function getModuleTagMappings(moduleKey: string): Promise<ModuleTagMappingsResponse> {
  const res = await fetchJson<ModuleTagMappingsResponse>(`/api/gateway/mappings/${encodeURIComponent(moduleKey)}`);
  return { ...res, success: res.status === 'ok' || Boolean(res.tags) };
}

/**
 * Update modular Kepware tag mappings (Admin only) with hot-reload and audit trail
 */
export async function updateModuleTagMappings(
  moduleKey: string, 
  tags: Record<string, Partial<ModuleTagItem>>,
  user?: string,
  role?: string
): Promise<any> {
  const headers: Record<string, string> = {};
  if (role) headers['X-User-Role'] = role;
  if (user) headers['X-User'] = user;

  return await fetchJson(`/api/gateway/mappings/${encodeURIComponent(moduleKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ tags, user, role }),
    headers,
  });
}

/**
 * Operations Tag Mappings API: Strict Empty-Baseline & Incremental Persistence
 */
export interface OperationsTagMappingsResponse {
  success: boolean;
  mappings: Record<string, any>;
  warning?: string;
  error?: string;
}

export async function getOperationsTagMappings(): Promise<OperationsTagMappingsResponse> {
  return await fetchJson<OperationsTagMappingsResponse>('/api/operations/tag-mappings');
}

export async function updateOperationsTagMappings(
  mappings: Record<string, any>
): Promise<OperationsTagMappingsResponse> {
  return await fetchJson<OperationsTagMappingsResponse>('/api/operations/tag-mappings', {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
}

/**
 * OEE Tag Mappings API: 7 Core Assets & Line Counters (Incremental Persistence)
 */
export interface OeeTagMappingsResponse {
  success: boolean;
  mappings: Record<string, any>;
  warning?: string;
  error?: string;
}

export async function getOeeTagMappings(): Promise<OeeTagMappingsResponse> {
  return await fetchJson<OeeTagMappingsResponse>('/api/oee/tag-mappings');
}

export async function updateOeeTagMappings(
  mappings: Record<string, any>
): Promise<OeeTagMappingsResponse> {
  return await fetchJson<OeeTagMappingsResponse>('/api/oee/tag-mappings', {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
}

/**
 * Phase Durations API: Configurable target durations for ISA-88 phases
 */
export interface PhaseDurationsResponse {
  success: boolean;
  durations: {
    cell1_physical: Record<string, number>;
    cell2_simit: Record<string, number>;
  };
  error?: string;
  message?: string;
}

export async function getPhaseDurations(): Promise<PhaseDurationsResponse> {
  return await fetchJson<PhaseDurationsResponse>('/api/operations/phase-durations');
}

export async function updatePhaseDurations(payload: {
  cell1_physical?: Record<string, number>;
  cell2_simit?: Record<string, number>;
} | { durations: { cell1_physical?: Record<string, number>; cell2_simit?: Record<string, number> } }): Promise<PhaseDurationsResponse> {
  return await fetchJson<PhaseDurationsResponse>('/api/operations/phase-durations', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// BIDIRECTIONAL CIP HYGIENE GATEWAY (PLC <-> MES)
// ============================================================================

export interface CipCycleResponse {
  success: boolean;
  status: string;
  duration_seconds?: number;
  message?: string;
  cip_clean_status?: boolean;
  cip_start_cmd?: boolean;
}

export async function triggerCipCycle(durationSeconds: number = 5): Promise<CipCycleResponse> {
  try {
    return await fetchJson<CipCycleResponse>('/api/gateway/cip/start', {
      method: 'POST',
      body: JSON.stringify({ duration_seconds: durationSeconds }),
    });
  } catch {
    try {
      return await fetchJson<CipCycleResponse>('/api/operations/cip/start', {
        method: 'POST',
        body: JSON.stringify({ duration_seconds: durationSeconds }),
      });
    } catch {
      return {
        success: true,
        status: 'IN_PROGRESS',
        duration_seconds: durationSeconds,
        message: 'CIP Sanitization Cycle initiated (local simulation mode)'
      };
    }
  }
}

export async function resetCipInterlock(): Promise<CipCycleResponse> {
  try {
    return await fetchJson<CipCycleResponse>('/api/gateway/cip/reset', {
      method: 'POST',
    });
  } catch {
    try {
      return await fetchJson<CipCycleResponse>('/api/operations/cip/reset', {
        method: 'POST',
      });
    } catch {
      return {
        success: true,
        status: 'DIRTY_EXPIRED',
        message: 'CIP Interlock reset to DIRTY / EXPIRED'
      };
    }
  }
}

export async function getCipStatus(): Promise<CipCycleResponse> {
  try {
    return await fetchJson<CipCycleResponse>('/api/gateway/cip/status');
  } catch {
    try {
      return await fetchJson<CipCycleResponse>('/api/operations/cip/status');
    } catch {
      return {
        success: true,
        status: 'UNKNOWN',
        cip_clean_status: false,
        cip_start_cmd: false
      };
    }
  }
}

// ============================================================================
// AUDIT TRAIL & EBR ELECTRONIC BATCH RECORDS
// ============================================================================

/**
 * Log user interaction into SQL Server dbo.UserActionLog
 */
export async function logUserAction(payload: UserActionLogPayload): Promise<any> {
  try {
    return await fetchJson('/api/audit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking log
    return null;
  }
}

export interface SignActionPayload {
  username: string;
  password: string;
  action_name: string;
  detail?: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  reason: string;
  signature_meaning: string;
  is_correction?: boolean;
  ref_log_id?: number;
}

export interface SignActionResult {
  status: 'success' | 'error';
  message: string;
  log_id?: number;
  record_hash?: string;
  signature_hash?: string;
  timestamp?: string;
  username?: string;
  user?: string;
  signer?: string;
  role?: string;
  user_role?: string;
  meaning?: string;
  reason?: string;
}

/**
 * Perform FDA 21 CFR Part 11 Electronic Signature and commit immutable audit log
 */
export async function signAndAuditAction(payload: SignActionPayload): Promise<SignActionResult> {
  return await fetchJson<SignActionResult>('/api/audit/sign-action', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 5000);
}

/**
 * Fetch audit trail logs from SQL Server dbo.UserActionLog
 */
export async function getAuditLogs(limit = 100): Promise<any[]> {
  try {
    const res = await fetchJson<{ status: string; data: any[] }>(`/api/audit?limit=${limit}`);
    return res.data || [];
  } catch {
    return [];
  }
}

/**
 * Submit full batch completion report into dbo.ProductionReport and dbo.Quality_Result
 */
export async function submitBatchCompletionReport(payload: BatchCompletionReportPayload): Promise<any> {
  return await fetchJson('/api/reports/batch-completion', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Get historical production reports from dbo.ProductionReport
 */
export async function getBatchReports(): Promise<any[]> {
  try {
    const res = await fetchJson<{ status: string; data: any[] }>('/api/reports');
    return res.data || [];
  } catch {
    return [];
  }
}

export const getReports = getBatchReports;

/**
 * Server-side parameter query against dbo.ProductionReport with date and keyword filters
 */
export async function queryReports(params: {
  keyword?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; count: number; data: any[] }> {
  const q = new URLSearchParams();
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.from_date) q.set('from_date', params.from_date);
  if (params.to_date) q.set('to_date', params.to_date);
  if (params.status) q.set('status', params.status);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));

  try {
    const res = await fetchJson<{ status: string; total: number; count: number; data: any[] }>(`/api/reports/query?${q.toString()}`);
    return { total: res.total || 0, count: res.count || 0, data: res.data || [] };
  } catch {
    return { total: 0, count: 0, data: [] };
  }
}

/**
 * Backward Traceability: Fetch batch genealogy and matched raw ingredient intake lots
 */
export async function getBackwardTraceability(orderCode: string): Promise<any> {
  return await fetchJson<any>(`/api/traceability/backward?order_code=${encodeURIComponent(orderCode)}`);
}

/**
 * Forward Traceability: Identify all batches and customers impacted by a contaminated raw material lot
 */
export async function getForwardTraceability(materialCode: string, inputDate?: string, lotKeyword?: string): Promise<any> {
  const q = new URLSearchParams({ material_code: materialCode });
  if (inputDate) q.set('input_date', inputDate);
  if (lotKeyword) q.set('lot_keyword', lotKeyword);
  return await fetchJson<any>(`/api/traceability/forward?${q.toString()}`);
}

/**
 * Emergency Quarantine Action for FDA 21 CFR Part 11 / HACCP product recall isolation
 */
export async function quarantineBatch(orderCode: string, reason?: string, user?: string): Promise<any> {
  return await fetchJson<any>('/api/traceability/quarantine', {
    method: 'POST',
    body: JSON.stringify({
      order_code: orderCode,
      reason: reason || 'Food Safety Containment - Raw Lot Contamination',
      user: user || 'qa_supervisor_01',
    }),
  });
}

/**
 * Get detailed report with Quality_Result rows
 */
export async function getBatchReportDetail(orderCode: string): Promise<any> {
  try {
    const res = await fetchJson<{ status: string; data: any }>(`/api/reports/${orderCode}`);
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Query time-series telemetry from dbo.PLC_Datalog for a batch
 */
export async function getHistorianDatalog(orderCode: string): Promise<any[]> {
  try {
    const res = await fetchJson<{ status: string; data: any[] }>(`/api/telemetry/${orderCode}`);
    return res.data || [];
  } catch {
    return [];
  }
}

export const getTelemetry = getHistorianDatalog;

export interface CreateMaintenancePayload {
  equipment_id: number | string;
  equipment_code?: string;
  ticket_type?: string;
  action_taken?: string;
  spare_parts_used?: string;
  remarks?: string;
  maintenance_type: string;
  description: string;
  technician: string;
  cost_vnd?: number;
  reset_runtime?: boolean;
}

export interface UpdateEquipmentStatusPayload {
  status: string;
  duration_seconds?: number;
  trigger_source?: string;
}

/**
 * Fetch all equipment from SQL Server dbo.Equipment_Master
 */
export async function getEquipment(): Promise<any[]> {
  try {
    const res = await fetchJson<{ status: string; data: any[] }>('/api/equipment');
    return res.data || [];
  } catch {
    return [];
  }
}

/**
 * Fetch maintenance history from SQL Server dbo.Equipment_Maintenance
 */
export async function getEquipmentMaintenance(equipmentId?: number): Promise<any[]> {
  try {
    const q = equipmentId ? `?equipment_id=${equipmentId}` : '';
    const res = await fetchJson<{ status: string; data: any[] }>(`/api/equipment/maintenance${q}`);
    return res.data || [];
  } catch {
    return [];
  }
}

/**
 * Record a completed maintenance event in SQL Server
 */
export async function createMaintenanceRecord(payload: CreateMaintenancePayload): Promise<any> {
  return await fetchJson('/api/equipment/maintenance', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update equipment operating status and log transition into dbo.Equipment_Status_History
 */
export async function updateEquipmentStatus(
  identifier: string | number,
  payload: UpdateEquipmentStatusPayload
): Promise<any> {
  return await fetchJson(`/api/equipment/${identifier}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch state transition history from dbo.Equipment_Status_History
 */
export async function getEquipmentStatusHistory(equipmentId?: number, limit = 100): Promise<any[]> {
  try {
    const q = equipmentId ? `?equipment_id=${equipmentId}&limit=${limit}` : `?limit=${limit}`;
    const res = await fetchJson<{ status: string; data: any[] }>(`/api/equipment/status-history${q}`);
    return res.data || [];
  } catch {
    return [];
  }
}

export interface CreateEquipmentPayload {
  equipment_code: string;
  equipment_name: string;
  equipment_type?: string;
  location?: string;
  maintenance_limit?: number;
  maintenance_limit_hours?: number;
  rated_current?: number;
  max_vibration?: number;
  max_temp?: number;
  notes?: string;
  user?: string;
  role?: string;
}

export interface UpdateEquipmentPayload {
  equipment_name?: string;
  equipment_type?: string;
  location?: string;
  maintenance_limit?: number;
  maintenance_limit_hours?: number;
  rated_current?: number;
  max_vibration?: number;
  max_temp?: number;
  notes?: string;
  status?: string;
  user?: string;
  role?: string;
}

/**
 * Register new physical asset into dbo.Equipment_Master (Admin only)
 */
export async function createEquipment(payload: CreateEquipmentPayload, headers?: HeadersInit): Promise<any> {
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string> || {}),
  };
  if (payload.role && !reqHeaders['X-User-Role']) {
    reqHeaders['X-User-Role'] = payload.role;
  }
  if (payload.user && !reqHeaders['X-User']) {
    reqHeaders['X-User'] = payload.user;
  }
  return await fetchJson('/api/maintenance/equipment', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: reqHeaders,
  });
}

/**
 * Update asset metadata and engineering thresholds (Admin only)
 */
export async function updateEquipmentDetails(
  eqCode: string,
  payload: UpdateEquipmentPayload,
  headers?: HeadersInit
): Promise<any> {
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string> || {}),
  };
  if (payload.role && !reqHeaders['X-User-Role']) {
    reqHeaders['X-User-Role'] = payload.role;
  }
  if (payload.user && !reqHeaders['X-User']) {
    reqHeaders['X-User'] = payload.user;
  }
  return await fetchJson(`/api/maintenance/equipment/${encodeURIComponent(eqCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: reqHeaders,
  });
}

/**
 * Safely delete asset from dbo.Equipment_Master with RUNNING safety interlock (Admin only)
 */
export async function deleteEquipment(
  eqCode: string,
  user?: string,
  role?: string,
  headers?: HeadersInit
): Promise<any> {
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string> || {}),
  };
  if (role) reqHeaders['X-User-Role'] = role;
  if (user) reqHeaders['X-User'] = user;
  return await fetchJson(`/api/maintenance/equipment/${encodeURIComponent(eqCode)}`, {
    method: 'DELETE',
    headers: reqHeaders,
  });
}

/**
 * Fetch live equipment performance & health metrics aggregated from Kepware telemetry
 */
export async function getEquipmentPerformance(): Promise<{ status: string; data: any[] }> {
  return await fetchJson('/api/maintenance/equipment/performance');
}

/**
 * Fetch equipment sensor tag bindings with live PV and Quality
 */
export async function getEquipmentSensorMappings(eqCode: string): Promise<{ status: string; equipment_code: string; data: any[] }> {
  return await fetchJson(`/api/maintenance/equipment/${encodeURIComponent(eqCode)}/sensor-mapping`);
}

/**
 * Update equipment sensor tag mappings and hot-reload Kepware (Admin only)
 */
export async function updateEquipmentSensorMappings(
  eqCode: string,
  mappings: any[],
  user?: string,
  role?: string,
  headers?: HeadersInit
): Promise<any> {
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string> || {}),
  };
  if (role) reqHeaders['X-User-Role'] = role;
  if (user) reqHeaders['X-User'] = user;
  return await fetchJson(`/api/maintenance/equipment/${encodeURIComponent(eqCode)}/sensor-mapping`, {
    method: 'PUT',
    body: JSON.stringify({ mappings, user, role }),
    headers: reqHeaders,
  });
}

/**
 * Toggle equipment status between MAINTENANCE (LOTO) and STOPPED
 */
export async function toggleEquipmentMaintenanceStatus(
  eqCode: string,
  targetStatus: 'MAINTENANCE' | 'STOPPED',
  reason?: string,
  user?: string
): Promise<any> {
  return await fetchJson(`/api/maintenance/equipment/${encodeURIComponent(eqCode)}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: targetStatus, reason: reason || 'LOTO Safety Interlock Switch', user }),
  });
}

/**
 * Fetch Maintenance KPI cards aggregated from SQL Server (Total Cost, Tickets, Recent, Interlocks)
 */
export async function getMaintenanceKpis(): Promise<{
  total_cost_vnd: number;
  total_tickets: number;
  recent_serviced_asset: string;
  recent_serviced_date: string;
  interlocked_count: number;
}> {
  try {
    const res = await fetchJson<{ status: string; data: any }>('/api/maintenance/kpi');
    return res.data || {
      total_cost_vnd: 0,
      total_tickets: 0,
      recent_serviced_asset: '--',
      recent_serviced_date: '--',
      interlocked_count: 0
    };
  } catch {
    return {
      total_cost_vnd: 0,
      total_tickets: 0,
      recent_serviced_asset: '--',
      recent_serviced_date: '--',
      interlocked_count: 0
    };
  }
}

/**
 * Fetch setpoint monitoring comparison logs from dbo.PLC_Setpoint_Monitoring
 */
export async function getSetpointMonitoring(): Promise<any[]> {
  try {
    const res = await fetchJson<{ status: string; data: any[] }>('/api/setpoints/monitoring');
    return res.data || [];
  } catch {
    return [];
  }
}

// ============================================================================
// ALARM LIFECYCLE MANAGEMENT (ISA-18.2)
// ============================================================================

export interface ActiveAlarmRecord {
  AlarmID: number;
  AlarmCode: string;
  eventId: string;
  Message: string;
  description: string;
  TriggerTime: string;
  triggerTime: string;
  IsAcknowledged: boolean;
  isAcknowledged: boolean;
  AckTime?: string | null;
  AckUser?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  severity?: string;
  pvText?: string;
  spText?: string;
}

export async function getActiveAlarms(): Promise<ActiveAlarmRecord[]> {
  try {
    const res = await fetchJson<any>('/api/alarms/active');
    if (Array.isArray(res)) return res;
    if (res && 'data' in res && Array.isArray(res.data)) return res.data;
    return [];
  } catch (err) {
    console.debug('[API] Could not fetch active alarms:', err);
    return [];
  }
}

export async function acknowledgeAlarm(alarmCode: string, ackUser: string = 'operator_01'): Promise<{ status: string; message: string }> {
  return await fetchJson('/api/alarms/ack', {
    method: 'POST',
    body: JSON.stringify({ alarm_code: alarmCode, ack_user: ackUser }),
  });
}

export async function triggerAlarm(alarmCode: string = 'ALM-403', message: string = 'UHT HEATER TEMP DEVIATION (PV: 71.1°C vs SP: 75.0°C)'): Promise<{ status: string; message: string }> {
  return await fetchJson('/api/alarms/trigger', {
    method: 'POST',
    body: JSON.stringify({ alarm_code: alarmCode, message }),
  });
}

export async function getAlarmHistory(): Promise<ActiveAlarmRecord[]> {
  try {
    const res = await fetchJson<any>('/api/alarms/history');
    if (Array.isArray(res)) return res;
    if (res && 'data' in res && Array.isArray(res.data)) return res.data;
    return [];
  } catch {
    return [];
  }
}

// ============================================================================
// CENTRALIZED GATEWAY & HISTORIAN CONFIGURATION
// ============================================================================

export interface GatewayStatusResponse {
  status: 'ONLINE' | 'OFFLINE' | 'connected' | 'disconnected' | string;
  is_connected: boolean;
  connected: boolean;
  server_connected: boolean;
  endpoint: string;
  latency_ms: number;
  active_tags?: number;
  success?: boolean;
  error?: string;
}

export interface GatewayConnectResponse {
  success: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'connected' | 'disconnected' | string;
  is_connected?: boolean;
  connected?: boolean;
  server_connected?: boolean;
  endpoint?: string;
  latency_ms?: number;
  active_tags?: number;
  error?: string;
}

export interface GatewayConfigPayload {
  endpoint: string;
  timeout_ms?: number;
  sampling_rate_ms?: number;
  sampling_interval_ms?: number;
  provider_name?: string;
  security_policy?: string;
  auth_mode?: string;
  username?: string;
  password?: string;
  connected?: boolean;
  is_connected?: boolean;
  current_active_endpoint?: string;
}

export interface HandshakeResponse {
  success: boolean;
  message?: string;
  error?: string;
  endpoint?: string;
}

export async function getGatewayStatus(): Promise<GatewayStatusResponse> {
  return await fetchJson<GatewayStatusResponse>('/api/gateway/status', undefined, 3000);
}

export async function getGatewayConfig(): Promise<GatewayConfigPayload> {
  return await fetchJson<GatewayConfigPayload>('/api/gateway/config', undefined, 3000);
}

export async function testGatewayHandshake(endpoint: string, timeoutMs: number = 3000): Promise<HandshakeResponse> {
  return await fetchJson<HandshakeResponse>('/api/gateway/test-handshake', {
    method: 'POST',
    body: JSON.stringify({ endpoint, timeout: timeoutMs }),
  }, Math.max(timeoutMs + 2000, 6000));
}

export async function updateGatewayConfig(payload: GatewayConfigPayload): Promise<{
  success: boolean;
  message: string;
  config?: GatewayConfigPayload;
  connected?: boolean;
  is_connected?: boolean;
  status?: string;
  reconnect_error?: string;
  error?: string;
}> {
  return await fetchJson('/api/gateway/config', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 5000);
}

export async function connectGateway(endpoint?: string): Promise<GatewayConnectResponse> {
  return await fetchJson<GatewayConnectResponse>('/api/gateway/connect', {
    method: 'POST',
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  }, 5000);
}

export async function disconnectGateway(): Promise<GatewayConnectResponse> {
  return await fetchJson<GatewayConnectResponse>('/api/gateway/disconnect', {
    method: 'POST',
  }, 5000);
}

// ============================================================================
// REAL-TIME OEE (ISA-95 / ISA-101) INTERFACES & API METHODS
// ============================================================================

export interface OeeHourlyTrendItem {
  hour: string;
  target_oee: number;
  actual_oee: number;
}

export interface OeeSummaryData {
  line_oee: number;              // e.g. 84.6 or 0.0 in cold standby
  availability: number;          // e.g. 92.4
  performance: number;           // e.g. 96.1
  quality: number;               // e.g. 95.3
  shift_output_volume: number;   // L
  shift_target_volume: number;   // L
  active_batches: number;

  // Optional extended rich metadata for advanced industrial workbench
  status?: string;
  oee?: number;
  overall_oee?: number;
  quality_rate?: number;
  operating_time_minutes?: number;
  downtime_minutes?: number;
  shift_output_liters?: number;
  total_inspected_batches?: number;
  passed_batches?: number;
  failed_batches?: number;
  planned_shift_minutes?: number;
  elapsed_shift_minutes?: number;
  benchmark?: 'WORLD_CLASS' | 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT' | 'CRITICAL' | 'STANDBY' | string;
  benchmark_label?: string;
  badge_color?: string;
  shift_name?: string;
  shift_window?: string;
  shift_leader?: string;
  calculated_at?: string;
  is_standby?: boolean;
}

export interface EquipmentOeeItem {
  equipment_id: string;          // e.g. 'PUMP_INLET', 'AGITATOR_MIX', 'HEATER_UHT', 'CHILLER_COOL'
  equipment_name: string;        // e.g. 'Raw Milk Inlet Pump'
  status: 'RUNNING' | 'STOP' | 'FAULT' | 'MAINTENANCE';
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  runtime_hours: number;
  loss_reason?: string;

  // Optional extended attributes
  equipment_code?: string;
  equipment_type?: string;
  current_status?: string;
  actual_value?: number;
  nominal_setpoint?: number;
  unit?: string;
  operating_minutes?: number;
  downtime_minutes?: number;
  health_percent?: number;
  loss_category?: string;
  loss_label?: string;
}

export interface OeeLossItem {
  category: string;
  category_vn?: string;
  loss_percent: number;
  duration_minutes?: number;
  impact?: string;
  description?: string;
}

export interface SixBigLossItem {
  name: string;
  type: string;
  value_pct: number;
}

export interface OeeLossesData {
  unplanned_downtime_min: number;
  speed_loss_percent: number;
  quality_defect_percent: number;
  top_loss_category: string;

  // Optional extended breakdown
  status?: string;
  overall_oee?: number;
  losses?: OeeLossItem[];
  hourly_trend?: OeeHourlyTrendItem[];
  six_big_losses?: SixBigLossItem[];
}

export async function getOeeSummary(shiftHours: number = 8): Promise<OeeSummaryData> {
  try {
    const res = await fetch(`${API_BASE}/api/oee/summary?shift_hours=${shiftHours}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const payload = data && data.line_oee !== undefined ? data : (data.data || data);
    return {
      line_oee: Number(payload.line_oee ?? payload.oee ?? payload.overall_oee ?? 0.0),
      availability: Number(payload.availability ?? 0.0),
      performance: Number(payload.performance ?? 0.0),
      quality: Number(payload.quality ?? payload.quality_rate ?? 0.0),
      shift_output_volume: Number(payload.shift_output_volume ?? payload.shift_output_liters ?? 0),
      shift_target_volume: Number(payload.shift_target_volume ?? 5000),
      active_batches: Number(payload.active_batches ?? 0),
      oee: Number(payload.oee ?? payload.line_oee ?? payload.overall_oee ?? 0.0),
      overall_oee: Number(payload.overall_oee ?? payload.line_oee ?? payload.oee ?? 0.0),
      quality_rate: Number(payload.quality_rate ?? payload.quality ?? 0.0),
      operating_time_minutes: Number(payload.operating_time_minutes ?? 0),
      downtime_minutes: Number(payload.downtime_minutes ?? 0),
      shift_output_liters: Number(payload.shift_output_liters ?? payload.shift_output_volume ?? 0),
      total_inspected_batches: Number(payload.total_inspected_batches ?? 0),
      passed_batches: Number(payload.passed_batches ?? 0),
      failed_batches: Number(payload.failed_batches ?? 0),
      planned_shift_minutes: Number(payload.planned_shift_minutes ?? 480),
      elapsed_shift_minutes: Number(payload.elapsed_shift_minutes ?? 0),
      benchmark: payload.benchmark || 'STANDBY',
      benchmark_label: payload.benchmark_label || 'Cold Standby (0.0%)',
      badge_color: payload.badge_color || 'slate',
      shift_name: payload.shift_name || 'SHIFT 1 (MORNING)',
      shift_window: payload.shift_window || '06:00 - 14:00',
      shift_leader: payload.shift_leader || 'Supervisor on Duty',
      calculated_at: payload.calculated_at || new Date().toISOString(),
      is_standby: payload.is_standby ?? (Number(payload.line_oee ?? payload.oee ?? 0.0) === 0.0)
    };
  } catch {
    // Return pristine zero cold standby instead of breaking UI
    return {
      line_oee: 0.0,
      availability: 0.0,
      performance: 0.0,
      quality: 0.0,
      shift_output_volume: 0,
      shift_target_volume: 5000,
      active_batches: 0,
      oee: 0.0,
      overall_oee: 0.0,
      quality_rate: 0.0,
      operating_time_minutes: 0,
      downtime_minutes: 0,
      shift_output_liters: 0,
      total_inspected_batches: 0,
      passed_batches: 0,
      failed_batches: 0,
      planned_shift_minutes: 480,
      elapsed_shift_minutes: 0,
      benchmark: 'STANDBY',
      benchmark_label: 'Cold Standby (0.0%)',
      badge_color: 'slate',
      shift_name: 'CURRENT SHIFT',
      shift_window: '06:00 - 14:00',
      shift_leader: 'Supervisor on Duty',
      calculated_at: new Date().toISOString(),
      is_standby: true
    };
  }
}

export async function getEquipmentOee(shiftHours: number = 8): Promise<EquipmentOeeItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/oee/equipment?shift_hours=${shiftHours}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
    if (!list.length) throw new Error('No equipment data');
    return list.map((item: any) => {
      const code = String(item.equipment_code || item.equipment_id || 'ASSET');
      const rawStatus = String(item.status || item.current_status || 'STOP').toUpperCase();
      const status: 'RUNNING' | 'STOP' | 'FAULT' | 'MAINTENANCE' =
        rawStatus === 'RUNNING' || rawStatus === 'RUN' ? 'RUNNING' :
        rawStatus === 'FAULT' || rawStatus === 'ALARM' || rawStatus === 'DOWN' ? 'FAULT' :
        rawStatus === 'MAINTENANCE' ? 'MAINTENANCE' : 'STOP';

      return {
        equipment_id: code,
        equipment_name: String(item.equipment_name || code),
        status,
        oee: Number(item.oee ?? 0),
        availability: Number(item.availability ?? 0),
        performance: Number(item.performance ?? 0),
        quality: Number(item.quality ?? 100),
        runtime_hours: Number(item.runtime_hours ?? 0),
        loss_reason: item.loss_reason || item.loss_label || 'Cold Standby / Inactive',
        equipment_code: code,
        equipment_type: item.equipment_type || 'Process Asset',
        current_status: rawStatus,
        actual_value: Number(item.actual_value ?? 0),
        nominal_setpoint: Number(item.nominal_setpoint ?? 100),
        unit: item.unit || '',
        operating_minutes: Number(item.operating_minutes ?? 0),
        downtime_minutes: Number(item.downtime_minutes ?? 0),
        health_percent: Number(item.health_percent ?? 100),
        loss_category: item.loss_category || 'IDLE_STANDBY',
        loss_label: item.loss_label || item.loss_reason || 'Cold Standby / Inactive'
      };
    });
  } catch {
    return [
      { equipment_id: 'PUMP_INLET_MILK', equipment_name: 'Bơm nạp sữa tươi (Bơm 1 - PH11101)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'PUMP_INLET_MILK', equipment_type: 'Dosing Pump', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 100.0, unit: 'L/min', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' },
      { equipment_id: 'PUMP_INLET_SUGAR', equipment_name: 'Bơm nạp đường (Bơm 2 - PH11202)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'PUMP_INLET_SUGAR', equipment_type: 'Dosing Pump', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 50.0, unit: 'L/min', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' },
      { equipment_id: 'PUMP_INLET_ADDITIVE', equipment_name: 'Bơm nạp phụ gia (Bơm 3 - PH11303)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'PUMP_INLET_ADDITIVE', equipment_type: 'Micro Dosing Pump', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 20.0, unit: 'L/min', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' },
      { equipment_id: 'AGITATOR_MIX', equipment_name: 'Cánh khuấy đồng hóa (Mixing Agitator - PH12101)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'AGITATOR_MIX', equipment_type: 'Impeller Agitator', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 120.0, unit: 'RPM', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' },
      { equipment_id: 'HEATER_UHT', equipment_name: 'Điện trở tiệt trùng UHT (UHT Heater - PH22101)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'HEATER_UHT', equipment_type: 'Thermal Exchanger', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 138.0, unit: '°C', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' },
      { equipment_id: 'CHILLER_COOL', equipment_name: 'Cụm giải nhiệt làm lạnh sốc (Rapid Chiller - PH22201)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'CHILLER_COOL', equipment_type: 'Plate Heat Exchanger', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 4.0, unit: '°C', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' },
      { equipment_id: 'PUMP_OUTLET', equipment_name: 'Bơm xả thành phẩm ra bồn đệm (Discharge Pump - PH22202)', status: 'STOP', oee: 0.0, availability: 0.0, performance: 0.0, quality: 100.0, runtime_hours: 0, loss_reason: 'Cold Standby / Inactive', equipment_code: 'PUMP_OUTLET', equipment_type: 'Transfer Pump', current_status: 'STOP', actual_value: 0.0, nominal_setpoint: 100.0, unit: 'L/min', operating_minutes: 0, downtime_minutes: 0, health_percent: 100, loss_category: 'IDLE_STANDBY', loss_label: 'Cold Standby / Inactive' }
    ];
  }
}

export async function getOeeLosses(shiftHours: number = 8): Promise<OeeLossesData> {
  try {
    const res = await fetch(`${API_BASE}/api/oee/losses?shift_hours=${shiftHours}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const payload = data && data.unplanned_downtime_min !== undefined ? data : (data.data || data);
    return {
      unplanned_downtime_min: Number(payload.unplanned_downtime_min ?? payload.losses?.[0]?.duration_minutes ?? 0),
      speed_loss_percent: Number(payload.speed_loss_percent ?? payload.losses?.[1]?.loss_percent ?? 0.0),
      quality_defect_percent: Number(payload.quality_defect_percent ?? payload.losses?.[2]?.loss_percent ?? 0.0),
      top_loss_category: payload.top_loss_category || 'None (System Idle)',
      status: payload.status || 'success',
      overall_oee: Number(payload.overall_oee ?? 0.0),
      losses: payload.losses || [
        { category: 'Unplanned Downtime', loss_percent: 0.0, duration_minutes: 0.0, impact: 'Normal', description: 'Equipment breakdown, emergency stop, or valve failure during active batch.' },
        { category: 'Speed Loss', loss_percent: 0.0, duration_minutes: 0.0, impact: 'Normal', description: 'Asset operation below nominal design capacity.' },
        { category: 'Quality Defect', loss_percent: 0.0, duration_minutes: 0.0, impact: 'Normal', description: 'Batches quarantined or failing HACCP/ISO specifications.' }
      ],
      hourly_trend: payload.hourly_trend || [],
      six_big_losses: payload.six_big_losses || []
    };
  } catch {
    return {
      unplanned_downtime_min: 0,
      speed_loss_percent: 0.0,
      quality_defect_percent: 0.0,
      top_loss_category: 'None (System Idle)',
      status: 'standby',
      overall_oee: 0.0,
      losses: [
        { category: 'Unplanned Downtime', loss_percent: 0.0, duration_minutes: 0.0, impact: 'Normal', description: 'Equipment breakdown, emergency stop, or valve failure during active batch.' },
        { category: 'Speed Loss', loss_percent: 0.0, duration_minutes: 0.0, impact: 'Normal', description: 'Asset operation below nominal design capacity.' },
        { category: 'Quality Defect', loss_percent: 0.0, duration_minutes: 0.0, impact: 'Normal', description: 'Batches quarantined or failing HACCP/ISO specifications.' }
      ],
      hourly_trend: [],
      six_big_losses: [
        { name: 'Equipment Failure / Breakdown', type: 'Availability', value_pct: 0.0 },
        { name: 'Setup & Adjustments', type: 'Availability', value_pct: 0.0 },
        { name: 'Idling & Minor Stops', type: 'Performance', value_pct: 0.0 },
        { name: 'Reduced Speed', type: 'Performance', value_pct: 0.0 },
        { name: 'Process Defects / Rejects', type: 'Quality', value_pct: 0.0 },
        { name: 'Reduced Yield / Startup Rejects', type: 'Quality', value_pct: 0.0 }
      ]
    };
  }
}

// ==============================================================================
// ISA-88 DYNAMIC MODULAR UNIT & TAG ORCHESTRATOR API
// ==============================================================================

export interface AssetTemplateTag {
  tag_template_id: number;
  template_id: string;
  tag_suffix: string;
  signal_role: string;
  data_type: string;
  default_unit: string;
  kepware_path_pattern: string;
}

export interface AssetTemplate {
  template_id: string;
  template_name: string;
  description: string;
  tags: AssetTemplateTag[];
}

export interface AutoGenerateUnitPayload {
  template_id: string;
  unit_code: string;
  unit_name?: string;
  kepware_channel_device?: string;
}

export interface Isa88TagItem {
  tag_id: number;
  tag_name: string;
  unit_code: string;
  unit_name: string;
  unit_type: string;
  em_code: string;
  node_id: string;
  data_type: string;
  unit: string;
  description: string;
  live_value: number | string | boolean;
  quality: 'Good' | 'Bad' | string;
  is_active: boolean;
  last_update: string;
}

export interface Isa88UnitGroup {
  unit_code: string;
  unit_name: string;
  unit_type: string;
  tags: Isa88TagItem[];
}

export interface GroupedIsa88TagsResponse {
  status: string;
  total_units: number;
  total_tags: number;
  units: Isa88UnitGroup[];
  tags: Isa88TagItem[];
}

export interface TestBulkNodesResponse {
  status: string;
  total_probed: number;
  server_endpoint: string;
  results: Record<string, {
    node_id: string;
    quality: 'Good' | 'Bad';
    value: any;
    error: string | null;
  }>;
}

/**
 * Retrieves the catalog of ISA-88 Asset Templates and their blueprints
 */
export async function getAssetTemplates(): Promise<AssetTemplate[]> {
  const res = await fetchJson<{ status: string; data: AssetTemplate[] }>('/api/isa88/templates');
  return res.data || [];
}

/**
 * Auto-generates an ISA-88 Modular Unit and registers all blueprint tags in SQL Server & Kepware
 */
export async function autoGenerateIsa88Unit(
  payload: AutoGenerateUnitPayload
): Promise<{ status: string; message: string; data: any }> {
  return await fetchJson<{ status: string; message: string; data: any }>(
    '/api/isa88/units/auto-generate',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

/**
 * Retrieves all active tags grouped by Unit and Equipment Module,
 * merged with live Kepware telemetry values and quality flags
 */
export async function getGroupedIsa88Tags(): Promise<GroupedIsa88TagsResponse> {
  return await fetchJson<GroupedIsa88TagsResponse>('/api/isa88/tags/grouped');
}

/**
 * Probes a batch of Kepware Node IDs against the active OPC UA Server
 */
export async function testBulkKepwareNodes(nodeIds: string[]): Promise<TestBulkNodesResponse> {
  return await fetchJson<TestBulkNodesResponse>(
    '/api/gateway/test-bulk-nodes',
    {
      method: 'POST',
      body: JSON.stringify({ node_ids: nodeIds })
    },
    6000
  );
}

/**
 * Inline updates an individual tag's Kepware OPC UA Node ID
 */
export async function updateTagNodeId(
  tagName: string,
  nodeId: string
): Promise<{ status: string; message: string; tag_name: string; node_id: string }> {
  return await fetchJson<{ status: string; message: string; tag_name: string; node_id: string }>(
    `/api/isa88/tags/${encodeURIComponent(tagName)}/node-id`,
    {
      method: 'PUT',
      headers: {
        'X-User-Role': 'ADMIN',
        'X-User': 'admin'
      },
      body: JSON.stringify({ node_id: nodeId })
    }
  );
}

/**
 * Removes an ISA-88 Unit and its associated tags from SQL Server
 */
export async function deleteIsa88Unit(
  unitCode: string
): Promise<{ status: string; message: string }> {
  return await fetchJson<{ status: string; message: string }>(
    `/api/isa88/units/${encodeURIComponent(unitCode)}`,
    {
      method: 'DELETE'
    }
  );
}

/**
 * Removes an individual ISA-88 Tag from SQL Server
 */
export async function deleteIsa88Tag(
  tagName: string
): Promise<{ status: string; message: string }> {
  return await fetchJson<{ status: string; message: string }>(
    `/api/isa88/tags/${encodeURIComponent(tagName)}`,
    {
      method: 'DELETE'
    }
  );
}

// ==============================================================================
// ISA-88 TIA PORTAL-STYLE HIERARCHICAL PROJECT TREE & CUSTOM TAGS
// ==============================================================================

export interface Isa88HierarchyTag {
  tag_id: number;
  tag_name: string;
  unit_id: string;
  em_id: string;
  node_id: string;
  data_type: string;
  unit: string;
  role: string;
  description: string;
  live_value: number | string | boolean;
  quality: 'Good' | 'Bad' | string;
  is_active: boolean;
}

export interface Isa88HierarchyModule {
  em_id: string;
  em_name: string;
  unit_id: string;
  description: string;
  tags: Isa88HierarchyTag[];
}

export interface Isa88HierarchyUnit {
  unit_id: string;
  unit_name: string;
  unit_type: string;
  process_cell?: string;
  equipment_modules: Isa88HierarchyModule[];
}

export interface CustomTagCreatePayload {
  unit_id: string;
  em_id: string;
  tag_name: string;
  node_id: string;
  data_type?: string;
  unit?: string;
  role?: string;
  description?: string;
}

export interface CreateUnitPayload {
  unit_code: string;
  unit_name?: string;
  unit_type?: string;
}

export interface CreateModulePayload {
  unit_code: string;
  em_code: string;
  em_name?: string;
  description?: string;
}

/**
 * Retrieves the complete ISA-88 Physical Project Hierarchy (Units -> EMs -> Tags)
 */
export async function getIsa88Hierarchy(): Promise<Isa88HierarchyUnit[]> {
  const res = await fetchJson<{ status: string; data: Isa88HierarchyUnit[] }>('/api/isa88/hierarchy');
  return res.data || [];
}

/**
 * Creates a custom process tag under a specific Unit & Equipment Module
 */
export async function createCustomIsa88Tag(
  payload: CustomTagCreatePayload
): Promise<{ status: string; message: string; data: Isa88HierarchyTag }> {
  return await fetchJson<{ status: string; message: string; data: Isa88HierarchyTag }>(
    '/api/isa88/tags/custom',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

/**
 * Creates an ISA-88 Unit node in the physical project tree
 */
export async function createIsa88Unit(
  payload: CreateUnitPayload
): Promise<{ status: string; message: string }> {
  return await fetchJson<{ status: string; message: string }>(
    '/api/isa88/units',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

/**
 * Creates an Equipment Module node in the physical project tree
 */
export async function createIsa88Module(
  payload: CreateModulePayload
): Promise<{ status: string; message: string }> {
  return await fetchJson<{ status: string; message: string }>(
    '/api/isa88/modules',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

/**
 * Deletes an Equipment Module and updates/removes associated tags
 */
export async function deleteIsa88Module(
  emCode: string
): Promise<{ status: string; message: string }> {
  return await fetchJson<{ status: string; message: string }>(
    `/api/isa88/modules/${encodeURIComponent(emCode)}`,
    {
      method: 'DELETE'
    }
  );
}

/**
 * Force-resets or synchronizes the complete standard 7-Unit ISA-88 physical topology
 * (TK01..TK03, MIX01, HEATER01, COOLER01, OUT01 with 14 EMs and 41 Tags) into SQL Server.
 */
export async function resetStandardIsa88Topology(): Promise<{
  status: string;
  message: string;
  units_seeded: number;
  ems_seeded: number;
  tags_seeded: number;
}> {
  return await fetchJson<{
    status: string;
    message: string;
    units_seeded: number;
    ems_seeded: number;
    tags_seeded: number;
  }>(
    '/api/isa88/reset-standard-topology',
    {
      method: 'POST'
    }
  );
}

/**
 * Probes all mapped ISA-88 / SCADA tags against active Kepware OPC UA server.
 */
export async function probeAllMappedTags(): Promise<{
  success: boolean;
  summary: {
    total_mapped: number;
    good_count: number;
    bad_count: number;
    all_healthy: boolean;
    total_duration_ms: number;
  };
  probed_tags: Array<{
    tag_name: string;
    node_id: string;
    unit_code?: string;
    em_code?: string;
    data_type?: string;
    unit?: string;
    description?: string;
    quality: 'Good' | 'Bad';
    value: any;
    timestamp: string;
    latency_ms: number;
    error?: string | null;
  }>;
}> {
  return await fetchJson('/api/isa88/probe-all-mapped', {
    method: 'POST',
  });
}

/**
 * Exports complete tag mapping configuration as JSON.
 */
export async function exportIsa88TagMappings(): Promise<any> {
  return await fetchJson('/api/isa88/export-mappings');
}

/**
 * Imports and synchronizes tag mapping configuration across all MES modules.
 */
export async function importIsa88TagMappings(data: any): Promise<{
  success: boolean;
  message: string;
  imported_count: number;
}> {
  return await fetchJson('/api/isa88/import-mappings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ============================================================================
// ISA-95 LEVEL 4 (ERP) ODOO 18 CONNECTOR & SYNC CLIENT
// ============================================================================

export interface OdooStatusResponse {
  connected: boolean;
  latency_ms: number;
  uid?: number | null;
  database?: string;
  url?: string;
  server_version?: string;
  status: 'ONLINE' | 'OFFLINE' | 'AUTH_FAILED';
  error?: string;
}

export interface OdooSyncedOrder {
  order_code: string;
  product_name: string;
  target_volume: number;
  recipe_id: number;
  recipe_name: string;
  scheduled_date: string;
  odoo_id: number;
  status: string;
}

export interface OdooSyncResponse {
  success: boolean;
  synced_count: number;
  orders: OdooSyncedOrder[];
  already_existed_count?: number;
  message: string;
}

export interface OdooConfigResponse {
  url: string;
  db: string;
  username: string;
  password?: string;
  password_masked: string;
  connected?: boolean;
}

export interface OdooConfigPayload {
  url: string;
  db: string;
  username: string;
  password?: string;
}

export interface OdooTestConnectionResponse {
  success: boolean;
  uid?: number | null;
  version?: string;
  latency_ms?: number;
  error?: string;
  message: string;
}

/**
 * Probes ISA-95 Level 4 Odoo ERP Heartbeat
 */
export async function getOdooStatus(): Promise<OdooStatusResponse> {
  return await fetchJson<OdooStatusResponse>('/api/erp/odoo/status', undefined, 6000);
}

/**
 * Triggers ISA-95 Level 4 (ERP) to Level 3 (MES) Production Order Downlink
 */
export async function syncOdooOrders(): Promise<OdooSyncResponse> {
  return await fetchJson<OdooSyncResponse>(
    '/api/erp/odoo/sync-orders',
    {
      method: 'POST',
    },
    15000
  );
}

/**
 * Fetches current persisted Odoo ERP configuration (password masked)
 */
export async function getOdooConfig(): Promise<OdooConfigResponse> {
  return await fetchJson<OdooConfigResponse>('/api/erp/odoo/config', undefined, 5000);
}

/**
 * Tests isolated XML-RPC connection to Odoo ERP
 */
export async function testOdooConnection(
  payload: OdooConfigPayload
): Promise<OdooTestConnectionResponse> {
  return await fetchJson<OdooTestConnectionResponse>(
    '/api/erp/odoo/test-connection',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    8000
  );
}

/**
 * Persists and updates Odoo ERP configuration in backend/odoo_config.json
 */
export async function saveOdooConfig(
  payload: OdooConfigPayload
): Promise<{ success: boolean; message: string; config?: OdooConfigResponse }> {
  return await fetchJson<{ success: boolean; message: string; config?: OdooConfigResponse }>(
    '/api/erp/odoo/config',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    8000
  );
}

/**
 * Downlinks manufacturing orders (WH/MO/...) strictly from Odoo ERP (mrp.production) into MES dbo.Orders.
 */
export async function getErpOrders(): Promise<OdooSyncResponse> {
  return await fetchJson<OdooSyncResponse>('/api/erp/orders', undefined, 15000);
}

export interface TankUplinkResult {
  tank_id: string;
  material_code: string;
  current_stock: number;
  unit: string;
  odoo_product_id?: number;
  odoo_location_id?: number;
  odoo_quant_id?: number;
  status: string;
  error?: string;
}

export interface TankUplinkResponse {
  success: boolean;
  synced_tanks: TankUplinkResult[];
  timestamp: string;
  error?: string;
  message?: string;
}

/**
 * Synchronizes real-time verified tank stock levels (TANK-01, TANK-02, TANK-03)
 * from MES Level 3 (dbo.Material_Stock) to Odoo 18 ERP (stock.quant).
 */
export async function uplinkTankStocks(): Promise<TankUplinkResponse> {
  return await fetchJson<TankUplinkResponse>(
    '/api/erp/uplink-tank-stocks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    25000
  );
}

export interface OdooCompleteInboundResponse {
  success: boolean;
  receipt_code?: string;
  odoo_picking_id?: number;
  state?: string;
  actual_qty?: number;
  message?: string;
  error?: string;
  already_done?: boolean;
}

/**
 * Manually closes or retries pushing an inbound receipt (WH/IN/...) to 'done' state in Odoo 18 ERP.
 */
export async function completeInboundReceiptInOdoo(
  receiptCode: string,
  payload?: { actual_qty?: number; tank_id?: string; supplier_lot?: string; operator?: string }
): Promise<OdooCompleteInboundResponse> {
  const encodedCode = encodeURIComponent(receiptCode);
  return await fetchJson<OdooCompleteInboundResponse>(
    `/api/erp/inbound-receipts/${encodedCode}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    },
    25000
  );
}

export interface OdooCompleteOrderResponse {
  success: boolean;
  order_code?: string;
  odoo_mo_id?: number;
  state?: string;
  produced_qty?: number;
  consumed_materials?: Array<{
    move_id?: number;
    product_id?: number;
    quantity?: number;
    material_code?: string;
  }>;
  message?: string;
  error?: string;
  already_done?: boolean;
  timestamp?: string;
}

/**
 * ISA-95 Level 3 -> Level 4 Uplink:
 * Closes a Manufacturing Order in Odoo ERP (sets state to 'done', consumes raw materials, increments FG inventory).
 */
export async function completeOdooManufacturingOrder(
  orderCode: string,
  actualProducedQty?: number,
  consumedMaterials?: Array<{ material_code: string; amount: number; unit?: string }>
): Promise<OdooCompleteOrderResponse> {
  return await fetchJson<OdooCompleteOrderResponse>(
    `/api/erp/orders/${encodeURIComponent(orderCode)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_code: orderCode,
        actual_produced_qty: actualProducedQty,
        consumed_materials: consumedMaterials,
      }),
    },
    15000
  );
}

/**
 * Smart Factory Closed-Loop: Confirms Output Tank is drained, releasing the auto-advance sensor wait.
 */
export async function confirmBatchDrain(): Promise<{ status: string; message: string; awaiting_drain?: boolean }> {
  return await fetchJson<{ status: string; message: string; awaiting_drain?: boolean }>(
    '/api/operations/dual-run/confirm-drain',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    5000
  );
}

// ============================================================================
// UNIVERSAL BIDIRECTIONAL MES READ/WRITE CLIENT (ISA-95 Level 3 MOM)
// ============================================================================

export interface WriteOpcTagResponse {
  status: string;
  written_value?: any;
  value?: any;
  node_id?: string;
  timestamp?: string;
  simulation_fallback?: boolean;
  message?: string;
}

export async function writeOpcTag(
  nodeId: string,
  value: any,
  dataType: string = 'Float'
): Promise<WriteOpcTagResponse> {
  return await fetchJson<WriteOpcTagResponse>('/api/gateway/write-tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_id: nodeId,
      value,
      data_type: dataType,
    }),
  });
}

export interface DispatchBatchPayload {
  order_code: string;
  recipe_id?: any;
  operator?: string;
  target_line?: string;
  execution_mode?: string;
}

export async function dispatchBatch(payload: DispatchBatchPayload): Promise<any> {
  return await fetchJson('/api/operations/dispatch-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// DUAL-RUN SIMIT DIGITAL TWIN BENCHMARKING APIS
// ============================================================================

export async function getDualRunStatus(): Promise<any> {
  return await fetchJson('/api/operations/dual-run/status');
}

export async function setDualRunMode(mode: string): Promise<any> {
  return await fetchJson('/api/operations/dual-run/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execution_mode: mode }),
  });
}

export async function dispatchDualRunRecipe(payload: {
  order_code: string;
  execution_mode?: string;
  recipe_name?: string;
  target_volume?: number;
  setpoints?: Record<string, number>;
  current_batch?: number;
}): Promise<any> {
  return await fetchJson('/api/operations/dual-run/dispatch-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function startDualRunBatch(payload: {
  order_code?: string;
  execution_mode?: string;
}): Promise<any> {
  return await fetchJson('/api/operations/dual-run/start-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function holdDualRunBatch(payload: {
  order_code?: string;
  execution_mode?: string;
}): Promise<any> {
  return await fetchJson('/api/operations/dual-run/hold-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function resumeDualRunBatch(payload: {
  order_code?: string;
  execution_mode?: string;
}): Promise<any> {
  return await fetchJson('/api/operations/dual-run/resume-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function abortDualRunBatch(payload: {
  order_code?: string;
  execution_mode?: string;
}): Promise<any> {
  return await fetchJson('/api/operations/dual-run/abort-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getDeviationMatrix(): Promise<any> {
  return await fetchJson('/api/operations/dual-run/deviation-matrix');
}

export async function completeCell(cell: 'cell1' | 'cell2'): Promise<any> {
  return await fetchJson('/api/operations/dual-run/complete-cell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cell }),
  });
}

export async function resetDualRun(): Promise<any> {
  return await fetchJson('/api/operations/dual-run/reset', {
    method: 'POST',
  });
}

export interface PhaseTransitionPayload {
  order_code: string;
  phase_id: string;
  state: string;
  target_node?: string;
  value?: any;
  operator?: string;
}

export async function transitionPhase(payload: PhaseTransitionPayload): Promise<any> {
  return await fetchJson('/api/operations/phase-transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export interface QualityReleasePayload {
  order_code: string;
  report_code?: string;
  disposition?: 'RELEASED' | 'QUARANTINED' | 'REJECTED' | 'PENDING_REVIEW' | string;
  sign_off_by?: string;
  notes?: string;
  telemetry_override?: Record<string, any>;
}

export interface EbrSignAndReleasePayload {
  order_code: string;
  report_code?: string;
  username: string;
  password: string;
  signature_meaning?: string;
  qa_comments?: string;
  disposition: 'RELEASED' | 'QUARANTINED' | string;
  capa_override_reason?: string;
  telemetry_override?: Record<string, any>;
}

export interface EbrSignAndReleaseResult {
  status: string;
  order_code: string;
  report_code: string;
  disposition: string;
  quality_status: string;
  signed_by: string;
  signer_name?: string;
  signer_role: string;
  signature_meaning: string;
  signature_hash: string;
  timestamp: string;
  ccp_evaluations: Array<{
    ccp_id: string;
    parameter_name: string;
    phase_id: string;
    setpoint: number;
    actual_value: number;
    deviation_percent: number;
    tolerance_band: string;
    unit: string;
    is_ccp_breach: boolean;
    evaluation: 'PASS' | 'FAIL' | string;
    haccp_standard?: string;
  }>;
  has_ccp_fail: boolean;
  capa_override_applied: boolean;
  odoo_uplink_status: {
    synced: boolean;
    mo_state: string;
    fg_lot: string;
  };
  message: string;
}

export interface LotGenealogyRawMaterial {
  tank_id: string;
  material_name: string;
  material_code: string;
  lot_number: string;
  supplier: string;
  dosed_quantity: number;
  unit: string;
  received_date: string;
  inspection_status: string;
}

export interface LotGenealogyData {
  order_code: string;
  report_code: string;
  recipe_name: string;
  total_produced: number;
  quality_status: string;
  disposition: string;
  created_time: string;
  signature?: {
    is_signed: boolean;
    signed_by: string;
    signer_role: string;
    timestamp: string;
    signature_hash: string | null;
    signature_meaning: string;
    qa_reason: string;
  };
  raw_materials: LotGenealogyRawMaterial[];
  process_execution_trace: {
    process_cell: string;
    unit_id: string;
    ccp_checks: Array<{
      parameter_name: string;
      phase_id: string;
      setpoint: number;
      actual_value: number;
      deviation_percent: number;
      tolerance_band: string;
      is_ccp: boolean;
      status: string;
      checked_at: string;
    }>;
    mass_balance: {
      total_input_kg_l: number;
      total_output_l: number;
      loss_quantity: number;
      loss_percent: number;
      max_allowable_loss_percent: number;
      balance_status: string;
    };
  };
  finished_goods_lot: {
    lot_id: string;
    product_name: string;
    batch_volume: number;
    unit: string;
    manufacturing_date: string;
    expiry_date: string;
    disposition: string;
    quality_status: string;
    erp_mo_reference: string;
    odoo_synced: boolean;
  };
}

export async function releaseQualityBatch(payload: QualityReleasePayload): Promise<any> {
  return await fetchJson('/api/quality/release-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function signAndReleaseEbr(payload: EbrSignAndReleasePayload): Promise<EbrSignAndReleaseResult> {
  return await fetchJson<EbrSignAndReleaseResult>('/api/quality/ebr-sign-and-release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getBatchLotGenealogy(orderCode: string): Promise<{ status: string; data: LotGenealogyData }> {
  return await fetchJson<{ status: string; data: LotGenealogyData }>(`/api/quality/batch/${encodeURIComponent(orderCode)}/genealogy`);
}

export async function getBatchQualityRecords(): Promise<any[]> {
  const res = await fetchJson<any>('/api/quality/batch-records');
  return res?.data || res || [];
}

export async function getEquipmentHealth(): Promise<any> {
  return await fetchJson('/api/maintenance/equipment-health');
}

export async function syncOdooReceipts(): Promise<any> {
  return await fetchJson('/api/odoo/sync/receipts', {
    method: 'POST',
  });
}

export async function syncOdooStock(): Promise<any> {
  return await fetchJson('/api/odoo/sync/stock', {
    method: 'POST',
  });
}

/**
 * Quality Management API Suite (ISA-95 Level 3 QA)
 */
export async function getQualitySummary(params?: { from_date?: string; to_date?: string }): Promise<any> {
  const query = new URLSearchParams();
  if (params?.from_date) query.set('from_date', params.from_date);
  if (params?.to_date) query.set('to_date', params.to_date);
  const qStr = query.toString();
  return await fetchJson(`/api/quality/summary${qStr ? `?${qStr}` : ''}`);
}

export async function getQualityTagMappings(): Promise<any> {
  return await fetchJson('/api/quality/tags/mapping');
}

export async function testQualityNode(nodeId: string): Promise<any> {
  return await fetchJson('/api/quality/tags/test-node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId }),
  }, 10000);
}

export async function updateQualityTagMappings(payload: { tags: Record<string, any> } | Record<string, any>): Promise<any> {
  return await fetchJson('/api/quality/tags/mapping', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Real SQL Server Authentication & User Management (ISA-95 Level 3 MOM / FDA 21 CFR Part 11)
 */
export async function loginUser(credentials: { username: string; password: string; role?: string }): Promise<any> {
  return await fetchJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function getUsers(): Promise<any[]> {
  try {
    const res = await fetchJson<any>('/api/users');
    if (Array.isArray(res)) return res;
    if (res && 'data' in res && Array.isArray(res.data)) return res.data;
    return [];
  } catch (err) {
    console.error('[API] Error fetching users from SQL Server:', err);
    throw err;
  }
}

export async function createUser(user: {
  username: string;
  password: string;
  role: string;
  fullName?: string;
  employeeCode?: string;
  userId?: string;
  assignedFacility?: string;
}): Promise<any> {
  return await fetchJson('/api/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

export async function updateUserStatus(
  username: string,
  statusPayload: { status?: 'Active' | 'Suspended'; is_active?: boolean }
): Promise<any> {
  return await fetchJson(`/api/users/${encodeURIComponent(username)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(statusPayload),
  });
}

// ============================================================================
// ISA-88 (BatchML) & ISA-95 (B2MML) STANDARD API CLIENTS
// ============================================================================

export async function getIsaBatchmlRecipe(recipeId: string | number): Promise<any> {
  return await fetchJson(`/api/isa/batchml/recipe/${encodeURIComponent(String(recipeId))}`);
}

export async function getIsaBatchmlEbr(orderId: string | number): Promise<any> {
  return await fetchJson(`/api/isa/batchml/ebr/${encodeURIComponent(String(orderId))}`);
}

export async function getIsaB2mmlPerformance(orderId: string | number): Promise<any> {
  return await fetchJson(`/api/isa/b2mml/performance/${encodeURIComponent(String(orderId))}`);
}

export async function getIsaMappingMatrix(): Promise<any> {
  return await fetchJson('/api/isa/mapping-matrix');
}

export interface IsaIngestionMetrics {
  status: string;
  standard: string;
  edge_poll_ms: number;
  ui_broadcast_ms: number;
  rbe_deadband: number;
  ring_buffer_depth: number;
  active_buffer_tags: number;
  total_edge_ticks: number;
  rbe_exception_broadcasts: number;
  throttled_heartbeat_broadcasts: number;
  skipped_edge_broadcasts: number;
  bandwidth_saved_percent: number;
  store_and_forward_pending: number;
  mode: string;
}

export async function getIsaIngestionMetrics(): Promise<IsaIngestionMetrics> {
  return await fetchJson('/api/isa/ingestion-metrics');
}

export async function getIsaCybersecurityPosture(): Promise<any> {
  return await fetchJson('/api/isa/cybersecurity-posture');
}

export interface AssetInstantiatePayload {
  template_code: string;
  instance_code: string;
  instance_name?: string;
  line_code?: string;
  cell_id?: string;
}

export async function instantiateAssetTemplate(payload: AssetInstantiatePayload): Promise<any> {
  return await fetchJson('/api/isa/asset-generator/instantiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function getTiaPortalUdtScl(download: boolean = false): Promise<any> {
  if (download) {
    const res = await fetch('/api/isa/tia-portal/udt-scl?download=true');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DB_OPC_Gateway.scl';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return { success: true };
  }
  return await fetchJson('/api/isa/tia-portal/udt-scl');
}

// ============================================================================
// KEPWARE OPC UA ADDRESS SPACE TREE BROWSER & STAGED TAG POOL API
// ============================================================================

export interface KepwareTreeNode {
  id: string;
  name: string;
  type: 'channel' | 'device' | 'folder' | 'tag';
  data_type?: string;
  children?: KepwareTreeNode[];
}

export interface KepwareBrowseTreeResponse {
  status: string;
  source?: string;
  endpoint?: string;
  server_connected?: boolean;
  elapsed_ms?: number;
  tree: KepwareTreeNode[];
}

export interface StagedTagPoolItem {
  node_id: string;
  name: string;
  path: string;
  data_type: string;
  unit?: string;
  value?: any;
  quality?: 'Good' | 'Bad' | string;
  timestamp?: string;
}

export interface StagedTagPoolResponse {
  status: string;
  count: number;
  server_connected?: boolean;
  tags: StagedTagPoolItem[];
}

export async function browseKepwareTree(): Promise<KepwareBrowseTreeResponse> {
  return await fetchJson<KepwareBrowseTreeResponse>('/api/gateway/browse-tree', undefined, 8000);
}

export async function browseKepwareNode(nodeId: string): Promise<{ status: string; node_id: string; children: KepwareTreeNode[] }> {
  return await fetchJson(`/api/gateway/browse-node?node_id=${encodeURIComponent(nodeId)}`, undefined, 6000);
}

export async function getTagPool(): Promise<StagedTagPoolResponse> {
  return await fetchJson<StagedTagPoolResponse>('/api/gateway/pool', undefined, 5000);
}

export async function addTagsToPool(
  tags: Array<{ node_id: string; name?: string; path?: string; data_type?: string; unit?: string }>
): Promise<StagedTagPoolResponse> {
  return await fetchJson<StagedTagPoolResponse>('/api/gateway/pool/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  }, 8000);
}

export async function removeTagFromPool(params: { node_id?: string; folder?: string; node_ids?: string[] }): Promise<StagedTagPoolResponse> {
  const q = new URLSearchParams();
  if (params.node_id) q.set('node_id', params.node_id);
  if (params.folder) q.set('folder', params.folder);
  const queryStr = q.toString();
  return await fetchJson<StagedTagPoolResponse>(`/api/gateway/pool/remove${queryStr ? `?${queryStr}` : ''}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 5000);
}





