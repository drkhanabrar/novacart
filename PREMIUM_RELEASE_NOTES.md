# NovaCart Premium Production Release

This release preserves the existing Korean Pink / cream visual identity and the existing NOVA AI, authentication, account, address, order, inventory and Razorpay architecture while upgrading the customer-facing storefront.

## Included

- Premium responsive header with search, account menu, bag and theme control
- Optional dark mode with the original light theme retained as default
- Real-product landing hero and dynamic category/collection presentation
- Premium catalog with search, category filtering and sorting
- Customer-facing product cards with clean merchandising and quick add
- Premium product detail page with image gallery, stock state, delivery/payment information and related products
- Cart with free-delivery progress, refined summary and mobile-friendly controls
- Checkout visual stepper and existing Razorpay/COD flow preserved
- Account dashboard with profile and address management
- Orders list plus dedicated order-detail tracking page
- Shipping, returns, contact, privacy, terms and about pages
- Loading states, global error UI and 404 page
- Security response headers in `next.config.ts`
- Customer-facing AI score removed from product merchandising UI
- Inventory-aware storefront visibility: only active products with sellable stock are shown
- Cart compatibility fix so add-to-cart uses product IDs, matching checkout server expectations
- Static internal route audit: 0 broken static route references

## Verification performed in this environment

- TypeScript/TSX parser diagnostics: 0
- Static internal route audit: 0 broken route references
- Production `next build` was not executable in this isolated environment because the package tarballs required by `npm ci` were not available in the local npm cache. Run `npm ci` followed by `npm run build` on the deployment machine/CI environment.

## Production configuration

Copy `.env.example` to the deployment environment and configure the real values, especially:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- optional `NEXT_PUBLIC_SUPPORT_EMAIL`

Never commit production secrets.
