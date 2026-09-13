import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { Button } from './components/ui/button';

type Order = { id: string; ticker: string; portfolioEuros: number; percentage: number; entryPrice: number; quantity: number; stopLoss: number; createdAt: string };
type Orders = { portfolioEuros: number | null; orders: Order[] };
const euros = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 6 }).format(value);

export function GrowthOrders() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['growth-orders'], queryFn: () => api<Orders>('/finance/growth/orders') });
  const [total, setTotal] = useState<string | null>(null);
  const [ticker, setTicker] = useState('');
  const [percentage, setPercentage] = useState('10');
  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState('');
  const saved = query.data?.portfolioEuros;
  const dirty = total !== null && Number(total) !== saved;
  const price = Number(entry);
  const pct = Number(percentage);
  const valid = saved != null && price >= 0.0001 && price <= 1e9 && pct > 0 && pct <= 100;
  const budget = valid ? saved * pct / 100 : null;
  const quantity = valid ? Number(BigInt(Math.round(saved * 100)) * BigInt(Math.round(pct * 100)) / (100n * BigInt(Math.round(price * 10000)))) : null;
  const stop = valid ? Math.round(price * 10000) * 95 / 1_000_000 : null;
  const settings = useMutation({
    mutationFn: () => api<{ portfolioEuros: number }>('/finance/growth/settings', { portfolioEuros: Number(total ?? saved) }),
    onSuccess: async data => {
      client.setQueryData<Orders>(['growth-orders'], old => old ? { ...old, portfolioEuros: data.portfolioEuros } : old);
      setTotal(null); setMessage('Total de cartera guardado.');
      await client.invalidateQueries({ queryKey: ['growth-orders'] });
    },
  });
  const create = useMutation({
    mutationFn: () => api<Order>('/finance/growth/orders', { ticker, percentage: pct, entryPrice: price }),
    onSuccess: async () => { setTicker(''); setEntry(''); setMessage('Orden creada.'); await client.invalidateQueries({ queryKey: ['growth-orders'] }); },
  });
  if (query.isPending) return <section className="order-panel" role="status">Cargando órdenes…</section>;
  if (query.isError) return <section className="order-panel" role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Reintentar</Button></section>;
  return <section className="order-panel">
    <h2>Crear una orden</h2>
    <p className="text-sm text-muted-foreground">Registra tus órdenes en la app. No se envían a Interactive Brokers. Introduce los precios en euros.</p>
    <form className="portfolio-form" onSubmit={e => { e.preventDefault(); setMessage(''); settings.mutate(); }}>
      <label>Total de mi cartera (€)<input type="number" min="0.01" max="1000000000" step="0.01" required value={total ?? saved ?? ''} onChange={e => { setTotal(e.target.value); setMessage(''); }} /></label>
      <Button type="submit" variant="outline" disabled={settings.isPending || create.isPending}>{settings.isPending ? 'Guardando…' : 'Guardar total'}</Button>
    </form>
    {settings.isError && <p role="alert" className="text-red-700">{settings.error.message}</p>}
    {saved == null && <p className="text-sm">Guarda el total de tu cartera para crear tu primera orden.</p>}
    {dirty && <p className="text-sm">Guarda el nuevo total para utilizarlo en los cálculos.</p>}
    <form onSubmit={e => { e.preventDefault(); setMessage(''); create.mutate(); }}>
      <fieldset disabled={saved == null || dirty || settings.isPending || create.isPending}>
        <div className="order-fields">
          <label>Ticker<input required maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9.\-]{0,19}" placeholder="Ej. AAPL" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} /></label>
          <label>Posición sobre la cartera (%)<input type="number" required min="0.01" max="100" step="0.01" list="position-percentages" value={percentage} onChange={e => setPercentage(e.target.value)} /><datalist id="position-percentages"><option value="10"/><option value="15"/><option value="20"/></datalist></label>
          <label>Precio de entrada / stop (€)<input type="number" required min="0.0001" max="1000000000" step="0.0001" value={entry} onChange={e => setEntry(e.target.value)} /></label>
        </div>
        <dl className="order-preview" aria-live="polite">
          <div><dt>Importe asignado</dt><dd>{budget == null ? '—' : euros(budget)}</dd></div>
          <div><dt>Cantidad (acciones)</dt><dd>{quantity == null ? '—' : quantity.toLocaleString('es-ES')}</dd></div>
          <div><dt>Stop loss (−5 %)</dt><dd>{stop == null ? '—' : euros(stop)}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground mb-4">Cantidad redondeada hacia abajo a acciones enteras para no superar el importe asignado.</p>
        {quantity === 0 && <p role="alert">El importe asignado no alcanza para una acción.</p>}
        <Button type="submit" disabled={!valid || !quantity || quantity > 2147483647}>{create.isPending ? 'Creando…' : 'Crear orden'}</Button>
      </fieldset>
    </form>
    {create.isError && <p role="alert" className="text-red-700 mt-3">{create.error.message}</p>}
    {message && <p role="status" className="mt-3">{message}</p>}
    <h2 className="mt-8">Órdenes registradas</h2>
    {!query.data.orders.length ? <p className="text-sm text-muted-foreground">Todavía no has creado ninguna orden.</p> : <div className="table-scroll"><table><caption className="sr-only">Órdenes guardadas</caption><thead><tr>{['Fecha', 'Ticker', 'Cartera al crear', 'Posición', 'Entrada (€)', 'Cantidad', 'Stop loss (€)'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{query.data.orders.map(order => <tr key={order.id}><td>{new Date(order.createdAt).toLocaleString('es-ES')}</td><td>{order.ticker}</td><td>{euros(order.portfolioEuros)}</td><td>{order.percentage} %</td><td>{euros(order.entryPrice)}</td><td>{order.quantity.toLocaleString('es-ES')}</td><td>{euros(order.stopLoss)}</td></tr>)}</tbody></table></div>}
  </section>;
}
