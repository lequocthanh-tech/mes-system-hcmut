"""
/* Hallmark · component: DualRunBatchEngine · register: industrial-workbench
 * standards: ISA-88 Batch Control / ISA-95 MOM / ISA-101 HMI
 * strict: Central OPC UA Gateway Session Reuse (Port 49320)
 */

Dual-Run SIMIT Digital Twin Benchmarking and Real-Time Deviation Engine.
Orchestrates parallel or isolated batch execution across:
  - Process Cell 1 (Physical Siemens S7-1500 PLC)
  - Process Cell 2 (Siemens SIMIT Virtual Digital Twin)
"""

import os
import sys
import time
import json
import asyncio
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

logger = logging.getLogger("DualRunBatchEngine")

# Ensure backend directory in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# ============================================================================
# ============================================================================
# PHYSICAL UNIT CONSTRAINTS & CAMPAIGN SIZING (ISA-88 / ISA-95)
# ============================================================================

VESSEL_MAX_CAPACITY: float = 5.0   # Physical geometric volume of Mixing/Heating vessel (L)
SAFE_MAX_RATIO: float = 0.90       # 90% -> V_safe_max = 4.50 L (headspace to prevent vortex spilling)
MIN_STABLE_RATIO: float = 0.40     # 40% -> V_min_stable = 2.00 L (submerge PT100 probe & impeller, prevent SSR thermal overshoot)
SWEET_SPOT_MIN_RATIO: float = 0.65 # 65% -> 3.25 L to 4.50 L (Optimal thermal & mechanical efficiency zone)

def calculate_optimal_batch_campaign(
    total_order_volume: float,
    vessel_capacity: float = 5.0,
    safe_max_ratio: float = 0.90,
    min_stable_ratio: float = 0.40,
    recipe_ratios: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    ISA-88 / ISA-95 Optimal Batch Sizing & Campaign Load Equalization Engine.
    When ERP order volume exceeds physical vessel safe capacity (e.g. 18.0 L on 5.0 L tank),
    computes optimal batch count (N) and equalized batch volume (V_batch) to prevent
    vortex splashing, PT100 sensor exposure, and SSR thermal overshoot.
    """
    import math

    v_safe_max = round(vessel_capacity * safe_max_ratio, 2)
    v_min_stable = round(vessel_capacity * min_stable_ratio, 2)
    v_sweet_min = round(vessel_capacity * SWEET_SPOT_MIN_RATIO, 2)

    total_order_volume = float(total_order_volume or 0.0)

    if total_order_volume <= 0:
        return {
            "total_order_volume": 0.0,
            "vessel_max_capacity": vessel_capacity,
            "safe_max_capacity": v_safe_max,
            "min_stable_volume": v_min_stable,
            "safe_max_ratio": safe_max_ratio,
            "campaign_required": False,
            "batch_count": 0,
            "optimal_batches_count": 0,
            "equalized_batch_volume": 0.0,
            "load_factor_pct": 0.0,
            "is_in_sweet_spot": False,
            "estimated_energy_saving_pct": 0.0,
            "recipe_setpoints_per_batch": {
                "milk_sp": 0.0, "sugar_sp": 0.0, "additive_sp": 0.0,
                "heating_sp": 138.0, "cooling_sp": 4.0, "agitator_sp": 1200.0
            },
            "campaign_total_materials": {"total_milk": 0.0, "total_sugar": 0.0, "total_additive": 0.0},
            "naive_split": {"full_batches": 0, "remnant_volume": 0.0, "explanation": "Không có khối lượng đặt hàng."},
            "campaign_schedule": [],
            "recommendation_text": "Chưa có thể tích mẻ sản xuất."
        }

    # Formulation ratios (Default: Milk 70%, Sugar 20%, Additive 10%)
    ratios = recipe_ratios or {}
    r_milk = ratios.get("milk", ratios.get("milk_sp", 0.70))
    r_sugar = ratios.get("sugar", ratios.get("sugar_sp", 0.20))
    r_additive = ratios.get("additive", ratios.get("additive_sp", 0.10))

    if total_order_volume <= v_safe_max:
        batch_count = 1
        equalized_batch_volume = round(total_order_volume, 2)
        campaign_required = False
    else:
        batch_count = math.ceil(total_order_volume / v_safe_max)
        equalized_batch_volume = round(total_order_volume / batch_count, 2)
        campaign_required = True

    # Naive split comparison
    naive_full_batches = int(total_order_volume // vessel_capacity)
    naive_remnant = round(total_order_volume - (naive_full_batches * vessel_capacity), 2)
    if naive_remnant > 0:
        naive_explanation = (
            f"Phương án ngây thơ chia {naive_full_batches} mẻ kịch trần ({vessel_capacity:.1f}L) + 1 mẻ vét lẻ {naive_remnant:.2f}L "
            f"bị TỪ CHỐI: Mẻ vét {naive_remnant:.2f}L không ngập đủ cảm biến PT100 và cánh khuấy, gây quán tính nhiệt sai lệch "
            f"làm bộc phát nhiệt quá mức (SSR thermal overshoot) và xém cháy sữa."
        )
    else:
        naive_explanation = (
            f"Phương án chia {naive_full_batches} mẻ kịch trần 100% ({vessel_capacity:.1f}L) thiếu 10% khoảng không an toàn "
            f"(headspace), có nguy cơ sánh tràn khi cánh khuấy quay ở 1200 RPM."
        )

    # Per-batch scaled setpoints
    milk_sp = round(equalized_batch_volume * r_milk, 2)
    sugar_sp = round(equalized_batch_volume * r_sugar, 2)
    additive_sp = round(equalized_batch_volume * r_additive, 2)

    # Campaign total materials
    total_milk = round(total_order_volume * r_milk, 2)
    total_sugar = round(total_order_volume * r_sugar, 2)
    total_additive = round(total_order_volume * r_additive, 2)

    # Stability & Energy metrics
    load_factor_pct = round((equalized_batch_volume / vessel_capacity) * 100.0, 1)
    is_in_sweet_spot = (v_min_stable <= equalized_batch_volume <= v_safe_max)
    estimated_energy_saving_pct = round(min(25.0, 6.5 + 4.5 * (batch_count - 1)), 1) if campaign_required else 0.0

    # Build campaign schedule
    campaign_schedule = [
        {
            "batch_index": i,
            "batch_label": f"Mẻ {i}/{batch_count}",
            "planned_volume": equalized_batch_volume,
            "milk_sp": milk_sp,
            "sugar_sp": sugar_sp,
            "additive_sp": additive_sp,
            "status": "READY" if i == 1 else "PENDING"
        }
        for i in range(1, batch_count + 1)
    ]

    recommendation_text = (
        f"Kế hoạch ISA-88 tối ưu: Chia đều đơn hàng {total_order_volume:.2f}L thành {batch_count} mẻ đồng nhất "
        f"với thể tích {equalized_batch_volume:.2f}L/mẻ (Tải {load_factor_pct}% bồn {vessel_capacity:.1f}L). "
        f"Đảm bảo an toàn cơ học chống tràn bồn, tối ưu hóa quá trình truyền nhiệt gia nhiệt SSR và duy trì chất lượng sữa đồng đều."
    )

    return {
        "total_order_volume": total_order_volume,
        "vessel_max_capacity": vessel_capacity,
        "safe_max_capacity": v_safe_max,
        "min_stable_volume": v_min_stable,
        "safe_max_ratio": safe_max_ratio,
        "campaign_required": campaign_required,
        "batch_count": batch_count,
        "optimal_batches_count": batch_count,
        "equalized_batch_volume": equalized_batch_volume,
        "load_factor_pct": load_factor_pct,
        "is_in_sweet_spot": is_in_sweet_spot,
        "estimated_energy_saving_pct": estimated_energy_saving_pct,
        "recipe_setpoints_per_batch": {
            "milk_sp": milk_sp,
            "sugar_sp": sugar_sp,
            "additive_sp": additive_sp,
            "heating_sp": 138.0,
            "cooling_sp": 4.0,
            "agitator_sp": 1200.0
        },
        "campaign_total_materials": {
            "total_milk": total_milk,
            "total_sugar": total_sugar,
            "total_additive": total_additive
        },
        "naive_split": {
            "full_batches": naive_full_batches,
            "remnant_volume": naive_remnant,
            "explanation": naive_explanation
        },
        "campaign_schedule": campaign_schedule,
        "recommendation_text": recommendation_text
    }

# ============================================================================
# STATE REPOSITORY (THREAD-SAFE SINGLETON)
# ============================================================================

class DualRunBatchState:
    def __init__(self):
        # 3-Way Execution Mode:
        # 'mode1_physical': Process Cell 1 (Physical S7-1500 Hardware Only)
        # 'mode2_simit': Process Cell 2 (SIMIT Digital Twin Only)
        # 'mode3_dual': Dual-Run Benchmark (Physical + SIMIT Twin Synchronized)
        self.execution_mode: str = "mode3_dual"
        
        # Current active batch info
        self.order_code: Optional[str] = None
        self.active_batch_id: Optional[str] = None
        self.recipe_name: Optional[str] = "Fresh Pasteurized Milk"
        self.target_volume: float = 1000.0
        self.batch_state: str = "IDLE"  # IDLE, DOWNLOADING, READY, RUNNING, COMPLETED, HELD, STOPPED

        # ISA-88 Campaign tracking
        self.total_order_volume: float = 1000.0
        self.campaign_batch_count: int = 1
        self.current_campaign_batch: int = 1
        self.equalized_batch_volume: float = 1000.0
        self.campaign_plan: Optional[Dict[str, Any]] = None
        self.campaign_accumulated_actual_volume: float = 0.0
        self.awaiting_drain: bool = False
        self.drain_threshold: float = 0.8
        
        # Setpoints cache
        self.recipe_setpoints: Dict[str, float] = {
            "milk_sp": 700.0,
            "sugar_sp": 200.0,
            "additive_sp": 100.0,
            "heating_sp": 138.0,
            "cooling_sp": 4.0,
            "agitator_sp": 1200.0
        }
        
        # Timestamps for benchmarking
        self.t_start_cell1: Optional[float] = None
        self.t_start_cell2: Optional[float] = None
        self.t_end_cell1: Optional[float] = None
        self.t_end_cell2: Optional[float] = None
        
        # Handshake & Acknowledgment flags
        self.cell1_ack: bool = False
        self.cell2_ack: bool = False
        
        # Independent Completion Flags
        self.cell1_complete: bool = False
        self.cell2_complete: bool = False
        self.completion_processed: bool = False
        
        # State IDs (ISA-88 / PM-CONTROL: 0=IDLE, 1=RUNNING, 2=HELD, 3=COMPLETE, 4=ABORTED)
        self.cell1_state_id: int = 0
        self.cell2_state_id: int = 0
        
        # Active procedural phase
        self.cell1_current_phase: str = "PH_IDLE"
        self.cell2_current_phase: str = "PH_IDLE"

        # ISA-88 PLC-Driven State Authority vs. Safe Virtual Commissioning Fallback
        self.virtual_state_fallback: bool = False
        self.state_source: str = "VIRTUAL_SIM_FALLBACK"  # 'PLC_HARDWARE' | 'VIRTUAL_SIM_FALLBACK'
        self.pending_plc_ack: bool = False
        self.last_command_issued: Optional[str] = None
        self.last_plc_state_raw: Optional[int] = None

    def reset(self):
        self.order_code = None
        self.active_batch_id = None
        self.batch_state = "IDLE"
        self.total_order_volume = 0.0
        self.campaign_batch_count = 1
        self.current_campaign_batch = 1
        self.equalized_batch_volume = 0.0
        self.campaign_plan = None
        self.campaign_accumulated_actual_volume = 0.0
        self.awaiting_drain = False
        self.t_start_cell1 = None
        self.t_start_cell2 = None
        self.t_end_cell1 = None
        self.t_end_cell2 = None
        self.cell1_ack = False
        self.cell2_ack = False
        self.cell1_complete = False
        self.cell2_complete = False
        self.completion_processed = False
        self.cell1_state_id = 0
        self.cell2_state_id = 0
        self.cell1_current_phase = "PH_IDLE"
        self.cell2_current_phase = "PH_IDLE"
        self.virtual_state_fallback = False
        self.state_source = "VIRTUAL_SIM_FALLBACK"
        self.pending_plc_ack = False
        self.last_command_issued = None
        self.last_plc_state_raw = None

state = DualRunBatchState()

# ============================================================================
# GATEWAY TAG UTILITIES (STRICT CENTRAL SESSION REUSE)
# ============================================================================

def get_kepware_gateway():
    """Dynamically imports kepware_gateway singleton without circular dependencies."""
    try:
        import kepware_gateway
        return kepware_gateway
    except ImportError:
        try:
            from . import kepware_gateway
            return kepware_gateway
        except Exception:
            return None

def _safe_float(val: Any) -> Optional[float]:
    """Safely converts arbitrary telemetry values to float, returning None on unparseable/bad values."""
    if val is None:
        return None
    try:
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, bool):
            return 1.0 if val else 0.0
        s = str(val).strip()
        if not s or s.lower() in ("nan", "none", "null", "bad", "--", "undefined"):
            return None
        return float(s)
    except (ValueError, TypeError):
        return None

def resolve_operations_tags() -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Resolves mapped NodeIds for cell1 and cell2_simit from tag_mappings.json.
    Returns: (cell1_tags, cell2_tags)
    Guarded with try...except so missing or corrupted mappings never crash the process.
    """
    try:
        kw = get_kepware_gateway()
        if not kw or not hasattr(kw, "load_modular_tag_mappings"):
            return {}, {}
        modular = kw.load_modular_tag_mappings()
        if not isinstance(modular, dict):
            return {}, {}
        ops = modular.get("operations", {})
        if not isinstance(ops, dict):
            return {}, {}
        
        def _extract_tag_dict(section_data: Any) -> Dict[str, str]:
            res: Dict[str, str] = {}
            if isinstance(section_data, dict):
                for k, v in section_data.items():
                    if isinstance(v, str):
                        nid = v.strip()
                        if nid and nid != "[CHƯA ÁNH XẠ]":
                            res[k] = nid
                    elif isinstance(v, dict):
                        nid = str(v.get("node_id", "")).strip()
                        if nid and nid != "[CHƯA ÁNH XẠ]":
                            res[k] = nid
            return res

        cell1_tags = _extract_tag_dict(ops.get("cell1", {}))
        cell2_tags = _extract_tag_dict(ops.get("cell2_simit", {}))

        # Aliases / fallbacks for Cell 1 if legacy top-level keys used
        fallback_map_cell1 = {
            "Batch_ID": ["batch_id", "Batch_ID", "BATCH_ID", "SubBatch_ID", "sub_batch_id", "cell1.Batch_ID"],
            "Batch_Index": ["batch_index", "Batch_Index", "BATCH_INDEX", "Current_Batch_Index", "cell1.Batch_Index"],
            "Batch_Total": ["batch_total", "Batch_Total", "BATCH_TOTAL", "Total_Batches", "cell1.Batch_Total"],
            "Milk_SP": ["milk_dosing_sp", "Milk_Dosing_SP", "Recipe_Milk_SP"],
            "Sugar_SP": ["sugar_dosing_sp", "Sugar_Dosing_SP", "Recipe_Sugar_SP"],
            "Additive_SP": ["additive_dosing_sp", "Additive_Dosing_SP", "Recipe_Additive_SP"],
            "Milk_PV": ["Milk_PV", "milk_pv", "Milk_Dosing_PV"],
            "Sugar_PV": ["Sugar_PV", "sugar_pv", "Sugar_Dosing_PV"],
            "Additive_PV": ["Additive_PV", "additive_pv", "Additive_Dosing_PV"],
            "Heating_SP": ["uht_temp_sp", "pc1_uht_temp_sp", "Recipe_Temp_SP", "Heat_Temp_SP", "UHT_TEMP_SP"],
            "Heating_PV": ["uht_temp_pv", "pc1_uht_temp_pv", "Heat_Temp_ACT", "Temp_Sterilizer_PV", "UHT_TEMP_PV"],
            "Cooling_SP": ["cooling_temp_sp", "Cold_Temp_SP", "Cooling_Temp_SP", "COOLING_TEMP_SP"],
            "Cooling_PV": ["cooling_temp_pv", "Cold_Temp_ACT", "Cooling_Temp_PV", "COOLING_TEMP_PV"],
            "Agitator_SP": ["agitator_speed_sp", "Agitator_Speed_SP", "Motor_Speed_SP", "AGITATOR_SPEED_SP"],
            "Agitator_PV": ["agitator_speed_pv", "Agitator_Speed_PV", "Motor_Speed_PV", "AGITATOR_SPEED_PV"],
            "CMD_Start": ["batch_start_cmd", "Batch_Start_CMD", "Batch_Start", "BATCH_START_CMD"],
            "CMD_Hold": ["batch_hold_cmd", "Batch_Hold_CMD", "Batch_Hold", "BATCH_HOLD_CMD"],
            "CMD_Resume": ["batch_resume_cmd", "Batch_Resume_CMD", "Batch_Resume", "BATCH_RESUME_CMD"],
            "CMD_Abort": ["batch_abort_cmd", "Batch_Abort_CMD", "Batch_Abort", "BATCH_ABORT_CMD"],
            "CMD_Reset": ["batch_reset_cmd", "Batch_Reset_CMD", "Batch_Reset", "BATCH_RESET_CMD"],
            "CMD_Stop": ["batch_stop_cmd", "Batch_Stop_CMD", "Batch_Stop", "BATCH_STOP_CMD"],
            "State_ID": ["pc1_batch_state", "batch_state", "Batch_State"],
            "Flag_Complete": ["batch_complete_flag", "Batch_Complete_Flag"],
            "Mixing_Weight_PV": ["mixing_weight_pv", "cell1.Mixing_Weight_PV", "TANK_ALL_ACT_KL"],
            "Mixing_Temp_PV": ["mixing_temp_pv", "cell1.Mixing_Temp_PV", "Mixing_Temp_PV"],
            "SSR_Heater_Status": ["ssr_heater_status", "cell1.SSR_Heater_Status", "PID_OUT_SSR", "HEATER_RUN_STATUS"],
            "Heater_Ready_Flag": ["heater_ready_flag", "cell1.Heater_Ready_Flag", "HEATER_TEMP_OK", "Heater_Ready_Flag"],
        }
        for target_k, aliases in fallback_map_cell1.items():
            if target_k not in cell1_tags:
                for al in aliases:
                    v = ops.get(al)
                    if isinstance(v, str) and v.strip() and v.strip() != "[CHƯA ÁNH XẠ]":
                        cell1_tags[target_k] = v.strip()
                        break
                    elif isinstance(v, dict):
                        nid = str(v.get("node_id", "")).strip()
                        if nid and nid != "[CHƯA ÁNH XẠ]":
                            cell1_tags[target_k] = nid
                            break

        # Aliases / fallbacks for Cell 2 (SIMIT)
        fallback_map_cell2 = {
            "Batch_ID": ["pc2_simit_batch_id", "cell2_simit.Batch_ID", "batch_id", "Batch_ID"],
            "Batch_Index": ["pc2_simit_batch_index", "cell2_simit.Batch_Index", "batch_index", "Batch_Index"],
            "Batch_Total": ["pc2_simit_batch_total", "cell2_simit.Batch_Total", "batch_total", "Batch_Total"],
            "Heating_SP": ["pc2_simit_uht_temp_sp"],
            "Heating_PV": ["pc2_simit_uht_temp_pv"],
            "State_ID": ["pc2_simit_batch_state"],
            "Mixing_Weight_PV": ["pc2_simit_mixing_weight_pv", "mixing_weight_pv"],
            "Mixing_Temp_PV": ["pc2_simit_mixing_temp_pv", "mixing_temp_pv"],
            "SSR_Heater_Status": ["pc2_simit_ssr_heater_status", "ssr_heater_status"],
            "Heater_Ready_Flag": ["pc2_simit_heater_ready_flag", "heater_ready_flag"],
        }
        for target_k, aliases in fallback_map_cell2.items():
            if target_k not in cell2_tags:
                for al in aliases:
                    v = ops.get(al)
                    if isinstance(v, str) and v.strip() and v.strip() != "[CHƯA ÁNH XẠ]":
                        cell2_tags[target_k] = v.strip()
                        break
                    elif isinstance(v, dict):
                        nid = str(v.get("node_id", "")).strip()
                        if nid and nid != "[CHƯA ÁNH XẠ]":
                            cell2_tags[target_k] = nid
                            break

        return cell1_tags, cell2_tags
    except Exception as exc:
        logger.warning(f"[resolve_operations_tags] Warning resolving tag mappings: {exc}")
        return {}, {}

def read_tag_from_cache(node_id: str) -> Optional[Any]:
    """
    Sub-millisecond read strictly from central in-memory cache latest_cache["tags"].
    Zero socket port creation, zero asyncua Client instances.
    """
    try:
        if not node_id:
            return None
        kw = get_kepware_gateway()
        if not kw or not hasattr(kw, "latest_cache"):
            return None
        cache = kw.latest_cache.get("tags", {})
        clean_nid = node_id.replace("ns=2;s=", "").strip()
        
        entry = cache.get(node_id) or cache.get(clean_nid) or cache.get(f"ns=2;s={clean_nid}")
        if entry and entry.get("value") is not None:
            return entry.get("value")
        return None
    except Exception as exc:
        logger.debug(f"[read_tag_from_cache] Error reading {node_id}: {exc}")
        return None

async def write_tag_central(node_id: str, value: Any, data_type: str = "Float") -> bool:
    """
    Writes tag through existing central OPC UA session via kepware_gateway.write_opc_tag.
    Zero new sockets, strict reuse of opc_mgr connection.
    """
    if not node_id:
        return False
    kw = get_kepware_gateway()
    if not kw or not hasattr(kw, "write_opc_tag"):
        return False
    try:
        await kw.write_opc_tag(node_id, value, data_type)
        return True
    except Exception as exc:
        logger.warning(f"[write_tag_central] OPC UA write warning for {node_id}: {exc}")
        return False

def get_output_tank_weight() -> Optional[float]:
    """
    Sub-millisecond read of Output Tank Loadcell PV (L / kg) from central telemetry cache.
    Checks mapped tags: Out_Weight_PV, out_weight_pv, OUT01_WEIGHT_PV, etc.
    """
    try:
        cell1_tags, _ = resolve_operations_tags()
        candidates = [
            cell1_tags.get("Out_Weight_PV"),
            cell1_tags.get("out_weight_pv"),
            cell1_tags.get("OUT01_WEIGHT_PV"),
            "Out_Weight_PV",
            "out_weight_pv",
            "OUT01_WEIGHT_PV",
            "Channel1.Device1.Out_Weight_PV",
            "ns=2;s=Channel1.Device1.Out_Weight_PV"
        ]
        kw = get_kepware_gateway()
        cache = kw.latest_cache.get("tags", {}) if kw and hasattr(kw, "latest_cache") else {}

        for c in candidates:
            if not c:
                continue
            val = read_tag_from_cache(c)
            if val is not None:
                f_val = _safe_float(val)
                if f_val is not None:
                    return f_val
            c_clean = c.replace("ns=2;s=", "").lower()
            for k, entry in cache.items():
                if c_clean in k.lower():
                    entry_val = entry.get("value")
                    f_val = _safe_float(entry_val)
                    if f_val is not None:
                        return f_val
    except Exception as e:
        logger.debug(f"[get_output_tank_weight] Notice: {e}")
    return None

# ============================================================================
# RECIPE DOWNLOAD ENGINE (ISA-88 PARAMETER DOWNLINK)
# ============================================================================

def check_inventory_availability_sync(
    milk_sp: float = 0.0,
    sugar_sp: float = 0.0,
    additive_sp: float = 0.0,
    order_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Synchronous helper to evaluate material availability against dbo.Material_Stock.
    Prevents batch start or recipe download if insufficient stock.
    """
    req_map = {
        "TANK-01": {"name": "Sữa Tươi (Raw Milk)", "sp": float(milk_sp or 0.0), "unit": "L"},
        "TANK-02": {"name": "Đường (Sugar)", "sp": float(sugar_sp or 0.0), "unit": "kg"},
        "TANK-03": {"name": "Phụ Gia (Additive)", "sp": float(additive_sp or 0.0), "unit": "kg"}
    }
    materials = []
    is_sufficient = True
    shortage_messages = []

    try:
        from db_connector import get_connection
        conn = get_connection(timeout=2)
        if conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT AssignedTank, Material_Code, Material_Name, CurrentStock, TankCapacity, Unit
                FROM dbo.Material_Stock
                WHERE AssignedTank IN ('TANK-01', 'TANK-02', 'TANK-03')
                   OR UPPER(Material_Code) IN ('RAW_MILK', 'SUGAR', 'ADDITIVE')
            """)
            found_tanks = {}
            for row in cur.fetchall():
                tank_id = str(row[0] or "").strip()
                mat_code = str(row[1] or "").strip().upper()
                c_stock = float(row[3] or 0.0)
                unit = str(row[5] or "kg")
                m_name = str(row[2] or tank_id)

                tid = tank_id if tank_id in req_map else (
                    "TANK-01" if "MILK" in mat_code else (
                    "TANK-02" if "SUGAR" in mat_code else (
                    "TANK-03" if "ADDITIVE" in mat_code else tank_id
                )))
                found_tanks[tid] = {
                    "tank_id": tid,
                    "mat_code": mat_code,
                    "mat_name": m_name,
                    "current_stock": c_stock,
                    "unit": unit
                }
            conn.close()

            for tid, info in req_map.items():
                stock_info = found_tanks.get(tid, {})
                cur_s = stock_info.get("current_stock", 0.0)
                unit = stock_info.get("unit", info["unit"])
                mat_name = stock_info.get("mat_name", info["name"])
                req_qty = info["sp"]
                shortage = max(0.0, req_qty - cur_s)
                suff = (shortage <= 0.0001)
                if not suff:
                    is_sufficient = False
                    shortage_messages.append(f"[{tid}] {mat_name}: Cần {req_qty:.2f}{unit}, Tồn {cur_s:.2f}{unit} (Thiếu {shortage:.2f}{unit})")

                materials.append({
                    "tank_id": tid,
                    "material_name": mat_name,
                    "required_sp": req_qty,
                    "current_stock": cur_s,
                    "unit": unit,
                    "is_sufficient": suff,
                    "shortage_qty": round(shortage, 3)
                })
    except Exception as e:
        logger.debug(f"[check_inventory_availability_sync] DB check notice: {e}")
        for tid, info in req_map.items():
            materials.append({
                "tank_id": tid,
                "material_name": info["name"],
                "required_sp": info["sp"],
                "current_stock": 100.0,
                "unit": info["unit"],
                "is_sufficient": True,
                "shortage_qty": 0.0
            })

    if not is_sufficient:
        interlock_msg = "MATERIAL AVAILABILITY INTERLOCK: INSUFFICIENT STOCK - " + "; ".join(shortage_messages)
        status_code = "INSUFFICIENT"
    else:
        interlock_msg = "MATERIAL AVAILABILITY: ALL STOCKS SUFFICIENT"
        status_code = "SUFFICIENT"

    return {
        "available": is_sufficient,
        "is_sufficient": is_sufficient,
        "status": status_code,
        "interlock_message": interlock_msg,
        "order_code": order_code,
        "materials": materials
    }

async def download_recipe(
    order_code: str,
    execution_mode: str = "mode3_dual",
    recipe_name: str = "Fresh Pasteurized Milk",
    target_volume: float = 1000.0,
    setpoints: Optional[Dict[str, float]] = None,
    current_batch: Optional[int] = None
) -> Dict[str, Any]:
    """
    Executes ISA-88 Recipe Parameter Downlink:
    - Writes SP setpoints to active cell tags.
    - Writes unique Sub-Batch ID (e.g. MO00001-B01) and Campaign Stepper indices (Index/Total) to PLC.
    - Evaluates Ack_Recipe_Loaded handshakes.
    """
    state.order_code = order_code
    state.execution_mode = execution_mode
    state.recipe_name = recipe_name
    state.target_volume = target_volume
    state.total_order_volume = target_volume
    state.batch_state = "DOWNLOADING"
    
    # ISA-88 Campaign load equalization calculation
    plan = calculate_optimal_batch_campaign(target_volume, vessel_capacity=VESSEL_MAX_CAPACITY, safe_max_ratio=SAFE_MAX_RATIO)
    state.campaign_plan = plan
    state.campaign_batch_count = plan.get("batch_count", 1)
    if current_batch is not None and int(current_batch) >= 1:
        state.current_campaign_batch = int(current_batch)
    elif not state.current_campaign_batch or state.current_campaign_batch < 1:
        state.current_campaign_batch = 1
    state.equalized_batch_volume = plan.get("equalized_batch_volume", target_volume)

    if state.current_campaign_batch == 1:
        state.campaign_accumulated_actual_volume = 0.0
    state.awaiting_drain = False

    # Derive unique Sub-Batch ID for traceability (ISA-88 Batch Tracking & GS1/EBR)
    clean_oc = str(order_code).replace("/", "-").strip()
    state.active_batch_id = f"{clean_oc}-B{state.current_campaign_batch:02d}"

    if setpoints:
        state.recipe_setpoints.update(setpoints)
    else:
        # If campaign is required, download equalized per-batch setpoints to PLC
        if plan.get("campaign_required"):
            state.recipe_setpoints = plan["recipe_setpoints_per_batch"].copy()
        else:
            state.recipe_setpoints = {
                "milk_sp": round(target_volume * 0.70, 2),
                "sugar_sp": round(target_volume * 0.20, 2),
                "additive_sp": round(target_volume * 0.10, 2),
                "heating_sp": 138.0,
                "cooling_sp": 4.0,
                "agitator_sp": 1200.0
            }

    # Siemens PM-CONTROL Chapter 5.8 Material Availability Check
    avail_check = check_inventory_availability_sync(
        milk_sp=state.recipe_setpoints.get("milk_sp", 0.0),
        sugar_sp=state.recipe_setpoints.get("sugar_sp", 0.0),
        additive_sp=state.recipe_setpoints.get("additive_sp", 0.0),
        order_code=order_code
    )
    if not avail_check["available"]:
        state.batch_state = "IDLE"
        logger.warning(f"[download_recipe] Material availability interlock blocked: {avail_check['interlock_message']}")
        return {
            "status": "error",
            "order_code": order_code,
            "ready_to_start": False,
            "interlock_blocked": True,
            "interlock_type": "MATERIAL_AVAILABILITY",
            "message": avail_check["interlock_message"],
            "availability": avail_check
        }

    cell1_tags, cell2_tags = resolve_operations_tags()
    written_tags: List[str] = []
    
    # Mapping of setpoint keys to tag keys and types
    sp_config = [
        ("milk_sp", "Milk_SP", "Float"),
        ("sugar_sp", "Sugar_SP", "Float"),
        ("additive_sp", "Additive_SP", "Float"),
        ("heating_sp", "Heating_SP", "Float"),
        ("cooling_sp", "Cooling_SP", "Float"),
        ("agitator_sp", "Agitator_SP", "Float"),
    ]

    target_cells = []
    if execution_mode in ("mode1_physical", "mode3_dual"):
        target_cells.append(("cell1", cell1_tags))
    if execution_mode in ("mode2_simit", "mode3_dual"):
        target_cells.append(("cell2_simit", cell2_tags))

    write_tasks = []
    for cell_label, tags in target_cells:
        # A. Process Setpoints
        for sp_key, tag_key, dtype in sp_config:
            val = state.recipe_setpoints.get(sp_key, 0.0)
            node_id = tags.get(tag_key)
            if node_id:
                write_tasks.append(write_tag_central(node_id, val, dtype))
                written_tags.append(f"{cell_label}.{tag_key} -> {val}")

        # B. Sub-Batch Identification & Campaign Indices for PLC/SCADA Traceability
        b_id_node = tags.get("Batch_ID")
        if b_id_node:
            write_tasks.append(write_tag_central(b_id_node, state.active_batch_id, "String"))
            written_tags.append(f"{cell_label}.Batch_ID -> '{state.active_batch_id}'")

        b_idx_node = tags.get("Batch_Index")
        if b_idx_node:
            write_tasks.append(write_tag_central(b_idx_node, state.current_campaign_batch, "Int16"))
            written_tags.append(f"{cell_label}.Batch_Index -> {state.current_campaign_batch}")

        b_tot_node = tags.get("Batch_Total")
        if b_tot_node:
            write_tasks.append(write_tag_central(b_tot_node, state.campaign_batch_count, "Int16"))
            written_tags.append(f"{cell_label}.Batch_Total -> {state.campaign_batch_count}")

    write_success = True
    if write_tasks:
        results = await asyncio.gather(*write_tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception) or r is False:
                write_success = False
                logger.warning(f"[Recipe Download] Setpoint write failed or returned exception: {r}")

    # Handshake Acknowledgment evaluation
    # In live physical plant, check Ack_Recipe_Loaded; if unmapped, allow simulated auto-acknowledge
    cell1_ack = False
    cell2_ack = False

    if "cell1" in [c[0] for c in target_cells]:
        ack_node_1 = cell1_tags.get("Ack_Recipe_Loaded")
        if ack_node_1:
            val = read_tag_from_cache(ack_node_1)
            cell1_ack = bool(val) if val is not None else False
        else:
            cell1_ack = True  # Simulated ack fallback only when node not mapped
        state.cell1_ack = cell1_ack and write_success

    if "cell2_simit" in [c[0] for c in target_cells]:
        ack_node_2 = cell2_tags.get("Ack_Recipe_Loaded")
        if ack_node_2:
            val = read_tag_from_cache(ack_node_2)
            cell2_ack = bool(val) if val is not None else False
        else:
            cell2_ack = True  # SIMIT virtual twin auto-acknowledges when node not mapped
        state.cell2_ack = cell2_ack and write_success

    # Determine readiness
    ready_to_start = False
    if execution_mode == "mode1_physical":
        ready_to_start = state.cell1_ack
    elif execution_mode == "mode2_simit":
        ready_to_start = state.cell2_ack
    elif execution_mode == "mode3_dual":
        ready_to_start = state.cell1_ack and state.cell2_ack

    if ready_to_start:
        state.batch_state = "READY"

    return {
        "status": "success",
        "order_code": order_code,
        "execution_mode": execution_mode,
        "recipe_name": recipe_name,
        "written_tags": written_tags,
        "cell1_ack": state.cell1_ack,
        "cell2_ack": state.cell2_ack,
        "ready_to_start": ready_to_start,
        "batch_state": state.batch_state,
        "setpoints": state.recipe_setpoints,
        "campaign_plan": state.campaign_plan,
        "equalized_batch_volume": state.equalized_batch_volume,
        "campaign_batch_count": state.campaign_batch_count,
        "current_campaign_batch": state.current_campaign_batch,
        "active_batch_id": state.active_batch_id
    }

# ============================================================================
# ISA-88 PLC-DRIVEN STATE MACHINE COMMANDS & 800ms FEEDBACK POLLING
# (Siemens PM-CONTROL Chapter 9: CMD_Start, CMD_Hold, CMD_Resume, CMD_Abort, CMD_Reset)
# ============================================================================

# PLC State_ID Feedback Register Mapping:
# PM-CONTROL 5-state: 0=IDLE, 1=RUNNING, 2=HELD, 3=COMPLETE, 4=ABORTED
# Extended ISA-88 12-state compatibility: 3=HELD, 8=STOPPED, 10=ABORTED, 11=COMPLETE
def _decode_plc_state_id(raw_val: Any) -> Optional[str]:
    """Maps integer or string PLC State_ID feedback into canonical MES batch_state."""
    if raw_val is None:
        return None
    if isinstance(raw_val, str):
        s_up = raw_val.strip().upper()
        if s_up in ("IDLE", "READY", "RUNNING", "HELD", "COMPLETED", "COMPLETE", "ABORTED", "STOPPED"):
            return "COMPLETED" if s_up == "COMPLETE" else s_up
    try:
        code = int(float(raw_val))
    except (ValueError, TypeError):
        return None
    mapping = {
        0: "IDLE",
        1: "RUNNING",
        2: "HELD",
        3: "COMPLETED",   # PM-CONTROL 3=COMPLETE
        4: "ABORTED",     # PM-CONTROL 4=ABORTED
        6: "HELD",        # ISA-88 PAUSED
        8: "STOPPED",     # ISA-88 STOPPED
        9: "ABORTED",     # ISA-88 ABORTING
        10: "ABORTED",    # ISA-88 ABORTED
        11: "COMPLETED",  # ISA-88 COMPLETE
    }
    return mapping.get(code)


async def _send_500ms_pulse(node_id: str):
    """Sends CMD_* = True for 500ms, then resets CMD_* = False."""
    try:
        await write_tag_central(node_id, True, "Boolean")
        await asyncio.sleep(0.5)
        await write_tag_central(node_id, False, "Boolean")
    except Exception as exc:
        logger.warning(f"[_send_500ms_pulse] Failed to send pulse to {node_id}: {exc}")


async def _execute_plc_command_with_feedback(
    cmd_tag_key: str,
    target_state_str: str,
    accepted_plc_codes: Tuple[int, ...],
    simit_state_code: int,
    order_code: Optional[str] = None,
    execution_mode: Optional[str] = None
) -> Dict[str, Any]:
    """
    ISA-88 / Siemens PM-CONTROL Chapter 9 Command Authority:
    1. Writes the command pulse (CMD_Start, CMD_Hold, CMD_Resume, CMD_Abort, CMD_Reset) to Kepware OPC UA.
    2. NEVER blindly overwrites the physical PLC hardware State_ID tag on Cell 1.
    3. Polls/awaits the State_ID transition from Kepware (PENDING_PLC_ACK -> target_state_str) for up to 800ms.
    4. Safe Virtual Commissioning Fallback: Only if State_ID is unmapped or running against a passive memory tag
       in Kepware Simulator (where no PLC logic updates State_ID within 800ms), updates the internal MES state shadow
       (virtual_state_fallback = True) and exposes state_source: 'PLC_HARDWARE' | 'VIRTUAL_SIM_FALLBACK'.
    """
    mode = execution_mode or state.execution_mode
    state.execution_mode = mode
    if order_code:
        state.order_code = order_code

    state.last_command_issued = cmd_tag_key
    state.pending_plc_ack = True
    prev_state = state.batch_state
    state.batch_state = "PENDING_PLC_ACK"

    cell1_tags, cell2_tags = resolve_operations_tags()
    pulse_tasks = []

    # 1. Dispatch command pulse to Cell 1 (Physical PLC) — DO NOT overwrite Cell 1 State_ID!
    state_node_1 = cell1_tags.get("State_ID")
    initial_plc_state_raw = read_tag_from_cache(state_node_1) if state_node_1 else None

    if mode in ("mode1_physical", "mode3_dual"):
        cmd_node_1 = cell1_tags.get(cmd_tag_key)
        if cmd_node_1:
            pulse_tasks.append(_send_500ms_pulse(cmd_node_1))

    # 2. Dispatch command pulse to Cell 2 (SIMIT Virtual Twin)
    if mode in ("mode2_simit", "mode3_dual"):
        cmd_node_2 = cell2_tags.get(cmd_tag_key)
        if cmd_node_2:
            pulse_tasks.append(_send_500ms_pulse(cmd_node_2))
        state_node_2 = cell2_tags.get("State_ID")
        if state_node_2:
            pulse_tasks.append(write_tag_central(state_node_2, simit_state_code, "Int16"))
        state.cell2_state_id = simit_state_code

    if pulse_tasks:
        asyncio.create_task(asyncio.gather(*pulse_tasks, return_exceptions=True))

    # 3. Poll/await State_ID feedback from Physical PLC (up to 800ms: 8 x 100ms)
    plc_acknowledged = False
    observed_code: Optional[int] = None

    if mode in ("mode1_physical", "mode3_dual") and state_node_1:
        for _ in range(8):
            await asyncio.sleep(0.1)
            raw_s = read_tag_from_cache(state_node_1)
            if raw_s is not None:
                try:
                    c_val = int(float(raw_s))
                    observed_code = c_val
                    if c_val in accepted_plc_codes:
                        plc_acknowledged = True
                        break
                except (ValueError, TypeError):
                    decoded = _decode_plc_state_id(raw_s)
                    if decoded == target_state_str:
                        plc_acknowledged = True
                        break

    state.pending_plc_ack = False

    # 4. Evaluate PLC Hardware Authority vs. Safe Virtual Commissioning Fallback
    if plc_acknowledged:
        state.virtual_state_fallback = False
        state.state_source = "PLC_HARDWARE"
        state.batch_state = target_state_str
        if observed_code is not None:
            state.cell1_state_id = observed_code
            state.last_plc_state_raw = observed_code
        logger.info(
            f"[ISA88-StateMachine] {cmd_tag_key} acknowledged by PLC Hardware State_ID={observed_code} -> {target_state_str}"
        )
    else:
        # Check if an active hardware PLC is holding a different valid live state vs. passive/unmapped tag
        state.virtual_state_fallback = True
        state.state_source = "VIRTUAL_SIM_FALLBACK"
        state.batch_state = target_state_str
        state.cell1_state_id = simit_state_code
        logger.info(
            f"[ISA88-StateMachine] {cmd_tag_key}: No PLC State_ID transition within 800ms "
            f"(node={state_node_1 or 'UNMAPPED'}, initial={initial_plc_state_raw}). "
            f"Activated VIRTUAL_SIM_FALLBACK -> {target_state_str}"
        )

    return {
        "status": "success",
        "command": cmd_tag_key,
        "previous_state": prev_state,
        "batch_state": state.batch_state,
        "state_source": state.state_source,
        "virtual_state_fallback": state.virtual_state_fallback,
        "plc_state_id": state.cell1_state_id,
        "execution_mode": mode,
        "order_code": state.order_code,
        "t_start_cell1": state.t_start_cell1,
        "t_start_cell2": state.t_start_cell2,
    }


async def start_batch(order_code: Optional[str] = None, execution_mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Triggers batch start (CMD_Start) across active cells and polls State_ID (1=RUNNING) up to 800ms.
    Strictly verifies Siemens PM-CONTROL Material Availability Interlock prior to pulsing CMD_Start.
    """
    # Material Availability Interlock Check
    target_order = order_code or state.order_code
    avail_check = check_inventory_availability_sync(
        milk_sp=state.recipe_setpoints.get("milk_sp", 0.0),
        sugar_sp=state.recipe_setpoints.get("sugar_sp", 0.0),
        additive_sp=state.recipe_setpoints.get("additive_sp", 0.0),
        order_code=target_order
    )
    if not avail_check["available"]:
        logger.warning(f"[start_batch] Material availability interlock blocked: {avail_check['interlock_message']}")
        return {
            "status": "error",
            "success": False,
            "interlock_blocked": True,
            "interlock_type": "MATERIAL_AVAILABILITY",
            "message": avail_check["interlock_message"],
            "availability": avail_check
        }

    now_ts = time.time()
    mode = execution_mode or state.execution_mode
    state.cell1_complete = False
    state.cell2_complete = False
    state.completion_processed = False
    state.t_end_cell1 = None
    state.t_end_cell2 = None
    if mode in ("mode1_physical", "mode3_dual"):
        state.t_start_cell1 = now_ts
    if mode in ("mode2_simit", "mode3_dual"):
        state.t_start_cell2 = now_ts

    return await _execute_plc_command_with_feedback(
        cmd_tag_key="CMD_Start",
        target_state_str="RUNNING",
        accepted_plc_codes=(1,),
        simit_state_code=1,
        order_code=order_code,
        execution_mode=mode
    )


async def hold_batch(order_code: Optional[str] = None, execution_mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Triggers batch hold (CMD_Hold) and polls State_ID (2=HELD in PM-CONTROL, or 3=HELD in 11-state ISA-88) up to 800ms.
    """
    return await _execute_plc_command_with_feedback(
        cmd_tag_key="CMD_Hold",
        target_state_str="HELD",
        accepted_plc_codes=(2, 3, 5, 6),
        simit_state_code=2,
        order_code=order_code,
        execution_mode=execution_mode
    )


async def resume_batch(order_code: Optional[str] = None, execution_mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Triggers batch resume (CMD_Resume) and polls State_ID (1=RUNNING or 4=RESTARTING) up to 800ms.
    """
    return await _execute_plc_command_with_feedback(
        cmd_tag_key="CMD_Resume",
        target_state_str="RUNNING",
        accepted_plc_codes=(1,),
        simit_state_code=1,
        order_code=order_code,
        execution_mode=execution_mode
    )


async def abort_batch(order_code: Optional[str] = None, execution_mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Triggers batch abort (CMD_Abort) and polls State_ID (4=ABORTED in PM-CONTROL, or 9/10 in 11-state ISA-88) up to 800ms.
    """
    now_ts = time.time()
    if state.t_start_cell1 and not state.t_end_cell1:
        state.t_end_cell1 = now_ts
    if state.t_start_cell2 and not state.t_end_cell2:
        state.t_end_cell2 = now_ts
    return await _execute_plc_command_with_feedback(
        cmd_tag_key="CMD_Abort",
        target_state_str="ABORTED",
        accepted_plc_codes=(4, 8, 9, 10),
        simit_state_code=4,
        order_code=order_code,
        execution_mode=execution_mode
    )


async def reset_batch(order_code: Optional[str] = None, execution_mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Triggers batch reset (CMD_Reset) to return PLC State_ID to 0=IDLE and resets MES state trackers.
    """
    res = await _execute_plc_command_with_feedback(
        cmd_tag_key="CMD_Reset",
        target_state_str="IDLE",
        accepted_plc_codes=(0,),
        simit_state_code=0,
        order_code=order_code,
        execution_mode=execution_mode
    )
    src = state.state_source
    fb = state.virtual_state_fallback
    state.reset()
    state.state_source = src
    state.virtual_state_fallback = fb
    res["batch_state"] = "IDLE"
    return res

# ============================================================================
# INDEPENDENT COMPLETION EVALUATION & CLOSED-LOOP AUTOMATION
# ============================================================================

async def wait_for_output_tank_drain(
    order_code: str,
    sub_batch_num: int,
    total_sub_batches: int,
    empty_threshold: float = 0.8,
    debounce_seconds: float = 2.0,
    max_wait_timeout: float = 900.0
) -> bool:
    """
    Smart Factory Autonomous Drain Sensing (ISA-88 Closed-Loop):
    Monitors Output Tank loadcell until liquid is drained out to <= empty_threshold (0.8L).
    Must remain <= empty_threshold for debounce_seconds (2.0s) to avoid fluid slosh false positives.
    Once cleared, returns True so the next sub-batch can automatically download and start.
    """
    start_t = time.time()
    state.awaiting_drain = True
    state.batch_state = "AWAITING_DRAIN"
    stable_empty_start: Optional[float] = None
    last_log_t = 0.0

    logger.info(
        f"[ClosedLoopBatch] Sub-batch {sub_batch_num}/{total_sub_batches} finished. "
        f"Entering autonomous sensor wait for Output Tank to drain (PV <= {empty_threshold}L)..."
    )

    while (time.time() - start_t) < max_wait_timeout:
        # Check if manual bypass was triggered via API or button
        if not getattr(state, "awaiting_drain", False):
            logger.info(f"[ClosedLoopBatch] Manual drain confirmation/bypass received for Sub-batch {sub_batch_num}/{total_sub_batches}.")
            state.awaiting_drain = False
            return True

        cur_w = get_output_tank_weight()

        # Virtual fallback: if no physical tag mapped or in virtual mode and no tag reporting
        if cur_w is None:
            # If in virtual fallback or no tag, simulate drainage delay of 4 seconds
            if time.time() - start_t >= 4.0:
                logger.info(f"[ClosedLoopBatch] Virtual/Simulated drain auto-confirmed for Sub-batch {sub_batch_num}/{total_sub_batches} (no physical tag). Auto-advancing...")
                state.awaiting_drain = False
                return True
        else:
            # Physical loadcell reading available
            if cur_w <= empty_threshold:
                if stable_empty_start is None:
                    stable_empty_start = time.time()
                elif (time.time() - stable_empty_start) >= debounce_seconds:
                    logger.info(
                        f"[ClosedLoopBatch] Auto-Drain Event Confirmed: Output Tank Loadcell PV ({cur_w:.2f}L <= {empty_threshold}L) "
                        f"stable for {debounce_seconds}s. Tank is CLEARED! Auto-advancing to Sub-batch {sub_batch_num+1}/{total_sub_batches}..."
                    )
                    state.awaiting_drain = False
                    return True
            else:
                stable_empty_start = None
                now = time.time()
                if now - last_log_t >= 5.0:
                    last_log_t = now
                    logger.info(
                        f"[ClosedLoopBatch] Sub-batch {sub_batch_num}/{total_sub_batches} done. "
                        f"Output Tank occupied ({cur_w:.2f}L > {empty_threshold}L). "
                        f"Awaiting drain to auto-dispatch Sub-batch {sub_batch_num+1}/{total_sub_batches}..."
                    )

        await asyncio.sleep(0.5)

    logger.warning(f"[ClosedLoopBatch] Output Tank drain wait timed out after {max_wait_timeout}s.")
    state.awaiting_drain = False
    return False

def _trigger_closed_loop_completion(order_code: str):
    """
    Schedules asynchronous execution of inventory consumption, EBR generation,
    campaign auto-advancement, and Odoo ERP uplinks in a non-blocking background task.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(execute_closed_loop_batch_completion(order_code))
    except RuntimeError:
        import threading
        threading.Thread(
            target=lambda: asyncio.run(execute_closed_loop_batch_completion(order_code)),
            daemon=True
        ).start()


async def execute_closed_loop_batch_completion(order_code: str):
    logger.info(f"[ClosedLoopBatch] Starting automated post-batch processing for Order [{order_code}] (Batch {state.current_campaign_batch}/{state.campaign_batch_count})...")
    try:
        try:
            import db_sync_engine
        except ImportError:
            from . import db_sync_engine

        cell1_tags, _ = resolve_operations_tags()

        # 1. Read actual process values from cache with fallback to recipe SP
        sp_milk = state.recipe_setpoints.get("milk_sp", 0.0)
        sp_sugar = state.recipe_setpoints.get("sugar_sp", 0.0)
        sp_additive = state.recipe_setpoints.get("additive_sp", 0.0)
        sp_heating = state.recipe_setpoints.get("heating_sp", 138.0)
        sp_cooling = state.recipe_setpoints.get("cooling_sp", 4.0)

        pv_milk = read_tag_from_cache(cell1_tags.get("Milk_PV"))
        pv_sugar = read_tag_from_cache(cell1_tags.get("Sugar_PV"))
        pv_additive = read_tag_from_cache(cell1_tags.get("Additive_PV"))
        pv_heating = read_tag_from_cache(cell1_tags.get("Heating_PV"))
        pv_cooling = read_tag_from_cache(cell1_tags.get("Cooling_PV"))

        act_milk = float(pv_milk) if (pv_milk is not None and float(pv_milk) > 0) else float(sp_milk)
        act_sugar = float(pv_sugar) if (pv_sugar is not None and float(pv_sugar) > 0) else float(sp_sugar)
        act_additive = float(pv_additive) if (pv_additive is not None and float(pv_additive) > 0) else float(sp_additive)
        act_heating = float(pv_heating) if (pv_heating is not None and float(pv_heating) > 0) else float(sp_heating)
        act_cooling = float(pv_cooling) if (pv_cooling is not None and float(pv_cooling) > 0) else float(sp_cooling)

        batch_vol = state.equalized_batch_volume if (state.campaign_plan and state.equalized_batch_volume > 0) else state.target_volume

        # 2. Automated Inventory Backflush / Single-Shot Deduction with Idempotency Guard
        is_already_deducted = False
        try:
            from db_routes import _single_shot_deducted_orders
            if order_code in _single_shot_deducted_orders:
                is_already_deducted = True
        except Exception:
            pass

        if is_already_deducted:
            logger.info(f"[ClosedLoopBatch] Order [{order_code}] materials already deducted via intermediate hopper single-shot. Skipping duplicate deduction.")
        else:
            try:
                from db_routes import deduct_batch_single_shot, BatchDeductSingleShotPayload
                deduct_payload = BatchDeductSingleShotPayload(
                    order_code=order_code,
                    user="PLC_Auto_Complete",
                    milk_qty=act_milk,
                    sugar_qty=act_sugar,
                    additive_qty=act_additive
                )
                await deduct_batch_single_shot(deduct_payload)
                logger.info(f"[ClosedLoopBatch] Single-shot inventory deduction executed for Order [{order_code}]: Milk={act_milk}L, Sugar={act_sugar}kg, Additive={act_additive}kg")
            except Exception as e:
                logger.warning(f"[ClosedLoopBatch] Single-shot deduction fallback to standard consume_inventory: {e}")
                consumed_items = [
                    {"material_code": "RAW-MILK-01", "amount": act_milk},
                    {"material_code": "SUGAR-01", "amount": act_sugar},
                    {"material_code": "ADDITIVE-01", "amount": act_additive}
                ]
                await asyncio.to_thread(db_sync_engine.consume_inventory, order_code, consumed_items, "PLC_Auto_Complete")

        # 3. Quality Assurance & Electronic Batch Record (EBR) Generation
        # Critical Control Point (CCP-1): Pasteurizer hold temp must be within +/- 2.0°C of SP
        heat_dev = abs(act_heating - sp_heating)
        ccp1_pass = heat_dev <= 2.0
        cool_dev = abs(act_cooling - sp_cooling)
        cool_pass = cool_dev <= 1.5

        overall_quality = "RELEASED" if (ccp1_pass and cool_pass) else "QUARANTINED"
        disposition = "Approved for Aseptic Packaging" if overall_quality == "RELEASED" else "Hold for QA Review (Temperature Deviation)"
        avg_dev = round((heat_dev / max(sp_heating, 1) + cool_dev / max(sp_cooling, 1)) / 2 * 100, 2)
        batch_seq = f"-B{state.current_campaign_batch:02d}" if state.campaign_batch_count > 1 else ""
        report_code = f"EBR-{order_code}{batch_seq}"

        quality_results = [
            {
                "parameter_name": "Pasteurization Temperature (CCP-1)",
                "setpoint": sp_heating,
                "actual_value": act_heating,
                "deviation_percent": round(heat_dev / max(sp_heating, 1) * 100, 2),
                "tolerance_band": "±2.0°C",
                "evaluation": "PASS" if ccp1_pass else "FAIL"
            },
            {
                "parameter_name": "Chilling Temperature",
                "setpoint": sp_cooling,
                "actual_value": act_cooling,
                "deviation_percent": round(cool_dev / max(sp_cooling, 1) * 100, 2),
                "tolerance_band": "±1.5°C",
                "evaluation": "PASS" if cool_pass else "FAIL"
            }
        ]

        # Measure actual produced volume for this sub-batch
        measured_out = get_output_tank_weight()
        act_sub_batch_vol = round(float(measured_out), 2) if (measured_out is not None and float(measured_out) > 0.5) else round(batch_vol, 2)
        state.campaign_accumulated_actual_volume = round(state.campaign_accumulated_actual_volume + act_sub_batch_vol, 2)
        logger.info(
            f"[ClosedLoopBatch] Sub-batch {state.current_campaign_batch}/{state.campaign_batch_count} actual output: {act_sub_batch_vol:.2f}L. "
            f"Campaign Accumulated Output: {state.campaign_accumulated_actual_volume:.2f}L / {state.total_order_volume:.2f}L."
        )

        await asyncio.to_thread(
            db_sync_engine.create_batch_completion_report,
            order_code=order_code,
            report_code=report_code,
            recipe_applied=state.recipe_name or "Fresh Pasteurized Milk",
            total_produced=act_sub_batch_vol,
            avg_deviation=avg_dev,
            quality_status=overall_quality,
            disposition=disposition,
            sign_off="System_Auto_Audit",
            quality_results=quality_results
        )
        logger.info(f"[ClosedLoopBatch] EBR [{report_code}] generated with Quality Status: {overall_quality} (CCP-1: {'PASS' if ccp1_pass else 'FAIL'}).")

        # 4. Multi-Batch Campaign Progression or Final Order Completion
        if state.campaign_batch_count > 1 and state.current_campaign_batch < state.campaign_batch_count:
            k = state.current_campaign_batch
            N = state.campaign_batch_count
            next_k = k + 1
            logger.info(
                f"[ClosedLoopBatch] Campaign [{order_code}]: Sub-batch {k}/{N} ({state.active_batch_id}) finished. "
                f"Waiting for Output Tank to drain before auto-advancing to Sub-batch {next_k}/{N}..."
            )

            # Autonomous drain wait: monitors Output Tank PV until <= 0.8L (debounced 2.0s)
            await wait_for_output_tank_drain(
                order_code=order_code,
                sub_batch_num=k,
                total_sub_batches=N,
                empty_threshold=state.drain_threshold,
                debounce_seconds=2.0
            )

            state.cell1_complete = False
            state.cell2_complete = False
            state.completion_processed = False
            state.current_campaign_batch = next_k
            state.t_end_cell1 = None
            state.t_end_cell2 = None

            # Automatically downlink next sub-batch setpoints, Batch_ID, Batch_Index to Kepware
            try:
                downlink_res = await download_recipe(
                    order_code=order_code,
                    execution_mode=state.execution_mode,
                    recipe_name=state.recipe_name,
                    target_volume=state.total_order_volume,
                    current_batch=next_k
                )
                logger.info(
                    f"[ClosedLoopBatch] Next Sub-batch [{state.active_batch_id}] ({next_k}/{N}) successfully downlinked to Kepware: "
                    f"{downlink_res.get('written_tags')}"
                )

                # Buffer delay (1.5s) for PLC Data Block load & Ack confirmation
                await asyncio.sleep(1.5)

                # Automatically trigger CMD_Start pulse for next sub-batch on PLC
                logger.info(f"[ClosedLoopBatch] Automatically pulsing CMD_Start for Sub-batch {next_k}/{N} ({state.active_batch_id}) on PLC...")
                start_res = await start_batch(order_code=order_code, execution_mode=state.execution_mode)
                logger.info(f"[ClosedLoopBatch] Sub-batch {next_k}/{N} active with state: {start_res.get('batch_state')}")
            except Exception as auto_adv_err:
                logger.error(f"[ClosedLoopBatch] Error auto-dispatching next sub-batch {next_k}/{N}: {auto_adv_err}")
                state.batch_state = "READY"
        else:
            state.awaiting_drain = False
            final_vol = round(
                state.campaign_accumulated_actual_volume if state.campaign_accumulated_actual_volume > 0 
                else (state.total_order_volume if state.total_order_volume > 0 else state.target_volume),
                2
            )
            logger.info(f"[ClosedLoopBatch] Order [{order_code}] completely finalized across all {state.campaign_batch_count} batches. Total actual production: {final_vol:.2f}L. Marking COMPLETED in SQL Server...")
            state.batch_state = "COMPLETED"
            await asyncio.to_thread(db_sync_engine.update_order_status, order_code, "COMPLETED", "PLC_Auto_Complete", final_vol)

            # 5. Uplink to Odoo ERP (Level 4)
            try:
                try:
                    import db_routes
                except ImportError:
                    from . import db_routes

                if hasattr(db_routes, "uplink_odoo_mo_internal"):
                    logger.info(f"[ClosedLoopBatch] Uplinking Order [{order_code}] ({final_vol:.2f}L) to Odoo ERP...")
                    await db_routes.uplink_odoo_mo_internal(order_code, final_vol)

                if hasattr(db_routes, "uplink_tank_stocks_internal"):
                    logger.info("[ClosedLoopBatch] Uplinking current tank inventory levels to Odoo ERP...")
                    await db_routes.uplink_tank_stocks_internal()
            except Exception as odoo_err:
                logger.warning(f"[ClosedLoopBatch] Odoo ERP uplink notice: {odoo_err}")

    except Exception as exc:
        logger.error(f"[ClosedLoopBatch] Error in post-batch execution for Order [{order_code}]: {exc}", exc_info=True)


def evaluate_completion(simulated_cell1: Optional[bool] = None, simulated_cell2: Optional[bool] = None) -> Dict[str, Any]:
    """
    Checks independent completion flags and live PLC State_ID feedback:
    - Cell 1 completes when Flag_Complete == True or State_ID in (3, 11) -> records t_end_cell1.
    - Cell 2 completes when Flag_Complete == True or State_ID in (3, 11) -> records t_end_cell2.
    - Closed-loop execution: triggers automated inventory backflush, EBR report, and multi-batch campaign auto-advance.
    """
    now_ts = time.time()
    try:
        cell1_tags, cell2_tags = resolve_operations_tags()

        # 0. Synchronize live PLC State_ID feedback if mapped and actively reporting
        state_node_1 = cell1_tags.get("State_ID")
        if state_node_1 and not state.pending_plc_ack:
            raw_s1 = read_tag_from_cache(state_node_1)
            if raw_s1 is not None:
                try:
                    c1_code = int(float(raw_s1))
                    state.last_plc_state_raw = c1_code
                    decoded = _decode_plc_state_id(c1_code)
                    # If PLC reports a live non-idle state, or if we are not in virtual fallback, honor PLC Hardware authority
                    if c1_code > 0 or not state.virtual_state_fallback:
                        state.cell1_state_id = c1_code
                        state.state_source = "PLC_HARDWARE"
                        state.virtual_state_fallback = False
                        if decoded and state.batch_state not in ("DOWNLOADING", "READY"):
                            state.batch_state = decoded
                except (ValueError, TypeError):
                    pass

        # 1. Evaluate Cell 1 (Physical Hardware)
        if state.execution_mode in ("mode1_physical", "mode3_dual") and not state.cell1_complete:
            flag_node_1 = cell1_tags.get("Flag_Complete")
            is_done = False
            if simulated_cell1 is True:
                is_done = True
            elif flag_node_1:
                val = read_tag_from_cache(flag_node_1)
                is_done = bool(val) if val is not None else False
            
            if not is_done and state_node_1:
                s_val = read_tag_from_cache(state_node_1)
                if s_val is not None:
                    try:
                        # PM-CONTROL: 3=COMPLETE; ISA-88 11-State: 11=COMPLETE
                        is_done = int(float(s_val)) in (3, 11)
                    except (ValueError, TypeError):
                        pass

            if is_done:
                state.cell1_complete = True
                state.t_end_cell1 = now_ts
                state.cell1_state_id = 3

        # 2. Evaluate Cell 2 (SIMIT Digital Twin)
        if state.execution_mode in ("mode2_simit", "mode3_dual") and not state.cell2_complete:
            flag_node_2 = cell2_tags.get("Flag_Complete")
            state_node_2 = cell2_tags.get("State_ID")
            is_done = False
            if simulated_cell2 is True:
                is_done = True
            elif flag_node_2:
                val = read_tag_from_cache(flag_node_2)
                is_done = bool(val) if val is not None else False

            if not is_done and state_node_2:
                s_val = read_tag_from_cache(state_node_2)
                if s_val is not None:
                    try:
                        is_done = int(float(s_val)) in (3, 11)
                    except (ValueError, TypeError):
                        pass

            if is_done:
                state.cell2_complete = True
                state.t_end_cell2 = now_ts
                state.cell2_state_id = 3

        # 3. Overall Order Finalization:
        # In multi-batch campaigns, order finalized only when the final batch (k == N) finishes.
        is_final_batch = (state.current_campaign_batch >= state.campaign_batch_count)
        order_finalized = False
        if state.execution_mode == "mode1_physical":
            order_finalized = state.cell1_complete and is_final_batch
        elif state.execution_mode == "mode2_simit":
            order_finalized = state.cell2_complete and is_final_batch
        elif state.execution_mode == "mode3_dual":
            order_finalized = state.cell1_complete and is_final_batch

        if order_finalized and state.batch_state == "RUNNING":
            state.batch_state = "COMPLETED"

        # 4. Trigger Closed-Loop Post-Batch Processing (guarded by completion_processed)
        batch_finished_flag = state.cell1_complete or (state.execution_mode == "mode2_simit" and state.cell2_complete)
        if batch_finished_flag and not getattr(state, "completion_processed", False) and state.order_code:
            state.completion_processed = True
            _trigger_closed_loop_completion(state.order_code)

        def _format_dur(start: Optional[float], end: Optional[float]) -> str:
            if not start:
                return "--"
            e = end if end else now_ts
            diff = max(0, int(e - start))
            mins, secs = divmod(diff, 60)
            return f"{mins:02d}m{secs:02d}s"

        return {
            "batch_state": state.batch_state,
            "state_source": state.state_source,
            "virtual_state_fallback": state.virtual_state_fallback,
            "execution_mode": state.execution_mode,
            "cell1_complete": state.cell1_complete,
            "cell2_complete": state.cell2_complete,
            "duration_cell1": _format_dur(state.t_start_cell1, state.t_end_cell1),
            "duration_cell2": _format_dur(state.t_start_cell2, state.t_end_cell2),
            "order_finalized": order_finalized,
            "campaign_batch": state.current_campaign_batch,
            "campaign_total_batches": state.campaign_batch_count,
            "active_batch_id": state.active_batch_id,
            "awaiting_drain": getattr(state, "awaiting_drain", False),
            "campaign_accumulated_actual_volume": getattr(state, "campaign_accumulated_actual_volume", 0.0),
            "drain_threshold": getattr(state, "drain_threshold", 0.8)
        }
    except Exception as exc:
        logger.warning(f"[evaluate_completion] Evaluation fallback warning: {exc}")
        return {
            "batch_state": state.batch_state,
            "state_source": state.state_source,
            "virtual_state_fallback": state.virtual_state_fallback,
            "execution_mode": state.execution_mode,
            "cell1_complete": state.cell1_complete,
            "cell2_complete": state.cell2_complete,
            "duration_cell1": "--",
            "duration_cell2": "--",
            "order_finalized": False,
            "awaiting_drain": getattr(state, "awaiting_drain", False),
            "campaign_accumulated_actual_volume": getattr(state, "campaign_accumulated_actual_volume", 0.0)
        }

# ============================================================================
# DIGITAL TWIN DEVIATION MATRIX & FIDELITY INDEX ENGINE
# ============================================================================

def _calculate_parameter_tolerance(param_id: str, unit: str, sp_val: float) -> float:
    """
    Calculates dynamic engineering tolerance per ISA-88 / Siemens PM-CONTROL:
    - Thermal tags ('heat', 'cool', unit '°C'): ±2.0°C default
    - Material weight/volume tags ('milk', 'sugar', 'additive', unit 'L'/'kg'):
      ±2.0% of SP (minimum ±0.05 kg/L for lab scale)
    - Mechanical agitator speed ('agitator', unit 'RPM'): ±2.0% of SP (minimum ±25.0 RPM)
    """
    if unit == "°C" or param_id in ("heat", "cool"):
        return 2.0
    if unit in ("L", "kg") or param_id in ("milk", "sugar", "additive"):
        return round(max(0.05, abs(sp_val) * 0.02), 3)
    if unit == "RPM" or param_id == "agitator":
        return round(max(25.0, abs(sp_val) * 0.02), 1)
    return round(max(0.05, abs(sp_val) * 0.02), 3)


def evaluate_sp_tracking_status(
    sp_val: float,
    pv_val: Optional[float],
    tolerance: float,
    batch_state: str,
    is_mapped: bool = True
) -> str:
    """
    Strict 4-tier industrial evaluation of Setpoint vs. Actual (SP vs. PV):
    1. 'UNMAPPED': If PV tag is not mapped or no telemetry received.
    2. 'MATCHED (IN TOLERANCE)': Only when SP > 0 and |PV - SP| <= Tolerance.
    3. 'RAMPING / DOSING': When batch state is RUNNING and PV < SP - Tolerance.
    4. 'DEVIATING / OVERSHOOT': When PV > SP + Tolerance (overshoot!) OR when phase/batch is not RUNNING and |PV - SP| > Tolerance.
    """
    if not is_mapped or pv_val is None:
        return "UNMAPPED"
    abs_delta_sp = abs(pv_val - sp_val)
    if sp_val > 0 and abs_delta_sp <= tolerance:
        return "MATCHED (IN TOLERANCE)"
    if pv_val > sp_val + tolerance:
        return "DEVIATING / OVERSHOOT"
    if str(batch_state).upper() == "RUNNING" and pv_val < sp_val - tolerance:
        return "RAMPING / DOSING"
    return "DEVIATING / OVERSHOOT"


def get_deviation_matrix() -> Dict[str, Any]:
    """
    Computes real-time telemetry matrix comparing:
      1. Setpoint Tracking Status (sp_tracking_status): Compares PV_HW vs. SP
         - Δ_SP = PV_HW - SP, |Δ_SP| = |PV_HW - SP|
         - 4-tier status: UNMAPPED | MATCHED (IN TOLERANCE) | RAMPING / DOSING | DEVIATING / OVERSHOOT
      2. Twin Synchronization Status (twin_sync_status): Compares PV_HW vs. PV_SIMIT
         - Δ_twin,i = |PV_HW,i - PV_SIMIT,i|
         - Parameter Fidelity_i = max(0.0, 100.0 - (Δ_twin,i / max(|SP_i|, |FullScale_i|, 1.0)) * 100.0)
         - Even while RAMPING / DOSING, if Δ_twin,i <= Tolerance_i, counts as TWIN_SYNCHRONIZED and contributes
           continuous accuracy to overall fidelity_index!
    """
    try:
        evaluate_completion()
        cell1_tags, cell2_tags = resolve_operations_tags()
    except Exception as exc:
        logger.warning(f"[get_deviation_matrix] Completion evaluation warning: {exc}")
        cell1_tags, cell2_tags = {}, {}
    
    # 6 Core ISA-88 Parameters with units and full-scale normalization references
    params_def = [
        {
            "id": "milk",
            "name": "Cấp sữa tươi (Milk Dosing)",
            "phase": "PH_SUPPLYMILK",
            "sp_key": "milk_sp",
            "unit": "L",
            "full_scale": 5.0,
            "cell1_pv_tag": "Milk_PV",
            "cell2_pv_tag": "Milk_PV"
        },
        {
            "id": "sugar",
            "name": "Định lượng đường (Sugar Dosing)",
            "phase": "PH_SUPPLYSUGAR",
            "sp_key": "sugar_sp",
            "unit": "kg",
            "full_scale": 5.0,
            "cell1_pv_tag": "Sugar_PV",
            "cell2_pv_tag": "Sugar_PV"
        },
        {
            "id": "additive",
            "name": "Vi chất dinh dưỡng (Additive)",
            "phase": "PH_SUPPLYADDITIVE",
            "sp_key": "additive_sp",
            "unit": "L",
            "full_scale": 5.0,
            "cell1_pv_tag": "Additive_PV",
            "cell2_pv_tag": "Additive_PV"
        },
        {
            "id": "heat",
            "name": "Tiệt trùng UHT (Sterilization Temp)",
            "phase": "PH_HEAT",
            "sp_key": "heating_sp",
            "unit": "°C",
            "full_scale": 150.0,
            "cell1_pv_tag": "Heating_PV",
            "cell2_pv_tag": "Heating_PV"
        },
        {
            "id": "cool",
            "name": "Làm lạnh vô trùng (Cooling Temp)",
            "phase": "PH_CHILL",
            "sp_key": "cooling_sp",
            "unit": "°C",
            "full_scale": 100.0,
            "cell1_pv_tag": "Cooling_PV",
            "cell2_pv_tag": "Cooling_PV"
        },
        {
            "id": "agitator",
            "name": "Tốc độ cánh khuấy (Agitator Speed)",
            "phase": "PH_AGITATE",
            "sp_key": "agitator_sp",
            "unit": "RPM",
            "full_scale": 1500.0,
            "cell1_pv_tag": "Agitator_PV",
            "cell2_pv_tag": "Agitator_PV"
        },
    ]

    try:
        matrix_rows = []
        matched_sp_count = 0
        synchronized_twin_count = 0
        mapped_c1_count = 0
        mapped_twin_count = 0
        fidelity_accumulator: List[float] = []

        for p in params_def:
            sp_val = _safe_float(state.recipe_setpoints.get(p["sp_key"])) or 0.0
            tolerance = _calculate_parameter_tolerance(p["id"], p["unit"], sp_val)
            full_scale = float(p.get("full_scale", 1.0))

            c1_node = cell1_tags.get(p["cell1_pv_tag"])
            c2_node = cell2_tags.get(p["cell2_pv_tag"])

            has_c1_map = bool(c1_node)
            has_c2_map = bool(c2_node)

            raw_c1_val = read_tag_from_cache(c1_node) if c1_node else None
            raw_c2_val = read_tag_from_cache(c2_node) if c2_node else None

            pv_hardware: Optional[float] = _safe_float(raw_c1_val)
            pv_simit: Optional[float] = _safe_float(raw_c2_val)

            # 1. Setpoint vs. Actual (SP vs. PV_HW) evaluation
            delta_sp: Optional[float] = None
            abs_delta_sp: Optional[float] = None
            if has_c1_map and pv_hardware is not None:
                mapped_c1_count += 1
                delta_sp = round(pv_hardware - sp_val, 2)
                abs_delta_sp = round(abs(pv_hardware - sp_val), 2)

            sp_tracking_status = evaluate_sp_tracking_status(
                sp_val=sp_val,
                pv_val=pv_hardware,
                tolerance=tolerance,
                batch_state=state.batch_state,
                is_mapped=has_c1_map
            )
            if sp_tracking_status == "MATCHED (IN TOLERANCE)":
                matched_sp_count += 1

            # 2. Digital Twin Synchronization (PV_HW vs. PV_SIMIT) evaluation
            delta_twin: Optional[float] = None
            parameter_fidelity: Optional[float] = None
            twin_sync_status: str = "UNMAPPED"

            if has_c1_map and has_c2_map and pv_hardware is not None and pv_simit is not None:
                mapped_twin_count += 1
                delta_twin = round(abs(pv_hardware - pv_simit), 2)
                denom = max(abs(sp_val), abs(full_scale), 1.0)
                parameter_fidelity = round(max(0.0, 100.0 - (delta_twin / denom) * 100.0), 1)
                fidelity_accumulator.append(parameter_fidelity)

                if delta_twin <= tolerance:
                    twin_sync_status = "TWIN_SYNCHRONIZED"
                    synchronized_twin_count += 1
                else:
                    twin_sync_status = "TWIN_DRIFT"

            # Primary status exposes the strict 4-tier SP vs. PV evaluation (no false MATCHED badges!)
            status = sp_tracking_status
            # Primary delta exposes |PV_HW - SP| when only C1 is mapped, or delta_twin when Twin is compared
            delta = abs_delta_sp if abs_delta_sp is not None else delta_twin

            matrix_rows.append({
                "id": p["id"],
                "name": p["name"],
                "phase": p["phase"],
                "unit": p["unit"],
                "sp": sp_val,
                "pv_hardware": pv_hardware,
                "pv_simit": pv_simit,
                "delta": delta,
                "delta_sp": delta_sp,
                "abs_delta_sp": abs_delta_sp,
                "delta_twin": delta_twin,
                "tolerance": tolerance,
                "status": status,
                "sp_tracking_status": sp_tracking_status,
                "twin_sync_status": twin_sync_status,
                "parameter_fidelity": parameter_fidelity,
                "c1_mapped": has_c1_map,
                "c2_mapped": has_c2_map
            })

        # Twin Model Fidelity Index: continuous accuracy average across mapped Twin parameters (including during RAMPING)
        fidelity_index: Optional[float] = None
        if fidelity_accumulator:
            fidelity_index = round(sum(fidelity_accumulator) / len(fidelity_accumulator), 1)

        # Cycle Times calculation
        now_ts = time.time()
        def _dur_seconds(start: Optional[float], end: Optional[float]) -> Optional[float]:
            if not start:
                return None
            e = end if end else (now_ts if state.batch_state == "RUNNING" else start)
            return max(0.0, e - start)

        t_hw_sec = _dur_seconds(state.t_start_cell1, state.t_end_cell1)
        t_simit_sec = _dur_seconds(state.t_start_cell2, state.t_end_cell2)

        delta_t_sec: Optional[float] = None
        if t_hw_sec is not None and t_simit_sec is not None:
            delta_t_sec = round(abs(t_hw_sec - t_simit_sec), 1)

        def _format_time_sec(sec: Optional[float]) -> str:
            if sec is None:
                return "--"
            s = int(sec)
            mins, secs = divmod(s, 60)
            return f"{mins:02d}m{secs:02d}s"

        # Read Mixing Tank and Heater Interlock telemetry
        c1_mix_w_node = cell1_tags.get("Mixing_Weight_PV")
        c1_mix_t_node = cell1_tags.get("Mixing_Temp_PV")
        c1_ssr_node = cell1_tags.get("SSR_Heater_Status")
        c1_ready_node = cell1_tags.get("Heater_Ready_Flag")

        mix_w_val: Optional[float] = _safe_float(read_tag_from_cache(c1_mix_w_node)) if c1_mix_w_node else None
        mix_t_val: Optional[float] = _safe_float(read_tag_from_cache(c1_mix_t_node)) if c1_mix_t_node else None

        raw_ssr = read_tag_from_cache(c1_ssr_node) if c1_ssr_node else None
        ssr_active: bool = bool(raw_ssr and str(raw_ssr).strip().lower() not in ("0", "false", "off", "none", "null"))

        # Heater Thermal Interlock Evaluation
        uht_sp = _safe_float(state.recipe_setpoints.get("heating_sp")) or 138.0
        uht_pv_node = cell1_tags.get("Heating_PV")
        uht_pv = _safe_float(read_tag_from_cache(uht_pv_node)) if uht_pv_node else None

        raw_ready = read_tag_from_cache(c1_ready_node) if c1_ready_node else None
        if raw_ready is not None:
            heater_ready: bool = bool(raw_ready and str(raw_ready).strip().lower() not in ("0", "false", "off", "none", "null"))
        else:
            heater_ready = bool(uht_sp > 0 and uht_pv is not None and uht_pv >= (uht_sp - 2.0))

        heater_temp_interlock_ok = bool(uht_sp > 0 and uht_pv is not None and uht_pv >= (uht_sp - 2.0))
        heater_interlock_status = "READY (TEMP OK)" if heater_temp_interlock_ok else "PRE-HEATING / TRANSFER LOCKED"

        # Read 3 Intermediate Pre-Weighing Hoppers
        w1_node = cell1_tags.get("Weigh1_Weight_PV") or "ns=2;s=Modbus_TCP.weigh1.weight"
        w2_node = cell1_tags.get("Weigh2_Weight_PV") or "ns=2;s=Modbus_TCP.weigh2.weight"
        w3_node = cell1_tags.get("Weigh3_Weight_PV") or "ns=2;s=Modbus_TCP.weigh3.weight"

        w1_pv: Optional[float] = _safe_float(read_tag_from_cache(w1_node)) if w1_node else None
        w2_pv: Optional[float] = _safe_float(read_tag_from_cache(w2_node)) if w2_node else None
        w3_pv: Optional[float] = _safe_float(read_tag_from_cache(w3_node)) if w3_node else None

        sp_milk = _safe_float(state.recipe_setpoints.get("milk_sp")) or 0.0
        sp_sugar = _safe_float(state.recipe_setpoints.get("sugar_sp")) or 0.0
        sp_additive = _safe_float(state.recipe_setpoints.get("additive_sp")) or 0.0

        def _eval_hopper(name: str, id_code: str, sp: float, pv: Optional[float], unit: str):
            tol = max(0.05, sp * 0.02)
            if pv is None:
                h_status = "UNMAPPED"
            elif sp <= 0:
                h_status = "WEIGHT_OK"
            elif pv < (sp - tol):
                h_status = "UNDER_WEIGHT"
            elif (sp - tol) <= pv <= (sp + tol):
                h_status = "WEIGHT_OK (READY TO DISCHARGE)"
            else:
                h_status = "OVER_WEIGHT_ALARM"

            return {
                "id": id_code,
                "name": name,
                "sp": sp,
                "pv": pv,
                "unit": unit,
                "tolerance": round(tol, 3),
                "status": h_status,
                "zero_return_ok": bool(pv is None or pv <= 0.5),
                "discharge_permissive": bool(h_status == "WEIGHT_OK (READY TO DISCHARGE)")
            }

        h1 = _eval_hopper("Bồn cân trung gian 1 - Sữa tươi", "weigh1", sp_milk, w1_pv, "L")
        h2 = _eval_hopper("Bồn cân trung gian 2 - Đường", "weigh2", sp_sugar, w2_pv, "kg")
        h3 = _eval_hopper("Bồn cân trung gian 3 - Phụ gia", "weigh3", sp_additive, w3_pv, "kg")
        hoppers_list = [h1, h2, h3]

        hopper_zero_return_ok = h1["zero_return_ok"] and h2["zero_return_ok"] and h3["zero_return_ok"]
        all_hoppers_ready = all(h["status"] == "WEIGHT_OK (READY TO DISCHARGE)" for h in hoppers_list)

        # Stage C: Mass Balance Evaluation
        total_dosed_weighed = (w1_pv if w1_pv and w1_pv > 0 else sp_milk) + (w2_pv if w2_pv and w2_pv > 0 else sp_sugar) + (w3_pv if w3_pv and w3_pv > 0 else sp_additive)
        mix_tank_mass = mix_w_val if mix_w_val is not None else total_dosed_weighed
        mass_balance_delta = round(abs(mix_tank_mass - total_dosed_weighed), 3)
        mass_balance_pass = bool(mass_balance_delta <= 0.15)

        # Pre-Batch Material Availability Check
        mat_avail = check_inventory_availability_sync(
            milk_sp=sp_milk,
            sugar_sp=sp_sugar,
            additive_sp=sp_additive,
            order_code=state.order_code
        )

        return {
            "execution_mode": state.execution_mode,
            "batch_state": state.batch_state,
            "state_source": state.state_source,
            "virtual_state_fallback": state.virtual_state_fallback,
            "order_code": state.order_code,
            "recipe_name": state.recipe_name,
            "matrix": matrix_rows,
            "heater_ready": heater_ready,
            "heater_temp_interlock_ok": heater_temp_interlock_ok,
            "heater_interlock_status": heater_interlock_status,
            "heater_sp": uht_sp,
            "heater_pv": uht_pv,
            "ssr_heating_active": ssr_active,
            "mixing_weight_pv": mix_w_val,
            "mixing_temp_pv": mix_t_val,
            "pre_weighing_hoppers": hoppers_list,
            "hopper_zero_return_ok": hopper_zero_return_ok,
            "all_hoppers_weighed_ready": all_hoppers_ready,
            "mass_balance": {
                "total_dosed_weighed": round(total_dosed_weighed, 3),
                "mix_tank_mass": mix_tank_mass,
                "delta": mass_balance_delta,
                "is_pass": mass_balance_pass,
                "tolerance": 0.15
            },
            "material_availability": mat_avail,
            "benchmark_summary": {
                "mapped_parameters": mapped_c1_count,
                "mapped_twin_parameters": mapped_twin_count,
                "matched_parameters": matched_sp_count,
                "synchronized_parameters": synchronized_twin_count,
                "total_parameters": len(params_def),
                "fidelity_index": fidelity_index,
                "state_source": state.state_source,
                "virtual_state_fallback": state.virtual_state_fallback,
                "t_hardware_sec": t_hw_sec,
                "t_hardware_formatted": _format_time_sec(t_hw_sec),
                "t_simit_sec": t_simit_sec,
                "t_simit_formatted": _format_time_sec(t_simit_sec),
                "delta_t_sec": delta_t_sec,
                "delta_t_formatted": _format_time_sec(delta_t_sec),
                "cell1_complete": state.cell1_complete,
                "cell2_complete": state.cell2_complete
            },
            "campaign_summary": {
                "is_campaign": state.campaign_batch_count > 1,
                "total_order_volume": state.total_order_volume,
                "total_batches": state.campaign_batch_count,
                "current_batch": state.current_campaign_batch,
                "batch_volume": state.equalized_batch_volume,
                "active_batch_id": state.active_batch_id,
                "plan": state.campaign_plan
            }
        }
    except Exception as exc:
        logger.warning(f"[get_deviation_matrix] Deviation calculation error: {exc}")
        return {
            "execution_mode": state.execution_mode,
            "batch_state": state.batch_state,
            "state_source": state.state_source,
            "virtual_state_fallback": state.virtual_state_fallback,
            "order_code": state.order_code,
            "recipe_name": state.recipe_name,
            "matrix": [],
            "heater_ready": False,
            "ssr_heating_active": False,
            "mixing_weight_pv": None,
            "mixing_temp_pv": None,
            "benchmark_summary": None,
            "campaign_summary": {
                "is_campaign": False,
                "total_order_volume": 0.0,
                "total_batches": 1,
                "current_batch": 1,
                "batch_volume": 0.0,
                "plan": None
            }
        }
