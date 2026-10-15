import { redactSensitiveLog } from './utils/redaction';
import { apiFetch as fetch } from './services/apiClient';
import React, { useState } from 'react';
import {
  X,
  Lock,
  KeyRound,
  Mail,
  User,
  Phone,
  Building2,
  Landmark,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Briefcase,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import type { BusinessBranch, UserSession } from './App';

interface AuthModalProps {
  currentUser: UserSession;
  onAuthSuccess: (user: UserSession) => void | Promise<void>;
  requiredAuth?: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export function AuthModal({
  currentUser,
  onAuthSuccess,
  onClose,
  initialMode = 'login',
  requiredAuth = false,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Login Form States
  const [loginIdentifier, setLoginIdentifier] = useState(currentUser.email || '');
  const [loginPassword, setLoginPassword] = useState('');

  // Register Form States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regBranch, setRegBranch] = useState<BusinessBranch>('office');
  const [regRoleTitle, setRegRoleTitle] = useState('Kế toán trưởng & QL Vận hành');

  // Fast switch list of saved local accounts (if any)
  const [savedAccounts, setSavedAccounts] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem('applet_registered_accounts');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  const handleBranchSelect = (b: BusinessBranch) => {
    setRegBranch(b);
    if (b === 'office') {
      setRegRoleTitle('Kế toán trưởng & QL Vận hành');
    } else if (b === 'banking') {
      setRegRoleTitle('Chuyên viên Tín dụng & QLRR');
    } else {
      setRegRoleTitle('Giám đốc Tài chính CFO & Ban Giám đốc');
    }
  };

  const handleQuickSelectAccount = (acc: any) => {
    setLoginIdentifier(acc.email || acc.phone);
    setLoginPassword('');
    setErrorMessage(null);
    setSuccessMessage(`Đã chọn tài khoản: ${acc.name}`);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { signInWithGoogle } = await import('./firebase');
      const gUser = await signInWithGoogle();
      const token = await gUser.getIdToken();
      const verifiedUser: UserSession = {
        id: gUser.uid,
        name: gUser.displayName || gUser.email?.split('@')[0] || 'Chuyên viên VeriFin',
        email: gUser.email || '',
        phone: gUser.phoneNumber || '',
        branch: 'all',
        roleTitle: 'Chuyên viên Xác thực Google',
        token,
        loginAt: new Date().toISOString(),
      };

      setSuccessMessage('Đang xác thực phiên Google với máy chủ…');
      await onAuthSuccess(verifiedUser);
      onClose();
    } catch (err: any) {
      console.error('Google Sign-In error:', redactSensitiveLog(err));
      setErrorMessage(err.message || 'Lỗi khi đăng nhập bằng Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrPhone: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đăng nhập không thành công.');
      }

      const verifiedUser: UserSession = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        branch: data.user.branch,
        roleTitle: data.user.roleTitle,
        token: data.user.token,
        loginAt: data.user.loginAt || new Date().toISOString(),
      };

      // Save user session and token

      setSuccessMessage('Đang xác thực phiên tài khoản với máy chủ…');
      await onAuthSuccess(verifiedUser);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối máy chủ xác thực.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Frontend validations
    if (!regName.trim()) {
      setErrorMessage('Vui lòng nhập họ và tên của bạn.');
      setLoading(false);
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.');
      setLoading(false);
      return;
    }
    if (regPassword.length < 6) {
      setErrorMessage('Mật khẩu phải có tối thiểu 6 ký tự.');
      setLoading(false);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không trùng khớp.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim(),
          password: regPassword,
          branch: regBranch,
          roleTitle: regRoleTitle.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đăng ký tài khoản không thành công.');
      }

      const verifiedUser: UserSession = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        phone: data.user.phone,
        branch: data.user.branch,
        roleTitle: data.user.roleTitle,
        token: data.user.token,
        loginAt: data.user.loginAt || new Date().toISOString(),
      };

      // Save to saved accounts list for device
      const updatedAccounts = [
        ...savedAccounts.filter((a) => a.email !== verifiedUser.email),
        {
          name: verifiedUser.name,
          email: verifiedUser.email,
          phone: verifiedUser.phone,
          roleTitle: verifiedUser.roleTitle,
          branch: verifiedUser.branch,
        },
      ];
      setSavedAccounts(updatedAccounts);
      try {
        localStorage.setItem('applet_registered_accounts', JSON.stringify(updatedAccounts));
      } catch {}

      setSuccessMessage('Đã tạo tài khoản. Đang xác thực phiên với máy chủ…');
      await onAuthSuccess(verifiedUser);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi đăng ký tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Hệ Thống Đăng Nhập & Đăng Ký Tài Khoản
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Xác thực người dùng, lưu phiên làm việc bảo mật và tự động phân quyền nghiệp vụ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            hidden={requiredAuth}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle: Đăng Nhập / Đăng Ký */}
        <div className="px-6 pt-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`pb-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
                mode === 'login'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>1. Đăng Nhập Tài Khoản</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`pb-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
                mode === 'register'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-4 h-4" />
              <span>2. Đăng Ký Tài Khoản Mới</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Mới
              </span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-center gap-2.5 shadow-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-xs flex items-center gap-2.5 shadow-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="leading-relaxed">{successMessage}</span>
            </div>
          )}

          {/* Google Sign-In with Firebase Auth */}
          <div className="space-y-3 pb-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-3 rounded-2xl text-xs flex items-center justify-center gap-3 transition shadow-lg shadow-black/25 border border-slate-200 active:scale-[0.99]"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Đăng nhập nhanh bằng Google (Firebase Auth)</span>
            </button>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                hoặc xác thực nội bộ
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
          </div>

          {/* ========================================= */}
          {/* MODE 1: FORM ĐĂNG NHẬP (LOGIN) */}
          {/* ========================================= */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              {/* Quick switch between previously registered accounts on this browser */}
              {savedAccounts.length > 0 && (
                <div className="space-y-2 pb-2 border-b border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Tài khoản khả dụng trên thiết bị này:
                    </span>
                    <span className="text-[10px] text-slate-500">Bấm để điền nhanh</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {savedAccounts.map((acc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuickSelectAccount(acc)}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          loginIdentifier === acc.email || loginIdentifier === acc.phone
                            ? 'bg-slate-800 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/30'
                            : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="text-white font-bold text-xs truncate flex items-center gap-1">
                            <span>{acc.branch === 'office' ? '🏢' : acc.branch === 'banking' ? '🏛️' : '🌐'}</span>
                            <span className="truncate">{acc.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{acc.roleTitle}</div>
                        </div>
                        <span className="text-[9px] text-emerald-400 font-semibold mt-1.5">Chọn tài khoản →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Email / SĐT Input */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Email làm việc hoặc Số điện thoại <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Ví dụ: ntrthientan@gmail.com hoặc 0817221722..."
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white pl-9 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    required
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-semibold">
                    Mật khẩu / Mã PIN bảo mật <span className="text-emerald-400">*</span>
                  </label>

                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Nhập mật khẩu của bạn..."
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white pl-9 pr-10 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline"
                >
                  Chưa có tài khoản? Đăng ký ngay →
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
            hidden={requiredAuth}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition"
                  >
                    Hủy bỏ
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>Đăng Nhập</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ========================================= */}
          {/* MODE 2: FORM ĐĂNG KÝ TÀI KHOẢN MỚI */}
          {/* ========================================= */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Họ và tên */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Họ và tên của bạn <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn An"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-white pl-8 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                      required
                    />
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Số điện thoại */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Số điện thoại liên hệ <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="Ví dụ: 0912345678"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-white pl-8 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                      required
                    />
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Email làm việc <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="an.nguyen@company.com"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-white pl-8 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                      required
                    />
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Chức vụ */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Chức vụ / Phòng ban <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={regRoleTitle}
                      onChange={(e) => setRegRoleTitle(e.target.value)}
                      placeholder="Ví dụ: Kế toán trưởng, Quản trị..."
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-white pl-8 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                      required
                    />
                    <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Mật khẩu (Tối thiểu 6 ký tự) <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-white pl-8 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Xác nhận lại mật khẩu <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-white pl-8 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              {/* Lựa chọn phân hệ chính phụ trách */}
              <div className="space-y-2 pt-1">
                <label className="block text-slate-300 font-semibold">
                  Lựa chọn phân hệ nghiệp vụ chính của bạn:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleBranchSelect('office')}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                      regBranch === 'office'
                        ? 'bg-emerald-950/60 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                        : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                        <Building2 className="w-4 h-4 text-emerald-400" />
                        🏢 Khối Văn Phòng
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Sổ công nợ, ghép file, phiếu lương, bóc đơn Zalo.
                      </p>
                    </div>
                    <div className="text-[9px] text-emerald-300 font-semibold mt-2 pt-1 border-t border-slate-700/60">
                      ✓ Ẩn khối Ngân hàng để đỡ rối
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBranchSelect('banking')}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                      regBranch === 'banking'
                        ? 'bg-amber-950/60 border-amber-500 shadow-md ring-1 ring-amber-500/40'
                        : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                        <Landmark className="w-4 h-4 text-amber-400" />
                        🏛️ Ngân Hàng Pro
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Thẩm định sao kê, CIC, sổ đỏ LTV, tờ trình tín dụng.
                      </p>
                    </div>
                    <div className="text-[9px] text-amber-300 font-semibold mt-2 pt-1 border-t border-slate-700/60">
                      ✓ Nghiệp vụ tín dụng chuyên sâu
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBranchSelect('all')}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                      regBranch === 'all'
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/40'
                        : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-400'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                        <Layers className="w-4 h-4 text-indigo-400" />
                        🌐 Toàn Bộ Nghiệp Vụ
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        CFO, Ban Giám Đốc, Kiểm toán quản lý toàn diện.
                      </p>
                    </div>
                    <div className="text-[9px] text-indigo-300 font-semibold mt-2 pt-1 border-t border-slate-700/60">
                      ✓ Xem toàn bộ 12 Modules
                    </div>
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline"
                >
                  Đã có tài khoản? Đăng nhập →
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
            hidden={requiredAuth}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition"
                  >
                    Hủy bỏ
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Đăng Ký & Đăng Nhập Tự Động</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
