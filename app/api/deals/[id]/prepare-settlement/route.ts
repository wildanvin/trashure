import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

import { badRequest, serverError } from "@/lib/http";
import { findEscrowDealPda } from "@/lib/solana";
import { supabaseAdmin } from "@/lib/supabase-admin";

const prepareSchema = z.object({
  buyerWalletPubkey: z.string().min(32).max(64)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = prepareSchema.parse(await request.json());

    const dealResponse = await supabaseAdmin
      .from("deals")
      .select(
        "id, status, item_id, offer_id, accepted_price_lamports, items!inner(owner_id, agent_mandates!inner(agent_fee_bps, agent_wallet_pubkey)), offers!inner(buyer_id)"
      )
      .eq("id", id)
      .single();

    if (dealResponse.error) {
      return serverError(dealResponse.error.message);
    }

    const deal = dealResponse.data;
    if (!deal) {
      return badRequest("Deal not found");
    }

    if (!["pending_funding", "funded"].includes(deal.status)) {
      return badRequest("Deal is not open for settlement preparation");
    }

    const offerInfo = deal.offers as { buyer_id: string };
    const itemInfo = deal.items as {
      owner_id: string;
      agent_mandates: Array<{ agent_fee_bps: number; agent_wallet_pubkey: string }>;
    };
    const mandate = itemInfo.agent_mandates[0];

    if (!mandate) {
      return serverError("No mandate found for deal item");
    }

    const profiles = await supabaseAdmin
      .from("profiles")
      .select("id, wallet_pubkey")
      .in("id", [itemInfo.owner_id, offerInfo.buyer_id]);

    if (profiles.error) {
      return serverError(profiles.error.message);
    }

    const sellerProfile = profiles.data.find((profile) => profile.id === itemInfo.owner_id);
    const buyerProfile = profiles.data.find((profile) => profile.id === offerInfo.buyer_id);

    if (!sellerProfile?.wallet_pubkey || !buyerProfile?.wallet_pubkey) {
      return badRequest("Both seller and buyer profiles must have wallet_pubkey set");
    }

    if (buyerProfile.wallet_pubkey !== payload.buyerWalletPubkey) {
      return badRequest("Provided buyer wallet does not match offer buyer profile");
    }

    // Fail fast if any key is malformed.
    new PublicKey(sellerProfile.wallet_pubkey);
    new PublicKey(mandate.agent_wallet_pubkey);
    new PublicKey(payload.buyerWalletPubkey);

    const pda = findEscrowDealPda(deal.item_id, payload.buyerWalletPubkey);

    return NextResponse.json({
      dealId: id,
      status: deal.status,
      settlement: {
        programId: process.env.NEXT_PUBLIC_TRASHURE_PROGRAM_ID,
        escrowDealPda: pda.pda,
        itemIdHashHex: pda.itemIdHashHex,
        priceLamports: Number(deal.accepted_price_lamports),
        agentFeeBps: Number(mandate.agent_fee_bps),
        buyerWalletPubkey: payload.buyerWalletPubkey,
        sellerWalletPubkey: sellerProfile.wallet_pubkey,
        agentWalletPubkey: mandate.agent_wallet_pubkey
      },
      notes: [
        "Client wallet signs initialize/fund/settle instructions with Anchor.",
        "After chain confirmation, call /api/deals/:id/settle to persist state."
      ]
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues.map((issue) => issue.message).join(", "));
    }

    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
