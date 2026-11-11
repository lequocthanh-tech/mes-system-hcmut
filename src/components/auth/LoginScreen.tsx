/* Hallmark · component: LoginScreen · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/auth';
import { Shield, Lock, User as UserIcon, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import { loginUser } from '../../services/api';

interface RolePreset {
  role: UserRole;
  label: string;
  desc: string;
  defaultUser: string;
  defaultPass: string;
  clearance: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    role: 'Admin',
    label: 'Admin',
    desc: 'System Config & Full Clearance',
    defaultUser: 'admin',
    defaultPass: 'admin123',
    clearance: 'ADMIN',
  },
  {
    role: 'Engineer',
    label: 'Engineer',
    desc: 'Equipment Tuning & Node Mapping',
    defaultUser: 'eng_tranduc',
    defaultPass: 'eng123',
    clearance: 'ENGINEER',
  },
  {
    role: 'Supervisor',
    label: 'Supervisor',
    desc: 'Batch Authorization & QA Signoff',
    defaultUser: 'qa_supervisor_01',
    defaultPass: 'sup123',
    clearance: 'SUPERVISOR',
  },
  {
    role: 'Operator',
    label: 'Operator',
    desc: 'Line Dispatch & Execution Control',
    defaultUser: 'operator_01',
    defaultPass: 'op123',
    clearance: 'OPERATOR',
  },
];

const AUTHORIZED_CREDENTIALS: Record<string, { pass: string; role: UserRole; name: string }> = {
  admin: { pass: 'admin123', role: 'Admin', name: 'System Administrator' },
  eng_tranduc: { pass: 'eng123', role: 'Engineer', name: 'Trần Đức (Lead Process Architect)' },
  engineer_lead: { pass: 'eng123', role: 'Engineer', name: 'Controls & Automation Engineer' },
  qa_supervisor_01: { pass: 'sup123', role: 'Supervisor', name: 'QA Lead Inspector' },
  supervisor_01: { pass: 'sup123', role: 'Supervisor', name: 'Shift Production Supervisor' },
  operator_01: { pass: 'op123', role: 'Operator', name: 'Shift 1 Line Operator' },
};

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('admin123');
  const [role, setRole] = useState<UserRole>('Admin');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [bkLogoError, setBkLogoError] = useState<boolean>(false);
  const [titleLogoError, setTitleLogoError] = useState<boolean>(false);

  React.useEffect(() => {
    // Notify Electron main process that LoginScreen has mounted and painted
    requestAnimationFrame(() => {
      window.electronAPI?.sendAppMounted?.();
    });
  }, []);

  const handleSelectPreset = (preset: RolePreset) => {
    setRole(preset.role);
    setUsername(preset.defaultUser);
    setPassword(preset.defaultPass);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setErrorMessage('Invalid operator credentials or role mismatch.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Authenticate against SQL Server dbo.Users via /api/auth/login
      const res = await loginUser({ username: cleanUser, password: cleanPass, role });
      if (res && res.status === 'success') {
        const userRole = (res.role || role) as UserRole;
        try {
          localStorage.setItem('mes_auth_user', JSON.stringify({
            username: res.username,
            role: userRole,
            fullName: res.fullName,
            userId: res.userId,
            assignedFacility: res.assignedFacility,
          }));
        } catch {}
        await login(res.username, userRole, res.fullName);
        return;
      }
    } catch (err: any) {
      const errMsg = err?.message || '';
      // If server specifically rejected with 403 (suspended) or 401 (bad credentials), surface the real server rejection
      if (errMsg.includes('thu hồi') || errMsg.includes('Suspended') || errMsg.includes('403') || errMsg.includes('deactivated')) {
        setErrorMessage(errMsg.replace(/^Request failed with status \d+:\s*/, ''));
        setIsLoading(false);
        return;
      }
      if (errMsg.includes('không chính xác') || errMsg.includes('401') || errMsg.includes('Invalid') || errMsg.includes('not found')) {
        setErrorMessage(errMsg.replace(/^Request failed with status \d+:\s*/, ''));
        setIsLoading(false);
        return;
      }

      // 2. Graceful offline fallback only if backend server is unreachable
      console.warn('[AUTH] Backend offline or unreachable, evaluating local authorized credentials fallback...');
      const cred = AUTHORIZED_CREDENTIALS[cleanUser];
      if (cred && cred.pass === cleanPass && cred.role === role) {
        try {
          localStorage.setItem('mes_auth_user', JSON.stringify({
            username: cleanUser,
            role: cred.role,
            fullName: cred.name,
          }));
        } catch {}
        await login(cleanUser, role, cred.name);
        return;
      }

      setErrorMessage('Invalid operator credentials or role mismatch.');
    } finally {
      setIsLoading(false);
    }
  };

  const activePreset = ROLE_PRESETS.find((p) => p.role === role) || ROLE_PRESETS[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 selection:bg-slate-300">
      {/* Top Banner */}
      <div className="w-full max-w-md mb-3 flex items-center justify-between text-xs text-slate-500 font-mono">
        <span>ISA-95 LEVEL 3 MOM</span>
        <span>SECURITY GATEWAY • NODE MES-SRV-01</span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 shadow-md p-8">
        {/* Dual-Brand Header Block with Academic & Facility Stamp */}
        <div className="pb-5 border-b border-slate-200">
          <div className="flex items-center justify-center">
            {/* University Logo */}
            <div className="h-14 min-w-[56px] flex items-center justify-center shrink-0">
              {!bkLogoError ? (
                <img
                  src="./assets/logo_bk.png"
                  alt="Ho Chi Minh City University of Technology"
                  className="h-14 w-auto max-w-[85px] object-contain filter drop-shadow-sm select-none"
                  onError={() => setBkLogoError(true)}
                />
              ) : (
                <div className="h-14 px-3 flex items-center justify-center bg-slate-100 border border-slate-300 text-slate-800 font-mono font-bold text-sm tracking-wider rounded-xs select-none">
                  HCMUT
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-10 w-[1px] bg-slate-300 mx-3 shrink-0" aria-hidden="true" />

            {/* System Title Logo */}
            <div className="h-12 min-w-[80px] flex items-center justify-center shrink-0">
              {!titleLogoError ? (
                <img
                  src="./assets/logo_title.png"
                  alt="MES System Identity"
                  className="h-12 w-auto max-w-[210px] object-contain select-none"
                  onError={() => setTitleLogoError(true)}
                />
              ) : (
                <div className="h-12 px-3 flex items-center justify-center bg-slate-100 border border-slate-300 text-slate-900 font-mono font-bold text-sm tracking-tight uppercase rounded-xs select-none">
                  DAIRY BATCH MES
                </div>
              )}
            </div>
          </div>

          {/* Academic & Facility Stamp */}
          <div className="mt-3 text-center">
            <p className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
              Ho Chi Minh City University of Technology (HCMUT)
            </p>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
              Faculty of Electrical & Electronics Engineering · Automation Dept
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-mono font-semibold text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ISA-95 LEVEL 3 MOM SECURITY GATEWAY · NODE: MES-SRV-01
            </div>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 rounded-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Quick Role Preset Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Operator Role (Quick Credentials Preset)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_PRESETS.map((item) => {
                const isSelected = role === item.role;
                return (
                  <button
                    type="button"
                    key={item.role}
                    onClick={() => handleSelectPreset(item)}
                    className={`p-2 text-left border text-xs transition-all flex flex-col justify-between rounded-xs hallmark-focus active:translate-y-px ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white font-medium shadow-xs'
                        : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold">{item.label}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <span className={`text-[10px] mt-1 leading-tight ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter authorized username"
                className="w-full h-9 pl-9 pr-3 text-sm font-mono border border-slate-300 rounded-xs bg-white hallmark-focus text-slate-900"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full h-9 pl-9 pr-3 text-sm font-mono border border-slate-300 rounded-xs bg-white hallmark-focus text-slate-900"
                required
              />
            </div>
          </div>

          {/* Active Clearance Indicator */}
          <div className="p-2 bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between rounded-xs">
            <span className="font-mono text-[11px]">Security Clearance:</span>
            <span className="font-semibold text-slate-900 uppercase font-mono tracking-wider">
              {activePreset.clearance}
            </span>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hallmark-focus active:translate-y-px rounded-xs transition-all shadow-xs disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verifying Security Credentials...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>AUTHENTICATE & ENTER SYSTEM</span>
              </>
            )}
          </button>
        </form>

        {/* Audit & Compliance Disclaimer */}
        <div className="mt-5 pt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <p>
            Authorized industrial automation personnel only. All access events and configuration changes are logged under ISA-95 Level 3 audit compliance.
          </p>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 text-center text-xs text-slate-500 font-mono">
        <span>ISA-101 High-Performance HMI • Industrial Workbench Standard</span>
      </div>
    </div>
  );
};

export default LoginScreen;
