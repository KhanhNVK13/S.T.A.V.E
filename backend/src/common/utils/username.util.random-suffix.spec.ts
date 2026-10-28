import { randomUsernameSuffix } from './username.util';

// ============================================================================
// SHEET: BE-COM-07 (randomUsernameSuffix)
// ============================================================================
describe('BE-COM-07 randomUsernameSuffix()', () => {
  const mockRandom = (value: number) =>
    jest.spyOn(Math, 'random').mockReturnValue(value);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('UTCID01 returns the 4-digit suffix "1000" at the low end of the range', () => {
    mockRandom(0);

    expect(randomUsernameSuffix()).toBe('1000');
  });

  it('UTCID02 returns a 4-digit suffix for a mid-range value', () => {
    mockRandom(0.1234);

    expect(randomUsernameSuffix()).toBe('2110');
  });

  it('UTCID03 returns the mid-range 4-digit suffix "5500"', () => {
    mockRandom(0.5);

    expect(randomUsernameSuffix()).toBe('5500');
  });

  it('UTCID04 returns the 4-digit suffix "9999" at the high end of the range', () => {
    mockRandom(0.99999);

    expect(randomUsernameSuffix()).toBe('9999');
  });
});
