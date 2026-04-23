import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, serverError } from "@/lib/http";
import { percentToBps, solToLamports } from "@/lib/solana";
import { supabaseAdmin } from "@/lib/supabase-admin";

const createItemSchema = z.object({
  ownerId: z.string().uuid(),
  title: z.string().min(3).max(140),
  description: z.string().min(8).max(4000),
  condition: z.enum(["new", "used", "broken"]),
  imagePaths: z.array(z.string().min(1)).default([]),
  mandate: z.object({
    strategy: z.enum(["fast", "balanced", "max_profit"]),
    minPriceSol: z.number().positive(),
    targetPriceSol: z.number().positive(),
    agentFeePercent: z.number().min(0).max(100),
    agentWalletPubkey: z.string().min(32).max(64),
    timeLimitHours: z.number().int().min(1).max(24 * 30).default(72)
  })
});

export async function POST(request: Request) {
  try {
    const payload = createItemSchema.parse(await request.json());

    const minLamports = Number(solToLamports(payload.mandate.minPriceSol));
    const targetLamports = Number(solToLamports(payload.mandate.targetPriceSol));

    if (minLamports > targetLamports) {
      return badRequest("minPriceSol cannot be greater than targetPriceSol");
    }

    const owner = await supabaseAdmin.from("profiles").select("id").eq("id", payload.ownerId).maybeSingle();
    if (owner.error) {
      return serverError(owner.error.message);
    }
    if (!owner.data) {
      return badRequest("ownerId was not found in profiles");
    }

    const itemInsert = await supabaseAdmin
      .from("items")
      .insert({
        owner_id: payload.ownerId,
        raw_title: payload.title,
        raw_description: payload.description,
        condition: payload.condition,
        status: "draft"
      })
      .select("id")
      .single();

    if (itemInsert.error || !itemInsert.data) {
      return serverError(itemInsert.error?.message);
    }

    const itemId = itemInsert.data.id;

    if (payload.imagePaths.length > 0) {
      const images = payload.imagePaths.map((storagePath, index) => ({
        item_id: itemId,
        storage_path: storagePath,
        sort_order: index
      }));

      const imageInsert = await supabaseAdmin.from("item_images").insert(images);
      if (imageInsert.error) {
        return serverError(imageInsert.error.message);
      }
    }

    const mandateInsert = await supabaseAdmin.from("agent_mandates").insert({
      item_id: itemId,
      strategy: payload.mandate.strategy,
      min_price_lamports: minLamports,
      target_price_lamports: targetLamports,
      agent_fee_bps: percentToBps(payload.mandate.agentFeePercent),
      agent_wallet_pubkey: payload.mandate.agentWalletPubkey,
      time_limit: new Date(Date.now() + payload.mandate.timeLimitHours * 60 * 60 * 1000).toISOString(),
      active: true
    });

    if (mandateInsert.error) {
      return serverError(mandateInsert.error.message);
    }

    return NextResponse.json({
      itemId
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues.map((issue) => issue.message).join(", "));
    }

    return serverError(error instanceof Error ? error.message : undefined);
  }
}
