import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListReportsQueryDto } from './list-reports-query.dto';
import { ReportStatusQueryDto } from './report-status-query.dto';

describe('ListReportsQueryDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const list = (query: unknown) =>
    pipe.transform(query, { type: 'query', metatype: ListReportsQueryDto });
  const detail = (query: unknown) =>
    pipe.transform(query, { type: 'query', metatype: ReportStatusQueryDto });

  it('mặc định status open, page 1, limit 20', async () => {
    await expect(list({})).resolves.toMatchObject({
      status: 'open',
      page: 1,
      limit: 20,
    });
  });

  it.each(['open', 'upheld', 'dismissed'])('chấp nhận status %s', async (s) => {
    await expect(list({ status: s })).resolves.toMatchObject({ status: s });
  });

  it('status lạ bị từ chối với 400', async () => {
    await expect(list({ status: 'pending' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(list({ status: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('page và limit dạng chuỗi số được ép về số', async () => {
    await expect(list({ page: '3', limit: '50' })).resolves.toMatchObject({
      page: 3,
      limit: 50,
    });
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['page', '100001'],
    ['limit', '0'],
    ['limit', '51'],
    ['limit', '-5'],
    ['limit', 'abc'],
  ])('%s=%s ngoài khoảng bị từ chối với 400', async (field, value) => {
    await expect(list({ [field]: value })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('biên: limit 1 và 50, page 1 hợp lệ', async () => {
    await expect(list({ limit: '1' })).resolves.toMatchObject({ limit: 1 });
    await expect(list({ limit: '50' })).resolves.toMatchObject({ limit: 50 });
  });

  it('trường lạ bị loại', async () => {
    const result = (await list({ search: 'x', status: 'open' })) as object;
    expect(result).not.toHaveProperty('search');
  });

  it('chi tiết nhóm: status mặc định open, status lạ bị từ chối', async () => {
    await expect(detail({})).resolves.toMatchObject({ status: 'open' });
    await expect(detail({ status: 'dismissed' })).resolves.toMatchObject({
      status: 'dismissed',
    });
    await expect(detail({ status: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
