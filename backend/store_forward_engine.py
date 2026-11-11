import sqlite3
import pyodbc
import time
import os
import threading
import logging
from datetime import datetime
from typing import Optional, List, Tuple, Any

logger = logging.getLogger("StoreForwardEngine")

try:
    from . import db_connector
except (ImportError, ValueError):
    import db_connector

# Chuỗi kết nối trực tiếp vào SQL Server của máy bạn
SQL_SERVER_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\WINCC;"
    "DATABASE=MES_Milk_Production;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
    "Connection Timeout=2;"
)

# File cơ sở dữ liệu đệm SQLite sẽ nằm cùng thư mục backend
BUFFER_DB_PATH = os.path.join(os.path.dirname(__file__), "buffer_storage.db")

# ISA-88 batch context columns carried through the store-and-forward buffer
ISA88_BUFFER_COLUMNS = ("Batch_ID", "Unit_ID", "Phase_ID")


class StoreAndForwardEngine:
    """
    Store-and-Forward Engine with SQLite3 Fallback:
    - Buffers real-time telemetry into SQLite (buffer_storage.db) when Microsoft SQL Server is offline.
    - Employs SQLite WAL (Write-Ahead Logging) mode for concurrent lock-free reads and writes.
    - Automatically recovers and drains the buffer FIFO in batches when SQL Server reconnects.
    """

    def __init__(self):
        self.is_sql_online = False
        self.lock = threading.Lock()
        self._last_sql_attempt = 0.0
        self._sql_cooldown_seconds = 3.0

        self._init_sqlite_buffer()

        # Probe initial connection state
        conn = self.get_sql_connection()
        if conn:
            try:
                conn.close()
            except Exception:
                pass

        # Khởi chạy luồng ngầm tự động thăm dò và đẩy bù dữ liệu khi SQL phục hồi
        self.sync_thread = threading.Thread(target=self._recovery_and_flush_worker, daemon=True)
        self.sync_thread.start()

    def _init_sqlite_buffer(self):
        """Khởi tạo bảng đệm trong file SQLite nếu chưa có, tối ưu hóa WAL mode"""
        try:
            with sqlite3.connect(BUFFER_DB_PATH, timeout=5.0) as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS buffer_plc_datalog (
                        buffer_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        OrderCode TEXT,
                        TagName TEXT NOT NULL,
                        Value REAL NOT NULL,
                        Unit TEXT,
                        ReadTime TEXT NOT NULL,
                        Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # ISA-88 batch context auto-migration (additive, keeps pending buffered rows intact)
                cursor.execute("PRAGMA table_info(buffer_plc_datalog)")
                existing_cols = {row[1] for row in cursor.fetchall()}
                for col_name in ISA88_BUFFER_COLUMNS:
                    if col_name not in existing_cols:
                        cursor.execute(f"ALTER TABLE buffer_plc_datalog ADD COLUMN {col_name} TEXT")

                # Index for high-speed FIFO retrieval and purge
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_buffer_id_asc ON buffer_plc_datalog(buffer_id ASC)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_buffer_order_tag ON buffer_plc_datalog(OrderCode, TagName)
                """)
                conn.commit()
                logger.info(f"[StoreAndForward] SQLite buffer initialized at {BUFFER_DB_PATH} (WAL mode active)")
        except Exception as exc:
            logger.error(f"[StoreAndForward] Failed to initialize SQLite buffer: {exc}")

    def get_sql_connection(self, force: bool = False) -> Optional[pyodbc.Connection]:
        """
        Kiểm tra và lấy kết nối đến Microsoft SQL Server với cơ chế Circuit Breaker:
        Nếu SQL đang offline, không chặn luồng (cooldown 3s), lập tức rẽ nhánh sang SQLite buffer.
        """
        now = time.time()
        if not force and not self.is_sql_online and (now - self._last_sql_attempt < self._sql_cooldown_seconds):
            return None

        self._last_sql_attempt = now
        try:
            conn = db_connector.get_connection(timeout=2)
            if conn:
                self.is_sql_online = True
                return conn
        except Exception:
            pass

        self.is_sql_online = False
        return None

    @classmethod
    def get_pending_buffer_count(cls) -> int:
        """
        Đếm số bản ghi đang chờ trong bộ đệm SQLite.
        Hỗ trợ gọi cả từ class (StoreAndForwardEngine.get_pending_buffer_count())
        lẫn từ instance (db_engine.get_pending_buffer_count()).
        """
        try:
            with sqlite3.connect(BUFFER_DB_PATH, timeout=2.0) as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM buffer_plc_datalog")
                row = cur.fetchone()
                return int(row[0]) if row else 0
        except Exception as exc:
            logger.debug(f"[StoreAndForward] Error querying pending buffer count: {exc}")
            return 0

    def log_batch(self, records: List[Tuple[Any, ...]]) -> bool:
        """
        Ghi một danh sách bản ghi telemetry:
        records: list of (order_code, tag_name, value, unit, [read_time, batch_id, unit_id, phase_id])
        - Nếu SQL Server online: ghi vào SQL Server (executemany).
        - Nếu SQL Server offline: ghi vào SQLite trong 1 transaction (<2ms).
        """
        if not records:
            return True

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prepared: List[Tuple[str, str, float, str, str, str, str, Optional[str]]] = []

        for r in records:
            oc = str(r[0]) if r[0] is not None else ""
            tag = str(r[1])
            try:
                val = float(r[2]) if r[2] is not None else 0.0
            except (ValueError, TypeError):
                val = 0.0
            u = str(r[3]) if len(r) > 3 and r[3] is not None else ""

            # Check if 5th parameter is read_time or batch_id
            if len(r) > 4 and isinstance(r[4], str) and ("-" in r[4] or ":" in r[4]) and len(r[4]) >= 10:
                rt = r[4]
                b_id = str(r[5]) if len(r) > 5 and r[5] else oc
                u_id = str(r[6]) if len(r) > 6 and r[6] else None
                p_id = r[7] if len(r) > 7 else None
            else:
                rt = now_str
                b_id = str(r[4]) if len(r) > 4 and r[4] else oc
                u_id = str(r[5]) if len(r) > 5 and r[5] else None
                p_id = r[6] if len(r) > 6 else None

            norm_p = db_connector.normalize_isa88_phase_id(p_id)
            c_batch = b_id or oc
            c_unit = u_id or db_connector.resolve_isa88_unit_id(tag, norm_p)
            prepared.append((oc, tag, val, u, rt, c_batch, c_unit, norm_p))

        # 1. Try SQL Server direct write
        conn = self.get_sql_connection()
        if conn:
            try:
                insert_sql, has_ctx = db_connector.build_plc_datalog_insert_sql(with_read_time_param=True)
                cursor = conn.cursor()
                if has_ctx:
                    sql_params = prepared
                else:
                    sql_params = [(p[0], p[1], p[2], p[3], p[4]) for p in prepared]

                cursor.executemany(insert_sql, sql_params)
                conn.commit()
                conn.close()
                return True
            except Exception as exc:
                logger.debug(f"[StoreAndForward] SQL direct batch insert failed ({exc}), falling back to SQLite.")
                try:
                    conn.close()
                except Exception:
                    pass
                self.is_sql_online = False

        # 2. SQL Server offline -> Buffer into SQLite buffer in ONE atomic transaction
        with self.lock:
            try:
                with sqlite3.connect(BUFFER_DB_PATH, timeout=5.0) as sqlite_conn:
                    cur = sqlite_conn.cursor()
                    cur.executemany(
                        "INSERT INTO buffer_plc_datalog (OrderCode, TagName, Value, Unit, ReadTime, Batch_ID, Unit_ID, Phase_ID) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        prepared
                    )
                    sqlite_conn.commit()
                return True
            except Exception as b_exc:
                logger.error(f"[StoreAndForward] Failed to buffer batch to SQLite: {b_exc}")
                return False

    def log_datalog(
        self,
        order_code: str,
        tag_name: str,
        value: float,
        unit: str = "°C",
        read_time: str = None,
        batch_id: str = None,
        unit_id: str = None,
        phase_id: str = None,
    ) -> str:
        """
        Ghi dữ liệu vận hành đơn lẻ:
        - Nếu SQL Server chạy: Ghi thẳng vào SQL Server.
        - Nếu SQL Server tắt/mất kết nối: Tự động rẽ nhánh ghi vào SQLite buffer.
        """
        rec = (order_code, tag_name, value, unit, read_time, batch_id, unit_id, phase_id)
        if self.is_sql_online:
            success = self.log_batch([rec])
            return "INSERTED_SQL_SERVER" if success and self.is_sql_online else "BUFFERED_SQLITE"
        else:
            self.log_batch([rec])
            return "BUFFERED_SQLITE"

    def _flush_buffer_to_sql_server(self, sql_conn: Optional[pyodbc.Connection]) -> int:
        """
        Đọc từ SQLite đẩy vào SQL Server theo thứ tự thời gian (FIFO)
        bằng executemany theo batch 100 dòng rồi xóa buffer.
        Trả về tổng số dòng đã xả thành công.
        """
        if not sql_conn:
            return 0

        total_flushed = 0
        with self.lock:
            try:
                with sqlite3.connect(BUFFER_DB_PATH, timeout=5.0) as sqlite_conn:
                    s_cur = sqlite_conn.cursor()
                    s_cur.execute(
                        "SELECT buffer_id, OrderCode, TagName, Value, Unit, ReadTime, Batch_ID, Unit_ID, Phase_ID "
                        "FROM buffer_plc_datalog ORDER BY buffer_id ASC LIMIT 500"
                    )
                    rows = s_cur.fetchall()

                    if not rows:
                        return 0

                    sql_cursor = sql_conn.cursor()
                    chunk_size = 100
                    insert_sql, has_ctx = db_connector.build_plc_datalog_insert_sql(with_read_time_param=True)

                    for i in range(0, len(rows), chunk_size):
                        chunk = rows[i:i + chunk_size]
                        if has_ctx:
                            batch_params = [
                                (r[1], r[2], r[3], r[4], r[5], r[6] or r[1], r[7], r[8])
                                for r in chunk
                            ]
                        else:
                            batch_params = [(r[1], r[2], r[3], r[4], r[5]) for r in chunk]
                        chunk_buffer_ids = [r[0] for r in chunk]

                        try:
                            sql_cursor.executemany(insert_sql, batch_params)
                            sql_conn.commit()

                            # Xóa các dòng đã đồng bộ thành công khỏi SQLite
                            del_placeholders = ",".join("?" for _ in chunk_buffer_ids)
                            s_cur.execute(f"DELETE FROM buffer_plc_datalog WHERE buffer_id IN ({del_placeholders})", chunk_buffer_ids)
                            sqlite_conn.commit()
                            total_flushed += len(chunk_buffer_ids)
                        except Exception as chunk_exc:
                            logger.error(f"[StoreAndForward] SQL commit chunk failed: {chunk_exc}")
                            try:
                                sql_conn.rollback()
                            except Exception:
                                pass
                            self.is_sql_online = False
                            break
            except Exception as flush_err:
                logger.error(f"[StoreAndForward] Buffer flush error: {flush_err}")

        return total_flushed

    def _recovery_and_flush_worker(self):
        """
        Tiến trình ngầm: Quét mỗi 3-5 giây.
        Nếu có dữ liệu đệm trong SQLite và SQL Server online, tự động xả toàn bộ buffer vào SQL Server.
        """
        while True:
            try:
                time.sleep(3)
                pending_count = self.get_pending_buffer_count()
                if pending_count == 0:
                    continue

                sql_conn = self.get_sql_connection()
                if sql_conn:
                    logger.info(f"[StoreAndForward] SQL Server online. Flushing {pending_count} buffered records...")
                    while pending_count > 0:
                        flushed = self._flush_buffer_to_sql_server(sql_conn)
                        if flushed <= 0:
                            break
                        new_pending = self.get_pending_buffer_count()
                        if new_pending >= pending_count:
                            break
                        pending_count = new_pending

                    logger.info(f"[StoreAndForward] Buffer flush cycle finished. Remaining pending: {self.get_pending_buffer_count()}")
                    try:
                        sql_conn.close()
                    except Exception:
                        pass
            except Exception as worker_exc:
                logger.debug(f"[StoreAndForward] Worker tick exception: {worker_exc}")


# Canonical global singleton engine
db_engine = StoreAndForwardEngine()
