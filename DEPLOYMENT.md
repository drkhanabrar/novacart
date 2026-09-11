# NovaCart deployment checklist

## 1. Environment

Set the variables from `.env.example` in your production environment. Never commit `.env` or production secrets.

## 2. Database

The current schema adds secure sessions, customer phone details, saved delivery addresses, and order delivery snapshots.

For the existing development database:

```bash
npx prisma db push
npx prisma generate
```

For a production database, create and review a Prisma migration in your normal development environment, commit it, then deploy with:

```bash
npx prisma migrate deploy
npx prisma generate
```

Do not use `db push` against a production database once migrations are established.

## 3. Build

```bash
npm ci
npm run build
npm start
```

The production build must complete successfully before the deployment is promoted.

## 4. Authentication

NovaCart uses an opaque, database-backed, HttpOnly session cookie. The browser no longer stores a user ID in localStorage.

Production requirements:

- HTTPS enabled
- `NEXT_PUBLIC_APP_URL` set to the real canonical URL
- strong database credentials
- `RESEND_API_KEY` and a verified `EMAIL_FROM` domain configured for password resets

## 5. Checkout

NovaCart supports Cash on Delivery and Razorpay online payments. Razorpay payment orders are created server-side and payment signatures are verified server-side before an order is marked `PAID`.

Configure:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- a public HTTPS webhook URL at `/api/razorpay/webhook`

Use Razorpay Test Mode before accepting live payments. Never commit payment credentials.

## 6. Storefront routes

The production storefront includes: home, catalog/search, product detail, cart, checkout, login, registration, password reset, account, addresses, orders, order detail, shipping, returns, privacy, terms, contact and about.

The customer-facing storefront hides products that are inactive or have no sellable stock.

## 7. Deployment workflow

Recommended workflow:

1. Push changes to a feature branch.
2. Run the production build locally/CI.
3. Deploy a preview.
4. Test login, registration, account, addresses, cart, checkout and orders.
5. Promote only after the preview passes.

Next.js recommends a develop → preview → ship workflow for production deployments. See the official Next.js deployment guidance for the current platform-specific process.
