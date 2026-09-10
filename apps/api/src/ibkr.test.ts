import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPositions } from './ibkr.js';
test('loads accounts first, collects every page, preserves shorts and missing prices', async () => {
  const paths: string[] = [];
  const responses = [[{ id: 'U123' }], [{ conid: 1, contractDesc: 'AAA', currency: 'USD', position: -2 }], [{ conid: 2, contractDesc: 'BBB', currency: 'EUR', position: 3 }, { conid: 3, contractDesc: 'Closed', currency: 'EUR', position: 0 }], []];
  const request = (async (url: unknown) => { paths.push(String(url)); return Response.json(responses.shift()); }) as typeof fetch;
  const result = await getPositions('https://gateway/v1/api/', 'U123', request);
  assert.equal(result.length, 2);
  assert.equal(result[0].position, -2);
  assert.equal(result[0].mktPrice, undefined);
  assert.deepEqual(paths.map(path => path.replace('https://gateway/v1/api', '')), ['/portfolio/accounts', '/portfolio/U123/positions/0', '/portfolio/U123/positions/1', '/portfolio/U123/positions/2']);
});
test('rejects expired sessions, mismatched accounts and malformed responses', async () => {
  await assert.rejects(getPositions('https://gateway', 'U123', (async () => new Response('', { status: 401 })) as typeof fetch), /caducado/);
  await assert.rejects(getPositions('https://gateway', 'U123', (async () => Response.json([{ id: 'U456' }])) as typeof fetch), /cuenta configurada/);
  await assert.rejects(getPositions('https://gateway', 'U123', (async () => Response.json({ error: 'not authenticated' })) as typeof fetch));
});
