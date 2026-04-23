"use client";

import { useState } from "react";

type FormState = {
  ownerId: string;
  title: string;
  description: string;
  condition: "new" | "used" | "broken";
  strategy: "fast" | "balanced" | "max_profit";
  minPriceSol: string;
  targetPriceSol: string;
  agentFeePercent: string;
  agentWalletPubkey: string;
};

const initialState: FormState = {
  ownerId: "",
  title: "",
  description: "",
  condition: "used",
  strategy: "balanced",
  minPriceSol: "0.25",
  targetPriceSol: "0.35",
  agentFeePercent: "10",
  agentWalletPubkey: ""
};

export function SellerForm() {
  const [state, setState] = useState<FormState>(initialState);
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setResult("");

    try {
      const payload = {
        ownerId: state.ownerId,
        title: state.title,
        description: state.description,
        condition: state.condition,
        imagePaths: [],
        mandate: {
          strategy: state.strategy,
          minPriceSol: Number(state.minPriceSol),
          targetPriceSol: Number(state.targetPriceSol),
          agentFeePercent: Number(state.agentFeePercent),
          agentWalletPubkey: state.agentWalletPubkey,
          timeLimitHours: 72
        }
      };

      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = (await response.json()) as { itemId?: string; error?: string };
      if (!response.ok || !body.itemId) {
        throw new Error(body.error ?? "Failed to create item");
      }

      const enrichResponse = await fetch(`/api/items/${body.itemId}/enrich`, {
        method: "POST"
      });

      const enrichBody = (await enrichResponse.json()) as { error?: string };
      if (!enrichResponse.ok) {
        throw new Error(enrichBody.error ?? "Failed to enrich item");
      }

      setResult(`Created and enriched item ${body.itemId}`);
      setState(initialState);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="tr-card p-5 space-y-3" onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold">Seller: Create Item + Mandate</h2>
      <p className="text-sm">Use a valid `profiles.id` UUID from Supabase for `ownerId`.</p>
      <input
        className="tr-input"
        placeholder="ownerId (uuid)"
        value={state.ownerId}
        onChange={(event) => setState((prev) => ({ ...prev, ownerId: event.target.value }))}
        required
      />
      <input
        className="tr-input"
        placeholder="Item title"
        value={state.title}
        onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
        required
      />
      <textarea
        className="tr-textarea min-h-24"
        placeholder="Description"
        value={state.description}
        onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
        required
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <select
          className="tr-select"
          value={state.condition}
          onChange={(event) =>
            setState((prev) => ({ ...prev, condition: event.target.value as FormState["condition"] }))
          }
        >
          <option value="new">new</option>
          <option value="used">used</option>
          <option value="broken">broken</option>
        </select>
        <select
          className="tr-select"
          value={state.strategy}
          onChange={(event) =>
            setState((prev) => ({ ...prev, strategy: event.target.value as FormState["strategy"] }))
          }
        >
          <option value="fast">fast</option>
          <option value="balanced">balanced</option>
          <option value="max_profit">max_profit</option>
        </select>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <input
          className="tr-input"
          type="number"
          min={0}
          step="0.000001"
          placeholder="Min SOL"
          value={state.minPriceSol}
          onChange={(event) => setState((prev) => ({ ...prev, minPriceSol: event.target.value }))}
          required
        />
        <input
          className="tr-input"
          type="number"
          min={0}
          step="0.000001"
          placeholder="Target SOL"
          value={state.targetPriceSol}
          onChange={(event) => setState((prev) => ({ ...prev, targetPriceSol: event.target.value }))}
          required
        />
        <input
          className="tr-input"
          type="number"
          min={0}
          max={100}
          step="0.1"
          placeholder="Agent fee %"
          value={state.agentFeePercent}
          onChange={(event) => setState((prev) => ({ ...prev, agentFeePercent: event.target.value }))}
          required
        />
      </div>
      <input
        className="tr-input"
        placeholder="Agent wallet pubkey"
        value={state.agentWalletPubkey}
        onChange={(event) => setState((prev) => ({ ...prev, agentWalletPubkey: event.target.value }))}
        required
      />
      <button className="tr-button" type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Create + Enrich"}
      </button>
      {result ? <p className="text-sm font-medium">{result}</p> : null}
    </form>
  );
}
