import { NextResponse } from "next/server";

import { createEmbedding, generateCreativeUses, optimizeListing } from "@/lib/ai";
import { badRequest, serverError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const itemResponse = await supabaseAdmin
      .from("items")
      .select("id, raw_title, raw_description, condition")
      .eq("id", id)
      .single();

    if (itemResponse.error) {
      return serverError(itemResponse.error.message);
    }

    const item = itemResponse.data;
    if (!item) {
      return badRequest("Item not found");
    }

    const optimization = await optimizeListing({
      title: item.raw_title,
      description: item.raw_description,
      condition: item.condition
    });

    const creativeUses = await generateCreativeUses({
      title: item.raw_title,
      description: item.raw_description
    });

    const embeddingText = [
      optimization.optimizedTitle,
      optimization.optimizedDescription,
      ...creativeUses,
      item.raw_title,
      item.raw_description
    ].join("\n");

    const embedding = await createEmbedding(embeddingText);

    const upsert = await supabaseAdmin.from("item_enrichments").upsert(
      {
        item_id: id,
        optimized_title: optimization.optimizedTitle,
        optimized_description: optimization.optimizedDescription,
        creative_uses_json: creativeUses,
        keyword_text: `${item.raw_title}\n${optimization.optimizedTitle}\n${creativeUses.join("\n")}`,
        embedding: embedding ? `[${embedding.join(",")}]` : null
      },
      { onConflict: "item_id" }
    );

    if (upsert.error) {
      return serverError(upsert.error.message);
    }

    const activate = await supabaseAdmin
      .from("items")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (activate.error) {
      return serverError(activate.error.message);
    }

    return NextResponse.json({
      itemId: id,
      optimization,
      creativeUses
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : undefined);
  }
}
