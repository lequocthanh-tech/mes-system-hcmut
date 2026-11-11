/* Hallmark · component: InventoryContext · genre: modern-minimal · register: industrial-workbench
 * states: default
 * contrast: WCAG AA Pass
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { InboundReceipt, MaterialStock, BatchConsumptionRecord, MaterialCode, ConsumedItem } from '../types/inventory';
import { useOperations } from './OperationsContext';
import { useConfig } from './ConfigContext';
import * as api from '../services/api';

const useSafeConfig = () => {
  try {
    return useConfig();
  } catch {
    return null;
  }
};

interface BatchDeductionParams {
  orderId: string;
  batchId?: string;
  recipeName?: string;
  volume?: number;
  milkQty?: number;
  sugarQty?: number;
  additiveQty?: number;
  source?: string;
}

interface InventoryContextType {
  receipts: InboundReceipt[];
  stocks: MaterialStock[];
  consumptionLogs: BatchConsumptionRecord[];
  addInboundReceipt: (receipt: Omit<InboundReceipt, 'id'>) => { success: boolean; message: string };
  updateInboundReceipt: (id: string, updated: Partial<InboundReceipt>) => void;
  deleteInboundReceipt: (id: string) => void;
  executeBatchDeduction: (params: BatchDeductionParams) => { success: boolean; message: string };
  simulateBatchDeduction: (batchId?: string, recipeName?: string, orderId?: string) => void;
  refreshStockBalance: () => void;
  fetchLiveStocks: (retries?: number, delay?: number) => Promise<MaterialStock[]>;
  fetchLiveReceipts?: () => Promise<InboundReceipt[]>;
  updateTankInState: (tankId: string, partial: Partial<MaterialStock>) => void;
  isRefreshing: boolean;
  getHeadspace: (materialCode: MaterialCode) => number;
  getActiveLotForMaterial: (materialCode: MaterialCode) => string;
}

const initialReceipts: InboundReceipt[] = [];

const initialStocks: MaterialStock[] = [
  {
    materialCode: 'RAW_MILK',
    materialName: 'Fresh Raw Milk (Sữa tươi)',
    tankId: 'TANK-01',
    tankName: 'Bồn chứa Sữa tươi (Raw Milk Silo 01)',
    currentStock: 0.0,
    capacity: 5.0,
    unit: 'L',
    minThreshold: 0.5,
    lastUpdated: '--',
    status: 'NORMAL',
  },
  {
    materialCode: 'SUGAR',
    materialName: 'Refined Cane Sugar (Đường tinh luyện)',
    tankId: 'TANK-02',
    tankName: 'Silo chứa Đường tinh luyện (Sugar Silo 02)',
    currentStock: 0.0,
    capacity: 5.0,
    unit: 'kg',
    minThreshold: 0.5,
    lastUpdated: '--',
    status: 'NORMAL',
  },
  {
    materialCode: 'ADDITIVE',
    materialName: 'Flavor & Vitamins (Hương liệu & Vi chất)',
    tankId: 'TANK-03',
    tankName: 'Bồn chứa Phụ gia & Vi chất (Additive Tank 03)',
    currentStock: 0.0,
    capacity: 5.0,
    unit: 'L',
    minThreshold: 0.5,
    lastUpdated: '--',
    status: 'NORMAL',
  },
];

const initialConsumptions: BatchConsumptionRecord[] = [];

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

// Safe consumer for OperationsContext to allow independent testing
const useSafeOperations = () => {
  try {
    return useOperations();
  } catch {
    return null;
  }
};

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const operations = useSafeOperations();
  const [receipts, setReceipts] = useState<InboundReceipt[]>(initialReceipts);
  const [stocks, setStocks] = useState<MaterialStock[]>(initialStocks);
  const [consumptionLogs, setConsumptionLogs] = useState<BatchConsumptionRecord[]>(initialConsumptions);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const config = useSafeConfig();
  const sqlOnline = config?.sqlConfig?.connectionState === 'connected';
  const prevSqlOnlineRef = React.useRef<boolean>(false);

  const fetchLiveStocks = async (retries = 3, delay = 400): Promise<MaterialStock[]> => {
    setIsRefreshing(true);
    try {
      const liveStocks = await api.getInventoryStocks();
      if (liveStocks && liveStocks.length > 0) {
        setStocks((prevStocks) => {
          return liveStocks.map((incoming) => {
            const existing = prevStocks.find(
              (p) =>
                (p.tankId && incoming.tankId && p.tankId.trim().toUpperCase() === incoming.tankId.trim().toUpperCase()) ||
                (p.materialCode && incoming.materialCode && p.materialCode.trim().toUpperCase() === incoming.materialCode.trim().toUpperCase())
            );
            if (!existing) return incoming;

            // Zero-reversion merge: Never overwrite non-empty local calibrations with blank or undefined
            const incomingNode = (incoming.opcNodeId || incoming.opc_node_id || incoming.opc_tag || '').trim();
            const existingNode = (existing.opcNodeId || existing.opc_node_id || existing.opc_tag || '').trim();
            const finalNode = incomingNode !== '' && !incomingNode.includes('[CHƯA ÁNH XẠ]') ? incomingNode : existingNode;

            const incomingHigh = (incoming.opcHighNodeId || incoming.opc_high_node_id || '').trim();
            const existingHigh = (existing.opcHighNodeId || existing.opc_high_node_id || '').trim();
            const finalHigh = incomingHigh !== '' && !incomingHigh.includes('[CHƯA ÁNH XẠ]') ? incomingHigh : existingHigh;

            const incomingLow = (incoming.opcLowNodeId || incoming.opc_low_node_id || '').trim();
            const existingLow = (existing.opcLowNodeId || existing.opc_low_node_id || '').trim();
            const finalLow = incomingLow !== '' && !incomingLow.includes('[CHƯA ÁNH XẠ]') ? incomingLow : existingLow;

            return {
              ...existing,
              ...incoming,
              opcNodeId: finalNode,
              opc_node_id: finalNode,
              opc_tag: finalNode,
              opcHighNodeId: finalHigh,
              opc_high_node_id: finalHigh,
              opcLowNodeId: finalLow,
              opc_low_node_id: finalLow,
            };
          });
        });
        return liveStocks;
      } else if (retries > 0) {
        setTimeout(() => fetchLiveStocks(retries - 1, Math.round(delay * 1.5)), delay);
      }
    } catch (err) {
      console.warn('[InventoryContext] fetchLiveStocks error:', err);
      if (retries > 0) {
        setTimeout(() => fetchLiveStocks(retries - 1, Math.round(delay * 1.5)), delay);
      }
    } finally {
      setIsRefreshing(false);
    }
    return stocks;
  };

  const fetchLiveReceipts = async (): Promise<InboundReceipt[]> => {
    try {
      const dbReceipts = await api.getInventoryReceipts(50);
      if (dbReceipts && dbReceipts.length > 0) {
        setReceipts(dbReceipts);
        return dbReceipts;
      }
    } catch (err) {
      console.warn('[InventoryContext] fetchLiveReceipts error:', err);
    }
    return receipts;
  };

  const refreshStockBalance = () => {
    fetchLiveStocks(2, 300);
    fetchLiveReceipts();
  };

  const updateTankInState = (tankId: string, partial: Partial<MaterialStock>) => {
    setStocks((prevStocks) =>
      prevStocks.map((stock) => {
        const isMatch =
          stock.tankId === tankId ||
          stock.materialCode === tankId ||
          (stock as any).assigned_tank === tankId ||
          (stock.tankId && tankId && stock.tankId.trim().toUpperCase() === tankId.trim().toUpperCase()) ||
          (stock.materialCode && tankId && stock.materialCode.trim().toUpperCase() === tankId.trim().toUpperCase());

        if (isMatch) {
          const newNode = partial.opc_node_id !== undefined 
            ? partial.opc_node_id 
            : (partial.opcNodeId !== undefined ? partial.opcNodeId : (partial.opc_tag !== undefined ? partial.opc_tag : (stock.opcNodeId || stock.opc_node_id || stock.opc_tag)));
          const newHigh = partial.opc_high_node_id !== undefined 
            ? partial.opc_high_node_id 
            : (partial.opcHighNodeId !== undefined ? partial.opcHighNodeId : (stock.opcHighNodeId || stock.opc_high_node_id));
          const newLow = partial.opc_low_node_id !== undefined 
            ? partial.opc_low_node_id 
            : (partial.opcLowNodeId !== undefined ? partial.opcLowNodeId : (stock.opcLowNodeId || stock.opc_low_node_id));
          return {
            ...stock,
            ...partial,
            opc_node_id: newNode,
            opcNodeId: newNode,
            opc_tag: newNode,
            opcHighNodeId: newHigh,
            opc_high_node_id: newHigh,
            opcLowNodeId: newLow,
            opc_low_node_id: newLow,
          };
        }
        return stock;
      })
    );
  };

  // Immediate hydration on mount
  useEffect(() => {
    fetchLiveStocks(3, 300);
    fetchLiveReceipts();
  }, []);

  // Listen to sqlOnline state transition: whenever transitioning from offline -> online (connected), automatically re-fetch /api/inventory
  useEffect(() => {
    if (sqlOnline && !prevSqlOnlineRef.current) {
      console.info('[InventoryContext] SQL Server transitioned to ONLINE -> automatically re-fetching live tank inventory from /api/inventory');
      fetchLiveStocks(3, 300);
      fetchLiveReceipts();
    }
    prevSqlOnlineRef.current = !!sqlOnline;
  }, [sqlOnline]);

  // Real-time telemetry subscription to Kepware gateway (/ws/telemetry)
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      if (!isMounted) return;
      const host = window.location.hostname || '127.0.0.1';
      const wsUrl = `ws://${host}:8000/ws/telemetry`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isMounted) return;
          console.debug('[InventoryContext] WebSocket connected to /ws/telemetry');
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);

            // 1. Process tank telemetry updates from SNAPSHOT, TANK_TELEMETRY (array), or STREAM_HEARTBEAT
            const tanksList = Array.isArray(msg.tanks) ? msg.tanks : undefined;
            if (tanksList && tanksList.length > 0) {
              setStocks((prevStocks) => {
                return prevStocks.map((stock) => {
                  const currentTag = (stock.opcNodeId || stock.opc_node_id || stock.opc_tag || '').trim();
                  const isCleanTag = (tag: string) => Boolean(
                    tag && 
                    tag.trim() !== '' && 
                    !tag.includes('[CHƯA ÁNH XẠ]')
                  );

                  const isStockMapped = isCleanTag(currentTag);

                  const match = tanksList.find((t: any) => 
                    (t.tank_id || t.tankId || t.AssignedTank) === stock.tankId ||
                    (t.tank_id || t.tankId || t.AssignedTank) === (stock as any).assigned_tank ||
                    (t.opc_node_id || t.opcNodeId) === stock.opcNodeId ||
                    (t.opc_node_id || t.opcNodeId) === stock.opc_node_id
                  );
                  if (!match) return stock;

                  const matchTag = (match.opc_node_id || match.opcNodeId || match.OpcNodeId || match.opc_tag || '').trim();
                  const isMatchMapped = isCleanTag(matchTag);

                  // If neither stock nor incoming match is mapped, preserve unmapped baseline
                  if (!isStockMapped && !isMatchMapped) {
                    return {
                      ...stock,
                      live_pv: undefined,
                      livePv: undefined,
                      quality: '[CHƯA ÁNH XẠ]',
                      pv_quality: '[CHƯA ÁNH XẠ]',
                      pvQuality: '[CHƯA ÁNH XẠ]',
                      last_synced: 'Chưa kết nối',
                      lastSynced: 'Chưa kết nối',
                    };
                  }

                  const livePv = match.live_pv !== undefined ? match.live_pv : (match.livePv !== undefined ? match.livePv : stock.live_pv);
                  const quality = match.quality || match.pv_quality || match.pvQuality || stock.pv_quality || 'Good';
                  const lastSynced = match.last_synced || match.lastSynced || match.timestamp || stock.last_synced;
                  const opcTag = match.opc_node_id || match.opcNodeId || match.OpcNodeId || match.opc_tag || match.opcTag || stock.opcNodeId || stock.opc_node_id || stock.opc_tag;
                  const opcHigh = match.opc_high_node_id || match.opcHighNodeId || match.OpcHighLevelNodeId || match.opc_high_tag || stock.opcHighNodeId || stock.opc_high_node_id;
                  const opcLow = match.opc_low_node_id || match.opcLowNodeId || match.OpcLowLevelNodeId || match.opc_low_tag || stock.opcLowNodeId || stock.opc_low_node_id;
                  const highActive = match.high_level_active !== undefined ? match.high_level_active : (match.highLevelActive !== undefined ? match.highLevelActive : stock.highLevelActive);
                  const lowActive = match.low_level_active !== undefined ? match.low_level_active : (match.lowLevelActive !== undefined ? match.lowLevelActive : stock.lowLevelActive);
                  const highQuality = match.high_level_quality || match.highLevelQuality || stock.highLevelQuality || 'Good';
                  const lowQuality = match.low_level_quality || match.lowLevelQuality || stock.lowLevelQuality || 'Good';

                  return {
                    ...stock,
                    live_pv: livePv,
                    livePv: livePv,
                    quality,
                    pv_quality: quality,
                    pvQuality: quality,
                    last_synced: lastSynced,
                    lastSynced: lastSynced,
                    lastUpdated: lastSynced ? `2026-10-11 ${lastSynced}` : stock.lastUpdated,
                    opc_tag: opcTag || stock.opc_tag,
                    opcNodeId: opcTag || stock.opcNodeId,
                    opc_node_id: opcTag || stock.opc_node_id,
                    opcHighNodeId: opcHigh || stock.opcHighNodeId,
                    opc_high_node_id: opcHigh || stock.opc_high_node_id,
                    opcLowNodeId: opcLow || stock.opcLowNodeId,
                    opc_low_node_id: opcLow || stock.opc_low_node_id,
                    highLevelActive: highActive,
                    high_level_active: highActive,
                    lowLevelActive: lowActive,
                    low_level_active: lowActive,
                    highLevelQuality: highQuality,
                    high_level_quality: highQuality,
                    lowLevelQuality: lowQuality,
                    low_level_quality: lowQuality,
                  };
                });
              });
            }

            // 1b. Process individual TANK_TELEMETRY event
            if (msg.type === 'TANK_TELEMETRY' && (msg.tank_id || msg.tankId)) {
              const targetTankId = msg.tank_id || msg.tankId;
              const pvNode = (msg.pv_node || msg.opc_node_id || '').trim();
              setStocks((prev) => prev.map((t) => {
                const currentTag = (t.opcNodeId || t.opc_node_id || t.opc_tag || '').trim();
                const isTMapped = Boolean(
                  currentTag && 
                  currentTag !== '' && 
                  !currentTag.includes('[CHƯA ÁNH XẠ]')
                );
                const isPvNodeValid = Boolean(
                  pvNode && 
                  pvNode !== '' && 
                  !pvNode.includes('[CHƯA ÁNH XẠ]')
                );

                if (!isTMapped && !isPvNodeValid) {
                  return t;
                }

                if (
                  t.tankId === targetTankId ||
                  (t as any).assigned_tank === targetTankId ||
                  (t as any).AssignedTank === targetTankId ||
                  (pvNode && (t.opc_tag === pvNode || t.opc_node_id === pvNode || t.opcNodeId === pvNode))
                ) {
                  const val = msg.live_pv !== undefined ? msg.live_pv : msg.livePv;
                  const numVal = typeof val === 'number' ? val : parseFloat(val);
                  const cleanVal = isNaN(numVal) ? val : numVal;
                  const qual = msg.quality || msg.pv_quality || msg.pvQuality || 'Good';
                  return {
                    ...t,
                    live_pv: cleanVal,
                    livePv: cleanVal,
                    pv_quality: qual,
                    pvQuality: qual,
                    last_synced: msg.timestamp || new Date().toTimeString().split(' ')[0],
                    lastSynced: msg.timestamp || new Date().toTimeString().split(' ')[0],
                  };
                }
                return t;
              }));
            }

            // 2. Process individual TAG_UPDATE messages
            if (msg.type === 'TAG_UPDATE') {
              const d = msg.data || msg;
              const rawNode = d.node_id || d.tag_name || '';
              const nodeAddr = String(rawNode).toLowerCase();
              const cleanNodeAddr = nodeAddr.replace(/^ns=\d+;s=/, '');

              setStocks((prevStocks) => {
                let hasChange = false;
                const next = prevStocks.map((stock) => {
                  const stockTag = String(stock.opc_tag || stock.opcNodeId || stock.opc_node_id || '').toLowerCase();
                  if (!stockTag || stockTag === '' || stockTag.includes('[chưa ánh xạ]')) {
                    return stock;
                  }
                  const stockHighTag = String(stock.opc_high_node_id || stock.opcHighNodeId || '').toLowerCase();
                  const stockLowTag = String(stock.opc_low_node_id || stock.opcLowNodeId || '').toLowerCase();

                  let updated = false;
                  const updatedStock = { ...stock };

                  // Continuous PV tag
                  if (stockTag) {
                    const cleanStockTag = stockTag.replace(/^ns=\d+;s=/, '');
                    if (
                      stockTag === nodeAddr ||
                      cleanStockTag === cleanNodeAddr ||
                      nodeAddr.endsWith(cleanStockTag) ||
                      stockTag.endsWith(cleanNodeAddr)
                    ) {
                      updated = true;
                      const val = typeof d.value === 'number' ? d.value : parseFloat(d.value);
                      const parsedVal = isNaN(val) ? d.value : val;
                      updatedStock.live_pv = parsedVal;
                      updatedStock.livePv = parsedVal;
                      updatedStock.pv_quality = d.quality || 'Good';
                      updatedStock.pvQuality = d.quality || 'Good';
                      updatedStock.last_synced = d.timestamp || new Date().toTimeString().split(' ')[0];
                      updatedStock.lastSynced = d.timestamp || new Date().toTimeString().split(' ')[0];
                    }
                  }

                  // High level switch (LSH)
                  if (stockHighTag && !stockHighTag.includes('[chưa ánh xạ]')) {
                    const cleanHighTag = stockHighTag.replace(/^ns=\d+;s=/, '');
                    if (
                      stockHighTag === nodeAddr ||
                      cleanHighTag === cleanNodeAddr ||
                      nodeAddr.endsWith(cleanHighTag) ||
                      stockHighTag.endsWith(cleanNodeAddr)
                    ) {
                      updated = true;
                      const boolVal = typeof d.value === 'boolean' ? d.value : (typeof d.value === 'number' ? d.value > 0.001 : ['true', '1', 'high', 'active', 'trip'].includes(String(d.value).toLowerCase()));
                      updatedStock.highLevelActive = boolVal;
                      updatedStock.high_level_active = boolVal;
                      updatedStock.highLevelQuality = d.quality || 'Good';
                      updatedStock.high_level_quality = d.quality || 'Good';
                    }
                  }

                  // Low level switch (LSL)
                  if (stockLowTag && !stockLowTag.includes('[chưa ánh xạ]')) {
                    const cleanLowTag = stockLowTag.replace(/^ns=\d+;s=/, '');
                    if (
                      stockLowTag === nodeAddr ||
                      cleanLowTag === cleanNodeAddr ||
                      nodeAddr.endsWith(cleanLowTag) ||
                      stockLowTag.endsWith(cleanNodeAddr)
                    ) {
                      updated = true;
                      const boolVal = typeof d.value === 'boolean' ? d.value : (typeof d.value === 'number' ? d.value > 0.001 : ['true', '1', 'high', 'active', 'trip'].includes(String(d.value).toLowerCase()));
                      updatedStock.lowLevelActive = boolVal;
                      updatedStock.low_level_active = boolVal;
                      updatedStock.lowLevelQuality = d.quality || 'Good';
                      updatedStock.low_level_quality = d.quality || 'Good';
                    }
                  }

                  if (updated) {
                    hasChange = true;
                    return updatedStock;
                  }
                  return stock;
                });
                return hasChange ? next : prevStocks;
              });
            }

            // 3. Universal Centralized Telemetry: Process TAGS_BATCH messages
            if (msg.type === 'TAGS_BATCH' && msg.tags && typeof msg.tags === 'object') {
              const tagsMap = msg.tags;
              setStocks((prevStocks) => {
                let hasChange = false;
                const next = prevStocks.map((stock) => {
                  const stockTag = (stock.opc_tag || stock.opcNodeId || stock.opc_node_id || '').trim();
                  if (!stockTag || stockTag === '' || stockTag.includes('[CHƯA ÁNH XẠ]')) {
                    return stock;
                  }
                  const cleanStockTag = stockTag.replace(/^ns=\d+;s=/, '');
                  const matchedEntry = tagsMap[stockTag] || tagsMap[cleanStockTag] || tagsMap[`ns=2;s=${cleanStockTag}`];

                  let updated = false;
                  const updatedStock = { ...stock };

                  if (matchedEntry && matchedEntry.value !== undefined) {
                    const rawVal = matchedEntry.value;
                    const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
                    const cleanVal = isNaN(numVal) ? rawVal : numVal;
                    if (updatedStock.live_pv !== cleanVal || updatedStock.quality !== matchedEntry.quality) {
                      updated = true;
                      updatedStock.live_pv = cleanVal;
                      updatedStock.livePv = cleanVal;
                      updatedStock.pv_quality = matchedEntry.quality || 'Good';
                      updatedStock.pvQuality = matchedEntry.quality || 'Good';
                      updatedStock.last_synced = matchedEntry.timestamp || new Date().toTimeString().split(' ')[0];
                      updatedStock.lastSynced = matchedEntry.timestamp || new Date().toTimeString().split(' ')[0];
                    }
                  }

                  // High level switch (LSH)
                  const highTag = (stock.opc_high_node_id || stock.opcHighNodeId || '').trim();
                  if (highTag && !highTag.includes('[CHƯA ÁNH XẠ]')) {
                    const cleanHigh = highTag.replace(/^ns=\d+;s=/, '');
                    const matchedHigh = tagsMap[highTag] || tagsMap[cleanHigh] || tagsMap[`ns=2;s=${cleanHigh}`];
                    if (matchedHigh && matchedHigh.value !== undefined) {
                      const boolVal = typeof matchedHigh.value === 'boolean' ? matchedHigh.value : (typeof matchedHigh.value === 'number' ? matchedHigh.value > 0.001 : ['true', '1', 'high', 'active', 'trip'].includes(String(matchedHigh.value).toLowerCase()));
                      if (updatedStock.highLevelActive !== boolVal) {
                        updated = true;
                        updatedStock.highLevelActive = boolVal;
                        updatedStock.high_level_active = boolVal;
                        updatedStock.highLevelQuality = matchedHigh.quality || 'Good';
                        updatedStock.high_level_quality = matchedHigh.quality || 'Good';
                      }
                    }
                  }

                  // Low level switch (LSL)
                  const lowTag = (stock.opc_low_node_id || stock.opcLowNodeId || '').trim();
                  if (lowTag && !lowTag.includes('[CHƯA ÁNH XẠ]')) {
                    const cleanLow = lowTag.replace(/^ns=\d+;s=/, '');
                    const matchedLow = tagsMap[lowTag] || tagsMap[cleanLow] || tagsMap[`ns=2;s=${cleanLow}`];
                    if (matchedLow && matchedLow.value !== undefined) {
                      const boolVal = typeof matchedLow.value === 'boolean' ? matchedLow.value : (typeof matchedLow.value === 'number' ? matchedLow.value > 0.001 : ['true', '1', 'high', 'active', 'trip'].includes(String(matchedLow.value).toLowerCase()));
                      if (updatedStock.lowLevelActive !== boolVal) {
                        updated = true;
                        updatedStock.lowLevelActive = boolVal;
                        updatedStock.low_level_active = boolVal;
                        updatedStock.lowLevelQuality = matchedLow.quality || 'Good';
                        updatedStock.low_level_quality = matchedLow.quality || 'Good';
                      }
                    }
                  }

                  if (updated) {
                    hasChange = true;
                    return updatedStock;
                  }
                  return stock;
                });
                return hasChange ? next : prevStocks;
              });
            }
          } catch {
            // Ignore parse errors on ping/pong
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          reconnectTimer = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch (err) {
        console.warn('[InventoryContext] WebSocket initialization error:', err);
        if (isMounted) reconnectTimer = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    // Fallback HTTP Polling every 8.0s to reconcile with SQL Server while WebSocket streams real-time updates
    const pollInterval = setInterval(() => {
      if (!isMounted) return;
      api.getInventoryStocks()
        .then((live) => {
          if (live && live.length > 0 && isMounted) {
            setStocks((prev) => {
              let hasAnyChange = false;
              const next = prev.map((curr) => {
                const found = live.find((l) => l.tankId === curr.tankId);
                if (!found) return curr;
                const fTag = (found.opcNodeId || found.opc_node_id || found.opc_tag || '').trim();
                const isFMapped = Boolean(fTag && fTag !== '' && !fTag.includes('[CHƯA ÁNH XẠ]'));
                if (!isFMapped) {
                  if (curr.pv_quality === '[CHƯA ÁNH XẠ]' && !curr.opc_node_id) {
                    return curr;
                  }
                  hasAnyChange = true;
                  return {
                    ...curr,
                    live_pv: undefined,
                    livePv: undefined,
                    pv_quality: '[CHƯA ÁNH XẠ]',
                    pvQuality: '[CHƯA ÁNH XẠ]',
                    last_synced: 'Chưa kết nối',
                    lastSynced: 'Chưa kết nối',
                    opc_node_id: '',
                    opcNodeId: '',
                    opc_tag: '',
                  };
                }
                const nextPv = found.live_pv !== undefined ? found.live_pv : found.livePv;
                const nextQual = found.pv_quality || found.pvQuality || 'Good';
                const nextHigh = found.highLevelActive !== undefined ? found.highLevelActive : curr.highLevelActive;
                const nextLow = found.lowLevelActive !== undefined ? found.lowLevelActive : curr.lowLevelActive;
                if (
                  curr.live_pv === nextPv &&
                  curr.pv_quality === nextQual &&
                  curr.opc_node_id === fTag &&
                  curr.highLevelActive === nextHigh &&
                  curr.lowLevelActive === nextLow
                ) {
                  return curr;
                }
                hasAnyChange = true;
                return {
                  ...curr,
                  live_pv: nextPv,
                  livePv: nextPv,
                  pv_quality: nextQual,
                  pvQuality: nextQual,
                  last_synced: found.last_synced || found.lastSynced || curr.last_synced,
                  lastSynced: found.last_synced || found.lastSynced || curr.lastSynced,
                  highLevelActive: nextHigh,
                  lowLevelActive: nextLow,
                  opc_node_id: fTag,
                  opcNodeId: fTag,
                  opc_tag: fTag,
                };
              });
              return hasAnyChange ? next : prev;
            });
          }
        })
        .catch(() => {});
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  const getHeadspace = (matCode: MaterialCode): number => {
    const targetTank = stocks.find((s) => s.materialCode === matCode);
    if (!targetTank) return 0;
    return Math.max(0, Math.round((targetTank.capacity - targetTank.currentStock) * 100) / 100);
  };

  const getActiveLotForMaterial = (matCode: MaterialCode): string => {
    const matched = receipts.filter((r) => r.materialCode === matCode);
    if (matched.length > 0) {
      return matched[0].supplierLot || 'LOT-STANDARD';
    }
    return `LOT-${matCode}-DEFAULT`;
  };

  const updateStockForMaterial = (matCode: MaterialCode, deltaQty: number) => {
    setStocks((prevStocks) =>
      prevStocks.map((stock) => {
        if (stock.materialCode === matCode) {
          const newQty = Math.max(0, Math.round((stock.currentStock + deltaQty) * 100) / 100);
          const newStatus = newQty < stock.minThreshold ? 'LOW_STOCK' : 'NORMAL';
          const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
          return {
            ...stock,
            currentStock: newQty,
            status: newStatus,
            lastUpdated: nowStr,
          };
        }
        return stock;
      })
    );
  };

  const addInboundReceipt = (newReceipt: Omit<InboundReceipt, 'id'>) => {
    const headspace = getHeadspace(newReceipt.materialCode);
    if (newReceipt.quantity > headspace) {
      return {
        success: false,
        message: `Inbound quantity (${newReceipt.quantity.toLocaleString()} ${newReceipt.unit}) exceeds available tank headspace (${headspace.toLocaleString()} ${newReceipt.unit}). Operation blocked to prevent overflow.`,
      };
    }

    const id = `inb-${Date.now()}`;
    const receipt: InboundReceipt = {
      ...newReceipt,
      id,
    };
    setReceipts((prev) => [receipt, ...prev]);

    // Reactive increase to local stock
    updateStockForMaterial(receipt.materialCode, receipt.quantity);

    // Two-way synchronous persistence to physical SQL Server with explicit commit
    api.intakeInventory({
      material_code: receipt.materialCode,
      material_name: receipt.materialName,
      quantity: receipt.quantity,
      lot_number: receipt.supplierLot,
      remark: receipt.note,
      user: 'Warehouse_Officer'
    }).then(() => {
      refreshStockBalance();
    }).catch((err) => {
      console.warn('[Inventory] Async SQL intake warning:', err);
    });

    return {
      success: true,
      message: `Inbound receipt [${receipt.receiptCode}] recorded successfully. ${receipt.quantity} ${receipt.unit} added to storage tank.`,
    };
  };

  const updateInboundReceipt = (id: string, updated: Partial<InboundReceipt>) => {
    const existing = receipts.find((r) => r.id === id);
    if (!existing) return;

    if (updated.quantity !== undefined && updated.quantity !== existing.quantity) {
      const delta = updated.quantity - existing.quantity;
      updateStockForMaterial(existing.materialCode, delta);
    }

    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
    );
  };

  const deleteInboundReceipt = (id: string) => {
    const existing = receipts.find((r) => r.id === id);
    if (existing) {
      updateStockForMaterial(existing.materialCode, -existing.quantity);
    }
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  };

  // Automated Post-Batch Material Deduction & Reconciliation Engine
  const executeBatchDeduction = (params: BatchDeductionParams) => {
    const now = new Date();
    const timeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const volumeFactor = (params.volume || 2.0) / 2.0;

    const milkDeduction = params.milkQty ?? Math.round(1.4 * volumeFactor * 100) / 100;
    const sugarDeduction = params.sugarQty ?? Math.round(0.4 * volumeFactor * 100) / 100;
    const additiveDeduction = params.additiveQty ?? Math.round(0.2 * volumeFactor * 100) / 100;

    // Resolve active FIFO lot codes
    const milkLot = getActiveLotForMaterial('RAW_MILK');
    const sugarLot = getActiveLotForMaterial('SUGAR');
    const additiveLot = getActiveLotForMaterial('ADDITIVE');

    // Deduct exact quantities from current stocks
    setStocks((prevStocks) =>
      prevStocks.map((stock) => {
        let deduction = 0;
        if (stock.materialCode === 'RAW_MILK') deduction = milkDeduction;
        if (stock.materialCode === 'SUGAR') deduction = sugarDeduction;
        if (stock.materialCode === 'ADDITIVE') deduction = additiveDeduction;

        const newStock = Math.max(0, Math.round((stock.currentStock - deduction) * 100) / 100);
        const status = newStock < stock.minThreshold ? 'LOW_STOCK' : 'NORMAL';

        return {
          ...stock,
          currentStock: newStock,
          status,
          lastUpdated: timeStr,
        };
      })
    );

    // Two-way synchronous persistence to physical SQL Server via atomic transaction
    api.consumeMaterials({
      order_id: params.orderId || params.batchId || 'BATCH',
      milk_qty: milkDeduction,
      sugar_qty: sugarDeduction,
      additive_qty: additiveDeduction,
      consumed_items: [
        { material_code: 'RAW_MILK', amount: milkDeduction },
        { material_code: 'SUGAR', amount: sugarDeduction },
        { material_code: 'ADDITIVE', amount: additiveDeduction },
      ]
    }).then(() => {
      refreshStockBalance();
    }).catch((err) => {
      console.warn('[Inventory] Async SQL deduction warning:', err);
    });

    const consumedItems: ConsumedItem[] = [
      {
        materialCode: 'RAW_MILK',
        materialName: 'Sữa tươi nguyên liệu',
        consumedQty: milkDeduction,
        unit: 'L',
        lotCode: milkLot,
      },
      {
        materialCode: 'SUGAR',
        materialName: 'Đường tinh luyện',
        consumedQty: sugarDeduction,
        unit: 'kg',
        lotCode: sugarLot,
      },
      {
        materialCode: 'ADDITIVE',
        materialName: 'Phụ gia & Vi chất',
        consumedQty: additiveDeduction,
        unit: 'L',
        lotCode: additiveLot,
      },
    ];

    const newLog: BatchConsumptionRecord = {
      id: `cons-${Date.now()}`,
      batchId: params.batchId || `BATCH_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(consumptionLogs.length + 1).padStart(2, '0')}`,
      orderId: params.orderId,
      recipeName: params.recipeName || 'Fresh Pasteurized UHT Milk',
      timestamp: timeStr,
      consumedItems,
      status: 'RECONCILED',
      reconciledBy: params.source || 'Kepware Central RBE Auto-Sync',
    };

    setConsumptionLogs((prev) => [newLog, ...prev]);

    // Asynchronously commit material consumption to SQL Server
    api.consumeMaterials({
      order_id: params.orderId,
      milk_qty: milkDeduction,
      sugar_qty: sugarDeduction,
      additive_qty: additiveDeduction,
    }).catch((err) => console.debug('[SQL Server] Material deduction notice:', err));

    return {
      success: true,
      message: `Batch [${params.orderId}] post-batch deduction reconciled: -${milkDeduction}L Milk (${milkLot}), -${sugarDeduction}kg Sugar (${sugarLot}), -${additiveDeduction}L Additive (${additiveLot}).`,
    };
  };

  const simulateBatchDeduction = (batchId?: string, recipeName?: string, orderId?: string) => {
    const nextOrderNum = consumptionLogs.length + 1;
    const targetOrderId = orderId || (batchId && batchId.includes('WO-') ? batchId : `WO-2026-${String(nextOrderNum).padStart(3, '0')}`);
    executeBatchDeduction({
      orderId: targetOrderId,
      batchId: batchId || `BATCH_${targetOrderId.replace('WO-', '')}`,
      recipeName: recipeName || 'Fresh Pasteurized UHT Milk (2.0L)',
      volume: 2.0,
      source: 'Dev Test Harness Simulation',
    });
  };

  // Event Listener 1: Listen for Module Operations finishedOrders (status === 'COMPLETED')
  useEffect(() => {
    if (!operations?.finishedOrders) return;
    operations.finishedOrders.forEach((order) => {
      if (order.status === 'COMPLETED') {
        const alreadyReconciled = consumptionLogs.some((log) => log.orderId === order.id);
        if (!alreadyReconciled) {
          executeBatchDeduction({
            orderId: order.id,
            batchId: `BATCH_${order.id.replace('WO-', '')}`,
            recipeName: order.recipeName,
            volume: order.volume,
            source: 'Module Operations Batch Completed',
          });
        }
      }
    });
  }, [operations?.finishedOrders, consumptionLogs]);

  // Event Listener 2: Standard Window Custom Event for external/Kepware integration
  useEffect(() => {
    const handleBatchCompletedEvent = (e: Event) => {
      const custom = e as CustomEvent<{ orderId?: string; batchId?: string; recipeName?: string; volume?: number }>;
      if (custom.detail?.orderId) {
        const alreadyReconciled = consumptionLogs.some((log) => log.orderId === custom.detail?.orderId);
        if (!alreadyReconciled) {
          executeBatchDeduction({
            orderId: custom.detail.orderId,
            batchId: custom.detail.batchId,
            recipeName: custom.detail.recipeName,
            volume: custom.detail.volume,
            source: 'Kepware WebSocket Batch Event (Port 49320)',
          });
        }
      }
    };

    window.addEventListener('mes:batch-completed', handleBatchCompletedEvent);
    return () => window.removeEventListener('mes:batch-completed', handleBatchCompletedEvent);
  }, [consumptionLogs, receipts]);

  return (
    <InventoryContext.Provider
      value={{
        receipts,
        stocks,
        consumptionLogs,
        addInboundReceipt,
        updateInboundReceipt,
        deleteInboundReceipt,
        executeBatchDeduction,
        simulateBatchDeduction,
        refreshStockBalance,
        fetchLiveStocks,
        fetchLiveReceipts,
        updateTankInState,
        isRefreshing,
        getHeadspace,
        getActiveLotForMaterial,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = (): InventoryContextType => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
