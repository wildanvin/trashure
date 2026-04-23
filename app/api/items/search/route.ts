import { NextResponse } from "next/server";

import { createEmbedding } from "@/lib/ai";
import { badRequest, serverError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);

    if (!query) {
      return badRequest("Query parameter q is required");
    }

    const embedding = await createEmbedding(query);
    const embeddingVector = embedding ? `[${embedding.join(",")}]` : null;

    const ranked = await supabaseAdmin.rpc("search_items_hybrid", {
      query_text: query,
      query_embedding: embeddingVector,
      match_count: limit
    });

    if (ranked.error) {
      return serverError(ranked.error.message);
    }

    return NextResponse.json({
      query,
      results: ranked.data ?? []
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : undefined);
  }
}
