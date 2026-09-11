import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { exec } from "node:child_process";
import { getAccessToken } from "./auth.js";
import { extractPlaylistId, getAllPlaylistTracks, writeNewOrder } from "./spotifyClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = readFileSync(join(__dirname, "public", "index.html"), "utf8");

// Porta da UI, diferente da porta do redirect_uri (auth.ts abre um
// servidor proprio e temporario so para o /callback do OAuth).
const PORT = 4310;

function send(res: import("node:http").ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// spotifyClient.ts embute o status HTTP na mensagem do erro; aqui so
// traduzimos os casos mais comuns para algo acionavel na UI.
function friendlyError(err: unknown): { status: number; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes(" 403 ")) {
    return { status: 403, message: "Sem permissao para essa playlist. Voce precisa ser dono(a) ou colaborador(a) dela." };
  }
  if (message.includes(" 404 ")) {
    return { status: 404, message: "Playlist nao encontrada. Confira o link ou ID." };
  }
  return { status: 502, message };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, INDEX_HTML, "text/html; charset=utf-8");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tracks") {
      const raw = url.searchParams.get("playlist");
      if (!raw) {
        send(res, 400, { error: "Informe o link ou ID da playlist." });
        return;
      }
      const playlistId = extractPlaylistId(raw);
      const accessToken = await getAccessToken();
      const tracks = await getAllPlaylistTracks(accessToken, playlistId);
      send(res, 200, { playlistId, tracks });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save") {
      const body = await readJsonBody(req);
      const playlistId = body.playlistId;
      const uris = body.uris;
      if (typeof playlistId !== "string" || !Array.isArray(uris) || uris.length === 0) {
        send(res, 400, { error: "playlistId e uris sao obrigatorios." });
        return;
      }
      const accessToken = await getAccessToken();
      await writeNewOrder(accessToken, playlistId, uris as string[]);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 404, { error: "Rota nao encontrada." });
  } catch (err) {
    console.error(err);
    const { status, message } = friendlyError(err);
    send(res, status, { error: message });
  }
});

async function main(): Promise<void> {
  console.log("Autenticando...");
  await getAccessToken();

  // Sem host explicito, o Node faz bind em todas as interfaces
  // (0.0.0.0/::), expondo a UI (sem autenticacao propria) para
  // qualquer dispositivo na mesma rede local.
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log(`Interface disponivel em ${url}`);
    exec(`open "${url}"`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
