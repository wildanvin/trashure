# Trashure

Next.js app (root) + Supabase schema + Solana Anchor program.

## Quick start

```bash
yarn install
cp .env.example .env.local
yarn dev
```

Apply SQL from `supabase/migrations/` in your Supabase project before testing API routes.

## Build and deploy Solana program (Devnet)

```bash
cd /home/daniel/projects/hackatons/colosseum/trashure0/programs/trashure_escrow

# 1) Create deployer wallet once (skip if it already exists)
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --keypair ~/.config/solana/id.json

# 2) Use devnet and fund deployer
solana config set --url https://api.devnet.solana.com
solana airdrop 2 --url devnet

# 3) Anchor workspace artifacts are written to ../target/deploy
mkdir -p ../target/deploy
test -f ../target/deploy/trashure_escrow-keypair.json || solana-keygen new --outfile ../target/deploy/trashure_escrow-keypair.json

# 4) Sync that keypair's public key into Anchor.toml + declare_id!
anchor keys sync

# 5) Build and deploy
anchor build
anchor deploy --provider.cluster devnet

# 6) Verify deployed program
ls -lh ../target/deploy/trashure_escrow.so
solana address -k ../target/deploy/trashure_escrow-keypair.json
solana program show 3jyAWteaJfAmPFcn4kHSKJZCGt41nu4ZaDchvBsDFJdi --url devnet
```

Then set `NEXT_PUBLIC_TRASHURE_PROGRAM_ID` in `.env.local` to `3jyAWteaJfAmPFcn4kHSKJZCGt41nu4ZaDchvBsDFJdi`.

Important: use `anchor build` (without `-v`). In Anchor CLI, `-v` means verifiable Docker build, not verbose logs.

If `solana program show $PROGRAM_ID --url devnet` says `Unable to find the account`, redeploy explicitly and check again:

```bash
solana program deploy ../target/deploy/trashure_escrow.so \
  --program-id ../target/deploy/trashure_escrow-keypair.json \
  --url https://api.devnet.solana.com
solana program show 3jyAWteaJfAmPFcn4kHSKJZCGt41nu4ZaDchvBsDFJdi --url https://api.devnet.solana.com
```

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
