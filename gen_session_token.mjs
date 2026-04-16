/**
 * Generate a valid app_session_id cookie for user id=1 (admin owner)
 * Uses the same jose SignJWT as server/_core/sdk.ts
 */
import { SignJWT } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;
const VITE_APP_ID = process.env.VITE_APP_ID;

if (!JWT_SECRET) throw new Error("JWT_SECRET not set");
if (!VITE_APP_ID) throw new Error("VITE_APP_ID not set");

const secretKey = new TextEncoder().encode(JWT_SECRET);
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const issuedAt = Date.now();
const expirationSeconds = Math.floor((issuedAt + ONE_YEAR_MS) / 1000);

const token = await new SignJWT({
  openId: "VZHcqHCKffcABgBykVaBHA",
  appId: VITE_APP_ID,
  name: "睿 王",
})
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime(expirationSeconds)
  .sign(secretKey);

console.log("SESSION_TOKEN=" + token);
