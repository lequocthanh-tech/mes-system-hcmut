/* Hallmark · component: Isa88Model · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Edit2,
  Trash2,
  Check,
  X,
  Copy,
  ChevronRight,
  ChevronDown,
  Cpu,
  Box,
  FolderOpen,
  RotateCcw,
  Download,
  Upload,
  FileCode,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { extractDroppedOpcTag } from '../components/PinnedTagPalette';
import {
  getIsa88Hierarchy,
  createCustomIsa88Tag,
  createIsa88Unit,
  createIsa88Module,
  deleteIsa88Unit,
  deleteIsa88Module,
  deleteIsa88Tag,
  updateTagNodeId,
  testBulkKepwareNodes,
  getAssetTemplates,
  autoGenerateIsa88Unit,
  resetStandardIsa88Topology,
  probeAllMappedTags,
  exportIsa88TagMappings,
  importIsa88TagMappings,
  getIsaIngestionMetrics,
  getIsaCybersecurityPosture,
  instantiateAssetTemplate,
  getTiaPortalUdtScl,
  Isa88HierarchyUnit,
  Isa88HierarchyModule,
  Isa88HierarchyTag,
  AssetTemplate,
  IsaIngestionMetrics
} from '../services/api';
import { useSafeIsa88 } from '../context/Isa88Context';

type SelectionContext = {
  type: 'unit' | 'module';
  unitId: string;
  unitName: string;
  emId?: string;
  emName?: string;
};

export const Isa88Model: React.FC = () => {
  const isa88Ctx = useSafeIsa88();
  const contextTelemetryMap = isa88Ctx?.telemetryMap;

  // Real-time WebSocket Telemetry State for <100ms instant updates without page refresh
  const [wsTelemetryMap, setWsTelemetryMap] = useState<
    Record<string, { value: any; quality: string; timestamp?: string }>
  >({});
  const [streamActive, setStreamActive] = useState<boolean>(false);

  // Connect to backend WebSocket (/ws/telemetry) with automatic reconnection
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWebSocket = () => {
      if (!isMounted) return;
      try {
        const host = window.location.hostname || '127.0.0.1';
        ws = new WebSocket(`ws://${host}:8000/ws/telemetry`);

        ws.onopen = () => {
          if (!isMounted) return;
          setStreamActive(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'TAG_UPDATE' && msg.data) {
              const d = msg.data;
              const entry = {
                value: d.value,
                quality: d.quality || 'Good',
                timestamp: d.timestamp || new Date().toLocaleTimeString()
              };
              setWsTelemetryMap((prev) => {
                const next = { ...prev };
                if (d.node_id) {
                  next[d.node_id] = entry;
                  const clean = d.node_id.replace(/^ns=\d+;s=/, '').trim();
                  if (clean) next[clean] = entry;
                }
                if (d.tag_name) {
                  next[d.tag_name] = entry;
                }
                return next;
              });
            } else if (msg.type === 'TAGS_BATCH' && msg.tags) {
              setWsTelemetryMap((prev) => {
                const next = { ...prev };
                Object.entries(msg.tags).forEach(([nid, t]: [string, any]) => {
                  const entry = {
                    value: t.value,
                    quality: t.quality || 'Good',
                    timestamp: t.timestamp || new Date().toLocaleTimeString()
                  };
                  next[nid] = entry;
                  const clean = nid.replace(/^ns=\d+;s=/, '').trim();
                  if (clean) next[clean] = entry;
                  if (t.tag_name) next[t.tag_name] = entry;
                });
                return next;
              });
            } else if (msg.type === 'SNAPSHOT' && Array.isArray(msg.tags)) {
              setWsTelemetryMap((prev) => {
                const next = { ...prev };
                msg.tags.forEach((t: any) => {
                  const entry = {
                    value: t.value,
                    quality: t.quality || 'Good',
                    timestamp: t.timestamp || new Date().toLocaleTimeString()
                  };
                  if (t.node_id) {
                    next[t.node_id] = entry;
                    const clean = t.node_id.replace(/^ns=\d+;s=/, '').trim();
                    if (clean) next[clean] = entry;
                  }
                  if (t.tag_name) next[t.tag_name] = entry;
                });
                return next;
              });
            }
          } catch {
            // ignore non-json messages
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            setStreamActive(false);
            reconnectTimer = setTimeout(connectWebSocket, 2000);
          }
        };

        ws.onerror = () => {
          try { ws?.close(); } catch {}
        };
      } catch {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  }, []);

  // Hierarchy Data State
  const [hierarchy, setHierarchy] = useState<Isa88HierarchyUnit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isResettingTopology, setIsResettingTopology] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Tree Navigation State
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState<string>('');
  const [selectedContext, setSelectedContext] = useState<SelectionContext | null>(null);

  // Tag Search & Probe State
  const [tagSearch, setTagSearch] = useState<string>('');
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeResults, setProbeResults] = useState<
    Record<string, { quality: 'Good' | 'Bad'; value: any; error: string | null }>
  >({});

  // Hardware Commissioning Toolkit State
  const [isProbingAll, setIsProbingAll] = useState<boolean>(false);
  const [probeSummary, setProbeSummary] = useState<{
    total_mapped: number;
    good_count: number;
    bad_count: number;
    all_healthy: boolean;
    total_duration_ms: number;
  } | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Inline Node ID Editing
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [editingNodeIdValue, setEditingNodeIdValue] = useState<string>('');
  const [isSavingNodeId, setIsSavingNodeId] = useState<boolean>(false);

  // Add Custom Tag Form Drawer State
  const [isCustomTagFormOpen, setIsCustomTagFormOpen] = useState<boolean>(false);
  const [customTagName, setCustomTagName] = useState<string>('');
  const [customNodeId, setCustomNodeId] = useState<string>('');
  const [customRole, setCustomRole] = useState<string>('PV');
  const [customDataType, setCustomDataType] = useState<string>('Float');
  const [customUnit, setCustomUnit] = useState<string>('L');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [isSubmittingTag, setIsSubmittingTag] = useState<boolean>(false);

  // Add Unit Form State
  const [isAddUnitOpen, setIsAddUnitOpen] = useState<boolean>(false);
  const [newUnitCode, setNewUnitCode] = useState<string>('');
  const [newUnitName, setNewUnitName] = useState<string>('');
  const [newUnitType, setNewUnitType] = useState<string>('TANK');
  const [isSubmittingUnit, setIsSubmittingUnit] = useState<boolean>(false);

  // Add Module Form State
  const [isAddModuleOpen, setIsAddModuleOpen] = useState<boolean>(false);
  const [newModuleCode, setNewModuleCode] = useState<string>('');
  const [newModuleName, setNewModuleName] = useState<string>('');
  const [newModuleDesc, setNewModuleDesc] = useState<string>('');
  const [isSubmittingModule, setIsSubmittingModule] = useState<boolean>(false);

  // Auto-Generate Unit Modal State
  const [isAutoModalOpen, setIsAutoModalOpen] = useState<boolean>(false);
  const [templates, setTemplates] = useState<AssetTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [autoUnitCode, setAutoUnitCode] = useState<string>('');
  const [autoUnitName, setAutoUnitName] = useState<string>('');
  const [autoPrefix, setAutoPrefix] = useState<string>('');
  const [isGeneratingUnit, setIsGeneratingUnit] = useState<boolean>(false);

  // ISA-95 Dual-Speed Ingestion & Cybersecurity Telemetry State
  const [ingestionMetrics, setIngestionMetrics] = useState<IsaIngestionMetrics | null>(null);
  const [cyberPosture, setCyberPosture] = useState<any | null>(null);

  // Siemens TIA Portal SCL Export State
  const [isExportingScl, setIsExportingScl] = useState<boolean>(false);
  const [sclModalOpen, setSclModalOpen] = useState<boolean>(false);
  const [sclCode, setSclCode] = useState<string>('');

  // Standardized ISA-88 Asset Template Generator State
  const [isAssetTemplateModalOpen, setIsAssetTemplateModalOpen] = useState<boolean>(false);
  const [selectedAssetTemplateCode, setSelectedAssetTemplateCode] = useState<string>('TANK_STORAGE');
  const [assetInstanceCode, setAssetInstanceCode] = useState<string>('TK04');
  const [assetInstanceName, setAssetInstanceName] = useState<string>('Storage Silo Tank 04');
  const [assetLineCode, setAssetLineCode] = useState<string>('Line01');
  const [assetCellId, setAssetCellId] = useState<string>('Cell1_Real');
  const [isInstantiatingAsset, setIsInstantiatingAsset] = useState<boolean>(false);

  const STANDARD_TEMPLATES_CATALOG = [
    { code: 'TANK_STORAGE', name: 'Khuôn Mẫu Bồn Chứa (Storage Silo / Buffer Tank)', type: 'UNIT', tags: 6 },
    { code: 'UNIT_MIXER', name: 'Khuôn Mẫu Bồn Khuấy Trộn (Central Mixing Vessel)', type: 'UNIT', tags: 7 },
    { code: 'UNIT_UHT_HEATER', name: 'Khuôn Mẫu Trạm Tiệt Trùng UHT (Thermal Pasteurizer)', type: 'UNIT', tags: 8 },
    { code: 'UNIT_COOLER', name: 'Khuôn Mẫu Trạm Làm Lạnh Nhanh (Plate Chiller Unit)', type: 'UNIT', tags: 5 },
    { code: 'EM_DOSING_PUMP', name: 'Equipment Module: Bơm Định Lượng (Metering Pump)', type: 'EM', tags: 5 },
    { code: 'CM_VALVE_ONOFF', name: 'Control Module: Van Đóng Mở Khí Nén (Pneumatic Valve)', type: 'CM', tags: 4 },
    { code: 'CM_MOTOR_AGITATOR', name: 'Control Module: Động Cơ Cánh Khuấy (Agitator VFD Motor)', type: 'CM', tags: 5 },
  ];

  // Clipboard copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load Full Hierarchy
  const loadHierarchyData = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await getIsa88Hierarchy();
      setHierarchy(data);

      // Auto-expand all units by default for intuitive browsing
      setExpandedUnits(new Set(data.map((u) => u.unit_id)));

      // If no active context, select first unit or module
      setSelectedContext((prev) => {
        if (prev) {
          // Check if previously selected still exists
          const unitExists = data.find((u) => u.unit_id === prev.unitId);
          if (unitExists) {
            if (prev.type === 'module') {
              const emExists = unitExists.equipment_modules.find((em) => em.em_id === prev.emId);
              if (emExists) return prev;
            }
            return {
              type: 'unit',
              unitId: unitExists.unit_id,
              unitName: unitExists.unit_name
            };
          }
        }
        if (data.length > 0) {
          const firstUnit = data[0];
          if (firstUnit.equipment_modules.length > 0) {
            const firstEm = firstUnit.equipment_modules[0];
            return {
              type: 'module',
              unitId: firstUnit.unit_id,
              unitName: firstUnit.unit_name,
              emId: firstEm.em_id,
              emName: firstEm.em_name
            };
          }
          return {
            type: 'unit',
            unitId: firstUnit.unit_id,
            unitName: firstUnit.unit_name
          };
        }
        return null;
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tải cây phân cấp ISA-88 từ cơ sở dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleResetStandardTopology = async () => {
    if (!window.confirm('Khôi phục cấu hình chuẩn 7 Unit (TK01..TK03, MIX01, HEATER01, COOLER01, OUT01 với 41 Tags)? Hệ thống sẽ đồng bộ cây vật lý ISA-88 chuẩn và bảo toàn các Node ID đã cấu hình hợp lệ.')) {
      return;
    }
    try {
      setIsResettingTopology(true);
      setErrorMessage(null);
      const res = await resetStandardIsa88Topology();
      setSuccessBanner(res.message || 'Đã khôi phục thành công cấu hình chuẩn 7 Unit (41 Tags)!');
      await loadHierarchyData(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể khôi phục cấu hình ISA-88 chuẩn');
    } finally {
      setIsResettingTopology(false);
    }
  };

  const handleProbeAllMapped = async () => {
    setIsProbingAll(true);
    setErrorMessage(null);
    try {
      const res = await probeAllMappedTags();
      if (res && res.success) {
        setProbeSummary(res.summary);
        if (res.probed_tags) {
          const updatedResults: Record<string, { quality: 'Good' | 'Bad'; value: any; error: string | null }> = {};
          res.probed_tags.forEach((t) => {
            updatedResults[t.tag_name] = {
              quality: t.quality,
              value: t.value,
              error: t.error || null
            };
          });
          setProbeResults(prev => ({ ...prev, ...updatedResults }));
        }
        setSuccessBanner(
          `Đã kiểm tra ${res.summary.total_mapped} tags. Tốt (Good): ${res.summary.good_count}, Lỗi (Bad): ${res.summary.bad_count} (${res.summary.total_duration_ms}ms)`
        );
      } else {
        setErrorMessage('Không thể kiểm tra toàn bộ tags qua Kepware.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi gửi yêu cầu kiểm tra tags.');
    } finally {
      setIsProbingAll(false);
    }
  };

  const handleExportMappings = async () => {
    try {
      const data = await exportIsa88TagMappings();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `mes_isa88_tag_mappings_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setSuccessBanner('Đã xuất tệp sao lưu cấu hình ánh xạ tags thành công!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể xuất tệp cấu hình tag mappings.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importIsa88TagMappings(parsed);
      if (res && res.success) {
        setSuccessBanner(res.message);
        await loadHierarchyData(true);
      } else {
        setErrorMessage('Tệp cấu hình không hợp lệ hoặc không thể khôi phục.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi đọc tệp JSON ánh xạ tag.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load ISA-95 Ingestion Metrics and Cybersecurity Posture
  const loadPipelineAndSecurityMetrics = useCallback(async () => {
    try {
      const [metrics, posture] = await Promise.all([
        getIsaIngestionMetrics().catch(() => null),
        getIsaCybersecurityPosture().catch(() => null)
      ]);
      if (metrics) setIngestionMetrics(metrics);
      if (posture && posture.data) setCyberPosture(posture.data);
    } catch {
      // Non-fatal
    }
  }, []);

  const handleExportTiaPortalScl = async () => {
    setIsExportingScl(true);
    setErrorMessage(null);
    try {
      const res = await getTiaPortalUdtScl(false);
      if (res && res.content) {
        setSclCode(res.content);
        setSclModalOpen(true);
      } else {
        setErrorMessage('Không nhận được nội dung mã SCL từ máy chủ.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Không thể tạo mã nguồn TIA Portal SCL');
    } finally {
      setIsExportingScl(false);
    }
  };

  const handleDownloadTiaPortalScl = async () => {
    try {
      await getTiaPortalUdtScl(true);
      setSuccessBanner('Đã tải xuống tệp DB_OPC_Gateway.scl thành công!');
    } catch (e: any) {
      setErrorMessage(e.message || 'Không thể tải xuống tệp SCL');
    }
  };

  const handleInstantiateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetInstanceCode.trim()) {
      setErrorMessage('Vui lòng nhập Mã Thiết Bị (Instance Code)');
      return;
    }
    setIsInstantiatingAsset(true);
    setErrorMessage(null);
    try {
      const res = await instantiateAssetTemplate({
        template_code: selectedAssetTemplateCode,
        instance_code: assetInstanceCode.trim().toUpperCase(),
        instance_name: assetInstanceName.trim() || undefined,
        line_code: assetLineCode.trim() || 'Line01',
        cell_id: assetCellId
      });
      setSuccessBanner(res.message || `Đã khởi tạo thành công thiết bị ${assetInstanceCode} (${res.generated_tags_count} tags)!`);
      setIsAssetTemplateModalOpen(false);
      await loadHierarchyData(true);
      loadPipelineAndSecurityMetrics();
    } catch (e: any) {
      setErrorMessage(e.message || 'Lỗi khởi tạo thiết bị từ khuôn mẫu');
    } finally {
      setIsInstantiatingAsset(false);
    }
  };

  useEffect(() => {
    loadHierarchyData();
    loadPipelineAndSecurityMetrics();
    getAssetTemplates()
      .then((t) => {
        setTemplates(t);
        if (t.length > 0) setSelectedTemplateId(t[0].template_id);
      })
      .catch(() => {});

    const timer = setInterval(() => {
      loadPipelineAndSecurityMetrics();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadHierarchyData, loadPipelineAndSecurityMetrics]);

  // Toggle unit expand/collapse
  const toggleUnitExpand = (unitId: string) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  // Select Unit Context
  const handleSelectUnit = (unit: Isa88HierarchyUnit) => {
    setSelectedContext({
      type: 'unit',
      unitId: unit.unit_id,
      unitName: unit.unit_name
    });
    setIsCustomTagFormOpen(false);
  };

  // Select Module Context
  const handleSelectModule = (unit: Isa88HierarchyUnit, em: Isa88HierarchyModule) => {
    setSelectedContext({
      type: 'module',
      unitId: unit.unit_id,
      unitName: unit.unit_name,
      emId: em.em_id,
      emName: em.em_name
    });
    // Auto prefill node id pattern
    const prefix = `ns=2;s=MilkPlant.${unit.unit_id}.${em.em_id}.`;
    setCustomNodeId(prefix);
    setIsCustomTagFormOpen(false);
  };

  // Open custom tag drawer and prefill
  const handleOpenCustomTagDrawer = () => {
    if (!selectedContext) return;
    const emPart = selectedContext.emId || 'MAIN';
    setCustomTagName(`${selectedContext.unitId}_`);
    setCustomNodeId(`ns=2;s=MilkPlant.${selectedContext.unitId}.${emPart}.`);
    setCustomRole('PV');
    setCustomDataType('Float');
    setCustomUnit('L');
    setCustomDescription('');
    setIsCustomTagFormOpen(true);
  };

  // Submit Custom Tag
  const handleSubmitCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContext) return;
    if (!customTagName.trim() || !customNodeId.trim()) {
      setErrorMessage('Vui lòng nhập Tên Tag và Kepware Node ID');
      return;
    }

    setIsSubmittingTag(true);
    setErrorMessage(null);

    const targetEmId =
      selectedContext.emId || `EM_${selectedContext.unitId}_MAIN`;

    try {
      await createCustomIsa88Tag({
        unit_id: selectedContext.unitId,
        em_id: targetEmId,
        tag_name: customTagName.trim(),
        node_id: customNodeId.trim(),
        data_type: customDataType,
        unit: customUnit.trim(),
        role: customRole,
        description: customDescription.trim() || `${selectedContext.unitId} ${targetEmId} ${customTagName}`
      });

      setSuccessBanner(`Đã thêm Tag đặc thù '${customTagName}' thành công vào SQL Server & Kepware.`);
      setIsCustomTagFormOpen(false);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi lưu Custom Tag');
    } finally {
      setIsSubmittingTag(false);
    }
  };

  // Submit New Unit
  const handleSubmitNewUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitCode.trim()) return;
    setIsSubmittingUnit(true);
    try {
      await createIsa88Unit({
        unit_code: newUnitCode.trim().toUpperCase(),
        unit_name: newUnitName.trim() || `Unit ${newUnitCode.trim().toUpperCase()}`,
        unit_type: newUnitType
      });
      setSuccessBanner(`Đã tạo Unit '${newUnitCode.toUpperCase()}' thành công.`);
      setIsAddUnitOpen(false);
      setNewUnitCode('');
      setNewUnitName('');
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi tạo Unit');
    } finally {
      setIsSubmittingUnit(false);
    }
  };

  // Submit New Module
  const handleSubmitNewModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContext || !newModuleCode.trim()) return;
    setIsSubmittingModule(true);
    try {
      const code = newModuleCode.trim().toUpperCase();
      const emCode = code.startsWith('EM_') ? code : `EM_${selectedContext.unitId}_${code}`;
      await createIsa88Module({
        unit_code: selectedContext.unitId,
        em_code: emCode,
        em_name: newModuleName.trim() || emCode,
        description: newModuleDesc.trim()
      });
      setSuccessBanner(`Đã thêm Equipment Module '${emCode}' vào Unit '${selectedContext.unitId}'.`);
      setIsAddModuleOpen(false);
      setNewModuleCode('');
      setNewModuleName('');
      setNewModuleDesc('');
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi tạo Module');
    } finally {
      setIsSubmittingModule(false);
    }
  };

  // Auto Generate Unit Submit
  const handleAutoGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoUnitCode.trim() || !selectedTemplateId) return;
    setIsGeneratingUnit(true);
    try {
      await autoGenerateIsa88Unit({
        template_id: selectedTemplateId,
        unit_code: autoUnitCode.trim().toUpperCase(),
        unit_name: autoUnitName.trim() || `Unit ${autoUnitCode.trim().toUpperCase()}`,
        kepware_channel_device: autoPrefix.trim() || `MilkPlant.${autoUnitCode.trim().toUpperCase()}`
      });
      setSuccessBanner(`Đã khởi tạo tự động Unit '${autoUnitCode.toUpperCase()}' thành công.`);
      setIsAutoModalOpen(false);
      setAutoUnitCode('');
      setAutoUnitName('');
      setAutoPrefix('');
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi khởi tạo tự động');
    } finally {
      setIsGeneratingUnit(false);
    }
  };

  // Delete Unit
  const handleDeleteUnit = async (unitId: string) => {
    if (!window.confirm(`Xác nhận xóa Unit [${unitId}] và tất cả các Tag trực thuộc khỏi SQL Server?`)) return;
    try {
      await deleteIsa88Unit(unitId);
      setSuccessBanner(`Đã xóa Unit '${unitId}'.`);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa Unit');
    }
  };

  // Delete Module
  const handleDeleteModule = async (emCode: string) => {
    if (!window.confirm(`Xác nhận xóa Module [${emCode}] và các Tag liên quan?`)) return;
    try {
      await deleteIsa88Module(emCode);
      setSuccessBanner(`Đã xóa Module '${emCode}'.`);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa Module');
    }
  };

  // Delete Tag
  const handleDeleteTag = async (tagName: string) => {
    if (!window.confirm(`Xác nhận xóa Tag '${tagName}'?`)) return;
    try {
      await deleteIsa88Tag(tagName);
      setSuccessBanner(`Đã xóa Tag '${tagName}'.`);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa Tag');
    }
  };

  // Inline Node ID Edit Save
  const handleSaveNodeId = async (tagName: string) => {
    if (!editingNodeIdValue.trim()) return;
    setIsSavingNodeId(true);
    try {
      await updateTagNodeId(tagName, editingNodeIdValue.trim());
      setSuccessBanner('Cập nhật ánh xạ thành công và đã lưu CSDL!');
      setEditingTagName(null);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi cập nhật Node ID');
    } finally {
      setIsSavingNodeId(false);
    }
  };

  // Drag-and-Drop State & Handlers (Pinnable Kepware Tag Palette)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const handleDropOnTagRow = async (e: React.DragEvent, tagName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const dropped = extractDroppedOpcTag(e);
    if (!dropped || !dropped.node_id) return;

    try {
      await updateTagNodeId(tagName, dropped.node_id);
      setSuccessBanner(`✔ Đã ánh xạ kéo-thả Tag [${tagName}] ← ${dropped.node_id} và lưu vĩnh viễn vào SQL Server & tag_mappings.json!`);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi ánh xạ kéo-thả Node ID');
    }
  };

  const handleDropOnModule = async (e: React.DragEvent, unitId: string, emId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const dropped = extractDroppedOpcTag(e);
    if (!dropped || !dropped.node_id) return;

    const cleanSuffix = (dropped.name || dropped.node_id.split('.').pop() || 'TAG')
      .replace(/[^A-Za-z0-9_]/g, '_')
      .toUpperCase();
    const generatedTagName = `${unitId.replace('-', '')}_${cleanSuffix}`;
    const dt = dropped.data_type || 'Float';
    const isBool = dt.toLowerCase().includes('bool');

    try {
      await createCustomIsa88Tag({
        unit_id: unitId,
        em_id: emId,
        tag_name: generatedTagName,
        node_id: dropped.node_id,
        data_type: isBool ? 'Bool' : 'Float',
        unit: isBool ? '' : 'L',
        role: isBool ? 'STATE' : 'PV',
        description: `Auto-mapped from Kepware Tree (${dropped.path || dropped.node_id})`,
      });
      setSuccessBanner(`✔ Đã tạo & gán Tag mới [${generatedTagName}] ← ${dropped.node_id} vào Module [${emId}]!`);
      await loadHierarchyData(true);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      // If tag already exists, update its node_id instead
      try {
        await updateTagNodeId(generatedTagName, dropped.node_id);
        setSuccessBanner(`✔ Đã cập nhật Tag [${generatedTagName}] ← ${dropped.node_id} trong Module [${emId}]!`);
        await loadHierarchyData(true);
        setTimeout(() => setSuccessBanner(null), 5000);
      } catch (innerErr: any) {
        setErrorMessage(innerErr.message || err.message || 'Lỗi khi thả Tag vào Module');
      }
    }
  };

  // Probe single node
  const handleProbeNode = async (nodeId: string) => {
    if (!nodeId) return;
    try {
      const res = await testBulkKepwareNodes([nodeId]);
      if (res.results && res.results[nodeId]) {
        setProbeResults((prev) => ({
          ...prev,
          [nodeId]: res.results[nodeId]
        }));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể thăm dò Node');
    }
  };

  // Probe all tags in current context
  const handleProbeCurrentContext = async () => {
    const targetTags = activeContextTags;
    if (targetTags.length === 0) return;
    setIsProbing(true);
    try {
      const nodeIds = targetTags.map((t) => t.node_id).filter(Boolean);
      const res = await testBulkKepwareNodes(nodeIds);
      setProbeResults((prev) => ({
        ...prev,
        ...(res.results || {})
      }));
      setSuccessBanner(`Đã hoàn tất thăm dò ${res.total_probed} Kepware Node.`);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi thăm dò Kepware Gateway');
    } finally {
      setIsProbing(false);
    }
  };

  // Copy to clipboard
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Active Context Tags List
  const activeContextTags = useMemo(() => {
    if (!selectedContext) return [];
    const unit = hierarchy.find((u) => u.unit_id === selectedContext.unitId);
    if (!unit) return [];

    let rawTags: Isa88HierarchyTag[] = [];
    if (selectedContext.type === 'unit') {
      // Return all tags under all modules of this unit
      unit.equipment_modules.forEach((em) => {
        rawTags.push(...em.tags);
      });
    } else if (selectedContext.type === 'module' && selectedContext.emId) {
      // Return tags only for this specific module
      const em = unit.equipment_modules.find((m) => m.em_id === selectedContext.emId);
      if (em) rawTags = em.tags;
    }

    if (tagSearch.trim()) {
      const q = tagSearch.toLowerCase();
      rawTags = rawTags.filter(
        (t) =>
          t.tag_name.toLowerCase().includes(q) ||
          t.node_id.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q)
      );
    }

    return rawTags;
  }, [hierarchy, selectedContext, tagSearch]);

  // Total metrics
  const totalUnits = hierarchy.length;
  const totalModules = hierarchy.reduce((acc, u) => acc + u.equipment_modules.length, 0);
  const totalTags = hierarchy.reduce(
    (acc, u) => acc + u.equipment_modules.reduce((mAcc, m) => mAcc + m.tags.length, 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* =========================================================================
          HEADER: INDUSTRIAL TECHNICAL WORKBENCH REGISTER
      ========================================================================= */}
      <div className="border-b border-slate-200 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-wider mb-1">
            <span>MES Level 3</span>
            <span>/</span>
            <span>ISA-88 Batch Model</span>
            <span>/</span>
            <span className="text-slate-900 font-semibold">TIA Portal Project Workspace</span>
          </div>

          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-slate-800" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight font-mono" style={{ fontStyle: 'normal' }}>
              ISA-88 PROJECT TREE & TAG INSPECTOR
            </h1>
          </div>

          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Không gian làm việc dạng phân cấp TIA Portal: Duyệt cây vật lý Unit &gt; Equipment Module (EM), cấu hình ánh xạ OPC UA Kepware và gắn Tag quy trình trực tiếp trong khung Inspector.
          </p>
        </div>

        {/* Global Toolbar Buttons */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <div className="h-9 px-3 bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5 rounded-xs shadow-xs" title="Bus đồng bộ 2 chiều thời gian thực giữa ISA-88, Operations, Inventory, Maintenance, Quality, và OEE đang hoạt động">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span>ĐỒNG BỘ XUYÊN MODULE (AUTO-SYNC)</span>
          </div>

          <div
            className={`h-9 px-3 border font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5 rounded-xs shadow-xs transition-colors ${
              streamActive
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-slate-100 border-slate-300 text-slate-600'
            }`}
            title="Kênh truyền dữ liệu thời gian thực Kepware OPC UA WebSocket (/ws/telemetry)"
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                streamActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{streamActive ? 'OPC TELEMETRY: REALTIME (<100ms)' : 'OPC TELEMETRY: CONNECTING...'}</span>
          </div>

          <button
            type="button"
            onClick={handleProbeAllMapped}
            disabled={isProbingAll || loading}
            className="h-9 px-3 bg-white border border-sky-600 hover:bg-sky-50 text-sky-900 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px disabled:opacity-50"
            title="Kiểm tra chất lượng kết nối OPC UA đồng thời cho tất cả các tag đã ánh xạ"
          >
            <Zap className={`w-3.5 h-3.5 text-sky-600 ${isProbingAll ? 'animate-spin' : ''}`} />
            <span>{isProbingAll ? 'ĐANG ĐỌC OPC...' : 'KIỂM TRA TẤT CẢ TAG ĐÃ GÁN'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportMappings}
            className="h-9 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px"
            title="Sao lưu toàn bộ cấu hình ánh xạ tag thành tệp JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>XUẤT CẤU HÌNH TAG</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="h-9 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px disabled:opacity-50"
            title="Khôi phục cấu hình ánh xạ tag từ tệp JSON"
          >
            <Upload className={`w-3.5 h-3.5 text-slate-600 ${isImporting ? 'animate-spin' : ''}`} />
            <span>{isImporting ? 'ĐANG NHẬP...' : 'NHẬP CẤU HÌNH TAG'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />

          <button
            type="button"
            onClick={handleResetStandardTopology}
            disabled={isResettingTopology || loading || refreshing}
            className="h-9 px-3 bg-white border border-slate-700 hover:bg-slate-800 hover:text-white text-slate-900 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px disabled:opacity-50"
            title="Khôi phục cấu hình chuẩn 7 Unit (41 Tags) theo kiến trúc chuẩn ANSI/ISA-88"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-slate-700 ${isResettingTopology ? 'animate-spin' : ''}`} />
            <span>{isResettingTopology ? 'ĐANG KHÔI PHỤC...' : 'KHÔI PHỤC 7 UNIT CHUẨN'}</span>
          </button>

          <button
            type="button"
            onClick={() => loadHierarchyData(true)}
            disabled={refreshing || loading || isResettingTopology}
            className="h-9 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px disabled:opacity-50"
            title="Làm mới cây dự án từ SQL Server"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span>LÀM MỚI</span>
          </button>

          <button
            type="button"
            onClick={handleExportTiaPortalScl}
            disabled={isExportingScl}
            className="h-9 px-3 bg-white border border-indigo-600 hover:bg-indigo-50 text-indigo-900 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px disabled:opacity-50"
            title="Xuất mã nguồn Siemens TIA Portal SCL (DB_OPC_Gateway.scl) chứa UDTs và Global DB non-optimized"
          >
            <FileCode className={`w-3.5 h-3.5 text-indigo-600 ${isExportingScl ? 'animate-spin' : ''}`} />
            <span>{isExportingScl ? 'ĐANG TẠO SCL...' : 'EXPORT TIA PORTAL SCL'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAssetTemplateModalOpen(true)}
            className="h-9 px-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all shadow-xs hallmark-focus active:translate-y-px"
            title="Khởi tạo thiết bị chuẩn ISA-88 từ khuôn mẫu và tự động sinh tags + Kepware NodeIDs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ AUTO-GENERATE ASSET (TEMPLATE)</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          ISA-95 DUAL-SPEED & IEC 62541 / ISA-62443 CYBERSECURITY STATUS STRIP
      ========================================================================= */}
      <div className="bg-slate-900 text-slate-200 border border-slate-800 rounded-xs p-3 font-mono text-xs shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: ISA-95 Dual-Speed Ingestion Pipeline */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-sky-400 font-bold uppercase tracking-wider">
              <Activity className="w-4 h-4 text-sky-400 animate-pulse" />
              <span>ISA-95 DUAL-SPEED INGESTION:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">EDGE BUFFER:</span>
              <span className="text-white font-semibold">{ingestionMetrics?.edge_poll_ms ?? 100}ms (Ring 500)</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">UI RBE STREAM:</span>
              <span className="text-white font-semibold">{ingestionMetrics?.ui_broadcast_ms ?? 400}ms</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">DEADBAND:</span>
              <span className="text-emerald-400 font-semibold">&plusmn;{ingestionMetrics?.rbe_deadband ?? 0.05}</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">BANDWIDTH SAVED:</span>
              <span className="text-emerald-300 font-bold">
                {ingestionMetrics?.bandwidth_saved_percent ?? 0}%
              </span>
              <span className="text-[10px] text-slate-500">
                ({ingestionMetrics?.skipped_edge_broadcasts ?? 0}/{ingestionMetrics?.total_edge_ticks ?? 0} ticks)
              </span>
            </div>
          </div>

          {/* Right: IEC 62541 & ISA/IEC 62443 Security Posture */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>IEC 62541 / 62443:</span>
            </div>
            <span className="px-2 py-0.5 bg-indigo-950 border border-indigo-700/50 text-indigo-200 text-[11px] rounded-xs font-semibold">
              {cyberPosture?.iec62541_opc_ua?.active_security_policy ?? 'None (Lab)'}
            </span>
            <span className="text-slate-400">CONDUIT: <strong className="text-white">Port {cyberPosture?.iec62541_opc_ua?.conduit_port ?? 49320}</strong></span>
            <span className="text-slate-400">IDMZ QUEUE: <strong className={cyberPosture?.zone_3_5_idmz?.pending_records ? "text-amber-400" : "text-emerald-400"}>
              {cyberPosture?.zone_3_5_idmz?.pending_records ?? 0} PKTS
            </strong></span>
            <button
              type="button"
              onClick={loadPipelineAndSecurityMetrics}
              title="Làm mới thông số Dual-Speed và An ninh mạng"
              className="p-1 hover:text-white text-slate-400 hover:bg-slate-800 rounded-xs hallmark-focus"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Telemetry Probe Summary Strip */}
      {probeSummary && (
        <div className="bg-slate-900 text-slate-100 px-3.5 py-2.5 rounded-xs text-xs font-mono flex flex-wrap items-center justify-between border border-slate-800 shadow-sm gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-slate-400 font-bold">OPC BATCH PROBE:</span>
            <span>ĐÃ GÁN: <strong className="text-white">{probeSummary.total_mapped}</strong></span>
            <span className="text-emerald-400">TỐT (GOOD): <strong>{probeSummary.good_count}</strong></span>
            <span className={probeSummary.bad_count > 0 ? "text-rose-400" : "text-slate-400"}>LỖI (BAD): <strong>{probeSummary.bad_count}</strong></span>
            <span className="text-slate-400">ĐỘ TRỄ: <strong>{probeSummary.total_duration_ms}ms</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-xs ${probeSummary.all_healthy ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"}`}>
              {probeSummary.all_healthy ? "100% HEALTHY" : "ATTENTION REQUIRED"}
            </span>
            <button onClick={() => setProbeSummary(null)} className="text-slate-400 hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Notifications */}
      {successBanner && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3.5 py-2.5 rounded-xs text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 px-3.5 py-2.5 rounded-xs text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-700 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =========================================================================
          SPLIT-SCREEN WORKSPACE: LEFT PANE (TREE) & RIGHT PANE (INSPECTOR)
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* =======================================================================
            LEFT PANE: ISA-88 PHYSICAL PROJECT TREE (35% - 4/12 cols)
        ======================================================================= */}
        <section
          aria-label="ISA-88 Physical Project Tree"
          className="lg:col-span-4 bg-white border border-slate-300 shadow-xs rounded-xs flex flex-col min-h-[580px]"
        >
          {/* Tree Header */}
          <div className="p-3 bg-slate-100 border-b border-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-slate-700" />
              <span className="font-mono text-xs font-bold text-slate-900 uppercase">
                PROJECT TREE (CÂY VẬT LÝ)
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Add Unit Button */}
              <button
                type="button"
                onClick={() => setIsAddUnitOpen((p) => !p)}
                className="h-7 px-2 bg-white border border-slate-300 hover:bg-slate-200 text-slate-800 font-mono text-[11px] font-semibold rounded-xs flex items-center gap-1 hallmark-focus active:translate-y-px"
                title="Thêm Unit mới vào cây"
              >
                <Plus className="w-3 h-3 text-emerald-700" />
                <span>+ Unit</span>
              </button>

              {/* Add Module Button */}
              <button
                type="button"
                onClick={() => {
                  if (!selectedContext) {
                    setErrorMessage('Vui lòng chọn Unit trước khi thêm Equipment Module');
                    return;
                  }
                  setIsAddModuleOpen((p) => !p);
                }}
                className="h-7 px-2 bg-white border border-slate-300 hover:bg-slate-200 text-slate-800 font-mono text-[11px] font-semibold rounded-xs flex items-center gap-1 hallmark-focus active:translate-y-px"
                title="Thêm Equipment Module vào Unit đã chọn"
              >
                <Plus className="w-3 h-3 text-sky-700" />
                <span>+ Module</span>
              </button>
            </div>
          </div>

          {/* Inline Form: Add Unit */}
          {isAddUnitOpen && (
            <form onSubmit={handleSubmitNewUnit} className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-800">
                <span>THÊM UNIT MỚI</span>
                <button type="button" onClick={() => setIsAddUnitOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Mã Unit (VD: TK03)"
                  value={newUnitCode}
                  onChange={(e) => setNewUnitCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  className="h-8 px-2 text-xs font-mono border border-slate-300 rounded-xs uppercase bg-white hallmark-focus"
                  required
                />
                <input
                  type="text"
                  placeholder="Tên Unit (VD: Bồn chứa 03)"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="h-8 px-2 text-xs font-mono border border-slate-300 rounded-xs bg-white hallmark-focus"
                />
                <select
                  value={newUnitType}
                  onChange={(e) => setNewUnitType(e.target.value)}
                  className="h-8 px-2 text-xs font-mono border border-slate-300 rounded-xs bg-white hallmark-focus"
                >
                  <option value="STORAGE_TANK">Bồn chứa (Storage)</option>
                  <option value="MIXING_TANK">Bồn khuấy (Mixing)</option>
                  <option value="UHT_UNIT">Trạm UHT</option>
                  <option value="PROCESS_UNIT">Trạm xử lý</option>
                </select>
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddUnitOpen(false)}
                  className="h-7 px-2 text-xs font-mono text-slate-600 hover:bg-slate-200 rounded-xs"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUnit}
                  className="h-7 px-3 bg-slate-900 text-white text-xs font-mono rounded-xs font-bold hover:bg-slate-800 hallmark-focus"
                >
                  {isSubmittingUnit ? 'Đang tạo...' : 'Tạo Unit'}
                </button>
              </div>
            </form>
          )}

          {/* Inline Form: Add Module */}
          {isAddModuleOpen && selectedContext && (
            <form onSubmit={handleSubmitNewModule} className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-800">
                <span>THÊM MODULE CHO [{selectedContext.unitId}]</span>
                <button type="button" onClick={() => setIsAddModuleOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Mã EM (VD: AGITATOR)"
                  value={newModuleCode}
                  onChange={(e) => setNewModuleCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  className="h-8 px-2 text-xs font-mono border border-slate-300 rounded-xs uppercase bg-white hallmark-focus"
                  required
                />
                <input
                  type="text"
                  placeholder="Tên Module (VD: Cánh khuấy)"
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  className="h-8 px-2 text-xs font-mono border border-slate-300 rounded-xs bg-white hallmark-focus"
                />
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddModuleOpen(false)}
                  className="h-7 px-2 text-xs font-mono text-slate-600 hover:bg-slate-200 rounded-xs"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModule}
                  className="h-7 px-3 bg-sky-700 text-white text-xs font-mono rounded-xs font-bold hover:bg-sky-800 hallmark-focus"
                >
                  {isSubmittingModule ? 'Đang thêm...' : 'Thêm Module'}
                </button>
              </div>
            </form>
          )}

          {/* Search bar inside tree */}
          <div className="p-2 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm Unit / Equipment Module..."
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                className="w-full h-7 pl-7 pr-6 text-[11px] font-mono border border-slate-300 rounded-xs bg-white hallmark-focus"
              />
              {treeSearch && (
                <button onClick={() => setTreeSearch('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Hierarchy Tree Node List */}
          <div className="p-2 overflow-y-auto flex-1 font-mono text-xs divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-slate-400" />
                <span>Đang tải cây cấu trúc TIA Portal...</span>
              </div>
            ) : hierarchy.length === 0 ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">
                <span>Chưa có Unit nào trong hệ thống.</span>
              </div>
            ) : (
              hierarchy
                .filter((u) => {
                  if (!treeSearch.trim()) return true;
                  const q = treeSearch.toLowerCase();
                  const matchesUnit = u.unit_id.toLowerCase().includes(q) || u.unit_name.toLowerCase().includes(q);
                  const matchesEm = u.equipment_modules.some(
                    (em) => em.em_id.toLowerCase().includes(q) || em.em_name.toLowerCase().includes(q)
                  );
                  return matchesUnit || matchesEm;
                })
                .map((unit) => {
                  const isExpanded = expandedUnits.has(unit.unit_id);
                  const isUnitSelected = selectedContext?.type === 'unit' && selectedContext.unitId === unit.unit_id;
                  const unitTagCount = unit.equipment_modules.reduce((c, em) => c + em.tags.length, 0);

                  return (
                    <div key={unit.unit_id} className="py-1">
                      {/* LEVEL 1: UNIT NODE */}
                      <div
                        className={`group flex items-center justify-between p-1.5 rounded-xs cursor-pointer select-none transition-colors border ${
                          isUnitSelected
                            ? 'bg-slate-900 text-white border-slate-900 font-bold'
                            : 'hover:bg-slate-100 border-transparent text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={() => handleSelectUnit(unit)}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleUnitExpand(unit.unit_id);
                            }}
                            className="p-0.5 hover:bg-slate-200/50 rounded-xs"
                          >
                            {isExpanded ? (
                              <ChevronDown className={`w-3.5 h-3.5 ${isUnitSelected ? 'text-white' : 'text-slate-500'}`} />
                            ) : (
                              <ChevronRight className={`w-3.5 h-3.5 ${isUnitSelected ? 'text-white' : 'text-slate-500'}`} />
                            )}
                          </button>

                          <Box className={`w-4 h-4 flex-shrink-0 ${isUnitSelected ? 'text-emerald-400' : 'text-slate-600'}`} />

                          <span className="truncate text-xs font-mono">
                            {unit.unit_id} - {unit.unit_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded-xs text-[10px] font-mono ${
                              isUnitSelected
                                ? 'bg-slate-800 text-slate-200'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {unitTagCount} tags
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUnit(unit.unit_id);
                            }}
                            title={`Xóa Unit ${unit.unit_id}`}
                            className={`opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-opacity ${
                              isUnitSelected ? 'text-slate-300' : 'text-slate-400'
                            }`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* LEVEL 2: EQUIPMENT MODULES (CHILDREN) */}
                      {isExpanded && (
                        <div className="pl-6 pt-1 space-y-0.5 border-l-2 border-slate-200 ml-3.5 my-0.5">
                          {unit.equipment_modules.length === 0 ? (
                            <div className="text-[11px] text-slate-400 italic py-1 pl-2">
                              (Chưa có Equipment Module)
                            </div>
                          ) : (
                            unit.equipment_modules.map((em) => {
                              const isEmSelected =
                                selectedContext?.type === 'module' &&
                                selectedContext.unitId === unit.unit_id &&
                                selectedContext.emId === em.em_id;

                              return (
                                <div
                                  key={em.em_id}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'copy';
                                    setDragOverTarget(`em:${em.em_id}`);
                                  }}
                                  onDragLeave={() => {
                                    if (dragOverTarget === `em:${em.em_id}`) setDragOverTarget(null);
                                  }}
                                  onDrop={(e) => handleDropOnModule(e, unit.unit_id, em.em_id)}
                                  className={`group flex items-center justify-between p-1 pl-2 rounded-xs cursor-pointer select-none transition-colors border ${
                                    dragOverTarget === `em:${em.em_id}`
                                      ? 'ring-2 ring-emerald-500 bg-emerald-50/70 border-emerald-500 text-emerald-950 font-bold'
                                      : isEmSelected
                                      ? 'bg-sky-700 text-white border-sky-700 font-bold'
                                      : 'hover:bg-slate-100 border-transparent text-slate-700'
                                  }`}
                                  onClick={() => handleSelectModule(unit, em)}
                                  title={`${em.em_name} (Kéo thả Tag từ Kho Kepware vào đây để thêm mới)`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <Cpu className={`w-3.5 h-3.5 flex-shrink-0 ${isEmSelected ? 'text-white' : 'text-sky-600'}`} />
                                    <span className="truncate text-xs font-mono" title={em.em_name}>
                                      {em.em_id}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <span
                                      className={`px-1 py-0.2 rounded-xs text-[10px] font-mono ${
                                        isEmSelected ? 'bg-sky-800 text-sky-100' : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {em.tags.length}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteModule(em.em_id);
                                      }}
                                      title={`Xóa Module ${em.em_id}`}
                                      className={`opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-500 transition-opacity ${
                                        isEmSelected ? 'text-white' : 'text-slate-400'
                                      }`}
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          {/* Tree Footer metrics */}
          <div className="p-2.5 bg-slate-100 border-t border-slate-300 text-[11px] font-mono text-slate-600 flex items-center justify-between">
            <span>{totalUnits} Units • {totalModules} EMs</span>
            <span className="font-bold text-slate-800">{totalTags} Tags Tổng</span>
          </div>
        </section>

        {/* =======================================================================
            RIGHT PANE: TAG INSPECTOR & OPC MAPPING (65% - 8/12 cols)
        ======================================================================= */}
        <section
          aria-label="Tag Inspector & OPC Mapping"
          className="lg:col-span-8 bg-white border border-slate-300 shadow-xs rounded-xs flex flex-col min-h-[580px]"
        >
          {/* Inspector Header & Breadcrumb Context */}
          <div className="p-3 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase text-slate-500">
                <span>PLANT</span>
                <span>/</span>
                <span className="font-bold text-slate-800">{selectedContext?.unitId || '--'}</span>
                {selectedContext?.type === 'module' && (
                  <>
                    <span>/</span>
                    <span className="font-bold text-sky-700">{selectedContext.emId}</span>
                  </>
                )}
              </div>
              <div className="text-xs font-bold font-mono text-slate-900 mt-0.5">
                TAG INSPECTOR & OPC MAPPING ({activeContextTags.length} TAGS TRỰC THUỘC)
              </div>
            </div>

            {/* Inspector Actions */}
            <div className="flex items-center gap-2 font-mono text-xs">
              {/* Probe Context button */}
              <button
                type="button"
                onClick={handleProbeCurrentContext}
                disabled={isProbing || activeContextTags.length === 0}
                className="h-8 px-2.5 bg-white border border-sky-600 hover:bg-sky-50 text-sky-700 font-semibold uppercase flex items-center gap-1.5 rounded-xs hallmark-focus active:translate-y-px disabled:opacity-50"
                title="Thăm dò kết nối OPC UA cho tất cả tag trong module này"
              >
                <Zap className={`w-3.5 h-3.5 text-sky-600 ${isProbing ? 'animate-spin' : ''}`} />
                <span>{isProbing ? 'ĐANG ĐO...' : 'OPC PROBE'}</span>
              </button>

              {/* Add Custom Tag to this Module button */}
              <button
                type="button"
                onClick={handleOpenCustomTagDrawer}
                disabled={!selectedContext}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold uppercase flex items-center gap-1.5 rounded-xs shadow-xs hallmark-focus active:translate-y-px disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
                <span>+ THÊM TAG ĐẶC THÙ CHO MODULE NÀY</span>
              </button>
            </div>
          </div>

          {/* Custom Tag Inline Drawer Form */}
          {isCustomTagFormOpen && selectedContext && (
            <form onSubmit={handleSubmitCustomTag} className="p-3.5 bg-emerald-50/50 border-b border-emerald-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-emerald-900">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-700" />
                  <span>
                    THÊM TAG MỚI CHO [{selectedContext.unitId}] &gt; [{selectedContext.emId || 'GENERAL'}]
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomTagFormOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 font-mono text-xs">
                {/* Tag Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Tên Tag (Tag Name) *
                  </label>
                  <input
                    type="text"
                    value={customTagName}
                    onChange={(e) => setCustomTagName(e.target.value)}
                    placeholder="VD: MIX01_Agitator_Speed_PV"
                    className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                    required
                  />
                </div>

                {/* Kepware Node ID */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Kepware Node ID * (Có thể kéo-thả từ Kho Tag Ghim)
                  </label>
                  <input
                    type="text"
                    value={customNodeId}
                    onChange={(e) => setCustomNodeId(e.target.value)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      setDragOverTarget('custom-tag-input');
                    }}
                    onDragLeave={() => {
                      if (dragOverTarget === 'custom-tag-input') setDragOverTarget(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverTarget(null);
                      const dropped = extractDroppedOpcTag(e);
                      if (dropped?.node_id) {
                        setCustomNodeId(dropped.node_id);
                        if (!customTagName && dropped.name && selectedContext) {
                          setCustomTagName(`${selectedContext.unitId.replace('-', '')}_${dropped.name.toUpperCase()}`);
                        }
                      }
                    }}
                    placeholder="ns=2;s=MilkPlant.MIX01.Agit_Speed (Hoặc thả Tag vào đây)"
                    className={`w-full h-8 px-2 border rounded-xs bg-white hallmark-focus ${
                      dragOverTarget === 'custom-tag-input'
                        ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-500'
                        : 'border-slate-300'
                    }`}
                    required
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Vai trò (Role)
                  </label>
                  <select
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                  >
                    <option value="PV">PV (Process Value / Đọc)</option>
                    <option value="SP">SP (Setpoint / Đọc-Ghi)</option>
                    <option value="CMD">CMD (Command Bit / Điều khiển)</option>
                    <option value="STATE">STATE (Trạng thái PackML)</option>
                  </select>
                </div>

                {/* Data Type */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Kiểu dữ liệu (Data Type)
                  </label>
                  <select
                    value={customDataType}
                    onChange={(e) => setCustomDataType(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                  >
                    <option value="Float">Float (Số thực Real)</option>
                    <option value="Bool">Bool (Nhị phân 0/1)</option>
                    <option value="Int16">Int16 (Số nguyên 16-bit)</option>
                    <option value="String">String (Chuỗi ký tự)</option>
                  </select>
                </div>

                {/* Unit & Description */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Đơn vị đo (Eng Unit)
                  </label>
                  <input
                    type="text"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="°C, RPM, L, bar..."
                    className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-emerald-200">
                <button
                  type="button"
                  onClick={() => setIsCustomTagFormOpen(false)}
                  className="h-8 px-3 text-xs font-mono text-slate-600 hover:bg-slate-200 rounded-xs"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTag}
                  className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs font-bold rounded-xs flex items-center gap-1.5 shadow-xs hallmark-focus"
                >
                  {isSubmittingTag ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>ĐANG LƯU...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>LƯU TAG VÀO SQL & KEPWARE</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Filter / Search within Inspector Tags */}
          <div className="p-2 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Lọc tag theo Tên, Node ID, Mô tả..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="w-full h-7 pl-7 pr-6 text-[11px] font-mono border border-slate-300 rounded-xs bg-white hallmark-focus"
              />
              {tagSearch && (
                <button onClick={() => setTagSearch('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="text-[11px] font-mono text-slate-500">
              Đang hiển thị: <strong className="text-slate-900">{activeContextTags.length}</strong> tags
            </div>
          </div>

          {/* Inspector Tags Data Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3 font-semibold">TÊN TAG</th>
                  <th className="py-2.5 px-2.5 font-semibold text-center">VAI TRÒ</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[260px]">KEPWARE NODE ID (SỬA TRỰC TIẾP)</th>
                  <th className="py-2.5 px-2.5 font-semibold">KIỂU DỮ LIỆU</th>
                  <th className="py-2.5 px-3 font-semibold text-right">GIÁ TRỊ SỐNG</th>
                  <th className="py-2.5 px-2.5 font-semibold text-center">CHẤT LƯỢNG</th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {activeContextTags.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500 font-mono">
                      <div className="max-w-md mx-auto space-y-2">
                        <Cpu className="w-8 h-8 mx-auto text-slate-400" />
                        <div className="text-sm font-bold text-slate-700">Module này chưa có Tag nào</div>
                        <p className="text-xs text-slate-500">
                          Nhấp nút <strong className="text-emerald-700">+ THÊM TAG ĐẶC THÙ CHO MODULE NÀY</strong> ở góc trên bên phải để tạo liên kết Kepware OPC UA đầu tiên.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  activeContextTags.map((tag) => {
                    const isEditing = editingTagName === tag.tag_name;
                    const cleanNode = tag.node_id ? tag.node_id.replace(/^ns=\d+;s=/, '').trim() : '';
                    const nodeKey = tag.node_id?.trim() || undefined;
                    const cleanKey = cleanNode || undefined;
                    const tagKey = tag.tag_name?.trim() || undefined;

                    // Real-time telemetry resolution: wsTelemetryMap -> contextTelemetryMap -> probeResults -> tag.live_value
                    const liveEntry =
                      (nodeKey ? wsTelemetryMap[nodeKey] : undefined) ||
                      (cleanKey ? wsTelemetryMap[cleanKey] : undefined) ||
                      (tagKey ? wsTelemetryMap[tagKey] : undefined) ||
                      (nodeKey && contextTelemetryMap ? contextTelemetryMap[nodeKey] : undefined) ||
                      (cleanKey && contextTelemetryMap ? contextTelemetryMap[cleanKey] : undefined) ||
                      (tagKey && contextTelemetryMap ? contextTelemetryMap[tagKey] : undefined);

                    const probed = tag.node_id ? probeResults[tag.node_id] : undefined;
                    const currentQuality = liveEntry?.quality || (probed ? probed.quality : tag.quality);
                    const currentValue =
                      liveEntry !== undefined && liveEntry.value !== null && liveEntry.value !== undefined
                        ? liveEntry.value
                        : (probed && probed.value !== null ? probed.value : tag.live_value);
                    const isStreamingLive = Boolean(liveEntry && currentQuality === 'Good');

                    return (
                      <tr
                        key={tag.tag_name}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setDragOverTarget(`row:${tag.tag_name}`);
                        }}
                        onDragLeave={() => {
                          if (dragOverTarget === `row:${tag.tag_name}`) setDragOverTarget(null);
                        }}
                        onDrop={(e) => handleDropOnTagRow(e, tag.tag_name)}
                        className={`transition-colors ${
                          dragOverTarget === `row:${tag.tag_name}`
                            ? 'ring-2 ring-emerald-500 bg-emerald-50/60'
                            : 'hover:bg-slate-50'
                        }`}
                        title="Kéo thả Tag từ Kho Tag Ghim vào dòng này để gán Node ID tức thì"
                      >
                        {/* Tag Name */}
                        <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{tag.tag_name}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(tag.tag_name, tag.tag_name)}
                              title="Sao chép tên tag"
                              className="text-slate-400 hover:text-slate-700"
                            >
                              {copiedKey === tag.tag_name ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal truncate max-w-[180px]">
                            {tag.description || '--'}
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-2 px-2.5 text-center whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold ${
                              tag.role === 'PV'
                                ? 'bg-sky-100 text-sky-800'
                                : tag.role === 'SP'
                                ? 'bg-amber-100 text-amber-800'
                                : tag.role === 'CMD'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {tag.role}
                          </span>
                        </td>

                        {/* Kepware Node ID (Direct Inline Edit) */}
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingNodeIdValue}
                                onChange={(e) => setEditingNodeIdValue(e.target.value)}
                                className="h-7 px-2 text-xs font-mono border border-sky-500 rounded-xs bg-white flex-1 hallmark-focus"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveNodeId(tag.tag_name);
                                  if (e.key === 'Escape') setEditingTagName(null);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveNodeId(tag.tag_name)}
                                disabled={isSavingNodeId}
                                className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xs hallmark-focus"
                                title="Lưu thay đổi"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTagName(null)}
                                className="h-7 px-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xs hallmark-focus"
                                title="Hủy"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div
                              className="group flex items-center justify-between gap-2 cursor-pointer py-0.5 px-1 -mx-1 rounded-xs hover:bg-slate-100"
                              onClick={() => {
                                setEditingTagName(tag.tag_name);
                                setEditingNodeIdValue(tag.node_id);
                              }}
                              title="Nhấp để sửa Kepware Node ID"
                            >
                              {tag.node_id && tag.node_id.trim() !== '' && tag.node_id !== '[CHƯA ÁNH XẠ]' ? (
                                <span className="text-slate-800 font-mono text-xs truncate max-w-[280px]" title={tag.node_id}>
                                  {tag.node_id}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                                  [CHƯA ÁNH XẠ]
                                </span>
                              )}
                              <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-slate-700 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                            </div>
                          )}
                        </td>

                        {/* Data Type */}
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-xs text-[11px] font-mono border border-slate-200">
                            {tag.data_type} {tag.unit ? `(${tag.unit})` : ''}
                          </span>
                        </td>

                        {/* Live Value */}
                        <td className="py-2 px-3 text-right whitespace-nowrap font-bold text-slate-900">
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            {isStreamingLive && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"
                                title="Tín hiệu truyền sống từ Kepware (<100ms)"
                              />
                            )}
                            <span className="font-mono">
                              {typeof currentValue === 'number'
                                ? (Number.isInteger(currentValue) ? currentValue.toString() : currentValue.toFixed(1))
                                : (typeof currentValue === 'boolean' ? (currentValue ? 'TRUE' : 'FALSE') : (currentValue?.toString() || '--'))}
                            </span>
                          </span>
                          {tag.unit && <span className="text-slate-500 font-normal ml-1 text-[11px] font-sans">{tag.unit}</span>}
                        </td>

                        {/* Quality Pill */}
                        <td className="py-2 px-2.5 text-center whitespace-nowrap">
                          {!tag.node_id || tag.node_id.trim() === '' || tag.node_id === '[CHƯA ÁNH XẠ]' || currentQuality === 'Unmapped' || currentQuality === '[CHƯA ÁNH XẠ]' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[10px] font-bold border bg-slate-100 text-slate-500 border-slate-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span>Chưa ánh xạ</span>
                            </span>
                          ) : currentQuality === 'Good' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <span>Good</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[10px] font-bold border bg-rose-50 text-rose-800 border-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                              <span>{currentQuality || 'Bad'}</span>
                            </span>
                          )}
                        </td>

                        {/* Quick Actions */}
                        <td className="py-2 px-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleProbeNode(tag.node_id)}
                              title="Kiểm tra tín hiệu Node"
                              className="p-1 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-xs"
                            >
                              <Zap className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingTagName(tag.tag_name);
                                setEditingNodeIdValue(tag.node_id);
                              }}
                              title="Sửa Node ID"
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xs"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteTag(tag.tag_name)}
                              title="Xóa Tag này"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xs"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Drag-and-Drop Zone to Add New Tag directly into active Module */}
            {selectedContext && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverTarget('inspector-add-zone');
                }}
                onDragLeave={() => {
                  if (dragOverTarget === 'inspector-add-zone') setDragOverTarget(null);
                }}
                onDrop={(e) =>
                  handleDropOnModule(
                    e,
                    selectedContext.unitId,
                    selectedContext.emId || `EM_${selectedContext.unitId}_MAIN`
                  )
                }
                className={`m-3 p-3 border border-dashed rounded-xs text-center font-mono text-xs transition-all select-none ${
                  dragOverTarget === 'inspector-add-zone'
                    ? 'ring-2 ring-emerald-500 bg-emerald-50/70 border-emerald-500 text-emerald-900 font-bold'
                    : 'bg-slate-50/70 border-slate-300 text-slate-600'
                }`}
                title="Kéo một Tag từ khay Kho Tag Ghim thả vào đây để tự động tạo Tag mới cho Module này"
              >
                + Thả Tag từ Kho Kepware vào đây để thêm mới vào [{selectedContext.emId || selectedContext.unitId}]
              </div>
            )}
          </div>
        </section>
      </div>

      {/* =========================================================================
          AUTO-GENERATE MODAL (From Asset Templates)
      ========================================================================= */}
      {isAutoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-xl w-full flex flex-col rounded-xs">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Box className="w-5 h-5 text-emerald-700" />
                <h2 className="text-sm font-bold text-slate-900 font-mono uppercase" style={{ fontStyle: 'normal' }}>
                  KHỞI TẠO UNIT THEO KHUÔN MẪU ASSET TEMPLATE
                </h2>
              </div>
              <button onClick={() => setIsAutoModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAutoGenerateSubmit} className="p-5 space-y-3 font-mono text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  1. CHỌN KHUÔN MẪU THIẾT BỊ
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                >
                  {templates.map((t) => (
                    <option key={t.template_id} value={t.template_id}>
                      {t.template_name} ({t.tags.length} Tags)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    2. MÃ UNIT (UNIT CODE) *
                  </label>
                  <input
                    type="text"
                    value={autoUnitCode}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                      setAutoUnitCode(v);
                      setAutoPrefix(`MilkPlant.${v}`);
                    }}
                    placeholder="VD: TK03, MIX02"
                    className="w-full h-8 px-2 border border-slate-300 rounded-xs uppercase bg-white hallmark-focus"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    3. TÊN HIỂN THỊ
                  </label>
                  <input
                    type="text"
                    value={autoUnitName}
                    onChange={(e) => setAutoUnitName(e.target.value)}
                    placeholder="VD: Storage Tank 03"
                    className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  4. TIỀN TỐ KÊNH KEPWARE (CHANNEL.DEVICE)
                </label>
                <input
                  type="text"
                  value={autoPrefix}
                  onChange={(e) => setAutoPrefix(e.target.value)}
                  placeholder="MilkPlant.TK03"
                  className="w-full h-8 px-2 border border-slate-300 rounded-xs bg-white hallmark-focus"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAutoModalOpen(false)}
                  className="h-8 px-3 text-slate-600 hover:bg-slate-200 rounded-xs"
                >
                  HỦY
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingUnit || !autoUnitCode.trim()}
                  className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xs hallmark-focus disabled:opacity-50"
                >
                  {isGeneratingUnit ? 'Đang tạo...' : 'KHỞI TẠO & ĐỒNG BỘ SQL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: STANDARDIZED ISA-88 ASSET TEMPLATE & AUTO-TAG GENERATOR
      ========================================================================= */}
      {isAssetTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-2xl w-full flex flex-col rounded-xs">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Box className="w-5 h-5 text-emerald-700" />
                <h2 className="text-sm font-bold text-slate-900 font-mono uppercase" style={{ fontStyle: 'normal' }}>
                  ISA-88 ASSET TEMPLATE & AUTO-TAG GENERATOR
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAssetTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 hallmark-focus"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInstantiateAsset} className="p-5 space-y-4 font-mono text-xs">
              <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xs text-[11px] text-emerald-900">
                Tự động sinh toàn bộ phân cấp ISA-88 (Unit / EM / CM), tự động tạo bảng dữ liệu dbo.Tag và dbo.Tag_OPC theo chuẩn định danh:
                <code className="ml-1 px-1.5 py-0.5 bg-white border border-emerald-300 font-bold rounded-xs">
                  ns=2;s=Factory.{assetLineCode || 'Line01'}.{assetInstanceCode || 'TK04'}.[TagSuffix]
                </code>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  1. CHỌN KHUÔN MẪU THIẾT BỊ (ISA-88 TEMPLATE CATALOG) *
                </label>
                <select
                  value={selectedAssetTemplateCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedAssetTemplateCode(code);
                    if (code === 'TANK_STORAGE') {
                      setAssetInstanceCode('TK04');
                      setAssetInstanceName('Storage Silo Tank 04');
                    } else if (code === 'UNIT_MIXER') {
                      setAssetInstanceCode('MIX02');
                      setAssetInstanceName('Mixing Vessel 02');
                    } else if (code === 'UNIT_UHT_HEATER') {
                      setAssetInstanceCode('HEATER02');
                      setAssetInstanceName('UHT Pasteurizer Unit 02');
                    } else if (code === 'UNIT_COOLER') {
                      setAssetInstanceCode('COOLER02');
                      setAssetInstanceName('Rapid Plate Chiller 02');
                    } else if (code === 'EM_DOSING_PUMP') {
                      setAssetInstanceCode('PUMP05');
                      setAssetInstanceName('Ingredient Dosing Pump 05');
                    } else if (code === 'CM_VALVE_ONOFF') {
                      setAssetInstanceCode('V101');
                      setAssetInstanceName('Pneumatic Feed Valve 101');
                    } else if (code === 'CM_MOTOR_AGITATOR') {
                      setAssetInstanceCode('M201');
                      setAssetInstanceName('Tank Agitator Motor 201');
                    }
                  }}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-xs bg-white text-slate-900 font-semibold hallmark-focus"
                >
                  {STANDARD_TEMPLATES_CATALOG.map((t) => (
                    <option key={t.code} value={t.code}>
                      [{t.type}] {t.name} ({t.tags} Tags chuẩn)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    2. MÃ THIẾT BỊ (INSTANCE CODE) *
                  </label>
                  <input
                    type="text"
                    value={assetInstanceCode}
                    onChange={(e) => setAssetInstanceCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    placeholder="VD: TK04, MIX02"
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-xs uppercase bg-white text-slate-900 hallmark-focus"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    3. TÊN HIỂN THỊ THIẾT BỊ
                  </label>
                  <input
                    type="text"
                    value={assetInstanceName}
                    onChange={(e) => setAssetInstanceName(e.target.value)}
                    placeholder="VD: Storage Silo Tank 04"
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-xs bg-white text-slate-900 hallmark-focus"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    4. DÂY CHUYỀN SẢN XUẤT (LINE CODE)
                  </label>
                  <input
                    type="text"
                    value={assetLineCode}
                    onChange={(e) => setAssetLineCode(e.target.value)}
                    placeholder="Line01"
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-xs bg-white text-slate-900 hallmark-focus"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    5. Ô ĐIỀU KHIỂN (AUTOMATION CELL)
                  </label>
                  <select
                    value={assetCellId}
                    onChange={(e) => setAssetCellId(e.target.value)}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-xs bg-white text-slate-900 hallmark-focus"
                  >
                    <option value="Cell1_Real">Cell1_Real (Siemens S7-1500 PLC Phần Cứng)</option>
                    <option value="Cell2_SIMIT">Cell2_SIMIT (Siemens SIMIT Digital Twin)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAssetTemplateModalOpen(false)}
                  className="h-9 px-4 text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-xs hallmark-focus"
                >
                  HỦY
                </button>
                <button
                  type="submit"
                  disabled={isInstantiatingAsset || !assetInstanceCode.trim()}
                  className="h-9 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xs hallmark-focus disabled:opacity-50"
                >
                  {isInstantiatingAsset ? 'ĐANG KHỞI TẠO...' : 'KHỞI TẠO & ĐỒNG BỘ SQL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SIEMENS TIA PORTAL SCL EXPORT (DB_OPC_Gateway.scl)
      ========================================================================= */}
      {sclModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-4xl w-full flex flex-col rounded-xs max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-700" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 font-mono uppercase" style={{ fontStyle: 'normal' }}>
                    SIEMENS TIA PORTAL SCL SOURCE EXPORT (DB_OPC_Gateway.scl)
                  </h2>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Standard: IEC 61131-3 SCL &middot; S7-1500/1200 non-optimized Global DB &middot; Mapped to SQL Server
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSclModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 hallmark-focus"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto bg-slate-950 text-slate-200 font-mono text-xs">
              <pre className="whitespace-pre overflow-x-auto leading-relaxed selection:bg-indigo-700 selection:text-white">
                {sclCode}
              </pre>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                <span>{sclCode.split('\n').length} DÒNG SCL</span>
                <span>&middot;</span>
                <span>{sclCode.length} BYTES</span>
                <span>&middot;</span>
                <span className="text-emerald-700 font-semibold">{`{ S7_Optimized_Access := 'FALSE' }`}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(sclCode, 'scl_source')}
                  className="h-9 px-3.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all hallmark-focus"
                >
                  {copiedKey === 'scl_source' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">ĐÃ CHÉP</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-600" />
                      <span>SAO CHÉP MÃ</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTiaPortalScl}
                  className="h-9 px-4 bg-indigo-700 hover:bg-indigo-800 text-white font-bold uppercase tracking-wider flex items-center gap-1.5 rounded-xs transition-all hallmark-focus shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>TẢI TỆP .SCL (DB_OPC_Gateway.scl)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
