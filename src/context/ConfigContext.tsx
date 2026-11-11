import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SiemensPlcConfig, SqlServerConfig, ConfigContextType } from '../types/config';
import { checkDbStatus, testDbConnection, getGatewayStatus, GatewayStatusResponse } from '../services/api';

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const PLC1_STORAGE_KEY = 'mes_plc1_config_v2';
const PLC2_STORAGE_KEY = 'mes_plc2_config_v2';
const SQL_STORAGE_KEY = 'mes_sql_config_v2';

const defaultPlc1Config: SiemensPlcConfig = {
  id: 'plc1',
  name: 'SIMATIC S7-1500 (PLC 1)',
  unitLabel: 'Unit 1 / Simulation',
  roleDescription: 'Simulation & Digital Twin Mixing Line Controller',
  ipAddress: '192.168.0.1',
  port: 102,
  rack: 0,
  slot: 1,
  connectionState: 'disconnected',
  latencyMs: undefined,
};

const defaultPlc2Config: SiemensPlcConfig = {
  id: 'plc2',
  name: 'SIMATIC S7-1500 (PLC 2)',
  unitLabel: 'Unit 2 / Hardware Physical',
  roleDescription: 'Production Plant Physical Sterilize & Transfer Controller',
  ipAddress: '192.168.0.23',
  port: 102,
  rack: 0,
  slot: 1,
  connectionState: 'disconnected',
  latencyMs: undefined,
};

const defaultSqlConfig: SqlServerConfig = {
  serverName: 'localhost\\WINCC',
  databaseName: 'MES_Milk_Production',
  authMode: 'windows',
  username: '',
  password: '',
  port: 1433,
  connectionState: 'disconnected',
  version: 'SQL SERVER 2022',
};

const CONNECTION_ERROR_ALERT = 
  "Connection Failed: Host unreachable. Please check physical Ethernet cable, IP subnet (192.168.0.x), or start backend service.";

async function verifyHostLink(endpoint: string, payload: unknown): Promise<{ ok: boolean; latencyMs?: number }> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutMs = 2000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let success = false;
  let latency = 10;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      success = true;
      latency = data.latencyMs || 10;
    }
  } catch {
    // Network error, connection refused or timeout aborted
  }

  // Ensure user sees the 2-second timeout attempt if connection failed
  const elapsed = Date.now() - startTime;
  if (!success && elapsed < timeoutMs) {
    await new Promise((r) => setTimeout(r, timeoutMs - elapsed));
  }

  return { ok: success, latencyMs: latency };
}

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plc1Config, setPlc1Config] = useState<SiemensPlcConfig>(() => {
    try {
      const saved = localStorage.getItem(PLC1_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          connectionState: 'disconnected',
          latencyMs: undefined,
          errorMessage: undefined,
        };
      }
    } catch {
      // ignore
    }
    return defaultPlc1Config;
  });

  const [plc2Config, setPlc2Config] = useState<SiemensPlcConfig>(() => {
    try {
      const saved = localStorage.getItem(PLC2_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          connectionState: 'disconnected',
          latencyMs: undefined,
          errorMessage: undefined,
        };
      }
    } catch {
      // ignore
    }
    return defaultPlc2Config;
  });

  const [sqlConfig, setSqlConfig] = useState<SqlServerConfig>(() => {
    try {
      const saved = localStorage.getItem(SQL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const isLegacyDummy = !parsed.serverName || parsed.serverName.includes('MES-SRV-SQL01') || parsed.databaseName === 'MES_ISA95_DB';
        return {
          ...parsed,
          serverName: isLegacyDummy ? 'localhost\\WINCC' : parsed.serverName,
          databaseName: isLegacyDummy ? 'MES_Milk_Production' : parsed.databaseName,
          authMode: parsed.authMode || 'windows',
          version: parsed.version || 'SQL SERVER 2022',
          connectionState: 'disconnected',
          errorMessage: undefined,
        };
      }
    } catch {
      // ignore
    }
    return defaultSqlConfig;
  });

  const [isSavingSql, setIsSavingSql] = useState<boolean>(false);

  // Sync with Global Header Live Telemetry: continuous 5s background poll of /api/db/status
  useEffect(() => {
    let isMounted = true;
    const syncLiveDbStatus = async () => {
      try {
        const res = await checkDbStatus();
        if (!isMounted) return;
        if (res.connected) {
          setSqlConfig((prev) => {
            if (prev.connectionState === 'connecting') return prev;
            return {
              ...prev,
              connectionState: 'connected',
              version: 'SQL SERVER 2022',
              errorMessage: undefined,
            };
          });
        } else {
          setSqlConfig((prev) => {
            if (prev.connectionState === 'connecting') return prev;
            return {
              ...prev,
              connectionState: 'disconnected',
            };
          });
        }
      } catch {
        if (!isMounted) return;
        setSqlConfig((prev) => {
          if (prev.connectionState === 'connecting') return prev;
          return {
            ...prev,
            connectionState: 'disconnected',
          };
        });
      }
    };

    syncLiveDbStatus();
    const interval = setInterval(syncLiveDbStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Centralized OPC UA Gateway Connection Status State (Shared Application-Wide)
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusResponse | null>(null);

  const refreshGatewayStatus = useCallback(async (): Promise<GatewayStatusResponse | null> => {
    try {
      const data = await getGatewayStatus();
      setGatewayStatus(data);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mes:gateway-status-changed', { detail: data }));
      }
      return data;
    } catch {
      const fallback: GatewayStatusResponse = {
        status: 'OFFLINE',
        is_connected: false,
        connected: false,
        server_connected: false,
        endpoint: gatewayStatus?.endpoint || 'opc.tcp://127.0.0.1:49320',
        latency_ms: 0,
        active_tags: 0,
      };
      setGatewayStatus(fallback);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mes:gateway-status-changed', { detail: fallback }));
      }
      return fallback;
    }
  }, []);

  // Sync with Centralized Gateway: continuous 3s background poll of /api/gateway/status
  useEffect(() => {
    let isMounted = true;
    const syncGateway = async () => {
      try {
        const data = await getGatewayStatus();
        if (!isMounted) return;
        setGatewayStatus(data);
      } catch {
        if (!isMounted) return;
        setGatewayStatus((prev) => ({
          status: 'OFFLINE',
          is_connected: false,
          connected: false,
          server_connected: false,
          endpoint: prev?.endpoint || 'opc.tcp://127.0.0.1:49320',
          latency_ms: 0,
          active_tags: 0,
        }));
      }
    };

    syncGateway();
    const interval = setInterval(syncGateway, 3000);

    const handleCustomStatusChanged = (e: any) => {
      if (!isMounted) return;
      if (e?.detail) {
        setGatewayStatus(e.detail);
      } else {
        syncGateway();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mes:gateway-status-changed', handleCustomStatusChanged);
      window.addEventListener('mes:gateway-status-refresh-needed', syncGateway);
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mes:gateway-status-changed', handleCustomStatusChanged);
        window.removeEventListener('mes:gateway-status-refresh-needed', syncGateway);
      }
    };
  }, []);

  const isGatewayOnline = Boolean(
    gatewayStatus?.is_connected ||
    gatewayStatus?.connected ||
    gatewayStatus?.status === 'ONLINE'
  );

  useEffect(() => {
    localStorage.setItem(PLC1_STORAGE_KEY, JSON.stringify(plc1Config));
  }, [plc1Config]);

  useEffect(() => {
    localStorage.setItem(PLC2_STORAGE_KEY, JSON.stringify(plc2Config));
  }, [plc2Config]);

  useEffect(() => {
    localStorage.setItem(SQL_STORAGE_KEY, JSON.stringify(sqlConfig));
  }, [sqlConfig]);

  const updatePlc1Config = (fields: Partial<SiemensPlcConfig>) => {
    setPlc1Config((prev) => ({
      ...prev,
      ...fields,
      // If IP or Port changes, reset connection and error
      connectionState: (fields.ipAddress && fields.ipAddress !== prev.ipAddress) || (fields.port && fields.port !== prev.port)
        ? 'disconnected'
        : prev.connectionState,
      errorMessage: undefined,
    }));
  };

  const updatePlc2Config = (fields: Partial<SiemensPlcConfig>) => {
    setPlc2Config((prev) => ({
      ...prev,
      ...fields,
      connectionState: (fields.ipAddress && fields.ipAddress !== prev.ipAddress) || (fields.port && fields.port !== prev.port)
        ? 'disconnected'
        : prev.connectionState,
      errorMessage: undefined,
    }));
  };

  const togglePlc1Connection = async () => {
    if (plc1Config.connectionState === 'connected') {
      setPlc1Config((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        latencyMs: undefined,
        errorMessage: undefined,
      }));
      return;
    }

    setPlc1Config((prev) => ({
      ...prev,
      connectionState: 'connecting',
      errorMessage: undefined,
    }));

    const result = await verifyHostLink('http://localhost:8000/api/plc/ping', {
      plcId: 'plc1',
      ipAddress: plc1Config.ipAddress,
      port: plc1Config.port,
      rack: plc1Config.rack,
      slot: plc1Config.slot,
    });

    if (result.ok) {
      setPlc1Config((prev) => ({
        ...prev,
        connectionState: 'connected',
        lastConnectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latencyMs: result.latencyMs,
        errorMessage: undefined,
      }));
    } else {
      setPlc1Config((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        errorMessage: CONNECTION_ERROR_ALERT,
        latencyMs: undefined,
      }));
    }
  };

  const togglePlc2Connection = async () => {
    if (plc2Config.connectionState === 'connected') {
      setPlc2Config((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        latencyMs: undefined,
        errorMessage: undefined,
      }));
      return;
    }

    setPlc2Config((prev) => ({
      ...prev,
      connectionState: 'connecting',
      errorMessage: undefined,
    }));

    const result = await verifyHostLink('http://localhost:8000/api/plc/ping', {
      plcId: 'plc2',
      ipAddress: plc2Config.ipAddress,
      port: plc2Config.port,
      rack: plc2Config.rack,
      slot: plc2Config.slot,
    });

    if (result.ok) {
      setPlc2Config((prev) => ({
        ...prev,
        connectionState: 'connected',
        lastConnectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latencyMs: result.latencyMs,
        errorMessage: undefined,
      }));
    } else {
      setPlc2Config((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        errorMessage: CONNECTION_ERROR_ALERT,
        latencyMs: undefined,
      }));
    }
  };

  const updateSqlConfig = (fields: Partial<SqlServerConfig>) => {
    setSqlConfig((prev) => ({
      ...prev,
      ...fields,
      errorMessage: undefined,
    }));
  };

  const testSqlConnection = async (): Promise<boolean> => {
    setIsSavingSql(true);
    setSqlConfig((prev) => ({
      ...prev,
      connectionState: 'connecting',
      errorMessage: undefined,
    }));

    try {
      const res = await testDbConnection({
        server_name: sqlConfig.serverName,
        database_name: sqlConfig.databaseName,
        auth_mode: sqlConfig.authMode || 'windows',
        username: sqlConfig.username,
        password: sqlConfig.password,
        port: sqlConfig.port,
      });

      if (res.connected || res.ok) {
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setSqlConfig((prev) => ({
          ...prev,
          connectionState: 'connected',
          version: res.version || 'SQL SERVER 2022',
          lastVerifiedAt: timeNow,
          errorMessage: undefined,
        }));
        setIsSavingSql(false);
        return true;
      } else {
        setSqlConfig((prev) => ({
          ...prev,
          connectionState: 'disconnected',
          errorMessage: res.error || CONNECTION_ERROR_ALERT,
        }));
        setIsSavingSql(false);
        return false;
      }
    } catch (err: any) {
      setSqlConfig((prev) => ({
        ...prev,
        connectionState: 'disconnected',
        errorMessage: err.message || CONNECTION_ERROR_ALERT,
      }));
      setIsSavingSql(false);
      return false;
    }
  };

  const saveSqlConfig = async (): Promise<boolean> => {
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSqlConfig((prev) => ({
      ...prev,
      lastSavedAt: timeNow,
    }));
    try {
      localStorage.setItem(SQL_STORAGE_KEY, JSON.stringify({
        ...sqlConfig,
        lastSavedAt: timeNow,
      }));
    } catch {
      // ignore
    }
    return true;
  };

  return (
    <ConfigContext.Provider
      value={{
        plc1Config,
        plc2Config,
        sqlConfig,
        updatePlc1Config,
        updatePlc2Config,
        togglePlc1Connection,
        togglePlc2Connection,
        updateSqlConfig,
        saveSqlConfig,
        testSqlConnection,
        isSavingSql,
        gatewayStatus,
        isGatewayOnline,
        refreshGatewayStatus,
        setGatewayStatus,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

export const useGatewayStatus = () => {
  const { gatewayStatus: statusData, refreshGatewayStatus, setGatewayStatus } = useConfig();
  const isOnline = Boolean(statusData?.is_connected || statusData?.connected || statusData?.status === "ONLINE");
  return {
    statusData,
    gatewayStatus: statusData,
    isOnline,
    isGatewayOnline: isOnline,
    latencyMs: statusData?.latency_ms ?? 0,
    endpoint: statusData?.endpoint ?? 'opc.tcp://127.0.0.1:49320',
    refreshGatewayStatus,
    setGatewayStatus,
  };
};

