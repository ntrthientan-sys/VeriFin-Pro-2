import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  processDebtModule,
  createDebtPdf,
  generateDebtConfirmationDocx,
  getReconcilePreview,
  runReconcileProcess,
  generatePayslipsZip,
  inspectPayslipTemplate,
  analyzeBankStatementLogic,
  portfolioCareLogic,
  collateralLtvLogic,
  creditProposalLogic,
  getSampleProposalTemplateDocx,
  incomeAssessmentLogic,
  cashFlowForecastLogic,
  CustomerDebt,
} from './server/excelService';
import { extractBatchAI, extractCicOrBctcAI, extractCollateralAI, chatMultiTurnAI } from './server/geminiService';
import {
  getSampleDebtWorkbook,
  getSampleBankWorkbook,
  getSampleReconcileA,
  getSampleReconcileB,
  getSamplePayroll,
  getSamplePortfolio,
  getSamplePayslipTemplateWorkbook,
  getSampleIncomeAssessmentData,
  getSampleIncomeWorkbook,
  getSampleCashFlowData,
  getSampleCashFlowWorkbook,
} from './server/sampleData';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseNumeric(val: any, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer storage in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

// Cache for generated download files
const downloadCache = new Map<string, { buffer: Buffer; filename: string; contentType: string; createdAt: number }>();

function storeDownload(
  buffer: Buffer,
  filename: string,
  contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
): string {
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  downloadCache.set(id, { buffer, filename, contentType, createdAt: Date.now() });
  // Evict older files if cache grows too large (> 1000 items)
  if (downloadCache.size > 1000) {
    const oldestKey = downloadCache.keys().next().value;
    if (oldestKey) downloadCache.delete(oldestKey);
  }
  return id;
}

// Temporary store for 2-step Reconcile files
const reconcileUploads = new Map<string, { fileA: Buffer; fileB: Buffer; nameA: string; nameB: string }>();

// ==========================================
// SAMPLE DATASETS
// ==========================================
app.get('/api/samples/:name', async (req, res) => {
  const name = req.params.name;
  let buffer: Buffer | null = null;
  let filename = '';

  switch (name) {
    case 'so-cong-no':
      buffer = getSampleDebtWorkbook();
      filename = '1_So_Cong_No_Test.xlsx';
      break;
    case 'sao-ke-bank':
      buffer = getSampleBankWorkbook();
      filename = '2_Sao_Ke_Ngan_Hang_Test.xlsx';
      break;
    case 'file-ban-hang-a':
      buffer = getSampleReconcileA();
      filename = '3A_File_Ban_Hang.xlsx';
      break;
    case 'file-ke-toan-b':
      buffer = getSampleReconcileB();
      filename = '3B_File_Ke_Toan.xlsx';
      break;
    case 'bang-luong':
      buffer = getSamplePayroll();
      filename = '4_Bang_Luong_Test.xlsx';
      break;
    case 'mau-phieu-luong':
      buffer = await getSamplePayslipTemplateWorkbook();
      filename = 'Mau_Phieu_Luong_Doanh_Nghiep.xlsx';
      break;
    case 'danh-muc-tin-dung':
      buffer = getSamplePortfolio();
      filename = '5_Danh_Muc_Vay_STK_Test.xlsx';
      break;
    case 'tham-dinh-thu-nhap':
      buffer = await getSampleIncomeWorkbook();
      filename = 'Mau_Tham_Dinh_Nguon_Thu_Nhap.xlsx';
      break;
    case 'du-bao-dong-tien':
      buffer = await getSampleCashFlowWorkbook();
      filename = 'Mau_Du_Bao_Dong_Tien_12_Tuan.xlsx';
      break;
    default:
      return res.status(404).json({ error: 'Mẫu dữ liệu không tồn tại' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

// ==========================================
// DOWNLOAD ENDPOINT
// ==========================================
app.get('/api/download/:fileId', (req, res) => {
  const file = downloadCache.get(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File tải về không tồn tại hoặc đã hết hạn.' });
  }
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
  return res.send(file.buffer);
});

// ==========================================
// 1. MODULE CÔNG NỢ & NHẮC NỢ
// ==========================================
app.post(
  '/api/debt/process',
  upload.fields([
    { name: 'debt_file', maxCount: 1 },
    { name: 'bank_file', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let debtBuffer: Buffer | null = null;
      let bankBuffer: Buffer | undefined = undefined;

      if (files?.['debt_file']?.[0]) {
        debtBuffer = files['debt_file'][0].buffer;
      } else if (req.body.use_sample === 'true') {
        debtBuffer = getSampleDebtWorkbook();
      }

      if (files?.['bank_file']?.[0]) {
        bankBuffer = files['bank_file'][0].buffer;
      } else if (req.body.use_sample_bank === 'true') {
        bankBuffer = getSampleBankWorkbook();
      }

      if (!debtBuffer) {
        return res.status(400).json({ error: 'Vui lòng tải lên File Sổ Công Nợ hoặc bấm Dùng Dữ Liệu Mẫu.' });
      }

      const result = await processDebtModule(debtBuffer, bankBuffer);
      const fileId = storeDownload(result.excelBuffer, 'Bao_Cao_Tuoi_No_AI.xlsx');

      return res.json({
        total_overdue: result.total_overdue,
        total_remain_amount: result.total_remain_amount,
        customers: result.customers,
        download_url: `/api/download/${fileId}`,
      });
    } catch (err: any) {
      console.error('Error in /api/debt/process:', err);
      return res.status(500).json({ error: err.message || 'Lỗi khi xử lý công nợ.' });
    }
  }
);

// CẤU HÌNH TÀI KHOẢN THANH TOÁN & VIETQR
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

let activeBankAccount: BankAccountConfig = {
  companyName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ VÀ THƯƠNG MẠI ÁNH DƯƠNG',
  bankName: 'VietinBank (Ngân hàng TMCP Công Thương Việt Nam)',
  bankBin: '970415',
  accountNo: '102868889999',
  accountName: 'CONG TY CP CONG NGHE & THUONG MAI ANH DUONG',
  transferSyntax: '[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY',
  hotline: '1900 6868 - 0988 123 456',
  updatedAt: new Date().toISOString(),
};

// Session store: token -> { userId, expiresAt }
const activeSessions = new Map<string, { userId: string; expiresAt: number }>();

// Seed default initial session for author
const creatorToken = 'jwt_auth_creator_' + Date.now().toString(36);
activeSessions.set(creatorToken, {
  userId: 'usr_creator',
  expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
});

function getAuthenticatedUser(req: express.Request): UserAccountRecord | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !activeSessions.has(token)) return null;
  const session = activeSessions.get(token)!;
  if (session.expiresAt < Date.now()) {
    activeSessions.delete(token);
    return null;
  }
  return registeredUsers.find((u) => u.id === session.userId) || null;
}

// API Lấy thông tin tài khoản thụ hưởng để trích xuất khi tạo QR
app.get('/api/settings/bank-account', (_req, res) => {
  return res.json(activeBankAccount);
});

// API Cập nhật tài khoản thụ hưởng (bảo mật: yêu cầu phiên đăng nhập)
app.post('/api/settings/bank-account', (req, res) => {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Vui lòng đăng nhập với tài khoản Quản trị / Kế toán để có quyền cập nhật tài khoản thụ hưởng doanh nghiệp.',
      });
    }

    const body = req.body || {};
    activeBankAccount = {
      ...activeBankAccount,
      companyName: body.companyName || activeBankAccount.companyName,
      bankName: body.bankName || activeBankAccount.bankName,
      bankBin: body.bankBin || activeBankAccount.bankBin,
      accountNo: (body.accountNo || activeBankAccount.accountNo).trim(),
      accountName: (body.accountName || activeBankAccount.accountName).trim().toUpperCase(),
      transferSyntax: body.transferSyntax || activeBankAccount.transferSyntax,
      hotline: body.hotline || activeBankAccount.hotline,
      updatedAt: new Date().toISOString(),
    };
    return res.json({ success: true, message: 'Đã lưu cấu hình tài khoản VietQR', account: activeBankAccount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi khi cập nhật cấu hình tài khoản' });
  }
});

// ==========================================
// HỆ THỐNG XÁC THỰC & ĐĂNG KÝ / ĐĂNG NHẬP NGƯỜI DÙNG
// ==========================================
export interface UserAccountRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  branch: 'office' | 'banking' | 'all';
  roleTitle: string;
  createdAt: string;
}

// In-memory store for registered users
const registeredUsers: UserAccountRecord[] = [
  {
    id: 'usr_creator',
    name: 'Nguyễn Trường Thiên Tân',
    email: 'ntrthientan@gmail.com',
    phone: '0817221722',
    password: 'password123',
    branch: 'all',
    roleTitle: 'Tác Giả & Quản Trị Hệ Thống',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_thuy_linh',
    name: 'Nguyễn Thùy Linh',
    email: 'thuy.linh@vietfintech.vn',
    phone: '0988111222',
    password: 'password123',
    branch: 'office',
    roleTitle: 'Kế toán trưởng & QL Vận hành',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr_minh_duc',
    name: 'Trần Minh Đức',
    email: 'duc.tran@vietcombank.com.vn',
    phone: '0977222333',
    password: 'password123',
    branch: 'banking',
    roleTitle: 'Chuyên viên Tín dụng & QLRR',
    createdAt: new Date().toISOString(),
  },
];

// 1. API Đăng Ký Tài Khoản Mới
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, phone, password, branch, roleTitle } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập họ và tên của bạn.' });
    }
    if (!email || !email.trim() || !email.includes('@')) {
      return res.status(400).json({ error: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có tối thiểu 6 ký tự để đảm bảo bảo mật.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : '';

    // Check existing
    const existing = registeredUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail || (cleanPhone && u.phone === cleanPhone)
    );
    if (existing) {
      return res.status(400).json({
        error: 'Email hoặc số điện thoại này đã được đăng ký tài khoản. Vui lòng chuyển sang tab Đăng Nhập.',
      });
    }

    const newUser: UserAccountRecord = {
      id: 'usr_' + Date.now().toString(36),
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: String(password),
      branch: branch === 'banking' ? 'banking' : branch === 'office' ? 'office' : 'all',
      roleTitle: (roleTitle && roleTitle.trim()) || (branch === 'banking' ? 'Chuyên viên Ngân Hàng' : branch === 'office' ? 'Kế toán & Hành chính' : 'Quản Lý Điều Hành'),
      createdAt: new Date().toISOString(),
    };

    registeredUsers.push(newUser);

    const token = 'jwt_auth_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
    activeSessions.set(token, {
      userId: newUser.id,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    });

    const sessionUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      branch: newUser.branch,
      roleTitle: newUser.roleTitle,
      token,
      loginAt: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công! Đã tự động đăng nhập.',
      user: sessionUser,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi trong quá trình đăng ký tài khoản' });
  }
});

// 2. API Đăng Nhập Tài Khoản
app.post('/api/auth/login', (req, res) => {
  try {
    const { emailOrPhone, email, phone, password } = req.body || {};
    const inputIdentifier = (emailOrPhone || email || phone || '').trim().toLowerCase();
    const inputPass = String(password || '');

    if (!inputIdentifier) {
      return res.status(400).json({ error: 'Vui lòng nhập Email hoặc Số điện thoại.' });
    }
    if (!inputPass) {
      return res.status(400).json({ error: 'Vui lòng nhập Mật khẩu / Mã PIN bảo mật.' });
    }

    // Find in registered users
    const matched = registeredUsers.find(
      (u) =>
        u.email.toLowerCase() === inputIdentifier ||
        (u.phone && u.phone === inputIdentifier)
    );

    if (matched) {
      if (matched.password !== inputPass) {
        return res.status(401).json({
          error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại.',
        });
      }

      const token = 'jwt_auth_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      activeSessions.set(token, {
        userId: matched.id,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
      });

      const sessionUser = {
        id: matched.id,
        name: matched.name,
        email: matched.email,
        phone: matched.phone,
        branch: matched.branch,
        roleTitle: matched.roleTitle,
        token,
        loginAt: new Date().toISOString(),
      };
      return res.json({
        success: true,
        message: 'Đăng nhập thành công',
        user: sessionUser,
      });
    }

    return res.status(404).json({
      error: 'Tài khoản chưa tồn tại trong hệ thống. Vui lòng bấm vào tab "Đăng Ký Tài Khoản Mới" để tạo tài khoản.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Lỗi xác thực đăng nhập' });
  }
});

// 3. API Lấy thông tin tài khoản đang đăng nhập (Kiểm tra token thực tế)
app.get('/api/auth/me', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.json({
      authenticated: false,
      user: null,
      bankAccount: activeBankAccount,
    });
  }

  return res.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      branch: user.branch,
      roleTitle: user.roleTitle,
    },
    bankAccount: activeBankAccount,
  });
});

// 4. API Đăng Xuất
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) activeSessions.delete(token);
  }
  return res.json({ success: true, message: 'Đã đăng xuất phiên làm việc' });
});

app.get('/api/debt/pdf', async (req, res) => {
  try {
    const khId = String(req.query.kh_id || 'KH001');
    const name = String(req.query.name || 'Khách hàng');
    const total = Number(req.query.total) || 0;
    const paid = Number(req.query.paid) || 0;
    const remain = Number(req.query.remain) || 0;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const todayStr = `${day}/${month}/${year}`;

    let defaultSyntax = (activeBankAccount.transferSyntax || '[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY')
      .replace(/\[MA_KH\]/g, khId)
      .replace(/DD\/MM\/YYYY/g, todayStr)
      .replace(/\[NGAY_THANG_NAM\]/g, todayStr);

    let resolvedSyntax = req.query.syntax ? String(req.query.syntax) : defaultSyntax;
    resolvedSyntax = resolvedSyntax.replace(/DD\/MM\/YYYY/g, todayStr).replace(/\[NGAY_THANG_NAM\]/g, todayStr);

    // Enforce official active company beneficiary account (prevents query injection attack)
    const bankAccount = {
      bankName: activeBankAccount.bankName,
      accountNo: activeBankAccount.accountNo,
      accountName: activeBankAccount.accountName,
      bankBin: activeBankAccount.bankBin,
      companyName: activeBankAccount.companyName,
      transferSyntax: resolvedSyntax,
    };

    const pdfBuffer = await createDebtPdf(khId, name, total, paid, remain, bankAccount);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Thong_Bao_No_${khId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Error in /api/debt/pdf:', err);
    return res.status(500).json({ error: err.message || 'Lỗi tạo PDF thông báo công nợ.' });
  }
});

// BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ WORD (.DOCX)
app.get('/api/debt/confirmation-doc', async (req, res) => {
  try {
    const khId = String(req.query.kh_id || 'KH001');
    const name = String(req.query.name || 'Khách hàng');
    const total = Number(req.query.total) || 0;
    const paid = Number(req.query.paid) || 0;
    const remain = Number(req.query.remain) || 0;
    const email = String(req.query.email || 'ketoan@khachhang.vn');
    const due = String(req.query.due || 'Trong vòng 05 ngày làm việc');

    const customer: CustomerDebt = {
      id: khId,
      name,
      email,
      total,
      paid,
      remain,
      due,
      email_subject: '',
      email_body: '',
    };

    const docxBuf = await generateDebtConfirmationDocx(customer);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="Bien_Ban_Doi_Chieu_Cong_No_${khId}.docx"`);
    return res.send(docxBuf);
  } catch (err: any) {
    console.error('Error in /api/debt/confirmation-doc:', err);
    return res.status(500).json({ error: err.message || 'Lỗi xuất biên bản đối chiếu công nợ.' });
  }
});

// ==========================================
// 2. GHÉP & ĐỐI CHIẾU 2 FILE EXCEL
// ==========================================
app.post(
  '/api/reconcile/preview',
  upload.fields([
    { name: 'file_a', maxCount: 1 },
    { name: 'file_b', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let bufA: Buffer | null = null;
      let bufB: Buffer | null = null;

      if (files?.['file_a']?.[0]) {
        bufA = files['file_a'][0].buffer;
      } else if (req.body.use_sample === 'true') {
        bufA = getSampleReconcileA();
      }

      if (files?.['file_b']?.[0]) {
        bufB = files['file_b'][0].buffer;
      } else if (req.body.use_sample === 'true') {
        bufB = getSampleReconcileB();
      }

      if (!bufA || !bufB) {
        return res.status(400).json({ error: 'Vui lòng chọn cả 2 file cần đối chiếu.' });
      }

      const preview = getReconcilePreview(bufA, bufB);
      const sessionId = `rec_${Date.now()}`;
      reconcileUploads.set(sessionId, {
        fileA: bufA,
        fileB: bufB,
        nameA: files?.['file_a']?.[0]?.originalname || 'File_A.xlsx',
        nameB: files?.['file_b']?.[0]?.originalname || 'File_B.xlsx',
      });

      return res.json({
        ...preview,
        session_id: sessionId,
      });
    } catch (err: any) {
      console.error('Error in /api/reconcile/preview:', err);
      return res.status(500).json({ error: err.message || 'Lỗi đọc cấu trúc 2 file.' });
    }
  }
);

app.post('/api/reconcile/run', upload.none(), async (req, res) => {
  try {
    const { session_id, key_a, key_b, val_a, val_b } = req.body;
    let cached = reconcileUploads.get(session_id);

    if (!cached) {
      // Use sample if no active session
      cached = {
        fileA: getSampleReconcileA(),
        fileB: getSampleReconcileB(),
        nameA: 'File_A_Sample.xlsx',
        nameB: 'File_B_Sample.xlsx',
      };
    }

    const result = await runReconcileProcess(
      cached.fileA,
      cached.fileB,
      key_a || 'Mã Đơn',
      key_b || 'Mã Đơn',
      val_a || 'Thành tiền',
      val_b || 'Số tiền kế toán'
    );

    const fileId = storeDownload(result.excelBuffer, 'Bao_Cao_Doi_Chieu_2_File.xlsx');

    return res.json({
      stats: result.stats,
      sample_rows: result.rows,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/reconcile/run:', err);
    return res.status(500).json({ error: err.message || 'Lỗi đối chiếu số liệu 2 file.' });
  }
});

// ==========================================
// 3. TẠO PHIẾU LƯƠNG HÀNG LOẠT (EXCEL, DOCX & ZIP)
// ÁP DỤNG BIỂU MẪU CHUẨN CỦA DOANH NGHIỆP
// ==========================================
app.post('/api/payslip/template-inspect', upload.single('template_file'), async (req, res) => {
  try {
    let templateBuf: Buffer | null = null;
    let originalName = 'Mau_Phieu_Luong_Doanh_Nghiep.xlsx';

    if (req.file) {
      templateBuf = req.file.buffer;
      originalName = req.file.originalname;
    } else if (req.body.use_sample_template === 'true') {
      templateBuf = await getSamplePayslipTemplateWorkbook();
      originalName = 'Mau_Phieu_Luong_Doanh_Nghiep_Chuan.xlsx';
    }

    if (!templateBuf) {
      return res.status(400).json({ error: 'Chưa có file mẫu phiếu lương nào được tải lên.' });
    }

    const inspection = await inspectPayslipTemplate(templateBuf);
    return res.json({
      filename: originalName,
      ...inspection,
    });
  } catch (err: any) {
    console.error('Error in /api/payslip/template-inspect:', err);
    return res.status(500).json({ error: err.message || 'Không thể đọc cấu trúc biểu mẫu. Vui lòng đảm bảo file là định dạng Excel (.xlsx).' });
  }
});

app.post(
  '/api/payslip/generate',
  upload.fields([
    { name: 'payroll_file', maxCount: 1 },
    { name: 'template_file', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let payrollBuffer: Buffer | null = null;
      let templateBuffer: Buffer | undefined = undefined;
      let templateFileName: string | undefined = undefined;

      // Payroll data
      if (files?.['payroll_file']?.[0]) {
        payrollBuffer = files['payroll_file'][0].buffer;
      } else if (req.body.use_sample === 'true') {
        payrollBuffer = getSamplePayroll();
      }

      // Enterprise template
      if (files?.['template_file']?.[0]) {
        templateBuffer = files['template_file'][0].buffer;
        templateFileName = files['template_file'][0].originalname;
      } else if (req.body.use_sample_template === 'true') {
        templateBuffer = await getSamplePayslipTemplateWorkbook();
        templateFileName = 'Mau_Phieu_Luong_Doanh_Nghiep_Chuan.xlsx';
      }

      if (!payrollBuffer) {
        return res.status(400).json({ error: 'Vui lòng tải lên file bảng lương nhân viên hoặc chọn Dùng bảng lương mẫu.' });
      }

      const companyName = req.body.company_name || 'CÔNG TY CP CÔNG NGHỆ & TÀI CHÍNH VIỆT NAM';
      const companyAddress = req.body.company_address || 'Tòa nhà Landmark, Ba Đình, Hà Nội';
      const companyTax = req.body.company_tax || '0109887766';
      const exportFormat = (req.body.export_format as 'both' | 'excel' | 'docx') || 'both';

      const result = await generatePayslipsZip(
        payrollBuffer,
        companyName,
        companyAddress,
        companyTax,
        templateBuffer,
        templateFileName,
        exportFormat
      );

      // Store ZIP download
      const zipFileId = storeDownload(result.zipBuffer, 'Phieu_Luong_Hang_Loat.zip', 'application/zip');

      // Store consolidated Excel workbook
      let consolidatedUrl = '';
      if (result.consolidatedBuffer) {
        const consFileId = storeDownload(result.consolidatedBuffer, 'Bang_Tong_Hop_Phieu_Luong_Tat_Ca_NV.xlsx');
        consolidatedUrl = `/api/download/${consFileId}`;
      }

      // Map employee items with individual download links
      const employeeItems = result.employees.map(emp => {
        const safeCode = emp.code.replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeName = emp.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
        let excelUrl = '';
        let docxUrl = '';

        if (emp.excelBuffer) {
          const fid = storeDownload(emp.excelBuffer, `Phieu_Luong_${safeCode}_${safeName}.xlsx`);
          excelUrl = `/api/download/${fid}`;
        }
        if (emp.docxBuffer) {
          const fid = storeDownload(
            emp.docxBuffer,
            `Phieu_Luong_${safeCode}_${safeName}.docx`,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          );
          docxUrl = `/api/download/${fid}`;
        }

        return {
          id: emp.id,
          code: emp.code,
          name: emp.name,
          title: emp.title,
          baseSalary: emp.baseSalary,
          netSalary: emp.netSalary,
          netSalaryWords: emp.netSalaryWords,
          excel_url: excelUrl,
          docx_url: docxUrl,
        };
      });

      return res.json({
        total_generated: result.total_generated,
        template_applied: result.template_applied,
        matched_tags: result.matched_tags,
        warnings: result.warnings,
        download_url: `/api/download/${zipFileId}`,
        consolidated_url: consolidatedUrl,
        employees: employeeItems,
      });
    } catch (err: any) {
      console.error('Error in /api/payslip/generate:', err);
      return res.status(500).json({ error: err.message || 'Lỗi tạo phiếu lương hàng loạt.' });
    }
  }
);

// ==========================================
// 4 & 5. BÓC ĐƠN HÀNG ZALO & ĐỌC CHỨNG TỪ (OCR)
// ==========================================
app.post('/api/ai/extract-batch', upload.array('files'), async (req, res) => {
  try {
    const taskType = (req.body.task_type || 'orders') as 'orders' | 'documents';
    const columnsSchema =
      req.body.columns_schema ||
      (taskType === 'orders'
        ? 'Tên khách hàng, Số điện thoại, Sản phẩm, Size/Loại, Số lượng, Đơn giá, Tổng tiền, Địa chỉ'
        : 'Ngày chứng từ, Đơn vị bán, Số hóa đơn, Nội dung chi phí, Tiền trước thuế, Thuế VAT, Tổng thanh toán');
    const rawText = req.body.raw_text || '';

    const files = (req.files as Express.Multer.File[]) || [];
    const filePayloads = files.map(f => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      originalname: f.originalname,
    }));

    const result = await extractBatchAI(taskType, columnsSchema, rawText, filePayloads);
    const filename = taskType === 'orders' ? 'Don_Hang_Tu_Tin_Nhan.xlsx' : 'Bao_Cao_Chung_Tu_Tong_Hop.xlsx';
    const fileId = storeDownload(result.excelBuffer, filename);

    return res.json({
      rows: result.rows,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/ai/extract-batch:', err);
    return res.status(500).json({ error: err.message || 'Lỗi bóc tách AI.' });
  }
});

// ==========================================
// 6. THẨM ĐỊNH SAO KÊ & RED FLAGS (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/statement-analyze', upload.single('statement_file'), async (req, res) => {
  try {
    let stmtBuffer: Buffer | null = null;
    if (req.file) {
      stmtBuffer = req.file.buffer;
    } else if (req.body.use_sample === 'true') {
      stmtBuffer = getSampleBankWorkbook();
    }

    if (!stmtBuffer) {
      return res.status(400).json({ error: 'Vui lòng tải lên file sao kê ngân hàng.' });
    }

    const proposedPayment = Number(req.body.proposed_payment) || 15000000;
    const result = await analyzeBankStatementLogic(stmtBuffer, proposedPayment);

    const fileId = storeDownload(result.excelBuffer, 'Bao_Cao_Tham_Dinh_Sao_Ke_AI.xlsx');

    return res.json({
      biz_inflow: result.biz_inflow,
      internal_inflow: result.internal_inflow,
      biz_outflow: result.biz_outflow,
      existing_debt_outflow: result.existing_debt_outflow,
      net_cashflow: result.net_cashflow,
      dscr: result.dscr,
      red_flag_count: result.red_flag_count,
      red_flags: result.red_flags,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/statement-analyze:', err);
    return res.status(500).json({ error: err.message || 'Lỗi phân tích sao kê ngân hàng.' });
  }
});

// ==========================================
// 7. BÓC TÁCH CIC & BCTC (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/cic-bctc-extract', upload.array('files'), async (req, res) => {
  try {
    const docType = (req.body.doc_type || 'cic') as 'cic' | 'bctc';
    const customerIncome = Number(req.body.customer_income) || 50000000;

    const files = (req.files as Express.Multer.File[]) || [];
    const filePayloads = files.map(f => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      originalname: f.originalname,
    }));

    const result = await extractCicOrBctcAI(docType, customerIncome, filePayloads);
    const filename = docType === 'cic' ? 'Bang_Tinh_CIC_Nghia_Vu_Tra_No.xlsx' : 'Tham_Dinh_BCTC_Chi_So_Tai_Chinh.xlsx';
    const fileId = storeDownload(result.excelBuffer, filename);

    return res.json({
      rows: result.rows,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/cic-bctc-extract:', err);
    return res.status(500).json({ error: err.message || 'Lỗi bóc tách hồ sơ tín dụng.' });
  }
});

// ==========================================
// 8. CHĂM SÓC DANH MỤC TÍN DỤNG & TIẾT KIỆM (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/portfolio-care', upload.single('portfolio_file'), async (req, res) => {
  try {
    let portBuffer: Buffer | null = null;
    if (req.file) {
      portBuffer = req.file.buffer;
    } else if (req.body.use_sample === 'true') {
      portBuffer = getSamplePortfolio();
    }

    if (!portBuffer) {
      return res.status(400).json({ error: 'Vui lòng tải lên file danh mục khách hàng.' });
    }

    const result = await portfolioCareLogic(portBuffer);
    const fileId = storeDownload(result.excelBuffer, 'Theo_Doi_Dao_Han_Tin_Dung_Tiet_Kiem.xlsx');

    return res.json({
      items: result.items,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/portfolio-care:', err);
    return res.status(500).json({ error: err.message || 'Lỗi chăm sóc danh mục tín dụng.' });
  }
});

// ==========================================
// 9. BÓC TÁCH SỔ ĐỎ (GCN QSDĐ) & ĐỊNH GIÁ LTV (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/collateral-ltv', upload.array('collat_files'), async (req, res) => {
  try {
    const useSample = req.body.use_sample === 'true' || req.body.use_sample === true;
    const files = (req.files as Express.Multer.File[]) || [];
    const filePayloads = files.map(f => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      originalname: f.originalname,
    }));

    const result = await extractCollateralAI(filePayloads, useSample);
    const fileId = storeDownload(result.excelBuffer, 'Bang_Dinh_Gia_TSBD_LTV.xlsx');

    return res.json({
      total_valuation: result.total_valuation,
      total_max_loan: result.total_max_loan,
      assets: result.assets,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/collateral-ltv:', err);
    return res.status(500).json({ error: err.message || 'Lỗi bóc tách sổ đỏ và định giá LTV.' });
  }
});

// ==========================================
// 10. LẬP TỜ TRÌNH TÍN DỤNG & REFINANCE (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/credit-proposal', upload.single('template_file'), async (req, res) => {
  try {
    const customerName = req.body.customer_name || 'Khách hàng vay';
    const loanPurpose = req.body.loan_purpose || 'Bổ sung vốn kinh doanh';
    const loanAmount = parseNumeric(req.body.loan_amount, 1500000000);
    const tenureMonths = parseNumeric(req.body.tenure_months, 36);
    const newRateYear = parseNumeric(req.body.new_rate_year, 7.5);
    const oldRateYear = parseNumeric(req.body.old_rate_year, 11.0);
    const prepayPenaltyPct = parseNumeric(req.body.prepay_penalty_pct, 1.5);
    const monthlyNetIncome = parseNumeric(req.body.monthly_net_income, 85000000);
    const collateralValue = parseNumeric(req.body.collateral_value, 2800000000);

    let templateBuffer: Buffer | undefined;
    let templateName: string | undefined;
    if (req.file) {
      templateBuffer = req.file.buffer;
      templateName = req.file.originalname;
    }

    const result = await creditProposalLogic({
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
    });

    const excelId = storeDownload(
      result.excelBuffer,
      'Ke_Hoach_Tra_No_Va_Refinance.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const docxId = storeDownload(
      result.docxBuffer,
      'To_Trinh_Tham_Dinh_Tin_Dung.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    return res.json({
      first_month_payment: result.first_month_payment,
      dscr: result.dscr,
      ltv: result.ltv,
      net_refinance_saving: result.net_refinance_saving,
      penalty_fee: result.penalty_fee,
      used_custom_template: result.used_custom_template,
      template_name: result.template_name,
      excel_url: `/api/download/${excelId}`,
      docx_url: `/api/download/${docxId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/credit-proposal:', err);
    return res.status(500).json({ error: err.message || 'Lỗi lập tờ trình tín dụng & phương án vay.' });
  }
});

// TẢI FILE MẪU CHUẨN TỜ TRÌNH WORD
app.get('/api/bank/sample-proposal-template', async (_req, res) => {
  try {
    const docBuffer = await getSampleProposalTemplateDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_To_Trinh_Tin_Dung_Chuan.docx"');
    return res.send(docBuffer);
  } catch (e: any) {
    return res.status(500).send('Error generating template');
  }
});

// TẢI FILE MẪU CHUẨN PHIẾU LƯƠNG
app.get('/api/payslip/sample-template', async (_req, res) => {
  try {
    const buf = await getSamplePayslipTemplateWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_Phieu_Luong_Doanh_Nghiep.xlsx"');
    return res.send(buf);
  } catch (e: any) {
    return res.status(500).send('Error generating template');
  }
});

// ==========================================
// 11. THẨM ĐỊNH NGUỒN THU NHẬP & NDI (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/income-assessment', upload.none(), async (req, res) => {
  try {
    const useSample = req.body.use_sample === 'true' || req.body.use_sample === true;
    let params: any;

    if (useSample || !req.body.incomes) {
      params = getSampleIncomeAssessmentData();
    } else {
      const parsedIncomes =
        typeof req.body.incomes === 'string' ? JSON.parse(req.body.incomes) : req.body.incomes;
      params = {
        customerName: req.body.customer_name || 'Nguyễn Hoàng Nam & Lê Thị Thảo',
        borrowerAge: Number(req.body.borrower_age) || 38,
        coBorrowerAge: req.body.co_borrower_age ? Number(req.body.co_borrower_age) : undefined,
        dependentsCount: Number(req.body.dependents_count) || 2,
        livingCostBorrower: Number(req.body.living_cost_borrower) || 12000000,
        livingCostCoBorrower: Number(req.body.living_cost_co_borrower) || 10000000,
        livingCostPerDependent: Number(req.body.living_cost_per_dependent) || 5000000,
        existingMonthlyDebt: Number(req.body.existing_monthly_debt) || 15000000,
        newLoanTenureMonths: Number(req.body.new_loan_tenure_months) || 60,
        newLoanInterestYear: Number(req.body.new_loan_interest_year) || 8.5,
        incomes: parsedIncomes,
      };
    }

    const result = await incomeAssessmentLogic(params);
    const fileId = storeDownload(result.excelBuffer, 'Bang_Tham_Dinh_Nguon_Thu_Nhap.xlsx');

    return res.json({
      ...result,
      excelBuffer: undefined,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/income-assessment:', err);
    return res.status(500).json({ error: err.message || 'Lỗi thẩm định nguồn thu nhập.' });
  }
});

// ==========================================
// 12. DỰ BÁO DÒNG TIỀN 12 TUẦN (VĂN PHÒNG)
// ==========================================
app.post('/api/office/cashflow-forecast', upload.none(), async (req, res) => {
  try {
    const useSample = req.body.use_sample === 'true' || req.body.use_sample === true;
    let params: any;

    if (useSample || !req.body.weekly_data) {
      params = getSampleCashFlowData();
    } else {
      const parsedWeeks =
        typeof req.body.weekly_data === 'string'
          ? JSON.parse(req.body.weekly_data)
          : req.body.weekly_data;
      params = {
        initialCash: Number(req.body.initial_cash) || 950000000,
        safetyThreshold: Number(req.body.safety_threshold) || 200000000,
        weeklyData: parsedWeeks,
      };
    }

    const result = await cashFlowForecastLogic(params);
    const fileId = storeDownload(result.excelBuffer, 'Ke_Hoach_Du_Bao_Dong_Tien_12_Tuan.xlsx');

    return res.json({
      ...result,
      excelBuffer: undefined,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/office/cashflow-forecast:', err);
    return res.status(500).json({ error: err.message || 'Lỗi tính toán dự báo dòng tiền.' });
  }
});

// ==========================================
// 13. GEMINI MULTI-TURN CHATBOT ENDPOINT
// ==========================================
app.post('/api/chat/message', async (req, res) => {
  try {
    const { messages, role, model } = req.body || {};
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Danh sách tin nhắn không hợp lệ.' });
    }

    const result = await chatMultiTurnAI(messages, role, model);
    return res.json({
      success: true,
      reply: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (err: any) {
    console.error('Error in /api/chat/message:', err);
    return res.status(500).json({ error: err.message || 'Lỗi xử lý phản hồi từ Gemini Chatbot.' });
  }
});

// ==========================================
// FRONTEND STATIC / VITE INTEGRATION
// ==========================================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Excel AI Agent - Banking & Office Pro listening on port ${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
