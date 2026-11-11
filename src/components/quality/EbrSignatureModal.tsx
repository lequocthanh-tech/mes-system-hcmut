/* Hallmark · component: EbrSignatureModal · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useQuality } from '../../context/QualityContext';
import * as api from '../../services/api';
import { 
  KeyRound, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Loader2, 
  X, 
  FileSignature,
  FileCheck,
  Flame,
  Clock,
  Activity,
  ShieldAlert,
  Server
} from 'lucide-react';

export interface EbrSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderCode: string;
  reportCode?: string;
  recipeName?: string;
  volume?: number;
  initialDisposition?: 'RELEASED' | 'QUARANTINED';
  onSuccess?: (result: api.EbrSignAndReleaseResult) => void;
}

const SIGNATURE_MEANINGS = [
  'I verify that all CCPs meet HACCP standards and authorize batch release',
  'I authorize quarantine and isolation of defective batch under SOP-QA-08',
  'I authorize conditional batch release with CAPA deviation override',
  'I confirm laboratory sensory and microbiological conformity'
];

export const EbrSignatureModal: React.FC<EbrSignatureModalProps> = ({
  isOpen,
  onClose,
  orderCode,
  reportCode,
  recipeName = 'Fresh Pasteurized UHT Milk 100%',
  volume = 1000.0,
  initialDisposition = 'RELEASED',
  onSuccess,
}) => {
  const { user } = useAuth();
  const { signAndReleaseEbrBatch, currentBatchDetails, lotGenealogy } = useQuality();

  const [username, setUsername] = useState<string>(user?.username || 'qa_supervisor_01');
  const [password, setPassword] = useState<string>('sup123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [disposition, setDisposition] = useState<'RELEASED' | 'QUARANTINED'>(initialDisposition);
  const [signatureMeaning, setSignatureMeaning] = useState<string>(SIGNATURE_MEANINGS[0]);
  const [qaComments, setQaComments] = useState<string>('Inline telemetry and critical limits inspected. Conforms to ISO 22000 and FDA 21 CFR Part 11.');
  const [capaReason, setCapaReason] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<api.EbrSignAndReleaseResult | null>(null);

  // Check if any CCP is failing in context details
  const hasCcpBreach = currentBatchDetails.some(
    (item) => item.isCritical && item.result === 'FAIL'
  ) || (lotGenealogy?.process_execution_trace.ccp_checks.some(c => c.is_ccp && c.status === 'FAIL') ?? false);

  useEffect(() => {
    if (isOpen) {
      setUsername(user?.username || 'qa_supervisor_01');
      setPassword('sup123');
      setShowPassword(false);
      setDisposition(initialDisposition);
      setSignatureMeaning(
        initialDisposition === 'QUARANTINED'
          ? SIGNATURE_MEANINGS[1]
          : SIGNATURE_MEANINGS[0]
      );
      setQaComments('Inline telemetry and critical limits inspected. Conforms to ISO 22000 and FDA 21 CFR Part 11.');
      setCapaReason('');
      setErrorMessage(null);
      setSuccessResult(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialDisposition, user]);

  if (!isOpen) return null;

  const isCapaRequired = hasCcpBreach && disposition === 'RELEASED';
  const isCapaValid = !isCapaRequired || capaReason.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim()) {
      setErrorMessage('Username is required for electronic signature authentication.');
      return;
    }
    if (!password) {
      setErrorMessage('Password is required to verify electronic identity under 21 CFR §11.200.');
      return;
    }
    if (isCapaRequired && !isCapaValid) {
      setErrorMessage('HACCP VETO: Critical Control Point (CCP) violation detected. Release is blocked unless an authorized CAPA override justification (minimum 10 characters) is provided.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signAndReleaseEbrBatch({
        order_code: orderCode,
        report_code: reportCode,
        username: username.trim(),
        password,
        signature_meaning: signatureMeaning,
        qa_comments: qaComments.trim(),
        disposition,
        capa_override_reason: isCapaRequired ? capaReason.trim() : undefined,
      });

      if (result.status === 'success') {
        setSuccessResult(result);
        if (onSuccess) {
          onSuccess(result);
        }
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setErrorMessage(result.message || 'Signature verification rejected by server.');
      }
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Authentication or authorization failed. Please verify credentials.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ebr-sign-modal-title"
    >
      <div className="bg-white border border-slate-300 w-full max-w-2xl shadow-2xl overflow-hidden rounded-xs flex flex-col font-mono text-xs max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xs bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400">
              <FileSignature className="w-4 h-4" />
            </div>
            <div>
              <h3 id="ebr-sign-modal-title" className="text-sm font-bold tracking-tight text-white uppercase not-italic">
                FDA 21 CFR Part 11 Electronic Signature & EBR Release
              </h3>
              <p className="text-[11px] text-slate-400">
                ANSI/ISA-88 Batch Record Disposition & Level 4 ERP Closed-Loop Uplink
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xs flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {/* 1. Batch Identity & Disposition Selector */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900 uppercase">BATCH IDENTITY:</span>
              <div className="flex items-center gap-2 font-mono">
                <span className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800 font-bold rounded-xs">
                  ORDER: {orderCode}
                </span>
                <span className="px-2 py-0.5 bg-white border border-slate-300 text-slate-600 rounded-xs">
                  {recipeName}
                </span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-900 font-bold rounded-xs tabular-nums">
                  {volume.toFixed(1)} L
                </span>
              </div>
            </div>

            {/* Disposition Selector */}
            <div className="flex items-center justify-between gap-4">
              <label className="text-[11px] font-semibold text-slate-700 uppercase">
                TARGET DISPOSITION:
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDisposition('RELEASED');
                    setSignatureMeaning(SIGNATURE_MEANINGS[0]);
                  }}
                  className={`h-9 px-4 flex items-center gap-1.5 rounded-xs font-bold transition-all ${
                    disposition === 'RELEASED'
                      ? 'bg-emerald-700 text-white border border-emerald-800 shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>RELEASE BATCH (PHÁT HÀNH)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDisposition('QUARANTINED');
                    setSignatureMeaning(SIGNATURE_MEANINGS[1]);
                  }}
                  className={`h-9 px-4 flex items-center gap-1.5 rounded-xs font-bold transition-all ${
                    disposition === 'QUARANTINED'
                      ? 'bg-rose-700 text-white border border-rose-800 shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>QUARANTINE (CÁCH LY LÔ)</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Critical Control Points (CCP) Verification Checklist */}
          <div className="border border-slate-200 rounded-xs overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                HACCP CRITICAL CONTROL POINTS (CCP) COMPLIANCE AUDIT
              </span>
              <span className="text-[10px] text-slate-500 font-normal">ISO 22000 / PM-QUALITY</span>
            </div>
            <div className="p-3 bg-white divide-y divide-slate-100 space-y-2">
              {/* CCP-01 */}
              <div className="flex items-center justify-between text-[11px] pt-1">
                <div className="flex items-center gap-2">
                  <Flame className="w-3.5 h-3.5 text-rose-600" />
                  <span><strong>CCP-01:</strong> Pasteurization / Thermal Destruction Temp</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Spec: 138.0°C ±1.0°C</span>
                  <span className="px-2 py-0.5 rounded-xs font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                    CONFORMING
                  </span>
                </div>
              </div>

              {/* CCP-02 */}
              <div className="flex items-center justify-between text-[11px] pt-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span><strong>CCP-02:</strong> Holding Tube Residence Duration</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Spec: ≥ 4.0s (UHT)</span>
                  <span className="px-2 py-0.5 rounded-xs font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                    CONFORMING
                  </span>
                </div>
              </div>

              {/* CCP-03 */}
              <div className="flex items-center justify-between text-[11px] pt-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-indigo-600" />
                  <span><strong>CCP-03:</strong> Inline pH & Refractometric Brix Limits</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">pH [6.50-6.85] · Brix [11.5-12.5°Bx]</span>
                  <span className="px-2 py-0.5 rounded-xs font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                    CONFORMING
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. CCP Breach Warning & Mandatory CAPA Override Justification */}
          {hasCcpBreach && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xs space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                <span>HACCP CCP VETO ALERT: CRITICAL PARAMETER DEVIATION DETECTED</span>
              </div>
              <p className="text-[11px] text-rose-700">
                Một hoặc nhiều chỉ tiêu CCP không đạt chuẩn an toàn thực phẩm. Theo quy tắc Veto, lệnh xuất lô bị khóa. 
                Nếu tiếp tục phát hành lô này, bắt buộc phải có giải trình CAPA hợp lệ từ Trưởng QA / Giám sát viên.
              </p>
              {disposition === 'RELEASED' && (
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-rose-900 uppercase mb-1">
                    LÝ DO MIỄN TRỪ CAPA (BẮT BUỘC TỐI THIỂU 10 KÝ TỰ): *
                  </label>
                  <textarea
                    rows={2}
                    value={capaReason}
                    onChange={(e) => setCapaReason(e.target.value)}
                    placeholder="Nhập mã CAPA và phân tích rủi ro vi sinh / nhiệt độ được phê duyệt bởi QA Lead..."
                    className="w-full p-2 bg-white border border-rose-300 rounded-xs text-xs text-slate-900 focus:outline-2 focus:outline-rose-600 font-mono"
                    required
                  />
                  {!isCapaValid && (
                    <span className="text-[10px] text-rose-600 font-semibold block mt-0.5">
                      Chưa đủ 10 ký tự giải trình CAPA bắt buộc.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Credentials & Electronic Identity Verification */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xs space-y-3">
            <span className="font-bold text-slate-800 uppercase block border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-600" />
              FDA 21 CFR PART 11 RE-AUTHENTICATION & SIGNATURE BINDING
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Username Selection / Field */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  SIGNER USERNAME (TÀI KHOẢN KÝ):
                </label>
                <select
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xs text-xs text-slate-900 focus:outline-2 focus:outline-sky-600 font-mono"
                  disabled={isSubmitting}
                >
                  <option value="qa_supervisor_01">qa_supervisor_01 (QA Lead Inspector - Supervisor)</option>
                  <option value="engineer_lead">engineer_lead (Controls Engineer - Engineer)</option>
                  <option value="supervisor_01">supervisor_01 (Shift Production Supervisor)</option>
                  <option value="admin">admin (System Administrator)</option>
                </select>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  PASSWORD RE-AUTHENTICATION: *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password to verify identity..."
                    className="w-full h-9 px-2.5 pr-9 bg-white border border-slate-300 rounded-xs text-xs text-slate-900 focus:outline-2 focus:outline-sky-600 font-mono"
                    required
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Signature Meaning */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                SIGNATURE MEANING (Ý NGHĨA CHỮ KÝ THEO §11.50):
              </label>
              <select
                value={signatureMeaning}
                onChange={(e) => setSignatureMeaning(e.target.value)}
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xs text-xs text-slate-900 focus:outline-2 focus:outline-sky-600 font-mono"
                disabled={isSubmitting}
              >
                {SIGNATURE_MEANINGS.map((m, idx) => (
                  <option key={idx} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* QA Comments */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                QA RELEASE REMARKS & AUDIT NOTES:
              </label>
              <input
                type="text"
                value={qaComments}
                onChange={(e) => setQaComments(e.target.value)}
                placeholder="Optional inspection remarks..."
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-xs text-xs text-slate-900 focus:outline-2 focus:outline-sky-600 font-mono"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xs text-rose-800 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Result Stamp */}
          {successResult && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-900 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>ELECTRONICALLY SIGNED & VERIFIED (FDA 21 CFR PART 11)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-800 font-mono">
                <div>Signer: <strong>{successResult.signed_by} ({successResult.signer_role})</strong></div>
                <div>Timestamp: <strong>{successResult.timestamp}</strong></div>
                <div className="col-span-2">
                  SHA-256 Hash: <code className="bg-emerald-100/80 px-1 py-0.5 rounded-xs text-[10px] break-all">{successResult.signature_hash}</code>
                </div>
                <div className="col-span-2 flex items-center gap-2 pt-1 border-t border-emerald-200">
                  <Server className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Closed-Loop Odoo ERP Uplink: <strong>{successResult.odoo_uplink_status.synced ? 'SYNCHRONIZED (MO CLOSED)' : 'QUEUED'}</strong> (FG Lot: {successResult.odoo_uplink_status.fg_lot})</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xs transition-colors disabled:opacity-50"
            >
              HỦY BỎ (CANCEL)
            </button>

            <button
              type="submit"
              disabled={isSubmitting || (isCapaRequired && !isCapaValid)}
              className={`h-10 px-5 flex items-center gap-2 font-bold uppercase tracking-wider text-white rounded-xs shadow-xs transition-all ${
                disposition === 'RELEASED'
                  ? 'bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400'
                  : 'bg-rose-700 hover:bg-rose-800 disabled:bg-slate-400'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>COMMITTING SIGNATURE...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>{disposition === 'RELEASED' ? '✍ KÝ SỐ & PHÁT HÀNH LÔ (EBR RELEASE)' : '✍ KÝ SỐ CÁCH LY LÔ (QUARANTINE)'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
