// FILE: src/components/AccountPanel.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  LogOut,
  MapPin,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  createAddress,
  deleteAddress,
  logoutUser,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from "@/actions/auth";

const field =
  "w-full rounded-xl border border-ink/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-poppy";

const label =
  "font-tag text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft";

export default function AccountPanel({
  user,
}: {
  user: any;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<
    "profile" | "addresses"
  >("profile");

  const [editing, setEditing] =
    useState<string | null>(null);

  const [showAddressForm, setShowAddressForm] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const addresses = user.addresses || [];

  async function signOut() {
    await logoutUser();
    router.push("/");
    router.refresh();
  }

  const clearMessages = () => {
    setMessage(null);
    setError(null);
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-14">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="section-kicker">
            My NovaCart
          </span>

          <h1 className="mt-2 font-display text-4xl italic tracking-[-0.03em] text-ink sm:text-5xl">
            Your account.
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft">
            Manage your details, delivery addresses and
            orders in one place.
          </p>
        </div>

        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-poppy"
        >
          View orders
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="h-max rounded-[2rem] border border-ink/10 bg-card p-3 shadow-sm lg:sticky lg:top-24">
          {/* PROFILE IDENTITY CARD */}
          <div className="rounded-[1.5rem] border border-ink/10 bg-cream p-5 text-ink dark:border-sage/20 dark:bg-card">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-poppy/10 text-poppy">
              <UserRound className="h-5 w-5" />
            </div>

            <p className="mt-4 truncate text-sm font-bold text-ink">
              {user.name || "Customer"}
            </p>

            <p className="mt-1 truncate text-xs text-ink-soft">
              {user.email}
            </p>
          </div>

          <nav className="mt-3 grid gap-1">
            <button
              onClick={() => {
                clearMessages();
                setTab("profile");
              }}
              className={`account-nav-item ${
                tab === "profile"
                  ? "is-active"
                  : ""
              }`}
            >
              <UserRound className="h-4 w-4" />
              Profile
            </button>

            <button
              id="addresses"
              onClick={() => {
                clearMessages();
                setTab("addresses");
              }}
              className={`account-nav-item ${
                tab === "addresses"
                  ? "is-active"
                  : ""
              }`}
            >
              <MapPin className="h-4 w-4" />
              Addresses
            </button>

            <Link
              href="/orders"
              className="account-nav-item"
            >
              <Package className="h-4 w-4" />
              Orders
            </Link>

            <button
              onClick={signOut}
              className="account-nav-item hover:!text-poppy"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </aside>

        <section className="min-w-0 space-y-6">
          {(message || error) && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                error
                  ? "border-poppy/20 bg-poppy/10 text-poppy dark:text-red-300"
                  : "border-sage/25 bg-sage/10 text-sage"
              }`}
            >
              {error || message}
            </div>
          )}

          {tab === "profile" ? (
            <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
              {/* PERSONAL DETAILS */}
              <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm sm:p-8">
                <div className="mb-7">
                  <h2 className="text-xl font-bold text-ink">
                    Personal details
                  </h2>

                  <p className="mt-1 text-sm text-ink-soft">
                    Keep your contact information current
                    for order updates.
                  </p>
                </div>

                <form
                  action={async (fd) => {
                    clearMessages();

                    const r =
                      await updateProfile(fd);

                    if (r.error) {
                      setError(r.error);
                    } else {
                      setMessage(
                        "Profile updated successfully.",
                      );
                      router.refresh();
                    }
                  }}
                  className="grid gap-5 sm:grid-cols-2"
                >
                  <label className="sm:col-span-2">
                    <span className={label}>
                      Full name
                    </span>

                    <input
                      name="name"
                      defaultValue={
                        user.name || ""
                      }
                      required
                      className={`${field} mt-1.5`}
                    />
                  </label>

                  <label>
                    <span className={label}>
                      Email address
                    </span>

                    <input
                      value={user.email}
                      readOnly
                      className={`${field} mt-1.5 bg-cream-soft text-ink-soft`}
                    />
                  </label>

                  <label>
                    <span className={label}>
                      Mobile number
                    </span>

                    <input
                      name="phone"
                      defaultValue={
                        user.phone || ""
                      }
                      inputMode="tel"
                      placeholder="+91 98765 43210"
                      className={`${field} mt-1.5`}
                    />
                  </label>

                  <div className="sm:col-span-2 flex items-center justify-between gap-4 border-t border-ink/10 pt-6">
                    <p className="text-xs leading-5 text-ink-soft">
                      Your email address is tied to
                      your login and cannot be changed
                      from this page.
                    </p>

                    <button className="inline-flex shrink-0 items-center gap-2 rounded-full bg-poppy px-6 py-3 text-sm font-semibold text-white hover:bg-poppy-dark">
                      <Check className="h-4 w-4" />
                      Save changes
                    </button>
                  </div>
                </form>
              </div>

              {/* SHOPPING PROFILE */}
              <div className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm">
                <ShieldCheck className="h-6 w-6 text-sage" />

                <h3 className="mt-4 text-lg font-bold text-ink">
                  Your shopping profile
                </h3>

                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  Keep your phone and delivery details
                  current so checkout stays quick and
                  order updates reach you.
                </p>

                <div className="mt-6 grid gap-3 border-t border-ink/10 pt-6 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-ink-soft">
                      Saved addresses
                    </span>

                    <strong className="text-ink">
                      {addresses.length}
                    </strong>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-ink-soft">
                      Default address
                    </span>

                    <strong className="text-ink">
                      {addresses.some(
                        (a: any) =>
                          a.isDefault,
                      )
                        ? "Set"
                        : "Not set"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-ink">
                    Delivery addresses
                  </h2>

                  <p className="mt-1 text-sm text-ink-soft">
                    Save addresses for faster checkout.
                  </p>
                </div>

                <button
                  onClick={() => {
                    clearMessages();
                    setEditing(null);
                    setShowAddressForm(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-poppy px-5 py-2.5 text-sm font-semibold text-white hover:bg-poppy-dark"
                >
                  <Plus className="h-4 w-4" />
                  Add address
                </button>
              </div>

              {showAddressForm && (
                <AddressForm
                  onSubmit={async (f) => {
                    clearMessages();

                    const r =
                      await createAddress(f);

                    if (r.error) {
                      setError(r.error);
                    } else {
                      setMessage(
                        "Address saved.",
                      );
                      setShowAddressForm(false);
                      router.refresh();
                    }
                  }}
                  onCancel={() =>
                    setShowAddressForm(false)
                  }
                />
              )}

              {addresses.length === 0 &&
              !showAddressForm ? (
                <div className="rounded-[2rem] border border-dashed border-ink/15 bg-card p-14 text-center">
                  <MapPin className="mx-auto h-8 w-8 text-poppy" />

                  <h3 className="mt-4 font-bold text-ink">
                    No saved addresses
                  </h3>

                  <p className="mt-2 text-sm text-ink-soft">
                    Add your first delivery address
                    to speed up checkout.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {addresses.map((a: any) =>
                    editing === a.id ? (
                      <AddressForm
                        key={a.id}
                        initial={a}
                        onSubmit={async (f) => {
                          clearMessages();

                          const r =
                            await updateAddress(
                              f,
                            );

                          if (r.error) {
                            setError(r.error);
                          } else {
                            setMessage(
                              "Address updated.",
                            );
                            setEditing(null);
                            router.refresh();
                          }
                        }}
                        onCancel={() =>
                          setEditing(null)
                        }
                      />
                    ) : (
                      <article
                        key={a.id}
                        className="rounded-[2rem] border border-ink/10 bg-card p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-poppy" />

                            <span className="text-sm font-bold text-ink">
                              {a.label}
                            </span>

                            {a.isDefault && (
                              <span className="rounded-full bg-sage/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-sage">
                                Default
                              </span>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <button
                              aria-label="Edit address"
                              onClick={() => {
                                clearMessages();
                                setEditing(a.id);
                                setShowAddressForm(
                                  false,
                                );
                              }}
                              className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-cream hover:text-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <form
                              action={async (f) => {
                                clearMessages();

                                const r =
                                  await deleteAddress(
                                    f,
                                  );

                                if (r.error) {
                                  setError(
                                    r.error,
                                  );
                                } else {
                                  router.refresh();
                                }
                              }}
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={a.id}
                              />

                              <button
                                aria-label="Delete address"
                                className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-poppy/10 hover:text-poppy"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </form>
                          </div>
                        </div>

                        <p className="mt-5 text-sm font-semibold text-ink">
                          {a.fullName}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-ink-soft">
                          {a.line1}
                          {a.line2
                            ? `, ${a.line2}`
                            : ""}
                          <br />
                          {a.city}, {a.state}{" "}
                          {a.postalCode}
                          <br />
                          {a.country}
                          <br />
                          {a.phone}
                        </p>

                        {!a.isDefault && (
                          <form
                            action={async (f) => {
                              clearMessages();

                              const r =
                                await setDefaultAddress(
                                  f,
                                );

                              if (r.error) {
                                setError(
                                  r.error,
                                );
                              } else {
                                router.refresh();
                              }
                            }}
                            className="mt-5"
                          >
                            <input
                              type="hidden"
                              name="id"
                              value={a.id}
                            />

                            <button className="inline-flex items-center gap-1.5 text-xs font-bold text-poppy">
                              <Check className="h-3.5 w-3.5" />
                              Set as default
                            </button>
                          </form>
                        )}
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AddressForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: any;
  onSubmit: (
    f: FormData,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(
          new FormData(
            e.currentTarget,
          ),
        );
      }}
      className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm sm:p-7"
    >
      <div className="mb-5">
        <h3 className="font-bold text-ink">
          {initial
            ? "Edit address"
            : "Add a delivery address"}
        </h3>

        <p className="mt-1 text-xs text-ink-soft">
          Used to fulfil your orders.
        </p>
      </div>

      <input
        type="hidden"
        name="id"
        value={initial?.id || ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>
            Label
          </span>

          <select
            name="label"
            defaultValue={
              initial?.label || "Home"
            }
            className={`${field} mt-1.5`}
          >
            <option>Home</option>
            <option>Work</option>
            <option>Other</option>
          </select>
        </label>

        <label>
          <span className={label}>
            Full name
          </span>

          <input
            name="fullName"
            defaultValue={
              initial?.fullName || ""
            }
            required
            className={`${field} mt-1.5`}
          />
        </label>

        <label>
          <span className={label}>
            Phone
          </span>

          <input
            name="phone"
            defaultValue={
              initial?.phone || ""
            }
            required
            inputMode="tel"
            className={`${field} mt-1.5`}
          />
        </label>

        <label>
          <span className={label}>
            Postal code
          </span>

          <input
            name="postalCode"
            defaultValue={
              initial?.postalCode || ""
            }
            required
            inputMode="numeric"
            className={`${field} mt-1.5`}
          />
        </label>

        <label className="sm:col-span-2">
          <span className={label}>
            Address line 1
          </span>

          <input
            name="line1"
            defaultValue={
              initial?.line1 || ""
            }
            required
            className={`${field} mt-1.5`}
          />
        </label>

        <label className="sm:col-span-2">
          <span className={label}>
            Address line 2
          </span>

          <input
            name="line2"
            defaultValue={
              initial?.line2 || ""
            }
            className={`${field} mt-1.5`}
          />
        </label>

        <label>
          <span className={label}>
            City
          </span>

          <input
            name="city"
            defaultValue={
              initial?.city || ""
            }
            required
            className={`${field} mt-1.5`}
          />
        </label>

        <label>
          <span className={label}>
            State
          </span>

          <input
            name="state"
            defaultValue={
              initial?.state || ""
            }
            required
            className={`${field} mt-1.5`}
          />
        </label>

        <label className="sm:col-span-2">
          <span className={label}>
            Country
          </span>

          <input
            name="country"
            defaultValue={
              initial?.country ||
              "India"
            }
            required
            className={`${field} mt-1.5`}
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={
              initial?.isDefault ?? true
            }
            className="accent-poppy"
          />

          Set as default
        </label>
      </div>

      <div className="mt-6 flex gap-3">
        <button className="rounded-full bg-poppy px-5 py-2.5 text-sm font-semibold text-white hover:bg-poppy-dark">
          {initial
            ? "Update address"
            : "Save address"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-ink/15 bg-card px-5 py-2.5 text-sm font-semibold text-ink hover:bg-cream"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}