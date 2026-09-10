import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError, type User } from '@/lib/api';
import './styles.css';
import { Growth } from './Growth';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2, staleTime: 30_000 } } });
function Account() {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: User }>('/auth/me') });
  const login = useMutation({ mutationFn: () => api<{ user: User }>('/auth/login', { email, password }), onSuccess: data => { client.setQueryData(['me'], data); setPassword(''); } });
  const logout = useMutation({ mutationFn: () => api<void>('/auth/logout', {}), onSuccess: () => { client.clear(); }, onError: error => { if (error instanceof ApiError && error.status === 401) client.clear(); } });
  const user = me.data?.user;
  const unavailable = me.error && !(me.error instanceof ApiError && me.error.status === 401);
  if (user) return <div className="private-app"><aside className="private-nav"><NavLink to="/" className="text-xl font-bold">webapp<span className="text-cyan-300">.</span></NavLink><nav aria-label="Navegación privada"><NavLink to="/" end>Mi cuenta</NavLink><p>Finanzas</p><NavLink to="/finanzas/growth">Growth</NavLink></nav><div className="mt-auto"><p className="text-xs break-all mb-4 text-slate-300">{user.email}</p><Button variant="outline" className="text-primary w-full" disabled={logout.isPending} onClick={() => logout.mutate()}><LogOut size={16}/>Cerrar sesión</Button>{logout.error && <p role="alert">{logout.error.message}</p>}</div></aside><main className="min-w-0"><Routes><Route path="/finanzas/growth" element={<Growth/>}/><Route path="*" element={<div className="growth-page"><p className="eyebrow">MI CUENTA</p><h1 className="text-3xl font-semibold">Bienvenido</h1><div className="broker-card"><div><p>{user.email}</p><p className="text-muted-foreground">{user.role === 'admin' ? 'Administrador' : 'Usuario'}</p></div></div><NavLink to="/finanzas/growth" className="font-semibold underline">Ver Finanzas → Growth</NavLink></div>}/></Routes></main></div>;
  return <main className="min-h-svh grid lg:grid-cols-[0.85fr_1.15fr]">
    <aside className="bg-primary text-primary-foreground p-8 lg:p-16 flex flex-col justify-between gap-12"><a href="/" className="text-xl font-bold tracking-tight">webapp<span className="text-cyan-300">.</span></a><div><div className="w-12 h-1 bg-cyan-300 mb-8"/><h1 className="text-4xl lg:text-6xl font-semibold tracking-tight leading-tight">Tu espacio.<br/>Todo conectado.</h1></div><p className="text-sm text-slate-300 flex gap-2 items-center"><ShieldCheck size={18}/> Acceso privado</p></aside>
    <section className="flex items-center justify-center p-6 sm:p-12"><div className="w-full max-w-md">
      {me.isPending ? <p role="status">Comprobando sesión…</p> : unavailable ? <div role="alert"><h2 className="text-2xl font-semibold mb-3">No podemos conectar</h2><p className="mb-6">Inténtalo de nuevo en unos instantes.</p><Button onClick={() => me.refetch()}>Reintentar</Button></div> : <><p className="eyebrow">BIENVENIDO A WEBAPP</p><h2 className="text-3xl font-semibold mb-3">Inicia sesión</h2><p className="text-muted-foreground mb-8">Introduce tus datos para acceder a tu cuenta.</p><form onSubmit={e => { e.preventDefault(); login.mutate(); }} className="space-y-5"><div><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@empresa.com"/></div><div><label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/></div>{login.error && <p role="alert" className="text-sm text-red-700">{login.error.message}</p>}<Button className="w-full" disabled={login.isPending} type="submit">{login.isPending ? 'Entrando…' : 'Entrar'}<ArrowRight size={16}/></Button></form><p className="text-sm text-muted-foreground mt-8">Si necesitas acceso, contacta con el administrador.</p></>}
    </div></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><Routes><Route path="/*" element={<Account/>}/></Routes></BrowserRouter></QueryClientProvider></React.StrictMode>);
