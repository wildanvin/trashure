import { NextResponse } from "next/server";

import { negotiateOffer } from "@/lib/ai";
import { ensureDealForOffer } from "@/lib/deals";
import { badRequest, serverError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const offerResponse = await supabaseAdmin
      .from("offers")
      .select(
        "id, item_id, price_lamports, status, items!inner(agent_mandates!inner(min_price_lamports, target_price_lamports, strategy, time_limit))"
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
      return badRequest("Offer cannot be auto-negotiated in current status");
    }

    const mandate = (offer.items as {
      agent_mandates: Array<{
        min_price_lamports: number;
        target_price_lamports: number;
        strategy: "fast" | "balanced" | "max_profit";
        time_limit: string;
      }>;
    }).agent_mandates[0];

    if (!mandate) {
      return serverError("Mandate not found for item");
    }

    const now = Date.now();
    if (new Date(mandate.time_limit).getTime() < now) {
      const expiredUpdate = await supabaseAdmin
        .from("offers")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (expiredUpdate.error) {
        return serverError(expiredUpdate.error.message);
      }

      return NextResponse.json({
        offerId: id,
        decision: "reject",
        reason: "Mandate expired"
      });
    }

    const roundsResponse = await supabaseAdmin
      .from("negotiation_messages")
      .select("id", { count: "exact", head: true })
      .eq("offer_id", id)
      .eq("actor", "seller_agent");

    if (roundsResponse.error) {
      return serverError(roundsResponse.error.message);
    }

    const rounds = roundsResponse.count ?? 0;

    let decision = await negotiateOffer({
      strategy: mandate.strategy,
      offerPriceLamports: Number(offer.price_lamports),
      minPriceLamports: Number(mandate.min_price_lamports),
      targetPriceLamports: Number(mandate.target_price_lamports),
      rounds
    });

    if (decision.decision === "accept" && Number(offer.price_lamports) < Number(mandate.min_price_lamports)) {
      decision = {
        decision: "counter",
        counterPriceLamports: Number(mandate.min_price_lamports),
        rationale: "Adjusted to respect min mandate price."
      };
    }

    if (decision.decision === "counter") {
      const clampedCounter = Math.max(
        Number(mandate.min_price_lamports),
        Math.min(
          Number(mandate.target_price_lamports),
          decision.counterPriceLamports ?? Number(mandate.target_price_lamports)
        )
      );

      decision.counterPriceLamports = clampedCounter;
    }

    const offerUpdatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (decision.decision === "accept") {
      offerUpdatePayload.status = "accepted";
    }

    if (decision.decision === "reject") {
      offerUpdatePayload.status = "rejected";
    }

    if (decision.decision === "counter") {
      offerUpdatePayload.status = "countered";
      offerUpdatePayload.counter_price_lamports = decision.counterPriceLamports;
    }

    const offerUpdate = await supabaseAdmin.from("offers").update(offerUpdatePayload).eq("id", id);
    if (offerUpdate.error) {
      return serverError(offerUpdate.error.message);
    }

    const messageInsert = await supabaseAdmin.from("negotiation_messages").insert({
      offer_id: id,
      actor: "seller_agent",
      message: decision.rationale,
      decision: decision.decision,
      metadata_json: {
        counterPriceLamports: decision.counterPriceLamports ?? null,
        autonomous: true,
        round: rounds + 1
      }
    });

    if (messageInsert.error) {
      return serverError(messageInsert.error.message);
    }

    let dealId: string | null = null;
    if (decision.decision === "accept") {
      dealId = await ensureDealForOffer({
        itemId: offer.item_id,
        offerId: id,
        acceptedPriceLamports: Number(offer.price_lamports)
      });
    }

    return NextResponse.json({
      offerId: id,
      decision,
      dealId
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : undefined);
  }
}
