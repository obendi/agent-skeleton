import { z } from 'zod';
import { createStore } from './store.js';
import { users } from './schema.js';
import { hashPassword } from './security.js';
// Read password from stdin, never command arguments or committed environment files.
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024) throw new Error('Input too long'); }
const email = z.email().max(254).parse(process.argv[2]).toLowerCase();
const role = z.enum(['admin', 'user']).parse(process.argv[3] ?? 'user');
const password = z.string().min(12).max(128).parse(input.replace(/\r?\n$/, ''));
const database = createStore(z.string().min(1).parse(process.env.DATABASE_URL));
try { await database.db.insert(users).values({ email, role, passwordHash: await hashPassword(password) }); console.log('Usuario creado'); }
finally { await database.close(); }
