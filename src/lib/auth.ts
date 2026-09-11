// FILE: src/lib/auth.ts
// Current session implementation uses a 30-day cookie/session by default. :contentReference[oaicite:2]{index=2}

import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "novacart_session";

const REMEMBERED_SESSION_TTL_SECONDS =
  60 * 60 * 24 * 30;

const NORMAL_SESSION_TTL_SECONDS =
  60 * 60 * 24;

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function createSession(
  userId: string,
  rememberMe = false,
) {
  const token = crypto
    .randomBytes(32)
    .toString("hex");

  const tokenHash =
    hashToken(token);

  const ttlSeconds = rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : NORMAL_SESSION_TTL_SECONDS;

  const expiresAt = new Date(
    Date.now() + ttlSeconds * 1000,
  );

  await prisma.session.deleteMany({
    where: {
      userId,
    },
  });

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore =
    await cookies();

  const cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge?: number;
  } = {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
  };

  /*
   * Checked:
   * persistent cookie survives browser restarts.
   *
   * Unchecked:
   * session cookie is removed when the browser session ends.
   */
  if (rememberMe) {
    cookieOptions.maxAge =
      REMEMBERED_SESSION_TTL_SECONDS;
  }

  cookieStore.set(
    SESSION_COOKIE,
    token,
    cookieOptions,
  );
}

export async function destroySession() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: {
        tokenHash:
          hashToken(token),
      },
    });
  }

  cookieStore.delete(
    SESSION_COOKIE,
  );
}

export async function getCurrentUser() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  if (!token) {
    return null;
  }

  const session =
    await prisma.session.findUnique({
      where: {
        tokenHash:
          hashToken(token),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            addresses: {
              orderBy: [
                {
                  isDefault:
                    "desc",
                },
                {
                  createdAt:
                    "desc",
                },
              ],
            },
          },
        },
      },
    });

  if (!session) {
    return null;
  }

  if (
    session.expiresAt <=
    new Date()
  ) {
    await prisma.session.delete({
      where: {
        id: session.id,
      },
    });

    cookieStore.delete(
      SESSION_COOKIE,
    );

    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user =
    await getCurrentUser();

  if (!user) {
    throw new Error(
      "UNAUTHORIZED",
    );
  }

  return user;
}

/*
 * Admin gate.
 *
 * The admin console can retire products, approve publishing and read supplier
 * cost and margin, so it is guarded by a role on the user record rather than by
 * a shared token. A token in a URL leaks through browser history, screenshots
 * and referrer headers, and cannot be revoked for one person.
 *
 * role defaults to "USER" in the schema, so no existing account gains access by
 * accident. Promoting someone is a deliberate database change.
 */
export async function getAdminUser() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  return user;
}

export async function requireAdmin() {
  const user = await getAdminUser();

  if (!user) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null;
}
