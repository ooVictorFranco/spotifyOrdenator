const API_BASE = "https://api.spotify.com/v1";

// Migracao de fevereiro/2026: /playlists/{id}/tracks foi descontinuado
// para apps em Development Mode; usar /playlists/{id}/items.
// O item de cada entrada vem em `item` (campo `track` e o alias antigo,
// mantido por compatibilidade, entao caimos nele se `item` nao vier).
interface PlaylistItemEntry {
  is_local: boolean;
  item?: { uri: string; name: string; type: string } | null;
  track?: { uri: string; name: string; type: string } | null;
}

interface PlaylistItemsPage {
  items: PlaylistItemEntry[];
  next: string | null;
  total: number;
}

export interface Track {
  uri: string;
  name: string;
  isLocal: boolean;
}

async function spotifyFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify API ${init.method ?? "GET"} ${path} falhou: ${response.status} ${await response.text()}`);
  }

  return response;
}

export function extractPlaylistId(idOrUrl: string): string {
  const match = idOrUrl.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (match) return match[1];
  return idOrUrl.trim();
}

export async function getAllPlaylistTracks(accessToken: string, playlistId: string): Promise<Track[]> {
  const tracks: Track[] = [];
  const fields = "items(is_local,item(uri,name,type),track(uri,name,type)),next,total";
  const limit = 50;
  let offset = 0;

  while (true) {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset), fields });
    const response = await spotifyFetch(accessToken, `/playlists/${playlistId}/items?${query}`);
    const page = (await response.json()) as PlaylistItemsPage;

    for (const entry of page.items) {
      const item = entry.item ?? entry.track;
      if (!item) {
        console.warn("Aviso: faixa sem dados de item (possivelmente removida do catalogo), ignorando na ordenacao.");
        continue;
      }
      tracks.push({ uri: item.uri, name: item.name, isLocal: entry.is_local });
    }

    offset += limit;
    if (offset >= page.total || page.items.length === 0) break;
  }

  return tracks;
}

async function replaceItems(accessToken: string, playlistId: string, uris: string[]): Promise<void> {
  await spotifyFetch(accessToken, `/playlists/${playlistId}/items`, {
    method: "PUT",
    body: JSON.stringify({ uris }),
  });
}

async function appendItems(accessToken: string, playlistId: string, uris: string[]): Promise<void> {
  await spotifyFetch(accessToken, `/playlists/${playlistId}/items`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function writeNewOrder(accessToken: string, playlistId: string, orderedUris: string[]): Promise<void> {
  const MAX_PER_CALL = 100;
  const batches = chunk(orderedUris, MAX_PER_CALL);

  if (batches.length === 0) return;

  // O PUT em modo "replace" substitui o conteudo inteiro da playlist
  // pelo array enviado; por isso o primeiro lote usa PUT e os demais
  // sao anexados ao final via POST, preservando a ordem calculada.
  await replaceItems(accessToken, playlistId, batches[0]);
  for (const batch of batches.slice(1)) {
    await appendItems(accessToken, playlistId, batch);
  }
}
