/* Hallmark · component: HeaderBrandIdentity / Navbar · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled
 * contrast: WCAG AA Pass
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';

import { 
  Settings, 
  Layers, 
  Database, 
  Activity, 
  LogOut, 
  User as UserIcon,
  Award,
  Boxes,
  Wrench,
  FileSpreadsheet,
  Network,
  RefreshCw,
  Bot,
  Gauge,
  AlertTriangle
} from 'lucide-react';
import { getActiveAlarms, acknowledgeAlarm } from '../../services/api';

export type ActiveNavTab = 'Configuration' | 'ISA-88 Model' | 'Master Data' | 'Operations' | 'OEE PERFORMANCE' | 'Quality' | 'Inventory' | 'Maintenance' | 'Reports';
export type SqlStoreForwardMode = 'ONLINE' | 'BUFFERING' | 'SYNCING';

interface NavbarProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  onToggleAiDrawer?: () => void;
  isAiDrawerOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  activeTab, 
  onSelectTab, 
  onToggleAiDrawer, 
  isAiDrawerOpen = false 
}) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  const navItems = [
    {
      id: 'Configuration' as ActiveNavTab,
      label: 'Configuration',
      icon: Settings,
      enabled: user.role !== 'Operator',
    },
    {
      id: 'ISA-88 Model' as ActiveNavTab,
      label: 'ISA-88 Model',
      icon: Layers,
      enabled: true,
    },

    {
      id: 'Master Data' as ActiveNavTab,
      label: 'Master Data',
      icon: Database,
      enabled: true,
    },
    {
      id: 'Operations' as ActiveNavTab,
      label: 'Operations',
      icon: Activity,
      enabled: true,
    },
    {
      id: 'OEE PERFORMANCE' as ActiveNavTab,
      label: 'OEE Performance',
      icon: Gauge,
      enabled: true,
    },
    {
      id: 'Quality' as ActiveNavTab,
      label: 'Quality',
      icon: Award,
      enabled: true,
    },
    {
      id: 'Inventory' as ActiveNavTab,
      label: 'Inventory',
      icon: Boxes,
      enabled: true,
    },
    {
      id: 'Maintenance' as ActiveNavTab,
      label: 'Maintenance',
      icon: Wrench,
      enabled: true,
    },
    {
      id: 'Reports' as ActiveNavTab,
      label: 'Reports',
      icon: FileSpreadsheet,
      enabled: true,
    },
  ];

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-slate-800 text-white';
      case 'Engineer':
        return 'bg-slate-700 text-white';
      case 'Supervisor':
        return 'bg-slate-600 text-white';
      case 'Operator':
      default:
        return 'bg-slate-200 text-slate-800';
    }
  };

  const { gatewayStatus: statusData } = useConfig();
  const isOnline = Boolean(statusData?.is_connected || statusData?.connected || statusData?.status === "ONLINE");
  const [sqlMode, setSqlMode] = React.useState<SqlStoreForwardMode>('ONLINE');
  const [bufferedCount, setBufferedCount] = React.useState<number>(0);
  const [sqlLatency, setSqlLatency] = React.useState<number | null>(null);
  const [odooStatus, setOdooStatus] = React.useState<'SYNCED' | 'DISCONNECTED'>('DISCONNECTED');
  const [activeAlarms, setActiveAlarms] = React.useState<any[]>([]);
  const [isAcking, setIsAcking] = React.useState<boolean>(false);
  const [bkLogoError, setBkLogoError] = React.useState(false);
  const [titleLogoError, setTitleLogoError] = React.useState(false);

  // Auto-redirect Operators away from Configuration tab
  React.useEffect(() => {
    if (user.role === 'Operator' && activeTab === 'Configuration') {
      onSelectTab('Operations');
    }
  }, [user.role, activeTab, onSelectTab]);

  const handleAckAlarm = async (alarmCode: string) => {
    if (!alarmCode) return;
    setIsAcking(true);
    try {
      await acknowledgeAlarm(alarmCode, user.username || 'operator_01');
      const updated = await getActiveAlarms();
      setActiveAlarms(updated || []);
    } catch (err) {
      console.error('[ALARM] Ack error:', err);
    } finally {
      setIsAcking(false);
    }
  };

  React.useEffect(() => {
    let isMounted = true;
    const checkStatus = async () => {
      const [dbOutcome, odooOutcome, alarmsOutcome] = await Promise.allSettled([
        fetch('/api/db/status').then((res) => (res.ok ? res.json() : null)),
        fetch('/api/erp/odoo/status').then((res) => (res.ok ? res.json() : null)),
        getActiveAlarms(),
      ]);

      if (!isMounted) return;

      // 1. Direct heartbeat check on SQL Server Store-and-Forward via /api/db/status
      if (dbOutcome.status === 'fulfilled' && dbOutcome.value) {
        const dbData = dbOutcome.value;
        const isConnected = Boolean(dbData.sql_connected ?? dbData.connected ?? (dbData.status === 'connected'));
        const count = typeof dbData.buffered_count === 'number' ? dbData.buffered_count : 0;

        let resolvedMode: SqlStoreForwardMode = 'BUFFERING';
        if (dbData.mode === 'ONLINE' || dbData.mode === 'SYNCING' || dbData.mode === 'BUFFERING') {
          resolvedMode = dbData.mode;
        } else if (isConnected && count === 0) {
          resolvedMode = 'ONLINE';
        } else if (isConnected && count > 0) {
          resolvedMode = 'SYNCING';
        } else {
          resolvedMode = 'BUFFERING';
        }

        setSqlMode(resolvedMode);
        setBufferedCount(count);
        setSqlLatency(typeof dbData.latency_ms === 'number' ? Math.round(dbData.latency_ms) : null);
      } else {
        setSqlMode('BUFFERING');
        setSqlLatency(null);
      }

      // 2. Odoo ERP status check
      if (odooOutcome.status === 'fulfilled' && odooOutcome.value) {
        setOdooStatus(odooOutcome.value.connected ? 'SYNCED' : 'DISCONNECTED');
      } else {
        setOdooStatus('DISCONNECTED');
      }

      // 3. ISA-18.2 Active Alarms polling
      if (alarmsOutcome.status === 'fulfilled' && Array.isArray(alarmsOutcome.value)) {
        setActiveAlarms(alarmsOutcome.value);
      } else {
        setActiveAlarms([]);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);



  // Display Auto-Scaling (Compensate for 100% Windows OS display scaling)
  const [zoomFactor, setZoomFactor] = React.useState<number>(() => {
    const saved = localStorage.getItem('mes_zoom_factor');
    return saved ? parseFloat(saved) : 1.18;
  });

  const applyZoom = React.useCallback((factor: number) => {
    const clamped = Math.min(Math.max(factor, 0.9), 1.5);
    const rounded = Math.round(clamped * 100) / 100;
    setZoomFactor(rounded);
    localStorage.setItem('mes_zoom_factor', String(rounded));
    document.documentElement.style.zoom = String(rounded);
    document.documentElement.style.setProperty('--app-zoom', String(rounded));
    if ((window as any).electronAPI?.setZoomFactor) {
      (window as any).electronAPI.setZoomFactor(rounded);
    }
  }, []);

  React.useEffect(() => {
    applyZoom(zoomFactor);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          applyZoom(zoomFactor + 0.08);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          applyZoom(zoomFactor - 0.08);
        } else if (e.key === '0') {
          e.preventDefault();
          applyZoom(1.18);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomFactor, applyZoom]);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 select-none">
      {/* ISA-18.2 Global Active Alarm Banner */}
      {activeAlarms.length > 0 && (() => {
        const latestAlarm = activeAlarms[0];
        const isCritical = (latestAlarm.severity || latestAlarm.Severity || '').toUpperCase() === 'CRITICAL';
        const code = latestAlarm.alarm_code || latestAlarm.AlarmCode || latestAlarm.eventId || 'ALM-UNKNOWN';
        const msg = latestAlarm.message || latestAlarm.Message || 'Process deviation detected';
        const eq = latestAlarm.equipment_id || latestAlarm.EquipmentID || '';
        const time = latestAlarm.trigger_time || latestAlarm.TriggerTime || latestAlarm.triggerTime || '';

        return (
          <div
            role="alert"
            className={`w-full px-4 py-1.5 flex items-center justify-between text-xs font-mono transition-colors border-b select-none ${
              isCritical
                ? 'bg-rose-700 text-white border-rose-800'
                : 'bg-amber-500 text-slate-950 border-amber-600 font-semibold'
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <span className={`px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-xs ${
                isCritical ? 'bg-rose-950 text-rose-200' : 'bg-slate-900 text-amber-300'
              }`}>
                {isCritical ? 'CRITICAL ISA-18.2' : 'WARNING ISA-18.2'}
              </span>
              <div className="flex items-center gap-2 truncate">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${isCritical ? 'text-rose-200 animate-pulse' : 'text-slate-900'}`} />
                <span className="font-bold underline tracking-tight shrink-0">{code}{eq ? ` [${eq}]` : ''}:</span>
                <span className="truncate">{msg}</span>
              </div>
              {time && (
                <span className={`text-[10px] hidden md:inline shrink-0 ${isCritical ? 'text-rose-200' : 'text-slate-800'}`}>
                  Trigger: {time}
                </span>
              )}
              {activeAlarms.length > 1 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-xs shrink-0 font-bold ${
                  isCritical ? 'bg-rose-800 text-white' : 'bg-amber-600 text-white'
                }`}>
                  +{activeAlarms.length - 1} MORE
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                type="button"
                disabled={isAcking}
                onClick={() => handleAckAlarm(code)}
                className={`px-2.5 py-0.5 text-[11px] font-bold uppercase rounded-xs border transition-all active:translate-y-px hallmark-focus ${
                  isCritical
                    ? 'bg-white text-rose-800 border-white hover:bg-rose-100'
                    : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                }`}
                title="Acknowledge Active Alarm (ISA-18.2 Operator Action)"
              >
                {isAcking ? 'XÁC NHẬN...' : 'XÁC NHẬN / ACK'}
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('Reports')}
                className={`px-2 py-0.5 text-[11px] font-medium uppercase rounded-xs border transition-all hover:underline ${
                  isCritical
                    ? 'border-rose-400 text-rose-100 hover:bg-rose-800'
                    : 'border-slate-800 text-slate-900 hover:bg-amber-400'
                }`}
                title="Xem Báo cáo Sự kiện & Cảnh báo Toàn Diện"
              >
                XEM BÁO CÁO →
              </button>
            </div>
          </div>
        );
      })()}

      {/* Top micro-bar: Plant & Gateway + SQL telemetry banner */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-1 flex items-center justify-between text-[11px] text-slate-600">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900 tracking-wider">MES-NODE-01</span>
          <span className="text-slate-300">|</span>
          <span className="font-mono text-slate-600">ISA-95 LEVEL 3 MOM</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">FACILITY: SITE A / PACKAGING LINE 01</span>
        </div>

        {/* Global Live Telemetry: Gateway & SQL Indicators + Auto-Scale Controls */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          {/* Kepware Gateway Status badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 border rounded-xs font-mono text-[11px] font-semibold transition-colors ${
              isOnline
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}
            title={`KEPWARE: ${isOnline ? 'ONLINE' : 'OFFLINE'}`}
          >
            <Network className="w-3.5 h-3.5 shrink-0" />
            <span>KEPWARE:</span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            />
            <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          <span className="text-slate-300">|</span>

          {/* SQL Server Store-and-Forward Status badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 border rounded-xs font-mono text-[11px] font-semibold transition-colors ${
              sqlMode === 'ONLINE'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : sqlMode === 'SYNCING'
                ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
            title={`SQL Server Store-and-Forward: ${sqlMode} (${bufferedCount} buffered)`}
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>SQL:</span>
            {sqlMode === 'ONLINE' && (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
                <span>ONLINE{sqlLatency !== null ? ` (${sqlLatency}ms)` : ''}</span>
              </>
            )}
            {sqlMode === 'BUFFERING' && (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>BUFFERING ({bufferedCount} LOGS)</span>
              </>
            )}
            {sqlMode === 'SYNCING' && (
              <>
                <RefreshCw className="w-3 h-3 shrink-0 animate-spin text-cyan-600" />
                <span>RECOVERING ({bufferedCount})</span>
              </>
            )}
          </div>

          <span className="text-slate-300">|</span>

          {/* Odoo 18 ERP Status badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 border rounded-xs font-mono text-[11px] font-semibold transition-colors ${
              odooStatus === 'SYNCED'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
            title={`Odoo 18 ERP (Port 8069): ${odooStatus}`}
          >
            <Boxes className="w-3.5 h-3.5 shrink-0" />
            <span>ODOO:</span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                odooStatus === 'SYNCED' ? 'bg-emerald-600' : 'bg-slate-400'
              }`}
            />
            <span>{odooStatus}</span>
          </div>

          <span className="text-slate-300">|</span>

          {/* Display Auto-Scale Selector */}
          <div className="flex items-center gap-1.5" title="Auto-scale UI for 100% OS scale (Hotkeys: Ctrl +, Ctrl -, Ctrl 0)">
            <span className="text-slate-500">SCALE:</span>
            <div className="flex items-center border border-slate-300 bg-white">
              <button
                type="button"
                onClick={() => applyZoom(1.0)}
                className={`px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
                  Math.abs(zoomFactor - 1.0) < 0.04
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="100% Native Scale"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => applyZoom(1.18)}
                className={`px-1.5 py-0.5 text-[10px] font-mono transition-colors border-x border-slate-200 ${
                  Math.abs(zoomFactor - 1.18) < 0.04
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="118% Recommended for 100% Display Scale"
              >
                118%
              </button>
              <button
                type="button"
                onClick={() => applyZoom(1.25)}
                className={`px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
                  Math.abs(zoomFactor - 1.25) < 0.04
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="125% High Legibility Scale"
              >
                125%
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="px-4 h-16 flex items-center justify-between border-b border-slate-200 bg-white">
        {/* Brand / Title & Primary Nav */}
        <div className="flex items-center gap-5 xl:gap-7">
          {/* Integrated Dual-Logo Brand Cluster (Click to navigate to Operations Home) */}
          <button
            type="button"
            onClick={() => onSelectTab('Operations')}
            className="flex items-center gap-3 px-1.5 py-1 rounded-xs transition-opacity hover:opacity-90 active:translate-y-px hallmark-focus text-left cursor-pointer group shrink-0"
            title="MES Home · Dispatcher & Real-time Operations (Click to Navigate)"
            aria-label="Navigate to Operations Home"
          >
            {/* Component A: University Insignia (HCMUT / Bách Khoa) */}
            <div className="h-10 min-w-[40px] flex items-center justify-center shrink-0">
              {!bkLogoError ? (
                <img
                  src="./assets/logo_bk.png"
                  alt="Ho Chi Minh City University of Technology"
                  className="h-10 w-auto object-contain filter drop-shadow-sm select-none"
                  onError={() => setBkLogoError(true)}
                />
              ) : (
                <div className="h-10 px-2.5 flex items-center justify-center bg-slate-100 border border-slate-300 text-slate-800 font-mono font-bold text-xs tracking-wider rounded-xs select-none">
                  HCMUT
                </div>
              )}
            </div>

            {/* Component B: Subtle Divider */}
            <div className="h-7 w-[1px] bg-slate-300 mx-1 shrink-0" aria-hidden="true" />

            {/* Component C: System Identity Logo & Micro-Context */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="h-10 min-w-[50px] flex items-center justify-center shrink-0">
                {!titleLogoError ? (
                  <img
                    src="./assets/logo_title.png"
                    alt="MES System Identity"
                    className="h-10 w-auto max-w-[260px] object-contain select-none"
                    onError={() => setTitleLogoError(true)}
                  />
                ) : (
                  <span className="font-bold text-slate-900 text-sm tracking-tight uppercase select-none">
                    DAIRY BATCH MES
                  </span>
                )}
              </div>
              <div className="hidden xl:flex flex-col justify-center border-l border-slate-200 pl-2.5 shrink-0">
                <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase whitespace-nowrap font-semibold leading-none">
                  ISA-88 / ISA-95 LEVEL 3 MOM
                </span>
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider leading-tight mt-0.5 whitespace-nowrap">
                  INDUSTRIAL WORKBENCH
                </span>
              </div>
            </div>
          </button>



          {/* Modules Navigation Links */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              if (item.enabled) {
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id as ActiveNavTab)}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all hallmark-focus active:translate-y-px ${
                      isActive
                        ? 'border-slate-900 text-slate-900 bg-slate-50'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-slate-700" />
                    <span>{item.label}</span>
                  </button>
                );
              }

              // Disabled / Operator RBAC Restricted / Future Placeholders
              const isRbacRestricted = item.id === 'Configuration' && user.role === 'Operator';
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-400 cursor-not-allowed border-b-2 border-transparent select-none opacity-60"
                  title={
                    isRbacRestricted
                      ? 'Tài khoản Operator bị hạn chế: Cần quyền Admin/Engineer để cấu hình phần cứng và Gateway'
                      : 'Placeholder: Module planned for future release'
                  }
                >
                  <Icon className="w-3.5 h-3.5 text-slate-300" />
                  <span>{item.label}</span>
                  <span className={`text-[9px] px-1 py-0.2 border font-mono ml-1 ${
                    isRbacRestricted
                      ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {isRbacRestricted ? 'LOCKED (RBAC)' : 'SOON'}
                  </span>
                </div>
              );
            })}
          </nav>
        </div>

        {/* User Identity & Logout Action */}
        <div className="flex items-center gap-3">
          {/* AI Copilot Persistent Button */}
          {onToggleAiDrawer && (
            <button
              type="button"
              onClick={onToggleAiDrawer}
              className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-mono font-semibold transition-all hallmark-focus active:translate-y-px rounded-xs ${
                isAiDrawerOpen
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 hover:border-slate-400'
              }`}
              title="Mở Trợ lý Vận hành MES AI Copilot (OpenRouter)"
            >
              <div className="relative flex items-center justify-center">
                <Bot className={`w-4 h-4 ${isAiDrawerOpen ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <span className="tracking-wider">AI COPILOT</span>
            </button>
          )}

          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="w-7 h-7 bg-slate-100 border border-slate-300 rounded-xs flex items-center justify-center text-slate-600">
              <UserIcon className="w-4 h-4" />
            </div>

            <div className="text-left">
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                <span>{user.name}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 uppercase font-medium rounded-xs ${getRoleBadgeStyle(user.role)}`}>
                  {user.role}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                USER: {user.username} {user.employeeId && `• ID: ${user.employeeId}`}
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition-all hallmark-focus active:translate-y-px rounded-xs"
            title="End Session and Log Out"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-600" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
