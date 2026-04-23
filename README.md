# Trashure

Next.js app (root) + Supabase schema + Solana Anchor program.

## Quick start

```bash
yarn install
cp .env.example .env.local
yarn dev
```

Apply SQL from `supabase/migrations/` in your Supabase project before testing API routes.

## Implemented API routes

- `POST /api/items` create item + mandate
- `POST /api/items/:id/enrich` generate optimized listing + creative uses + embedding
- `GET /api/items/search?q=...` hybrid semantic/keyword search
- `POST /api/offers` create buyer offer
- `POST /api/offers/:id/respond` manual seller response
- `POST /api/offers/:id/agent-negotiate` autonomous agent negotiation
- `POST /api/deals/:id/prepare-settlement` derive Solana settlement inputs
- `POST /api/deals/:id/settle` persist settled status after on-chain execution

## Notes

- Offer negotiation and listing enrichment use OpenAI when `OPENAI_API_KEY` is set.
- When the key is absent, deterministic fallback logic is used.
- Deal settlement verification checks transaction signatures via `SOLANA_RPC_URL`.
- Solana program code lives in `programs/trashure_escrow`.
