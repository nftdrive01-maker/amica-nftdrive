import { useEffect, useRef, useState } from "react";

type DefaultArkCoreAvatarProps = {
  visible: boolean;
  speaking: boolean;
};

const PARTICLE_ITEMS = Array.from({ length: 64 }, (_, index) => ({
  id: index,
  x: `${((index * 17) % 100) + ((index % 4) * 1.2)}%`,
  duration: `${7.5 + (index % 8) * 1.35}s`,
  shift: `${-78 + (index * 19) % 156}px`,
  size: `${0.9 + (index % 6) * 0.42}px`,
  delay: `${-((index * 1.35) % 18)}s`,
}));

export function DefaultArkCoreAvatar({ visible, speaking }: DefaultArkCoreAvatarProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [speechPhase, setSpeechPhase] = useState<"idle" | "open" | "closed">("idle");

  useEffect(() => {
    if (!visible || typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 18;
      const y = (event.clientY / window.innerHeight - 0.5) * -14;

      wrapRef.current?.style.setProperty("--ark-shadow-x", `${x}px`);
      wrapRef.current?.style.setProperty("--ark-shadow-y", `${y}px`);
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setSpeechPhase("idle");
      return;
    }

    if (!speaking) {
      setSpeechPhase("idle");
      return;
    }

    let frame = 0;
    setSpeechPhase("open");

    const timerId = window.setInterval(() => {
      frame += 1;
      setSpeechPhase(frame % 2 === 0 ? "open" : "closed");
    }, 180);

    return () => {
      window.clearInterval(timerId);
      setSpeechPhase("idle");
    };
  }, [speaking, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      data-speaking={speaking ? "true" : "false"}
      data-speech-phase={speechPhase}
    >
      <header className="ark-core-brand">
        <h1>
          Ark-i <span>Core</span>
        </h1>
        <p>AI CORE SYSTEM</p>
      </header>

      <div className="ark-core-particles" aria-hidden="true">
        {PARTICLE_ITEMS.map((particle) => (
          <i
            key={particle.id}
            className="ark-core-particle"
            style={{
              ["--x" as string]: particle.x,
              ["--d" as string]: particle.duration,
              ["--s" as string]: particle.shift,
              ["--size" as string]: particle.size,
              ["--delay" as string]: particle.delay,
            }}
          />
        ))}
      </div>

      <div className="grid h-full w-full place-items-center">
        <div className="ark-core-wrap" ref={wrapRef}>
          <div className="ark-core-orbit ark-core-orbit-outer" />
          <div className="ark-core-orbit ark-core-orbit-inner" />
          <div className="ark-core-scanline" />
          <div className="ark-core-lensflare" />
          <div className="ark-core-aura" />
          <div className="ark-core-prism-band" />
          <div className="ark-core-orb" />
        </div>
      </div>

      <style jsx>{`
        .ark-core-brand {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, calc(-50% + min(21vw, 220px)));
          z-index: 5;
          width: min(78vw, 720px);
          color: rgba(36, 83, 112, 0.86);
          text-shadow: 0 0 18px rgba(255,255,255,0.65);
          letter-spacing: 0.08em;
          text-align: center;
          user-select: none;
        }

        .ark-core-brand h1 {
          margin: 0;
          font-size: clamp(34px, 4.2vw, 68px);
          font-weight: 300;
          line-height: 1;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .ark-core-brand span {
          font-size: clamp(12px, 1vw, 16px);
          color: rgba(41, 185, 220, 0.9);
          font-weight: 500;
          vertical-align: middle;
        }

        .ark-core-brand p {
          margin: 14px 0 0;
          font-size: 13px;
          color: rgba(36, 83, 112, 0.52);
          letter-spacing: 0.2em;
        }

        .ark-core-wrap {
          --ark-shadow-x: 0px;
          --ark-shadow-y: 0px;
          --ark-speaking-boost: 0;
          position: relative;
          width: min(46vw, 460px);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          transform-style: preserve-3d;
          filter: drop-shadow(var(--ark-shadow-x) var(--ark-shadow-y) 32px rgba(115, 226, 255, 0.42));
          animation: ark-core-float 5.8s ease-in-out infinite;
        }

        [data-speaking="true"] .ark-core-wrap {
          --ark-speaking-boost: 1;
        }

        .ark-core-particles {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }

        .ark-core-particle {
          position: absolute;
          left: var(--x);
          top: 105%;
          width: var(--size);
          height: var(--size);
          border-radius: 999px;
          background: rgba(255,255,255,0.9);
          box-shadow:
            0 0 10px rgba(255,255,255,0.94),
            0 0 20px rgba(107,228,255,0.76),
            0 0 32px rgba(255,164,213,0.42);
          animation: ark-core-rise var(--d) linear infinite;
          animation-delay: var(--delay);
        }

        .ark-core-orbit {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.26);
          background: radial-gradient(circle, transparent 58%, rgba(255,255,255,0.06) 68%, transparent 78%);
          box-shadow:
            0 0 24px rgba(103,230,255,0.18),
            inset 0 0 16px rgba(255,255,255,0.08);
        }

        .ark-core-orbit-outer {
          width: 88%;
          aspect-ratio: 1;
          transform: rotateX(72deg) rotateZ(24deg);
          opacity: 0.62;
          animation: ark-core-spin-outer 14s linear infinite;
        }

        [data-speaking="true"] .ark-core-orbit-outer {
          opacity: 0.88;
          animation-duration: 7s;
          box-shadow:
            0 0 36px rgba(103,230,255,0.34),
            inset 0 0 20px rgba(255,255,255,0.12);
        }

        .ark-core-orbit-inner {
          width: 68%;
          aspect-ratio: 1;
          transform: rotateX(72deg) rotateZ(-18deg);
          opacity: 0.5;
          animation: ark-core-spin-inner 10s linear infinite reverse;
        }

        [data-speaking="true"] .ark-core-orbit-inner {
          opacity: 0.76;
          animation-duration: 5.4s;
        }

        .ark-core-scanline {
          position: absolute;
          width: 132%;
          height: 12%;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), rgba(103,230,255,0.65), rgba(255,162,211,0.34), transparent);
          filter: blur(10px);
          opacity: 0.56;
          transform: rotate(-12deg) translateY(-16%);
          animation: ark-core-scan 4.8s ease-in-out infinite;
        }

        [data-speaking="true"] .ark-core-scanline {
          opacity: 0.92;
          filter: blur(8px);
          animation-duration: 1.35s;
        }

        .ark-core-lensflare {
          position: absolute;
          width: 110%;
          height: 110%;
          border-radius: 50%;
          background:
            radial-gradient(circle at 26% 24%, rgba(255,255,255,0.86), transparent 10%),
            radial-gradient(circle at 70% 36%, rgba(255,183,220,0.28), transparent 18%),
            linear-gradient(120deg, transparent 36%, rgba(255,255,255,0.22) 46%, rgba(103,230,255,0.18) 52%, transparent 62%);
          opacity: 0.64;
          mix-blend-mode: screen;
          animation: ark-core-flare 8s ease-in-out infinite alternate;
        }

        [data-speaking="true"] .ark-core-lensflare {
          opacity: 0.92;
          animation-duration: 3.4s;
        }

        .ark-core-aura {
          position: absolute;
          width: 74%;
          aspect-ratio: 1;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.86), rgba(114,230,255,0.38) 28%, rgba(255,164,211,0.25) 46%, transparent 72%);
          filter: blur(32px);
          opacity: 0.82;
          animation: ark-core-breathe 4.2s ease-in-out infinite;
        }

        [data-speaking="true"] .ark-core-aura {
          opacity: 0.98;
          filter: blur(38px);
          animation-duration: 0.82s;
        }

        .ark-core-prism-band {
          position: absolute;
          width: 180%;
          height: 20%;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(255,160,210,0.52), rgba(255,255,255,0.72), rgba(103,230,255,0.56), transparent);
          filter: blur(8px);
          transform: rotate(-14deg);
          opacity: 0.72;
          animation: ark-core-band-move 7s ease-in-out infinite alternate;
        }

        [data-speaking="true"] .ark-core-prism-band {
          opacity: 0.94;
          filter: blur(6px);
          animation-duration: 1.8s;
        }

        .ark-core-orb {
          position: absolute;
          width: 56%;
          aspect-ratio: 1;
          border-radius: 50%;
          overflow: hidden;
          background:
            radial-gradient(circle at 28% 18%, rgba(255,255,255,0.98), transparent 10%),
            radial-gradient(circle at 36% 28%, rgba(214,252,255,0.86), transparent 22%),
            radial-gradient(circle at 66% 32%, rgba(255,177,218,0.58), transparent 24%),
            radial-gradient(circle at 38% 72%, rgba(184,166,255,0.58), transparent 26%),
            radial-gradient(circle at 52% 52%, rgba(78,220,246,0.72), transparent 35%),
            radial-gradient(circle at 52% 54%, rgba(255,255,255,0.52), rgba(155,231,255,0.28) 48%, rgba(61,154,225,0.22) 70%, rgba(255,255,255,0.08) 100%);
          border: 1px solid rgba(255,255,255,0.62);
          box-shadow:
            0 0 18px rgba(255,255,255,0.98),
            0 0 46px rgba(99,224,255,0.76),
            0 0 82px rgba(255,157,208,0.48),
            inset 18px 20px 36px rgba(255,255,255,0.48),
            inset -18px -22px 42px rgba(54,129,204,0.28);
          backdrop-filter: blur(6px);
          transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
          animation: ark-core-orb-float 4.6s ease-in-out infinite;
        }

        [data-speaking="true"] .ark-core-orb {
          transform: scale(1.06);
          filter: saturate(1.18) brightness(1.08);
          box-shadow:
            0 0 22px rgba(255,255,255,1),
            0 0 62px rgba(99,224,255,0.92),
            0 0 112px rgba(255,157,208,0.72),
            inset 18px 20px 36px rgba(255,255,255,0.58),
            inset -18px -22px 42px rgba(54,129,204,0.34);
        }

        [data-speaking="true"][data-speech-phase="open"] .ark-core-orb {
          transform: translateY(-0.3vh) scale(1.09, 1.03);
          filter: saturate(1.22) brightness(1.12);
        }

        [data-speaking="true"][data-speech-phase="closed"] .ark-core-orb {
          transform: translateY(0.2vh) scale(1.03, 0.97);
          filter: saturate(1.1) brightness(1.04);
        }

        .ark-core-orb::before {
          content: "";
          position: absolute;
          inset: -6%;
          border-radius: 50%;
          background-image: url("data:image/svg+xml,%3Csvg width='52' height='45' viewBox='0 0 52 45' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23297ad2' stroke-opacity='0.68' stroke-width='2' stroke-linejoin='round'%3E%3Cpath d='M13 1 L26 8.5 L26 23.5 L13 31 L0 23.5 L0 8.5 Z'/%3E%3Cpath d='M39 1 L52 8.5 L52 23.5 L39 31 L26 23.5 L26 8.5 Z'/%3E%3Cpath d='M26 23.5 L39 31 L39 46 L26 53.5 L13 46 L13 31 Z'/%3E%3C/g%3E%3C/svg%3E");
          background-size: 34px 30px;
          opacity: 0.82;
          mix-blend-mode: multiply;
          transform: scale(1.05);
          animation: ark-core-orb-hex-move 11s linear infinite;
        }

        .ark-core-orb::after {
          content: "";
          position: absolute;
          inset: 26%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,1) 0 10%, rgba(99,232,255,0.88) 18%, rgba(255,158,211,0.5) 44%, transparent 70%);
          filter: blur(2px);
          box-shadow:
            0 0 20px rgba(255,255,255,0.92),
            0 0 42px rgba(88,220,255,0.82),
            0 0 58px rgba(255,153,213,0.48);
          animation: ark-core-pulse 2.8s ease-in-out infinite;
        }

        [data-speaking="true"] .ark-core-orb::after {
          animation-duration: 0.68s;
          box-shadow:
            0 0 28px rgba(255,255,255,0.98),
            0 0 56px rgba(88,220,255,0.96),
            0 0 86px rgba(255,153,213,0.72);
        }

        [data-speaking="true"][data-speech-phase="open"] .ark-core-orb::after {
          inset: 23% 27% 20% 27%;
          opacity: 1;
          filter: blur(1.5px) brightness(1.12);
        }

        [data-speaking="true"][data-speech-phase="closed"] .ark-core-orb::after {
          inset: 29% 28% 28% 28%;
          opacity: 0.82;
          filter: blur(2.4px) brightness(0.96);
        }

        @keyframes ark-core-float {
          0%, 100% { transform: translateY(-1.5vh) rotateX(0deg) rotateY(-2deg); }
          50% { transform: translateY(-6.8vh) rotateX(1deg) rotateY(2deg); }
        }

        @keyframes ark-core-orb-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-1.2vh) scale(1.015); }
        }

        @keyframes ark-core-rise {
          0% { transform: translate3d(0, 0, 0); opacity: 0; }
          12% { opacity: 0.85; }
          78% { opacity: 0.55; }
          100% { transform: translate3d(var(--s), -120vh, 0); opacity: 0; }
        }

        @keyframes ark-core-spin-outer {
          from { transform: rotateX(72deg) rotateZ(24deg); }
          to { transform: rotateX(72deg) rotateZ(384deg); }
        }

        @keyframes ark-core-spin-inner {
          from { transform: rotateX(72deg) rotateZ(-18deg); }
          to { transform: rotateX(72deg) rotateZ(-378deg); }
        }

        @keyframes ark-core-scan {
          0%, 100% { transform: rotate(-12deg) translateY(-26%); opacity: 0.2; }
          50% { transform: rotate(-12deg) translateY(36%); opacity: 0.82; }
        }

        @keyframes ark-core-flare {
          from { transform: rotate(-3deg) scale(0.96); opacity: 0.42; }
          to { transform: rotate(4deg) scale(1.04); opacity: 0.74; }
        }

        @keyframes ark-core-breathe {
          0%, 100% { scale: 0.94; opacity: 0.66; }
          50% { scale: 1.08; opacity: 0.96; }
        }

        @keyframes ark-core-band-move {
          from { translate: -12% -12%; }
          to { translate: 12% 12%; }
        }

        @keyframes ark-core-orb-hex-move {
          from { background-position: 0 0; transform: rotate(0deg) scale(1.05); }
          to { background-position: 68px 60px; transform: rotate(8deg) scale(1.05); }
        }

        @keyframes ark-core-pulse {
          0%, 100% { scale: 0.92; opacity: 0.66; }
          50% { scale: 1.16; opacity: 0.98; }
        }

        @media (max-width: 720px) {
          .ark-core-brand {
            width: min(90vw, 420px);
            transform: translate(-50%, calc(-50% + min(34vw, 190px)));
          }

          .ark-core-brand p {
            display: none;
          }

          .ark-core-wrap {
            width: min(72vw, 420px);
          }
        }
      `}</style>
    </div>
  );
}