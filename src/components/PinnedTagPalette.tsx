/* Hallmark · component: PinnedTagPalette · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Pin,
  Search,
  RefreshCw,
  GripVertical,
  Folder,
  FolderOpen,
  Trash2,
  Minimize2,
  Maximize2,
  X,
  PlusCircle,
  ChevronRight,
  ChevronDown,
  Move,
  Radio,
} from 'lucide-react';
import {
  getTagPool,
  removeTagFromPool,
  StagedTagPoolItem,
} from '../services/api';
import KepwareTreeScannerModal from './KepwareTreeScannerModal';

export interface DraggedMesOpcTag {
  node_id: string;
  name: string;
  data_type: string;
  path?: string;
  value?: any;
}

export function extractDroppedOpcTag(e: React.DragEvent): DraggedMesOpcTag | null {
  try {
    const raw =
      e.dataTransfer.getData('application/mes-opc-tag') ||
      e.dataTransfer.getData('text/plain');
    if (!raw) return null;
    if (raw.trim().startsWith('{')) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.node_id) {
        return {
          node_id: String(parsed.node_id).trim(),
          name: String(parsed.name || parsed.node_id.split('.').pop() || 'Tag').trim(),
          data_type: String(parsed.data_type || 'Float').trim(),
          path: parsed.path,
          value: parsed.value,
        };
      }
    } else if (raw.trim().startsWith('ns=')) {
      const nid = raw.trim();
      const parts = nid.replace('ns=2;s=', '').split('.');
      return {
        node_id: nid,
        name: parts[parts.length - 1] || nid,
        data_type: 'Float',
      };
    }
  } catch {
    // ignore malformed drag data
  }
  return null;
}

export interface PinnedTagPaletteProps {
  activeTab?: string;
}

export const PinnedTagPalette: React.FC<PinnedTagPaletteProps> = ({ activeTab = 'Configuration' }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const [poolTags, setPoolTags] = useState<StagedTagPoolItem[]>([]);
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);

  // Floating position state (used when undocked / floating mode or dragged)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingWindow, setIsDraggingWindow] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const fetchPool = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getTagPool();
      if (res && Array.isArray(res.tags)) {
        setPoolTags(res.tags);
        setServerConnected(Boolean(res.server_connected));
      }
    } catch {
      // ignore background error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPool();
    const interval = setInterval(fetchPool, 2000);
    return () => clearInterval(interval);
  }, [fetchPool]);

  // Listen to custom events to open the palette or scanner or refresh pool
  useEffect(() => {
    const handlePoolUpdated = () => {
      fetchPool();
      setIsOpen(true);
    };
    const handleOpenScanner = () => {
      setIsScannerOpen(true);
    };
    const handleTogglePalette = () => {
      setIsOpen((prev) => !prev);
      setIsMinimized(false);
    };

    window.addEventListener('mes-tag-pool-updated', handlePoolUpdated);
    window.addEventListener('mes-open-kepware-scanner', handleOpenScanner);
    window.addEventListener('mes-toggle-pinned-palette', handleTogglePalette);
    return () => {
      window.removeEventListener('mes-tag-pool-updated', handlePoolUpdated);
      window.removeEventListener('mes-open-kepware-scanner', handleOpenScanner);
      window.removeEventListener('mes-toggle-pinned-palette', handleTogglePalette);
    };
  }, [fetchPool]);

  // Subscribe to WebSocket /ws/telemetry for sub-second live values
  useEffect(() => {
    if (!isOpen) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isUnmounted = false;

    const connectWs = () => {
      if (isUnmounted) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || '127.0.0.1';
        ws = new WebSocket(`${protocol}//${host}:8000/ws/telemetry`);

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'TAG_UPDATE' && msg.data) {
              const updated = msg.data;
              setPoolTags((prev) =>
                prev.map((item) => {
                  const cleanItem = item.node_id.replace('ns=2;s=', '');
                  const cleanUpd = String(updated.node_id || '').replace('ns=2;s=', '');
                  if (item.node_id === updated.node_id || cleanItem === cleanUpd) {
                    return {
                      ...item,
                      value: updated.value,
                      quality: updated.quality || (updated.value !== undefined && updated.value !== null ? 'Good' : 'Bad'),
                      timestamp: updated.timestamp || item.timestamp,
                    };
                  }
                  return item;
                })
              );
            } else if (msg.type === 'TAGS_BATCH' && msg.tags) {
              const batch = msg.tags as Record<string, any>;
              setPoolTags((prev) =>
                prev.map((item) => {
                  const cleanItem = item.node_id.replace('ns=2;s=', '');
                  const match = batch[item.node_id] || batch[cleanItem];
                  if (match) {
                    return {
                      ...item,
                      value: match.value,
                      quality: match.quality || (match.value !== undefined && match.value !== null ? 'Good' : 'Bad'),
                      timestamp: match.timestamp || item.timestamp,
                    };
                  }
                  return item;
                })
              );
            } else if (msg.type === 'SNAPSHOT' && Array.isArray(msg.tags)) {
              setServerConnected(Boolean(msg.server_connected));
            }
          } catch {
            // ignore parse error
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };
      } catch {
        // ignore ws error
      }
    };

    connectWs();
    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [isOpen]);

  // Strict Pinning Rule:
  // When navigating away from 'Configuration', if isPinned is false, automatically hide the drawer.
  useEffect(() => {
    if (activeTab !== 'Configuration' && !isPinned) {
      setIsOpen(false);
    }
  }, [activeTab, isPinned]);

  const shouldRenderDrawer = isOpen && (isPinned || activeTab === 'Configuration');

  // Modern Web Guidance compliant pointer drag handle logic
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button, input, select, textarea, a')) return;
    if (!panelRef.current) return;

    const rect = panelRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDraggingWindow(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWindow || !panelRef.current) return;
    const panelWidth = panelRef.current.offsetWidth || 340;
    const panelHeight = panelRef.current.offsetHeight || 480;

    let newX = e.clientX - dragOffsetRef.current.x;
    let newY = e.clientY - dragOffsetRef.current.y;

    newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - panelHeight));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWindow) return;
    setIsDraggingWindow(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Keyboard accessibility for the drag handle (15px step per modern-web-guidance)
  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 15;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const curX = position ? position.x : rect.left;
    const curY = position ? position.y : rect.top;
    let nextX = curX;
    let nextY = curY;
    if (e.key === 'ArrowLeft') nextX -= step;
    if (e.key === 'ArrowRight') nextX += step;
    if (e.key === 'ArrowUp') nextY -= step;
    if (e.key === 'ArrowDown') nextY += step;

    const panelWidth = panelRef.current.offsetWidth || 340;
    const panelHeight = panelRef.current.offsetHeight || 480;
    nextX = Math.max(0, Math.min(nextX, window.innerWidth - panelWidth));
    nextY = Math.max(0, Math.min(nextY, window.innerHeight - panelHeight));
    setPosition({ x: nextX, y: nextY });
  };

  const groupedTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const groups: Record<string, StagedTagPoolItem[]> = {};

    for (const tag of poolTags) {
      if (
        q &&
        !tag.name.toLowerCase().includes(q) &&
        !tag.node_id.toLowerCase().includes(q) &&
        !tag.path.toLowerCase().includes(q)
      ) {
        continue;
      }
      const folder = tag.path || 'Default';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(tag);
    }
    return groups;
  }, [poolTags, searchQuery]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleRemoveTag = async (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await removeTagFromPool({ node_id: nodeId });
      if (res && Array.isArray(res.tags)) {
        setPoolTags(res.tags);
      }
    } catch {
      // ignore
    }
  };

  const handleRemoveFolder = async (folder: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await removeTagFromPool({ folder });
      if (res && Array.isArray(res.tags)) {
        setPoolTags(res.tags);
      }
    } catch {
      // ignore
    }
  };

  const handleTagDragStart = (e: React.DragEvent<HTMLDivElement>, tag: StagedTagPoolItem) => {
    const payload: DraggedMesOpcTag = {
      node_id: tag.node_id,
      name: tag.name,
      data_type: tag.data_type || 'Float',
      path: tag.path,
      value: tag.value,
    };
    const jsonStr = JSON.stringify(payload);
    e.dataTransfer.setData('application/mes-opc-tag', jsonStr);
    e.dataTransfer.setData('text/plain', jsonStr);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const formatTagValue = (val: any, dtype?: string) => {
    if (val === undefined || val === null) return '--';
    if (typeof val === 'boolean' || dtype === 'Boolean' || dtype === 'Bool') {
      return val ? 'TRUE (1)' : 'FALSE (0)';
    }
    if (typeof val === 'number') {
      return Number.isInteger(val) ? String(val) : val.toFixed(2);
    }
    return String(val);
  };

  return (
    <>
      {/* Floating / Pinned Drawer (No bottom-right floating launcher buttons) */}
      {shouldRenderDrawer && (
        <aside
          ref={panelRef}
          aria-label="Kho Tag OPC UA Kéo-Thả"
          style={
            position
              ? {
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  right: 'auto',
                  bottom: 'auto',
                }
              : {
                  top: '72px',
                  right: '16px',
                }
          }
          className={`fixed z-[100] w-[350px] sm:w-[375px] bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl text-slate-100 flex flex-col overflow-hidden transition-shadow ${
            isDraggingWindow ? 'ring-2 ring-sky-500 shadow-sky-950/50' : ''
          } ${isMinimized ? 'h-auto' : 'max-h-[calc(100vh-96px)]'}`}
        >
          {/* Draggable Header (.drag-handle) */}
          <div
            tabIndex={0}
            role="toolbar"
            aria-label="Thanh tiêu đề Kho Tag OPC UA (Kéo để di chuyển hoặc dùng phím mũi tên)"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleHeaderKeyDown}
            style={{
              touchAction: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              cursor: isDraggingWindow ? 'grabbing' : 'grab',
            }}
            className="drag-handle px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Move className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs font-bold tracking-tight text-white not-italic truncate">
                Kho Tag Kepware (Drag & Drop)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">
                {poolTags.length}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsPinned((p) => !p);
                  if (!isPinned) setPosition(null);
                }}
                className={`h-7 px-2 rounded text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
                  isPinned
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title="📌 Ghim lên màn hình (Giữ nổi khi chuyển tab ISA-88 / Inventory / Operations)"
              >
                <Pin className="w-3 h-3" />
                <span>{isPinned ? '📌 Đã ghim' : '📌 Ghim lên màn hình'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized((m) => !m)}
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                title={isMinimized ? 'Mở rộng bảng' : 'Thu gọn bảng'}
              >
                {isMinimized ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPinned(false);
                  setIsOpen(false);
                }}
                className="h-7 px-1.5 inline-flex items-center justify-center gap-1 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-rose-900/60 hover:border-rose-500/50 hover:text-rose-200 text-[11px] font-semibold"
                title="Bỏ ghim / Đóng (✕)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Quick Actions & Search Bar */}
              <div className="p-2.5 bg-slate-900 border-b border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="flex-1 h-8 px-2.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 border border-sky-400/40 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>🔍 + Quét thêm từ Kepware</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchPool}
                    className="h-8 w-8 inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Làm mới giá trị Live"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Lọc theo tên tag hoặc thư mục (VD: tank1, Sine1)..."
                    className="w-full h-8 pl-8 pr-7 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                  <span className="flex items-center gap-1">
                    <Radio className="w-3 h-3 text-emerald-400" />
                    Kéo thả tag bất kỳ vào dòng/ô dữ liệu để gán
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {serverConnected ? '● OPC ONLINE' : '● CACHE/SIM'}
                  </span>
                </div>
              </div>

              {/* Grouped Draggable Tag List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 max-h-[60vh]">
                {Object.keys(groupedTags).length === 0 ? (
                  <div className="py-8 px-4 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      {poolTags.length === 0
                        ? 'Kho Tag MES đang trống. Hãy bấm "Quét thêm từ Kepware" để chọn tag.'
                        : 'Không tìm thấy tag phù hợp.'}
                    </p>
                  </div>
                ) : (
                  Object.entries(groupedTags).map(([folder, items]) => {
                    const isCollapsed = collapsedFolders.has(folder);
                    return (
                      <div
                        key={folder}
                        className="rounded border border-slate-800 bg-slate-950/60 overflow-hidden"
                      >
                        {/* Folder Group Header */}
                        <div
                          onClick={() => toggleFolder(folder)}
                          className="px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-800/80 select-none"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            {isCollapsed ? (
                              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            <span className="text-xs font-mono font-semibold text-slate-200 truncate">
                              {folder}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                              {items.length}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleRemoveFolder(folder, e)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                            title={`Xóa nhóm ${folder} khỏi Kho Tag`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Draggable Tag Items */}
                        {!isCollapsed && (
                          <div className="divide-y divide-slate-800/60">
                            {items.map((tag) => {
                              const isGood = tag.quality === 'Good';
                              const isBad = tag.quality === 'Bad';
                              const statusLabel = isGood ? 'Good' : isBad ? 'Bad' : 'Standby';
                              const statusDotClass = isGood
                                ? 'bg-emerald-400'
                                : isBad
                                ? 'bg-rose-500'
                                : 'bg-amber-400';
                              const statusTextClass = isGood
                                ? 'text-emerald-400'
                                : isBad
                                ? 'text-rose-400'
                                : 'text-amber-400';
                              const valueTextClass = isGood
                                ? 'text-emerald-300'
                                : isBad
                                ? 'text-rose-400'
                                : 'text-slate-400';

                              return (
                                <div
                                  key={tag.node_id}
                                  draggable={true}
                                  onDragStart={(e) => handleTagDragStart(e, tag)}
                                  className="group px-2.5 py-2 bg-slate-950/40 hover:bg-sky-950/40 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing transition-colors select-none"
                                  title={`Kéo thả "${tag.node_id}" vào bất kỳ dòng Tag, Bồn chứa hoặc Phase nào (Chất lượng: ${statusLabel})`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <GripVertical className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-xs font-bold text-white group-hover:text-sky-300 truncate">
                                          {tag.name}
                                        </span>
                                        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                          {tag.data_type || 'Float'}
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400 truncate">
                                        {tag.node_id}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-right">
                                      <div className={`font-mono text-xs font-bold ${valueTextClass}`}>
                                        {formatTagValue(tag.value, tag.data_type)}
                                      </div>
                                      <div className="flex items-center justify-end gap-1 text-[10px] font-mono">
                                        <span
                                          className={`inline-block w-1.5 h-1.5 rounded-full ${statusDotClass}`}
                                        />
                                        <span className={statusTextClass}>
                                          {statusLabel}
                                        </span>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={(e) => handleRemoveTag(tag.node_id, e)}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-opacity"
                                      title="Xóa tag khỏi kho"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </aside>
      )}

      {/* Kepware Tree Scanner Modal */}
      <KepwareTreeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onImported={() => {
          fetchPool();
          setIsOpen(true);
          setIsMinimized(false);
        }}
        onOpenPinnedPalette={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
      />
    </>
  );
};

export default PinnedTagPalette;
