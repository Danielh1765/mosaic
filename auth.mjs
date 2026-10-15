// Sign-in with Supabase Auth. The session lives in one HttpOnly cookie, so page code never sees the tokens.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.mjs";

const COOKIE = "mosaic_session";
const MAX_AGE = 60 * 60 * 24 * 30;

/** @typedef {{access_token:string,refresh_token:string}} Tokens */
/** @typedef {{access:string,userId:string}} Session */

/** @param {string} jwt @returns {{sub?:string,exp?:number}} */
function decodeJwt(jwt) {
  try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")); } catch { return {}; }
}

/** @param {import("node:http").IncomingMessage} req @returns {{a?:string,r?:string}} */
function readCookie(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return {};
  try { return JSON.parse(Buffer.from(raw.slice(COOKIE.length + 1), "base64url").toString("utf8")); } catch { return {}; }
}

/** @param {import("node:http").IncomingMessage} req @returns {string} */
function cookieFlags(req) {
  const https = req.headers["x-forwarded-proto"] === "https";
  return `Path=/; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res @param {Tokens} tokens */
export function setSessionCookie(req, res, tokens) {
  const value = Buffer.from(JSON.stringify({ a: tokens.access_token, r: tokens.refresh_token })).toString("base64url");
  res.setHeader("Set-Cookie", `${COOKIE}=${value}; Max-Age=${MAX_AGE}; ${cookieFlags(req)}`);
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Max-Age=0; ${cookieFlags(req)}`);
}

/** @param {string} route @param {object} body @returns {Promise<any>} */
async function authCall(route, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${route}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Sign-in failed");
  return data;
}

/** @param {string} email @param {string} password @returns {Promise<Tokens>} */
export const signIn = (email, password) => authCall("token?grant_type=password", { email, password });

/** @param {string} email @param {string} password @returns {Promise<Tokens|null>} tokens, or null when the email must be confirmed first */
export async function signUp(email, password) {
  const data = await authCall("signup", { email, password });
  return data.access_token ? data : null;
}

/**
 * Returns the signed-in user, refreshing the access token when it is about to run out.
 * @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res
 * @returns {Promise<Session|null>}
 */
export async function getSession(req, res) {
  const { a, r } = readCookie(req);
  if (!a || !r) return null;
  const claims = decodeJwt(a);
  if (claims.sub && (claims.exp || 0) * 1000 > Date.now() + 60_000) return { access: a, userId: claims.sub };
  try {
    const tokens = await authCall("token?grant_type=refresh_token", { refresh_token: r });
    setSessionCookie(req, res, tokens);
    return { access: tokens.access_token, userId: decodeJwt(tokens.access_token).sub };
  } catch {
    clearSessionCookie(req, res);
    return null;
  }
}

/** @returns {Promise<boolean>} true once the one Mosaic account exists */
export async function hasOwner() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mosaic_has_owner`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}" });
  return res.ok ? Boolean(await res.json()) : true;
}
