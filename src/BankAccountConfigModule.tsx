import { redactSensitiveLog } from './utils/redaction';
import { apiFetch as fetch } from './services/apiClient';
import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  QrCode,
  Save,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Download,
  Phone,
  RefreshCw,
  Landmark,
  FileText,
  AlertCircle,
} from 'lucide-react';

export interface BankAccountConfig {
  companyName: string;
  bankName: string;
  bankBin: string;
  accountNo: string;
  accountName: string;
  transferSyntax: string;
  hotline: string;
  updatedAt?: string;
}

export const VIETNAM_BANKS = [
  { bin: '970415', code: 'CTG', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công Thương Việt Nam' },
  { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
  { bin: '970418', code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam' },
  { bin: '970405', code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp & PT Nông thôn VN' },
  { bin: '970422', code: 'MB', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân Đội' },
  { bin: '970407', code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
  { bin: '970432', code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970416', code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970423', code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970441', code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc Tế Việt Nam' },
  { bin: '970403', code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970437', code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát Triển TP.HCM' },
  { bin: '970443', code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970426', code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { bin: '970448', code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970440', code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970449', code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970431', code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam' },
  { bin: '970428', code: 'NAB', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
];

export const DEFAULT_BANK_ACCOUNT: BankAccountConfig = {
  companyName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ VÀ THƯƠNG MẠI ÁNH DƯƠNG',
  bankName: 'VietinBank (Ngân hàng TMCP Công Thương Việt Nam)',
  bankBin: '970415',
  accountNo: '102868889999',
  accountName: 'CONG TY CP CONG NGHE & THUONG MAI ANH DUONG',
  transferSyntax: '[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY',
  hotline: '1900 6868 - 0988 123 456',
};

// Hàm định dạng cú pháp trích xuất tự động: Thay thế [MA_KH] và DD/MM/YYYY
export function formatTransferSyntax(syntax?: string, customerId: string = 'KH001', customDate?: string): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const todayStr = customDate || `${day}/${month}/${year}`;

  let raw = syntax && syntax.trim() ? syntax : '[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY';
  return raw
    .replace(/\[MA_KH\]/g, customerId)
    .replace(/DD\/MM\/YYYY/g, todayStr)
    .replace(/\[NGAY_THANG_NAM\]/g, todayStr);
}

export function BankAccountConfigModule({
  onSaved,
}: {
  onSaved?: (account: BankAccountConfig) => void;
}) {
  const [account, setAccount] = useState<BankAccountConfig>(DEFAULT_BANK_ACCOUNT);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [testAmount, setTestAmount] = useState<number>(18500000);
  const [testCustomerId, setTestCustomerId] = useState<string>('KH-2026-88');

  // Load configuration from localStorage and server
  useEffect(() => {
    try {
      const local = localStorage.getItem('vietqr_bank_account_config');
      if (local) {
        setAccount(JSON.parse(local));
      }
    } catch {
      // fallback
    }

    // Fetch latest from backend
    fetch('/api/settings/bank-account')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.accountNo) {
          setAccount(data);
          try {
            localStorage.setItem('vietqr_bank_account_config', JSON.stringify(data));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleBankChange = (bin: string) => {
    const selected = VIETNAM_BANKS.find((b) => b.bin === bin);
    if (selected) {
      setAccount((prev) => ({
        ...prev,
        bankBin: selected.bin,
        bankName: `${selected.shortName} (${selected.name})`,
      }));
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setSavedSuccess(false);
    setSaveError(null);

    try {
      const token = localStorage.getItem('applet_auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Sync to server with token authentication
      const res = await fetch('/api/settings/bank-account', {
        method: 'POST',
        headers,
        body: JSON.stringify(account),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Máy chủ từ chối lưu cấu hình. Vui lòng kiểm tra quyền đăng nhập.');
      }

      const data = await res.json();
      const updated = data.account || account;
      setAccount(updated);

      // Save locally only AFTER server confirmation
      try {
        localStorage.setItem('vietqr_bank_account_config', JSON.stringify(updated));
      } catch {}

      setSavedSuccess(true);
      if (onSaved) onSaved(updated);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error saving bank account:', redactSensitiveLog(err));
      setSaveError(err.message || 'Lỗi khi lưu cấu hình tài khoản.');
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Build VietQR dynamic image URL with resolved transferSyntax
  const parsedSyntax = formatTransferSyntax(account.transferSyntax, testCustomerId);
  const qrUrl = `https://img.vietqr.io/image/${account.bankBin}-${account.accountNo}-compact2.png?amount=${testAmount}&addInfo=${encodeURIComponent(
    parsedSyntax
  )}&accountName=${encodeURIComponent(account.accountName)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl animate-fadeIn">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Mục Cấu Hình Riêng
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px] uppercase tracking-wider border border-cyan-500/30">
              Trích Xuất Tự Động 100%
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-emerald-400" />
            Cấu Hình Tài Khoản Thanh Toán & Trích Xuất VietQR
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-3xl leading-relaxed">
            Nhập thông tin tài khoản ngân hàng thụ hưởng của bạn <strong>một lần duy nhất tại mục riêng này</strong>.
            Hệ thống sẽ tự động trích xuất để tạo mã VietQR chuẩn NAPAS trên phiếu in <strong>PDF Thông Báo Nợ</strong>,
            Biên bản công nợ Word, và nội dung Email nhắc nợ mà không phải gõ lại mỗi lần.
          </p>
        </div>

        <button
          onClick={() => handleSave()}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{loading ? 'Đang lưu cấu hình...' : 'Lưu Cấu Hình Tài Khoản'}</span>
        </button>
      </div>

      {/* SUCCESS BANNER */}
      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg shadow-emerald-950/40">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <strong className="font-bold text-emerald-300">Đã cập nhật cấu hình tài khoản thành công!</strong>
              <p className="text-emerald-200/90 text-[11px] mt-0.5">
                Các Module (Thông báo nợ PDF, Đơn Zalo, Phiếu lương, Danh mục tín dụng) giờ đây sẽ tự động trích xuất từ tài khoản này.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-lg font-mono">
            STK: {account.accountNo}
          </span>
        </div>
      )}

      {/* ERROR BANNER */}
      {saveError && (
        <div className="p-4 rounded-2xl bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-center gap-3 shadow-lg shadow-rose-950/40">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <strong className="font-bold text-rose-300">Không thể lưu cấu hình:</strong>
            <p className="text-rose-200/90 text-[11px] mt-0.5">{saveError}</p>
          </div>
        </div>
      )}

      {/* THÔNG BÁO BẢO VỆ TÀI KHOẢN - CHỈ CHO PHÉP NHẬP THỰC TẾ, BỎ NẠP MẪU 1 CHẠM */}
      <div className="bg-slate-900/90 p-4 rounded-2xl border border-amber-500/40 space-y-1.5 shadow-md">
        <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Chế độ nhập thông tin trực tiếp (Đã loại bỏ tài khoản mẫu để tránh nhầm lẫn):</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed pl-6">
          Hệ thống yêu cầu người dùng tự nhập chính xác thông tin tài khoản ngân hàng thực tế của đơn vị mình.
          Tuyệt đối không dùng dữ liệu giả lập hay tài khoản mẫu để đảm bảo toàn bộ số tiền thanh toán từ khách hàng chuyển đúng 100% vào tài khoản của bạn.
        </p>
      </div>

      {/* MAIN TWO COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: EDIT FORM (7 COLS) */}
        <div className="lg:col-span-7 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              Chi Tiết Tài Khoản Đơn Vị
            </h3>
            <span className="text-[11px] text-slate-400">Được trích xuất vào VietQR & PDF</span>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            {/* Tên đơn vị / Doanh nghiệp */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Tên Doanh Nghiệp / Đơn Vị Thụ Hưởng <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                value={account.companyName}
                onChange={(e) => setAccount({ ...account, companyName: e.target.value })}
                placeholder="Ví dụ: CÔNG TY CỔ PHẦN CÔNG NGHỆ VÀ THƯƠNG MẠI ÁNH DƯƠNG"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">Xuất hiện trên tiêu đề phiếu in thông báo nợ và biên bản đối chiếu</p>
            </div>

            {/* Ngân hàng thụ hưởng & BIN */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Ngân Hàng Thụ Hưởng (Chuẩn NAPAS) <span className="text-emerald-400">*</span>
              </label>
              <select
                value={account.bankBin}
                onChange={(e) => handleBankChange(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-medium"
              >
                {VIETNAM_BANKS.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.shortName} ({b.code}) - {b.name} [BIN: {b.bin}]
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Số tài khoản */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Số Tài Khoản (STK) <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={account.accountNo}
                  onChange={(e) => setAccount({ ...account, accountNo: e.target.value.replace(/\s+/g, '') })}
                  placeholder="Ví dụ: 102868889999"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {/* Tên chủ tài khoản */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Tên Chủ Tài Khoản (In hoa không dấu) <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={account.accountName}
                  onChange={(e) => setAccount({ ...account, accountName: e.target.value.toUpperCase() })}
                  placeholder="Ví dụ: NGUYEN THUY LINH"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-bold focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Cú pháp nội dung chuyển khoản mẫu */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 flex items-center justify-between flex-wrap gap-1">
                <span>Cú Pháp Chuyển Khoản Mẫu Khi Trích Xuất:</span>
                <span className="text-[10px] text-emerald-400 font-normal">Hỗ trợ [MA_KH] và DD/MM/YYYY</span>
              </label>
              <input
                type="text"
                value={account.transferSyntax}
                onChange={(e) => setAccount({ ...account, transferSyntax: e.target.value })}
                placeholder="[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Cú pháp trích xuất tự động: Biến <strong className="text-emerald-400 font-mono">[MA_KH]</strong> sẽ tự thay thế bằng Mã khách hàng, và <strong className="text-cyan-400 font-mono">DD/MM/YYYY</strong> sẽ tự thay thế bằng ngày thực tế. Ví dụ: <span className="text-emerald-300 font-mono bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">KH001 THANH TOAN CONG NO NGAY {new Date().toLocaleDateString('vi-VN')}</span>
              </p>
            </div>

            {/* Hotline liên hệ */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>Hotline / Số Điện Thoại Phòng Kế Toán:</span>
              </label>
              <input
                type="text"
                value={account.hotline}
                onChange={(e) => setAccount({ ...account, hotline: e.target.value })}
                placeholder="1900 6868 - 0988 123 456"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Submit button */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Lưu trữ an toàn tại hệ thống nội bộ
              </span>

              <button
                type="submit"
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Lưu & Áp Dụng Ngay</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: LIVE VIETQR CARD PREVIEW (5 COLS) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Xem Trước Trích Xuất VietQR</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                NAPAS 24/7
              </span>
            </div>

            {/* Simulation controls */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <div>
                <label className="text-[10px] text-slate-400 block font-medium">Thử nghiệm Mã KH:</label>
                <input
                  type="text"
                  value={testCustomerId}
                  onChange={(e) => setTestCustomerId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block font-medium">Thử nghiệm Số tiền (VNĐ):</label>
                <input
                  type="number"
                  value={testAmount}
                  onChange={(e) => setTestAmount(Number(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-emerald-400 font-bold text-xs mt-1"
                />
              </div>
            </div>

            {/* QR Visual Card */}
            <div className="bg-gradient-to-b from-slate-950 to-slate-900 p-5 rounded-2xl border border-emerald-500/30 flex flex-col items-center justify-center space-y-3 shadow-inner">
              <div className="p-2.5 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                <img
                  src={qrUrl}
                  alt="VietQR Code"
                  className="w-48 h-48 object-contain rounded-lg"
                  onError={(e) => {
                    // Fallback to error placeholder if offline
                    (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="%2310b981" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
                  }}
                />
              </div>

              {/* Bank & Beneficiary summary */}
              <div className="w-full text-center space-y-1 pt-1">
                <div className="text-xs font-bold text-white uppercase tracking-wide">
                  {account.accountName || 'CHỦ TÀI KHOẢN'}
                </div>
                <div className="text-emerald-400 font-mono font-bold text-base tracking-wider">
                  {account.accountNo}
                </div>
                <div className="text-[11px] text-slate-400">
                  {account.bankName}
                </div>
                <div className="text-xs text-rose-400 font-bold mt-1">
                  Số tiền: {testAmount.toLocaleString('vi-VN')} đ
                </div>
                <div className="text-[10px] text-cyan-300 font-mono bg-slate-800/80 px-2 py-1 rounded-lg mt-1 inline-block">
                  Cú pháp: {parsedSyntax}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedLink ? 'Đã copy link QR' : 'Copy Link QR'}</span>
                </button>

                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  download="VietQR_ThanhToan.png"
                  className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                  title="Tải ảnh QR"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải Ảnh QR</span>
                </a>
              </div>
            </div>

            {/* How it extracts in App */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-[11px] text-slate-300 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Cơ chế trích xuất khi tạo QR:
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1 text-[10.5px]">
                <li>
                  <strong>Module 1 (Công nợ & Phiếu PDF):</strong> Tự động nạp STK và nhúng mã VietQR trên cùng trang in thông báo nợ với font tiếng Việt chuẩn Unicode.
                </li>
                <li>
                  <strong>Module 4 (Bóc đơn Zalo):</strong> Trích xuất STK này để gửi cho khách thanh toán chuyển khoản đơn hàng.
                </li>
                <li>
                  <strong>Module 9 (Chăm sóc nợ vay):</strong> Sử dụng để gửi nhắc nợ kèm mã QR thanh toán nhanh.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
