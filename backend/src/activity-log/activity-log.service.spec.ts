import {
  BadRequestException,
  INestApplication,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { QueryResult } from '../test-utils/supabase-mock';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { decodeCursor, encodeCursor } from './activity-log.logic';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = '33333333-3333-4333-8333-333333333333';
const PROJECT_B = '44444444-4444-4444-8444-444444444444';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    action: 'auth.sign_in',
    target_type: null,
    target_id: null,
    target_name: null,
    ip_address: '203.0.113.45',
    created_at: '2026-11-01T10:00:00.000001+00:00',
    ...overrides,
  };
}

function rowId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeService(options: {
  rows?: Array<Record<string, unknown>>;
  rpcResult?: QueryResult | QueryResult[];
  user?: QueryResult;
  projects?: QueryResult[];
}) {
  const mock = createSupabaseMock([], {
    tables: {
      users: [options.user ?? { data: { id: USER_ID }, error: null }],
      projects: options.projects ?? [],
      activity_log: [{ data: null, error: null }],
    },
    rpc: {
      admin_user_activity: options.rpcResult ?? {
        data: options.rows ?? [],
        error: null,
      },
    },
  });
  return { service: new ActivityLogService(mock.client), ...mock };
}

function rpcArgs(mock: { rpc: jest.Mock }, call = 0): Record<string, unknown> {
  return mock.rpc.mock.calls[call][1] as Record<string, unknown>;
}

describe('BE-ACT-01 ActivityLogService.record', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('UTCID02 không ném và có ghi log khi DB trả lỗi', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        activity_log: [{ data: null, error: { message: 'boom' } }],
      },
    });
    const service = new ActivityLogService(mock.client);

    await expect(
      service.record({ userId: USER_ID, action: 'auth.sign_in' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('boom');
  });

  it('UTCID03 không ném và có ghi log khi lời gọi DB bị ném lỗi', async () => {
    const mock = createSupabaseMock([], { tables: { activity_log: [] } });
    const service = new ActivityLogService(mock.client);

    await expect(
      service.record({ userId: USER_ID, action: 'auth.sign_in' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('UTCID05 chỉ tên người dùng và hành động: các trường còn lại lưu null', async () => {
    const mock = createSupabaseMock([], {
      tables: { activity_log: [{ data: null, error: null }] },
    });
    const service = new ActivityLogService(mock.client);

    await service.record({ userId: USER_ID, action: 'auth.sign_in' });

    expect(mock.builders.activity_log.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      action: 'auth.sign_in',
      target_type: null,
      target_id: null,
      target_name: null,
      ip_address: null,
    });
  });

  it('UTCID04 không ghi IP đầy đủ vào log', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        activity_log: [{ data: null, error: { message: 'boom' } }],
      },
    });
    const service = new ActivityLogService(mock.client);

    await service.record({
      userId: USER_ID,
      action: 'auth.sign_in',
      ip: '203.0.113.45',
    });

    expect(JSON.stringify(warn.mock.calls)).not.toContain('203.0.113.45');
  });

  it('UTCID01 lưu IP đầy đủ ở DB và cắt tên đối tượng quá dài', async () => {
    const mock = createSupabaseMock([], {
      tables: { activity_log: [{ data: null, error: null }] },
    });
    const service = new ActivityLogService(mock.client);

    await service.record({
      userId: USER_ID,
      action: 'project.created',
      targetType: 'project',
      targetId: PROJECT_A,
      targetName: 'x'.repeat(500),
      ip: '203.0.113.45',
    });

    const inserted = mock.builders.activity_log.insert.mock.calls[0][0] as {
      ip_address: string;
      target_name: string;
    };
    expect(inserted.ip_address).toBe('203.0.113.45');
    expect(inserted.target_name).toHaveLength(200);
  });
});

describe('BE-ACT-02 ActivityLogService.list', () => {
  it('UTCID01 chỉ trả đúng tập khoá whitelist, không lộ target_id, ip_address, user_id', async () => {
    const { service } = makeService({
      rows: [
        row({
          action: 'project.created',
          target_type: 'project',
          target_id: PROJECT_A,
          target_name: 'My song',
        }),
      ],
      projects: [{ data: [{ id: PROJECT_A }], error: null }],
    });

    const page = await service.list(USER_ID, {});

    expect(Object.keys(page).sort()).toEqual(['items', 'nextCursor']);
    expect(Object.keys(page.items[0]).sort()).toEqual(
      [
        'action',
        'id',
        'ipMasked',
        'locationApprox',
        'occurredAt',
        'targetDeleted',
        'targetName',
        'targetType',
      ].sort(),
    );
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(PROJECT_A);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain('ip_address');
    expect(serialized).not.toContain('target_id');
  });

  it('UTCID02 ipMasked luôn đã che và locationApprox luôn null', async () => {
    const { service } = makeService({
      rows: [
        row({ id: rowId(1), ip_address: '203.0.113.45' }),
        row({ id: rowId(2), ip_address: '::ffff:198.51.100.7' }),
        row({
          id: rowId(3),
          ip_address: '2001:db8:85a3:8d3:1319:8a2e:370:7348',
        }),
        row({ id: rowId(4), ip_address: null }),
        row({ id: rowId(5), ip_address: 'không phải ip' }),
      ],
    });

    const { items } = await service.list(USER_ID, {});

    expect(items.map((item) => item.ipMasked)).toEqual([
      '203.0.113.*',
      '198.51.100.*',
      '2001:db8:85a3::*',
      null,
      null,
    ]);
    expect(JSON.stringify(items)).not.toContain('203.0.113.45');
    expect(JSON.stringify(items)).not.toContain('7348');
    expect(items.every((item) => item.locationApprox === null)).toBe(true);
  });

  it('UTCID18 truyền khoảng thời gian from/to sang RPC theo giờ UTC', async () => {
    const mock = makeService({ rows: [] });

    await mock.service.list(USER_ID, {
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.000Z',
    });

    expect(rpcArgs(mock).p_from).toBe('2026-10-01T00:00:00.000Z');
    expect(rpcArgs(mock).p_to).toBe('2026-10-31T23:59:59.000Z');
  });

  it('UTCID17 không gọi dịch vụ mạng nào để tra vị trí', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network must not be used'));
    const { service } = makeService({ rows: [row()] });

    await service.list(USER_ID, {});

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('UTCID03 lấy limit+1 dòng, không trả dòng thừa và đặt nextCursor từ dòng cuối của trang', async () => {
    const rows = [1, 2, 3].map((n) =>
      row({
        id: rowId(n),
        created_at: `2026-11-0${4 - n}T10:00:00.123456+00:00`,
      }),
    );
    const mock = makeService({ rows });

    const page = await mock.service.list(USER_ID, { limit: '2' });

    expect(rpcArgs(mock).p_limit).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual([rowId(1), rowId(2)]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor as string)).toEqual({
      createdAt: '2026-11-02T10:00:00.123456+00:00',
      id: rowId(2),
    });
  });

  it('UTCID04 trang cuối có nextCursor là null', async () => {
    const rows = [1, 2].map((n) => row({ id: rowId(n) }));
    const { service } = makeService({ rows });

    const page = await service.list(USER_ID, { limit: '2' });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('UTCID05 danh sách rỗng trả items rỗng và nextCursor null', async () => {
    const { service } = makeService({ rows: [] });

    await expect(service.list(USER_ID, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('UTCID06 truyền con trỏ (created_at, id) nguyên vẹn sang RPC để dòng cùng thời điểm không trùng hay sót', async () => {
    const sameTime = '2026-11-01T10:00:00.500000+00:00';
    const first = makeService({
      rows: [
        row({ id: rowId(3), created_at: sameTime }),
        row({ id: rowId(2), created_at: sameTime }),
        row({ id: rowId(1), created_at: sameTime }),
      ],
    });
    const firstPage = await first.service.list(USER_ID, { limit: '2' });
    expect(firstPage.items.map((item) => item.id)).toEqual([
      rowId(3),
      rowId(2),
    ]);

    const second = makeService({
      rows: [row({ id: rowId(1), created_at: sameTime })],
    });
    const secondPage = await second.service.list(USER_ID, {
      limit: '2',
      cursor: firstPage.nextCursor,
    });

    expect(rpcArgs(second).p_cursor_created_at).toBe(sameTime);
    expect(rpcArgs(second).p_cursor_id).toBe(rowId(2));
    expect(secondPage.items.map((item) => item.id)).toEqual([rowId(1)]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('hai dòng chỉ khác nhau micro giây giữ nguyên chuỗi thời gian trong con trỏ', async () => {
    const mock = makeService({
      rows: [
        row({ id: rowId(2), created_at: '2026-11-01T10:00:00.000002+00:00' }),
        row({ id: rowId(1), created_at: '2026-11-01T10:00:00.000001+00:00' }),
      ],
    });

    const page = await mock.service.list(USER_ID, { limit: '1' });

    expect(page.items[0].occurredAt).toBe('2026-11-01T10:00:00.000002+00:00');
    expect(decodeCursor(page.nextCursor as string).createdAt).toBe(
      '2026-11-01T10:00:00.000002+00:00',
    );
  });

  it('lần gọi đầu không gửi con trỏ', async () => {
    const mock = makeService({ rows: [] });

    await mock.service.list(USER_ID, {});

    expect(rpcArgs(mock).p_cursor_created_at).toBeNull();
    expect(rpcArgs(mock).p_cursor_id).toBeNull();
  });

  it('UTCID07 type=signin chỉ lọc tiền tố auth.', async () => {
    const mock = makeService({ rows: [] });

    await mock.service.list(USER_ID, { type: 'signin' });

    expect(rpcArgs(mock).p_prefixes).toEqual(['auth.']);
  });

  it('UTCID08 không có type thì không lọc tiền tố', async () => {
    const mock = makeService({ rows: [] });

    await mock.service.list(USER_ID, {});

    expect(rpcArgs(mock).p_prefixes).toBeNull();
  });

  it('UTCID09 type lạ trả 400 và không gọi DB', async () => {
    const mock = makeService({ rows: [] });

    await expect(
      mock.service.list(USER_ID, { type: 'hack' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID10 con trỏ rác trả 400 và không gọi DB', async () => {
    const mock = makeService({ rows: [] });

    await expect(
      mock.service.list(USER_ID, { cursor: 'rác' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      mock.service.list(USER_ID, {
        cursor: encodeCursor({
          createdAt: '2026-01-01T00:00:00Z),id.gt.0',
          id: rowId(1),
        }),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID11 limit ngoài khoảng trả 400', async () => {
    const mock = makeService({ rows: [] });

    await expect(
      mock.service.list(USER_ID, { limit: '101' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UTCID12 sự kiện trỏ dự án đã xoá có targetDeleted true và vẫn giữ tên đã lưu', async () => {
    const { service } = makeService({
      rows: [
        row({
          id: rowId(1),
          action: 'project.created',
          target_type: 'project',
          target_id: PROJECT_A,
          target_name: 'Còn sống',
        }),
        row({
          id: rowId(2),
          action: 'project.created',
          target_type: 'project',
          target_id: PROJECT_B,
          target_name: 'Đã bị xoá',
        }),
      ],
      projects: [{ data: [{ id: PROJECT_A }], error: null }],
    });

    const { items } = await service.list(USER_ID, {});

    expect(items[0]).toMatchObject({
      targetName: 'Còn sống',
      targetDeleted: false,
    });
    expect(items[1]).toMatchObject({
      targetName: 'Đã bị xoá',
      targetDeleted: true,
    });
  });

  it('tra dự án đúng một lần cho cả trang', async () => {
    const mock = makeService({
      rows: [
        row({
          id: rowId(1),
          target_type: 'project',
          target_id: PROJECT_A,
        }),
        row({
          id: rowId(2),
          target_type: 'project',
          target_id: PROJECT_B,
        }),
        row({
          id: rowId(3),
          target_type: 'project',
          target_id: PROJECT_A,
        }),
      ],
      projects: [{ data: [], error: null }],
    });

    await mock.service.list(USER_ID, {});

    expect(mock.builders.projects.in).toHaveBeenCalledTimes(1);
    const ids = mock.builders.projects.in.mock.calls[0][1] as string[];
    expect([...ids].sort()).toEqual([PROJECT_A, PROJECT_B].sort());
  });

  it('UTCID13 sự kiện không trỏ dự án thì không tra bảng dự án và targetDeleted là false', async () => {
    const mock = makeService({ rows: [row()] });

    const { items } = await mock.service.list(USER_ID, {});

    expect(items[0].targetDeleted).toBe(false);
    expect(mock.builders.projects.in).not.toHaveBeenCalled();
  });

  it('UTCID14 không kết luận dự án đã xoá khi không tra được bảng dự án', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = makeService({
      rows: [row({ target_type: 'project', target_id: PROJECT_A })],
      projects: [{ data: null, error: { message: 'down' } }],
    });

    const { items } = await service.list(USER_ID, {});

    expect(items[0].targetDeleted).toBe(false);
    warn.mockRestore();
  });

  it('UTCID15 người dùng không tồn tại trả 404 và không gọi RPC', async () => {
    const mock = makeService({ user: { data: null, error: null } });

    await expect(mock.service.list(USER_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID16 lỗi RPC trả 500 với thông điệp chung và có ghi log', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = makeService({
      rpcResult: { data: null, error: { message: 'rpc down' } },
    });

    await expect(service.list(USER_ID, {})).rejects.toThrow(
      new InternalServerErrorException('Could not load activity'),
    );
    expect(String(error.mock.calls[0][0])).toContain('rpc down');
    error.mockRestore();
  });
});

describe('ActivityLogController', () => {
  it('dùng đủ ba guard theo thứ tự Jwt, Session, Admin', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      ActivityLogController,
    ) as unknown[];

    expect(guards).toEqual([JwtAuthGuard, SessionAuthGuard, AdminGuard]);
  });

  it('chuyển id và query sang service', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ActivityLogController({
      list,
    } as unknown as ActivityLogService);

    await controller.list(USER_ID, { type: 'signin' });

    expect(list).toHaveBeenCalledWith(USER_ID, { type: 'signin' });
  });
});

describe('ActivityLogService.list — phân trang không phụ thuộc giới hạn của SQL', () => {
  it.each([1, 2, 50, 100])(
    'limit=%i: gửi limit+1 sang RPC và nextCursor khác null khi còn dòng',
    async (limit) => {
      const rows = Array.from({ length: limit + 1 }, (_, i) =>
        row({
          id: rowId(limit + 1 - i),
          created_at: `2026-11-01T10:00:${String(59 - (i % 59)).padStart(2, '0')}.000001+00:00`,
        }),
      );
      const mock = makeService({ rows });

      const page = await mock.service.list(USER_ID, { limit: String(limit) });

      expect(rpcArgs(mock).p_limit).toBe(limit + 1);
      expect(page.items).toHaveLength(limit);
      expect(page.nextCursor).not.toBeNull();
    },
  );

  it('limit tối đa vẫn có nextCursor khi RPC trả đủ limit+1 dòng', async () => {
    const rows = Array.from({ length: 101 }, (_, i) =>
      row({ id: rowId(101 - i) }),
    );
    const mock = makeService({ rows });

    const page = await mock.service.list(USER_ID, { limit: '100' });

    expect(page.items).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe('ActivityLogService.list — toàn bộ phần tử trả về', () => {
  it('mỗi phần tử khớp toEqual với đúng tập trường và giá trị', async () => {
    const { service } = makeService({
      rows: [
        row({
          id: rowId(7),
          action: 'project.created',
          target_type: 'project',
          target_id: PROJECT_A,
          target_name: 'My song',
          ip_address: '203.0.113.45',
          created_at: '2026-11-01T10:00:00.123456+00:00',
        }),
        row({ id: rowId(8) }),
      ],
      projects: [{ data: [{ id: PROJECT_A }], error: null }],
    });

    const { items } = await service.list(USER_ID, {});

    expect(items).toEqual([
      {
        id: rowId(7),
        action: 'project.created',
        targetType: 'project',
        targetName: 'My song',
        targetDeleted: false,
        occurredAt: '2026-11-01T10:00:00.123456+00:00',
        ipMasked: '203.0.113.*',
        locationApprox: null,
      },
      {
        id: rowId(8),
        action: 'auth.sign_in',
        targetType: null,
        targetName: null,
        targetDeleted: false,
        occurredAt: '2026-11-01T10:00:00.000001+00:00',
        ipMasked: '203.0.113.*',
        locationApprox: null,
      },
    ]);
  });
});

describe('ActivityLogController qua HTTP với pipe thật', () => {
  let app: INestApplication;
  const list = jest.fn();

  beforeAll(async () => {
    const allow = { canActivate: () => true };
    const moduleRef = await Test.createTestingModule({
      controllers: [ActivityLogController],
      providers: [{ provide: ActivityLogService, useValue: { list } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(SessionAuthGuard)
      .useValue(allow)
      .overrideGuard(AdminGuard)
      .useValue(allow)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it.each(['abc', '123', 'not-a-uuid', '22222222-2222-2222-2222'])(
    'id %p không phải UUID trả 400 và không gọi service',
    async (id) => {
      const res = await request(app.getHttpServer() as App).get(
        `/admin/users/${id}/activity`,
      );

      expect(res.status).toBe(400);
      expect(list).not.toHaveBeenCalled();
    },
  );

  it('id hợp lệ trả 200 và chuyển query sang service', async () => {
    const res = await request(app.getHttpServer() as App).get(
      `/admin/users/${USER_ID}/activity?type=signin&limit=5`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
    expect(list).toHaveBeenCalledWith(USER_ID, {
      type: 'signin',
      limit: '5',
    });
  });
});
