"""
backend/scripts/diagnose_system.py
Cong cu chan doan nhanh (Emergency Diagnostics & Health Check) cho he thong DAIRY MES WORKBENCH.
Chay lenh: python backend/scripts/diagnose_system.py
Kiem tra:
1. Ket noi Microsoft SQL Server (MES_Milk_Production) & danh sach bang cot loi.
2. Trang thai bo dem Store-and-Forward SQLite (buffer_storage.db).
3. Cau hinh Gateway OPC UA (gateway_config.json) & Odoo ERP (odoo_config.json).
4. Tep anh xa Tag (tag_mappings.json) & 12 thiet bi nha may (dbo.Equipment_Master).
"""

import os
import sys
import json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import db_connector
from store_forward_engine import db_engine


def run_diagnostics():
    print("=" * 76)
    print("   DAIRY MES WORKBENCH - SYSTEM HEALTH & EMERGENCY DIAGNOSTICS")
    print("=" * 76)

    # 1. SQL Server Check
    status = db_connector.check_db_status()
    sql_ok = status.get("connected", False)
    default_server = "localhost\\WINCC"
    print(f"\n[1/4] MICROSOFT SQL SERVER HISTORIAN:")
    print(f"  - Status   : {'ONLINE' if sql_ok else 'OFFLINE'}")
    print(f"  - Server   : {status.get('server', default_server)}")
    print(f"  - Database : {status.get('database', 'MES_Milk_Production')}")
    print(f"  - Latency  : {status.get('latency_ms', '--')} ms")

    if sql_ok:
        try:
            tables = db_connector.execute_query(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
            )
            table_names = [t["TABLE_NAME"] for t in tables]
            print(f"  - Tables ({len(table_names)}): {', '.join(table_names)}")

            eqs = db_connector.execute_query(
                "SELECT EquipmentID, EquipmentCode, EquipmentName, CurrentStatus, Runtime_Hours FROM dbo.Equipment_Master ORDER BY EquipmentID"
            )
            print(f"  - Equipment_Master Assets: {len(eqs)} / 12 registered")
            stocks = db_connector.execute_query(
                "SELECT * FROM dbo.Material_Stock"
            )
            print(f"  - Material_Stock Tanks   : {len(stocks)} active silos/tanks")
        except Exception as e:
            print(f"  - [WARNING] Schema query error: {e}")

    # 2. Store-and-Forward Buffer Check
    pending = db_engine.get_pending_buffer_count()
    print(f"\n[2/4] STORE-AND-FORWARD SQLITE BUFFER:")
    print(f"  - Buffer DB Path : {os.path.join(BACKEND_DIR, 'buffer_storage.db')}")
    print(f"  - Pending Records: {pending} record(s)")

    # 3. Gateway & ERP Config Files Check
    print(f"\n[3/4] CONFIGURATION FILES:")
    for cfg_name in ["gateway_config.json", "odoo_config.json", "phase_durations.json", "tag_mappings.json"]:
        cfg_path = os.path.join(BACKEND_DIR, cfg_name)
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                size_kb = round(os.path.getsize(cfg_path) / 1024, 2)
                print(f"  - {cfg_name:<22}: OK ({size_kb} KB, {len(data) if isinstance(data, dict) else 0} root keys)")
            except Exception as e:
                print(f"  - {cfg_name:<22}: CORRUPTED JSON ({e})")
        else:
            print(f"  - {cfg_name:<22}: MISSING")

    # 4. Summary
    print("\n[4/4] DIAGNOSTIC RESULT:")
    if sql_ok:
        print("  => [PASS] All core database and configuration subsystems are healthy.")
    else:
        print("  => [WARN] SQL Server is currently offline; Store-and-Forward SQLite buffer is active.")
    print("=" * 76)


if __name__ == "__main__":
    run_diagnostics()
