"""
backend/mes_mcp_server.py
Industrial MES Model Context Protocol (FastMCP) Gateway & Agent Server
Level 3 MOM Operations Copilot with Machine Learning Predictive Maintenance (PdM)
"""

import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import pyodbc
from mcp.server.fastmcp import FastMCP
from ml_pdm_engine import analyze_pdm_for_equipment, TAG_MAPPING

# 1. Initialize FastMCP Server
mcp = FastMCP("MES-Operations-Copilot")

# 2. Database Connection Parameters
DB_CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\WINCC;"
    "DATABASE=MES_Milk_Production;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)


def execute_query(sql: str, params=()):
    """Execute SQL query safely and return results as list of dictionaries."""
    conn = None
    try:
        import db_connector
        conn = db_connector.get_connection(timeout=5)
    except Exception:
        pass
    if not conn:
        conn = pyodbc.connect(DB_CONN_STR, timeout=5)
    cursor = conn.cursor()
    cursor.execute(sql, params)

    if cursor.description:
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
    else:
        results = []

    conn.commit()
    conn.close()
    return results


# ==============================================================================
# PART 1: CORE OPERATIONAL TOOLS (ISA-95 LEVEL 3 MOM)
# ==============================================================================

@mcp.tool()
def get_customers() -> str:
    """Tra cứu toàn bộ danh sách khách hàng, đối tác sản xuất từ dbo.Customers."""
    try:
        data = execute_query("SELECT CustomerID, CustomerCode, CustomerName, ContactEmail, PhoneNumber, OrderPriority FROM dbo.Customers")
        if not data:
            return "Bảng khách hàng hiện chưa có dữ liệu."
        return str(data)
    except Exception as e:
        return f"Lỗi truy vấn bảng Customers: {str(e)}"


@mcp.tool()
def get_active_orders() -> str:
    """Tra cứu danh sách toàn bộ các lệnh/đơn hàng sản xuất từ dbo.Orders."""
    try:
        data = execute_query("""
            SELECT Order_ID, OrderCode, Recipe_ID, TargetVolume, Status, ScheduledStartTime
            FROM dbo.Orders
            ORDER BY COALESCE(ScheduledStartTime, CreatedDate) DESC
        """)
        if not data:
            return "Hiện tại không có đơn hàng nào trong hệ thống."
        return str(data)
    except Exception as e:
        return f"Lỗi truy vấn bảng Orders: {str(e)}"


@mcp.tool()
def get_recipe_details(recipe_name_or_id: str = "") -> str:
    """Tra cứu danh mục công thức sản xuất hoặc chi tiết thông số từ dbo.Recipes và dbo.Recipe_Detail."""
    try:
        if recipe_name_or_id:
            sql = """
                SELECT Recipe_ID, Recipe_Code, Recipe_Name, Target_Temp_Hot, Target_Temp_Cold 
                FROM dbo.Recipes 
                WHERE Recipe_Name LIKE ? OR Recipe_Code LIKE ? OR CAST(Recipe_ID AS NVARCHAR) = ?
            """
            recipes = execute_query(sql, (f"%{recipe_name_or_id}%", f"%{recipe_name_or_id}%", recipe_name_or_id))
            if not recipes:
                return "Không tìm thấy công thức yêu cầu."
            for r in recipes:
                r_id = r.get("Recipe_ID")
                details = execute_query("""
                    SELECT Material_Code, Material_Name, Percentage, TolerancePercent 
                    FROM dbo.Recipe_Detail 
                    WHERE Recipe_ID = ?
                """, (r_id,))
                r["details"] = details
            return str(recipes)
        else:
            data = execute_query("SELECT Recipe_ID, Recipe_Code, Recipe_Name, Target_Temp_Hot, Target_Temp_Cold FROM dbo.Recipes")
            return str(data) if data else "Không tìm thấy công thức yêu cầu."
    except Exception as e:
        return f"Lỗi truy vấn công thức: {str(e)}"


@mcp.tool()
def check_material_inventory() -> str:
    """Kiểm tra lượng tồn kho nguyên liệu (sữa thô, đường, phụ gia) trong Silo chứa từ dbo.Material_Stock."""
    try:
        data = execute_query("""
            SELECT Material_Code, Material_Name, AssignedTank, CurrentStock, Unit, TankCapacity, MinSafetyThreshold 
            FROM dbo.Material_Stock
        """)
        return str(data) if data else "Không có dữ liệu tồn kho."
    except Exception as e:
        return f"Lỗi truy vấn kho nguyên liệu: {str(e)}"


@mcp.tool()
def check_equipment_health() -> str:
    """
    Tra cứu danh sách thiết bị tổng quát và số giờ chạy tích lũy từ dbo.Equipment_Master.
    Khớp chính xác các cột: EquipmentID, EquipmentCode, EquipmentName, CurrentStatus, Runtime_Hours, Maintenance_Limit_Hours.
    """
    try:
        data = execute_query("""
            SELECT EquipmentID, EquipmentCode, EquipmentName, CurrentStatus, 
                   Runtime_Hours, Maintenance_Limit_Hours 
            FROM dbo.Equipment_Master
        """)
        return str(data) if data else "Không tìm thấy dữ liệu thiết bị."
    except Exception as e:
        return f"Lỗi truy vấn thiết bị: {str(e)}"


@mcp.tool()
def get_recent_production_logs(limit: int = 10) -> str:
    """Tra cứu các dòng ghi nhận cảm biến gần nhất từ dbo.PLC_Datalog."""
    try:
        safe_limit = max(1, min(int(limit), 200))
        data = execute_query(f"""
            SELECT TOP {safe_limit} LogID, OrderCode, TagName, Value, Unit, ReadTime 
            FROM dbo.PLC_Datalog 
            ORDER BY LogID DESC
        """)
        return str(data) if data else "Không có nhật ký cảm biến."
    except Exception as e:
        return f"Lỗi truy vấn PLC_Datalog: {str(e)}"


# ==============================================================================
# PART 2: MACHINE LEARNING PREDICTIVE MAINTENANCE (PdM) TOOLS
# ==============================================================================

@mcp.tool()
def predict_equipment_health(equipment_code: str = "AGITATOR_MIX") -> str:
    """
    Phân tích chuyên sâu tình trạng cơ học và Bảo trì dự đoán (PdM) bằng Machine Learning.
    Thuật toán Unsupervised Isolation Forest quét chuỗi thời gian dòng điện/nhiệt độ từ dbo.PLC_Datalog.
    Trả về:
      - Chỉ số sức khỏe (Health Index %)
      - Tuổi thọ an toàn còn lại (Remaining Useful Life - RUL giờ)
      - Dòng điện hiệu dụng (RMS), độ méo sóng Kurtosis, Crest Factor, và tỷ lệ vi dao động
      - Khuyến nghị hành động kỹ thuật trực tiếp cho bảo trì
    Tham số:
      equipment_code: Mã thiết bị (ví dụ: 'AGITATOR_MIX', 'PUMP_INLET', 'PUMP_OUTLET', 'CHILLER_COOL')
    """
    res = analyze_pdm_for_equipment(equipment_code)
    if "error" in res:
        return f"❌ Lỗi phân tích PdM: {res['error']}"

    icon = "🟢" if res["condition"] == "HEALTHY" else ("🟡" if res["condition"] == "WARNING" else ("🔴" if res["condition"] == "CRITICAL" else "⚪"))

    report = [
        "⚙️ [BÁO CÁO BẢO TRÌ DỰ ĐOÁN AI - MACHINE LEARNING (MCSA)]",
        f"• Thiết bị: {res['equipment_name']} [{res['equipment_code']}]",
        f"• Tình trạng đánh giá: {icon} 【{res['condition']}】",
        f"• Chỉ số Sức khỏe (Health Index): {res['health_index']}% / 100.0%",
        f"• Thời gian vận hành an toàn còn lại (RUL): {res['rul_hours']} giờ",
        f"• Giờ chạy máy tích lũy: {res['runtime_hours']} / {res['limit_hours']} giờ định mức",
        f"• Tổng số lần khởi động (Starts): {res.get('total_starts', 0)}",
        f"• Dòng điện hiệu dụng (RMS): {res['rms_current']} A",
        f"• Biên độ Đỉnh-Đỉnh (Peak-to-Peak): {res.get('peak_to_peak', 0.0)} A",
        f"• Hệ số Đỉnh (Crest Factor): {res.get('crest_factor', 0.0)} | Kurtosis: {res.get('kurtosis', 0.0)}",
        f"• Tỷ lệ vi dao động (> 2.5σ): {round(res.get('micro_fluctuations', 0.0) * 100, 2)}%",
        f"• Độ lệch bất thường dạng sóng (Anomaly Ratio): {res['anomaly_ratio_percent']}%",
        f"• Khuyến nghị kỹ thuật: {res['recommendation']}"
    ]
    return "\n".join(report)


@mcp.tool()
def get_fleet_health_overview() -> str:
    """
    Quét và lập báo cáo sức khỏe bảo trì dự đoán cho toàn bộ đội tàu/cụm máy móc trong nhà máy:
    Quét các thiết bị chủ lực: AGITATOR_MIX, PUMP_INLET, PUMP_OUTLET, CHILLER_COOL.
    Trả về bảng tổng hợp trực quan với icon cảnh báo (🟢 HEALTHY, 🟡 WARNING, 🔴 CRITICAL, ⚪ IDLE).
    """
    fleet_codes = ["AGITATOR_MIX", "PUMP_INLET", "PUMP_OUTLET", "CHILLER_COOL"]
    lines = ["📋 [BẢNG TỔNG HỢP SỨC KHỎE THIẾT BỊ TOÀN NHÀ MÁY (PREDICTIVE FLEET DASHBOARD)]"]
    lines.append("-" * 75)

    for code in fleet_codes:
        res = analyze_pdm_for_equipment(code)
        if "error" in res:
            lines.append(f"⚪ {code}: Không tìm thấy thông tin ({res['error']})")
        else:
            cond = res["condition"]
            icon = "🟢" if cond == "HEALTHY" else ("🟡" if cond == "WARNING" else ("🔴" if cond == "CRITICAL" else "⚪"))
            lines.append(
                f"{icon} {res['equipment_code']} | {res['equipment_name']}: "
                f"Health Index = {res['health_index']:5.1f}% | "
                f"RUL = {res['rul_hours']:5.1f}h | "
                f"RMS = {res['rms_current']:4.2f}A | "
                f"Status: [{cond}]"
            )

    lines.append("-" * 75)
    lines.append("💡 Gợi ý: Gọi tool predict_equipment_health(equipment_code='...') để nhận báo cáo chẩn đoán chi tiết.")
    return "\n".join(lines)


# ==============================================================================
# SERVER ENTRYPOINT
# ==============================================================================

if __name__ == "__main__":
    mcp.run(transport="stdio")