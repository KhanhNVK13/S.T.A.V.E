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

export function formatVnd(amount: number): string {
  return VND.format(amount);
}

export function formatDateVi(value: string | null): string {
  return value ? DATE.format(new Date(value)) : '';
}
