import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GM_INSTRUMENT_NAMES } from '@stave/shared-types';
import { ExploreService } from './explore.service';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import {
  MAX_INSTRUMENT_FILTERS,
  PublicProjectsQueryDto,
} from '../projects/dto/public-projects-query.dto';

const card = (id: string) => ({
  id,
  name: `Project ${id}`,
  description: null,
  genre: null,
  visibility: 'public' as const,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  play_count: 0,
  owner: { id: 'o1', username: 'o', display_name: null, avatar_url: null },
});

describe('ExploreService.listPublicProjects instrument filter', () => {
  it('UTCID01 filters newest list with contains on projects.instruments and keeps visibility rules', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        projects: [{ data: [card('p1')], count: 1 }, { data: [] }],
        project_tags: [{ data: [] }],
      },
    });
    const service = new ExploreService(mock.client);

    const result = await service.listPublicProjects({
      sort: 'newest',
      instrument: ['Acoustic Grand Piano', 'Violin'],
    });

    expect(result.total).toBe(1);
    expect(mock.builders.projects.overlaps).toHaveBeenCalledTimes(2);
    expect(mock.builders.projects.overlaps).toHaveBeenCalledWith(
      'instruments',
      ['Acoustic Grand Piano', 'acoustic_grand_piano'],
    );
    expect(mock.builders.projects.overlaps).toHaveBeenCalledWith(
      'instruments',
      ['Violin', 'violin'],
    );
    expect(mock.builders.projects.eq).toHaveBeenCalledWith(
      'visibility',
      'public',
    );
    expect(mock.builders.projects.is).toHaveBeenCalledWith('archived_at', null);
    expect(mock.builders.projects.is).toHaveBeenCalledWith(
      'moderation_hidden_at',
      null,
    );
  });

  it('UTCID02 does not filter when instrument is omitted or empty', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        projects: [
          { data: [], count: 0 },
          { data: [], count: 0 },
        ],
      },
    });
    const service = new ExploreService(mock.client);

    await service.listPublicProjects({ sort: 'newest' });
    await service.listPublicProjects({ sort: 'newest', instrument: [] });

    expect(mock.builders.projects.overlaps).not.toHaveBeenCalled();
  });

  it('UTCID03 applies the same filter on the engagement view for popular sort', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        project_engagement: [{ data: [{ project_id: 'p1' }], count: 1 }],
        projects: [{ data: [card('p1')] }, { data: [] }],
        project_tags: [{ data: [] }],
      },
    });
    const service = new ExploreService(mock.client);

    const result = await service.listPublicProjects({
      sort: 'popular',
      instrument: ['Violin'],
    });

    expect(result.items).toHaveLength(1);
    expect(mock.builders.project_engagement.eq).toHaveBeenCalledWith(
      'is_visible',
      true,
    );
    expect(mock.builders.project_engagement.overlaps).toHaveBeenCalledWith(
      'instruments',
      ['Violin', 'violin'],
    );
  });

  it('UTCID04 surfaces a database error instead of an empty result', async () => {
    const mock = createSupabaseMock([], {
      tables: { projects: [{ data: null, error: { message: 'boom' } }] },
    });
    const service = new ExploreService(mock.client);

    await expect(
      service.listPublicProjects({ sort: 'newest', instrument: ['Violin'] }),
    ).rejects.toThrow('Could not list public projects');
  });
});

describe('PublicProjectsQueryDto instrument', () => {
  const run = (value: Record<string, unknown>) => {
    const dto = plainToInstance(PublicProjectsQueryDto, value);
    return validate(dto).then((errors) => ({ errors, dto }));
  };

  it('UTCID01 accepts a single known instrument and a comma-separated list', async () => {
    const one = await run({ instrument: 'Violin' });
    expect(one.errors).toHaveLength(0);
    expect(one.dto.instrument).toEqual(['Violin']);

    const many = await run({ instrument: 'Violin, Cello,Violin' });
    expect(many.errors).toHaveLength(0);
    expect(many.dto.instrument).toEqual(['Violin', 'Cello']);
  });

  it('UTCID02 accepts repeated query params as an array', async () => {
    const { errors, dto } = await run({ instrument: ['Violin', 'Cello'] });
    expect(errors).toHaveLength(0);
    expect(dto.instrument).toEqual(['Violin', 'Cello']);
  });

  it('UTCID03 rejects an unknown instrument name', async () => {
    const { errors } = await run({ instrument: 'Not An Instrument' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('instrument');
  });

  it('UTCID04 rejects injection-like strings and wildcard characters', async () => {
    for (const bad of ['*', '{a}', '") or (1=1', 'Violin;drop table x']) {
      const { errors } = await run({ instrument: bad });
      expect(errors).toHaveLength(1);
    }
  });

  it('UTCID05 rejects more than the maximum number of instruments', async () => {
    const names = GM_INSTRUMENT_NAMES.slice(0, MAX_INSTRUMENT_FILTERS + 1);
    const { errors } = await run({ instrument: names.join(',') });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
    const ok = await run({
      instrument: names.slice(0, MAX_INSTRUMENT_FILTERS).join(','),
    });
    expect(ok.errors).toHaveLength(0);
  });

  it('UTCID06 treats an empty value as no filter', async () => {
    const { errors, dto } = await run({ instrument: '' });
    expect(errors).toHaveLength(0);
    expect(dto.instrument).toEqual([]);
  });
});
