import { NextResponse } from "next/server";
import { z } from "zod";

import { computeSplit } from "@/lib/pricing";
import { badRequest, serverError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { transactionExists } from "@/lib/solana";

const settleSchema = z.object({
  txFundSig: z.string().min(32),
  txSettleSig: z.string().min(32),
  escrowPda: z.string().min(32),
  verifyOnChain: z.boolean().default(true)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = settleSchema.parse(await request.json());

    const dealResponse = await supabaseAdmin
      .from("deals")
      .select(
        "id, status, item_id, offer_id, accepted_price_lamports, items!inner(agent_mandates!inner(agent_fee_bps))"
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

    if (deal.status === "settled") {
      return NextResponse.json({ dealId: id, status: "settled" });
    }

    if (!(["pending_funding", "funded"] as string[]).includes(deal.status)) {
      return badRequest("Deal is not in a settle-able state");
    }

    if (payload.verifyOnChain) {
      const [fundExists, settleExists] = await Promise.all([
        transactionExists(payload.txFundSig),
        transactionExists(payload.txSettleSig)
      ]);

      if (!fundExists || !settleExists) {
        return badRequest("One or more transaction signatures were not found on-chain");
      }
    }

    const mandate = (deal.items as { agent_mandates: Array<{ agent_fee_bps: number }> }).agent_mandates[0];
    if (!mandate) {
      return serverError("No mandate found for deal item");
    }

    const acceptedPriceLamports = Number(deal.accepted_price_lamports);
    const split = computeSplit(acceptedPriceLamports, Number(mandate.agent_fee_bps));

    const settlementUpsert = await supabaseAdmin.from("onchain_settlements").upsert(
      {
        deal_id: id,
        program_id: process.env.NEXT_PUBLIC_TRASHURE_PROGRAM_ID,
        escrow_pda: payload.escrowPda,
        tx_fund_sig: payload.txFundSig,
        tx_settle_sig: payload.txSettleSig,
        settled_at: new Date().toISOString()
      },
      { onConflict: "deal_id" }
    );

    if (settlementUpsert.error) {
      return serverError(settlementUpsert.error.message);
    }

    const [dealUpdate, itemUpdate, offerUpdate] = await Promise.all([
      supabaseAdmin
        .from("deals")
        .update({ status: "settled", updated_at: new Date().toISOString() })
        .eq("id", id),
      supabaseAdmin
        .from("items")
        .update({ status: "sold", updated_at: new Date().toISOString() })
        .eq("id", deal.item_id),
      supabaseAdmin
        .from("offers")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", deal.offer_id)
    ]);

    if (dealUpdate.error || itemUpdate.error || offerUpdate.error) {
      return serverError(dealUpdate.error?.message ?? itemUpdate.error?.message ?? offerUpdate.error?.message);
    }

    return NextResponse.json({
      dealId: id,
      status: "settled",
      payout: {
        sellerPayoutLamports: split.sellerPayoutLamports,
        agentFeeLamports: split.agentFeeLamports
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues.map((issue) => issue.message).join(", "));
    }

    return serverError(error instanceof Error ? error.message : undefined);
  }
}
