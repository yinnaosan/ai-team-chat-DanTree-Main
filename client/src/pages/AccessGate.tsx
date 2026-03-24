import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";

// ── Full-body Robot SVG with mouse-tracking 3D tilt ──────────────────────────
function RobotFull({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const maxW = window.innerWidth / 2;
    const maxH = window.innerHeight / 2;
    // Tilt: max ±12deg
    const rx = -(dy / maxH) * 12;
    const ry = (dx / maxW) * 12;
    setTilt({ rx, ry });
    // Eye pupil offset: max ±5px
    const norm = Math.min(Math.sqrt(dx * dx + dy * dy) / Math.max(maxW, maxH), 1);
    setEyeOffset({
      x: (dx / maxW) * 5 * norm,
      y: (dy / maxH) * 5 * norm,
    });
  }, [mouseX, mouseY]);

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{
        transform: `perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: "transform 0.15s cubic-bezier(0.23, 1, 0.32, 1)",
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      <svg
        viewBox="0 0 360 580"
        width="360"
        height="580"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Body gradients */}
          <radialGradient id="headGrad" cx="50%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#1c1c1c" />
            <stop offset="60%" stopColor="#111111" />
            <stop offset="100%" stopColor="#080808" />
          </radialGradient>
          <radialGradient id="torsoGrad" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#181818" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </radialGradient>
          <radialGradient id="armGrad" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#161616" />
            <stop offset="100%" stopColor="#090909" />
          </radialGradient>
          <radialGradient id="legGrad" cx="50%" cy="20%" r="70%">
            <stop offset="0%" stopColor="#141414" />
            <stop offset="100%" stopColor="#080808" />
          </radialGradient>

          {/* Carbon fiber texture for body panels */}
          <pattern id="carbon" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="transparent" />
            <rect x="0" y="0" width="4" height="4" fill="rgba(255,255,255,0.012)" />
            <rect x="4" y="4" width="4" height="4" fill="rgba(255,255,255,0.012)" />
          </pattern>

          {/* Eye glow */}
          <radialGradient id="eyeCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#e0e8ff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#8899ff" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#aabbff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4466ff" stopOpacity="0" />
          </radialGradient>

          {/* Metal highlight */}
          <linearGradient id="metalTop" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="30%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="metalSide" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.04" />
          </linearGradient>

          {/* Filters */}
          <filter id="eyeBloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000000" floodOpacity="0.6" />
          </filter>
          <filter id="innerGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Ambient ground shadow ── */}
        <ellipse cx="180" cy="568" rx="100" ry="10" fill="#000000" opacity="0.5" />

        {/* ══════════════════════════════════════════════
            LEGS
        ══════════════════════════════════════════════ */}
        {/* Left leg upper */}
        <rect x="118" y="420" width="52" height="80" rx="12" fill="url(#legGrad)" filter="url(#softShadow)" />
        <rect x="118" y="420" width="52" height="80" rx="12" fill="url(#carbon)" />
        <rect x="118" y="420" width="52" height="80" rx="12" fill="none" stroke="#222222" strokeWidth="1" />
        <rect x="118" y="420" width="52" height="4" rx="2" fill="url(#metalTop)" />
        {/* Left knee joint */}
        <rect x="122" y="496" width="44" height="16" rx="8" fill="#0f0f0f" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="130" y="500" width="28" height="4" rx="2" fill="#1a1a1a" />
        {/* Left leg lower */}
        <rect x="120" y="508" width="48" height="52" rx="10" fill="url(#legGrad)" filter="url(#softShadow)" />
        <rect x="120" y="508" width="48" height="52" rx="10" fill="url(#carbon)" />
        <rect x="120" y="508" width="48" height="52" rx="10" fill="none" stroke="#1e1e1e" strokeWidth="1" />
        {/* Left foot */}
        <rect x="112" y="554" width="62" height="18" rx="8" fill="#0c0c0c" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="112" y="554" width="62" height="4" rx="2" fill="url(#metalTop)" />

        {/* Right leg upper */}
        <rect x="190" y="420" width="52" height="80" rx="12" fill="url(#legGrad)" filter="url(#softShadow)" />
        <rect x="190" y="420" width="52" height="80" rx="12" fill="url(#carbon)" />
        <rect x="190" y="420" width="52" height="80" rx="12" fill="none" stroke="#222222" strokeWidth="1" />
        <rect x="190" y="420" width="52" height="4" rx="2" fill="url(#metalTop)" />
        {/* Right knee joint */}
        <rect x="194" y="496" width="44" height="16" rx="8" fill="#0f0f0f" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="202" y="500" width="28" height="4" rx="2" fill="#1a1a1a" />
        {/* Right leg lower */}
        <rect x="192" y="508" width="48" height="52" rx="10" fill="url(#legGrad)" filter="url(#softShadow)" />
        <rect x="192" y="508" width="48" height="52" rx="10" fill="url(#carbon)" />
        <rect x="192" y="508" width="48" height="52" rx="10" fill="none" stroke="#1e1e1e" strokeWidth="1" />
        {/* Right foot */}
        <rect x="186" y="554" width="62" height="18" rx="8" fill="#0c0c0c" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="186" y="554" width="62" height="4" rx="2" fill="url(#metalTop)" />

        {/* ══════════════════════════════════════════════
            ARMS
        ══════════════════════════════════════════════ */}
        {/* Left arm upper */}
        <rect x="52" y="200" width="52" height="90" rx="18" fill="url(#armGrad)" filter="url(#softShadow)" />
        <rect x="52" y="200" width="52" height="90" rx="18" fill="url(#carbon)" />
        <rect x="52" y="200" width="52" height="90" rx="18" fill="none" stroke="#222222" strokeWidth="1" />
        <rect x="52" y="200" width="52" height="5" rx="2.5" fill="url(#metalTop)" />
        {/* Left elbow */}
        <ellipse cx="78" cy="294" rx="22" ry="14" fill="#0d0d0d" stroke="#1e1e1e" strokeWidth="1" />
        <ellipse cx="78" cy="294" rx="12" ry="8" fill="#111111" />
        <ellipse cx="78" cy="294" rx="5" ry="3" fill="#1a1a1a" />
        {/* Left arm lower */}
        <rect x="56" y="304" width="44" height="80" rx="14" fill="url(#armGrad)" filter="url(#softShadow)" />
        <rect x="56" y="304" width="44" height="80" rx="14" fill="url(#carbon)" />
        <rect x="56" y="304" width="44" height="80" rx="14" fill="none" stroke="#1e1e1e" strokeWidth="1" />
        {/* Left hand */}
        <rect x="50" y="378" width="56" height="36" rx="14" fill="#0c0c0c" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="50" y="378" width="56" height="6" rx="3" fill="url(#metalTop)" />
        {/* Left hand fingers hint */}
        {[58, 68, 78, 88].map(x => (
          <rect key={x} x={x} y="408" width="8" height="10" rx="4" fill="#111111" stroke="#1a1a1a" strokeWidth="0.5" />
        ))}

        {/* Right arm upper */}
        <rect x="256" y="200" width="52" height="90" rx="18" fill="url(#armGrad)" filter="url(#softShadow)" />
        <rect x="256" y="200" width="52" height="90" rx="18" fill="url(#carbon)" />
        <rect x="256" y="200" width="52" height="90" rx="18" fill="none" stroke="#222222" strokeWidth="1" />
        <rect x="256" y="200" width="52" height="5" rx="2.5" fill="url(#metalTop)" />
        {/* Right elbow */}
        <ellipse cx="282" cy="294" rx="22" ry="14" fill="#0d0d0d" stroke="#1e1e1e" strokeWidth="1" />
        <ellipse cx="282" cy="294" rx="12" ry="8" fill="#111111" />
        <ellipse cx="282" cy="294" rx="5" ry="3" fill="#1a1a1a" />
        {/* Right arm lower */}
        <rect x="260" y="304" width="44" height="80" rx="14" fill="url(#armGrad)" filter="url(#softShadow)" />
        <rect x="260" y="304" width="44" height="80" rx="14" fill="url(#carbon)" />
        <rect x="260" y="304" width="44" height="80" rx="14" fill="none" stroke="#1e1e1e" strokeWidth="1" />
        {/* Right hand */}
        <rect x="254" y="378" width="56" height="36" rx="14" fill="#0c0c0c" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="254" y="378" width="56" height="6" rx="3" fill="url(#metalTop)" />
        {/* Right hand fingers hint */}
        {[262, 272, 282, 292].map(x => (
          <rect key={x} x={x} y="408" width="8" height="10" rx="4" fill="#111111" stroke="#1a1a1a" strokeWidth="0.5" />
        ))}

        {/* ══════════════════════════════════════════════
            TORSO
        ══════════════════════════════════════════════ */}
        {/* Main torso */}
        <rect x="104" y="190" width="152" height="240" rx="24" fill="url(#torsoGrad)" filter="url(#softShadow)" />
        <rect x="104" y="190" width="152" height="240" rx="24" fill="url(#carbon)" />
        <rect x="104" y="190" width="152" height="240" rx="24" fill="none" stroke="#1e1e1e" strokeWidth="1.5" />
        <rect x="104" y="190" width="152" height="8" rx="4" fill="url(#metalTop)" />
        <rect x="104" y="190" width="4" height="240" rx="2" fill="url(#metalSide)" />

        {/* Chest panel */}
        <rect x="124" y="210" width="112" height="80" rx="12" fill="#0a0a0a" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="124" y="210" width="112" height="4" rx="2" fill="url(#metalTop)" />

        {/* Chest LED grid */}
        {[140, 155, 170, 185, 200, 215].map(x =>
          [224, 238, 252, 266, 280].map(y => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2"
              fill="#1e1e1e"
              opacity="0.8"
            />
          ))
        )}
        {/* Active chest LEDs */}
        {[[155, 238], [170, 252], [185, 238], [200, 252], [185, 266]].map(([x, y]) => (
          <circle key={`active-${x}-${y}`} cx={x} cy={y} r="2.5"
            fill="#ffffff" opacity="0.6" filter="url(#innerGlow)" />
        ))}

        {/* Center chest emblem */}
        <circle cx="180" cy="248" r="20" fill="#0d0d0d" stroke="#1e1e1e" strokeWidth="1.5" />
        <circle cx="180" cy="248" r="14" fill="#111111" stroke="#222222" strokeWidth="1" />
        <circle cx="180" cy="248" r="8" fill="#161616" />
        <circle cx="180" cy="248" r="4" fill="#ffffff" opacity="0.15" filter="url(#innerGlow)" />

        {/* Waist belt */}
        <rect x="104" y="400" width="152" height="24" rx="8" fill="#0c0c0c" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="104" y="400" width="152" height="4" rx="2" fill="url(#metalTop)" />
        {/* Belt buckle */}
        <rect x="164" y="404" width="32" height="16" rx="4" fill="#111111" stroke="#222222" strokeWidth="1" />
        <rect x="168" y="408" width="24" height="8" rx="2" fill="#161616" />
        <rect x="172" y="410" width="16" height="4" rx="2" fill="#ffffff" opacity="0.08" />

        {/* Side body panels */}
        <rect x="106" y="220" width="16" height="120" rx="6" fill="#0c0c0c" stroke="#1a1a1a" strokeWidth="0.5" />
        <rect x="238" y="220" width="16" height="120" rx="6" fill="#0c0c0c" stroke="#1a1a1a" strokeWidth="0.5" />
        {/* Side LED strips */}
        {[240, 260, 280, 300].map(y => (
          <rect key={`ls-${y}`} x="108" y={y} width="12" height="2" rx="1" fill="#ffffff" opacity="0.08" />
        ))}
        {[240, 260, 280, 300].map(y => (
          <rect key={`rs-${y}`} x="240" y={y} width="12" height="2" rx="1" fill="#ffffff" opacity="0.08" />
        ))}

        {/* Lower torso detail */}
        <rect x="130" y="308" width="100" height="60" rx="10" fill="#0a0a0a" stroke="#1a1a1a" strokeWidth="1" />
        {[140, 160, 180, 200, 210].map(x => (
          <rect key={`ld-${x}`} x={x} y="318" width="2" height="40" rx="1" fill="#ffffff" opacity="0.06" />
        ))}

        {/* Shoulder joints */}
        <circle cx="104" cy="210" r="22" fill="#0e0e0e" stroke="#1e1e1e" strokeWidth="1.5" />
        <circle cx="104" cy="210" r="14" fill="#111111" />
        <circle cx="104" cy="210" r="7" fill="#161616" />
        <circle cx="256" cy="210" r="22" fill="#0e0e0e" stroke="#1e1e1e" strokeWidth="1.5" />
        <circle cx="256" cy="210" r="14" fill="#111111" />
        <circle cx="256" cy="210" r="7" fill="#161616" />

        {/* ══════════════════════════════════════════════
            NECK
        ══════════════════════════════════════════════ */}
        <rect x="158" y="158" width="44" height="38" rx="8" fill="#0d0d0d" stroke="#1e1e1e" strokeWidth="1" />
        <rect x="158" y="158" width="44" height="4" rx="2" fill="url(#metalTop)" />
        {[166, 174, 182].map(y => (
          <rect key={`neck-${y}`} x="162" y={y} width="36" height="1.5" rx="0.75" fill="#ffffff" opacity="0.05" />
        ))}

        {/* ══════════════════════════════════════════════
            HEAD
        ══════════════════════════════════════════════ */}
        {/* Head main */}
        <rect x="96" y="60" width="168" height="104" rx="32" fill="url(#headGrad)" filter="url(#softShadow)" />
        <rect x="96" y="60" width="168" height="104" rx="32" fill="url(#carbon)" />
        <rect x="96" y="60" width="168" height="104" rx="32" fill="none" stroke="#1e1e1e" strokeWidth="1.5" />
        <rect x="96" y="60" width="168" height="8" rx="4" fill="url(#metalTop)" />

        {/* Head top highlight */}
        <path d="M128 62 Q180 56 232 62" stroke="#ffffff" strokeWidth="0.8" opacity="0.08" fill="none" />

        {/* Forehead panel */}
        <rect x="130" y="72" width="100" height="16" rx="6" fill="#0a0a0a" stroke="#1a1a1a" strokeWidth="1" />
        {/* Forehead LED dots */}
        {[144, 156, 168, 180, 192, 204, 216].map((x, i) => (
          <circle key={`fd-${x}`} cx={x} cy="80" r="2.5"
            fill="#ffffff"
            opacity={i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0.2 : 0.35}
          />
        ))}

        {/* Antenna */}
        <rect x="176" y="36" width="8" height="28" rx="4" fill="#0d0d0d" stroke="#1a1a1a" strokeWidth="1" />
        <circle cx="180" cy="32" r="10" fill="#0a0a0a" stroke="#1e1e1e" strokeWidth="1.5" />
        <circle cx="180" cy="32" r="6" fill="#111111" />
        <circle cx="180" cy="32" r="3" fill="#ffffff" opacity="0.5" filter="url(#eyeBloom)" />
        <circle cx="180" cy="32" r="1.5" fill="#ffffff" opacity="0.9" />

        {/* ── Eye sockets ── */}
        <rect x="110" y="96" width="60" height="44" rx="14" fill="#060606" stroke="#1a1a1a" strokeWidth="1.5" />
        <rect x="190" y="96" width="60" height="44" rx="14" fill="#060606" stroke="#1a1a1a" strokeWidth="1.5" />

        {/* ── Eyes with mouse tracking ── */}
        {/* Left eye glow halo */}
        <circle cx={140 + eyeOffset.x} cy={118 + eyeOffset.y} r="22"
          fill="url(#eyeGlow)" opacity="0.4" />
        {/* Left iris */}
        <circle cx={140 + eyeOffset.x} cy={118 + eyeOffset.y} r="16"
          fill="#0a0a14" />
        {/* Left pupil ring */}
        <circle cx={140 + eyeOffset.x} cy={118 + eyeOffset.y} r="12"
          fill="none" stroke="#333355" strokeWidth="1.5" />
        {/* Left pupil */}
        <circle cx={140 + eyeOffset.x} cy={118 + eyeOffset.y} r="8"
          fill="url(#eyeCore)" filter="url(#eyeBloom)" />
        {/* Left pupil center */}
        <circle cx={140 + eyeOffset.x} cy={118 + eyeOffset.y} r="4"
          fill="#050508" />
        {/* Left specular */}
        <circle cx={144 + eyeOffset.x * 0.4} cy={114 + eyeOffset.y * 0.4} r="2.5"
          fill="#ffffff" opacity="0.7" />
        <circle cx={137 + eyeOffset.x * 0.3} cy={122 + eyeOffset.y * 0.3} r="1.2"
          fill="#ffffff" opacity="0.3" />

        {/* Right eye glow halo */}
        <circle cx={220 + eyeOffset.x} cy={118 + eyeOffset.y} r="22"
          fill="url(#eyeGlow)" opacity="0.4" />
        {/* Right iris */}
        <circle cx={220 + eyeOffset.x} cy={118 + eyeOffset.y} r="16"
          fill="#0a0a14" />
        {/* Right pupil ring */}
        <circle cx={220 + eyeOffset.x} cy={118 + eyeOffset.y} r="12"
          fill="none" stroke="#333355" strokeWidth="1.5" />
        {/* Right pupil */}
        <circle cx={220 + eyeOffset.x} cy={118 + eyeOffset.y} r="8"
          fill="url(#eyeCore)" filter="url(#eyeBloom)" />
        {/* Right pupil center */}
        <circle cx={220 + eyeOffset.x} cy={118 + eyeOffset.y} r="4"
          fill="#050508" />
        {/* Right specular */}
        <circle cx={224 + eyeOffset.x * 0.4} cy={114 + eyeOffset.y * 0.4} r="2.5"
          fill="#ffffff" opacity="0.7" />
        <circle cx={217 + eyeOffset.x * 0.3} cy={122 + eyeOffset.y * 0.3} r="1.2"
          fill="#ffffff" opacity="0.3" />

        {/* ── Nose sensor ── */}
        <rect x="168" y="142" width="24" height="8" rx="4" fill="#0a0a0a" stroke="#1a1a1a" strokeWidth="1" />
        <circle cx="180" cy="146" r="2.5" fill="#ffffff" opacity="0.12" />

        {/* ── Mouth / speaker grille ── */}
        <rect x="120" y="154" width="120" height="22" rx="8" fill="#060606" stroke="#1a1a1a" strokeWidth="1" />
        {[130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230].map((x, i) => (
          <rect key={`sp-${x}`} x={x} y="159" width="2" height="12" rx="1"
            fill="#ffffff" opacity={i % 3 === 1 ? 0.18 : 0.07} />
        ))}

        {/* ── Side head panels ── */}
        <rect x="78" y="88" width="20" height="52" rx="8" fill="#0c0c0c" stroke="#1a1a1a" strokeWidth="1" />
        <rect x="262" y="88" width="20" height="52" rx="8" fill="#0c0c0c" stroke="#1a1a1a" strokeWidth="1" />
        {[96, 108, 120, 130].map(y => (
          <rect key={`lsp-${y}`} x="82" y={y} width="12" height="1.5" rx="0.75" fill="#ffffff" opacity="0.07" />
        ))}
        {[96, 108, 120, 130].map(y => (
          <rect key={`rsp-${y}`} x="266" y={y} width="12" height="1.5" rx="0.75" fill="#ffffff" opacity="0.07" />
        ))}
      </svg>
    </div>
  );
}

// ── Main AccessGate component ─────────────────────────────────────────────────
export default function AccessGate() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !accessLoading && accessData?.hasAccess) {
      navigate("/research");
    }
  }, [authLoading, accessLoading, accessData, navigate]);

  const verifyMutation = trpc.access.verify.useMutation({
    onSuccess: () => {
      toast.success("验证成功！欢迎进入 AI 协作平台");
      navigate("/research");
    },
    onError: (err) => {
      toast.error(err.message || "密码无效，请重试");
      setCode("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    verifyMutation.mutate({ code: code.trim() }, {
      onSettled: () => setSubmitting(false),
    });
  };

  // Loading state
  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#ffffff" }} />
          <p className="text-sm" style={{ color: "#555555", fontFamily: "'Inter', sans-serif" }}>正在验证身份...</p>
        </div>
      </div>
    );
  }

  if (accessData?.hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#ffffff" }} />
          <p className="text-sm" style={{ color: "#555555", fontFamily: "'Inter', sans-serif" }}>正在进入平台...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex overflow-hidden relative"
      style={{ background: "#0A0A0A", fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Top navigation bar (exactly like FinRobot Pro) ── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 z-20"
        style={{ height: "56px", borderBottom: "1px solid #141414" }}
      >
        {/* Left: Logo + Brand */}
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "#141414", border: "1px solid #222222" }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: "#ffffff", letterSpacing: "-0.01em" }}>
            DanTree
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: "#141414", color: "#888888", border: "1px solid #222222", letterSpacing: "0.02em" }}
          >
            Pro
          </span>
        </div>

        {/* Right: Subtitle */}
        <span className="text-xs" style={{ color: "#444444" }}>
          人工智能驱动的股票研究平台
        </span>
      </div>

      {/* ── Left: Full-body robot area (65%) ── */}
      <div
        className="hidden lg:flex flex-col relative overflow-hidden"
        style={{ width: "65%", paddingTop: "56px" }}
      >
        {/* Robot centered in left area */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Very subtle ambient glow behind robot */}
          <div
            className="absolute"
            style={{
              width: "500px",
              height: "500px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.015) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Robot with float animation */}
          <div style={{ animation: "finrobot-float 6s ease-in-out infinite" }}>
            <RobotFull mouseX={mousePos.x} mouseY={mousePos.y} />
          </div>
        </div>

        {/* Bottom-left tagline (exactly like FinRobot Pro) */}
        <div className="absolute bottom-10 left-10">
          <h2 className="text-3xl font-bold mb-2" style={{ color: "#ffffff", letterSpacing: "-0.03em" }}>
            智能金融洞察
          </h2>
          <p className="text-sm" style={{ color: "#444444", maxWidth: "320px", lineHeight: "1.6" }}>
            生成包含财务分析、估值模型和风险评估的专业股票研究报告
          </p>
        </div>
      </div>

      {/* ── Right: Login panel (35%) ── */}
      <div
        className="w-full flex flex-col items-center justify-center relative shrink-0"
        style={{
          width: "35%",
          minWidth: "360px",
          paddingTop: "56px",
          borderLeft: "1px solid #141414",
        }}
      >
        {/* Mobile brand (shown on small screens) */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "#141414", border: "1px solid #222222" }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>DanTree</span>
        </div>

        <div className="w-full px-12" style={{ maxWidth: "400px" }}>
          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-2xl font-bold mb-2"
              style={{ color: "#ffffff", letterSpacing: "-0.025em" }}
            >
              {!isAuthenticated ? "欢迎回来" : "访问验证"}
            </h1>
            <p className="text-sm" style={{ color: "#555555", lineHeight: "1.5" }}>
              {!isAuthenticated
                ? "登录以访问您的研究仪表板"
                : user
                  ? `已登录：${user.name || user.email || "用户"}，请输入访问密码`
                  : "此平台为私有系统，请输入访问密码继续"}
            </p>
          </div>

          {/* Login form area */}
          <div className="space-y-4">
            {!isAuthenticated ? (
              /* ── Not logged in: Manus OAuth button ── */
              <>
                <button
                  onClick={() => window.location.href = getLoginUrl()}
                  className="w-full flex items-center justify-center gap-2.5 text-sm font-medium transition-all"
                  style={{
                    height: "44px",
                    borderRadius: "8px",
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "#222222";
                    e.currentTarget.style.borderColor = "#333333";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "#1a1a1a";
                    e.currentTarget.style.borderColor = "#2a2a2a";
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  使用 Manus 账号登录
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "#1a1a1a" }} />
                  <span className="text-xs" style={{ color: "#333333" }}>或</span>
                  <div className="flex-1 h-px" style={{ background: "#1a1a1a" }} />
                </div>

                <p className="text-center text-xs" style={{ color: "#444444" }}>
                  登录后将自动返回此页面完成验证
                </p>
              </>
            ) : (
              /* ── Logged in: access code form ── */
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Access code field */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: "#555555", letterSpacing: "0.04em" }}>
                    访问密码
                  </label>
                  <input
                    type="text"
                    placeholder="请输入访问密码..."
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoFocus
                    disabled={submitting}
                    className="w-full outline-none transition-all font-mono tracking-widest"
                    style={{
                      height: "44px",
                      borderRadius: "8px",
                      padding: "0 14px",
                      background: "#111111",
                      border: "1px solid #1e1e1e",
                      color: "#ffffff",
                      fontSize: "14px",
                      caretColor: "#ffffff",
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = "#333333";
                      e.currentTarget.style.background = "#141414";
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = "#1e1e1e";
                      e.currentTarget.style.background = "#111111";
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !code.trim()}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    height: "44px",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#000000",
                    cursor: submitting || !code.trim() ? "not-allowed" : "pointer",
                    border: "none",
                  }}
                  onMouseEnter={e => {
                    if (!submitting && code.trim()) e.currentTarget.style.background = "#e8e8e8";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "#ffffff";
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      验证中...
                    </>
                  ) : "进入平台"}
                </button>

                <p className="text-center text-xs" style={{ color: "#444444" }}>
                  没有密码？请联系平台管理员获取访问权限
                </p>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="mt-10 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#3a7a3a" }} />
            <span className="text-xs" style={{ color: "#333333" }}>系统就绪</span>
          </div>
        </div>
      </div>

      {/* Float animation keyframes */}
      <style>{`
        @keyframes finrobot-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}
