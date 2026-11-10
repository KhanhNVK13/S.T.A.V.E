import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20261106000001_activity_log.sql',
  ),
  'utf8',
);

function functionBody(): string {
  const start = MIGRATION.indexOf('CREATE OR REPLACE FUNCTION');
  const end = MIGRATION.indexOf('REVOKE ALL ON FUNCTION');
  return MIGRATION.slice(start, end);
}

describe('migration activity_log', () => {
  it('RPC không kẹp cứng số dòng bằng hằng số riêng của SQL', () => {
    const body = functionBody();
    expect(body).not.toMatch(/least\s*\(/i);
    expect(body).not.toMatch(/greatest\s*\(/i);
    expect(body).not.toMatch(/\b101\b/);
    expect(body).toMatch(/LIMIT\s+p_limit\s*;/i);
  });

  it('phân trang keyset bằng so sánh hàng (created_at, id)', () => {
    expect(functionBody()).toMatch(
      /\(a\.created_at,\s*a\.id\)\s*<\s*\(p_cursor_created_at,\s*p_cursor_id\)/,
    );
    expect(functionBody()).toMatch(
      /ORDER BY\s+a\.created_at\s+DESC,\s*a\.id\s+DESC/i,
    );
  });

  it('điền lịch sử từ sessions bỏ hậu tố mạng của IP (đúng với cả inet và text)', () => {
    expect(MIGRATION).toMatch(
      /SELECT s\.user_id,\s*'auth\.sign_in',\s*split_part\(s\.ip_address::text,\s*'\/',\s*1\),\s*s\.created_at/,
    );
    expect(MIGRATION).not.toMatch(/'auth\.sign_in',\s*s\.ip_address,/);
  });

  it('target_id không có khoá ngoại', () => {
    expect(MIGRATION).toMatch(/target_id uuid,/);
    expect(MIGRATION).not.toMatch(/target_id uuid[^,]*REFERENCES/i);
  });

  it('hàm RPC theo mẫu bảo mật', () => {
    const body = functionBody();
    expect(body).toMatch(/SECURITY DEFINER/i);
    expect(body).toMatch(/SET search_path = public/i);
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/i,
    );
  });

  it('bảng bật RLS và chỉ tạo khi chưa có, mỗi nguồn kiểm riêng', () => {
    expect(MIGRATION).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(MIGRATION).toMatch(/to_regclass\('public\.activity_log'\) IS NULL/);
    expect(MIGRATION).toMatch(/to_regclass\('public\.sessions'\) IS NOT NULL/);
    expect(MIGRATION).toMatch(/to_regclass\('public\.projects'\) IS NOT NULL/);
  });
});
