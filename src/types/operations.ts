/* Hallmark · component: OperationsTypes · genre: modern-minimal · register: industrial-workbench
 * contrast: WCAG AA Pass
 */

export type BatchCommandType = 
  | 'DOWNLOAD' 
  | 'START' 
  | 'HOLD' 
  | 'RESUME' 
  | 'STOP' 
  | 'RESET' 
  | 'ABORT';

export type Isa88StateCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type Isa88StateName = 
  | 'IDLE'        // 0
  | 'RUNNING'     // 1
  | 'HOLDING'     // 2
  | 'HELD'        // 3
  | 'RESTARTING'  // 4
  | 'PAUSING'     // 5
  | 'PAUSED'      // 6
  | 'STOPPING'    // 7
  | 'STOPPED'     // 8
  | 'ABORTING'    // 9
  | 'ABORTED'     // 10
  | 'COMPLETE';   // 11

export type Isa88BatchState = 
  | Isa88StateName
  | 'NEW'
  | 'READY'
  | 'STARTING'
  | 'COMPLETING'
  | 'COMPLETED'
  | 'AWAITING_DRAIN'
  | 'WAITING_DRAIN';

export interface Isa88StateMeta {
  id: Isa88StateCode;
  name: Isa88StateName;
  label: string;
  color: string;
  badgeClass: string;
  borderClass: string;
  bgClass: string;
}

export const ISA88_STATES: Record<Isa88StateCode, Isa88StateMeta> = {
  0: {
    id: 0,
    name: 'IDLE',
    label: 'IDLE',
    color: '#94A3B8',
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300',
    borderClass: 'border-slate-400',
    bgClass: 'bg-slate-400',
  },
  1: {
    id: 1,
    name: 'RUNNING',
    label: 'RUNNING',
    color: '#22C55E',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-400 animate-pulse',
    borderClass: 'border-emerald-600',
    bgClass: 'bg-emerald-500',
  },
  2: {
    id: 2,
    name: 'HOLDING',
    label: 'HOLDING',
    color: '#F97316',
    badgeClass: 'bg-orange-50 text-orange-800 border border-orange-400 animate-pulse',
    borderClass: 'border-orange-600',
    bgClass: 'bg-orange-500',
  },
  3: {
    id: 3,
    name: 'HELD',
    label: 'HELD',
    color: '#EAB308',
    badgeClass: 'bg-yellow-50 text-yellow-800 border border-yellow-400',
    borderClass: 'border-yellow-500',
    bgClass: 'bg-yellow-500',
  },
  4: {
    id: 4,
    name: 'RESTARTING',
    label: 'RESTARTING',
    color: '#06B6D4',
    badgeClass: 'bg-cyan-50 text-cyan-800 border border-cyan-400 animate-pulse',
    borderClass: 'border-cyan-600',
    bgClass: 'bg-cyan-500',
  },
  5: {
    id: 5,
    name: 'PAUSING',
    label: 'PAUSING',
    color: '#F59E0B',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-400 animate-pulse',
    borderClass: 'border-amber-500',
    bgClass: 'bg-amber-500',
  },
  6: {
    id: 6,
    name: 'PAUSED',
    label: 'PAUSED',
    color: '#D97706',
    badgeClass: 'bg-amber-100 text-amber-900 border border-amber-500',
    borderClass: 'border-amber-600',
    bgClass: 'bg-amber-600',
  },
  7: {
    id: 7,
    name: 'STOPPING',
    label: 'STOPPING',
    color: '#A855F7',
    badgeClass: 'bg-purple-50 text-purple-800 border border-purple-400 animate-pulse',
    borderClass: 'border-purple-500',
    bgClass: 'bg-purple-500',
  },
  8: {
    id: 8,
    name: 'STOPPED',
    label: 'STOPPED',
    color: '#7E22CE',
    badgeClass: 'bg-purple-100 text-purple-900 border border-purple-500',
    borderClass: 'border-purple-700',
    bgClass: 'bg-purple-700',
  },
  9: {
    id: 9,
    name: 'ABORTING',
    label: 'ABORTING',
    color: '#EF4444',
    badgeClass: 'bg-rose-50 text-rose-800 border border-rose-400 animate-pulse',
    borderClass: 'border-rose-600',
    bgClass: 'bg-rose-500',
  },
  10: {
    id: 10,
    name: 'ABORTED',
    label: 'ABORTED',
    color: '#991B1B',
    badgeClass: 'bg-red-100 text-red-900 border border-red-500',
    borderClass: 'border-red-800',
    bgClass: 'bg-red-800',
  },
  11: {
    id: 11,
    name: 'COMPLETE',
    label: 'COMPLETE',
    color: '#3B82F6',
    badgeClass: 'bg-blue-50 text-blue-800 border border-blue-400',
    borderClass: 'border-blue-600',
    bgClass: 'bg-blue-500',
  },
};

export function getIsa88State(stateIdOrName: number | string | undefined | null): Isa88StateMeta {
  if (typeof stateIdOrName === 'number') {
    const code = Math.round(stateIdOrName) as Isa88StateCode;
    return ISA88_STATES[code] || ISA88_STATES[0];
  }
  const str = String(stateIdOrName || 'IDLE').trim().toUpperCase();
  switch (str) {
    case '1':
    case 'RUNNING':
    case 'STARTING':
      return ISA88_STATES[1];
    case '2':
    case 'HOLDING':
      return ISA88_STATES[2];
    case '3':
    case 'HELD':
      return ISA88_STATES[3];
    case '4':
    case 'RESTARTING':
    case 'RESUMING':
      return ISA88_STATES[4];
    case '5':
    case 'PAUSING':
      return ISA88_STATES[5];
    case '6':
    case 'PAUSED':
      return ISA88_STATES[6];
    case '7':
    case 'STOPPING':
      return ISA88_STATES[7];
    case '8':
    case 'STOPPED':
      return ISA88_STATES[8];
    case '9':
    case 'ABORTING':
      return ISA88_STATES[9];
    case '10':
    case 'ABORTED':
      return ISA88_STATES[10];
    case '11':
    case 'COMPLETE':
    case 'COMPLETED':
    case 'COMPLETING':
      return ISA88_STATES[11];
    case 'READY':
      return {
        id: 0,
        name: 'IDLE',
        label: 'READY',
        color: '#0284C7',
        badgeClass: 'bg-sky-50 text-sky-800 border border-sky-400',
        borderClass: 'border-sky-500',
        bgClass: 'bg-sky-500',
      };
    case 'AWAITING_DRAIN':
    case 'WAITING_DRAIN':
      return {
        id: 2,
        name: 'HELD',
        label: 'CHỜ XẢ BỒN OUTPUT',
        color: '#D97706',
        badgeClass: 'bg-amber-50 text-amber-800 border border-amber-400 animate-pulse',
        borderClass: 'border-amber-500',
        bgClass: 'bg-amber-500',
      };
    case 'NEW':
      return {
        id: 0,
        name: 'IDLE',
        label: 'NEW',
        color: '#64748B',
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300',
        borderClass: 'border-slate-400',
        bgClass: 'bg-slate-400',
      };
    case '0':
    case 'IDLE':
    default:
      return ISA88_STATES[0];
  }
}

export type HandshakeStatus = 'IDLE' | 'DOWNLOADING' | 'VERIFIED' | 'FAILED';

export type CipHygieneStatus = 'CLEAN' | 'DIRTY_EXPIRED' | 'IN_PROGRESS';

export interface QueueOrder {
  id: string;
  orderName: string;
  recipeName: string;
  recipeVersion?: string;
  volume: number;
  targetScadaNode: string;
  status: Isa88BatchState;
  scadaSyncStatus: string;
  elapsedTime: string;
  completionTime?: string;
  assignedCell?: string;
  customerName?: string;
  customerCode?: string;
  orderPriority?: number;
  setpoints?: {
    milkSp: number;
    sugarSp: number;
    additiveSp: number;
    tempHotSp: number;
    tempColdSp: number;
  };
}

export interface ScadaSetpointVerification {
  id: string;
  tagName: string;
  phaseId?: string;
  scriptedSetpoint: number;
  scadaActualReadback: number | null;
  unit: string;
  tolerance: number;
  status:
    | 'UNMAPPED'
    | 'MATCHED (IN TOLERANCE)'
    | 'RAMPING / DOSING'
    | 'DEVIATING / OVERSHOOT'
    | 'Matched'
    | 'In Progress'
    | 'Deviating'
    | 'Discrepancy';
  timestamp: string;
}

export type TopologyEntityStatus = 'IDLE' | 'RUNNING' | 'HELD' | 'FAULT' | 'COMPLETED';

export interface TopologyPhase {
  id: string;
  code: string;
  name: string;
  status: TopologyEntityStatus;
  activeStep?: string;
  equipmentModule?: string;
  targetNodeId?: string;
  spValue?: number;
  pvValue?: number;
  unit?: string;
  tolerance?: string;
}

export interface TopologyOperation {
  id: string;
  code: string;
  name: string;
  status: TopologyEntityStatus;
  phases: TopologyPhase[];
}

export interface TopologyCellCard {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  targetCell: string;
  status: TopologyEntityStatus;
  operations: TopologyOperation[];
}

export interface TimelineNode {
  id: string;
  code: string;
  name: string;
  type: 'UP' | 'OP' | 'PH';
  startMinute: number;
  durationMinutes: number;
  nominalDurationMinutes?: number;
  status: Isa88BatchState;
  stateId?: Isa88StateCode;
  startTime?: number | null;
  endTime?: number | null;
  isFrozen?: boolean;
  parentContext?: string;
  targetCell?: string;
  opcNodeId?: string;
}

export interface PhaseDurationsMap {
  cell1_physical: Record<string, number>;
  cell2_simit: Record<string, number>;
}

export interface TelemetryDataPoint {
  time: string;
  sp: number;
  pv: number;
}

export interface ProcessTrendCard {
  id: string;
  title: string;
  cell: string;
  spTag: string;
  pvTag: string;
  unit: string;
  min: number;
  max: number;
  currentSp: number;
  currentPv: number;
  dataPoints: TelemetryDataPoint[];
}

export type ExecutionMode = 
  | 'mode1_physical'
  | 'mode2_simit'
  | 'mode3_dual';

export interface ExecutionModeOption {
  id: ExecutionMode;
  label: string;
  badge: string;
  targetDesc: string;
}

export const EXECUTION_MODE_OPTIONS: ExecutionModeOption[] = [
  {
    id: 'mode1_physical',
    label: 'Process Cell 1 (Physical S7-1500 Hardware Only)',
    badge: 'HW ONLY',
    targetDesc: 'Direct PLC S7-1500 controller execution only'
  },
  {
    id: 'mode2_simit',
    label: 'Process Cell 2 (SIMIT Digital Twin Only)',
    badge: 'TWIN ONLY',
    targetDesc: 'Virtual SIMIT Digital Twin simulation only'
  },
  {
    id: 'mode3_dual',
    label: 'Dual-Run Benchmark (Physical + SIMIT Twin Synchronized)',
    badge: 'DUAL-RUN',
    targetDesc: 'Parallel synchronized benchmark & real-time deviation analysis'
  }
];

export type StateSourceType = 'PLC_HARDWARE' | 'VIRTUAL_SIM_FALLBACK';

export type SpTrackingStatus =
  | 'UNMAPPED'
  | 'MATCHED (IN TOLERANCE)'
  | 'RAMPING / DOSING'
  | 'DEVIATING / OVERSHOOT';

export type TwinSyncStatus = 'UNMAPPED' | 'TWIN_SYNCHRONIZED' | 'TWIN_DRIFT';

export type DeviationStatus =
  | SpTrackingStatus
  | 'MATCHED'
  | 'DEVIATING'
  | 'TRACKING'
  | 'CHƯA ÁNH XẠ';

export interface DigitalTwinDeviationRow {
  id: string;
  name: string;
  phase: string;
  unit: string;
  sp: number;
  pvHardware: number | null;
  pvSimit: number | null;
  delta: number | null;
  deltaSp?: number | null;
  absDeltaSp?: number | null;
  deltaTwin?: number | null;
  tolerance: number;
  status: DeviationStatus;
  spTrackingStatus?: SpTrackingStatus;
  twinSyncStatus?: TwinSyncStatus;
  parameterFidelity?: number | null;
  c1Mapped: boolean;
  c2Mapped: boolean;
}

export interface DualRunBenchmarkSummary {
  mappedParameters: number;
  mappedTwinParameters?: number;
  matchedParameters: number;
  synchronizedParameters?: number;
  totalParameters: number;
  fidelityIndex: number | null;
  stateSource?: StateSourceType;
  virtualStateFallback?: boolean;
  tHardwareSec: number | null;
  tHardwareFormatted: string;
  tSimitSec: number | null;
  tSimitFormatted: string;
  deltaTSec: number | null;
  deltaTFormatted: string;
  cell1Complete: boolean;
  cell2Complete: boolean;
}

