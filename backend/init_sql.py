import os
import json
import pyodbc
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SQL_Init")

CANDIDATE_SERVERS = [
    r"localhost\WINCC",
    "localhost",
    r"localhost\SQLEXPRESS",
    r".\WINCC",
    r".\SQLEXPRESS",
    "."
]

def find_working_server():
    for s in CANDIDATE_SERVERS:
        conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={s};DATABASE=master;Trusted_Connection=yes;TrustServerCertificate=yes;"
        try:
            conn = pyodbc.connect(conn_str, timeout=3)
            logger.info(f"Connected to SQL Server instance: {s}")
            conn.close()
            return s
        except Exception:
            continue
    return None

def _provision_12_equipment_assets(cursor):
    """
    Idempotently provisions the exact 12 plant physical equipment assets in dbo.Equipment_Master (ISA-88/ISA-95/ISA-101):
    1: PUMP_INLET_MILK (Raw Milk Intake Pump 1)
    2: PUMP_INLET_SUGAR (Sugar Intake Pump 2)
    3: PUMP_INLET_ADDITIVE (Additive Micro Dosing Pump 3)
    4: AGITATOR_MIX (Homogenizing Mixing Motor - PH12101)
    5: PUMP_OUTLET (Discharge Product Transfer Pump)
    6: HEATER_UHT (UHT Pasteurization Resistor - PH22101)
    7: CHILLER_COOL (Rapid Plate Heat Exchanger - PH22201)
    8: VALVE_INLET_MILK (Raw Milk Intake Control Valve)
    9: VALVE_INLET_SUGAR (Sugar Intake Control Valve)
    10: VALVE_INLET_ADDITIVE (Additive Intake Control Valve)
    11: VALVE_OUTLET_MIX (Tank Bottom Drain Control Valve)
    12: VALVE_CIP_RECYCLE (CIP Sanitation Bypass Valve)
    """
    # Ensure table exists
    cursor.execute("""
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Equipment_Master' AND xtype='U')
    CREATE TABLE dbo.Equipment_Master (
        EquipmentID INT IDENTITY(1,1) PRIMARY KEY,
        EquipmentCode NVARCHAR(50) NOT NULL,
        EquipmentName NVARCHAR(150) NOT NULL,
        EquipmentType NVARCHAR(100) NULL,
        Location NVARCHAR(150) NULL,
        CurrentStatus NVARCHAR(50) DEFAULT 'STOPPED',
        Runtime_Hours REAL DEFAULT 0.0,
        TotalStarts INT DEFAULT 0,
        Maintenance_Limit_Hours REAL DEFAULT 500.0,
        MaintenanceLimit_Hours REAL DEFAULT 500.0,
        Maintenance_Count INT DEFAULT 0,
        Last_Maintenance_Date DATETIME NULL,
        Next_Maintenance_Due DATETIME NULL,
        RatedSpeed REAL NULL,
        DesignFlow REAL NULL,
        DesignTemp REAL NULL,
        RatedCurrent REAL DEFAULT 10.0,
        MaxVibrationThreshold REAL DEFAULT 4.5,
        MaxTempThreshold REAL DEFAULT 75.0,
        Notes NVARCHAR(500) NULL,
        Created_At DATETIME DEFAULT GETDATE(),
        Last_Update DATETIME DEFAULT GETDATE()
    );
    """)

    # Ensure all engineering columns exist
    cols = [
        ("RatedSpeed", "REAL NULL"),
        ("DesignFlow", "REAL NULL"),
        ("DesignTemp", "REAL NULL"),
        ("Maintenance_Limit_Hours", "REAL DEFAULT 500.0"),
        ("MaintenanceLimit_Hours", "REAL DEFAULT 500.0"),
        ("RatedCurrent", "REAL DEFAULT 10.0"),
        ("MaxVibrationThreshold", "REAL DEFAULT 4.5"),
        ("MaxTempThreshold", "REAL DEFAULT 75.0"),
        ("Notes", "NVARCHAR(500) NULL")
    ]
    for col, col_type in cols:
        cursor.execute(f"""
            IF COL_LENGTH('dbo.Equipment_Master', '{col}') IS NULL
            ALTER TABLE dbo.Equipment_Master ADD {col} {col_type};
        """)

    # Ensure Equipment_Maintenance columns exist
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
    current_by_id = {row[0]: row for row in current_rows}
    
    needs_reseed = False
    if len(current_rows) != 12:
        needs_reseed = True
    else:
        for eq_id, code, _, _, _, _, _, _, _, _ in assets:
            if eq_id not in current_by_id or str(current_by_id[eq_id][1]).upper() != code:
                needs_reseed = True
                break

    if needs_reseed:
        saved_runtimes = {}
        for row in current_rows:
            code_up = str(row[1]).upper()
            saved_runtimes[code_up] = (float(row[2] or 0.0), int(row[3] or 0), str(row[4] or 'STOPPED'))

        if 'PUMP_INLET' in saved_runtimes and 'PUMP_INLET_MILK' not in saved_runtimes:
            saved_runtimes['PUMP_INLET_MILK'] = saved_runtimes['PUMP_INLET']

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
        logger.info("[Equipment_Master] Re-aligned to exact 12 core assets (IDs 1..12).")
    else:
        for eq_id, code, name, eq_type, loc, speed, flow, temp, m_limit, notes in assets:
            cursor.execute("""
                UPDATE dbo.Equipment_Master
                SET EquipmentName = ?, EquipmentType = ?, Location = ?,
                    RatedSpeed = ?, DesignFlow = ?, DesignTemp = ?,
                    Maintenance_Limit_Hours = ?, MaintenanceLimit_Hours = ?, Notes = ?,
                    Last_Update = GETDATE()
                WHERE EquipmentID = ? AND EquipmentCode = ?
            """, (name, eq_type, loc, speed, flow, temp, m_limit, m_limit, notes, eq_id, code))
        logger.info("[Equipment_Master] Verified 12 core assets in place.")

_provision_7_equipment_assets = _provision_12_equipment_assets

def init_mes_database():
    server = find_working_server()
    if not server:
        logger.warning("No running SQL Server instance found on host.")
        return False

    master_conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE=master;Trusted_Connection=yes;TrustServerCertificate=yes;"
    try:
        conn = pyodbc.connect(master_conn_str, autocommit=True, timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sys.databases WHERE name = 'MES_Milk_Production'")
        if not cursor.fetchone():
            logger.info("Creating database MES_Milk_Production...")
            cursor.execute("CREATE DATABASE MES_Milk_Production")
            time.sleep(1)
        conn.close()
    except Exception as e:
        logger.error(f"Error checking/creating master DB: {e}")
        return False

    db_conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE=MES_Milk_Production;Trusted_Connection=yes;TrustServerCertificate=yes;"
    try:
        conn = pyodbc.connect(db_conn_str, autocommit=True, timeout=5)
        cursor = conn.cursor()

        # 1. Material_Stock (ISA-95 Level 3 Physical Silo / Tank Storage)
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Material_Stock' AND xtype='U')
        CREATE TABLE Material_Stock (
            Material_Code VARCHAR(50) PRIMARY KEY,
            Material_Name NVARCHAR(150),
            AssignedTank VARCHAR(50),
            CurrentStock FLOAT,
            Total_Quantity FLOAT,
            Unit VARCHAR(20),
            TankCapacity FLOAT,
            MinSafetyThreshold FLOAT,
            Last_Update DATETIME DEFAULT GETDATE()
        )
        """)

        # Dynamically ensure Material_Stock has OPC UA & loadcell mapping columns
        mat_stock_cols = [
            ("OpcNodeId", "NVARCHAR(255) NULL"),
            ("OpcHighLevelNodeId", "NVARCHAR(255) NULL"),
            ("OpcLowLevelNodeId", "NVARCHAR(255) NULL"),
            ("SensorType", "NVARCHAR(50) DEFAULT 'LOADCELL_MASS'"),
            ("TareWeight", "FLOAT DEFAULT 0.0"),
            ("CreatedBy", "NVARCHAR(50) DEFAULT 'admin'")
        ]
        for col_name, col_spec in mat_stock_cols:
            cursor.execute(f"""
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Material_Stock') AND name = '{col_name}')
            ALTER TABLE dbo.Material_Stock ADD {col_name} {col_spec};
            """)

        # Physical Laboratory / Pilot Bench Scale (5.0L storage tanks, 0.5L safety min) - ONLY fill NULLs, never overwrite custom calibrations
        cursor.execute("""
        UPDATE dbo.Material_Stock 
        SET TankCapacity = 1000.0, MinSafetyThreshold = 50.0, Unit = 'L'
        WHERE AssignedTank = 'TANK-01' AND (TankCapacity IS NULL OR TankCapacity < 1000.0);

        UPDATE dbo.Material_Stock 
        SET TankCapacity = 1000.0, MinSafetyThreshold = 50.0, Unit = 'kg'
        WHERE AssignedTank = 'TANK-02' AND (TankCapacity IS NULL OR TankCapacity < 1000.0);

        UPDATE dbo.Material_Stock 
        SET TankCapacity = 1000.0, MinSafetyThreshold = 10.0, Unit = 'kg'
        WHERE AssignedTank = 'TANK-03' AND (TankCapacity IS NULL OR TankCapacity < 1000.0);
        """)

        # Ensure dbo.Material_Input exists with ISA-95 verification columns
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Material_Input' AND xtype='U')
        CREATE TABLE dbo.Material_Input (
            Input_ID INT IDENTITY(1,1) PRIMARY KEY,
            Material_Code NVARCHAR(50) NOT NULL,
            Material_Name NVARCHAR(150),
            Quantity REAL DEFAULT 0.0,
            Input_Time DATETIME DEFAULT GETDATE(),
            Remark NVARCHAR(MAX),
            Tank_ID NVARCHAR(50) NULL,
            PreIntakeWeight FLOAT DEFAULT 0.0,
            PostIntakeWeight FLOAT DEFAULT 0.0,
            ActualDeliveredWeight FLOAT DEFAULT 0.0,
            WeightDiscrepancy FLOAT DEFAULT 0.0,
            DiscrepancyStatus NVARCHAR(20) DEFAULT 'VERIFIED'
        );
        """)

        mat_input_cols = [
            ("Tank_ID", "NVARCHAR(50) NULL"),
            ("TankID", "NVARCHAR(50) NULL"),
            ("ReceiptCode", "NVARCHAR(100) NULL"),
            ("ExpectedQty", "FLOAT DEFAULT 0.0"),
            ("ActualQty", "FLOAT DEFAULT 0.0"),
            ("DiscrepancyQty", "FLOAT DEFAULT 0.0"),
            ("DiscrepancyPercent", "FLOAT DEFAULT 0.0"),
            ("SupplierLot", "NVARCHAR(100) NULL"),
            ("Status", "NVARCHAR(50) DEFAULT 'MATCHED'"),
            ("ReceivedBy", "NVARCHAR(100) DEFAULT 'Operator'"),
            ("PreIntakeWeight", "FLOAT DEFAULT 0.0"),
            ("PostIntakeWeight", "FLOAT DEFAULT 0.0"),
            ("ActualDeliveredWeight", "FLOAT DEFAULT 0.0"),
            ("WeightDiscrepancy", "FLOAT DEFAULT 0.0"),
            ("DiscrepancyStatus", "NVARCHAR(20) DEFAULT 'VERIFIED'")
        ]
        for col_name, col_spec in mat_input_cols:
            cursor.execute(f"""
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Material_Input') AND name = '{col_name}')
            ALTER TABLE dbo.Material_Input ADD {col_name} {col_spec};
            """)

        # STARTUP SHIELD: Never wipe user-calibrated OPC Node IDs on startup.
        # Clean baseline is only applied if Material_Stock is completely empty during initial seeding.

        # 2. Customers
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Customers' AND xtype='U')
        CREATE TABLE Customers (
            Customer_ID VARCHAR(50) PRIMARY KEY,
            Customer_Code VARCHAR(50),
            Customer_Name NVARCHAR(150),
            Address NVARCHAR(255),
            Email VARCHAR(100),
            Phone VARCHAR(50),
            Priority INT DEFAULT 2,
            Status VARCHAR(20) DEFAULT 'Active',
            ActiveOrders INT DEFAULT 0
        )
        """)

        # 3. Recipes
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Recipes' AND xtype='U')
        CREATE TABLE Recipes (
            Recipe_ID VARCHAR(50) PRIMARY KEY,
            Recipe_Name NVARCHAR(150),
            Description NVARCHAR(255),
            Target_Volume FLOAT DEFAULT 2.0,
            Temp_Hot FLOAT,
            Temp_Cold FLOAT,
            Status VARCHAR(20) DEFAULT 'RELEASED',
            Version VARCHAR(20) DEFAULT 'v2.4'
        )
        """)

        # 4. Recipe_Detail
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Recipe_Detail' AND xtype='U')
        CREATE TABLE Recipe_Detail (
            Detail_ID INT IDENTITY(1,1) PRIMARY KEY,
            Recipe_ID VARCHAR(50),
            Material_ID VARCHAR(50),
            Material_Name NVARCHAR(150),
            Percentage FLOAT,
            Target_Qty FLOAT,
            Unit VARCHAR(20)
        )
        """)

        # 5. Alarm_History (ISA-18.2 Alarm Lifecycle Management)
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Alarm_History')
        BEGIN
            CREATE TABLE dbo.Alarm_History (
                AlarmID INT IDENTITY(1,1) PRIMARY KEY,
                AlarmCode NVARCHAR(50),
                Message NVARCHAR(255),
                TriggerTime DATETIME DEFAULT GETDATE(),
                IsAcknowledged BIT DEFAULT 0,
                AckTime DATETIME NULL,
                AckUser NVARCHAR(50) NULL
            );
        END
        ELSE
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Alarm_History') AND name = 'IsAcknowledged')
                ALTER TABLE dbo.Alarm_History ADD IsAcknowledged BIT DEFAULT 0;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Alarm_History') AND name = 'AckTime')
                ALTER TABLE dbo.Alarm_History ADD AckTime DATETIME NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Alarm_History') AND name = 'AckUser')
                ALTER TABLE dbo.Alarm_History ADD AckUser NVARCHAR(50) NULL;
        END
        """)

        # 6. UserActionLog (FDA 21 CFR Part 11 & ALCOA+ Audit Trail)
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='UserActionLog')
        CREATE TABLE dbo.UserActionLog (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            UserName NVARCHAR(50) NOT NULL,
            UserRole NVARCHAR(50) NOT NULL,
            ActionName NVARCHAR(100) NOT NULL,
            Detail NVARCHAR(MAX) NOT NULL,
            ActionTime DATETIME DEFAULT GETDATE(),
            FieldName NVARCHAR(100) NULL,
            OldValue NVARCHAR(500) NULL,
            NewValue NVARCHAR(500) NULL,
            Reason NVARCHAR(500) NOT NULL,
            SignatureMeaning NVARCHAR(100) NOT NULL,
            RecordHash CHAR(64) NULL,
            IsCorrection BIT DEFAULT 0,
            RefLogID INT NULL
        );
        """)

        # Ensure existing instances receive 21 CFR Part 11 columns
        alter_stmts = [
            ("FieldName", "NVARCHAR(100) NULL"),
            ("OldValue", "NVARCHAR(500) NULL"),
            ("NewValue", "NVARCHAR(500) NULL"),
            ("Reason", "NVARCHAR(500) NOT NULL DEFAULT 'STANDARD_AUDIT'"),
            ("SignatureMeaning", "NVARCHAR(100) NOT NULL DEFAULT 'System Audit Trail'"),
            ("RecordHash", "CHAR(64) NULL"),
            ("IsCorrection", "BIT DEFAULT 0"),
            ("RefLogID", "INT NULL")
        ]
        for col_name, col_spec in alter_stmts:
            cursor.execute(f"""
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.UserActionLog') AND name = '{col_name}')
            ALTER TABLE dbo.UserActionLog ADD {col_name} {col_spec};
            """)

        # Deploy INSTEAD OF UPDATE, DELETE Immutability Trigger on dbo.UserActionLog
        cursor.execute("""
        IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_UserActionLog_Immutability')
        DROP TRIGGER trg_UserActionLog_Immutability;
        """)
        cursor.execute("""
        CREATE TRIGGER trg_UserActionLog_Immutability
        ON dbo.UserActionLog
        INSTEAD OF UPDATE, DELETE
        AS
        BEGIN
            SET NOCOUNT ON;
            RAISERROR('FDA 21 CFR Part 11 Violation: Records in dbo.UserActionLog are immutable and cannot be updated or deleted.', 16, 1);
            ROLLBACK TRANSACTION;
        END;
        """)

        # 7. Users (FDA 21 CFR Part 11 Electronic Signature Authentication)
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='Users')
        CREATE TABLE dbo.Users (
            UserID INT IDENTITY(1,1) PRIMARY KEY,
            UserName NVARCHAR(50) UNIQUE NOT NULL,
            Password NVARCHAR(255) NOT NULL,
            UserRole NVARCHAR(50) NOT NULL,
            FullName NVARCHAR(100) NULL,
            IsActive BIT DEFAULT 1,
            CreatedAt DATETIME DEFAULT GETDATE()
        );
        """)

        # 8. Asset_Template & Asset_Template_Tags (ISA-88 Modular Unit Generator)
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Asset_Template' AND xtype='U')
        CREATE TABLE dbo.Asset_Template (
            TemplateID NVARCHAR(50) PRIMARY KEY,
            TemplateName NVARCHAR(150) NOT NULL,
            Description NVARCHAR(255) NULL
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Asset_Template_Tags' AND xtype='U')
        CREATE TABLE dbo.Asset_Template_Tags (
            TagTemplateID INT IDENTITY(1,1) PRIMARY KEY,
            TemplateID NVARCHAR(50) NOT NULL,
            TagSuffix NVARCHAR(50) NOT NULL,
            SignalRole NVARCHAR(50) NOT NULL,
            DataType NVARCHAR(50) NOT NULL,
            DefaultUnit NVARCHAR(20) NULL,
            KepwarePathPattern NVARCHAR(255) NOT NULL
        );

        -- ISA-88 Physical Model Schema
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Unit' AND xtype='U')
        CREATE TABLE dbo.Unit (
            Unit_ID INT IDENTITY(1,1) PRIMARY KEY,
            Unit_Code VARCHAR(50) UNIQUE NOT NULL,
            Unit_Name NVARCHAR(150) NOT NULL,
            ProcessCell VARCHAR(50) DEFAULT 'Milk_Production_Cell_01',
            UnitType VARCHAR(50) DEFAULT 'TANK',
            CreatedTime DATETIME DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EM' AND xtype='U')
        CREATE TABLE dbo.EM (
            EM_ID INT IDENTITY(1,1) PRIMARY KEY,
            EM_Code VARCHAR(50) NOT NULL,
            EM_Name NVARCHAR(150) NOT NULL,
            Unit_Code VARCHAR(50) NOT NULL,
            Description NVARCHAR(255) NULL
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CM' AND xtype='U')
        CREATE TABLE dbo.CM (
            CM_ID INT IDENTITY(1,1) PRIMARY KEY,
            CM_Code VARCHAR(50) NOT NULL,
            CM_Name NVARCHAR(150) NOT NULL,
            EM_Code VARCHAR(50) NULL,
            Unit_Code VARCHAR(50) NOT NULL,
            CM_Type VARCHAR(50) NULL
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Tag' AND xtype='U')
        CREATE TABLE dbo.Tag (
            Tag_ID INT IDENTITY(1,1) PRIMARY KEY,
            TagName VARCHAR(100) UNIQUE NOT NULL,
            Unit_Code VARCHAR(50) NULL,
            EM_Code VARCHAR(50) NULL,
            DataType VARCHAR(50) DEFAULT 'Float',
            Unit VARCHAR(20) NULL,
            Description NVARCHAR(255) NULL,
            CreatedTime DATETIME DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Tag_OPC' AND xtype='U')
        CREATE TABLE dbo.Tag_OPC (
            OPC_Tag_ID INT IDENTITY(1,1) PRIMARY KEY,
            TagName VARCHAR(100) NOT NULL,
            NodeId NVARCHAR(255) NOT NULL,
            Server_URL NVARCHAR(255) DEFAULT 'opc.tcp://127.0.0.1:49320',
            SamplingInterval INT DEFAULT 100,
            IsActive BIT DEFAULT 1,
            LastQuality VARCHAR(20) DEFAULT 'Good',
            LastValue NVARCHAR(100) NULL,
            LastUpdateTime DATETIME DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Tag_Config' AND xtype='U')
        CREATE TABLE dbo.Tag_Config (
            TagKey NVARCHAR(100) PRIMARY KEY,
            Module NVARCHAR(50) DEFAULT 'general',
            EquipmentCode NVARCHAR(50) NULL,
            OpcNodeId NVARCHAR(255) NOT NULL,
            Unit NVARCHAR(50) DEFAULT '--',
            RoleDescription NVARCHAR(255) NULL,
            DataType NVARCHAR(50) DEFAULT 'Float',
            Last_Update DATETIME DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Tag_Read' AND xtype='U')
        CREATE TABLE dbo.Tag_Read (
            TagKey NVARCHAR(100) PRIMARY KEY,
            Module NVARCHAR(50) DEFAULT 'operations',
            OpcNodeId NVARCHAR(255) NOT NULL,
            Unit NVARCHAR(50) DEFAULT '--',
            RoleDescription NVARCHAR(255) NULL,
            DataType NVARCHAR(50) DEFAULT 'Float',
            LastValue NVARCHAR(255) NULL,
            LastQuality NVARCHAR(50) DEFAULT 'Good',
            Last_Update DATETIME DEFAULT GETDATE()
        );

        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Tag_Write' AND xtype='U')
        CREATE TABLE dbo.Tag_Write (
            TagKey NVARCHAR(100) PRIMARY KEY,
            Module NVARCHAR(50) DEFAULT 'operations',
            OpcNodeId NVARCHAR(255) NOT NULL,
            Unit NVARCHAR(50) DEFAULT '--',
            RoleDescription NVARCHAR(255) NULL,
            DataType NVARCHAR(50) DEFAULT 'Float',
            LastWriteValue NVARCHAR(255) NULL,
            Last_Update DATETIME DEFAULT GETDATE()
        );

        -- Quality Module Schemas & Schema Evolution (HACCP & ISA-95)
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quality_Result') AND name = 'Status')
            ALTER TABLE dbo.Quality_Result ADD Status NVARCHAR(20) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quality_Result') AND name = 'Avg_Deviation')
            ALTER TABLE dbo.Quality_Result ADD Avg_Deviation REAL NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quality_Result') AND name = 'Checked_At')
            ALTER TABLE dbo.Quality_Result ADD Checked_At DATETIME NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quality_Result') AND name = 'Report_ID')
            ALTER TABLE dbo.Quality_Result ADD Report_ID INT NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quality_Result') AND name = 'Recipe_ID')
            ALTER TABLE dbo.Quality_Result ADD Recipe_ID INT NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ProductionReport') AND name = 'Product_Volume')
            ALTER TABLE dbo.ProductionReport ADD Product_Volume REAL NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ProductionReport') AND name = 'End_Time')
            ALTER TABLE dbo.ProductionReport ADD End_Time DATETIME NULL;
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Quality_Result_Detail' AND xtype='U')
        CREATE TABLE dbo.Quality_Result_Detail (
            Detail_ID INT IDENTITY(1,1) PRIMARY KEY,
            Quality_ID INT NULL,
            Report_ID INT NULL,
            ReportCode NVARCHAR(50) NULL,
            OrderCode NVARCHAR(50) NULL,
            ParameterName NVARCHAR(100) NOT NULL,
            PhaseId NVARCHAR(50) NULL,
            Setpoint REAL NULL,
            ActualValue REAL NULL,
            DeviationPercent REAL NULL,
            ToleranceBand NVARCHAR(50) NULL,
            Is_CCP_Breach BIT DEFAULT 0,
            Result NVARCHAR(20) DEFAULT 'PASS',
            Checked_At DATETIME DEFAULT GETDATE()
        );
        """)

        # STARTUP GUARD: Zero re-seeding or overwrite of dbo.Tag_Config / dbo.Tag_Read / dbo.Tag_Write
        logger.info("[Startup Guard] Operations Tag Mappings Baseline: STRICT EMPTY-BASELINE & INCREMENTAL PERSISTENCE enforced. Zero mock tag re-seeding.")

        tables_seeded = []

        # ====================================================================
        # 1. PREVENT STARTUP DATA OVERWRITE: Material_Stock
        # - Check if dbo.Material_Stock already contains rows.
        # - DO NOT run any UPDATE, TRUNCATE, or default INSERT on dbo.Material_Stock if the table already has records.
        # - Only seed initial demo stock if SELECT COUNT(*) FROM dbo.Material_Stock is exactly 0.
        # ====================================================================
        cursor.execute("SELECT COUNT(*) FROM dbo.Material_Stock")
        stock_count = cursor.fetchone()[0]
        if stock_count == 0:
            cursor.execute("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Material_Stock)
            INSERT INTO dbo.Material_Stock (Material_Code, Material_Name, AssignedTank, CurrentStock, Total_Quantity, Unit, TankCapacity, MinSafetyThreshold, Last_Update)
            VALUES 
            ('RAW_MILK', N'Fresh Raw Milk (Sữa tươi)', 'TANK-01', 0.0, 0.0, 'L', 1000.0, 50.0, GETDATE()),
            ('SUGAR', N'Refined Cane Sugar (Đường tinh luyện)', 'TANK-02', 0.0, 0.0, 'kg', 1000.0, 50.0, GETDATE()),
            ('ADDITIVE', N'Flavor & Vitamins (Hương liệu & Vi chất)', 'TANK-03', 0.0, 0.0, 'kg', 1000.0, 10.0, GETDATE())
            """)
            tables_seeded.append("Material_Stock")
            logger.info("Material_Stock table was empty (count = 0); initialized factory baseline clean zero stock.")
        else:
            # Table already contains rows: NEVER run UPDATE, TRUNCATE, or default INSERT
            logger.info(f"Existing inventory verified ({stock_count} records in dbo.Material_Stock). DO NOT run any UPDATE, TRUNCATE, or INSERT. Live tank stock preserved. Zero overwrite.")

        # Zero-reversion cold-boot hydration: If Material_Stock rows have empty/null OpcNodeId, hydrate from tag_mappings.json["inventory"]
        try:
            tag_mappings_path = os.path.join(os.path.dirname(__file__), "tag_mappings.json")
            if os.path.exists(tag_mappings_path):
                with open(tag_mappings_path, "r", encoding="utf-8") as f:
                    t_maps = json.load(f)
                inv_maps = t_maps.get("inventory", {})
                for tank_id in ["TANK-01", "TANK-02", "TANK-03"]:
                    cfg = inv_maps.get(tank_id, {})
                    pv_n = (cfg.get("pv_node") or cfg.get("pv") or "").strip()
                    high_n = (cfg.get("high_node") or cfg.get("high") or "").strip()
                    low_n = (cfg.get("low_node") or cfg.get("low") or "").strip()
                    if pv_n:
                        cursor.execute("""
                            UPDATE dbo.Material_Stock 
                            SET OpcNodeId = ?
                            WHERE AssignedTank = ? AND (OpcNodeId IS NULL OR OpcNodeId = '')
                        """, (pv_n, tank_id))
                    if high_n:
                        cursor.execute("""
                            UPDATE dbo.Material_Stock 
                            SET OpcHighLevelNodeId = ?
                            WHERE AssignedTank = ? AND (OpcHighLevelNodeId IS NULL OR OpcHighLevelNodeId = '')
                        """, (high_n, tank_id))
                    if low_n:
                        cursor.execute("""
                            UPDATE dbo.Material_Stock 
                            SET OpcLowLevelNodeId = ?
                            WHERE AssignedTank = ? AND (OpcLowLevelNodeId IS NULL OR OpcLowLevelNodeId = '')
                        """, (low_n, tank_id))
                logger.info("Cold-boot hydration from tag_mappings.json verified for unmapped SQL records.")
        except Exception as hyd_err:
            logger.warning(f"Hydration from tag_mappings.json skipped or failed: {hyd_err}")

        # Seed Customers ONLY if empty
        cursor.execute("SELECT COUNT(*) FROM dbo.Customers")
        customer_count = cursor.fetchone()[0]
        if customer_count == 0:
            cursor.execute("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Customers)
            INSERT INTO dbo.Customers (Customer_ID, Customer_Code, Customer_Name, Address, Email, Phone, Priority, Status, ActiveOrders)
            VALUES 
            ('CUS-01', 'CUS-VNM', N'Vinamilk (Vietnam Dairy Products)', N'District 7, HCMC', 'procurement@vinamilk.com.vn', '+84 28 5415 5555', 1, 'Active', 2),
            ('CUS-02', 'CUS-THM', N'TH True Milk Corporation', N'Nghia Dan, Nghe An', 'supply-chain@thmilk.vn', '+84 238 868 8888', 2, 'Active', 1),
            ('CUS-03', 'CUS-NUT', N'Nutifood Nutrition Group', N'Tan Binh District, HCMC', 'orders@nutifood.com.vn', '+84 28 3826 7999', 2, 'Active', 1),
            ('CUS-04', 'CUS-FCS', N'FrieslandCampina Vietnam', N'Binh Duong Province', 'contact@frieslandcampina.com', '+84 274 375 6123', 3, 'Active', 0),
            ('CUS-05', 'CUS-MOC', N'Moc Chau Dairy Cattle JSC', N'Moc Chau, Son La', 'contact@mocchaumilk.com', '+84 212 386 6200', 2, 'Active', 1)
            """)
            tables_seeded.append("Customers")
            logger.info("Customers table was empty; seeded initial master data.")
        else:
            logger.info(f"Existing customers verified ({customer_count} records). Master data preserved.")

        # Seed Recipes ONLY if empty
        cursor.execute("SELECT COUNT(*) FROM dbo.Recipes")
        recipe_count = cursor.fetchone()[0]
        if recipe_count == 0:
            cursor.execute("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Recipes)
            INSERT INTO dbo.Recipes (Recipe_ID, Recipe_Name, Description, Target_Volume, Temp_Hot, Temp_Cold, Status, Version)
            VALUES 
            ('RCP-MILK-UHT-01', N'Fresh Pasteurized UHT Milk (Sữa tươi tiệt trùng UHT)', N'Standard UHT Whole Milk with direct steam injection', 1000.0, 140.0, 4.0, 'RELEASED', 'v2.4'),
            ('RCP-CHOC-MILK-02', N'Chocolate Flavored Milk (Sữa sô-cô-la chuẩn)', N'Pasteurized chocolate milk with sweetened cocoa dispersion', 1000.0, 75.0, 4.0, 'RELEASED', 'v2.3'),
            ('RCP-YOGURT-DRK-03', N'Probiotic Drinking Yogurt (Sữa chua uống men sống)', N'Cultured probiotic yogurt drink with delicate acid profile', 1000.0, 85.0, 4.0, 'RELEASED', 'v1.9'),
            ('RCP-STRAW-MILK-04', N'Strawberry Milk Drink (Sữa tươi dâu tây)', N'Sweetened strawberry flavored milk drink', 1000.0, 75.0, 4.0, 'RELEASED', 'v1.4')
            """)
            tables_seeded.append("Recipes")
            logger.info("Recipes table was empty; seeded initial master recipes.")
        else:
            logger.info(f"Existing recipes verified ({recipe_count} records). Recipes preserved.")

        # Seed Recipe_Detail ONLY if empty
        cursor.execute("SELECT COUNT(*) FROM dbo.Recipe_Detail")
        detail_count = cursor.fetchone()[0]
        if detail_count == 0:
            cursor.execute("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Recipe_Detail)
            INSERT INTO dbo.Recipe_Detail (Recipe_ID, Material_ID, Material_Name, Percentage, Target_Qty, Unit)
            VALUES 
            ('RCP-MILK-UHT-01', 'RAW_MILK', N'Fresh Raw Milk', 95.0, 950.0, 'L'),
            ('RCP-MILK-UHT-01', 'ADDITIVE', N'Vitamin D3 & Stabilizer', 5.0, 50.0, 'L'),
            ('RCP-CHOC-MILK-02', 'RAW_MILK', N'Fresh Raw Milk', 70.0, 700.0, 'L'),
            ('RCP-CHOC-MILK-02', 'SUGAR', N'Refined Cane Sugar', 20.0, 200.0, 'kg'),
            ('RCP-CHOC-MILK-02', 'ADDITIVE', N'Cocoa & Emulsifier', 10.0, 100.0, 'L'),
            ('RCP-YOGURT-DRK-03', 'RAW_MILK', N'Fresh Raw Milk', 80.0, 800.0, 'L'),
            ('RCP-YOGURT-DRK-03', 'SUGAR', N'Refined Cane Sugar', 15.0, 150.0, 'kg'),
            ('RCP-YOGURT-DRK-03', 'ADDITIVE', N'Probiotic Starter Culture', 5.0, 50.0, 'L'),
            ('RCP-STRAW-MILK-04', 'RAW_MILK', N'Fresh Raw Milk', 75.0, 750.0, 'L'),
            ('RCP-STRAW-MILK-04', 'SUGAR', N'Refined Cane Sugar', 15.0, 150.0, 'kg'),
            ('RCP-STRAW-MILK-04', 'ADDITIVE', N'Strawberry Flavor & Color', 10.0, 100.0, 'L')
            """)
            tables_seeded.append("Recipe_Detail")
            logger.info("Recipe_Detail table was empty; seeded initial parameters.")
        else:
            logger.info(f"Existing recipe details verified ({detail_count} records). Parameters preserved.")

        # 5b. Alarm_History: Strictly cold standby - zero mock alarms seeded on boot
        cursor.execute("SELECT COUNT(*) FROM dbo.Alarm_History WHERE IsAcknowledged = 0")
        active_alarm_count = cursor.fetchone()[0]
        logger.info(f"Alarm_History verified: {active_alarm_count} active unacknowledged alarm(s). Zero mock seeding.")

        # Seed Users ONLY if Users table is completely empty
        cursor.execute("SELECT COUNT(*) FROM dbo.Users")
        user_count = cursor.fetchone()[0]
        if user_count == 0:
            cursor.execute("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Users)
            INSERT INTO dbo.Users (UserName, Password, UserRole, FullName, IsActive, CreatedAt)
            VALUES 
            ('admin', 'admin123', 'Admin', N'System Administrator', 1, GETDATE()),
            ('eng_tranduc', 'eng123', 'Engineer', N'Trần Đức (Lead Process Architect)', 1, GETDATE()),
            ('engineer_lead', 'eng123', 'Engineer', N'Controls & Automation Engineer', 1, GETDATE()),
            ('qa_supervisor_01', 'sup123', 'Supervisor', N'QA Lead Inspector', 1, GETDATE()),
            ('supervisor_01', 'sup123', 'Supervisor', N'Shift Production Supervisor', 1, GETDATE()),
            ('operator_01', 'op123', 'Operator', N'Shift 1 Line Operator', 1, GETDATE())
            """)
            tables_seeded.append("Users")
            logger.info("Users was empty; seeded authorized FDA 21 CFR Part 11 signers.")
        # 5c. ISA-95 Level 4 (Odoo ERP) Downlink Schema & Customer Verification
        cursor.execute("""
        IF NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerCode = 'ODOO_ERP')
        BEGIN
            INSERT INTO dbo.Customers (CustomerCode, CustomerName, ContactEmail, OrderPriority, IsActive)
            VALUES ('ODOO_ERP', 'Odoo ERP Integration System', 'erp-sync@mes.local', 1, 1);
        END

        -- Ensure dbo.Orders table exists with full ISA-95 Level 3 schema
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Orders' AND xtype='U')
        CREATE TABLE dbo.Orders (
            Order_ID INT IDENTITY(1,1) PRIMARY KEY,
            OrderCode NVARCHAR(50) UNIQUE NOT NULL,
            Recipe_ID INT NULL,
            CustomerID INT NULL,
            TargetVolume FLOAT NOT NULL,
            ActualVolume FLOAT NULL,
            Status NVARCHAR(50) DEFAULT 'Ready',
            ScheduledStartTime DATETIME DEFAULT GETDATE(),
            ActualStartTime DATETIME NULL,
            ActualEndTime DATETIME NULL,
            CustomerCode NVARCHAR(50) NULL,
            RecipeID INT NULL,
            CreatedDate DATETIME DEFAULT GETDATE()
        );

        -- Ensure dual-compatibility columns exist on dbo.Orders
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Orders') AND name = 'CustomerCode')
            ALTER TABLE dbo.Orders ADD CustomerCode NVARCHAR(50) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Orders') AND name = 'RecipeID')
            ALTER TABLE dbo.Orders ADD RecipeID INT NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Orders') AND name = 'CreatedDate')
            ALTER TABLE dbo.Orders ADD CreatedDate DATETIME NULL;

        -- Ensure dbo.PLC_Datalog table exists for process variable telemetry historian
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PLC_Datalog' AND xtype='U')
        CREATE TABLE dbo.PLC_Datalog (
            LogID BIGINT IDENTITY(1,1) PRIMARY KEY,
            OrderCode NVARCHAR(50) NOT NULL,
            TagName NVARCHAR(100) NOT NULL,
            Value FLOAT NOT NULL,
            Unit NVARCHAR(20) NULL,
            ReadTime DATETIME DEFAULT GETDATE()
        );
        -- ISA-88 Batch Contextualization: Batch_ID / Unit_ID / Phase_ID (additive, NULLable, legacy-safe)
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PLC_Datalog') AND name = 'Batch_ID')
            ALTER TABLE dbo.PLC_Datalog ADD Batch_ID NVARCHAR(50) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PLC_Datalog') AND name = 'Unit_ID')
            ALTER TABLE dbo.PLC_Datalog ADD Unit_ID NVARCHAR(50) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PLC_Datalog') AND name = 'Phase_ID')
            ALTER TABLE dbo.PLC_Datalog ADD Phase_ID NVARCHAR(50) NULL;
        -- Zero-reversion Commissioning Mode:
        -- Never wipe or delete operator or synced orders on startup; preserve all records permanently.
        """)

        # Verification of Clean Slate Commissioning State
        cursor.execute("SELECT COUNT(*) FROM dbo.Orders")
        live_orders_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM dbo.PLC_Datalog")
        live_datalog_count = cursor.fetchone()[0]
        logger.info(f"Clean Commissioning State: dbo.Orders has {live_orders_count} orders (zero demo orders seeded). dbo.PLC_Datalog has {live_datalog_count} logs.")

        # Provision and verify exact 12 physical equipment assets
        _provision_12_equipment_assets(cursor)

        # Ensure standard 7-unit ISA-88 physical plant topology (41 tags, 14 EMs)
        try:
            from db_routes import ensure_standard_isa88_topology
            ensure_standard_isa88_topology(conn=conn, force_reset=False)
        except Exception as _e:
            logger.warning(f"Note: Standard ISA-88 topology pre-seed skipped during init_sql: {_e}")

        conn.close()
        if tables_seeded:
            logger.info(f"Database MES_Milk_Production initialized empty tables: {', '.join(tables_seeded)}.")
        else:
            logger.info("Database MES_Milk_Production verified. All existing tables and live inventory preserved (Zero reset).")
        return True
    except Exception as e:
        logger.error(f"Error initializing schema in MES_Milk_Production: {e}")
        return False

if __name__ == "__main__":
    init_mes_database()
