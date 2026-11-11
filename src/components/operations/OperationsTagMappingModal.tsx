/* Hallmark · component: OperationsTagMappingModal · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';
import {
  Settings,
  X,
  Check,
  AlertTriangle,
  CheckCircle2,
  Save,
  Radio,
  Flame,
  Snowflake,
  RotateCw,
  Sparkles,
  PlaySquare,
  PauseCircle,
  Flag,
  HelpCircle,
  Activity,
  Layers,
  Cpu,
  Search,
  Trash2
} from 'lucide-react';

export interface OperationsTagMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export type TagSectionType = 'general' | 'pc1' | 'pc2_simit';

export interface TagParameterDefinition {
  key: string;
  label: string;
  description: string;
  section: TagSectionType;
  sectionTitle: string;
  group: string;
  groupTitle: string;
  direction: 'READ' | 'WRITE';
  unit: string;
  expectedType: string;
  icon: React.ElementType;
}

export const OPERATIONS_TAG_PARAMETERS: TagParameterDefinition[] = [
  // =========================================================================
  // SECTION 1: GENERAL PROCESS VARIABLES (SETPOINT / ACTUAL VALUES)
  // =========================================================================
  {
    key: 'uht_temp_sp',
    label: 'UHT Temp SP',
    description: 'Nhiệt độ cài đặt tiệt trùng UHT (Target Setpoint)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'uht',
    groupTitle: 'NHIỆT ĐỘ TIỆT TRÙNG UHT (STERILIZATION TEMPERATURE)',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'uht_temp_pv',
    label: 'UHT Temp PV',
    description: 'Nhiệt độ thực tế buồng tiệt trùng UHT (Actual Process Value)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'uht',
    groupTitle: 'NHIỆT ĐỘ TIỆT TRÙNG UHT (STERILIZATION TEMPERATURE)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cooling_temp_sp',
    label: 'Cooling Temp SP',
    description: 'Nhiệt độ cài đặt làm lạnh sữa buffer (Cooling Setpoint)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'cooling',
    groupTitle: 'NHIỆT ĐỘ LÀM LẠNH BUFFER (COOLING TEMPERATURE)',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Snowflake,
  },
  {
    key: 'cooling_temp_pv',
    label: 'Cooling Temp PV',
    description: 'Nhiệt độ thực tế kho/bồn đệm sữa lạnh (Cooling Actual PV)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'cooling',
    groupTitle: 'NHIỆT ĐỘ LÀM LẠNH BUFFER (COOLING TEMPERATURE)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Snowflake,
  },
  {
    key: 'agitator_speed_sp',
    label: 'Agitator Speed SP',
    description: 'Tốc độ cài đặt động cơ cánh khuấy (Mixing Speed Target)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'agitator',
    groupTitle: 'BỘ KHUẤY ĐỘNG CƠ BỒN TRỘN (AGITATOR MOTOR SPEED)',
    direction: 'WRITE',
    unit: 'RPM',
    expectedType: 'Float',
    icon: RotateCw,
  },
  {
    key: 'agitator_speed_pv',
    label: 'Agitator Speed PV',
    description: 'Tốc độ vòng quay thực tế cánh khuấy (Actual Speed Feedback)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'agitator',
    groupTitle: 'BỘ KHUẤY ĐỘNG CƠ BỒN TRỘN (AGITATOR MOTOR SPEED)',
    direction: 'READ',
    unit: 'RPM',
    expectedType: 'Float',
    icon: RotateCw,
  },
  {
    key: 'cip_clean_status',
    label: 'CIP Clean Status (Read)',
    description: 'Cờ trạng thái vệ sinh CIP hoàn tất (1 = Sạch / Clean, 0 = Bẩn / Dirty)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'cip',
    groupTitle: 'VỆ SINH KHỬ TRÙNG CIP (CLEAN-IN-PLACE INTERLOCK)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Sparkles,
  },
  {
    key: 'cip_start_cmd',
    label: 'CIP Start Command (Write)',
    description: 'Xung kích hoạt chu trình CIP từ MES xuống PLC (Trigger Wash Cycle)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'cip',
    groupTitle: 'VỆ SINH KHỬ TRÙNG CIP (CLEAN-IN-PLACE INTERLOCK)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Sparkles,
  },
  {
    key: 'batch_start_cmd',
    label: 'Batch Start Command (Write)',
    description: 'Xung bắt đầu thực thi mẻ sản xuất (Batch Start Pulse Trigger)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'batch',
    groupTitle: 'ĐIỀU KHIỂN THỰC THI MẺ ISA-88 (BATCH SUPERVISION)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: PlaySquare,
  },
  {
    key: 'batch_hold_cmd',
    label: 'Hold Command (Write)',
    description: 'Lệnh tạm dừng / giữ trạng thái mẻ (ISA-88 Hold Command)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'batch',
    groupTitle: 'ĐIỀU KHIỂN THỰC THI MẺ ISA-88 (BATCH SUPERVISION)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: PauseCircle,
  },
  {
    key: 'batch_complete_flag',
    label: 'Batch Complete Flag (Read)',
    description: 'Cờ báo PLC/SCADA hoàn thành mẻ (Batch Finished Pulse Flag)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'batch',
    groupTitle: 'ĐIỀU KHIỂN THỰC THI MẺ ISA-88 (BATCH SUPERVISION)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Flag,
  },
  {
    key: 'mixing_weight_pv',
    label: 'Mixing Weight PV (Loadcell)',
    description: 'Khối lượng thực tế bồn trộn đo bằng loadcell (Mixing Vessel Loadcell PV)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'mixing_instrumentation',
    groupTitle: 'BỒN TRỘN LOADCELL & NHIỆT ĐỘ (MIXING INSTRUMENTATION)',
    direction: 'READ',
    unit: 'kg',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'mixing_temp_pv',
    label: 'Mixing Temp PV (PT100)',
    description: 'Nhiệt độ thực tế bồn trộn đo bằng cảm biến PT100 (Mixing Vessel RTD Temp)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'mixing_instrumentation',
    groupTitle: 'BỒN TRỘN LOADCELL & NHIỆT ĐỘ (MIXING INSTRUMENTATION)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'ssr_heater_status',
    label: 'SSR Heater Status (Output)',
    description: 'Trạng thái kích hoạt thanh gia nhiệt SSR buồng Heater (Solid State Relay Output)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'heater_interlock',
    groupTitle: 'KHÓA LIÊN ĐỘNG GIA NHIỆT HEATER (HEATER SSR & READY INTERLOCK)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Flame,
  },
  {
    key: 'heater_ready_flag',
    label: 'Heater Ready Interlock Flag (PLC)',
    description: 'Cờ PLC báo buồng Heater đã đạt nhiệt độ, cho phép mở van/bơm chuyển liệu từ bồn trộn sang Heater',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'heater_interlock',
    groupTitle: 'KHÓA LIÊN ĐỘNG GIA NHIỆT HEATER (HEATER SSR & READY INTERLOCK)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: CheckCircle2,
  },
  {
    key: 'weigh1_weight_pv',
    label: 'Weigh Hopper 1 Loadcell PV (Milk)',
    description: 'Khối lượng thực tế bồn cân trung gian 1 - Sữa tươi (Hopper 1 Loadcell Mass PV)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'READ',
    unit: 'kg/L',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'weigh2_weight_pv',
    label: 'Weigh Hopper 2 Loadcell PV (Sugar)',
    description: 'Khối lượng thực tế bồn cân trung gian 2 - Đường (Hopper 2 Loadcell Mass PV)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'READ',
    unit: 'kg',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'weigh3_weight_pv',
    label: 'Weigh Hopper 3 Loadcell PV (Additive)',
    description: 'Khối lượng thực tế bồn cân trung gian 3 - Phụ gia (Hopper 3 Loadcell Mass PV)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'READ',
    unit: 'kg/L',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'valve_weigh1_out',
    label: 'Valve Hopper 1 Discharge (Actuator)',
    description: 'Lệnh mở van xả bồn cân trung gian 1 vào bồn trộn (Discharge Valve Cmd)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: RotateCw,
  },
  {
    key: 'valve_weigh2_out',
    label: 'Valve Hopper 2 Discharge (Actuator)',
    description: 'Lệnh mở van xả bồn cân trung gian 2 vào bồn trộn (Discharge Valve Cmd)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: RotateCw,
  },
  {
    key: 'valve_weigh3_out',
    label: 'Valve Hopper 3 Discharge (Actuator)',
    description: 'Lệnh mở van xả bồn cân trung gian 3 vào bồn trộn (Discharge Valve Cmd)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: RotateCw,
  },
  {
    key: 'out_weight_pv',
    label: 'Output Tank (OUT-01) Loadcell PV',
    description: 'Khối lượng thực tế bồn chứa thành phẩm sau tiệt trùng (Finished Tank Loadcell PV)',
    section: 'general',
    sectionTitle: '1. BIẾN QUY TRÌNH CHUNG (SP / PV / INTERLOCKS)',
    group: 'preweighing_instrumentation',
    groupTitle: 'HỆ THỐNG CÂN TRUNG GIAN & THÀNH PHẨM (PRE-WEIGHING HOPPERS & OUTPUT TANK)',
    direction: 'READ',
    unit: 'kg/L',
    expectedType: 'Float',
    icon: Activity,
  },

  // =========================================================================
  // SECTION 2: PROCESS CELL 1 (HARDWARE S7-1500) ISA-88 TAGS & NODES
  // =========================================================================

  // --- PC1 ISA-88 Setpoint Tags (Recipe Downlink) ---
  {
    key: 'cell1.Batch_ID',
    label: 'PC1 Sub-Batch ID (Mã định danh mẻ)',
    description: 'Mã định danh mẻ con duy nhất nạp xuống PLC phục vụ truy xuất nguồn gốc (VD: MO00001-B01)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'String',
    expectedType: 'String',
    icon: Layers,
  },
  {
    key: 'cell1.Batch_Index',
    label: 'PC1 Batch Index (Số thứ tự mẻ)',
    description: 'Số thứ tự mẻ con hiện tại trong Campaign của đơn hàng Odoo (1..N)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'Count',
    expectedType: 'Int16',
    icon: Activity,
  },
  {
    key: 'cell1.Batch_Total',
    label: 'PC1 Total Batches (Tổng số mẻ)',
    description: 'Tổng số mẻ con trong chiến dịch của đơn hàng Odoo (N)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'Count',
    expectedType: 'Int16',
    icon: Activity,
  },
  {
    key: 'cell1.Milk_SP',
    label: 'PC1 Milk Setpoint (L)',
    description: 'Lượng sữa tươi cài đặt nạp vào bồn trộn Cell 1 (Volume Recipe Target)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'L',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell1.Sugar_SP',
    label: 'PC1 Sugar Setpoint (kg)',
    description: 'Khối lượng đường siro cài đặt định lượng Cell 1 (Sugar Mass Target)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'kg',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell1.Additive_SP',
    label: 'PC1 Additive Setpoint (kg)',
    description: 'Khối lượng vi chất phụ gia cài đặt Cell 1 (Micronutrient Target)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'kg',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell1.Heating_SP',
    label: 'PC1 Heating Temp SP (°C)',
    description: 'Nhiệt độ cài đặt tiệt trùng UHT Cell 1 (Sterilization Target Setpoint)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell1.Cooling_SP',
    label: 'PC1 Cooling Temp SP (°C)',
    description: 'Nhiệt độ cài đặt làm lạnh sốc Cell 1 (Chilling Target Setpoint)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Snowflake,
  },
  {
    key: 'cell1.Agitator_SP',
    label: 'PC1 Agitator Speed SP (RPM)',
    description: 'Tốc độ quay cài đặt động cơ khuấy Cell 1 (Mixing Motor Setpoint)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_sp',
    groupTitle: 'CELL 1 CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'RPM',
    expectedType: 'Float',
    icon: RotateCw,
  },

  // --- PC1 Process Values (Live Hardware Sensors) ---
  {
    key: 'cell1.Milk_PV',
    label: 'PC1 Milk Actual PV (L)',
    description: 'Lưu lượng / thể tích sữa tươi thực tế đo từ cảm biến bồn Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: 'L',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'cell1.Sugar_PV',
    label: 'PC1 Sugar Actual PV (kg)',
    description: 'Khối lượng đường thực tế từ cảm biến loadcell định lượng Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: 'kg',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'cell1.Heating_PV',
    label: 'PC1 Heating Temp PV (°C)',
    description: 'Nhiệt độ buồng tiệt trùng thực tế đo bằng cảm biến PT100 Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell1.Cooling_PV',
    label: 'PC1 Cooling Temp PV (°C)',
    description: 'Nhiệt độ bộ làm lạnh vô trùng thực tế Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Snowflake,
  },
  {
    key: 'cell1.Agitator_PV',
    label: 'PC1 Agitator Speed PV (RPM)',
    description: 'Tốc độ phản hồi thực tế từ biến tần động cơ cánh khuấy Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: 'RPM',
    expectedType: 'Float',
    icon: RotateCw,
  },
  {
    key: 'cell1.Mixing_Weight_PV',
    label: 'PC1 Mixing Weight PV (kg)',
    description: 'Khối lượng thực tế bồn trộn đo từ cảm biến Loadcell Cell 1 (Loadcell Transmitter)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: 'kg',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'cell1.Mixing_Temp_PV',
    label: 'PC1 Mixing Temp PV (°C)',
    description: 'Nhiệt độ bồn trộn thực tế đo bằng cảm biến RTD PT100 Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_pv',
    groupTitle: 'CELL 1 THÔNG SỐ VẬN HÀNH THỰC TẾ (LIVE HARDWARE PT100/LOADCELL READ)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },

  // --- PC1 ISA-88 Commands & Handshake Flags ---
  {
    key: 'cell1.CMD_Start',
    label: 'PC1 Batch Start Command (Pulse)',
    description: 'Xung 500ms kích hoạt chạy mẻ xuống PLC Cell 1 (CMD_Start = True)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: PlaySquare,
  },
  {
    key: 'cell1.Ack_Recipe_Loaded',
    label: 'PC1 Recipe Acknowledged Flag',
    description: 'Cờ phản hồi PLC đã nhận đầy đủ công thức (Ack_Recipe_Loaded = True)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: CheckCircle2,
  },
  {
    key: 'cell1.State_ID',
    label: 'PC1 State ID (0..11)',
    description: 'Mã số trạng thái ISA-88 thực tế của Cell 1 (0: IDLE, 1: RUNNING, 11: COMPLETE)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Cpu,
  },
  {
    key: 'cell1.Current_Phase',
    label: 'PC1 Current Active Phase',
    description: 'Tên hoặc mã pha đang chạy trong chu trình mẻ Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'String',
    expectedType: 'String',
    icon: Layers,
  },
  {
    key: 'cell1.Flag_Complete',
    label: 'PC1 Batch Complete Flag',
    description: 'Cờ báo PLC Cell 1 đã hoàn thành toàn bộ mẻ sản xuất (Flag_Complete = True)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Flag,
  },
  {
    key: 'cell1.SSR_Heater_Status',
    label: 'PC1 SSR Heater Status',
    description: 'Trạng thái rơ le bán dẫn gia nhiệt Heater SSR Cell 1 (SSR Output)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Flame,
  },
  {
    key: 'cell1.Heater_Ready_Flag',
    label: 'PC1 Heater Ready Interlock Flag',
    description: 'Cờ PLC Cell 1 xác nhận Heater đủ nhiệt, cho phép chuyển liệu từ bồn trộn sang Heater',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_handshakes',
    groupTitle: 'CELL 1 LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: CheckCircle2,
  },

  // --- PC1 Legacy Supervisory & Phase State Nodes ---
  {
    key: 'pc1_batch_state',
    label: 'PC1 Batch State (0..11)',
    description: 'Trạng thái mẻ ISA-88 Cell 1 (0: IDLE, 1: RUNNING, ..., 11: COMPLETE)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_state',
    groupTitle: 'SUPERVISORY STATE & THERMAL NODES',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Cpu,
  },
  {
    key: 'pc1_uht_temp_sp',
    label: 'PC1 UHT Temp SP (Legacy)',
    description: 'Cài đặt nhiệt độ buồng tiệt trùng UHT Cell 1 (S7-1500 Setpoint)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_state',
    groupTitle: 'SUPERVISORY STATE & THERMAL NODES',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'pc1_uht_temp_pv',
    label: 'PC1 UHT Temp PV (Legacy)',
    description: 'Nhiệt độ thực tế buồng tiệt trùng UHT Cell 1 (PT100 Feedback)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_state',
    groupTitle: 'SUPERVISORY STATE & THERMAL NODES',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'pc1_phases.UP1000',
    label: 'PC1 UP1000 Mixing Unit State',
    description: 'Trạng thái Unit Procedure bồn trộn Mixing Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.OP1001',
    label: 'PC1 OP1001 Infeed State',
    description: 'Trạng thái Operation nạp liệu nguyên liệu',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH11101',
    label: 'PC1 PH11101 Milk Supply State (6.0m)',
    description: 'Trạng thái Phase cấp sữa tươi nguyên liệu (Thời lượng: 6.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH11202',
    label: 'PC1 PH11202 Sugar Dosing State (5.0m)',
    description: 'Trạng thái Phase cấp đường siro / định lượng (Thời lượng: 5.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH11303',
    label: 'PC1 PH11303 Additive State (4.0m)',
    description: 'Trạng thái Phase bơm vi chất dinh dưỡng (Thời lượng: 4.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.OP1002',
    label: 'PC1 OP1002 Mixing State (16.0m)',
    description: 'Trạng thái Operation khuấy trộn & tuần hoàn',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH12101',
    label: 'PC1 PH12101 Agitate State (12.0m)',
    description: 'Trạng thái Phase khuấy trộn tốc độ cao M-101 (Thời lượng: 12.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH12202',
    label: 'PC1 PH12202 Circulate State (10.0m)',
    description: 'Trạng thái Phase tuần hoàn khử bọt P-102 (Thời lượng: 10.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH12303',
    label: 'PC1 PH12303 Transfer Mix State (4.0m)',
    description: 'Trạng thái Phase chuyển dịch sữa đã trộn sang UHT (Thời lượng: 4.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up1000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.UP2000',
    label: 'PC1 UP2000 Sterilize Unit State',
    description: 'Trạng thái Unit Procedure tiệt trùng UHT Cell 1',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.OP2001',
    label: 'PC1 OP2001 Heating State (12.0m)',
    description: 'Trạng thái Operation gia nhiệt tiệt trùng',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH22101',
    label: 'PC1 PH22101 Heat State (8.0m)',
    description: 'Trạng thái Phase gia nhiệt van hơi V-201 (Thời lượng: 8.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH22102',
    label: 'PC1 PH22102 Hold Temp State (4.0m)',
    description: 'Trạng thái Phase lưu nhiệt ống giữ nhiệt TC-202 (Thời lượng: 4.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.OP2002',
    label: 'PC1 OP2002 Cooling State (6.0m)',
    description: 'Trạng thái Operation làm lạnh vô trùng',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH22201',
    label: 'PC1 PH22201 Chill State (5.0m)',
    description: 'Trạng thái Phase làm lạnh sốc HEX-203 (Thời lượng: 5.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc1_phases.PH22202',
    label: 'PC1 PH22202 Transfer Out State (3.0m)',
    description: 'Trạng thái Phase chiết xuất vô trùng sang bồn đệm (Thời lượng: 3.0 phút)',
    section: 'pc1',
    sectionTitle: '2. PROCESS CELL 1 (HARDWARE S7-1500)',
    group: 'pc1_up2000',
    groupTitle: 'PROCEDURAL HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },

  // =========================================================================
  // SECTION 3: PROCESS CELL 2 (SIMIT DIGITAL TWIN) ISA-88 TAGS & NODES
  // =========================================================================

  // --- PC2 SIMIT Digital Twin ISA-88 Setpoint Tags ---
  {
    key: 'cell2_simit.Batch_ID',
    label: 'SIMIT Sub-Batch ID (Mã định danh mẻ)',
    description: 'Mã định danh mẻ con duy nhất nạp xuống mô hình bản sao số SIMIT Cell 2',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'String',
    expectedType: 'String',
    icon: Layers,
  },
  {
    key: 'cell2_simit.Batch_Index',
    label: 'SIMIT Batch Index (Số thứ tự mẻ)',
    description: 'Số thứ tự mẻ con hiện tại trong Campaign (1..N)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'Count',
    expectedType: 'Int16',
    icon: Activity,
  },
  {
    key: 'cell2_simit.Batch_Total',
    label: 'SIMIT Total Batches (Tổng số mẻ)',
    description: 'Tổng số mẻ con trong chiến dịch của đơn hàng Odoo (N)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'Count',
    expectedType: 'Int16',
    icon: Activity,
  },
  {
    key: 'cell2_simit.Milk_SP',
    label: 'SIMIT Milk Setpoint (L)',
    description: 'Lượng sữa cài đặt nạp vào mô hình bản sao số SIMIT Cell 2 (Twin Target)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'L',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell2_simit.Sugar_SP',
    label: 'SIMIT Sugar Setpoint (kg)',
    description: 'Khối lượng đường cài đặt định lượng trên mô hình SIMIT (Twin Target)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'kg',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell2_simit.Additive_SP',
    label: 'SIMIT Additive Setpoint (kg)',
    description: 'Khối lượng vi chất cài đặt trên mô hình SIMIT Cell 2 (Twin Target)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'kg',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell2_simit.Heating_SP',
    label: 'SIMIT Heating Temp SP (°C)',
    description: 'Nhiệt độ cài đặt tiệt trùng UHT mô phỏng trên SIMIT Cell 2',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell2_simit.Cooling_SP',
    label: 'SIMIT Cooling Temp SP (°C)',
    description: 'Nhiệt độ cài đặt làm lạnh sốc mô phỏng trên SIMIT Cell 2',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Snowflake,
  },
  {
    key: 'cell2_simit.Agitator_SP',
    label: 'SIMIT Agitator Speed SP (RPM)',
    description: 'Tốc độ cánh khuấy cài đặt mô phỏng trên SIMIT Cell 2',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_sp',
    groupTitle: 'SIMIT TWIN CÔNG THỨC CÀI ĐẶT (RECIPE SETPOINTS - ISA-88 WRITE)',
    direction: 'WRITE',
    unit: 'RPM',
    expectedType: 'Float',
    icon: RotateCw,
  },

  // --- PC2 SIMIT Process Values (Dynamic Simulation PVs) ---
  {
    key: 'cell2_simit.Milk_PV',
    label: 'SIMIT Milk Simulated PV (L)',
    description: 'Thể tích sữa phản hồi từ mô hình thủy lực SIMIT Digital Twin (Dynamic Simulation)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: 'L',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'cell2_simit.Sugar_PV',
    label: 'SIMIT Sugar Simulated PV (kg)',
    description: 'Khối lượng đường phản hồi từ mô hình nạp liệu SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: 'kg',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'cell2_simit.Heating_PV',
    label: 'SIMIT Heating Temp PV (°C)',
    description: 'Nhiệt độ buồng tiệt trùng phản hồi từ mô hình nhiệt động học SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'cell2_simit.Cooling_PV',
    label: 'SIMIT Cooling Temp PV (°C)',
    description: 'Nhiệt độ bộ làm lạnh phản hồi từ mô hình nhiệt động học SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Snowflake,
  },
  {
    key: 'cell2_simit.Agitator_PV',
    label: 'SIMIT Agitator Speed PV (RPM)',
    description: 'Tốc độ cánh khuấy phản hồi từ mô hình cơ cấu truyền động SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: 'RPM',
    expectedType: 'Float',
    icon: RotateCw,
  },
  {
    key: 'cell2_simit.Mixing_Weight_PV',
    label: 'SIMIT Mixing Weight Simulated PV (kg)',
    description: 'Khối lượng bồn trộn phản hồi từ mô hình nạp liệu SIMIT Digital Twin (Dynamic Simulation)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: 'kg',
    expectedType: 'Float',
    icon: Activity,
  },
  {
    key: 'cell2_simit.Mixing_Temp_PV',
    label: 'SIMIT Mixing Temp Simulated PV (°C)',
    description: 'Nhiệt độ bồn trộn phản hồi từ mô hình nhiệt động học SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_pv',
    groupTitle: 'SIMIT TWIN THÔNG SỐ MÔ PHỎNG ĐỘNG HỌC (DYNAMIC SIMULATION PV READ)',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },

  // --- PC2 SIMIT Commands & Handshake Flags ---
  {
    key: 'cell2_simit.CMD_Start',
    label: 'SIMIT Batch Start Command (Pulse)',
    description: 'Xung 500ms kích hoạt chạy mẻ trên mô hình SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'WRITE',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: PlaySquare,
  },
  {
    key: 'cell2_simit.Ack_Recipe_Loaded',
    label: 'SIMIT Recipe Acknowledged Flag',
    description: 'Cờ SIMIT xác nhận đã nạp đầy đủ công thức (Ack_Recipe_Loaded = True)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: CheckCircle2,
  },
  {
    key: 'cell2_simit.State_ID',
    label: 'SIMIT State ID (0..11)',
    description: 'Mã số trạng thái ISA-88 của mô hình SIMIT Cell 2 (0: IDLE, 1: RUNNING, 11: COMPLETE)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Cpu,
  },
  {
    key: 'cell2_simit.Current_Phase',
    label: 'SIMIT Current Active Phase',
    description: 'Tên hoặc mã pha đang chạy trong mô hình SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'String',
    expectedType: 'String',
    icon: Layers,
  },
  {
    key: 'cell2_simit.Flag_Complete',
    label: 'SIMIT Batch Complete Flag',
    description: 'Cờ báo mô hình SIMIT đã hoàn thành toàn bộ mẻ sản xuất (Flag_Complete = True)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Flag,
  },
  {
    key: 'cell2_simit.SSR_Heater_Status',
    label: 'SIMIT SSR Heater Status',
    description: 'Trạng thái rơ le SSR phản hồi từ mô hình SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: Flame,
  },
  {
    key: 'cell2_simit.Heater_Ready_Flag',
    label: 'SIMIT Heater Ready Flag',
    description: 'Cờ SIMIT mô phỏng xác nhận Heater đủ nhiệt cho phép chuyển liệu',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_handshakes',
    groupTitle: 'SIMIT TWIN LỆNH & CỜ BẮT TAY ISA-88 (HANDSHAKE & COMMANDS)',
    direction: 'READ',
    unit: 'Bool',
    expectedType: 'Boolean',
    icon: CheckCircle2,
  },

  // --- PC2 SIMIT Legacy Supervisory & Phase State Nodes ---
  {
    key: 'pc2_simit_batch_state',
    label: 'SIMIT Batch State (0..11)',
    description: 'Trạng thái mẻ ISA-88 Cell 2 SIMIT (0: IDLE, 1: RUNNING, ..., 11: COMPLETE)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_state',
    groupTitle: 'SIMIT SIMULATION STATE & THERMAL NODES',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Cpu,
  },
  {
    key: 'pc2_simit_uht_temp_sp',
    label: 'SIMIT UHT Temp SP (Legacy)',
    description: 'Cài đặt nhiệt độ buồng tiệt trùng UHT SIMIT (Simulated Setpoint)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_state',
    groupTitle: 'SIMIT SIMULATION STATE & THERMAL NODES',
    direction: 'WRITE',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'pc2_simit_uht_temp_pv',
    label: 'SIMIT UHT Temp PV (Legacy)',
    description: 'Nhiệt độ phản hồi mô hình nhiệt động học SIMIT (Dynamic Twin PV)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_state',
    groupTitle: 'SIMIT SIMULATION STATE & THERMAL NODES',
    direction: 'READ',
    unit: '°C',
    expectedType: 'Float',
    icon: Flame,
  },
  {
    key: 'pc2_simit_phases.UP1000',
    label: 'SIMIT UP1000 Mixing Unit State (20.0m)',
    description: 'Trạng thái Unit Procedure bồn trộn mô hình SIMIT Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up1000',
    groupTitle: 'SIMIT HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.OP1001',
    label: 'SIMIT OP1001 Infeed State (9.0m)',
    description: 'Trạng thái Operation nạp liệu SIMIT Digital Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up1000',
    groupTitle: 'SIMIT HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.PH_SUPPLYMILK_PC2',
    label: 'SIMIT PH_SUPPLYMILK_PC2 State (6.0m)',
    description: 'Trạng thái Phase cấp sữa tươi mô phỏng SIMIT (Thời lượng: 6.0 phút)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up1000',
    groupTitle: 'SIMIT HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.PH_SUPPLYSUGAR_PC2',
    label: 'SIMIT PH_SUPPLYSUGAR_PC2 State (5.0m)',
    description: 'Trạng thái Phase cấp đường siro mô phỏng SIMIT (Thời lượng: 5.0 phút)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up1000',
    groupTitle: 'SIMIT HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.OP1002',
    label: 'SIMIT OP1002 Mixing State (12.0m)',
    description: 'Trạng thái Operation khuấy trộn mô phỏng SIMIT',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up1000',
    groupTitle: 'SIMIT HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.PH_AGITATE_PC2',
    label: 'SIMIT PH_AGITATE_PC2 State (12.0m)',
    description: 'Trạng thái Phase động cơ khuấy mô phỏng SIMIT (Thời lượng: 12.0 phút)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up1000',
    groupTitle: 'SIMIT HIERARCHY: UP1000 MIXING UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.UP2000',
    label: 'SIMIT UP2000 Sterilize Unit State (13.0m)',
    description: 'Trạng thái Unit Procedure tiệt trùng UHT SIMIT Twin',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up2000',
    groupTitle: 'SIMIT HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.OP2001',
    label: 'SIMIT OP2001 Heating State (8.0m)',
    description: 'Trạng thái Operation gia nhiệt tiệt trùng SIMIT',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up2000',
    groupTitle: 'SIMIT HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.PH_HEAT_PC2',
    label: 'SIMIT PH_HEAT_PC2 State (8.0m)',
    description: 'Trạng thái Phase gia nhiệt van hơi mô phỏng SIMIT (Thời lượng: 8.0 phút)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up2000',
    groupTitle: 'SIMIT HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.OP2002',
    label: 'SIMIT OP2002 Cooling State (5.0m)',
    description: 'Trạng thái Operation làm lạnh vô trùng SIMIT',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up2000',
    groupTitle: 'SIMIT HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
  {
    key: 'pc2_simit_phases.PH_CHILL_PC2',
    label: 'SIMIT PH_CHILL_PC2 State (5.0m)',
    description: 'Trạng thái Phase làm lạnh sốc mô phỏng SIMIT (Thời lượng: 5.0 phút)',
    section: 'pc2_simit',
    sectionTitle: '3. PROCESS CELL 2 (SIMIT DIGITAL TWIN)',
    group: 'pc2_up2000',
    groupTitle: 'SIMIT HIERARCHY: UP2000 STERILIZE UNIT',
    direction: 'READ',
    unit: 'Int16',
    expectedType: 'Int16',
    icon: Layers,
  },
];

export const OperationsTagMappingModal: React.FC<OperationsTagMappingModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  // Active Section Filter Tab
  const [activeSection, setActiveSection] = useState<'all' | TagSectionType>('general');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Empty baseline state: All fields initially completely empty ""
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning'>('success');

  // Test status per NodeId
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, {
    testing: boolean;
    valid?: boolean;
    value?: any;
    message?: string;
  }>>({});

  // Fetch saved mappings on modal open
  const loadSavedMappings = async () => {
    setIsLoading(true);
    setToastMessage(null);
    try {
      const res = await api.getOperationsTagMappings();
      if (res && res.mappings) {
        const raw = res.mappings;
        const loaded: Record<string, string> = {};

        OPERATIONS_TAG_PARAMETERS.forEach((param) => {
          let val = '';

          // 1. Check dot-notation for nested dicts (e.g. pc1_phases.PH11101)
          if (param.key.includes('.')) {
            const [parentKey, subKey] = param.key.split('.');
            if (raw[parentKey] && typeof raw[parentKey] === 'object' && raw[parentKey][subKey]) {
              const subVal = raw[parentKey][subKey];
              val = typeof subVal === 'string' ? subVal : subVal.node_id ? String(subVal.node_id) : '';
            } else if (raw[param.key]) {
              val = typeof raw[param.key] === 'string' ? raw[param.key] : raw[param.key].node_id || '';
            }
          } else {
            // Direct key
            const candidate = raw[param.key] || raw[param.key.toUpperCase()] || raw[param.label];
            if (typeof candidate === 'string') {
              val = candidate;
            } else if (candidate && typeof candidate === 'object' && candidate.node_id) {
              val = String(candidate.node_id);
            }
          }

          // 2. Check aliases if still empty
          if (!val) {
            const aliasMap: Record<string, string[]> = {
              uht_temp_sp: ['Recipe_Temp_SP', 'Heat_Temp_SP', 'UHT_TEMP_SP', 'pc1_uht_temp_sp'],
              pc1_uht_temp_sp: ['Recipe_Temp_SP', 'Heat_Temp_SP', 'UHT_TEMP_SP', 'uht_temp_sp'],
              uht_temp_pv: ['Heat_Temp_ACT', 'Temp_Sterilizer_PV', 'UHT_TEMP_PV', 'pc1_uht_temp_pv'],
              pc1_uht_temp_pv: ['Heat_Temp_ACT', 'Temp_Sterilizer_PV', 'UHT_TEMP_PV', 'uht_temp_pv'],
              cooling_temp_sp: ['Cold_Temp_SP', 'Cooling_Temp_SP', 'COOLING_TEMP_SP'],
              cooling_temp_pv: ['Cold_Temp_ACT', 'Cooling_Temp_PV', 'COOLING_TEMP_PV'],
              agitator_speed_sp: ['Agitator_Speed_SP', 'Motor_Speed_SP', 'AGITATOR_SPEED_SP'],
              agitator_speed_pv: ['MOTOR_SPEED_ACT', 'Agitator_Speed_PV', 'AGITATOR_SPEED_PV'],
              cip_clean_status: ['CIP_CLEAN_STATUS'],
              cip_start_cmd: ['CIP_START_CMD'],
              batch_start_cmd: ['Batch_Start_CMD', 'Batch_Start', 'BATCH_START_CMD', 'cell1.CMD_Start'],
              batch_hold_cmd: ['Batch_Hold_CMD', 'Batch_Hold', 'BATCH_HOLD_CMD'],
              batch_complete_flag: ['FLAG_BATCH_COMPLETE', 'Batch_Complete_Flag', 'BATCH_COMPLETE_FLAG', 'cell1.Flag_Complete'],
              pc1_batch_state: ['Batch_State', 'batch_state', 'cell1.State_ID'],
              pc2_simit_batch_state: ['SIMIT_Batch_State', 'cell2_simit.State_ID'],
              pc2_simit_uht_temp_sp: ['SIMIT_Temp_Hot_SP', 'cell2_simit.Heating_SP'],
              pc2_simit_uht_temp_pv: ['SIMIT_Temp_Hot_PV', 'cell2_simit.Heating_PV'],
              'cell1.Heating_SP': ['pc1_uht_temp_sp', 'uht_temp_sp', 'Recipe_Temp_SP'],
              'cell1.Heating_PV': ['pc1_uht_temp_pv', 'uht_temp_pv', 'Heat_Temp_ACT'],
              'cell1.Cooling_SP': ['cooling_temp_sp', 'Cold_Temp_SP'],
              'cell1.Cooling_PV': ['cooling_temp_pv', 'Cold_Temp_ACT'],
              'cell1.Agitator_SP': ['agitator_speed_sp', 'Motor_Speed_SP'],
              'cell1.Agitator_PV': ['agitator_speed_pv', 'MOTOR_SPEED_ACT'],
              'cell1.CMD_Start': ['batch_start_cmd', 'Batch_Start_CMD'],
              'cell1.Flag_Complete': ['batch_complete_flag', 'FLAG_BATCH_COMPLETE'],
              'cell1.State_ID': ['pc1_batch_state', 'Batch_State'],
              'cell1.Mixing_Weight_PV': ['mixing_weight_pv', 'TANK_ALL_ACT_KL'],
              'cell1.Mixing_Temp_PV': ['mixing_temp_pv'],
              'cell1.SSR_Heater_Status': ['ssr_heater_status', 'PID_OUT_SSR', 'HEATER_RUN_STATUS'],
              'cell1.Heater_Ready_Flag': ['heater_ready_flag', 'HEATER_TEMP_OK'],
              'cell2_simit.Heating_SP': ['pc2_simit_uht_temp_sp', 'SIMIT_Temp_Hot_SP'],
              'cell2_simit.Heating_PV': ['pc2_simit_uht_temp_pv', 'SIMIT_Temp_Hot_PV'],
              'cell2_simit.State_ID': ['pc2_simit_batch_state', 'SIMIT_Batch_State'],
              'cell2_simit.Mixing_Weight_PV': ['pc2_simit_mixing_weight_pv', 'mixing_weight_pv'],
              'cell2_simit.Mixing_Temp_PV': ['pc2_simit_mixing_temp_pv', 'mixing_temp_pv'],
              'cell2_simit.SSR_Heater_Status': ['pc2_simit_ssr_heater_status', 'ssr_heater_status'],
              'cell2_simit.Heater_Ready_Flag': ['pc2_simit_heater_ready_flag', 'heater_ready_flag'],
              mixing_weight_pv: ['cell1.Mixing_Weight_PV', 'TANK_ALL_ACT_KL'],
              mixing_temp_pv: ['cell1.Mixing_Temp_PV'],
              ssr_heater_status: ['cell1.SSR_Heater_Status', 'PID_OUT_SSR', 'HEATER_RUN_STATUS'],
              heater_ready_flag: ['cell1.Heater_Ready_Flag', 'HEATER_TEMP_OK'],
            };

            const aliases = aliasMap[param.key] || [];
            for (const al of aliases) {
              let aVal: any = undefined;
              if (al.includes('.')) {
                const [p, c] = al.split('.');
                aVal = raw[p]?.[c];
              } else {
                aVal = raw[al];
              }
              if (typeof aVal === 'string' && aVal) {
                val = aVal;
                break;
              } else if (aVal && typeof aVal === 'object' && aVal.node_id) {
                val = String(aVal.node_id);
                break;
              }
            }
          }

          loaded[param.key] = val || '';
        });

        setTagInputs(loaded);
      }
    } catch {
      // Graceful baseline: keep empty strings ""
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSavedMappings();
      setNodeTestResults({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleInputChange = (key: string, value: string) => {
    setTagInputs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Test single OPC UA NodeId connectivity
  const handleTestNode = async (key: string, nodeId: string) => {
    const cleanNode = nodeId.trim();
    if (!cleanNode) {
      setNodeTestResults((prev) => ({
        ...prev,
        [key]: { testing: false, valid: false, message: 'Node ID rỗng!' },
      }));
      return;
    }

    setNodeTestResults((prev) => ({
      ...prev,
      [key]: { testing: true },
    }));

    try {
      const res = await api.testOpcNodeConnectivity(cleanNode);
      setNodeTestResults((prev) => ({
        ...prev,
        [key]: {
          testing: false,
          valid: res.valid,
          value: res.value,
          message: res.message || (res.valid ? `Phản hồi: ${res.value}` : 'Không có phản hồi từ Kepware'),
        },
      }));
    } catch (err: any) {
      setNodeTestResults((prev) => ({
        ...prev,
        [key]: {
          testing: false,
          valid: false,
          message: err.message || 'Lỗi kiểm tra Node ID',
        },
      }));
    }
  };

  // Save single tag individually (Incremental Persistence)
  const handleSaveSingleTag = async (key: string) => {
    const val = tagInputs[key] || '';
    setSavingKey(key);
    try {
      const payload = { [key]: val.trim() };
      const res = await api.updateOperationsTagMappings(payload);
      if (res && res.success) {
        showToast('Đã lưu cấu hình Tag thành công!', 'success');
        if (onSaved) onSaved();
      } else {
        showToast(res.error || 'Lỗi khi lưu cấu hình tag!', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi gọi API lưu tag!', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  // Save active section tags together (Atomic Merge for Tab 1, 2, or 3)
  const handleSaveActiveTab = async () => {
    setIsSavingAll(true);
    try {
      const payload: Record<string, string> = {};
      const relevantParams = activeSection === 'all'
        ? OPERATIONS_TAG_PARAMETERS
        : OPERATIONS_TAG_PARAMETERS.filter((p) => p.section === activeSection);

      relevantParams.forEach((param) => {
        if (tagInputs[param.key] !== undefined) {
          payload[param.key] = (tagInputs[param.key] || '').trim();
        }
      });

      const res = await api.updateOperationsTagMappings(payload);
      if (res && res.success) {
        const tabLabel = activeSection === 'pc1'
          ? 'Process Cell 1 (Hardware)'
          : activeSection === 'pc2_simit'
          ? 'Process Cell 2 (SIMIT Twin)'
          : activeSection === 'general'
          ? 'Biến quy trình chung'
          : 'Tất cả';
        showToast(`Đã lưu cấu hình [${tabLabel}] thành công!`, 'success');
        if (onSaved) onSaved();
      } else {
        showToast(res.error || 'Lỗi khi lưu cấu hình tag!', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi gọi API lưu tab!', 'error');
    } finally {
      setIsSavingAll(false);
    }
  };

  // Save all tags or active section tags together
  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAll(true);
    try {
      const payload: Record<string, string> = {};
      Object.entries(tagInputs).forEach(([k, v]) => {
        payload[k] = (v || '').trim();
      });

      const res = await api.updateOperationsTagMappings(payload);
      if (res && res.success) {
        showToast('Đã lưu cấu hình Tag thành công!', 'success');
        if (onSaved) onSaved();
      } else {
        showToast(res.error || 'Lỗi khi lưu cấu hình tag!', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi gọi API lưu tất cả tag!', 'error');
    } finally {
      setIsSavingAll(false);
    }
  };

  // Filter items based on active section and search query
  const filteredParameters = OPERATIONS_TAG_PARAMETERS.filter((param) => {
    if (activeSection !== 'all' && param.section !== activeSection) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        param.key.toLowerCase().includes(q) ||
        param.label.toLowerCase().includes(q) ||
        param.description.toLowerCase().includes(q) ||
        (tagInputs[param.key] || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group filtered parameters by their groupTitle
  const groupedParameters = filteredParameters.reduce<Record<string, TagParameterDefinition[]>>((acc, item) => {
    if (!acc[item.groupTitle]) {
      acc[item.groupTitle] = [];
    }
    acc[item.groupTitle].push(item);
    return acc;
  }, {});

  // Section item counts for tabs
  const countGeneral = OPERATIONS_TAG_PARAMETERS.filter((p) => p.section === 'general').length;
  const countPc1 = OPERATIONS_TAG_PARAMETERS.filter((p) => p.section === 'pc1').length;
  const countPc2 = OPERATIONS_TAG_PARAMETERS.filter((p) => p.section === 'pc2_simit').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-tag-mapping-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs font-mono"
    >
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-700 shrink-0 select-none">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <h2 id="ops-tag-mapping-title" className="text-sm font-bold uppercase tracking-wider not-italic text-white">
                CẤU HÌNH ÁNH XẠ KEPWARE OPC UA TAG - OPERATIONS &amp; BATCH (ISA-88)
              </h2>
              <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                Strict Empty-Baseline &amp; Incremental Persistence · Process Cell 1 (Physical) &amp; Process Cell 2 (SIMIT Digital Twin)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-none focus-visible:outline-2 focus-visible:outline-sky-400 focus-visible:outline-offset-2 active:translate-y-px"
            title="Đóng modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Selector Toolbar */}
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSection('general')}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                activeSection === 'general'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <span>1. Biến Quy Trình Chung ({countGeneral})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('pc1')}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                activeSection === 'pc1'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>2. Process Cell 1 - Hardware ({countPc1})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('pc2_simit')}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                activeSection === 'pc2_simit'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <Radio className="w-3 h-3 text-sky-400" />
              <span>3. Process Cell 2 - SIMIT Twin ({countPc2})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`h-8 px-3 text-xs uppercase font-mono border transition-none flex items-center gap-1.5 ${
                activeSection === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <span>Tất cả ({OPERATIONS_TAG_PARAMETERS.length})</span>
            </button>
          </div>

          {/* Search Filter Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm tag / nodeId..."
              className="w-full h-8 pl-8 pr-3 bg-white border border-slate-300 text-xs font-mono placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
            />
          </div>
        </div>

        {/* Informational Guidance Banner */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              Khởi tạo mặc định trống hoàn toàn <code className="bg-slate-200 px-1 py-0.5 text-slate-900 font-bold">""</code> (Zero simulation mocks). Biến chưa ánh xạ hiển thị <code className="bg-slate-200 px-1 py-0.5 text-slate-700">[CHƯA ÁNH XẠ]</code>.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-white border border-slate-300 px-2 py-0.5 font-bold">
              PORT: 49320 (KEPWARE OPC UA)
            </span>
          </div>
        </div>

        {/* Non-blocking Toast Feedback */}
        {toastMessage && (
          <div
            className={`mx-4 mt-3 p-3 border font-mono text-xs flex items-center justify-between shrink-0 ${
              toastType === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : toastType === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {toastType === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              )}
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-slate-500 hover:text-slate-900 text-xs font-bold px-1"
            >
              [✕]
            </button>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500 font-mono">
              <Activity className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
              <span>Đang đọc cấu hình từ tag_mappings.json &amp; SQL Server...</span>
            </div>
          ) : Object.keys(groupedParameters).length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-mono">
              Không tìm thấy thông số nào phù hợp với bộ lọc.
            </div>
          ) : (
            Object.entries(groupedParameters).map(([groupTitle, items]) => (
              <div key={groupTitle} className="border border-slate-200 bg-white shadow-2xs">
                {/* Group Header */}
                <div className="bg-slate-100/90 px-3 py-2 border-b border-slate-200 text-slate-800 font-bold uppercase text-[11px] tracking-wider flex items-center justify-between">
                  <span>{groupTitle}</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    {items.length} THÔNG SỐ
                  </span>
                </div>

                {/* Group Items */}
                <div className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const currentValue = tagInputs[item.key] || '';
                    const isMapped = Boolean(currentValue.trim() && currentValue.trim() !== '[CHƯA ÁNH XẠ]');
                    const Icon = item.icon;
                    const test = nodeTestResults[item.key];
                    const isSingleSaving = savingKey === item.key;

                    return (
                      <div
                        key={item.key}
                        className="p-3 hover:bg-slate-50/60 transition-none flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        {/* Left: Metadata & Labels */}
                        <div className="md:w-5/12 space-y-1">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span className="font-bold text-slate-900">{item.label}</span>
                            <span
                              className={`px-1.5 py-0.2 text-[9px] font-bold border uppercase ${
                                item.direction === 'WRITE'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {item.direction}
                            </span>
                            <span className="px-1.5 py-0.2 text-[9px] bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                              {item.unit}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 leading-tight">
                            {item.description}
                          </div>

                          {/* Status Pill */}
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                                isMapped
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 text-slate-500 border-slate-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isMapped ? 'bg-emerald-600' : 'bg-slate-400'
                                }`}
                              />
                              {isMapped ? 'ĐÃ ÁNH XẠ' : '[CHƯA ÁNH XẠ] (--)'}
                            </span>

                            {test && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 border ${
                                  test.testing
                                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                                    : test.valid
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-rose-50 text-rose-800 border-rose-300'
                                }`}
                              >
                                {test.testing ? 'Đang test...' : test.message}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Input field & Action Buttons */}
                        <div className="md:w-7/12 flex items-center gap-2">
                          <input
                            type="text"
                            value={currentValue}
                            onChange={(e) => handleInputChange(item.key, e.target.value)}
                            placeholder={`Nhập NodeId cho ${item.label}...`}
                            className="flex-1 h-9 px-3 bg-white border border-slate-300 text-slate-900 text-xs font-mono placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                          />

                          {/* Test Button */}
                          <button
                            type="button"
                            disabled={!currentValue.trim() || test?.testing}
                            onClick={() => handleTestNode(item.key, currentValue)}
                            className="h-9 px-2.5 text-xs font-mono font-semibold uppercase tracking-wider inline-flex items-center gap-1 border bg-white border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
                            title="Kiểm tra kết nối tới NodeId này trên Kepware OPC UA"
                          >
                            <Radio className={`w-3.5 h-3.5 ${test?.testing ? 'animate-pulse text-sky-600' : ''}`} />
                            <span className="hidden sm:inline">Test</span>
                          </button>

                          {/* Save Single Field Button */}
                          <button
                            type="button"
                            disabled={isSingleSaving || isSavingAll}
                            onClick={() => handleSaveSingleTag(item.key)}
                            className="h-9 px-3 text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
                            title="Lưu riêng thông số này (Lưu từng bước / Incremental Save)"
                          >
                            <Save className={`w-3.5 h-3.5 ${isSingleSaving ? 'animate-spin' : ''}`} />
                            <span>{isSingleSaving ? 'Lưu...' : 'Lưu'}</span>
                          </button>

                          {/* Unmap / Clear Button */}
                          <button
                            type="button"
                            disabled={!currentValue.trim() || isSingleSaving || isSavingAll}
                            onClick={async () => {
                              handleInputChange(item.key, '');
                              setSavingKey(item.key);
                              try {
                                const res = await api.updateOperationsTagMappings({ [item.key]: '' });
                                if (res && res.success) {
                                  showToast(`Đã gỡ ánh xạ tag [${item.label}] thành công!`, 'success');
                                  setNodeTestResults((prev) => ({
                                    ...prev,
                                    [item.key]: { testing: false, valid: false, message: 'Đã gỡ (Chưa ánh xạ)' }
                                  }));
                                  if (onSaved) onSaved();
                                } else {
                                  showToast(res.error || 'Lỗi khi gỡ ánh xạ tag!', 'error');
                                }
                              } catch (err: any) {
                                showToast(err.message || 'Lỗi khi gọi API gỡ tag!', 'error');
                              } finally {
                                setSavingKey(null);
                              }
                            }}
                            className="h-9 px-2 text-xs font-mono font-semibold uppercase tracking-wider inline-flex items-center gap-1 border bg-white border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-none focus-visible:outline-2 focus-visible:outline-rose-600 focus-visible:outline-offset-2 active:translate-y-px"
                            title="Gỡ ánh xạ tag này (Đặt về [CHƯA ÁNH XẠ])"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Gỡ</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-300 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 font-mono">
            Hệ thống hỗ trợ lưu lẻ từng tag hoặc bấm <strong className="text-slate-900">[LƯU TOÀN BỘ CẤU HÌNH]</strong> để cập nhật tất cả mà không mất dữ liệu cũ.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-mono font-semibold uppercase tracking-wider border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
            >
              ĐÓNG
            </button>

            {activeSection !== 'all' && (
              <button
                type="button"
                disabled={isSavingAll || isLoading}
                onClick={handleSaveActiveTab}
                className="h-9 px-4 text-xs font-mono font-bold uppercase tracking-wider border border-sky-700 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white inline-flex items-center gap-2 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
                title={`Lưu riêng cấu hình cho ${activeSection === 'pc1' ? 'Process Cell 1' : activeSection === 'pc2_simit' ? 'Process Cell 2 (SIMIT Twin)' : 'Biến quy trình chung'} mà không ghi đè tab khác`}
              >
                <Save className={`w-3.5 h-3.5 ${isSavingAll ? 'animate-spin' : ''}`} />
                <span>
                  LƯU {activeSection === 'pc1' ? 'TAB 2 (CELL 1)' : activeSection === 'pc2_simit' ? 'TAB 3 (SIMIT TWIN)' : 'TAB 1 (CHUNG)'}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={isSavingAll || isLoading}
              onClick={handleSaveAll}
              className="h-9 px-5 text-xs font-mono font-bold uppercase tracking-wider border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white inline-flex items-center gap-2 transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px"
            >
              <Check className={`w-4 h-4 ${isSavingAll ? 'animate-spin' : ''}`} />
              <span>{isSavingAll ? 'ĐANG LƯU TOÀN BỘ...' : 'LƯU TOÀN BỘ CẤU HÌNH'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationsTagMappingModal;
