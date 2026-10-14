import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Trash2, Save } from 'lucide-react';
import { getPersonalApiKey, savePersonalApiKey, clearPersonalApiKey } from './aiApi';

export function ApiKeySettingsModule() {
  const [configured, setConfigured] = useState(() => Boolean(getPersonalApiKey()));
  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      savePersonalApiKey(key); setConfigured(true); setKey(''); setError('');
      setNotice('Đã lưu cho phiên này. Key sẽ được sử dụng ở lần gọi AI tiếp theo; chưa kiểm tra kết nối với Google.');
    } catch (e: any) { setError(e.message); }
  }
  return <section className="max-w-3xl mx-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 md:p-8 space-y-6">
    <header><h1 className="text-2xl font-bold text-white flex items-center gap-3"><KeyRound className="text-cyan-400" /> API key cá nhân</h1>
      <p className="text-slate-400 mt-3">Sử dụng Gemini bằng API key riêng cho chatbot, đọc chứng từ, bóc tách đơn hàng, CIC/BCTC và hồ sơ tài sản.</p></header>
    <p className="text-sm text-cyan-300" role="status">{configured ? 'Đang dùng key cá nhân trong phiên trình duyệt này.' : 'Chưa có key cá nhân. Các tính năng AI dùng key máy chủ nếu được cấu hình.'}</p>
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium text-slate-200" htmlFor="personal-gemini-key">Gemini API key</label>
      <div className="flex gap-2"><input id="personal-gemini-key" type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder={configured ? 'Nhập key mới để thay thế' : 'Nhập API key Gemini của bạn'} className="min-w-0 flex-1 rounded-xl bg-slate-800 border border-slate-600 px-4 py-3 text-white" />
        <button type="button" aria-label={visible ? 'Ẩn API key' : 'Hiện API key'} onClick={() => setVisible(!visible)} className="p-3 rounded-xl bg-slate-800 text-slate-200">{visible ? <EyeOff /> : <Eye />}</button></div>
      <p className="text-xs text-slate-400 leading-relaxed">Key được lưu theo tài khoản hiện tại trong phiên tab này, không lưu vào tài khoản trên máy chủ. Đóng tab hoặc đăng xuất sẽ xóa key. Khi chạy AI, key và dữ liệu bạn chọn được gửi qua máy chủ ứng dụng tới Google Gemini; chi phí theo tài khoản Google của bạn. Key sai sẽ báo lỗi, không tự dùng key máy chủ thay thế.</p>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={!key.trim()} className="flex items-center gap-2 rounded-xl px-4 py-3 bg-cyan-500 text-slate-950 font-bold disabled:opacity-40"><Save size={18} />Lưu / cập nhật key</button>
        <button type="button" disabled={!configured} onClick={() => { clearPersonalApiKey(); setConfigured(false); setKey(''); setError(''); setNotice('Đã xóa key cá nhân khỏi phiên này.'); }} className="flex items-center gap-2 rounded-xl px-4 py-3 bg-slate-800 text-slate-200 disabled:opacity-40"><Trash2 size={18} />Xóa key</button></div>
    </form>
    {notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </section>;
}
