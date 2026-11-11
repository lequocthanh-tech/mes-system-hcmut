"""
/* Hallmark · component: OperationsOpcRoutes · register: industrial-workbench
 * standards: ISA-88 Batch Control / ISA-95 MOM / ISA-101 HMI
 * strict: Central OPC UA Gateway Session Reuse (Port 49320)
 */

FastAPI RESTful Routes for Operations Dual-Run SIMIT Twin Supervision
and Real-Time Deviation Benchmarking.
"""

import sys
import os
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

# Ensure backend directory in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from . import batch_engine
except (ImportError, ValueError):
    import batch_engine

logger = logging.getLogger("OperationsOpcRoutes")

router = APIRouter(tags=["Operations & Dual-Run SIMIT Twin Engine"])

# ============================================================================
# PAYLOAD MODELS
# ============================================================================

class ExecutionModePayload(BaseModel):
    execution_mode: str  # mode1_physical | mode2_simit | mode3_dual

class DispatchRecipePayload(BaseModel):
    order_code: str
    execution_mode: Optional[str] = "mode3_dual"
    recipe_name: Optional[str] = "Fresh Pasteurized Milk"
    target_volume: Optional[float] = 1000.0
    setpoints: Optional[Dict[str, float]] = None
    current_batch: Optional[int] = None

class StartBatchPayload(BaseModel):
    order_code: Optional[str] = None
    execution_mode: Optional[str] = None

class CompleteCellPayload(BaseModel):
    cell: str  # 'cell1' or 'cell2'

# ============================================================================
# ROUTE ENDPOINTS
# ============================================================================

@router.get("/api/operations/dual-run/status")
async def get_dual_run_status():
    """
    Returns live Dual-Run benchmark status:
    - Active execution mode (Physical / SIMIT / Dual-Run)
    - Independent completion flags and elapsed cycle times
    - Recipe handshake state
    """
    try:
        completion_data = batch_engine.evaluate_completion()
        return {
            "status": "success",
            "state": batch_engine.state.batch_state,
            "state_source": batch_engine.state.state_source,
            "virtual_state_fallback": batch_engine.state.virtual_state_fallback,
            "execution_mode": batch_engine.state.execution_mode,
            "order_code": batch_engine.state.order_code,
            "recipe_name": batch_engine.state.recipe_name,
            "cell1_ack": batch_engine.state.cell1_ack,
            "cell2_ack": batch_engine.state.cell2_ack,
            "cell1_complete": batch_engine.state.cell1_complete,
            "cell2_complete": batch_engine.state.cell2_complete,
            "t_start_cell1": batch_engine.state.t_start_cell1,
            "t_start_cell2": batch_engine.state.t_start_cell2,
            "t_end_cell1": batch_engine.state.t_end_cell1,
            "t_end_cell2": batch_engine.state.t_end_cell2,
            **completion_data
        }
    except Exception as exc:
        logger.warning(f"[get_dual_run_status] Fallback: {exc}")
        return {
            "status": "warning",
            "state": batch_engine.state.batch_state,
            "state_source": batch_engine.state.state_source,
            "virtual_state_fallback": batch_engine.state.virtual_state_fallback,
            "execution_mode": batch_engine.state.execution_mode,
            "order_code": batch_engine.state.order_code,
            "recipe_name": batch_engine.state.recipe_name,
            "cell1_ack": False,
            "cell2_ack": False,
            "cell1_complete": False,
            "cell2_complete": False,
            "duration_cell1": "--",
            "duration_cell2": "--"
        }

@router.post("/api/operations/dual-run/mode")
async def set_dual_run_mode(payload: ExecutionModePayload):
    """
    Switches active execution mode:
    - Mode 1: mode1_physical
    - Mode 2: mode2_simit
    - Mode 3: mode3_dual
    """
    try:
        valid_modes = ("mode1_physical", "mode2_simit", "mode3_dual")
        mode = str(payload.execution_mode).strip()
        if mode not in valid_modes:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid execution mode '{mode}'. Must be one of: {valid_modes}"
            )
        batch_engine.state.execution_mode = mode
        return {
            "status": "success",
            "execution_mode": mode
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"[set_dual_run_mode] Error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("/api/operations/dual-run/dispatch-recipe")
async def dispatch_recipe_endpoint(payload: DispatchRecipePayload):
    """
    ISA-88 Recipe Downlink:
    - Mode 1: Writes SP setpoints to operations.cell1 tags only
    - Mode 2: Writes SP setpoints to operations.cell2_simit tags only
    - Mode 3: Concurrently writes to BOTH Cell 1 and Cell 2 tags
    - Verifies Ack_Recipe_Loaded flags
    """
    try:
        res = await batch_engine.download_recipe(
            order_code=payload.order_code,
            execution_mode=payload.execution_mode or "mode3_dual",
            recipe_name=payload.recipe_name or "Fresh Pasteurized Milk",
            target_volume=payload.target_volume or 1000.0,
            setpoints=payload.setpoints,
            current_batch=payload.current_batch
        )
        return res
    except Exception as exc:
        logger.warning(f"[dispatch_recipe_endpoint] Error: {exc}")
        return {
            "status": "error",
            "message": str(exc),
            "order_code": payload.order_code,
            "ready_to_start": False
        }

@router.post("/api/operations/dual-run/start-batch")
async def start_batch_endpoint(payload: StartBatchPayload):
    """
    Triggers batch execution:
    - Emits 500ms CMD_Start pulse to active cell(s)
    - Polls State_ID transition (PENDING_PLC_ACK -> RUNNING) up to 800ms
    - Exposes state_source: 'PLC_HARDWARE' | 'VIRTUAL_SIM_FALLBACK'
    """
    try:
        res = await batch_engine.start_batch(
            order_code=payload.order_code,
            execution_mode=payload.execution_mode
        )
        return res
    except Exception as exc:
        logger.warning(f"[start_batch_endpoint] Error: {exc}")
        return {
            "status": "error",
            "message": str(exc),
            "batch_state": batch_engine.state.batch_state,
            "state_source": batch_engine.state.state_source,
            "virtual_state_fallback": batch_engine.state.virtual_state_fallback
        }

@router.post("/api/operations/dual-run/hold-batch")
async def hold_batch_endpoint(payload: StartBatchPayload):
    """Triggers ISA-88 CMD_Hold pulse and polls State_ID feedback (2=HELD)."""
    try:
        return await batch_engine.hold_batch(
            order_code=payload.order_code,
            execution_mode=payload.execution_mode
        )
    except Exception as exc:
        logger.warning(f"[hold_batch_endpoint] Error: {exc}")
        return {
            "status": "error",
            "message": str(exc),
            "batch_state": batch_engine.state.batch_state,
            "state_source": batch_engine.state.state_source,
            "virtual_state_fallback": batch_engine.state.virtual_state_fallback
        }

@router.post("/api/operations/dual-run/resume-batch")
async def resume_batch_endpoint(payload: StartBatchPayload):
    """Triggers ISA-88 CMD_Resume pulse and polls State_ID feedback (1=RUNNING)."""
    try:
        return await batch_engine.resume_batch(
            order_code=payload.order_code,
            execution_mode=payload.execution_mode
        )
    except Exception as exc:
        logger.warning(f"[resume_batch_endpoint] Error: {exc}")
        return {
            "status": "error",
            "message": str(exc),
            "batch_state": batch_engine.state.batch_state,
            "state_source": batch_engine.state.state_source,
            "virtual_state_fallback": batch_engine.state.virtual_state_fallback
        }

@router.post("/api/operations/dual-run/abort-batch")
async def abort_batch_endpoint(payload: StartBatchPayload):
    """Triggers ISA-88 CMD_Abort pulse and polls State_ID feedback (4=ABORTED)."""
    try:
        return await batch_engine.abort_batch(
            order_code=payload.order_code,
            execution_mode=payload.execution_mode
        )
    except Exception as exc:
        logger.warning(f"[abort_batch_endpoint] Error: {exc}")
        return {
            "status": "error",
            "message": str(exc),
            "batch_state": batch_engine.state.batch_state,
            "state_source": batch_engine.state.state_source,
            "virtual_state_fallback": batch_engine.state.virtual_state_fallback
        }

@router.get("/api/operations/dual-run/deviation-matrix")
async def get_deviation_matrix_endpoint():
    """
    Real-Time Digital Twin Deviation Matrix:
    - Parameter SP vs Physical PV vs SIMIT Twin PV
    - Absolute delta Δ = |R - S|
    - Status evaluation: MATCHED, DEVIATING, TRACKING, CHƯA ÁNH XẠ
    - Twin Model Fidelity Index & Cycle Time Comparison
    """
    try:
        return batch_engine.get_deviation_matrix()
    except Exception as exc:
        logger.warning(f"[get_deviation_matrix_endpoint] Error: {exc}")
        return {
            "execution_mode": batch_engine.state.execution_mode,
            "batch_state": batch_engine.state.batch_state,
            "matrix": [],
            "benchmark_summary": None
        }

@router.post("/api/operations/dual-run/complete-cell")
async def complete_cell_endpoint(payload: CompleteCellPayload):
    """
    Manually or signal-driven mark Cell 1 or Cell 2 complete.
    In Dual-Run mode, overall order finalizes strictly when Physical Cell 1 completes.
    """
    try:
        cell = str(payload.cell).strip().lower()
        if cell in ("cell1", "cell1_physical", "physical"):
            res = batch_engine.evaluate_completion(simulated_cell1=True)
        elif cell in ("cell2", "cell2_simit", "simit", "twin"):
            res = batch_engine.evaluate_completion(simulated_cell2=True)
        else:
            raise HTTPException(status_code=400, detail="Cell must be 'cell1' or 'cell2'")
        return {
            "status": "success",
            "cell": cell,
            **res
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"[complete_cell_endpoint] Error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("/api/operations/dual-run/confirm-drain")
@router.post("/api/batch/confirm-drain")
async def confirm_batch_drain_endpoint():
    """
    Smart Factory Closed-Loop:
    Manual override / confirmation that Output Tank has been drained.
    Releases the sensor-driven wait loop and allows immediate auto-advancement to next sub-batch.
    """
    try:
        batch_engine.state.awaiting_drain = False
        return {
            "status": "success",
            "message": "Output tank drain confirmed. Auto-advancing to next sub-batch...",
            "awaiting_drain": False
        }
    except Exception as exc:
        logger.warning(f"[confirm_batch_drain_endpoint] Error: {exc}")
        return {
            "status": "error",
            "message": str(exc)
        }

@router.post("/api/operations/dual-run/reset")
async def reset_dual_run_endpoint():
    """Triggers ISA-88 CMD_Reset pulse and resets the dual-run state machine back to IDLE."""
    try:
        res = await batch_engine.reset_batch()
        return {
            "status": "success",
            "message": "Dual-run benchmark state reset to IDLE.",
            **res
        }
    except Exception as exc:
        logger.warning(f"[reset_dual_run_endpoint] Error: {exc}")
        batch_engine.state.reset()
        return {
            "status": "error",
            "message": str(exc)
        }

@router.post("/api/operations/optimize-campaign")
async def optimize_campaign_opc_proxy(payload: Dict[str, Any] = Body(...)):
    """Proxy to ISA-88 campaign optimization engine in batch_engine."""
    try:
        from db_routes import optimize_campaign_endpoint, OptimizeCampaignPayload
        return await optimize_campaign_endpoint(OptimizeCampaignPayload(**payload))
    except Exception:
        vol = float(payload.get("total_volume") or payload.get("total_order_volume") or 18.0)
        vessel_cap = float(payload.get("vessel_capacity") or 5.0)
        safe_ratio = float(payload.get("safe_max_ratio") or 0.90)
        plan = batch_engine.calculate_optimal_batch_campaign(vol, vessel_cap, safe_ratio)
        return {
            "status": "success",
            "campaign_plan": plan,
            "feasibility_status": "APPROVED"
        }

@router.get("/api/operations/optimize-campaign/{order_code}")
async def get_optimize_campaign_opc_proxy(order_code: str):
    """Proxy GET to ISA-88 campaign optimization engine."""
    from db_routes import get_optimize_campaign_by_order
    return await get_optimize_campaign_by_order(order_code)

@router.post("/api/opc/test")
async def test_opc_node_opc_route(payload: Dict[str, Any] = Body(...)):
    """Fast-path OPC UA node connectivity probe delegating to central gateway."""
    try:
        import kepware_gateway
        from kepware_gateway import TestNodePayload, test_node_connectivity
        node_id = str(payload.get("node_id") or payload.get("nodeId") or "").strip()
        return await test_node_connectivity(TestNodePayload(node_id=node_id))
    except Exception as exc:
        return {
            "success": False,
            "valid": False,
            "node_id": payload.get("node_id", ""),
            "quality": "Bad",
            "message": f"Central gateway error: {str(exc)}"
        }

# ============================================================================
# OPC UA ADDRESS SPACE TREE BROWSER & TAG POOL PROXIES
# ============================================================================

@router.get("/api/gateway/browse-tree")
async def opc_browse_tree_route():
    from kepware_gateway import browse_kepware_tree
    return await browse_kepware_tree()

@router.get("/api/gateway/browse-node")
async def opc_browse_node_route(node_id: Optional[str] = None):
    from kepware_gateway import browse_kepware_single_node
    return await browse_kepware_single_node(node_id=node_id)

@router.get("/api/gateway/pool")
async def opc_get_pool_route():
    from kepware_gateway import get_staged_tag_pool
    return await get_staged_tag_pool()

@router.post("/api/gateway/pool/add")
async def opc_add_pool_route(payload: Any = Body(...)):
    from kepware_gateway import add_tags_to_staged_pool
    return await add_tags_to_staged_pool(payload=payload)

@router.delete("/api/gateway/pool/remove")
async def opc_remove_pool_route(
    node_id: Optional[str] = None,
    folder: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = Body(default=None)
):
    from kepware_gateway import remove_tags_from_staged_pool
    return await remove_tags_from_staged_pool(node_id=node_id, folder=folder, payload=payload)


