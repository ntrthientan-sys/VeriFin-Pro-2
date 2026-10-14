import React, { useState } from 'react';
import {
  Coffee,
  Phone,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  X,
  Heart,
  Sparkles,
  MessageCircle,
} from 'lucide-react';

export const CREATOR_INFO = {
  name: 'Nguyễn Trường Thiên Tân',
  phone: '0817221722',
  zalo: '0817221722',
  zaloLink: 'https://zalo.me/0817221722',
  bankName: 'OCB (Ngân hàng TMCP Phương Đông)',
  bankCode: 'OCB',
  bankBin: '970448',
  accountNo: '48888',
  accountName: 'NGUYỄN TRƯỜNG THIÊN TÂN',
  qrUrl: 'https://img.vietqr.io/image/970448-48888-compact2.png?accountName=NGUYEN%20TRUONG%20THIEN%20TAN&addInfo=Moi%20cafe%20Nguyen%20Truong%20Thien%20Tan',
};

export function CreatorCoffeeCard({
  onOpenModal,
}: {
  onOpenModal?: () => void;
}) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedStk, setCopiedStk] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(CREATOR_INFO.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleCopyStk = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(CREATOR_INFO.accountNo);
    setCopiedStk(true);
    setTimeout(() => setCopiedStk(false), 2000);
  };

  const openQrModal = () => {
    if (onOpenModal) {
      onOpenModal();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <div
        onClick={openQrModal}
        className="mt-3 p-3 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800/90 to-slate-900 border border-amber-500/30 hover:border-amber-400/60 shadow-lg cursor-pointer transition group select-none"
        title="Bấm để xem QR mời cà phê"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-xs">
              ☕
            </span>
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
              Mời Cà Phê
            </span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 group-hover:bg-amber-500 group-hover:text-slate-950 transition">
            Mở QR →
          </span>
        </div>

        <div className="space-y-1 text-xs">
          <div className="text-white font-bold text-xs truncate flex items-center gap-1">
            <span>{CREATOR_INFO.name}</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-300 pt-0.5">
            <span className="text-slate-400">SĐT / Zalo:</span>
            <div className="flex items-center gap-1 font-mono font-bold text-emerald-400">
              <a
                href={CREATOR_INFO.zaloLink}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:underline flex items-center gap-0.5 text-cyan-300"
                title="Mở Zalo nhắn tin"
              >
                <span>{CREATOR_INFO.phone}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                title="Copy số điện thoại"
              >
                {copiedPhone ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="text-slate-400">OCB • STK:</span>
            <div className="flex items-center gap-1 font-mono font-bold text-amber-300">
              <span>{CREATOR_INFO.accountNo}</span>
              <button
                type="button"
                onClick={handleCopyStk}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                title="Copy số tài khoản"
              >
                {copiedStk ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3 text-rose-400 fill-rose-400/20" />
            Ủng hộ tác giả phát triển
          </span>
          <span className="text-amber-400 font-semibold group-hover:underline">
            Quét mã ☕
          </span>
        </div>
      </div>

      {showModal && <CreatorCoffeeModal onClose={() => setShowModal(false)} />}
    </>
  );
}

export function CreatorCoffeeModal({ onClose }: { onClose: () => void }) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedStk, setCopiedStk] = useState(false);

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(CREATOR_INFO.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleCopyStk = () => {
    navigator.clipboard.writeText(CREATOR_INFO.accountNo);
    setCopiedStk(true);
    setTimeout(() => setCopiedStk(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-lg">
              ☕
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Mời Cà Phê</h3>
              <p className="text-[11px] text-slate-400">Cảm ơn bạn đã đồng hành & ủng hộ công cụ!</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* VietQR Code Card */}
        <div className="p-4 bg-white rounded-2xl flex flex-col items-center justify-center shadow-xl space-y-2">
          <img
            src={CREATOR_INFO.qrUrl}
            alt="VietQR Mời Cà Phê"
            className="w-56 h-56 object-contain rounded-lg"
          />
          <span className="text-[10px] text-slate-500 font-medium">
            Quét bằng ứng dụng ngân hàng hoặc ví điện tử bất kỳ (NAPAS247)
          </span>
        </div>

        {/* Bank & Contact Details */}
        <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/70 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Người tạo tool:</span>
            <span className="font-bold text-white text-sm">{CREATOR_INFO.name}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">SĐT & Zalo liên hệ:</span>
            <div className="flex items-center gap-1.5 font-bold font-mono text-cyan-300">
              <a
                href={CREATOR_INFO.zaloLink}
                target="_blank"
                rel="noreferrer"
                className="hover:underline flex items-center gap-1"
              >
                <span>{CREATOR_INFO.phone}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="p-1 rounded bg-slate-700/80 hover:bg-slate-700 text-slate-300"
                title="Sao chép SĐT"
              >
                {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Ngân hàng thụ hưởng:</span>
            <span className="font-bold text-slate-200">{CREATOR_INFO.bankName}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Số tài khoản (STK):</span>
            <div className="flex items-center gap-1.5 font-bold font-mono text-amber-400 text-sm">
              <span>{CREATOR_INFO.accountNo}</span>
              <button
                type="button"
                onClick={handleCopyStk}
                className="p-1 rounded bg-slate-700/80 hover:bg-slate-700 text-slate-300"
                title="Sao chép STK"
              >
                {copiedStk ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Chủ tài khoản:</span>
            <span className="font-bold text-emerald-400 uppercase tracking-wide">{CREATOR_INFO.accountName}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center gap-2">
          <a
            href={CREATOR_INFO.zaloLink}
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Chat Zalo: {CREATOR_INFO.phone}</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
