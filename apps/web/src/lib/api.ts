export type User = { id: string; email: string; role: 'admin' | 'user' };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const origin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:3000';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${path}`, { credentials: 'include', method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'webapp' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(response.status, data.message ?? 'No se pudo conectar con el servidor'); }
  return response.status === 204 ? undefined as T : response.json();
}
