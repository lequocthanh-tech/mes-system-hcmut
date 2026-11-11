/* Hallmark · component: RecipeManagementTab · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import {
  useMasterData,
  resolveParameterScalingRule,
  resolveRecipeBatchType,
  resolveRecipeNormalizingBase
} from '../../context/MasterDataContext';
import { useConfig } from '../../context/ConfigContext';
import { 
  FileSpreadsheet, 
  Save, 
  GitBranch, 
  CheckCircle, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  Sliders, 
  Cpu, 
  AlertTriangle,
  Info,
  Layers,
  Scale,
  Calculator,
  RotateCcw,
  History,
  X,
  FileCode
} from 'lucide-react';
import { ESignatureModal } from '../ESignatureModal';
import { IsaB2mmlExportModal } from '../isa/IsaB2mmlExportModal';
import * as api from '../../services/api';
import { RecipeParameter, RecipeStatus, PmControlBatchType, RecipeVersionSnapshot } from '../../types/masterData';

const useSafeConfig = () => {
  try {
    return useConfig();
  } catch {
    return null;
  }
};

export const RecipeManagementTab: React.FC = () => {
  const { 
    recipes, 
    selectedRecipeId, 
    setSelectedRecipeId, 
    saveRecipeMaster, 
    editRecipeMaster, 
    deleteRecipeMaster,
    createNewVersion,
    approveRecipe,
    lockRecipe,
    updateRecipeParameters,
    refetchData
  } = useMasterData();

  const config = useSafeConfig();
  const sqlOnline = config?.sqlConfig?.connectionState === 'connected';

  // Resilient initial fetch with exponential backoff & SQL online listener
  useEffect(() => {
    let isMounted = true;
    const fetchWithRetry = async (retries = 3, delay = 1000) => {
      try {
        await refetchData();
      } catch (err) {
        if (retries > 0 && isMounted) {
          setTimeout(() => fetchWithRetry(retries - 1, Math.round(delay * 1.5)), delay);
        }
      }
    };

    fetchWithRetry();
    return () => {
      isMounted = false;
    };
  }, [sqlOnline]);


  // Selected Recipe
  const activeRecipe = recipes.find((r) => r.id === selectedRecipeId) || recipes[0] || null;

  // Local Form state for editing current active recipe
  const [recipeForm, setRecipeForm] = useState<{
    code: string;
    name: string;
    category: string;
    version: string;
    status: RecipeStatus;
    author: string;
    batchType: PmControlBatchType;
    normalizingBase: number;
    expectedLossPercent: number;
  }>({
    code: '',
    name: '',
    category: '',
    version: '',
    status: 'DRAFT',
    author: '',
    batchType: 'NORMALIZED_PERCENTAGE',
    normalizingBase: 100.0,
    expectedLossPercent: 0.0,
  });

  // Local editable parameters
  const [parameters, setParameters] = useState<RecipeParameter[]>([]);

  // Quality Gate Warning state
  const [qualityGateError, setQualityGateError] = useState<string | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Electronic Signature Modal State (21 CFR Part 11)
  const [esignModalConfig, setEsignModalConfig] = useState<{
    isOpen: boolean;
    actionName: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    defaultMeaning?: string;
    detail?: string;
    onCommit: () => Promise<void>;
  }>({
    isOpen: false,
    actionName: '',
    onCommit: async () => {},
  });

  // Siemens PM-CONTROL Sec. 5.6 Version Rollback State
  const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<RecipeVersionSnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [targetVersionToRollback, setTargetVersionToRollback] = useState<string | null>(null);
  const [rollbackOperator, setRollbackOperator] = useState('Process_Engineer');
  const [rollbackReason, setRollbackReason] = useState('Khôi phục công thức về phiên bản chuẩn đã phê duyệt');
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isIsaRecipeModalOpen, setIsIsaRecipeModalOpen] = useState(false);

  const handleOpenRollbackModal = async () => {
    if (!activeRecipe) return;
    setIsRollbackModalOpen(true);
    setLoadingHistory(true);
    setTargetVersionToRollback(null);
    try {
      const history = await api.getRecipeVersions(activeRecipe.id);
      setVersionHistory(history);
    } catch (err: any) {
      showNotification('error', `Lỗi tải lịch sử phiên bản: ${err?.message || 'Lỗi mạng'}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExecuteRollback = async () => {
    if (!activeRecipe || !targetVersionToRollback) return;
    setIsRollingBack(true);
    try {
      await api.rollbackRecipeVersion(activeRecipe.id, {
        target_version: targetVersionToRollback,
        operator: rollbackOperator.trim() || 'Process_Engineer',
        reason: rollbackReason.trim() || 'Rollback to approved baseline',
      });
      showNotification('success', `Đã khôi phục thành công công thức về phiên bản [${targetVersionToRollback}] (Siemens PM-CONTROL Sec. 5.6.3)`);
      setIsRollbackModalOpen(false);
      await refetchData();
    } catch (err: any) {
      showNotification('error', `Khôi phục thất bại: ${err?.message || 'Lỗi xử lý rollback'}`);
    } finally {
      setIsRollingBack(false);
    }
  };

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Sync state when active recipe changes
  useEffect(() => {
    if (activeRecipe) {
      const bt = resolveRecipeBatchType(activeRecipe);
      const nb = resolveRecipeNormalizingBase(activeRecipe);
      const loss = Number(activeRecipe.expectedLossPercent ?? activeRecipe.expected_loss_percent ?? 0);
      setRecipeForm({
        code: activeRecipe.code,
        name: activeRecipe.name,
        category: activeRecipe.category || 'Dairy Formulation',
        version: activeRecipe.version,
        status: activeRecipe.status,
        author: activeRecipe.author || 'Process Engineering MOM',
        batchType: bt,
        normalizingBase: nb,
        expectedLossPercent: loss,
      });
      setParameters(JSON.parse(JSON.stringify(activeRecipe.parameters || [])));
      setQualityGateError(null);
    }
  }, [activeRecipe?.id, activeRecipe?.version, activeRecipe?.status]);

  // Is current recipe released or locked from editing
  const isReleased = (activeRecipe?.status || '').toUpperCase() === 'RELEASED' || (recipeForm.status || '').toUpperCase() === 'RELEASED';
  const isLocked = isReleased || (activeRecipe?.status || '').toUpperCase() === 'LOCKED' || (recipeForm.status || '').toUpperCase() === 'LOCKED';

  const getDefaultTargetNodeId = (param: Partial<RecipeParameter>): string => {
    if (param.targetNodeId) return param.targetNodeId;
    if (param.tagName) return param.tagName;
    const ph = String(param.phaseId || '').toUpperCase();
    const nm = String(param.parameterName || '').toUpperCase();
    if (ph === 'PH_SUPPLYMILK' || /MILK|SỮA/i.test(nm)) return 'Recipe_Milk_SP';
    if (ph === 'PH_SUPPLYSUGAR' || /SUGAR|ĐƯỜNG/i.test(nm)) return 'Recipe_Sugar_SP';
    if (ph === 'PH_SUPPLYADDITIVE' || /ADDITIVE|PHỤ GIA/i.test(nm)) return 'Recipe_Additive_SP';
    if (ph === 'PH_HEATING' || /STERIL|HEAT/i.test(nm)) return 'Recipe_Temp_SP';
    if (ph === 'PH_COOLING' || /COOL|CHILL/i.test(nm)) return 'Cooling_Temp_SP';
    if (ph === 'PH_AGITATING' || /SPEED|AGITAT/i.test(nm)) return 'Agitator_Speed';
    return 'Recipe_Param_SP';
  };

  // Switch Siemens PM-CONTROL Sec. 5.8 Batch Type mode
  const handleBatchTypeChange = (newMode: PmControlBatchType) => {
    if (isLocked) return;
    let nextBase = recipeForm.normalizingBase;
    if (newMode === 'NORMALIZED_PERCENTAGE') {
      nextBase = 100.0;
    } else if (recipeForm.batchType === 'NORMALIZED_PERCENTAGE' && nextBase === 100.0) {
      nextBase = 1000.0;
    }

    const updatedParams = parameters.map((p) => {
      const rule = resolveParameterScalingRule(p);
      if (rule === 'FIXED') return p;
      const isSugar = p.phaseId === 'PH_SUPPLYSUGAR' || /SUGAR|ĐƯỜNG/i.test(p.parameterName || '');
      const absUnit = isSugar ? 'kg' : 'L';
      return {
        ...p,
        unit: newMode === 'NORMALIZED_PERCENTAGE' ? '%' : absUnit,
      };
    });

    setParameters(updatedParams);
    setRecipeForm((prev) => ({
      ...prev,
      batchType: newMode,
      normalizingBase: nextBase,
    }));
    setQualityGateError(null);
  };

  // Handle parameter value change in DRAFT mode
  const handleParamChange = (index: number, field: keyof RecipeParameter, value: any) => {
    if (isLocked) return;
    const updated = [...parameters];
    updated[index] = {
      ...updated[index],
      [field]: field === 'targetValue' || field === 'targetSetpoint' ? parseFloat(value) || 0 : value,
    };
    // Keep targetSetpoint and targetValue in sync
    if (field === 'targetValue') {
      updated[index].targetSetpoint = parseFloat(value) || 0;
    } else if (field === 'targetSetpoint') {
      updated[index].targetValue = parseFloat(value) || 0;
    }
    setParameters(updated);
    setQualityGateError(null);
  };

  // Save changes to current recipe with 21 CFR Part 11 E-Signature verification
  const handleSaveChanges = async () => {
    if (!activeRecipe) return;
    if (isLocked) {
      showNotification('error', `Recipe is ${activeRecipe.status}. Create a new version to modify formulation parameters.`);
      return;
    }

    setEsignModalConfig({
      isOpen: true,
      actionName: 'RECIPE_MODIFICATION',
      fieldName: 'RECIPE_FORMULATION',
      oldValue: `${activeRecipe.code} v${activeRecipe.version} (${resolveRecipeBatchType(activeRecipe)})`,
      newValue: `${recipeForm.code} v${recipeForm.version} (${recipeForm.batchType} | Base: ${recipeForm.normalizingBase})`,
      defaultMeaning: 'Recipe Modification',
      detail: `Modified Siemens PM-CONTROL Sec. 5.8 batch type (${recipeForm.batchType}, Base=${recipeForm.normalizingBase}) & parameters for recipe [${recipeForm.code} - ${recipeForm.name}]`,
      onCommit: async () => {
        try {
          await editRecipeMaster(activeRecipe.id, {
            code: recipeForm.code.trim().toUpperCase(),
            name: recipeForm.name.trim(),
            category: recipeForm.category.trim(),
            author: recipeForm.author.trim(),
            batchType: recipeForm.batchType,
            batch_type: recipeForm.batchType,
            normalizingBase: Number(recipeForm.normalizingBase) || 100.0,
            normalizing_base: Number(recipeForm.normalizingBase) || 100.0,
            expectedLossPercent: Number(recipeForm.expectedLossPercent) || 0.0,
            expected_loss_percent: Number(recipeForm.expectedLossPercent) || 0.0,
          });
          await updateRecipeParameters(activeRecipe.id, parameters);
          showNotification('success', `Recipe [${recipeForm.code} ${activeRecipe.version}] PM-CONTROL configuration & parameters saved with verified electronic signature.`);
        } catch (err: any) {
          showNotification('error', `Failed to save recipe: ${err?.message || 'Database write failed'}`);
        }
      },
    });
  };

  // Create New Version handler
  const handleCreateVersion = async () => {
    if (!activeRecipe) return;
    try {
      await createNewVersion(activeRecipe.id);
      showNotification('success', `Created new draft version incremented from [${activeRecipe.code}]. Parameters unlocked for configuration.`);
    } catch (err: any) {
      showNotification('error', `Failed to create version: ${err?.message || 'Database write failed'}`);
    }
  };

  // Approve / Release Handler (Siemens PM-CONTROL Sec. 5.8 Quality Gate Verification & 21 CFR Part 11 E-Signature)
  const handleApproveRelease = async () => {
    if (!activeRecipe) return;

    // 1. Clear any existing quality gate error banner
    setQualityGateError(null);

    // 2. Evaluate scalable dosing parameters under Siemens PM-CONTROL Chapter 5.8 rules
    const scalableParams = parameters.filter((p) => resolveParameterScalingRule(p) === 'SCALABLE');
    const totalScalableSum = scalableParams.reduce(
      (sum, p) => sum + (Number(p.targetSetpoint ?? p.targetValue ?? p.percentage ?? 0) || 0),
      0
    );

    if (recipeForm.batchType === 'NORMALIZED_PERCENTAGE') {
      // Sec. 5.8.3: Allow 100% standard or >100% with loss compensation notice; block if < 99.9%
      if (totalScalableSum < 99.9) {
        const errorMsg = `PM-CONTROL Sec. 5.8.3 Quality Gate: Ingredient sum is ${totalScalableSum.toFixed(1)}% (must be ≥ 100.0% for standard or loss-compensated formulation).`;
        setQualityGateError(errorMsg);
        showNotification('error', errorMsg);
        return;
      }
    } else if (recipeForm.batchType === 'NORMALIZED_ABSOLUTE') {
      // Sec. 5.8.2: Normalizing base > 0 and scalable sum > 0 (sum can exceed Normalizing Base for yield loss compensation)
      if ((Number(recipeForm.normalizingBase) || 0) <= 0 || totalScalableSum <= 0) {
        const errorMsg = `PM-CONTROL Sec. 5.8.2 Quality Gate: Normalizing Base (${recipeForm.normalizingBase} L) and Dosing Input Sum (${totalScalableSum.toFixed(2)} L/kg) must be > 0.`;
        setQualityGateError(errorMsg);
        showNotification('error', errorMsg);
        return;
      }
    } else {
      // Sec. 5.8.1: Fixed batch absolute values must be > 0
      if (totalScalableSum <= 0) {
        const errorMsg = `PM-CONTROL Sec. 5.8.1 Quality Gate: Fixed batch material quantities must be > 0.`;
        setQualityGateError(errorMsg);
        showNotification('error', errorMsg);
        return;
      }
    }

    setEsignModalConfig({
      isOpen: true,
      actionName: 'RECIPE_APPROVAL',
      fieldName: 'RECIPE_STATUS',
      oldValue: activeRecipe.status,
      newValue: 'RELEASED',
      defaultMeaning: 'Approval',
      detail: `Formal release authorization for master recipe [${activeRecipe.code} ${activeRecipe.version}] (${recipeForm.batchType}, Base=${recipeForm.normalizingBase})`,
      onCommit: async () => {
        try {
          await editRecipeMaster(activeRecipe.id, {
            code: recipeForm.code.trim().toUpperCase(),
            name: recipeForm.name.trim(),
            category: recipeForm.category.trim(),
            author: recipeForm.author.trim(),
            batchType: recipeForm.batchType,
            batch_type: recipeForm.batchType,
            normalizingBase: Number(recipeForm.normalizingBase) || 100.0,
            normalizing_base: Number(recipeForm.normalizingBase) || 100.0,
            expectedLossPercent: Number(recipeForm.expectedLossPercent) || 0.0,
            expected_loss_percent: Number(recipeForm.expectedLossPercent) || 0.0,
          });
          await updateRecipeParameters(activeRecipe.id, parameters);
          await approveRecipe(activeRecipe.id);
          setRecipeForm((prev) => ({ ...prev, status: 'RELEASED' }));
          setQualityGateError(null);
          showNotification(
            'success',
            `Recipe [${activeRecipe.code} ${activeRecipe.version}] approved and RELEASED with verified electronic signature.`
          );
        } catch (err: any) {
          showNotification('error', `Failed to approve recipe: ${err?.message || 'Database write failed'}`);
        }
      },
    });
  };

  // Lock Recipe Handler
  const handleLockRecipe = async () => {
    if (!activeRecipe) return;
    try {
      await lockRecipe(activeRecipe.id);
      showNotification('info', `Recipe [${activeRecipe.code} ${activeRecipe.version}] marked as LOCKED/ARCHIVED.`);
    } catch (err: any) {
      showNotification('error', `Failed to lock recipe: ${err?.message || 'Database write failed'}`);
    }
  };

  // Create brand new recipe
  const handleCreateNewRecipe = async () => {
    const nextId = recipes.length > 0 ? Math.max(...recipes.map(r => r.id)) + 1 : 1;
    const defaultParams: RecipeParameter[] = [
      {
        id: `p-${nextId}-1`,
        phaseId: 'PH_SUPPLYMILK',
        parameterName: 'Raw Milk Supply',
        targetValue: 70.0,
        unit: '%',
        tolerance: '±1.0%',
        targetNodeId: 'Recipe_Milk_SP',
        durationSeconds: 300,
        recipeId: nextId,
      },
      {
        id: `p-${nextId}-2`,
        phaseId: 'PH_SUPPLYSUGAR',
        parameterName: 'Sugar Syrup Supply',
        targetValue: 20.0,
        unit: '%',
        tolerance: '±0.5%',
        targetNodeId: 'Recipe_Sugar_SP',
        durationSeconds: 180,
        recipeId: nextId,
      },
      {
        id: `p-${nextId}-3`,
        phaseId: 'PH_SUPPLYADDITIVE',
        parameterName: 'Additive Dosing',
        targetValue: 10.0,
        unit: '%',
        tolerance: '±0.2%',
        targetNodeId: 'Recipe_Additive_SP',
        durationSeconds: 120,
        recipeId: nextId,
      },
      {
        id: `p-${nextId}-4`,
        phaseId: 'PH_HEATING',
        parameterName: 'Thermal Sterilization',
        targetValue: 138.0,
        unit: '°C',
        tolerance: '±0.5°C',
        targetNodeId: 'Recipe_Temp_SP',
        durationSeconds: 600,
        recipeId: nextId,
      },
      {
        id: `p-${nextId}-5`,
        phaseId: 'PH_COOLING',
        parameterName: 'Chilled Preservation',
        targetValue: 4.0,
        unit: '°C',
        tolerance: '±1.0°C',
        targetNodeId: 'Recipe_Cool_SP',
        durationSeconds: 450,
        recipeId: nextId,
      },
    ];

    try {
      await saveRecipeMaster({
        code: `RCP-CUSTOM-0${nextId}`,
        name: `New Dairy Formulation #${nextId}`,
        version: 'v1.0',
        status: 'DRAFT',
        category: 'Liquid Dairy Formulation',
        author: 'Lead MES Engineer',
        parameters: defaultParams,
        tempHot: 138,
        tempCold: 4,
        batchType: 'NORMALIZED_PERCENTAGE',
        batch_type: 'NORMALIZED_PERCENTAGE',
        normalizingBase: 100.0,
        normalizing_base: 100.0,
        expectedLossPercent: 0.0,
        expected_loss_percent: 0.0,
      });
      showNotification('success', `Initialized New Master Recipe [RCP-CUSTOM-0${nextId} v1.0] in DRAFT mode.`);
    } catch (err: any) {
      showNotification('error', `Failed to create recipe: ${err?.message || 'Database write failed'}`);
    }
  };

  // Calculate scalable dosing total & Siemens PM-CONTROL Sec. 5.8 yield loss compensation
  const activeIngredients = parameters.filter((p) => resolveParameterScalingRule(p) === 'SCALABLE');
  const ingredientTotal = activeIngredients.reduce(
    (sum, p) => sum + (Number(p.targetSetpoint ?? p.targetValue ?? p.percentage ?? 0) || 0),
    0
  );
  const currentNormBase = Number(recipeForm.normalizingBase) > 0 ? Number(recipeForm.normalizingBase) : 100.0;
  const yieldLossCompensationPct =
    recipeForm.batchType === 'NORMALIZED_PERCENTAGE'
      ? ingredientTotal > 100.0
        ? parseFloat((ingredientTotal - 100.0).toFixed(2))
        : Number(recipeForm.expectedLossPercent) || 0.0
      : recipeForm.batchType === 'NORMALIZED_ABSOLUTE'
      ? ingredientTotal > currentNormBase
        ? parseFloat((((ingredientTotal - currentNormBase) / currentNormBase) * 100.0).toFixed(2))
        : Number(recipeForm.expectedLossPercent) || 0.0
      : Number(recipeForm.expectedLossPercent) || 0.0;

  return (
    <div className="space-y-4">
      {/* Sub-Header Strip */}
      <div className="bg-white border border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-mono tracking-tight uppercase">
              Recipe Management (Siemens PM-CONTROL Benchmark)
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              ISA-88 Master Recipe Formulation, Version Life Cycle & Phase Parameter Binding
            </p>
          </div>
        </div>

        {/* Global Action & Recipe Count */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            onClick={handleCreateNewRecipe}
            className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-mono font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Master Recipe</span>
          </button>
          <div className="bg-slate-100 border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
            {recipes.length} Master Recipes
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 font-bold">
            RELEASED RECIPES: {recipes.filter(r => (r.status || '').toUpperCase() === 'RELEASED').length}
          </div>
        </div>
      </div>

      {/* Quality Gate Warning Banner */}
      {qualityGateError && (
        <div
          role="alert"
          className="p-3 text-xs font-mono border border-rose-300 bg-rose-50 text-rose-900 flex items-center justify-between gap-2 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{qualityGateError}</span>
          </div>
          <button
            type="button"
            onClick={() => setQualityGateError(null)}
            className="text-[11px] underline hover:no-underline font-mono font-bold"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Notification Banner */}
      {notification && (
        <div
          role="alert"
          className={`p-3 text-xs font-mono border flex items-center justify-between gap-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : notification.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-sky-50 border-sky-300 text-sky-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-sky-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-[11px] underline hover:no-underline font-mono"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* TOP CARD: Master Recipe Selection & Version Control (PM-CONTROL Benchmark) */}
      <div className="bg-white border border-slate-200 shadow-xs">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-700" />
            <span className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider">
              Master Recipe Header & Version Lifecycle
            </span>
          </div>

          {/* Recipe Status Badge */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500 uppercase text-[10px]">LIFECYCLE STATUS:</span>
            {isReleased && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase tracking-wider text-xs">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                RELEASED (Operational)
              </span>
            )}
            {!isReleased && ((activeRecipe?.status || '').toUpperCase() === 'TEST' || (recipeForm.status || '').toUpperCase() === 'TEST') && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-400 font-bold uppercase tracking-wider text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                TEST / PILOT RECIPE (Sec. 5.4.5)
              </span>
            )}
            {!isReleased && ((activeRecipe?.status || '').toUpperCase() === 'DRAFT' || (recipeForm.status || '').toUpperCase() === 'DRAFT') && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-800 border border-sky-300 font-bold uppercase tracking-wider text-xs">
                <Unlock className="w-3.5 h-3.5 text-sky-600" />
                DRAFT (Modifiable)
              </span>
            )}
            {!isReleased && ((activeRecipe?.status || '').toUpperCase() === 'LOCKED' || (recipeForm.status || '').toUpperCase() === 'LOCKED') && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-300 font-bold uppercase tracking-wider text-xs">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                LOCKED / ARCHIVED
              </span>
            )}
          </div>
        </div>

        {/* Master Recipe Selector & Property Fields */}
        <div className="p-5 space-y-4 text-xs font-mono">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Master Recipe Dropdown */}
            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Select Master Recipe
              </label>
              <select
                value={selectedRecipeId || ''}
                onChange={(e) => setSelectedRecipeId(parseInt(e.target.value, 10))}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 font-semibold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              >
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.code}] {r.name} ({r.version}) - {r.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Recipe Code */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Recipe Code
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={recipeForm.code}
                onChange={(e) => setRecipeForm({ ...recipeForm, code: e.target.value.toUpperCase() })}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>

            {/* Version String */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Active Version
              </label>
              <div className="relative">
                <GitBranch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  disabled
                  value={recipeForm.version}
                  className="w-full h-9 pl-8 pr-3 text-xs font-mono font-bold bg-slate-100 border border-slate-300 text-slate-800"
                />
              </div>
            </div>

            {/* Category / Application */}
            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Category / Process Class
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={recipeForm.category}
                onChange={(e) => setRecipeForm({ ...recipeForm, category: e.target.value })}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>
          </div>

          {/* Row 2: Recipe Name & Author Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Formulation Display Name
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={recipeForm.name}
                onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Author / Lead MOM Engineer
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={recipeForm.author}
                onChange={(e) => setRecipeForm({ ...recipeForm, author: e.target.value })}
                className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
              />
            </div>
          </div>

          {/* Siemens PM-CONTROL Lifecycle Action Bar */}
          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Button: Create New Version */}
              <button
                type="button"
                onClick={handleCreateVersion}
                className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Create New Version</span>
              </button>

              {/* Button: Version History & Rollback (Siemens PM-CONTROL Sec. 5.6) */}
              <button
                type="button"
                onClick={handleOpenRollbackModal}
                className="h-9 px-3.5 bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-900 font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                title="Siemens PM-CONTROL Sec. 5.6: Xem lịch sử phiên bản và khôi phục thông số công thức"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-700" />
                <span>Lịch sử & Khôi phục (Sec. 5.6)</span>
              </button>

              {/* Button: Approve / Release Recipe */}
              <button
                type="button"
                disabled={isReleased}
                onClick={handleApproveRelease}
                className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Approve / Release Recipe</span>
              </button>

              {/* Button: Toggle TEST Status (Siemens PM-CONTROL Sec. 5.4.5) */}
              {!isReleased && (
                <button
                  type="button"
                  onClick={() => {
                    const nextStatus = recipeForm.status === 'TEST' ? 'DRAFT' : 'TEST';
                    setRecipeForm(prev => ({ ...prev, status: nextStatus }));
                    showNotification('info', `Trạng thái công thức: [${nextStatus}] (Siemens PM-CONTROL Sec. 5.4.5)`);
                  }}
                  className={`h-9 px-3 border font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none ${
                    recipeForm.status === 'TEST'
                      ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                      : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  }`}
                  title="Chuyển đổi trạng thái giữa DRAFT và TEST / PILOT BATCH theo Siemens PM-CONTROL Sec. 5.4.5"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${recipeForm.status === 'TEST' ? 'text-amber-700' : 'text-slate-500'}`} />
                  <span>{recipeForm.status === 'TEST' ? 'TEST STATUS (ACTIVE)' : 'Set TEST Status'}</span>
                </button>
              )}

              {/* Button: Save Changes */}
              <button
                type="button"
                disabled={isLocked}
                onClick={handleSaveChanges}
                className="h-9 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-mono font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              >
                <Save className="w-3.5 h-3.5 text-slate-700" />
                <span>Save Changes</span>
              </button>

              {/* Button: Export BatchML Master Recipe JSON (MESA Standard) */}
              <button
                type="button"
                onClick={() => setIsIsaRecipeModalOpen(true)}
                className="h-9 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-mono font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                title="Preview and Export ANSI/ISA-88 BatchML Master Recipe JSON (MESA Standard)"
              >
                <FileCode className="w-3.5 h-3.5 text-sky-600" />
                <span>Export BatchML</span>
              </button>

              {/* Button: Lock Recipe */}
              {isReleased && (
                <button
                  type="button"
                  onClick={handleLockRecipe}
                  className="h-9 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Lock / Archive</span>
                </button>
              )}

              {/* Button: Delete Draft Recipe */}
              {!isLocked && (
                <button
                  type="button"
                  onClick={async () => {
                    if (activeRecipe) {
                      try {
                        await deleteRecipeMaster(activeRecipe.id);
                        showNotification('info', `Draft recipe [${activeRecipe.code}] deleted.`);
                      } catch (err: any) {
                        showNotification('error', `Delete Failed: ${err?.message || 'Database error'}`);
                      }
                    }
                  }}
                  className="h-9 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete Draft</span>
                </button>
              )}
            </div>

            {/* PM-CONTROL Integrity Indicator */}
            <div className="flex items-center gap-2 text-xs font-mono">
              {isLocked ? (
                <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>PARAMETERS LOCKED (PM-CONTROL INTEGRITY)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>DRAFT MODE: PARAMETERS EDITABLE</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SIEMENS PM-CONTROL PRODUCT SETTINGS PANEL (SECTION 5.8) */}
      <div className="bg-white border border-slate-200 shadow-xs">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-700" />
            <span className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider">
              PM-CONTROL PRODUCT BATCH TYPE (SIEMENS SEC. 5.8)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
              {recipeForm.batchType === 'NORMALIZED_ABSOLUTE' && 'SEC. 5.8.2 — NORMALIZED BASE / ABSOLUTE'}
              {recipeForm.batchType === 'NORMALIZED_PERCENTAGE' && 'SEC. 5.8.3 — NORMALIZED BASE / PERCENTAGE'}
              {recipeForm.batchType === 'ABSOLUTE_FIXED' && 'SEC. 5.8.1 — PRODUCT WITH ABSOLUTE VALUES'}
            </span>
            {yieldLossCompensationPct > 0.05 && (
              <span className="px-2.5 py-1 bg-sky-50 border border-sky-300 text-sky-800 font-bold text-[11px] tabular-nums">
                YIELD LOSS COMPENSATION: +{yieldLossCompensationPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4 text-xs font-mono">
          {/* 3 Selectable PM-CONTROL Batch Type Modes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Mode A — Normalizing Base with Absolute Values (Sec. 5.8.2) */}
            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBatchTypeChange('NORMALIZED_ABSOLUTE')}
              className={`p-3.5 text-left border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed ${
                recipeForm.batchType === 'NORMALIZED_ABSOLUTE'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold uppercase tracking-wider text-xs">
                  Mode A — Normalizing Base / Absolute
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                    recipeForm.batchType === 'NORMALIZED_ABSOLUTE'
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  Sec. 5.8.2
                </span>
              </div>
              <p
                className={`text-[11px] leading-relaxed ${
                  recipeForm.batchType === 'NORMALIZED_ABSOLUTE' ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Sub-recipe material quantities in absolute values (L/kg) relative to a Normalizing Base (e.g. 5.0 L lab or 1000.0 L line). Input sum may exceed base to compensate evaporation/piping loss.
              </p>
            </button>

            {/* Mode B — Normalizing Base with Percentage Values (Sec. 5.8.3) */}
            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBatchTypeChange('NORMALIZED_PERCENTAGE')}
              className={`p-3.5 text-left border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed ${
                recipeForm.batchType === 'NORMALIZED_PERCENTAGE'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold uppercase tracking-wider text-xs">
                  Mode B — Normalizing Base / Percentage
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                    recipeForm.batchType === 'NORMALIZED_PERCENTAGE'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  Sec. 5.8.3
                </span>
              </div>
              <p
                className={`text-[11px] leading-relaxed ${
                  recipeForm.batchType === 'NORMALIZED_PERCENTAGE' ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Material inputs defined in percentage (%). Supports 100.0% standard balance or &gt;100.0% formulation to compensate for process evaporation and retention loss.
              </p>
            </button>

            {/* Mode C — Product with Absolute Values (Sec. 5.8.1) */}
            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBatchTypeChange('ABSOLUTE_FIXED')}
              className={`p-3.5 text-left border transition-none focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed ${
                recipeForm.batchType === 'ABSOLUTE_FIXED'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold uppercase tracking-wider text-xs">
                  Mode C — Product with Absolute Values
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                    recipeForm.batchType === 'ABSOLUTE_FIXED'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  Sec. 5.8.1
                </span>
              </div>
              <p
                className={`text-[11px] leading-relaxed ${
                  recipeForm.batchType === 'ABSOLUTE_FIXED' ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Fixed batch quantities in L/kg. Job Control does not scale quantities (Conversion Factor = 1.0000); batch size is locked to the master formulation.
              </p>
            </button>
          </div>

          {/* Normalizing Base Quantity & Conversion Factor Strip */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-2 border-t border-slate-200">
            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                {recipeForm.batchType === 'NORMALIZED_PERCENTAGE'
                  ? 'Normalizing Base Reference (%)'
                  : recipeForm.batchType === 'NORMALIZED_ABSOLUTE'
                  ? 'Normalizing Base Quantity (L) — e.g. 5.0 L or 1000.0 L'
                  : 'Fixed Batch Reference Volume (L)'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  disabled={isLocked || recipeForm.batchType === 'NORMALIZED_PERCENTAGE'}
                  value={recipeForm.normalizingBase}
                  onChange={(e) =>
                    setRecipeForm({
                      ...recipeForm,
                      normalizingBase: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full h-9 px-3 text-xs font-mono font-bold tabular-nums bg-white border border-slate-300 text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                />
                <span className="h-9 px-3 bg-slate-100 border border-slate-300 text-slate-700 font-bold flex items-center justify-center">
                  {recipeForm.batchType === 'NORMALIZED_PERCENTAGE' ? '%' : 'L'}
                </span>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                Process Loss Compensation (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  disabled={isLocked}
                  value={recipeForm.expectedLossPercent}
                  onChange={(e) =>
                    setRecipeForm({
                      ...recipeForm,
                      expectedLossPercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full h-9 px-3 text-xs font-mono font-bold tabular-nums bg-white border border-slate-300 text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                />
                <span className="h-9 px-3 bg-slate-100 border border-slate-300 text-slate-700 font-bold flex items-center justify-center">
                  %
                </span>
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="h-9 px-3 bg-slate-50 border border-slate-300 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 uppercase font-semibold flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-slate-500" />
                  <span>Job Control Scaling Math:</span>
                </span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {recipeForm.batchType === 'NORMALIZED_ABSOLUTE' &&
                    `Factor = Target Qty / ${currentNormBase.toFixed(2)} L`}
                  {recipeForm.batchType === 'NORMALIZED_PERCENTAGE' && `Factor = Target Qty / 100`}
                  {recipeForm.batchType === 'ABSOLUTE_FIXED' && `Factor = 1.0000 (Unscaled Fixed)`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CARD: Phase Parameter Binding Table (ISA-88 Mapping) */}
      <div className="bg-white border border-slate-200 shadow-xs">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-700" />
            <span className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wider">
              Phase Parameter Binding Table (ISA-88 Physical Phases)
            </span>
          </div>

          {/* Ingredients Formulation & Yield Loss Compensation Badges */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {recipeForm.batchType === 'NORMALIZED_PERCENTAGE' ? (
              <div
                className={`px-3 py-1 border flex items-center gap-1.5 tabular-nums ${
                  ingredientTotal >= 99.9
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                    : 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                }`}
              >
                <span>INGREDIENT SUM:</span>
                <span>{ingredientTotal.toFixed(1)}%</span>
                {ingredientTotal >= 99.9 ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 inline" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 inline" />
                )}
              </div>
            ) : (
              <div className="px-3 py-1 border bg-slate-100 border-slate-300 text-slate-800 font-semibold flex items-center gap-1.5 tabular-nums">
                <span>RAW INPUT SUM:</span>
                <span className="font-bold text-slate-900">{ingredientTotal.toFixed(2)} L/kg</span>
                <span className="text-slate-500">
                  (Base: {currentNormBase.toFixed(2)} L)
                </span>
              </div>
            )}

            {yieldLossCompensationPct > 0.05 && (
              <div className="px-3 py-1 border bg-sky-50 border-sky-300 text-sky-800 font-bold flex items-center gap-1.5 tabular-nums">
                <span>YIELD LOSS COMPENSATION:</span>
                <span>+{yieldLossCompensationPct.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Phase Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">ISA-88 Phase ID</th>
                <th className="py-2.5 px-3">Parameter Name / Role</th>
                <th className="py-2.5 px-3">Scaling Rule (Quy tắc quy đổi)</th>
                <th className="py-2.5 px-3 text-center">Target Setpoint</th>
                <th className="py-2.5 px-3 text-center">Unit</th>
                <th className="py-2.5 px-3 text-center">Tolerance Band</th>
                <th className="py-2.5 px-3">Target Node (OPC UA / Tag)</th>
                <th className="py-2.5 px-3 text-center">Duration</th>
                <th className="py-2.5 px-3 text-center">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {parameters.map((param, index) => {
                const scalingRule = resolveParameterScalingRule(param);
                const resolvedTag = getDefaultTargetNodeId(param);
                return (
                  <tr key={param.id || index} className="hover:bg-slate-50 transition-none">
                    {/* Phase ID */}
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 text-[11px]">
                        {param.phaseId}
                      </span>
                    </td>

                    {/* Parameter Name */}
                    <td className="py-2.5 px-3">
                      {isLocked ? (
                        <span className="font-semibold text-slate-800">{param.parameterName}</span>
                      ) : (
                        <input
                          type="text"
                          value={param.parameterName}
                          onChange={(e) => handleParamChange(index, 'parameterName', e.target.value)}
                          className="h-8 px-2 w-full text-xs font-mono bg-white border border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2"
                        />
                      )}
                    </td>

                    {/* SCALING RULE (QUY TẮC QUY ĐỔI) */}
                    <td className="py-2.5 px-3">
                      {scalingRule === 'SCALABLE' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          SCALABLE (× Factor)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                          FIXED (Non-Scalable)
                        </span>
                      )}
                    </td>

                    {/* Target Setpoint */}
                    <td className="py-2.5 px-3 text-center">
                      {isLocked ? (
                        <span className="font-bold text-slate-900 text-sm tabular-nums">{param.targetValue}</span>
                      ) : (
                        <input
                          type="number"
                          step="0.1"
                          value={param.targetValue}
                          onChange={(e) => handleParamChange(index, 'targetValue', e.target.value)}
                          className="h-8 px-2 w-24 text-center font-bold text-slate-900 text-xs font-mono tabular-nums bg-white border border-slate-300 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2"
                        />
                      )}
                    </td>

                    {/* Unit */}
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-600">
                      {param.unit}
                    </td>

                    {/* Tolerance Band */}
                    <td className="py-2.5 px-3 text-center">
                      {isLocked ? (
                        <span className="text-slate-700 bg-slate-100 px-2 py-0.5 border border-slate-200 tabular-nums">
                          {param.tolerance}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={param.tolerance}
                          onChange={(e) => handleParamChange(index, 'tolerance', e.target.value)}
                          className="h-8 px-2 w-24 text-center text-xs font-mono tabular-nums bg-white border border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2"
                        />
                      )}
                    </td>

                    {/* Target Node (OPC UA / Tag) */}
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-300 text-slate-800 text-[11px] font-mono">
                        <Cpu className="w-3 h-3 text-slate-500" />
                        {resolvedTag}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="py-2.5 px-3 text-center text-slate-700 tabular-nums">
                      {param.durationSeconds ? `${param.durationSeconds} s` : 'Continuous'}
                    </td>

                    {/* Lock State */}
                    <td className="py-2.5 px-3 text-center">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-semibold" title="Locked by PM-CONTROL">
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold" title="Editable">
                          <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                          Editable
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Phase Table Footnote */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 font-mono flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Parameters are bound to Siemens S7-1500 / Kepware OPC UA tags mapped in ISA-88 Telemetry Hub.</span>
          </div>
          <div className="text-[10px] text-slate-400">
            COMPLIANT: ISA-88.01 PART 1 MASTER RECIPE SCHEMA
          </div>
        </div>
      </div>

      {/* 21 CFR Part 11 Electronic Signature Modal */}
      <ESignatureModal
        isOpen={esignModalConfig.isOpen}
        onClose={() => setEsignModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={async () => {
          await esignModalConfig.onCommit();
        }}
        actionName={esignModalConfig.actionName}
        fieldName={esignModalConfig.fieldName}
        oldValue={esignModalConfig.oldValue}
        newValue={esignModalConfig.newValue}
        defaultMeaning={esignModalConfig.defaultMeaning}
        detail={esignModalConfig.detail}
      />

      {/* Siemens PM-CONTROL Sec. 5.6 Recipe Version History & Rollback Modal */}
      {isRollbackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-300 shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col font-mono text-xs">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" />
                <span className="font-bold uppercase tracking-wider text-sm">
                  Siemens PM-CONTROL Sec. 5.6 — Lịch sử Phiên bản & Khôi phục Công thức
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsRollbackModalOpen(false)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white transition-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-Header: Active Recipe Summary */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-3">
                <span className="text-slate-500">MÃ CÔNG THỨC:</span>
                <span className="font-bold text-slate-900 font-mono">[{activeRecipe?.code}] {activeRecipe?.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500">PHIÊN BẢN ĐANG ÁP DỤNG:</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                  {activeRecipe?.version || 'v1.0'}
                </span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-800 border border-slate-300 font-bold">
                  {recipeForm.batchType}
                </span>
              </div>
            </div>

            {/* Modal Body: Versions Table */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <div className="inline-block w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                  <p>Đang tải lịch sử phiên bản từ kho lưu trữ PM-CONTROL...</p>
                </div>
              ) : versionHistory.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 text-center text-slate-600">
                  <p className="font-bold">Chưa có lịch sử phiên bản trước đó</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Phiên bản hiện tại [{activeRecipe?.version}] là bản gốc đầu tiên được ghi nhận.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[10.5px] uppercase tracking-wider text-slate-600">
                        <th className="py-2.5 px-3 font-bold">Phiên bản</th>
                        <th className="py-2.5 px-3 font-bold">Trạng thái</th>
                        <th className="py-2.5 px-3 font-bold">Người tạo / Sửa</th>
                        <th className="py-2.5 px-3 font-bold">Thời điểm</th>
                        <th className="py-2.5 px-3 font-bold">Lý do thay đổi</th>
                        <th className="py-2.5 px-3 font-bold">Thông số chính</th>
                        <th className="py-2.5 px-3 font-bold text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {versionHistory.map((snap, idx) => {
                        const isCurrent = snap.version.trim().toUpperCase() === (activeRecipe?.version || '').trim().toUpperCase();
                        const isSelected = targetVersionToRollback === snap.version;
                        const statusUpper = (snap.status || 'RELEASED').toUpperCase();

                        return (
                          <tr
                            key={`${snap.version}-${idx}`}
                            className={`transition-none ${
                              isSelected
                                ? 'bg-sky-50/70 border-l-4 border-sky-600'
                                : isCurrent
                                ? 'bg-emerald-50/40'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span>{snap.version}</span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 bg-emerald-600 text-white text-[9px] font-bold">
                                    HIỆN TẠI
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {statusUpper === 'RELEASED' && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px]">
                                  RELEASED
                                </span>
                              )}
                              {statusUpper === 'TEST' && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px]">
                                  TEST
                                </span>
                              )}
                              {statusUpper === 'LOCKED' && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[10px]">
                                  LOCKED
                                </span>
                              )}
                              {statusUpper === 'DRAFT' && (
                                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 font-bold text-[10px]">
                                  DRAFT
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{snap.author || 'Process_Engineer'}</td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                              {snap.timestamp ? new Date(snap.timestamp).toLocaleString('vi-VN') : '--'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={snap.reason}>
                              {snap.reason || 'Cập nhật thông số công thức'}
                            </td>
                            <td className="py-2.5 px-3 text-[10px]">
                              <div className="space-y-0.5">
                                <span className="text-slate-500">{snap.batch_type || snap.batchType || 'NORMALIZED_PERCENTAGE'} (Base: {snap.normalizing_base ?? snap.normalizingBase ?? 100})</span>
                                <div className="text-slate-700 font-semibold truncate max-w-xs">
                                  {snap.parameters && snap.parameters.length > 0 ? (
                                    snap.parameters.slice(0, 3).map((p: any) => `${p.parameterName || p.Material_Name || 'Param'}: ${p.targetValue ?? p.Percentage ?? 0}${p.unit || '%'}`).join(' · ')
                                  ) : (
                                    `T_Tiệt trùng: ${snap.temp_hot ?? snap.tempHot ?? 138}°C · T_Lạnh: ${snap.temp_cold ?? snap.tempCold ?? 4}°C`
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isCurrent ? (
                                <span className="text-[10px] text-slate-400 font-semibold">ĐANG DÙNG</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setTargetVersionToRollback(snap.version)}
                                  className="h-7 px-2.5 bg-white hover:bg-sky-50 border border-sky-300 text-sky-800 font-bold text-[11px] flex items-center gap-1 mx-auto focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-1 active:translate-y-px transition-none"
                                >
                                  <RotateCcw className="w-3 h-3 text-sky-600" />
                                  <span>Chọn khôi phục</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Rollback Execution Confirmation Box */}
              {targetVersionToRollback && (
                <div className="p-4 bg-sky-50/70 border border-sky-300 space-y-3">
                  <div className="flex items-center justify-between border-b border-sky-200 pb-2">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-sky-700" />
                      <span className="font-bold text-sky-950 uppercase tracking-wider text-xs">
                        Xác nhận khôi phục công thức về phiên bản [{targetVersionToRollback}] (Siemens PM-CONTROL Sec. 5.6.3)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTargetVersionToRollback(null)}
                      className="text-slate-500 hover:text-slate-700 text-xs font-bold"
                    >
                      Hủy chọn
                    </button>
                  </div>

                  <p className="text-[11px] text-sky-900 leading-relaxed">
                    Hành động này sẽ ghi đè toàn bộ thông số định lượng và quy trình trong <code className="bg-sky-100 px-1 font-bold">dbo.Recipe_Detail</code> về phiên bản đã lưu của <code className="bg-sky-100 px-1 font-bold">[{targetVersionToRollback}]</code>. Đồng thời ghi nhận nhật ký kiểm toán <code className="bg-sky-100 px-1 font-bold">PM_CONTROL_RECIPE_ROLLBACK</code> trong hệ thống.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Kỹ sư / Người phê duyệt khôi phục (Operator)
                      </label>
                      <input
                        type="text"
                        value={rollbackOperator}
                        onChange={(e) => setRollbackOperator(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 text-slate-900 font-mono font-bold focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Lý do khôi phục (Audit Reason)
                      </label>
                      <input
                        type="text"
                        value={rollbackReason}
                        onChange={(e) => setRollbackReason(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 text-slate-900 font-mono focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 transition-none"
                        placeholder="VD: Phục hồi phiên bản chuẩn sau thử nghiệm..."
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-sky-200">
                    <button
                      type="button"
                      onClick={() => setTargetVersionToRollback(null)}
                      className="h-9 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold uppercase tracking-wider text-xs focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      disabled={isRollingBack}
                      onClick={handleExecuteRollback}
                      className="h-9 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
                    >
                      {isRollingBack ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Đang khôi phục...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>✔ Xác nhận Khôi phục phiên bản [{targetVersionToRollback}]</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span>TIÊU CHUẨN: SIEMENS PM-CONTROL V12 SEC. 5.6 & FDA 21 CFR PART 11</span>
              <button
                type="button"
                onClick={() => setIsRollbackModalOpen(false)}
                className="h-8 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2 active:translate-y-px transition-none"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MESA BATCHML MASTER RECIPE EXPORT MODAL */}
      <IsaB2mmlExportModal
        isOpen={isIsaRecipeModalOpen}
        onClose={() => setIsIsaRecipeModalOpen(false)}
        initialSchema="recipe"
        initialRecipeId={activeRecipe?.id || 1}
        availableRecipes={recipes.map(r => ({ id: r.id, code: r.code, name: r.name }))}
      />
    </div>
  );
};
