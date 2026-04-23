import { env } from "@/lib/env";
import type { AgentStrategy, NegotiationDecision } from "@/lib/types";

type ListingOptimization = {
  optimizedTitle: string;
  optimizedDescription: string;
};

type NegotiationOutput = {
  decision: NegotiationDecision;
  counterPriceLamports?: number;
  rationale: string;
};

async function callOpenAIJson<T>(messages: Array<{ role: "system" | "user"; content: string }>): Promise<T | null> {
  if (!env.openAiApiKey) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openAiApiKey}`
    },
    body: JSON.stringify({
      model: env.openAiModel,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function optimizeListing(input: {
  title: string;
  description: string;
  condition: string;
}): Promise<ListingOptimization> {
  const fallback: ListingOptimization = {
    optimizedTitle: `${input.title.trim()} (${input.condition})`,
    optimizedDescription: `${input.description.trim()}\n\nCondition: ${input.condition}. Great for practical reuse.`
  };

  const result = await callOpenAIJson<ListingOptimization>([
    {
      role: "system",
      content:
        "You optimize second-hand marketplace listings. Return JSON with keys: optimizedTitle and optimizedDescription. Keep concise and honest."
    },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ]);

  if (!result?.optimizedTitle || !result?.optimizedDescription) {
    return fallback;
  }

  return result;
}

export async function generateCreativeUses(input: {
  title: string;
  description: string;
}): Promise<string[]> {
  const fallback = [`Alternative use for ${input.title}`, `DIY reinterpretation of ${input.title}`];

  const result = await callOpenAIJson<{ ideas: string[] }>([
    {
      role: "system",
      content:
        "Generate 2 to 5 plausible creative alternative uses for a second-hand item. Return JSON with key ideas as an array of short strings."
    },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ]);

  const ideas = result?.ideas?.filter((idea) => typeof idea === "string" && idea.trim().length > 0) ?? [];
  if (ideas.length === 0) {
    return fallback;
  }

  return ideas.slice(0, 5);
}

export async function createEmbedding(text: string): Promise<number[] | null> {
  if (!env.openAiApiKey || !text.trim()) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openAiApiKey}`
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  return body.data?.[0]?.embedding ?? null;
}

export async function negotiateOffer(input: {
  strategy: AgentStrategy;
  offerPriceLamports: number;
  minPriceLamports: number;
  targetPriceLamports: number;
  rounds: number;
}): Promise<NegotiationOutput> {
  const fallback = fallbackNegotiation(input);

  const result = await callOpenAIJson<NegotiationOutput>([
    {
      role: "system",
      content:
        "You are a seller-side AI agent negotiating offers. Return JSON: decision (accept|reject|counter), counterPriceLamports (optional integer), rationale (string)."
    },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ]);

  if (!result?.decision || !result?.rationale) {
    return fallback;
  }

  return {
    decision: result.decision,
    counterPriceLamports: result.counterPriceLamports,
    rationale: result.rationale
  };
}

function fallbackNegotiation(input: {
  strategy: AgentStrategy;
  offerPriceLamports: number;
  minPriceLamports: number;
  targetPriceLamports: number;
  rounds: number;
}): NegotiationOutput {
  if (input.offerPriceLamports >= input.targetPriceLamports) {
    return { decision: "accept", rationale: "Offer reached target price." };
  }

  if (input.offerPriceLamports < input.minPriceLamports * 0.8 && input.rounds > 1) {
    return {
      decision: "reject",
      rationale: "Offer remains too low after negotiation rounds."
    };
  }

  const strategyMultiplier =
    input.strategy === "fast" ? 0.1 : input.strategy === "balanced" ? 0.3 : 0.5;

  const spread = Math.max(input.targetPriceLamports - input.offerPriceLamports, 0);
  const counter = input.offerPriceLamports + Math.round(spread * strategyMultiplier);

  return {
    decision: "counter",
    counterPriceLamports: Math.max(counter, input.minPriceLamports),
    rationale: "Countering to move toward strategy target while keeping deal likely."
  };
}
