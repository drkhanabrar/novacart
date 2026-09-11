# NovaCart Razorpay Setup

## Environment

Keep these server-only values in `.env.local`:

```env
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

`RAZORPAY_KEY_ID` is safe to expose to Checkout.js; `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` must remain server-side.

## Webhook

Create a Razorpay webhook pointing to:

```text
https://YOUR-DOMAIN.com/api/razorpay/webhook
```

Use the same generated secret as `RAZORPAY_WEBHOOK_SECRET`.

Enable at least:
- `payment.captured`

The endpoint verifies the `X-Razorpay-Signature` against the raw request body before processing.

## Database

After replacing the schema, run:

```powershell
npx prisma generate
npx prisma db push
```

## Build

```powershell
npm run build
```

## Important payment behavior

Razorpay draft orders do not decrement inventory. Inventory is decremented only after the payment is server-verified as captured. This avoids losing inventory on a cancelled/failed payment.

The existing COD flow remains available.
