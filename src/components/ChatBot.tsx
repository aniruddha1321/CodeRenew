import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2 } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "👋 Hi! I'm **CodeRenew Assistant**. I can help you with:\n\n• Code conversion (Python 2→3, Java→Python, C++→Python, and more)\n• GitHub clone & bulk convert\n• Security scanning (HIPAA, ISO 27001)\n• Recovery loop monitoring\n• App settings & troubleshooting\n\nWhat would you like to know?",
};

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Build history (exclude welcome message)
      const history = messages
        .filter((_, i) => i > 0) // skip welcome
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("http://127.0.0.1:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await response.json();

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content:
          data.reply ||
          data.error ||
          "Sorry, I couldn't process that. Please try again.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ Unable to reach the backend. Make sure the server is running on port 5000.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Simple markdown-like rendering for bold text and bullet points
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Bold: **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const rendered = parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      // Bullet points
      if (line.trim().startsWith("•") || line.trim().startsWith("-")) {
        return (
          <div key={i} className="ml-2 flex gap-1.5">
            <span className="text-blue-400 flex-shrink-0">•</span>
            <span>{rendered}</span>
          </div>
        );
      }

      // Numbered lists
      if (/^\d+\./.test(line.trim())) {
        return (
          <div key={i} className="ml-2">
            {rendered}
          </div>
        );
      }

      // Empty lines → spacing
      if (line.trim() === "") {
        return <div key={i} className="h-1.5" />;
      }

      return <div key={i}>{rendered}</div>;
    });
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          id="chatbot-toggle"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 z-50"
          title="CodeRenew Assistant"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 w-96 h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden border border-gray-200"
          style={{
            animation: "slideUp 0.3s ease-out",
          }}
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <Bot size={18} />
              </div>
              <div>
                <div className="font-semibold text-sm leading-tight">
                  CodeRenew Assistant
                </div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  Powered by Groq • Llama 3.3
                </div>
              </div>
            </div>
            <button
              id="chatbot-close"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={14} className="text-blue-600" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-white text-gray-800 border border-gray-200 rounded-bl-md shadow-sm"
                  }`}
                >
                  {msg.role === "assistant"
                    ? renderContent(msg.content)
                    : msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={14} className="text-gray-600" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={14} className="text-blue-600" />
                </div>
                <div className="bg-white text-gray-500 border border-gray-200 px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm flex items-center gap-2 text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="chatbot-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about CodeRenew..."
                disabled={isLoading}
                className="flex-1 px-3.5 py-2 bg-gray-100 rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-60"
              />
              <button
                id="chatbot-send"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl flex items-center justify-center transition-colors disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
};

export default ChatBot;
