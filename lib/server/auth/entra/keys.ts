// Entra key material - loads and validates the certificate credential.
// This is why it exists: private_key_jwt needs a CryptoKey and an x5t#S256
// thumbprint, and both must come from files that are never committed.
import { type EntraConfig } from "../../config.ts";

const keyCache = new Map<string, Promise<CryptoKey>>();
const thumbprintCache = new Map<string, Promise<string>>();

function pemBody(pem: string, label: string): Uint8Array {
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  const start = pem.indexOf(begin);
  const finish = pem.indexOf(end);
  if (start < 0 || finish < start) {
    throw new Error(`${label} PEM block is missing`);
  }
  const body = pem.slice(start + begin.length, finish).replace(/\s/g, "");
  if (body === "") throw new Error(`${label} PEM body is empty`);
  let binary: string;
  try {
    binary = atob(body);
  } catch {
    throw new Error(`${label} PEM body is not valid base64`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pemToDer(pem: string, label: string): Uint8Array {
  return pemBody(pem, label);
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function loadPrivateKey(config: EntraConfig): Promise<CryptoKey> {
  if (config.credential.type !== "key") {
    throw new Error("private key is not configured");
  }
  const path = config.credential.privateKeyPath;
  const cached = keyCache.get(path);
  if (cached) return cached;
  const promise = (async () => {
    const pem = await Deno.readTextFile(path);
    const der = pemToDer(pem, "PRIVATE KEY");
    try {
      return await crypto.subtle.importKey(
        "pkcs8",
        der as unknown as BufferSource,
        { name: "RSA-PSS", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } catch (err) {
      throw new Error(`could not import the Entra private key: ${err instanceof Error ? err.name : "error"}`);
    }
  })();
  keyCache.set(path, promise);
  try {
    return await promise;
  } catch (err) {
    keyCache.delete(path);
    throw err;
  }
}

export async function loadCertificateThumbprint(config: EntraConfig): Promise<string> {
  if (config.credential.type !== "key") {
    throw new Error("certificate is not configured");
  }
  const path = config.credential.certificatePath;
  const cached = thumbprintCache.get(path);
  if (cached) return cached;
  const promise = (async () => {
    const pem = await Deno.readTextFile(path);
    const der = pemToDer(pem, "CERTIFICATE");
    const digest = await crypto.subtle.digest("SHA-256", der as unknown as BufferSource);
    return base64Url(new Uint8Array(digest));
  })();
  thumbprintCache.set(path, promise);
  try {
    return await promise;
  } catch (err) {
    thumbprintCache.delete(path);
    throw err;
  }
}