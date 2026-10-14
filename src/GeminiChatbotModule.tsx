import { aiFetch } from './aiApi';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  User,
  Trash2,
  Plus,
  ShieldCheck,
  Building2,
  Landmark,
  Zap,
  Cpu,
  Brain,
  MessageSquare,
  ChevronDown,
  Layers,
  HelpCircle,
  Lightbulb,
  X,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import {
  auth,
  saveChatSession,
  addChatMessage,
  getChatSessions,
  getSessionMessages,
  FirestoreChatSession,
  FirestoreChatMessage,
} from './firebase';

export type ChatRole = 'credit_expert' | 'accounting_advisor' | 'quick_assistant';
export type GeminiModelChoice = 'gemini-4-argon' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';

interface MessageItem {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

const ROLE_CONFIGS: Record<
  ChatRole,
  {
    name: string;
    badge: string;
    description: string;
    defaultModel: GeminiModelChoice;
    icon: typeof Landmark;
    themeColor: string;
    suggestedQuestions: string[];
  }
> = {
  credit_expert: {
    name: 'Chuyên Gia Tín Dụng & Quản Trị Rủi Ro',
    badge: 'Tín Dụng & Ngân Hàng Pro',
    description: 'Thẩm định hồ sơ CIC, tính DSCR, LTV, phân nhóm nợ Thông tư 11/2021 và lập tờ trình tín dụng.',
    defaultModel: 'gemini-4-argon',
    icon: Landmark,
    themeColor: 'from-amber-500 to-orange-600',
    suggestedQuestions: [
      'Phân loại nhóm nợ từ nhóm 1 đến nhóm 5 theo Thông tư 11/2021/TT-NHNN?',
      'Công thức tính hệ số DSCR chuẩn xác khi thẩm định sao kê 6 tháng?',
      'Cách bóc tách dư nợ và tính hệ số DTI từ báo cáo tín dụng CIC?',
      'Xây dựng phương án vay tái tài trợ (Refinance) giảm chi phí lãi cho khách hàng?',
    ],
  },
  accounting_advisor: {
    name: 'Cố Vấn Kế Toán & Quản Trị Công Nợ',
    badge: 'Kế Toán & Văn Phòng',
    description: 'Quản lý sổ công nợ, phân tích tuổi nợ, hóa đơn điện tử Nghị định 123 và bảng lương BHXH.',
    defaultModel: 'gemini-3.8-flash',
    icon: Building2,
    themeColor: 'from-emerald-500 to-teal-600',
    suggestedQuestions: [
      'Quy trình đôn đốc thu hồi nợ và đối chiếu công nợ chuẩn kế toán?',
      'Các trường hợp được xuất hóa đơn điều chỉnh theo Nghị định 123/2020?',
      'Công thức tính thuế TNCN lũy tiến từng phần và giảm trừ gia cảnh mới nhất?',
      'Cách lập kế hoạch dự báo dòng tiền 12 tuần cho doanh nghiệp vừa và nhỏ?',
    ],
  },
  quick_assistant: {
    name: 'Trợ Lý Tra Cứu Siêu Tốc & Nghiệp Vụ',
    badge: 'Tra Cứu Tức Thì',
    description: 'Tra cứu nhanh mã BIN ngân hàng, cú pháp VietQR Napas, hàm Excel và giải thích thuật ngữ.',
    defaultModel: 'gemini-3.1-flash-lite',
    icon: Zap,
    themeColor: 'from-cyan-500 to-blue-600',
    suggestedQuestions: [
      'Mã BIN của VietinBank, Vietcombank, MBBank, Techcombank, BIDV là gì?',
      'Cú pháp chuẩn của mã VietQR Napas 24/7 theo EMVCo?',
      'Cú pháp hàm PMT và PPMT trong Excel để tính gốc lãi trả góp đều?',
      'Chỉ số EBITDA và ROE khác nhau như thế nào?',
    ],
  },
};

export function GeminiChatbotModule({
  isFloating = false,
  onClose,
}: {
  isFloating?: boolean;
  onClose?: () => void;
} = {}) {
  const [role, setRole] = useState<ChatRole>('accounting_advisor');
  const [model, setModel] = useState<GeminiModelChoice>('gemini-3.8-flash');
  const [sessions, setSessions] = useState<FirestoreChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `session_${Date.now()}`);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'init_welcome',
      role: 'model',
      content: `Xin chào! Tôi là **AI Trợ Lý Tài Chính & Ngân Hàng VeriFin Pro**.\n\nTôi sẵn sàng hỗ trợ bạn:\n- 🏢 **Kế toán & Công nợ:** Đối chiếu, thông báo nợ, bảng lương, thuế TNCN.\n- 🏦 **Tín dụng & Thẩm định:** Báo cáo CIC, dòng tiền sao kê, tính LTV & DSCR.\n- ⚡ **Tra cứu:** Mã BIN Napas, công thức Excel.\n\nHãy nhập câu hỏi bên dưới để trao đổi cùng AI!`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.8-flash',
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load user sessions from Firestore if authenticated
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      getChatSessions(user.uid)
        .then((saved) => {
          if (saved && saved.length > 0) {
            setSessions(saved);
          }
        })
        .catch(console.error);
    }
  }, []);

  // Update default model when role changes
  const handleRoleChange = (newRole: ChatRole) => {
    setRole(newRole);
    setModel(ROLE_CONFIGS[newRole].defaultModel);
  };

  const handleStartNewSession = () => {
    const newId = `session_${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([
      {
        id: `init_${Date.now()}`,
        role: 'model',
        content: `Đã khởi tạo phiên hội thoại mới với vai trò **${ROLE_CONFIGS[role].name}** (sử dụng mô hình **${model}**). Hãy gửi câu hỏi hoặc chủ đề bạn cần xử lý.`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: model,
      },
    ]);
  };

  const handleSelectSession = async (sess: FirestoreChatSession) => {
    setCurrentSessionId(sess.sessionId);
    setRole(sess.role);
    setModel(sess.modelUsed);
    const user = auth.currentUser;
    if (user) {
      setLoading(true);
      try {
        const msgs = await getSessionMessages(user.uid, sess.sessionId);
        if (msgs.length > 0) {
          setMessages(
            msgs.map((m) => ({
              id: m.id || `m_${Math.random()}`,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              modelUsed: m.modelUsed,
            }))
          );
        }
      } catch (err) {
        console.error('Error loading session messages:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim();
    if (!textToSend || loading) return;

    const userMsg: MessageItem = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputPrompt('');
    setLoading(true);

    const user = auth.currentUser;
    if (user) {
      // Save user message to Firestore
      const sessObj: FirestoreChatSession = {
        sessionId: currentSessionId,
        title: textToSend.slice(0, 50) + (textToSend.length > 50 ? '...' : ''),
        role,
        modelUsed: model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveChatSession(user.uid, sessObj).catch(console.error);
      addChatMessage(user.uid, currentSessionId, {
        role: 'user',
        content: textToSend,
        timestamp: new Date().toISOString(),
      }).catch(console.error);
    }

    try {
      // Send conversation history to backend Gemini multi-turn endpoint
      const payload = {
        messages: newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        role,
        model,
      };

      const res = await aiFetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Lỗi kết nối API Chatbot');
      }

      const data = await res.json();
      const botMsg: MessageItem = {
        id: `bot_${Date.now()}`,
        role: 'model',
        content: data.reply || 'Không có phản hồi.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || model,
      };

      setMessages((prev) => [...prev, botMsg]);

      if (user) {
        addChatMessage(user.uid, currentSessionId, {
          role: 'model',
          content: botMsg.content,
          timestamp: new Date().toISOString(),
          modelUsed: botMsg.modelUsed,
        }).catch(console.error);
      }
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: `err_${Date.now()}`,
        role: 'model',
        content: `⚠️ **Lỗi phản hồi:** ${err.message || 'Không thể kết nối đến máy chủ AI.'}\n\n*Gợi ý:* Kiểm tra kết nối mạng hoặc thử chuyển sang mô hình Gemini khác.`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: model,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentRoleConfig = ROLE_CONFIGS[role];

  // ==========================================
  // FLOATING WINDOW COMPACT MODE (BOTTOM RIGHT)
  // ==========================================
  if (isFloating) {
    if (isMinimized) {
      return (
        <div className="fixed bottom-6 right-6 z-50 animate-fadeIn select-none">
          <div className="bg-slate-900 border border-violet-500/50 shadow-2xl rounded-2xl p-2.5 flex items-center gap-3 backdrop-blur-xl">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow">
              <Bot className="w-4 h-4 animate-bounce" />
            </div>
            <div className="cursor-pointer" onClick={() => setIsMinimized(false)}>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>AI Chatbot Gemini</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-[10px] text-slate-400">Đang thu gọn • Bấm để mở lại</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Phóng to cửa sổ"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Đóng Chatbot"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed bottom-6 right-6 z-50 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[580px] max-h-[calc(100vh-6rem)] bg-slate-900/95 border border-violet-500/40 rounded-3xl shadow-2xl shadow-violet-950/60 backdrop-blur-xl flex flex-col overflow-hidden animate-fadeIn">
        {/* COMPACT FLOATING HEADER */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80 flex items-center justify-between select-none shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${currentRoleConfig.themeColor} flex items-center justify-center shadow`}>
              <currentRoleConfig.icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-xs text-white truncate max-w-[170px]">
                  {currentRoleConfig.name}
                </h4>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <span>{model}</span>
                <span>•</span>
                <span className="text-violet-300">Góc phải VeriFin</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleStartNewSession}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white transition"
              title="Khởi tạo đoạn chat mới"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white transition"
              title="Thu nhỏ cửa sổ"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition"
                title="Đóng cửa sổ"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* COMPACT ROLE & MODEL BAR */}
        <div className="px-3 py-2 bg-slate-950/70 border-b border-slate-800/60 flex items-center justify-between gap-2 shrink-0">
          {/* Quick role tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
            {(Object.keys(ROLE_CONFIGS) as ChatRole[]).map((rKey) => {
              const cfg = ROLE_CONFIGS[rKey];
              const isSelected = role === rKey;
              return (
                <button
                  key={rKey}
                  type="button"
                  onClick={() => handleRoleChange(rKey)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition shrink-0 flex items-center gap-1 border ${
                    isSelected
                      ? 'bg-violet-600/30 text-violet-200 border-violet-500/60 shadow-xs'
                      : 'bg-slate-800/50 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <cfg.icon className="w-2.5 h-2.5" />
                  <span>{cfg.badge}</span>
                </button>
              );
            })}
          </div>

          {/* Model picker */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as GeminiModelChoice)}
            className="bg-slate-850 text-slate-300 border border-slate-700/80 text-[10px] rounded-lg px-1.5 py-1 focus:outline-none focus:border-violet-500 shrink-0 font-mono"
            title="Chọn mô hình Gemini"
          >
            <option value="gemini-3.8-flash">3.8 Flash</option>
            <option value="gemini-4-argon">4 Argon</option>
            <option value="gemini-3.1-flash-lite">3.1 Lite</option>
          </select>
        </div>

        {/* COMPACT MESSAGE THREAD */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-slate-950/30">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 shadow mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm text-xs ${
                    isUser
                      ? 'bg-violet-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/70 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 pb-0.5 border-b border-white/10 text-[9px] opacity-75">
                    <span className="font-bold">{isUser ? 'Bạn' : currentRoleConfig.badge}</span>
                    <div className="flex items-center gap-1.5">
                      <span>{msg.timestamp}</span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="hover:text-cyan-300 transition"
                          title="Sao chép"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="leading-relaxed whitespace-pre-wrap font-sans text-[11.5px]">
                    {msg.content}
                  </div>
                </div>

                {isUser && (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow mt-0.5">
                    <User className="w-3.5 h-3.5 text-slate-950 font-bold" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 animate-pulse mt-0.5">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl rounded-bl-none px-3 py-2 text-[11px] text-slate-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                <span>Gemini đang phản hồi...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* COMPACT SUGGESTIONS */}
        <div className="px-3 py-1.5 border-t border-slate-800/70 bg-slate-950/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[9px] text-slate-400 flex items-center gap-0.5 shrink-0 font-semibold">
            <Lightbulb className="w-2.5 h-2.5 text-amber-400" />
            Gợi ý:
          </span>
          {currentRoleConfig.suggestedQuestions.slice(0, 3).map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(q)}
              disabled={loading}
              className="text-[10px] bg-slate-800/80 hover:bg-violet-900/40 text-slate-300 hover:text-white px-2 py-0.5 rounded-full border border-slate-700/70 shrink-0 transition truncate max-w-[150px]"
              title={q}
            >
              {q}
            </button>
          ))}
        </div>

        {/* COMPACT INPUT BAR */}
        <div className="p-2.5 bg-slate-950 border-t border-slate-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder={`Hỏi ${currentRoleConfig.badge}...`}
              disabled={loading}
              className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
            />
            <button
              type="submit"
              disabled={loading || !inputPrompt.trim()}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold p-2 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow shadow-violet-500/20 shrink-0"
              title="Gửi câu hỏi"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // FULL PAGE MODE (WHEN RENDERED IN MAIN CONTAINER)
  // ==========================================
  return (
    <div className="space-y-6 max-w-6xl animate-fadeIn">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px] uppercase tracking-wider border border-cyan-500/30 flex items-center gap-1">
              <Bot className="w-3 h-3 text-cyan-400" />
              Gemini Multi-Turn AI Chatbot
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Lưu Trữ Firestore Cloud
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Trợ Lý Ảo Tài Chính, Kế Toán & Ngân Hàng</span>
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Hội thoại đa lượt thông minh duy trì lịch sử trao đổi, hỗ trợ đa mô hình Gemini chuyên biệt theo độ phức tạp công việc.
          </p>
        </div>

        <button
          onClick={handleStartNewSession}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition self-start md:self-center shadow"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Tạo Phiên Mới</span>
        </button>
      </div>

      {/* ROLE & MODEL SELECTOR CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl">
        {/* Role Selector (7 cols) */}
        <div className="md:col-span-7 space-y-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <span>Vai trò trợ lý AI:</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.keys(ROLE_CONFIGS) as ChatRole[]).map((rKey) => {
              const cfg = ROLE_CONFIGS[rKey];
              const isSelected = role === rKey;
              return (
                <button
                  key={rKey}
                  type="button"
                  onClick={() => handleRoleChange(rKey)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500/70 shadow-md ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div
                      className={`w-6 h-6 rounded-lg bg-gradient-to-br ${cfg.themeColor} flex items-center justify-center shrink-0`}
                    >
                      <cfg.icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-bold text-[11px] text-white truncate">{cfg.badge}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-1">{cfg.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Selector (5 cols) */}
        <div className="md:col-span-5 space-y-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mô hình Gemini (Tối ưu theo nghiệp vụ):</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              {
                id: 'gemini-4-argon' as GeminiModelChoice,
                name: 'Gemini 4 Argon',
                desc: 'Tác vụ phức tạp',
                tagColor: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
              },
              {
                id: 'gemini-3.8-flash' as GeminiModelChoice,
                name: 'Gemini 3.8 Flash',
                desc: 'Nghiệp vụ chung',
                tagColor: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
              },
              {
                id: 'gemini-3.1-flash-lite' as GeminiModelChoice,
                name: '3.1 Flash-Lite',
                desc: 'Phản hồi siêu tốc',
                tagColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
              },
            ].map((mItem) => {
              const isSelected = model === mItem.id;
              return (
                <button
                  key={mItem.id}
                  type="button"
                  onClick={() => setModel(mItem.id)}
                  className={`p-2 rounded-xl text-left border transition ${
                    isSelected
                      ? 'bg-slate-800 border-cyan-500/70 shadow-md ring-1 ring-cyan-500/50'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${mItem.tagColor}`}>
                    {mItem.name}
                  </span>
                  <p className="text-[10px] text-slate-300 font-medium mt-1 truncate">{mItem.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* CHAT CONTAINER */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[650px]">
        {/* Chat Header Status */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${currentRoleConfig.themeColor} flex items-center justify-center`}>
              <currentRoleConfig.icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">{currentRoleConfig.name}</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                  {model}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{currentRoleConfig.description}</p>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Trực tuyến</span>
          </div>
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 shadow-md">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-4 shadow-md ${
                    isUser
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-bl-none'
                  }`}
                >
                  {/* Header / Meta */}
                  <div className="flex items-center justify-between gap-4 mb-1.5 pb-1 border-b border-white/10 text-[10px] opacity-80">
                    <span className="font-semibold">{isUser ? 'Bạn' : currentRoleConfig.name}</span>
                    <div className="flex items-center gap-2">
                      {msg.modelUsed && <span className="font-mono">{msg.modelUsed}</span>}
                      <span>{msg.timestamp}</span>
                      {!isUser && (
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="hover:text-cyan-300 transition"
                          title="Sao chép nội dung"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message body */}
                  <div className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md">
                    <User className="w-4 h-4 text-slate-950 font-bold" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 animate-pulse">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl rounded-bl-none p-4 text-xs text-slate-300 flex items-center gap-3">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>Gemini đang suy nghĩ và tính toán câu trả lời nghiệp vụ...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompt Chips */}
        <div className="px-6 py-2 border-t border-slate-800/70 bg-slate-950/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0 font-semibold">
            <Lightbulb className="w-3 h-3 text-amber-400" />
            Gợi ý:
          </span>
          {currentRoleConfig.suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q)}
              disabled={loading}
              className="text-[11px] bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white px-2.5 py-1 rounded-full border border-slate-700 shrink-0 transition"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder={`Nhập câu hỏi tài chính, kế toán hoặc thẩm định tín dụng cho ${currentRoleConfig.name}...`}
              disabled={loading}
              className="flex-1 bg-slate-900 border border-slate-700/80 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
            />
            <button
              type="submit"
              disabled={loading || !inputPrompt.trim()}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold p-3 rounded-2xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
