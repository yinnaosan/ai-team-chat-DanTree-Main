import { useEffect, useRef, useState } from "react";

interface ManusOrbProps {
  /** 是否正在处理任务（控制动画状态） */
  isActive?: boolean;
  /** 球体尺寸（px），默认 48 */
  size?: number;
  /** 额外 className */
  className?: string;
}

/**
 * ManusOrb — Manus 风格 3D 悬浮小球
 *
 * 使用纯 CSS 实现：
 * - 多层 radial-gradient 模拟 3D 球体光照
 * - isActive=true 时触发呼吸动画（scale + glow pulse）
 * - 悬浮时有轻微 tilt 交互（鼠标跟随）
 */
export function ManusOrb({ isActive = false, size = 48, className = "" }: ManusOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  // 鼠标跟随 tilt 效果
  useEffect(() => {
    const el = orbRef.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      setTilt({ x: dy * -12, y: dx * 12 });
    };

    const handleMouseLeave = () => {
      setTilt({ x: 0, y: 0 });
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const s = size;
  const glowSize = s * 1.8;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: s, height: s }}
    >
      {/* 外层光晕 */}
      <div
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          background: isActive
            ? "radial-gradient(circle, rgba(56,139,253,0.22) 0%, rgba(79,70,229,0.10) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(56,139,253,0.10) 0%, transparent 60%)",
          animation: isActive ? "orbGlowPulse 2s ease-in-out infinite" : undefined,
          transition: "opacity 0.4s ease",
          pointerEvents: "none",
        }}
      />

      {/* 球体本体 */}
      <div
        ref={orbRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: s,
          height: s,
          borderRadius: "50%",
          position: "relative",
          cursor: "default",
          transform: `perspective(${s * 4}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isActive ? 1 : hovered ? 1.05 : 1})`,
          transition: isActive ? "transform 0.15s ease" : "transform 0.3s ease",
          animation: isActive ? "orbBreath 2s ease-in-out infinite" : undefined,
          // 多层渐变模拟 3D 球体
          background: `
            radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55) 0%, transparent 45%),
            radial-gradient(circle at 70% 75%, rgba(79,70,229,0.35) 0%, transparent 40%),
            radial-gradient(circle at 50% 50%, #3b82f6 0%, #4f46e5 40%, #1e1b4b 75%, #0f0a1e 100%)
          `,
          // 多层 box-shadow：内部高光 + 外部 glow
          boxShadow: isActive
            ? `
              inset 0 ${s * 0.08}px ${s * 0.15}px rgba(255,255,255,0.25),
              inset 0 -${s * 0.06}px ${s * 0.12}px rgba(79,70,229,0.4),
              0 0 ${s * 0.4}px rgba(59,130,246,0.6),
              0 0 ${s * 0.8}px rgba(79,70,229,0.35),
              0 0 ${s * 1.2}px rgba(59,130,246,0.15)
            `
            : `
              inset 0 ${s * 0.08}px ${s * 0.15}px rgba(255,255,255,0.20),
              inset 0 -${s * 0.06}px ${s * 0.12}px rgba(79,70,229,0.3),
              0 0 ${s * 0.25}px rgba(59,130,246,0.3),
              0 0 ${s * 0.5}px rgba(79,70,229,0.15)
            `,
        }}
      >
        {/* 顶部高光小圆 */}
        <div
          style={{
            position: "absolute",
            top: "18%",
            left: "22%",
            width: "28%",
            height: "18%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.75) 0%, transparent 100%)",
            filter: "blur(1px)",
            pointerEvents: "none",
          }}
        />
        {/* 底部反射光 */}
        <div
          style={{
            position: "absolute",
            bottom: "15%",
            right: "18%",
            width: "20%",
            height: "12%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(167,139,250,0.5) 0%, transparent 100%)",
            filter: "blur(2px)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* 处理中旋转光环 */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            width: s * 1.3,
            height: s * 1.3,
            borderRadius: "50%",
            border: `1px solid transparent`,
            borderTopColor: "rgba(59,130,246,0.6)",
            borderRightColor: "rgba(79,70,229,0.3)",
            animation: "orbRingRotate 1.5s linear infinite",
            pointerEvents: "none",
          }}
        />
      )}

      <style>{`
        @keyframes orbBreath {
          0%, 100% { transform: perspective(${s * 4}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1); }
          50% { transform: perspective(${s * 4}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.08); }
        }
        @keyframes orbGlowPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes orbRingRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
