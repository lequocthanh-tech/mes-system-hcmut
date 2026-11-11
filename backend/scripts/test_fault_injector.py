"""
backend/test_fault_injector.py
Industrial Multi-Scenario Fault Injection Harness for Predictive Maintenance (PdM)
Simulates realistic multivariate time-series (Current, Speed, Temperature)
for AGITATOR_MIX adhering to real-world physics (Joule heating, mechanical slip, MCSA degradation).
"""

import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import pyodbc
import time
import math
import random
import argparse
from datetime import datetime, timedelta

DB_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\WINCC;"
    "DATABASE=MES_Milk_Production;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

EQUIPMENT_CODE = "AGITATOR_MIX"
TAG_CURRENT = "Motor_1.Current"
TAG_SPEED = "Motor_1.Speed"
TAG_TEMP = "Motor_1.Temp"


class IndustrialMotorSimulator:
    """
    Physical simulation of an induction motor:
    1. Thermal dynamics: dT/dt = (k * I^2 - (T - T_amb)) / tau
    2. Mechanical slip under torque/load: Speed drops proportionally to electromagnetic current.
    """
    def __init__(self, ambient_temp: float = 28.5):
        self.ambient_temp = ambient_temp
        self.current_temp = ambient_temp
        self.thermal_tau = 35.0  # Thermal time constant in seconds
        self.thermal_k = 0.42    # Joule conversion coefficient (W to delta-T)

    def update_physics(self, current: float, base_speed: float, dt: float = 0.5):
        # 1. Thermal dynamics: dT/dt = (k * I^2 - (T - T_amb)) / tau
        heat_generated = self.thermal_k * (current ** 2)
        heat_dissipated = (self.current_temp - self.ambient_temp)
        d_temp = (heat_generated - heat_dissipated) / self.thermal_tau * dt
        self.current_temp += d_temp

        # 2. Speed slip under mechanical load
        slip = min(350.0, (current / 4.2) * 8.5)
        speed = max(0.0, base_speed - slip + random.gauss(0, 1.2))

        return round(speed, 1), round(self.current_temp, 2)


def get_db_connection():
    return pyodbc.connect(DB_CONN_STR, timeout=10)


def insert_telemetry_batch(cursor, records):
    """Bulk insert telemetry records into dbo.PLC_Datalog."""
    query = """
        INSERT INTO dbo.PLC_Datalog (OrderCode, TagName, Value, Unit, ReadTime)
        VALUES (?, ?, ?, ?, ?)
    """
    cursor.executemany(query, records)


def run_scenario(scenario_id: int, mode_live: bool = True):
    conn = get_db_connection()
    cursor = conn.cursor()
    sim = IndustrialMotorSimulator(ambient_temp=29.0)

    order_code = f"BATCH_{datetime.now().strftime('%y%m%d_%H%M')}"
    records_buffer = []

    print("\n" + "=" * 75)

    # -------------------------------------------------------------------------
    # SCENARIO 1: FULL RUN-TO-FAILURE LIFECYCLE (Normal -> Bearing Wear -> Jam)
    # -------------------------------------------------------------------------
    if scenario_id == 1:
        print("[KỊCH BẢN 1] MÔ PHỎNG VÒNG ĐỜI LŨY TIẾN (FULL RUN-TO-FAILURE STREAM)")
        print("Mô tả: 120 mẫu bình thường -> 100 mẫu mòn ổ bi sớm -> 60 mẫu kẹt tải sự cố.")
        total_steps = 280
        runtime_target = 340.0
        status_target = "RUNNING"

        def get_sample(step):
            # Phase 1: Nominal operation (Step 0 -> 120)
            if step < 120:
                base_i = 4.25 + 0.15 * math.sin(step * 0.1) + random.gauss(0, 0.05)
                base_spd = 800.0
            # Phase 2: Incipient bearing spalling/wear (Step 120 -> 220)
            elif step < 220:
                prog = (step - 120) / 100.0
                spike = 0.85 if random.random() < 0.15 else 0.0
                base_i = (4.3 + prog * 1.5) + spike + random.gauss(0, 0.12)
                base_spd = 790.0 - (prog * 30.0)
            # Phase 3: Severe mechanical breakdown & rotor jam (Step 220 -> 280)
            else:
                base_i = random.uniform(7.8, 9.6) + random.choice([0.0, 1.2, -0.8])
                base_spd = random.uniform(550.0, 680.0)

            spd, temp = sim.update_physics(base_i, base_spd, dt=0.5)
            return round(base_i, 3), spd, temp

    # -------------------------------------------------------------------------
    # SCENARIO 2: SUDDEN MECHANICAL JAM / ROTOR LOCK
    # -------------------------------------------------------------------------
    elif scenario_id == 2:
        print("[KỊCH BẢN 2] MÔ PHỎNG SỰ CỐ KẸT TẢI ĐỘT NGỘT (SUDDEN ROTOR JAMMING)")
        print("Mô tả: Đang khuấy ổn định, vật thể lạ kẹt vào cánh khuấy khiến dòng vọt > 9A dốc đứng, tốc độ tụt.")
        total_steps = 200
        runtime_target = 180.0
        status_target = "RUNNING"

        def get_sample(step):
            if step < 50:
                base_i = 4.30 + random.gauss(0, 0.04)
                base_spd = 800.0
            else:
                # Locked rotor current (> 9A)
                base_i = 9.8 + random.gauss(0, 0.35)
                base_spd = 120.0
            spd, temp = sim.update_physics(base_i, base_spd, dt=0.5)
            return round(base_i, 3), spd, temp

    # -------------------------------------------------------------------------
    # SCENARIO 3: INCIPIENT BEARING CHIPPING / DEFECT
    # -------------------------------------------------------------------------
    elif scenario_id == 3:
        print("[KỊCH BẢN 3] MÔ PHỎNG MÒN Ổ BI SỚM (INCIPIENT BEARING DEFECT)")
        print("Mô tả: Dòng trung bình ~5.5A-6.2A, xuất hiện vi dao động tần số cao và xung gai nhọn (High Kurtosis/Crest Factor).")
        total_steps = 200
        runtime_target = 310.0
        status_target = "RUNNING"

        def get_sample(step):
            transient_impact = 1.2 if (step % 7 == 0) else 0.0
            base_i = 5.2 + transient_impact + random.gauss(0, 0.22)
            base_spd = 785.0
            spd, temp = sim.update_physics(base_i, base_spd, dt=0.5)
            return round(base_i, 3), spd, temp

    # -------------------------------------------------------------------------
    # SCENARIO 4: TRANSIENT INGREDIENT IN-RUSH / VISCOSITY SHOCK
    # -------------------------------------------------------------------------
    elif scenario_id == 4:
        print("[KỊCH BẢN 4] MÔ PHỎNG SỐC TẢI TẠM THỜI (TRANSIENT IN-RUSH / VISCOSITY SHOCK)")
        print("Mô tả: Nạp lượng lớn sữa bột/đường làm dòng tăng trong 20s rồi tự phục hồi về bình thường.")
        total_steps = 200
        runtime_target = 125.0
        status_target = "RUNNING"

        def get_sample(step):
            if step < 40:
                base_i = 4.25 + random.gauss(0, 0.04)
            elif step < 85:
                base_i = 7.1 + random.gauss(0, 0.15)
            else:
                base_i = 4.65 + random.gauss(0, 0.06)

            spd, temp = sim.update_physics(base_i, 800.0, dt=0.5)
            return round(base_i, 3), spd, temp

    # -------------------------------------------------------------------------
    # SCENARIO 5: OPTIMAL BASELINE (Normal Operation)
    # -------------------------------------------------------------------------
    else:
        print("[KỊCH BẢN 5] MÔ PHỎNG VẬN HÀNH ĐẠT CHUẨN HOÀN TOÀN (OPTIMAL BASELINE)")
        print("Mô tả: Động cơ vận hành lý tưởng, dòng điện ổn định 4.25A, tốc độ 800 RPM.")
        total_steps = 200
        runtime_target = 30.0
        status_target = "RUNNING"

        def get_sample(step):
            base_i = 4.25 + random.gauss(0, 0.03)
            spd, temp = sim.update_physics(base_i, 800.0, dt=0.5)
            return round(base_i, 3), spd, temp

    print(f"Tổng số chu kỳ đo: {total_steps} mẫu | Chế độ: {'Thời gian thực (Live 0.25s)' if mode_live else 'Nạp nhanh (Fast Bulk Ingest)'}")
    print("=" * 75)

    cursor.execute("""
    UPDATE dbo.Equipment_Master 
    SET CurrentStatus = ?, 
        Runtime_Hours = ?,
        TotalStarts = TotalStarts + 1
    WHERE EquipmentCode = ?
""", (status_target, runtime_target, EQUIPMENT_CODE))
    conn.commit()

    now = datetime.now()

    for i in range(total_steps):
        current_val, speed_val, temp_val = get_sample(i)
        
        timestamp = now + timedelta(milliseconds=i * 250)

        records_buffer.append((order_code, TAG_CURRENT, current_val, 'A', timestamp))
        records_buffer.append((order_code, TAG_SPEED, speed_val, 'RPM', timestamp))
        records_buffer.append((order_code, TAG_TEMP, temp_val, '°C', timestamp))

        if mode_live:
            insert_telemetry_batch(cursor, [
                (order_code, TAG_CURRENT, current_val, 'A', timestamp),
                (order_code, TAG_SPEED, speed_val, 'RPM', timestamp),
                (order_code, TAG_TEMP, temp_val, '°C', timestamp)
            ])
            conn.commit()
            
            # Professional progress feedback
            sys.stdout.write(
                f"\r[TIẾN ĐỘ {i+1:03d}/{total_steps:03d}] "
                f"Dòng điện: {current_val:5.2f} A | "
                f"Tốc độ: {speed_val:5.1f} RPM | "
                f"Nhiệt độ: {temp_val:4.1f} °C"
            )
            sys.stdout.flush()
            time.sleep(0.25)

    if not mode_live:
        print(">> Đang nạp nhanh (bulk insert) toàn bộ tập dữ liệu vào dbo.PLC_Datalog...")
        insert_telemetry_batch(cursor, records_buffer)
        conn.commit()
        print(f">> Thành công nạp {len(records_buffer)} bản ghi đo đa biến vào dbo.PLC_Datalog!")

    conn.close()
    print("\n[HOÀN TẤT] Kịch bản mô phỏng đã hoàn tất, dữ liệu sẵn sàng cho PdM Machine Learning.")


def reset_equipment_benchmark():
    """Reset equipment benchmark in dbo.Equipment_Master to factory default."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE dbo.Equipment_Master 
        SET CurrentStatus = 'STOP', Runtime_Hours = 0.0
        WHERE EquipmentCode = ?
    """, (EQUIPMENT_CODE,))
    conn.commit()
    conn.close()
    print("[RESET THÀNH CÔNG] Đã đưa động cơ AGITATOR_MIX về trạng thái ban đầu: CurrentStatus='STOP', Runtime_Hours=0.0.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Industrial Multi-Scenario Fault Injection Harness")
    parser.add_argument("--scenario", "-s", type=int, choices=[1, 2, 3, 4, 5, 6], help="Kịch bản mô phỏng (1-6)")
    parser.add_argument("--mode", "-m", choices=["live", "bulk"], default=None, help="Chế độ nạp dữ liệu: live hoặc bulk")
    parser.add_argument("--reset", action="store_true", help="Reset thiết bị về mặc định")

    args, unknown = parser.parse_known_args()

    if args.reset or (args.scenario == 6):
        reset_equipment_benchmark()
        sys.exit(0)

    if args.scenario is not None:
        scenario_choice = args.scenario
        is_live_mode = (args.mode == "live") if args.mode else False
        run_scenario(scenario_choice, mode_live=is_live_mode)
        sys.exit(0)

    # Interactive CLI loop (never exits automatically, press 0 to exit)
    while True:
        print("\n" + "=" * 65)
        print("  BỘ GIẢ LẬP SỰ CỐ ĐỘNG CƠ CÔNG NGHIỆP (PdM HARNESS) ")
        print("=" * 65)
        print(" [1] Run-to-Failure : Toàn chu trình (Khỏe -> Mòn ổ bi -> Hỏng kẹt tải)")
        print(" [2] Rotor Jam      : Đột ngột kẹt cánh khuấy (Dòng dâng > 9A dốc đứng)")
        print(" [3] Bearing Fault  : Mòn rỗ ổ bi sớm (Xuất hiện gai nhọn vi mô ~5.5-6.2A)")
        print(" [4] Transient Shock: Sốc tải tạm thời khi nạp bột (Tự phục hồi)")
        print(" [5] Optimal Baseline: Vận hành hoàn hảo danh định (4.25A, 800 RPM)")
        print(" [6] Reset Benchmark: Đưa thiết bị về trạng thái máy xuất xưởng (STOP)")
        print(" [0] Thoát          : Kết thúc chương trình")
        print("-" * 65)

        try:
            choice = input("Chọn kịch bản mô phỏng [0-6] (Mặc định: Nạp nhanh tức thì): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nĐã nhận tín hiệu dừng. Tạm biệt!")
            sys.exit(0)

        if choice == "0":
            print("\nĐã thoát chương trình mô phỏng.")
            sys.exit(0)
        elif choice == "6":
            reset_equipment_benchmark()
            print("\n>> ĐÃ NẠP DỮ LIỆU XONG! Dữ liệu đã vào SQL Server.")
            try:
                input(">> Nhấn phím ENTER để quay lại menu chính chọn kịch bản tiếp theo...")
            except (KeyboardInterrupt, EOFError):
                sys.exit(0)
        elif choice in ["1", "2", "3", "4", "5"]:
            # Default to fast bulk mode so user only needs to press a single number
            run_scenario(int(choice), mode_live=False)
            print("\n>> ĐÃ NẠP DỮ LIỆU XONG! Dữ liệu đã vào SQL Server.")
            try:
                input(">> Nhấn phím ENTER để quay lại menu chính chọn kịch bản tiếp theo...")
            except (KeyboardInterrupt, EOFError):
                sys.exit(0)
        else:
            print(">> Lựa chọn không hợp lệ, vui lòng chọn số từ 0 đến 6.")