# Trashure — AI Agent Marketplace (Hackathon Spec)

## 🧭 Overview

Trashure is a marketplace where users delegate the sale of unused items to AI agents.
Instead of manually listing, pricing, and negotiating, users assign an **agent mandate**, and the agent handles the lifecycle of the sale.

The system combines:

- AI agents for listing optimization and negotiation
- Smart contract–based payment and revenue splitting
- **Subtle AI enhancements that increase perceived value without changing user behavior**

---

## 🎯 Core Value Proposition

- Reduce friction in selling second-hand items
- Increase conversion via AI-enhanced listings
- Automate negotiation and pricing strategies
- Enable trustless transactions via blockchain
- **Enhance how items are perceived (not how users behave)**

---

## 🧠 Key Product Principle

Users should behave exactly like a normal marketplace:

- Search normally (“chair”, “desk”, “lamp”)
- Browse listings
- Make offers

👉 All innovation happens invisibly through AI.

---

## 🤖 AI Enhancements (Core Differentiator)

### 1. AI DIY Plans (Enhancement, Not Core Feature)

Trashure is **not** a DIY platform.

Instead:

- Each listing is enriched with **alternative uses** and **creative reinterpretations**

#### Example:

Item: _Old ladder_

Displayed as:

- ✅ Ladder (original use)
- 🌿 Plant shelf idea
- 📚 Bookshelf idea

#### Purpose:

- Increase perceived value
- Expand buyer pool
- Improve conversion rate

---

### 2. Smart Matching (Invisible Intent Engine)

Users do NOT search for “intents”.

They search normally:

- “desk”

The system expands results using AI:

- Desk ✅
- Table that can function as a desk ✅
- DIY desk idea from another item ✅

#### Purpose:

- Match supply to broader demand
- Surface non-obvious items
- Increase liquidity without changing UX

---

### 3. Listing Optimization

- AI rewrites titles and descriptions
- Improves clarity and appeal
- Standardizes structure

---

### 4. Pricing Strategy

- Time-based adjustments
- Strategy-driven behavior:
  - Fast sale
  - Balanced
  - Max profit

---

### 5. Negotiation Assistance (Controlled)

- Rule-based with AI enhancement
- Handles:
  - Accept / reject
  - Counteroffers within bounds

---

## 🧱 System Architecture

### 1. Client (Web / Mobile)

- Item upload (image + description)
- Agent configuration UI
- Buyer browsing/search interface
- Offer submission interface

### 2. Backend API

- Item storage and indexing
- Agent orchestration layer
- Matching + pricing logic
- Event system (offers, updates, status)

### 3. AI Agent Layer

- Listing optimization
- Pricing strategy
- Negotiation logic
- **Creative reuse suggestion generation**
- **Semantic matching / expansion**

### 4. Blockchain Layer

- Smart contracts for:
  - Escrow
  - Payment settlement
  - Revenue splitting

Built on:

- Solana (execution layer)
- World Chain (identity + sponsor infra)

---

## 🤖 Agent Model

### Seller Agent

Responsible for:

- Enhancing listing quality
- Generating alternative uses
- Setting and adjusting price
- Responding to buyer offers

### Buyer Interaction Logic

- Offer evaluation
- Counteroffer generation
- Acceptance thresholds

---

## 📦 Core Data Model

### Item

```json id="phk03z"
{
  "id": "string",
  "title": "string",
  "description": "string",
  "images": ["url"],
  "condition": "new | used | broken",
  "owner_id": "user_id",
  "status": "active | sold | expired"
}
```

### Agent Mandate

```json id="xm7cu3"
{
  "item_id": "string",
  "min_price": "number",
  "target_price": "number",
  "time_limit": "timestamp",
  "strategy": "fast | balanced | max_profit",
  "agent_fee_percent": "number"
}
```

### Offer

```json id="znuiwu"
{
  "item_id": "string",
  "buyer_id": "string",
  "offer_price": "number",
  "status": "pending | accepted | rejected | countered"
}
```

---

## 🔄 Core Flows

### Seller Flow

1. Upload item
2. Configure agent mandate
3. Agent:
   - Rewrites listing
   - Adds alternative uses
   - Publishes item
   - Starts pricing strategy

---

### Buyer Flow

1. Search (normal keywords)
2. System expands results (AI matching)
3. User views enriched listings
4. User submits offer or buys

---

### Transaction Flow (On-Chain)

1. Buyer commits funds to escrow (Solana)
2. Smart contract holds funds
3. Upon acceptance:
   - Funds distributed:
     - Seller payout
     - Agent fee

---

## 🔗 Blockchain Design

### Smart Contract Responsibilities

- Escrow funds
- Enforce transaction conditions
- Split payments automatically

---

### Suggested Implementation

- Solana program (Rust + Anchor)
- Use PDAs for escrow accounts and item linkage

---

## 🌐 World Chain Integration

Integration with World Chain:

### Use Cases:

- Proof of personhood (reduce spam/fraud)
- Unique user identity
- Trust layer for marketplace interactions

---

## 📚 Resources

### Solana

- Solana Foundation docs: https://docs.solana.com
- Anchor: https://www.anchor-lang.com
- Solana Pay: https://solanapay.com

### World Chain

- Worldcoin docs: https://docs.worldcoin.org
- World ID: https://worldcoin.org/world-id

---

## ⚙️ Suggested Tech Stack

### Frontend

- React / Next.js
- Tailwind

### Backend

- Node.js / TypeScript
- PostgreSQL / Firebase

### AI Layer

- LLM API (prompt-based)
- No need for complex autonomy

### Blockchain

- Solana (Anchor)
- Wallet adapter (Phantom)

---

## 🚧 MVP Scope

### MUST HAVE

- Item upload
- Agent mandate
- AI listing optimization
- AI alternative uses (key feature)
- Smart search expansion
- Offer system
- Solana payment + split

---

### NICE TO HAVE

- Strategy modes
- Agent performance stats
- UI highlighting “creative uses”

---

### OUT OF SCOPE

- External marketplace integrations
- Full autonomous negotiation
- Logistics/shipping

---

## 🧪 Demo Scenario

1. User uploads “old ladder”
2. Agent:
   - Improves listing
   - Adds:
     - plant shelf idea
     - bookshelf idea

3. Buyer searches “shelf”
4. Ladder appears via smart matching
5. Buyer makes offer
6. Agent counters
7. Deal closes on-chain

---

## 🧠 Core Insight

Trashure does not change how users search or buy.

It changes:

- How items are interpreted
- How value is discovered
- How selling is executed

---

## 🚀 One-Liner

Trashure is a marketplace where AI agents enhance, reinterpret, and sell items—while blockchain ensures trustless execution and automated revenue sharing.

---
