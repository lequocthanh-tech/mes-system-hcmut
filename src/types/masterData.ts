/* Hallmark · component: MasterDataTypes · genre: modern-minimal · register: industrial-workbench
 * contrast: WCAG AA Pass
 */

export type CustomerPriority = 1 | 2 | 3;
export type CustomerStatus = 'Active' | 'Inactive';

export interface Customer {
  id: number;
  code: string;            // e.g. "CUS-VNM", "CUS-THM"
  name: string;            // e.g. "Vinamilk Corporation"
  email: string;           // e.g. "contact@vinamilk.vn"
  phone: string;           // e.g. "028-5415-5555"
  address?: string;        // e.g. "District 7, HCMC"
  priority: CustomerPriority; // 1 = Critical/High, 2 = Normal, 3 = Low
  status: CustomerStatus;  // 'Active' | 'Inactive'
  activeOrdersCount?: number;
}

export type RecipeStatus = 'DRAFT' | 'RELEASED' | 'LOCKED' | 'TEST' | 'Draft' | 'Released' | 'Locked' | 'Test';

/**
 * Siemens PM-CONTROL Chapter 5.8 Product Batch Types:
 * - 'NORMALIZED_ABSOLUTE' (Sec. 5.8.2): Normalizing base with absolute values (e.g., 5.0 L or 1000.0 L)
 * - 'NORMALIZED_PERCENTAGE' (Sec. 5.8.3): Normalizing base with percentage values (%)
 * - 'ABSOLUTE_FIXED' (Sec. 5.8.1): Product with fixed absolute values (Job Control does not scale)
 */
export type PmControlBatchType = 'NORMALIZED_ABSOLUTE' | 'NORMALIZED_PERCENTAGE' | 'ABSOLUTE_FIXED';

/**
 * Siemens PM-CONTROL Phase Parameter Scaling Rule:
 * - 'SCALABLE': Material dosing parameters multiplied by Conversion Factor
 * - 'FIXED': Thermal/mechanical process parameters kept constant regardless of batch size
 */
export type ParameterScalingRule = 'SCALABLE' | 'FIXED';

export interface RecipeParameter {
  id: string;              // e.g. "param-1"
  phaseId: string;         // e.g. "PH_SUPPLYMILK", "PH_HEATING"
  parameterName: string;   // e.g. "Ingredient Raw Milk", "Thermal Process"
  targetValue: number;     // e.g. 70.0, 138.0
  unit: string;            // e.g. "%", "°C", "RPM", "s", "L", "kg"
  tolerance: string;       // e.g. "±1.0%", "±0.5°C"
  targetNodeId: string;    // e.g. "Recipe_Milk_SP", "Recipe_Temp_SP"
  durationSeconds?: number;
  scalingRule?: ParameterScalingRule;
  scaling_rule?: ParameterScalingRule;
  // Legacy & extended compatibility fields
  recipeId?: number;
  materialName?: string;
  percentage?: number;
  tagName?: string;
  targetSetpoint?: number;
  isIngredient?: boolean;
}

export interface MasterRecipe {
  id: number;
  code: string;            // e.g. "RCP-MILK-UHT-01"
  name: string;            // e.g. "Fresh Pasteurized UHT Milk"
  version: string;         // e.g. "v1.2"
  status: RecipeStatus;    // 'DRAFT' | 'RELEASED' | 'LOCKED'
  category?: string;       // e.g. "Dairy UHT Processing"
  author?: string;
  createdDate?: string;
  lastModified?: string;
  parameters: RecipeParameter[];
  tempHot?: number;
  tempCold?: number;
  // Siemens PM-CONTROL Chapter 5.8 Batch Type & Conversion Factor Metadata
  batchType?: PmControlBatchType;
  batch_type?: PmControlBatchType;
  normalizingBase?: number;
  normalizing_base?: number;
  expectedLossPercent?: number;
  expected_loss_percent?: number;
}

// Backward compatibility aliases
export type RecipeMaster = MasterRecipe;
export type RecipeDetail = RecipeParameter;

/**
 * Siemens PM-CONTROL Sec. 5.6 Recipe Version History Snapshot
 */
export interface RecipeVersionSnapshot {
  version: string;
  status: RecipeStatus;
  timestamp: string;
  author: string;
  reason: string;
  batchType?: PmControlBatchType;
  batch_type?: PmControlBatchType;
  normalizingBase?: number;
  normalizing_base?: number;
  expectedLossPercent?: number;
  expected_loss_percent?: number;
  tempHot?: number;
  temp_hot?: number;
  tempCold?: number;
  temp_cold?: number;
  parameters: RecipeParameter[];
}

/**
 * IEC 61508 / PM-CONTROL Bidirectional Lifebit Watchdog Telemetry
 */
export interface WatchdogStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'WATCHDOG_TIMEOUT_SAFE_HOLD';
  lifebit_pulse: boolean;
  lifebit_counter: number;
  latency_ms: number;
  timeout_threshold_ms: number;
  safe_hold_triggered: boolean;
  consecutive_failures: number;
  last_sync_utc: string;
}

/**
 * Industrial AI In-Flight Dosing & Statistical Process Control (SPC)
 */
export interface AiDosingChannel {
  channel_id: string;
  channel_name: string;
  material_code: string;
  target_sp: number;
  unit: string;
  tolerance_percent: number;
  usl: number;
  lsl: number;
  sample_count: number;
  mean_error_kg: number;
  std_dev_kg: number;
  cpk: number;
  status: 'CAPABLE' | 'DRIFT_DETECTED' | 'OUT_OF_SPEC';
  recommended_offset_kg: number;
  active_applied_offset_kg: number;
  last_applied_at?: string;
  last_applied_by?: string;
  last_reason?: string;
}

export interface AiDosingAdvisorResponse {
  timestamp: string;
  channels: AiDosingChannel[];
  global_status: string;
  confidence_score: number;
}

export type WorkOrderStatus = 
  | 'NEW' 
  | 'READY' 
  | 'RUNNING' 
  | 'HELD' 
  | 'STOPPED' 
  | 'COMPLETED' 
  | 'ABORTED'
  | 'New'
  | 'Running'
  | 'Held'
  | 'Stopping'
  | 'Stopped'
  | 'Aborting'
  | 'Aborted'
  | 'Completed';

export interface CalculatedSetpoint {
  name: string;            // e.g. "Raw Milk", "Sugar Syrup", "Additive", "Sterilization Setpoint"
  calculatedValue: number; // e.g. 700.0, 200.0, 100.0, 138.0
  unit: string;            // e.g. "L", "kg", "°C"
  percentage?: number;
  masterValue?: number;
  masterUnit?: string;
  scalingRule?: ParameterScalingRule;
  conversionFactor?: number;
  phaseId?: string;
  targetNodeId?: string;
}

export interface PmControlJobSummary {
  batchType: PmControlBatchType;
  batchTypeLabel: string;
  sectionRef: string;
  normalizingBase: number;
  normalizingBaseUnit: string;
  targetQuantity: number;
  conversionFactor: number;
  conversionFormulaText: string;
  totalRawMaterialInput: number;
  expectedNetOutputVolume: number;
  expectedLossVolume: number;
  expectedLossPercent: number;
}

export interface WorkOrder {
  id: number;
  orderId: string;         // e.g. "WO-2026-001"
  orderName?: string;
  customerId: number;
  customerCode?: string;
  customerName: string;
  orderPriority?: number;
  recipeId: number;
  recipeCode?: string;
  recipeName: string;
  recipeVersion: string;   // e.g. "v1.2"
  volume: number;          // Target batch volume in Liters
  quantity?: number;
  calculatedSetpoints?: CalculatedSetpoint[];
  status: WorkOrderStatus;
  targetUnit?: string;     // e.g. "UNIT MIXING"
  scheduledStartTime?: string;
  createdDate?: string;
  startTime?: string;
  endTime?: string;
}
