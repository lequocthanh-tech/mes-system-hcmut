"""
backend/ml_pdm_engine.py
Predictive Maintenance (PdM) Machine Learning Evaluation Pipeline
Aligned with physical SQL Server schema: dbo.Equipment_Master & dbo.PLC_Datalog
Motor Current Signature Analysis (MCSA) & Thermal Dynamics Anomaly Detection
"""

import sys
import os
import json
import pyodbc
import numpy as np
from scipy import stats
from sklearn.ensemble import IsolationForest
from pdm_feature_extractor import TimeSeriesFeatureExtractor

DB_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\WINCC;"
    "DATABASE=MES_Milk_Production;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

TAG_MAPPING = {
    "AGITATOR_MIX": {
        "current": "Motor_1.Current",
        "speed": "Motor_1.Speed",
        "temp": "Motor_1.Temp",
        "vibration": "Motor_1.Vibration",
        "nominal_current": 4.5,
    },
    "PUMP_INLET_MILK": {
        "current": "Motor_2.Current",
        "speed": "Motor_2.Speed",
        "temp": "Motor_2.Temp",
        "vibration": "Motor_2.Vibration",
        "nominal_current": 5.0,
    },
    "PUMP_INLET_SUGAR": {
        "current": "Motor_5.Current",
        "speed": "Motor_5.Speed",
        "temp": "Motor_5.Temp",
        "vibration": "Motor_5.Vibration",
        "nominal_current": 4.0,
    },
    "PUMP_INLET_ADDITIVE": {
        "current": "Motor_6.Current",
        "speed": "Motor_6.Speed",
        "temp": "Motor_6.Temp",
        "vibration": "Motor_6.Vibration",
        "nominal_current": 3.0,
    },
    "PUMP_INLET": {
        "current": "Motor_2.Current",
        "speed": "Motor_2.Speed",
        "temp": "Motor_2.Temp",
        "vibration": "Motor_2.Vibration",
        "nominal_current": 5.0,
    },
    "PUMP_OUTLET": {
        "current": "Motor_3.Current",
        "speed": "Motor_3.Speed",
        "temp": "Motor_3.Temp",
        "vibration": "Motor_3.Vibration",
        "nominal_current": 5.0,
    },
    "CHILLER_COOL": {
        "current": "Motor_4.Current",
        "speed": "Motor_4.Speed",
        "temp": "Motor_4.Temp",
        "vibration": "Motor_4.Vibration",
        "nominal_current": 6.0,
    },
    "HEATER_UHT": {
        "current": "Heater_1.Current",
        "speed": "Heater_1.Speed",
        "temp": "Heater_1.Temp",
        "vibration": "Heater_1.Vibration",
        "nominal_current": 10.0,
    },
}


def get_maintenance_telemetry_tags(eq_code: str) -> dict:
    """Check dynamic maintenance tags from tag_mappings.json for the given equipment."""
    try:
        tag_file = os.path.join(os.path.dirname(__file__), "tag_mappings.json")
        if os.path.exists(tag_file):
            with open(tag_file, "r", encoding="utf-8") as f:
                mappings = json.load(f)
                maint = mappings.get("maintenance", {})
                if eq_code in maint:
                    return maint[eq_code]
                for k, v in maint.items():
                    if k in eq_code or eq_code in k:
                        return v
    except Exception:
        pass
    return {}


def analyze_pdm_for_equipment(equipment_code: str = "AGITATOR_MIX", window_size: int = 200) -> dict:
    """
    End-to-end Machine Learning Predictive Maintenance evaluation pipeline for industrial equipment.
    
    1. Feature Extraction & Multivariate Time-Series from dbo.PLC_Datalog
    2. Unsupervised Anomaly Detection using Isolation Forest against Nominal Baseline & Physical Bounds
    3. Composite Health Index (HI) & Remaining Useful Life (RUL) estimation
    """
    eq_code = equipment_code.strip().upper()
    mapping = TAG_MAPPING.get(eq_code, {
        "current": f"{eq_code}.Current",
        "speed": f"{eq_code}.Speed",
        "temp": f"{eq_code}.Temp",
        "vibration": f"{eq_code}.Vibration",
        "nominal_current": 5.0,
    })

    # Extended dynamic maintenance tag lookup from tag_mappings.json
    dynamic_maint_tags = get_maintenance_telemetry_tags(eq_code)

    try:
        import db_connector
        conn = db_connector.get_connection(timeout=5) or pyodbc.connect(DB_CONN_STR, timeout=5)
    except Exception:
        conn = pyodbc.connect(DB_CONN_STR, timeout=5)
    cursor = conn.cursor()

    # 1. Query equipment master data strictly matching schema
    cursor.execute("""
        SELECT EquipmentID, EquipmentCode, EquipmentName, CurrentStatus, 
               Runtime_Hours, Maintenance_Limit_Hours, TotalStarts
        FROM dbo.Equipment_Master 
        WHERE EquipmentCode = ?
    """, (eq_code,))
    eq_row = cursor.fetchone()

    if not eq_row:
        conn.close()
        return {"error": f"Không tìm thấy thiết bị mã {eq_code} trong Equipment_Master"}

    eq_id = int(eq_row[0])
    eq_name = str(eq_row[2] or eq_code)
    op_status = str(eq_row[3] or "STOP").strip().upper()
    runtime_hours = float(eq_row[4] or 0.0)
    limit_hours = float(eq_row[5] or 350.0)
    total_starts = int(eq_row[6] or 0)

    # 2. Query the most recent telemetry samples from dbo.PLC_Datalog
    current_tag = mapping["current"]
    temp_tag = mapping.get("temp", f"{eq_code}.Temp")
    maint_current = dynamic_maint_tags.get("current_act") or ""
    maint_temp = dynamic_maint_tags.get("temp_act") or ""

    cursor.execute("""
        SELECT TOP (?) Value 
        FROM dbo.PLC_Datalog 
        WHERE TagName = ? OR TagName LIKE ? OR TagName = ? OR (TagName = 'Motor_1' AND ? = 'AGITATOR_MIX')
        ORDER BY ReadTime DESC, LogID DESC
    """, (window_size, current_tag, f"{current_tag}%", maint_current, eq_code))
    raw_currents = cursor.fetchall()

    cursor.execute("""
        SELECT TOP (?) Value 
        FROM dbo.PLC_Datalog 
        WHERE TagName = ? OR TagName LIKE ? OR TagName = ? OR (TagName = 'Motor_1.Temp' AND ? = 'AGITATOR_MIX')
        ORDER BY ReadTime DESC, LogID DESC
    """, (window_size, temp_tag, f"{temp_tag}%", maint_temp, eq_code))
    raw_temps = cursor.fetchall()
    conn.close()

    # Fallback to kepware_gateway.latest_cache["tags"] if PLC_Datalog buffer is empty
    if not raw_currents:
        try:
            import kepware_gateway
            cache_tags = kepware_gateway.latest_cache.get("tags", {})
            for t_node, t_val in cache_tags.items():
                t_name = str(t_val.get("tag_name", t_node)).upper()
                if (eq_code in t_name or eq_code in t_node) and ("CURRENT" in t_name or "AMP" in t_name or t_node == maint_current):
                    v = float(t_val.get("value", 0.0) or 0.0)
                    if v > 0.05:
                        raw_currents = [(v,)] * 30
                        break
        except Exception:
            pass

    # -------------------------------------------------------------------------
    # EDGE CASE 1: Equipment in STOP / IDLE / STANDBY condition or zero current
    # -------------------------------------------------------------------------
    is_stopped_status = op_status in ["STOP", "IDLE", "STOPPED", "OFF", "STANDBY"]
    has_zero_current = bool(raw_currents and float(raw_currents[0][0]) < 0.2)

    if is_stopped_status or has_zero_current or not raw_currents:
        rul_hours = max(0.0, round(limit_hours - runtime_hours, 1))
        return {
            "equipment_code": eq_code,
            "equipment_name": eq_name,
            "condition": "IDLE",
            "health_index": 100.0,
            "rul_hours": rul_hours,
            "runtime_hours": runtime_hours,
            "limit_hours": limit_hours,
            "total_starts": total_starts,
            "rms_current": 0.0,
            "peak_to_peak": 0.0,
            "crest_factor": 0.0,
            "kurtosis": 0.0,
            "skewness": 0.0,
            "micro_fluctuations": 0.0,
            "anomaly_ratio_percent": 0.0,
            "recommendation": "Thiết bị đang dừng nghỉ/standby, hệ thống ở trạng thái danh định sẵn sàng vận hành."
        }

    # -------------------------------------------------------------------------
    # EDGE CASE 2: Insufficient sample count for statistical ML (< 25 samples)
    # -------------------------------------------------------------------------
    if len(raw_currents) < 25:
        time_ratio = min(runtime_hours / limit_hours, 1.0) if limit_hours > 0 else 0.0
        temp_hi = max(0.0, round(100.0 * (1.0 - (0.4 * time_ratio)), 1))
        rul_hours = max(0.0, round(limit_hours - runtime_hours, 1))
        first_val = float(raw_currents[0][0]) if raw_currents else 0.0
        return {
            "equipment_code": eq_code,
            "equipment_name": eq_name,
            "condition": "CALIBRATING",
            "health_index": temp_hi,
            "rul_hours": rul_hours,
            "runtime_hours": runtime_hours,
            "limit_hours": limit_hours,
            "total_starts": total_starts,
            "rms_current": round(first_val, 2),
            "peak_to_peak": 0.0,
            "crest_factor": 0.0,
            "kurtosis": 0.0,
            "skewness": 0.0,
            "micro_fluctuations": 0.0,
            "anomaly_ratio_percent": 0.0,
            "recommendation": f"Đang tích lũy mẫu đo cảm biến ({len(raw_currents)}/25 mẫu). Đang ước tính sơ bộ theo số giờ chạy máy."
        }

    # -------------------------------------------------------------------------
    # 3. Time-Domain Physical Feature Extraction using TimeSeriesFeatureExtractor
    # -------------------------------------------------------------------------
    current_series = np.array([float(r[0]) for r in raw_currents], dtype=np.float64)
    features = TimeSeriesFeatureExtractor.extract_scalar_features(current_series)
    rms_current = features["rms"]
    p2p = features["peak_to_peak"]
    crest_factor = features["crest_factor"]
    kurtosis_val = features["kurtosis"]
    skewness_val = features["skewness"]

    # Micro-fluctuations ratio (z-score > 2.5 sigma)
    micro_fluc = TimeSeriesFeatureExtractor.detect_micro_fluctuations(current_series, threshold_sigma=2.5)

    # -------------------------------------------------------------------------
    # 4. Multivariate Nominal Baseline Construction & Isolation Forest
    # -------------------------------------------------------------------------
    nominal_i = float(mapping.get("nominal_current", 5.0))
    nominal_temp = 45.0

    # Generate synthetic nominal operating baseline (healthy equipment operating at rated parameters)
    np.random.seed(42)
    n_baseline = 250
    baseline_current = np.random.normal(loc=nominal_i, scale=0.03 * nominal_i, size=(n_baseline, 1))

    if raw_temps and len(raw_temps) >= 25:
        min_len = min(len(raw_currents), len(raw_temps))
        c_sub = current_series[:min_len].reshape(-1, 1)
        t_sub = np.array([float(r[0]) for r in raw_temps[:min_len]], dtype=np.float64).reshape(-1, 1)
        data_matrix = np.hstack((c_sub, t_sub))
        baseline_temp = np.random.normal(loc=nominal_temp, scale=1.5, size=(n_baseline, 1))
        baseline_matrix = np.hstack((baseline_current, baseline_temp))
    else:
        data_matrix = current_series.reshape(-1, 1)
        baseline_matrix = baseline_current

    # Train Isolation Forest on the nominal baseline (contamination=0.01)
    clf = IsolationForest(contamination=0.01, random_state=42)
    clf.fit(baseline_matrix)

    # Score actual operational telemetry against nominal baseline
    preds = clf.predict(data_matrix)
    forest_anomaly_ratio = float(np.mean(preds == -1))

    # Evaluate physical boundary violations:
    # 1. Overload threshold: current exceeding nominal * 1.15 (15% electrical/mechanical overload)
    overload_ratio = float(np.mean(current_series > (nominal_i * 1.15)))

    # Composite physical & ML anomaly ratio combining Isolation Forest, overload, and 2.5-sigma bounds
    anomaly_ratio = float(min(1.0, max(forest_anomaly_ratio, overload_ratio, micro_fluc)))

    # -------------------------------------------------------------------------
    # 5. Composite Health Index (HI) & Remaining Useful Life (RUL)
    # -------------------------------------------------------------------------
    # Weights: 40% Runtime Wear + 60% Physical Anomaly
    w_runtime = 0.4
    w_physical = 0.6
    runtime_penalty = min(runtime_hours / limit_hours, 1.0) if limit_hours > 0 else 0.0
    physical_penalty = min((anomaly_ratio * 2.5) + (micro_fluc * 2.0), 1.0)

    # Penalization if RMS exceeds nominal current
    if rms_current > nominal_i:
        overload = (rms_current - nominal_i) / nominal_i
        physical_penalty = min(physical_penalty + (overload * 2.0), 1.0)

    total_penalty = (w_runtime * runtime_penalty) + (w_physical * physical_penalty)
    health_index = max(0.0, round(100.0 * (1.0 - total_penalty), 1))

    # Degradation acceleration factor & RUL estimation
    fail_threshold_hi = 40.0
    remaining_nominal = max(0.0, limit_hours - runtime_hours)
    acceleration = max(1.0, 1.0 + (physical_penalty * 3.0))
    rul_hours = round((remaining_nominal * max(0.0, (health_index - fail_threshold_hi) / 60.0)) / acceleration, 1)

    # -------------------------------------------------------------------------
    # 6. Condition Classification & Prescriptive Recommendation
    # -------------------------------------------------------------------------
    if health_index >= 80.0:
        condition = "HEALTHY"
        recommendation = "Động cơ vận hành tối ưu, biên độ dòng điện và dạng sóng đạt tiêu chuẩn kỹ thuật (Baseline)."
    elif health_index >= 50.0:
        condition = "WARNING"
        recommendation = (
            f"Cảnh báo suy thoái sớm (Độ lệch bất thường: {round(anomaly_ratio*100, 1)}%, "
            f"Crest Factor: {round(crest_factor, 2)}). Cần kiểm tra độ rơ trục và bôi trơn bạc đạn sau ca."
        )
    else:
        condition = "CRITICAL"
        recommendation = (
            f"NGUY CƠ SỰ CỐ KHẨN CẤP: Dòng RMS dâng cao ({round(rms_current, 2)}A > {nominal_i}A), "
            f"méo dạng sóng {round(anomaly_ratio*100, 1)}%. Nguy cơ kẹt cơ khí/hỏng cách điện, lập lịch dừng máy kiểm tra ngay!"
        )

    return {
        "equipment_code": eq_code,
        "equipment_name": eq_name,
        "condition": condition,
        "health_index": health_index,
        "rul_hours": rul_hours,
        "runtime_hours": runtime_hours,
        "limit_hours": limit_hours,
        "total_starts": total_starts,
        "rms_current": round(rms_current, 2),
        "peak_to_peak": round(p2p, 2),
        "crest_factor": round(crest_factor, 2),
        "kurtosis": round(kurtosis_val, 2),
        "skewness": round(skewness_val, 2),
        "micro_fluctuations": round(micro_fluc, 4),
        "anomaly_ratio_percent": round(anomaly_ratio * 100, 1),
        "recommendation": recommendation,
    }


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    target_eq = sys.argv[1] if len(sys.argv) > 1 else "AGITATOR_MIX"
    print(f"Executing PdM diagnostic analysis for [{target_eq}]...")
    result = analyze_pdm_for_equipment(target_eq)
    for k, v in result.items():
        print(f"  {k}: {v}")