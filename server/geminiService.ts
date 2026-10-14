import { resolveApiKey } from './aiCredentials';
import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import ExcelJS from 'exceljs';
import { styleHeader, collateralLtvLogic } from './excelService';
import { getSampleCollateralAssets } from './sampleData';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function getAI(): GoogleGenAI | null {
  const apiKey = resolveApiKey();
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

function parseJsonSafely(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const startBrace = cleaned.indexOf('{');
  const startBracket = cleaned.indexOf('[');
  if (startBracket !== -1 && (startBrace === -1 || startBracket < startBrace)) {
    const end = cleaned.lastIndexOf(']') + 1;
    return JSON.parse(cleaned.slice(startBracket, end));
  } else if (startBrace !== -1) {
    const end = cleaned.lastIndexOf('}') + 1;
    return JSON.parse(cleaned.slice(startBrace, end));
  }
  return JSON.parse(cleaned);
}

// ==========================================
// BÓC TÁCH ĐƠN HÀNG HOẶC CHỨNG TỪ (OCR / TEXT)
// ==========================================
export async function extractBatchAI(
  taskType: 'orders' | 'documents',
  columnsSchema: string,
  rawText: string,
  files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>
) {
  const cols = columnsSchema
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);

  let records: any[] = [];
  const ai = getAI();
  if (!ai) throw new Error('Chưa cấu hình GEMINI_API_KEY. Không thể phân tích AI.');

  if (ai) {
    try {
      const contentsParts: any[] = [];

      for (const file of files) {
        if (file.mimetype.startsWith('image/')) {
          contentsParts.push({
            inlineData: {
              mimeType: file.mimetype,
              data: file.buffer.toString('base64'),
            },
          });
        } else if (file.mimetype === 'application/pdf') {
          contentsParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: file.buffer.toString('base64'),
            },
          });
        }
      }

      let systemPrompt = '';
      if (taskType === 'orders') {
        systemPrompt = `Bạn là trợ lý AI chuyên bóc tách đơn hàng từ tin nhắn Zalo, Facebook Messenger và hình ảnh bill đặt hàng.
Các cột cần trích xuất: ${JSON.stringify(cols)}.
Nội dung văn bản bổ sung: ${rawText || 'Không có'}.
Hãy đọc toàn bộ ảnh chụp màn hình/chứng từ/tin nhắn được đính kèm và trích xuất danh sách các đơn hàng vào 1 JSON Array.
Mỗi phần tử phải có các trường khớp đúng tên các cột đã liệt kê.
CHỈ TRẢ VỀ JSON ARRAY.`;
      } else {
        systemPrompt = `Bạn là kế toán trưởng và chuyên gia OCR hóa đơn chứng từ.
Các cột cần trích xuất: ${JSON.stringify(cols)}.
Thêm 2 trường:
- "Phân_Loại_Chi_Phí": (Di chuyển, Ăn uống, Mua hàng, Văn phòng phẩm, Thiết bị, hoặc Khác)
- "Số_Hóa_Đơn_Gốc": Mã tra cứu hoặc số hóa đơn
Hãy bóc tách từng chứng từ/hóa đơn trong ảnh/tài liệu đính kèm thành 1 object.
CHỈ TRẢ VỀ JSON ARRAY.`;
      }

      contentsParts.push({ text: systemPrompt });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts: contentsParts },
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const responseText = response.text || '[]';
      const parsed = parseJsonSafely(responseText);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch (err: any) {
      console.warn('Gemini request failed.');
    }
  }

  if (!records.length) throw new Error('Không trích xuất được dữ liệu. Kiểm tra GEMINI_API_KEY và chứng từ đầu vào.');

  // Duplicate detection
  const seenKeys = new Set<string>();
  records = records.map(item => {
    const key = taskType === 'orders'
      ? `${item['Số điện thoại'] || ''}_${item['Sản phẩm'] || ''}`
      : `${item['Số_Hóa_Đơn_Gốc'] || ''}_${item['Tổng thanh toán'] || ''}`;

    let checkStatus = '✅ Hợp lệ';
    if (seenKeys.has(key) && key.trim() !== '_') {
      checkStatus = '⚠️ Trùng lặp';
    } else {
      seenKeys.add(key);
    }
    return {
      ...item,
      Trạng_Thái_Kiểm_Tra: checkStatus,
    };
  });

  // Build Excel
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Chi_Tiet_Tong_Hop');
  const headers = Object.keys(records[0] || {});
  styleHeader(ws, headers, taskType === 'orders' ? '0E7490' : '4338CA');

  records.forEach(r => {
    const row = ws.addRow(headers.map(h => r[h]));
    if (r.Trạng_Thái_Kiểm_Tra === '⚠️ Trùng lặp') {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      });
    }
  });

  ws.columns = headers.map(() => ({ width: 22 }));
  const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  return {
    rows: records,
    excelBuffer,
  };
}

// ==========================================
// 7. BÓC TÁCH CIC & BCTC SANG EXCEL THẨM ĐỊNH (NGÂN HÀNG)
// ==========================================
export async function extractCicOrBctcAI(
  docType: 'cic' | 'bctc',
  customerIncome: number = 50000000,
  files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>
) {
  const ai = getAI();
  if (!ai) throw new Error('Chưa cấu hình GEMINI_API_KEY. Không thể phân tích AI.');
  const wb = new ExcelJS.Workbook();

  if (docType === 'cic') {
    let loans: any[] = [];
    if (ai) {
      try {
        const parts: any[] = [];
        for (const file of files) {
          if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            parts.push({
              inlineData: {
                mimeType: file.mimetype,
                data: file.buffer.toString('base64'),
              },
            });
          }
        }
        parts.push({
          text: `Hãy đọc toàn bộ phiếu thông tin tín dụng CIC / báo cáo dư nợ đính kèm.
Bóc tách từng khoản vay / thẻ tín dụng tại các Tổ chức tín dụng (TCTD) thành MẢNG JSON, mỗi phần tử gồm:
{
  "Ten_TCTD": "Tên ngân hàng / công ty tài chính",
  "Loai_Vay": "Vay ngắn hạn / Trung dài hạn / Thẻ tín dụng",
  "Du_No_VND": số nguyên (quy đổi sang VNĐ),
  "Nhom_No": số nguyên từ 1 đến 5,
  "Ky_Han_Con_Lai_Thang": số tháng ước tính,
  "Lai_Suat_Nam_Uoc_Tinh": số thập phân (ví dụ 0.10 cho 10%/năm)
}
Chỉ trả về JSON Array thuần túy.`,
        });

        const resp = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: { responseMimeType: 'application/json' },
        });
        const parsed = parseJsonSafely(resp.text || '[]');
        loans = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err: any) {
        console.warn('Gemini request failed.');
      }
    }

    if (!loans.length) throw new Error('Không đọc được CIC. Không có dữ liệu để tính toán.');

    const ws = wb.addWorksheet('Tham_Dinh_CIC_DSCR');
    const headers = [
      'STT',
      'Tên TCTD',
      'Loại Cấp Tín Dụng',
      'Dư Nợ Hiện Tại (VNĐ)',
      'Nhóm Nợ',
      'Kỳ Hạn Còn Lại (Tháng)',
      'Lãi Suất Ước Tính (%/năm)',
      'Gốc Trả Hàng Tháng (Công thức)',
      'Lãi Trả Hàng Tháng (Công thức)',
      'Tổng Nghĩa Vụ/Tháng (Công thức)',
    ];
    styleHeader(ws, headers, 'B45309');

    const redFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };

    loans.forEach((item, idx) => {
      const r = idx + 2;
      const duNo = Number(item.Du_No_VND) || 0;
      const nhomNo = Number(item.Nhom_No) || 1;
      const kyHan = Math.max(Number(item.Ky_Han_Con_Lai_Thang) || 12, 1);
      const ls = Number(item.Lai_Suat_Nam_Uoc_Tinh) || 0.1;

      const gTrMonthly = Math.round(duNo / kyHan);
      const laiMonthly = Math.round((duNo * ls) / 12);
      const totalMonthly = gTrMonthly + laiMonthly;

      const row = ws.addRow([
        idx + 1,
        String(item.Ten_TCTD || ''),
        String(item.Loai_Vay || ''),
        duNo,
        nhomNo,
        kyHan,
        ls,
        { formula: `ROUND(D${r}/F${r}, 0)`, result: gTrMonthly },
        { formula: `ROUND(D${r}*G${r}/12, 0)`, result: laiMonthly },
        { formula: `H${r}+I${r}`, result: totalMonthly },
      ]);

      if (nhomNo >= 2) {
        row.eachCell(cell => {
          cell.fill = redFill;
        });
      }
    });

    const lastR = loans.length + 2;
    ws.addRow([
      '',
      'TỔNG NGHĨA VỤ HIỆN HỮU',
      '',
      { formula: `SUM(D2:D${lastR - 1})` },
      { formula: `MAX(E2:E${lastR - 1})` },
      '',
      '',
      { formula: `SUM(H2:H${lastR - 1})` },
      { formula: `SUM(I2:I${lastR - 1})` },
      { formula: `SUM(J2:J${lastR - 1})` },
    ]);
    ws.addRow(['', 'THU NHẬP KHÁCH HÀNG / THÁNG', '', customerIncome, '', '', '', '', '', '']);
    ws.addRow([
      '',
      'HỆ SỐ NỢ TRÊN THU NHẬP (DTI %)',
      '',
      { formula: `IF(D${lastR + 1}>0, ROUND(J${lastR}/D${lastR + 1}*100, 1), 0)` },
      '',
      '',
      '',
      '',
      '',
      { formula: `IF(D${lastR + 2}<=70, "ĐẠT CHUẨN (<70%)", "VƯỢT NGƯỠNG RỦI RO")` },
    ]);

    ws.columns = [
      { width: 8 },
      { width: 36 },
      { width: 26 },
      { width: 22 },
      { width: 12 },
      { width: 22 },
      { width: 24 },
      { width: 26 },
      { width: 26 },
      { width: 28 },
    ];

    const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { rows: loans, excelBuffer };
  } else {
    // BCTC mode
    let fin: any = {};
    if (ai) {
      try {
        const parts: any[] = [];
        for (const file of files) {
          if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            parts.push({
              inlineData: {
                mimeType: file.mimetype,
                data: file.buffer.toString('base64'),
              },
            });
          }
        }
        parts.push({
          text: `Đọc Báo cáo tài chính hoặc Sổ sách doanh thu hộ kinh doanh đính kèm.
Trả về ĐÚNG 1 JSON Object với các chỉ tiêu số (VNĐ):
{
  "Doanh_Thu_Thuan": số tiền,
  "Gia_Von_Hang_Ban": số tiền,
  "Chi_Phi_Hoat_Dong": số tiền,
  "Loi_Nhuan_Sau_Thue": số tiền,
  "Tai_San_Ngan_Han": số tiền,
  "Hang_Ton_Kho": số tiền,
  "Tong_Tai_San": số tiền,
  "No_Ngan_Han": số tiền,
  "Tong_No_Phai_Tra": số tiền,
  "Von_Chu_So_Huu": số tiền
}
Chỉ trả về JSON thuần túy.`,
        });

        const resp = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: { responseMimeType: 'application/json' },
        });
        fin = parseJsonSafely(resp.text || '{}');
      } catch (err: any) {
        console.warn('Gemini request failed.');
      }
    }

    if (!fin || Object.keys(fin).length === 0) throw new Error('Không đọc được BCTC. Không có dữ liệu để tính toán.');

    const ws = wb.addWorksheet('Phan_Tich_BCTC_Cong_Thuc');
    styleHeader(ws, ['Mã Chỉ Tiêu', 'Chỉ Tiêu Tài Chính / Hệ Số Thẩm Định', 'Số Liệu / Công Thức Excel', 'Đánh Giá Chuẩn Ngân Hàng'], '1E3A8A');

    const dt = Number(fin.Doanh_Thu_Thuan) || 0;
    const gv = Number(fin.Gia_Von_Hang_Ban) || 0;
    const cp = Number(fin.Chi_Phi_Hoat_Dong) || 0;
    const ln = Number(fin.Loi_Nhuan_Sau_Thue) || 0;
    const tsnh = Number(fin.Tai_San_Ngan_Han) || 0;
    const htk = Number(fin.Hang_Ton_Kho) || 0;
    const tts = Number(fin.Tong_Tai_San) || 0;
    const nnh = Number(fin.No_Ngan_Han) || 0;
    const tno = Number(fin.Tong_No_Phai_Tra) || 0;
    const vcsh = Number(fin.Von_Chu_So_Huu) || 0;

    const rowsBctc = [
      ['B2', '1. Doanh thu thuần', dt, 'Nguồn thu cốt lõi'],
      ['B3', '2. Giá vốn hàng bán', gv, ''],
      ['B4', '3. Lợi nhuận gộp (Công thức)', { formula: 'C2-C3', result: dt - gv }, 'Tự động tính'],
      ['B5', '4. Chi phí hoạt động & Lãi vay', cp, ''],
      ['B6', '5. Lợi nhuận sau thuế', ln ? ln : { formula: 'C4-C5', result: dt - gv - cp }, ''],
      ['B7', '6. Tài sản ngắn hạn', tsnh, ''],
      ['B8', '7. Hàng tồn kho', htk, ''],
      ['B9', '8. Tổng tài sản', tts, ''],
      ['B10', '9. Nợ ngắn hạn', nnh, ''],
      ['B11', '10. Tổng nợ phải trả', tno, ''],
      ['B12', '11. Vốn chủ sở hữu', vcsh, ''],
      ['R1', '👉 Biên lợi nhuận gộp (%)', { formula: 'IF(C2>0, ROUND(C4/C2*100, 2), 0)' }, 'Tỷ suất sinh lời gộp'],
      ['R2', '👉 Biên lợi nhuận ròng ROS (%)', { formula: 'IF(C2>0, ROUND(C6/C2*100, 2), 0)' }, { formula: 'IF(C14>5, "Tốt", "Mỏng")' }],
      ['R3', '👉 Hệ số thanh toán hiện hành (Current Ratio)', { formula: 'IF(C10>0, ROUND(C7/C10, 2), 0)' }, { formula: 'IF(C15>=1.2, "An toàn (>=1.2)", "Rủi ro thanh khoản")' }],
      ['R4', '👉 Hệ số thanh toán nhanh (Quick Ratio)', { formula: 'IF(C10>0, ROUND((C7-C8)/C10, 2), 0)' }, 'Khả năng trả nợ tức thời'],
      ['R5', '👉 Hệ số Nợ / Vốn chủ sở hữu (D/E)', { formula: 'IF(C12>0, ROUND(C11/C12, 2), 0)' }, { formula: 'IF(C17<=3, "Đòn bẩy hợp lý (<=3x)", "Đòn bẩy nợ cao")' }],
    ];

    rowsBctc.forEach(r => ws.addRow(r));
    ws.columns = [{ width: 14 }, { width: 44 }, { width: 30 }, { width: 30 }];

    const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { rows: [fin], excelBuffer };
  }
}

// ==========================================
// 9. BÓC TÁCH SỔ ĐỎ (GCN QSDĐ) BẰNG AI & TÍNH LTV
// ==========================================
export async function extractCollateralAI(
  files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>,
  useSample: boolean = false
) {
  if (useSample) {
    const sampleAssets = getSampleCollateralAssets();
    return collateralLtvLogic(sampleAssets);
  }

  let assets: any[] = [];
  const ai = getAI();
  if (!ai) throw new Error('Chưa cấu hình GEMINI_API_KEY. Không thể phân tích AI.');
  if (ai) {
    try {
      const contentsParts: any[] = [];
      for (const file of files) {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
          contentsParts.push({
            inlineData: {
              mimeType: file.mimetype,
              data: file.buffer.toString('base64'),
            },
          });
        }
      }

      const prompt = `Bạn là Chuyên gia Thẩm định Tài Sản Bảo Đảm và Pháp lý Bất động sản Ngân hàng.
Đọc các hình ảnh / file PDF Giấy chứng nhận quyền sử dụng đất (Sổ đỏ / Sổ hồng) đính kèm.
Bóc tách từng thửa đất / tài sản bảo đảm thành MẢNG JSON (JSON Array), mỗi phần tử gồm:
{
  "Chu_So_Huu": "Tên chủ sở hữu trên sổ",
  "Thua_To_Dia_Chi": "Số thửa, tờ bản đồ và địa chỉ thửa đất",
  "Loai_Dat": "Đất ở đô thị (ODT) / Đất ở nông thôn (ONT) / Đất trồng cây lâu năm (CLN) / Đất nuôi trồng thủy sản (NTS)",
  "Dien_Tich_m2": số thực diện tích m2,
  "Don_Gia_Dinh_Gia_VND": số nguyên ước tính đơn giá VNĐ/m2 (mặc định 15000000 cho ODT, 4000000 cho ONT, 300000 cho CLN/NTS),
  "Ty_Le_LTV": số thập phân (0.75 cho ODT, 0.70 cho ONT, 0.50 cho CLN/NTS),
  "Thoi_Han_Su_Dung": "Lâu dài hoặc ngày hết hạn",
  "Canh_Bao_Phap_Ly": "Ghi chú kiểm tra pháp lý: Hộ gia đình, đất sắp hết hạn sử dụng, thế chấp..."
}
CHỈ TRẢ VỀ JSON ARRAY.`;

      contentsParts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts: contentsParts },
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const responseText = response.text || '[]';
      const parsed = parseJsonSafely(responseText);
      assets = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e: any) {
      console.warn('Gemini request failed.');
    }
  }

  if (!assets || assets.length === 0) {
    throw new Error('Không đọc được hồ sơ tài sản. Kiểm tra API key và file đầu vào.');
  }

  return collateralLtvLogic(assets);
}

// ==========================================
// 11. MULTI-TURN CHATBOT VỚI GEMINI
// ==========================================
export async function chatMultiTurnAI(
  messages: Array<{ role: 'user' | 'model'; content: string }>,
  roleType: 'credit_expert' | 'accounting_advisor' | 'quick_assistant' = 'accounting_advisor',
  requestedModel?: string
) {
  // Model selection rules:
  // "Use gemini-4-argon for particularly complex tasks, gemini-3.8-flash for general tasks, and gemini-3.1-flash-lite for tasks that should happen fast."
  let model = requestedModel;
  if (!model) {
    if (roleType === 'credit_expert') {
      model = 'gemini-4-argon';
    } else if (roleType === 'quick_assistant') {
      model = 'gemini-3.1-flash-lite';
    } else {
      model = 'gemini-3.8-flash';
    }
  }

  let systemInstruction = '';
  if (roleType === 'credit_expert') {
    systemInstruction = `Bạn là Chuyên gia Cấp cao về Thẩm định Tín dụng & Quản trị Rủi ro Ngân hàng (Senior Banking Credit & Risk Expert) của VeriFin Pro.
Bạn có chuyên môn sâu sắc về:
- Quy định Ngân hàng Nhà nước (Thông tư 11/2021/TT-NHNN phân loại nợ nhóm 1 đến 5, Thông tư 39/2016/TT-NHNN, Thông tư 02/2023/TT-NHNN cơ cấu nợ).
- Báo cáo tín dụng CIC (chấm điểm tín dụng, lịch sử nợ cần chú ý, nợ xấu, dư nợ các TCTD).
- Đánh giá khả năng trả nợ, dòng tiền, chỉ số DTI, LTV tài sản bảo đảm, hệ số bao phủ nợ DSCR.
- Thẩm định phương án vay, tái tài trợ vốn (Refinance) và lập tờ trình tín dụng ngân hàng.
Hãy trả lời chuyên sâu, có cấu trúc chặt chẽ, viện dẫn công thức định lượng và chuẩn mực ngân hàng.`;
  } else if (roleType === 'accounting_advisor') {
    systemInstruction = `Bạn là Cố vấn Trưởng Kế toán Doanh nghiệp & Quản lý Công nợ (Chief Corporate Accounting Advisor) của VeriFin Pro.
Bạn hỗ trợ:
- Quản trị sổ công nợ, đối chiếu công nợ khách hàng & nhà cung cấp, tính tuổi nợ.
- Hóa đơn điện tử theo Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC.
- Tính lương, BHXH (8% BHXH, 1.5% BHYT, 1% BHTN) và biểu thuế lũy tiến TNCN.
- Quản trị dòng tiền 12 tuần và ghép nối dữ liệu báo cáo tài chính kế toán.
Trả lời thực tế, dễ áp dụng vào công việc doanh nghiệp, hỗ trợ cú pháp Excel và biểu mẫu chuẩn.`;
  } else {
    systemInstruction = `Bạn là Trợ lý Tra cứu Nhanh & Giải đáp Nghiệp vụ (Instant Banking & Finance Lookup) của VeriFin Pro.
Nhiệm vụ của bạn là phản hồi tức thì, ngắn gọn, chính xác về:
- Tra cứu mã BIN và tên ngân hàng tại Việt Nam (VietinBank 970415, Vietcombank 970436, MB 970422, Techcombank 970407, BIDV 970418...).
- Cú pháp mã VietQR Napas 24/7.
- Cú pháp hàm Excel tài chính thông dụng (PMT, PPMT, IPMT, VLOOKUP, INDEX/MATCH, SUMIFS).
- Giải thích thuật ngữ tài chính ngân hàng tức thì.`;
  }

  const ai = getAI();
  if (!ai) throw new Error('Chưa cấu hình GEMINI_API_KEY. Không thể phân tích AI.');
  if (!ai) {
    return {
      text: `[Chế độ giải đáp nghiệp vụ mẫu]: Hệ thống đang chạy ở chế độ dự phòng do chưa phát hiện GEMINI_API_KEY trong môi trường. Về câu hỏi của bạn: Đối với nghiệp vụ ${roleType === 'credit_expert' ? 'thẩm định tín dụng và CIC' : 'kế toán công nợ'}, bạn hãy luôn kiểm tra chéo các chứng từ gốc và đối soát định kỳ. Để kích hoạt trí tuệ nhân tạo Gemini toàn diện, vui lòng cấu hình GEMINI_API_KEY trong bảng Secrets của AI Studio.`,
      modelUsed: model,
    };
  }

  const contents = messages.map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });
    return {
      text: response.text || 'Không có phản hồi từ mô hình.',
      modelUsed: model,
    };
  } catch (err: any) {
    console.warn('Gemini request failed.');
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });
      return {
        text: fallbackResponse.text || 'Không có phản hồi từ mô hình.',
        modelUsed: 'gemini-2.5-flash (dự phòng)',
      };
    } catch (e: any) {
      return {
        text: 'Không kết nối được Gemini. Kiểm tra API key cá nhân, hạn mức và model.',
        modelUsed: model,
      };
    }
  }
}

