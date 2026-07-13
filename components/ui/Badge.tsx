import type { CSSProperties } from 'react';

interface BadgeProps {
  label:   string;
  solid:   string;
  bg:      string;
  border:  string;
  size?:   'xs' | 'sm' | 'md';
  dot?:    boolean;
}

export function Badge({ label, solid, bg, border, size = 'md', dot = true }: BadgeProps) {
  const fontSize  = size === 'xs' ? 9  : size === 'sm' ? 10 : 11;
  const padding   = size === 'xs' ? '2px 6px' : size === 'sm' ? '3px 8px' : '4px 10px';
  const dotSize   = size === 'xs' ? 5 : 6;

  const style: CSSProperties = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           4,
    fontSize,
    fontWeight:    700,
    padding,
    borderRadius:  6,
    background:    bg,
    border:        `1px solid ${border}`,
    color:         solid,
    whiteSpace:    'nowrap',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  };

  return (
    <span style={style}>
      {dot && (
        <span style={{
          width: dotSize, height: dotSize,
          borderRadius: '50%',
          background: solid,
          flexShrink: 0,
          boxShadow: `0 0 4px ${solid}88`,
        }} />
      )}
      {label}
    </span>
  );
}
