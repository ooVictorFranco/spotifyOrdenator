import { createServer } from "node:http";
import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.js";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "./pkce.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

// Cache em disco para nao pedir login a cada execucao: o refresh_token
// dura ate ser revogado, entao so refazemos o fluxo completo se ele
// tambem falhar (ex.: usuario revogou o acesso do app no Spotify).
interface TokenCache {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

function readCache(): TokenCache | null {
  if (!existsSync(config.tokenCachePath)) return null;
  try {
    return JSON.parse(readFileSync(config.tokenCachePath, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(cache: TokenCache): void {
  writeFileSync(config.tokenCachePath, JSON.stringify(cache, null, 2));
}

// Servidor HTTP descartavel so para capturar o "code" do redirect;
// a porta precisa bater com a registrada como redirect_uri no app do
// Spotify (que exige 127.0.0.1 literal, "localhost" nao e mais aceito).
function waitForAuthorizationCode(port: number, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><p>Pode fechar esta aba e voltar ao terminal.</p></body></html>");
      server.close();

      if (error) {
        reject(new Error(`Autorizacao negada pelo Spotify: ${error}`));
      } else if (!code || state !== expectedState) {
        reject(new Error("Resposta de callback invalida (code ausente ou state incorreto)."));
      } else {
        resolve(code);
      }
    });

    server.listen(port);
  });
}

async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Falha ao trocar codigo por token: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Falha ao renovar token: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<TokenResponse>;
}

async function runAuthorizationFlow(): Promise<TokenCache> {
  const redirectUrl = new URL(config.redirectUri);
  const port = Number(redirectUrl.port || 80);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("state", state);

  const codePromise = waitForAuthorizationCode(port, state);

  console.log("Abrindo o navegador para autorizar o app no Spotify...");
  console.log(`Se nao abrir automaticamente, acesse:\n${authorizeUrl.toString()}\n`);
  exec(`open "${authorizeUrl.toString()}"`);

  const code = await codePromise;
  const token = await exchangeCodeForToken(code, codeVerifier);

  if (!token.refresh_token) {
    throw new Error("Spotify nao retornou refresh_token. Verifique os escopos solicitados.");
  }

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  };
}

export async function getAccessToken(): Promise<string> {
  const cached = readCache();

  // Margem de 60s para evitar usar um token que expira no meio de uma
  // sequencia de chamadas (paginacao + PUT/POST em lote).
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  if (cached?.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(cached.refresh_token);
      const newCache: TokenCache = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? cached.refresh_token,
        expires_at: Date.now() + refreshed.expires_in * 1000,
      };
      writeCache(newCache);
      return newCache.access_token;
    } catch (err) {
      console.warn("Nao foi possivel renovar o token salvo, refazendo login...", err);
    }
  }

  const fresh = await runAuthorizationFlow();
  writeCache(fresh);
  return fresh.access_token;
}
