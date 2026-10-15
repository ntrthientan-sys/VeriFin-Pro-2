import { apiFetch as fetch } from './services/apiClient';
import React, { useState } from 'react';
import {
  TrendingUp,
  Calculator,
  Download,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Calendar,
  Building2,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface WeeklyRow {
  week: string;
  in_debt: number;
  in_sales: number;
  in_other: number;
  out_cogs: number;
  out_payroll: number;
  out_rent: number;
  out_bank_interest: number;
  out_tax: number;
}

export function CashFlowForecastModule() {
  const [initialCash, setInitialCash] = useState(950000000); // 950 triệu
  const [safetyThreshold, setSafetyThreshold] = useState(200000000); // 200 triệu

  const [weeklyData, setWeeklyData] = useState<WeeklyRow[]>([
    { week: 'Tuần 1', in_debt: 220000000, in_sales: 150000000, in_other: 0, out_cogs: 180000000, out_payroll: 0, out_rent: 45000000, out_bank_interest: 25000000, out_tax: 0 },
    { week: 'Tuần 2', in_debt: 180000000, in_sales: 160000000, in_other: 15000000, out_cogs: 210000000, out_payroll: 320000000, out_rent: 0, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 3', in_debt: 140000000, in_sales: 190000000, in_other: 0, out_cogs: 240000000, out_payroll: 0, out_rent: 0, out_bank_interest: 0, out_tax: 35000000 },
    { week: 'Tuần 4', in_debt: 310000000, in_sales: 175000000, in_other: 0, out_cogs: 190000000, out_payroll: 0, out_rent: 0, out_bank_interest: 50000000, out_tax: 0 },
    { week: 'Tuần 5', in_debt: 190000000, in_sales: 140000000, in_other: 0, out_cogs: 160000000, out_payroll: 0, out_rent: 45000000, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 6', in_debt: 160000000, in_sales: 180000000, in_other: 20000000, out_cogs: 220000000, out_payroll: 330000000, out_rent: 0, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 7', in_debt: 200000000, in_sales: 195000000, in_other: 0, out_cogs: 250000000, out_payroll: 0, out_rent: 0, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 8', in_debt: 270000000, in_sales: 210000000, in_other: 0, out_cogs: 210000000, out_payroll: 0, out_rent: 0, out_bank_interest: 50000000, out_tax: 40000000 },
    { week: 'Tuần 9', in_debt: 150000000, in_sales: 160000000, in_other: 0, out_cogs: 170000000, out_payroll: 0, out_rent: 45000000, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 10', in_debt: 180000000, in_sales: 190000000, in_other: 10000000, out_cogs: 230000000, out_payroll: 340000000, out_rent: 0, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 11', in_debt: 210000000, in_sales: 205000000, in_other: 0, out_cogs: 260000000, out_payroll: 0, out_rent: 0, out_bank_interest: 0, out_tax: 0 },
    { week: 'Tuần 12', in_debt: 340000000, in_sales: 220000000, in_other: 30000000, out_cogs: 240000000, out_payroll: 0, out_rent: 0, out_bank_interest: 50000000, out_tax: 50000000 },
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpdateRow = (index: number, field: keyof WeeklyRow, value: any) => {
    const updated = [...weeklyData];
    updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    setWeeklyData(updated);
  };

  const handleProcess = async (useSample: boolean = false) => {
    setLoading(true);
    try {
      const payload = useSample
        ? { use_sample: true }
        : {
            initial_cash: initialCash,
            safety_threshold: safetyThreshold,
            weekly_data: weeklyData,
          };

      const res = await fetch('/api/office/cashflow-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lỗi xử lý dự báo dòng tiền.');
      }

      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      alert(e.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  // Tính toán nháp để vẽ biểu đồ realtime
  let rBal = initialCash;
  const chartData = weeklyData.map((w) => {
    const totIn = (w.in_debt || 0) + (w.in_sales || 0) + (w.in_other || 0);
    const totOut =
      (w.out_cogs || 0) +
      (w.out_payroll || 0) +
      (w.out_rent || 0) +
      (w.out_bank_interest || 0) +
      (w.out_tax || 0);
    const net = totIn - totOut;
    rBal += net;
    return {
      name: w.week,
      'Tổng Thu': Math.round(totIn / 1000000),
      'Tổng Chi': Math.round(totOut / 1000000),
      'Số Dư Tiền': Math.round(rBal / 1000000),
      'Ngưỡng An Toàn': Math.round(safetyThreshold / 1000000),
    };
  });

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl mx-auto pb-16">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-teal-950/40 border border-emerald-500/30 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Module 6 • Văn Phòng Pro
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold text-xs">
              Quản Trị Thanh Khoản & Runway
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Kế Hoạch Dự Báo Dòng Tiền 12 Tuần
          </h1>
          <p className="text-slate-300 text-xs md:text-sm max-w-2xl mt-1 leading-relaxed">
            Dự báo điểm rơi thu chi, phát hiện sớm các tuần nguy cơ thâm hụt tiền mặt, tính toán <strong>Số tuần duy trì (Cash Runway)</strong> và xuất file Excel có công thức động.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleProcess(true)}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white font-bold text-xs flex items-center gap-2 border border-emerald-500/30 transition shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nạp Dữ Liệu Mẫu 12 Tuần</span>
          </button>
          <button
            onClick={() => handleProcess(false)}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
            <span>Chạy Dự Báo & Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* QUICK STATS CARDS */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Số Dư Tiền Dự Báo Cuối Kỳ</span>
            <div className={`text-xl font-black ${result.ending_cash >= safetyThreshold ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.ending_cash.toLocaleString()} đ
            </div>
            <div className="text-[10px] text-slate-500">
              Đầu kỳ: {result.initial_cash.toLocaleString()} đ ({result.net_change >= 0 ? '+' : ''}{result.net_change.toLocaleString()} đ)
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Số Tuần Duy Trì (Runway)</span>
            <div className="text-xl font-black text-cyan-400">
              {result.runway_weeks} Tuần
            </div>
            <div className="text-[10px] text-slate-500">
              Mức an toàn: &gt; 8 tuần vận hành
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Đáy Tiền Mặt Thấp Nhất</span>
            <div className={`text-xl font-black ${result.min_cash >= safetyThreshold ? 'text-amber-300' : 'text-red-400'}`}>
              {result.min_cash.toLocaleString()} đ
            </div>
            <div className="text-[10px] text-slate-400">
              Xảy ra tại: <strong>{result.min_week}</strong>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Cảnh Báo Thâm Hụt (&lt; {Math.round(safetyThreshold / 1000000)}M)</span>
            <div className={`text-xl font-black ${result.warning_weeks_count === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.warning_weeks_count} Tuần Rủi Ro
            </div>
            <div className="text-[10px] text-slate-400">
              {result.warning_weeks_count === 0 ? '✅ Toàn bộ 12 tuần an toàn' : '⚠️ Cần đàm phán giãn nợ/thu nợ'}
            </div>
          </div>
        </div>
      )}

      {/* TOP CONTROLS & CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SETTINGS CARD */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Cài Đặt Ngưỡng Thanh Khoản
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Số dư tiền mặt & tiền gửi đầu kỳ (VNĐ):</label>
              <input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-bold focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Ngưỡng tiền mặt dự phòng an toàn (VNĐ):</label>
              <input
                type="number"
                value={safetyThreshold}
                onChange={(e) => setSafetyThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-300 font-bold focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Nguyên tắc quản trị dòng tiền 12 tuần:
              </div>
              <div>• Dòng tiền vào: Thu nợ + Bán lẻ + Nguồn khác</div>
              <div>• Dòng tiền ra: Nhập hàng + Lương + Mặt bằng + Vay + Thuế</div>
              <div>• Khi số dư chạm ngưỡng đỏ: Chủ động đẩy sớm thu nợ Module 1!</div>
            </div>

            {result?.download_url && (
              <a
                href={result.download_url}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition mt-4"
              >
                <Download className="w-4 h-4" />
                <span>Tải Bảng Dự Báo 12 Tuần (.xlsx)</span>
              </a>
            )}
          </div>
        </div>

        {/* VISUAL CHART */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-xs text-white">Biểu Đồ Xu Hướng Dòng Tiền & Số Dư Dự Báo 12 Tuần</span>
              <p className="text-[11px] text-slate-400">Đơn vị: Triệu VNĐ (Cột: Thu/Chi · Đường: Số dư tiền mặt tích lũy)</p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
              12 Tuần Tới
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '11px',
                  }}
                  formatter={(val: any) => [`${val} Triệu VNĐ`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="Tổng Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tổng Chi" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Số Dư Tiền" stroke="#06b6d4" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Ngưỡng An Toàn" stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 12-WEEK DATA TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
          <span className="font-bold text-xs text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            Bảng Kế Hoạch Thu Chi Chi Tiết Từng Tuần (Có Thể Chỉnh Sửa Trực Tiếp)
          </span>
          <span className="text-[11px] text-slate-400">Đơn vị: VNĐ</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3">Tuần</th>
                <th className="p-3 text-emerald-400">Thu Công Nợ</th>
                <th className="p-3 text-emerald-400">Thu Bán Lẻ</th>
                <th className="p-3 text-emerald-400">Thu Khác</th>
                <th className="p-3 text-rose-400">Chi Nhập Hàng</th>
                <th className="p-3 text-rose-400">Chi Lương</th>
                <th className="p-3 text-rose-400">Chi Mặt Bằng</th>
                <th className="p-3 text-rose-400">Chi Vay Bank</th>
                <th className="p-3 text-rose-400">Chi Thuế</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {weeklyData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition">
                  <td className="p-2.5 font-bold text-white whitespace-nowrap bg-slate-950/40">
                    {row.week}
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.in_debt}
                      onChange={(e) => handleUpdateRow(idx, 'in_debt', e.target.value)}
                      className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-emerald-300 font-medium text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.in_sales}
                      onChange={(e) => handleUpdateRow(idx, 'in_sales', e.target.value)}
                      className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-emerald-300 font-medium text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.in_other}
                      onChange={(e) => handleUpdateRow(idx, 'in_other', e.target.value)}
                      className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-emerald-300 font-medium text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.out_cogs}
                      onChange={(e) => handleUpdateRow(idx, 'out_cogs', e.target.value)}
                      className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-300 font-medium text-xs focus:outline-none focus:border-rose-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.out_payroll}
                      onChange={(e) => handleUpdateRow(idx, 'out_payroll', e.target.value)}
                      className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-300 font-medium text-xs focus:outline-none focus:border-rose-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.out_rent}
                      onChange={(e) => handleUpdateRow(idx, 'out_rent', e.target.value)}
                      className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-300 font-medium text-xs focus:outline-none focus:border-rose-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.out_bank_interest}
                      onChange={(e) => handleUpdateRow(idx, 'out_bank_interest', e.target.value)}
                      className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-300 font-medium text-xs focus:outline-none focus:border-rose-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      value={row.out_tax}
                      onChange={(e) => handleUpdateRow(idx, 'out_tax', e.target.value)}
                      className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-rose-300 font-medium text-xs focus:outline-none focus:border-rose-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
