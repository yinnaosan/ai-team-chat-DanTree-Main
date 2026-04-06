import { useEffect, useRef, useState } from "react";

interface ManusOrbProps {
  isActive?: boolean;
  size?: number;
  className?: string;
}

export function ManusOrb({ isActive = false, size = 48, className = "" }: ManusOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = orbRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      setTilt({ x: ((e.clientY - cy) / (r.height / 2)) * -12, y: ((e.clientX - cx) / (r.width / 2)) * 12 });
    };
    const onLeave = () => setTilt({ x: 0, y: 0 });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, []);

  const s = size;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: s, height: s }}>

      {/* 外层扩散光晕 */}
      <div style={{
        position: "absolute",
        width: s * 2.2, height: s * 2.2,
        borderRadius: "50%",
        background: isActive
          ? "radial-gradient(circle, rgba(46,204,113,0.18) 0%, rgba(26,122,67,0.07) 45%, transparent 70%)"
          : "radial-gradient(circle, rgba(46,204,113,0.08) 0%, transparent 60%)",
        animation: isActive ? "mOrb_outerGlow 2s ease-in-out infinite" : "mOrb_float 4s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* 内层光晕 */}
      <div style={{
        position: "absolute",
        width: s * 1.5, height: s * 1.5,
        borderRadius: "50%",
        background: isActive
          ? "radial-gradient(circle, rgba(46,204,113,0.32) 0%, rgba(26,122,67,0.14) 50%, transparent 75%)"
          : "radial-gradient(circle, rgba(46,204,113,0.15) 0%, transparent 65%)",
        animation: isActive ? "mOrb_innerGlow 2s ease-in-out infinite" : "mOrb_float 4s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* 旋转光环（激活时） */}
      {isActive && <>
        <div style={{
          position: "absolute", width: s * 1.38, height: s * 1.38,
          borderRadius: "50%",
          border: "1.5px solid transparent",
          borderTopColor: "rgba(46,204,113,0.75)",
          borderRightColor: "rgba(26,122,67,0.32)",
          animation: "mOrb_ring1 1.6s linear infinite",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: s * 1.18, height: s * 1.18,
          borderRadius: "50%",
          border: "1px solid transparent",
          borderBottomColor: "rgba(46,204,113,0.42)",
          borderLeftColor: "rgba(26,122,67,0.18)",
          animation: "mOrb_ring2 2.5s linear infinite",
          pointerEvents: "none",
        }} />
      </>}

      {/* 球体本体 */}
      <div
        ref={orbRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: s, height: s,
          borderRadius: "50%",
          position: "relative",
          cursor: "default",
          transform: `perspective(${s * 5}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${hovered && !isActive ? 1.06 : 1})`,
          transition: "transform 0.25s ease",
          animation: isActive ? "mOrb_breath 2s ease-in-out infinite" : "mOrb_float 4s ease-in-out infinite",
          background: `
            radial-gradient(circle at 32% 26%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 36%, transparent 52%),
            radial-gradient(circle at 70% 74%, rgba(26,122,67,0.55) 0%, transparent 42%),
            radial-gradient(circle at 50% 50%, #2ECC71 0%, #1a7a43 38%, #0a2e1a 72%, #040f09 100%)
          `,
          boxShadow: isActive
            ? `inset 0 ${s*.09}px ${s*.18}px rgba(255,255,255,0.28), inset 0 -${s*.07}px ${s*.14}px rgba(26,122,67,0.45), 0 0 ${s*.45}px rgba(46,204,113,0.65), 0 0 ${s*.9}px rgba(26,122,67,0.38), 0 0 ${s*1.4}px rgba(46,204,113,0.18), 0 ${s*.12}px ${s*.35}px rgba(0,0,0,0.55)`
            : `inset 0 ${s*.09}px ${s*.18}px rgba(255,255,255,0.22), inset 0 -${s*.07}px ${s*.14}px rgba(26,122,67,0.32), 0 0 ${s*.28}px rgba(46,204,113,0.32), 0 0 ${s*.55}px rgba(26,122,67,0.16), 0 ${s*.1}px ${s*.28}px rgba(0,0,0,0.45)`,
        }}
      >
        {/* 顶部主高光 */}
        <div style={{
          position: "absolute", top: "16%", left: "20%", width: "32%", height: "20%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.12) 60%, transparent 100%)",
          filter: `blur(${s * 0.018}px)`, pointerEvents: "none",
        }} />
        {/* 右上次高光 */}
        <div style={{
          position: "absolute", top: "22%", left: "56%", width: "13%", height: "9%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 100%)",
          filter: `blur(${s * 0.01}px)`, pointerEvents: "none",
        }} />
        {/* 底部反射 */}
        <div style={{
          position: "absolute", bottom: "14%", right: "16%", width: "22%", height: "14%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(110,231,168,0.55) 0%, transparent 100%)",
          filter: `blur(${s * 0.025}px)`, pointerEvents: "none",
        }} />
        {/* 菲涅耳边缘 */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle at 50% 108%, rgba(46,204,113,0.20) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />
      </div>

      <style>{`
        @keyframes mOrb_breath {
          0%,100% { transform: perspective(${s*5}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1); }
          50%      { transform: perspective(${s*5}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.10); }
        }
        @keyframes mOrb_float {
          0%,100% { transform: perspective(${s*5}px) translateY(0px) scale(1); }
          50%      { transform: perspective(${s*5}px) translateY(-4px) scale(1.02); }
        }
        @keyframes mOrb_outerGlow {
          0%,100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.20); }
        }
        @keyframes mOrb_innerGlow {
          0%,100% { opacity: 0.7; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.12); }
        }
        @keyframes mOrb_ring1 {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes mOrb_ring2 {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}
