export function computeSplit(priceLamports: number, agentFeeBps: number) {
  if (!Number.isInteger(priceLamports) || priceLamports < 0) {
    throw new Error("priceLamports must be a non-negative integer");
  }
  if (!Number.isInteger(agentFeeBps) || agentFeeBps < 0 || agentFeeBps > 10_000) {
    throw new Error("agentFeeBps must be between 0 and 10_000");
  }

  const agentFeeLamports = Math.floor((priceLamports * agentFeeBps) / 10_000);
  const sellerPayoutLamports = priceLamports - agentFeeLamports;

  return {
    agentFeeLamports,
    sellerPayoutLamports
  };
}
