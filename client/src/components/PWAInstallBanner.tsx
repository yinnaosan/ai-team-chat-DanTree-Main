import { useState, useEffect } from "react";
import { X, Download, Monitor } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already running as standalone PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if user dismissed before (within 7 days)
    const dismissed = localStorage.getItem("pwa-banner-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedAt < sevenDays) return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Show banner after a short delay so it doesn't appear immediately on load
      setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    setInstalling(true);
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    }
    setInstalling(false);
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("pwa-banner-dismissed", Date.now().toString());
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
      style={{ animation: "slideUp 0.3s ease-out" }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1e1f20]/95 px-4 py-3 shadow-2xl backdrop-blur-md">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <Monitor className="h-5 w-5 text-white/80" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-tight">安装到桌面</p>
          <p className="text-xs text-white/50 mt-0.5 leading-tight">
            像 App 一样使用，无需浏览器
          </p>
        </div>

        {/* Install button */}
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          {installing ? "安装中..." : "安装"}
        </button>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
