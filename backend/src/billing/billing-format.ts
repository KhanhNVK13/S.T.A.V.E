const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

const DATE = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const VND_EN = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'VND',
});

const DATE_EN = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function formatVndEn(amount: number): string {
  return VND_EN.format(amount);
}

export function formatDateEn(value: string | null): string {
  return value ? DATE_EN.format(new Date(value)) : '';
}

export function formatVnd(amount: number): string {
  return VND.format(amount);
}

export function formatDateVi(value: string | null): string {
  return value ? DATE.format(new Date(value)) : '';
}
