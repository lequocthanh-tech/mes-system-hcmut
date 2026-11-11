/* Hallmark · component: QualityTypes · genre: modern-minimal · register: industrial-workbench
 * contrast: WCAG AA Pass
 */

export type BatchQualityStatus = 'PASS' | 'FAIL' | 'PENDING_REVIEW' | 'PASS (RELEASE READY)' | 'WARNING (HOLD)' | 'FAIL (QUARANTINE)';
export type BatchDisposition = 'RELEASED' | 'QUARANTINED' | 'PENDING_REVIEW';

export interface BatchQualityRecord {
  reportId: number;
  reportCode: string;       // e.g. "QAR-2026-010"
  orderId: string;          // e.g. "WO-2026-001"
  recipeId: string;         // e.g. "RCP-MILK-UHT-01"
  recipeName: string;       // e.g. "Fresh Pasteurized UHT Milk"
  recipeVersion: string;    // e.g. "v1.2"
  startTime: string;
  endTime: string;
  totalProduced: number;
  status: BatchQualityStatus;
  disposition: BatchDisposition;
  avgError: number;
  checkedAt: string;
  reviewerNotes?: string;
  failingParameter?: string;
  isElectronicallySigned?: boolean;
  signatureHash?: string | null;
  signedBy?: string;
  signerRole?: string;
  signedAt?: string;
}

export interface BatchQualityDetailItem {
  qualityId: number;
  reportId: number;
  phaseId: string;          // e.g. "PH_SUPPLYMILK", "PH_HEATING"
  parameterName: string;    // e.g. "Raw Milk Intake", "Sterilization Temp (CCP-1)"
  unit: string;             // e.g. "L", "kg", "°C"
  setValue: number;
  actualValue: number;
  diffPercent: number;
  tolerancePercent: number;
  result: BatchQualityStatus;
  isCritical: boolean;      // HACCP Critical Control Point
  haccpCategory?: 'CRITICAL (CCP)' | 'STANDARD QUALITY';
}

export interface QualityToleranceRule {
  id: string;
  phaseId: string;
  parameterName: string;
  targetUnit: string;
  standardTolerance: number;
  isCritical: boolean;
  haccpCategory: 'CRITICAL (CCP)' | 'STANDARD QUALITY';
  description: string;
}

export interface CapaTicket {
  ticketId: string;
  title: string;
  orderId: string;
  reportCode: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  rootCause: string;
  correctiveAction: string;
  assignedModule: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
}

export interface ParetoRecipeItem {
  recipe_name: string;
  recipe_code: string;
  pass_rate: number;
  total_count: number;
  pass_count: number;
}

export interface QualityBreachItem {
  detail_id: number;
  report_id: number;
  report_code: string;
  order_code: string;
  parameter_name: string;
  phase_id: string;
  setpoint: number;
  actual_value: number;
  deviation_percent: number;
  tolerance_band: string;
  is_ccp_breach: boolean;
  result: string;
  checked_at: string;
}

export interface QualitySummaryData {
  status: string;
  from_date?: string;
  to_date?: string;
  total_inspected_volume: number;
  fpy_percentage: number;
  quarantined_batches_count: number;
  quality_grade: string;
  total_batches: number;
  pass_batches: number;
  overall_avg_deviation: number;
  pareto_by_recipe: ParetoRecipeItem[];
  active_breaches: QualityBreachItem[];
  has_breach: boolean;
}

export interface QualityTagConfigItem {
  tag_name: string;
  node_id: string;
  description: string;
  role?: string;
  unit: string;
  spec_min?: number;
  spec_max?: number;
  value?: number | null;
  quality?: string;
  timestamp?: string;
  dataType?: string;
}
