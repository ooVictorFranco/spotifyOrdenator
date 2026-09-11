import { existsSync, readFileSync } from "node:fs";

function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variavel de ambiente ${name} nao definida. Copie .env.example para .env e preencha os valores.`,
    );
  }
  return value;
}

export const config = {
  clientId: required("SPOTIFY_CLIENT_ID"),
  redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8888/callback",
  scopes: ["playlist-read-private", "playlist-modify-public", "playlist-modify-private"],
  tokenCachePath: ".spotify-token.json",
};
