/* Hallmark · component: KepwareTreeScannerModal · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Folder,
  FolderOpen,
  Cpu,
  Server,
  Tag as TagIcon,
  CheckSquare,
  Square,
  MinusSquare,
  ChevronRight,
  ChevronDown,
  X,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Pin,
} from 'lucide-react';
import {
  browseKepwareTree,
  addTagsToPool,
  getTagPool,
  KepwareTreeNode,
} from '../services/api';

interface KepwareTreeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (importedCount: number) => void;
  onOpenPinnedPalette?: () => void;
}

interface FlatLeafTag {
  node_id: string;
  name: string;
  path: string;
  data_type: string;
}

function collectLeafTags(node: KepwareTreeNode, parentPath: string = ''): FlatLeafTag[] {
  const currentPath = parentPath ? `${parentPath}.${node.name}` : node.name;
  if (node.type === 'tag') {
    const cleanId = node.id.replace('ns=2;s=', '');
    const parts = cleanId.split('.');
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('.') : parentPath || 'Default';
    return [
      {
        node_id: node.id,
        name: node.name,
        path: folderPath,
        data_type: node.data_type || 'Float',
      },
    ];
  }
  const leaves: FlatLeafTag[] = [];
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      leaves.push(...collectLeafTags(child, currentPath));
    }
  }
  return leaves;
}

function filterTreeNodes(nodes: KepwareTreeNode[], query: string): KepwareTreeNode[] {
  if (!query.trim()) return nodes;
  const q = query.trim().toLowerCase();
  const filtered: KepwareTreeNode[] = [];

  for (const node of nodes) {
    const selfMatches =
      node.name.toLowerCase().includes(q) ||
      node.id.toLowerCase().includes(q) ||
      (node.data_type && node.data_type.toLowerCase().includes(q));

    if (node.type === 'tag') {
      if (selfMatches) filtered.push(node);
    } else {
      const matchingChildren = node.children ? filterTreeNodes(node.children, query) : [];
      if (selfMatches || matchingChildren.length > 0) {
        filtered.push({
          ...node,
          children: selfMatches && matchingChildren.length === 0 ? node.children : matchingChildren,
        });
      }
    }
  }
  return filtered;
}

export const KepwareTreeScannerModal: React.FC<KepwareTreeScannerModalProps> = ({
  isOpen,
  onClose,
  onImported,
  onOpenPinnedPalette,
}) => {
  const [tree, setTree] = useState<KepwareTreeNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [existingPoolIds, setExistingPoolIds] = useState<Set<string>>(new Set());
  const [scanMeta, setScanMeta] = useState<{
    endpoint: string;
    source: string;
    server_connected: boolean;
    elapsed_ms: number;
  }>({
    endpoint: 'opc.tcp://127.0.0.1:49320',
    source: 'kepware_live',
    server_connected: false,
    elapsed_ms: 0,
  });

  const allLeavesMap = useMemo(() => {
    const map = new Map<string, FlatLeafTag>();
    for (const rootNode of tree) {
      for (const leaf of collectLeafTags(rootNode)) {
        map.set(leaf.node_id, leaf);
      }
    }
    return map;
  }, [tree]);

  const loadAddressSpace = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const [browseRes, poolRes] = await Promise.all([
        browseKepwareTree(),
        getTagPool().catch(() => ({ tags: [] })),
      ]);

      const treeData = browseRes.tree || [];
      setTree(treeData);
      setScanMeta({
        endpoint: browseRes.endpoint || 'opc.tcp://127.0.0.1:49320',
        source: browseRes.source || 'kepware_live',
        server_connected: Boolean(browseRes.server_connected),
        elapsed_ms: browseRes.elapsed_ms || 0,
      });

      const poolSet = new Set<string>();
      for (const item of poolRes.tags || []) {
        if (item.node_id) poolSet.add(item.node_id);
      }
      setExistingPoolIds(poolSet);

      // Auto-expand Channels and Devices so user sees tags immediately
      const autoExpand = new Set<string>();
      const walkExpand = (nodes: KepwareTreeNode[], depth: number) => {
        for (const n of nodes) {
          if (n.type !== 'tag' && depth < 2) {
            autoExpand.add(n.id);
            if (n.children) walkExpand(n.children, depth + 1);
          }
        }
      };
      walkExpand(treeData, 0);
      setExpandedIds(autoExpand);
    } catch (err: any) {
      setError(err?.message || 'Không thể quét cây địa chỉ Kepware OPC UA.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAddressSpace();
    }
  }, [isOpen, loadAddressSpace]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredTree = useMemo(() => {
    return filterTreeNodes(tree, searchQuery);
  }, [tree, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getFolderSelectionState = (node: KepwareTreeNode): 'all' | 'some' | 'none' => {
    const leaves = collectLeafTags(node);
    if (leaves.length === 0) return 'none';
    let selectedCount = 0;
    for (const l of leaves) {
      if (selectedTagIds.has(l.node_id)) selectedCount++;
    }
    if (selectedCount === 0) return 'none';
    if (selectedCount === leaves.length) return 'all';
    return 'some';
  };

  const handleToggleNodeCheck = (node: KepwareTreeNode) => {
    if (node.type === 'tag') {
      setSelectedTagIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return;
    }

    const leaves = collectLeafTags(node);
    const state = getFolderSelectionState(node);
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (state === 'all') {
        for (const l of leaves) next.delete(l.node_id);
      } else {
        for (const l of leaves) next.add(l.node_id);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    const visibleLeaves: FlatLeafTag[] = [];
    for (const n of filteredTree) {
      visibleLeaves.push(...collectLeafTags(n));
    }
    const allSelected =
      visibleLeaves.length > 0 && visibleLeaves.every((l) => selectedTagIds.has(l.node_id));

    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const l of visibleLeaves) next.delete(l.node_id);
      } else {
        for (const l of visibleLeaves) next.add(l.node_id);
      }
      return next;
    });
  };

  const handleImportSelected = async () => {
    if (selectedTagIds.size === 0) return;
    setImporting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payloadTags: FlatLeafTag[] = [];
      for (const nid of selectedTagIds) {
        const leaf = allLeavesMap.get(nid);
        if (leaf) {
          payloadTags.push(leaf);
        } else {
          const clean = nid.replace('ns=2;s=', '');
          const parts = clean.split('.');
          payloadTags.push({
            node_id: nid,
            name: parts[parts.length - 1] || clean,
            path: parts.length > 1 ? parts.slice(0, -1).join('.') : 'Default',
            data_type: 'Float',
          });
        }
      }

      const res = await addTagsToPool(payloadTags);
      const nextPool = new Set<string>();
      for (const t of res.tags || []) {
        nextPool.add(t.node_id);
      }
      setExistingPoolIds(nextPool);
      setSuccessMsg(
        `Đã import thành công ${payloadTags.length} tag vào Kho Tag MES (Tổng cộng: ${res.count} tag đang được quét thời gian thực).`
      );

      // Dispatch global event so PinnedTagPalette refreshes immediately
      window.dispatchEvent(new CustomEvent('mes-tag-pool-updated', { detail: res }));
      if (onImported) onImported(payloadTags.length);
    } catch (err: any) {
      setError(err?.message || 'Lỗi khi thêm tag vào Kho Tag MES.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  const renderTreeNode = (node: KepwareTreeNode, depth: number = 0) => {
    const isTag = node.type === 'tag';
    const isExpanded = searchQuery.trim().length > 0 || expandedIds.has(node.id);
    const folderState = !isTag ? getFolderSelectionState(node) : 'none';
    const isChecked = isTag ? selectedTagIds.has(node.id) : folderState === 'all';
    const isIndeterminate = !isTag && folderState === 'some';
    const isAlreadyInPool = isTag && existingPoolIds.has(node.id);
    const leafCount = !isTag ? collectLeafTags(node).length : 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`group flex items-center justify-between py-1.5 px-2.5 rounded border transition-colors ${
            isChecked
              ? 'bg-sky-950/50 border-sky-500/40 text-slate-100'
              : 'bg-transparent border-transparent hover:bg-slate-800/70 text-slate-200'
          }`}
          style={{ paddingLeft: `${depth * 20 + 10}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!isTag ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.id)}
                className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                title={isExpanded ? 'Thu gọn nhánh' : 'Mở rộng nhánh'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-5" />
            )}

            <button
              type="button"
              onClick={() => handleToggleNodeCheck(node)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 rounded"
            >
              {isChecked ? (
                <CheckSquare className="w-4 h-4 text-sky-400 shrink-0" />
              ) : isIndeterminate ? (
                <MinusSquare className="w-4 h-4 text-sky-400 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-slate-500 group-hover:text-slate-300 shrink-0" />
              )}

              {node.type === 'channel' && <Server className="w-4 h-4 text-amber-400 shrink-0" />}
              {node.type === 'device' && <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />}
              {node.type === 'folder' &&
                (isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-sky-400 shrink-0" />
                ))}
              {node.type === 'tag' && <TagIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}

              <span
                className={`truncate ${
                  isTag ? 'font-mono text-xs text-slate-100' : 'font-semibold text-xs text-white'
                }`}
              >
                {node.name}
              </span>

              {!isTag && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {node.type.toUpperCase()} · {leafCount} tag
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {isTag && (
              <>
                <span className="text-[11px] font-mono text-slate-400 hidden sm:inline truncate max-w-[240px]">
                  {node.id}
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">
                  {node.data_type || 'Float'}
                </span>
                {isAlreadyInPool && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600/40">
                    ĐÃ TRONG KHO
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {!isTag && isExpanded && node.children && node.children.length > 0 && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kepware-tree-scanner-title"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="kepware-tree-scanner-title"
                className="text-base font-bold tracking-tight text-white not-italic truncate"
              >
                Quét Cây Địa Chỉ KEPServerEX (OPC UA Address Space Browser)
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    scanMeta.server_connected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>{scanMeta.endpoint}</span>
                <span>·</span>
                <span>
                  {scanMeta.source === 'kepware_live'
                    ? 'KEPServerEX Live Browse'
                    : 'Address Space Discovery'}
                </span>
                <span>({scanMeta.elapsed_ms} ms)</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
            title="Đóng cửa sổ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Bulk Controls Toolbar */}
        <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm Channel, Device, Folder hoặc tên Tag (VD: Modbus_TCP, tank1, Sine1)..."
              className="w-full h-9 pl-9 pr-8 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllVisible}
              className="h-9 px-3 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
              <span>Chọn tất cả hiển thị</span>
            </button>

            <button
              type="button"
              onClick={loadAddressSpace}
              disabled={loading}
              className="h-9 px-3 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-200 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới (Rescan)</span>
            </button>
          </div>
        </div>

        {/* Status Banners */}
        {error && (
          <div className="mx-5 mt-3 px-3.5 py-2.5 rounded bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-3 px-3.5 py-2.5 rounded bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            {onOpenPinnedPalette && (
              <button
                type="button"
                onClick={() => {
                  onOpenPinnedPalette();
                  onClose();
                }}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 shrink-0"
              >
                <Pin className="w-3.5 h-3.5" />
                <span>Mở Kho Tag Ghim (Kéo & Thả)</span>
              </button>
            )}
          </div>
        )}

        {/* Tree Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-slate-950/60">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
              <p className="text-xs font-mono">
                Đang duyệt không gian địa chỉ OPC UA (Objects → Channels → Devices → Tags)...
              </p>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Không tìm thấy nhánh hoặc tag nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredTree.map((node) => renderTreeNode(node, 0))
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span className="font-mono bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
              Đã chọn: <strong className="text-sky-400">{selectedTagIds.size}</strong> / {allLeavesMap.size} tag
            </span>
            <span className="text-slate-400 hidden md:inline">
              Tick chọn cả thư mục Channel/Device để chọn nhanh toàn bộ tag bên trong.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
            >
              Đóng
            </button>

            <button
              type="button"
              onClick={handleImportSelected}
              disabled={selectedTagIds.size === 0 || importing}
              className="h-9 px-4 rounded border border-sky-500 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:pointer-events-none text-xs font-semibold text-white flex items-center gap-2 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                📥 Add vào Kho Tag MES (Import Selected{selectedTagIds.size > 0 ? `: ${selectedTagIds.size}` : ''})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KepwareTreeScannerModal;
