import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const GLOW_CSS = [
  "@keyframes toast-glow {",
  "  0%   { box-shadow: 0 0 0px 0px rgba(251,146,60,0), 0 4px 24px rgba(0,0,0,0.5); }",
  "  30%  { box-shadow: 0 0 20px 7px rgba(251,146,60,0.55), 0 4px 24px rgba(0,0,0,0.5); }",
  "  70%  { box-shadow: 0 0 14px 4px rgba(251,146,60,0.32), 0 4px 24px rgba(0,0,0,0.5); }",
  "  100% { box-shadow: 0 0 10px 3px rgba(251,146,60,0.18), 0 4px 24px rgba(0,0,0,0.5); }",
  "}",
  "[data-sonner-toast] {",
  "  animation: toast-glow 1.4s ease-out forwards !important;",
  "  border: 1px solid rgba(251,146,60,0.38) !important;",
  "  border-radius: 10px !important;",
  "  backdrop-filter: blur(14px) !important;",
  "  background: rgba(15, 17, 23, 0.93) !important;",
  "  color: #f1f5f9 !important;",
  "}",
  "[data-sonner-toast] [data-close-button] {",
  "  background: rgba(251,146,60,0.12) !important;",
  "  border: 1px solid rgba(251,146,60,0.28) !important;",
  "  color: #fb923c !important;",
  "  border-radius: 50% !important;",
  "  width: 20px !important;",
  "  height: 20px !important;",
  "  display: flex !important;",
  "  align-items: center !important;",
  "  justify-content: center !important;",
  "  transition: background 0.2s !important;",
  "}",
  "[data-sonner-toast] [data-close-button]:hover {",
  "  background: rgba(251,146,60,0.32) !important;",
  "}",
  "[data-sonner-toast] [data-title] {",
  "  font-weight: 600 !important;",
  "  font-size: 0.875rem !important;",
  "  color: #f8fafc !important;",
  "}",
  "[data-sonner-toast] [data-description] {",
  "  font-size: 0.78rem !important;",
  "  color: #94a3b8 !important;",
  "  margin-top: 2px !important;",
  "}",
].join("\n");

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOW_CSS }} />
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        position="top-right"
        closeButton
        richColors={false}
        gap={10}
        offset={16}
        style={
          {
            "--normal-bg": "rgba(15, 17, 23, 0.93)",
            "--normal-text": "#f1f5f9",
            "--normal-border": "rgba(251,146,60,0.38)",
          } as React.CSSProperties
        }
        toastOptions={{
          style: {
            background: "rgba(15, 17, 23, 0.93)",
            border: "1px solid rgba(251,146,60,0.38)",
            color: "#f1f5f9",
            borderRadius: "10px",
          },
        }}
        {...props}
      />
    </>
  );
};

export { Toaster };
