/* Hallmark · component: OpcGatewayConfigCard · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { 
  Server, 
  ShieldCheck, 
  Settings2, 
  Network, 
  RefreshCw, 
  Power, 
  Save, 
  Link2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  User,
  KeyRound
} from 'lucide-react';
import { 
  getGatewayConfig, 
  testGatewayHandshake, 
  updateGatewayConfig, 
  connectGateway, 
  disconnectGateway 
} from '../../services/api';
import { useConfig } from '../../context/ConfigContext';

export const OpcGatewayConfigCard: React.FC = () => {
  const { gatewayStatus: statusData, refreshGatewayStatus } = useConfig();
  const isOnline = Boolean(statusData?.is_connected || statusData?.connected || statusData?.status === "ONLINE");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [endpointUrl, setEndpointUrl] = useState('opc.tcp://127.0.0.1:49320');
  const [providerName, setProviderName] = useState('KEPServerEX v6 - Industrial Connectivity Platform');
  const [timeoutMs, setTimeoutMs] = useState(3000);
  const [samplingIntervalMs, setSamplingIntervalMs] = useState(100);
  const [securityPolicy, setSecurityPolicy] = useState('None');
  const [authMode, setAuthMode] = useState<'anonymous' | 'username'>('anonymous');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isHandshaking, setIsHandshaking] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Fetch initial config from backend so settings persist across reboots
  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const cfg = await getGatewayConfig();
        if (isMounted && cfg) {
          if (cfg.endpoint) setEndpointUrl(cfg.endpoint);
          if (cfg.timeout_ms) setTimeoutMs(cfg.timeout_ms);
          if (cfg.sampling_interval_ms || cfg.sampling_rate_ms) {
            setSamplingIntervalMs(cfg.sampling_interval_ms || cfg.sampling_rate_ms || 100);
          }
          if (cfg.provider_name) setProviderName(cfg.provider_name);
          if (cfg.security_policy) setSecurityPolicy(cfg.security_policy);
          if (cfg.auth_mode === 'username' || cfg.auth_mode === 'anonymous') {
            setAuthMode(cfg.auth_mode);
          }
          if (cfg.username) setUsername(cfg.username);
          if (typeof cfg.connected === 'boolean') {
            refreshGatewayStatus();
          }
        }
      } catch (err) {
        console.debug('Initial gateway config fetch:', err);
      }
    };
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  // Check Gateway Health from Python Backend
  const checkGatewayStatus = async (showToast = false) => {
    setIsLoading(true);
    try {
      const data = await refreshGatewayStatus();
      const online = Boolean(data?.is_connected || data?.connected || data?.status === 'ONLINE');
      if (online) {
        setLatencyMs(data?.latency_ms || 0);
        if (showToast) {
          setFeedback({
            type: 'success',
            message: `Kepware Gateway Online · Active Nodes: ${data?.active_tags || 0}${data?.latency_ms ? ` · Ping: ${data.latency_ms}ms` : ''}`
          });
        }
      } else {
        if (showToast) {
          setFeedback({
            type: 'error',
            message: 'Kepware runtime offline. Ensure KEPServerEX service is running on port 49320.'
          });
        }
      }
    } catch {
      if (showToast) {
        setFeedback({
          type: 'error',
          message: 'Handshake failed: Python Gateway backend unreachable (Check port 8000).'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkGatewayStatus(false);
    const interval = setInterval(() => checkGatewayStatus(false), 4000);
    return () => clearInterval(interval);
  }, []);

  const normalizeEndpoint = (raw: string): string => {
    let ep = (raw || '').trim();
    if (!ep) return 'opc.tcp://127.0.0.1:49320';
    if (!ep.startsWith('opc.tcp://')) {
      ep = `opc.tcp://${ep}`;
    }
    const body = ep.replace('opc.tcp://', '');
    if (!body.includes(':')) {
      ep = `${ep}:49320`;
    }
    return ep;
  };

  const handleTestHandshake = async () => {
    setFeedback(null);
    setIsHandshaking(true);
    const targetUrl = normalizeEndpoint(endpointUrl);
    setEndpointUrl(targetUrl);
    try {
      const res = await testGatewayHandshake(targetUrl, timeoutMs);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `OPC UA Handshake Verified: Successfully reached ${targetUrl}`
        });
      } else {
        setFeedback({
          type: 'error',
          message: `Handshake Failed: ${res.error || 'Connection timed out or refused.'}`
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Handshake Failed: ${err?.message || 'Server error or network unreachable.'}`
      });
    } finally {
      setIsHandshaking(false);
    }
  };

  const handleToggleConnect = async () => {
    setFeedback(null);
    setIsLoading(true);
    if (isOnline) {
      try {
        await disconnectGateway();
        await refreshGatewayStatus();
        setFeedback({ type: 'info', message: 'OPC UA Session disconnected by operator.' });
      } catch (err: any) {
        await refreshGatewayStatus();
        setFeedback({ type: 'error', message: `Disconnection error: ${err?.message || 'Failed'}` });
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsConnecting(true);
      const targetUrl = normalizeEndpoint(endpointUrl);
      setEndpointUrl(targetUrl);
      try {
        const res = await connectGateway(targetUrl);
        const connSuccess = Boolean(
          res?.success && 
          (res?.status === 'ONLINE' || res?.connected || res?.is_connected || res?.status === 'connected')
        );
        // Immediate re-fetch so that Configuration badge, Global Header badge, and ISA-88 badge all transition synchronously to ONLINE
        const freshStatus = await refreshGatewayStatus();
        const freshOnline = Boolean(
          freshStatus?.is_connected || freshStatus?.connected || freshStatus?.status === 'ONLINE'
        );
        if (connSuccess || freshOnline) {
          setFeedback({ type: 'success', message: `Đã kết nối thành công tới OPC UA Gateway: ${targetUrl}` });
        } else {
          setFeedback({ type: 'error', message: `Kết nối thất bại: ${res?.error || 'Target server unreachable.'}` });
        }
      } catch (err: any) {
        await refreshGatewayStatus();
        setFeedback({ type: 'error', message: `Kết nối thất bại: ${err?.message || 'Network error'}` });
      } finally {
        setIsConnecting(false);
        setIsLoading(false);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsSaving(true);
    const targetUrl = normalizeEndpoint(endpointUrl);
    setEndpointUrl(targetUrl);
    try {
      const res = await updateGatewayConfig({
        endpoint: targetUrl,
        timeout_ms: timeoutMs,
        sampling_rate_ms: samplingIntervalMs,
        sampling_interval_ms: samplingIntervalMs,
        provider_name: providerName,
        security_policy: securityPolicy,
        auth_mode: authMode,
        username: authMode === 'username' ? username : '',
        password: authMode === 'username' ? password : '',
      });
      await refreshGatewayStatus();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Đã lưu cấu hình Kepware (${targetUrl}) vào file backend và kích hoạt kết nối.`
        });
      } else {
        setFeedback({
          type: 'error',
          message: `Lỗi khi lưu cấu hình: ${res.error || 'Server error'}`
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Lỗi khi lưu cấu hình: ${err?.message || 'Network error'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      title="OPC UA INDUSTRIAL SERVER GATEWAY (KEPWARE)"
      subtitle="ISA-95 Level 3 MOM Centralized Connectivity Hub · Pure Infrastructure"
      tag="KEPSERVEREX"
      headerAction={
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('mes-open-kepware-scanner'))}
            className="h-7 px-2.5 bg-sky-600 hover:bg-sky-500 text-white border border-sky-700 font-bold flex items-center gap-1.5 rounded-sm transition-colors"
            title="Quét Cây Dữ Liệu Kepware (Browse & Import)"
          >
            <span>🔍 Quét Cây Dữ Liệu Kepware (Browse & Import)</span>
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('mes-toggle-pinned-palette'))}
            className="h-7 px-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold flex items-center gap-1.5 rounded-sm transition-colors"
            title="Ghim Kho Tag Kéo-Thả lên màn hình"
          >
            <span>📌 Kho Tag Ghim</span>
          </button>
          {isConnecting ? (
            <span className="h-7 px-2.5 bg-sky-50 text-sky-800 border border-sky-300 font-bold flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
              CONNECTING...
            </span>
          ) : isOnline ? (
            <span className="h-7 px-2.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block animate-pulse" />
              ● ONLINE (Kepware Port 49320)
            </span>
          ) : (
            <span className="h-7 px-2.5 bg-rose-50 text-rose-800 border border-rose-300 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600 inline-block" />
              ● OFFLINE
            </span>
          )}
        </div>
      }
      footer={
        <div className="w-full flex flex-wrap items-center justify-between text-xs text-slate-500 font-mono gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1">
              <Settings2 className="w-3.5 h-3.5 text-slate-400" />
              SAMPLING: {samplingIntervalMs}ms
            </span>
            <span>TIMEOUT: {timeoutMs}ms</span>
            <span>LATENCY: {statusData?.latency_ms ?? latencyMs}ms</span>
          </div>
          <div>
            <span>PROTOCOL: OPC UA (TCP Binary / Port 49320)</span>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-5">
        {/* Operational Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 text-xs flex items-center justify-between gap-2 font-mono border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : feedback.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-sky-50 border-sky-300 text-sky-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
              )}
              <span className="font-semibold">{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] underline uppercase tracking-wider text-slate-500 hover:text-slate-800 ml-4 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2"
            >
              DISMISS
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Endpoint URL - Dynamic & Editable */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Endpoint URL (Địa chỉ IP / Host máy Kepware)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                Lưu vào gateway_config.json backend & kết nối động
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="VD: 192.168.0.100 hoặc opc.tcp://192.168.0.100:49320"
                className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2"
                required
              />
              <button
                type="button"
                onClick={() => setEndpointUrl('opc.tcp://127.0.0.1:49320')}
                className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] font-semibold border border-slate-300 rounded-xs whitespace-nowrap active:translate-y-px"
                title="Khôi phục địa chỉ local mặc định"
              >
                Localhost
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 font-mono">
              Nhập IP máy Kepware ngoại vi (VD: <span className="font-bold text-slate-800">192.168.0.100</span>). Hệ thống tự chuẩn hóa thành <span className="font-bold text-slate-800">opc.tcp://192.168.0.100:49320</span> và lưu cấu hình cố định trên backend.
            </p>
          </div>

          {/* Provider Name */}
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span>Provider Name</span>
            </label>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2"
              required
            />
          </div>

          {/* Security Policy */}
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Security Policy</span>
            </label>
            <select
              value={securityPolicy}
              onChange={(e) => setSecurityPolicy(e.target.value)}
              className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2"
            >
              <option value="None">None (Local Loopback / Direct)</option>
              <option value="Basic256Sha256">Basic256Sha256 - Sign & Encrypt</option>
              <option value="Aes128_Sha256_RsaOaep">Aes128_Sha256_RsaOaep</option>
            </select>
          </div>

          {/* Connection Timing Parameters */}
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2"
              required
            />
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Sampling Interval (ms)
            </label>
            <input
              type="number"
              value={samplingIntervalMs}
              onChange={(e) => setSamplingIntervalMs(Number(e.target.value))}
              className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2"
              required
            />
          </div>

          {/* Authentication Mode */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Authentication Mode</span>
            </label>
            <div className="flex items-center gap-6 h-9">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-800">
                <input
                  type="radio"
                  name="opcAuthMode"
                  value="anonymous"
                  checked={authMode === 'anonymous'}
                  onChange={() => setAuthMode('anonymous')}
                  className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-800"
                />
                <span>Anonymous / Guest</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-800">
                <input
                  type="radio"
                  name="opcAuthMode"
                  value="username"
                  checked={authMode === 'username'}
                  onChange={() => setAuthMode('username')}
                  className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-800"
                />
                <span>Username & Password</span>
              </label>
            </div>
          </div>

          {/* Credentials */}
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Username</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={authMode === 'anonymous'}
              placeholder={authMode === 'anonymous' ? 'Anonymous' : 'Enter username'}
              className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
              <span>Password</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={authMode === 'anonymous'}
              placeholder={authMode === 'anonymous' ? '••••••••' : 'Enter password'}
              className="w-full h-9 font-mono text-xs border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>

        {/* 8-State Interactive Action Buttons */}
        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTestHandshake}
            disabled={isHandshaking || isLoading || isSaving}
            className="h-9 px-4 bg-white border border-slate-300 hover:bg-slate-100 active:translate-y-px text-slate-800 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 focus:outline-2 focus:outline-sky-600 focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isHandshaking ? (
              <RefreshCw className="w-4 h-4 text-sky-600 animate-spin" />
            ) : (
              <Network className="w-4 h-4 text-slate-600" />
            )}
            <span>{isHandshaking ? 'TESTING HANDSHAKE...' : 'TEST HANDSHAKE'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleConnect}
            disabled={isHandshaking || isLoading || isSaving || isConnecting}
            className={`h-9 px-4 text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-2 active:translate-y-px focus:outline-2 focus:outline-sky-600 focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              isOnline
                ? 'bg-slate-700 hover:bg-slate-800'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isConnecting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            <span>
              {isOnline
                ? 'DISCONNECT GATEWAY'
                : isConnecting
                ? 'CONNECTING...'
                : 'CONNECT GATEWAY'}
            </span>
          </button>

          <button
            type="submit"
            disabled={isHandshaking || isLoading || isSaving}
            className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-2 active:translate-y-px focus:outline-2 focus:outline-sky-600 focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? 'SAVING...' : 'SAVE SETTINGS'}</span>
          </button>
        </div>
      </form>
    </Card>
  );
};

export default OpcGatewayConfigCard;
