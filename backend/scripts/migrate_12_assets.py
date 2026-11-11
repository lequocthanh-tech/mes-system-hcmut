"""
backend/scripts/migrate_12_assets.py
Cong cu khoi tao / dong bo chuan 12 thiet bi nha may trong bang dbo.Equipment_Master
va dam bao day du cac cot trong dbo.Equipment_Maintenance.
Chay lenh: python backend/scripts/migrate_12_assets.py
"""

import sys
import os

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import db_connector as dbc


def run_migration():
    conn = dbc.get_connection()
    if not conn:
        print("[ERROR] Cannot connect to SQL Server.")
        return
    cursor = conn.cursor()

    # 1. Ensure Equipment_Maintenance columns exist
    maint_cols = [
        ("Equipment_Code", "NVARCHAR(50) NULL"),
        ("Ticket_Type", "NVARCHAR(50) NULL"),
        ("Action_Taken", "NVARCHAR(255) NULL"),
        ("Spare_Parts_Used", "NVARCHAR(255) NULL"),
        ("Serviced_At", "DATETIME NULL"),
        ("Reset_Runtime_Flag", "BIT DEFAULT 1"),
        ("Remarks", "NVARCHAR(500) NULL"),
    ]
    for col, col_type in maint_cols:
        cursor.execute(f"""
            IF COL_LENGTH('dbo.Equipment_Maintenance', '{col}') IS NULL
            ALTER TABLE dbo.Equipment_Maintenance ADD {col} {col_type};
        """)
    conn.commit()
    print("[1/4] dbo.Equipment_Maintenance columns verified.")

    # 2. Ensure Equipment_Master columns exist
    eq_cols = [
        ("Equipment_Code", "NVARCHAR(50) NULL"),
        ("Equipment_Name", "NVARCHAR(150) NULL"),
        ("RatedCurrent", "REAL NULL DEFAULT 10.0"),
        ("MaxVibrationThreshold", "REAL NULL DEFAULT 4.5"),
        ("MaxTempThreshold", "REAL NULL DEFAULT 75.0"),
        ("Notes", "NVARCHAR(500) NULL"),
        ("Last_Update", "DATETIME NULL DEFAULT GETDATE()"),
        ("MaintenanceLimit_Hours", "REAL NULL DEFAULT 500.0"),
        ("RatedSpeed", "REAL NULL"),
        ("DesignFlow", "REAL NULL"),
        ("DesignTemp", "REAL NULL")
    ]
    for col, col_type in eq_cols:
        cursor.execute(f"""
            IF COL_LENGTH('dbo.Equipment_Master', '{col}') IS NULL
            ALTER TABLE dbo.Equipment_Master ADD {col} {col_type};
        """)
    conn.commit()
    print("[2/4] dbo.Equipment_Master columns verified.")

    # 3. 12 Physical Plant Assets definition
    assets = [
        (1, 'PUMP_INLET_MILK', 'Bơm nạp sữa tươi (Bơm 1)', 'Dosing Pump', 'Line 1 - Raw Milk Intake', None, 100.0, None, 500.0, 'Bơm nạp nguyên liệu sữa tươi P-101 (PH11101)'),
        (2, 'PUMP_INLET_SUGAR', 'Bơm nạp đường (Bơm 2)', 'Dosing Pump', 'Line 1 - Sugar Intake', None, 50.0, None, 500.0, 'Bơm định lượng siro đường P-102 (PH11202)'),
        (3, 'PUMP_INLET_ADDITIVE', 'Bơm nạp phụ gia (Bơm 3)', 'Micro Dosing Pump', 'Line 1 - Additive Intake', None, 20.0, None, 500.0, 'Bơm vi lượng phụ gia P-103 (PH11303)'),
        (4, 'AGITATOR_MIX', 'Động cơ khuấy bồn trộn', 'Impeller Agitator', 'Line 1 - Mixing Unit', 120.0, None, None, 500.0, 'Động cơ khuấy đồng hóa bồn trộn (PH12101)'),
        (5, 'PUMP_OUTLET', 'Bơm xả thành phẩm ra bồn đệm', 'Transfer Pump', 'Line 1 - Discharge Line', None, 100.0, None, 500.0, 'Bơm xả thành phẩm ra bồn đệm P-203 (PH22202)'),
        (6, 'HEATER_UHT', 'Cụm gia nhiệt tiệt trùng UHT', 'Thermal Exchanger', 'Line 1 - UHT Pasteurizer', None, None, 138.0, 500.0, 'Cụm điện trở gia nhiệt tiệt trùng UHT H-201 (PH22101)'),
        (7, 'CHILLER_COOL', 'Cụm giải nhiệt làm lạnh sốc', 'Plate Heat Exchanger', 'Line 1 - Rapid Chiller', None, None, 4.0, 500.0, 'Bộ trao đổi nhiệt làm lạnh sốc C-202 (PH22201)'),
        (8, 'VALVE_INLET_MILK', 'Van nạp sữa bồn trộn', 'Control Valve', 'Line 1 - Raw Milk Intake', None, None, None, 500.0, 'Van điều khiển nạp sữa tươi V-101 (PH11102)'),
        (9, 'VALVE_INLET_SUGAR', 'Van nạp đường bồn trộn', 'Control Valve', 'Line 1 - Sugar Intake', None, None, None, 500.0, 'Van điều khiển nạp siro đường V-102 (PH11203)'),
        (10, 'VALVE_INLET_ADDITIVE', 'Van nạp phụ gia bồn trộn', 'Control Valve', 'Line 1 - Additive Intake', None, None, None, 500.0, 'Van vi lượng phụ gia V-103 (PH11304)'),
        (11, 'VALVE_OUTLET_MIX', 'Van xả đáy bồn trộn', 'Bottom Outlet Valve', 'Line 1 - Mixing Unit', None, None, None, 500.0, 'Van xả đáy xả thành phẩm V-201 (PH12102)'),
        (12, 'VALVE_CIP_RECYCLE', 'Van tuần hoàn CIP/vệ sinh', 'CIP Bypass Valve', 'Line 1 - CIP Station', None, None, None, 500.0, 'Van tuần hoàn hệ thống CIP vệ sinh V-301 (PH13101)')
    ]

    cursor.execute("SELECT EquipmentID, EquipmentCode, Runtime_Hours, TotalStarts, CurrentStatus FROM dbo.Equipment_Master")
    current_rows = cursor.fetchall()
    saved_runtimes = {}
    for row in current_rows:
        code_up = str(row[1]).upper()
        saved_runtimes[code_up] = (float(row[2] or 0.0), int(row[3] or 0), str(row[4] or 'STOPPED'))

    cursor.execute("DELETE FROM dbo.Equipment_Master")
    cursor.execute("SET IDENTITY_INSERT dbo.Equipment_Master ON")
    for eq_id, code, name, eq_type, loc, speed, flow, temp, m_limit, notes in assets:
        prev_rt, prev_starts, prev_st = saved_runtimes.get(code, (0.0, 0, 'STOPPED'))
        status = prev_st if prev_st in ('RUNNING', 'STOPPED', 'FAULT', 'MAINTENANCE', 'STOP') else 'STOPPED'
        if status == 'STOP':
            status = 'STOPPED'
        cursor.execute("""
            INSERT INTO dbo.Equipment_Master (
                EquipmentID, EquipmentCode, EquipmentName, EquipmentType, Location,
                CurrentStatus, Runtime_Hours, TotalStarts, Maintenance_Limit_Hours,
                MaintenanceLimit_Hours, RatedSpeed, DesignFlow, DesignTemp, Notes,
                RatedCurrent, MaxVibrationThreshold, MaxTempThreshold,
                Created_At, Last_Update
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                10.0, 4.5, 75.0,
                GETDATE(), GETDATE()
            )
        """, (eq_id, code, name, eq_type, loc, status, prev_rt, prev_starts, m_limit, m_limit, speed, flow, temp, notes))
    cursor.execute("SET IDENTITY_INSERT dbo.Equipment_Master OFF")
    conn.commit()
    print("[3/4] dbo.Equipment_Master seeded with exact 12 plant assets.")

    cursor.execute("""
        DELETE FROM dbo.Tag_Config 
        WHERE Module = 'maintenance' 
          AND (OpcNodeId LIKE '%Simulation%' OR OpcNodeId LIKE '%Line1%')
    """)
    conn.commit()
    print("[4/4] dbo.Tag_Config cleansed of simulation tags.")

    conn.close()
    print("Migration successfully completed!")


if __name__ == "__main__":
    run_migration()
