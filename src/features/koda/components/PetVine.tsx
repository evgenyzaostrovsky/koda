import { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

type PetVineProps = { height: number };

/** A small climbing vine. Its stem follows the center axis (x=18); leaf geometry stays the same at every height. */
export function PetVine({ height }: PetVineProps) {
  const gradientPrefix = `pet-vine-${useId().replace(/:/g, '')}`;
  const stemGradient = `${gradientPrefix}-stem`;
  const leafGradient = `${gradientPrefix}-leaf`;
  const leafShadeGradient = `${gradientPrefix}-leaf-shade`;
  const vineHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
  const leafCount = Math.min(28, Math.max(1, Math.floor((vineHeight - 18) / 48)));
  const leafPositions = Array.from({ length: leafCount }, (_, index) =>
    vineHeight * ((index + 1) / (leafCount + 1)),
  );
  const stem = `M18 0 C12 ${vineHeight * 0.18} 24 ${vineHeight * 0.31} 18 ${vineHeight * 0.48} C12 ${vineHeight * 0.65} 23 ${vineHeight * 0.82} 18 ${vineHeight}`;

  return (
    <Svg width={36} height={vineHeight} viewBox={`0 0 36 ${vineHeight}`}>
      <Defs>
        <LinearGradient id={stemGradient} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#405d32" />
          <Stop offset="0.48" stopColor="#a4bd79" />
          <Stop offset="1" stopColor="#557747" />
        </LinearGradient>
        <LinearGradient id={leafGradient} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#c5d995" />
          <Stop offset="1" stopColor="#719658" />
        </LinearGradient>
        <LinearGradient id={leafShadeGradient} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9fbd72" />
          <Stop offset="1" stopColor="#537746" />
        </LinearGradient>
      </Defs>

      <Path d={stem} fill="none" stroke="#36532e" strokeLinecap="round" strokeWidth={4.5} opacity={0.24} />
      <Path d={stem} fill="none" stroke={`url(#${stemGradient})`} strokeLinecap="round" strokeWidth={2.7} />
      <Path d={stem} fill="none" stroke="#d7e5a9" strokeLinecap="round" strokeWidth={0.75} opacity={0.72} />

      {leafPositions.map((y, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const tip = 18 + side * 15;
        const outer = 18 + side * 14;
        const branch = `M18 ${y} Q${18 + side * 4} ${y - 1} ${18 + side * 9} ${y - 4}`;
        const blade = `M18 ${y} C${18 + side * 5} ${y - 1} ${18 + side * 10} ${y - 9} ${tip} ${y - 7} C${18 + side * 14} ${y - 1} ${18 + side * 8} ${y + 3} 18 ${y}`;
        const vein = `M17.5 ${y - 0.2} Q${18 + side * 7} ${y - 2} ${outer} ${y - 6}`;
        return (
          <G key={`leaf-${index}`}>
            <Path d={branch} fill="none" stroke="#587644" strokeLinecap="round" strokeWidth={1.2} />
            <Path d={blade} fill={index % 2 === 0 ? `url(#${leafGradient})` : `url(#${leafShadeGradient})`} stroke="#527342" strokeLinejoin="round" strokeWidth={0.55} />
            <Path d={vein} fill="none" stroke="#e1ebba" strokeLinecap="round" strokeWidth={0.65} opacity={0.8} />
          </G>
        );
      })}
    </Svg>
  );
}
