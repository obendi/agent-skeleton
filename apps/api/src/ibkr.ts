import { z } from 'zod';
export class IbkrError extends Error {}
const positionSchema = z.object({
  conid: z.number(), contractDesc: z.string(), position: z.number(), currency: z.string(),
  assetClass: z.string().nullish(), mktPrice: z.number().nullish(), mktValue: z.number().nullish(),
  avgCost: z.number().nullish(), unrealizedPnl: z.number().nullish(),
});
export async function getPositions(baseUrl: string, accountId: string, request: typeof fetch = fetch) {
  const signal = AbortSignal.timeout(20_000);
  async function get(path: string) {
    const response = await request(`${baseUrl.replace(/\/$/, '')}${path}`, { signal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) throw new IbkrError('La sesión de Interactive Brokers ha caducado. Inicia sesión en el Client Portal Gateway y vuelve a actualizar.');
    if (!response.ok) throw new IbkrError('Interactive Brokers no está disponible. Vuelve a intentarlo en unos instantes.');
    return response.json();
  }
  const accounts = z.array(z.object({ id: z.string() })).parse(await get('/portfolio/accounts'));
  if (!accounts.some(account => account.id === accountId)) throw new IbkrError('La cuenta configurada no está disponible en la sesión de Interactive Brokers.');
  const positions: z.infer<typeof positionSchema>[] = [];
  for (let page = 0; page < 100; page++) {
    const batch = z.array(positionSchema).parse(await get(`/portfolio/${encodeURIComponent(accountId)}/positions/${page}`));
    if (!batch.length) return positions.filter(position => position.position !== 0);
    positions.push(...batch);
  }
  throw new IbkrError('No se pudo obtener la cartera completa. Vuelve a intentarlo.');
}
