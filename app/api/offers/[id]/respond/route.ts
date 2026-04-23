import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureDealForOffer } from "@/lib/deals";
import { badRequest, serverError } from "@/lib/http";
import { solToLamports } from "@/lib/solana";
import { supabaseAdmin } from "@/lib/supabase-admin";

const respondSchema = z.object({
  action: z.enum(["accept", "reject", "counter"]),
  counterPriceSol: z.number().positive().optional(),
  note: z.string().max(400).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = respondSchema.parse(await request.json());

    const offerResponse = await supabaseAdmin
      .from("offers")
      .select(
        "id, item_id, price_lamports, status, items!inner(agent_mandates!inner(min_price_lamports, target_price_lamports, agent_fee_bps))"
      )
      .eq("id", id)
      .single();

    if (offerResponse.error) {
      return serverError(offerResponse.error.message);
    }

    const offer = offerResponse.data;
    if (!offer) {
      return badRequest("Offer not found");
    }

    if (!["pending", "countered"].includes(offer.status)) {
      return badRequest("Offer is not in a mutable state");
    }

    const mandate = (offer.items as { agent_mandates: Array<{ min_price_lamports: number }> }).agent_mandates[0];
    if (!mandate) {
      return serverError("Mandate not found for item");
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (payload.action === "accept") {
      if (Number(offer.price_lamports) < Number(mandate.min_price_lamports)) {
        return badRequest("Cannot accept offer below mandate min price");
      }
      updatePayload.status = "accepted";
    }

    if (payload.action === "reject") {
      updatePayload.status = "rejected";
    }

    if (payload.action === "counter") {
      if (!payload.counterPriceSol) {
        return badRequest("counterPriceSol is required when action is counter");
      }

      const counterLamports = Number(solToLamports(payload.counterPriceSol));
      if (counterLamports < Number(mandate.min_price_lamports)) {
        return badRequest("Counter cannot be below mandate min price");
      }

      updatePayload.status = "countered";
      updatePayload.counter_price_lamports = counterLamports;
    }

    const offerUpdate = await supabaseAdmin.from("offers").update(updatePayload).eq("id", id);
    if (offerUpdate.error) {
      return serverError(offerUpdate.error.message);
    }

    const messageInsert = await supabaseAdmin.from("negotiation_messages").insert({
      offer_id: id,
      actor: "seller_agent",
      message: payload.note ?? `Manual seller response: ${payload.action}`,
      decision: payload.action,
      metadata_json: { counterPriceSol: payload.counterPriceSol ?? null }
    });

    if (messageInsert.error) {
      return serverError(messageInsert.error.message);
    }

    let dealId: string | null = null;
    if (payload.action === "accept") {
      dealId = await ensureDealForOffer({
        itemId: offer.item_id,
        offerId: id,
        acceptedPriceLamports: Number(offer.price_lamports)
      });
    }

    return NextResponse.json({
      offerId: id,
      action: payload.action,
      dealId
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues.map((issue) => issue.message).join(", "));
    }

    return serverError(error instanceof Error ? error.message : undefined);
  }
}
