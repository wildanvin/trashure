import { supabaseAdmin } from "@/lib/supabase-admin";

export async function ensureDealForOffer(params: {
  itemId: string;
  offerId: string;
  acceptedPriceLamports: number;
}) {
  const existing = await supabaseAdmin
    .from("deals")
    .select("id")
    .eq("offer_id", params.offerId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data?.id) {
    return existing.data.id;
  }

  const created = await supabaseAdmin
    .from("deals")
    .insert({
      item_id: params.itemId,
      offer_id: params.offerId,
      accepted_price_lamports: params.acceptedPriceLamports,
      status: "pending_funding"
    })
    .select("id")
    .single();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Failed to create deal");
  }

  return created.data.id;
}
