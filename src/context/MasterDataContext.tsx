/* Hallmark · component: MasterDataContext · genre: modern-minimal · register: industrial-workbench
 * contrast: WCAG AA Pass
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Customer, 
  MasterRecipe, 
  RecipeParameter, 
  RecipeDetail, 
  WorkOrder,
  CalculatedSetpoint,
  PmControlBatchType,
  ParameterScalingRule,
  PmControlJobSummary
} from '../types/masterData';
import * as api from '../services/api';
import { useConfig } from './ConfigContext';

const useSafeConfig = () => {
  try {
    return useConfig();
  } catch {
    return null;
  }
};

export interface MasterDataContextType {
  // Customers
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id'> & { id?: number }) => Promise<boolean>;
  editCustomer: (id: number, customer: Partial<Customer>) => Promise<boolean>;
  deleteCustomer: (id: number) => Promise<boolean>;

  // Recipe Masters (Siemens PM-CONTROL Benchmark)
  recipes: MasterRecipe[];
  selectedRecipeId: number | null;
  setSelectedRecipeId: (id: number | null) => void;
  saveRecipeMaster: (recipe: Omit<MasterRecipe, 'id'> & { id?: number }) => Promise<boolean>;
  editRecipeMaster: (id: number, recipe: Partial<MasterRecipe>) => Promise<boolean>;
  deleteRecipeMaster: (id: number) => Promise<boolean>;
  createNewVersion: (recipeId: number) => Promise<boolean>;
  approveRecipe: (recipeId: number) => Promise<boolean>;
  lockRecipe: (recipeId: number) => Promise<boolean>;
  updateRecipeParameters: (recipeId: number, parameters: RecipeParameter[]) => Promise<boolean>;

  // Recipe Details (Backward-compatibility)
  recipeDetails: RecipeDetail[];
  addRecipeDetail: (detail: any) => boolean;
  editRecipeDetail: (id: number, detail: any) => boolean;
  deleteRecipeDetail: (id: number) => boolean;

  // Work Orders (Operations Dispatch & Control Recipe)
  workOrders: WorkOrder[];
  addWorkOrder: (order: Omit<WorkOrder, 'id'> & { id?: number }) => Promise<boolean>;
  editWorkOrder: (id: number, order: Partial<WorkOrder>) => Promise<boolean>;
  deleteWorkOrder: (id: number) => Promise<boolean>;
  dispatchWorkOrder: (id: number) => Promise<boolean>;

  // State synchronization & feedback
  isLoading: boolean;
  errorNotice: string | null;
  clearErrorNotice: () => void;
  refetchData: () => Promise<void>;
}



export const resolveParameterScalingRule = (param: Partial<RecipeParameter>): ParameterScalingRule => {
  if (param.scalingRule === 'FIXED' || param.scaling_rule === 'FIXED') return 'FIXED';
  if (param.scalingRule === 'SCALABLE' || param.scaling_rule === 'SCALABLE') return 'SCALABLE';

  const ph = String(param.phaseId || '').trim().toUpperCase();
  const name = String(param.parameterName || param.materialName || '').trim().toUpperCase();
  const tag = String(param.targetNodeId || param.tagName || '').trim().toUpperCase();
  const unit = String(param.unit || '').trim();

  if (
    ph === 'PH_HEATING' ||
    ph === 'PH_COOLING' ||
    ph === 'PH_AGITATING' ||
    ph === 'PH_MIXING' ||
    ph === 'PH_HOLDING' ||
    unit === '°C' ||
    unit === 'RPM' ||
    unit === 's' ||
    /TEMP|NHIỆT|TIME|THỜI GIAN|HOLDING|SPEED|AGITAT|RPM|KHUẤY/i.test(name) ||
    /TEMP|TIME|HOLDING|SPEED|AGITAT/i.test(tag)
  ) {
    return 'FIXED';
  }

  return 'SCALABLE';
};

export const resolveRecipeBatchType = (recipe?: MasterRecipe | null): PmControlBatchType => {
  const raw = String(recipe?.batchType || recipe?.batch_type || 'NORMALIZED_PERCENTAGE').trim().toUpperCase();
  if (raw === 'NORMALIZED_ABSOLUTE' || raw === 'NORMALIZED_PERCENTAGE' || raw === 'ABSOLUTE_FIXED') {
    return raw;
  }
  return 'NORMALIZED_PERCENTAGE';
};

export const resolveRecipeNormalizingBase = (recipe?: MasterRecipe | null): number => {
  const bt = resolveRecipeBatchType(recipe);
  const raw = recipe?.normalizingBase ?? recipe?.normalizing_base;
  if (raw !== undefined && raw !== null && Number(raw) > 0) {
    return Number(raw);
  }
  return bt === 'NORMALIZED_PERCENTAGE' ? 100.0 : 1000.0;
};

export const calculatePmControlJobSummary = (volume: number, recipe: MasterRecipe): PmControlJobSummary => {
  const batchType = resolveRecipeBatchType(recipe);
  const normalizingBase = resolveRecipeNormalizingBase(recipe);
  const targetQuantity = Number(volume) > 0 ? Number(volume) : 0;

  let conversionFactor = 1.0;
  let batchTypeLabel = 'Normalized Base / Percentage (Sec. 5.8.3)';
  let sectionRef = 'Siemens PM-CONTROL Sec. 5.8.3';
  let normalizingBaseUnit = '%';
  let conversionFormulaText = `${targetQuantity.toLocaleString()} L / 100%`;

  if (batchType === 'NORMALIZED_ABSOLUTE') {
    conversionFactor = normalizingBase > 0 ? targetQuantity / normalizingBase : 1.0;
    batchTypeLabel = 'Normalized Base / Absolute (Sec. 5.8.2)';
    sectionRef = 'Siemens PM-CONTROL Sec. 5.8.2';
    normalizingBaseUnit = 'L';
    conversionFormulaText = `${targetQuantity.toLocaleString()} L / ${normalizingBase.toLocaleString()} L`;
  } else if (batchType === 'ABSOLUTE_FIXED') {
    conversionFactor = 1.0;
    batchTypeLabel = 'Product with Fixed Absolute Values (Sec. 5.8.1)';
    sectionRef = 'Siemens PM-CONTROL Sec. 5.8.1';
    normalizingBaseUnit = 'L';
    conversionFormulaText = `1.0000 (Fixed Batch — No Job Control Scaling)`;
  } else {
    conversionFactor = targetQuantity / 100.0;
    batchTypeLabel = 'Normalized Base / Percentage (Sec. 5.8.3)';
    sectionRef = 'Siemens PM-CONTROL Sec. 5.8.3';
    normalizingBaseUnit = normalizingBase !== 100 ? `L (100% Base)` : '%';
    conversionFormulaText = `${targetQuantity.toLocaleString()} L / 100`;
  }

  const setpoints = calculateControlRecipeSetpoints(volume, recipe);
  const scalableSetpoints = setpoints.filter((sp) => sp.scalingRule === 'SCALABLE');
  const totalRawMaterialInput = parseFloat(
    scalableSetpoints.reduce((acc, sp) => acc + (Number(sp.calculatedValue) || 0), 0).toFixed(2)
  );

  const expectedNetOutputVolume = batchType === 'ABSOLUTE_FIXED' ? normalizingBase : targetQuantity;
  const rawLossVolume = parseFloat((totalRawMaterialInput - expectedNetOutputVolume).toFixed(2));
  const explicitLossPct = Number(recipe.expectedLossPercent ?? recipe.expected_loss_percent ?? 0);
  const computedLossPct = expectedNetOutputVolume > 0 && rawLossVolume > 0
    ? parseFloat(((rawLossVolume / expectedNetOutputVolume) * 100.0).toFixed(2))
    : (explicitLossPct > 0 ? explicitLossPct : 0.0);

  return {
    batchType,
    batchTypeLabel,
    sectionRef,
    normalizingBase,
    normalizingBaseUnit,
    targetQuantity,
    conversionFactor: parseFloat(conversionFactor.toFixed(4)),
    conversionFormulaText,
    totalRawMaterialInput,
    expectedNetOutputVolume,
    expectedLossVolume: rawLossVolume > 0 ? rawLossVolume : 0,
    expectedLossPercent: computedLossPct,
  };
};

export const calculateControlRecipeSetpoints = (volume: number, recipe: MasterRecipe): CalculatedSetpoint[] => {
  const batchType = resolveRecipeBatchType(recipe);
  const normalizingBase = resolveRecipeNormalizingBase(recipe);
  const targetQty = Number(volume) > 0 ? Number(volume) : 0;

  let conversionFactor = 1.0;
  if (batchType === 'NORMALIZED_ABSOLUTE') {
    conversionFactor = normalizingBase > 0 ? targetQty / normalizingBase : 1.0;
  } else if (batchType === 'ABSOLUTE_FIXED') {
    conversionFactor = 1.0;
  } else {
    conversionFactor = targetQty / 100.0;
  }

  const params = recipe.parameters || [];
  const milkParam = params.find(p => 
    p.phaseId === 'PH_SUPPLYMILK' || 
    p.phaseId === 'PH_DOSING_MILK' || 
    (p.phaseId === 'PH_DOSING' && /milk|sữa/i.test(p.parameterName || '')) ||
    /milk|sữa/i.test(p.parameterName || '')
  ) || params[0];

  const sugarParam = params.find(p => 
    p.phaseId === 'PH_SUPPLYSUGAR' || 
    p.phaseId === 'PH_DOSING_SUGAR' || 
    (p.phaseId === 'PH_DOSING' && /sugar|đường/i.test(p.parameterName || '')) ||
    /sugar|đường/i.test(p.parameterName || '')
  ) || params[1];

  const additiveParam = params.find(p => 
    p.phaseId === 'PH_SUPPLYADDITIVE' || 
    p.phaseId === 'PH_DOSING_ADDITIVE' || 
    (p.phaseId === 'PH_DOSING' && /additive|phụ gia/i.test(p.parameterName || '')) ||
    /additive|phụ gia/i.test(p.parameterName || '')
  ) || params[2];

  const heatParam = params.find(p => 
    p.phaseId === 'PH_HEATING' || 
    /temp|nhiệt|steril/i.test(p.parameterName || '') || 
    p.unit === '°C'
  );

  const milkMaster = milkParam ? (Number(milkParam.targetSetpoint ?? milkParam.targetValue ?? milkParam.percentage) || 70.0) : 70.0;
  const sugarMaster = sugarParam ? (Number(sugarParam.targetSetpoint ?? sugarParam.targetValue ?? sugarParam.percentage) || 20.0) : 20.0;
  const additiveMaster = additiveParam ? (Number(additiveParam.targetSetpoint ?? additiveParam.targetValue ?? additiveParam.percentage) || 10.0) : 10.0;
  const heatTemp = heatParam ? (Number(heatParam.targetSetpoint ?? heatParam.targetValue) || 138.0) : (recipe.tempHot || 138.0);

  const masterDosingUnit = batchType === 'NORMALIZED_PERCENTAGE' ? '%' : 'L';
  const masterSugarUnit = batchType === 'NORMALIZED_PERCENTAGE' ? '%' : 'kg';

  return [
    {
      name: 'Raw Milk Setpoint',
      phaseId: 'PH_SUPPLYMILK',
      targetNodeId: milkParam?.targetNodeId || 'Recipe_Milk_SP',
      masterValue: milkMaster,
      masterUnit: masterDosingUnit,
      scalingRule: 'SCALABLE',
      conversionFactor: parseFloat(conversionFactor.toFixed(4)),
      calculatedValue: parseFloat((milkMaster * conversionFactor).toFixed(2)),
      unit: 'L',
      percentage: milkMaster,
    },
    {
      name: 'Sugar Syrup Setpoint',
      phaseId: 'PH_SUPPLYSUGAR',
      targetNodeId: sugarParam?.targetNodeId || 'Recipe_Sugar_SP',
      masterValue: sugarMaster,
      masterUnit: masterSugarUnit,
      scalingRule: 'SCALABLE',
      conversionFactor: parseFloat(conversionFactor.toFixed(4)),
      calculatedValue: parseFloat((sugarMaster * conversionFactor).toFixed(2)),
      unit: 'kg',
      percentage: sugarMaster,
    },
    {
      name: 'Additive Dosing Setpoint',
      phaseId: 'PH_SUPPLYADDITIVE',
      targetNodeId: additiveParam?.targetNodeId || 'Recipe_Additive_SP',
      masterValue: additiveMaster,
      masterUnit: masterDosingUnit,
      scalingRule: 'SCALABLE',
      conversionFactor: parseFloat(conversionFactor.toFixed(4)),
      calculatedValue: parseFloat((additiveMaster * conversionFactor).toFixed(2)),
      unit: 'L',
      percentage: additiveMaster,
    },
    {
      name: 'Sterilization Temp Setpoint',
      phaseId: 'PH_HEATING',
      targetNodeId: heatParam?.targetNodeId || 'Recipe_Temp_SP',
      masterValue: heatTemp,
      masterUnit: '°C',
      scalingRule: 'FIXED',
      conversionFactor: 1.0,
      calculatedValue: heatTemp,
      unit: '°C',
    },
  ];
};

const MasterDataContext = createContext<MasterDataContextType | undefined>(undefined);

export const MasterDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recipes, setRecipes] = useState<MasterRecipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const clearErrorNotice = () => setErrorNotice(null);

  // Derived legacy recipeDetails
  const recipeDetails: RecipeDetail[] = recipes.flatMap((r) => r.parameters || []);

  const config = useSafeConfig();
  const sqlOnline = config?.sqlConfig?.connectionState === 'connected';

  // Live Fetch from physical SQL Server via API Service with resilient exponential backoff retry
  const fetchMasterDataWithRetry = async (retries = 3, delay = 1000) => {
    setIsLoading(true);
    try {
      const [custRes, recRes, ordRes] = await Promise.allSettled([
        api.getCustomers(),
        api.getRecipes(),
        api.getOrders(),
      ]);

      let anySuccess = false;

      if (custRes.status === 'fulfilled' && Array.isArray(custRes.value)) {
        setCustomers(custRes.value);
        anySuccess = true;
      }

      if (recRes.status === 'fulfilled' && Array.isArray(recRes.value)) {
        const rList = recRes.value;
        setRecipes(rList);
        if (rList.length > 0) {
          setSelectedRecipeId((prev) => (prev && rList.some((r) => r.id === prev) ? prev : rList[0].id));
        } else {
          setSelectedRecipeId(null);
        }
        anySuccess = true;
      }

      if (ordRes.status === 'fulfilled' && Array.isArray(ordRes.value)) {
        setWorkOrders(ordRes.value);
        anySuccess = true;
      }

      // If nothing succeeded, trigger retry
      if (!anySuccess && retries > 0) {
        throw new Error('Initial SQL Server handshake pending');
      }
      setErrorNotice(null);
    } catch (err: any) {
      if (retries > 0) {
        setTimeout(() => {
          fetchMasterDataWithRetry(retries - 1, Math.round(delay * 1.5));
        }, delay);
      } else {
        console.warn('[MasterData] Initial load retry exhausted:', err);
        setErrorNotice(err?.message || 'Database Read Warning: Unable to synchronize with SQL Server');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch on mount and whenever SQL Server transitions to connected
  useEffect(() => {
    fetchMasterDataWithRetry(3, 1000);
  }, [sqlOnline]);

  // Continuous 3s auto-refetch & cross-tab / cross-module event synchronization for dbo.Orders
  useEffect(() => {
    let isMounted = true;
    const pollOrders = async () => {
      try {
        const ords = await api.getOrders();
        if (isMounted && Array.isArray(ords)) {
          setWorkOrders(ords);
        }
      } catch (err) {
        // Silently ignore background polling blips
      }
    };

    const interval = setInterval(pollOrders, 3000);

    const handleOrdersUpdated = () => {
      pollOrders();
    };
    window.addEventListener('mes:orders-updated', handleOrdersUpdated);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('mes:orders-updated', handleOrdersUpdated);
    };
  }, []);

  // Update customer active orders count based on workOrders
  useEffect(() => {
    setCustomers((prev) =>
      prev.map((c) => {
        const activeCount = workOrders.filter(
          (wo) => wo.customerId === c.id && (wo.status === 'NEW' || wo.status === 'READY' || wo.status === 'RUNNING' || wo.status === 'New' || wo.status === 'Running')
        ).length;
        return { ...c, activeOrdersCount: activeCount };
      })
    );
  }, [workOrders]);

  // Customer Actions
  const addCustomer = async (customer: Omit<Customer, 'id'> & { id?: number }): Promise<boolean> => {
    try {
      await api.createCustomer(customer);
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Create customer error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const editCustomer = async (id: number, updated: Partial<Customer>): Promise<boolean> => {
    try {
      await api.updateCustomer(id, updated);
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Edit customer error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const deleteCustomer = async (id: number): Promise<boolean> => {
    try {
      await api.deleteCustomer(id);
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Delete customer error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  // Recipe Master Actions (Siemens PM-CONTROL Standard)
  const saveRecipeMaster = async (recipe: Omit<MasterRecipe, 'id'> & { id?: number }): Promise<boolean> => {
    try {
      await api.createRecipe(recipe);
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Save recipe error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const editRecipeMaster = async (id: number, updated: Partial<MasterRecipe>): Promise<boolean> => {
    try {
      // Optimistic state update
      setRecipes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
      );
      await api.updateRecipe(id, updated);
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Edit recipe error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const deleteRecipeMaster = async (id: number): Promise<boolean> => {
    try {
      await api.deleteRecipe(id);
      await fetchMasterDataWithRetry();
      if (selectedRecipeId === id) {
        setSelectedRecipeId(null);
      }
      return true;
    } catch (err: any) {
      console.error('[MasterData] Delete recipe error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const createNewVersion = async (recipeId: number): Promise<boolean> => {
    const parent = recipes.find((r) => r.id === recipeId);
    if (!parent) return false;

    // Increment version, e.g. v1.2 -> v1.3
    const match = parent.version.match(/v?(\d+)\.(\d+)/);
    let nextVer = 'v1.0';
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10) + 1;
      nextVer = `v${major}.${minor}`;
    } else {
      nextVer = `${parent.version}.1`;
    }

    try {
      await api.createRecipe({
        code: parent.code,
        name: parent.name,
        version: nextVer,
        status: 'DRAFT',
        tempHot: parent.tempHot,
        tempCold: parent.tempCold,
        batchType: parent.batchType || parent.batch_type || 'NORMALIZED_PERCENTAGE',
        batch_type: parent.batchType || parent.batch_type || 'NORMALIZED_PERCENTAGE',
        normalizingBase: parent.normalizingBase ?? parent.normalizing_base ?? 100.0,
        normalizing_base: parent.normalizingBase ?? parent.normalizing_base ?? 100.0,
        expectedLossPercent: parent.expectedLossPercent ?? parent.expected_loss_percent ?? 0.0,
        expected_loss_percent: parent.expectedLossPercent ?? parent.expected_loss_percent ?? 0.0,
        parameters: parent.parameters || [],
        user: 'MES Operator / Version Engine',
      });
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Create version error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const approveRecipe = async (recipeId: number): Promise<boolean> => {
    try {
      // Optimistic state update to immediately unlock downstream operations & counter
      setRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? { ...r, status: 'RELEASED' } : r))
      );
      await api.updateRecipe(recipeId, { status: 'RELEASED' });
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Approve recipe error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const lockRecipe = async (recipeId: number): Promise<boolean> => {
    try {
      // Optimistic state update
      setRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? { ...r, status: 'LOCKED' } : r))
      );
      await api.updateRecipe(recipeId, { status: 'LOCKED' });
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Lock recipe error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const updateRecipeParameters = async (recipeId: number, parameters: RecipeParameter[]): Promise<boolean> => {
    try {
      // Optimistic state update
      setRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? { ...r, parameters } : r))
      );
      const heat = parameters.find((p) => p.phaseId === 'PH_HEATING');
      const cool = parameters.find((p) => p.phaseId === 'PH_COOLING');
      await api.updateRecipe(recipeId, {
        parameters,
        tempHot: heat ? heat.targetValue : undefined,
        tempCold: cool ? cool.targetValue : undefined,
      });
      await fetchMasterDataWithRetry();
      return true;
    } catch (err: any) {
      console.error('[MasterData] Update recipe parameters error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  // Recipe Detail Legacy Actions
  const addRecipeDetail = (detail: any): boolean => {
    if (!selectedRecipeId) return false;
    const targetRecipe = recipes.find((r) => r.id === selectedRecipeId);
    if (!targetRecipe) return false;

    const newParam: RecipeParameter = {
      id: detail.id || `param-${Date.now()}`,
      phaseId: detail.phaseId || 'PH_CUSTOM',
      parameterName: detail.materialName || detail.parameterName || 'Custom Parameter',
      targetValue: detail.percentage ?? detail.targetValue ?? 0,
      unit: detail.unit || '%',
      tolerance: detail.tolerance || '±0.5%',
      targetNodeId: detail.tagName || detail.targetNodeId || 'Custom_SP',
      recipeId: selectedRecipeId,
      materialName: detail.materialName,
      percentage: detail.percentage,
      tagName: detail.tagName,
    };

    updateRecipeParameters(selectedRecipeId, [...(targetRecipe.parameters || []), newParam]);
    return true;
  };

  const editRecipeDetail = (id: number | string, updated: any): boolean => {
    if (!selectedRecipeId) return false;
    const targetRecipe = recipes.find((r) => r.id === selectedRecipeId);
    if (!targetRecipe) return false;

    const updatedParams = (targetRecipe.parameters || []).map((p) => {
      if (p.id === id.toString() || p.id === `param-${id}`) {
        return {
          ...p,
          ...updated,
          targetValue: updated.percentage ?? updated.targetValue ?? p.targetValue,
          parameterName: updated.materialName ?? updated.parameterName ?? p.parameterName,
          targetNodeId: updated.tagName ?? updated.targetNodeId ?? p.targetNodeId,
        };
      }
      return p;
    });

    updateRecipeParameters(selectedRecipeId, updatedParams);
    return true;
  };

  const deleteRecipeDetail = (id: number | string): boolean => {
    if (!selectedRecipeId) return false;
    const targetRecipe = recipes.find((r) => r.id === selectedRecipeId);
    if (!targetRecipe) return false;

    const filtered = (targetRecipe.parameters || []).filter(
      (p) => p.id !== id.toString() && p.id !== `param-${id}`
    );
    updateRecipeParameters(selectedRecipeId, filtered);
    return true;
  };

  // Work Order Actions
  const addWorkOrder = async (order: Omit<WorkOrder, 'id'> & { id?: number }): Promise<boolean> => {
    const nextId = order.id && !workOrders.some((w) => w.id === order.id)
      ? order.id
      : (workOrders.length > 0 ? Math.max(...workOrders.map((w) => w.id)) + 1 : 1);

    const orderId = order.orderId || `WO-${new Date().getFullYear()}-${nextId.toString().padStart(3, '0')}`;
    const initialStatus = order.status || 'NEW';

    try {
      await api.createOrder({
        order_code: orderId,
        orderId: orderId,
        id: orderId,
        recipe_id: order.recipeId || 1,
        customer_id: order.customerId || 1,
        customer_code: order.customerCode,
        target_volume: order.volume || 1000,
        volume: order.volume || 1000,
        status: initialStatus,
        scheduled_start_time: order.scheduledStartTime,
        user: 'Operator'
      });
      await fetchMasterDataWithRetry();
      window.dispatchEvent(new CustomEvent('mes:orders-updated'));
      return true;
    } catch (err: any) {
      console.error('[MasterData] Create order error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const editWorkOrder = async (id: number, updated: Partial<WorkOrder>): Promise<boolean> => {
    const target = workOrders.find((w) => w.id === id);
    if (!target) return false;
    try {
      if (updated.status) {
        await api.updateOrderStatus(target.orderId, updated.status, 'Operator');
        await fetchMasterDataWithRetry();
        window.dispatchEvent(new CustomEvent('mes:orders-updated'));
      } else {
        setWorkOrders((prev) => prev.map((w) => (w.id === id ? { ...w, ...updated, id } : w)));
      }
      return true;
    } catch (err: any) {
      console.error('[MasterData] Edit order error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const deleteWorkOrder = async (id: number): Promise<boolean> => {
    try {
      const target = workOrders.find((w) => w.id === id);
      const orderCode = target ? target.orderId : id;
      await api.deleteOrder(orderCode);
      await fetchMasterDataWithRetry();
      window.dispatchEvent(new CustomEvent('mes:orders-updated'));
      return true;
    } catch (err: any) {
      console.error('[MasterData] Delete work order error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  const dispatchWorkOrder = async (id: number): Promise<boolean> => {
    const target = workOrders.find((w) => w.id === id);
    if (!target) return false;

    try {
      await api.dispatchOrder(target.orderId, 'Supervisor');
      // Optimistically update
      setWorkOrders((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'READY' } : w))
      );
      await fetchMasterDataWithRetry();
      window.dispatchEvent(new CustomEvent('mes:orders-updated'));
      return true;
    } catch (err: any) {
      console.error('[MasterData] Dispatch order error:', err);
      const msg = err?.message || 'Database Write Failed';
      setErrorNotice(msg);
      throw err;
    }
  };

  return (
    <MasterDataContext.Provider
      value={{
        customers,
        addCustomer,
        editCustomer,
        deleteCustomer,

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

        recipeDetails,
        addRecipeDetail,
        editRecipeDetail,
        deleteRecipeDetail,

        workOrders,
        addWorkOrder,
        editWorkOrder,
        deleteWorkOrder,
        dispatchWorkOrder,

        isLoading,
        errorNotice,
        clearErrorNotice,
        refetchData: fetchMasterDataWithRetry,
      }}
    >
      {children}
    </MasterDataContext.Provider>
  );
};

export const useMasterData = (): MasterDataContextType => {
  const context = useContext(MasterDataContext);
  if (!context) {
    throw new Error('useMasterData must be used within a MasterDataProvider');
  }
  return context;
};
