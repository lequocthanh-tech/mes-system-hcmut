"""
Database Connector Module for MES Production System
Connects to Microsoft SQL Server instance localhost\\WINCC (or .\\WINCC)
Database: MES_Milk_Production
Windows Authentication (Trusted_Connection=yes)
ODBC Driver 17 for SQL Server
"""

import pyodbc
import time
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

logger = logging.getLogger("DB_Connector")

# Candidate SQL Server instances
CANDIDATE_SERVERS = [
    r"localhost\WINCC",
    r".\WINCC",
    "localhost",
    "."
]

# Supported ODBC Drivers
DRIVERS = [
    "{ODBC Driver 17 for SQL Server}",
    "{ODBC Driver 18 for SQL Server}",
    "{SQL Server Native Client 11.0}",
    "{SQL Server}"
]

DATABASE_NAME = "MES_Milk_Production"

# Cached working parameters
active_server: Optional[str] = None
active_driver: Optional[str] = None

# Circuit Breaker state
db_offline = False
db_last_attempt_time = 0.0
DB_RETRY_COOLDOWN = 5.0  # Retry cooldown in seconds


def get_connection(timeout: int = 3) -> Optional[pyodbc.Connection]:
    """
    Connects to Microsoft SQL Server using candidate instances and drivers.
    Caches working instance for sub-10ms subsequent queries.
    Gracefully handles reconnects if the SQL service restarts.
    """
    global active_server, active_driver, db_offline, db_last_attempt_time

    now = time.time()
    if db_offline and (now - db_last_attempt_time < DB_RETRY_COOLDOWN):
        return None

    db_last_attempt_time = now

    # 1. Try cached configuration first
    if active_server and active_driver:
        try:
            cs = (
                f"DRIVER={active_driver};"
                f"SERVER={active_server};"
                f"DATABASE={DATABASE_NAME};"
                f"Trusted_Connection=yes;"
                f"TrustServerCertificate=yes;"
                f"Connection Timeout={timeout};"
            )
            conn = pyodbc.connect(cs, timeout=timeout)
            db_offline = False
            return conn
        except Exception as e:
            logger.debug(f"Cached connection to {active_server} failed, probing alternatives: {e}")
            active_server = None
            active_driver = None

    # 2. Probe candidate servers and drivers
    for s in CANDIDATE_SERVERS:
        for d in DRIVERS:
            try:
                cs = (
                    f"DRIVER={d};"
                    f"SERVER={s};"
                    f"DATABASE={DATABASE_NAME};"
                    f"Trusted_Connection=yes;"
                    f"TrustServerCertificate=yes;"
                    f"Connection Timeout={timeout};"
                )
                conn = pyodbc.connect(cs, timeout=timeout)
                active_server = s
                active_driver = d
                db_offline = False
                logger.info(f"Connected to SQL Server [{s}] with driver [{d}] on database [{DATABASE_NAME}]")
                return conn
            except Exception:
                continue

    db_offline = True
    return None


# Primary connection string format specifically required:
# "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\WINCC;DATABASE=MES_Milk_Production;Trusted_Connection=yes;TrustServerCertificate=yes;"
WINCC_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\WINCC;"
    "DATABASE=MES_Milk_Production;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
    "Connection Timeout=2;"
)


def verify_mes_database_status() -> bool:
    """
    Returns True ONLY if:
    1. SQL Server is reachable.
    2. Database 'MES_Milk_Production' can be queried with 'SELECT 1'.
    """
    try:
        conn = get_connection(timeout=2)
        if not conn:
            return False
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        conn.close()
        return bool(row and row[0] == 1)
    except Exception:
        return False


def check_db_status() -> Dict[str, Any]:
    """
    Health Check endpoint utility:
    Executes SELECT 1 test query.
    Returns: { "connected": true, "database": "MES_Milk_Production", "timestamp": "...", "latency_ms": ... }
    """
    t0 = time.perf_counter()
    try:
        conn = get_connection(timeout=2)
        if not conn:
            return {
                "connected": False,
                "status": "disconnected",
                "database": DATABASE_NAME,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "latency_ms": 0,
                "error": f"Database [{DATABASE_NAME}] unreachable on candidate servers"
            }
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        conn.close()
        latency = round((time.perf_counter() - t0) * 1000, 2)
        if row and row[0] == 1:
            return {
                "connected": True,
                "status": "connected",
                "database": DATABASE_NAME,
                "server": active_server or r"localhost\WINCC",
                "driver": active_driver or "{ODBC Driver 17 for SQL Server}",
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "latency_ms": latency
            }
        else:
            return {
                "connected": False,
                "status": "disconnected",
                "database": DATABASE_NAME,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "latency_ms": latency,
                "error": "Query verification failed"
            }
    except Exception as e:
        latency = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "connected": False,
            "status": "disconnected",
            "database": DATABASE_NAME,
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "latency_ms": latency,
            "error": str(e)
        }


def execute_query(query: str, params: Optional[tuple] = None, timeout: int = 3) -> Any:
    """
    Executes a SQL query.
    Returns list of dicts for SELECT queries.
    Commits and returns True for INSERT, UPDATE, DELETE queries.
    """
    conn = get_connection(timeout=timeout)
    if not conn:
        raise ConnectionError("Microsoft SQL Server database is offline")
    try:
        cursor = conn.cursor()
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)

        stripped = query.strip().upper()
        if stripped.startswith("SELECT") or "OUTPUT" in stripped:
            if not cursor.description:
                conn.close()
                return []
            columns = [column[0] for column in cursor.description]
            results = []
            for row in cursor.fetchall():
                results.append(dict(zip(columns, row)))
            conn.close()
            return results
        else:
            conn.commit()
            conn.close()
            return True
    except Exception as e:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        raise e


def execute_transaction(operations: List[Tuple[str, Optional[tuple]]], timeout: int = 5) -> bool:
    """
    Executes multiple SQL operations inside an atomic transaction.
    Rolls back immediately if any statement fails.
    """
    conn = get_connection(timeout=timeout)
    if not conn:
        raise ConnectionError("Microsoft SQL Server database is offline")
    try:
        cursor = conn.cursor()
        for q, p in operations:
            if p:
                cursor.execute(q, p)
            else:
                cursor.execute(q)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except Exception:
                pass
        raise e


def log_user_action(user_name: str, user_role: str, action_name: str, detail: str) -> bool:
    """Writes an interaction into dbo.UserActionLog."""
    try:
        query = """
        INSERT INTO UserActionLog (UserName, UserRole, ActionName, Detail, ActionTime)
        VALUES (?, ?, ?, ?, GETDATE())
        """
        return execute_query(query, (user_name, user_role, action_name, detail), timeout=2)
    except Exception as e:
        logger.warning(f"Failed to log user action: {e}")
        return False


# ============================================================================
# ISA-88 BATCH CONTEXTUALIZATION (dbo.PLC_Datalog: Batch_ID / Unit_ID / Phase_ID)
# ============================================================================
# Every historian record is stamped with the ISA-88 procedural/physical context:
#   Batch_ID -> active OrderCode (control recipe instance)
#   Unit_ID  -> physical ISA-88 unit (dbo.Unit.Unit_Code: TK01, MIX01, HEATER01, ...)
#   Phase_ID -> active recipe phase (STATUS_CURRENT_PHASE, e.g. PH_HEATING)
# Columns are NULLable so legacy rows and legacy writers remain fully valid.

ISA88_CONTEXT_COLUMNS: Tuple[Tuple[str, str], ...] = (
    ("Batch_ID", "NVARCHAR(50) NULL"),
    ("Unit_ID", "NVARCHAR(50) NULL"),
    ("Phase_ID", "NVARCHAR(50) NULL"),
)

# Batch states (dbo.Orders.Status / ISA-88 state model) that allow historian logging.
# HOLDING/HELD keep logging so the hold excursion is part of the batch record.
ISA88_LOGGABLE_BATCH_STATES: Tuple[str, ...] = ("RUNNING", "HOLDING", "HELD")

# Numeric STATUS_CURRENT_PHASE codes (PLC phase pointer) -> canonical phase IDs
ISA88_PHASE_CODE_MAP: Dict[int, str] = {
    0: "PH_IDLE",
    1: "PH_SUPPLYMILK",
    2: "PH_SUPPLYSUGAR",
    3: "PH_SUPPLYADDITIVE",
    4: "PH_MIXING",
    5: "PH_HEATING",
    6: "PH_COOLING",
    7: "PH_DISCHARGE",
}

# Siemens PM-CONTROL / PCS 7 phase aliases -> canonical ISA-88 phase IDs
ISA88_PHASE_ALIASES: Dict[str, str] = {
    "PH11101": "PH_SUPPLYMILK", "PH_SUPPLYMILK_PC2": "PH_SUPPLYMILK",
    "PH11202": "PH_SUPPLYSUGAR", "PH_SUPPLYSUGAR_PC2": "PH_SUPPLYSUGAR",
    "PH11303": "PH_SUPPLYADDITIVE",
    "PH12101": "PH_MIXING", "PH_AGITATE": "PH_MIXING", "PH_AGITATING": "PH_MIXING", "PH_AGITATE_PC2": "PH_MIXING",
    "PH12202": "PH_MIXING", "PH_CIRCULATE": "PH_MIXING",
    "PH22101": "PH_HEATING", "PH_HEAT": "PH_HEATING", "PH_HEAT_PC2": "PH_HEATING",
    "PH22102": "PH_HEATING", "PH_HOLD_TEMP": "PH_HEATING", "PH_STERILIZATION": "PH_HEATING",
    "PH22201": "PH_COOLING", "PH_CHILL": "PH_COOLING", "PH_CHILL_PC2": "PH_COOLING",
    "PH12303": "PH_DISCHARGE", "PH_TRANSFER_MIX": "PH_DISCHARGE",
    "PH22202": "PH_DISCHARGE", "PH_TRANSFER_OUT": "PH_DISCHARGE",
}

# Phase -> executing ISA-88 unit (used when a tag itself does not identify a unit)
ISA88_PHASE_UNIT_MAP: Dict[str, str] = {
    "PH_SUPPLYMILK": "MIX01",
    "PH_SUPPLYSUGAR": "MIX01",
    "PH_SUPPLYADDITIVE": "MIX01",
    "PH_DOSING": "MIX01",
    "PH_MIXING": "MIX01",
    "PH_HEATING": "HEATER01",
    "PH_COOLING": "COOLER01",
    "PH_DISCHARGE": "OUT01",
}

# Ordered tag-name patterns -> unit (first match wins; most specific first)
_ISA88_TAG_UNIT_PATTERNS: Tuple[Tuple[Tuple[str, ...], str], ...] = (
    (("TANK-01", "TANK_01", "TK01", "SILO01"), "TK01"),
    (("TANK-02", "TANK_02", "TK02", "SILO02"), "TK02"),
    (("TANK-03", "TANK_03", "TK03", "SILO03"), "TK03"),
    (("WEIGH1", "WEIGH01", "WEIGH_1"), "WEIGH01"),
    (("WEIGH2", "WEIGH02", "WEIGH_2"), "WEIGH02"),
    (("WEIGH3", "WEIGH03", "WEIGH_3"), "WEIGH03"),
    (("OUT_WEIGHT", "OUT01", "DISCHARGE", "FINISHED"), "OUT01"),
    (("COOL", "CHILL", "COLD"), "COOLER01"),
    (("HEAT", "STERIL", "UHT", "PASTEUR", "SSR"), "HEATER01"),
    (("MIX", "AGITAT", "MOTOR_SPEED"), "MIX01"),
)

ISA88_PROCESS_CELL_ID = "Milk_Production_Cell_01"

# Runtime flag: True once dbo.PLC_Datalog is verified to carry the ISA-88 columns
PLC_DATALOG_ISA88_READY: bool = False
_isa88_last_check_time: float = 0.0


def normalize_isa88_phase_id(raw_phase: Any) -> Optional[str]:
    """
    Normalizes a raw STATUS_CURRENT_PHASE value (int pointer, PCS 7 step name,
    or PH_* string) to a canonical ISA-88 Phase_ID. Returns None when unknown/idle.
    """
    if raw_phase is None or isinstance(raw_phase, bool):
        return None
    if isinstance(raw_phase, (int, float)):
        code = int(raw_phase)
        phase = ISA88_PHASE_CODE_MAP.get(code)
        return None if (phase is None or phase == "PH_IDLE") else phase
    text = str(raw_phase).strip().upper().replace(" ", "_")
    if not text or text in ("NONE", "NULL", "--", "IDLE", "PH_IDLE"):
        return None
    if text.isdigit():
        return normalize_isa88_phase_id(int(text))
    if text in ISA88_PHASE_ALIASES:
        return ISA88_PHASE_ALIASES[text]
    if not text.startswith("PH_"):
        text = f"PH_{text}"
    return ISA88_PHASE_ALIASES.get(text, text)


def resolve_isa88_unit_id(tag_name: Optional[str], phase_id: Optional[str] = None) -> str:
    """
    Resolves the ISA-88 physical Unit_ID for a telemetry tag.
    1. Tag name identifies its unit (e.g. TANK_02_LEVEL -> TK02, Mixing_Temp_PV -> MIX01).
    2. Otherwise the unit executing the active phase (PH_HEATING -> HEATER01).
    3. Otherwise the process cell itself (cell-level / shared tags).
    """
    name = str(tag_name or "").upper()
    for patterns, unit in _ISA88_TAG_UNIT_PATTERNS:
        if any(p in name for p in patterns):
            return unit
    if phase_id and phase_id in ISA88_PHASE_UNIT_MAP:
        return ISA88_PHASE_UNIT_MAP[phase_id]
    return ISA88_PROCESS_CELL_ID


def ensure_plc_datalog_isa88_columns(force: bool = False) -> bool:
    """
    Startup auto-migration: guarantees dbo.PLC_Datalog carries Batch_ID / Unit_ID / Phase_ID.
    Additive and idempotent (ALTER TABLE ... ADD NULL only); never rewrites existing rows.
    Re-probes at most every 60s while the database is unreachable.
    """
    global PLC_DATALOG_ISA88_READY, _isa88_last_check_time
    if PLC_DATALOG_ISA88_READY and not force:
        return True
    now = time.time()
    if not force and (now - _isa88_last_check_time) < 60.0:
        return PLC_DATALOG_ISA88_READY
    _isa88_last_check_time = now

    conn = get_connection(timeout=3)
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT OBJECT_ID('dbo.PLC_Datalog', 'U')")
        row = cursor.fetchone()
        if not row or row[0] is None:
            return False
        for col_name, col_spec in ISA88_CONTEXT_COLUMNS:
            cursor.execute(f"""
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PLC_Datalog') AND name = '{col_name}')
                ALTER TABLE dbo.PLC_Datalog ADD {col_name} {col_spec};
            """)
        # Batch-scoped retrieval index for EBR / BatchML serialization
        cursor.execute("""
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PLC_Datalog_Batch_Phase' AND object_id = OBJECT_ID('dbo.PLC_Datalog'))
            CREATE NONCLUSTERED INDEX IX_PLC_Datalog_Batch_Phase ON dbo.PLC_Datalog (Batch_ID, Phase_ID, ReadTime);
        """)
        conn.commit()
        PLC_DATALOG_ISA88_READY = True
        logger.info("[ISA-88] dbo.PLC_Datalog batch context columns verified (Batch_ID, Unit_ID, Phase_ID).")
        return True
    except Exception as e:
        logger.warning(f"[ISA-88] PLC_Datalog context migration notice: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        try:
            conn.close()
        except Exception:
            pass


def build_plc_datalog_insert_sql(with_read_time_param: bool = False) -> Tuple[str, bool]:
    """
    Returns (INSERT statement, has_isa88_context) matching the verified PLC_Datalog schema.
    Parameter order: OrderCode, TagName, Value, Unit, [ReadTime], [Batch_ID, Unit_ID, Phase_ID]
    """
    ready = ensure_plc_datalog_isa88_columns()
    time_col_val = "?" if with_read_time_param else "GETDATE()"
    if ready:
        return (
            "INSERT INTO dbo.PLC_Datalog (OrderCode, TagName, Value, Unit, ReadTime, Batch_ID, Unit_ID, Phase_ID) "
            f"VALUES (?, ?, ?, ?, {time_col_val}, ?, ?, ?)",
            True,
        )
    return (
        "INSERT INTO dbo.PLC_Datalog (OrderCode, TagName, Value, Unit, ReadTime) "
        f"VALUES (?, ?, ?, ?, {time_col_val})",
        False,
    )


def log_plc_datalog(
    order_code: str,
    tag_name: str,
    value: float,
    unit: Optional[str] = None,
    batch_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    phase_id: Optional[str] = None,
) -> bool:
    """Writes a telemetry snapshot into dbo.PLC_Datalog (with ISA-88 batch context when available)."""
    try:
        tag_unit = unit or ""
        query, has_ctx = build_plc_datalog_insert_sql()
        params: tuple = (order_code, tag_name, float(value), tag_unit)
        if has_ctx:
            norm_phase = normalize_isa88_phase_id(phase_id)
            params += (
                batch_id or order_code,
                unit_id or resolve_isa88_unit_id(tag_name, norm_phase),
                norm_phase,
            )
        return execute_query(query, params, timeout=2)
    except Exception as e:
        logger.debug(f"Failed to log PLC datalog: {e}")
        return False


def update_tank_stock(
    material_code: str,
    quantity: Optional[float] = None,
    current_stock: Optional[float] = None,
    tank_id: Optional[str] = None,
    mode: str = "add",
    material_name: Optional[str] = None,
    remark: str = "",
    user: str = "Warehouse_Officer"
) -> Dict[str, Any]:
    """
    Directly updates physical tank inventory in dbo.Material_Stock.
    Strictly executes parameterized UPDATE and calls conn.commit() immediately.
    """
    conn = get_connection(timeout=3)
    if not conn:
        raise ConnectionError("Microsoft SQL Server database is offline")
    
    conn.autocommit = False
    cursor = conn.cursor()
    try:
        mat = (material_code or "").strip().upper()
        tank = (tank_id or "").strip().upper()

        if mode == "set" or (current_stock is not None and quantity is None):
            target_stock = float(current_stock if current_stock is not None else quantity)
            cursor.execute("""
                UPDATE dbo.Material_Stock
                SET CurrentStock = ?,
                    Last_Update = GETDATE()
                WHERE UPPER(Material_Code) = ? OR UPPER(AssignedTank) = ?;
            """, (target_stock, mat, tank))
        else:
            add_qty = float(quantity if quantity is not None else 0.0)
            cursor.execute("""
                UPDATE dbo.Material_Stock
                SET CurrentStock = CurrentStock + ?,
                    Total_Quantity = Total_Quantity + ?,
                    Last_Update = GETDATE()
                WHERE UPPER(Material_Code) = ? OR UPPER(AssignedTank) = ?;
            """, (add_qty, add_qty, mat, tank))
            
            if add_qty > 0:
                m_name = material_name or mat
                cursor.execute("""
                    INSERT INTO dbo.Material_Input (Material_Code, Material_Name, Quantity, Input_Time, Remark)
                    VALUES (?, ?, ?, GETDATE(), ?);
                """, (mat, m_name, add_qty, remark))

        # Explicitly call conn.commit() immediately after execution to guarantee persistence to disk
        conn.commit()

        # Fetch updated record
        cursor.execute("""
            SELECT Material_Code, Material_Name, AssignedTank, CurrentStock, TankCapacity, Unit, MinSafetyThreshold, Last_Update
            FROM dbo.Material_Stock
            WHERE UPPER(Material_Code) = ? OR UPPER(AssignedTank) = ?;
        """, (mat, tank))
        row = cursor.fetchone()
        res = {}
        if row:
            res = {
                "material_code": row[0],
                "material_name": row[1],
                "assigned_tank": row[2],
                "current_stock": float(row[3] or 0.0),
                "tank_capacity": float(row[4] or 5.0),
                "unit": row[5] or "L",
                "min_threshold": float(row[6] or 0.5),
                "last_update": str(row[7] or "")
            }
        cursor.close()
        conn.close()
        return res
    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except Exception:
                pass
        raise e


