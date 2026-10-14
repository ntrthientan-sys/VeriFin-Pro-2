import React, { useState } from 'react';
import {
  Coins,
  Calculator,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  User,
  Users,
  CreditCard,
  Building,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface IncomeSource {
  id: string;
  sourceName: string;
  incomeType: 'salary_transfer' | 'salary_cash' | 'rental' | 'business' | 'other';
  declaredAmount: number;
  haircutPct: number;
  proofDocument: string;
}

export function IncomeAssessmentModule() {
  const [customerName, setCustomerName] = useState('Nguyễn Hoàng Nam & Lê Thị Thảo');
  const [borrowerAge, setBorrowerAge] = useState(38);
  const [coBorrowerAge, setCoBorrowerAge] = useState<number | ''>(35);
  const [dependentsCount, setDependentsCount] = useState(2);
  const [livingCostBorrower, setLivingCostBorrower] = useState(12000000);
  const [livingCostCoBorrower, setLivingCostCoBorrower] = useState(10000000);
  const [livingCostPerDependent, setLivingCostPerDependent] = useState(5000000);
  const [existingMonthlyDebt, setExistingMonthlyDebt] = useState(15000000);
  const [newLoanTenureMonths, setNewLoanTenureMonths] = useState(120); // 10 năm
  const [newLoanInterestYear, setNewLoanInterestYear] = useState(8.5);

  const [incomes, setIncomes] = useState<IncomeSource[]>([
    {
      id: '1',
      sourceName: 'Lương chuyển khoản (Chồng - Tech Lead Viettel)',
      incomeType: 'salary_transfer',
      declaredAmount: 38000000,
      haircutPct: 100,
      proofDocument: 'Sao kê Vietcombank 6 tháng gần nhất có mộc ngân hàng',
    },
    {
      id: '2',
      sourceName: 'Lương tiền mặt (Vợ - Kế toán Công ty TNHH)',
      incomeType: 'salary_cash',
      declaredAmount: 18000000,
      haircutPct: 75,
      proofDocument: 'Bảng lương đóng dấu mộc đỏ + Xác nhận thu nhập đơn vị',
    },
    {
      id: '3',
      sourceName: 'Cho thuê nhà nguyên căn mặt tiền (Quận 7, TP.HCM)',
      incomeType: 'rental',
      declaredAmount: 25000000,
      haircutPct: 85,
      proofDocument: 'Hợp đồng công chứng thời hạn 3 năm + Sao kê nhận tiền thuê',
    },
    {
      id: '4',
      sourceName: 'Lợi nhuận Hộ KD Cửa hàng thiết bị gia dụng',
      incomeType: 'business',
      declaredAmount: 35000000,
      haircutPct: 60,
      proofDocument: 'Sổ theo dõi thu chi tiền hàng 1 năm + Biên lai thuế khoán',
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAddSource = () => {
    const newInc: IncomeSource = {
      id: String(Date.now()),
      sourceName: 'Nguồn thu nhập bổ sung mới',
      incomeType: 'salary_transfer',
      declaredAmount: 15000000,
      haircutPct: 100,
      proofDocument: 'Chứng từ xác nhận hợp lệ',
    };
    setIncomes([...incomes, newInc]);
  };

  const handleRemoveSource = (id: string) => {
    setIncomes(incomes.filter((i) => i.id !== id));
  };

  const handleTypeChange = (id: string, type: IncomeSource['incomeType']) => {
    let defaultHaircut = 100;
    if (type === 'salary_transfer') defaultHaircut = 100;
    else if (type === 'salary_cash') defaultHaircut = 75;
    else if (type === 'rental') defaultHaircut = 85;
    else if (type === 'business') defaultHaircut = 60;
    else if (type === 'other') defaultHaircut = 50;

    setIncomes(
      incomes.map((i) => (i.id === id ? { ...i, incomeType: type, haircutPct: defaultHaircut } : i))
    );
  };

  const handleUpdateField = (id: string, field: keyof IncomeSource, value: any) => {
    setIncomes(incomes.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleProcess = async (useSample: boolean = false) => {
    setLoading(true);
    try {
      const payload = useSample
        ? { use_sample: true }
        : {
            customer_name: customerName,
            borrower_age: borrowerAge,
            co_borrower_age: coBorrowerAge || undefined,
            dependents_count: dependentsCount,
            living_cost_borrower: livingCostBorrower,
            living_cost_co_borrower: coBorrowerAge ? livingCostCoBorrower : 0,
            living_cost_per_dependent: livingCostPerDependent,
            existing_monthly_debt: existingMonthlyDebt,
            new_loan_tenure_months: newLoanTenureMonths,
            new_loan_interest_year: newLoanInterestYear,
            incomes: incomes,
          };

      const res = await fetch('/api/bank/income-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lỗi xử lý thẩm định nguồn thu.');
      }

      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      alert(e.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  // Pie chart colors
  const COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899'];

  const pieData = result
    ? result.incomes.map((inc: any, i: number) => ({
        name: inc.sourceName.split('(')[0].trim(),
        value: inc.recognizedAmount,
        color: COLORS[i % COLORS.length],
      }))
    : incomes.map((inc, i) => ({
        name: inc.sourceName.split('(')[0].trim(),
        value: Math.round(inc.declaredAmount * (inc.haircutPct / 100)),
        color: COLORS[i % COLORS.length],
      }));

  return (
    <div className="space-y-6 animate-fadeIn max-w-7xl mx-auto pb-16">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border border-amber-500/30 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs border border-amber-500/30 flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5" />
              Module 12 • Ngân Hàng Pro
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-xs">
              Chuẩn Basel & Rủi Ro Tín Dụng
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Thẩm Định Nguồn Thu Nhập Đa Nguồn & NDI Thực Tế
          </h1>
          <p className="text-slate-300 text-xs md:text-sm max-w-2xl mt-1 leading-relaxed">
            Đánh giá tổng thu nhập khai báo vs thu nhập ghi nhận sau Haircut rủi ro, trừ định mức sinh hoạt gia đình & nghĩa vụ CIC để tính <strong>Thu nhập ròng khả dụng (NDI)</strong> và <strong>Room vay tối đa</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleProcess(true)}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white font-bold text-xs flex items-center gap-2 border border-amber-500/30 transition shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nạp Dữ Liệu Mẫu</span>
          </button>
          <button
            onClick={() => handleProcess(false)}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-600/30 transition"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
            <span>Tính Toán NDI & Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* QUICK STATS CARDS */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Thu Nhập Thừa Nhận (Sau Haircut)</span>
            <div className="text-xl font-black text-emerald-400">
              {result.total_recognized.toLocaleString()} đ
            </div>
            <div className="text-[10px] text-slate-500">
              Khai báo: {result.total_declared.toLocaleString()} đ
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Tổng Chi Phí & Nợ CIC</span>
            <div className="text-xl font-black text-amber-400">
              {(result.total_living_cost + result.existing_debt).toLocaleString()} đ
            </div>
            <div className="text-[10px] text-slate-500">
              Sinh hoạt: {result.total_living_cost.toLocaleString()} đ · CIC: {result.existing_debt.toLocaleString()} đ
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Thu Nhập Ròng Khả Dụng (NDI)</span>
            <div className={`text-xl font-black ${result.ndi > 0 ? 'text-cyan-400' : 'text-red-400'}`}>
              {result.ndi.toLocaleString()} đ
            </div>
            <div className="text-[10px] text-slate-400 font-semibold">
              {result.ndi > 0 ? '✅ Đủ khả năng trả nợ' : '❌ Nguồn thu âm'}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-1">
            <span className="text-[11px] text-slate-400 font-medium">Hạn Mức Vay Tối Đa (Kỳ hạn {newLoanTenureMonths}T)</span>
            <div className="text-xl font-black text-amber-300">
              {result.max_loan_capacity.toLocaleString()} đ
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold">
              Trả góp tối đa: {result.max_monthly_payment.toLocaleString()} đ/tháng
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT: 2 COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: CÀI ĐẶT THÔNG SỐ KHÁCH HÀNG & CHI PHÍ */}
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <User className="w-4 h-4" />
              1. Thông Tin Khách Hàng & Gia Đình
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Tên khách hàng / Vợ chồng:</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Tuổi người vay:</label>
                  <input
                    type="number"
                    value={borrowerAge}
                    onChange={(e) => setBorrowerAge(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Tuổi vợ/chồng:</label>
                  <input
                    type="number"
                    value={coBorrowerAge}
                    onChange={(e) => setCoBorrowerAge(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Không có"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Số người phụ thuộc (con nhỏ, bố mẹ già):</label>
                <input
                  type="number"
                  value={dependentsCount}
                  onChange={(e) => setDependentsCount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Nghĩa vụ trả nợ CIC hiện tại (VNĐ/tháng):</label>
                <input
                  type="number"
                  value={existingMonthlyDebt}
                  onChange={(e) => setExistingMonthlyDebt(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-red-400 font-bold focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Users className="w-4 h-4" />
              2. Định Mức Chi Phí Sinh Hoạt (VNĐ/Tháng)
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Chi phí người vay chính:</label>
                <input
                  type="number"
                  value={livingCostBorrower}
                  onChange={(e) => setLivingCostBorrower(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {coBorrowerAge !== '' && (
                <div>
                  <label className="text-slate-400 block mb-1">Chi phí vợ/chồng đồng vay:</label>
                  <input
                    type="number"
                    value={livingCostCoBorrower}
                    onChange={(e) => setLivingCostCoBorrower(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1">Định mức cho mỗi người phụ thuộc:</label>
                <input
                  type="number"
                  value={livingCostPerDependent}
                  onChange={(e) => setLivingCostPerDependent(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Tổng định mức sinh hoạt:</span>
                <span className="font-bold text-white">
                  {(
                    livingCostBorrower +
                    (coBorrowerAge ? livingCostCoBorrower : 0) +
                    dependentsCount * livingCostPerDependent
                  ).toLocaleString()}{' '}
                  đ
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              3. Giả Định Khoản Vay Mới
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Thời hạn (Tháng):</label>
                <input
                  type="number"
                  value={newLoanTenureMonths}
                  onChange={(e) => setNewLoanTenureMonths(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Lãi suất (%/năm):</label>
                <input
                  type="number"
                  step="0.1"
                  value={newLoanInterestYear}
                  onChange={(e) => setNewLoanInterestYear(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-semibold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DANH SÁCH CÁC NGUỒN THU NHẬP (2 COLS) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Danh Sách Các Nguồn Thu Nhập Khai Báo
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tỷ lệ Haircut rủi ro: Lương CK (100%), Lương tiền mặt (75%), BĐS cho thuê (85%), Hộ KD (60%)
                </p>
              </div>

              <button
                onClick={handleAddSource}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 border border-amber-500/30 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Nguồn Thu</span>
              </button>
            </div>

            <div className="space-y-3">
              {incomes.map((inc, idx) => (
                <div
                  key={inc.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={inc.sourceName}
                      onChange={(e) => handleUpdateField(inc.id, 'sourceName', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-amber-400"
                    />
                    {incomes.length > 1 && (
                      <button
                        onClick={() => handleRemoveSource(inc.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Xóa nguồn thu này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-slate-400 block mb-1">Loại nguồn thu:</label>
                      <select
                        value={inc.incomeType}
                        onChange={(e) => handleTypeChange(inc.id, e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-white font-medium focus:outline-none focus:border-amber-400"
                      >
                        <option value="salary_transfer">Lương CK (100%)</option>
                        <option value="salary_cash">Lương tiền mặt (75%)</option>
                        <option value="rental">Cho thuê BĐS / Xe (85%)</option>
                        <option value="business">Lợi nhuận Hộ KD (60%)</option>
                        <option value="other">Thu nhập khác (50%)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Thu nhập khai báo (VNĐ):</label>
                      <input
                        type="number"
                        value={inc.declaredAmount}
                        onChange={(e) => handleUpdateField(inc.id, 'declaredAmount', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-emerald-400 font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Tỷ lệ Haircut (%):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={inc.haircutPct}
                          onChange={(e) => handleUpdateField(inc.id, 'haircutPct', Number(e.target.value))}
                          className="w-20 px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-amber-300 font-bold focus:outline-none focus:border-amber-400 text-center"
                        />
                        <div className="text-[11px] text-slate-400 flex-1 truncate">
                          Ghi nhận: <strong className="text-white">{(Math.round(inc.declaredAmount * (inc.haircutPct / 100))).toLocaleString()} đ</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 text-[11px]">Hồ sơ chứng minh đính kèm:</label>
                    <input
                      type="text"
                      value={inc.proofDocument}
                      onChange={(e) => handleUpdateField(inc.id, 'proofDocument', e.target.value)}
                      placeholder="Sao kê ngân hàng, hợp đồng cho thuê, bảng lương..."
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VISUAL CHART & CAPACITIES PREVIEW */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Donut chart: Cơ cấu nguồn thu */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs text-white">Cơ Cấu Thu Nhập Ghi Nhận (Thừa Nhận)</span>
                <p className="text-[11px] text-slate-400">Tỷ lệ các nguồn thu sau khi đã áp tỷ lệ Haircut rủi ro</p>
              </div>

              <div className="h-44 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value">
                      {pieData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()} VNĐ`, 'Thu nhập thừa nhận']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1 pt-2 border-t border-slate-800 text-[11px]">
                {pieData.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-slate-300 flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="font-bold text-white shrink-0">{p.value.toLocaleString()} đ</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bảng hạn mức vay theo các kỳ hạn */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs text-white">Ước Tính Hạn Mức Vay Tối Đa (Room Cấp Tín Dụng)</span>
                <p className="text-[11px] text-slate-400">Dựa trên 80% NDI khả dụng và lãi suất {newLoanInterestYear}%/năm</p>
              </div>

              <div className="space-y-2 text-xs">
                {result?.capacities ? (
                  <>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">Vay 3 năm (36T - Tiêu dùng / Xe):</span>
                      <strong className="text-cyan-400">{result.capacities.year3.toLocaleString()} đ</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">Vay 5 năm (60T - KD trung hạn):</span>
                      <strong className="text-emerald-400">{result.capacities.year5.toLocaleString()} đ</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">Vay 10 năm (120T - Mua nhà/đất):</span>
                      <strong className="text-amber-400">{result.capacities.year10.toLocaleString()} đ</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">Vay 20 năm (240T - Nhà ở dài hạn):</span>
                      <strong className="text-purple-400">{result.capacities.year20.toLocaleString()} đ</strong>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center text-slate-500 italic">
                    Bấm "Tính Toán NDI & Xuất Excel" để hiển thị hạn mức vay chi tiết
                  </div>
                )}
              </div>

              {result?.download_url && (
                <a
                  href={result.download_url}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Bảng Thẩm Định Nguồn Thu (.xlsx)</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
