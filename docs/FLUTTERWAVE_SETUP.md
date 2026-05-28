# Flutterwave Billing Setup

Step-by-step to wire the Upgrade buttons to a real checkout. The code is
already in place — you just need to add the keys and run one SQL migration.

## 1. Create a Flutterwave account
1. Sign up at https://dashboard.flutterwave.com.
2. Switch the dashboard to **Test mode** while you wire this up (top-right toggle).
3. Settings → API Keys. You'll see three values:
   - **Public Key** — `FLWPUBK_TEST-…` (starts with `FLWPUBK`)
   - **Secret Key** — `FLWSECK_TEST-…`
   - **Encryption Key** (not used here)

## 2. Add env vars
Set these in **Vercel → Project → Settings → Environment Variables**, for
both Preview and Production:

| Var | Value | Used by |
|---|---|---|
| `VITE_FLW_PUBLIC_KEY` | `FLWPUBK_TEST-…` (or live key) | Client — UpgradeModal opens the inline checkout with this |
| `FLW_SECRET_KEY` | `FLWSECK_TEST-…` (or live key) | Server — `api/settings.js` calls `/v3/transactions/:id/verify` for the post-redirect double-check |
| `FLW_HASH` | Any random secret string you choose | Server — validates the `verif-hash` header on incoming webhooks. Paste the same string into the Flutterwave dashboard (step 4) |

`VITE_FLW_PUBLIC_KEY` is a build-time variable; redeploy after adding it.

## 3. Run the SQL migration
In **Supabase → SQL Editor**, paste and run
[`supabase/flutterwave-billing.sql`](../supabase/flutterwave-billing.sql).
Creates `billing_events` (audit + idempotency table). Safe to re-run.

## 4. Configure the webhook in Flutterwave
1. Flutterwave dashboard → **Settings → Webhooks**.
2. **URL**: `https://designbrief-vert.vercel.app/api/settings`
   (or your own custom domain — the path is `/api/settings`)
3. **Secret hash**: paste the exact same value you set as `FLW_HASH` in Vercel.
4. Subscribe to the **`charge.completed`** event.
5. Save.

The webhook handler lives at the top of `api/settings.js`. It:
- Verifies `verif-hash` header matches `FLW_HASH`
- On `charge.completed` with `status = successful`, parses the
  `tx_ref` (format `db_<userId>_<plan>_<timestamp>`)
- Sets `profiles.plan`, refreshes credits to the plan cap, stamps
  `credits_reset_at = now()`, logs the event into `billing_events`

Idempotency is enforced via the unique `tx_ref` column on `billing_events`
so retries from Flutterwave never grant the plan twice.

## 5. Try a test payment
1. Make sure your dashboard is in **Test mode**.
2. As any Free user, click any Upgrade button → Flutterwave inline modal appears.
3. Use a test card: `5531 8866 5214 2950`, CVV `564`, exp `09/32`, OTP `12345`.
4. After the payment completes:
   - Webhook fires → `profiles.plan` updates → toast: "Payment received — activating your plan…"
   - `refreshAuthUser()` re-pulls the profile so the sidebar plan pill, credits bar, and gates flip immediately. No refresh required.

## 6. Switch to live
1. Flip the Flutterwave dashboard to **Live mode**.
2. Replace the three env vars with their Live equivalents (Public/Secret/Hash all change).
3. Update the webhook URL in Live mode too.
4. Trigger a real payment to confirm.

## Notes

### Why we don't use Vercel functions for checkout
Flutterwave's inline JS (`https://checkout.flutterwave.com/v3.js`) does the
heavy lifting on the client. The server only needs to:
- Receive the webhook (lives in `api/settings.js`)
- Optionally re-verify via the `verify_payment` action when the user returns
  from a redirect flow (we don't currently use redirect — inline only)

This keeps us under the 12-function Vercel hobby limit.

### Recurring billing
The current setup grants a single 30-day period per charge. The
`credits_reset_at` timestamp is checked by `check_and_reset_credits()` —
once it ages past 30 days, the user can still log in but their balance
won't auto-refresh, which is the correct behaviour for a one-shot charge.

For true recurring billing, create a Payment Plan in the Flutterwave
dashboard and switch the inline call from `amount` + `currency` to
`payment_plan: <id>`. Flutterwave will then auto-charge and fire
`charge.completed` again every cycle — the same webhook keeps working.
