// FILE: src/app/contact/page.tsx

"use client";

import Link from "next/link";
import {
  ArrowRight,
  Mail,
  MessageCircle,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

const CONTACT = {
  // REPLACE THESE PLACEHOLDERS LATER
  whatsappNumber: "910000000000",
  whatsappDisplay: "+91 00000 00000",
  email: "support@novacart.example",
};

const WHATSAPP_START_HOUR = 10;
const WHATSAPP_END_HOUR = 19;

/*
 * ADD HOLIDAYS HERE LATER.
 * Format: YYYY-MM-DD
 *
 * Example:
 * "2026-10-02",
 * "2026-10-20",
 */
const HOLIDAYS: string[] = [];

function getDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getWhatsAppStatus() {
  const now = new Date();

  const day = now.getDay();
  const hour = now.getHours();
  const dateKey = getDateKey(now);

  const isWeekday = day >= 1 && day <= 5;
  const isHoliday = HOLIDAYS.includes(dateKey);
  const isWithinHours =
    hour >= WHATSAPP_START_HOUR &&
    hour < WHATSAPP_END_HOUR;

  if (isHoliday) {
    return {
      available: false,
      label: "Closed today",
      message:
        "WhatsApp support is closed today due to a holiday.",
    };
  }

  if (!isWeekday) {
    return {
      available: false,
      label: "Closed today",
      message:
        "WhatsApp support is available Monday to Friday.",
    };
  }

  if (isWithinHours) {
    return {
      available: true,
      label: "Available now",
      message:
        "WhatsApp support is currently available.",
    };
  }

  return {
    available: false,
    label: "Currently offline",
    message:
      "WhatsApp support is available Monday to Friday, 10:00 AM to 7:00 PM.",
  };
}

export default function ContactPage() {
  const [whatsappStatus, setWhatsappStatus] =
    useState(getWhatsAppStatus());

  useEffect(() => {
    const updateStatus = () => {
      setWhatsappStatus(getWhatsAppStatus());
    };

    updateStatus();

    const interval = window.setInterval(
      updateStatus,
      60 * 1000,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const whatsappUrl = `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(
    "Hello NovaCart, I need help with my order.",
  )}`;

  return (
    <main className="mx-auto max-w-[1180px] px-5 py-10 sm:px-6 lg:py-16">
      <section className="overflow-hidden rounded-[2rem] border border-ink/10 bg-card shadow-[0_24px_80px_rgba(42,31,26,0.07)]">
        <div className="relative px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-poppy/5 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-sage/5 blur-3xl" />

          <div className="relative max-w-2xl">
            <span className="section-kicker">
              Contact NovaCart
            </span>

            <h1 className="mt-3 font-display text-4xl italic tracking-[-0.04em] text-ink sm:text-5xl">
              We&apos;re here to help.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-7 text-ink-soft sm:text-base">
              Need help with an order, payment, delivery or
              anything else? Choose the contact option that works
              best for you.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="premium-surface rounded-[2rem] p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366]/10">
            <MessageCircle className="h-6 w-6 text-[#25D366]" />
          </div>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div>
              <span className="section-kicker">
                WhatsApp
              </span>

              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-ink">
                Chat with us
              </h2>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                whatsappStatus.available
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-ink/5 text-ink-soft"
              }`}
            >
              {whatsappStatus.label}
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-ink-soft">
            {whatsappStatus.message}
          </p>

          <div className="mt-5 rounded-2xl bg-cream p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Clock3 className="h-4 w-4 text-poppy" />
              WhatsApp support hours
            </div>

            <p className="mt-2 text-sm text-ink-soft">
              Monday to Friday
              <br />
              <strong className="text-ink">
                10:00 AM – 7:00 PM
              </strong>
            </p>

            <p className="mt-2 text-xs leading-5 text-ink-soft/80">
              Excluding public holidays.
            </p>
          </div>

          {whatsappStatus.available ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="premium-button mt-6 w-full justify-center"
            >
              Open WhatsApp
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="premium-button mt-6 w-full cursor-not-allowed justify-center opacity-50"
            >
              WhatsApp currently unavailable
            </button>
          )}

          <p className="mt-3 text-center text-xs text-ink-soft">
            {CONTACT.whatsappDisplay}
          </p>
        </div>

        <div className="premium-surface rounded-[2rem] p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-poppy/10">
            <Mail className="h-6 w-6 text-poppy" />
          </div>

          <div className="mt-6">
            <span className="section-kicker">
              Email
            </span>

            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-ink">
              Send us an email
            </h2>
          </div>

          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Email us for detailed questions, order assistance,
            account issues or anything that does not require an
            immediate conversation.
          </p>

          <div className="mt-5 rounded-2xl bg-cream p-4">
            <div className="text-sm font-semibold text-ink">
              Email support
            </div>

            <p className="mt-2 break-all text-sm text-ink-soft">
              {CONTACT.email}
            </p>

            <p className="mt-2 text-xs leading-5 text-ink-soft/80">
              You can contact us by email at any time. We&apos;ll
              respond as soon as possible.
            </p>
          </div>

          <a
            href={`mailto:${CONTACT.email}?subject=NovaCart Support Request`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-ink/10 bg-card px-5 py-3.5 text-sm font-bold text-ink transition hover:border-poppy hover:text-poppy"
          >
            Email us
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm sm:p-8">
          <span className="section-kicker">
            Before contacting us
          </span>

          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-ink">
            Have your order details ready.
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">
            For order-related assistance, including your order
            number and the email address used for your NovaCart
            account will help us resolve your request faster.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/orders"
              className="premium-button"
            >
              View my orders
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/shipping"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-3 text-sm font-bold text-ink transition hover:border-poppy hover:text-poppy"
            >
              Shipping information
            </Link>
          </div>
        </div>

        {/* FIXED DARK-MODE CONTRAST */}
        <div className="rounded-[2rem] border border-sage/20 bg-sage/10 p-6 text-ink sm:p-8 dark:bg-card">
          <ShieldCheck className="h-6 w-6 text-sage" />

          <h3 className="mt-5 text-xl font-bold text-ink">
            Safe &amp; secure support
          </h3>

          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Never share your password, OTP or complete card
            details with anyone claiming to be from NovaCart.
          </p>
        </div>
      </section>
    </main>
  );
}