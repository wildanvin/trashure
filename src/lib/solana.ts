import crypto from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";

import { env } from "@/lib/env";

export const LAMPORTS_PER_SOL = 1_000_000_000;

export const TRASHURE_PROGRAM_ID = new PublicKey(env.trashureProgramId);

export function solToLamports(amountSol: number): bigint {
  if (!Number.isFinite(amountSol) || amountSol < 0) {
    throw new Error("Invalid SOL amount");
  }
  return BigInt(Math.round(amountSol * LAMPORTS_PER_SOL));
}

export function percentToBps(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("Percent must be between 0 and 100");
  }
  return Math.round(percent * 100);
}

export function hashItemId(itemId: string): Uint8Array {
  return crypto.createHash("sha256").update(itemId).digest();
}

export function findEscrowDealPda(itemId: string, buyer: string) {
  const buyerKey = new PublicKey(buyer);
  const hash = hashItemId(itemId);
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_deal"), Buffer.from(hash), buyerKey.toBuffer()],
    TRASHURE_PROGRAM_ID
  );

  return {
    pda: pda.toBase58(),
    bump,
    itemIdHashHex: Buffer.from(hash).toString("hex")
  };
}

export async function transactionExists(signature: string): Promise<boolean> {
  const connection = new Connection(env.solanaRpcUrl, "confirmed");
  const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
  return Boolean(status.value?.confirmationStatus);
}
