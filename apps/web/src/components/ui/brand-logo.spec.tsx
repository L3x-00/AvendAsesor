import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  it('uses the approved AVEND wordmark and exposes an accessible name', () => {
    render(<BrandLogo priority tone="dark-surface" />);

    const logo = screen.getByRole('img', { name: 'AVEND ASESOR' });

    expect(logo).toHaveAttribute('src', expect.stringContaining('logo-con-nombre-white'));
  });

  it('selects the light-surface approved variant by default', () => {
    render(<BrandLogo />);

    expect(screen.getByRole('img', { name: 'AVEND ASESOR' })).toHaveAttribute(
      'src',
      expect.stringContaining('logo-con-nombre-dark'),
    );
  });
});
