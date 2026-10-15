import type { EvidenceEnvelope } from '../src/schemas/evidenceSchema';
import { redactSensitiveLog } from '../src/utils/redaction';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { Document, Paragraph, Table, TableRow, TableCell, HeadingLevel, WidthType, AlignmentType, TextRun, BorderStyle, Packer } from 'docx';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { generateVietQrDataUrl } from './vietQrService';

export interface CustomerDebt {
  id: string;
  name: string;
  email: string;
  total: number;
  paid: number;
  remain: number;
  due: string;
  email_subject: string;
  email_body: string;
}

export function parseExcelOrCsv(buffer: Buffer, filename?: string): any[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

export function styleHeader(ws: ExcelJS.Worksheet, headers: string[], fillHex: string = '1F4E78') {
  const row = ws.addRow(headers);
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fillHex },
    };
    cell.font = {
      color: { argb: 'FFFFFFFF' },
      bold: true,
      size: 11,
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  row.height = 24;
}

// ==========================================
// 1. MODULE CÔNG NỢ & NHẮC NỢ
// ==========================================
export async function processDebtModule(debtBuffer: Buffer, bankBuffer?: Buffer) {
  const dfDebt = parseExcelOrCsv(debtBuffer);
  const dfBank = bankBuffer ? parseExcelOrCsv(bankBuffer) : [];

  if (!dfDebt.length) {
    throw new Error('File công nợ trống hoặc không đọc được dữ liệu.');
  }

  const sampleRow = dfDebt[0];
  const cols = Object.keys(sampleRow);
  const colId = cols[0];
  const colName = cols.length > 1 ? cols[1] : cols[0];
  const colAmount = cols.find(c => /phải thu|nợ|tiền|amount|total/i.test(c)) || (cols.length > 2 ? cols[2] : cols[cols.length - 1]);
  const colPaid = cols.find(c => /đã thu|đã trả|paid/i.test(c));
  const colEmail = cols.find(c => /mail/i.test(c));
  const colDue = cols.find(c => /hạn|due|ngày/i.test(c));

  const bankMatches: Record<string, number> = {};
  if (dfBank.length > 0) {
    const bCols = Object.keys(dfBank[0]);
    const bDesc = bCols.find(c => /nội dung|diễn giải|description|memo/i.test(c)) || bCols[0];
    const bAmt = bCols.find(c => /số tiền|ghi có|có|credit|amount/i.test(c)) || bCols[bCols.length - 1];

    const ids = [...new Set(dfDebt.map(row => String(row[colId] ?? '').trim()).filter(Boolean))];
    for (const bRow of dfBank) {
      const description = String(bRow[bDesc] || '').toLowerCase();
      const amount = Number(bRow[bAmt]);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const matches = ids.filter(id => {
        const escaped = id.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(^|[^a-z0-9])' + escaped + '($|[^a-z0-9])', 'i').test(description);
      });
      // Never allocate one transfer to several customers or match names ambiguously.
      if (matches.length === 1) bankMatches[matches[0]] = (bankMatches[matches[0]] || 0) + amount;
    }
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Doi_No_Cong_Thuc');

  const headers = ['Mã KH', 'Tên Khách Hàng', 'Email', 'Phải Thu', 'Đã Thu', 'Còn Nợ (Công thức)', 'Trạng Thái'];
  styleHeader(ws, headers, '1F4E78');

  const customers: CustomerDebt[] = [];
  const yellowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
  const redFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };

  dfDebt.forEach((row, idx) => {
    const rNum = idx + 2;
    const khId = String(row[colId] || `KH${String(idx + 1).padStart(3, '0')}`).trim();
    const khName = String(row[colName] || 'Khách hàng').trim();
    const khEmail = colEmail && row[colEmail] ? String(row[colEmail]).trim() : 'ketoan@khachhang.vn';
    const phaiThu = Number(row[colAmount]) || 0;

    let daThu = 0;
    if (bankMatches[khId] !== undefined) {
      const remainingPayment = bankMatches[khId];
      daThu = Math.min(Math.max(phaiThu, 0), remainingPayment);
      bankMatches[khId] -= daThu;
    } else if (colPaid && row[colPaid] !== undefined) {
      daThu = Number(row[colPaid]) || 0;
    }

    const conNoVal = phaiThu - daThu;
    const dueStr = colDue && row[colDue] ? String(row[colDue]) : 'Đã đến hạn thanh toán';

    const r = ws.addRow([
      khId,
      khName,
      khEmail,
      phaiThu,
      daThu,
      { formula: `D${rNum}-E${rNum}`, result: conNoVal },
      { formula: `IF(F${rNum}>0, "Quá hạn", "Hoàn thành")`, result: conNoVal > 0 ? 'Quá hạn' : 'Hoàn thành' },
    ]);

    if (daThu > 0) {
      r.getCell(5).fill = yellowFill;
    }

    if (conNoVal > 0) {
      r.eachCell((cell, colNumber) => {
        if (colNumber !== 5) {
          cell.fill = redFill;
        }
      });

      customers.push({
        id: khId,
        name: khName,
        email: khEmail,
        total: phaiThu,
        paid: daThu,
        remain: conNoVal,
        due: dueStr,
        email_subject: `[Nhắc công nợ] Đề nghị thanh toán công nợ quá hạn - ${khName} (${khId})`,
        email_body:
          `Kính gửi Quý đối tác ${khName},\n\n` +
          `Theo số liệu đối chiếu công nợ mới nhất, tổng khoản phải thu của Quý khách là ${phaiThu.toLocaleString()} VNĐ, ` +
          `đã thanh toán ${daThu.toLocaleString()} VNĐ. Hiện số dư công nợ quá hạn còn lại là ${conNoVal.toLocaleString()} VNĐ (${dueStr}).\n\n` +
          `Quý khách vui lòng kiểm tra Thông báo công nợ (file PDF đính kèm) và sắp xếp thanh toán sớm để đảm bảo tiến độ giao dịch.\n\n` +
          `Trân trọng,\nBộ phận Kế toán & Quản lý Công nợ`,
      });
    }
  });

  const lastRow = dfDebt.length + 2;
  const sumRow = ws.addRow([
    '',
    'TỔNG CỘNG',
    '',
    { formula: `SUM(D2:D${lastRow - 1})` },
    { formula: `SUM(E2:E${lastRow - 1})` },
    { formula: `SUM(F2:F${lastRow - 1})` },
    '',
  ]);
  sumRow.font = { bold: true };

  ws.columns = [
    { width: 14 },
    { width: 32 },
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
    { width: 16 },
  ];

  const excelBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    total_overdue: customers.length,
    total_remain_amount: customers.reduce((sum, c) => sum + c.remain, 0),
    customers,
    excelBuffer,
  };
}

// ==========================================
// SYSTEM UNICODE FONT LOADER (Arial / Tahoma / LiberationSans)
// ==========================================
let cachedRegularFont: string | null = null;
let cachedBoldFont: string | null = null;
let cachedItalicFont: string | null = null;

function getSystemUnicodeFonts(): { regular: string | null; bold: string | null; italic: string | null } {
  if (cachedRegularFont && cachedBoldFont && cachedItalicFont) {
    return { regular: cachedRegularFont, bold: cachedBoldFont, italic: cachedItalicFont };
  }

  const regularPaths = [
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/tahoma.ttf',
  ];

  const boldPaths = [
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/tahomabd.ttf',
  ];

  const italicPaths = [
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Italic.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf',
    '/System/Library/Fonts/Supplemental/Arial Italic.ttf',
    '/Library/Fonts/Arial Italic.ttf',
    'C:/Windows/Fonts/ariali.ttf',
    'C:/Windows/Fonts/tahomai.ttf',
  ];

  try {
    for (const p of regularPaths) {
      if (fs.existsSync(p)) {
        cachedRegularFont = fs.readFileSync(p).toString('base64');
        break;
      }
    }
  } catch (err) {
    console.error('Error reading regular unicode font:', redactSensitiveLog(err));
  }

  try {
    for (const p of boldPaths) {
      if (fs.existsSync(p)) {
        cachedBoldFont = fs.readFileSync(p).toString('base64');
        break;
      }
    }
  } catch (err) {
    console.error('Error reading bold unicode font:', redactSensitiveLog(err));
  }

  try {
    for (const p of italicPaths) {
      if (fs.existsSync(p)) {
        cachedItalicFont = fs.readFileSync(p).toString('base64');
        break;
      }
    }
  } catch (err) {
    console.error('Error reading italic unicode font:', redactSensitiveLog(err));
  }

  return { regular: cachedRegularFont, bold: cachedBoldFont, italic: cachedItalicFont };
}

export interface BankAccountDetails {
  bankName?: string;
  accountNo?: string;
  accountName?: string;
  bankBin?: string;
  companyName?: string;
  transferSyntax?: string;
}

// Generate PDF for debt notice with Unicode font & VietQR
export async function createDebtPdf(
  khId: string,
  name: string,
  total: number,
  paid: number,
  remain: number,
  bankAccount?: BankAccountDetails
): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Load and register system Unicode fonts (Arial / Tahoma / LiberationSans)
  const { regular, bold, italic } = getSystemUnicodeFonts();
  let fontName = 'helvetica';

  if (regular) {
    doc.addFileToVFS('LiberationSans-Regular.ttf', regular);
    doc.addFont('LiberationSans-Regular.ttf', 'SystemArial', 'normal');
    fontName = 'SystemArial';
  }
  if (bold) {
    doc.addFileToVFS('LiberationSans-Bold.ttf', bold);
    doc.addFont('LiberationSans-Bold.ttf', 'SystemArial', 'bold');
    fontName = 'SystemArial';
  }
  if (italic) {
    doc.addFileToVFS('LiberationSans-Italic.ttf', italic);
    doc.addFont('LiberationSans-Italic.ttf', 'SystemArial', 'italic');
  }

  if (!bankAccount?.bankBin || !bankAccount?.accountNo || !bankAccount?.accountName) throw new Error('Vui lòng cấu hình tài khoản thụ hưởng trước khi xuất PDF.');
  const bankName = bankAccount.bankName || '';
  const accountNo = bankAccount.accountNo;
  const accountName = (bankAccount?.accountName || 'CÔNG TY CP THƯƠNG MẠI & CÔNG NGHỆ ÁNH DƯƠNG').toUpperCase();
  const bankBin = bankAccount.bankBin;
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const todayStr = `${day}/${month}/${year}`;

  const rawSyntax = bankAccount?.transferSyntax || `[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY`;
  const transferSyntax = rawSyntax
    .replace(/\[MA_KH\]/g, khId)
    .replace(/DD\/MM\/YYYY/g, todayStr)
    .replace(/\[NGAY_THANG_NAM\]/g, todayStr);

  // Generate Standard Napas 24/7 VietQR Data URL (EMVCo)
  let qrDataUrl = '';
  try {
    qrDataUrl = await generateVietQrDataUrl({
      bankBin,
      accountNo,
      amount: remain,
      message: transferSyntax,
      accountName,
    });
  } catch (err) {
    throw err;
  }

  // Header Banner
  doc.setFillColor(27, 54, 93);
  doc.rect(0, 0, 595, 75, 'F');

  // Accent Line
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 75, 595, 4, 'F');

  // Document Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(fontName, 'bold');
  doc.text('THÔNG BÁO ĐỐI CHIẾU & ĐÔN ĐỐC THU HỒI CÔNG NỢ', 40, 42);

  doc.setFontSize(9);
  doc.setFont(fontName, 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('HỆ THỐNG QUẢN LÝ TÀI CHÍNH DOANH NGHIỆP · PHÒNG KẾ TOÁN TÀI CHÍNH', 40, 60);

  // Reference Info
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9.5);
  doc.setFont(fontName, 'normal');
  doc.text(`Số tham chiếu: TB-CN-${khId}`, 40, 105);
  doc.text(`Ngày phát hành: ${now.toLocaleDateString('vi-VN')}`, 430, 105, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(40, 114, 555, 114);

  // Customer Information Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(40, 126, 515, 66, 6, 6, 'FD');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Kính gửi Quý Khách hàng / Đại diện đối tác:', 55, 148);

  doc.setFont(fontName, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Mã khách hàng: `, 55, 168);
  doc.setFont(fontName, 'bold');
  doc.text(`${khId}`, 135, 168);

  doc.setFont(fontName, 'normal');
  doc.text(`Tên đơn vị: `, 240, 168);
  doc.setFont(fontName, 'bold');
  doc.text(`${name}`, 295, 168);

  // Statement preamble
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Căn cứ vào hợp đồng và hồ sơ giao nhận hàng hóa, phòng Kế toán xin trân trọng đối chiếu số dư công nợ như sau:',
    40,
    210
  );

  // Debt Breakdown Rows
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(40, 224, 515, 30, 4, 4, 'F');
  doc.setFont(fontName, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('1. Tổng công nợ phát sinh trong kỳ đối chiếu:', 55, 243);
  doc.setFont(fontName, 'bold');
  doc.text(`${total.toLocaleString('vi-VN')} đ`, 535, 243, { align: 'right' });

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(40, 258, 515, 30, 4, 4, 'F');
  doc.setFont(fontName, 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text('2. Số tiền bên mua đã thanh toán ghi nhận:', 55, 277);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(16, 149, 93);
  doc.text(`${paid.toLocaleString('vi-VN')} đ`, 535, 277, { align: 'right' });

  // Outstanding Debt Box (High visibility alert)
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(40, 294, 515, 42, 6, 6, 'FD');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(185, 28, 28);
  doc.text('3. SỐ TIỀN CÒN PHẢI THANH TOÁN (ĐÃ ĐỐI CHIẾU):', 55, 320);
  doc.setFontSize(13);
  doc.text(`${remain.toLocaleString('vi-VN')} đ`, 535, 320, { align: 'right' });

  // VietQR & Payment Account Card
  doc.setFillColor(240, 253, 250);
  doc.setDrawColor(153, 246, 228);
  doc.roundedRect(40, 350, 515, 175, 8, 8, 'FD');

  // Title in VietQR Card
  doc.setFont(fontName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 118, 110);
  doc.text('⚡ THÔNG TIN THANH TOÁN QUA VIETQR TỰ ĐỘNG (24/7)', 55, 372);

  // Draw QR Image
  if (qrDataUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(204, 251, 241);
      doc.roundedRect(55, 385, 120, 120, 6, 6, 'FD');
      doc.addImage(qrDataUrl, 'PNG', 60, 390, 110, 110);
    } catch (e) {
      console.error('Error embedding QR into PDF:', redactSensitiveLog(e));
    }
  }

  // Bank transfer info alongside QR
  const infoX = 190;
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);

  doc.text('• Ngân hàng thụ hưởng:', infoX, 400);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${bankName}`, infoX + 115, 400);

  doc.setFont(fontName, 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('• Số tài khoản (STK):', infoX, 420);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(`${accountNo}`, infoX + 115, 420);

  doc.setFontSize(9.5);
  doc.setFont(fontName, 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('• Chủ tài khoản:', infoX, 440);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${accountName}`, infoX + 115, 440);

  doc.setFont(fontName, 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('• Số tiền thanh toán:', infoX, 460);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(`${remain.toLocaleString('vi-VN')} VNĐ`, infoX + 115, 460);

  doc.setFont(fontName, 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('• Cú pháp chuyển khoản:', infoX, 480);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(2, 132, 199);
  doc.text(`${transferSyntax}`, infoX + 115, 480);

  doc.setFont(fontName, 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    '* Dùng ứng dụng bất kỳ (VCB, BIDV, Vietin, MB, Techcombank, Momo...) quét mã QR để thanh toán chính xác.',
    infoX,
    505
  );

  // Note for customer
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Kính đề nghị Quý khách hàng kiểm tra, đối chiếu. Mọi phản hồi xin liên hệ kế toán trong 03 ngày làm việc.',
    40,
    546
  );

  // Signatures
  doc.setFont(fontName, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text('ĐẠI DIỆN KHÁCH HÀNG', 80, 580);
  doc.text('KẾ TOÁN TRƯỞNG / NGƯỜI LẬP BIỂU', 350, 580);

  doc.setFont(fontName, 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('(Ký và ghi rõ họ tên)', 105, 595);
  doc.text('(Ký, đóng dấu họ tên)', 395, 595);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// ==========================================
// 2. GHÉP & ĐỐI CHIẾU 2 FILE EXCEL
// ==========================================
export function getReconcilePreview(fileABuffer: Buffer, fileBBuffer: Buffer) {
  const dfA = parseExcelOrCsv(fileABuffer);
  const dfB = parseExcelOrCsv(fileBBuffer);

  const colsA = dfA.length > 0 ? Object.keys(dfA[0]) : [];
  const colsB = dfB.length > 0 ? Object.keys(dfB[0]) : [];

  const common = colsA.filter(c => colsB.includes(c));
  const suggestedKey = common[0] || colsA[0] || '';

  const isNumeric = (val: any) => typeof val === 'number' || (!isNaN(Number(val)) && val !== '' && val !== null);
  const numColsA = colsA.filter(c => dfA.some(r => isNumeric(r[c])));
  const numColsB = colsB.filter(c => dfB.some(r => isNumeric(r[c])));

  return {
    cols_a: colsA,
    cols_b: colsB,
    suggested_key_a: suggestedKey,
    suggested_key_b: suggestedKey && colsB.includes(suggestedKey) ? suggestedKey : colsB[0] || '',
    suggested_val_a: numColsA[0] || colsA[colsA.length - 1] || '',
    suggested_val_b: numColsB[0] || colsB[colsB.length - 1] || '',
  };
}

export async function runReconcileProcess(
  fileABuffer: Buffer,
  fileBBuffer: Buffer,
  keyA: string,
  keyB: string,
  valA: string,
  valB: string
) {
  const dfA = parseExcelOrCsv(fileABuffer);
  const dfB = parseExcelOrCsv(fileBBuffer);

  const mapA = new Map<string, any>();
  dfA.forEach(row => {
    const k = String(row[keyA] || '').trim();
    if (k) mapA.set(k, row);
  });

  const mapB = new Map<string, any>();
  dfB.forEach(row => {
    const k = String(row[keyB] || '').trim();
    if (k) mapB.set(k, row);
  });

  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows: any[] = [];

  let exact = 0;
  let diff = 0;
  let onlyA = 0;
  let onlyB = 0;

  for (const k of allKeys) {
    const rA = mapA.get(k);
    const rB = mapB.get(k);

    const valNumA = rA ? Number(rA[valA]) || 0 : 0;
    const valNumB = rB ? Number(rB[valB]) || 0 : 0;
    const chenhLech = valNumA - valNumB;

    let ketQua = '';
    if (rA && !rB) {
      ketQua = 'Chỉ có ở File A';
      onlyA++;
    } else if (!rA && rB) {
      ketQua = 'Chỉ có ở File B';
      onlyB++;
    } else if (Math.abs(chenhLech) < 0.001) {
      ketQua = 'Khớp hoàn toàn';
      exact++;
    } else {
      ketQua = 'Lệch số liệu';
      diff++;
    }

    rows.push({
      _KEY_MATCH_: k,
      ...Object.fromEntries(Object.entries(rA || {}).map(([col, v]) => [`${col}_FileA`, v])),
      ...Object.fromEntries(Object.entries(rB || {}).map(([col, v]) => [`${col}_FileB`, v])),
      Số_Liệu_File_A: valNumA,
      Số_Liệu_File_B: valNumB,
      Chênh_Lệch: chenhLech,
      Kết_Quả_Đối_Chiếu: ketQua,
    });
  }

  // Create Excel with 4 sheets
  const wb = new ExcelJS.Workbook();

  const addSheetWithData = (name: string, dataRows: any[], headerColor = '1F4E78') => {
    if (dataRows.length === 0) return;
    const ws = wb.addWorksheet(name);
    const headers = Object.keys(dataRows[0]);
    styleHeader(ws, headers, headerColor);
    dataRows.forEach(r => {
      ws.addRow(headers.map(h => r[h]));
    });
    ws.columns = headers.map(() => ({ width: 20 }));
  };

  addSheetWithData('Tong_Hop_Doi_Chiếu', rows, '1F4E78');
  addSheetWithData('Lech_So_Lieu', rows.filter(r => r.Kết_Quả_Đối_Chiếu === 'Lệch số liệu'), 'C00000');
  addSheetWithData('Chi_Co_File_A', rows.filter(r => r.Kết_Quả_Đối_Chiếu === 'Chỉ có ở File A'), 'ED7D31');
  addSheetWithData('Chi_Co_File_B', rows.filter(r => r.Kết_Quả_Đối_Chiếu === 'Chỉ có ở File B'), '4472C4');

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  return {
    stats: { exact, diff, only_a: onlyA, only_b: onlyB },
    rows: rows.slice(0, 50),
    excelBuffer,
  };
}

// ==========================================
// 3. TẠO PHIẾU LƯƠNG HÀNG LOẠT (DOCX & ZIP)
// ==========================================
// ==========================================
// HÀM ĐỌC SỐ TIỀN THÀNH CHỮ TIẾNG VIỆT
// ==========================================
export function numberToVietnameseWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Không đồng chẵn';
  const absAmount = Math.round(Math.abs(amount));

  const digitWords = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

  function readGroupOfThree(num: number, isHighest: boolean): string {
    const hundreds = Math.floor(num / 100);
    const tens = Math.floor((num % 100) / 10);
    const ones = num % 10;
    let res = '';

    if (hundreds > 0 || !isHighest) {
      res += `${digitWords[hundreds]} trăm `;
    }

    if (tens > 1) {
      res += `${digitWords[tens]} mươi `;
      if (ones === 1) res += 'mốt ';
      else if (ones === 4) res += 'bốn ';
      else if (ones === 5) res += 'lăm ';
      else if (ones > 0) res += `${digitWords[ones]} `;
    } else if (tens === 1) {
      res += 'mười ';
      if (ones === 1) res += 'một ';
      else if (ones === 5) res += 'lăm ';
      else if (ones > 0) res += `${digitWords[ones]} `;
    } else if (tens === 0 && ones > 0) {
      if (hundreds > 0 || !isHighest) {
        res += 'lẻ ';
      }
      res += `${digitWords[ones]} `;
    }

    return res.trim();
  }

  let temp = absAmount;
  const groups: number[] = [];
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const isHighest = i === groups.length - 1;
      const grpStr = readGroupOfThree(grp, isHighest);
      const unit = units[i];
      result += `${grpStr} ${unit} `;
    }
  }

  result = result.trim();
  if (!result) return 'Không đồng chẵn';
  return (amount < 0 ? 'Âm ' : '') + result.charAt(0).toUpperCase() + result.slice(1) + ' đồng chẵn';
}

// ==========================================
// KIỂM TRA & BÓC TÁCH KHUÔN MẪU PHIẾU LƯƠNG
// ==========================================
export async function inspectPayslipTemplate(templateBuffer: Buffer): Promise<{
  templateName?: string;
  detectedPlaceholders: string[];
  totalPlaceholders: number;
  sampleCells: Array<{ coord: string; text: string }>;
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer as any);
  const ws = wb.worksheets[0];
  const placeholders = new Set<string>();
  const sampleCells: Array<{ coord: string; text: string }> = [];

  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      let str = '';
      if (typeof cell.value === 'string') {
        str = cell.value;
      } else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
        str = (cell.value as any).richText.map((t: any) => t.text || '').join('');
      }

      if (str) {
        const matches = str.matchAll(/\{\{\s*([^}]+)\s*\}\}/g);
        for (const m of matches) {
          placeholders.add(m[1].trim());
          if (sampleCells.length < 15) {
            sampleCells.push({ coord: cell.address, text: str });
          }
        }
      }
    });
  });

  return {
    templateName: ws.name,
    detectedPlaceholders: Array.from(placeholders),
    totalPlaceholders: placeholders.size,
    sampleCells,
  };
}

// Helper to find key in row
function findValInRow(key: string, row: any, fallbackMap?: Map<string, any>): any {
  if (row[key] !== undefined && row[key] !== null) return row[key];
  if (fallbackMap && fallbackMap.has(key)) return fallbackMap.get(key);

  const cleanKey = key.trim().toLowerCase();
  const normalizedKey = cleanKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const [k, v] of Object.entries(row)) {
    const kClean = k.trim().toLowerCase();
    const kNorm = kClean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (kClean === cleanKey || kNorm === normalizedKey) {
      return v;
    }
  }

  if (fallbackMap) {
    for (const [k, v] of fallbackMap.entries()) {
      const kClean = k.trim().toLowerCase();
      const kNorm = kClean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (kClean === cleanKey || kNorm === normalizedKey) {
        return v;
      }
    }
  }

  return undefined;
}

export interface EmployeePayslipItem {
  id: string;
  code: string;
  name: string;
  title: string;
  baseSalary: number;
  netSalary: number;
  netSalaryWords: string;
  excelBuffer?: Buffer;
  docxBuffer?: Buffer;
}

export interface GeneratePayslipResult {
  total_generated: number;
  template_applied: string;
  matched_tags: string[];
  warnings: string[];
  zipBuffer: Buffer;
  consolidatedBuffer?: Buffer;
  employees: EmployeePayslipItem[];
}

// ==========================================
// 3. TẠO PHIẾU LƯƠNG HÀNG LOẠT (EXCEL & DOCX & ZIP)
// ÁP DỤNG KHUÔN MẪU CHUẨN CỦA DOANH NGHIỆP
// ==========================================
export async function generatePayslipsZip(
  payrollBuffer: Buffer,
  companyName: string = 'CÔNG TY TNHH DOANH NGHIỆP',
  companyAddress: string = '',
  companyTax: string = '',
  templateBuffer?: Buffer,
  templateFileName?: string,
  exportFormat: 'both' | 'excel' | 'docx' = 'both'
): Promise<GeneratePayslipResult> {
  const df = parseExcelOrCsv(payrollBuffer);
  if (!df || df.length === 0) {
    throw new Error('File bảng lương trống hoặc không có dòng dữ liệu nhân viên.');
  }

  const zip = new JSZip();
  const warnings: string[] = [];

  if (!companyAddress || !companyTax) {
    warnings.push('Chưa nhập đủ Địa chỉ hoặc Mã số thuế công ty trong phần thông tin doanh nghiệp.');
  }

  // Load sample template if user did not provide one
  const { getSamplePayslipTemplateWorkbook } = await import('./sampleData');
  const effectiveTemplateBuffer = templateBuffer || (await getSamplePayslipTemplateWorkbook());
  const templateTitle = templateFileName || (templateBuffer ? 'Mẫu Doanh Nghiệp Tải Lên' : 'Mẫu Chuẩn Doanh Nghiệp (VIETFIN TECH)');

  // Inspect template placeholders
  const inspected = await inspectPayslipTemplate(effectiveTemplateBuffer);
  const matchedTags: string[] = [];

  const employees: EmployeePayslipItem[] = [];
  const masterWb = new ExcelJS.Workbook();

  for (let idx = 0; idx < df.length; idx++) {
    const row = df[idx];
    const keys = Object.keys(row);

    // Identify employee identifiers - prioritize exact name matches to prevent "Mã nhân viên" being picked as name
    const codeKey =
      keys.find(k => /^(mã\s*(số\s*)?nv|manv|mã\s*nhân\s*viên|staff\s*id|emp\s*code|employee\s*id|code)$/i.test(k.trim())) ||
      keys.find(k => /mã/i.test(k) && !/thuế|bhxh|bảo hiểm/i.test(k)) ||
      keys[0];

    const nameKey =
      keys.find(k => /họ\s*(và|&)?\s*tên/i.test(k)) ||
      keys.find(k => /(^|\s)(tên\s*nhân\s*viên|họ\s*tên|tên\s*nv|full\s*name|name)(\s|$)/i.test(k) && !/mã/i.test(k)) ||
      keys.find(k => !/mã|code|id|chức vụ|bộ phận|phòng ban/i.test(k) && /tên/i.test(k)) ||
      (keys.length > 1 ? keys[1] : keys[0]);
    const titleKey = keys.find(k => /chức vụ|vị trí|phòng ban|bộ phận|chức danh/i.test(k));
    const baseKey = keys.find(k => /lương cơ bản|lương chính|lương cb|hợp đồng/i.test(k));
    const netKey = keys.find(k => /thực lĩnh|lương thực nhận|thực nhận|net/i.test(k));

    const empCode = String(row[codeKey] || `NV${String(idx + 1).padStart(2, '0')}`).trim();
    const empName = String(row[nameKey] || `Nhan_Vien_${idx + 1}`).trim();
    const empTitle = titleKey ? String(row[titleKey] || '').trim() : '';

    const baseVal = baseKey && row[baseKey] !== null && row[baseKey] !== undefined ? Number(row[baseKey]) || 0 : 0;
    const netVal = netKey && row[netKey] !== null && row[netKey] !== undefined ? Number(row[netKey]) || 0 : 0;
    const netWords = numberToVietnameseWords(netVal);

    // Check missing values
    const nullCount = Object.values(row).filter(v => v === null || v === undefined || v === '').length;
    if (nullCount >= keys.length / 2) {
      warnings.push(`Dòng ${idx + 2} (${empCode} - ${empName}): Thiếu nhiều thông tin / các cột lương bị trống.`);
    }

    // Special metadata map
    const specialMap = new Map<string, any>();
    specialMap.set('Mã NV', empCode);
    specialMap.set('Mã nhân viên', empCode);
    specialMap.set('Họ và Tên', empName);
    specialMap.set('Họ tên', empName);
    specialMap.set('Chức vụ', empTitle);
    specialMap.set('Thực lĩnh bằng chữ', netWords);
    specialMap.set('Bằng chữ', netWords);
    specialMap.set('Tên công ty', companyName);
    specialMap.set('Địa chỉ', companyAddress);
    specialMap.set('Mã số thuế', companyTax);
    specialMap.set('MST', companyTax);

    // ==========================================
    // A. ĐIỀN DỮ LIỆU VÀO TEMPLATE EXCEL CỦA DOANH NGHIỆP
    // ==========================================
    const empWb = new ExcelJS.Workbook();
    await empWb.xlsx.load(effectiveTemplateBuffer as any);
    const empWs = empWb.worksheets[0];

    empWs.eachRow({ includeEmpty: false }, (rowObj) => {
      rowObj.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string') {
          const str = cell.value;
          // 1. Exact match {{Key}}
          const exactMatch = str.match(/^\{\{\s*([^}]+)\s*\}\}$/);
          if (exactMatch) {
            const k = exactMatch[1].trim();
            if (!matchedTags.includes(k)) matchedTags.push(k);
            const val = findValInRow(k, row, specialMap);
            if (val !== undefined && val !== null) {
              if (typeof val === 'number') {
                cell.value = val;
                if (!cell.numFmt) cell.numFmt = '#,##0';
              } else {
                cell.value = String(val);
              }
              return;
            }
          }

          // 2. Embedded {{Key}} or {Key}
          if (str.includes('{{') || str.includes('{')) {
            let replaced = str.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, k) => {
              const trimmedK = k.trim();
              if (!matchedTags.includes(trimmedK)) matchedTags.push(trimmedK);
              const val = findValInRow(trimmedK, row, specialMap);
              if (val === null || val === undefined) return '';
              if (typeof val === 'number') return val.toLocaleString('vi-VN');
              return String(val);
            });
            replaced = replaced.replace(/\{([A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF\s]+)\}/g, (_, k) => {
              const trimmedK = k.trim();
              const val = findValInRow(trimmedK, row, specialMap);
              if (val === null || val === undefined) return '';
              if (typeof val === 'number') return val.toLocaleString('vi-VN');
              return String(val);
            });
            cell.value = replaced;
          }
        } else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
          const rt = (cell.value as any).richText;
          if (Array.isArray(rt)) {
            rt.forEach(part => {
              if (part.text && (part.text.includes('{{') || part.text.includes('{'))) {
                part.text = part.text.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_: string, k: string) => {
                  const val = findValInRow(k.trim(), row, specialMap);
                  if (val === null || val === undefined) return '';
                  if (typeof val === 'number') return val.toLocaleString('vi-VN');
                  return String(val);
                });
              }
            });
          }
        }
      });
    });

    const empExcelBuf = Buffer.from(await empWb.xlsx.writeBuffer());

    // ==========================================
    // B. TẠO BẢN WORD (.DOCX) CHUẨN IN ẤN
    // ==========================================
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 55, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Khoản Mục / Chỉ Tiêu', bold: true, color: '1F4E78' })] })],
          }),
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Số Tiền (VNĐ)', bold: true, color: '1F4E78' })], alignment: AlignmentType.RIGHT })],
          }),
        ],
      }),
    ];

    for (const [k, v] of Object.entries(row)) {
      let formattedVal = '';
      if (typeof v === 'number') {
        formattedVal = v.toLocaleString('vi-VN');
      } else if (v !== null && v !== undefined) {
        formattedVal = String(v);
      }

      tableRows.push(
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: String(k) })] }),
            new TableCell({
              children: [new Paragraph({ text: formattedVal, alignment: typeof v === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT })],
            }),
          ],
        })
      );
    }

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: companyName.toUpperCase(),
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Địa chỉ: ${companyAddress || 'Đang cập nhật'} | MST: ${companyTax || 'Đang cập nhật'}`,
                  size: 18,
                  color: '666666',
                }),
              ],
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: `PHIẾU LƯƠNG NHÂN VIÊN: ${empName.toUpperCase()} (${empCode})`,
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Chức vụ: ${empTitle || 'Nhân viên'} | Bằng chữ: ${netWords}`,
                  italics: true,
                  size: 18,
                  color: '333333',
                }),
              ],
            }),
            new Paragraph({ text: '' }),
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Vui lòng kiểm tra và phản hồi với Phòng Nhân sự & Kế toán nếu có thắc mắc.',
                  italics: true,
                  size: 18,
                  color: '888888',
                }),
              ],
            }),
          ],
        },
      ],
    });

    const docxBlob = await (await import('docx')).Packer.toBuffer(doc);
    const safeName = empName.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    const safeCode = empCode.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Add to ZIP
    if (exportFormat === 'both' || exportFormat === 'excel') {
      zip.file(`Excel_Chuan_Mau/Phieu_Luong_${safeCode}_${safeName}.xlsx`, empExcelBuf);
    }
    if (exportFormat === 'both' || exportFormat === 'docx') {
      zip.file(`Word_In_An/Phieu_Luong_${safeCode}_${safeName}.docx`, docxBlob);
    }

    // Add to master consolidated workbook (One sheet per employee)
    const sheetTitle = `${safeCode}_${safeName}`.slice(0, 30);
    try {
      const sheet = masterWb.addWorksheet(sheetTitle);
      sheet.columns = empWs.columns?.map(c => ({ width: c.width || 20 })) || [];
      empWs.eachRow({ includeEmpty: true }, (r, rNum) => {
        const nr = sheet.getRow(rNum);
        nr.height = r.height;
        r.eachCell({ includeEmpty: true }, (c, cNum) => {
          const nc = nr.getCell(cNum);
          nc.value = c.value;
          if (c.font) nc.font = { ...c.font };
          if (c.fill) nc.fill = { ...c.fill };
          if (c.border) nc.border = { ...c.border };
          if (c.alignment) nc.alignment = { ...c.alignment };
          nc.numFmt = c.numFmt;
        });
      });
      // Copy merges
      if ((empWs as any).model && (empWs as any).model.merges) {
        for (const merge of (empWs as any).model.merges) {
          try {
            sheet.mergeCells(merge);
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Failed to clone sheet for master workbook:', redactSensitiveLog(e));
    }

    employees.push({
      id: `${empCode}_${idx}`,
      code: empCode,
      name: empName,
      title: empTitle,
      baseSalary: baseVal,
      netSalary: netVal,
      netSalaryWords: netWords,
      excelBuffer: empExcelBuf,
      docxBuffer: docxBlob,
    });
  }

  // Also put master consolidated workbook into ZIP root
  const consolidatedBuffer = Buffer.from(await masterWb.xlsx.writeBuffer());
  zip.file(`Bang_Tong_Hop_Phieu_Luong_Tat_Ca_NV.xlsx`, consolidatedBuffer);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  return {
    total_generated: df.length,
    template_applied: templateTitle,
    matched_tags: matchedTags.length > 0 ? matchedTags : inspected.detectedPlaceholders,
    warnings,
    zipBuffer,
    consolidatedBuffer,
    employees,
  };
}


// ==========================================
// 6. THẨM ĐỊNH SAO KÊ & RED FLAGS (NGÂN HÀNG)
// ==========================================
export async function analyzeBankStatementLogic(statementBuffer: Buffer, proposedPayment: number = 15000000) {
  const df = parseExcelOrCsv(statementBuffer);
  if (!df.length) {
    throw new Error('File sao kê trống hoặc không đọc được định dạng.');
  }

  const cols = Object.keys(df[0]);
  const colDate = cols.find(c => /(^|\s|_)(ngày|date|ngay_gd|thời gian|time)($|\s|_)/i.test(c)) || cols[0];
  const colDesc = cols.find(c => /(^|\s|_)(nội dung|diễn giải|mô tả|desc|memo|remark)($|\s|_)/i.test(c)) || (cols.length > 1 ? cols[1] : cols[0]);
  const colCredit = cols.find(c => /(^|\s|_)(ghi có|tiền vào|thu|credit|deposit|phát sinh có)($|\s|_)/i.test(c)) ||
                    cols.find(c => /(^|\s|_)(có|in)($|\s|_)/i.test(c) && !/không|chi|nhánh/i.test(c)) ||
                    (cols.length > 2 ? cols[2] : cols[cols.length - 1]);
  const colDebit = cols.find(c => /(^|\s|_)(ghi nợ|tiền ra|chi|debit|withdraw|phát sinh nợ)($|\s|_)/i.test(c) && !/nhánh/i.test(c)) ||
                   cols.find(c => /(^|\s|_)(nợ|out)($|\s|_)/i.test(c) && !/nhóm|phân/i.test(c)) ||
                   (cols.length > 3 ? cols[3] : cols[cols.length - 1]);

  const redFlagKeywords = ['cầm đồ', 'cam do', 'vay nóng', 'vay nong', 'họ góp', 'ho gop', 'tín dụng đen', 'tin dung den', 'binance', 'remitano', 'p2p', 'crypto', 'usdt', 'cược', 'cuoc', 'bet', 'casino', 'đáo hạn', 'dao han', 'rút mặt', 'rut mat'];
  const internalKeywords = ['chuyển tiền nội bộ', 'chuyen tien noi bo', 'cùng chủ tài khoản', 'cung chu tai khoan', 'tất toán tiết kiệm', 'tat toan tiet kiem', 'gửi tiết kiệm', 'gui tiet kiem', 'nộp tiền mặt', 'nop tien mat'];
  const debtPayKeywords = ['trả nợ', 'tra no', 'thu nợ', 'thu no', 'thanh toán khoản vay', 'thanh toan khoan vay', 'lãi vay', 'lai vay', 'gốc vay', 'goc vay', 'fe credit', 'home credit', 'hd saison', 'thẻ tín dụng', 'the tin dung', 'shinhan', 'vpbank'];

  const classifiedRows: any[] = [];
  const redFlags: any[] = [];

  let bizInflow = 0;
  let internalInflow = 0;
  let bizOutflow = 0;
  let existingDebtOutflow = 0;

  // Track distinct statement months for accurate DSCR
  const distinctMonths = new Set<string>();

  for (const r of df) {
    const rawDate = String(r[colDate] || '');
    const desc = String(r[colDesc] || '');
    const lowerDesc = desc.toLowerCase();
    const credit = Number(r[colCredit]) || 0;
    const debit = Number(r[colDebit]) || 0;

    // Detect year-month from date string
    const dMatch = rawDate.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/) || rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (dMatch) {
      let y = 0, m = 0;
      if (dMatch[0].includes('-') && dMatch[1].length === 4) {
        y = parseInt(dMatch[1], 10);
        m = parseInt(dMatch[2], 10);
      } else {
        m = parseInt(dMatch[2], 10);
        y = parseInt(dMatch[3].length === 2 ? '20' + dMatch[3] : dMatch[3], 10);
      }
      if (m >= 1 && m <= 12) {
        distinctMonths.add(`${y}-${m}`);
      }
    }

    let category = '';
    let riskNote = '';

    // Check red flags
    const matchedRed = redFlagKeywords.find(kw => lowerDesc.includes(kw));
    if (matchedRed) {
      category = '⚠️ Giao dịch nhạy cảm / Rủi ro';
      riskNote = `Chứa từ khóa nhạy cảm: '${matchedRed}'`;
    } else if (credit > 0 && credit % 10000000 === 0 && credit >= 100000000 && (lowerDesc.includes('chuyển tiền') || desc.trim().length < 15)) {
      category = '⚠️ Nghi vấn làm đẹp sao kê';
      riskNote = 'Giao dịch tròn số lớn, nội dung sơ sài';
    } else if (internalKeywords.some(kw => lowerDesc.includes(kw))) {
      category = 'Chuyển khoản nội bộ / Vốn tự có';
      riskNote = 'Loại trừ khi tính doanh thu thuần';
      internalInflow += credit;
    } else if (debit > 0 && debtPayKeywords.some(kw => lowerDesc.includes(kw))) {
      category = 'Trả nợ gốc/lãi TCTD khác';
      riskNote = 'Nghĩa vụ trả nợ hiện hữu';
      existingDebtOutflow += debit;
    } else if (credit > 0) {
      if (/lương|salary|payroll/i.test(lowerDesc)) {
        category = 'Thu nhập Lương / Cố định';
        riskNote = 'Nguồn thu ổn định';
      } else {
        category = 'Doanh thu Kinh doanh / Bán hàng';
        riskNote = 'Dòng tiền thu từ HĐKD';
      }
      bizInflow += credit;
    } else {
      category = 'Chi phí Kinh doanh / Sinh hoạt';
      riskNote = 'Dòng tiền chi hoạt động';
      bizOutflow += debit;
    }

    const rowObj = {
      Ngày_GD: rawDate,
      Nội_Dung: desc,
      Ghi_Có: credit,
      Ghi_Nợ: debit,
      Phân_Loại_Thẩm_Định: category,
      Ghi_Chú_Rủi_Ro: riskNote,
    };

    classifiedRows.push(rowObj);
    if (category.startsWith('⚠️')) {
      redFlags.push(rowObj);
    }
  }

  const statementMonths = Math.max(1, distinctMonths.size || 1);
  const netCf = bizInflow - bizOutflow - existingDebtOutflow;
  const avgMonthlyNetCf = Math.round(netCf / statementMonths);
  const dscr = proposedPayment > 0 ? Number((avgMonthlyNetCf / proposedPayment).toFixed(2)) : 0;

  // Build Excel with 3 sheets and live formulas
  const wb = new ExcelJS.Workbook();

  // Sheet 1: Tổng hợp thẩm định dòng tiền
  const wsSum = wb.addWorksheet('1_Tham_Dinh_Dong_Tien');
  styleHeader(wsSum, ['Chỉ Tiêu Thẩm Định Sao Kê', 'Giá Trị / Công Thức (VNĐ)', 'Ghi Chú Chuyên Viên Tín Dụng'], '1F4E78');

  wsSum.addRow(['1. Tổng dòng tiền Ghi Có (Tổng thu trên sao kê)', { formula: `SUM('3_Chi_Tiet_Sao_Ke'!C2:C${classifiedRows.length + 1})` }, 'Bao gồm cả chuyển khoản nội bộ']);
  wsSum.addRow(['2. Dòng tiền Thu nhập thực tế (Doanh thu KD + Lương)', bizInflow, 'Đã loại trừ giao dịch nội bộ & làm đẹp sao kê']);
  wsSum.addRow(['3. Dòng tiền Nội bộ / Vốn tự có (Loại trừ)', internalInflow, 'Không tính vào thu nhập trả nợ']);
  wsSum.addRow(['4. Chi phí Kinh doanh & Sinh hoạt', bizOutflow, 'Chi phí vận hành']);
  wsSum.addRow(['5. Chi trả nợ gốc/lãi tại TCTD khác trên sao kê', existingDebtOutflow, 'Nghĩa vụ nợ hiện hữu phát hiện qua sao kê']);
  wsSum.addRow(['6. Dòng tiền ròng tích lũy (Cả kỳ sao kê)', { formula: 'B3-B5-B6', result: netCf }, 'Thu nhập thực tế - Chi phí - Trả nợ khác']);
  wsSum.addRow(['7. Thời gian sao kê thẩm định', `${statementMonths} tháng`, 'Số tháng dữ liệu sao kê đối soát']);
  wsSum.addRow(['8. Dòng tiền ròng bình quân / tháng (Ước tính)', { formula: `ROUND(B7/${statementMonths}, 0)`, result: avgMonthlyNetCf }, 'Khả năng sinh tiền ròng hàng tháng']);
  wsSum.addRow(['9. Nghĩa vụ trả nợ khoản vay đề xuất (Dự kiến/tháng)', proposedPayment, 'Có thể thay đổi trực tiếp trên ô này']);
  wsSum.addRow(['10. Hệ số đảm bảo trả nợ (DSCR chuẩn tháng)', { formula: 'IF(B10>0, ROUND(B9/B10, 2), 0)', result: dscr }, 'DSCR >= 1.2x là Đạt chuẩn ngân hàng']);
  wsSum.addRow(['11. Kết luận thẩm định dòng tiền tự động', { formula: 'IF(B11>=1.2, "ĐẠT - Dòng tiền đủ trả nợ", "CẢNH BÁO - Dòng tiền mỏng/Rủi ro")', result: dscr >= 1.2 ? 'ĐẠT - Dòng tiền đủ trả nợ' : 'CẢNH BÁO - Dòng tiền mỏng/Rủi ro' }, 'Tự động nhảy theo ô DSCR']);

  wsSum.columns = [{ width: 45 }, { width: 30 }, { width: 45 }];

  // Sheet 2: Giao dịch Red Flags
  const wsFlag = wb.addWorksheet('2_Canh_Bao_Red_Flags');
  styleHeader(wsFlag, ['Ngày GD', 'Nội dung diễn giải', 'Ghi Có', 'Ghi Nợ', 'Loại Cảnh Báo', 'Chi Tiết Rủi Ro'], '9C0006');
  redFlags.forEach(rf => {
    wsFlag.addRow([rf.Ngày_GD, rf.Nội_Dung, rf.Ghi_Có, rf.Ghi_Nợ, rf.Phân_Loại_Thẩm_Định, rf.Ghi_Chú_Rủi_Ro]);
  });
  wsFlag.columns = [{ width: 14 }, { width: 40 }, { width: 18 }, { width: 18 }, { width: 30 }, { width: 35 }];

  // Sheet 3: Chi tiết sao kê đã phân loại
  const wsDet = wb.addWorksheet('3_Chi_Tiet_Sao_Ke');
  styleHeader(wsDet, ['Ngày GD', 'Diễn Giải', 'Ghi Có', 'Ghi Nợ', 'Phân Loại Thẩm Định', 'Ghi Chú'], '2F5597');
  classifiedRows.forEach(r => {
    wsDet.addRow([r.Ngày_GD, r.Nội_Dung, r.Ghi_Có, r.Ghi_Nợ, r.Phân_Loại_Thẩm_Định, r.Ghi_Chú_Rủi_Ro]);
  });
  wsDet.columns = [{ width: 14 }, { width: 42 }, { width: 18 }, { width: 18 }, { width: 28 }, { width: 30 }];

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  return {
    biz_inflow: bizInflow,
    internal_inflow: internalInflow,
    biz_outflow: bizOutflow,
    existing_debt_outflow: existingDebtOutflow,
    net_cashflow: netCf,
    dscr,
    red_flag_count: redFlags.length,
    red_flags: redFlags.slice(0, 30),
    excelBuffer,
  };
}

// ==========================================
// 8. CHĂM SÓC DANH MỤC VAY & TIẾT KIỆM (NGÂN HÀNG)
// ==========================================
export async function portfolioCareLogic(portfolioBuffer: Buffer) {
  const df = parseExcelOrCsv(portfolioBuffer);
  if (!df.length) {
    throw new Error('File danh mục khách hàng trống.');
  }

  const cols = Object.keys(df[0]);
  const colName = cols.find(c => /tên|khách|name/i.test(c)) || cols[0];
  const colPhone = cols.find(c => /sđt|điện thoại|phone|tel/i.test(c)) || (cols.length > 1 ? cols[1] : cols[0]);
  const colType = cols.find(c => /loại|sản phẩm|product|type/i.test(c));
  const colAmt = cols.find(c => /số tiền|dư nợ|tiền gửi|amount/i.test(c)) || (cols.length > 2 ? cols[2] : cols[cols.length - 1]);
  const colDue = cols.find(c => /đáo hạn|đến hạn|ngày|due|maturity/i.test(c)) || cols[cols.length - 1];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lich_Dao_Han_Thu_No');
  styleHeader(ws, ['Tên Khách Hàng', 'Số Điện Thoại', 'Loại Sản Phẩm', 'Số Tiền / Dư Nợ', 'Ngày Đến Hạn', 'Số Ngày Còn Lại (Công thức)', 'Mức Độ Ưu Tiên', 'Kịch Bản Tin Nhắn Zalo Tư Vấn'], 'D56B00');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const careList: any[] = [];

  df.forEach((row, idx) => {
    const rNum = idx + 2;
    const khName = String(row[colName] || 'Anh/Chị').trim();
    const phone = String(row[colPhone] || '').trim();
    const prodType = colType && row[colType] ? String(row[colType]).trim() : 'Khoản Vay';
    const amt = Number(row[colAmt]) || 0;

    const rawDue = row[colDue];
    let dueDateStr = '';
    let daysLeft = 0;

    if (rawDue) {
      const parsedDate = new Date(rawDue);
      if (!isNaN(parsedDate.getTime())) {
        parsedDate.setHours(0, 0, 0, 0);
        dueDateStr = parsedDate.toISOString().split('T')[0];
        daysLeft = Math.round((parsedDate.getTime() - today.getTime()) / 86400000);
      } else {
        dueDateStr = String(rawDue);
      }
    } else {
      dueDateStr = today.toISOString().split('T')[0];
      daysLeft = 0;
    }

    const isSaving = /tiết kiệm|tiền gửi|saving|deposit|stk/i.test(prodType);
    let zaloMsg = '';

    if (isSaving) {
      zaloMsg = `Dạ em chào Anh/Chị ${khName}, em xin phép thông báo Sổ tiết kiệm ${amt.toLocaleString()} VNĐ của mình sẽ đáo hạn vào ngày ${dueDateStr}. Hiện ngân hàng đang có chương trình cộng thêm ưu đãi lãi suất cho khách hàng tái tục kỳ hạn mới, em hỗ trợ Anh/Chị cập nhật mức lãi suất tốt nhất nhé ạ!`;
    } else {
      zaloMsg = `Dạ em chào Anh/Chị ${khName}, em xin phép nhắc lịch thanh toán kỳ gốc/lãi khoản vay (${amt.toLocaleString()} VNĐ) đến hạn vào ngày ${dueDateStr}. Anh/Chị vui lòng nạp sẵn số dư vào tài khoản thanh toán trước 16h00 để hệ thống tự động thu đúng hạn, tránh phát sinh phí phạt quá hạn và ảnh hưởng lịch sử CIC nhé ạ!`;
    }

    let priority = '⏳ Sắp tới';
    if (daysLeft < 0) priority = '🔥 Quá hạn';
    else if (daysLeft <= 7) priority = '⚠️ Khẩn cấp (<=7 ngày)';

    ws.addRow([
      khName,
      phone,
      prodType,
      amt,
      dueDateStr,
      { formula: `DATEVALUE(E${rNum})-TODAY()`, result: daysLeft },
      { formula: `IF(F${rNum}<0, "🔥 Quá hạn", IF(F${rNum}<=7, "⚠️ Khẩn cấp (<=7 ngày)", "⏳ Sắp tới"))`, result: priority },
      zaloMsg,
    ]);

    careList.push({
      name: khName,
      phone,
      product: prodType,
      amount: amt,
      due_date: dueDateStr,
      days_left: daysLeft,
      priority,
      zalo_msg: zaloMsg,
    });
  });

  ws.columns = [
    { width: 25 },
    { width: 16 },
    { width: 24 },
    { width: 18 },
    { width: 15 },
    { width: 22 },
    { width: 22 },
    { width: 55 },
  ];

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    items: careList,
    excelBuffer,
  };
}

// ==========================================
// 9. BÓC TÁCH SỔ ĐỎ & ĐỊNH GIÁ TSBĐ (LTV)
// ==========================================
export interface CollateralAsset {
  Chu_So_Huu: string;
  Thua_To_Dia_Chi: string;
  Loai_Dat: string;
  Dien_Tich_m2: number;
  Don_Gia_Dinh_Gia_VND: number;
  Ty_Le_LTV: number;
  Thoi_Han_Su_Dung: string;
  Canh_Bao_Phap_Ly: string;
  Gia_Tri_Dinh_Gia?: number;
  Han_Muc_Cho_Vay?: number;
}

export async function collateralLtvLogic(assets: CollateralAsset[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dinh_Gia_TSBD_LTV');
  const headers = [
    'STT',
    'Chủ Sở Hữu',
    'Thửa Đất / Địa Chỉ Tài Sản',
    'Loại Đất',
    'Diện Tích (m2)',
    'Đơn Giá Định Giá (VNĐ/m2)',
    'Giá Trị Định Giá (Công thức)',
    'Tỷ Lệ LTV Tối Đa',
    'Hạn Mức Cấp Tín Dụng (Công thức)',
    'Thời Hạn SD',
    'Cảnh Báo Pháp Lý',
  ];
  styleHeader(ws, headers, '1F4E78');

  let totalValuation = 0;
  let totalMaxLoan = 0;
  const enriched: CollateralAsset[] = [];

  assets.forEach((a, idx) => {
    const r = idx + 2;
    const area = Number(a.Dien_Tich_m2) || 0;
    const unitPrice = Number(a.Don_Gia_Dinh_Gia_VND) || 0;
    const ltv = Number(a.Ty_Le_LTV) || 0.7;
    const valCalc = area * unitPrice;
    const loanCalc = Math.round(valCalc * ltv);
    totalValuation += valCalc;
    totalMaxLoan += loanCalc;

    ws.addRow([
      idx + 1,
      a.Chu_So_Huu || '',
      a.Thua_To_Dia_Chi || '',
      a.Loai_Dat || '',
      area,
      unitPrice,
      { formula: `ROUND(E${r}*F${r}, 0)`, result: valCalc },
      ltv,
      { formula: `ROUND(G${r}*H${r}, 0)`, result: loanCalc },
      a.Thoi_Han_Su_Dung || '',
      a.Canh_Bao_Phap_Ly || '',
    ]);

    enriched.push({
      ...a,
      Gia_Tri_Dinh_Gia: valCalc,
      Han_Muc_Cho_Vay: loanCalc,
    });
  });

  const lastR = assets.length + 2;
  const sumRow = ws.addRow([
    '',
    'TỔNG CỘNG TÀI SẢN BẢO ĐẢM',
    '',
    '',
    { formula: `SUM(E2:E${lastR - 1})`, result: assets.reduce((s, a) => s + (Number(a.Dien_Tich_m2) || 0), 0) },
    '',
    { formula: `SUM(G2:G${lastR - 1})`, result: totalValuation },
    '',
    { formula: `SUM(I2:I${lastR - 1})`, result: totalMaxLoan },
    '',
    '',
  ]);
  sumRow.font = { bold: true };

  ws.columns = [
    { width: 6 },
    { width: 30 },
    { width: 45 },
    { width: 22 },
    { width: 16 },
    { width: 24 },
    { width: 26 },
    { width: 16 },
    { width: 26 },
    { width: 18 },
    { width: 45 },
  ];

  ws.eachRow((row, rNum) => {
    if (rNum > 1) {
      row.getCell(5).numFmt = '#,##0.0';
      row.getCell(6).numFmt = '#,##0';
      row.getCell(7).numFmt = '#,##0';
      row.getCell(8).numFmt = '0.0%';
      row.getCell(9).numFmt = '#,##0';
    }
  });

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    total_valuation: totalValuation,
    total_max_loan: totalMaxLoan,
    assets: enriched,
    excelBuffer,
  };
}

// ==========================================
// BỘ XỬ LÝ TEMPLATE WORD (.DOCX) DÙNG JSZip
// ==========================================
export async function renderDocxWithTemplate(
  templateBuffer: Buffer,
  lookupData: Record<string, any>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const lookup: Record<string, string> = {};

  for (const [k, v] of Object.entries(lookupData)) {
    const formatted = typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v ?? '');
    lookup[k] = formatted;
    lookup[k.toLowerCase()] = formatted;
    const norm = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
    lookup[norm] = formatted;
  }

  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith('word/') && filename.endsWith('.xml')) {
      let content = await zip.files[filename].async('string');
      content = content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawKey) => {
        const key = rawKey.trim();
        const normKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
        if (lookup[key] !== undefined) return lookup[key];
        if (lookup[key.toLowerCase()] !== undefined) return lookup[key.toLowerCase()];
        if (lookup[normKey] !== undefined) return lookup[normKey];
        return match;
      });
      zip.file(filename, content);
    }
  }

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// ==========================================
// TẠO FILE WORD MẪU TỜ TRÌNH TÍN DỤNG CHUẨN
// ==========================================
export async function getSampleProposalTemplateDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN - CHI NHÁNH ĐỊA PHƯƠNG',
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: 'TỜ TRÌNH THẨM ĐỊNH & ĐỀ XUẤT CẤP TÍN DỤNG (MẪU CHUẨN)',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: 'Ngày lập tờ trình: {{Ngay_Lap}}',
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'I. THÔNG TIN KHÁCH HÀNG & KHOẢN VAY ĐỀ XUẤT',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: '• Tên khách hàng / Doanh nghiệp: {{Ten_Khach_Hang}}' }),
          new Paragraph({ text: '• Mục đích cấp tín dụng: {{Muc_Dich_Vay}}' }),
          new Paragraph({ text: '• Số tiền đề xuất vay: {{So_Tien_Vay}} VNĐ' }),
          new Paragraph({ text: '• Thời hạn vay: {{Thoi_Han_Vay}} tháng | Lãi suất ưu đãi: {{Lai_Suat_Moi}}%/năm' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'II. KẾT QUẢ THẨM ĐỊNH DÒNG TIỀN, TSBĐ & HIỆU QUẢ REFINANCE',
            heading: HeadingLevel.HEADING_2,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Chỉ tiêu thẩm định', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Số liệu tính toán', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Đánh giá chuẩn Ngân hàng', bold: true })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'Thu nhập ròng hàng tháng' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{Thu_Nhap_Rong}} VNĐ' })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Nguồn trả nợ chính' })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'Nghĩa vụ trả nợ tháng đầu (Gốc + Lãi)' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{Tong_Tra_Thang_Dau}} VNĐ' })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Gốc {{Goc_Thang_Dau}} + Lãi {{Lai_Thang_Dau}}' })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'Hệ số đảm bảo trả nợ (DSCR)' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{DSCR}} lần' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{Danh_Gia_DSCR}}' })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'Tổng giá trị Tài sản bảo đảm' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{Gia_Tri_TSBD}} VNĐ' })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Tỷ lệ LTV: {{LTV}}% ({{Danh_Gia_LTV}})' })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'So sánh Lãi suất cũ vs Lãi suất mới' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{Lai_Suat_Cu}}%/năm -> {{Lai_Suat_Moi}}%/năm' })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Phí phạt trả trước: {{Tien_Phat_Tra_Truoc}} VNĐ' })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'Tiết kiệm ròng khi mua lại khoản vay' })] }),
                  new TableCell({ children: [new Paragraph({ text: '{{Tiet_Kiem_Rong_Refinance}} VNĐ' })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Lợi ích tài chính ròng cho KH' })] }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'III. KIẾN NGHỊ PHÊ DUYỆT CỦA CHUYÊN VIÊN TÍN DỤNG',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: 'Căn cứ các chỉ số thẩm định, Chuyên viên kính trình: {{Ket_Luan_De_Xuat}}.' }),
          new Paragraph({ text: 'Kính trình Ban Giám Đốc xem xét phê duyệt hạn mức cấp tín dụng cho khách hàng.' }),
        ],
      },
    ],
  });

  const { Packer } = await import('docx');
  return Packer.toBuffer(doc);
}

// ==========================================
// 10. LẬP TỜ TRÌNH TÍN DỤNG (.DOCX) & REFINANCE (.XLSX)
// ==========================================
export async function creditProposalLogic(params: {
  customerName: string;
  loanPurpose: string;
  loanAmount: number;
  tenureMonths: number;
  newRateYear: number;
  oldRateYear: number;
  prepayPenaltyPct: number;
  monthlyNetIncome: number;
  collateralValue: number;
  evidence?: EvidenceEnvelope;
  templateBuffer?: Buffer;
  templateName?: string;
}) {
  const {
    customerName,
    loanPurpose,
    loanAmount,
    tenureMonths,
    newRateYear,
    oldRateYear,
    prepayPenaltyPct,
    monthlyNetIncome,
    collateralValue,
    templateBuffer,
    templateName,
  } = params;

  const tenure = Math.max(Number(tenureMonths) || 12, 1);
  const monthlyPrincipal = loanAmount / tenure;
  const firstMonthInterest = (loanAmount * (newRateYear / 100)) / 12;
  const firstMonthPayment = monthlyPrincipal + firstMonthInterest;

  const dscr = params.evidence?.derivations.dscr?.value ?? (firstMonthPayment > 0 ? Number((monthlyNetIncome / firstMonthPayment).toFixed(2)) : 0);
  const ltv = params.evidence?.derivations.ltvPercent?.value ?? (collateralValue > 0 ? Number(((loanAmount / collateralValue) * 100).toFixed(1)) : 0);

  let totalInterestNew = 0;
  let totalInterestOld = 0;
  for (let m = 0; m < tenure; m++) {
    const rem = loanAmount - m * monthlyPrincipal;
    totalInterestNew += (rem * (newRateYear / 100)) / 12;
    totalInterestOld += (rem * (oldRateYear / 100)) / 12;
  }
  const penaltyFee = loanAmount * (prepayPenaltyPct / 100);
  const netRefinanceSaving = totalInterestOld - totalInterestNew - penaltyFee;

  const dscrEval = dscr >= 1.25 ? 'ĐẠT CHUẨN (>= 1.25x)' : 'CẢNH BÁO DÒNG TIỀN (< 1.25x)';
  const ltvEval = ltv <= 75 ? 'AN TOÀN (<= 75%)' : 'VƯỢT NGƯỠNG LTV CHUẨN (> 75%)';
  const conclusion = params.evidence?.unknowns.some(issue => issue.severity === 'BLOCKER')
    ? 'BẢN NHÁP CÓ NGOẠI LỆ ĐÃ ĐƯỢC CHUYÊN VIÊN GHI CHÚ - CHỜ PHÊ DUYỆT'
    : dscr >= 1.25 && ltv <= 75
      ? 'ĐẠT NGƯỠNG TÍNH TOÁN DSCR/LTV - BẢN NHÁP CHỜ PHÊ DUYỆT'
      : 'CẦN BỔ SUNG TÀI SẢN BẢO ĐẢM HOẶC GIẢM SỐ TIỀN VAY';

  const todayStr = new Date().toLocaleDateString('vi-VN');

  // 1. Tạo File Excel Kế Hoạch Trả Nợ & Refinance (2 Sheets)
  const wb = new ExcelJS.Workbook();
  const wsSum = wb.addWorksheet('1_Tham_Dinh_Va_Refinance');
  styleHeader(wsSum, ['Hạng Mục Thẩm Định & So Sánh', 'Giá Trị / Công Thức Excel', 'Đánh Giá / Ghi Chú'], '1F4E78');

  const summaryRows = [
    ['Khách hàng thẩm định', customerName, ''],
    ['Mục đích cấp tín dụng', loanPurpose, ''],
    ['Số tiền đề xuất vay (VNĐ)', loanAmount, 'Ô B4'],
    ['Thời hạn vay (Tháng)', tenure, 'Ô B5'],
    ['Lãi suất ưu đãi đề xuất (%/năm)', newRateYear, 'Ô B6'],
    ['Lãi suất tại Ngân hàng cũ (%/năm)', oldRateYear, 'Ô B7'],
    ['Phí phạt tất toán trước hạn NH cũ (%)', prepayPenaltyPct, 'Ô B8'],
    ['Thu nhập ròng hàng tháng của KH (VNĐ)', monthlyNetIncome, 'Ô B9'],
    ['Tổng giá trị định giá Tài sản bảo đảm (VNĐ)', collateralValue, 'Ô B10'],
    ['👉 Nghĩa vụ trả nợ cao nhất tháng đầu (Gốc + Lãi)', { formula: 'B4/B5 + B4*(B6/100)/12', result: firstMonthPayment }, 'Tự động tính'],
    ['👉 Hệ số đảm bảo trả nợ (DSCR)', { formula: 'IF(B11+B18>0, ROUND(B9/(B11+B18), 6), 0)', result: dscr }, dscrEval],
    ['👉 Tỷ lệ cấp tín dụng trên TSBĐ (LTV %)', { formula: 'IF(B10>0, ROUND(B4/B10*100, 6), 0)', result: ltv }, ltvEval],
    ['💰 Tổng tiền lãi nếu giữ ở Ngân hàng cũ', Math.round(totalInterestOld), 'Theo dư nợ giảm dần'],
    ['💰 Tổng tiền lãi khi chuyển sang Ngân hàng mới', { formula: `SUM('2_Lich_Tra_No_Chi_Tiet'!D2:D${tenure + 1})`, result: Math.round(totalInterestNew) }, 'Liên kết từ Sheet 2'],
    ['💰 Phí phạt trả nợ trước hạn tại NH cũ', { formula: 'ROUND(B4*B8/100, 0)', result: Math.round(penaltyFee) }, 'Chi phí chuyển đổi'],
    ['🔥 SỐ TIỀN KHÁCH HÀNG TIẾT KIỆM RÒNG KHI CHUYỂN VAY', { formula: 'B14-B15-B16', result: Math.round(netRefinanceSaving) }, netRefinanceSaving > 0 ? '✅ NÊN CHUYỂN NGAY - LỜI RÒNG' : 'Cân nhắc thêm'],
  ];

  summaryRows.push(['Nghĩa vụ trả nợ hiện hữu bình quân tháng', params.evidence?.derivations.monthlyObservedDebtServiceVND?.value ?? 0, 'Evidence v2']);
  summaryRows.forEach(r => wsSum.addRow(r));
  if (params.evidence) {
    const audit = wb.addWorksheet('3_Evidence_Review');
    audit.addRow(['Mã vấn đề', 'Mức độ', 'Nội dung', 'Đã xác nhận', 'Ghi chú người kiểm tra']);
    for (const issue of params.evidence.unknowns) audit.addRow([issue.code,issue.severity,issue.message,issue.resolvedByHuman,issue.humanNote || '']);
    audit.columns = [{width:30},{width:15},{width:75},{width:15},{width:75}];
  }
  wsSum.columns = [{ width: 45 }, { width: 30 }, { width: 40 }];

  wsSum.eachRow((row, rNum) => {
    if ([4, 9, 10, 11, 14, 15, 16, 17].includes(rNum)) {
      row.getCell(2).numFmt = '#,##0';
    } else if ([6, 7, 8, 13].includes(rNum)) {
      row.getCell(2).numFmt = '0.0';
    } else if (rNum === 12) {
      row.getCell(2).numFmt = '0.00';
    }
  });

  const wsSched = wb.addWorksheet('2_Lich_Tra_No_Chi_Tiet');
  styleHeader(wsSched, ['Kỳ Trả Nợ (Tháng)', 'Dư Nợ Đầu Kỳ', 'Gốc Trả Hàng Tháng', 'Lãi Trả Hàng Tháng', 'Tổng Gốc + Lãi Phải Trả', 'Dư Nợ Cuối Kỳ'], '002060');

  for (let m = 1; m <= tenure; m++) {
    const r = m + 1;
    const duDauFormula = m === 1 ? "='1_Tham_Dinh_Va_Refinance'!B4" : `=F${r - 1}`;
    const gocThangFormula = "='1_Tham_Dinh_Va_Refinance'!$B$4/'1_Tham_Dinh_Va_Refinance'!$B$5";
    const laiThangFormula = `=ROUND(B${r}*('1_Tham_Dinh_Va_Refinance'!$B$6/100)/12, 0)`;
    const tongTraFormula = `=C${r}+D${r}`;
    const duCuoiFormula = `=MAX(B${r}-C${r}, 0)`;

    const remBeg = loanAmount - (m - 1) * monthlyPrincipal;
    const remEnd = Math.max(loanAmount - m * monthlyPrincipal, 0);
    const intM = (remBeg * (newRateYear / 100)) / 12;

    wsSched.addRow([
      `Tháng ${m}`,
      { formula: duDauFormula, result: Math.round(remBeg) },
      { formula: gocThangFormula, result: Math.round(monthlyPrincipal) },
      { formula: laiThangFormula, result: Math.round(intM) },
      { formula: tongTraFormula, result: Math.round(monthlyPrincipal + intM) },
      { formula: duCuoiFormula, result: Math.round(remEnd) },
    ]);
  }

  const lastSr = tenure + 2;
  const sumSchedRow = wsSched.addRow([
    'TỔNG CỘNG',
    '',
    { formula: `SUM(C2:C${lastSr - 1})`, result: loanAmount },
    { formula: `SUM(D2:D${lastSr - 1})`, result: Math.round(totalInterestNew) },
    { formula: `SUM(E2:E${lastSr - 1})`, result: Math.round(loanAmount + totalInterestNew) },
    '',
  ]);
  sumSchedRow.font = { bold: true };

  wsSched.columns = [{ width: 16 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 24 }, { width: 22 }];
  wsSched.eachRow((row, rNum) => {
    if (rNum > 1) {
      for (let c = 2; c <= 6; c++) row.getCell(c).numFmt = '#,##0';
    }
  });

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  // 2. Tạo File Word Tờ Trình Thẩm Định
  let docxBuffer: Buffer;
  const proposalData: Record<string, any> = {
    Ngay_Lap: todayStr,
    Ten_Khach_Hang: customerName,
    Khach_Hang: customerName,
    Muc_Dich_Vay: loanPurpose,
    So_Tien_Vay: Math.round(loanAmount),
    Thoi_Han_Vay: tenure,
    Lai_Suat_Moi: newRateYear,
    Lai_Suat_Cu: oldRateYear,
    Phi_Phat_Tra_Truoc: prepayPenaltyPct,
    Thu_Nhap_Rong: Math.round(monthlyNetIncome),
    Gia_Tri_TSBD: Math.round(collateralValue),
    Goc_Thang_Dau: Math.round(monthlyPrincipal),
    Lai_Thang_Dau: Math.round(firstMonthInterest),
    Tong_Tra_Thang_Dau: Math.round(firstMonthPayment),
    DSCR: dscr,
    Danh_Gia_DSCR: dscrEval,
    LTV: ltv,
    Danh_Gia_LTV: ltvEval,
    Tong_Lai_NH_Cu: Math.round(totalInterestOld),
    Tong_Lai_NH_Moi: Math.round(totalInterestNew),
    Tien_Phat_Tra_Truoc: Math.round(penaltyFee),
    Tiet_Kiem_Rong_Refinance: Math.round(netRefinanceSaving),
    Ket_Luan_De_Xuat: conclusion,
  };

  if (templateBuffer && templateBuffer.length > 0) {
    try {
      docxBuffer = await renderDocxWithTemplate(templateBuffer, proposalData);
    } catch (e) {
      console.warn('Custom docx template render error, falling back to standard docx:', redactSensitiveLog(e));
      docxBuffer = await getSampleProposalTemplateDocx();
      docxBuffer = await renderDocxWithTemplate(docxBuffer, proposalData);
    }
  } else {
    const rawTemplate = await getSampleProposalTemplateDocx();
    docxBuffer = await renderDocxWithTemplate(rawTemplate, proposalData);
  }

  return {
    first_month_payment: Math.round(firstMonthPayment),
    dscr,
    ltv,
    net_refinance_saving: Math.round(netRefinanceSaving),
    penalty_fee: Math.round(penaltyFee),
    used_custom_template: Boolean(templateBuffer && templateBuffer.length > 0),
    template_name: templateName || 'Mẫu Tờ Trình Mặc Định Chuẩn Ngân Hàng',
    excelBuffer,
    docxBuffer,
  };
}

// ==========================================
// BIÊN BẢN ĐỐI CHIẾU & XÁC NHẬN CÔNG NỢ WORD (.DOCX)
// ==========================================
export async function generateDebtConfirmationDocx(
  customer: CustomerDebt,
  companyName: string = 'CÔNG TY CỔ PHẦN CÔNG NGHỆ VẬN HÀNH & TÀI CHÍNH VIỆT NAM'
): Promise<Buffer> {
  const today = new Date();
  const dateStr = `ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 22 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Độc lập - Tự do - Hạnh phúc', bold: true, size: 20 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '-----------------------', size: 18 }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'BIÊN BẢN ĐỐI CHIẾU VÀ XÁC NHẬN CÔNG NỢ',
                bold: true,
                size: 28,
                color: '1F4E78',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `(Số: BB-CN/${customer.id}/${today.getFullYear()})`,
                italics: true,
                size: 20,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: '- Căn cứ vào Hợp đồng kinh tế và các Đơn đặt hàng giữa hai bên;' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `- Căn cứ vào sổ theo dõi công nợ và chứng từ sao kê tài khoản ngân hàng tính đến ${dateStr};`,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Hôm nay, ${dateStr}, tại văn phòng công ty, chúng tôi gồm có:` }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'BÊN A (BÊN BÁN / CHỦ NỢ): ', bold: true }),
              new TextRun({ text: companyName, bold: true }),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Địa chỉ: Tòa nhà Landmark, Ba Đình, Hà Nội' })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Đại diện: Bà Nguyễn Thùy Linh - Chức vụ: Kế toán trưởng & QL Vận hành',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'BÊN B (BÊN MUA / KHÁCH HÀNG): ', bold: true }),
              new TextRun({ text: customer.name, bold: true }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: `Mã khách hàng: ${customer.id}` })] }),
          new Paragraph({
            children: [new TextRun({ text: `Email liên hệ: ${customer.email}` })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Hai bên cùng nhau tiến hành đối chiếu tình hình công nợ với các nội dung chi tiết sau:',
                italics: true,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: 'STT', alignment: AlignmentType.CENTER })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: 'Nội Dung Đối Chiếu',
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: 'Số Tiền (VNĐ)',
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: 'Ghi Chú', alignment: AlignmentType.CENTER }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: '1', alignment: AlignmentType.CENTER })],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: 'Tổng số tiền phải thu phát sinh trong kỳ' })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${customer.total.toLocaleString('vi-VN')} VNĐ`,
                        alignment: AlignmentType.RIGHT,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: 'Theo hóa đơn & phiếu xuất bán hàng' })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: '2', alignment: AlignmentType.CENTER })],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: 'Tổng số tiền Bên B đã thanh toán' })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${customer.paid.toLocaleString('vi-VN')} VNĐ`,
                        alignment: AlignmentType.RIGHT,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: 'Theo sao kê ngân hàng & phiếu thu' })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: '3', alignment: AlignmentType.CENTER })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: 'SỐ DƯ CÔNG NỢ BÊN B CÒN PHẢI THANH TOÁN',
                        children: [
                          new TextRun({
                            text: 'SỐ DƯ CÔNG NỢ BÊN B CÒN PHẢI THANH TOÁN',
                            bold: true,
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${customer.remain.toLocaleString('vi-VN')} VNĐ`,
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({
                            text: `${customer.remain.toLocaleString('vi-VN')} VNĐ`,
                            bold: true,
                            color: 'C00000',
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: customer.due,
                        children: [new TextRun({ text: customer.due, bold: true })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'KẾT LUẬN & CAM KẾT THANH TOÁN:', bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `- Tính đến thời điểm đối chiếu, Bên B xác nhận còn nợ Bên A số tiền là: `,
              }),
              new TextRun({
                text: `${customer.remain.toLocaleString('vi-VN')} VNĐ.`,
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `- Bên B cam kết sẽ thanh toán dứt điểm toàn bộ số tiền nợ trên trước thời hạn: `,
              }),
              new TextRun({ text: `${customer.due}.`, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `- Biên bản này được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản làm căn cứ thanh toán.`,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: 'ĐẠI DIỆN BÊN A',
                        children: [new TextRun({ text: 'ĐẠI DIỆN BÊN A', bold: true })],
                        alignment: AlignmentType.CENTER,
                      }),
                      new Paragraph({
                        text: '(Ký, ghi rõ họ tên và đóng dấu)',
                        children: [
                          new TextRun({ text: '(Ký, ghi rõ họ tên và đóng dấu)', italics: true }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: 'ĐẠI DIỆN BÊN B',
                        children: [new TextRun({ text: 'ĐẠI DIỆN BÊN B', bold: true })],
                        alignment: AlignmentType.CENTER,
                      }),
                      new Paragraph({
                        text: '(Ký, ghi rõ họ tên và đóng dấu)',
                        children: [
                          new TextRun({ text: '(Ký, ghi rõ họ tên và đóng dấu)', italics: true }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ==========================================
// 11. MODULE THẨM ĐỊNH NGUỒN THU & NDI (NGÂN HÀNG)
// ==========================================
export interface IncomeSourceItem {
  sourceName: string;
  incomeType: string;
  declaredAmount: number;
  haircutPct: number;
  proofDocument: string;
}

export interface IncomeAssessmentParams {
  customerName: string;
  borrowerAge: number;
  coBorrowerAge?: number;
  dependentsCount: number;
  livingCostBorrower: number;
  livingCostCoBorrower: number;
  livingCostPerDependent: number;
  existingMonthlyDebt: number;
  newLoanTenureMonths?: number;
  newLoanInterestYear?: number;
  incomes: IncomeSourceItem[];
}

export async function incomeAssessmentLogic(params: IncomeAssessmentParams) {
  const {
    customerName,
    borrowerAge,
    coBorrowerAge,
    dependentsCount,
    livingCostBorrower,
    livingCostCoBorrower,
    livingCostPerDependent,
    existingMonthlyDebt,
    newLoanTenureMonths = 60,
    newLoanInterestYear = 8.5,
    incomes,
  } = params;

  if (!Array.isArray(incomes) || !incomes.length) throw new Error('Vui lòng nhập danh sách thu nhập.');
  let totalDeclared = 0;
  let totalRecognized = 0;

  const analyzedIncomes = incomes.map(item => {
    const declared = Number(item.declaredAmount) || 0;
    const haircut = item.haircutPct == null ? 100 : Number(item.haircutPct);
    if (!Number.isFinite(haircut) || haircut < 0 || haircut > 100 || !Number.isFinite(declared) || declared < 0) throw new Error('Thu nhập hoặc tỷ lệ ghi nhận không hợp lệ.');
    const recognized = Math.round(declared * (haircut / 100));
    totalDeclared += declared;
    totalRecognized += recognized;

    let typeLabel = 'Khác';
    if (item.incomeType === 'salary_transfer') typeLabel = 'Lương chuyển khoản (Sao kê)';
    else if (item.incomeType === 'salary_cash') typeLabel = 'Lương tiền mặt (Bảng lương)';
    else if (item.incomeType === 'rental') typeLabel = 'Thu nhập cho thuê (BĐS / Xe)';
    else if (item.incomeType === 'business') typeLabel = 'Lợi nhuận Hộ KD / Doanh nghiệp';

    return {
      ...item,
      typeLabel,
      declaredAmount: declared,
      recognizedAmount: recognized,
    };
  });

  const totalLivingCost =
    livingCostBorrower + (livingCostCoBorrower || 0) + dependentsCount * livingCostPerDependent;

  const totalOutflows = totalLivingCost + existingMonthlyDebt;
  const ndi = Math.round(totalRecognized - totalOutflows);

  // DTI hiện tại (%)
  const currentDti = totalRecognized > 0 ? Number(((existingMonthlyDebt / totalRecognized) * 100).toFixed(1)) : 0;

  // Hạn mức trả góp tối đa hàng tháng (80% NDI để bảo đảm an toàn thanh khoản)
  const maxAllowablePayment = Math.max(Math.round(ndi * 0.8), 0);

  // Tính Room vay tối đa theo công thức khấu hao gốc đều + lãi dư nợ tháng đầu
  // firstMonthPayment = P/N + P*r/12 => P = Payment / (1/N + r/12)
  const rMonthly = (newLoanInterestYear / 100) / 12;
  const tenure = Math.max(newLoanTenureMonths, 1);
  const factor = 1 / tenure + rMonthly;
  const maxLoanCapacity = factor > 0 ? Math.round(maxAllowablePayment / factor) : 0;

  // Tính cho các mốc thời gian phổ biến: 3 năm (36t), 5 năm (60t), 10 năm (120t), 20 năm (240t)
  const capacity3y = Math.round(maxAllowablePayment / (1 / 36 + rMonthly));
  const capacity5y = Math.round(maxAllowablePayment / (1 / 60 + rMonthly));
  const capacity10y = Math.round(maxAllowablePayment / (1 / 120 + rMonthly));
  const capacity20y = Math.round(maxAllowablePayment / (1 / 240 + rMonthly));

  // Build Excel
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('1_Tong_Hop_Nguon_Thu');

  ws.columns = [
    { width: 6 },
    { width: 44 },
    { width: 28 },
    { width: 26 },
    { width: 20 },
    { width: 26 },
    { width: 44 },
  ];

  // Header Banner
  ws.mergeCells('A1:G1');
  const a1 = ws.getCell('A1');
  a1.value = 'BẢNG THẨM ĐỊNH NGUỒN THU NHẬP & NĂNG LỰC TRẢ NỢ THỰC TẾ (BANK PRO)';
  a1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  a1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
  a1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.getCell('A3').value = 'Khách hàng thẩm định:';
  ws.getCell('B3').value = customerName;
  ws.getCell('B3').font = { bold: true, color: { argb: 'FF002060' } };

  ws.getCell('D3').value = 'Độ tuổi người vay:';
  ws.getCell('E3').value = `${borrowerAge} tuổi ${coBorrowerAge ? `(Vợ/Chồng: ${coBorrowerAge} tuổi)` : ''}`;

  ws.getCell('A4').value = 'Số người phụ thuộc:';
  ws.getCell('B4').value = dependentsCount;

  ws.getCell('D4').value = 'Nghĩa vụ trả nợ CIC hiện tại:';
  ws.getCell('E4').value = existingMonthlyDebt;
  ws.getCell('E4').numFmt = '#,##0 "VNĐ"';
  ws.getCell('E4').font = { bold: true, color: { argb: 'FFC00000' } };

  const hRow = ws.getRow(6);
  hRow.values = [
    'STT',
    'Tên Nguồn Thu Nhập',
    'Phân Loại Nguồn Thu',
    'Thu Nhập Khai Báo (VNĐ)',
    'Tỷ Lệ Haircut (%)',
    'Thu Nhập Ghi Nhận (VNĐ)',
    'Hồ Sơ Chứng Minh Đính Kèm',
  ];
  hRow.height = 24;
  hRow.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  analyzedIncomes.forEach((inc, idx) => {
    const rNum = idx + 7;
    ws.addRow([
      idx + 1,
      inc.sourceName,
      inc.typeLabel,
      inc.declaredAmount,
      inc.haircutPct / 100,
      { formula: `D${rNum}*E${rNum}`, result: inc.recognizedAmount },
      inc.proofDocument,
    ]);
  });

  const lastR = analyzedIncomes.length + 7;
  const sumRow = ws.addRow([
    '',
    'TỔNG THU NHẬP HÀNG THÁNG',
    '',
    { formula: `SUM(D7:D${lastR - 1})`, result: totalDeclared },
    '',
    { formula: `SUM(F7:F${lastR - 1})`, result: totalRecognized },
    '',
  ]);
  sumRow.font = { bold: true };
  sumRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  ws.addRow([]);
  const rLiv = ws.addRow([
    '',
    'TỔNG CHI PHÍ SINH HOẠT GIA ĐÌNH ĐỊNH MỨC',
    '',
    '',
    '',
    totalLivingCost,
    `Người vay: ${livingCostBorrower.toLocaleString()} đ | Vợ: ${(coBorrowerAge ? livingCostCoBorrower : 0).toLocaleString()} đ | ${dependentsCount} con: ${(dependentsCount * livingCostPerDependent).toLocaleString()} đ`,
  ]);
  rLiv.font = { bold: true };

  const rCic = ws.addRow([
    '',
    'NGHĨA VỤ TRẢ NỢ CÁC TCTD HIỆN HỮU (CIC)',
    '',
    '',
    '',
    { formula: '=E4', result: existingMonthlyDebt },
    'Theo báo cáo CIC mới nhất',
  ]);
  rCic.font = { bold: true };

  const rNdi = ws.addRow([
    '',
    '👉 THU NHẬP RÒNG DÙNG TRẢ NỢ MỚI (NDI)',
    '',
    '',
    '',
    { formula: `F${lastR}-F${lastR + 2}-F${lastR + 3}`, result: ndi },
    ndi > 0 ? '✅ Nguồn thu dương - Đủ khả năng trả nợ' : '❌ Nguồn thu âm - Không khả thi',
  ]);
  rNdi.font = { bold: true, size: 12 };
  rNdi.getCell(6).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: ndi > 0 ? 'FFC6EFCE' : 'FFFFC7CE' },
  };

  const rMaxPay = ws.addRow([
    '',
    'HẠN MỨC TRẢ NỢ TỐI ĐA THÁNG ĐẦU (80% NDI)',
    '',
    '',
    '',
    { formula: `ROUND(F${lastR + 4}*0.8, 0)`, result: maxAllowablePayment },
    'Dự phòng rủi ro 20% thanh khoản gia đình',
  ]);
  rMaxPay.font = { bold: true };

  // Sheet 2: Kế hoạch trả nợ và hạn mức vay
  const wsCap = wb.addWorksheet('2_Han_Muc_Vay_Va_NDI');
  wsCap.columns = [{ width: 28 }, { width: 30 }, { width: 45 }];
  styleHeader(wsCap, ['Thời Hạn Vay Đề Xuất', 'Hạn Mức Vay Tối Đa Ước Tính (VNĐ)', 'Ghi Chú Đánh Giá'], '1F4E78');

  wsCap.addRow(['Vay 3 năm (36 tháng)', capacity3y, 'Phù hợp vay mua xe, tiêu dùng']);
  wsCap.addRow(['Vay 5 năm (60 tháng)', capacity5y, 'Phù hợp vay sản xuất kinh doanh trung hạn']);
  wsCap.addRow(['Vay 10 năm (120 tháng)', capacity10y, 'Phù hợp vay mua nhà, đất nền']);
  wsCap.addRow(['Vay 20 năm (240 tháng)', capacity20y, 'Phù hợp vay mua căn hộ, xây sửa nhà']);

  ws.eachRow((r, rNum) => {
    if (rNum >= 7) {
      r.getCell(4).numFmt = '#,##0';
      r.getCell(5).numFmt = '0%';
      r.getCell(6).numFmt = '#,##0';
    }
  });

  wsCap.eachRow((r, rNum) => {
    if (rNum > 1) {
      r.getCell(2).numFmt = '#,##0';
    }
  });

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  return {
    customer_name: customerName,
    total_declared: totalDeclared,
    total_recognized: totalRecognized,
    total_living_cost: totalLivingCost,
    existing_debt: existingMonthlyDebt,
    ndi,
    current_dti: currentDti,
    max_monthly_payment: maxAllowablePayment,
    max_loan_capacity: maxLoanCapacity,
    capacities: {
      year3: capacity3y,
      year5: capacity5y,
      year10: capacity10y,
      year20: capacity20y,
    },
    incomes: analyzedIncomes,
    excelBuffer,
  };
}

// ==========================================
// 12. MODULE DỰ BÁO DÒNG TIỀN 12 TUẦN (VĂN PHÒNG)
// ==========================================
export interface WeeklyCashFlowItem {
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

export interface CashFlowForecastParams {
  initialCash: number;
  safetyThreshold?: number;
  weeklyData: WeeklyCashFlowItem[];
}

export async function cashFlowForecastLogic(params: CashFlowForecastParams) {
  const { initialCash, safetyThreshold = 200000000, weeklyData } = params;

  if (!Array.isArray(weeklyData) || !weeklyData.length) throw new Error('Vui lòng nhập dữ liệu tuần.');
  if (!Number.isFinite(initialCash) || !Number.isFinite(safetyThreshold)) throw new Error('Số dư hoặc ngưỡng an toàn không hợp lệ.');
  let totalInflowSum = 0;
  let totalOutflowSum = 0;
  let minCash = initialCash;
  let minWeek = 'Hiện tại';
  let warningCount = 0;

  let runningBalance = initialCash;
  const processedWeeks = weeklyData.map((item, idx) => {
    const totIn = Number(item.in_debt || 0) + Number(item.in_sales || 0) + Number(item.in_other || 0);
    const totOut =
      Number(item.out_cogs || 0) +
      Number(item.out_payroll || 0) +
      Number(item.out_rent || 0) +
      Number(item.out_bank_interest || 0) +
      Number(item.out_tax || 0);
    const net = totIn - totOut;
    const beg = runningBalance;
    const end = beg + net;
    runningBalance = end;

    totalInflowSum += totIn;
    totalOutflowSum += totOut;

    if (end < minCash) {
      minCash = end;
      minWeek = item.week;
    }

    const isDeficit = end < safetyThreshold;
    if (isDeficit) warningCount++;

    return {
      ...item,
      beginningCash: beg,
      totalInflow: totIn,
      totalOutflow: totOut,
      netCashFlow: net,
      endingCash: end,
      isDeficit,
      status: isDeficit ? '⚠️ Cảnh báo thâm hụt' : '✅ An toàn',
    };
  });

  const avgWeeklyBurn = totalOutflowSum / (weeklyData.length || 1);
  const runwayWeeks = avgWeeklyBurn > 0 ? Number((initialCash / avgWeeklyBurn).toFixed(1)) : 99;

  // Build Excel
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Du_Bao_Dong_Tien_12_Tuan');

  ws.columns = [
    { width: 14 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
    { width: 22 },
  ];

  ws.mergeCells('A1:O1');
  const t = ws.getCell('A1');
  t.value = 'KẾ HOẠCH DỰ BÁO DÒNG TIỀN 12 TUẦN & QUẢN TRỊ THANH KHOẢN (OFFICE PRO)';
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

  let pEnd = initialCash;
  weeklyData.forEach((item, idx) => {
    const r = idx + 4;
    const fBeg = idx === 0 ? String(initialCash) : `=N${r - 1}`;
    const fIn = `=C${r}+D${r}+E${r}`;
    const fOut = `=G${r}+H${r}+I${r}+J${r}+K${r}`;
    const fNet = `=F${r}-L${r}`;
    const fEnd = `=B${r}+M${r}`;
    const fAlert = `=IF(N${r}<${safetyThreshold}, "⚠️ Báo Động Thâm Hụt", "✅ An Toàn")`;

    const totIn = Number(item.in_debt || 0) + Number(item.in_sales || 0) + Number(item.in_other || 0);
    const totOut =
      Number(item.out_cogs || 0) +
      Number(item.out_payroll || 0) +
      Number(item.out_rent || 0) +
      Number(item.out_bank_interest || 0) +
      Number(item.out_tax || 0);
    const net = totIn - totOut;
    const cEnd = pEnd + net;
    pEnd = cEnd;

    const row = ws.addRow([
      item.week,
      { formula: fBeg, result: idx === 0 ? initialCash : pEnd - net },
      item.in_debt,
      item.in_sales,
      item.in_other,
      { formula: fIn, result: totIn },
      item.out_cogs,
      item.out_payroll,
      item.out_rent,
      item.out_bank_interest,
      item.out_tax,
      { formula: fOut, result: totOut },
      { formula: fNet, result: net },
      { formula: fEnd, result: cEnd },
      { formula: fAlert, result: cEnd < safetyThreshold ? '⚠️ Báo Động Thâm Hụt' : '✅ An Toàn' },
    ]);

    if (cEnd < safetyThreshold) {
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

  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  return {
    initial_cash: initialCash,
    safety_threshold: safetyThreshold,
    total_inflows: totalInflowSum,
    total_outflows: totalOutflowSum,
    net_change: totalInflowSum - totalOutflowSum,
    ending_cash: runningBalance,
    min_cash: minCash,
    min_week: minWeek,
    warning_weeks_count: warningCount,
    runway_weeks: runwayWeeks,
    weeks: processedWeeks,
    excelBuffer,
  };
}

