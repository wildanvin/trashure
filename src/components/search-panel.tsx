"use client";

import { useState } from "react";

type SearchResult = {
  item_id: string;
  owner_id: string;
  title: string;
  description: string;
  creative_uses_json: string[];
  score: number;
};

export function SearchPanel() {
  const [query, setQuery] = useState("shelf");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/items/search?q=${encodeURIComponent(query)}&limit=10`);
      const body = (await response.json()) as { results?: SearchResult[] };
      setResults(body.results ?? []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="tr-card p-5 space-y-3">
      <h2 className="text-lg font-semibold">Buyer: Smart Search</h2>
      <div className="flex gap-2">
        <input
          className="tr-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try: shelf, desk, lamp"
        />
        <button className="tr-button secondary" onClick={search} disabled={loading} type="button">
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      <div className="space-y-3">
        {results.map((result) => (
          <article key={result.item_id} className="border rounded-xl border-black/10 p-3 bg-white/75">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{result.title}</h3>
              <span className="tr-tag">score {result.score.toFixed(3)}</span>
            </div>
            <p className="text-sm mt-1">{result.description}</p>
            {result.creative_uses_json.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {result.creative_uses_json.map((idea) => (
                  <span className="tr-tag" key={idea}>
                    {idea}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
