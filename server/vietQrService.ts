import QRCode from 'qrcode';

/**
 * Standard Napas 24/7 VietQR (EMVCo QRCPS Merchant Presented Mode)
 * Compliant with State Bank of Vietnam & Napas QR specifications.
 */

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

export function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQrOptions {
  bankBin: string; // e.g. 970415 (VietinBank), 970436 (Vietcombank), 970422 (MBBank)
  accountNo: string;
  amount?: number;
  message?: string;
  accountName?: string;
}

export function buildVietQrPayload(options: VietQrOptions): string {
  const bin = (options.bankBin || '').trim();
  if (!/^\d{6}$/.test(bin)) throw new Error('BIN ngân hàng phải gồm 6 chữ số.');
  const accountNo = (options.accountNo || '').trim();
  if (!/^[A-Za-z0-9]{1,34}$/.test(accountNo)) throw new Error('Số tài khoản không hợp lệ.');
  if (options.amount !== undefined && (!Number.isFinite(options.amount) || options.amount < 0)) throw new Error('Số tiền không hợp lệ.');
  const amount = options.amount && options.amount > 0 ? Math.round(options.amount) : 0;
  const rawMsg = (options.message || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7E]/g, '').slice(0, 50);

  // Merchant Account Information: Tag 38
  // Sub-tag 00: GUID "A000000727"
  // Sub-tag 01: Beneficiary info -> Sub-tag 00: Acquirer BIN (6 digits), Sub-tag 01: Account number
  // Sub-tag 02: Service code -> "QRIBFTTA" (Chuyển nhanh Napas 24/7 đến số tài khoản)
  const bankSub = tlv('00', bin) + tlv('01', accountNo);
  const tag38 = tlv('00', 'A000000727') + tlv('01', bankSub) + tlv('02', 'QRIBFTTA');

  // Payload format indicator: Tag 00
  let payload = tlv('00', '01');
  // Point of Initiation: 12 (Dynamic with amount) or 11 (Static)
  payload += tlv('01', amount > 0 ? '12' : '11');
  // Tag 38
  payload += tlv('38', tag38);
  // Transaction Currency: 704 (VND)
  payload += tlv('53', '704');
  if (amount > 0) {
    payload += tlv('54', String(amount));
  }
  // Country Code: VN
  payload += tlv('58', 'VN');

  // Additional Data: Tag 62, Sub-tag 08: Bill Number / Purpose of transaction
  if (rawMsg) {
    payload += tlv('62', tlv('08', rawMsg));
  }

  // Tag 63: CRC with 4 hex digits
  payload += '6304';
  const checksum = crc16Ccitt(payload);
  return payload + checksum;
}

export async function generateVietQrDataUrl(options: VietQrOptions): Promise<string> {
  const payload = buildVietQrPayload(options);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
