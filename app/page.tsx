import { SearchPanel } from "@/components/search-panel";
import { SellerForm } from "@/components/seller-form";

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
      <header className="space-y-2">
        <p className="tr-tag">Trashure MVP</p>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">AI Seller Agent + Solana Escrow</h1>
        <p className="max-w-3xl text-sm md:text-base">
          Start with simple listing workflows, then layer AI enrichment, semantic matching, autonomous
          negotiation, and on-chain settlement.
        </p>
      </header>

      <section className="grid lg:grid-cols-2 gap-4 items-start">
        <SellerForm />
        <SearchPanel />
      </section>
    </main>
  );
}
