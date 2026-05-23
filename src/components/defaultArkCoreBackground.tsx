type DefaultArkCoreBackgroundProps = {
  visible: boolean;
};

const WALL_HEX_BACKGROUND = `url("data:image/svg+xml,%3Csvg width='180' height='156' viewBox='0 0 180 156' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.82' stroke-width='5' stroke-linejoin='round'%3E%3Cpath d='M45 3 L90 29 L90 81 L45 107 L0 81 L0 29 Z'/%3E%3Cpath d='M135 3 L180 29 L180 81 L135 107 L90 81 L90 29 Z'/%3E%3Cpath d='M90 81 L135 107 L135 159 L90 185 L45 159 L45 107 Z'/%3E%3C/g%3E%3C/svg%3E")`;

const FLOOR_HEX_BACKGROUND = `url("data:image/svg+xml,%3Csvg width='180' height='156' viewBox='0 0 180 156' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.95' stroke-width='4' stroke-linejoin='round'%3E%3Cpath d='M45 3 L90 29 L90 81 L45 107 L0 81 L0 29 Z'/%3E%3Cpath d='M135 3 L180 29 L180 81 L135 107 L90 81 L90 29 Z'/%3E%3Cpath d='M90 81 L135 107 L135 159 L90 185 L45 159 L45 107 Z'/%3E%3C/g%3E%3C/svg%3E")`;

export function DefaultArkCoreBackground({ visible }: DefaultArkCoreBackgroundProps) {
  if (!visible) {
    return null;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden ark-default-bg-root">
      <div className="ark-default-bg-prism" />
      <div className="ark-default-bg-vignette" />
      <div className="ark-default-bg-wall" />
      <div className="ark-default-bg-floor" />
      <div className="ark-default-bg-glow" />

      <style jsx>{`
        .ark-default-bg-root {
          perspective: 1000px;
          transform-style: preserve-3d;
          background:
            radial-gradient(circle at 50% 82%, rgba(255,255,255,1) 0 0.5%, rgba(255,255,255,0.92) 0 8%, transparent 30%),
            radial-gradient(circle at 50% 46%, rgba(121,225,255,0.42), transparent 34%),
            radial-gradient(circle at 26% 28%, rgba(255,168,210,0.32), transparent 28%),
            radial-gradient(circle at 78% 24%, rgba(185,170,255,0.28), transparent 30%),
            linear-gradient(180deg, #cdeffc 0%, #e8f9ff 48%, #f9fdff 100%);
          isolation: isolate;
        }

        .ark-default-bg-prism {
          position: absolute;
          inset: -12%;
          z-index: 1;
          background:
            linear-gradient(112deg, transparent 0 24%, rgba(255,130,190,0.32) 31%, rgba(113,226,255,0.35) 39%, transparent 48%),
            linear-gradient(68deg, transparent 0 56%, rgba(255,198,226,0.28) 64%, rgba(132,224,255,0.27) 71%, transparent 80%);
          filter: blur(12px);
          opacity: 0.82;
          animation: ark-default-bg-prism-shift 13s ease-in-out infinite alternate;
        }

        .ark-default-bg-vignette {
          position: absolute;
          inset: 0;
          z-index: 5;
          background: radial-gradient(circle at center, transparent 0 42%, rgba(54,99,132,0.22) 100%);
          mix-blend-mode: multiply;
        }

        .ark-default-bg-wall {
          position: absolute;
          left: -8vw;
          right: -8vw;
          top: -8vh;
          height: 76vh;
          z-index: 2;
          opacity: 0.92;
          transform: translateZ(-260px) rotateX(0deg);
          background-image: ${WALL_HEX_BACKGROUND};
          background-repeat: repeat;
          background-size: 180px 156px;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 7px rgba(115,226,255,0.88)) drop-shadow(0 0 18px rgba(255,155,207,0.58));
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0.78) 55%, transparent 100%);
          animation: ark-default-bg-wall-drift 18s linear infinite;
        }

        .ark-default-bg-floor {
          position: absolute;
          left: -18vw;
          right: -18vw;
          bottom: -24vh;
          height: 58vh;
          z-index: 3;
          transform-origin: center bottom;
          transform: rotateX(64deg) translateY(2vh);
          background-image: ${FLOOR_HEX_BACKGROUND};
          background-repeat: repeat;
          background-size: 210px 182px;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 7px rgba(98,225,255,0.9)) drop-shadow(0 0 18px rgba(255,161,208,0.72));
          opacity: 0.98;
          animation: ark-default-bg-floor-flow 16s linear infinite;
        }

        .ark-default-bg-glow {
          position: absolute;
          left: 50%;
          bottom: 13vh;
          width: min(60vw, 900px);
          height: 24vh;
          z-index: 4;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(255,255,255,0.98) 0 8%, rgba(122,226,255,0.52) 24%, rgba(255,170,214,0.26) 42%, transparent 70%);
          filter: blur(14px);
          opacity: 0.95;
          animation: ark-default-bg-floor-glow 4.8s ease-in-out infinite;
        }

        @keyframes ark-default-bg-prism-shift {
          from { transform: translate3d(-2%, -1%, 0) rotate(-1deg); }
          to { transform: translate3d(2%, 1%, 0) rotate(1deg); }
        }

        @keyframes ark-default-bg-wall-drift {
          from { background-position: 0 0; }
          to { background-position: 180px 0; }
        }

        @keyframes ark-default-bg-floor-flow {
          from { background-position: 0 0; }
          to { background-position: 210px 182px; }
        }

        @keyframes ark-default-bg-floor-glow {
          0%, 100% { transform: translateX(-50%) scaleX(0.96); opacity: 0.78; }
          50% { transform: translateX(-50%) scaleX(1.08); opacity: 1; }
        }

        @media (max-width: 720px) {
          .ark-default-bg-wall {
            background-size: 140px 121px;
          }

          .ark-default-bg-floor {
            background-size: 160px 139px;
          }
        }
      `}</style>
    </div>
  );
}