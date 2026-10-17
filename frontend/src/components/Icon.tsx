interface IconProps {
  name: string;
  className?: string;
}

/**
 * Renders a Kenney game-icon (white monochrome PNG) tinted by the current text
 * color via a CSS mask, so it inherits theme colors.
 */
export function Icon({ name, className = '' }: IconProps) {
  const url = `url('/assets/kenney/icons/${name}.png')`;
  return (
    <span
      aria-hidden
      className={['inline-block bg-current', className].join(' ')}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  );
}
