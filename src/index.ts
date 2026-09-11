import { getAccessToken } from "./auth.js";
import { extractPlaylistId, getAllPlaylistTracks, writeNewOrder } from "./spotifyClient.js";
import { sortTracksAlphabetically } from "./sort.js";

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Uso: npm run sort -- <playlist_id_ou_link>");
    process.exit(1);
  }

  const playlistId = extractPlaylistId(arg);

  console.log("Autenticando...");
  const accessToken = await getAccessToken();

  console.log("Buscando faixas da playlist...");
  const tracks = await getAllPlaylistTracks(accessToken, playlistId);
  console.log(`${tracks.length} faixa(s) encontrada(s).`);

  const localTracks = tracks.filter((t) => t.isLocal || t.uri.startsWith("spotify:local:"));
  if (localTracks.length > 0) {
    console.warn(
      `Aviso: ${localTracks.length} faixa(s) local(is) encontrada(s). ` +
        "Elas serao incluidas na ordenacao, mas o Spotify pode nao reordena-las corretamente:",
    );
    for (const t of localTracks) console.warn(`  - ${t.name}`);
  }

  const sorted = sortTracksAlphabetically(tracks);

  console.log("Gravando nova ordem na playlist...");
  await writeNewOrder(accessToken, playlistId, sorted.map((t) => t.uri));

  console.log("Pronto! Playlist reordenada em ordem alfabetica.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
