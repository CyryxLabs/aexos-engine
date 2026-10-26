import { createIngestHandler } from './handler.mjs';
import keys from './catalog-keys.json' with { type: 'json' };

const modern = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const serviceKey = modern.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(createIngestHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  serviceKey,
  catalogKeys: new Set(keys),
}));
