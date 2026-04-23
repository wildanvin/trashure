export type ItemCondition = "new" | "used" | "broken";
export type ItemStatus = "draft" | "active" | "sold" | "expired";
export type AgentStrategy = "fast" | "balanced" | "max_profit";
export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "withdrawn" | "expired";
export type DealStatus = "pending_funding" | "funded" | "settled" | "canceled";

export type NegotiationDecision = "accept" | "reject" | "counter";
