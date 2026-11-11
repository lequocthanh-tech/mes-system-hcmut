"""
Historian & Equipment Maintenance Engine for MES Production System
Synchronized with Microsoft SQL Server: localhost\\WINCC -> MES_Milk_Production
Handles:
1. Equipment Maintenance, Runtime Tracking, and Maintenance Counts (dbo.Equipment_Master, dbo.Equipment_Maintenance, dbo.Equipment_Status_History)
2. Process Telemetry Historian and Setpoint Deviation Monitoring (dbo.PLC_Datalog, dbo.PLC_Setpoint_Monitoring)
"""

import sys
import os
import re
import time
import asyncio
import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple, Union

logger = logging.getLogger("MES_Historian")

# Ensure local imports work
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from . import db_connector
    from .db_connector import execute_query, execute_transaction
    from .store_forward_engine import db_engine
except (ImportError, ValueError):
    import db_connector
    from db_connector import execute_query, execute_transaction
    try:
        from store_forward_engine import db_engine
    except ImportError:
        db_engine = None


def _json_serial(obj: Any) -> Any:
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj


def _to_snake_case(key: str) -> str:
    s = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', key)
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s)
    s = re.sub(r'_+', '_', s)
    return s.lower()


def _format_row_dates(row: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert datetime values in a dict to ISO strings and populate dual-key snake_case."""
    formatted = {}
    for k, v in row.items():
        val = v.isoformat() if isinstance(v, (datetime, date)) else v
        formatted[k] = val
        sk = _to_snake_case(k)
        if sk not in formatted:
            formatted[sk] = val
    return formatted


# ============================================================================
# 1. EQUIPMENT MASTER SERVICE
# ============================================================================

def get_all_equipment() -> List[Dict[str, Any]]:
    """
    Retrieves all equipment from dbo.Equipment_Master.
    Computes runtime ratios, health scores, and interlock status.
    """
    sql = """
    SELECT 
        EquipmentID,
        EquipmentCode,
        EquipmentName,
        EquipmentType,
        Location,
        CurrentStatus,
        ISNULL(Runtime_Hours, 0.0) AS Runtime_Hours,
        ISNULL(TotalStarts, 0) AS TotalStarts,
        ISNULL(Maintenance_Limit_Hours, 500.0) AS Maintenance_Limit_Hours,
        ISNULL(Maintenance_Count, 0) AS Maintenance_Count,
        Last_Maintenance_Date,
        Next_Maintenance_Due,
        Created_At,
        CASE WHEN COL_LENGTH('dbo.Equipment_Master', 'RatedCurrent') IS NOT NULL THEN ISNULL(RatedCurrent, 10.0) ELSE 10.0 END AS RatedCurrent,
        CASE WHEN COL_LENGTH('dbo.Equipment_Master', 'MaxVibrationThreshold') IS NOT NULL THEN ISNULL(MaxVibrationThreshold, 4.5) ELSE 4.5 END AS MaxVibrationThreshold,
        CASE WHEN COL_LENGTH('dbo.Equipment_Master', 'MaxTempThreshold') IS NOT NULL THEN ISNULL(MaxTempThreshold, 75.0) ELSE 75.0 END AS MaxTempThreshold,
        CASE WHEN COL_LENGTH('dbo.Equipment_Master', 'Notes') IS NOT NULL THEN Notes ELSE '' END AS Notes,
        CASE WHEN COL_LENGTH('dbo.Equipment_Master', 'Last_Update') IS NOT NULL THEN Last_Update ELSE Created_At END AS Last_Update
    FROM Equipment_Master
    ORDER BY EquipmentID ASC;
    """
    rows = execute_query(sql)
    results = []
    for r in rows:
        row = _format_row_dates(r)
        runtime = float(row.get("Runtime_Hours", 0.0))
        limit = float(row.get("Maintenance_Limit_Hours", 500.0))
        usage_pct = round((runtime / limit) * 100.0, 1) if limit > 0 else 0.0
        health_ratio = max(0.0, min(100.0, round(100.0 - usage_pct, 1)))
        status = str(row.get("CurrentStatus", "STOP")).upper()
        
        is_interlocked = (
            status in ("MAINTENANCE_REQUIRED", "FAULT", "MAINTENANCE") or
            (limit > 0 and runtime >= limit)
        )

        row["Usage_Percent"] = usage_pct
        row["Health_Ratio"] = health_ratio
        row["Is_Interlocked"] = is_interlocked
        # snake_case standardized aliases
        row["equipment_id"] = row.get("EquipmentID")
        row["equipment_code"] = row.get("EquipmentCode")
        row["equipment_name"] = row.get("EquipmentName")
        row["equipment_type"] = row.get("EquipmentType")
        row["location"] = row.get("Location")
        row["current_status"] = status
        row["runtime_hours"] = runtime
        row["total_starts"] = int(row.get("TotalStarts") or 0)
        row["maintenance_limit_hours"] = limit
        row["maintenance_count"] = int(row.get("Maintenance_Count") or 0)
        row["last_maintenance_date"] = row.get("Last_Maintenance_Date")
        row["next_maintenance_due"] = row.get("Next_Maintenance_Due")
        row["usage_percent"] = usage_pct
        row["health_ratio"] = health_ratio
        row["is_interlocked"] = is_interlocked
        row["rated_current"] = float(row.get("RatedCurrent") or 10.0)
        row["max_vibration"] = float(row.get("MaxVibrationThreshold") or 4.5)
        row["max_temp"] = float(row.get("MaxTempThreshold") or 75.0)
        row["notes"] = row.get("Notes") or ""
        row["last_update"] = row.get("Last_Update") or row.get("Created_At")
        results.append(row)
    return results


def get_equipment_by_id_or_code(identifier: Any) -> Optional[Dict[str, Any]]:
    """Lookup equipment by ID or EquipmentCode."""
    if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.isdigit()):
        sql = "SELECT * FROM Equipment_Master WHERE EquipmentID = ?;"
        params = (int(identifier),)
    else:
        sql = "SELECT * FROM Equipment_Master WHERE EquipmentCode = ?;"
        params = (str(identifier).strip(),)
    
    rows = execute_query(sql, params)
    if rows and len(rows) > 0:
        return _format_row_dates(rows[0])
    return None


def update_equipment_status(
    identifier: Any, 
    new_status: str, 
    duration_seconds: int = 0,
    trigger_source: str = "MANUAL_DISPATCH"
) -> Dict[str, Any]:
    """
    Updates equipment status and records state change event in dbo.Equipment_Status_History.
    Increments TotalStarts if transition is into 'RUNNING'.
    """
    eq = get_equipment_by_id_or_code(identifier)
    if not eq:
        raise ValueError(f"Equipment [{identifier}] not found in database.")

    eq_id = int(eq["EquipmentID"])
    eq_code = eq["EquipmentCode"]
    old_status = str(eq.get("CurrentStatus", "STOP")).strip().upper()
    target_status = str(new_status).strip().upper()

    if old_status == target_status:
        return {"status": "unchanged", "EquipmentID": eq_id, "CurrentStatus": old_status}

    # 1. Insert into Equipment_Status_History
    insert_hist_sql = """
    INSERT INTO Equipment_Status_History (EquipmentID, Old_Status, New_Status, Duration_Seconds, Changed_At)
    VALUES (?, ?, ?, ?, GETDATE());
    """
    
    # 2. Update Equipment_Master
    if target_status == "RUNNING":
        update_eq_sql = """
        UPDATE Equipment_Master
        SET CurrentStatus = ?,
            TotalStarts = ISNULL(TotalStarts, 0) + 1
        WHERE EquipmentID = ?;
        """
    else:
        update_eq_sql = """
        UPDATE Equipment_Master
        SET CurrentStatus = ?
        WHERE EquipmentID = ?;
        """

    ops = [
        (insert_hist_sql, (eq_id, old_status, target_status, int(duration_seconds))),
        (update_eq_sql, (target_status, eq_id))
    ]
    execute_transaction(ops)

    # 3. Log into UserActionLog
    db_connector.log_user_action(
        user_name=trigger_source,
        user_role="OPERATOR",
        action_name="EQUIPMENT_STATUS_CHANGE",
        detail=f"Equipment [{eq_code}] switched status from [{old_status}] to [{target_status}]"
    )

    logger.info(f"Equipment [{eq_code}] transitioned from {old_status} -> {target_status}")
    return {
        "status": "success",
        "EquipmentID": eq_id,
        "EquipmentCode": eq_code,
        "OldStatus": old_status,
        "NewStatus": target_status
    }


# ============================================================================
# 2. EQUIPMENT MAINTENANCE SERVICE
# ============================================================================

def get_maintenance_history(equipment_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retrieves maintenance log history joined with Equipment_Master."""
    if equipment_id:
        sql = """
        SELECT 
            m.Maintenance_ID,
            m.Maintenance_ID AS log_id,
            m.EquipmentID,
            COALESCE(e.EquipmentCode, m.Equipment_Code) AS EquipmentCode,
            COALESCE(e.EquipmentName, m.Equipment_Code) AS EquipmentName,
            COALESCE(m.Ticket_Type, m.Maintenance_Type) AS Ticket_Type,
            m.Maintenance_Type,
            COALESCE(m.Action_Taken, m.Description) AS Action_Taken,
            m.Description,
            m.Technician,
            m.Spare_Parts_Used,
            COALESCE(m.Serviced_At, m.Completed_Date) AS Serviced_At,
            m.Completed_Date,
            m.Cost_VND,
            m.Reset_Runtime_Flag,
            m.Status,
            m.Remarks
        FROM Equipment_Maintenance m
        LEFT JOIN Equipment_Master e ON (m.EquipmentID = e.EquipmentID OR m.Equipment_Code = e.EquipmentCode)
        WHERE m.EquipmentID = ?
        ORDER BY COALESCE(m.Serviced_At, m.Completed_Date) DESC;
        """
        rows = execute_query(sql, (equipment_id,))
    else:
        sql = """
        SELECT 
            m.Maintenance_ID,
            m.Maintenance_ID AS log_id,
            m.EquipmentID,
            COALESCE(e.EquipmentCode, m.Equipment_Code) AS EquipmentCode,
            COALESCE(e.EquipmentName, m.Equipment_Code) AS EquipmentName,
            COALESCE(m.Ticket_Type, m.Maintenance_Type) AS Ticket_Type,
            m.Maintenance_Type,
            COALESCE(m.Action_Taken, m.Description) AS Action_Taken,
            m.Description,
            m.Technician,
            m.Spare_Parts_Used,
            COALESCE(m.Serviced_At, m.Completed_Date) AS Serviced_At,
            m.Completed_Date,
            m.Cost_VND,
            m.Reset_Runtime_Flag,
            m.Status,
            m.Remarks
        FROM Equipment_Maintenance m
        LEFT JOIN Equipment_Master e ON (m.EquipmentID = e.EquipmentID OR m.Equipment_Code = e.EquipmentCode)
        ORDER BY COALESCE(m.Serviced_At, m.Completed_Date) DESC;
        """
        rows = execute_query(sql)

    return [_format_row_dates(r) for r in rows]


def record_maintenance_event(
    equipment_id: Union[int, str],
    maintenance_type: str,
    description: str,
    technician: str,
    cost_vnd: float = 0.0,
    reset_runtime: bool = True,
    ticket_type: Optional[str] = None,
    spare_parts_used: Optional[str] = None,
    action_taken: Optional[str] = None,
    remarks: Optional[str] = None,
    equipment_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Records a completed maintenance event:
    1. Inserts record into dbo.Equipment_Maintenance.
    2. Increments Maintenance_Count by 1 in dbo.Equipment_Master.
    3. Updates Last_Maintenance_Date = GETDATE() and Next_Maintenance_Due = DATEADD(month, 3, GETDATE()).
    4. If reset_runtime is True, resets Runtime_Hours to 0.0.
    5. If status was MAINTENANCE_REQUIRED, FAULT, or MAINTENANCE, restores to 'STOPPED'.
    """
    lookup_val = equipment_code or equipment_id
    eq = get_equipment_by_id_or_code(lookup_val)
    if not eq and equipment_id:
        eq = get_equipment_by_id_or_code(equipment_id)
    if not eq:
        raise ValueError(f"Equipment with identifier [{lookup_val}] does not exist.")

    eq_code = eq["EquipmentCode"]
    current_status = str(eq.get("CurrentStatus", "STOPPED")).strip().upper()

    t_type = str(ticket_type or maintenance_type or "Preventive")
    m_type = str(maintenance_type or t_type)
    desc = str(description or remarks or "Bảo dưỡng định kỳ hoàn tất.")
    act_taken = str(action_taken or desc)
    parts = str(spare_parts_used or "")
    rem = str(remarks or desc)

    # 1. Insert into Equipment_Maintenance
    insert_maint_sql = """
    INSERT INTO Equipment_Maintenance (
        EquipmentID, Equipment_Code, Maintenance_Type, Ticket_Type, Description,
        Action_Taken, Technician, Spare_Parts_Used, Cost_VND, Completed_Date,
        Serviced_At, Reset_Runtime_Flag, Status, Remarks
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE(), ?, 'Completed', ?);
    """

    # 2. Update Equipment_Master
    update_eq_sql = """
    UPDATE Equipment_Master
    SET Maintenance_Count = ISNULL(Maintenance_Count, 0) + 1,
        Last_Maintenance_Date = GETDATE(),
        Next_Maintenance_Due = DATEADD(month, 3, GETDATE()),
        Runtime_Hours = CASE WHEN ? = 1 THEN 0.0 ELSE Runtime_Hours END,
        CurrentStatus = CASE WHEN CurrentStatus IN ('MAINTENANCE_REQUIRED', 'FAULT', 'MAINTENANCE', 'STOP') THEN 'STOPPED' ELSE CurrentStatus END
    WHERE EquipmentID = ?;
    """

    ops = [
        (insert_maint_sql, (
            equipment_id, eq_code, m_type, t_type, desc,
            act_taken, str(technician), parts, float(cost_vnd),
            1 if reset_runtime else 0, rem
        )),
        (update_eq_sql, (1 if reset_runtime else 0, equipment_id))
    ]

    # If status changes, log transition
    if current_status in ('MAINTENANCE_REQUIRED', 'FAULT', 'MAINTENANCE', 'STOP'):
        insert_hist_sql = """
        INSERT INTO Equipment_Status_History (EquipmentID, Old_Status, New_Status, Duration_Seconds, Changed_At)
        VALUES (?, ?, 'STOPPED', 0, GETDATE());
        """
        ops.append((insert_hist_sql, (equipment_id, current_status)))

    execute_transaction(ops)

    # 3. Log to audit trail
    db_connector.log_user_action(
        user_name=technician,
        user_role="MAINTENANCE_TECH",
        action_name="MAINTENANCE_LOGGED",
        detail=f"Recorded [{t_type}] maintenance for [{eq_code}]. Spare Parts: [{parts}]. Cost: {cost_vnd:,.0f} VND. Reset Runtime: {reset_runtime}"
    )

    logger.info(f"Recorded maintenance event for Equipment [{eq_code}], count incremented.")
    return {
        "status": "success",
        "EquipmentID": equipment_id,
        "EquipmentCode": eq_code,
        "MaintenanceType": m_type,
        "TicketType": t_type,
        "ResetRuntime": reset_runtime
    }


def get_status_history(equipment_id: Optional[int] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieves state transition audit trail from dbo.Equipment_Status_History."""
    if equipment_id:
        sql = f"""
        SELECT TOP {int(limit)}
            h.Hist_ID,
            h.EquipmentID,
            e.EquipmentCode,
            e.EquipmentName,
            h.Old_Status,
            h.New_Status,
            ISNULL(h.Duration_Seconds, 0) AS Duration_Seconds,
            h.Changed_At
        FROM Equipment_Status_History h
        LEFT JOIN Equipment_Master e ON h.EquipmentID = e.EquipmentID
        WHERE h.EquipmentID = ?
        ORDER BY h.Changed_At DESC;
        """
        rows = execute_query(sql, (equipment_id,))
    else:
        sql = f"""
        SELECT TOP {int(limit)}
            h.Hist_ID,
            h.EquipmentID,
            e.EquipmentCode,
            e.EquipmentName,
            h.Old_Status,
            h.New_Status,
            ISNULL(h.Duration_Seconds, 0) AS Duration_Seconds,
            h.Changed_At
        FROM Equipment_Status_History h
        LEFT JOIN Equipment_Master e ON h.EquipmentID = e.EquipmentID
        ORDER BY h.Changed_At DESC;
        """
        rows = execute_query(sql)

    return [_format_row_dates(r) for r in rows]


# ============================================================================
# 3. RUNTIME ACCUMULATION & BACKGROUND TRACKER ENGINE
# ============================================================================

class EquipmentRuntimeEngine:
    """
    Singleton runtime tracker:
    - Tracks elapsed run time for equipments while in RUNNING state.
    - Flushes accumulated runtime increments to dbo.Equipment_Master every 30 seconds.
    - Evaluates Maintenance_Limit_Hours threshold and flags MAINTENANCE_REQUIRED.
    """
    def __init__(self):
        self.lock = asyncio.Lock()
        # equipment_id -> {"status": str, "last_tick": float, "pending_runtime_hours": float}
        self.tracker: Dict[int, Dict[str, Any]] = {}
        self.last_flush_time = time.time()
        self._initialized = False

    async def initialize_from_db(self):
        """Loads current states from database on startup."""
        try:
            items = await asyncio.to_thread(get_all_equipment)
            now = time.time()
            for eq in items:
                eq_id = int(eq["EquipmentID"])
                self.tracker[eq_id] = {
                    "code": eq["EquipmentCode"],
                    "status": str(eq.get("CurrentStatus", "STOP")).upper(),
                    "last_tick": now,
                    "pending_runtime_hours": 0.0,
                    "maintenance_limit": float(eq.get("Maintenance_Limit_Hours", 500.0)),
                    "current_db_runtime": float(eq.get("Runtime_Hours", 0.0))
                }
            self._initialized = True
            logger.info(f"EquipmentRuntimeEngine initialized tracking for {len(self.tracker)} equipment assets.")
        except Exception as e:
            logger.warning(f"Failed to initialize EquipmentRuntimeEngine from DB: {e}")

    async def sync_equipment_status(self, eq_id: int, new_status: str):
        """Synchronizes in-memory status when equipment transitions."""
        async with self.lock:
            if eq_id in self.tracker:
                self.tracker[eq_id]["status"] = str(new_status).upper()
                self.tracker[eq_id]["last_tick"] = time.time()

    async def tick_1s(self):
        """Called every second by the supervisor background worker."""
        if not self._initialized:
            await self.initialize_from_db()
            return

        now = time.time()
        async with self.lock:
            for eq_id, state in self.tracker.items():
                if state["status"] == "RUNNING":
                    elapsed = now - state["last_tick"]
                    if elapsed > 0:
                        # Convert elapsed seconds to hours
                        delta_hours = elapsed / 3600.0
                        state["pending_runtime_hours"] += delta_hours
                state["last_tick"] = now

        # Flush every 30 seconds
        if now - self.last_flush_time >= 30.0:
            self.last_flush_time = now
            await self.flush_to_db()

    async def flush_to_db(self):
        """Flushes pending runtime hours to dbo.Equipment_Master and checks limits."""
        to_flush: List[Tuple[int, float]] = []
        async with self.lock:
            for eq_id, state in self.tracker.items():
                if state["pending_runtime_hours"] > 0:
                    to_flush.append((eq_id, state["pending_runtime_hours"]))
                    state["current_db_runtime"] += state["pending_runtime_hours"]
                    state["pending_runtime_hours"] = 0.0

        if not to_flush:
            return

        def _do_flush():
            for eq_id, hours_inc in to_flush:
                try:
                    update_sql = """
                    UPDATE Equipment_Master
                    SET Runtime_Hours = ISNULL(Runtime_Hours, 0.0) + ?
                    WHERE EquipmentID = ?;
                    """
                    execute_query(update_sql, (float(hours_inc), int(eq_id)))

                    # Check limit
                    check_sql = """
                    SELECT EquipmentCode, Runtime_Hours, Maintenance_Limit_Hours, CurrentStatus
                    FROM Equipment_Master
                    WHERE EquipmentID = ?;
                    """
                    rows = execute_query(check_sql, (int(eq_id),))
                    if rows:
                        r = rows[0]
                        rt = float(r.get("Runtime_Hours", 0.0))
                        limit = float(r.get("Maintenance_Limit_Hours", 500.0))
                        c_status = str(r.get("CurrentStatus", "STOP")).upper()
                        if rt >= limit and c_status != "MAINTENANCE_REQUIRED":
                            logger.warning(f"Equipment [{r.get('EquipmentCode')}] reached limit ({rt:.1f}h >= {limit:.1f}h). Flagging MAINTENANCE_REQUIRED.")
                            update_equipment_status(
                                eq_id, 
                                "MAINTENANCE_REQUIRED", 
                                trigger_source="RUNTIME_LIMIT_WATCHDOG"
                            )
                except Exception as err:
                    logger.error(f"Error flushing runtime for equipment {eq_id}: {err}")

        await asyncio.to_thread(_do_flush)


runtime_engine = EquipmentRuntimeEngine()


# ============================================================================
# 4. TELEMETRY HISTORIAN (dbo.PLC_Datalog)
# ============================================================================

TAG_UNIT_MAPPING: Dict[str, str] = {
    "Temp_Sterilizer_PV": "°C",
    "Tank_Level_PV": "L",
    "Agitator_Speed_PV": "RPM",
    "Temp_Cooling_PV": "°C",
    "Temperature_ACT": "°C",
    "Weight_ACT": "kg",
    "Speed_PV": "RPM",
    "Line1.Flow_Rate": "L/min",
    "Line1.Pressure": "bar",
}


def log_telemetry_point(
    order_code: str,
    tag_name: str,
    value: float,
    unit: Optional[str] = None,
    batch_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    phase_id: Optional[str] = None,
) -> bool:
    """
    Inserts a single telemetry reading into dbo.PLC_Datalog via Store-and-Forward,
    stamped with the ISA-88 batch context (Batch_ID / Unit_ID / Phase_ID).
    """
    try:
        tag_unit = unit or TAG_UNIT_MAPPING.get(tag_name, "")
        if db_engine:
            res = db_engine.log_datalog(
                order_code, tag_name, float(value), tag_unit,
                batch_id=batch_id, unit_id=unit_id, phase_id=phase_id
            )
            return bool(res)
        return db_connector.log_plc_datalog(
            order_code, tag_name, float(value), tag_unit,
            batch_id=batch_id, unit_id=unit_id, phase_id=phase_id
        )
    except Exception as e:
        logger.debug(f"Failed to log telemetry point ({tag_name}): {e}")
        return False


def _unpack_telemetry_record(rec: Tuple[Any, ...]) -> Tuple[str, str, float, str, Optional[str], Optional[str], Optional[str]]:
    """
    Accepts legacy 4-tuples (OrderCode, TagName, Value, Unit) and ISA-88 7-tuples
    (OrderCode, TagName, Value, Unit, Batch_ID, Unit_ID, Phase_ID).
    """
    oc, tag, val, u = rec[0], rec[1], rec[2], rec[3]
    batch_id = rec[4] if len(rec) > 4 else None
    unit_id = rec[5] if len(rec) > 5 else None
    phase_id = db_connector.normalize_isa88_phase_id(rec[6]) if len(rec) > 6 else None
    tag_unit = u or TAG_UNIT_MAPPING.get(tag, "")
    return (
        oc, tag, float(val), tag_unit,
        batch_id or oc,
        unit_id or db_connector.resolve_isa88_unit_id(tag, phase_id),
        phase_id,
    )


def log_telemetry_batch(records: List[Tuple[Any, ...]]) -> bool:
    """Inserts a batch of telemetry readings (4-tuple legacy or 7-tuple ISA-88) via Store-and-Forward."""
    if not records:
        return True
    try:
        unpacked = [_unpack_telemetry_record(r) for r in records]
        if db_engine:
            return db_engine.log_batch(unpacked)
        sql, has_ctx = db_connector.build_plc_datalog_insert_sql()
        ops = []
        for oc, tag, val, tag_unit, b_id, u_id, p_id in unpacked:
            params: tuple = (oc, tag, val, tag_unit)
            if has_ctx:
                params += (b_id, u_id, p_id)
            ops.append((sql, params))
        return execute_transaction(ops, timeout=3)
    except Exception as e:
        logger.debug(f"Failed to log telemetry batch: {e}")
        return False


def get_telemetry_for_order(order_code: Optional[str] = None, limit: int = 1000) -> List[Dict[str, Any]]:
    """
    Retrieves time-series data from dbo.PLC_Datalog for an order.
    If order_code is 'LATEST' or not specified, finds the most recent logged order.
    Includes ISA-88 Batch_ID / Unit_ID / Phase_ID when the schema carries them.
    """
    try:
        if not order_code or order_code.upper() in ("LATEST", "CURRENT", "ACTIVE"):
            find_order_sql = "SELECT TOP 1 OrderCode FROM PLC_Datalog ORDER BY ReadTime DESC;"
            rows = execute_query(find_order_sql)
            if rows and rows[0].get("OrderCode"):
                order_code = rows[0]["OrderCode"]
            else:
                return []

        ctx_cols = ""
        if db_connector.ensure_plc_datalog_isa88_columns():
            ctx_cols = ",\n            Batch_ID,\n            Unit_ID,\n            Phase_ID"

        sql = f"""
        SELECT TOP {int(limit)}
            LogID,
            OrderCode,
            TagName,
            Value,
            ISNULL(Unit, '') AS Unit,
            ReadTime{ctx_cols}
        FROM PLC_Datalog
        WHERE OrderCode = ?
        ORDER BY ReadTime ASC;
        """
        data = execute_query(sql, (order_code,))
        return [_format_row_dates(r) for r in data]
    except Exception as e:
        logger.error(f"Error fetching telemetry for order [{order_code}]: {e}")
        return []


# ============================================================================
# 5. SETPOINT DEVIATION MONITORING (dbo.PLC_Setpoint_Monitoring)
# ============================================================================

def log_setpoint_deviation(
    tag_name: str,
    setpoint_val: float,
    actual_val: float,
    tolerance_pct: float = 5.0
) -> bool:
    """
    Compares setpoint vs actual process value and logs deviation into dbo.PLC_Setpoint_Monitoring.
    """
    try:
        sp = float(setpoint_val)
        act = float(actual_val)
        dev = abs(act - sp) / sp * 100.0 if sp != 0.0 else 0.0
        status = "CONFORMING" if dev <= tolerance_pct else "DEVIATION_ALERT"

        sql = """
        INSERT INTO PLC_Setpoint_Monitoring (TagName, SetpointValue, ActualValue, DeviationPercent, ReadTime, Status)
        VALUES (?, ?, ?, ?, GETDATE(), ?);
        """
        return execute_query(sql, (tag_name, sp, act, round(dev, 2), status), timeout=2)
    except Exception as e:
        logger.debug(f"Failed to log setpoint monitoring for {tag_name}: {e}")
        return False


def get_setpoint_monitoring_logs(limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieves recent setpoint comparisons from dbo.PLC_Setpoint_Monitoring."""
    try:
        sql = f"""
        SELECT TOP {int(limit)}
            LogID,
            TagName,
            SetpointValue,
            ActualValue,
            DeviationPercent,
            ReadTime,
            Status
        FROM PLC_Setpoint_Monitoring
        ORDER BY ReadTime DESC;
        """
        data = execute_query(sql)
        return [_format_row_dates(r) for r in data]
    except Exception as e:
        logger.error(f"Error fetching setpoint monitoring logs: {e}")
        return []
