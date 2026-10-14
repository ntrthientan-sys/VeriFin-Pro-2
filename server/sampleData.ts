import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

export async function getSamplePayslipTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mau_Phieu_Luong_DN', {
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  });

  // Column widths
  ws.columns = [
    { width: 6 },   // A: STT
    { width: 34 },  // B: Mục / Tiêu chí
    { width: 24 },  // C: Số tiền (VNĐ)
    { width: 30 },  // D: Ghi chú / Diễn giải
  ];

  // Header Company
  ws.mergeCells('A1:D1');
  const a1 = ws.getCell('A1');
  a1.value = 'CÔNG TY CỔ PHẦN CÔNG NGHỆ & TÀI CHÍNH DOANH NGHIỆP';
  a1.font = { bold: true, size: 12, color: { argb: 'FF1F4E78' } };
  a1.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells('A2:D2');
  const a2 = ws.getCell('A2');
  a2.value = 'Địa chỉ: Tầng 12, Tòa nhà Landmark, Ba Đình, Hà Nội | MST: 0109887766';
  a2.font = { italic: true, size: 9, color: { argb: 'FF595959' } };

  // Title
  ws.mergeCells('A4:D4');
  const a4 = ws.getCell('A4');
  a4.value = 'PHIẾU LƯƠNG & THU NHẬP CHI TIẾT NHÂN VIÊN';
  a4.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  a4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  a4.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 28;

  ws.mergeCells('A5:D5');
  const a5 = ws.getCell('A5');
  a5.value = 'Kỳ tính lương: Tháng 10/2026 (Từ ngày 01/10/2026 đến ngày 31/10/2026)';
  a5.font = { italic: true, size: 10, color: { argb: 'FF333333' } };
  a5.alignment = { horizontal: 'center', vertical: 'middle' };

  // Employee details section
  ws.getCell('A7').value = 'Mã nhân viên:';
  ws.getCell('A7').font = { bold: true };
  ws.getCell('B7').value = '{{Mã NV}}';
  ws.getCell('B7').font = { bold: true, color: { argb: 'FF002060' } };

  ws.getCell('C7').value = 'Họ và tên:';
  ws.getCell('C7').font = { bold: true };
  ws.getCell('D7').value = '{{Họ và Tên}}';
  ws.getCell('D7').font = { bold: true, color: { argb: 'FF002060' } };

  ws.getCell('A8').value = 'Chức vụ:';
  ws.getCell('A8').font = { bold: true };
  ws.getCell('B8').value = '{{Chức vụ}}';

  ws.getCell('C8').value = 'Ngày chi trả:';
  ws.getCell('C8').font = { bold: true };
  ws.getCell('D8').value = '15/10/2026';

  // Table header Row 10
  const headerRow = ws.getRow(10);
  headerRow.values = ['STT', 'Khoản Mục / Chỉ Tiêu Lương', 'Số Tiền (VNĐ)', 'Ghi Chú'];
  headerRow.height = 24;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Section I: Thu nhập
  ws.mergeCells('A11:D11');
  const sec1 = ws.getCell('A11');
  sec1.value = 'I. CÁC KHOẢN MỤC THU NHẬP';
  sec1.font = { bold: true, color: { argb: 'FF1F4E78' } };
  sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  const incomeItems = [
    [1, 'Lương cơ bản theo hợp đồng', '{{Lương cơ bản}}', 'Hệ số lương chức danh'],
    [2, 'Thưởng hiệu quả / KPI công việc', '{{Thưởng KPI}}', 'Đánh giá xếp loại A'],
    [3, 'Phụ cấp xăng xe, điện thoại', '{{Phụ cấp xăng xe}}', 'Theo quy chế tài chính'],
  ];

  let curRow = 12;
  incomeItems.forEach(item => {
    const r = ws.getRow(curRow);
    r.values = item;
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(3).numFmt = '#,##0';
    [1, 2, 3, 4].forEach(col => {
      r.getCell(col).border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    });
    curRow++;
  });

  // Subtotal I
  const rowTotI = ws.getRow(curRow);
  rowTotI.getCell(1).value = '';
  rowTotI.getCell(2).value = 'Cộng Tổng Thu Nhập (I)';
  rowTotI.getCell(2).font = { bold: true };
  rowTotI.getCell(3).value = { formula: `=SUM(C12:C${curRow - 1})` };
  rowTotI.getCell(3).font = { bold: true, color: { argb: 'FF1F4E78' } };
  rowTotI.getCell(3).numFmt = '#,##0';
  rowTotI.getCell(3).alignment = { horizontal: 'right' };
  rowTotI.getCell(4).value = 'Chưa trừ BHXH & Thuế';
  rowTotI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  curRow++;

  // Section II: Khấu trừ
  ws.mergeCells(`A${curRow}:D${curRow}`);
  const sec2 = ws.getCell(`A${curRow}`);
  sec2.value = 'II. CÁC KHOẢN KHẤU TRỪ & NGHĨA VỤ';
  sec2.font = { bold: true, color: { argb: 'FFC00000' } };
  sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
  curRow++;

  const dedStart = curRow;
  const dedItems = [
    [1, 'Trích nộp BHXH, BHYT, BHTN (10.5%)', '{{BHXH}}', 'Trừ vào lương hàng tháng'],
    [2, 'Thuế thu nhập cá nhân (TNCN)', 0, 'Giảm trừ gia cảnh bản thân'],
  ];

  dedItems.forEach(item => {
    const r = ws.getRow(curRow);
    r.values = item;
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(3).numFmt = '#,##0';
    [1, 2, 3, 4].forEach(col => {
      r.getCell(col).border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    });
    curRow++;
  });

  // Subtotal II
  const rowTotII = ws.getRow(curRow);
  rowTotII.getCell(1).value = '';
  rowTotII.getCell(2).value = 'Cộng Các Khoản Giảm Trừ (II)';
  rowTotII.getCell(2).font = { bold: true };
  rowTotII.getCell(3).value = { formula: `=SUM(C${dedStart}:C${curRow - 1})` };
  rowTotII.getCell(3).font = { bold: true, color: { argb: 'FFC00000' } };
  rowTotII.getCell(3).numFmt = '#,##0';
  rowTotII.getCell(3).alignment = { horizontal: 'right' };
  rowTotII.getCell(4).value = 'Đã trích nộp';
  rowTotII.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  curRow++;

  // Section III: THỰC LĨNH
  const netRow = ws.getRow(curRow);
  netRow.height = 30;
  netRow.getCell(1).value = '★';
  netRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  netRow.getCell(2).value = 'III. SỐ TIỀN THỰC LĨNH CHUYỂN KHOẢN (I - II)';
  netRow.getCell(2).font = { bold: true, size: 11, color: { argb: 'FF006100' } };
  netRow.getCell(2).alignment = { vertical: 'middle' };
  netRow.getCell(3).value = '{{Thực lĩnh}}';
  netRow.getCell(3).font = { bold: true, size: 13, color: { argb: 'FF006100' } };
  netRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
  netRow.getCell(3).numFmt = '#,##0';
  netRow.getCell(4).value = 'Tài khoản ngân hàng';
  netRow.getCell(4).alignment = { vertical: 'middle' };
  [1, 2, 3, 4].forEach(col => {
    const c = netRow.getCell(col);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    c.border = {
      top: { style: 'medium', color: { argb: 'FF006100' } },
      bottom: { style: 'medium', color: { argb: 'FF006100' } },
      left: { style: 'thin', color: { argb: 'FF006100' } },
      right: { style: 'thin', color: { argb: 'FF006100' } },
    };
  });
  curRow++;

  // Amount in words
  ws.mergeCells(`A${curRow}:D${curRow}`);
  const wordCell = ws.getCell(`A${curRow}`);
  wordCell.value = 'Số tiền bằng chữ: {{Thực lĩnh bằng chữ}}';
  wordCell.font = { italic: true, size: 10, color: { argb: 'FF1F4E78' } };
  curRow += 2;

  // Signatures
  ws.getCell(`A${curRow}`).value = 'NGƯỜI LẬP BIỂU';
  ws.getCell(`A${curRow}`).font = { bold: true, size: 9 };
  ws.getCell(`A${curRow}`).alignment = { horizontal: 'center' };

  ws.getCell(`B${curRow}`).value = 'KẾ TOÁN TRƯỞNG';
  ws.getCell(`B${curRow}`).font = { bold: true, size: 9 };
  ws.getCell(`B${curRow}`).alignment = { horizontal: 'center' };

  ws.getCell(`C${curRow}`).value = 'GIÁM ĐỐC / TRƯỞNG PHÒNG';
  ws.getCell(`C${curRow}`).font = { bold: true, size: 9 };
  ws.getCell(`C${curRow}`).alignment = { horizontal: 'center' };

  ws.getCell(`D${curRow}`).value = 'NGƯỜI NHẬN LƯƠNG';
  ws.getCell(`D${curRow}`).font = { bold: true, size: 9 };
  ws.getCell(`D${curRow}`).alignment = { horizontal: 'center' };

  curRow++;
  ['A', 'B', 'C', 'D'].forEach(c => {
    ws.getCell(`${c}${curRow}`).value = '(Ký, ghi rõ họ tên)';
    ws.getCell(`${c}${curRow}`).font = { italic: true, size: 8, color: { argb: 'FF888888' } };
    ws.getCell(`${c}${curRow}`).alignment = { horizontal: 'center' };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function getSampleDebtWorkbook(): Buffer {
  const today = new Date();
  const past10 = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0];
  const past5 = new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0];
  const future5 = new Date(today.getTime() + 5 * 86400000).toISOString().split('T')[0];

  const data = [
    {
      "Mã KH": "KH001",
      "Tên Khách Hàng": "Công ty Thủy sản Hùng Cá",
      "Phải thu": 150000000,
      "Đã thu": 0,
      "Email": "ketoan@hungca.vn",
      "Hạn thanh toán": past10
    },
    {
      "Mã KH": "KH002",
      "Tên Khách Hàng": "Đại lý Thức ăn Thủy sản Minh Phú",
      "Phải thu": 85000000,
      "Đã thu": 0,
      "Email": "minhphu@gmail.com",
      "Hạn thanh toán": past5
    },
    {
      "Mã KH": "KH003",
      "Tên Khách Hàng": "Hộ KD Nguyễn Văn Tám",
      "Phải thu": 40000000,
      "Đã thu": 40000000,
      "Email": "tamnguyen@gmail.com",
      "Hạn thanh toán": future5
    },
    {
      "Mã KH": "KH004",
      "Tên Khách Hàng": "Công ty CP Nông Nghiệp Xanh",
      "Phải thu": 62000000,
      "Đã thu": 12000000,
      "Email": "ketoan@xanhagri.vn",
      "Hạn thanh toán": past10
    }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "So_Cong_No");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function getSampleBankWorkbook(): Buffer {
  const data = [
    { "Ngày GD": "2026-10-01", "Nội dung diễn giải": "KH001 Cong ty Hung Ca thanh toan tien hang dot 1", "Ghi Có": 50000000, "Ghi Nợ": 0 },
    { "Ngày GD": "2026-10-03", "Nội dung diễn giải": "Thu tien ban ca tra giong cho khach le", "Ghi Có": 120000000, "Ghi Nợ": 0 },
    { "Ngày GD": "2026-10-05", "Nội dung diễn giải": "Chuyen tien noi bo cung chu tai khoan", "Ghi Có": 200000000, "Ghi Nợ": 0 },
    { "Ngày GD": "2026-10-06", "Nội dung diễn giải": "Chuyen tiền", "Ghi Có": 300000000, "Ghi Nợ": 0 },
    { "Ngày GD": "2026-10-08", "Nội dung diễn giải": "Thanh toan mua USDT Binance P2P", "Ghi Có": 0, "Ghi Nợ": 45000000 },
    { "Ngày GD": "2026-10-09", "Nội dung diễn giải": "Tra lai vay ngan hang FE Credit hang thang", "Ghi Có": 0, "Ghi Nợ": 12000000 },
    { "Ngày GD": "2026-10-10", "Nội dung diễn giải": "Thanh toan cam do Thanh Tung", "Ghi Có": 0, "Ghi Nợ": 25000000 },
    { "Ngày GD": "2026-10-12", "Nội dung diễn giải": "Mua thuc an ca tra va thuoc thuy san", "Ghi Có": 0, "Ghi Nợ": 35000000 },
    { "Ngày GD": "2026-10-13", "Nội dung diễn giải": "Thu hoi no ban le tien mat", "Ghi Có": 40000000, "Ghi Nợ": 0 }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sao_Ke_Ngan_Hang");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function getSampleReconcileA(): Buffer {
  const data = [
    { "Mã Đơn": "DH01", "Khách hàng": "Anh Bình", "Thành tiền": 15000000 },
    { "Mã Đơn": "DH02", "Khách hàng": "Chị Lan", "Thành tiền": 22000000 },
    { "Mã Đơn": "DH03", "Khách hàng": "Anh Tuấn", "Thành tiền": 9500000 },
    { "Mã Đơn": "DH05", "Khách hàng": "Chị Mai", "Thành tiền": 31000000 }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ban_Hang_Noi_Bo");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function getSampleReconcileB(): Buffer {
  const data = [
    { "Mã Đơn": "DH01", "Ghi chú kho": "Đã xuất kho", "Số tiền kế toán": 15000000 },
    { "Mã Đơn": "DH02", "Ghi chú kho": "Đã xuất kho", "Số tiền kế toán": 19500000 },
    { "Mã Đơn": "DH04", "Ghi chú kho": "Hàng hoàn", "Số tiền kế toán": 5000000 },
    { "Mã Đơn": "DH05", "Ghi chú kho": "Đã thu cọc", "Số tiền kế toán": 31000000 }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ke_Toan_Kho");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function getSamplePayroll(): Buffer {
  const data = [
    { "Mã NV": "NV01", "Họ và Tên": "Nguyễn Văn An", "Chức vụ": "Chuyên viên QHKH", "Lương cơ bản": 12000000, "Thưởng KPI": 8000000, "Phụ cấp xăng xe": 1000000, "BHXH": 1260000, "Thực lĩnh": 19740000 },
    { "Mã NV": "NV02", "Họ và Tên": "Trần Thị Bích", "Chức vụ": "Giao dịch viên", "Lương cơ bản": 10000000, "Thưởng KPI": 3000000, "Phụ cấp xăng xe": 500000, "BHXH": 1050000, "Thực lĩnh": 12450000 },
    { "Mã NV": "NV03", "Họ và Tên": "Lê Hoàng Nam", "Chức vụ": "", "Lương cơ bản": null, "Thưởng KPI": null, "Phụ cấp xăng xe": null, "BHXH": null, "Thực lĩnh": null },
    { "Mã NV": "NV04", "Họ và Tên": "Phạm Quốc Hưng", "Chức vụ": "Trưởng phòng Kế hoạch", "Lương cơ bản": 20000000, "Thưởng KPI": 15000000, "Phụ cấp xăng xe": 2000000, "BHXH": 2100000, "Thực lĩnh": 34900000 }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bang_Luong");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function getSamplePortfolio(): Buffer {
  const today = new Date();
  const plus2 = new Date(today.getTime() + 2 * 86400000).toISOString().split('T')[0];
  const plus4 = new Date(today.getTime() + 4 * 86400000).toISOString().split('T')[0];
  const minus3 = new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0];
  const plus15 = new Date(today.getTime() + 15 * 86400000).toISOString().split('T')[0];

  const data = [
    { "Tên khách hàng": "Anh Trần Văn Hòa", "SĐT": "0918123456", "Loại sản phẩm": "Vay kinh doanh", "Số tiền": 25000000, "Ngày đáo hạn": plus2 },
    { "Tên khách hàng": "Cô Nguyễn Thị Mai", "SĐT": "0909888777", "Loại sản phẩm": "Tiết kiệm có kỳ hạn", "Số tiền": 500000000, "Ngày đáo hạn": plus4 },
    { "Tên khách hàng": "Anh Lê Minh Tâm", "SĐT": "0988111222", "Loại sản phẩm": "Vay mua xe", "Số tiền": 14500000, "Ngày đáo hạn": minus3 },
    { "Tên khách hàng": "Chị Đỗ Thu Hà", "SĐT": "0934567890", "Loại sản phẩm": "Tiết kiệm Phát Lộc", "Số tiền": 200000000, "Ngày đáo hạn": plus15 }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Danh_Muc_Tin_Dung_STK");
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function getSampleCollateralAssets() {
  return [
    {
      Chu_So_Huu: "Ông Trần Văn Hòa & Bà Lê Thị Thảo",
      Thua_To_Dia_Chi: "Thửa 142, Tờ BĐ 18 - P. Châu Phú A, TP. Châu Đốc, An Giang",
      Loai_Dat: "Đất ở tại đô thị (ODT)",
      Dien_Tich_m2: 120.5,
      Don_Gia_Dinh_Gia_VND: 22000000,
      Ty_Le_LTV: 0.75,
      Thoi_Han_Su_Dung: "Lâu dài",
      Canh_Bao_Phap_Ly: "✅ Pháp lý chuẩn (Tài sản đồng sở hữu vợ chồng)",
    },
    {
      Chu_So_Huu: "Ông Trần Văn Hòa",
      Thua_To_Dia_Chi: "Thửa 89, Tờ BĐ 05 - Xã Bình Long, Huyện Châu Phú, An Giang",
      Loai_Dat: "Đất nuôi trồng thủy sản (NTS)",
      Dien_Tich_m2: 8500.0,
      Don_Gia_Dinh_Gia_VND: 180000,
      Ty_Le_LTV: 0.50,
      Thoi_Han_Su_Dung: "Đến 10/2027",
      Canh_Bao_Phap_Ly: "⚠️ Đất nông nghiệp sắp hết hạn sử dụng (< 2 năm) - Cần làm thủ tục gia hạn",
    },
    {
      Chu_So_Huu: "Hộ ông Trần Văn Hòa",
      Thua_To_Dia_Chi: "Thửa 215, Tờ BĐ 12 - Xã Mỹ Đức, Huyện Châu Phú, An Giang",
      Loai_Dat: "Đất ở tại nông thôn (ONT)",
      Dien_Tich_m2: 300.0,
      Don_Gia_Dinh_Gia_VND: 4500000,
      Ty_Le_LTV: 0.70,
      Thoi_Han_Su_Dung: "Lâu dài",
      Canh_Bao_Phap_Ly: "⚠️ Cấp cho 'Hộ gia đình' - Cần văn bản đồng thuận của tất cả thành viên hộ khẩu",
    },
  ];
}

// ==========================================
// 11. DỮ LIỆU MẪU THẨM ĐỊNH NGUỒN THU (BANK PRO)
// ==========================================
export function getSampleIncomeAssessmentData() {
  return {
    customerName: 'Nguyễn Hoàng Nam & Lê Thị Thảo',
    borrowerAge: 38,
    coBorrowerAge: 35,
    dependentsCount: 2,
    livingCostBorrower: 12000000,
    livingCostCoBorrower: 10000000,
    livingCostPerDependent: 5000000,
    existingMonthlyDebt: 15000000, // Đang trả CIC
    incomes: [
      {
        sourceName: 'Lương chuyển khoản (Chồng - Tech Lead Viettel)',
        incomeType: 'salary_transfer',
        declaredAmount: 38000000,
        haircutPct: 100, // Nhận đủ 100%
        proofDocument: 'Sao kê Vietcombank 6 tháng gần nhất có dấu ngân hàng',
      },
      {
        sourceName: 'Lương tiền mặt (Vợ - Kế toán Công ty TNHH)',
        incomeType: 'salary_cash',
        declaredAmount: 18000000,
        haircutPct: 75, // Giảm trừ 25% rủi ro tiền mặt
        proofDocument: 'Bảng lương đóng dấu mộc đỏ + Xác nhận thu nhập đơn vị',
      },
      {
        sourceName: 'Cho thuê nhà nguyên căn mặt tiền (Quận 7, TP.HCM)',
        incomeType: 'rental',
        declaredAmount: 25000000,
        haircutPct: 85, // Giảm trừ 15% chi phí bảo trì & trống phòng
        proofDocument: 'Hợp đồng công chứng thời hạn 3 năm + Sao kê nhận tiền thuê',
      },
      {
        sourceName: 'Lợi nhuận Hộ KD Cửa hàng thiết bị gia dụng',
        incomeType: 'business',
        declaredAmount: 35000000,
        haircutPct: 60, // Giảm trừ 40% chi phí ẩn & rủi ro thuế
        proofDocument: 'Sổ theo dõi thu chi tiền hàng 1 năm + Biên lai nộp thuế khoán',
      },
    ],
  };
}

export async function getSampleIncomeWorkbook(): Promise<Buffer> {
  const data = getSampleIncomeAssessmentData();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mau_Tham_Dinh_Nguon_Thu');

  ws.columns = [
    { width: 6 },
    { width: 42 },
    { width: 24 },
    { width: 22 },
    { width: 26 },
    { width: 45 },
  ];

  // Header banner
  ws.mergeCells('A1:F1');
  const a1 = ws.getCell('A1');
  a1.value = 'BẢNG THẨM ĐỊNH NGUỒN THU NHẬP & KHẢ NĂNG TRẢ NỢ THỰC TẾ';
  a1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  a1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
  a1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.getCell('A3').value = 'Khách hàng thẩm định:';
  ws.getCell('B3').value = data.customerName;
  ws.getCell('B3').font = { bold: true, color: { argb: 'FF002060' } };

  ws.getCell('D3').value = 'Số người phụ thuộc:';
  ws.getCell('E3').value = data.dependentsCount;
  ws.getCell('E3').font = { bold: true };

  ws.getCell('A4').value = 'Nghĩa vụ trả nợ CIC hiện tại:';
  ws.getCell('B4').value = data.existingMonthlyDebt;
  ws.getCell('B4').numFmt = '#,##0 "VNĐ"';
  ws.getCell('B4').font = { bold: true, color: { argb: 'FFC00000' } };

  const hRow = ws.getRow(6);
  hRow.values = [
    'STT',
    'Tên Nguồn Thu Nhập',
    'Thu Nhập Khai Báo (VNĐ)',
    'Hệ Số Ghi Nhận (%)',
    'Thu Nhập Thừa Nhận (VNĐ)',
    'Hồ Sơ Chứng Minh Cung Cấp',
  ];
  hRow.height = 24;
  hRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  data.incomes.forEach((inc, idx) => {
    const rNum = idx + 7;
    ws.addRow([
      idx + 1,
      inc.sourceName,
      inc.declaredAmount,
      inc.haircutPct / 100,
      { formula: `C${rNum}*D${rNum}`, result: inc.declaredAmount * (inc.haircutPct / 100) },
      inc.proofDocument,
    ]);
  });

  const lastR = data.incomes.length + 7;
  const sumRow = ws.addRow([
    '',
    'TỔNG THU NHẬP HÀNG THÁNG',
    { formula: `SUM(C7:C${lastR - 1})` },
    '',
    { formula: `SUM(E7:E${lastR - 1})` },
    '',
  ]);
  sumRow.font = { bold: true };

  ws.addRow([]);
  const livingCostTotal =
    data.livingCostBorrower +
    data.livingCostCoBorrower +
    data.dependentsCount * data.livingCostPerDependent;
  const ndiRow = ws.addRow([
    '',
    'CHI PHÍ SINH HOẠT GIA ĐÌNH ĐỊNH MỨC',
    '',
    '',
    livingCostTotal,
    'Theo định mức: Người vay 12tr, Vợ 10tr, 2 con 10tr',
  ]);
  ndiRow.font = { bold: true };

  const ndiFinalRow = ws.addRow([
    '',
    '👉 THU NHẬP RÒNG DÙNG TRẢ NỢ MỚI (NDI)',
    '',
    '',
    { formula: `E${lastR}-E${lastR + 2}-B4` },
    'Thu nhập thừa nhận - Chi phí sinh hoạt - Trả nợ CIC',
  ]);
  ndiFinalRow.font = { bold: true, size: 12 };
  ndiFinalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };

  ws.eachRow((r, rowNumber) => {
    if (rowNumber >= 7) {
      r.getCell(3).numFmt = '#,##0';
      r.getCell(4).numFmt = '0%';
      r.getCell(5).numFmt = '#,##0';
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ==========================================
// 12. DỮ LIỆU MẪU DỰ BÁO DÒNG TIỀN 12 TUẦN (OFFICE PRO)
// ==========================================
export function getSampleCashFlowData() {
  const initialCash = 950000000; // 950 triệu
  const weeklyData = [
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
  ];

  return { initialCash, weeklyData };
}

export async function getSampleCashFlowWorkbook(): Promise<Buffer> {
  const { initialCash, weeklyData } = getSampleCashFlowData();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Du_Bao_Dong_Tien_12_Tuan');

  ws.columns = [
    { width: 14 }, // Tuần
    { width: 22 }, // Số dư đầu kỳ
    { width: 18 }, // Thu công nợ
    { width: 18 }, // Thu bán lẻ
    { width: 16 }, // Thu khác
    { width: 20 }, // Tổng Thu
    { width: 18 }, // Chi nhập hàng
    { width: 18 }, // Chi lương
    { width: 16 }, // Chi thuê & VH
    { width: 18 }, // Chi trả nợ Bank
    { width: 16 }, // Chi thuế
    { width: 20 }, // Tổng Chi
    { width: 20 }, // Dòng tiền ròng
    { width: 22 }, // Số dư cuối kỳ
    { width: 18 }, // Cảnh báo
  ];

  // Title
  ws.mergeCells('A1:O1');
  const t = ws.getCell('A1');
  t.value = 'KẾ HOẠCH DỰ BÁO DÒNG TIỀN 12 TUẦN (12-WEEK CASH FLOW FORECAST)';
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  const hRow = ws.getRow(3);
  hRow.values = [
    'Tuần',
    'Số Dư Đầu Kỳ',
    'Thu Công Nợ',
    'Thu Bán Hàng',
    'Thu Khác',
    'Tổng Thu',
    'Chi Nhập Hàng',
    'Chi Lương',
    'Chi Thuê/VH',
    'Chi Vay Bank',
    'Chi Thuế',
    'Tổng Chi',
    'Dòng Tiền Ròng',
    'Số Dư Cuối Kỳ',
    'Đánh Giá Rủi Ro',
  ];
  hRow.height = 24;
  hRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let prevEnd = initialCash;
  weeklyData.forEach((item, idx) => {
    const r = idx + 4;
    const formulaBeg = idx === 0 ? String(initialCash) : `=N${r - 1}`;
    const formulaIn = `=C${r}+D${r}+E${r}`;
    const formulaOut = `=G${r}+H${r}+I${r}+J${r}+K${r}`;
    const formulaNet = `=F${r}-L${r}`;
    const formulaEnd = `=B${r}+M${r}`;
    const formulaAlert = `=IF(N${r}<200000000, "⚠️ Báo Động Thâm Hụt", "✅ An Toàn")`;

    const totIn = item.in_debt + item.in_sales + item.in_other;
    const totOut =
      item.out_cogs +
      item.out_payroll +
      item.out_rent +
      item.out_bank_interest +
      item.out_tax;
    const net = totIn - totOut;
    const curEnd = prevEnd + net;
    prevEnd = curEnd;

    const row = ws.addRow([
      item.week,
      { formula: formulaBeg, result: idx === 0 ? initialCash : prevEnd - net },
      item.in_debt,
      item.in_sales,
      item.in_other,
      { formula: formulaIn, result: totIn },
      item.out_cogs,
      item.out_payroll,
      item.out_rent,
      item.out_bank_interest,
      item.out_tax,
      { formula: formulaOut, result: totOut },
      { formula: formulaNet, result: net },
      { formula: formulaEnd, result: curEnd },
      { formula: formulaAlert, result: curEnd < 200000000 ? '⚠️ Báo Động Thâm Hụt' : '✅ An Toàn' },
    ]);

    if (curEnd < 200000000) {
      row.getCell(14).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      row.getCell(15).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    }
  });

  ws.eachRow((r, rowNumber) => {
    if (rowNumber >= 4) {
      for (let c = 2; c <= 14; c++) {
        r.getCell(c).numFmt = '#,##0';
      }
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

