use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

declare_id!("3jyAWteaJfAmPFcn4kHSKJZCGt41nu4ZaDchvBsDFJdi");

pub const STATUS_INITIALIZED: u8 = 0;
pub const STATUS_FUNDED: u8 = 1;
pub const STATUS_SETTLED: u8 = 2;
pub const STATUS_CANCELED: u8 = 3;

#[program]
pub mod trashure_escrow {
    use super::*;

    pub fn initialize_deal(
        ctx: Context<InitializeDeal>,
        item_id_hash: [u8; 32],
        price_lamports: u64,
        agent_fee_bps: u16,
    ) -> Result<()> {
        require!(price_lamports > 0, EscrowError::InvalidPrice);
        require!(agent_fee_bps <= 10_000, EscrowError::InvalidAgentFeeBps);

        let deal = &mut ctx.accounts.escrow_deal;
        deal.bump = ctx.bumps.escrow_deal;
        deal.item_id_hash = item_id_hash;
        deal.buyer = ctx.accounts.buyer.key();
        deal.seller = ctx.accounts.seller.key();
        deal.agent = ctx.accounts.agent.key();
        deal.price_lamports = price_lamports;
        deal.agent_fee_bps = agent_fee_bps;
        deal.status = STATUS_INITIALIZED;

        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        let (escrow_key, price_lamports) = {
            let deal = &ctx.accounts.escrow_deal;
            require!(deal.status == STATUS_INITIALIZED, EscrowError::InvalidStatus);
            require_keys_eq!(deal.buyer, ctx.accounts.buyer.key(), EscrowError::Unauthorized);
            (deal.key(), deal.price_lamports)
        };

        invoke(
            &system_instruction::transfer(
                &ctx.accounts.buyer.key(),
                &escrow_key,
                price_lamports,
            ),
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.escrow_deal.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        ctx.accounts.escrow_deal.status = STATUS_FUNDED;

        Ok(())
    }

    pub fn settle_deal(ctx: Context<SettleDeal>) -> Result<()> {
        let (seller_payout, agent_fee) = {
            let deal = &ctx.accounts.escrow_deal;
            require!(deal.status == STATUS_FUNDED, EscrowError::InvalidStatus);
            let authority = ctx.accounts.settlement_authority.key();
            require!(
                authority == deal.seller || authority == deal.agent,
                EscrowError::Unauthorized
            );
            compute_split(deal.price_lamports, deal.agent_fee_bps)?
        };
        let total = seller_payout
            .checked_add(agent_fee)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        ctx.accounts.escrow_deal.to_account_info().sub_lamports(total)?;
        ctx.accounts
            .seller_recipient
            .to_account_info()
            .add_lamports(seller_payout)?;
        ctx.accounts
            .agent_recipient
            .to_account_info()
            .add_lamports(agent_fee)?;

        ctx.accounts.escrow_deal.status = STATUS_SETTLED;

        Ok(())
    }

    pub fn cancel_unfunded_deal(ctx: Context<CancelUnfundedDeal>) -> Result<()> {
        require!(
            ctx.accounts.escrow_deal.status == STATUS_INITIALIZED,
            EscrowError::InvalidStatus
        );

        ctx.accounts.escrow_deal.status = STATUS_CANCELED;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(item_id_hash: [u8; 32])]
pub struct InitializeDeal<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + EscrowDeal::INIT_SPACE,
        seeds = [b"escrow_deal", item_id_hash.as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub escrow_deal: Account<'info, EscrowDeal>,

    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: PDA seed only; key is persisted for matching against settlement recipient.
    pub buyer: UncheckedAccount<'info>,

    /// CHECK: Key is persisted and checked at settlement.
    pub agent: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow_deal", escrow_deal.item_id_hash.as_ref(), buyer.key().as_ref()],
        bump = escrow_deal.bump
    )]
    pub escrow_deal: Account<'info, EscrowDeal>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleDeal<'info> {
    #[account(mut)]
    pub settlement_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow_deal", escrow_deal.item_id_hash.as_ref(), escrow_deal.buyer.as_ref()],
        bump = escrow_deal.bump
    )]
    pub escrow_deal: Account<'info, EscrowDeal>,

    #[account(mut, address = escrow_deal.seller)]
    pub seller_recipient: SystemAccount<'info>,

    #[account(mut, address = escrow_deal.agent)]
    pub agent_recipient: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelUnfundedDeal<'info> {
    #[account(
        mut,
        close = seller,
        has_one = seller,
        seeds = [b"escrow_deal", escrow_deal.item_id_hash.as_ref(), escrow_deal.buyer.as_ref()],
        bump = escrow_deal.bump
    )]
    pub escrow_deal: Account<'info, EscrowDeal>,

    #[account(mut)]
    pub seller: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowDeal {
    pub bump: u8,
    pub status: u8,
    pub agent_fee_bps: u16,
    pub item_id_hash: [u8; 32],
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub agent: Pubkey,
    pub price_lamports: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("Unauthorized account for this instruction")]
    Unauthorized,
    #[msg("The deal is not in the expected status")]
    InvalidStatus,
    #[msg("Invalid lamport amount")]
    InvalidPrice,
    #[msg("Agent fee basis points must be between 0 and 10000")]
    InvalidAgentFeeBps,
    #[msg("Overflow while computing values")]
    ArithmeticOverflow,
}

fn compute_split(price_lamports: u64, agent_fee_bps: u16) -> Result<(u64, u64)> {
    let agent_fee = (price_lamports as u128)
        .checked_mul(agent_fee_bps as u128)
        .ok_or(EscrowError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(EscrowError::ArithmeticOverflow)? as u64;

    let seller_payout = price_lamports
        .checked_sub(agent_fee)
        .ok_or(EscrowError::ArithmeticOverflow)?;

    Ok((seller_payout, agent_fee))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_math_matches_expected_values() {
        let (seller, fee) = compute_split(1_000_000_000, 1_000).expect("split should compute");
        assert_eq!(seller, 900_000_000);
        assert_eq!(fee, 100_000_000);
    }

    #[test]
    fn split_math_handles_zero_fee() {
        let (seller, fee) = compute_split(42, 0).expect("split should compute");
        assert_eq!(seller, 42);
        assert_eq!(fee, 0);
    }
}
