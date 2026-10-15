import { ApiKeyGate } from './components/auth/ApiKeyGate';
import { createEmptyEvidenceEnvelope, evaluateFailClosedGate } from './schemas/evidenceSchema';
import { runDeterministicUnderwritingEngine } from './engine/underwritingDerivations';
import { apiFetch as fetch } from './services/apiClient';
import { redactSensitiveLog } from './utils/redaction';
import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  FileSpreadsheet,
  FileCheck2,
  FileText,
  MessageSquareText,
  Receipt,
  Landmark,
  TrendingUp,
  BellRing,
  Download,
  Upload,
  Copy,
  Check,
  Mail,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  Info,
  ChevronRight,
  RefreshCw,
  Eye,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  Search,
  X,
  FileCode,
  BarChart3,
  PieChart as PieIcon,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Wallet,
  CreditCard,
  Percent,
  Clock,
  AlertOctagon,
  User,
  LogOut,
  Briefcase,
  SlidersHorizontal,
  Users,
  Phone,
  CheckCircle2,
  FolderCheck,
  Home,
  MapPin,
  FileSignature,
  Calculator,
  BookOpen,
  QrCode,
  Lock,
  KeyRound,
  Shield,
  ShieldCheck,
  Bot,
  MessageSquare,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  CartesianGrid,
  ComposedChart,
} from 'recharts';
import { UserGuideModule } from './UserGuideModule';
import { IncomeAssessmentModule } from './IncomeAssessmentModule';
import { CashFlowForecastModule } from './CashFlowForecastModule';
import { BankAccountConfigModule, formatTransferSyntax } from './BankAccountConfigModule';
import { CreatorCoffeeCard, CreatorCoffeeModal } from './CreatorCoffeeCard';
import { AuthModal } from './AuthModal';
import { GeminiChatbotModule } from './GeminiChatbotModule';
import { auth, signInWithGoogle, logOutFirebase } from './firebase';

export type BusinessBranch = 'office' | 'banking' | 'all';

export type TabKey =
  | 'dashboard'
  | 'chat'
  | 'guide'
  | 'bank_account'
  | 'debt'
  | 'reconcile'
  | 'payslip'
  | 'orders'
  | 'documents'
  | 'cashflow'
  | 'statement'
  | 'cic'
  | 'portfolio'
  | 'collateral'
  | 'proposal'
  | 'income';

export interface UserSession {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  branch: BusinessBranch;
  roleTitle: string;
  token?: string;
  loginAt?: string;
}

const ProposalEvidencePanel = lazy(() => import('./components/evidence/ProposalEvidencePanel'));

export default function App() { return <ApiKeyGate><VeriFinApplication /></ApiKeyGate>; }

function VeriFinApplication() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // User Profile & Authentication State
  const [user, setUser] = useState<UserSession>(() => {
    try {
      const authSaved = localStorage.getItem('applet_auth_user');
      if (authSaved) return JSON.parse(authSaved);
      const saved = localStorage.getItem('excel_ai_agent_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      id: 'usr_guest', name: 'Chưa đăng nhập', email: '', branch: 'office', roleTitle: 'Khách sử dụng',
    };
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);
  const [showChatWindow, setShowChatWindow] = useState(false);

  // Sync Firebase Authentication state
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = auth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setUser((prev) => ({
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Chuyên viên VeriFin',
            email: fbUser.email || '',
            phone: fbUser.phoneNumber || prev.phone || '',
            branch: prev.branch || 'all',
            roleTitle: prev.roleTitle || 'Xác thực Google (Firebase)',
            token,
            loginAt: new Date().toISOString(),
          }));
          localStorage.setItem('applet_auth_token', token);
        } catch (e) {
          console.error('Error in onAuthStateChanged:', redactSensitiveLog(e));
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignInDirect = async () => {
    try {
      const gUser = await signInWithGoogle();
      const token = await gUser.getIdToken();
      const verifiedUser: UserSession = {
        id: gUser.uid,
        name: gUser.displayName || gUser.email?.split('@')[0] || 'Chuyên viên VeriFin',
        email: gUser.email || '',
        phone: gUser.phoneNumber || '',
        branch: user.branch || 'all',
        roleTitle: 'Chuyên viên Xác thực Google',
        token,
        loginAt: new Date().toISOString(),
      };
      setUser(verifiedUser);
      localStorage.setItem('applet_auth_user', JSON.stringify(verifiedUser));
      localStorage.setItem('applet_auth_token', token);
    } catch (e) {
      console.error('Direct Google Sign-in error:', redactSensitiveLog(e));
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('applet_auth_token');
    await fetch('/api/auth/logout', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    await logOutFirebase().catch(error => console.error(redactSensitiveLog(error)));
    localStorage.removeItem('applet_auth_token');
    localStorage.removeItem('applet_auth_user');
    localStorage.removeItem('excel_ai_agent_user');
    const resetUser: UserSession = {
      id: 'usr_guest',
      name: 'Chưa đăng nhập',
      email: '',
      branch: user.branch || 'all',
      roleTitle: 'Khách sử dụng',
      loginAt: new Date().toISOString(),
    };
    setUser(resetUser);
    localStorage.setItem('applet_auth_user', JSON.stringify(resetUser));
  };

  const handleSwitchBranch = (newBranch: BusinessBranch) => {
    const updatedUser: UserSession = {
      ...user,
      branch: newBranch,
      roleTitle:
        newBranch === 'office'
          ? 'Kế toán trưởng & QL Vận hành'
          : newBranch === 'banking'
          ? 'Chuyên viên Tín dụng & QLRR'
          : 'Giám đốc Điều hành & CFO',
    };
    setUser(updatedUser);
    localStorage.setItem('excel_ai_agent_user', JSON.stringify(updatedUser));

    // If active tab belongs to a hidden category, redirect cleanly to a valid tab
    const bankingTabs: TabKey[] = ['statement', 'cic', 'portfolio', 'collateral', 'proposal', 'income'];
    const officeTabs: TabKey[] = ['debt', 'reconcile', 'payslip', 'orders', 'documents', 'cashflow'];
    if (newBranch === 'office' && bankingTabs.includes(activeTab)) {
      setActiveTab('debt');
    } else if (newBranch === 'banking' && officeTabs.includes(activeTab)) {
      setActiveTab('statement');
    }
  };

  const handleSaveUser = (updatedUser: UserSession) => {
    setUser(updatedUser);
    localStorage.setItem('excel_ai_agent_user', JSON.stringify(updatedUser));
    setShowLoginModal(false);

    // Apply auto branch tab redirect if needed
    const bankingTabs: TabKey[] = ['statement', 'cic', 'portfolio', 'collateral', 'proposal', 'income'];
    const officeTabs: TabKey[] = ['debt', 'reconcile', 'payslip', 'orders', 'documents', 'cashflow'];
    if (updatedUser.branch === 'office' && bankingTabs.includes(activeTab)) {
      setActiveTab('debt');
    } else if (updatedUser.branch === 'banking' && officeTabs.includes(activeTab)) {
      setActiveTab('statement');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-80 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between shrink-0 overflow-y-auto">
        <div className="p-5">
          {/* Brand Header */}
          <div className="mb-4">
            <h1 className="font-bold text-lg leading-tight tracking-tight text-white flex items-center gap-3">
              {/* Official VeriFin Pro SVG Shield Logo */}
              <svg
                className="w-9 h-9 shrink-0 drop-shadow-[0_2px_10px_rgba(6,182,212,0.35)]"
                viewBox="0 0 100 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="VeriFin Pro Logo"
              >
                <defs>
                  <linearGradient id="vf-shield-navy" x1="15" y1="12" x2="50" y2="108" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="40%" stopColor="#1D4ED8" />
                    <stop offset="100%" stopColor="#0F172A" />
                  </linearGradient>
                  <linearGradient id="vf-shield-cyan" x1="50" y1="12" x2="85" y2="108" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#22D3EE" />
                    <stop offset="50%" stopColor="#06B6D4" />
                    <stop offset="100%" stopColor="#0891B2" />
                  </linearGradient>
                  <linearGradient id="vf-arrow-gold" x1="42" y1="78" x2="88" y2="28" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="35%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                </defs>

                {/* Outer Shield: Left Half (Navy Blue) */}
                <path
                  d="M50 14 L24 23 C23 23 23 24 23 25 V45 C23 46 24 47 25 47 H31 C32 47 33 46 33 45 V32 L50 24 V14 Z"
                  fill="url(#vf-shield-navy)"
                />
                <path
                  d="M23 52 V60 C23 78 34 94 50 106 V96 C39 85 32 72 32 60 V53 C32 52 31 52 30 52 H24 C23 52 23 52 23 52 Z"
                  fill="url(#vf-shield-navy)"
                />

                {/* Outer Shield: Right Half (Cyan / Turquoise) */}
                <path
                  d="M50 14 L76 23 C77 23 77 24 77 25 V45 C77 46 76 47 75 47 H69 C68 47 67 46 67 45 V32 L50 24 V14 Z"
                  fill="url(#vf-shield-cyan)"
                />
                <path
                  d="M77 52 V60 C77 78 66 94 50 106 V96 C61 85 68 72 68 60 V53 C68 52 69 52 70 52 H76 C77 52 77 52 77 52 Z"
                  fill="url(#vf-shield-cyan)"
                />

                {/* Inner Shield Contour */}
                <path
                  d="M50 27 L33 34 V58 C33 71 40 83 50 90 C60 83 67 71 67 58 V34 L50 27 Z"
                  stroke="url(#vf-shield-cyan)"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                  fill="none"
                  opacity="0.9"
                />

                {/* Financial Bar Chart (3 bars rising) */}
                <rect x="53" y="66" width="5.5" height="19" rx="1.5" fill="#06B6D4" />
                <rect x="60.5" y="56" width="5.5" height="29" rx="1.5" fill="#0891B2" />
                <rect x="68" y="46" width="5.5" height="39" rx="1.5" fill="#22D3EE" />

                {/* Verification Checkmark (Cyan / Teal) */}
                <path
                  d="M39 52 L47.5 62 L63 41"
                  stroke="#22D3EE"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Golden Upward Growth Arrow */}
                <path
                  d="M44 76 C52 73 59 66 68 55 L79 40"
                  stroke="url(#vf-arrow-gold)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <polygon
                  points="78,31 87,40 73,43"
                  fill="url(#vf-arrow-gold)"
                />
              </svg>

              <div>
                <span className="flex items-center gap-1.5 leading-none">
                  <span className="text-white font-black text-lg tracking-tight">
                    Veri<span className="text-cyan-400">Fin</span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 tracking-wider">
                    Pro
                  </span>
                </span>
                <span className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-normal">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Banking & Office Pro
                </span>
              </div>
            </h1>
          </div>

          {/* User Profile & Branch Selector Widget */}
          <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700/80 mb-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-xs text-white shrink-0">
                  {user.name.split(' ').slice(-1)[0]?.charAt(0) || 'U'}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-white truncate">{user.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{user.roleTitle}</div>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(true)}
                className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition shrink-0"
                title="Đổi phân hệ hoặc đăng nhập tài khoản khác"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Segmented Branch Switcher (3 Chế Độ Lựa Chọn) */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-400 font-semibold flex items-center justify-between">
                <span>Chế độ nghiệp vụ:</span>
                <span className={
                  user.branch === 'office'
                    ? 'text-emerald-400 font-bold'
                    : user.branch === 'banking'
                    ? 'text-amber-400 font-bold'
                    : 'text-cyan-400 font-bold'
                }>
                  {user.branch === 'office' ? '🏢 Khối Văn Phòng' : user.branch === 'banking' ? '🏛️ Ngân Hàng Pro' : '🌐 Toàn Bộ Phân Hệ'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/90 rounded-xl border border-slate-700/70 text-xs">
                <button
                  onClick={() => handleSwitchBranch('office')}
                  className={`py-1.5 px-1.5 rounded-lg font-bold flex flex-col sm:flex-row items-center justify-center gap-1 transition ${
                    user.branch === 'office'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="Chỉ hiện nghiệp vụ Văn phòng (Ẩn toàn bộ Ngân hàng & Tín dụng Pro để đỡ rối)"
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Văn Phòng</span>
                </button>
                <button
                  onClick={() => handleSwitchBranch('banking')}
                  className={`py-1.5 px-1.5 rounded-lg font-bold flex flex-col sm:flex-row items-center justify-center gap-1 transition ${
                    user.branch === 'banking'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="Chỉ hiện nghiệp vụ Ngân hàng & Tín dụng Pro"
                >
                  <Landmark className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Ngân Hàng</span>
                </button>
                <button
                  onClick={() => handleSwitchBranch('all')}
                  className={`py-1.5 px-1.5 rounded-lg font-bold flex flex-col sm:flex-row items-center justify-center gap-1 transition ${
                    user.branch === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="Hiển thị tất cả nghiệp vụ"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Tất Cả</span>
                </button>
              </div>
            </div>
          </div>

          {/* AI Engine Status */}
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/80 mb-4 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold text-emerald-400 flex items-center gap-1 text-[11px]">
                <Sparkles className="w-3.5 h-3.5" /> AI Engine
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium text-[9px]">
                Server-Side Active
              </span>
            </div>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              {user.branch === 'office'
                ? 'Đang bật bộ lọc Văn phòng: Đã ẩn toàn bộ nghiệp vụ Ngân hàng để tránh rối mắt.'
                : user.branch === 'banking'
                ? 'Đang bật bộ lọc Ngân hàng Pro: Tập trung thẩm định tín dụng & sao kê.'
                : 'Hiển thị đầy đủ 12 phân hệ tích hợp cho Ban Giám đốc & Kiểm toán.'}
            </p>
          </div>

          {/* Executive Overview Dashboard & User Guide & Bank Account Settings */}
          <div className="space-y-1.5 mb-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between border ${
                activeTab === 'dashboard'
                  ? user.branch === 'office'
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white font-bold shadow-lg shadow-emerald-500/25 border-emerald-400/50'
                    : 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white font-bold shadow-lg shadow-amber-500/25 border-amber-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-emerald-300" />
                <span className="text-xs font-bold tracking-tight">📊 Dashboard Tổng Quan</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider ${
                user.branch === 'office' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'
              }`}>
                {user.branch === 'office' ? 'VP PRO' : user.branch === 'banking' ? 'BANK PRO' : 'FULL'}
              </span>
            </button>

            {/* AI CHATBOT GEMINI TRỢ LÝ TOÀN NĂNG */}
            <button
              onClick={() => setShowChatWindow((prev) => !prev)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between border ${
                showChatWindow
                  ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 text-white font-bold shadow-lg shadow-violet-500/30 border-violet-400/60'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/60 hover:text-white group'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bot className={`w-4 h-4 ${showChatWindow ? 'text-white' : 'text-violet-400 group-hover:text-violet-300'}`} />
                <span className="text-xs font-bold tracking-tight">🤖 AI Chatbot Gemini</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/40 animate-pulse">
                {showChatWindow ? 'ĐANG MỞ' : 'TRỢ LÝ AI'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between border ${
                activeTab === 'guide'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/25 border-indigo-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-indigo-300" />
                <span className="text-xs font-bold tracking-tight">📖 Hướng Dẫn Sử Dụng</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider bg-indigo-500/20 text-indigo-300">
                CẨM NANG
              </span>
            </button>

            {/* MỤC RIÊNG CẤU HÌNH TÀI KHOẢN & VIETQR */}
            <button
              onClick={() => setActiveTab('bank_account')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between border ${
                activeTab === 'bank_account'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-lg shadow-cyan-600/25 border-cyan-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-bold tracking-tight">💳 Tài Khoản & VietQR</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                MỤC RIÊNG
              </span>
            </button>
          </div>

          {/* Nhóm 1: Nghiệp Vụ Văn Phòng (Hiển thị khi chọn Văn Phòng hoặc Tất Cả) */}
          {(user.branch === 'office' || user.branch === 'all') && (
            <div className="space-y-1 mb-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>I. Nghiệp vụ Văn phòng (6 Module)</span>
                </div>
                {user.branch === 'office' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    Đang chọn
                  </span>
                )}
              </div>
              <nav className="space-y-1 text-xs font-medium">
                <button
                  onClick={() => setActiveTab('debt')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                    activeTab === 'debt'
                      ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                  <span>1. Công nợ & Email nhắc nợ</span>
                </button>

                <button
                  onClick={() => setActiveTab('reconcile')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                    activeTab === 'reconcile'
                      ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <FileCheck2 className="w-4 h-4 text-cyan-300" />
                  <span>2. Ghép & Đối chiếu 2 file</span>
                </button>

                <button
                  onClick={() => setActiveTab('payslip')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                    activeTab === 'payslip'
                      ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4 text-teal-300" />
                  <span>3. Tạo phiếu lương hàng loạt</span>
                </button>

                <button
                  onClick={() => setActiveTab('orders')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                    activeTab === 'orders'
                      ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <MessageSquareText className="w-4 h-4 text-sky-300" />
                  <span>4. Bóc đơn hàng từ Zalo / Chat</span>
                </button>

                <button
                  onClick={() => setActiveTab('documents')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                    activeTab === 'documents'
                      ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <Receipt className="w-4 h-4 text-indigo-300" />
                  <span>5. Đọc chứng từ hàng loạt (OCR)</span>
                </button>

                <button
                  onClick={() => setActiveTab('cashflow')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                    activeTab === 'cashflow'
                      ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 text-emerald-300" />
                  <span>6. Dự báo dòng tiền 12 tuần</span>
                </button>
              </nav>
            </div>
          )}

          {/* THÔNG BÁO KHI ĐANG ẨN KHỐI NGÂN HÀNG Ở CHẾ ĐỘ VĂN PHÒNG */}
          {user.branch === 'office' && (
            <div className="mb-5 mx-1 p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60 text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Đã ẩn Ngân Hàng & Tín Dụng Pro</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                6 Module Tín dụng & Ngân hàng Pro đã được ẩn đi để không gian làm việc văn phòng hoàn toàn gọn gàng, tránh gây rối mắt.
              </p>
              <button
                onClick={() => handleSwitchBranch('all')}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold underline block pt-0.5"
              >
                Bật hiện toàn bộ nếu cần đối chiếu →
              </button>
            </div>
          )}

          {/* Nhóm 2: Nghiệp Vụ Ngân Hàng & Tín Dụng (ẨN HOÀN TOÀN KHI user.branch === 'office') */}
          {(user.branch === 'banking' || user.branch === 'all') && (
            <div className="space-y-1 mb-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-2 px-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-amber-400" />
                  <span>II. Ngân hàng & Tín dụng Pro (6 Module)</span>
                </div>
                {user.branch === 'banking' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    Đang chọn
                  </span>
                )}
              </div>
              <nav className="space-y-1 text-xs font-medium">
                <button
                  onClick={() => setActiveTab('statement')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 border ${
                    activeTab === 'statement'
                      ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/30 border-amber-500'
                      : 'border-amber-500/20 text-amber-200/90 hover:bg-slate-800/80 hover:text-amber-300'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-amber-300" />
                  <span>7. Thẩm định Sao kê & Red Flags</span>
                </button>

                <button
                  onClick={() => setActiveTab('cic')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 border ${
                    activeTab === 'cic'
                      ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/30 border-amber-500'
                      : 'border-amber-500/20 text-amber-200/90 hover:bg-slate-800/80 hover:text-amber-300'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 text-amber-300" />
                  <span>8. Bóc tách CIC / BCTC Thẩm định</span>
                </button>

                <button
                  onClick={() => setActiveTab('portfolio')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 border ${
                    activeTab === 'portfolio'
                      ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/30 border-amber-500'
                      : 'border-amber-500/20 text-amber-200/90 hover:bg-slate-800/80 hover:text-amber-300'
                  }`}
                >
                  <BellRing className="w-4 h-4 text-amber-300" />
                  <span>9. Nhắc nợ Vay & Đáo hạn STK</span>
                </button>

                <button
                  onClick={() => setActiveTab('collateral')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 border ${
                    activeTab === 'collateral'
                      ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/30 border-amber-500'
                      : 'border-amber-500/20 text-emerald-300 hover:bg-slate-800/80 hover:text-emerald-200'
                  }`}
                >
                  <Home className="w-4 h-4 text-emerald-400" />
                  <span>10. Bóc tách Sổ Đỏ & Định giá LTV</span>
                </button>

                <button
                  onClick={() => setActiveTab('proposal')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 border ${
                    activeTab === 'proposal'
                      ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/30 border-amber-500'
                      : 'border-amber-500/20 text-emerald-300 hover:bg-slate-800/80 hover:text-emerald-200'
                  }`}
                >
                  <FileSignature className="w-4 h-4 text-emerald-400" />
                  <span>11. Lập Tờ Trình Vay & Refinance</span>
                </button>

                <button
                  onClick={() => setActiveTab('income')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 border ${
                    activeTab === 'income'
                      ? 'bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/30 border-amber-500'
                      : 'border-amber-500/20 text-amber-300 hover:bg-slate-800/80 hover:text-amber-200'
                  }`}
                >
                  <Calculator className="w-4 h-4 text-amber-400" />
                  <span>12. Thẩm định Nguồn Thu & NDI</span>
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* Sample Datasets Quick Downloads */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>📥 File mẫu có sẵn:</span>
            <button
              onClick={() => setActiveTab('guide')}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              Xem hướng dẫn
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <a
              href="/api/samples/so-cong-no"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center gap-1 border border-slate-700/50"
              title="Tải File Sổ Công Nợ"
            >
              <Download className="w-3 h-3 text-emerald-400" /> Sổ Công Nợ
            </a>
            <a
              href="/api/samples/sao-ke-bank"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center gap-1 border border-slate-700/50"
              title="Tải File Sao Kê Ngân Hàng"
            >
              <Download className="w-3 h-3 text-amber-400" /> Sao Kê Bank
            </a>
            <a
              href="/api/samples/file-ban-hang-a"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center gap-1 border border-slate-700/50"
              title="Tải File Bán Hàng A"
            >
              <Download className="w-3 h-3 text-cyan-400" /> File A (Bán Hàng)
            </a>
            <a
              href="/api/samples/file-ke-toan-b"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center gap-1 border border-slate-700/50"
              title="Tải File Kế Toán B"
            >
              <Download className="w-3 h-3 text-cyan-400" /> File B (Kho)
            </a>
            <a
              href="/api/samples/bang-luong"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center gap-1 border border-slate-700/50"
              title="Tải Bảng Lương"
            >
              <Download className="w-3 h-3 text-teal-400" /> Bảng Lương
            </a>
            <a
              href="/api/samples/mau-phieu-luong"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-teal-300 hover:text-white flex items-center justify-center gap-1 border border-teal-500/30"
              title="Tải Mẫu Phiếu Lương Doanh Nghiệp Chuẩn (.xlsx)"
            >
              <Download className="w-3 h-3 text-teal-400" /> Mẫu Lương DN
            </a>
            <a
              href="/api/samples/tham-dinh-thu-nhap"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-300 hover:text-white flex items-center justify-center gap-1 border border-amber-500/30"
              title="Tải Mẫu Thẩm Định Nguồn Thu (.xlsx)"
            >
              <Download className="w-3 h-3 text-amber-400" /> Mẫu Nguồn Thu
            </a>
            <a
              href="/api/samples/du-bao-dong-tien"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-emerald-300 hover:text-white flex items-center justify-center gap-1 border border-emerald-500/30"
              title="Tải Mẫu Dự Báo Dòng Tiền 12 Tuần (.xlsx)"
            >
              <Download className="w-3 h-3 text-emerald-400" /> Mẫu Dòng Tiền
            </a>
            <a
              href="/api/bank/sample-proposal-template"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-300 hover:text-white flex items-center justify-center gap-1 border border-amber-500/40 col-span-2"
              title="Tải Mẫu Tờ Trình Tín Dụng Chuẩn (.docx)"
            >
              <Download className="w-3 h-3 text-amber-400" /> Mẫu Tờ Trình Vay (.docx)
            </a>
          </div>

          {/* THÔNG TIN TÁC GIẢ & QR MỜI CÀ PHÊ (0817221722 - OCB 48888 - NGUYỄN TRƯỜNG THIÊN TÂN) */}
          <CreatorCoffeeCard onOpenModal={() => setShowCoffeeModal(true)} />
        </div>
      </aside>

      {/* MAIN VIEW */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
        {activeTab === 'dashboard' && (
          <DashboardOverview
            onNavigate={setActiveTab}
            onOpenChat={() => setShowChatWindow(true)}
            branch={user.branch}
            user={user}
            onSwitchBranch={handleSwitchBranch}
            onOpenLogin={() => setShowLoginModal(true)}
          />
        )}
        {activeTab === 'chat' && (
          <GeminiChatbotModule />
        )}
        {activeTab === 'guide' && (
          <UserGuideModule onNavigate={setActiveTab} currentBranch={user.branch} />
        )}
        {activeTab === 'bank_account' && (
          <BankAccountConfigModule />
        )}
        {activeTab === 'debt' && (
          <DebtModule
            onCopy={copyToClipboard}
            copiedKey={copiedKey}
            onNavigateAccountSettings={() => setActiveTab('bank_account')}
          />
        )}
        {activeTab === 'reconcile' && <ReconcileModule />}
        {activeTab === 'payslip' && <PayslipModule />}
        {activeTab === 'orders' && <OrdersModule />}
        {activeTab === 'documents' && <DocumentsModule />}
        {activeTab === 'cashflow' && <CashFlowForecastModule />}
        {activeTab === 'statement' && <StatementModule />}
        {activeTab === 'cic' && <CicBctcModule />}
        {activeTab === 'portfolio' && <PortfolioModule onCopy={copyToClipboard} copiedKey={copiedKey} />}
        {activeTab === 'collateral' && <CollateralModule />}
        {activeTab === 'proposal' && <CreditProposalModule />}
        {activeTab === 'income' && <IncomeAssessmentModule />}
      </main>

      {/* FLOATING QUICK-ACCESS CHATBOT WINDOW (BOTTOM RIGHT CORNER) */}
      {showChatWindow ? (
        <GeminiChatbotModule
          isFloating={true}
          onClose={() => setShowChatWindow(false)}
        />
      ) : (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setShowChatWindow(true)}
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold shadow-xl shadow-violet-500/35 border border-violet-400/50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title="Mở Trợ Lý AI Chatbot Gemini (Góc phải màn hình)"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <Bot className="w-5 h-5 animate-bounce" />
            <span className="text-xs tracking-tight">Hỏi AI Chatbot</span>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider backdrop-blur-xs">
              Gemini
            </span>
          </button>
        </div>
      )}

      {/* AUTHENTICATION & REGISTRATION MODAL */}
      {showLoginModal && (
        <AuthModal
          currentUser={user}
          onAuthSuccess={handleSaveUser}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {/* CREATOR & COFFEE QR MODAL */}
      {showCoffeeModal && (
        <CreatorCoffeeModal onClose={() => setShowCoffeeModal(false)} />
      )}
    </div>
  );
}

// ==========================================
// 0. DASHBOARD TỔNG QUAN (RECHARTS VISUALIZATION)
// ==========================================

function DashboardOverview({
  onNavigate,
  onOpenChat,
  branch,
  user,
  onSwitchBranch,
  onOpenLogin,
}: {
  onNavigate: (tab: TabKey) => void;
  onOpenChat?: () => void;
  branch: BusinessBranch;
  user: UserSession;
  onSwitchBranch: (b: BusinessBranch) => void;
  onOpenLogin: () => void;
}) {
  const [period, setPeriod] = useState<'current' | 'prev' | 'quarter'>('current');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Helper formatting currency
  const formatCurrency = (val: number) => {
    if (val >= 1000) {
      return `${(val / 1000).toFixed(2)} Tỷ ₫`;
    }
    return `${val.toLocaleString('vi-VN')} Tr ₫`;
  };

  // ==========================================
  // DỮ LIỆU RIÊNG CHO NHÁNH VĂN PHÒNG (OFFICE)
  // ==========================================
  const debtAgingData = period === 'current'
    ? [
        { range: '0 - 30 ngày', label: 'Trong hạn', amount: 125, count: 12, fill: '#10B981' },
        { range: '31 - 60 ngày', label: 'Cần nhắc nhở', amount: 85, count: 5, fill: '#F59E0B' },
        { range: '61 - 90 ngày', label: 'Cảnh báo rủi ro', amount: 65, count: 4, fill: '#F97316' },
        { range: '> 90 ngày', label: 'Quá hạn khó đòi', amount: 62, count: 3, fill: '#EF4444' },
      ]
    : period === 'prev'
    ? [
        { range: '0 - 30 ngày', label: 'Trong hạn', amount: 140, count: 14, fill: '#10B981' },
        { range: '31 - 60 ngày', label: 'Cần nhắc nhở', amount: 72, count: 4, fill: '#F59E0B' },
        { range: '61 - 90 ngày', label: 'Cảnh báo rủi ro', amount: 50, count: 3, fill: '#F97316' },
        { range: '> 90 ngày', label: 'Quá hạn khó đòi', amount: 48, count: 2, fill: '#EF4444' },
      ]
    : [
        { range: '0 - 30 ngày', label: 'Trong hạn', amount: 380, count: 36, fill: '#10B981' },
        { range: '31 - 60 ngày', label: 'Cần nhắc nhở', amount: 220, count: 12, fill: '#F59E0B' },
        { range: '61 - 90 ngày', label: 'Cảnh báo rủi ro', amount: 160, count: 8, fill: '#F97316' },
        { range: '> 90 ngày', label: 'Quá hạn khó đòi', amount: 145, count: 6, fill: '#EF4444' },
      ];

  const debtRecoveryPie = [
    { name: 'Đã thu hồi thành công', value: 540, percentage: 61.5, color: '#10B981' },
    { name: 'Phải thu trong hạn', value: 125, percentage: 14.2, color: '#06B6D4' },
    { name: 'Quá hạn cần đôn đốc', value: 212, percentage: 24.3, color: '#EF4444' },
  ];

  const weeklyRevenueData = period === 'current'
    ? [
        { week: 'Tuần 1 (01-07)', revenue: 185, target: 160, orders: 32 },
        { week: 'Tuần 2 (08-14)', revenue: 240, target: 200, orders: 41 },
        { week: 'Tuần 3 (15-21)', revenue: 210, target: 200, orders: 38 },
        { week: 'Tuần 4 (22-28)', revenue: 210.6, target: 220, orders: 31 },
      ]
    : period === 'prev'
    ? [
        { week: 'Tuần 1', revenue: 160, target: 150, orders: 28 },
        { week: 'Tuần 2', revenue: 195, target: 180, orders: 34 },
        { week: 'Tuần 3', revenue: 180, target: 180, orders: 30 },
        { week: 'Tuần 4', revenue: 179, target: 190, orders: 29 },
      ]
    : [
        { week: 'Tháng 7', revenue: 680, target: 650, orders: 115 },
        { week: 'Tháng 8', revenue: 745, target: 700, orders: 126 },
        { week: 'Tháng 9', revenue: 714, target: 700, orders: 121 },
        { week: 'Tháng 10', revenue: 845.6, target: 780, orders: 142 },
      ];

  const orderChannelPie = [
    { name: 'Zalo Chat & OA', value: 355.2, percentage: 42, color: '#0EA5E9' },
    { name: 'B2B / Kế toán nội bộ', value: 287.5, percentage: 34, color: '#10B981' },
    { name: 'Chuyển khoản trực tiếp', value: 135.3, percentage: 16, color: '#8B5CF6' },
    { name: 'Đại lý phân phối', value: 67.6, percentage: 8, color: '#F59E0B' },
  ];

  const departmentPayrollData = [
    { dept: 'Phòng Kinh Doanh', count: 6, amount: 82.0, color: '#10B981' },
    { dept: 'Khối Kỹ Thuật & Dev', count: 4, amount: 56.0, color: '#06B6D4' },
    { dept: 'Kế Toán & Vận Hành', count: 3, amount: 38.5, color: '#8B5CF6' },
    { dept: 'Ban Giám Đốc', count: 2, amount: 22.0, color: '#F59E0B' },
  ];

  const topSellingProducts = [
    { name: 'Thức ăn cá hồi cao cấp 25kg', code: 'SP-CA01', revenue: '245.000.000 đ', orders: 48, growth: '+22%' },
    { name: 'Thức ăn tôm thẻ chân trắng bao 20kg', code: 'SP-TOM03', revenue: '198.500.000 đ', orders: 36, growth: '+15%' },
    { name: 'Chế phẩm sinh học xử lý đáy ao 5L', code: 'CP-BIO02', revenue: '112.400.000 đ', orders: 24, growth: '+8%' },
    { name: 'Men vi sinh đường ruột tôm cá can 10L', code: 'CP-MEN01', revenue: '89.700.000 đ', orders: 19, growth: '+12%' },
  ];

  const topDebtors = [
    { name: 'Công ty Thủy sản Hùng Cá', id: 'KH001', amount: '150.000.000 đ', overdue: '10 ngày', status: 'Quá hạn cao', level: 'high' },
    { name: 'Đại lý Thức ăn Minh Phú', id: 'KH002', amount: '85.000.000 đ', overdue: '5 ngày', status: 'Quá hạn', level: 'medium' },
    { name: 'Công ty CP Nông Nghiệp Xanh', id: 'KH004', amount: '50.000.000 đ', overdue: '10 ngày', status: 'Quá hạn', level: 'medium' },
    { name: 'Hộ KD Tuấn Mai', id: 'KH007', amount: '32.000.000 đ', overdue: '3 ngày', status: 'Mới quá hạn', level: 'low' },
  ];

  // ==========================================
  // DỮ LIỆU RIÊNG CHO NHÁNH NGÂN HÀNG (BANKING)
  // ==========================================
  const cicGroupsData = [
    { group: 'Nhóm 1 (Đủ tiêu chuẩn)', balance: 6490, percent: 89.2, customers: 72, color: '#10B981', desc: 'Nợ trong hạn hoặc quá hạn < 10 ngày' },
    { group: 'Nhóm 2 (Cần chú ý)', balance: 473, percent: 6.5, customers: 8, color: '#F59E0B', desc: 'Quá hạn 10 - 90 ngày, cần đôn đốc' },
    { group: 'Nhóm 3 (Dưới chuẩn)', balance: 152, percent: 2.1, customers: 3, color: '#F97316', desc: 'Quá hạn 91 - 180 ngày (Nợ xấu NPL)' },
    { group: 'Nhóm 4 (Nghi ngờ)', balance: 101, percent: 1.4, customers: 2, color: '#EF4444', desc: 'Quá hạn 181 - 360 ngày (Nợ xấu NPL)' },
    { group: 'Nhóm 5 (Mất vốn)', balance: 58, percent: 0.8, customers: 1, color: '#991B1B', desc: 'Quá hạn > 360 ngày (Nợ xấu NPL)' },
  ];

  const dtiRiskData = [
    { range: 'DTI < 40%', label: 'Rất an toàn', percent: 68, fill: '#10B981', note: 'Đủ điều kiện phê duyệt nhanh' },
    { range: 'DTI 40% - 60%', label: 'Trung bình', percent: 24, fill: '#F59E0B', note: 'Cần thẩm định kỹ nguồn thu' },
    { range: 'DTI > 60%', label: 'Cảnh báo rủi ro cao', percent: 8, fill: '#EF4444', note: 'Vượt trần an toàn tín dụng' },
  ];

  const statementFlowWeekly = [
    { week: 'Tuần 1', cashIn: 450, cashOut: 380, balance: 210 },
    { week: 'Tuần 2', cashIn: 620, cashOut: 490, balance: 340 },
    { week: 'Tuần 3', cashIn: 540, cashOut: 430, balance: 450 },
    { week: 'Tuần 4', cashIn: 590, cashOut: 460, balance: 580 },
  ];

  const upcomingCreditItems = [
    { name: 'Nguyễn Văn An', phone: '0912.345.678', product: 'Vay thế chấp BĐS', amount: 1200000000, dueDate: '18/10/2026', daysLeft: 4, priority: 'Ưu tiên cao', type: 'loan' },
    { name: 'Trần Thị Mai', phone: '0987.654.321', product: 'Sổ tiết kiệm 12T', amount: 500000000, dueDate: '20/10/2026', daysLeft: 6, priority: 'Tái tục STK', type: 'saving' },
    { name: 'Lê Quang Hưng', phone: '0903.112.233', product: 'Vay thấu chi SXKD', amount: 350000000, dueDate: '25/10/2026', daysLeft: 11, priority: 'Thu hồi lãi', type: 'loan' },
    { name: 'Phạm Hoàng Long', phone: '0945.889.900', product: 'STK Phát Lộc 6T', amount: 1000000000, dueDate: '28/10/2026', daysLeft: 14, priority: 'Tái tục STK', type: 'saving' },
  ];

  // ==========================================
  // RENDER GIAO DIỆN PHÂN HỆ VĂN PHÒNG (OFFICE)
  // ==========================================
  if (branch === 'office') {
    return (
      <div className={`space-y-6 max-w-7xl transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
        {/* Top Header Văn Phòng */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 shadow-lg shadow-emerald-950/20">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center font-bold text-slate-950 text-xl shadow-md shadow-emerald-500/20 shrink-0">
                <Building2 className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">
                    Dashboard Nghiệp Vụ Văn Phòng & Kế Toán Doanh Nghiệp
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                    🏢 VP PRO ACTIVE
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Theo dõi hợp nhất: Sổ Công Nợ · Doanh Thu Đơn Hàng Zalo & B2B · Bảng Lương Nhân Sự · Chứng Từ OCR
                </p>
              </div>
            </div>
          </div>

          {/* Action & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setPeriod('current')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  period === 'current' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tháng 10/2026
              </button>
              <button
                onClick={() => setPeriod('prev')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  period === 'prev' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tháng 09/2026
              </button>
              <button
                onClick={() => setPeriod('quarter')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  period === 'quarter' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Quý 3/2026
              </button>
            </div>

            <button
              onClick={handleRefresh}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              title="Làm mới số liệu văn phòng"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              onClick={() => onSwitchBranch('banking')}
              className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-amber-950/40 text-amber-300 hover:text-amber-200 border border-amber-500/40 font-semibold text-xs flex items-center gap-1.5 transition shadow-sm"
              title="Chuyển sang nhánh nghiệp vụ Ngân Hàng"
            >
              <Landmark className="w-3.5 h-3.5 text-amber-400" />
              <span>Chuyển Nhánh Bank</span>
            </button>

            <button
              onClick={onOpenLogin}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition"
              title="Đổi tài khoản đăng nhập hoặc vai trò"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Đổi Vai Trò</span>
            </button>
          </div>
        </div>

        {/* User Context Banner */}
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-600 text-slate-950 font-black flex items-center justify-center text-xs">
              {user.name.split(' ').slice(-1)[0]?.charAt(0) || 'K'}
            </div>
            <div>
              <span className="text-slate-300">Đang thao tác: </span>
              <strong className="text-white font-bold">{user.name}</strong>
              <span className="text-emerald-400 font-medium"> ({user.roleTitle})</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Chế độ: <strong className="text-emerald-300">Văn Phòng & Doanh Nghiệp</strong></span>
            <span>•</span>
            <span>Chỉ số lọc: <strong className="text-white">Toàn bộ 5 Module Văn Phòng</strong></span>
          </div>
        </div>

        {/* AI CHATBOT HERO QUICK ACCESS BANNER */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-950/70 via-purple-900/40 to-slate-900/90 border border-violet-500/40 p-4 md:p-5 shadow-lg shadow-violet-950/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30 shrink-0">
                <Bot className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-white text-sm md:text-base flex items-center gap-1.5">
                    🤖 AI Chatbot Gemini - Trợ Lý Nghiệp Vụ Tài Chính & Ngân Hàng 24/7
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-400/20 text-violet-300 border border-violet-400/30">
                    MỚI
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  Tư vấn phân nhóm nợ Thông tư 11/2021, công thức tính DSCR/LTV, đối chiếu công nợ chuẩn VietQR, bảng lương BHXH & thuế TNCN lũy tiến tự động.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  <span className="text-slate-400">Gợi ý câu hỏi:</span>
                  <button
                    onClick={() => onOpenChat ? onOpenChat() : onNavigate('chat')}
                    className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-violet-900/50 text-violet-200 border border-violet-500/30 transition text-[10px] cursor-pointer"
                  >
                    💡 Phân loại nợ TT11
                  </button>
                  <button
                    onClick={() => onOpenChat ? onOpenChat() : onNavigate('chat')}
                    className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-violet-900/50 text-violet-200 border border-violet-500/30 transition text-[10px] cursor-pointer"
                  >
                    📊 Cách tính DSCR sao kê
                  </button>
                  <button
                    onClick={() => onOpenChat ? onOpenChat() : onNavigate('chat')}
                    className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-violet-900/50 text-violet-200 border border-violet-500/30 transition text-[10px] cursor-pointer"
                  >
                    🧾 Quy trình đối chiếu công nợ
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => onOpenChat ? onOpenChat() : onNavigate('chat')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-violet-600/30 transition shrink-0 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>Mở AI Chatbot (Cửa sổ góc phải)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 KPI HIGHLIGHTS CARDS - VĂN PHÒNG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Doanh Thu Đơn Hàng Zalo */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Doanh Thu Đơn Hàng Zalo / B2B</span>
                <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Receipt className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                {period === 'quarter' ? '2.984.600.000 ₫' : '845.600.000 ₫'}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-emerald-400 font-medium">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>+18.4% so với kỳ trước</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">142 đơn bóc tự động</span>
              <button
                onClick={() => onNavigate('orders')}
                className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-0.5 hover:underline"
              >
                Bóc đơn Zalo <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Card 2: Dư Nợ Công Nợ Phải Thu */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-rose-500/40 transition flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Tổng Dư Nợ Công Nợ Phải Thu</span>
                <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                  <FileSpreadsheet className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-rose-400 mt-1">
                {period === 'quarter' ? '905.000.000 ₫' : '337.000.000 ₫'}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Quá hạn: 212 Tr ₫ (62.9%)</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">4 khách hàng quá hạn</span>
              <button
                onClick={() => onNavigate('debt')}
                className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 hover:underline"
              >
                Email nhắc nợ <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Card 3: Chi Phí Quỹ Lương & Nhân Sự */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-teal-500/40 transition flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Tổng Quỹ Lương & Nhân Sự</span>
                <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                  <FileText className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                198.500.000 ₫
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-teal-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>15 CBNV · Đã áp mẫu chuẩn DN</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Khấu trừ BHXH: 21.8M</span>
              <button
                onClick={() => onNavigate('payslip')}
                className="text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-0.5 hover:underline"
              >
                Tạo phiếu lương <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Card 4: Tiến Độ Xử Lý Hóa Đơn & Chứng Từ OCR */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Bóc Hóa Đơn & Chứng Từ (OCR)</span>
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Receipt className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                128 Chứng Từ
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Độ chính xác: 99.8%</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Tiết kiệm 45h nhập liệu</span>
              <button
                onClick={() => onNavigate('documents')}
                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-0.5 hover:underline"
              >
                Đọc chứng từ <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 1: CÔNG NỢ & PHÂN TÍCH TUỔI NỢ (OFFICE) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              1. Tình Hình Công Nợ & Phân Tích Tuổi Nợ (Aging Analysis)
            </h3>
            <button
              onClick={() => onNavigate('debt')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 hover:underline"
            >
              Mở module sổ công nợ & email nhắc nợ <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* BarChart: Phân tích tuổi nợ */}
            <div className="lg:col-span-2 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-200">Phân Bổ Dư Nợ Theo Độ Tuổi Quá Hạn (Aging Buckets)</span>
                  <p className="text-[11px] text-slate-400">Theo dõi chặt chẽ các khoản nợ 60 - 90 ngày để tránh thất thoát dòng tiền</p>
                </div>
                <span className="text-slate-400">Đơn vị: Triệu VNĐ</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={debtAgingData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="range" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}M`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                      formatter={(val: any) => [`${val} Triệu VNĐ`, 'Dư nợ']}
                      labelFormatter={(label) => `Khoảng tuổi nợ: ${label}`}
                    />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                      {debtAgingData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                {debtAgingData.map((d, i) => (
                  <div key={i} className="text-center">
                    <div className="font-semibold" style={{ color: d.fill }}>{d.amount} Triệu ₫</div>
                    <div className="text-slate-400 text-[10px]">{d.label} ({d.count} HĐ)</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Donut Chart: Tỷ Lệ Đã Thu Hồi vs Quá Hạn */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs text-slate-200">Cơ Cấu Thu Hồi Dòng Tiền</span>
                <p className="text-[11px] text-slate-400">Tỷ lệ tiền đã về tài khoản so với nợ đọng cần đôn đốc</p>
              </div>

              <div className="h-52 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={debtRecoveryPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {debtRecoveryPie.map((entry, index) => (
                        <Cell key={`pie-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(val: any) => [`${val} Triệu VNĐ`, 'Số tiền']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-[10px] text-slate-400 font-medium">Tổng Thu</span>
                  <span className="text-base font-black text-white">877 Tr ₫</span>
                  <span className="text-[10px] text-emerald-400">61.5% đã về</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                {debtRecoveryPie.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-300">{item.name}</span>
                    </div>
                    <span className="font-semibold text-white">{item.value}M ({item.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Khách Hàng Nợ Lớn Cần Nhắc Nhở */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">
                ⚠️ Top 4 Khách Hàng Quá Hạn Cần Ưu Tiên Gửi Email / Thu Hồi
              </span>
              <button
                onClick={() => onNavigate('debt')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
              >
                Gửi email hàng loạt <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-800 text-xs">
              {topDebtors.map((c) => (
                <div key={c.id} className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xs">
                      !
                    </div>
                    <div>
                      <div className="font-bold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-400">{c.id} · Quá hạn: <span className="text-rose-400 font-semibold">{c.overdue}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-bold text-rose-400">{c.amount}</div>
                      <span className="text-[10px] text-slate-400">{c.status}</span>
                    </div>
                    <button
                      onClick={() => onNavigate('debt')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 transition"
                    >
                      <Mail className="w-3 h-3" /> Nhắc nợ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: DOANH THU ĐƠN HÀNG & KÊNH PHÂN PHỐI (OFFICE) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-cyan-400" />
              2. Tổng Doanh Thu Đơn Hàng & Hiệu Suất Kênh Bán (Zalo / Chat / B2B)
            </h3>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 hover:underline"
            >
              Mở module bóc đơn hàng từ Zalo / Chat <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* AreaChart: Doanh Thu Theo Tuần vs Chỉ Tiêu */}
            <div className="lg:col-span-2 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-200">Biểu Đồ Doanh Thu Thực Tế vs Chỉ Tiêu (Kế Hoạch)</span>
                  <p className="text-[11px] text-slate-400">Xu hướng tăng trưởng liên tục qua các tuần trong tháng</p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" /> Thực tế
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> Chỉ tiêu
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weeklyRevenueData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="officeRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}M`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                      formatter={(val: any, name: any) => [
                        `${val} Triệu VNĐ`,
                        name === 'revenue' ? 'Doanh thu thực tế' : 'Chỉ tiêu giao',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#officeRevGrad)"
                    />
                    <Line
                      type="monotone"
                      dataKey="target"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                {weeklyRevenueData.map((w, idx) => (
                  <div key={idx} className="text-center">
                    <div className="font-bold text-cyan-400">{w.revenue} Triệu ₫</div>
                    <div className="text-slate-400 text-[10px]">{w.orders} đơn ({w.week})</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Donut Chart: Cơ cấu kênh bán hàng */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs text-slate-200">Tỷ Trọng Nguồn Đơn Hàng</span>
                <p className="text-[11px] text-slate-400">Kênh Zalo Chat & B2B chiếm trên 76% tổng doanh số</p>
              </div>

              <div className="h-52 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={orderChannelPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {orderChannelPie.map((entry, index) => (
                        <Cell key={`chan-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(val: any) => [`${val} Triệu VNĐ`, 'Doanh thu']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-[10px] text-slate-400">Zalo OA</span>
                  <span className="text-base font-black text-sky-400">42%</span>
                  <span className="text-[10px] text-slate-400">355 Triệu ₫</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                {orderChannelPie.map((ch, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                      <span className="text-slate-300">{ch.name}</span>
                    </div>
                    <span className="font-semibold text-white">{ch.value}M ({ch.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Mặt Hàng Bán Chạy Nhất (Bóc từ Zalo / Chat) */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">
                📦 Top 4 Mặt Hàng Bán Chạy Nhất (Bóc tách dữ liệu từ Tin nhắn Zalo / Chat)
              </span>
              <button
                onClick={() => onNavigate('orders')}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
              >
                Tải bảng kê chi tiết <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-800 text-xs">
              {topSellingProducts.map((p) => (
                <div key={p.code} className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs">
                      📦
                    </div>
                    <div>
                      <div className="font-bold text-white">{p.name}</div>
                      <div className="text-[11px] text-slate-400">{p.code} · Số lượng: <span className="text-cyan-400 font-semibold">{p.orders} đơn đặt</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{p.revenue}</div>
                      <span className="text-[10px] text-emerald-400 font-medium">{p.growth}</span>
                    </div>
                    <button
                      onClick={() => onNavigate('orders')}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1 transition"
                    >
                      Bóc đơn
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 3: CHI PHÍ LƯƠNG & CHỨNG TỪ DOANH NGHIỆP (OFFICE) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-400" />
              3. Cơ Cấu Quỹ Lương & Tiến Độ Xử Lý Chứng Từ Doanh Nghiệp
            </h3>
            <button
              onClick={() => onNavigate('payslip')}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 hover:underline"
            >
              Mở module tạo phiếu lương theo mẫu chuẩn DN <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Quỹ Lương Theo Phòng Ban */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-200">Phân Bổ Quỹ Lương Theo Khối Phòng Ban</span>
                  <p className="text-[11px] text-slate-400">Tổng quỹ lương: 198.5 Triệu VNĐ · 15 Cán bộ nhân viên</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-bold">
                  Kỳ Tháng 10/2026
                </span>
              </div>

              <div className="space-y-3">
                {departmentPayrollData.map((dept, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                        {dept.dept}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">{dept.count} người</span>
                        <span className="font-bold text-white">{dept.amount} Triệu ₫</span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          ({((dept.amount / 198.5) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(dept.amount / 198.5) * 100}%`,
                          backgroundColor: dept.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5 text-teal-300">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  Mẫu phiếu lương chuẩn DN:
                </span>
                <span className="font-medium">Đã kích hoạt template chuẩn (.xlsx / .docx)</span>
                <button
                  onClick={() => onNavigate('payslip')}
                  className="px-2.5 py-1 bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 rounded-lg text-[11px] font-bold transition"
                >
                  Xuất file ngay
                </button>
              </div>
            </div>

            {/* Bóc Hóa Đơn & Đối Chiếu 2 File */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs text-slate-200">Hiệu Quả Tự Động Hóa Chứng Từ & Đối Chiếu Kho</span>
                <p className="text-[11px] text-slate-400">Tự động bóc tách hóa đơn VAT và đối soát 2 file Kế toán vs Kho</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 space-y-1">
                  <div className="text-slate-400 text-[11px]">Hóa đơn VAT đã bóc OCR</div>
                  <div className="text-xl font-bold text-white">128 HĐ</div>
                  <div className="text-[10px] text-emerald-400 font-medium">100% đúng MST & tiền thuế</div>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 space-y-1">
                  <div className="text-slate-400 text-[11px]">Lệch số liệu File Kho vs Bán Hàng</div>
                  <div className="text-xl font-bold text-amber-400">3 Dòng Lệch</div>
                  <div className="text-[10px] text-amber-300 font-medium">Đã phát hiện tự động</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs space-y-1.5">
                <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-indigo-400" />
                  Chứng Từ & Đối Soát Gần Nhất:
                </div>
                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>• Bóc tách hóa đơn nguyên liệu tháng 10:</span>
                    <span className="text-emerald-400 font-bold">128 file hoàn tất</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>• Ghép file Bán hàng A vs File Kế toán B:</span>
                    <span className="text-cyan-400 font-bold">2.450 dòng khớp 99.8%</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onNavigate('reconcile')}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition border border-slate-700"
                >
                  <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" /> Đối chiếu 2 file
                </button>
                <button
                  onClick={() => onNavigate('documents')}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition border border-slate-700"
                >
                  <Receipt className="w-3.5 h-3.5 text-indigo-400" /> Đọc chứng từ OCR
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: DẢI THAO TÁC NHANH VĂN PHÒNG (5 MODULE) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          <button
            onClick={() => onNavigate('debt')}
            className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-emerald-500/50 text-left transition flex items-center justify-between group"
          >
            <div>
              <div className="text-xs font-bold text-white group-hover:text-emerald-300">1. Sổ Công Nợ & Email</div>
              <div className="text-[11px] text-slate-400">Gán công thức sống & PDF</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition" />
          </button>

          <button
            onClick={() => onNavigate('reconcile')}
            className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-cyan-500/50 text-left transition flex items-center justify-between group"
          >
            <div>
              <div className="text-xs font-bold text-white group-hover:text-cyan-300">2. Ghép & Đối Chiếu 2 File</div>
              <div className="text-[11px] text-slate-400">Tìm sai lệch kho & bán hàng</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition" />
          </button>

          <button
            onClick={() => onNavigate('payslip')}
            className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-teal-500/50 text-left transition flex items-center justify-between group"
          >
            <div>
              <div className="text-xs font-bold text-white group-hover:text-teal-300">3. Phiếu Lương Chuẩn Mẫu</div>
              <div className="text-[11px] text-slate-400">Upload & áp mẫu DN (.xlsx)</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-1 transition" />
          </button>

          <button
            onClick={() => onNavigate('orders')}
            className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-sky-500/50 text-left transition flex items-center justify-between group"
          >
            <div>
              <div className="text-xs font-bold text-white group-hover:text-sky-300">4. Bóc Đơn Zalo / Chat</div>
              <div className="text-[11px] text-slate-400">OCR ảnh & xuất bảng kê</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 group-hover:translate-x-1 transition" />
          </button>

          <button
            onClick={() => onNavigate('documents')}
            className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-indigo-500/50 text-left transition flex items-center justify-between group"
          >
            <div>
              <div className="text-xs font-bold text-white group-hover:text-indigo-300">5. Đọc Chứng Từ OCR</div>
              <div className="text-[11px] text-slate-400">Hóa đơn đỏ VAT & biên lai</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition" />
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER GIAO DIỆN PHÂN HỆ NGÂN HÀNG (BANKING)
  // ==========================================
  return (
    <div className={`space-y-6 max-w-7xl transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
      {/* Top Header Ngân Hàng */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-amber-500/40 shadow-lg shadow-amber-950/20">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center font-bold text-slate-950 text-xl shadow-md shadow-amber-500/20 shrink-0">
              <Landmark className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  Dashboard Nghiệp Vụ Ngân Hàng & Thẩm Định Tín Dụng
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
                  🏛️ BANK PRO ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Theo dõi hợp nhất: Quy Mô Tín Dụng · Phân Nhóm Nợ CIC · Thẩm Định Sao Kê & Red Flags · Chăm Sóc Đáo Hạn Vay & STK
              </p>
            </div>
          </div>
        </div>

        {/* Action & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setPeriod('current')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                period === 'current' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tháng 10/2026
            </button>
            <button
              onClick={() => setPeriod('prev')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                period === 'prev' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tháng 09/2026
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                period === 'quarter' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Quý 3/2026
            </button>
          </div>

          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            title="Làm mới số liệu ngân hàng"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={() => onSwitchBranch('office')}
            className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-emerald-950/40 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 font-semibold text-xs flex items-center gap-1.5 transition shadow-sm"
            title="Chuyển sang nhánh nghiệp vụ Văn Phòng"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chuyển Nhánh VP</span>
          </button>

          <button
            onClick={onOpenLogin}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition"
            title="Đổi tài khoản đăng nhập hoặc vai trò"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>Đổi Vai Trò</span>
          </button>
        </div>
      </div>

      {/* User Context Banner */}
      <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
            {user.name.split(' ').slice(-1)[0]?.charAt(0) || 'B'}
          </div>
          <div>
            <span className="text-slate-300">Đang thao tác: </span>
            <strong className="text-white font-bold">{user.name}</strong>
            <span className="text-amber-400 font-medium"> ({user.roleTitle})</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>Chế độ: <strong className="text-amber-300">Ngân Hàng & Tín Dụng Pro</strong></span>
          <span>•</span>
          <span>Chỉ số lọc: <strong className="text-white">Toàn bộ 3 Module Tín Dụng</strong></span>
        </div>
      </div>

      {/* 4 KPI HIGHLIGHTS CARDS - NGÂN HÀNG */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Quy Mô Tín Dụng Vay */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-amber-500/40 transition flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Quy Mô Tín Dụng Vay</span>
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Landmark className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              7.280.000.000 ₫
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+14.2% tăng trưởng tín dụng YTD</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">86 khoản vay đang giải ngân</span>
            <button
              onClick={() => onNavigate('portfolio')}
              className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-0.5 hover:underline"
            >
              Danh mục <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Tỷ Lệ Nợ Xấu NPL */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Tỷ Lệ Nợ Xấu NPL (Nhóm 3-5)</span>
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Percent className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              1.45%
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-emerald-300 font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>Quy chuẩn NHNN an toàn (&lt; 3.0%)</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Tổng nợ xấu: 105.5 Tr ₫</span>
            <button
              onClick={() => onNavigate('cic')}
              className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 hover:underline"
            >
              Xem CIC <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: Huy Động STK & Tiết Kiệm Đến Hạn */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Huy Động STK & Tiết Kiệm</span>
              <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Wallet className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              12.450.000.000 ₫
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-cyan-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>5 sổ sắp đáo hạn trong 30 ngày tới</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">2.35 Tỷ cần chăm sóc tái tục</span>
            <button
              onClick={() => onNavigate('portfolio')}
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-0.5 hover:underline"
            >
              Chăm sóc STK <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 4: Cảnh Báo Red Flags & Thẩm Định */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 hover:border-red-500/40 transition flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Chỉ Số Rủi Ro & Red Flags</span>
              <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              15 Cảnh Báo Sớm
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-rose-400 font-medium">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>3 ca nghi vấn tiền ảo/cá độ</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">DTI trung bình: 42.8%</span>
            <button
              onClick={() => onNavigate('statement')}
              className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-0.5 hover:underline"
            >
              Thẩm định <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: PHÂN BỔ 5 NHÓM NỢ CIC (BANKING) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-amber-400" />
            1. Phân Loại Dư Nợ Theo 5 Nhóm Nợ Chuẩn CIC & Giám Sát Nợ Xấu
          </h3>
          <button
            onClick={() => onNavigate('cic')}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline"
          >
            Mở module bóc tách báo cáo CIC & BCTC <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Nhóm nợ CIC Ngân hàng (Progress Breakdown) */}
          <div className="lg:col-span-2 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-200">Cơ Cấu 5 Nhóm Nợ Toàn Danh Mục Tín Dụng</span>
                <p className="text-[11px] text-slate-400">Tổng quy mô tín dụng: 7.28 Tỷ VNĐ · Tỷ lệ nợ xấu NPL (Nhóm 3-5): 1.45%</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                Hạn Mức An Toàn NHNN
              </span>
            </div>

            <div className="space-y-3">
              {cicGroupsData.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.group}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-4">{item.desc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px]">{item.customers} khách</span>
                      <span className="font-bold text-white">
                        {item.balance >= 1000 ? `${(item.balance / 1000).toFixed(2)} Tỷ` : `${item.balance} Tr`} ₫
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">({item.percent}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(item.percent, 2)}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2 text-amber-300">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Cảnh báo Nợ Cần Chú Ý (Nhóm 2): </strong>
                  473 Triệu ₫ (8 khách hàng cần đôn đốc ngay trước kỳ hạn chốt số)
                </span>
              </span>
              <button
                onClick={() => onNavigate('portfolio')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition shrink-0 ml-2 shadow-sm"
              >
                Xử lý nợ Nhóm 2
              </button>
            </div>
          </div>

          {/* Khả Năng Trả Nợ (DTI) & Tỷ Lệ An Toàn */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
            <div>
              <span className="font-bold text-xs text-slate-200">Đánh Giá Năng Lực Trả Nợ (DTI)</span>
              <p className="text-[11px] text-slate-400">Tỷ lệ nghĩa vụ nợ trên tổng thu nhập khách vay</p>
            </div>

            <div className="space-y-2">
              {dtiRiskData.map((d, i) => (
                <div key={i} className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="text-white font-bold">{d.range}</span>
                      <span className="text-slate-400 text-[10px]">({d.label})</span>
                    </div>
                    <span className="font-mono font-bold" style={{ color: d.fill }}>{d.percent}%</span>
                  </div>
                  <div className="text-[10px] text-slate-400">{d.note}</div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-1 text-slate-300">
              <div className="flex items-center justify-between">
                <span>DTI Bình quân hồ sơ:</span>
                <span className="font-bold text-emerald-400">42.8% (Tiêu chuẩn)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Hệ số CAR an toàn vốn:</span>
                <span className="font-bold text-cyan-400">11.6% (Vượt chuẩn 8%)</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('statement')}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition border border-slate-700"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" /> Thẩm định hồ sơ DTI chi tiết
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: DÒNG TIỀN SAO KÊ & RED FLAGS CẢNH BÁO SỚM (BANKING) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            2. Phân Tích Dòng Tiền Sao Kê & Cảnh Báo Rủi Ro (Red Flags)
          </h3>
          <button
            onClick={() => onNavigate('statement')}
            className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 hover:underline"
          >
            Mở module thẩm định sao kê & bóc tách Red Flags <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Biểu đồ luân chuyển dòng tiền sao kê */}
          <div className="lg:col-span-2 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-200">Dòng Tiền Luân Chuyển Hàng Tuần (Cash In vs Cash Out)</span>
                <p className="text-[11px] text-slate-400">Xác thực thu nhập thực tế và khả năng tích lũy trả nợ của khách hàng</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Tiền vào (In)
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Tiền ra (Out)
                </span>
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" /> Số dư duy trì
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={statementFlowWeekly} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}M`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: any, name: any) => [
                      `${val} Triệu VNĐ`,
                      name === 'cashIn' ? 'Dòng tiền vào' : name === 'cashOut' ? 'Dòng tiền ra' : 'Số dư duy trì',
                    ]}
                  />
                  <Bar dataKey="cashIn" fill="#10B981" radius={[6, 6, 0, 0]} barSize={24} />
                  <Bar dataKey="cashOut" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={24} />
                  <Line type="monotone" dataKey="balance" stroke="#06B6D4" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px]">
              {statementFlowWeekly.map((s, idx) => (
                <div key={idx} className="text-center">
                  <div className="font-bold text-emerald-400">+{s.cashIn}M / -{s.cashOut}M</div>
                  <div className="text-slate-400 text-[10px]">Dư: {s.balance}M ({s.week})</div>
                </div>
              ))}
            </div>
          </div>

          {/* Red Flags Chi Tiết */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
            <div>
              <span className="font-bold text-xs text-rose-400 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4" /> Danh Mục Red Flags Cần Chú Ý
              </span>
              <p className="text-[11px] text-slate-400">Các dấu hiệu rủi ro cao phát hiện từ dữ liệu sao kê</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-1">
                <div className="flex items-center justify-between font-bold text-rose-300">
                  <span>Giao dịch Tiền Ảo / Binance:</span>
                  <span className="text-rose-400 font-mono">3 ca (45 Tr)</span>
                </div>
                <p className="text-[10px] text-slate-300">Chuyển tiền mua USDT P2P, tài khoản nhận cá nhân nghi vấn.</p>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-1">
                <div className="flex items-center justify-between font-bold text-amber-300">
                  <span>Chuyển tiền tròn số bất thường:</span>
                  <span className="text-amber-400 font-mono">8 ca (300 Tr)</span>
                </div>
                <p className="text-[10px] text-slate-300">Dòng tiền chuyển 50M, 100M lúc đêm khuya không có nội dung rõ ràng.</p>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-1">
                <div className="flex items-center justify-between font-bold text-rose-300">
                  <span>Nợ vay tiêu dùng ngoài luồng:</span>
                  <span className="text-rose-400 font-mono">4 ca (12 Tr/th)</span>
                </div>
                <p className="text-[10px] text-slate-300">Có phát sinh trích nợ cho các công ty tài chính FE Credit, Mirae Asset.</p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('statement')}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-md shadow-rose-950/40"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Quét hồ sơ rủi ro ngay
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: DANH MỤC NỢ VAY & SỔ TIẾT KIỆM SẮP ĐẾN HẠN (BANKING) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BellRing className="w-5 h-5 text-amber-400" />
            3. Chăm Sóc Danh Mục Nợ Vay & Đáo Hạn Sổ Tiết Kiệm (30 Ngày Tới)
          </h3>
          <button
            onClick={() => onNavigate('portfolio')}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline"
          >
            Mở module quản lý danh mục tín dụng & STK <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              📅 Danh sách Khách hàng Vay & Gửi tiết kiệm cần liên hệ sớm
            </span>
            <span className="text-slate-400">Tổng quy mô theo dõi: 3.05 Tỷ VNĐ</span>
          </div>
          <div className="divide-y divide-slate-800 text-xs">
            {upcomingCreditItems.map((item, idx) => (
              <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    item.type === 'loan' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  }`}>
                    {item.type === 'loan' ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{item.name}</span>
                      <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                        item.type === 'loan' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
                      }`}>
                        {item.product}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      SĐT: <span className="text-slate-300 font-mono">{item.phone}</span> · Đến hạn: <span className="text-white font-semibold">{item.dueDate}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="text-right">
                    <div className="font-bold text-white text-sm">
                      {item.amount >= 1000000000 ? `${(item.amount / 1000000000).toFixed(2)} Tỷ ₫` : `${(item.amount / 1000000).toFixed(0)} Tr ₫`}
                    </div>
                    <span className={`text-[11px] font-semibold ${
                      item.daysLeft <= 5 ? 'text-rose-400' : 'text-amber-400'
                    }`}>
                      Còn {item.daysLeft} ngày ({item.priority})
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate('portfolio')}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 transition shadow-sm"
                  >
                    <MessageSquareText className="w-3 h-3" /> Chăm sóc
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: DẢI THAO TÁC NHANH NGÂN HÀNG (5 MODULE) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
        <button
          onClick={() => onNavigate('statement')}
          className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-amber-500/50 text-left transition flex items-center justify-between group"
        >
          <div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300">6. Thẩm Định Sao Kê & Red Flags</div>
            <div className="text-[11px] text-slate-400">Rà soát cờ đỏ, tiền ảo & DTI</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition" />
        </button>

        <button
          onClick={() => onNavigate('cic')}
          className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-amber-500/50 text-left transition flex items-center justify-between group"
        >
          <div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300">7. Bóc Tách CIC / BCTC</div>
            <div className="text-[11px] text-slate-400">Phân 5 nhóm nợ & thẩm định DN</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition" />
        </button>

        <button
          onClick={() => onNavigate('portfolio')}
          className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-amber-500/50 text-left transition flex items-center justify-between group"
        >
          <div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300">8. Nhắc Nợ Vay & Đáo Hạn STK</div>
            <div className="text-[11px] text-slate-400">Chăm sóc danh mục ngân hàng</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition" />
        </button>

        <button
          onClick={() => onNavigate('collateral')}
          className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-emerald-500/50 text-left transition flex items-center justify-between group"
        >
          <div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-300">9. Bóc Tách Sổ Đỏ & LTV</div>
            <div className="text-[11px] text-slate-400">Định giá TSBĐ & công thức sống</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition" />
        </button>

        <button
          onClick={() => onNavigate('proposal')}
          className="p-3.5 bg-slate-900 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-emerald-500/50 text-left transition flex items-center justify-between group"
        >
          <div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-300">10. Tờ Trình Vay & Refinance</div>
            <div className="text-[11px] text-slate-400">Xuất file Word mẫu & lịch trả nợ</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition" />
        </button>
      </div>
    </div>
  );
}

// ==========================================
// MODAL ĐĂNG NHẬP & LỰA CHỌN PHÂN HỆ NGHIỆP VỤ
// ==========================================
// ==========================================
// MODAL ĐĂNG NHẬP & XÁC THỰC NGƯỜI DÙNG & LỰA CHỌN PHÂN HỆ
// ==========================================
function LoginBranchModal({
  currentUser,
  onSave,
  onClose,
}: {
  currentUser: UserSession;
  onSave: (u: UserSession) => void;
  onClose: () => void;
}) {
  const [selectedBranch, setSelectedBranch] = useState<BusinessBranch>(currentUser.branch);
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [roleTitle, setRoleTitle] = useState(currentUser.roleTitle);
  const [password, setPassword] = useState('123456');
  const [loginLoading, setLoginLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  const presets = [
    {
      label: 'Kế toán trưởng & QL Vận hành',
      name: 'Nguyễn Thùy Linh',
      email: 'thuy.linh@vietfintech.vn',
      role: 'Kế toán trưởng & QL Vận hành',
      branch: 'office' as BusinessBranch,
      desc: 'Quản lý công nợ, ghép file kho, phiếu lương DN, OCR đơn Zalo (Ẩn ngân hàng)',
    },
    {
      label: 'Chuyên viên Tín dụng & Thẩm định',
      name: 'Trần Minh Đức',
      email: 'duc.tran@vietcombank.com.vn',
      role: 'Chuyên viên Tín dụng & QLRR',
      branch: 'banking' as BusinessBranch,
      desc: 'Thẩm định sao kê tài khoản, rà soát Red Flags, bóc tách CIC & BCTC',
    },
    {
      label: 'Quản lý Bán hàng & CSKH Zalo',
      name: 'Lê Hoàng Nam',
      email: 'hoangnam.sales@giaiphapviet.vn',
      role: 'Quản lý Bán hàng & CSKH',
      branch: 'office' as BusinessBranch,
      desc: 'Bóc đơn hàng Zalo đa ảnh, đối chiếu công nợ đại lý phân phối',
    },
    {
      label: 'Giám đốc Chi nhánh Ngân hàng',
      name: 'Phạm Bích Ngọc',
      email: 'ngoc.pb@vietinbank.com.vn',
      role: 'Giám đốc Chi nhánh & QHKH',
      branch: 'banking' as BusinessBranch,
      desc: 'Điều hành danh mục tín dụng, kiểm soát nợ xấu NPL, chăm sóc STK lớn',
    },
    {
      label: 'Giám đốc Tài chính CFO & Ban Giám Đốc',
      name: 'Đặng Quốc Việt',
      email: 'viet.dang@vietcorp.vn',
      role: 'Giám đốc Tài chính CFO & Ban Giám đốc',
      branch: 'all' as BusinessBranch,
      desc: 'Toàn quyền truy cập cả 12 Module Văn phòng & Tín dụng Ngân hàng Pro',
    },
  ];

  const handleApplyPreset = (p: typeof presets[0]) => {
    setSelectedBranch(p.branch);
    setName(p.name);
    setEmail(p.email);
    setRoleTitle(p.role);
    setPassword('123456');
    setAuthMsg(`Đã chọn hồ sơ: ${p.name} (${p.label})`);
  };

  const handleBranchSelect = (b: BusinessBranch) => {
    setSelectedBranch(b);
    if (b === 'office' && roleTitle.includes('Tín dụng')) {
      setRoleTitle('Kế toán trưởng & QL Vận hành');
    } else if (b === 'banking' && roleTitle.includes('Kế toán')) {
      setRoleTitle('Chuyên viên Tín dụng & QLRR');
    } else if (b === 'all' && !roleTitle.includes('CFO')) {
      setRoleTitle('Giám đốc Tài chính CFO & Ban Giám đốc');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setAuthMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || 'Người dùng',
          email: email.trim() || 'user@example.com',
          branch: selectedBranch,
          roleTitle: roleTitle.trim() || (selectedBranch === 'office' ? 'Chuyên viên Văn Phòng' : 'Chuyên viên Ngân Hàng'),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Đăng nhập không thành công');

      onSave({
        name: data.user?.name || name.trim() || 'Người dùng',
        email: data.user?.email || email.trim() || 'user@example.com',
        branch: selectedBranch,
        roleTitle: data.user?.roleTitle || roleTitle.trim(),
        token: data.user?.token || 'session_' + Date.now(),
        loginAt: new Date().toISOString(),
      });
    } catch {
      onSave({
        name: name.trim() || 'Người dùng',
        email: email.trim() || 'user@example.com',
        branch: selectedBranch,
        roleTitle: roleTitle.trim() || (selectedBranch === 'office' ? 'Chuyên viên Văn Phòng' : 'Chuyên viên Ngân Hàng'),
        token: 'session_local_' + Date.now(),
        loginAt: new Date().toISOString(),
      });
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20">
              X
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Đăng Nhập & Xác Thực Tài Khoản Người Dùng
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Đăng nhập để lưu phiên làm việc, tự động cấu hình phân quyền và lọc module phù hợp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {authMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{authMsg}</span>
            </div>
          )}

          {/* STEP 1: CHỌN NHÓM PHÂN HỆ */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                1. Chọn phân hệ bạn phụ trách (Sẽ ẩn module không liên quan để tránh rối):
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option 1: Văn Phòng */}
              <button
                type="button"
                onClick={() => handleBranchSelect('office')}
                className={`p-3.5 rounded-2xl border text-left transition relative flex flex-col justify-between ${
                  selectedBranch === 'office'
                    ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/30 ring-2 ring-emerald-500/30'
                    : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-300">
                      <Building2 className="w-5 h-5" />
                    </span>
                    {selectedBranch === 'office' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px]">
                        ✓ Đang Chọn
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-white text-sm">
                    🏢 Khối Văn Phòng
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                    Kế Toán · Zalo · Lương · OCR
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
                    Tập trung Sổ công nợ, ghép 2 file, phiếu lương, bóc đơn Zalo.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-700/50 text-[10px] text-emerald-300 font-medium">
                  ✨ Ẩn toàn bộ Ngân Hàng Pro
                </div>
              </button>

              {/* Option 2: Ngân Hàng */}
              <button
                type="button"
                onClick={() => handleBranchSelect('banking')}
                className={`p-3.5 rounded-2xl border text-left transition relative flex flex-col justify-between ${
                  selectedBranch === 'banking'
                    ? 'bg-gradient-to-br from-amber-950/60 to-slate-900 border-amber-500 shadow-lg shadow-amber-950/30 ring-2 ring-amber-500/30'
                    : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300">
                      <Landmark className="w-5 h-5" />
                    </span>
                    {selectedBranch === 'banking' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px]">
                        ✓ Đang Chọn
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-white text-sm">
                    🏛️ Ngân Hàng Pro
                  </div>
                  <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                    Tín Dụng · Sao Kê · CIC · LTV
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
                    Tập trung rà soát Red Flags sao kê, phân loại CIC, BCTC, Tờ trình vay.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-700/50 text-[10px] text-amber-300 font-medium">
                  🎯 Chuyên sâu nghiệp vụ tín dụng
                </div>
              </button>

              {/* Option 3: Toàn Bộ */}
              <button
                type="button"
                onClick={() => handleBranchSelect('all')}
                className={`p-3.5 rounded-2xl border text-left transition relative flex flex-col justify-between ${
                  selectedBranch === 'all'
                    ? 'bg-gradient-to-br from-indigo-950/60 to-slate-900 border-indigo-500 shadow-lg shadow-indigo-950/30 ring-2 ring-indigo-500/30'
                    : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-300">
                      <Layers className="w-5 h-5" />
                    </span>
                    {selectedBranch === 'all' && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-slate-950 font-bold text-[9px]">
                        ✓ Đang Chọn
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-white text-sm">
                    🌐 Toàn Bộ Nghiệp Vụ
                  </div>
                  <div className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                    Ban Giám Đốc · CFO · Kiểm Toán
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
                    Hiển thị đầy đủ cả 12 Module Văn phòng và Ngân hàng không ẩn mục nào.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-700/50 text-[10px] text-indigo-300 font-medium">
                  💼 Dành cho quản lý cấp cao
                </div>
              </button>
            </div>
          </div>

          {/* STEP 2: TÙY CHỌN 1-CLICK TÀI KHOẢN MẪU */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>2. Chọn nhanh hồ sơ mẫu có sẵn (1 chạm):</span>
              <span className="text-[10px] text-slate-500">Tự động điền quyền & email</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="p-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-left transition flex items-center justify-between group"
                >
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white group-hover:text-emerald-400 truncate flex items-center gap-1.5">
                      <span>{p.branch === 'office' ? '🏢' : p.branch === 'banking' ? '🏛️' : '🌐'}</span>
                      <span>{p.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{p.role}</div>
                  </div>
                  <span className="text-[10px] text-slate-500 group-hover:text-white px-2 py-1 rounded bg-slate-700/60 shrink-0">
                    Chọn
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 3: THÔNG TIN TÀI KHOẢN & XÁC THỰC */}
          <div className="space-y-3 pt-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              3. Thông tin tài khoản & Mật khẩu xác thực:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Họ và tên người dùng</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập họ và tên..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Email làm việc</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Mật khẩu / Mã PIN bảo mật</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs pl-8 font-mono"
                    required
                  />
                  <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Chức vụ / Vị trí công tác</label>
                <input
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Ví dụ: Kế toán trưởng, Chuyên viên Tín dụng, Giám đốc..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
                  required
                />
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition"
            >
              Hủy bỏ
            </button>

            <button
              type="submit"
              disabled={loginLoading}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg ${
                selectedBranch === 'office'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-emerald-600/30'
                  : selectedBranch === 'banking'
                  ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              }`}
            >
              {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Đăng Nhập & Mở Phân Hệ {selectedBranch === 'office' ? 'Văn Phòng' : selectedBranch === 'banking' ? 'Ngân Hàng' : 'Toàn Bộ'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 1. MODULE CÔNG NỢ & EMAIL NHẮC NỢ
// ==========================================
function DebtModule({
  onCopy,
  copiedKey,
  onNavigateAccountSettings,
}: {
  onCopy: (text: string, k: string) => void;
  copiedKey: string | null;
  onNavigateAccountSettings?: () => void;
}) {
  const [debtFile, setDebtFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Trích xuất tài khoản thụ hưởng từ mục riêng
  const [bankConfig, setBankConfig] = useState<any>(() => {
    try {
      const local = localStorage.getItem('vietqr_bank_account_config');
      if (local) return JSON.parse(local);
    } catch {}
    return {
      bankName: 'VietinBank (Ngân hàng TMCP Công Thương Việt Nam)',
      accountNo: '102868889999',
      accountName: 'CONG TY CP CONG NGHE & THUONG MAI ANH DUONG',
      bankBin: '970415',
      transferSyntax: '[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY',
    };
  });
  const [qrModalCustomer, setQrModalCustomer] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/settings/bank-account')
      .then((r) => r.json())
      .then((data) => {
        if (data?.accountNo) {
          setBankConfig(data);
          try {
            localStorage.setItem('vietqr_bank_account_config', JSON.stringify(data));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      if (useSample) {
        fd.append('use_sample', 'true');
        fd.append('use_sample_bank', 'true');
      } else {
        if (!debtFile) {
          throw new Error('Vui lòng chọn File Sổ Công Nợ hoặc bấm "Dùng Dữ Liệu Mẫu".');
        }
        fd.append('debt_file', debtFile);
        if (bankFile) fd.append('bank_file', bankFile);
      }

      const res = await fetch('/api/debt/process', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi xử lý công nợ');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
            1. Đối Chiếu Công Nợ & Email Nhắc Nợ Tự Động
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Tự động gán công thức tính số dư còn nợ <code className="text-emerald-300 bg-slate-800 px-1 py-0.5 rounded text-xs">=D{'{r}'}-E{'{r}'}</code>,
            tô màu cảnh báo nợ quá hạn, đối chiếu sao kê ngân hàng và soạn sẵn email, xuất PDF thông báo công nợ chuẩn Unicode Arial/Tahoma kèm mã VietQR.
          </p>
        </div>
        <button
          onClick={() => handleSubmit(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition shadow-sm"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          ⚡ Nạp dữ liệu mẫu thử ngay
        </button>
      </div>

      {/* THẺ TRÍCH XUẤT TÀI KHOẢN THANH TOÁN TỰ ĐỘNG */}
      <div className="bg-slate-900/90 p-4 rounded-2xl border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
              <span>⚡ Tài Khoản Thụ Hưởng VietQR:</span>
              <span className="text-emerald-400 font-mono font-bold bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                {bankConfig.bankName?.split(' ')[0]} · STK: {bankConfig.accountNo}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                Đang Trích Xuất Tự Động
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Chủ tài khoản: <strong className="text-slate-200">{bankConfig.accountName}</strong> · Tự động nạp font Unicode hệ thống (Arial/Tahoma) không vỡ dấu và nhúng mã VietQR vào phiếu thông báo nợ PDF.
            </p>
          </div>
        </div>

        {onNavigateAccountSettings && (
          <button
            type="button"
            onClick={onNavigateAccountSettings}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition shrink-0"
          >
            <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mục Cấu Hình Riêng →</span>
          </button>
        )}
      </div>

      {/* Input panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            File Sổ Công Nợ (.xlsx, .csv) <span className="text-emerald-400">*</span>
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => setDebtFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">Gồm cột: Mã KH, Tên Khách Hàng, Phải Thu, Đã Thu (tùy chọn), Email, Hạn TT</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            File Sao Kê Ngân Hàng (.xlsx, .csv - Tùy chọn để khớp tiền đã về)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => setBankFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">AI tự động quét diễn giải giao dịch chứa Mã KH hoặc Tên KH để cộng dồn tiền về</p>
        </div>

        <div className="md:col-span-2 pt-2 flex items-center justify-between">
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-emerald-500/20"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading ? 'Đang phân tích & tính toán...' : '🚀 Phân Tích Công Nợ & Lập Báo Cáo'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">Khách Hàng Quá Hạn</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">{result.total_overdue} khách hàng</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">⚠️</div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">Tổng Số Dư Còn Nợ</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">{result.total_remain_amount.toLocaleString()} đ</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">₫</div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">File Báo Cáo Excel Sống</div>
                <a
                  href={result.download_url}
                  className="mt-2 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs transition"
                >
                  <Download className="w-3.5 h-3.5" /> Tải Excel Báo Cáo Tuổi Nợ
                </a>
              </div>
              <FileSpreadsheet className="w-9 h-9 text-emerald-400" />
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-200">Danh sách khách hàng phát sinh công nợ quá hạn</span>
              <span className="text-xs text-slate-400">Đã gắn sẵn mẫu email & thông báo công nợ PDF Unicode + VietQR</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/40 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Mã KH & Tên</th>
                    <th className="p-3 text-right">Phải Thu</th>
                    <th className="p-3 text-right">Đã Thu</th>
                    <th className="p-3 text-right">Còn Nợ</th>
                    <th className="p-3">Hạn TT</th>
                    <th className="p-3 text-right">Thao Tác Nhắc Nợ & VietQR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {result.customers.map((c: any) => {
                    const mailto = `mailto:${c.email}?subject=${encodeURIComponent(c.email_subject)}&body=${encodeURIComponent(c.email_body)}`;
                    const parsedMemo = formatTransferSyntax(bankConfig.transferSyntax, c.id);
                    const pdfUrl = `/api/debt/pdf?kh_id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}&total=${c.total}&paid=${c.paid}&remain=${c.remain}&bank_name=${encodeURIComponent(bankConfig.bankName)}&account_no=${encodeURIComponent(bankConfig.accountNo)}&account_name=${encodeURIComponent(bankConfig.accountName)}&bank_bin=${encodeURIComponent(bankConfig.bankBin)}&syntax=${encodeURIComponent(parsedMemo)}`;
                    const qrImgUrl = `https://img.vietqr.io/image/${bankConfig.bankBin}-${bankConfig.accountNo}-compact2.png?amount=${c.remain}&addInfo=${encodeURIComponent(parsedMemo)}&accountName=${encodeURIComponent(bankConfig.accountName)}`;

                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3">
                          <span className="font-bold text-white">{c.name}</span>
                          <span className="text-slate-400 block text-[11px]">{c.id} • {c.email}</span>
                        </td>
                        <td className="p-3 text-right font-medium text-slate-200">{c.total.toLocaleString()} đ</td>
                        <td className="p-3 text-right text-emerald-400 font-medium">{c.paid.toLocaleString()} đ</td>
                        <td className="p-3 text-right text-rose-400 font-bold">{c.remain.toLocaleString()} đ</td>
                        <td className="p-3 text-slate-400">{c.due}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <a
                              href={pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-white rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                              title="In Phiếu Thông Báo Nợ PDF (Font Unicode Arial/Tahoma chuẩn tiếng Việt có dấu kèm VietQR)"
                            >
                              <FileText className="w-3 h-3 text-rose-400" /> In PDF
                            </a>
                            <button
                              type="button"
                              onClick={() => setQrModalCustomer({ ...c, parsedMemo, qrImgUrl, pdfUrl })}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                              title="Xem trước mã VietQR trích xuất tự động"
                            >
                              <QrCode className="w-3 h-3 text-emerald-400" /> VietQR
                            </button>
                            <a
                              href={`/api/debt/confirmation-doc?kh_id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}&total=${c.total}&paid=${c.paid}&remain=${c.remain}&due=${encodeURIComponent(c.due)}&email=${encodeURIComponent(c.email)}`}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                              title="Tải Biên Bản Đối Chiếu & Xác Nhận Công Nợ Word (.docx)"
                            >
                              <FileSignature className="w-3 h-3 text-cyan-400" /> Bản Word
                            </a>
                            <button
                              onClick={() => onCopy(c.email_body, `body_${c.id}`)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                              title="Copy nội dung email nhắc nợ"
                            >
                              {copiedKey === `body_${c.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-amber-400" />}
                              Copy Email
                            </button>
                            <a
                              href={mailto}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs flex items-center gap-1 shadow-sm"
                            >
                              <Mail className="w-3 h-3" /> Gửi Mail
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC MÃ VIETQR TRÍCH XUẤT */}
      {qrModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Mã VietQR Trích Xuất</h3>
              </div>
              <button
                onClick={() => setQrModalCustomer(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl flex flex-col items-center justify-center shadow-lg">
              <img
                src={qrModalCustomer.qrImgUrl}
                alt="VietQR"
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="text-center space-y-1 text-xs">
              <div className="font-bold text-white text-sm">{qrModalCustomer.name}</div>
              <div className="text-rose-400 font-bold text-base">
                {qrModalCustomer.remain.toLocaleString('vi-VN')} đ
              </div>
              <div className="text-slate-400 text-[11px]">
                {bankConfig.bankName} · STK: <span className="text-emerald-400 font-mono font-bold">{bankConfig.accountNo}</span>
              </div>
              <div className="text-cyan-300 font-mono bg-slate-800/80 px-2 py-1 rounded-lg text-[10px] inline-block">
                Nội dung: {qrModalCustomer.parsedMemo}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <a
                href={qrModalCustomer.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <FileText className="w-3.5 h-3.5" /> In Phiếu PDF Có Mã QR
              </a>
              <button
                onClick={() => setQrModalCustomer(null)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. GHÉP & ĐỐI CHIẾU 2 FILE EXCEL
// ==========================================
function ReconcileModule() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [keyA, setKeyA] = useState('');
  const [keyB, setKeyB] = useState('');
  const [valA, setValA] = useState('');
  const [valB, setValB] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      if (useSample) {
        fd.append('use_sample', 'true');
      } else {
        if (!fileA || !fileB) throw new Error('Vui lòng chọn cả 2 file A và B hoặc bấm "Nạp dữ liệu mẫu".');
        fd.append('file_a', fileA);
        fd.append('file_b', fileB);
      }
      const res = await fetch('/api/reconcile/preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đọc cấu trúc');
      setPreview(data);
      setKeyA(data.suggested_key_a);
      setKeyB(data.suggested_key_b);
      setValA(data.suggested_val_a);
      setValB(data.suggested_val_b);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    if (!preview) return;
    setRunning(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('session_id', preview.session_id);
      fd.append('key_a', keyA);
      fd.append('key_b', keyB);
      fd.append('val_a', valA);
      fd.append('val_b', valB);

      const res = await fetch('/api/reconcile/run', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đối chiếu 2 file');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileCheck2 className="w-7 h-7 text-cyan-400" />
            2. Ghép & Đối Chiếu Số Liệu 2 File Excel
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            So sánh tự động giữa 2 nguồn dữ liệu (Bán hàng vs Kho, Sổ nội bộ vs Sao kê ngân hàng, CRM vs ERP),
            phát hiện chênh lệch số tiền và đơn hàng bị sót ở từng bên.
          </p>
        </div>
        <button
          onClick={() => handlePreview(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition"
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          ⚡ Nạp 2 file mẫu thử ngay
        </button>
      </div>

      {/* Upload 2 files */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">File A (VD: Sổ Bán Hàng / Nội Bộ)</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => setFileA(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">File B (VD: Thủ Kho / Sao Kê / Kế Toán)</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => setFileB(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
        </div>

        <div className="md:col-span-2 pt-2">
          <button
            onClick={() => handlePreview(false)}
            disabled={loading}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {loading ? 'Đang đọc cấu trúc 2 file...' : '🔍 Bước 1: Đọc Cấu Trúc & Đề Xuất Cột Khóa'}
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-cyan-500/40 space-y-4">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
            <Sparkles className="w-4 h-4" />
            <span>Đã đọc cấu trúc các cột. Hãy chọn tiêu chí khớp và cột số liệu cần so sánh:</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Cột Khóa Ghép (File A):</label>
              <select
                value={keyA}
                onChange={e => setKeyA(e.target.value)}
                className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200"
              >
                {preview.cols_a.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Cột Khóa Ghép (File B):</label>
              <select
                value={keyB}
                onChange={e => setKeyB(e.target.value)}
                className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200"
              >
                {preview.cols_b.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Cột Tiền So Sánh (File A):</label>
              <select
                value={valA}
                onChange={e => setValA(e.target.value)}
                className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200"
              >
                {preview.cols_a.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Cột Tiền So Sánh (File B):</label>
              <select
                value={valB}
                onChange={e => setValB(e.target.value)}
                className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200"
              >
                {preview.cols_b.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={running}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-emerald-500/20"
          >
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {running ? 'Đang ghép & phân tích chênh lệch...' : '⚡ Bước 2: Chạy Đối Chiếu & Xuất 4 Sheet Excel'}
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Khớp Hoàn Toàn</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{result.stats.exact} bản ghi</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Lệch Số Liệu</div>
              <div className="text-2xl font-bold text-rose-400 mt-1">{result.stats.diff} bản ghi</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Chỉ Có Ở File A</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{result.stats.only_a} bản ghi</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Chỉ Có Ở File B</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{result.stats.only_b} bản ghi</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-cyan-500/30">
            <div>
              <span className="font-semibold text-sm text-cyan-300">File Excel gồm 4 Sheet:</span>
              <p className="text-xs text-slate-400 mt-0.5">Tổng Hợp Đối Chiếu • Lệch Số Liệu • Chỉ Có File A • Chỉ Có File B</p>
            </div>
            <a
              href={result.download_url}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Tải Excel Đối Chiếu (4 Sheet)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. TẠO PHIẾU LƯƠNG HÀNG LOẠT
// THEO BIỂU MẪU CHUẨN CỦA DOANH NGHIỆP
// ==========================================
function PayslipModule() {
  const [payrollFile, setPayrollFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [useSampleTemplate, setUseSampleTemplate] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<{
    filename: string;
    totalPlaceholders: number;
    detectedPlaceholders: string[];
  } | null>(null);
  const [inspectingTemplate, setInspectingTemplate] = useState(false);

  const [companyName, setCompanyName] = useState('CÔNG TY CP CÔNG NGHỆ & TÀI CHÍNH VIỆT NAM');
  const [companyAddress, setCompanyAddress] = useState('Tầng 12, Tòa nhà Landmark, Ba Đình, Hà Nội');
  const [companyTax, setCompanyTax] = useState('0109887766');
  const [exportFormat, setExportFormat] = useState<'both' | 'excel' | 'docx'>('both');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewEmp, setPreviewEmp] = useState<any | null>(null);

  // Khi người dùng upload template riêng của công ty
  const handleTemplateUpload = async (file: File | null) => {
    setTemplateFile(file);
    setUseSampleTemplate(false);
    if (!file) {
      setTemplatePreview(null);
      return;
    }

    setInspectingTemplate(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('template_file', file);
      const res = await fetch('/api/payslip/template-inspect', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không đọc được file mẫu');
      setTemplatePreview({
        filename: file.name,
        totalPlaceholders: data.totalPlaceholders || data.detectedPlaceholders?.length || 0,
        detectedPlaceholders: data.detectedPlaceholders || [],
      });
    } catch (err: any) {
      setError(`Lỗi phân tích file mẫu: ${err.message}`);
    } finally {
      setInspectingTemplate(false);
    }
  };

  // Khi người dùng chọn dùng mẫu chuẩn doanh nghiệp sẵn có
  const handleSelectSampleTemplate = async () => {
    setTemplateFile(null);
    setUseSampleTemplate(true);
    setInspectingTemplate(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('use_sample_template', 'true');
      const res = await fetch('/api/payslip/template-inspect', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đọc mẫu chuẩn');
      setTemplatePreview({
        filename: 'Mau_Phieu_Luong_Doanh_Nghiep_Chuan.xlsx',
        totalPlaceholders: data.totalPlaceholders || data.detectedPlaceholders?.length || 0,
        detectedPlaceholders: data.detectedPlaceholders || [],
      });
    } catch (err: any) {
      setError(`Lỗi nạp mẫu chuẩn: ${err.message}`);
    } finally {
      setInspectingTemplate(false);
    }
  };

  const handleGenerate = async (useSamplePayroll: boolean = false, useSampleTpl: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();

      // Bảng lương
      if (useSamplePayroll) {
        fd.append('use_sample', 'true');
      } else {
        if (!payrollFile) {
          throw new Error('Vui lòng chọn File Bảng Lương Nhân Viên (.xlsx, .csv) hoặc bấm "Nạp dữ liệu mẫu thử ngay".');
        }
        fd.append('payroll_file', payrollFile);
      }

      // Mẫu phiếu lương chuẩn doanh nghiệp
      if (useSampleTpl || useSampleTemplate) {
        fd.append('use_sample_template', 'true');
      } else if (templateFile) {
        fd.append('template_file', templateFile);
      } else {
        // Mặc định tự động dùng mẫu doanh nghiệp chuẩn AI nếu người dùng chưa chọn
        fd.append('use_sample_template', 'true');
      }

      fd.append('company_name', companyName);
      fd.append('company_address', companyAddress);
      fd.append('company_tax', companyTax);
      fd.append('export_format', exportFormat);

      const res = await fetch('/api/payslip/generate', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo phiếu lương hàng loạt');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = result?.employees
    ? result.employees.filter((emp: any) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.code.toLowerCase().includes(q) ||
          (emp.title && emp.title.toLowerCase().includes(q))
        );
      })
    : [];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-teal-400" />
            3. Tạo Phiếu Lương Hàng Loạt Chuẩn Biểu Mẫu Doanh Nghiệp
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Tải lên biểu mẫu phiếu lương đặc thù của công ty bạn (Excel <code className="text-teal-300 bg-slate-800 px-1 py-0.5 rounded text-xs">.xlsx</code> hoặc Word <code className="text-teal-300 bg-slate-800 px-1 py-0.5 rounded text-xs">.docx</code>) làm chuẩn.
            Hệ thống tự động điền dữ liệu từng nhân viên, đọc số tiền thành chữ và đóng gói ZIP.
          </p>
        </div>
        <button
          onClick={() => {
            handleSelectSampleTemplate();
            handleGenerate(true, true);
          }}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition shadow-sm"
        >
          <Sparkles className="w-4 h-4 text-teal-400" />
          ⚡ Nạp bảng lương & Mẫu DN thử ngay
        </button>
      </div>

      {/* 2 Upload Boxes Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Box 1: File Bảng Lương Nhân Viên (Data) */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                1. File Bảng Lương Nhân Viên (.xlsx, .csv) <span className="text-emerald-400">*</span>
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                Dữ Liệu Nguồn
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Bảng kê lương tổng hợp gồm các cột: Mã NV, Họ và Tên, Chức vụ, Lương cơ bản, Thưởng KPI, Phụ cấp, BHXH, Thực lĩnh...
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => setPayrollFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700"
            />
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {payrollFile ? (
                <span className="text-emerald-300 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {payrollFile.name} ({(payrollFile.size / 1024).toFixed(1)} KB)
                </span>
              ) : (
                'Chưa chọn file bảng lương'
              )}
            </span>
            <a
              href="/api/samples/bang-luong"
              className="text-teal-400 hover:text-teal-300 hover:underline flex items-center gap-1 font-medium"
            >
              <Download className="w-3 h-3" /> Tải bảng lương mẫu
            </a>
          </div>
        </div>

        {/* Box 2: Phiếu Lương Mẫu Doanh Nghiệp (Standard Template Benchmark) */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-teal-500/40 relative overflow-hidden flex flex-col justify-between space-y-3 shadow-lg shadow-teal-950/30">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-teal-400" />
                2. Phiếu Lương Mẫu Doanh Nghiệp (.xlsx, .docx) <span className="text-teal-400">* Chuẩn Mẫu</span>
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30 animate-pulse">
                Khuôn Mẫu Chuẩn
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Tải lên biểu mẫu thiết kế chuẩn của công ty bạn (logo, chữ ký, bảng thu nhập & khấu trừ).
              Hệ thống sẽ giữ <strong className="text-teal-300">100% định dạng, màu sắc và khung viền</strong> mẫu này để xuất cho từng nhân sự.
            </p>

            <input
              type="file"
              accept=".xlsx,.xls,.docx"
              onChange={e => handleTemplateUpload(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-500 bg-slate-800/80 p-2.5 rounded-xl border border-teal-500/50"
            />
          </div>

          {/* Quick template actions */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSelectSampleTemplate}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition flex items-center gap-1 font-medium ${
                  useSampleTemplate
                    ? 'bg-teal-600 text-white border-teal-400 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-teal-300 border-teal-500/30'
                }`}
              >
                <Sparkles className="w-3 h-3 text-teal-400" /> Dùng Mẫu Chuẩn Doanh Nghiệp có sẵn
              </button>

              <a
                href="/api/samples/mau-phieu-luong"
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1"
                title="Tải file Excel mẫu chuẩn doanh nghiệp để chỉnh sửa logo và bố cục"
              >
                <Download className="w-3 h-3 text-teal-400" /> Tải Mẫu Chuẩn (.xlsx) tham khảo
              </a>
            </div>

            {/* Template Status / Inspection Card */}
            {inspectingTemplate && (
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-teal-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
                <span>Đang quét các trường và bố cục trong khuôn mẫu chuẩn...</span>
              </div>
            )}

            {templatePreview && !inspectingTemplate && (
              <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-teal-200 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                    Đã nạp chuẩn mẫu: <span className="text-white font-mono">{templatePreview.filename}</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold">
                    {templatePreview.detectedPlaceholders.length} trường nhận diện
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {templatePreview.detectedPlaceholders.slice(0, 8).map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-teal-500/30 text-teal-300 font-mono"
                    >
                      {`{{${tag}}}`}
                    </span>
                  ))}
                  {templatePreview.detectedPlaceholders.length > 8 && (
                    <span className="text-[10px] text-slate-400 self-center">
                      +{templatePreview.detectedPlaceholders.length - 8} trường khác
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enterprise Info & Export Settings Card */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-teal-400" /> Cấu hình thông tin doanh nghiệp & Định dạng xuất
          </span>
          <span className="text-slate-500 text-[11px]">Thông tin xuất hiện ở tiêu đề và các mẫu phiếu lương</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Tên Doanh Nghiệp:</label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Địa Chỉ Công Ty:</label>
            <input
              value={companyAddress}
              onChange={e => setCompanyAddress(e.target.value)}
              className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Mã Số Thuế (MST):</label>
            <input
              value={companyTax}
              onChange={e => setCompanyTax(e.target.value)}
              className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-slate-200 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Export Format Selector */}
        <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-slate-800">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-300">Định dạng xuất:</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
              <input
                type="radio"
                name="export_format"
                value="both"
                checked={exportFormat === 'both'}
                onChange={() => setExportFormat('both')}
                className="text-teal-500 focus:ring-0"
              />
              <span>Gói đầy đủ: Cả Excel chuẩn mẫu (.xlsx) & Word (.docx)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
              <input
                type="radio"
                name="export_format"
                value="excel"
                checked={exportFormat === 'excel'}
                onChange={() => setExportFormat('excel')}
                className="text-teal-500 focus:ring-0"
              />
              <span>Chỉ Excel chuẩn mẫu</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
              <input
                type="radio"
                name="export_format"
                value="docx"
                checked={exportFormat === 'docx'}
                onChange={() => setExportFormat('docx')}
                className="text-teal-500 focus:ring-0"
              />
              <span>Chỉ Word (.docx)</span>
            </label>
          </div>

          <button
            onClick={() => handleGenerate(false, false)}
            disabled={loading}
            className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-teal-500/20"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? 'Đang áp dụng mẫu chuẩn & đóng gói...' : '🖨️ Xuất Hàng Loạt Phiếu Lương Theo Mẫu Chuẩn (.ZIP)'}
          </button>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Result Section */}
      {result && (
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-5">
          {/* Top Result Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <span className="text-emerald-400 font-bold text-lg flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                Đã tạo thành công {result.total_generated} phiếu lương chuẩn theo biểu mẫu doanh nghiệp!
              </span>
              <p className="text-slate-400 text-xs mt-1">
                Khuôn mẫu đã áp dụng: <strong className="text-teal-300">{result.template_applied}</strong>.
                Giữ nguyên đầy đủ logo, định dạng số, khung viền và chữ ký của doanh nghiệp.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {result.consolidated_url && (
                <a
                  href={result.consolidated_url}
                  className="bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-sm"
                  title="Tải 1 file Excel duy nhất chứa từng Sheet cho mỗi nhân viên"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Tải Sổ Excel Gộp (Đa Sheet)
                </a>
              )}
              <a
                href={result.download_url}
                className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-teal-500/20"
              >
                <Download className="w-4 h-4" /> Tải Toàn Bộ Gói ZIP Phiếu Lương
              </a>
            </div>
          </div>

          {/* Matched Tags & Warnings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.matched_tags && result.matched_tags.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                <div className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Các trường đã tự động ánh xạ với khuôn mẫu:
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.matched_tags.map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-300 border border-slate-700 font-mono"
                    >
                      ✓ {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.warnings && result.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-1.5">
                <div className="font-semibold text-amber-300 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Cảnh báo kiểm tra dữ liệu:
                </div>
                <ul className="list-disc list-inside text-xs text-amber-200/80 space-y-0.5">
                  {result.warnings.slice(0, 4).map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Employee Payslips Table */}
          {result.employees && result.employees.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-400" />
                  Danh sách phiếu lương nhân viên đã tạo ({filteredEmployees.length}/{result.employees.length})
                </span>
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm theo Mã NV hoặc Tên..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="p-3">Mã NV</th>
                      <th className="p-3">Họ và Tên</th>
                      <th className="p-3">Chức Vụ</th>
                      <th className="p-3 text-right">Lương Cơ Bản</th>
                      <th className="p-3 text-right">Thực Lĩnh (VNĐ)</th>
                      <th className="p-3">Bằng Chữ</th>
                      <th className="p-3 text-right">Tải File Đơn Lẻ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredEmployees.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 font-mono font-bold text-teal-300">{emp.code}</td>
                        <td className="p-3 font-bold text-white">{emp.name}</td>
                        <td className="p-3 text-slate-400">{emp.title || 'Nhân viên'}</td>
                        <td className="p-3 text-right font-medium text-slate-300">
                          {emp.baseSalary ? `${emp.baseSalary.toLocaleString()} đ` : '—'}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-400">
                          {emp.netSalary ? `${emp.netSalary.toLocaleString()} đ` : '—'}
                        </td>
                        <td className="p-3 text-[11px] text-slate-400 italic max-w-xs truncate" title={emp.netSalaryWords}>
                          {emp.netSalaryWords}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {emp.excel_url && (
                              <a
                                href={emp.excel_url}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg text-xs flex items-center gap-1 border border-emerald-500/30"
                                title="Tải file Excel phiếu lương chuẩn mẫu của nhân viên này"
                              >
                                <FileSpreadsheet className="w-3 h-3 text-emerald-400" /> Excel
                              </a>
                            )}
                            {emp.docx_url && (
                              <a
                                href={emp.docx_url}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg text-xs flex items-center gap-1 border border-teal-500/30"
                                title="Tải file Word in ấn của nhân viên này"
                              >
                                <FileText className="w-3 h-3 text-teal-400" /> Word
                              </a>
                            )}
                            <button
                              onClick={() => setPreviewEmp(emp)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                              title="Xem chi tiết phiếu lương"
                            >
                              <Eye className="w-3 h-3 text-cyan-400" /> Xem
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Employee Payslip Preview Modal */}
      {previewEmp && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-teal-500/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setPreviewEmp(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">{companyName}</span>
              <h3 className="text-lg font-bold text-white mt-1">PHIẾU LƯƠNG NHÂN VIÊN</h3>
              <p className="text-xs text-slate-400">{companyAddress}</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Mã nhân viên:</span>
                <span className="font-mono font-bold text-white">{previewEmp.code}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Họ và tên:</span>
                <span className="font-bold text-teal-300">{previewEmp.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Chức vụ / Bộ phận:</span>
                <span className="text-slate-200">{previewEmp.title || 'Nhân viên'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Lương cơ bản:</span>
                <span className="font-semibold text-slate-200">{previewEmp.baseSalary.toLocaleString()} đ</span>
              </div>
              <div className="flex justify-between py-2 bg-emerald-950/40 px-3 rounded-xl border border-emerald-500/30">
                <span className="font-bold text-emerald-300">THỰC LĨNH CHUYỂN KHOẢN:</span>
                <span className="font-bold text-emerald-400 text-sm">{previewEmp.netSalary.toLocaleString()} đ</span>
              </div>
              <div className="text-[11px] text-slate-400 italic pt-1">
                Số tiền bằng chữ: <span className="text-slate-300 font-medium">{previewEmp.netSalaryWords}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              {previewEmp.excel_url && (
                <a
                  href={previewEmp.excel_url}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" /> Tải Excel (.xlsx)
                </a>
              )}
              {previewEmp.docx_url && (
                <a
                  href={previewEmp.docx_url}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" /> Tải Word (.docx)
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. BÓC ĐƠN HÀNG TỪ ZALO / CHAT
// ==========================================
function OrdersModule() {
  const [files, setFiles] = useState<File[]>([]);
  const [rawText, setRawText] = useState('');
  const [colsSchema, setColsSchema] = useState(
    'Tên khách hàng, Số điện thoại, Sản phẩm, Size/Loại, Số lượng, Đơn giá, Tổng tiền, Địa chỉ'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async (useSampleText: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('task_type', 'orders');
      fd.append('columns_schema', colsSchema);

      if (useSampleText) {
        fd.append(
          'raw_text',
          'Khách Mai Anh 0918223344 đặt 2 set áo len tăm size S giá 280k/set ship qua 15 Tràng Thi, Hoàn Kiếm, HN.'
        );
      } else {
        fd.append('raw_text', rawText);
        for (const f of files) fd.append('files', f);
      }

      const res = await fetch('/api/ai/extract-batch', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi bóc tách đơn hàng');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquareText className="w-7 h-7 text-sky-400" />
            4. Bóc Đơn Hàng Từ Ảnh Tin Nhắn Zalo / Messenger
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            AI đọc ảnh chụp màn hình tin nhắn khách đặt hàng, tự động bóc tách tên, SĐT, địa chỉ, mặt hàng,
            và cảnh báo đơn hàng bị trùng lặp.
          </p>
        </div>
        <button
          onClick={() => handleExtract(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition"
        >
          <Sparkles className="w-4 h-4 text-sky-400" />
          ⚡ Thử ngay với mẫu tin nhắn chat
        </button>
      </div>

      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Ảnh Chụp Màn Hình Tin Nhắn / Bill (chọn được nhiều ảnh)
          </label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Hoặc dán đoạn chat tin nhắn khách nhắn vào đây:
          </label>
          <textarea
            rows={3}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="Ví dụ: Em ơi lấy chị 3 áo phông xanh navy size L và 2 quần short ship về số 12 Tôn Thất Tùng, Hà Nội nhé..."
            className="w-full bg-slate-800/80 p-3 rounded-xl border border-slate-700 text-xs text-slate-200 placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Cấu trúc các cột muốn xuất ra:</label>
          <input
            value={colsSchema}
            onChange={e => setColsSchema(e.target.value)}
            className="w-full bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-200"
          />
        </div>

        <button
          onClick={() => handleExtract(false)}
          disabled={loading}
          className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'AI đang bóc tách đơn hàng...' : '⚡ Bóc Tách Đơn Hàng Ra Excel'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-slate-800">
            <span className="font-semibold text-sm text-sky-400">
              ✅ Đã bóc tách {result.rows.length} đơn hàng thành công!
            </span>
            <a
              href={result.download_url}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Tải File Excel Đơn Hàng
            </a>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800 text-slate-300 font-semibold">
                <tr>
                  {Object.keys(result.rows[0] || {}).map(k => (
                    <th key={k} className="p-3">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {result.rows.map((r: any, idx: number) => (
                  <tr key={idx} className={r.Trạng_Thái_Kiểm_Tra?.includes('Trùng') ? 'bg-rose-950/30' : 'hover:bg-slate-800/40'}>
                    {Object.keys(result.rows[0] || {}).map(k => (
                      <td key={k} className="p-3">
                        {k === 'Trạng_Thái_Kiểm_Tra' ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            r[k]?.includes('Trùng') ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {r[k]}
                          </span>
                        ) : typeof r[k] === 'number' ? (
                          r[k].toLocaleString()
                        ) : (
                          String(r[k] || '')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 5. ĐỌC CHỨNG TỪ HÀNG LOẠT (OCR)
// ==========================================
function DocumentsModule() {
  const [files, setFiles] = useState<File[]>([]);
  const [colsSchema, setColsSchema] = useState(
    'Ngày chứng từ, Đơn vị bán, Số hóa đơn, Nội dung chi phí, Tiền trước thuế, Thuế VAT, Tổng thanh toán'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('task_type', 'documents');
      fd.append('columns_schema', colsSchema);
      if (!useSample) {
        for (const f of files) fd.append('files', f);
      }

      const res = await fetch('/api/ai/extract-batch', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi bóc tách chứng từ');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-indigo-400" />
            5. Đọc Chứng Từ & Hóa Đơn Hàng Loạt (OCR Thông Minh)
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Bóc tách cùng lúc hàng chục hóa đơn VAT, vé tàu xe, phiếu thu; tự động phân loại chi phí
            (Di chuyển, Ăn uống, Văn phòng phẩm) và phát hiện hóa đơn bị khai trùng lặp.
          </p>
        </div>
        <button
          onClick={() => handleProcess(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition"
        >
          <Sparkles className="w-4 h-4 text-indigo-400" />
          ⚡ Thử ngay với mẫu hóa đơn demo
        </button>
      </div>

      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Upload Hóa Đơn / Phiếu Chi / Ảnh / PDF (chọn nhiều file)
          </label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Các trường cần trích xuất:</label>
          <input
            value={colsSchema}
            onChange={e => setColsSchema(e.target.value)}
            className="w-full bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-200"
          />
        </div>

        <button
          onClick={() => handleProcess(false)}
          disabled={loading}
          className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
          {loading ? 'AI đang đọc toàn bộ chứng từ...' : '🚀 Đọc Toàn Bộ Chứng Từ & Xuất Báo Cáo'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-slate-800">
            <span className="font-semibold text-sm text-indigo-400">
              ✅ Đã hoàn thành OCR cho {result.rows.length} chứng từ!
            </span>
            <a
              href={result.download_url}
              className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Tải Excel Báo Cáo Chứng Từ
            </a>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800 text-slate-300 font-semibold">
                <tr>
                  {Object.keys(result.rows[0] || {}).map(k => (
                    <th key={k} className="p-3">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {result.rows.map((r: any, idx: number) => (
                  <tr key={idx} className={r.Trạng_Thái_Kiểm_Tra?.includes('Trùng') ? 'bg-rose-950/30' : 'hover:bg-slate-800/40'}>
                    {Object.keys(result.rows[0] || {}).map(k => (
                      <td key={k} className="p-3">
                        {k === 'Trạng_Thái_Kiểm_Tra' ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            r[k]?.includes('Trùng') ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {r[k]}
                          </span>
                        ) : typeof r[k] === 'number' ? (
                          r[k].toLocaleString()
                        ) : (
                          String(r[k] || '')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 6. THẨM ĐỊNH SAO KÊ & RED FLAGS (NGÂN HÀNG)
// ==========================================
function StatementModule() {
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [payment, setPayment] = useState(15000000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      if (useSample) {
        fd.append('use_sample', 'true');
      } else {
        if (!statementFile) throw new Error('Vui lòng chọn file sao kê ngân hàng hoặc bấm thử với mẫu có sẵn.');
        fd.append('statement_file', statementFile);
      }
      fd.append('proposed_payment', String(payment));

      const res = await fetch('/api/bank/statement-analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi thẩm định sao kê');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
            CHUYÊN SÂU TÍN DỤNG NGÂN HÀNG
          </span>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2 mt-2">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
            6. Thẩm Định Sao Kê Ngân Hàng & Quét Dấu Hiệu Rủi Ro (Red Flags)
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Bóc tách chính xác doanh thu kinh doanh thực tế (loại trừ chuyển khoản nội bộ / vốn tự có),
            tính toán hệ số trả nợ <strong>DSCR</strong> và phát hiện giao dịch cầm đồ, vay nóng, tiền ảo, đáo hạn, làm đẹp sao kê.
          </p>
        </div>
        <button
          onClick={() => handleAnalyze(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          ⚡ Nạp sao kê mẫu có sẵn Red Flags
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/90 p-5 rounded-2xl border border-amber-500/30">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Upload File Sao Kê Khách Hàng (.xlsx, .csv)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => setStatementFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Nghĩa vụ trả nợ khoản vay dự kiến (VNĐ/tháng - để tính DSCR):
          </label>
          <input
            type="number"
            value={payment}
            onChange={e => setPayment(Number(e.target.value) || 0)}
            className="w-full bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 text-xs text-slate-200"
          />
          <p className="text-[11px] text-slate-500 mt-1">DSCR = Dòng tiền ròng / Nghĩa vụ trả nợ. Chuẩn an toàn: ≥ 1.2x</p>
        </div>

        <div className="md:col-span-2 pt-2">
          <button
            onClick={() => handleAnalyze(false)}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-amber-500/20"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            {loading ? 'Đang thẩm định dòng tiền & quét Red Flags...' : '🔍 Thẩm Định Dòng Tiền & Quét Red Flags'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Doanh Thu KD Thực Tế</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{result.biz_inflow.toLocaleString()} đ</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Đã loại nội bộ: {result.internal_inflow.toLocaleString()} đ</div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Dòng Tiền Ròng (Net Cashflow)</div>
              <div className="text-xl font-bold text-cyan-400 mt-1">{result.net_cashflow.toLocaleString()} đ</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Sau chi phí & nợ khác</div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Hệ Số Trả Nợ DSCR</div>
              <div className={`text-xl font-bold mt-1 ${result.dscr >= 1.2 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.dscr}x
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{result.dscr >= 1.2 ? '✅ Đạt chuẩn an toàn' : '⚠️ Dòng tiền mỏng/Rủi ro'}</div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Cảnh Báo Red Flags</div>
              <div className="text-xl font-bold text-rose-400 mt-1">{result.red_flag_count} giao dịch</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Cầm đồ, crypto, nợ khác</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-amber-500/30">
            <div>
              <span className="font-semibold text-sm text-amber-300">Xuất Excel Thẩm Định 3 Sheet Đầy Đủ Công Thức:</span>
              <p className="text-xs text-slate-400 mt-0.5">1_Tham_Dinh_Dong_Tien • 2_Canh_Bao_Red_Flags • 3_Chi_Tiet_Sao_Ke</p>
            </div>
            <a
              href={result.download_url}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-amber-500/20"
            >
              <Download className="w-4 h-4" /> Tải Excel Báo Cáo Thẩm Định Sao Kê
            </a>
          </div>

          {result.red_flags && result.red_flags.length > 0 && (
            <div className="bg-slate-900 rounded-2xl border border-rose-500/40 overflow-hidden shadow-xl">
              <div className="p-3.5 bg-rose-950/60 border-b border-rose-500/30 flex items-center gap-2 text-rose-300 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Chi tiết các giao dịch nghi vấn / rủi ro tín dụng (Red Flags):</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-3">Ngày GD</th>
                      <th className="p-3">Nội Dung Diễn Giải</th>
                      <th className="p-3 text-right">Ghi Có</th>
                      <th className="p-3 text-right">Ghi Nợ</th>
                      <th className="p-3">Loại Cảnh Báo</th>
                      <th className="p-3">Chi Tiết Rủi Ro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {result.red_flags.map((rf: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="p-3 text-slate-400 whitespace-nowrap">{rf.Ngày_GD}</td>
                        <td className="p-3 text-slate-200 font-medium">{rf.Nội_Dung}</td>
                        <td className="p-3 text-right text-emerald-400">{rf.Ghi_Có > 0 ? rf.Ghi_Có.toLocaleString() : '-'}</td>
                        <td className="p-3 text-right text-rose-400 font-bold">{rf.Ghi_Nợ > 0 ? rf.Ghi_Nợ.toLocaleString() : '-'}</td>
                        <td className="p-3 text-amber-300 font-medium">{rf.Phân_Loại_Thẩm_Định}</td>
                        <td className="p-3 text-slate-400">{rf.Ghi_Chú_Rủi_Ro}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 7. BÓC TÁCH CIC & BCTC (NGÂN HÀNG)
// ==========================================
function CicBctcModule() {
  const [docType, setDocType] = useState<'cic' | 'bctc'>('cic');
  const [customerIncome, setCustomerIncome] = useState(50000000);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('doc_type', docType);
      fd.append('customer_income', String(customerIncome));
      if (!useSample) {
        for (const f of files) fd.append('files', f);
      }

      const res = await fetch('/api/bank/cic-bctc-extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi bóc tách hồ sơ tín dụng');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
            CHUYÊN SÂU TÍN DỤNG NGÂN HÀNG
          </span>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2 mt-2">
            <TrendingUp className="w-7 h-7 text-amber-400" />
            7. Bóc Tách Báo Cáo CIC & BCTC Sang Excel Thẩm Định
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Chuyển file PDF/Ảnh chụp phiếu CIC hoặc BCTC thành bảng Excel có sẵn công thức tính Nghĩa vụ trả nợ/tháng,
            hệ số DTI, cảnh báo nhóm nợ xấu & phân tích chỉ số tài chính (Biên LN, Khả năng thanh toán, Nợ/VCSH).
          </p>
        </div>
        <button
          onClick={() => handleProcess(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          ⚡ Thử ngay với mẫu hồ sơ tín dụng
        </button>
      </div>

      <div className="bg-slate-900/90 p-5 rounded-2xl border border-amber-500/30 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-2">Chọn chế độ thẩm định:</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as any)}
              className="w-full bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200"
            >
              <option value="cic">1. Phiếu thông tin CIC ➔ Tính Dư nợ, Nhóm nợ & Nghĩa vụ/tháng (DTI %)</option>
              <option value="bctc">2. Báo cáo Tài chính / Sổ Hộ KD ➔ Tính Biên LN, Thanh khoản & Đòn bẩy D/E</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-2">
              Thu nhập ròng hàng tháng của khách hàng (VNĐ - tính DTI):
            </label>
            <input
              type="number"
              value={customerIncome}
              onChange={e => setCustomerIncome(Number(e.target.value) || 0)}
              className="w-full bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Upload File PDF hoặc Ảnh Chụp CIC / Báo Cáo Tài Chính:
          </label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
        </div>

        <button
          onClick={() => handleProcess(false)}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-amber-500/20"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
          {loading ? 'AI đang bóc tách & gắn công thức thẩm định...' : '⚡ Bóc Tách & Xuất Bảng Tính Excel Thẩm Định'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-5 bg-slate-900 rounded-2xl border border-amber-500/40">
            <div>
              <div className="font-bold text-emerald-400 text-base">
                ✅ Đã bóc tách và tạo file Excel thẩm định thành công!
              </div>
              <p className="text-xs text-slate-400 mt-1">
                File Excel chứa công thức sống cho từng dòng: Gốc hàng tháng, Lãi hàng tháng, Tổng nghĩa vụ,
                Hệ số DTI % và đánh giá ngưỡng an toàn tín dụng.
              </p>
            </div>
            <a
              href={result.download_url}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-amber-500/20 shrink-0"
            >
              <Download className="w-4 h-4" /> Tải Bảng Tính Excel Thẩm Định
            </a>
          </div>

          {docType === 'cic' && result.rows && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-300 font-semibold">
                  <tr>
                    <th className="p-3">Tổ Chức Tín Dụng</th>
                    <th className="p-3">Loại Cấp TD</th>
                    <th className="p-3 text-right">Dư Nợ (VNĐ)</th>
                    <th className="p-3 text-center">Nhóm Nợ</th>
                    <th className="p-3 text-center">Kỳ Hạn Còn Lại</th>
                    <th className="p-3 text-right">Lãi Suất/Năm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {result.rows.map((r: any, idx: number) => (
                    <tr key={idx} className={r.Nhom_No >= 2 ? 'bg-rose-950/40' : 'hover:bg-slate-800/40'}>
                      <td className="p-3 font-semibold text-white">{r.Ten_TCTD}</td>
                      <td className="p-3 text-slate-300">{r.Loai_Vay}</td>
                      <td className="p-3 text-right text-emerald-400 font-bold">{Number(r.Du_No_VND).toLocaleString()} đ</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          r.Nhom_No >= 2 ? 'bg-rose-500 text-white' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          Nhóm {r.Nhom_No}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-300">{r.Ky_Han_Con_Lai_Thang} tháng</td>
                      <td className="p-3 text-right text-slate-300">{(r.Lai_Suat_Nam_Uoc_Tinh * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 8. CHĂM SÓC DANH MỤC VAY & TIẾT KIỆM (NGÂN HÀNG)
// ==========================================
function PortfolioModule({ onCopy, copiedKey }: { onCopy: (text: string, k: string) => void; copiedKey: string | null }) {
  const [portFile, setPortFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      if (useSample) {
        fd.append('use_sample', 'true');
      } else {
        if (!portFile) throw new Error('Vui lòng chọn file danh mục khách hàng Excel.');
        fd.append('portfolio_file', portFile);
      }

      const res = await fetch('/api/bank/portfolio-care', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi xử lý danh mục');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
            CHĂM SÓC KHÁCH HÀNG & THU HỒI NỢ
          </span>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2 mt-2">
            <BellRing className="w-7 h-7 text-amber-400" />
            8. Quản Lý Lịch Thu Nợ Vay & Đáo Hạn Sổ Tiết Kiệm
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Tự động đếm ngày đến hạn bằng công thức <code className="text-amber-300 bg-slate-800 px-1 py-0.5 rounded text-xs">=DATEVALUE(...)-TODAY()</code>,
            phân loại mức độ khẩn cấp và sinh kịch bản tin nhắn Zalo chuẩn nghiệp vụ cho từng khách hàng.
          </p>
        </div>
        <button
          onClick={() => handleProcess(true)}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          ⚡ Nạp danh mục Vay & STK mẫu
        </button>
      </div>

      <div className="bg-slate-900/90 p-5 rounded-2xl border border-amber-500/30 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Upload File Excel Danh Mục Khách Hàng (.xlsx, .csv)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => setPortFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 bg-slate-800/80 p-2 rounded-xl border border-slate-700"
          />
          <p className="text-[11px] text-slate-500 mt-1">Cột: Tên khách hàng, Số điện thoại, Loại sản phẩm, Số tiền, Ngày đáo hạn</p>
        </div>

        <button
          onClick={() => handleProcess(false)}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 transition disabled:opacity-50 shadow-md shadow-amber-500/20"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
          {loading ? 'Đang phân tích lịch đáo hạn & soạn kịch bản Zalo...' : '🚀 Lọc Khách Đến Hạn & Tạo Kịch Bản Zalo'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-slate-800">
            <span className="font-semibold text-sm text-amber-400">
              🔔 Đã tạo kịch bản chăm sóc cho {result.items.length} khách hàng!
            </span>
            <a
              href={result.download_url}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-amber-500/20"
            >
              <Download className="w-4 h-4" /> Tải Excel Theo Dõi Đáo Hạn
            </a>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800 text-slate-300 font-semibold">
                <tr>
                  <th className="p-3">Khách Hàng & SĐT</th>
                  <th className="p-3">Sản Phẩm</th>
                  <th className="p-3 text-right">Số Tiền</th>
                  <th className="p-3 text-center">Đến Hạn</th>
                  <th className="p-3">Tin Nhắn Zalo Soạn Sẵn</th>
                  <th className="p-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {result.items.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="p-3">
                      <span className="font-bold text-white block">{item.name}</span>
                      <span className="text-slate-400 text-[11px]">{item.phone}</span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                        {item.product}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-emerald-400">{item.amount.toLocaleString()} đ</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="text-slate-300 block">{item.due_date}</span>
                      <span className={`text-[11px] font-bold ${
                        item.days_left < 0 ? 'text-rose-400' : item.days_left <= 7 ? 'text-amber-400' : 'text-slate-500'
                      }`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300 max-w-md text-[11px] leading-relaxed">
                      {item.zalo_msg}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => onCopy(item.zalo_msg, `zalo_${idx}`)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 transition shadow-sm ml-auto"
                      >
                        {copiedKey === `zalo_${idx}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === `zalo_${idx}` ? 'Đã Copy' : 'Copy Zalo'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 9. MODULE BÓC TÁCH SỔ ĐỎ & ĐỊNH GIÁ LTV
// ==========================================
function CollateralModule() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (useSample: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('use_sample', String(useSample));
      if (!useSample && files) {
        for (let i = 0; i < files.length; i++) {
          fd.append('collat_files', files[i]);
        }
      }

      const res = await fetch('/api/bank/collateral-ltv', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Lỗi bóc tách sổ đỏ');
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý file sổ đỏ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
            THẨM ĐỊNH TÀI SẢN BẢO ĐẢM
          </span>
          <span className="text-xs text-slate-400 font-semibold">• MODULE 9/10</span>
        </div>
        <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
          <Home className="w-5 h-5 text-emerald-400" />
          9. Bóc Tách Sổ Đỏ (GCN QSDĐ) & Tính Hạn Mức Cho Vay Tối Đa (LTV)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Hệ thống AI tự động đọc ảnh chụp/PDF Sổ Đỏ hoặc Sổ Hồng, tách chi tiết diện tích đất ODT / ONT / CLN / NTS, áp đơn giá định giá và tính hạn mức cho vay tối đa (LTV) bằng công thức Excel sống, kèm cảnh báo rủi ro pháp lý.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Upload Ảnh chụp hoặc File PDF Sổ Đỏ / Sổ Hồng (Chọn nhiều file cùng lúc):
          </label>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={(e) => setFiles(e.target.files)}
            className="w-full text-xs bg-slate-800 p-3 rounded-xl border border-slate-700 text-slate-200 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading || (!files || files.length === 0)}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-950/40"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Bóc Tách Sổ Đỏ & Xuất Bảng Định Giá LTV</span>
          </button>

          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition"
          >
            <span>🧪 Chạy Thử 3 Sổ Đỏ Mẫu (Đất ODT Châu Đốc + Ao Cá Tra)</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results View */}
      {result && (
        <div className="space-y-5 animate-fadeIn">
          {/* Top 2 KPI Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="text-xs text-slate-400">Tổng Giá Trị Định Giá Tài Sản Bảo Đảm</div>
              <div className="text-2xl font-bold text-cyan-400 mt-1">
                {result.total_valuation.toLocaleString()} VNĐ
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                Tổng cộng {result.assets.length} thửa đất / bất động sản
              </div>
            </div>

            <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/40 flex flex-col justify-between">
              <div className="text-xs text-emerald-400 font-semibold">Tổng Hạn Mức Cấp Tín Dụng Tối Đa (LTV)</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {result.total_max_loan.toLocaleString()} VNĐ
              </div>
              <div className="text-[11px] text-emerald-300 mt-2 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Đã áp tỷ lệ LTV chuẩn: ODT (75%), ONT (70%), NTS/CLN (50%)</span>
              </div>
            </div>
          </div>

          {/* Action Download Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-emerald-500/30">
            <div>
              <div className="font-bold text-emerald-400 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Bảng tính Excel định giá TSBĐ đã sẵn sàng với công thức sống!
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Các cột Giá Trị Định Giá và Hạn Mức Cho Vay đều được gắn công thức <code>ROUND(E*F)</code>, <code>ROUND(G*H)</code> và hàm tổng <code>SUM</code>.
              </p>
            </div>
            <a
              href={result.download_url}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Tải Excel Bảng Định Giá (LTV)</span>
            </a>
          </div>

          {/* Detailed Assets Table */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-800/40 border-b border-slate-800 font-semibold text-xs text-slate-200">
              Chi Tiết Từng Thửa Đất / Bất Động Sản Thẩm Định ({result.assets.length} Thửa)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-3">Chủ Sở Hữu & Thửa Đất</th>
                    <th className="p-3">Loại Đất</th>
                    <th className="p-3 text-right">Diện Tích</th>
                    <th className="p-3 text-right">Giá Trị Định Giá</th>
                    <th className="p-3 text-right">Hạn Mức Vay (LTV)</th>
                    <th className="p-3">Cảnh Báo Pháp Lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {result.assets.map((a: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="p-3">
                        <span className="font-bold text-white block">{a.Chu_So_Huu}</span>
                        <span className="text-slate-400 text-[11px]">{a.Thua_To_Dia_Chi}</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-semibold">
                          {a.Loai_Dat}
                        </span>
                        <span className="block text-slate-400 text-[10px] mt-0.5">Thời hạn: {a.Thoi_Han_Su_Dung}</span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-200">
                        {Number(a.Dien_Tich_m2).toLocaleString('vi-VN')} m²
                      </td>
                      <td className="p-3 text-right font-bold text-cyan-400">
                        {Number(a.Gia_Tri_Dinh_Gia).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-bold text-emerald-400 block">
                          {Number(a.Han_Muc_Cho_Vay).toLocaleString('vi-VN')} đ
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          (LTV: {(Number(a.Ty_Le_LTV) * 100).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="p-3 text-amber-300 text-[11px] max-w-xs">
                        {a.Canh_Bao_Phap_Ly}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 10. MODULE LẬP TỜ TRÌNH TÍN DỤNG & REFINANCE
// ==========================================
function CreditProposalModule() {
  const [customerName, setCustomerName] = useState('Công ty TNHH Thủy Sản Hùng Cá - Đại diện: Ông Trần Văn Hòa');
  const [loanPurpose, setLoanPurpose] = useState('Bổ sung vốn lưu động mua thức ăn thủy sản & Tái tài trợ khoản vay ngân hàng khác');
  const [loanAmount, setLoanAmount] = useState(1500000000);
  const [tenureMonths, setTenureMonths] = useState(36);
  const [newRateYear, setNewRateYear] = useState(7.5);
  const [oldRateYear, setOldRateYear] = useState(11.0);
  const [prepayPenaltyPct, setPrepayPenaltyPct] = useState(1.5);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [evidence, setEvidence] = useState(createEmptyEvidenceEnvelope);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [declaredMonthlyDebt, setDeclaredMonthlyDebt] = useState(0);
  const derivedEvidence = useMemo(() => runDeterministicUnderwritingEngine(evidence, {loanAmountVND:loanAmount,proposedMonthlyDebtServiceVND:loanAmount/tenureMonths + loanAmount*newRateYear/100/12,declaredMonthlyDebtServiceVND:declaredMonthlyDebt,ltvCapPercent:75,minimumDscr:1.25}), [evidence,loanAmount,tenureMonths,newRateYear,declaredMonthlyDebt]);
  const evidenceGate = evaluateFailClosedGate(derivedEvidence);
  const proposalBasis = JSON.stringify([derivedEvidence,customerName,loanPurpose,oldRateYear,prepayPenaltyPct,templateFile?.name,templateFile?.lastModified]);
  useEffect(() => { setEvidence(previous => ({...previous,derivations:{},unknowns:previous.unknowns.map(issue=>({...issue,resolvedByHuman:false,humanNote:undefined}))})); }, [loanAmount,tenureMonths,newRateYear,declaredMonthlyDebt]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setResult(null); }, [derivedEvidence,customerName,loanPurpose,oldRateYear,prepayPenaltyPct,templateFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (evidenceBusy || !evidenceGate.canExportProposal) { setError(evidenceGate.reasonSummary); return; }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('evidence', JSON.stringify(derivedEvidence));
      fd.append('declared_monthly_debt_service', String(declaredMonthlyDebt));
      fd.append('customer_name', customerName);
      fd.append('loan_purpose', loanPurpose);
      fd.append('loan_amount', String(loanAmount));
      fd.append('tenure_months', String(tenureMonths));
      fd.append('new_rate_year', String(newRateYear));
      fd.append('old_rate_year', String(oldRateYear));
      fd.append('prepay_penalty_pct', String(prepayPenaltyPct));
      fd.append('monthly_net_income', String(derivedEvidence.derivations.monthlyAvailableCashFlowVND?.value));
      fd.append('collateral_value', String(derivedEvidence.derivations.totalCollateralValueVND?.value));
      if (templateFile) {
        fd.append('template_file', templateFile);
      }

      const res = await fetch('/api/bank/credit-proposal', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Lỗi lập tờ trình tín dụng');
      }

      const data = await res.json();
      setResult({...data,proposalBasis});
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý tờ trình');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
            CHỐT SALE TÍN DỤNG & LẬP TỜ TRÌNH
          </span>
          <span className="text-xs text-slate-400 font-semibold">• MODULE 10/10</span>
        </div>
        <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-emerald-400" />
          10. Lập Tờ Trình Tín Dụng (.DOCX) + Bảng Kế Hoạch Trả Nợ & Mua Lại Khoản Vay (.XLSX)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Hỗ trợ nạp <b>Tờ Trình Mẫu (.docx)</b> tùy chỉnh của ngân hàng bạn với các thẻ <code>{`{{Ten_Khach_Hang}}`}</code>, <code>{`{{So_Tien_Vay}}`}</code>, <code>{`{{DSCR}}`}</code>, <code>{`{{LTV}}`}</code>, <code>{`{{Tiet_Kiem_Rong_Refinance}}`}</code>... để tự động điền số liệu thẩm định, đồng thời xuất bảng tính Excel 2 Sheet tính lịch trả nợ từng tháng và hiệu quả Refinance bằng công thức sống.
        </p>
      </div>

      <Suspense fallback={<p role="status">Đang tải kiểm tra bằng chứng…</p>}><ProposalEvidencePanel envelope={derivedEvidence} onChange={setEvidence} onBusyChange={setEvidenceBusy} /></Suspense>
      <label className="block text-sm">Nghĩa vụ trả nợ hiện hữu do khách khai báo (VNĐ/tháng)<input type="number" min="0" value={declaredMonthlyDebt} onChange={event=>setDeclaredMonthlyDebt(Number(event.target.value))} className="ml-3 rounded bg-slate-800 p-2" /></label>
      {/* Form Input */}
      <form onSubmit={handleSubmit} className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="sm:col-span-2">
            <label className="block text-slate-300 font-bold mb-1">
              Tên Khách Hàng / Doanh Nghiệp Vay ({`{{Ten_Khach_Hang}}`}):
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Số Tiền Đề Xuất Vay - VNĐ ({`{{So_Tien_Vay}}`}):
            </label>
            <input
              type="number"
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-slate-300 font-bold mb-1">
              Mục Đích Vay Vốn ({`{{Muc_Dich_Vay}}`}):
            </label>
            <input
              type="text"
              value={loanPurpose}
              onChange={(e) => setLoanPurpose(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Thời Hạn Vay - Tháng ({`{{Thoi_Han_Vay}}`}):
            </label>
            <input
              type="number"
              value={tenureMonths}
              onChange={(e) => setTenureMonths(Number(e.target.value))}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-emerald-400 font-bold mb-1">
              Lãi Suất Ngân Hàng Mình - %/năm ({`{{Lai_Suat_Moi}}`}):
            </label>
            <input
              type="number"
              step="0.1"
              value={newRateYear}
              onChange={(e) => setNewRateYear(Number(e.target.value))}
              required
              className="w-full bg-slate-800 border border-emerald-500/40 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-rose-400 font-bold mb-1">
              Lãi Suất Ngân Hàng Cũ - %/năm ({`{{Lai_Suat_Cu}}`}):
            </label>
            <input
              type="number"
              step="0.1"
              value={oldRateYear}
              onChange={(e) => setOldRateYear(Number(e.target.value))}
              required
              className="w-full bg-slate-800 border border-rose-500/40 rounded-xl p-2.5 text-white focus:outline-none focus:border-rose-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Phí Phạt Trả Trước Hạn NH Cũ - % ({`{{Phi_Phat_Tra_Truoc}}`}):
            </label>
            <input
              type="number"
              step="0.1"
              value={prepayPenaltyPct}
              onChange={(e) => setPrepayPenaltyPct(Number(e.target.value))}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Thu Nhập Ròng KH / Tháng - VNĐ ({`{{Thu_Nhap_Rong}}`}):
            </label>
            <input
              type="number"
              value={derivedEvidence.derivations.monthlyAvailableCashFlowVND?.value ?? ''} readOnly
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              Tổng Định Giá TSBĐ - VNĐ ({`{{Gia_Tri_TSBD}}`}):
            </label>
            <input
              type="number"
              value={derivedEvidence.derivations.totalCollateralValueVND?.value ?? ''} readOnly
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
        </div>

        {/* Upload Tờ Trình Mẫu (.docx) */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-amber-500/40 space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="font-bold text-amber-300 flex items-center gap-1.5">
              <FileSignature className="w-4 h-4" />
              Tải Lên File Word Tờ Trình Mẫu Của Ngân Hàng Bạn (.docx - Tùy chọn):
            </label>
            <a
              href="/api/bank/sample-proposal-template"
              className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Tải file .docx Tờ Trình Mẫu chuẩn
            </a>
          </div>
          <input
            type="file"
            accept=".docx"
            onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
            className="w-full text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-slate-200"
          />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            💡 Tự động điền mọi biến: <code>{`{{Ten_Khach_Hang}}`}</code>, <code>{`{{Muc_Dich_Vay}}`}</code>, <code>{`{{So_Tien_Vay}}`}</code>, <code>{`{{Thoi_Han_Vay}}`}</code>, <code>{`{{Lai_Suat_Moi}}`}</code>, <code>{`{{Thu_Nhap_Rong}}`}</code>, <code>{`{{Gia_Tri_TSBD}}`}</code>, <code>{`{{Tong_Tra_Thang_Dau}}`}</code>, <code>{`{{DSCR}}`}</code>, <code>{`{{LTV}}`}</code>, <code>{`{{Tiet_Kiem_Rong_Refinance}}`}</code>, <code>{`{{Ket_Luan_De_Xuat}}`}</code>. Nếu để trống ô này, hệ thống sẽ tự động dùng Mẫu Tờ Trình chuẩn Ngân hàng!
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || evidenceBusy || !evidenceGate.canExportProposal}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-950/40"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          <span>⚡ Tính Hiệu Quả Refinance + Xuất Tờ Trình (.DOCX) & Lịch Trả Nợ (.XLSX)</span>
        </button>

        {error && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>

      {/* Results View */}
      {result && result.proposalBasis === proposalBasis && evidenceGate.canExportProposal && !evidenceBusy && (
        <div className="space-y-5 animate-fadeIn">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Gốc + Lãi Tháng Đầu</div>
              <div className="text-xl font-bold text-white mt-1">
                {result.first_month_payment.toLocaleString()} đ
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Kỳ thanh toán cao nhất</div>
            </div>

            <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Hệ Số DSCR Đảm Bảo Nợ</div>
              <div className={`text-xl font-bold mt-1 ${result.dscr >= 1.25 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.dscr}x
              </div>
              <div className="text-[11px] text-emerald-300 mt-1">
                {result.dscr >= 1.25 ? '✅ Đạt chuẩn (>= 1.25x)' : '⚠️ Cảnh báo nguồn thu'}
              </div>
            </div>

            <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
              <div className="text-xs text-slate-400">Tỷ Lệ LTV / Tài Sản</div>
              <div className={`text-xl font-bold mt-1 ${result.ltv <= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {result.ltv}%
              </div>
              <div className="text-[11px] text-emerald-300 mt-1">
                {result.ltv <= 75 ? '✅ An toàn (<= 75%)' : '⚠️ Vượt LTV chuẩn'}
              </div>
            </div>

            <div className="bg-slate-900/90 p-4 rounded-2xl border border-emerald-500/40">
              <div className="text-xs text-emerald-300 font-semibold">Tiết Kiệm Ròng Refinance</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                +{result.net_refinance_saving.toLocaleString()} đ
              </div>
              <div className="text-[11px] text-emerald-300 mt-1">
                Đã trừ phí phạt ({result.penalty_fee.toLocaleString()} đ)
              </div>
            </div>
          </div>

          {/* Action Download Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/40">
            <div>
              <div className="font-bold text-emerald-400 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Đã xuất sẵn trọn bộ Hồ sơ Tờ trình Tín dụng & Bảng tính Excel!
              </div>
              <div className="text-xs text-indigo-300 mt-1">
                📄 Biểu mẫu Tờ trình áp dụng: <b>{result.template_name}</b>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                File Excel có sẵn 2 Sheet: So sánh Refinance & Lịch trả nợ bằng công thức sống (Active Formulas).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={result.docx_url}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
              >
                <FileSignature className="w-4 h-4" />
                <span>Tải Tờ Trình Word (.DOCX)</span>
              </a>

              <a
                href={result.excel_url}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Tải Lịch Trả Nợ & Refinance (.XLSX)</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
