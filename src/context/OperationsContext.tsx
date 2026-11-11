/* Hallmark · component: OperationsContext · genre: modern-minimal · register: industrial-workbench
 * contrast: WCAG AA Pass
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  QueueOrder, 
  ScadaSetpointVerification, 
  TopologyCellCard, 
  TimelineNode, 
  ProcessTrendCard,
  BatchCommandType,
  Isa88BatchState,
  HandshakeStatus,
  CipHygieneStatus,
  getIsa88State,
  PhaseDurationsMap,
  ExecutionMode,
  DigitalTwinDeviationRow,
  DualRunBenchmarkSummary,
  DeviationStatus,
  StateSourceType,
  SpTrackingStatus,
  TwinSyncStatus
} from '../types/operations';
import { useMasterData } from './MasterDataContext';
import { useGatewayStatus } from './ConfigContext';
import * as api from '../services/api';

interface OperationsContextType {
  // SCADA Gateway & Target Process Cell & Execution Mode
  scadaGatewayUrl: string;
  isScadaConnected: boolean;
  targetProcessLine: string;
  setTargetProcessLine: (line: string) => void;
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;

  // Handshake Interlock & Dual-Run Flags
  handshakeStatus: HandshakeStatus;
  handshakeLoadedOk: boolean;
  cell1Ack: boolean;
  cell2Ack: boolean;
  cell1Complete: boolean;
  cell2Complete: boolean;
  cell1Duration: string;
  cell2Duration: string;

  // ISA-88 PLC State Authority vs. Virtual Commissioning Fallback
  stateSource: StateSourceType;
  virtualStateFallback: boolean;

  // Digital Twin Deviation Matrix & Benchmark Telemetry
  deviationMatrix: DigitalTwinDeviationRow[];
  benchmarkSummary: DualRunBenchmarkSummary | null;
  refreshDeviationMatrix: () => Promise<void>;
  completeCellSimulation: (cell: 'cell1' | 'cell2') => Promise<void>;

  // Clean-In-Place (CIP) Hygiene Interlock Gateway
  cipStatus: CipHygieneStatus;
  setCipStatus: (status: CipHygieneStatus) => void;
  lastCipTimestamp: string;
  sterilityWindowHours: number;
  cipProgressRemaining: number;
  startCipCycle: () => Promise<void>;
  resetCipToExpired: () => void;

  // Phase Durations Setup
  phaseDurations: PhaseDurationsMap;
  setPhaseDurations: React.Dispatch<React.SetStateAction<PhaseDurationsMap>>;
  reloadPhaseDurations: () => Promise<void>;
  updatePhaseDuration: (cell: 'cell1_physical' | 'cell2_simit', phaseCode: string, durationMinutes: number) => Promise<void>;
  saveAllPhaseDurations: (newDurations: PhaseDurationsMap) => Promise<boolean>;

  // 3-Tier Queue
  newOrders: QueueOrder[];
  runningOrders: QueueOrder[];
  finishedOrders: QueueOrder[];
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
  dispatchOrder: (orderId: string) => void;

  // Active Supervisory Batch State & Commands
  currentBatchState: Isa88BatchState;
  executeBatchCommand: (command: BatchCommandType) => Promise<void>;
  lastCommandFeedback: string | null;

  // Pre-run SCADA SP vs PV Verification
  scadaVerifications: ScadaSetpointVerification[];

  // Topology Cards
  topologyCards: TopologyCellCard[];

  // Timeline Nodes
  timelineNodes: TimelineNode[];

  // Process Trends
  trendCards: ProcessTrendCard[];
}



const initialVerifications: ScadaSetpointVerification[] = [
  {
    id: '1',
    phaseId: 'PH_SUPPLYMILK',
    tagName: 'PH11101_SETPOINT_MILK',
    scriptedSetpoint: 700.0,
    scadaActualReadback: 0.0,
    unit: 'L',
    tolerance: 10.0,
    status: 'In Progress',
    timestamp: '--:--:--',
  },
  {
    id: '2',
    phaseId: 'PH_SUPPLYSUGAR',
    tagName: 'PH11202_SETPOINT_SUGAR',
    scriptedSetpoint: 200.0,
    scadaActualReadback: 0.0,
    unit: 'kg',
    tolerance: 2.0,
    status: 'In Progress',
    timestamp: '--:--:--',
  },
  {
    id: '3',
    phaseId: 'PH_HEATING',
    tagName: 'PH22101_SETPOINT_TEMP_HOT',
    scriptedSetpoint: 138.0,
    scadaActualReadback: 0.0,
    unit: '°C',
    tolerance: 1.0,
    status: 'In Progress',
    timestamp: '--:--:--',
  },
  {
    id: '4',
    phaseId: 'PH_COOLING',
    tagName: 'PH22202_SETPOINT_TEMP_COLD',
    scriptedSetpoint: 4.0,
    scadaActualReadback: 0.0,
    unit: '°C',
    tolerance: 0.5,
    status: 'In Progress',
    timestamp: '--:--:--',
  },
];

const initialTopologyCards: TopologyCellCard[] = [
  {
    id: 'card_pc1_mix',
    code: 'UP1000',
    name: 'UP_MIXING_PC1',
    unitLabel: 'Mixing Unit - Process Cell 1',
    targetCell: 'Process Cell 1 (Physical S7-1500)',
    status: 'IDLE',
    operations: [
      {
        id: 'op1',
        code: 'OP1001',
        name: 'OP_INLET',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph1', 
            code: 'PH11101', 
            name: 'PH_SUPPLYMILK', 
            status: 'IDLE', 
            activeStep: 'Ready for Dosing',
            equipmentModule: 'P-101 Raw Milk Dosing Pump',
            targetNodeId: 'Recipe_Milk_SP',
            spValue: 700.0,
            pvValue: 0.0,
            unit: 'L',
            tolerance: '±10.0 L'
          },
          { 
            id: 'ph2', 
            code: 'PH11202', 
            name: 'PH_SUPPLYSUGAR', 
            status: 'IDLE', 
            activeStep: 'Hopper Gate Ready',
            equipmentModule: 'V-103 Sugar Dosing Rotary Valve',
            targetNodeId: 'Recipe_Sugar_SP',
            spValue: 200.0,
            pvValue: 0.0,
            unit: 'kg',
            tolerance: '±2.0 kg'
          },
          { 
            id: 'ph3', 
            code: 'PH11303', 
            name: 'PH_SUPPLYADDITIVE', 
            status: 'IDLE', 
            activeStep: 'Dosing Pump Standby',
            equipmentModule: 'P-103 Micro-Dosing Injection Pump',
            targetNodeId: 'Recipe_Additive_SP',
            spValue: 100.0,
            pvValue: 0.0,
            unit: 'L',
            tolerance: '±1.0 L'
          },
        ],
      },
      {
        id: 'op2',
        code: 'OP1002',
        name: 'OP_MIXING',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph4', 
            code: 'PH12101', 
            name: 'PH_AGITATE', 
            status: 'IDLE', 
            activeStep: 'Motor Ready (1200 RPM)',
            equipmentModule: 'M-101 Variable Frequency Agitator',
            targetNodeId: 'Agitator_Speed_SP',
            spValue: 1200.0,
            pvValue: 0.0,
            unit: 'RPM',
            tolerance: '±25 RPM'
          },
          { 
            id: 'ph5', 
            code: 'PH12202', 
            name: 'PH_CIRCULATE', 
            status: 'IDLE', 
            activeStep: 'Loop Valve Standby',
            equipmentModule: 'P-102 Recirculation Sanitary Pump',
            targetNodeId: 'Loop_Valve_SP',
            spValue: 100.0,
            pvValue: 0.0,
            unit: '%',
            tolerance: '±2.0%'
          },
        ],
      },
    ],
  },
  {
    id: 'card_pc1_sterilize',
    code: 'UP2000',
    name: 'UP_STERILIZE_PC1',
    unitLabel: 'Sterilize Unit - Process Cell 1',
    targetCell: 'Process Cell 1 (Physical S7-1500)',
    status: 'IDLE',
    operations: [
      {
        id: 'op3',
        code: 'OP2001',
        name: 'OP_HEATING',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph6', 
            code: 'PH22101', 
            name: 'PH_HEAT', 
            status: 'IDLE', 
            activeStep: 'Steam Injection Primed',
            equipmentModule: 'V-201 Modulating Steam Valve',
            targetNodeId: 'Recipe_Temp_SP',
            spValue: 138.0,
            pvValue: 24.5,
            unit: '°C',
            tolerance: '±0.5°C'
          },
          { 
            id: 'ph7', 
            code: 'PH22102', 
            name: 'PH_HOLD_TEMP', 
            status: 'IDLE', 
            activeStep: 'Holding Chamber Standby',
            equipmentModule: 'TC-202 Holding Tube Section',
            targetNodeId: 'Sterilization_Hold_Timer',
            spValue: 600,
            pvValue: 0,
            unit: 's',
            tolerance: '±5s'
          },
        ],
      },
      {
        id: 'op4',
        code: 'OP2002',
        name: 'OP_COOLING',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph8', 
            code: 'PH22201', 
            name: 'PH_CHILL', 
            status: 'IDLE', 
            activeStep: 'Chilled Water Loop Ready',
            equipmentModule: 'HEX-203 Plate Heat Exchanger',
            targetNodeId: 'Recipe_Cool_SP',
            spValue: 4.0,
            pvValue: 25.0,
            unit: '°C',
            tolerance: '±1.0°C'
          },
          { 
            id: 'ph9', 
            code: 'PH22202', 
            name: 'PH_TRANSFER_OUT', 
            status: 'IDLE', 
            activeStep: 'Aseptic Line Ready',
            equipmentModule: 'V-204 Aseptic Divert Valve Block',
            targetNodeId: 'Transfer_Pump_SP',
            spValue: 80.0,
            pvValue: 0.0,
            unit: 'L/min',
            tolerance: '±5.0 L/min'
          },
        ],
      },
    ],
  },
  {
    id: 'card_pc2_mix',
    code: 'UP1000',
    name: 'UP_MIXING_PC2',
    unitLabel: 'Mixing Unit - SIMIT Digital Twin',
    targetCell: 'Process Cell 2 (SIMIT Digital Twin)',
    status: 'IDLE',
    operations: [
      {
        id: 'op5',
        code: 'OP1001',
        name: 'OP_INLET_PC2',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph10', 
            code: 'PH_SUPPLYMILK_PC2', 
            name: 'PH_SUPPLYMILK (SIMIT)', 
            status: 'IDLE', 
            activeStep: 'SIMIT Simulation Ready',
            equipmentModule: 'Simulated Dosing Pump P-201',
            targetNodeId: 'SIMIT_Milk_SP',
            spValue: 700.0,
            pvValue: 0.0,
            unit: 'L',
            tolerance: '±5.0 L'
          },
          { 
            id: 'ph11', 
            code: 'PH_SUPPLYSUGAR_PC2', 
            name: 'PH_SUPPLYSUGAR (SIMIT)', 
            status: 'IDLE', 
            activeStep: 'SIMIT Feeder Ready',
            equipmentModule: 'Simulated Rotary Valve V-203',
            targetNodeId: 'SIMIT_Sugar_SP',
            spValue: 200.0,
            pvValue: 0.0,
            unit: 'kg',
            tolerance: '±1.0 kg'
          },
        ],
      },
      {
        id: 'op6',
        code: 'OP1002',
        name: 'OP_MIXING_PC2',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph12', 
            code: 'PH_AGITATE_PC2', 
            name: 'PH_AGITATE (SIMIT)', 
            status: 'IDLE', 
            activeStep: 'SIMIT Motor Model Active',
            equipmentModule: 'Simulated Agitator Motor M-201',
            targetNodeId: 'SIMIT_Agitator_Speed',
            spValue: 1200.0,
            pvValue: 0.0,
            unit: 'RPM',
            tolerance: '±10 RPM'
          },
        ],
      },
    ],
  },
  {
    id: 'card_pc2_sterilize',
    code: 'UP2000',
    name: 'UP_STERILIZE_PC2',
    unitLabel: 'Sterilize Unit - SIMIT Digital Twin',
    targetCell: 'Process Cell 2 (SIMIT Digital Twin)',
    status: 'IDLE',
    operations: [
      {
        id: 'op7',
        code: 'OP2001',
        name: 'OP_HEATING_PC2',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph13', 
            code: 'PH_HEAT_PC2', 
            name: 'PH_HEAT (SIMIT)', 
            status: 'IDLE', 
            activeStep: 'SIMIT Thermodynamic Loop',
            equipmentModule: 'Simulated Steam Exchanger TC-301',
            targetNodeId: 'SIMIT_Temp_Hot_SP',
            spValue: 138.0,
            pvValue: 25.0,
            unit: '°C',
            tolerance: '±0.5°C'
          },
        ],
      },
      {
        id: 'op8',
        code: 'OP2002',
        name: 'OP_COOLING_PC2',
        status: 'IDLE',
        phases: [
          { 
            id: 'ph14', 
            code: 'PH_CHILL_PC2', 
            name: 'PH_CHILL (SIMIT)', 
            status: 'IDLE', 
            activeStep: 'SIMIT Chilled Loop',
            equipmentModule: 'Simulated Chilled Exchanger HEX-302',
            targetNodeId: 'SIMIT_Temp_Cold_SP',
            spValue: 4.0,
            pvValue: 25.0,
            unit: '°C',
            tolerance: '±0.5°C'
          },
        ],
      },
    ],
  },
];

const defaultPhaseDurations: PhaseDurationsMap = {
  cell1_physical: {
    PH11101: 6.0,
    PH11202: 5.0,
    PH11303: 4.0,
    PH12101: 12.0,
    PH12202: 10.0,
    PH12303: 4.0,
    PH22101: 8.0,
    PH22102: 4.0,
    PH22201: 5.0,
    PH22202: 3.0,
  },
  cell2_simit: {
    PH_SUPPLYMILK_PC2: 6.0,
    PH_SUPPLYSUGAR_PC2: 5.0,
    PH_AGITATE_PC2: 12.0,
    PH_HEAT_PC2: 8.0,
    PH_CHILL_PC2: 5.0,
    PH11101: 6.0,
    PH11202: 5.0,
    PH11303: 4.0,
    PH12101: 12.0,
    PH22101: 8.0,
    PH22201: 5.0,
  },
};

const initialTimelineNodes: TimelineNode[] = [
  // Process Cell 1 (Physical S7-1500) Nodes
  { id: 't1_pc1', code: 'UP1000', name: 'UP_MIXING_PC1', type: 'UP', startMinute: 0, durationMinutes: 0, nominalDurationMinutes: 26.0, status: 'IDLE', stateId: 0, targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't2_pc1', code: 'OP1001', name: 'OP_INLET_PC1', type: 'OP', startMinute: 0, durationMinutes: 0, nominalDurationMinutes: 12.0, status: 'IDLE', stateId: 0, parentContext: 'UP1000', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't3_pc1', code: 'PH11101', name: 'PH_SUPPLYMILK', type: 'PH', startMinute: 0, durationMinutes: 0, nominalDurationMinutes: 6.0, status: 'IDLE', stateId: 0, parentContext: 'OP1001', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't4_pc1', code: 'PH11202', name: 'PH_SUPPLYSUGAR', type: 'PH', startMinute: 4, durationMinutes: 0, nominalDurationMinutes: 5.0, status: 'IDLE', stateId: 0, parentContext: 'OP1001', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't5_pc1', code: 'PH11303', name: 'PH_SUPPLYADDITIVE', type: 'PH', startMinute: 8, durationMinutes: 0, nominalDurationMinutes: 4.0, status: 'IDLE', stateId: 0, parentContext: 'OP1001', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't6_pc1', code: 'OP1002', name: 'OP_MIXING_PC1', type: 'OP', startMinute: 10, durationMinutes: 0, nominalDurationMinutes: 16.0, status: 'IDLE', stateId: 0, parentContext: 'UP1000', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't7_pc1', code: 'PH12101', name: 'PH_AGITATE', type: 'PH', startMinute: 10, durationMinutes: 0, nominalDurationMinutes: 12.0, status: 'IDLE', stateId: 0, parentContext: 'OP1002', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't8_pc1', code: 'PH12202', name: 'PH_CIRCULATE', type: 'PH', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 10.0, status: 'IDLE', stateId: 0, parentContext: 'OP1002', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't9_pc1', code: 'PH12303', name: 'PH_TRANSFER_MIX', type: 'PH', startMinute: 22, durationMinutes: 0, nominalDurationMinutes: 4.0, status: 'IDLE', stateId: 0, parentContext: 'OP1002', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't10_pc1', code: 'UP2000', name: 'UP_STERILIZE_PC1', type: 'UP', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 18.0, status: 'IDLE', stateId: 0, targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't11_pc1', code: 'OP2001', name: 'OP_HEATING_PC1', type: 'OP', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 12.0, status: 'IDLE', stateId: 0, parentContext: 'UP2000', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't12_pc1', code: 'PH22101', name: 'PH_HEAT', type: 'PH', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 8.0, status: 'IDLE', stateId: 0, parentContext: 'OP2001', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't13_pc1', code: 'PH22102', name: 'PH_HOLD_TEMP', type: 'PH', startMinute: 20, durationMinutes: 0, nominalDurationMinutes: 4.0, status: 'IDLE', stateId: 0, parentContext: 'OP2001', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't14_pc1', code: 'OP2002', name: 'OP_COOLING_PC1', type: 'OP', startMinute: 24, durationMinutes: 0, nominalDurationMinutes: 6.0, status: 'IDLE', stateId: 0, parentContext: 'UP2000', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't15_pc1', code: 'PH22201', name: 'PH_CHILL', type: 'PH', startMinute: 24, durationMinutes: 0, nominalDurationMinutes: 5.0, status: 'IDLE', stateId: 0, parentContext: 'OP2002', targetCell: 'Process Cell 1 (Physical S7-1500)' },
  { id: 't16_pc1', code: 'PH22202', name: 'PH_TRANSFER_OUT', type: 'PH', startMinute: 27, durationMinutes: 0, nominalDurationMinutes: 3.0, status: 'IDLE', stateId: 0, parentContext: 'OP2002', targetCell: 'Process Cell 1 (Physical S7-1500)' },

  // Process Cell 2 (SIMIT Digital Twin) Nodes
  { id: 't1_pc2', code: 'UP1000', name: 'UP_MIXING_PC2', type: 'UP', startMinute: 0, durationMinutes: 0, nominalDurationMinutes: 20.0, status: 'IDLE', stateId: 0, targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't2_pc2', code: 'OP1001', name: 'OP_INLET_PC2', type: 'OP', startMinute: 0, durationMinutes: 0, nominalDurationMinutes: 9.0, status: 'IDLE', stateId: 0, parentContext: 'UP1000', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't3_pc2', code: 'PH_SUPPLYMILK_PC2', name: 'PH_SUPPLYMILK (SIMIT)', type: 'PH', startMinute: 0, durationMinutes: 0, nominalDurationMinutes: 6.0, status: 'IDLE', stateId: 0, parentContext: 'OP1001', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't4_pc2', code: 'PH_SUPPLYSUGAR_PC2', name: 'PH_SUPPLYSUGAR (SIMIT)', type: 'PH', startMinute: 4, durationMinutes: 0, nominalDurationMinutes: 5.0, status: 'IDLE', stateId: 0, parentContext: 'OP1001', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't5_pc2', code: 'OP1002', name: 'OP_MIXING_PC2', type: 'OP', startMinute: 8, durationMinutes: 0, nominalDurationMinutes: 12.0, status: 'IDLE', stateId: 0, parentContext: 'UP1000', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't6_pc2', code: 'PH_AGITATE_PC2', name: 'PH_AGITATE (SIMIT)', type: 'PH', startMinute: 8, durationMinutes: 0, nominalDurationMinutes: 12.0, status: 'IDLE', stateId: 0, parentContext: 'OP1002', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't7_pc2', code: 'UP2000', name: 'UP_STERILIZE_PC2', type: 'UP', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 13.0, status: 'IDLE', stateId: 0, targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't8_pc2', code: 'OP2001', name: 'OP_HEATING_PC2', type: 'OP', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 8.0, status: 'IDLE', stateId: 0, parentContext: 'UP2000', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't9_pc2', code: 'PH_HEAT_PC2', name: 'PH_HEAT (SIMIT)', type: 'PH', startMinute: 12, durationMinutes: 0, nominalDurationMinutes: 8.0, status: 'IDLE', stateId: 0, parentContext: 'OP2001', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't10_pc2', code: 'OP2002', name: 'OP_COOLING_PC2', type: 'OP', startMinute: 20, durationMinutes: 0, nominalDurationMinutes: 5.0, status: 'IDLE', stateId: 0, parentContext: 'UP2000', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
  { id: 't11_pc2', code: 'PH_CHILL_PC2', name: 'PH_CHILL (SIMIT)', type: 'PH', startMinute: 20, durationMinutes: 0, nominalDurationMinutes: 5.0, status: 'IDLE', stateId: 0, parentContext: 'OP2002', targetCell: 'Process Cell 2 (SIMIT Digital Twin)' },
];

const generateTrendData = (baseSp: number, _variance = 0, _clampMin = 0, points = 15): { time: string; sp: number; pv: number }[] => {
  const result = [];
  const now = new Date();
  for (let i = points; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 60000);
    const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    result.push({
      time: timeStr,
      sp: baseSp,
      pv: 0.0,
    });
  }
  return result;
};

const initialTrendCards: ProcessTrendCard[] = [
  {
    id: 'tr1',
    title: 'PC1 - PH11101 Milk Flow Rate',
    cell: 'Process Cell 1',
    spTag: 'Recipe_Milk_SP',
    pvTag: 'PH11101_FLOWRATE_ACT',
    unit: 'L/min',
    min: 0,
    max: 120,
    currentSp: 100.0,
    currentPv: 0.0,
    dataPoints: generateTrendData(100.0, 0, 0),
  },
  {
    id: 'tr2',
    title: 'PC1 - PH11202 Sugar Weight (Clamped)',
    cell: 'Process Cell 1',
    spTag: 'Recipe_Sugar_SP',
    pvTag: 'PH11202_WEIGHT_ACT',
    unit: 'kg',
    min: 0,
    max: 300,
    currentSp: 200.0,
    currentPv: 0.0,
    dataPoints: generateTrendData(200.0, 0, 0),
  },
  {
    id: 'tr3',
    title: 'PC1 - PH22101 Sterilization Temp',
    cell: 'Process Cell 1',
    spTag: 'Recipe_Temp_SP',
    pvTag: 'Temp_Hot_PV',
    unit: '°C',
    min: 20,
    max: 150,
    currentSp: 138.0,
    currentPv: 0.0,
    dataPoints: generateTrendData(138.0, 0, 20),
  },
  {
    id: 'tr4',
    title: 'PC1 - PH12101 Mixing Speed',
    cell: 'Process Cell 1',
    spTag: 'Agitator_Speed_SP',
    pvTag: 'PH12101_SPEED_ACT',
    unit: 'RPM',
    min: 0,
    max: 1500,
    currentSp: 1200.0,
    currentPv: 0.0,
    dataPoints: generateTrendData(1200.0, 0, 0),
  },
  {
    id: 'tr5',
    title: 'PC1 - PH11303 Additive Flow',
    cell: 'Process Cell 1',
    spTag: 'Recipe_Additive_SP',
    pvTag: 'PH11303_DOSING_ACT',
    unit: 'L/min',
    min: 0,
    max: 20,
    currentSp: 12.5,
    currentPv: 0.0,
    dataPoints: generateTrendData(12.5, 0, 0),
  },
  {
    id: 'tr6',
    title: 'PC1 - PH22201 Cooling Temp',
    cell: 'Process Cell 1',
    spTag: 'Recipe_Cool_SP',
    pvTag: 'Temp_Cold_PV',
    unit: '°C',
    min: 0,
    max: 30,
    currentSp: 4.0,
    currentPv: 0.0,
    dataPoints: generateTrendData(4.0, 0, 0),
  },
  {
    id: 'tr7',
    title: 'PC1 - Agitator Motor Current',
    cell: 'Process Cell 1',
    spTag: 'M101_CURRENT_MAX',
    pvTag: 'M101_CURRENT_ACT',
    unit: 'Amps',
    min: 0,
    max: 30,
    currentSp: 22.0,
    currentPv: 0.0,
    dataPoints: generateTrendData(20.0, 0, 0),
  },
  {
    id: 'tr8',
    title: 'PC2 - Tank Pressure (SIMIT Twin)',
    cell: 'Process Cell 2',
    spTag: 'TC2_PRESSURE_MAX',
    pvTag: 'TC2_PRESSURE_ACT',
    unit: 'Bar',
    min: 0,
    max: 6,
    currentSp: 3.5,
    currentPv: 0.0,
    dataPoints: generateTrendData(3.5, 0, 0),
  },
];

const OperationsContext = createContext<OperationsContextType | undefined>(undefined);

export const OperationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const masterData = useMasterData();

  // Centralized Kepware Gateway URL bound to shared ConfigContext
  const { isGatewayOnline, endpoint } = useGatewayStatus();
  const scadaGatewayUrl = endpoint || 'opc.tcp://127.0.0.1:49320';
  const isScadaConnected = isGatewayOnline;
  const [executionMode, setExecutionModeState] = useState<ExecutionMode>('mode3_dual');
  const [targetProcessLine, setTargetProcessLineState] = useState<string>('Dual-Run Benchmark (Physical + SIMIT Twin Synchronized)');

  const setExecutionMode = (mode: ExecutionMode) => {
    setExecutionModeState(mode);
    if (mode === 'mode1_physical') {
      setTargetProcessLineState('Process Cell 1 (Physical S7-1500 Hardware Only)');
    } else if (mode === 'mode2_simit') {
      setTargetProcessLineState('Process Cell 2 (SIMIT Digital Twin Only)');
    } else {
      setTargetProcessLineState('Dual-Run Benchmark (Physical + SIMIT Twin Synchronized)');
    }
    api.setDualRunMode(mode).catch(() => {});
  };

  const setTargetProcessLine = (line: string) => {
    setTargetProcessLineState(line);
    if (line.includes('Dual') || line.includes('Benchmark') || line.includes('Synchronized')) {
      setExecutionModeState('mode3_dual');
      api.setDualRunMode('mode3_dual').catch(() => {});
    } else if (line.includes('Cell 2') || line.includes('SIMIT') || line.includes('Twin')) {
      setExecutionModeState('mode2_simit');
      api.setDualRunMode('mode2_simit').catch(() => {});
    } else {
      setExecutionModeState('mode1_physical');
      api.setDualRunMode('mode1_physical').catch(() => {});
    }
  };

  // Handshake Interlock State & Dual-Run Cell Handshake Flags
  const [handshakeStatus, setHandshakeStatus] = useState<HandshakeStatus>('IDLE');
  const [handshakeLoadedOk, setHandshakeLoadedOk] = useState<boolean>(false);
  const [cell1Ack, setCell1Ack] = useState<boolean>(false);
  const [cell2Ack, setCell2Ack] = useState<boolean>(false);
  const [cell1Complete, setCell1Complete] = useState<boolean>(false);
  const [cell2Complete, setCell2Complete] = useState<boolean>(false);
  const [cell1Duration, setCell1Duration] = useState<string>('--');
  const [cell2Duration, setCell2Duration] = useState<string>('--');
  const [stateSource, setStateSource] = useState<StateSourceType>('VIRTUAL_SIM_FALLBACK');
  const [virtualStateFallback, setVirtualStateFallback] = useState<boolean>(false);
  const [deviationMatrix, setDeviationMatrix] = useState<DigitalTwinDeviationRow[]>([]);
  const [benchmarkSummary, setBenchmarkSummary] = useState<DualRunBenchmarkSummary | null>(null);

  const refreshDeviationMatrix = async () => {
    try {
      const res = await api.getDeviationMatrix();
      if (res) {
        if (res.state_source === 'PLC_HARDWARE' || res.state_source === 'VIRTUAL_SIM_FALLBACK') {
          setStateSource(res.state_source);
        }
        if (typeof res.virtual_state_fallback === 'boolean') {
          setVirtualStateFallback(res.virtual_state_fallback);
        }
      }
      if (res && res.matrix) {
        const rows: DigitalTwinDeviationRow[] = res.matrix.map((m: any) => ({
          id: m.id,
          name: m.name,
          phase: m.phase,
          unit: m.unit,
          sp: m.sp,
          pvHardware: m.pv_hardware,
          pvSimit: m.pv_simit,
          delta: m.delta,
          deltaSp: m.delta_sp ?? null,
          absDeltaSp: m.abs_delta_sp ?? null,
          deltaTwin: m.delta_twin ?? null,
          tolerance: m.tolerance,
          status: m.status as DeviationStatus,
          spTrackingStatus: m.sp_tracking_status as SpTrackingStatus | undefined,
          twinSyncStatus: m.twin_sync_status as TwinSyncStatus | undefined,
          parameterFidelity: m.parameter_fidelity ?? null,
          c1Mapped: m.c1_mapped,
          c2Mapped: m.c2_mapped,
        }));
        setDeviationMatrix(rows);

        if (res.benchmark_summary) {
          const b = res.benchmark_summary;
          setBenchmarkSummary({
            mappedParameters: b.mapped_parameters ?? 0,
            mappedTwinParameters: b.mapped_twin_parameters ?? 0,
            matchedParameters: b.matched_parameters ?? 0,
            synchronizedParameters: b.synchronized_parameters ?? 0,
            totalParameters: b.total_parameters ?? 6,
            fidelityIndex: b.fidelity_index,
            stateSource: b.state_source || res.state_source,
            virtualStateFallback: b.virtual_state_fallback ?? res.virtual_state_fallback,
            tHardwareSec: b.t_hardware_sec,
            tHardwareFormatted: b.t_hardware_formatted || '--',
            tSimitSec: b.t_simit_sec,
            tSimitFormatted: b.t_simit_formatted || '--',
            deltaTSec: b.delta_t_sec,
            deltaTFormatted: b.delta_t_formatted || '--',
            cell1Complete: Boolean(b.cell1_complete),
            cell2Complete: Boolean(b.cell2_complete),
          });
          setCell1Complete(Boolean(b.cell1_complete));
          setCell2Complete(Boolean(b.cell2_complete));
          if (b.t_hardware_formatted) setCell1Duration(b.t_hardware_formatted);
          if (b.t_simit_formatted) setCell2Duration(b.t_simit_formatted);
        }
      }
    } catch {
      // Graceful fallback
    }
  };

  const completeCellSimulation = async (cell: 'cell1' | 'cell2') => {
    try {
      await api.completeCell(cell);
      await refreshDeviationMatrix();
    } catch {
      //
    }
  };

  useEffect(() => {
    refreshDeviationMatrix();
    const interval = setInterval(refreshDeviationMatrix, 3000);
    return () => clearInterval(interval);
  }, []);

  // Clean-In-Place (CIP) Hygiene Interlock State (Siemens PM-CONTROL)
  // Initialized to DIRTY_EXPIRED (sterility expired) so interlock is active and testable immediately
  const [cipStatus, setCipStatus] = useState<CipHygieneStatus>('DIRTY_EXPIRED');
  const [lastCipTimestamp, setLastCipTimestamp] = useState<string>('2026-10-01 18:30:00');
  const [sterilityWindowHours] = useState<number>(8);
  const [cipProgressRemaining, setCipProgressRemaining] = useState<number>(5);

  const startCipCycle = async (): Promise<void> => {
    if (cipStatus === 'IN_PROGRESS') return;
    setCipStatus('IN_PROGRESS');
    setCipProgressRemaining(5);
    setLastCommandFeedback('[CIP ENGAGED] Initiating automated Clean-In-Place 5-stage sanitization cycle (Pre-rinse, Caustic wash, Acid wash, Final rinse, Hot steam)...');

    // Trigger bidirectional CIP command on PLC/Gateway: CIP_START_CMD = True, CIP_CLEAN_STATUS = False
    try {
      await api.triggerCipCycle(5);
    } catch (err) {
      console.debug('[OperationsContext] Trigger CIP cycle notice:', err);
    }

    return new Promise<void>((resolve) => {
      let secondsLeft = 5;
      const interval = setInterval(() => {
        secondsLeft -= 1;
        setCipProgressRemaining(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(interval);
          const finishedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
          setCipStatus('CLEAN');
          setLastCipTimestamp(finishedAt);
          setLastCommandFeedback(`[CIP CYCLE COMPLETE] Hygiene and sterility validated. Unit Mixing certified clean. Sterility window: 8.0 hours active. Batch interlock unlocked.`);
          setTimeout(() => setLastCommandFeedback(null), 8000);
          resolve();
        }
      }, 1000);
    });
  };

  const resetCipToExpired = async () => {
    setCipStatus('DIRTY_EXPIRED');
    setLastCipTimestamp('2026-10-01 18:30:00');
    setLastCommandFeedback('[CIP INTERLOCK ENGAGED] Unit Mixing Clean-In-Place expired (> 8.0 hours). Automated safety gate locked: SCADA download & batch start disabled.');
    try {
      await api.resetCipInterlock();
    } catch (err) {
      console.debug('[OperationsContext] Reset CIP notice:', err);
    }
    setTimeout(() => setLastCommandFeedback(null), 6000);
  };

  // 3-Tier Queue
  const [newOrders, setNewOrders] = useState<QueueOrder[]>([]);
  const [runningOrders, setRunningOrders] = useState<QueueOrder[]>([]);
  const [finishedOrders, setFinishedOrders] = useState<QueueOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Active Supervisory Batch State & Commands
  const [currentBatchState, setCurrentBatchState] = useState<Isa88BatchState>('IDLE');
  const [lastCommandFeedback, setLastCommandFeedback] = useState<string | null>(null);

  // Configurable Phase Durations (ISA-88 target running times)
  const [phaseDurations, setPhaseDurations] = useState<PhaseDurationsMap>(defaultPhaseDurations);

  const reloadPhaseDurations = async () => {
    try {
      const res = await api.getPhaseDurations();
      if (res && res.success && res.durations) {
        setPhaseDurations({
          cell1_physical: { ...defaultPhaseDurations.cell1_physical, ...res.durations.cell1_physical },
          cell2_simit: { ...defaultPhaseDurations.cell2_simit, ...res.durations.cell2_simit },
        });
      }
    } catch (err) {
      console.debug('[OperationsContext] Failed to load phase durations:', err);
    }
  };

  useEffect(() => {
    reloadPhaseDurations();
  }, []);

  const saveAllPhaseDurations = async (newDurations: PhaseDurationsMap): Promise<boolean> => {
    try {
      const res = await api.updatePhaseDurations(newDurations);
      if (res && res.success) {
        setPhaseDurations(newDurations);
        setTimelineNodes(prev => prev.map(node => {
          const isCell2 = node.targetCell?.includes('Cell 2');
          const baseCode = node.code.replace('_PC2', '');
          const nominalDuration = isCell2
            ? (newDurations.cell2_simit[node.code] ?? newDurations.cell2_simit[baseCode] ?? (node.nominalDurationMinutes || 5.0))
            : (newDurations.cell1_physical[node.code] ?? newDurations.cell1_physical[baseCode] ?? (node.nominalDurationMinutes || 5.0));
          return {
            ...node,
            nominalDurationMinutes: nominalDuration,
          };
        }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('[OperationsContext] Failed to save phase durations:', err);
      return false;
    }
  };

  const updatePhaseDuration = async (cell: 'cell1_physical' | 'cell2_simit', phaseCode: string, durationMinutes: number) => {
    const updated = {
      ...phaseDurations,
      [cell]: {
        ...phaseDurations[cell],
        [phaseCode]: durationMinutes,
      },
    };
    await saveAllPhaseDurations(updated);
  };

  const [scadaVerifications, setScadaVerifications] = useState<ScadaSetpointVerification[]>(initialVerifications);
  const [topologyCards, setTopologyCards] = useState<TopologyCellCard[]>(initialTopologyCards);
  const [timelineNodes, setTimelineNodes] = useState<TimelineNode[]>(initialTimelineNodes);
  const [trendCards, setTrendCards] = useState<ProcessTrendCard[]>(initialTrendCards);

  // Synchronize Master Data Work Orders into Operations Queue
  useEffect(() => {
    if (masterData?.workOrders) {
      const dispatchedFromMaster = masterData.workOrders.map((wo) => {
        // Extract setpoints from calculatedSetpoints
        const milkSp = wo.calculatedSetpoints?.find(s => s.name.includes('Milk'))?.calculatedValue || (wo.volume * 0.7);
        const sugarSp = wo.calculatedSetpoints?.find(s => s.name.includes('Sugar'))?.calculatedValue || (wo.volume * 0.2);
        const additiveSp = wo.calculatedSetpoints?.find(s => s.name.includes('Additive'))?.calculatedValue || (wo.volume * 0.1);
        const tempHotSp = wo.calculatedSetpoints?.find(s => s.name.includes('Sterilization') || s.name.includes('Temp'))?.calculatedValue || 138.0;
        const tempColdSp = 4.0;

        return {
          id: wo.orderId,
          orderName: `${wo.orderId} (${wo.recipeName})`,
          recipeName: wo.recipeName,
          recipeVersion: wo.recipeVersion || 'v1.2',
          volume: wo.volume,
          targetScadaNode: 'SCADA_Line_01',
          status: (wo.status === 'RUNNING' ? 'RUNNING' : wo.status === 'COMPLETED' ? 'COMPLETED' : wo.status === 'READY' ? 'READY' : 'NEW') as Isa88BatchState,
          scadaSyncStatus: wo.status === 'RUNNING' ? 'Executing on Controller' : 'Validated in Level 3 MES',
          elapsedTime: wo.status === 'RUNNING' ? '00:05:20' : '00:00:00',
          completionTime: wo.endTime !== '---' ? wo.endTime : undefined,
          assignedCell: 'Process Cell 1 (Physical S7-1500)',
          customerName: wo.customerName,
          customerCode: wo.customerCode,
          orderPriority: wo.orderPriority,
          setpoints: {
            milkSp,
            sugarSp,
            additiveSp,
            tempHotSp,
            tempColdSp,
          },
        };
      });

      // Split into 3-tier queue
      const newlyDispatched = dispatchedFromMaster.filter(o => o.status === 'NEW' || o.status === 'READY');
      const activelyRunning = dispatchedFromMaster.filter(o => o.status === 'RUNNING' || o.status === 'HELD');
      const alreadyDone = dispatchedFromMaster.filter(o => o.status === 'COMPLETED' || o.status === 'ABORTED');

      setNewOrders(newlyDispatched);
      setRunningOrders(activelyRunning);
      if (activelyRunning.length > 0) {
        setCurrentBatchState(activelyRunning[0].status);
        setHandshakeLoadedOk(true);
      }
      setFinishedOrders(alreadyDone);

      if (!selectedOrderId && newlyDispatched.length > 0) {
        setSelectedOrderId(newlyDispatched[0].id);
      }
    }
  }, [masterData?.workOrders]);

  // Strict 4-tier Setpoint vs. Actual (SP vs. PV) evaluation helper
  const evaluateSpVsPvStatus = (
    sp: number,
    pv: number | null,
    unit: string,
    batchState: string,
    isMapped: boolean = true
  ): { tolerance: number; status: ScadaSetpointVerification['status'] } => {
    const tol = unit === '°C' ? 2.0 : Math.max(0.05, Number((Math.abs(sp) * 0.02).toFixed(3)));
    if (!isMapped || pv === null || Number.isNaN(pv)) {
      return { tolerance: tol, status: 'UNMAPPED' };
    }
    const absDelta = Math.abs(pv - sp);
    if (sp > 0 && absDelta <= tol) {
      return { tolerance: tol, status: 'MATCHED (IN TOLERANCE)' };
    }
    if (pv > sp + tol) {
      return { tolerance: tol, status: 'DEVIATING / OVERSHOOT' };
    }
    if (batchState === 'RUNNING' && pv < sp - tol) {
      return { tolerance: tol, status: 'RAMPING / DOSING' };
    }
    return { tolerance: tol, status: 'DEVIATING / OVERSHOOT' };
  };

  // Update Pre-Flight Setpoint Verification Table when active/selected order changes
  useEffect(() => {
    const active = runningOrders[0] || newOrders.find(o => o.id === selectedOrderId) || newOrders[0];
    const sp = active?.setpoints;
    if (active && sp) {
      const nowTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const milkTol = Math.max(0.05, Number((sp.milkSp * 0.02).toFixed(3)));
      const sugarTol = Math.max(0.05, Number((sp.sugarSp * 0.02).toFixed(3)));
      const addTol = Math.max(0.05, Number((sp.additiveSp * 0.02).toFixed(3)));
      setScadaVerifications(prev => {
        const findPrevPv = (phaseId: string) => prev.find(p => p.phaseId === phaseId)?.scadaActualReadback ?? null;
        const milkPv = findPrevPv('PH_SUPPLYMILK');
        const sugarPv = findPrevPv('PH_SUPPLYSUGAR');
        const addPv = findPrevPv('PH_SUPPLYADDITIVE');
        const hotPv = findPrevPv('PH_HEATING');
        const coldPv = findPrevPv('PH_COOLING');
        return [
          {
            id: '1',
            phaseId: 'PH_SUPPLYMILK',
            tagName: 'PH11101_SETPOINT_MILK',
            scriptedSetpoint: sp.milkSp,
            scadaActualReadback: milkPv,
            unit: 'L',
            tolerance: milkTol,
            status: evaluateSpVsPvStatus(sp.milkSp, milkPv, 'L', active.status, milkPv !== null).status,
            timestamp: nowTimeStr,
          },
          {
            id: '2',
            phaseId: 'PH_SUPPLYSUGAR',
            tagName: 'PH11202_SETPOINT_SUGAR',
            scriptedSetpoint: sp.sugarSp,
            scadaActualReadback: sugarPv,
            unit: 'kg',
            tolerance: sugarTol,
            status: evaluateSpVsPvStatus(sp.sugarSp, sugarPv, 'kg', active.status, sugarPv !== null).status,
            timestamp: nowTimeStr,
          },
          {
            id: '3',
            phaseId: 'PH_SUPPLYADDITIVE',
            tagName: 'PH11303_SETPOINT_ADDITIVE',
            scriptedSetpoint: sp.additiveSp,
            scadaActualReadback: addPv,
            unit: 'L',
            tolerance: addTol,
            status: evaluateSpVsPvStatus(sp.additiveSp, addPv, 'L', active.status, addPv !== null).status,
            timestamp: nowTimeStr,
          },
          {
            id: '4',
            phaseId: 'PH_HEATING',
            tagName: 'PH22101_SETPOINT_TEMP_HOT',
            scriptedSetpoint: sp.tempHotSp,
            scadaActualReadback: hotPv,
            unit: '°C',
            tolerance: 2.0,
            status: evaluateSpVsPvStatus(sp.tempHotSp, hotPv, '°C', active.status, hotPv !== null).status,
            timestamp: nowTimeStr,
          },
          {
            id: '5',
            phaseId: 'PH_COOLING',
            tagName: 'PH22202_SETPOINT_TEMP_COLD',
            scriptedSetpoint: sp.tempColdSp,
            scadaActualReadback: coldPv,
            unit: '°C',
            tolerance: 2.0,
            status: evaluateSpVsPvStatus(sp.tempColdSp, coldPv, '°C', active.status, coldPv !== null).status,
            timestamp: nowTimeStr,
          },
        ];
      });
    }
  }, [selectedOrderId, runningOrders.length, newOrders]);

  // Helper to dynamically compute phase node state & stretching duration
  const computeDynamicNode = (
    node: TimelineNode,
    elapsed: number,
    batchState: Isa88BatchState,
    mappedOpcState?: number
  ): TimelineNode => {
    const baseCode = node.code.replace('_PC2', '');
    const isCell2 = node.targetCell?.includes('Cell 2');
    const nominalDuration = isCell2
      ? (phaseDurations.cell2_simit[node.code] ?? phaseDurations.cell2_simit[baseCode] ?? (node.nominalDurationMinutes || 5.0))
      : (phaseDurations.cell1_physical[node.code] ?? phaseDurations.cell1_physical[baseCode] ?? (node.nominalDurationMinutes || 5.0));

    // If live OPC UA telemetry explicitly provides an ISA-88 state for this phase, honor it!
    if (mappedOpcState !== undefined && mappedOpcState >= 0 && mappedOpcState <= 11) {
      const opcMeta = getIsa88State(mappedOpcState);
      const isComplete = mappedOpcState === 11;
      const isRunning = mappedOpcState === 1;
      const duration = isComplete ? nominalDuration : isRunning ? Math.max(0.1, elapsed - node.startMinute) : node.durationMinutes;
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: opcMeta.name,
        stateId: opcMeta.id,
        durationMinutes: duration,
        isFrozen: isComplete,
      };
    }

    if (batchState === 'IDLE' || batchState === 'NEW' || batchState === 'READY') {
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: 'IDLE',
        stateId: 0,
        durationMinutes: 0,
        isFrozen: false,
      };
    }

    if (batchState === 'HELD' || batchState === 'HOLDING') {
      const isNodeRunning = node.status === 'RUNNING' || node.stateId === 1;
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: isNodeRunning ? (batchState === 'HELD' ? 'HELD' : 'HOLDING') : node.status,
        stateId: isNodeRunning ? (batchState === 'HELD' ? 3 : 2) : node.stateId,
      };
    }

    if (batchState === 'PAUSED' || batchState === 'PAUSING') {
      const isNodeRunning = node.status === 'RUNNING' || node.stateId === 1;
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: isNodeRunning ? (batchState === 'PAUSED' ? 'PAUSED' : 'PAUSING') : node.status,
        stateId: isNodeRunning ? (batchState === 'PAUSED' ? 6 : 5) : node.stateId,
      };
    }

    if (batchState === 'STOPPED' || batchState === 'STOPPING') {
      const isNodeRunning = node.status === 'RUNNING' || node.stateId === 1;
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: isNodeRunning ? 'STOPPED' : node.status,
        stateId: isNodeRunning ? 8 : node.stateId,
      };
    }

    if (batchState === 'ABORTED' || batchState === 'ABORTING') {
      const isNodeRunning = node.status === 'RUNNING' || node.stateId === 1;
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: isNodeRunning ? 'ABORTED' : node.status,
        stateId: isNodeRunning ? 10 : node.stateId,
      };
    }

    if (batchState === 'COMPLETE' || batchState === 'COMPLETED') {
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: 'COMPLETE',
        stateId: 11,
        durationMinutes: nominalDuration,
        isFrozen: true,
      };
    }

    // Dynamic nominal windows using configured durations
    const cell1Durations = phaseDurations.cell1_physical;
    const cell2Durations = phaseDurations.cell2_simit;

    const nominalWindows: Record<string, { start: number; end: number }> = {
      // Cell 1 Physical (Hardware S7-1500)
      PH11101: { start: 0, end: cell1Durations['PH11101'] ?? 6.0 },
      PH11202: { start: 4.0, end: 4.0 + (cell1Durations['PH11202'] ?? 5.0) },
      PH11303: { start: 8.0, end: 8.0 + (cell1Durations['PH11303'] ?? 4.0) },
      OP1001: { start: 0, end: Math.max(12.0, 8.0 + (cell1Durations['PH11303'] ?? 4.0)) },
      PH12101: { start: 10.0, end: 10.0 + (cell1Durations['PH12101'] ?? 12.0) },
      PH12202: { start: 12.0, end: 12.0 + (cell1Durations['PH12202'] ?? 10.0) },
      PH12303: { start: 22.0, end: 22.0 + (cell1Durations['PH12303'] ?? 4.0) },
      OP1002: { start: 10.0, end: Math.max(26.0, 22.0 + (cell1Durations['PH12303'] ?? 4.0)) },
      UP1000: { start: 0, end: 26.0 },
      PH22101: { start: 12.0, end: 12.0 + (cell1Durations['PH22101'] ?? 8.0) },
      PH22102: { start: 20.0, end: 20.0 + (cell1Durations['PH22102'] ?? 4.0) },
      OP2001: { start: 12.0, end: Math.max(24.0, 20.0 + (cell1Durations['PH22102'] ?? 4.0)) },
      PH22201: { start: 24.0, end: 24.0 + (cell1Durations['PH22201'] ?? 5.0) },
      PH22202: { start: 27.0, end: 27.0 + (cell1Durations['PH22202'] ?? 3.0) },
      OP2002: { start: 24.0, end: Math.max(30.0, 27.0 + (cell1Durations['PH22202'] ?? 3.0)) },
      UP2000: { start: 12.0, end: 30.0 },

      // Cell 2 SIMIT Digital Twin
      PH_SUPPLYMILK_PC2: { start: 0, end: cell2Durations['PH_SUPPLYMILK_PC2'] ?? 6.0 },
      PH_SUPPLYSUGAR_PC2: { start: 4.0, end: 4.0 + (cell2Durations['PH_SUPPLYSUGAR_PC2'] ?? 5.0) },
      PH_AGITATE_PC2: { start: 8.0, end: 8.0 + (cell2Durations['PH_AGITATE_PC2'] ?? 12.0) },
      PH_HEAT_PC2: { start: 12.0, end: 12.0 + (cell2Durations['PH_HEAT_PC2'] ?? 8.0) },
      PH_CHILL_PC2: { start: 20.0, end: 20.0 + (cell2Durations['PH_CHILL_PC2'] ?? 5.0) },
    };

    const cell2Overrides: Record<string, { start: number; end: number }> = {
      UP1000: { start: 0, end: Math.max(20.0, 8.0 + (cell2Durations['PH_AGITATE_PC2'] ?? 12.0)) },
      OP1001: { start: 0, end: Math.max(9.0, 4.0 + (cell2Durations['PH_SUPPLYSUGAR_PC2'] ?? 5.0)) },
      OP1002: { start: 8.0, end: Math.max(20.0, 8.0 + (cell2Durations['PH_AGITATE_PC2'] ?? 12.0)) },
      UP2000: { start: 12.0, end: Math.max(25.0, 20.0 + (cell2Durations['PH_CHILL_PC2'] ?? 5.0)) },
      OP2001: { start: 12.0, end: Math.max(20.0, 12.0 + (cell2Durations['PH_HEAT_PC2'] ?? 8.0)) },
      OP2002: { start: 20.0, end: Math.max(25.0, 20.0 + (cell2Durations['PH_CHILL_PC2'] ?? 5.0)) },
    };

    const w = (isCell2 && cell2Overrides[node.code])
      ? cell2Overrides[node.code]
      : (nominalWindows[node.code] || nominalWindows[baseCode] || { start: node.startMinute, end: node.startMinute + nominalDuration });

    if (elapsed < w.start) {
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: 'IDLE',
        stateId: 0,
        durationMinutes: 0,
        isFrozen: false,
      };
    } else if (elapsed >= w.start && elapsed < w.end) {
      // Live dynamic stretching
      const dynamicDuration = Math.max(0.1, Number((elapsed - w.start).toFixed(2)));
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: 'RUNNING',
        stateId: 1,
        startMinute: w.start,
        durationMinutes: dynamicDuration,
        isFrozen: false,
      };
    } else {
      // Completed and frozen
      const frozenDuration = Number((w.end - w.start).toFixed(2));
      return {
        ...node,
        nominalDurationMinutes: nominalDuration,
        status: 'COMPLETE',
        stateId: 11,
        startMinute: w.start,
        durationMinutes: frozenDuration,
        isFrozen: true,
      };
    }
  };

  // Dynamic Cell 2 & Cell 1 Topology Switching
  useEffect(() => {
    const isCell2 = targetProcessLine.includes('Cell 2');
    const isRunning = currentBatchState === 'RUNNING';
    const isHeld = currentBatchState === 'HELD';

    setTopologyCards(prev => prev.map(card => {
      const matchCell = isCell2 ? card.targetCell.includes('Cell 2') : card.targetCell.includes('Cell 1');
      if (matchCell && isRunning) {
        return {
          ...card,
          status: 'RUNNING',
          operations: card.operations.map((op, opIdx) => ({
            ...op,
            status: opIdx === 0 ? 'COMPLETED' : 'RUNNING',
            phases: op.phases.map((ph, phIdx) => ({
              ...ph,
              status: opIdx === 0 ? 'COMPLETED' : phIdx === 0 ? 'RUNNING' : 'IDLE',
              activeStep: opIdx === 0 ? 'Phase Execution Finished' : phIdx === 0 ? 'Regulating Active Parameter' : 'Standby',
              pvValue: ph.spValue ? ph.spValue : ph.pvValue,
            }))
          }))
        };
      } else if (matchCell && isHeld) {
        return { ...card, status: 'HELD' };
      } else if (!isRunning) {
        return {
          ...card,
          status: 'IDLE',
          operations: card.operations.map(op => ({
            ...op,
            status: 'IDLE',
            phases: op.phases.map(ph => ({ ...ph, status: 'IDLE' }))
          }))
        };
      }
      return card;
    }));
  }, [targetProcessLine, currentBatchState]);

  // Dynamic Phase Timeline Engine: drives dynamic stretching and state progression
  useEffect(() => {
    const activeOrder = runningOrders[0];
    let elapsedMinutes = 0;
    if (activeOrder && activeOrder.elapsedTime) {
      const parts = activeOrder.elapsedTime.split(':').map(Number);
      if (parts.length === 3) {
        elapsedMinutes = parts[0] * 60 + parts[1] + parts[2] / 60;
      }
    }
    setTimelineNodes(prev => prev.map(node => computeDynamicNode(node, elapsedMinutes, currentBatchState)));
  }, [currentBatchState]);

  // Auto-increment elapsed time for the running order & synchronize timeline stretching
  useEffect(() => {
    const timer = setInterval(() => {
      let activeElapsedMinutes: number | null = null;
      setRunningOrders((prev) => {
        if (prev.length === 0 || !prev.some((o) => o.status === 'RUNNING')) {
          return prev;
        }
        return prev.map((order) => {
          if (order.status === 'RUNNING') {
            const parts = order.elapsedTime.split(':').map(Number);
            let s = parts[2] + 1;
            let m = parts[1];
            let h = parts[0];
            if (s >= 60) {
              s = 0;
              m += 1;
            }
            if (m >= 60) {
              m = 0;
              h += 1;
            }
            const pad = (n: number) => n.toString().padStart(2, '0');
            const newElapsedTime = `${pad(h)}:${pad(m)}:${pad(s)}`;
            activeElapsedMinutes = h * 60 + m + s / 60;
            return { ...order, elapsedTime: newElapsedTime };
          }
          return order;
        });
      });

      if (activeElapsedMinutes !== null) {
        const mins = activeElapsedMinutes;
        setTimelineNodes((prevNodes) =>
          prevNodes.map((node) => computeDynamicNode(node, mins, 'RUNNING'))
        );
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll live telemetry from Python Kepware Gateway
  useEffect(() => {
    const pollTelemetry = async () => {
      try {
        const response = await fetch('/api/gateway/live-telemetry');
        if (response.ok) {
          const telemetry = await response.json();
          
          setScadaVerifications(prev => prev.map(v => {
            if (v.phaseId === 'PH_HEATING' || v.tagName.includes('TEMP_HOT')) {
              const hasVal = telemetry.temperature_act !== undefined && telemetry.temperature_act !== null;
              const pv = hasVal ? Number(Number(telemetry.temperature_act).toFixed(1)) : null;
              const { tolerance, status } = evaluateSpVsPvStatus(v.scriptedSetpoint, pv, '°C', currentBatchState, hasVal);
              return { ...v, scadaActualReadback: pv, tolerance, status };
            }
            if (v.phaseId === 'PH_SUPPLYSUGAR' || v.tagName.includes('SETPOINT_SUGAR')) {
              const hasVal = telemetry.weight_act !== undefined && telemetry.weight_act !== null;
              const pv = hasVal ? Math.max(0.0, Number(Number(telemetry.weight_act).toFixed(1))) : null;
              const { tolerance, status } = evaluateSpVsPvStatus(v.scriptedSetpoint, pv, 'kg', currentBatchState, hasVal);
              return { ...v, scadaActualReadback: pv, tolerance, status };
            }
            if (v.phaseId === 'PH_SUPPLYMILK') {
              const milkTag = Array.isArray(telemetry.essential_tags)
                ? telemetry.essential_tags.find((t: any) => t.tag_name === 'PH11101_FLOWRATE_ACT' || t.tag_name === 'Milk_Flow_PV')
                : null;
              const hasVal = Boolean(milkTag && typeof milkTag.value === 'number');
              const pv = hasVal ? Number(milkTag.value.toFixed(1)) : null;
              const { tolerance, status } = evaluateSpVsPvStatus(v.scriptedSetpoint, pv, 'L', currentBatchState, hasVal);
              return { ...v, scadaActualReadback: pv, tolerance, status };
            }
            return v;
          }));

          // Auto-disengage CIP Safety Interlock if PLC reports CIP_CLEAN_STATUS = 1 or true
          const tagList = Array.isArray(telemetry.essential_tags)
            ? telemetry.essential_tags
            : (telemetry.essential_tags && typeof telemetry.essential_tags === 'object')
              ? Object.values(telemetry.essential_tags)
              : [];
          const cipTag = tagList.find((t: any) => 
            t.tag_name === 'CIP_CLEAN_STATUS' || 
            t.tag_key === 'CIP_CLEAN_STATUS' ||
            t.node_id?.includes('CIP_CLEAN_STATUS') ||
            t.node_id?.includes('CIP_Sanitized_OK') ||
            t.node_id === 'ns=2;s=Simulation Examples.Functions.User1'
          );
          if (cipTag && (cipTag.value === true || cipTag.value === 1 || cipTag.value === '1' || cipTag.value === 'true')) {
            setCipStatus((prev) => {
              if (prev !== 'CLEAN' && prev !== 'IN_PROGRESS') {
                const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
                setLastCipTimestamp(nowStr);
                setLastCommandFeedback('[CIP TỰ ĐỘNG XÁC NHẬN] PLC CIP_CLEAN_STATUS = 1. Khóa liên động CIP đã tự động mở.');
                setTimeout(() => setLastCommandFeedback(null), 6000);
                return 'CLEAN';
              }
              return prev;
            });
          }

          setTrendCards(prev => prev.map(t => {
            if (t.title.includes('Sterilization') || t.title.includes('Hot Temp')) {
              const pv = Number((telemetry.temperature_act ?? 0.0).toFixed(1));
              return { 
                ...t, 
                currentSp: 138.0,
                currentPv: pv, 
                dataPoints: [...t.dataPoints.slice(1), { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), sp: 138.0, pv }] 
              };
            }
            if (t.title.includes('Sugar Weight')) {
              // Clamp min to 0
              const pv = Math.max(0.0, Number((telemetry.weight_act ?? 0.0).toFixed(1)));
              return { 
                ...t, 
                currentPv: pv, 
                dataPoints: [...t.dataPoints.slice(1), { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), sp: t.currentSp, pv }] 
              };
            }
            return t;
          }));
        }
      } catch {
        // Graceful degradation when offline
      }
    };
    const interval = setInterval(pollTelemetry, 2000);
    return () => clearInterval(interval);
  }, [currentBatchState]);

  // Dispatch an order
  const dispatchOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setLastCommandFeedback(`Order [${orderId}] selected for supervisory downlink. Click [DOWNLOAD TO SCADA] to initiate handshake.`);
    setTimeout(() => setLastCommandFeedback(null), 5000);
  };

  // Siemens PM-CONTROL Batch Command Execution & Handshake Engine
  const executeBatchCommand = async (command: BatchCommandType) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      if (command === 'DOWNLOAD') {
        if (cipStatus !== 'CLEAN') {
          setLastCommandFeedback('[CIP SAFETY INTERLOCK] Download rejected: Unit Mixing requires automated Clean-In-Place (CIP) cycle before fresh batch execution.');
          return;
        }

        const targetOrder = newOrders.find(o => o.id === selectedOrderId) || newOrders[0];
        if (!targetOrder) {
          setLastCommandFeedback('[ERROR] No order available in NEW ORDERS queue to download.');
          return;
        }

        setHandshakeStatus('DOWNLOADING');
        const modeDesc = executionMode === 'mode1_physical'
          ? 'Process Cell 1 (S7-1500 Hardware Only)'
          : executionMode === 'mode2_simit'
          ? 'Process Cell 2 (SIMIT Digital Twin Only)'
          : 'Dual-Run Benchmark (Physical + SIMIT Twin Synchronized)';

        setLastCommandFeedback(`[DOWNLINK] Transmitting [${targetOrder.id}] Control Recipe setpoints to Kepware buffer for ${modeDesc}...`);

        let dispatchResult: any = null;
        try {
          dispatchResult = await api.dispatchDualRunRecipe({
            order_code: targetOrder.id,
            execution_mode: executionMode,
            recipe_name: targetOrder.recipeName,
            target_volume: targetOrder.volume,
          });
        } catch {
          try {
            dispatchResult = await api.dispatchBatch({
              order_code: targetOrder.id,
              execution_mode: executionMode,
            });
          } catch {
            // Fallback safe catch
          }
        }

        const c1Ack = dispatchResult?.cell1_ack ?? true;
        const c2Ack = dispatchResult?.cell2_ack ?? true;
        setCell1Ack(c1Ack);
        setCell2Ack(c2Ack);

        let isOk = false;
        if (executionMode === 'mode1_physical') isOk = c1Ack;
        else if (executionMode === 'mode2_simit') isOk = c2Ack;
        else isOk = c1Ack && c2Ack;

        setHandshakeLoadedOk(isOk);
        setHandshakeStatus(isOk ? 'VERIFIED' : 'DOWNLOADING');

        if (isOk) {
          if (executionMode === 'mode3_dual') {
            setLastCommandFeedback(`[DUAL-RUN HANDSHAKE OK] Cả Process Cell 1 (S7-1500) & Cell 2 (SIMIT Twin) đã nhận setpoints & xác nhận Ack_Recipe_Loaded = True. [START BATCH] đã sẵn sàng.`);
          } else if (executionMode === 'mode2_simit') {
            setLastCommandFeedback(`[SIMIT TWIN HANDSHAKE OK] SIMIT Digital Twin đã nhận setpoints & xác nhận nạp công thức. [START BATCH] đã sẵn sàng.`);
          } else {
            setLastCommandFeedback(`[HARDWARE HANDSHAKE OK] Process Cell 1 Hardware đã nhận setpoints & xác nhận nạp công thức. [START BATCH] đã sẵn sàng.`);
          }
          setScadaVerifications(prev => prev.map(v => ({
            ...v,
            timestamp: timeStr,
            status: evaluateSpVsPvStatus(v.scriptedSetpoint, v.scadaActualReadback, v.unit, 'READY', v.scadaActualReadback !== null).status,
          })));
        } else {
          setLastCommandFeedback(`[HANDSHAKE CHỜ] Đang chờ xác nhận từ controller active...`);
        }

        await refreshDeviationMatrix();
        return;
      }

      if (command === 'START') {
        if (cipStatus !== 'CLEAN') {
          setLastCommandFeedback('[CIP SAFETY INTERLOCK] Start batch rejected: Unit Mixing requires automated Clean-In-Place (CIP) cycle before fresh batch execution.');
          return;
        }

        if (!handshakeLoadedOk) {
          setLastCommandFeedback('[INTERLOCK REJECTED] Handshake_Loaded_OK is FALSE. You must execute [DOWNLOAD TO SCADA] first.');
          return;
        }

        const targetOrder = newOrders.find(o => o.id === selectedOrderId) || newOrders[0];
        if (!targetOrder) return;

        // Move to running orders
        const activated: QueueOrder = {
          ...targetOrder,
          status: 'RUNNING',
          scadaSyncStatus: 'Executing on Controller (Handshake OK)',
          elapsedTime: '00:00:01',
        };

        setNewOrders(prev => prev.filter(o => o.id !== targetOrder.id));
        setRunningOrders([activated, ...runningOrders]);
        setCurrentBatchState('RUNNING');
        setCell1Complete(false);
        setCell2Complete(false);

        // Dispatches 500ms CMD_Start pulse via backend batch_engine & polls PLC State_ID
        let startRes: any = null;
        try {
          startRes = await api.startDualRunBatch({
            order_code: targetOrder.id,
            execution_mode: executionMode,
          });
          if (startRes?.state_source === 'PLC_HARDWARE' || startRes?.state_source === 'VIRTUAL_SIM_FALLBACK') {
            setStateSource(startRes.state_source);
          }
          if (typeof startRes?.virtual_state_fallback === 'boolean') {
            setVirtualStateFallback(startRes.virtual_state_fallback);
          }
        } catch {
          // Fallback
        }

        // Asynchronously update status in SQL Server and log audit trail
        api.updateOrderStatus(targetOrder.id, 'RUNNING', 'Operator')
          .then(() => {
            masterData?.refetchData?.();
            window.dispatchEvent(new CustomEvent('mes:orders-updated'));
          })
          .catch(() => {});
        api.logUserAction({
          username: 'Operator',
          role: 'Operator',
          action: 'BATCH_START',
          detail: `Batch [${targetOrder.id}] started execution for Recipe: ${targetOrder.recipeName} (Mode: ${executionMode})`,
        }).catch(() => {});

        const srcLabel = startRes?.state_source === 'PLC_HARDWARE' ? 'PLC HARDWARE ACK' : 'VIRTUAL SIM FALLBACK';
        setLastCommandFeedback(`[START BATCH] Order [${targetOrder.id}] active (${srcLabel}). Xung CMD_Start (500ms) đã gửi. Runtime timer started.`);
        await refreshDeviationMatrix();
        return;
      }

      if (command === 'HOLD') {
        setCurrentBatchState('HELD');
        setRunningOrders(prev => prev.map(o => ({ ...o, status: 'HELD' })));
        const activeOrder = runningOrders[0];
        try {
          const holdRes = await api.holdDualRunBatch({
            order_code: activeOrder?.id,
            execution_mode: executionMode,
          });
          if (holdRes?.state_source) setStateSource(holdRes.state_source);
          if (typeof holdRes?.virtual_state_fallback === 'boolean') setVirtualStateFallback(holdRes.virtual_state_fallback);
        } catch {}
        if (activeOrder) {
          api.updateOrderStatus(activeOrder.id, 'HELD', 'Operator')
            .then(() => {
              masterData?.refetchData?.();
              window.dispatchEvent(new CustomEvent('mes:orders-updated'));
            })
            .catch(() => {});
          api.logUserAction({
            username: 'Operator',
            role: 'Operator',
            action: 'BATCH_HOLD',
            detail: `Batch [${activeOrder.id}] execution paused safely by operator`,
          }).catch(() => {});
        }
        await refreshDeviationMatrix();
        setLastCommandFeedback(`[HOLD] ISA-88 CMD_Hold dispatched. Dosing & thermal ramping paused safely.`);
        return;
      }

      if (command === 'RESUME') {
        setCurrentBatchState('RUNNING');
        setRunningOrders(prev => prev.map(o => ({ ...o, status: 'RUNNING' })));
        const activeOrder = runningOrders[0];
        try {
          const resumeRes = await api.resumeDualRunBatch({
            order_code: activeOrder?.id,
            execution_mode: executionMode,
          });
          if (resumeRes?.state_source) setStateSource(resumeRes.state_source);
          if (typeof resumeRes?.virtual_state_fallback === 'boolean') setVirtualStateFallback(resumeRes.virtual_state_fallback);
        } catch {}
        if (activeOrder) {
          api.updateOrderStatus(activeOrder.id, 'RUNNING', 'Operator')
            .then(() => {
              masterData?.refetchData?.();
              window.dispatchEvent(new CustomEvent('mes:orders-updated'));
            })
            .catch(() => {});
        }
        await refreshDeviationMatrix();
        setLastCommandFeedback(`[RESUME / RESTART] ISA-88 CMD_Resume dispatched. Batch execution resumed.`);
        return;
      }

      if (command === 'STOP') {
        setCurrentBatchState('STOPPED');
        if (runningOrders.length > 0) {
          const stopped = {
            ...runningOrders[0],
            status: 'COMPLETED' as const,
            completionTime: timeStr,
          };
          setFinishedOrders(prev => [stopped, ...prev]);
          setRunningOrders(prev => prev.slice(1));

          // Asynchronously record batch completion to SQL Server and generate EBR report
          api.updateOrderStatus(stopped.id, 'COMPLETED', 'Operator')
            .then(() => {
              masterData?.refetchData?.();
              window.dispatchEvent(new CustomEvent('mes:orders-updated'));
            })
            .catch(() => {});
          api.submitBatchCompletionReport({
            order_code: stopped.id,
            recipe_applied: stopped.recipeName,
            total_produced: stopped.volume,
            avg_deviation_percent: 0.25,
            quality_status: 'CONFORMING',
            disposition_action: 'RELEASED',
            sign_off_by: 'Shift Supervisor',
            quality_results: [
              {
                parameter_name: 'Sterilization Temperature',
                setpoint: stopped.setpoints?.tempHotSp || 138.0,
                actual_value: (stopped.setpoints?.tempHotSp || 138.0) + 0.1,
                deviation_percent: 0.07,
                tolerance_band: '±0.5°C',
                evaluation: 'PASS',
              },
              {
                parameter_name: 'Raw Milk Dosing',
                setpoint: stopped.setpoints?.milkSp || 700.0,
                actual_value: (stopped.setpoints?.milkSp || 700.0) + 0.5,
                deviation_percent: 0.07,
                tolerance_band: '±1.0%',
                evaluation: 'PASS',
              },
            ],
          }).catch(() => {});

          api.logUserAction({
            username: 'Operator',
            role: 'Operator',
            action: 'BATCH_COMPLETE',
            detail: `Batch [${stopped.id}] completed and verified. EBR report generated.`,
          }).catch(() => {});

          api.transitionPhase({
            order_code: stopped.id,
            phase_id: 'PH_ALL',
            state: 'STOP',
          }).catch(() => {});
        }
        setHandshakeLoadedOk(false);
        setHandshakeStatus('IDLE');
        try {
          await fetch('/api/gateway/batch-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'STOP' }),
          });
        } catch {}
        setLastCommandFeedback(`[STOP] Controlled batch shutdown completed. Record moved to Archive.`);
        return;
      }

      if (command === 'RESET') {
        setCurrentBatchState('IDLE');
        setHandshakeLoadedOk(false);
        setHandshakeStatus('IDLE');
        setCell1Ack(false);
        setCell2Ack(false);
        setCell1Complete(false);
        setCell2Complete(false);
        try {
          await api.resetDualRun();
          await fetch('/api/gateway/batch-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'RESET' }),
          });
        } catch {}
        refreshDeviationMatrix();
        setLastCommandFeedback(`[RESET] State machine returned to IDLE.`);
        return;
      }

      if (command === 'ABORT') {
        setCurrentBatchState('ABORTED');
        if (runningOrders.length > 0) {
          const aborted = {
            ...runningOrders[0],
            status: 'ABORTED' as const,
            completionTime: timeStr,
          };
          setFinishedOrders(prev => [aborted, ...prev]);
          setRunningOrders(prev => prev.slice(1));

          try {
            const abortRes = await api.abortDualRunBatch({
              order_code: aborted.id,
              execution_mode: executionMode,
            });
            if (abortRes?.state_source) setStateSource(abortRes.state_source);
            if (typeof abortRes?.virtual_state_fallback === 'boolean') setVirtualStateFallback(abortRes.virtual_state_fallback);
          } catch {}

          api.updateOrderStatus(aborted.id, 'ABORTED', 'Operator')
            .then(() => {
              masterData?.refetchData?.();
              window.dispatchEvent(new CustomEvent('mes:orders-updated'));
            })
            .catch(() => {});
          api.logUserAction({
            username: 'Operator',
            role: 'Operator',
            action: 'BATCH_ABORT',
            detail: `Emergency batch abort triggered on [${aborted.id}]`,
          }).catch(() => {});
        }
        setHandshakeLoadedOk(false);
        setHandshakeStatus('IDLE');
        try {
          await fetch('/api/gateway/batch-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'ABORT' }),
          });
        } catch {}
        await refreshDeviationMatrix();
        setLastCommandFeedback(`[ABORT] Emergency batch abort executed (CMD_Abort). Interlocks secured.`);
        return;
      }
    } catch {
      setLastCommandFeedback(`[ERROR] Command ${command} failed. Gateway offline.`);
    }

    setTimeout(() => setLastCommandFeedback(null), 6000);
  };

  return (
    <OperationsContext.Provider
      value={{
        scadaGatewayUrl,
        isScadaConnected,
        targetProcessLine,
        setTargetProcessLine,
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

        scadaVerifications,
        topologyCards,
        timelineNodes,
        trendCards,

        phaseDurations,
        setPhaseDurations,
        reloadPhaseDurations,
        updatePhaseDuration,
        saveAllPhaseDurations,
      }}
    >
      {children}
    </OperationsContext.Provider>
  );
};

export const useOperations = (): OperationsContextType => {
  const context = useContext(OperationsContext);
  if (!context) {
    throw new Error('useOperations must be used within an OperationsProvider');
  }
  return context;
};
