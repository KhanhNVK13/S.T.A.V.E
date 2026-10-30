import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';
import { PublicProjectsQueryDto } from './public-projects-query.dto';
import { RankingsQueryDto } from './rankings-query.dto';
import { UpdateProjectVisibilityDto } from './update-project-visibility.dto';
import { UpdateProjectDto } from './update-project.dto';

async function validateCreate(value: Record<string, unknown>) {
  return validate(plainToInstance(CreateProjectDto, value));
}

async function validatePublicQuery(value: Record<string, unknown>) {
  return validate(plainToInstance(PublicProjectsQueryDto, value));
}

async function validateRankingsQuery(value: Record<string, unknown>) {
  return validate(plainToInstance(RankingsQueryDto, value));
}

async function validateVisibility(value: Record<string, unknown>) {
  return validate(plainToInstance(UpdateProjectVisibilityDto, value));
}

async function validateUpdate(value: Record<string, unknown>) {
  return validate(plainToInstance(UpdateProjectDto, value));
}

describe('BE-PRJ-01 CreateProjectDto.validate(dto)', () => {
  it('UTCID01 accepts a standard valid project name and genre', async () => {
    await expect(
      validateCreate({ name: 'Song A', genre: 'Lo-fi' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts boundary values: 1 char name, 2000 char desc, 60 char genre', async () => {
    await expect(
      validateCreate({
        name: 'a',
        description: 'b'.repeat(2000),
        genre: 'c'.repeat(60),
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts a 100-character name', async () => {
    await expect(
      validateCreate({ name: 'a'.repeat(100), genre: 'Lo-fi' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects an empty project name', async () => {
    const errors = await validateCreate({ name: '', genre: 'Lo-fi' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNotEmpty: 'name should not be empty',
      }),
    );
  });

  it('UTCID05 rejects a 101-character name (SRS BR-16: max 100 chars; code uses @MaxLength(120))', async () => {
    const errors = await validateCreate({
      name: 'a'.repeat(101),
      genre: 'Lo-fi',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'name must be shorter than or equal to 100 characters',
      }),
    );
  });

  it('UTCID06 rejects a 120-character name (SRS BR-16: max 100 chars; code uses @MaxLength(120))', async () => {
    const errors = await validateCreate({
      name: 'a'.repeat(120),
      genre: 'Lo-fi',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'name must be shorter than or equal to 100 characters',
      }),
    );
  });

  it('UTCID07 rejects a non-string project name', async () => {
    const errors = await validateCreate({
      name: 123,
      genre: 'Lo-fi',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isString: 'name must be a string',
      }),
    );
  });

  it('UTCID08 rejects a 2001-character description', async () => {
    const errors = await validateCreate({
      name: 'Song A',
      description: 'b'.repeat(2001),
      genre: 'Lo-fi',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength:
          'description must be shorter than or equal to 2000 characters',
      }),
    );
  });

  it('UTCID09 rejects a 61-character genre', async () => {
    const errors = await validateCreate({
      name: 'Song A',
      genre: 'c'.repeat(61),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'genre must be shorter than or equal to 60 characters',
      }),
    );
  });
});

describe('BE-PRJ-02 PublicProjectsQueryDto.validate(query)', () => {
  it('UTCID01 accepts omitted params and keeps defaults', async () => {
    await expect(validatePublicQuery({})).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts valid page, limit 50, filters, and sort popular', async () => {
    await expect(
      validatePublicQuery({
        page: '1',
        limit: '50',
        genre: 'pop',
        tag: 'chill',
        search: 'song',
        sort: 'popular',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts boundary limit 1 and sort most_played', async () => {
    await expect(
      validatePublicQuery({
        page: '1',
        limit: '1',
        sort: 'most_played',
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 rejects page 0 (less than 1)', async () => {
    const errors = await validatePublicQuery({ page: '0' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'page must not be less than 1',
      }),
    );
  });

  it('UTCID05 rejects a non-numeric page string', async () => {
    const errors = await validatePublicQuery({ page: 'abc' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isInt: 'page must be an integer number',
      }),
    );
  });

  it('UTCID06 rejects limit 0 (less than 1)', async () => {
    const errors = await validatePublicQuery({ limit: '0' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        min: 'limit must not be less than 1',
      }),
    );
  });

  it('UTCID07 rejects limit 51 (greater than 50)', async () => {
    const errors = await validatePublicQuery({ limit: '51' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        max: 'limit must not be greater than 50',
      }),
    );
  });

  it('UTCID08 rejects an invalid sort option', async () => {
    const errors = await validatePublicQuery({ sort: 'oldest' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'sort must be one of the following values: newest, popular, most_played',
      }),
    );
  });
});

describe('BE-PRJ-03 RankingsQueryDto.validate(query)', () => {
  it('UTCID01 accepts an omitted query type', async () => {
    await expect(validateRankingsQuery({})).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts type "trending"', async () => {
    await expect(
      validateRankingsQuery({ type: 'trending' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts type "top_forked"', async () => {
    await expect(
      validateRankingsQuery({ type: 'top_forked' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID04 accepts type "top_played"', async () => {
    await expect(
      validateRankingsQuery({ type: 'top_played' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID05 rejects an invalid type "newest"', async () => {
    const errors = await validateRankingsQuery({ type: 'newest' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'type must be one of the following values: trending, top_forked, top_played',
      }),
    );
  });

  it('UTCID06 rejects an empty string type', async () => {
    const errors = await validateRankingsQuery({ type: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'type must be one of the following values: trending, top_forked, top_played',
      }),
    );
  });
});

describe('BE-PRJ-04 UpdateProjectVisibilityDto.validate(dto)', () => {
  it('UTCID01 accepts "public"', async () => {
    await expect(
      validateVisibility({ visibility: 'public' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts "private"', async () => {
    await expect(
      validateVisibility({ visibility: 'private' }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 rejects missing visibility', async () => {
    const errors = await validateVisibility({});
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNotEmpty: 'visibility should not be empty',
      }),
    );
  });

  it('UTCID04 rejects empty string visibility', async () => {
    const errors = await validateVisibility({ visibility: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNotEmpty: 'visibility should not be empty',
      }),
    );
  });

  it('UTCID05 rejects an unrecognized visibility value', async () => {
    const errors = await validateVisibility({
      visibility: 'internal',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIn: 'visibility must be one of the following values: public, private',
      }),
    );
  });

  it('UTCID06 rejects a numeric visibility value', async () => {
    const errors = await validateVisibility({ visibility: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isString: 'visibility must be a string',
      }),
    );
  });
});

describe('BE-PRJ-05 UpdateProjectDto.validate(dto)', () => {
  it('UTCID01 accepts an empty update payload (all optional)', async () => {
    await expect(validateUpdate({})).resolves.toHaveLength(0);
  });

  it('UTCID02 accepts valid full updates with boundary description and genre', async () => {
    await expect(
      validateUpdate({
        name: 'Song B',
        description: 'b'.repeat(2000),
        genre: 'c'.repeat(60),
      }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID03 accepts a 1-character name', async () => {
    await expect(validateUpdate({ name: 'a' })).resolves.toHaveLength(0);
  });

  it('UTCID04 accepts a 100-character name', async () => {
    await expect(
      validateUpdate({ name: 'a'.repeat(100) }),
    ).resolves.toHaveLength(0);
  });

  it('UTCID05 rejects an empty name (SRS UC-19 5.E1; code lacks @IsNotEmpty)', async () => {
    const errors = await validateUpdate({ name: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isNotEmpty: 'name should not be empty',
      }),
    );
  });

  it('UTCID06 rejects a 101-character name (SRS BR-16: max 100 chars; code uses @MaxLength(120))', async () => {
    const errors = await validateUpdate({ name: 'a'.repeat(101) });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'name must be shorter than or equal to 100 characters',
      }),
    );
  });

  it('UTCID07 rejects a 120-character name (SRS BR-16: max 100 chars; code uses @MaxLength(120))', async () => {
    const errors = await validateUpdate({ name: 'a'.repeat(120) });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'name must be shorter than or equal to 100 characters',
      }),
    );
  });

  it('UTCID08 rejects a 2001-character description', async () => {
    const errors = await validateUpdate({ description: 'b'.repeat(2001) });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength:
          'description must be shorter than or equal to 2000 characters',
      }),
    );
  });

  it('UTCID09 rejects a 61-character genre', async () => {
    const errors = await validateUpdate({ genre: 'c'.repeat(61) });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        maxLength: 'genre must be shorter than or equal to 60 characters',
      }),
    );
  });

  it('UTCID10 rejects a non-string genre', async () => {
    const errors = await validateUpdate({ genre: 42 });
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isString: 'genre must be a string',
      }),
    );
  });
});
