import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export type KodaOrbitDot = {
  angle: number;
  size: number;
};

type KodaSphereProps = {
  active?: boolean;
  chargeLevel?: number;
  maxCharge?: number;
  orbitDots?: KodaOrbitDot[];
  size?: number;
  style?: CSSProperties;
};

export const DEFAULT_MAX_SPHERE_CHARGE = 5;

export const DEFAULT_KODA_ORBIT_DOTS: KodaOrbitDot[] = [
  { angle: 294, size: 3.8 },
  { angle: 180, size: 3.35 },
  { angle: 167, size: 2.35 },
  { angle: 64, size: 3.55 },
];

const surfacePatches = [
  { cx: 78, cy: 91, r: 8.5, opacity: 0.075, color: [220, 220, 214], warm: [255, 226, 168] },
  { cx: 93, cy: 78, r: 5.2, opacity: 0.05, color: [170, 170, 164], warm: [216, 184, 124] },
  { cx: 113, cy: 82, r: 10.5, opacity: 0.06, color: [145, 145, 138], warm: [202, 169, 110] },
  { cx: 139, cy: 88, r: 7.6, opacity: 0.065, color: [210, 210, 204], warm: [246, 211, 150] },
  { cx: 152, cy: 108, r: 5.8, opacity: 0.05, color: [160, 160, 154], warm: [218, 176, 108] },
  { cx: 136, cy: 118, r: 12.2, opacity: 0.07, color: [120, 120, 114], warm: [185, 145, 88] },
  { cx: 150, cy: 134, r: 7.2, opacity: 0.046, color: [190, 190, 184], warm: [231, 195, 132] },
  { cx: 122, cy: 145, r: 9.4, opacity: 0.06, color: [138, 138, 132], warm: [197, 158, 98] },
  { cx: 96, cy: 145, r: 6.8, opacity: 0.055, color: [226, 226, 218], warm: [255, 224, 160] },
  { cx: 78, cy: 130, r: 10.8, opacity: 0.063, color: [148, 148, 142], warm: [205, 167, 108] },
  { cx: 71, cy: 109, r: 5.5, opacity: 0.052, color: [212, 212, 205], warm: [242, 207, 145] },
  { cx: 101, cy: 104, r: 6.2, opacity: 0.045, color: [130, 130, 124], warm: [191, 151, 88] },
  { cx: 123, cy: 100, r: 5.4, opacity: 0.04, color: [238, 238, 228], warm: [255, 232, 174] },
  { cx: 110, cy: 128, r: 13.5, opacity: 0.052, color: [102, 102, 98], warm: [164, 128, 76] },
  { cx: 88, cy: 117, r: 4.6, opacity: 0.048, color: [235, 235, 226], warm: [255, 228, 166] },
] as const;

function mixChannel(from: number, to: number, ratio: number) {
  return Math.round(from + (to - from) * ratio);
}

function mixRgb(from: [number, number, number], to: [number, number, number], ratio: number) {
  return `rgb(${mixChannel(from[0], to[0], ratio)}, ${mixChannel(from[1], to[1], ratio)}, ${mixChannel(from[2], to[2], ratio)})`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function KodaSphere({
  active = false,
  chargeLevel = active ? DEFAULT_MAX_SPHERE_CHARGE : 0,
  maxCharge = DEFAULT_MAX_SPHERE_CHARGE,
  orbitDots = DEFAULT_KODA_ORBIT_DOTS,
  size = 220,
  style,
}: KodaSphereProps) {
  const rawId = useId().replace(/:/g, '');
  const id = (name: string) => `${rawId}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const targetCharge = Math.max(0, Math.min(chargeLevel, maxCharge));
  const [animatedCharge, setAnimatedCharge] = useState(targetCharge);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startCharge = animatedCharge;
    const delta = targetCharge - startCharge;

    if (Math.abs(delta) < 0.001) {
      setAnimatedCharge(targetCharge);
      return undefined;
    }

    const duration = 1050;
    const startedAt = performance.now();
    const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = easeOutCubic(progress);

      setAnimatedCharge(startCharge + delta * eased);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        animationFrameRef.current = null;
        setAnimatedCharge(targetCharge);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [targetCharge]);

  const charge = Math.max(0, Math.min(animatedCharge, maxCharge));
  const chargeRatio = maxCharge > 0 ? charge / maxCharge : 0;
  const firstPhaseRatio = maxCharge > 0 ? 1 / maxCharge : 0;
  const phase1 = clamp01(charge);
  const phase2 = clamp01(charge - 1);
  const phase3 = clamp01(charge - 2);
  const phase4 = clamp01(charge - 3);
  const phase5 = clamp01(charge - 4);
  const coreSizeRatio = firstPhaseRatio * phase1;
  const coreLightRatio = firstPhaseRatio * (phase1 + phase2 * 0.25 + phase3 * 0.18 + phase4 * 0.14 + phase5 * 0.12);
  const nebulaRatio = chargeRatio;
  const nebulaStageBase = phase1 * 0.3 + phase2 * 0.18 + phase3 * 0.19 + phase4 * 0.17 + phase5 * 0.16;
  const surfaceReveal = 0.22 + chargeRatio * 0.78;
  const finalCoreLight = phase5;
  const isCharged = charge > 0 || active;
  const glow = 1 + coreLightRatio * 2.45;
  const coreColor = mixRgb([255, 255, 255], [255, 244, 208], coreLightRatio);
  const hazeColor = mixRgb([218, 218, 218], [255, 217, 144], nebulaRatio);
  const softColor = mixRgb([216, 216, 216], [255, 197, 111], nebulaRatio);
  const coreMidColor = mixRgb([244, 244, 244], [255, 240, 194], coreLightRatio);
  const coreDistantColor = mixRgb([154, 154, 154], [138, 101, 54], coreLightRatio);
  const fieldDistantColor = mixRgb([153, 153, 153], [122, 91, 54], nebulaRatio);
  const wideHazeMidColor = mixRgb([238, 238, 238], [255, 236, 200], nebulaRatio);
  const wideHazeDistantColor = mixRgb([119, 119, 119], [111, 84, 51], nebulaRatio);
  const coreHazeOpacity = 0.43 + coreLightRatio * 0.12;
  const coreHotOpacity = 0.94 + coreLightRatio * 0.12;
  const coreRadius = 21 + coreSizeRatio * 4.5;
  const coreBlurRadius = 34 + coreSizeRatio * 18;
  const innerSphereRadius = 67;
  const center = 110;
  const outerRadius = 94;
  const dotRadius = 3.8;
  const outerOrbitRed = Math.round(255);
  const outerOrbitGreen = Math.round(255 - 42 * chargeRatio);
  const outerOrbitBlue = Math.round(255 - 112 * chargeRatio);
  const outerOrbitOpacity = 0.34 - chargeRatio * 0.23;
  const orbitDotGreen = Math.round(255 - 38 * chargeRatio);
  const orbitDotBlue = Math.round(255 - 95 * chargeRatio);
  const orbitDotOpacity = 0.64 - chargeRatio * 0.34;
  const zeroPhaseOpacity = 1 - chargeRatio;

  return (
    <>
      <style>
        {`
          .koda-flare {
            transform-box: view-box;
            transform-origin: 110px 110px;
            stroke-dasharray: 24;
            stroke-dashoffset: 0;
          }

          .koda-charge-burst {
            animation: kodaChargeBurst 1.35s ease-out both;
            transform-box: view-box;
            transform-origin: 110px 110px;
          }

          .koda-inner-ring-charge {
            animation: kodaInnerRingCharge 1.4s ease-out both;
            transform-box: view-box;
            transform-origin: 110px 110px;
          }

          .koda-inner-ring-charge circle:nth-child(4) {
            animation: kodaRingSpark 1.15s ease-out both;
            transform-box: view-box;
            transform-origin: 110px 110px;
          }

          @keyframes kodaChargeBurst {
            0% {
              opacity: 0;
              transform: scale(.44);
            }
            32% {
              opacity: .58;
              transform: scale(.86);
            }
            100% {
              opacity: 0;
              transform: scale(1.18);
            }
          }

          @keyframes kodaInnerRingCharge {
            0% {
              opacity: 0;
              transform: scale(.985);
            }
            24% {
              opacity: 1;
              transform: scale(1.006);
            }
            100% {
              opacity: .94;
              transform: scale(1);
            }
          }

          @keyframes kodaRingSpark {
            0% {
              opacity: 0;
              stroke-dashoffset: 86;
              transform: rotate(-55deg);
            }
            28% {
              opacity: .95;
            }
            100% {
              opacity: .24;
              stroke-dashoffset: -210;
              transform: rotate(35deg);
            }
          }

        `}
      </style>
      <svg
        aria-hidden="true"
        height={size}
        style={{ display: 'block', overflow: 'visible', ...style }}
        viewBox="0 0 220 220"
        width={size}
      >
        <defs>
        <radialGradient id={id('koda-core-hot')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={coreColor} stopOpacity={1} />
          <stop offset="10%" stopColor={coreColor} stopOpacity={0.96 * glow} />
          <stop offset="19%" stopColor={coreMidColor} stopOpacity={0.5 + coreLightRatio * 0.3} />
          <stop offset="34%" stopColor={softColor} stopOpacity={0.16 - nebulaRatio * 0.06 + nebulaRatio * 0.07} />
          <stop offset="62%" stopColor={coreDistantColor} stopOpacity={0.035 - coreLightRatio * 0.023 + coreLightRatio * 0.008} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>

        <radialGradient id={id('koda-soft-field')} cx="49%" cy="49%" r="54%">
          <stop offset="0%" stopColor={hazeColor} stopOpacity={0.19 - nebulaRatio * 0.05 + nebulaRatio * 0.08} />
          <stop offset="34%" stopColor={softColor} stopOpacity={0.075 - nebulaRatio * 0.035 + nebulaRatio * 0.035} />
          <stop offset="68%" stopColor={fieldDistantColor} stopOpacity={0.035 - nebulaRatio * 0.023 + nebulaRatio * 0.01} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>

        <radialGradient id={id('koda-off-axis')} cx="39%" cy="41%" r="64%">
          <stop offset="0%" stopColor={hazeColor} stopOpacity={0.05 + nebulaRatio * 0.04} />
          <stop offset="42%" stopColor={hazeColor} stopOpacity={0.026 + nebulaRatio * 0.022} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>

        <radialGradient id={id('koda-wide-haze')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={hazeColor} stopOpacity={0.46 + nebulaRatio * 0.28} />
          <stop offset="15%" stopColor={wideHazeMidColor} stopOpacity={0.16 + nebulaRatio * 0.1} />
          <stop offset="32%" stopColor={softColor} stopOpacity={0.026 + nebulaRatio * 0.026} />
          <stop offset="58%" stopColor={wideHazeDistantColor} stopOpacity={0.006 + nebulaRatio * 0.006} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>

        <radialGradient id={id('koda-charge-warm')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff7dd" stopOpacity={0.52 + coreLightRatio * 0.38} />
          <stop offset="14%" stopColor="#ffd892" stopOpacity={0.22 + coreLightRatio * 0.18} />
          <stop offset="36%" stopColor="#ffb557" stopOpacity={0.07 + coreLightRatio * 0.08} />
          <stop offset="68%" stopColor="#ad6c28" stopOpacity={coreLightRatio * 0.028} />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id('koda-glass-volume')} cx="50%" cy="48%" r="56%">
          <stop offset="0%" stopColor={mixRgb([190, 190, 190], [247, 226, 168], nebulaRatio)} stopOpacity={0.08 + nebulaRatio * 0.28} />
          <stop offset="33%" stopColor={mixRgb([102, 102, 102], [154, 128, 86], nebulaRatio)} stopOpacity={0.055 + nebulaRatio * 0.175} />
          <stop offset="63%" stopColor={mixRgb([58, 58, 58], [76, 68, 54], nebulaRatio)} stopOpacity={0.055 + nebulaRatio * 0.115} />
          <stop offset="88%" stopColor="#1a1710" stopOpacity={0.26 + nebulaRatio * 0.12} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.5} />
        </radialGradient>

        <radialGradient id={id('koda-glass-skin')} cx="47%" cy="45%" r="61%">
          <stop offset="0%" stopColor={mixRgb([232, 232, 232], [255, 232, 176], nebulaRatio)} stopOpacity={0.045 + nebulaRatio * 0.08} />
          <stop offset="42%" stopColor={mixRgb([128, 128, 128], [182, 151, 101], nebulaRatio)} stopOpacity={0.055 + nebulaRatio * 0.07} />
          <stop offset="72%" stopColor={mixRgb([68, 68, 68], [119, 95, 61], nebulaRatio)} stopOpacity={0.04 + nebulaRatio * 0.055} />
          <stop offset="92%" stopColor={mixRgb([255, 255, 255], [255, 226, 163], nebulaRatio)} stopOpacity={0.08 + nebulaRatio * 0.11} />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={id('koda-glass-sheen')} x1="21%" y1="9%" x2="79%" y2="94%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.18 + chargeRatio * 0.16} />
          <stop offset="21%" stopColor="#fff1c9" stopOpacity={0.055 + chargeRatio * 0.08} />
          <stop offset="48%" stopColor="#000000" stopOpacity="0" />
          <stop offset="73%" stopColor="#ffdb97" stopOpacity={0.035 + chargeRatio * 0.08} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.11 + chargeRatio * 0.09} />
        </linearGradient>

        <radialGradient id={id('koda-core-plasma')} cx="47%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="9%" stopColor="#fffcef" stopOpacity="0.98" />
          <stop offset="23%" stopColor={mixRgb([232, 232, 232], [255, 231, 166], coreLightRatio)} stopOpacity={0.72 + coreLightRatio * 0.3} />
          <stop offset="43%" stopColor={mixRgb([150, 150, 150], [255, 198, 108], coreLightRatio)} stopOpacity={0.14 + coreLightRatio * 0.55} />
          <stop offset="70%" stopColor={mixRgb([72, 72, 72], [123, 84, 37], coreLightRatio)} stopOpacity={0.035 + coreLightRatio * 0.15} />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id('koda-rim-hot')} cx="50%" cy="50%" r="50%">
          <stop offset="83%" stopColor="#fff1c6" stopOpacity="0" />
          <stop offset="90%" stopColor="#fff6db" stopOpacity={0.18 + chargeRatio * 0.24} />
          <stop offset="96%" stopColor="#ffd58b" stopOpacity={0.38 + chargeRatio * 0.28} />
          <stop offset="100%" stopColor="#fff8e6" stopOpacity={0.26 + chargeRatio * 0.22} />
        </radialGradient>

        <radialGradient id={id('koda-external-aura')} cx="42%" cy="48%" r="63%">
          <stop offset="0%" stopColor={mixRgb([220, 220, 220], [255, 225, 161], chargeRatio)} stopOpacity={0.055 + chargeRatio * 0.36} />
          <stop offset="30%" stopColor={mixRgb([130, 130, 130], [180, 135, 76], chargeRatio)} stopOpacity={0.02 + chargeRatio * 0.13} />
          <stop offset="67%" stopColor={mixRgb([70, 70, 70], [90, 69, 43], chargeRatio)} stopOpacity={0.008 + chargeRatio * 0.05} />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={id('koda-rim-streak')} x1="25%" y1="10%" x2="82%" y2="92%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.42 + chargeRatio * 0.28} />
          <stop offset="34%" stopColor="#ffe6ae" stopOpacity={0.2 + chargeRatio * 0.24} />
          <stop offset="64%" stopColor="#c88d45" stopOpacity={0.05 + chargeRatio * 0.08} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.16 + chargeRatio * 0.14} />
        </linearGradient>

        <filter id={id('koda-core-blur')} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="5.4" />
        </filter>

        <filter id={id('koda-flare-blur')} x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        <filter id={id('koda-lens-blur')} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>

        <filter id={id('koda-starburst-blur')} x="-110%" y="-110%" width="320%" height="320%">
          <feGaussianBlur stdDeviation="2.1" />
        </filter>

        <filter id={id('koda-nebula-blur')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4.2" />
        </filter>

        <filter id={id('koda-nebula-soft-blur')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5.4" />
        </filter>

        <filter id={id('koda-volume-noise')} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.92" numOctaves="3" seed="8" type="fractalNoise" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.95  0 0 0 0 0.78  0 0 0 0 0.48  0 0 0 .11 0"
            result="goldNoise"
          />
          <feComposite in="goldNoise" in2="SourceGraphic" operator="in" />
        </filter>

        <filter id={id('koda-skin-grain')} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.72" numOctaves="4" seed="21" type="fractalNoise" result="skinNoise" />
          <feColorMatrix
            in="skinNoise"
            type="matrix"
            values="0 0 0 0 0.86  0 0 0 0 0.8  0 0 0 0 0.68  0 0 0 .075 0"
            result="skinDust"
          />
          <feComposite in="skinDust" in2="SourceGraphic" operator="in" />
        </filter>

        <filter id={id('koda-dot-glow')} x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={id('koda-rim-soft-glow')} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={id('koda-rim-halo-blur')} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="4.8" />
        </filter>

        <filter id={id('koda-external-aura-blur')} x="-65%" y="-65%" width="230%" height="230%">
          <feGaussianBlur stdDeviation="8.5" />
        </filter>

        <clipPath id={id('koda-inner-sphere-clip')}>
          <circle cx={center} cy={center} r={innerSphereRadius - 1.2} />
        </clipPath>

      </defs>

      <ellipse
        cx="103"
        cy="106"
        fill={url('koda-external-aura')}
        filter={url('koda-external-aura-blur')}
        opacity={nebulaStageBase * 0.68}
        rx="156"
        ry="124"
      />
      <circle cx={center} cy={center} fill={url('koda-soft-field')} r="88" opacity="0.5" />
      <circle cx={center} cy={center} fill={url('koda-off-axis')} r="76" opacity="0.7" />
      {targetCharge > 0 ? (
        <circle
          key={targetCharge}
          className="koda-charge-burst"
          cx={center}
          cy={center}
          fill={url('koda-charge-warm')}
          opacity={coreLightRatio * 0.24}
          r={30 + coreSizeRatio * 13}
        />
      ) : null}
      <g clipPath={url('koda-inner-sphere-clip')}>
        <circle cx={center} cy={center} fill={url('koda-glass-volume')} r={innerSphereRadius - 1} opacity={0.92} />
        <circle cx={center} cy={center} fill={url('koda-glass-skin')} r={innerSphereRadius - 1.4} opacity={0.2 + surfaceReveal * 0.54} />
        <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-skin-grain')} r={innerSphereRadius - 2.4} opacity={0.1 + surfaceReveal * 0.32} />
        <g filter={url('koda-nebula-soft-blur')} opacity={0.25 + surfaceReveal * 0.72}>
          {surfacePatches.map((patch) => (
            <circle
              key={`${patch.cx}-${patch.cy}`}
              cx={patch.cx}
              cy={patch.cy}
              fill={mixRgb(patch.color as [number, number, number], patch.warm as [number, number, number], nebulaRatio)}
              opacity={patch.opacity * surfaceReveal}
              r={patch.r}
            />
          ))}
        </g>
        <g filter={url('koda-nebula-blur')} opacity={0.08 + surfaceReveal * 0.18}>
          <ellipse cx="103" cy="104" fill={mixRgb([210, 210, 204], [255, 223, 158], nebulaRatio)} opacity="0.18" rx="54" ry="38" transform="rotate(-9 103 104)" />
          <ellipse cx="123" cy="124" fill={mixRgb([92, 92, 88], [166, 130, 77], nebulaRatio)} opacity="0.16" rx="46" ry="33" transform="rotate(24 123 124)" />
        </g>
        <g className="koda-volume-bloom">
          <circle cx={center} cy={center} fill={url('koda-core-plasma')} filter={url('koda-core-blur')} r={23 + coreSizeRatio * 21} opacity={0.028 + coreLightRatio * 0.28} />
          <ellipse cx={center} cy={center} fill={mixRgb([190, 190, 190], [255, 229, 162], nebulaRatio)} filter={url('koda-nebula-soft-blur')} opacity={0.01 + surfaceReveal * 0.12} rx={24} ry={18} transform="rotate(-7 110 110)" />
        </g>
        <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-volume-noise')} r={innerSphereRadius - 2} opacity={0.04 + surfaceReveal * 0.12} />
        <circle cx={center} cy={center} fill="none" r={innerSphereRadius - 3.2} stroke={url('koda-glass-sheen')} strokeDasharray="118 36 24 52 10 188" strokeLinecap="round" strokeWidth="1.15" opacity={0.18 + surfaceReveal * 0.36} transform="rotate(-27 110 110)" />
      </g>
      <circle
        cx={center}
        cy={center}
        fill="none"
        r={outerRadius}
        stroke={`rgba(${outerOrbitRed},${outerOrbitGreen},${outerOrbitBlue},${outerOrbitOpacity})`}
        strokeWidth={0.95 - chargeRatio * 0.3}
        opacity={1}
      />

      <circle
        cx={center}
        cy={center}
        fill="none"
        r="67"
        stroke="rgba(225,230,235,.25)"
        strokeWidth="1.15"
      />
      <circle
        cx={center}
        cy={center}
        fill="none"
        filter={url('koda-rim-halo-blur')}
        r="67.2"
        stroke={`rgba(${mixChannel(210, 255, chargeRatio)},${mixChannel(210, 220, chargeRatio)},${mixChannel(210, 151, chargeRatio)},${0.08 + chargeRatio * 0.46})`}
        strokeWidth={2.4 + chargeRatio * 4.6}
        opacity={chargeRatio}
      />
      <circle
        cx={center}
        cy={center}
        fill="none"
        filter={url('koda-rim-soft-glow')}
        r="66.7"
        stroke={url('koda-rim-hot')}
        strokeWidth={0.78 - chargeRatio * 0.13}
        opacity={chargeRatio}
      />
      <circle
        cx={center}
        cy={center}
        fill="none"
        r="65.9"
        stroke={url('koda-rim-streak')}
        strokeDasharray="82 456"
        strokeLinecap="round"
        strokeWidth="1.05"
        transform="rotate(-142 110 110)"
        opacity={chargeRatio * (0.26 + chargeRatio * 0.28)}
      />
      <circle
        cx={center}
        cy={center}
        fill="none"
        filter={url('koda-rim-soft-glow')}
        r="66.25"
        stroke="rgba(255,255,255,.82)"
        strokeDasharray="18 86 6 58 31 220"
        strokeLinecap="round"
        strokeWidth="0.95"
        transform="rotate(-171 110 110)"
        opacity={0.16 + chargeRatio * 0.22}
      />
      <circle
        cx={center}
        cy={center}
        fill="none"
        filter={url('koda-rim-halo-blur')}
        r="67.45"
        stroke={`rgba(255,${mixChannel(255, 224, chargeRatio)},${mixChannel(255, 174, chargeRatio)},${0.12 + chargeRatio * 0.24})`}
        strokeDasharray="42 178 16 92 8 170"
        strokeLinecap="round"
        strokeWidth="2.15"
        transform="rotate(-31 110 110)"
        opacity={0.52 + chargeRatio * 0.22}
      />
      <g opacity={chargeRatio}>
        <g className="koda-inner-ring-charge">
          <circle
            cx={center}
            cy={center}
            fill="none"
            r="66.8"
            stroke={`rgba(255,246,220,${0.78 + chargeRatio * 0.22})`}
            strokeWidth={1.25 + chargeRatio * 0.42}
          />
          <circle
            cx={center}
            cy={center}
            fill="none"
            r="65.9"
            stroke={`rgba(255,226,170,${0.2 + chargeRatio * 0.18})`}
            strokeWidth={1.6 + chargeRatio * 0.6}
          />
          <circle
            cx={center}
            cy={center}
            fill="none"
            r="63.8"
            stroke={`rgba(255,199,103,${0.05 + chargeRatio * 0.055})`}
            strokeWidth={3.2 + chargeRatio * 0.6}
          />
          <circle
            cx={center}
            cy={center}
            fill="none"
            r="65.5"
            stroke="rgba(255,255,255,.5)"
            strokeDasharray="13 410"
            strokeLinecap="round"
            strokeWidth="1.7"
            transform="rotate(-18 110 110)"
          />
        </g>
      </g>

      <circle cx={center} cy={center} fill={url('koda-wide-haze')} filter={url('koda-core-blur')} r={36 + coreSizeRatio * 10} opacity={coreHazeOpacity + surfaceReveal * 0.08} />
      <circle cx={center} cy={center} fill={url('koda-wide-haze')} r={21 + coreSizeRatio * 7} opacity={0.2 + coreLightRatio * 0.28} />

      <g clipPath={url('koda-inner-sphere-clip')} opacity={coreLightRatio}>
        <circle cx={center} cy={center} fill={url('koda-core-hot')} filter={url('koda-core-blur')} r={coreBlurRadius * 0.28} opacity={0.22 + coreLightRatio * 0.42} />
        <circle cx={center} cy={center} fill="#ffd979" filter={url('koda-lens-blur')} r={coreRadius * 0.58} opacity={0.16 + coreLightRatio * 0.48} />
        <circle cx={center} cy={center} fill="#fff2bc" filter={url('koda-lens-blur')} r={coreRadius * 0.34} opacity={0.18 + coreLightRatio * 0.42} />
        <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-lens-blur')} r={coreRadius * 0.16} opacity={0.38 + coreLightRatio * 0.4 + finalCoreLight * 0.18} />
        <circle cx={center} cy={center} fill="#ffffff" r={2.1 + finalCoreLight * 0.35} opacity={0.94} />
        <g filter={url('koda-lens-blur')} opacity={0.08 + finalCoreLight * 0.28}>
          <path d="M102 110 H118" stroke="#ffffff" strokeLinecap="round" strokeWidth="0.9" />
          <path d="M110 102 V118" stroke="#fff4c8" strokeLinecap="round" strokeWidth="0.72" />
          <path d="M104 104 L116 116" stroke="#fff9e8" strokeLinecap="round" strokeWidth="0.58" />
          <path d="M116 104 L104 116" stroke="#ffe9a8" strokeLinecap="round" strokeWidth="0.5" />
        </g>
      </g>
      <g opacity={chargeRatio}>
        <g opacity={0.38 + chargeRatio * 0.5}>
          <circle cx={center} cy={center} fill="#fff6d7" filter={url('koda-lens-blur')} r={9 + coreSizeRatio * 1.5} />
        </g>
      </g>
      <g opacity={finalCoreLight}>
        <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-lens-blur')} r="5.4" opacity="0.48" />
        <circle cx={center} cy={center} fill="#fffdf3" r="3.2" opacity="0.96" />
      </g>
      <g opacity={chargeRatio}>
        <g className="koda-core-starburst" opacity={Math.max(0, (chargeRatio - 0.08) / 0.92) * 0.18}>
          <g filter={url('koda-starburst-blur')}>
            <path
              d="M110 110 C111 95, 112 82, 111 66"
              opacity={0.025 + chargeRatio * 0.055}
              stroke="#fff8d8"
              strokeLinecap="round"
              strokeWidth={0.65 + chargeRatio * 0.55}
            />
            <path
              d="M110 110 C109 126, 109 142, 111 157"
              opacity={0.018 + chargeRatio * 0.04}
              stroke="#fff0bd"
              strokeLinecap="round"
              strokeWidth={0.55 + chargeRatio * 0.45}
            />
            <path
              d="M110 110 C126 109, 142 110, 158 111"
              opacity={0.025 + chargeRatio * 0.05}
              stroke="#fff5cb"
              strokeLinecap="round"
              strokeWidth={0.6 + chargeRatio * 0.5}
            />
            <path
              d="M110 110 C96 109, 79 108, 63 110"
              opacity={0.016 + chargeRatio * 0.035}
              stroke="#ffe2a1"
              strokeLinecap="round"
              strokeWidth={0.5 + chargeRatio * 0.42}
            />
            <path
              d="M110 110 C122 98, 134 86, 146 74"
              opacity={0.016 + chargeRatio * 0.035}
              stroke="#ffe7aa"
              strokeLinecap="round"
              strokeWidth={0.48 + chargeRatio * 0.38}
            />
            <path
              d="M110 110 C100 121, 88 134, 76 146"
              opacity={0.014 + chargeRatio * 0.03}
              stroke="#fff2c6"
              strokeLinecap="round"
              strokeWidth={0.45 + chargeRatio * 0.34}
            />
          </g>
        </g>
      </g>
      <g className="koda-lens-glare" filter={url('koda-lens-blur')} opacity="0.62">
        <circle cx="96" cy="103" fill="#ffffff" opacity="0.12" r="4.4" />
        <circle cx="124" cy="99" fill="#ffffff" opacity="0.09" r="3.6" />
        <circle cx="129" cy="121" fill="#ffffff" opacity="0.075" r="2.9" />
        <circle cx="101" cy="128" fill="#ffffff" opacity="0.065" r="2.4" />
        <circle cx="116" cy="91" fill="#ffffff" opacity="0.055" r="2.1" />
        <circle cx="91" cy="116" fill="#ffffff" opacity="0.05" r="1.7" />
      </g>
      <g opacity="0.42">
        <circle cx="123" cy="105" fill="#ffffff" r="1.15" />
        <circle cx="98" cy="117" fill="#ffffff" opacity="0.72" r="0.95" />
        <circle cx="116" cy="93" fill="#ffffff" opacity="0.5" r="0.65" />
        <circle cx="130" cy="120" fill="#ffffff" opacity="0.36" r="0.5" />
      </g>
      <circle cx={center} cy={center} fill={coreColor} opacity={0.5 + coreLightRatio * 0.16} r={3.2 + coreSizeRatio * 1.6} />
      <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-lens-blur')} r={3.2 + coreSizeRatio * 1.4} opacity={0.24 + coreLightRatio * 0.2} />
      <circle cx={center} cy={center} fill="#ffffff" r={2.1} opacity="0.96" />
      <g opacity={zeroPhaseOpacity}>
        <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-core-blur')} r="13" opacity="0.42" />
        <circle cx={center} cy={center} fill="#ffffff" filter={url('koda-lens-blur')} r="6.4" opacity="0.62" />
        <circle cx={center} cy={center} fill="#ffffff" r="3.1" opacity="0.98" />
      </g>

      <g opacity="0.55">
        <circle cx="74" cy="88" fill="#ffffff" opacity=".24" r="0.75" />
        <circle cx="82" cy="128" fill="#ffffff" opacity=".22" r="0.65" />
        <circle cx="126" cy="84" fill="#ffffff" opacity=".19" r="0.55" />
        <circle cx="139" cy="121" fill="#ffffff" opacity=".16" r="0.45" />
        <circle cx="94" cy="103" fill="#ffffff" opacity=".23" r="0.45" />
        <circle cx="153" cy="105" fill="#ffffff" opacity=".13" r="0.42" />
        <circle cx="63" cy="115" fill="#ffffff" opacity=".14" r="0.38" />
        <circle cx="118" cy="151" fill="#ffffff" opacity=".12" r="0.36" />
        <circle cx="102" cy="73" fill="#ffffff" opacity=".11" r="0.34" />
        <circle cx="150" cy="137" fill="#ffffff" opacity=".1" r="0.3" />
        <circle cx="71" cy="145" fill="#ffffff" opacity=".09" r="0.32" />
        <circle cx="157" cy="87" fill="#ffffff" opacity=".08" r="0.28" />
      </g>

        {orbitDots.map((dot, index) => {
          const angle = (dot.angle * Math.PI) / 180;
          const x = center + Math.cos(angle) * outerRadius;
          const y = center + Math.sin(angle) * outerRadius;

          return (
            <circle
              key={`${dot.angle}-${dot.size}-${index}`}
              cx={x}
              cy={y}
              fill={`rgba(255,${orbitDotGreen},${orbitDotBlue},${orbitDotOpacity})`}
              filter={url('koda-dot-glow')}
              r={dot.size || dotRadius}
            />
          );
        })}
      </svg>
    </>
  );
}
