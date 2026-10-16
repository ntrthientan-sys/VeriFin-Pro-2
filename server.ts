import { adviseOperations } from './server/operationsAdvisor';
import { SalesOrderSchema } from './src/schemas/inventoryOrderSchema';
import { generateVietQrDataUrl } from './server/vietQrService';
import { z } from 'zod';
import { getRequestGeminiKey, verifyRequestKeyLive } from './server/userGeminiKey';
import { extractDocumentEvidence } from './server/evidenceService';
import { VeriFinEvidenceEnvelopeSchema, evaluateFailClosedGate } from './src/schemas/evidenceSchema';
import { runDeterministicUnderwritingEngine } from './src/engine/underwritingDerivations';
import { redactSensitiveLog } from './src/utils/redaction';
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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
import { extractBatchAI, extractCicOrBctcAI, extractCollateralAI, chatMultiTurnAI, GEMINI_MODEL } from './server/geminiService';
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
  return Number.isFinite(num) ? num : fallback;
}

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer storage in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 10, fields: 100, parts: 110 }, // 30MB
});

const requestOwner = new AsyncLocalStorage<string>();
app.use('/api', (req, res, next) => {
  const cookie = /(?:^|;\s*)verifin_workspace=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  const owner = cookie?.[1] || randomBytes(32).toString('hex');
  if (!cookie) res.cookie('verifin_workspace', owner, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 86400000 });
  res.setHeader('Cache-Control', 'no-store');
  requestOwner.run(owner, next);
});

// Gemini credentials belong exclusively to this request; never stored on the server.
const byokRoutes = new Set(['/api/operations/advisory','/api/ai/extract-batch', '/api/bank/cic-bctc-extract', '/api/bank/collateral-ltv', '/api/chat/message', '/api/evidence/extract', '/api/bank/credit-proposal']);
app.use((req, res, next) => {
  if (!byokRoutes.has(req.path)) return next();
  try { getRequestGeminiKey(req); next(); }
  catch (error: any) { res.status(error.status || 401).json({ error: redactSensitiveLog(error), code: error.code }); }
});
app.get('/api/evidence/config', (_req, res) => res.json({modelName:GEMINI_MODEL}));
app.post('/api/evidence/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({error:'Thiếu tài liệu.'});
    const type = z.enum(['CIC','BCTC','SAO_KE','TSBD']).safeParse(req.body.document_type);
    if (!type.success) return res.status(400).json({error:'Loại tài liệu không hợp lệ.'});
    const evidence = await extractDocumentEvidence(req.file, type.data, getRequestGeminiKey(req), GEMINI_MODEL);
    return res.json({evidence});
  } catch (error: any) { return res.status(error.status || 502).json({error:redactSensitiveLog(error),code:error.code}); }
});

// Cache for generated download files
const downloadCache = new Map<string, { buffer: Buffer; filename: string; contentType: string; createdAt: number; owner: string }>();

function storeDownload(
  buffer: Buffer,
  filename: string,
  contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
): string {
  const id = randomUUID();
  downloadCache.set(id, { buffer, filename, contentType, createdAt: Date.now(), owner: requestOwner.getStore()! });
  // Evict older files if cache grows too large (> 1000 items)
  if (downloadCache.size > 1000) {
    const oldestKey = downloadCache.keys().next().value;
    if (oldestKey) downloadCache.delete(oldestKey);
  }
  trimCaches();
  return id;
}

// Temporary store for 2-step Reconcile files
const reconcileUploads = new Map<string, { fileA: Buffer; fileB: Buffer; nameA: string; nameB: string; owner: string; createdAt: number }>();

// Expire sensitive buffers and bound total memory, including abandoned previews.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, file] of downloadCache) if (file.createdAt < cutoff) downloadCache.delete(id);
  for (const [id, file] of reconcileUploads) if (file.createdAt < cutoff) reconcileUploads.delete(id);
}, 60_000).unref();
function trimCaches() {
  let size = [...downloadCache.values()].reduce((n, f) => n + f.buffer.length, 0) + [...reconcileUploads.values()].reduce((n, f) => n + f.fileA.length + f.fileB.length, 0);
  while (size > 256 * 1024 * 1024 && downloadCache.size) {
    const id = downloadCache.keys().next().value!;
    size -= downloadCache.get(id)!.buffer.length;
    downloadCache.delete(id);
  }
  while (size > 256 * 1024 * 1024 && reconcileUploads.size) {
    const id = reconcileUploads.keys().next().value!;
    const file = reconcileUploads.get(id)!;
    size -= file.fileA.length + file.fileB.length;
    reconcileUploads.delete(id);
  }
}

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
  if (file && file.owner !== requestOwner.getStore()) return res.status(404).json({ error: 'File không tồn tại.' });
  if (!file || Date.now() - file.createdAt > 30 * 60 * 1000) {
    downloadCache.delete(req.params.fileId);
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
      console.error('Error in /api/debt/process:', redactSensitiveLog(err));
      return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi khi xử lý công nợ.' });
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

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
function saveState(filename: string, value: unknown) {
  const target = path.join(dataDir, filename);
  fs.writeFileSync(target + '.tmp', JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(target + '.tmp', target);
}
function loadState<T>(filename: string, fallback: T): T {
  const target = path.join(dataDir, filename);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : fallback;
}
let activeBankAccount = loadState<BankAccountConfig>('bank-account.json', {
  companyName: '', bankName: '', bankBin: '', accountNo: '', accountName: '',
  transferSyntax: '[MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY', hotline: '',
});

// Session store: token -> { userId, expiresAt }
const activeSessions = new Map<string, { userId: string; expiresAt: number }>();

async function getAuthenticatedUser(req: express.Request): Promise<UserAccountRecord | null> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const session = activeSessions.get(token);
  if (session) {
    if (session.expiresAt < Date.now()) { activeSessions.delete(token); return null; }
    return registeredUsers.find(u => u.id === session.userId) || null;
  }
  // Verify Firebase signature, issuer, audience and expiry on the server.
  if (!process.env.FIREBASE_PROJECT_ID) return null;
  try {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const firebaseApp = getApps()[0] || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    const decoded = await getAuth(firebaseApp).verifyIdToken(token);
    if (!decoded.email || !decoded.email_verified) return null;
    return { id: decoded.uid, name: decoded.name || decoded.email, email: decoded.email, password: '', branch: 'all', roleTitle: 'Google', createdAt: '' };
  } catch { return null; }
}

// Operations uses the configured beneficiary; no account override is accepted.
app.post('/api/operations/qr', async (req,res)=>{
  try {
    const order=SalesOrderSchema.parse(req.body);
    if(['CANCELLED','RETURNED'].includes(order.fulfillmentStatus)||order.paidAmount>=order.grandTotalAmount) return res.status(400).json({error:'Đơn không còn khoản phải thu hợp lệ.'});
    if(!activeBankAccount.accountName.trim()) return res.status(400).json({error:'Chưa cấu hình tài khoản thụ hưởng.'});
    const amountToCollect=order.grandTotalAmount-order.paidAmount;
    const transferMemo=`VF ${order.id.replace(/[^a-zA-Z0-9]/g,'').slice(-40)}`;
    const qrImageUrl=await generateVietQrDataUrl({bankBin:activeBankAccount.bankBin,accountNo:activeBankAccount.accountNo,accountName:activeBankAccount.accountName,amount:amountToCollect,message:transferMemo});
    res.json({qrImageUrl,amountToCollect,transferMemo,bankConfig:{bankBin:activeBankAccount.bankBin,accountNo:activeBankAccount.accountNo,accountName:activeBankAccount.accountName}});
  }catch(error){res.status(400).json({error:redactSensitiveLog(error)});}
});
const operationsAiInFlight=new Set<string>();
app.post('/api/operations/advisory',async(req,res)=>{
  const owner=requestOwner.getStore()!;
  if(operationsAiInFlight.has(owner))return res.status(429).json({error:'Đang xử lý một yêu cầu AI. Hãy chờ hoàn tất.'});
  operationsAiInFlight.add(owner);
  try {res.json(await adviseOperations(req.body,getRequestGeminiKey(req),GEMINI_MODEL));}
  catch(error:any){res.status(error instanceof z.ZodError?400:error.status||502).json({error:redactSensitiveLog(error),code:error.code});}
  finally{operationsAiInFlight.delete(owner);}
});

// API Lấy thông tin tài khoản thụ hưởng để trích xuất khi tạo QR
app.get('/api/settings/bank-account', (_req, res) => {
  return res.json(activeBankAccount);
});

// API Cập nhật tài khoản thụ hưởng (bảo mật: yêu cầu phiên đăng nhập)
app.post('/api/settings/bank-account', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Vui lòng đăng nhập với tài khoản Quản trị / Kế toán để có quyền cập nhật tài khoản thụ hưởng doanh nghiệp.',
      });
    }

    const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(user.email.toLowerCase())) return res.status(403).json({ error: 'Chỉ quản trị được cấu hình trong ADMIN_EMAILS có quyền đổi tài khoản thụ hưởng.' });
    const body = req.body || {};
    if (typeof body.bankBin !== 'string' || !/^\d{6}$/.test(body.bankBin) ||
        typeof body.accountNo !== 'string' || !/^[A-Za-z0-9]{1,34}$/.test(body.accountNo.trim()) ||
        typeof body.accountName !== 'string' || !body.accountName.trim()) {
      return res.status(400).json({ error: 'BIN, số tài khoản hoặc tên người thụ hưởng không hợp lệ.' });
    }
    const nextBankAccount: BankAccountConfig = {
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
    saveState('bank-account.json', nextBankAccount);
    activeBankAccount = nextBankAccount;
    return res.json({ success: true, message: 'Đã lưu cấu hình tài khoản VietQR', account: activeBankAccount });
  } catch (err: any) {
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi khi cập nhật cấu hình tài khoản' });
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
const registeredUsers = loadState<UserAccountRecord[]>('users.json', []);
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Provision the administrator out of band; public registration cannot claim this identity.
const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (adminEmails[0] && process.env.ADMIN_PASSWORD && !registeredUsers.some(u => u.email === adminEmails[0])) {
  if (process.env.ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD phải có ít nhất 12 ký tự.');
  registeredUsers.push({ id: randomUUID(), name: 'Quản trị', email: adminEmails[0], password: hashPassword(process.env.ADMIN_PASSWORD), branch: 'all', roleTitle: 'Quản trị hệ thống', createdAt: new Date().toISOString() });
  saveState('users.json', registeredUsers);
}

// 1. API Đăng Ký Tài Khoản Mới
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, phone, password, branch, roleTitle } = req.body || {};
    
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập họ và tên của bạn.' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 256) {
      return res.status(400).json({ error: 'Mật khẩu phải có tối thiểu 6 ký tự để đảm bảo bảo mật.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (adminEmails.includes(cleanEmail)) return res.status(403).json({ error: 'Email dành cho quản trị. Liên hệ người vận hành hệ thống.' });
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

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
      id: randomUUID(),
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: hashPassword(password),
      branch: branch === 'banking' ? 'banking' : branch === 'office' ? 'office' : 'all',
      roleTitle: (typeof roleTitle === 'string' && roleTitle.trim()) || (branch === 'banking' ? 'Chuyên viên Ngân Hàng' : branch === 'office' ? 'Kế toán & Hành chính' : 'Quản Lý Điều Hành'),
      createdAt: new Date().toISOString(),
    };

    saveState('users.json', [...registeredUsers, newUser]);
    registeredUsers.push(newUser);

    const token = randomBytes(32).toString('hex');
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
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi trong quá trình đăng ký tài khoản' });
  }
});

// 2. API Đăng Nhập Tài Khoản
app.post('/api/auth/login', (req, res) => {
  try {
    const { emailOrPhone, email, phone, password } = req.body || {};
    const identifier = emailOrPhone || email || phone || '';
    if (typeof identifier !== 'string' || typeof password !== 'string' || password.length > 256) return res.status(400).json({ error: 'Thông tin đăng nhập không hợp lệ.' });
    const inputIdentifier = identifier.trim().toLowerCase();
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
      if (!verifyPassword(inputPass, matched.password)) {
        return res.status(401).json({
          error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại.',
        });
      }

      const token = randomBytes(32).toString('hex');
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

    return res.status(401).json({
      error: 'Thông tin đăng nhập không chính xác.',
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi xác thực đăng nhập' });
  }
});

// 3. API Lấy thông tin tài khoản đang đăng nhập (Kiểm tra token thực tế)
app.get('/api/auth/me', async (req, res) => {
  const user = await getAuthenticatedUser(req);
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
    console.error('Error in /api/debt/pdf:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi tạo PDF thông báo công nợ.' });
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
    console.error('Error in /api/debt/confirmation-doc:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi xuất biên bản đối chiếu công nợ.' });
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
      const sessionId = randomUUID();
      reconcileUploads.set(sessionId, {
        owner: requestOwner.getStore()!,
        createdAt: Date.now(),
        fileA: bufA,
        fileB: bufB,
        nameA: files?.['file_a']?.[0]?.originalname || 'File_A.xlsx',
        nameB: files?.['file_b']?.[0]?.originalname || 'File_B.xlsx',
      });

      trimCaches();
      return res.json({
        ...preview,
        session_id: sessionId,
      });
    } catch (err: any) {
      console.error('Error in /api/reconcile/preview:', redactSensitiveLog(err));
      return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi đọc cấu trúc 2 file.' });
    }
  }
);

app.post('/api/reconcile/run', upload.none(), async (req, res) => {
  try {
    const { session_id, key_a, key_b, val_a, val_b } = req.body;
    let cached = reconcileUploads.get(session_id);

    if (!cached || cached.owner !== requestOwner.getStore() || Date.now() - cached.createdAt > 30 * 60 * 1000) return res.status(404).json({ error: 'Phiên đối soát không tồn tại. Vui lòng tải lại hai file.' });

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
    console.error('Error in /api/reconcile/run:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi đối chiếu số liệu 2 file.' });
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
    console.error('Error in /api/payslip/template-inspect:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Không thể đọc cấu trúc biểu mẫu. Vui lòng đảm bảo file là định dạng Excel (.xlsx).' });
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
      console.error('Error in /api/payslip/generate:', redactSensitiveLog(err));
      return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi tạo phiếu lương hàng loạt.' });
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

    const result = await extractBatchAI(taskType, columnsSchema, rawText, filePayloads, getRequestGeminiKey(req));
    const filename = taskType === 'orders' ? 'Don_Hang_Tu_Tin_Nhan.xlsx' : 'Bao_Cao_Chung_Tu_Tong_Hop.xlsx';
    const fileId = storeDownload(result.excelBuffer, filename);

    return res.json({
      rows: result.rows,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/ai/extract-batch:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi bóc tách AI.' });
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

    const proposedPayment = parseNumeric(req.body.proposed_payment, 15000000);
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
    console.error('Error in /api/bank/statement-analyze:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi phân tích sao kê ngân hàng.' });
  }
});

// ==========================================
// 7. BÓC TÁCH CIC & BCTC (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/cic-bctc-extract', upload.array('files'), async (req, res) => {
  try {
    const docType = (req.body.doc_type || 'cic') as 'cic' | 'bctc';
    const customerIncome = parseNumeric(req.body.customer_income, 50000000);

    const files = (req.files as Express.Multer.File[]) || [];
    const filePayloads = files.map(f => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      originalname: f.originalname,
    }));

    const result = await extractCicOrBctcAI(docType, customerIncome, filePayloads, getRequestGeminiKey(req));
    const filename = docType === 'cic' ? 'Bang_Tinh_CIC_Nghia_Vu_Tra_No.xlsx' : 'Tham_Dinh_BCTC_Chi_So_Tai_Chinh.xlsx';
    const fileId = storeDownload(result.excelBuffer, filename);

    return res.json({
      rows: result.rows,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/cic-bctc-extract:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi bóc tách hồ sơ tín dụng.' });
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
    console.error('Error in /api/bank/portfolio-care:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi chăm sóc danh mục tín dụng.' });
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

    const result = await extractCollateralAI(filePayloads, useSample, getRequestGeminiKey(req));
    const fileId = storeDownload(result.excelBuffer, 'Bang_Dinh_Gia_TSBD_LTV.xlsx');

    return res.json({
      total_valuation: result.total_valuation,
      total_max_loan: result.total_max_loan,
      assets: result.assets,
      download_url: `/api/download/${fileId}`,
    });
  } catch (err: any) {
    console.error('Error in /api/bank/collateral-ltv:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi bóc tách sổ đỏ và định giá LTV.' });
  }
});

// ==========================================
// 10. LẬP TỜ TRÌNH TÍN DỤNG & REFINANCE (NGÂN HÀNG)
// ==========================================
app.post('/api/bank/credit-proposal', upload.single('template_file'), async (req, res) => {
  try {
    const customerName = req.body.customer_name || 'Khách hàng vay';
    const loanPurpose = req.body.loan_purpose || 'Bổ sung vốn kinh doanh';
    const numeric = (value: unknown) => value === '' || value == null ? NaN : Number(value);
    const terms = z.object({
      loanAmount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
      tenureMonths: z.number().int().min(1).max(600),
      newRateYear: z.number().finite().min(0).max(100),
      oldRateYear: z.number().finite().min(0).max(100),
      prepayPenaltyPct: z.number().finite().min(0).max(100),
      declaredMonthlyDebtServiceVND: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
    }).safeParse({loanAmount:numeric(req.body.loan_amount),tenureMonths:numeric(req.body.tenure_months),newRateYear:numeric(req.body.new_rate_year),oldRateYear:numeric(req.body.old_rate_year),prepayPenaltyPct:numeric(req.body.prepay_penalty_pct),declaredMonthlyDebtServiceVND:numeric(req.body.declared_monthly_debt_service)});
    if (!terms.success) return res.status(400).json({error:'Thiếu hoặc sai điều kiện vay.'});
    const {loanAmount,tenureMonths,newRateYear,oldRateYear,prepayPenaltyPct,declaredMonthlyDebtServiceVND} = terms.data;
    let suppliedEvidence: unknown;
    try { suppliedEvidence = typeof req.body.evidence === 'string' ? JSON.parse(req.body.evidence) : req.body.evidence; } catch { suppliedEvidence = null; }
    const parsedEvidence = VeriFinEvidenceEnvelopeSchema.safeParse(suppliedEvidence);
    if (!parsedEvidence.success) return res.status(422).json({error:'Thiếu hoặc sai Evidence v2.',code:'EVIDENCE_GATE_BLOCKED'});
    const evidence = runDeterministicUnderwritingEngine(parsedEvidence.data, {
      loanAmountVND:loanAmount, proposedMonthlyDebtServiceVND:loanAmount/tenureMonths + loanAmount*newRateYear/100/12,
      declaredMonthlyDebtServiceVND,ltvCapPercent:75,minimumDscr:1.25,
    });
    const gate = evaluateFailClosedGate(evidence);
    if (!gate.canExportProposal) return res.status(422).json({error:gate.reasonSummary,code:'EVIDENCE_GATE_BLOCKED',gate});
    await verifyRequestKeyLive(getRequestGeminiKey(req), GEMINI_MODEL);
    const monthlyNetIncome = evidence.derivations.monthlyAvailableCashFlowVND!.value;
    const collateralValue = evidence.derivations.totalCollateralValueVND!.value;

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
      evidence,
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
    console.error('Error in /api/bank/credit-proposal:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi lập tờ trình tín dụng & phương án vay.' });
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

    if (useSample) {
      params = getSampleIncomeAssessmentData();
    } else {
      const parsedIncomes =
        typeof req.body.incomes === 'string' ? JSON.parse(req.body.incomes) : req.body.incomes;
      params = {
        customerName: req.body.customer_name || 'Nguyễn Hoàng Nam & Lê Thị Thảo',
        borrowerAge: parseNumeric(req.body.borrower_age, 38),
        coBorrowerAge: req.body.co_borrower_age ? Number(req.body.co_borrower_age) : undefined,
        dependentsCount: parseNumeric(req.body.dependents_count, 2),
        livingCostBorrower: parseNumeric(req.body.living_cost_borrower, 12000000),
        livingCostCoBorrower: parseNumeric(req.body.living_cost_co_borrower, 10000000),
        livingCostPerDependent: parseNumeric(req.body.living_cost_per_dependent, 5000000),
        existingMonthlyDebt: parseNumeric(req.body.existing_monthly_debt, 15000000),
        newLoanTenureMonths: parseNumeric(req.body.new_loan_tenure_months, 60),
        newLoanInterestYear: parseNumeric(req.body.new_loan_interest_year, 8.5),
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
    console.error('Error in /api/bank/income-assessment:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi thẩm định nguồn thu nhập.' });
  }
});

// ==========================================
// 12. DỰ BÁO DÒNG TIỀN 12 TUẦN (VĂN PHÒNG)
// ==========================================
app.post('/api/office/cashflow-forecast', upload.none(), async (req, res) => {
  try {
    const useSample = req.body.use_sample === 'true' || req.body.use_sample === true;
    let params: any;

    if (useSample) {
      params = getSampleCashFlowData();
    } else {
      const parsedWeeks =
        typeof req.body.weekly_data === 'string'
          ? JSON.parse(req.body.weekly_data)
          : req.body.weekly_data;
      params = {
        initialCash: parseNumeric(req.body.initial_cash, 950000000),
        safetyThreshold: parseNumeric(req.body.safety_threshold, 200000000),
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
    console.error('Error in /api/office/cashflow-forecast:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi tính toán dự báo dòng tiền.' });
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

    const result = await chatMultiTurnAI(messages, role, model, getRequestGeminiKey(req));
    return res.json({
      success: true,
      reply: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (err: any) {
    console.error('Error in /api/chat/message:', redactSensitiveLog(err));
    return res.status(err.status || 500).json({ code: err.code, error: redactSensitiveLog(err) || 'Lỗi xử lý phản hồi từ Gemini Chatbot.' });
  }
});

// ==========================================
// FRONTEND STATIC / VITE INTEGRATION
// ==========================================
app.use('/api', (_req, res) => res.status(404).json({ error: 'API không tồn tại.' }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : (err.status || 500);
  res.status(status).json({ error: status === 500 ? 'Lỗi máy chủ.' : redactSensitiveLog(err) });
});

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
  console.error('Failed to start server:', redactSensitiveLog(err));
});
