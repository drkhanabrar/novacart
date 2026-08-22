# NovaCart Optional Dark Mode

This patch adds an optional dark mode while leaving the original Korean Pink / cream theme as the default.

## 1. Copy these files

- `src/components/ThemeToggle.tsx`
- `src/components/ThemeInitScript.tsx`
- `dark-mode.css`

## 2. Load the CSS

Import `dark-mode.css` immediately after your existing `globals.css` import in `src/app/layout.tsx`:

```tsx
import "./globals.css";
import "./dark-mode.css";
```

Or merge the contents of `dark-mode.css` into `globals.css`.

## 3. Add the initialization script

Inside `<body>`, before the Navbar, add:

```tsx
<ThemeInitScript />
<Navbar ... />
```

Add the import:

```tsx
import { ThemeInitScript } from "@/components/ThemeInitScript";
```

## 4. Add the theme button to the existing Navbar

Do NOT replace the existing Navbar. Import:

```tsx
import { ThemeToggle } from "@/components/ThemeToggle";
```

Then place `<ThemeToggle />` inside the existing right-side header actions, next to the account/cart controls.

## Behavior

- Original Korean Pink / cream theme remains the default.
- Clicking the button toggles Light ↔ Dark.
- Theme is persisted in `localStorage`.
- Theme is restored before the page paints to minimize flash.
- Product images and existing storefront layout are not replaced or redesigned.
