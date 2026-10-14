import React, { useState } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  Layers,
  Search,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  Download,
  ArrowRight,
  Building2,
  Landmark,
  ShieldCheck,
  Cpu,
  FileText,
  Receipt,
  MessageSquareText,
  ShieldAlert,
  TrendingUp,
  BellRing,
  Home,
  FileSignature,
  Calculator,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { BusinessBranch, TabKey } from './App';

interface UserGuideProps {
  onNavigate: (tab: TabKey) => void;
  currentBranch: BusinessBranch;
}

export function UserGuideModule({ onNavigate, currentBranch }: UserGuideProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'arch' | 'office' | 'banking' | 'faq'>('all');
  const [expandedModule, setExpandedModule] = useState<string | null>('mod-1');

  const modulesList = [
    // NHÓM VĂN PHÒNG
    {
      id: 'mod-1',
      tabKey: 'debt' as TabKey,
      category: 'office',
      num: 1,
      title: 'Quản Lý Công Nợ & Email Nhắc Nợ Tự Động',
      icon: FileSpreadsheet,
      badge: 'Văn Phòng',
      badgeColor: 'emerald',
      summary: 'Đối chiếu tự động giữa Sổ công nợ và Sao kê ngân hàng, tính tuổi nợ, xuất PDF thông báo nợ font Unicode hệ thống (Arial/Tahoma) chuẩn tiếng Việt có dấu, nhúng mã VietQR trích xuất tự động từ mục cấu hình riêng, biên bản đối chiếu Word và email nhắc nợ.',
      inputFormats: 'File Excel (.xlsx, .xls) hoặc CSV: Sổ công nợ + Sao kê tài khoản ngân hàng (tùy chọn).',
      steps: [
        'Bước 1: Cấu hình thông tin tài khoản thụ hưởng tại mục "💳 Tài Khoản & VietQR" (hoặc dùng mặc định).',
        'Bước 2: Nạp file Sổ Công Nợ (chứa các cột Mã KH, Tên KH, Phải thu, Hạn thanh toán, Email). Hoặc bấm "⚡ Nạp dữ liệu mẫu thử ngay".',
        'Bước 3: (Khuyến nghị) Nạp thêm file Sao Kê Ngân Hàng để hệ thống tự động quét nội dung chuyển khoản, cấn trừ số tiền khách đã trả.',
        'Bước 4: Bấm "🚀 Phân Tích Công Nợ & Lập Báo Cáo". Hệ thống sẽ tính số dư còn nợ bằng công thức sống (D-E), phân loại quá hạn và tô màu cảnh báo.',
        'Bước 5: Bấm "In PDF" để xuất Phiếu Thông Báo Nợ font Unicode Arial/Tahoma chuẩn tiếng Việt có dấu nhúng sẵn mã VietQR 24/7; hoặc bấm "VietQR" để xem trước mã QR chuyển khoản.',
        'Bước 6: Bấm "Bản Word" để xuất Biên bản đối chiếu công nợ chuẩn hoặc bấm "Copy Email" / "Gửi Mail" để gửi thư nhắc nợ.',
      ],
      outputs: [
        'File Excel "Bao_Cao_Tuoi_No_AI.xlsx" với công thức sống D-E và hàm IF kiểm tra quá hạn.',
        'File PDF "Thong_Bao_No_[MaKH].pdf" nạp font Unicode hệ thống (Arial/Tahoma), tiếng Việt sắc nét không vỡ chữ kèm mã VietQR chuẩn NAPAS.',
        'Mã VietQR động tự động trích xuất STK, tên chủ tài khoản và số tiền nợ chính xác.',
        'File Word "Bien_Ban_Doi_Chieu_Cong_No_[MaKH].docx" theo chuẩn Bộ Tài chính.',
        'Nội dung Email cá nhân hóa từng khách hàng kèm số tiền nợ và hạn thanh toán.',
      ],
      proTip: 'Hệ thống tự động đồng bộ tài khoản nhận tiền từ Mục Cấu Hình Riêng sang Module Công Nợ. Khi in PDF, mã VietQR sẽ chứa chính xác số tiền nợ và cú pháp chuyển khoản tương ứng!',
    },
    {
      id: 'mod-2',
      tabKey: 'reconcile' as TabKey,
      category: 'office',
      num: 2,
      title: 'Ghép & Đối Chiếu 2 File Excel (Reconciliation)',
      icon: CheckCircle2,
      badge: 'Văn Phòng',
      badgeColor: 'cyan',
      summary: 'So khớp 2 nguồn dữ liệu (ví dụ: File Bán Hàng vs File Kế Toán Kho), phát hiện sai lệch số tiền, đơn thừa hoặc đơn thiếu.',
      inputFormats: 'Hai file Excel (.xlsx, .xls) hoặc CSV bất kỳ có chung một trường định danh (Mã đơn hàng, Mã phiếu, SĐT, v.v.).',
      steps: [
        'Bước 1: Nạp File A (Ví dụ: File Bán Hàng Nội Bộ) và File B (Ví dụ: File Kế Toán Kho).',
        'Bước 2: Hệ thống tự động đọc trước 5 dòng đầu của mỗi file và gợi ý các cột tương ứng.',
        'Bước 3: Chọn Cột Khóa chính để liên kết (Key Column) và Cột Số tiền cần so khớp từ mỗi file.',
        'Bước 4: Bấm "Thực Hiện Đối Chiếu". Hệ thống chạy thuật toán Inner/Full-Outer Join và phân loại 4 trạng thái.',
        'Bước 5: Tải file Excel kết quả "Ket_Qua_Doi_Chieu_Chi_Tiet.xlsx" được tô màu phân biệt: Xanh lá (Khớp), Đỏ (Lệch tiền), Vàng (Chỉ có ở File A hoặc B).',
      ],
      outputs: [
        'File Excel "Ket_Qua_Doi_Chieu_Chi_Tiet.xlsx" hợp nhất 2 nguồn dữ liệu.',
        'Bảng thống kê tỷ lệ khớp, tổng chênh lệch tiền mặt và danh sách các đơn hàng có nghi vấn.',
      ],
      proTip: 'Dùng tính năng này để đối soát đơn hàng giao vận (COD) giữa báo cáo của công ty vận chuyển (GHTK, GHN, Viettel Post) với phần mềm bán hàng!',
    },
    {
      id: 'mod-3',
      tabKey: 'payslip' as TabKey,
      category: 'office',
      num: 3,
      title: 'Tạo Phiếu Lương Hàng Loạt & Template Doanh Nghiệp',
      icon: FileText,
      badge: 'Văn Phòng',
      badgeColor: 'teal',
      summary: 'Biến 1 bảng lương tổng hợp thành hàng trăm phiếu lương Excel cá nhân hóa theo đúng mẫu biểu công ty và đóng gói thành file ZIP.',
      inputFormats: 'Bảng lương tổng hợp Excel (.xlsx) + File Mẫu phiếu lương Excel (.xlsx) của công ty (nếu có).',
      steps: [
        'Bước 1: Nạp Bảng Lương Tổng Hợp (chứa các cột Mã NV, Họ tên, Chức vụ, Lương cơ bản, Thưởng, BHXH, Thực lĩnh...).',
        'Bước 2: (Tùy chọn) Nạp File Mẫu Phiếu Lương Excel của công ty có chứa các thẻ {{Tên_Cột}} như {{Họ và Tên}}, {{Thực lĩnh}}. Hoặc hệ thống sẽ dùng Mẫu Chuẩn Doanh Nghiệp có sẵn.',
        'Bước 3: Hệ thống tự động quét và phân tích các thẻ placeholder trong mẫu để báo trạng thái khớp cột 100%.',
        'Bước 4: Bấm "Tạo Phiếu Lương Hàng Loạt". Hệ thống sinh từng phiếu lương riêng biệt với logo, kẻ khung và công thức đầy đủ.',
        'Bước 5: Tải file ZIP "Phieu_Luong_Hang_Loat.zip" giải nén ra từng file Excel của từng nhân viên hoặc xem trước trực quan.',
      ],
      outputs: [
        'File ZIP chứa toàn bộ phiếu lương Excel cá nhân hóa cho từng nhân viên.',
        'Mỗi phiếu lương được định dạng in chuẩn trang A4 portrait, bảo mật thu nhập nhân sự.',
        'Hỗ trợ tải File Mẫu Phiếu Lương Doanh Nghiệp chuẩn (.xlsx) để chỉnh sửa theo thương hiệu riêng.',
      ],
      proTip: 'Bạn có thể tải file "Mẫu Lương DN" từ thanh Sidebar, thay logo và địa chỉ công ty mình rồi nạp vào, hệ thống sẽ giữ nguyên 100% định dạng thiết kế đó!',
    },
    {
      id: 'mod-4',
      tabKey: 'orders' as TabKey,
      category: 'office',
      num: 4,
      title: 'Bóc Tách Đơn Hàng Từ Tin Nhắn Zalo / Chat / OCR',
      icon: MessageSquareText,
      badge: 'Văn Phòng',
      badgeColor: 'sky',
      summary: 'Sử dụng Gemini Multimodal AI để đọc ảnh chụp tin nhắn chốt đơn Zalo, Messenger hoặc văn bản không cấu trúc sang bảng Excel chuẩn hóa.',
      inputFormats: 'Hình ảnh (.png, .jpg, .webp), file PDF hoặc văn bản chat dán trực tiếp.',
      steps: [
        'Bước 1: Tải lên một hoặc nhiều ảnh chụp màn hình tin nhắn khách đặt hàng trên Zalo, Facebook hoặc dán đoạn chat văn bản thô.',
        'Bước 2: Tùy chỉnh danh sách các cột cần bóc tách (Mặc định: Mã_Đơn, Tên_Khách_Hang, SĐT, Địa_Chỉ, Sản_Phẩm, Số_Lượng, Đơn_Giá, Tổng_Tiền).',
        'Bước 3: Bấm "Bóc Tách Đơn Hàng Bằng AI". Mô hình Gemini Vision phân tích ngữ nghĩa tiếng Việt, bóc tách chính xác từng mặt hàng.',
        'Bước 4: Xem bảng dữ liệu đã cấu trúc hóa trên màn hình, kiểm tra trạng thái phát hiện đơn trùng lặp.',
        'Bước 5: Bấm "Tải File Excel Bóc Tách" để nạp vào phần mềm quản lý kho hoặc CRM.',
      ],
      outputs: [
        'Bảng dữ liệu đơn hàng sạch, chuẩn hóa số điện thoại và địa chỉ giao hàng.',
        'File Excel bóc tách có highlight cảnh báo đơn trùng lặp tự động.',
      ],
      proTip: 'Có thể chọn cùng lúc 10-20 ảnh chụp màn hình Zalo, AI sẽ tự động gộp tất cả thành 1 bảng kê duy nhất!',
    },
    {
      id: 'mod-5',
      tabKey: 'documents' as TabKey,
      category: 'office',
      num: 5,
      title: 'Đọc Chứng Từ Hàng Loạt (Hóa Đơn, Phiếu Thu Chi, Vé Xe)',
      icon: Receipt,
      badge: 'Văn Phòng',
      badgeColor: 'indigo',
      summary: 'OCR nhận diện hàng loạt hóa đơn GTGT điện tử, vé cầu đường, biên lai taxi, tự động phân loại chi phí và cảnh báo trùng lặp.',
      inputFormats: 'Ảnh chụp hóa đơn (.jpg, .png), file scan PDF của hóa đơn điện tử.',
      steps: [
        'Bước 1: Tải lên các file ảnh/PDF hóa đơn chứng từ chi phí cần thanh toán hoặc quyết toán công tác.',
        'Bước 2: Chọn các trường cần trích xuất (Số hóa đơn, Ngày lập, Đơn vị bán, MST, Nội dung chi, Tiền trước thuế, Thuế GTGT, Tổng thanh toán).',
        'Bước 3: Bấm "Trích Xuất Chứng Từ Bằng AI". Hệ thống OCR bóc tách và tự động gán nhãn phân loại chi phí (Di chuyển, Tiếp khách, Mua sắm vật tư...).',
        'Bước 4: Kiểm tra cột "Trạng Thái Kiểm Tra" xem có hóa đơn nào bị nhân viên nộp trùng số hóa đơn hoặc mã tra cứu không.',
        'Bước 5: Tải bảng kê chi phí Excel tổng hợp nộp cho Kế toán trưởng duyệt chi.',
      ],
      outputs: [
        'Bảng tổng hợp chi phí đầy đủ số hóa đơn, MST, ngày tháng và tiền thuế.',
        'Tự động phân loại tài khoản chi phí phục vụ hạch toán kế toán nhanh chóng.',
      ],
      proTip: 'Tính năng phát hiện trùng số hóa đơn giúp doanh nghiệp phòng ngừa rủi ro nhân viên thanh toán trùng hóa đơn hoặc claim tiền 2 lần!',
    },
    {
      id: 'mod-6',
      tabKey: 'cashflow' as TabKey,
      category: 'office',
      num: 6,
      title: 'Dự Báo Dòng Tiền 12 Tuần & Quản Trị Vốn Lưu Động',
      icon: TrendingUp,
      badge: 'Văn Phòng (Mới)',
      badgeColor: 'emerald',
      summary: 'Lập kế hoạch thu chi 12 tuần tới, phân tích điểm rơi dòng tiền, cảnh báo tuần thâm hụt và tính toán số tuần duy trì (Runway).',
      inputFormats: 'Nhập trực tiếp số dư tiền mặt và kế hoạch thu chi theo tuần hoặc nạp file mẫu Excel.',
      steps: [
        'Bước 1: Nhập "Số dư tiền mặt & tiền gửi đầu kỳ" và "Ngưỡng tiền mặt tối thiểu an toàn" (ví dụ 200 triệu đ).',
        'Bước 2: Điền dự báo các khoản Thu (Thu hồi công nợ, Doanh số bán lẻ tiền mặt, Thu khác) cho từng tuần từ Tuần 1 đến Tuần 12.',
        'Bước 3: Điền dự kiến các khoản Chi (Nhập hàng nguyên liệu, Quỹ lương nhân sự, Tiền thuê văn phòng & vận hành, Lãi vay ngân hàng, Thuế).',
        'Bước 4: Hệ thống tự động tính Dòng tiền ròng (Net cash flow) và Số dư cuối mỗi tuần bằng công thức Excel sống.',
        'Bước 5: Quan sát biểu đồ ComposedChart trực quan, nhận diện tuần thâm hụt tiền mặt và tải file Excel 12 tuần.',
      ],
      outputs: [
        'Chỉ số Cash Runway (Số tuần quỹ tiền mặt duy trì được khi không có doanh thu mới).',
        'Xác định chính xác Tuần có số dư tiền mặt thấp nhất (Cash bottom).',
        'File Excel "Ke_Hoach_Du_Bao_Dong_Tien_12_Tuan.xlsx" đầy đủ công thức liên kết giữa các tuần.',
      ],
      proTip: 'Khi phát hiện tuần thâm hụt, CFO hoặc Kế toán trưởng có thể chủ động đẩy sớm lịch thu nợ ở Module 1 hoặc đàm phán giãn nợ nhà cung cấp!',
    },

    // NHÓM NGÂN HÀNG
    {
      id: 'mod-7',
      tabKey: 'statement' as TabKey,
      category: 'banking',
      num: 7,
      title: 'Thẩm Định Sao Kê & Quét Cờ Đỏ (Red Flags)',
      icon: ShieldAlert,
      badge: 'Ngân Hàng',
      badgeColor: 'amber',
      summary: 'Rà soát toàn bộ lịch sử giao dịch sao kê ngân hàng của khách hàng vay, phát hiện rủi ro cờ bạc, tiền ảo, cầm đồ, vay app tín dụng đen.',
      inputFormats: 'File Excel sao kê ngân hàng (.xlsx, .csv) hoặc bấm "Dùng Dữ Liệu Mẫu".',
      steps: [
        'Bước 1: Nạp file Sao Kê Tài Khoản Ngân Hàng của khách hàng vay (có cột Ngày GD, Diễn giải nội dung, Số tiền ghi có, Số tiền ghi nợ).',
        'Bước 2: Thiết lập ngưỡng dòng tiền lớn và thu nhập khai báo hàng tháng.',
        'Bước 3: Bấm "Phân Tích Sao Kê & Quét Red Flags". Hệ thống đối chiếu hàng trăm từ khóa rủi ro ngân hàng.',
        'Bước 4: Xem ma trận phát hiện: Giao dịch Crypto/USDT/Binance, Cờ bạc/Game bài online, Thanh toán cầm đồ, App vay nóng tín chấp (FE Credit, Home Credit, Mirae Asset...).',
        'Bước 5: Lọc bỏ dòng tiền ảo (chuyển tiền nội bộ, nộp rút tiền mặt lòng vòng) để xác định Doanh thu kinh doanh thực tế.',
      ],
      outputs: [
        'Báo cáo Red Flags chi tiết từng giao dịch đáng ngờ, mức độ rủi ro (Nghiêm trọng / Trung bình / Nhẹ).',
        'Đánh giá hệ số DTI sơ bộ dựa trên dòng tiền thu thực tế trừ nghĩa vụ trả nợ.',
        'File Excel Thẩm định sao kê kèm phân loại giao dịch tự động.',
      ],
      proTip: 'Cán bộ tín dụng có thể dùng danh sách Red Flags phát hiện được để yêu cầu khách hàng giải trình trước khi trình Hội đồng tín dụng!',
    },
    {
      id: 'mod-8',
      tabKey: 'cic' as TabKey,
      category: 'banking',
      num: 8,
      title: 'Bóc Tách CIC (5 Nhóm Nợ) & BCTC Doanh Nghiệp',
      icon: Calculator,
      badge: 'Ngân Hàng',
      badgeColor: 'amber',
      summary: 'Trích xuất báo cáo CIC Trung tâm Thông tin Tín dụng Quốc gia sang bảng tính nghĩa vụ nợ, hoặc thẩm định Báo cáo tài chính doanh nghiệp.',
      inputFormats: 'File scan PDF, ảnh chụp phiếu thông tin tín dụng CIC, hoặc BCTC theo Thông tư 200/133.',
      steps: [
        'Bước 1: Chọn chế độ xử lý: "Bóc tách Báo Cáo CIC Khách Hàng" hoặc "Bóc tách Báo Cáo Tài Chính (BCTC)".',
        'Bước 2: Tải lên các file ảnh hoặc PDF báo cáo CIC / BCTC.',
        'Bước 3: Nhập thu nhập ròng hàng tháng của khách hàng để tính hệ số DTI (Debt-to-Income).',
        'Bước 4: Bấm "Bóc Tách Bằng AI". Hệ thống tự động phân loại dư nợ tại từng TCTD, kỳ hạn còn lại, nhóm nợ từ 1 đến 5 và tính nghĩa vụ gốc lãi/tháng.',
        'Bước 5: Tải file Excel thẩm định với công thức tính DTI tự động và cảnh báo rủi ro nếu nợ nhóm 2 trở lên.',
      ],
      outputs: [
        'Bảng kê chi tiết dư nợ tại từng ngân hàng thương mại và công ty tài chính.',
        'Tính toán công thức sống số tiền gốc và lãi phải trả từng tháng.',
        'Hệ số DTI chuẩn hóa: Đạt chuẩn (DTI <= 70%) hoặc Vượt ngưỡng rủi ro (> 70%).',
        'Phân tích chỉ số tài chính BCTC: Tỷ số thanh toán hiện hành, Đòn bẩy nợ/Vốn chủ, Vòng quay hàng tồn kho.',
      ],
      proTip: 'Bảng tính tự động highlight màu đỏ các khoản nợ nhóm 2 (Cần chú ý) hoặc nhóm 3-5 (Nợ xấu NPL) theo quy định của Ngân hàng Nhà nước!',
    },
    {
      id: 'mod-9',
      tabKey: 'portfolio' as TabKey,
      category: 'banking',
      num: 9,
      title: 'Chăm Sóc Danh Mục Tín Dụng & Đáo Hạn Sổ Tiết Kiệm',
      icon: BellRing,
      badge: 'Ngân Hàng',
      badgeColor: 'amber',
      summary: 'Quản trị danh mục khách hàng vay & tiết kiệm của Chi nhánh, cảnh báo ngày đến hạn và tạo kịch bản tin nhắn Zalo/SMS cá nhân hóa.',
      inputFormats: 'File Excel danh mục khách hàng (.xlsx) gồm Tên KH, SĐT, Sản phẩm, Số tiền, Ngày đáo hạn.',
      steps: [
        'Bước 1: Nạp file Danh mục khách hàng quản lý hoặc bấm "Dùng Dữ Liệu Mẫu".',
        'Bước 2: Bấm "Kiểm Tra Danh Mục & Tạo Lịch Chăm Sóc".',
        'Bước 3: Hệ thống tự động so khớp với ngày hiện tại và phân loại thành 4 cấp độ: Đã quá hạn (Đỏ), Khẩn cấp đến hạn trong 1-3 ngày (Cam), Lưu ý trong 4-7 ngày (Vàng), An toàn > 7 ngày (Xanh).',
        'Bước 4: Chọn xem kịch bản tin nhắn riêng biệt cho Khách Vay (nhắc nợ kèm STK trả nợ) hoặc Khách Tiết Kiệm (mời tái tục hưởng lãi suất ưu đãi).',
        'Bước 5: Bấm "Copy Zalo" để gửi nhanh cho khách hàng qua ứng dụng Zalo trên máy tính hoặc điện thoại.',
      ],
      outputs: [
        'Bảng theo dõi hạn trả nợ và hạn tất toán STK trực quan.',
        'Kịch bản tin nhắn Zalo/SMS chuẩn phong cách ngân hàng chuyên nghiệp và lịch sự.',
        'File Excel quản lý danh mục phân loại theo mức độ ưu tiên.',
      ],
      proTip: 'Chuyên viên QHKH có thể copy nhanh nội dung tin nhắn đã được điền sẵn tên khách hàng, số tiền và số ngày còn lại chỉ với 1 cú click!',
    },
    {
      id: 'mod-10',
      tabKey: 'collateral' as TabKey,
      category: 'banking',
      num: 10,
      title: 'Bóc Tách Sổ Đỏ (GCN QSDĐ) & Định Giá LTV Bằng AI',
      icon: Home,
      badge: 'Ngân Hàng',
      badgeColor: 'emerald',
      summary: 'OCR đọc Giấy chứng nhận quyền sử dụng đất, phân loại loại đất (ODT, ONT, CLN, NTS), tính room vay tối đa theo LTV và rà soát pháp lý.',
      inputFormats: 'File scan hoặc ảnh chụp các trang Sổ Đỏ / Sổ Hồng (.jpg, .png, .pdf).',
      steps: [
        'Bước 1: Tải lên ảnh chụp hoặc PDF các trang của Giấy chứng nhận quyền sử dụng đất.',
        'Bước 2: Bấm "Bóc Tách Sổ Đỏ Bằng AI". Gemini Vision đọc thông tin chủ sở hữu, địa chỉ thửa đất, số tờ, diện tích và mục đích sử dụng.',
        'Bước 3: Hệ thống tự động áp tỷ lệ LTV chuẩn ngân hàng: 75% cho Đất ở đô thị (ODT), 70% cho Đất ở nông thôn (ONT), 50% cho Đất nông nghiệp/thủy sản (CLN, NTS).',
        'Bước 4: Kiểm tra cột "Cảnh Báo Pháp Lý" xem có rủi ro: Đất cấp cho Hộ gia đình (cần chữ ký mọi thành viên), Đất nông nghiệp sắp hết hạn sử dụng (< 2 năm)...',
        'Bước 5: Tải file Excel Bảng định giá TSBĐ & Hạn mức cấp tín dụng tối đa.',
      ],
      outputs: [
        'Tổng giá trị định giá sơ bộ tài sản bảo đảm (VNĐ).',
        'Hạn mức cho vay tối đa có thể cấp (Room tín dụng theo LTV).',
        'File Excel "Bang_Dinh_Gia_TSBD_LTV.xlsx" với công thức sống tính diện tích x đơn giá.',
      ],
      proTip: 'AI có khả năng nhận diện chính xác nguồn gốc sử dụng đất và thời hạn sử dụng để cảnh báo ngay cho cán bộ thẩm định pháp lý!',
    },
    {
      id: 'mod-11',
      tabKey: 'proposal' as TabKey,
      category: 'banking',
      num: 11,
      title: 'Lập Tờ Trình Vay & Phương Án Refinance (Mua Nợ)',
      icon: FileSignature,
      badge: 'Ngân Hàng',
      badgeColor: 'emerald',
      summary: 'So sánh hiệu quả tài chính khi khách hàng chuyển khoản vay từ ngân hàng cũ sang ngân hàng mới, xuất file Word Tờ trình và Excel lịch trả nợ.',
      inputFormats: 'Nhập các thông số phương án vay hoặc nạp file mẫu Tờ trình Word (.docx) của ngân hàng.',
      steps: [
        'Bước 1: Nhập Tên khách hàng, Mục đích vay, Số tiền vay, Thời hạn vay (tháng).',
        'Bước 2: Nhập Lãi suất đề xuất tại ngân hàng mới (%/năm), Lãi suất tại ngân hàng cũ đang chịu, và Tỷ lệ phí phạt trả trước hạn.',
        'Bước 3: Nhập Thu nhập ròng hàng tháng và Giá trị định giá tài sản bảo đảm.',
        'Bước 4: (Tùy chọn) Nạp Mẫu Tờ Trình Word (.docx) của chi nhánh có chứa các thẻ {{Khach_Hang}}, {{So_Tien_Vay}}... Hoặc dùng mẫu chuẩn có sẵn.',
        'Bước 5: Bấm "Tính Toán Phương Án & Xuất Báo Cáo". Hệ thống tính toán Tiết kiệm ròng khi chuyển nợ, hệ số DSCR, tỷ lệ LTV.',
        'Bước 6: Tải file Word Tờ Trình Thẩm Định (.docx) hoàn chỉnh và file Excel Lịch Trả Nợ Chi Tiết gồm 2 Sheet sống động.',
      ],
      outputs: [
        'File Word "To_Trinh_Tham_Dinh_Tin_Dung.docx" điền tự động toàn bộ số liệu và kết luận phê duyệt.',
        'File Excel 2 Sheet: Sheet 1 (Thẩm định so sánh mua nợ) + Sheet 2 (Lịch khấu hao gốc lãi từng tháng bằng công thức).',
        'Số tiền khách hàng tiết kiệm ròng thực tế sau khi đã trừ phí phạt tất toán trước hạn.',
      ],
      proTip: 'Tờ trình Word và bảng Excel lịch trả nợ là vũ khí chốt khách hàng chuyển nợ từ ngân hàng đối thủ sang ngân hàng bạn cực kỳ thuyết phục!',
    },
    {
      id: 'mod-12',
      tabKey: 'income' as TabKey,
      category: 'banking',
      num: 12,
      title: 'Thẩm Định Nguồn Thu Nhập Đa Nguồn & NDI Thực Tế',
      icon: Calculator,
      badge: 'Ngân Hàng (Mới)',
      badgeColor: 'amber',
      summary: 'Đánh giá đa nguồn thu (lương sao kê, tiền mặt, cho thuê nhà, hộ kinh doanh), áp dụng haircut rủi ro, trừ chi phí sinh hoạt để tính Room vay tối đa.',
      inputFormats: 'Nhập trực tiếp các nguồn thu và chi phí định mức gia đình hoặc nạp file mẫu Excel.',
      steps: [
        'Bước 1: Nhập thông tin Khách hàng, Độ tuổi người vay, Số người phụ thuộc và Nghĩa vụ nợ hiện tại theo CIC.',
        'Bước 2: Thêm các nguồn thu nhập của khách hàng: Lương chuyển khoản (Haircut 100%), Lương tiền mặt (Haircut 75%), Cho thuê BĐS (Haircut 85%), Hộ KD (Haircut 60%).',
        'Bước 3: Thiết lập chi phí sinh hoạt định mức gia đình (Người vay: 12tr, Vợ/Chồng: 10tr, Con nhỏ: 5tr/cháu).',
        'Bước 4: Bấm "Tính Toán Năng Lực Trả Nợ & Xuất Excel".',
        'Bước 5: Hệ thống tính Thu nhập ròng khả dụng (NDI) và Hạn mức vay tối đa có thể cấp theo các kỳ hạn 3 năm, 5 năm, 10 năm, 20 năm.',
      ],
      outputs: [
        'Chỉ số NDI (Net Disposable Income) thực tế dùng để trả nợ mới.',
        'Hạn mức trả góp tối đa an toàn hàng tháng (80% NDI).',
        'Bảng ước tính Hạn mức vay tối đa theo 4 mốc kỳ hạn phổ biến.',
        'File Excel "Bang_Tham_Dinh_Nguon_Thu_Nhap.xlsx" 2 sheet với công thức sống.',
      ],
      proTip: 'Tỷ lệ Haircut giúp nhân viên tín dụng bảo vệ phương án vay trước Ban Quản lý rủi ro và Kiểm toán nội bộ ngân hàng!',
    },
  ];

  const filteredModules = modulesList.filter((m) => {
    const matchCat =
      selectedCategory === 'all'
        ? true
        : selectedCategory === 'arch'
        ? false
        : selectedCategory === 'faq'
        ? false
        : m.category === selectedCategory;
    const matchQuery =
      searchQuery.trim() === ''
        ? true
        : m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.proTip.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto pb-16">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs border border-indigo-500/30 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Cẩm Nang Vận Hành Toàn Diện
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium text-xs">
                12 Modules Chuyên Sâu
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Hướng Dẫn Sử Dụng & Kiến Trúc Hệ Thống
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Tài liệu hướng dẫn chi tiết từng tính năng, quy trình xử lý dữ liệu tự động, các cấu phần công nghệ và cách vận hành tối ưu cho cả 2 phân hệ <strong>Văn Phòng Pro</strong> và <strong>Ngân Hàng Pro</strong>.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
            >
              <span>Vào Dashboard Tổng Quan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <a
              href="/api/samples/so-cong-no"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-2 border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tải File Mẫu Tổng Hợp</span>
            </a>
          </div>
        </div>

        {/* SEARCH & CATEGORY FILTER TABS */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-2 rounded-xl transition whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất Cả (12 Modules)
            </button>
            <button
              onClick={() => setSelectedCategory('arch')}
              className={`px-3 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'arch'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Cấu Phần & Kiến Trúc</span>
            </button>
            <button
              onClick={() => setSelectedCategory('office')}
              className={`px-3 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'office'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Nghiệp Vụ Văn Phòng (6)</span>
            </button>
            <button
              onClick={() => setSelectedCategory('banking')}
              className={`px-3 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'banking'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Landmark className="w-3.5 h-3.5 text-amber-400" />
              <span>Nghiệp Vụ Ngân Hàng (6)</span>
            </button>
            <button
              onClick={() => setSelectedCategory('faq')}
              className={`px-3 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'faq'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
              <span>FAQ & Xử Lý Sự Cố</span>
            </button>
          </div>

          <div className="relative min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm tính năng, phím tắt, mẹo..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>
      </div>

      {/* SECTION I: CẤU PHẦN HỆ THỐNG & KIẾN TRÚC 3 TẦNG (KHI CHỌN ARCH HOẶC ALL) */}
      {(selectedCategory === 'all' || selectedCategory === 'arch') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              I. Cấu Phần Hệ Thống & Nguyên Lý Vận Hành
            </h2>
            <span className="text-xs text-slate-400">Kiến trúc Production-grade an toàn & bảo mật</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cấu phần 1: Client SPA */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>Frontend UI / UX (React 19 + Tailwind)</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Giao diện người dùng thời gian thực với phân hệ <strong>Văn phòng</strong> và <strong>Ngân hàng</strong> chuyên biệt. Tích hợp Recharts trực quan hóa dòng tiền, đòn bẩy tài chính và bộ chuyển đổi vai trò (Role Switcher) ngay tức thì.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• Thiết kế Dark mode chống mỏi mắt</div>
                <div>• Xem trước file trực quan trước khi tải về</div>
                <div>• Tự động lưu phiên làm việc qua LocalStorage</div>
              </div>
            </div>

            {/* Cấu phần 2: Node.js & File Automation Engine */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>File Engine (ExcelJS, docx, jsPDF, JSZip)</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Máy chủ tính toán phía sau xử lý toàn bộ bảng tính in-memory. Khác với các hệ thống thông thường chỉ xuất text chết, VeriFin Pro tạo file Excel có <strong>công thức sống (Live Formulas)</strong> để người dùng tiếp tục chỉnh sửa.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• Bảo mật 100%: Dữ liệu lưu trong RAM tạm thời</div>
                <div>• Hỗ trợ Template Word (.docx) và Excel (.xlsx) tùy biến</div>
                <div>• Tự động đóng gói ZIP hàng trăm phiếu lương</div>
              </div>
            </div>

            {/* Cấu phần 3: Gemini Multimodal AI */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>AI Engine (Gemini 2.5/3.8 Flash)</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Bộ xử lý trí tuệ nhân tạo chuyên sâu tiếng Việt: Đọc ảnh chụp màn hình tin nhắn chốt đơn Zalo, bóc tách hóa đơn GTGT, đọc Giấy chứng nhận quyền sử dụng đất (Sổ Đỏ/Sổ Hồng) và báo cáo tín dụng CIC.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• Nhận diện chữ viết tay & con dấu đỏ pháp lý</div>
                <div>• Phân loại 5 nhóm nợ & phát hiện Red Flags sao kê</div>
                <div>• Tự động chuẩn hóa dữ liệu sang JSON Array sạch</div>
              </div>
            </div>

            {/* Cấu phần 4: Mục Riêng Cấu Hình Tài Khoản & VietQR */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
                4
              </div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>💳 Mục Riêng Cấu Hình Tài Khoản & VietQR</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Mục thiết lập riêng biệt cho phép nhập và lưu trữ STK ngân hàng, tên thụ hưởng, mã BIN và cú pháp chuyển tiền. Khi cần tạo QR, hệ thống tự động trích xuất thông tin này để sinh mã VietQR động chuẩn NAPAS247 tức thì.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• Lưu trữ LocalStorage và đồng bộ API server</div>
                <div>• Hỗ trợ tải mã QR PNG và sao chép link quét mã</div>
                <div>• Tự động điền STK & số tiền nợ vào Module Công Nợ</div>
              </div>
            </div>

            {/* Cấu phần 5: In PDF Unicode Hệ Thống (Arial / Tahoma) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
                5
              </div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>📄 Bộ Nạp Font Unicode PDF Hệ Thống</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Khắc phục triệt để lỗi vỡ font tiếng Việt trên jsPDF bằng bộ nạp tự động font Unicode hệ thống (LiberationSans / Arial / Tahoma). In phiếu thông báo nợ với dấu tiếng Việt sắc nét, kẻ bảng đẹp mắt và nhúng mã VietQR 24/7 trực tiếp.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• Nhúng font TrueType (Regular & Bold) chuẩn Unicode</div>
                <div>• Không còn tình trạng ký tự lạ hay mất dấu tiếng Việt</div>
                <div>• Khách hàng quét mã VietQR trên phiếu là chuyển tiền ngay</div>
              </div>
            </div>

            {/* Cấu phần 6: Bộ Lọc Phân Hệ & Đăng Nhập Xác Thực */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                6
              </div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>🔐 Đăng Nhập & Bộ Lọc Nghiệp Vụ Thông Minh</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Hệ thống xác thực tài khoản có lưu phiên làm việc (Session Token), mật khẩu/PIN và phân quyền vai trò. Đặc biệt khi chọn <strong>Khối Văn Phòng</strong>, hệ thống tự động ẩn toàn bộ 6 Module Ngân Hàng & Tín Dụng Pro để tránh rối mắt.
              </p>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• Chuyển đổi 1-chạm giữa 3 chế độ: Văn phòng, Ngân hàng, Tất cả</div>
                <div>• 5 Hồ sơ mẫu có sẵn (Kế toán trưởng, Tín dụng, Bán hàng, Giám đốc, CFO)</div>
                <div>• Xác thực đăng nhập qua API /api/auth/login</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION II: DANH SÁCH 12 MODULES VỚI HƯỚNG DẪN CHI TIẾT TỪNG BƯỚC */}
      {(selectedCategory === 'all' || selectedCategory === 'office' || selectedCategory === 'banking') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              II. Cẩm Nang Chi Tiết 12 Modules Nghiệp Vụ
            </h2>
            <span className="text-xs text-slate-400">
              Đang hiển thị {filteredModules.length} module
            </span>
          </div>

          <div className="space-y-4">
            {filteredModules.map((m) => {
              const Icon = m.icon;
              const isExpanded = expandedModule === m.id;

              return (
                <div
                  key={m.id}
                  className={`bg-slate-900/90 rounded-2xl border transition-all ${
                    isExpanded
                      ? 'border-indigo-500/50 shadow-xl shadow-indigo-950/20 ring-1 ring-indigo-500/30'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Module Header Bar */}
                  <div
                    onClick={() => setExpandedModule(isExpanded ? null : m.id)}
                    className="p-5 flex items-start md:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-start md:items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                        m.category === 'office' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{m.num}. {m.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.category === 'office' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {m.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{m.summary}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(m.tabKey);
                        }}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                      >
                        <span>Mở module</span>
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                      </button>
                      <span className="p-1.5 rounded-lg bg-slate-800 text-slate-400">
                        {isExpanded ? <ChevronRight className="w-4 h-4 rotate-90 transition-transform" /> : <ChevronRight className="w-4 h-4 transition-transform" />}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Module Details */}
                  {isExpanded && (
                    <div className="px-5 pb-6 pt-2 border-t border-slate-800/80 space-y-5 animate-fadeIn">
                      {/* Summary callout */}
                      <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/70 text-xs text-slate-300">
                        <strong className="text-white">Mục đích nghiệp vụ: </strong>
                        {m.summary}
                      </div>

                      {/* Input formats */}
                      <div className="text-xs space-y-1">
                        <span className="font-bold text-slate-300 flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-cyan-400" />
                          Dữ liệu đầu vào hỗ trợ:
                        </span>
                        <p className="text-slate-400 pl-5">{m.inputFormats}</p>
                      </div>

                      {/* Step-by-step instructions */}
                      <div className="space-y-2">
                        <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          Các bước thực hiện chi tiết:
                        </span>
                        <div className="space-y-2 pl-2">
                          {m.steps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-slate-700">
                                {idx + 1}
                              </span>
                              <span className="leading-relaxed">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Outputs */}
                      <div className="space-y-2">
                        <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Kết quả đầu ra nhận được:
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-2">
                          {m.outputs.map((out, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
                              <span className="text-emerald-400 font-bold shrink-0">✓</span>
                              <span>{out}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Pro Tip */}
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 flex items-start gap-2.5">
                        <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-amber-300">Mẹo thực chiến: </strong>
                          {m.proTip}
                        </div>
                      </div>

                      {/* Bottom action button */}
                      <div className="pt-2 flex items-center justify-end">
                        <button
                          onClick={() => onNavigate(m.tabKey)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-md transition"
                        >
                          <span>Trải nghiệm Module {m.num} ngay</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION III: TỔNG HỢP CÁC FILE MẪU CHUẨN ĐỂ TEST NHANH */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            III. Bảng Tổng Hợp File Dữ Liệu Mẫu Có Sẵn
          </h2>
          <span className="text-xs text-slate-400">Bấm tải nhanh để kiểm thử đầy đủ các chức năng</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SampleCard
            title="1. Sổ Công Nợ Test (.xlsx)"
            desc="Mẫu theo dõi công nợ khách hàng, phải thu, đã thu, hạn thanh toán và email liên hệ."
            url="/api/samples/so-cong-no"
            badge="Module 1"
          />
          <SampleCard
            title="2. Sao Kê Ngân Hàng Test (.xlsx)"
            desc="Lịch sử giao dịch tiền vào, tiền ra có diễn giải để đối chiếu nợ và quét Red Flags cờ đỏ."
            url="/api/samples/sao-ke-bank"
            badge="Module 1 & 7"
          />
          <SampleCard
            title="3A. File Bán Hàng A (.xlsx)"
            desc="File xuất từ phần mềm bán hàng nội bộ có cột Mã Đơn, Khách hàng, Thành tiền."
            url="/api/samples/file-ban-hang-a"
            badge="Module 2"
          />
          <SampleCard
            title="3B. File Kế Toán Kho B (.xlsx)"
            desc="File đối soát từ bộ phận Kho & Kế toán cần so khớp để tìm lệch số tiền và đơn thiếu."
            url="/api/samples/file-ke-toan-b"
            badge="Module 2"
          />
          <SampleCard
            title="4. Bảng Lương Tổng Hợp (.xlsx)"
            desc="Bảng lương công ty có Lương cơ bản, KPI, Phụ cấp, BHXH và Thực lĩnh nhân viên."
            url="/api/samples/bang-luong"
            badge="Module 3"
          />
          <SampleCard
            title="5. Mẫu Phiếu Lương Doanh Nghiệp (.xlsx)"
            desc="Mẫu phiếu lương đẹp mắt có logo, kẻ khung và các placeholder {{Họ và Tên}}, {{Thực lĩnh}}."
            url="/api/samples/mau-phieu-luong"
            badge="Module 3 (Custom)"
          />
          <SampleCard
            title="6. Danh Mục Tín Dụng & STK (.xlsx)"
            desc="Bảng kê khách hàng vay và gửi tiết kiệm có ngày đáo hạn để sinh tin nhắn Zalo nhắc nợ."
            url="/api/samples/danh-muc-tin-dung"
            badge="Module 9"
          />
          <SampleCard
            title="7. Mẫu Tờ Trình Vay Chuẩn (.docx)"
            desc="Mẫu tờ trình tín dụng Word của ngân hàng để AI điền tự động phương án thẩm định vay."
            url="/api/bank/sample-proposal-template"
            badge="Module 11"
          />
          <SampleCard
            title="8. Mẫu Thẩm Định Nguồn Thu (.xlsx)"
            desc="Bảng phân tích đa nguồn thu nhập cá nhân/gia đình và công thức NDI khả dụng."
            url="/api/samples/tham-dinh-thu-nhap"
            badge="Module 12"
          />
          <SampleCard
            title="9. Mẫu Dự Báo Dòng Tiền 12 Tuần (.xlsx)"
            desc="Bảng kế hoạch thu chi 12 tuần doanh nghiệp với công thức dòng tiền ròng và số dư tích lũy."
            url="/api/samples/du-bao-dong-tien"
            badge="Module 6"
          />
        </div>
      </section>

      {/* SECTION IV: FAQ & XỬ LÝ SỰ CỐ THƯỜNG GẶP */}
      {(selectedCategory === 'all' || selectedCategory === 'faq') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pink-400" />
              IV. Các Câu Hỏi Thường Gặp (FAQ) & Khắc Phục Lỗi
            </h2>
            <span className="text-xs text-slate-400">Giải đáp thắc mắc vận hành</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <FaqItem
              question="Làm thế nào để ẩn các nghiệp vụ Ngân hàng & Tín dụng Pro khi chỉ làm việc Văn phòng?"
              answer="Bạn chỉ cần bấm nút '🏢 Văn Phòng' ngay tại hộp Chế độ nghiệp vụ trên thanh Sidebar bên trái (hoặc chọn phân hệ Văn Phòng khi đăng ký/đăng nhập). Hệ thống sẽ tự động ẩn sạch toàn bộ 6 Module Ngân hàng & Tín dụng Pro (sao kê, CIC, sổ đỏ, tờ trình...), giúp giao diện cực kỳ gọn gàng, không bị phân tâm hay rối mắt."
            />
            <FaqItem
              question="Vì sao trước đây xuất PDF bị vỡ font tiếng Việt và hệ thống đã khắc phục thế nào?"
              answer="Trước đây jsPDF sử dụng font chuẩn Helvetica (không có bảng mã Unicode tiếng Việt), dẫn đến chữ có dấu bị lỗi ô vuông hoặc mất ký tự. Hệ thống hiện đã tích hợp bộ nạp tự động Font Unicode hệ thống (LiberationSans / Arial / Tahoma) chuẩn TrueType cho cả kiểu Regular & Bold, đảm bảo in ra file PDF sắc nét 100% tiếng Việt chuẩn Bộ Tài chính kèm mã VietQR NAPAS247 quét thanh toán trực tiếp."
            />
            <FaqItem
              question="Cú pháp chuyển khoản mẫu khi trích xuất được định dạng như thế nào?"
              answer="Cú pháp chuẩn được thiết lập là: [MA_KH] THANH TOAN CONG NO NGAY DD/MM/YYYY. Khi tạo mã QR hoặc in thông báo nợ PDF, hệ thống sẽ tự động thay thế [MA_KH] bằng mã khách hàng (ví dụ: KH001) và DD/MM/YYYY bằng ngày tháng năm thực tế (ví dụ: 14/10/2026), giúp kế toán dễ dàng đối chiếu tiền về."
            />
            <FaqItem
              question="Tại sao đã bỏ nút nạp nhanh mẫu tài khoản 1 chạm ở mục Cấu hình Tài khoản?"
              answer="Nhằm tránh tối đa các nhầm lẫn không đáng có khi khách hàng quét mã chuyển tiền, hệ thống đã loại bỏ hoàn toàn các tài khoản mẫu giả lập. Bạn chỉ cần tự nhập thông tin tài khoản ngân hàng thực tế của đơn vị mình một lần duy nhất, dữ liệu sẽ được lưu an toàn và tự động trích xuất chính xác 100%."
            />
            <FaqItem
              question="Cấu phần Đăng Ký và Đăng Nhập tài khoản hoạt động như thế nào?"
              answer="Hệ thống cung cấp đầy đủ cả 2 cấu phần: Đăng Nhập (bằng Email hoặc SĐT kèm Mật khẩu) và Đăng Ký Tài Khoản Mới (Họ tên, Email, SĐT, Mật khẩu, Phân hệ chính phụ trách). Phiên làm việc được xác thực qua Session Token bảo mật, lưu lại thiết bị và tự động phân quyền truy cập."
            />
            <FaqItem
              question="Tôi có thể mời cà phê ủng hộ phát triển tool ở đâu?"
              answer="Thông tin ủng hộ: Nguyễn Trường Thiên Tân • SĐT + Zalo: 0817221722. Mời cà phê qua Ngân hàng OCB (Phương Đông), STK: 48888, Chủ tài khoản: NGUYỄN TRƯỜNG THIÊN TÂN. Bạn có thể bấm vào thẻ 'Mời Cà Phê' ở chân thanh Sidebar để xem và quét mã VietQR tức thì."
            />
          </div>
        </section>
      )}
    </div>
  );
}

function SampleCard({
  title,
  desc,
  url,
  badge,
}: {
  title: string;
  desc: string;
  url: string;
  badge: string;
}) {
  return (
    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between space-y-3 transition group">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-bold text-white text-xs group-hover:text-cyan-300 transition">
            {title}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold text-[10px] shrink-0 border border-slate-700">
            {badge}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
      </div>

      <a
        href={url}
        className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700/60 transition"
      >
        <Download className="w-3.5 h-3.5 text-cyan-400" />
        <span>Tải file mẫu về</span>
      </a>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen(!open)}
      className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 cursor-pointer transition select-none space-y-2"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-bold text-white text-xs flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          {question}
        </span>
        <span className="text-slate-400 shrink-0">
          {open ? '−' : '+'}
        </span>
      </div>
      {open && (
        <p className="text-slate-300 text-[11px] leading-relaxed pt-2 border-t border-slate-800/80">
          {answer}
        </p>
      )}
    </div>
  );
}
