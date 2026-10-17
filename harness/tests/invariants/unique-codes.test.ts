import { expect, test } from 'vitest';
import { create, uurl, RESERVED, type Link } from '../../lib/links.ts';

test('[R-LINK-6][R-LINK-7][R-LINK-1] 1,000 sequential creates with no alias: all 201, 1,000 distinct well-formed codes, none reserved', async () => {
  const codes: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const r = await create({ url: uurl(`bulk${i % 10}`) });
    expect(r.status, `create #${i}: ${r.text}`).toBe(201);
    const l = r.json as Link;
    expect(l.code).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(l.isCustom).toBe(false);
    codes.push(l.code);
  }
  expect(new Set(codes).size).toBe(1000);
  for (const c of codes) expect(RESERVED).not.toContain(c.toLowerCase());
});
