import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { PALETTE_KEYS } from '@stave/shared-types';
import { PaletteValidationPipe } from './palette-validation.pipe';
import { validatePalettePayload } from './save-custom-theme.dto';

const validPalette: Record<string, string> = {
  '--background': 'oklch(0.14 0.022 275)',
  '--surface': 'oklch(0.19 0.03 275)',
  '--surface-subtle': 'oklch(0.23 0.035 275)',
  '--surface-muted': 'oklch(0.25 0.04 275)',
  '--foreground': 'oklch(0.95 0.012 275)',
  '--muted-foreground': 'oklch(0.83 0.03 275)',
  '--border': 'oklch(0.34 0.04 275)',
  '--border-strong': 'oklch(0.54 0.05 275)',
  '--metal': 'oklch(0.82 0.07 82)',
  '--metal-muted': 'oklch(0.24 0.03 82)',
};

function withValue(value: string): Record<string, string> {
  return { ...validPalette, '--background': value };
}

function withKey(key: string): Record<string, string> {
  const palette = { ...validPalette };
  delete palette['--background'];
  palette[key] = 'oklch(0.5 0.1 200)';
  return palette;
}

describe('BE-THM-03 validatePalettePayload', () => {
  it('UTCID01 chấp nhận palette hợp lệ', () => {
    expect(validatePalettePayload({ palette: validPalette })).toEqual({
      ok: true,
    });
  });

  it('UTCID02 từ chối payload thiếu palette', () => {
    expect(validatePalettePayload({}).ok).toBe(false);
    expect(validatePalettePayload(null).ok).toBe(false);
    expect(validatePalettePayload({ palette: 'x' }).ok).toBe(false);
  });

  it('UTCID03 từ chối palette thiếu 1 khoá', () => {
    const palette = { ...validPalette };
    delete palette['--metal-muted'];
    expect(validatePalettePayload({ palette }).ok).toBe(false);
  });

  it('UTCID04 từ chối palette thừa khoá', () => {
    const palette = { ...validPalette, '--extra': 'oklch(0.5 0.1 200)' };
    expect(validatePalettePayload({ palette }).ok).toBe(false);
  });

  it('UTCID05 từ chối khoá cấm --accent', () => {
    expect(validatePalettePayload({ palette: withKey('--accent') }).ok).toBe(
      false,
    );
  });

  it('UTCID06 từ chối khoá lạ --color-primary', () => {
    expect(
      validatePalettePayload({ palette: withKey('--color-primary') }).ok,
    ).toBe(false);
  });

  it('UTCID07 từ chối khoá --success / --warning / --danger', () => {
    for (const key of [
      '--success',
      '--warning',
      '--danger',
      '--accent-hover',
    ]) {
      expect(validatePalettePayload({ palette: withKey(key) }).ok).toBe(false);
    }
  });
});

describe('BE-THM-04 chống CSS injection', () => {
  it('UTCID08 từ chối chuỗi kết thúc bằng `; } body { ...`', () => {
    const attack = 'oklch(1 0 0); } body{ display:none';
    expect(validatePalettePayload({ palette: withValue(attack) }).ok).toBe(
      false,
    );
  });

  it('UTCID09 từ chối `!important`', () => {
    expect(
      validatePalettePayload({ palette: withValue('oklch(1 0 0) !important') })
        .ok,
    ).toBe(false);
  });

  it('UTCID10 từ chối `var(--x)`', () => {
    expect(validatePalettePayload({ palette: withValue('var(--x)') }).ok).toBe(
      false,
    );
  });

  it('UTCID11 từ chối `url(...)`', () => {
    expect(validatePalettePayload({ palette: withValue('url(x)') }).ok).toBe(
      false,
    );
  });

  it('UTCID12 từ chối `expression(...)`, `@import`, `{}`', () => {
    expect(
      validatePalettePayload({ palette: withValue('expression(alert(1))') }).ok,
    ).toBe(false);
    expect(
      validatePalettePayload({ palette: withValue('@import "x"') }).ok,
    ).toBe(false);
    expect(
      validatePalettePayload({ palette: withValue('oklch(0.5 0.1 200){}') }).ok,
    ).toBe(false);
  });

  it('UTCID13 từ chối giá trị không phải oklch', () => {
    expect(validatePalettePayload({ palette: withValue('#ff0000') }).ok).toBe(
      false,
    );
    expect(validatePalettePayload({ palette: withValue('red') }).ok).toBe(
      false,
    );
  });
});

describe('BE-THM-05 khoảng giá trị OKLCH', () => {
  it('UTCID14 từ chối L > 1', () => {
    expect(
      validatePalettePayload({ palette: withValue('oklch(1.5 0.1 200)') }).ok,
    ).toBe(false);
    expect(
      validatePalettePayload({ palette: withValue('oklch(2 0.1 200)') }).ok,
    ).toBe(false);
  });

  it('UTCID15 từ chối C > 0.4', () => {
    expect(
      validatePalettePayload({ palette: withValue('oklch(0.5 0.5 200)') }).ok,
    ).toBe(false);
  });

  it('UTCID16 từ chối H >= 360', () => {
    expect(
      validatePalettePayload({ palette: withValue('oklch(0.5 0.1 360)') }).ok,
    ).toBe(false);
    expect(
      validatePalettePayload({ palette: withValue('oklch(0.5 0.1 400)') }).ok,
    ).toBe(false);
  });

  it('UTCID17 chấp nhận biên: L=0, L=1, C=0, C=0.4, H=0, H=359.99', () => {
    for (const value of [
      'oklch(0 0 0)',
      'oklch(1 0 0)',
      'oklch(0.5 0 0)',
      'oklch(0.5 0.4 0)',
      'oklch(0.5 0.1 359.99)',
    ]) {
      expect(validatePalettePayload({ palette: withValue(value) }).ok).toBe(
        true,
      );
    }
  });

  it('UTCID18 từ chối L/C âm và số thập phân thừa', () => {
    expect(
      validatePalettePayload({ palette: withValue('oklch(-0.1 0.1 200)') }).ok,
    ).toBe(false);
    expect(
      validatePalettePayload({ palette: withValue('oklch(0.5 -0.1 200)') }).ok,
    ).toBe(false);
    expect(
      validatePalettePayload({ palette: withValue('oklch(0.123456 0.1 200)') })
        .ok,
    ).toBe(false);
  });
});

describe('BE-THM-06 PaletteValidationPipe', () => {
  it('UTCID19 ném BadRequestException với payload độc hại', () => {
    const pipe = new PaletteValidationPipe();
    expect(() =>
      pipe.transform({
        palette: withValue('oklch(1 0 0); } body{ display:none'),
      }),
    ).toThrow(BadRequestException);
  });

  it('UTCID20 trả nguyên payload khi hợp lệ', () => {
    const pipe = new PaletteValidationPipe();
    const payload = { palette: validPalette };
    expect(pipe.transform(payload)).toBe(payload);
  });
});

describe('BE-THM-07 hợp đồng PALETTE_KEYS', () => {
  it('UTCID21 có đúng 10 khoá và không có khoá trạng thái', () => {
    expect(PALETTE_KEYS).toHaveLength(10);
    for (const key of PALETTE_KEYS) {
      expect(key.startsWith('--accent')).toBe(false);
      expect(key.startsWith('--success')).toBe(false);
      expect(key.startsWith('--warning')).toBe(false);
      expect(key.startsWith('--danger')).toBe(false);
    }
  });
});
