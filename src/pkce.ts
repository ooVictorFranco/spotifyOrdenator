import { createHash, randomBytes } from "node:crypto";

// PKCE (RFC 7636) permite o Authorization Code Flow sem client secret:
// o verifier fica so nesta maquina e o challenge (seu hash) e o unico
// dado que trafega na URL de autorizacao.
export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return randomBytes(16).toString("hex");
}
