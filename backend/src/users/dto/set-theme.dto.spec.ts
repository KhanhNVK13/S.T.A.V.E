import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetThemeDto } from './set-theme.dto';

const message = 'presetKey must be one of: unleashed, moss, claret';

async function themeErrors(value: Record<string, unknown>) {
  return validate(plainToInstance(SetThemeDto, value));
}

describe('BE-USR-05 SetThemeDto.validate(dto)', () => {
  it('UTCID01 accepts "unleashed"', async () => {
    await expect(themeErrors({ presetKey: 'unleashed' })).resolves.toHaveLength(
      0,
    );
  });

  it('UTCID02 accepts "moss"', async () => {
    await expect(themeErrors({ presetKey: 'moss' })).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts "claret"', async () => {
    await expect(themeErrors({ presetKey: 'claret' })).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects "Moss" with the wrong case', async () => {
    const errors = await themeErrors({ presetKey: 'Moss' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual({ isIn: message });
  });

  it('UTCID05 rejects an empty preset key', async () => {
    const errors = await themeErrors({ presetKey: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual({ isIn: message });
  });

  it('UTCID06 rejects a missing preset key', async () => {
    const errors = await themeErrors({});
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual({ isIn: message });
  });
});
