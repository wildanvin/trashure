import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, serverError } from "@/lib/http";
import { solToLamports } from "@/lib/solana";
import { supabaseAdmin } from "@/lib/supabase-admin";

const createOfferSchema = z.object({
  itemId: z.string().uuid(),
  buyerId: z.string().uuid(),
  offerPriceSol: z.number().positive()
});

export async function POST(request: Request) {
  try {
    const payload = createOfferSchema.parse(await request.json());

    const item = await supabaseAdmin
      .from("items")
      .select("id, status")
      .eq("id", payload.itemId)
      .maybeSingle();

    if (item.error) {
      return serverError(item.error.message);
    }
    if (!item.data) {
      return badRequest("Item not found");
    }
    if (item.data.status !== "active") {
      return badRequest("Offers can only be created for active items");
    }

    const offerInsert = await supabaseAdmin
      .from("offers")
      .insert({
        item_id: payload.itemId,
        buyer_id: payload.buyerId,
        price_lamports: Number(solToLamports(payload.offerPriceSol)),
        status: "pending",
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      })
      .select("id")
      .single();

    if (offerInsert.error || !offerInsert.data) {
      return serverError(offerInsert.error?.message);
    }

    const messageInsert = await supabaseAdmin.from("negotiation_messages").insert({
      offer_id: offerInsert.data.id,
      actor: "buyer",
      message: `Initial offer: ${payload.offerPriceSol} SOL`,
      decision: null,
      metadata_json: { offerPriceSol: payload.offerPriceSol }
    });

    if (messageInsert.error) {
      return serverError(messageInsert.error.message);
    }

    return NextResponse.json({
      offerId: offerInsert.data.id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues.map((issue) => issue.message).join(", "));
    }

    return serverError(error instanceof Error ? error.message : undefined);
  }
}
