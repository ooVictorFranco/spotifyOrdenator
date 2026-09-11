# Alfabetizador de Playlist

Utilitário pessoal para reordenar as faixas de uma playlist do Spotify em
ordem alfabética pelo nome, ignorando um "The" no início do nome apenas
para fins de comparação — o nome real da faixa não é alterado (ex.: "The
Passenger" é comparado como "Passenger", mas continua se chamando "The
Passenger" na playlist).

Tem duas formas de uso: um comando de linha de comando (`npm run sort`)
e uma interface web local (`npm run web`) para ajustar a ordem
manualmente antes de salvar.

## Tecnologias

- **Node.js 20+** e **TypeScript**, rodados diretamente via
  [`tsx`](https://github.com/privatenumber/tsx) (sem etapa de build).
- **`fetch` nativo** do Node para todas as chamadas HTTP — sem
  axios/got e sem SDK do Spotify.
- **`node:http` nativo** tanto para o servidor local que captura o
  callback do OAuth quanto para o servidor da interface web — sem
  Express ou qualquer outro framework.
- **Authorization Code Flow com PKCE** (`node:crypto` para gerar o
  code verifier/challenge), sem precisar de client secret.
- Frontend em **HTML/CSS/JS puro** (um único arquivo, sem bundler nem
  framework de UI), com drag-and-drop nativo (HTML5 Drag and Drop API).

Nenhuma dependência de runtime além do próprio Node — `typescript` e
`tsx` são as únicas dependências, e só de desenvolvimento.

## Configuração

1. Crie um app em https://developer.spotify.com/dashboard.
2. Em **Redirect URIs**, cadastre exatamente
   `http://127.0.0.1:8888/callback` (o Spotify não aceita mais a
   string `localhost` como redirect URI, precisa ser o IP literal).
3. Copie `.env.example` para `.env` e preencha `SPOTIFY_CLIENT_ID`
   com o Client ID do app criado.
4. Instale as dependências:

   ```
   npm install
   ```

O app precisa estar em **Development Mode** (padrão para apps novos)
e a conta dona do app precisa ter **Spotify Premium** — restrições
atuais da Web API do Spotify para esse modo.

Na primeira execução (CLI ou web), o navegador abre pedindo para você
autorizar o app; depois disso o token fica em cache local
(`.spotify-token.json`, git-ignorado) e é renovado automaticamente,
sem pedir login de novo enquanto o acesso não for revogado.

## Uso — linha de comando

```
npm run sort -- <playlist_id_ou_link>
```

Aceita o ID puro, o link do `open.spotify.com` ou o URI
`spotify:playlist:...`. Busca todas as faixas (paginando), avisa no
console sobre eventuais faixas locais (`spotify:local:...`) sem travar
a execução, ordena e grava a nova ordem de volta na playlist.

## Uso — interface web

```
npm run web
```

Sobe um servidor em `http://127.0.0.1:4310` e abre o navegador
automaticamente. Na interface dá para:

- colar o link/ID de uma playlist e carregar as faixas;
- clicar em **"Ordenar A → Z"** para aplicar a mesma ordenação
  alfabética do CLI;
- arrastar as faixas (ou usar as setas ▲▼, acessível por teclado)
  para ajustar a ordem manualmente;
- **"Salvar no Spotify"**, que só fica habilitado quando há alterações
  pendentes.

Faixas locais aparecem com o selo "arquivo local" e um aviso — o
Spotify não garante reordenação correta para elas.

## Notas técnicas

- **API do Spotify (migração de fev/2026):** os endpoints de faixas de
  playlist mudaram de `/playlists/{id}/tracks` para
  `/playlists/{id}/items` para apps em Development Mode, e o campo do
  item na resposta passou de `track` para `item`. O código já usa os
  endpoints novos (`src/spotifyClient.ts`), com fallback para `track`
  caso a API ainda devolva esse alias durante a transição.
- **Limite de 100 URIs por chamada:** o `PUT /items` em modo "replace"
  substitui a playlist inteira pelo array enviado. Para playlists com
  mais de 100 faixas, o primeiro lote vai via `PUT` e os lotes
  seguintes são anexados ao fim via `POST`, preservando a ordem
  calculada.
- **Sem banco de dados nem multiusuário:** o único estado persistido é
  o cache de token de uma conta por vez, em um arquivo JSON local.

## Estrutura

```
src/
  config.ts          variáveis de ambiente (SPOTIFY_CLIENT_ID, redirect URI, escopos)
  pkce.ts            geração de code verifier/challenge/state (PKCE)
  auth.ts            Authorization Code Flow + cache/refresh de token
  spotifyClient.ts   paginação, leitura e escrita das faixas da playlist
  sort.ts            lógica de ordenação alfabética (ignora "The" no início)
  index.ts           entrypoint do CLI (`npm run sort`)
  server.ts          servidor local da interface web (`npm run web`)
  public/index.html  interface web (HTML + CSS + JS, um único arquivo)
```
