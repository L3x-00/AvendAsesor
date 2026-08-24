import Image from 'next/image';

type BrandLogoTone = 'dark-surface' | 'light-surface';

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
  tone?: BrandLogoTone;
}

/**
 * Renders only the logo supplied and approved by AVEND. The variants preserve
 * contrast on dark sidebars and on light surfaces without recreating the mark.
 */
export function BrandLogo({
  className = '',
  priority = false,
  tone = 'light-surface',
}: BrandLogoProps) {
  const source =
    tone === 'dark-surface'
      ? '/logo/logo-con-nombre-white.webp'
      : '/logo/logo-con-nombre-dark.webp';

  return (
    <Image
      alt="AVEND ASESOR"
      className={`h-auto w-auto object-contain ${className}`.trim()}
      height={310}
      priority={priority}
      src={source}
      width={233}
    />
  );
}
