import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';

type BubbleBaseProps = {
  children: ReactNode;
  className?: string;
  tail?: 'left' | 'right';
  variant?: 'answer' | 'koda';
};

type SpeechBubbleProps =
  | (BubbleBaseProps & { as?: 'div' } & HTMLAttributes<HTMLDivElement>)
  | (BubbleBaseProps & { as: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>);

function MeasuredBubbleShape({
  hostRef,
  tail,
  variant,
}: {
  hostRef: { current: HTMLElement | null };
  tail: 'left' | 'right';
  variant: 'answer' | 'koda';
}) {
  const gradientId = useId().replace(/:/g, '');
  const [size, setSize] = useState({ height: 87, width: 410 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { height: rect.height, width: rect.width },
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef]);

  const { height, width } = size;
  const tailDepth = 7;
  const bodyBottom = height - tailDepth;
  const radius = Math.min(21, width / 2, bodyBottom / 2);
  const bodyRight = width - 6;
  const path = [
    `M ${radius} 0`,
    `H ${bodyRight - radius}`,
    `Q ${bodyRight} 0 ${bodyRight} ${radius}`,
    `V ${bodyBottom - 10}`,
    `C ${bodyRight} ${bodyBottom - 4} ${bodyRight + 2} ${bodyBottom} ${width} ${bodyBottom + 3}`,
    `C ${width - 5} ${bodyBottom + 3} ${width - 9} ${bodyBottom + 1} ${width - 14} ${bodyBottom}`,
    `H ${radius}`,
    `Q 0 ${bodyBottom} 0 ${bodyBottom - radius}`,
    `V ${radius}`,
    `Q 0 0 ${radius} 0`,
    'Z',
  ].join(' ');

  return (
    <svg aria-hidden="true" className="speech-bubble-shape" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2={height} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f1f1ef" />
        </linearGradient>
      </defs>
      <path
        className="speech-bubble-fill speech-bubble-stroke"
        d={path}
        fill={variant === 'answer' ? `url(#${gradientId})` : 'rgba(38, 38, 38, .88)'}
        transform={tail === 'left' ? `translate(${width} 0) scale(-1 1)` : undefined}
      />
    </svg>
  );
}

export function SpeechBubble(props: SpeechBubbleProps) {
  const { as = 'div', children, className = '', tail = 'left', variant = 'koda', ...rest } = props;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const classes = `speech-bubble speech-bubble--${variant} speech-bubble--tail-${tail}${className ? ` ${className}` : ''}`;
  const content = (
    <>
      <MeasuredBubbleShape hostRef={as === 'button' ? buttonRef : divRef} tail={tail} variant={variant} />
      <span className="speech-bubble-content">{children}</span>
    </>
  );

  if (as === 'button') {
    return (
      <button ref={buttonRef} className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {content}
      </button>
    );
  }

  return (
    <div ref={divRef} className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {content}
    </div>
  );
}
