# Nuvio Lusofonia

MVP privado de addon Stremio, com duas instalações independentes: Português e English. Implementado conforme [AGENT.md](AGENT.md). Funciona sem chaves: exibe seis títulos fictícios para demonstrar as categorias e **Big Buck Bunny**, filme aberto com duas fontes HTTPS reproduzíveis. Não inclui catálogo comercial de obras reais.

## Iniciar

Requer Node.js 22.13+ e npm. `.nvmrc` e `.node-version` fixam a versão validada 22.23.2. Node 18 não aceita `--env-file-if-exists` e não oferece o SQLite nativo usado pelo projeto.

```sh
nvm install
nvm use
npm ci --include=dev
HOST=0.0.0.0 PORT=3000 npm run dev
```

Execute os comandos acima na pasta do projeto, usando nvm já instalado. `nvm use` precisa ser executado no terminal em que o servidor será iniciado. Após selecionar Node 22 e instalar as dependências, `npm run dev` é o único comando necessário. `.env` é opcional e carregado automaticamente; a mensagem `.env not found. Continuing without it.` é apenas informativa. Para criar uma configuração local pela primeira vez, sem sobrescrever um `.env` existente:

```sh
test -e .env || cp .env.example .env
```

Manifestos locais:

- Português: http://localhost:3000/pt/manifest.json
- English: http://localhost:3000/en/manifest.json
- Configuração/instruções: http://localhost:3000/pt/configure
- Saúde: http://localhost:3000/healthz

```sh
npm test
npm run build
npm start
```

O SQLite nativo do Node 22 pode emitir aviso de recurso experimental. O banco é criado automaticamente em `data/nuvio.sqlite`. `npm start` utiliza o build previamente gerado.

### Docker no Mac

Dentro do contêiner, `http://host.docker.internal:PORTA` acessa um serviço que roda no Mac. Para abrir no Mac este addon rodando no contêiner, configure `HOST=0.0.0.0` e publique a porta do contêiner. Se a porta 7000 do Mac responder como `AirTunes` (AirPlay), use o mapeamento `-p 7001:7000` ao criar o contêiner, configure `BASE_URL=http://localhost:7001` e reinicie o addon. No Mac, os manifestos serão `http://localhost:7001/pt/manifest.json` e `http://localhost:7001/en/manifest.json`. Esse acesso depende do mapeamento de porta no Docker.

Na revalidação em Docker, o addon iniciado com `HOST=0.0.0.0` respondeu HTTP 200 no healthcheck, nos dois manifestos, no catálogo de filmes e na configuração, sem expor a chave nessas respostas. A consulta autenticada `mylist` do TorBox retornou HTTP 200 e `success=true`. Isso confirma autenticação; reprodução ainda depende de configurar `CATALOG_FILE` e `SOURCES_FILE` com dados reais. O acesso pela porta 7000 do Mac retornou HTTP 403 de `AirTunes`; a publicação de uma porta alternativa no Mac permanece pendente.

## Instalar no cliente

Copie cada URL de manifesto para o campo de adicionar addon por URL do seu cliente. Instale ambas se desejar: seus IDs são distintos. A página `/configure` também oferece um link `stremio://` para o Stremio. A localização do campo no Nuvio depende da versão/plataforma; não foi testada uma interface gráfica do Nuvio neste ambiente. O [repositório oficial NuvioTV](https://github.com/NuvioMedia/NuvioTV) identifica o suporte ao ecossistema Stremio.

Em uma TV ou celular, `localhost` aponta para o próprio dispositivo. Para uso na rede privada, configure `HOST=0.0.0.0` e `BASE_URL=http://IP-DO-SERVIDOR:3000`, permita acesso na rede local e use esse endereço nos manifestos. Para clientes que exigem HTTPS, utilize um reverse proxy com certificado válido e atualize `BASE_URL`. Esta versão não implementa autenticação de acesso ao addon; mantenha o serviço restrito à sua rede privada/VPN, especialmente com TorBox ativo.

## Configuração

### Publicar gratuitamente no Render para instalar no Nuvio

O arquivo [render.yaml](render.yaml) prepara um Web Service no plano **Free**, com Node 22, host `0.0.0.0`, porta interna `3000`, build TypeScript e verificação em `/healthz`. Em produção, utiliza `npm start`; localmente, continue com `HOST=0.0.0.0 PORT=3000 npm run dev`.

1. Coloque o projeto em um repositório GitHub, preferencialmente privado. Inclua `render.yaml`, `package-lock.json` e `src/`. Não envie `.env`, `data/`, `node_modules/` ou `dist/`; o `.gitignore` já os exclui ao usar Git.
2. Crie uma conta em [Render](https://dashboard.render.com/), selecione **New → Blueprint**, conecte o repositório e confira que o serviço usa o plano **Free** antes de publicar.
3. Aguarde o deploy. Com `BASE_URL` ausente, a aplicação usa `RENDER_EXTERNAL_URL` automaticamente com o endereço HTTPS atribuído pelo Render. O comando de início é `npm start`.
4. Abra `https://SEU-SERVICO.onrender.com/healthz` e confirme `{"status":"ok"}`. Abra também `/pt/manifest.json` e `/en/manifest.json` e confirme que exibem JSON.
5. No campo de instalar addon por URL do Nuvio, cole `https://SEU-SERVICO.onrender.com/pt/manifest.json`. Para English, use `/en/manifest.json`. Substitua `SEU-SERVICO` pelo domínio real exibido no painel; esses endereços são exemplos, não uma publicação já realizada.

`https://localhost/pt/manifest.json` não aponta para esta hospedagem: `localhost` é o próprio aparelho do cliente e nosso servidor local atende HTTP na porta 3000. Na hospedagem, o Render fornece HTTPS externamente; não acrescente `:3000` à URL pública.

Segundo a [documentação do plano gratuito](https://render.com/docs/free), o serviço suspende após 15 minutos sem tráfego e pode levar cerca de um minuto para acordar. Se a instalação falhar por demora, abra o manifesto no navegador, aguarde o JSON e tente novamente no Nuvio. O plano tem cotas de uso e não oferece disco persistente: o SQLite local é recriado após reinício, suspensão ou deploy. Neste projeto, ele guarda cache e aliases reconstruídos do catálogo. Arquivos enviados manualmente ao servidor também não persistem.

Este Blueprint publica a demonstração sem TorBox e sem fontes privadas. O addon ainda não tem autenticação: proteger o acesso é necessário antes de ativar sua conta TorBox numa URL pública. Instalar o manifesto não adiciona filmes reais nem fontes de reprodução ao catálogo fictício atual.

Preparação validada localmente com build e consultas aos manifestos; a publicação efetiva depende de conectar o repositório à conta Render. Referências: [Blueprints](https://render.com/docs/blueprint-spec), [variáveis automáticas](https://render.com/docs/environment-variables) e [HTTPS de Web Services](https://render.com/docs/web-services).

### Variáveis de ambiente

| Variável | Comportamento |
| --- | --- |
| `PORT`, `HOST` | Padrão `3000`, `0.0.0.0` |
| `BASE_URL` | URL acessível pelo cliente; barra final removida. Se ausente ou vazia: domínio Railway, URL Render ou `http://localhost:PORT`, nessa ordem. Um valor não vazio inválido é rejeitado. |
| `DATABASE_URL` | Caminho SQLite com prefixo `file:` |
| `METADATA_PROVIDER` | `local` ou vazio; outros valores são rejeitados |
| `METADATA_API_KEY` | Reservada; nenhuma API externa de metadados implementada |
| `CATALOG_FILE` | JSON local; vazio utiliza fixtures fictícias |
| `SOURCES_FILE` | JSON local de fontes autorizadas; vazio não oferece reprodução |
| `SOURCES_JSON` | Lista JSON de fontes diretamente no ambiente da hospedagem; alternativa a SOURCES_FILE. Use apenas um dos dois. Pode conter URLs privadas: não publique esse valor. |
| `TORBOX_ENABLED` | `false` por padrão; `true` exige chave |
| `TORBOX_API_KEY` | Chave individual, somente no ambiente do servidor |
| `TORBOX_ONLY_CACHED` | Apenas `true` é aceito neste MVP |
| `LOG_LEVEL` | `info` por padrão; também aceita `silent`, `fatal`, `error`, `warn`, `debug`, `trace` |

Use [examples/catalog.json](examples/catalog.json) e [examples/sources.json](examples/sources.json) como modelos. O domínio `example.org`, os hashes e os IDs são placeholders, não são fontes reproduzíveis. Copie os modelos para arquivos privados dentro de `data/` e configure seus caminhos no `.env`. Reinicie após editar os arquivos.

IDs aceitos: IMDb (`tt1234567`), TMDB (`tmdb:123`) ou namespace próprio (`nuvio:own:film`). Use `externalIds` somente para mapeamentos confiáveis. Categorias: `movies`, `series`, `dramas`, `anime`, `documentaries`, `kids`. As linhas de filmes/documentários usam `type=movie`; séries/doramas/animes/infantil usam `type=series` nesta versão. Para séries, inclua `videos` com `id`, `title`, `season`, `episode` e opcionalmente `released` em ISO UTC. Temporada zero representa especiais. O `videoId` da fonte deve corresponder ao ID canônico do filme ou ao ID exato do episódio.

Os campos `audio` e `subtitles` são listas distintas: utilize `pt-BR`, `pt-PT`, `pt` e `en`. Preencha `verified=true` apenas quando os idiomas tiverem sido conferidos. O nome do arquivo nunca determina o idioma. Campos opcionais: `resolution` (ex. 1080), `codec` (`H.264`, `HEVC`, `AV1`), `quality` (`WEB-DL`, `WebRip`, `BluRay`, `Original`) e `size` em bytes. Rótulos técnicos não comprovam autorização. `authorization` registra a origem/autorização informada pelo operador; o software não valida direitos de terceiros automaticamente.

## TorBox

O adapter implementa somente consultas GET à API oficial: `checkcached`, `mylist` e `requestdl`. Os endpoints e formatos foram conferidos na [documentação oficial TorBox](https://www.postman.com/torbox/torbox-api/documentation/b6l9hbv/main-api) e no [SDK oficial](https://github.com/TorBox-App/torbox-sdk-js/blob/main/documentation/services/TorrentsService.md) em 5 de setembro de 2026.

Use [examples/sources-torbox.json](examples/sources-torbox.json) para mapear um arquivo autorizado **já presente em sua conta**, com seu hash, `torrentId` e `fileId`. O adapter confirma cache, hash, conclusão, presença e ID do arquivo antes de resolver. Arquivos infectados ou compactados são omitidos. Não há criação de torrent, envio de magnet ou início de download. Fontes não cacheadas são omitidas; se a mesma fonte também tiver uma `url` direta autorizada, ela serve como fallback. O campo de cache tem prioridade sobre idioma e resolução. A resolução retorna uma URL CDN, nunca o endpoint com a chave.

Teste manual com sua conta (pendente):

1. Configure `TORBOX_ENABLED=true`, sua chave no `.env` e os arquivos locais reais; não compartilhe esses arquivos.
2. Mapeie um arquivo próprio já concluído na conta. Abra `/pt/stream/movie/ID-CANONICO.json` (ou a rota de episódio).
3. Confirme o rótulo `TorBox Cache` e a reprodução no cliente. Não copie URLs assinadas para logs públicos.
4. Teste um hash não cacheado: ele deve ser omitido, sem novo item/download na conta.
5. Teste indisponibilidade/chave inválida: o catálogo deve funcionar e uma URL direta autorizada, quando configurada, deve continuar disponível.
6. Confirme que manifestos, configuração, healthcheck e logs não contêm a chave.

## Arquitetura e comportamento

- Interfaces `MetadataProvider`, `AuthorizedSourceProvider`, `CacheResolver` isolam os handlers de integrações externas.
- SDK Stremio fixado em `1.6.10`, Fastify HTTP, Zod para entradas locais e respostas externas, Pino para logs.
- Busca normaliza acentos, pontuação e hífens; romanizações devem constar em `aliases`. Não há transliteração automática.
- Deduplicação usa IDs e mapeamentos explícitos; homônimos são preservados. Episódios são deduplicados por temporada/episódio. A tabela de aliases rejeita mapeamentos ambíguos.
- Paginação `skip`, 50 títulos por página; busca de até 200 caracteres. Ordem determinística por ID. Alterar o idioma não elimina metadados.
- Cache SQLite de resultados de metadados: 24 horas. Fontes: 30 segundos em memória, limitado a 500 entradas. Status TorBox: 10 segundos em memória, limitado a 1.000 entradas. URLs finais TorBox não são armazenadas: TTL zero.
- Até quatro candidatos distintos são resolvidos em paralelo por solicitação; cadastre primeiro as fontes relevantes. Cada resolução TorBox tem orçamento de seis segundos; cada GET tem timeout máximo de 2,5 segundos e até duas repetições. Não há retry de 401. `Retry-After` longo suspende chamadas; três falhas esgotadas abrem o circuit breaker por 30 segundos.
- Streams duplicados por URL são removidos após ranking. Quando nenhuma fonte autorizada está disponível, um item `externalUrl` explica a ausência e abre a página de configuração. Não é um vídeo artificial.
- Endpoint de legendas retorna `subtitles: []`. Os labels de legendas descrevem trilhas confirmadas da fonte; ainda não existe provedor de arquivos de legendas.

## Privacidade e limites

Single-user: a chave global atende somente a conta privada do operador. Não disponibilize esta instalação como serviço público compartilhado. Multiusuário exige credenciais e isolamento por usuário, autenticação e revisão dos termos do provedor.

`.env`, `data/`, banco e links privados são ignorados pelo Git. Logs não registram requisições, URLs, corpos de respostas ou erros externos; campos sensíveis conhecidos também são redigidos. Erros HTTP e de inicialização são genéricos. As respostas do addon têm `Cache-Control: no-store`, e um filtro impede emissão literal das chaves configuradas. Links de reprodução autorizados precisam chegar ao cliente e podem funcionar como credenciais temporárias: trate-os como privados. Nenhuma chave é enviada ao frontend. Não há telemetria própria; TorBox recebe solicitações do servidor quando ativado, e hosts de vídeos recebem acessos do player.

Integre somente catálogos próprios, de domínio público, licenciados ou oficiais e APIs usadas conforme seus termos. Não há scraping, bypass de DRM, indexação de pirataria, proxy de vídeo ou transcodificação. A cobertura atual é de demonstração e catálogo JSON local; um catálogo amplo de obras reais depende de um provider autorizado futuro.

## Validação e progresso

1. Aplicação mínima e manifestos: implementados; testes de HTTP/CORS/healthcheck.
2. Tipos, fixtures e catálogo/meta: implementados; seis categorias, episódios e especial.
3. Busca, aliases e deduplicação: implementados; testes de acentos, romanização, IDs e temporadas.
4. Idiomas, ranking e fontes: implementados; testes de áudio/legenda/cache/fallback.
5. TorBox: adapter isolado implementado e coberto com respostas mockadas; teste com conta real pendente.
6. SQLite, TTL, timeout, retry, rate limit, circuit breaker e tratamento de segredos: implementados e testados.
7. Contrato cliente: ambos os manifestos são detectados/validados e consultados por `stremio-addon-client` real contra o servidor HTTP local, sem APIs externas.
8. `npm install`, `npm run build` e `npm test` concluídos: 23 testes passaram. `npm audit` retornou zero vulnerabilidades. O servidor iniciado com `npm run dev` respondeu HTTP 200 no healthcheck, nos dois manifestos, no catálogo e nos metadados de anime; as requisições locais medidas levaram de 2 a 27 ms. Instalação visual no Nuvio e reprodução real permanecem pendentes; o MVP não é declarado integralmente homologado.

A meta de catálogo cacheado abaixo de 500 ms deve ser medida também no ambiente de destino. O catálogo local pode ser ampliado; o carregamento em memória não é destinado a milhões de títulos. Não há provider TMDB/Anilist, tradução automática, busca global separada, catálogo infantil de filmes, download de legendas ou painel administrativo. SQLite usa uma migração inicial idempotente (`user_version=1`); migrações adicionais serão necessárias com a evolução do schema.

Protocolo consultado: [Stremio SDK](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md), [manifest](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md), [streams](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md). As dependências transitivas `path-to-regexp`, `qs` e `tmp` têm overrides de correção; o servidor usa Fastify, não o router legado do SDK.

## Troubleshooting

### Nuvio instala o addon, mas nenhum stream é retornado

O catálogo padrão contém títulos fictícios e um filme aberto reproduzível, **Big Buck Bunny** (`tt1254207`). `SOURCES_FILE`/`SOURCES_JSON` vazios não fornecem fontes para outros títulos. Ativar TorBox não preenche essa lista: o resolver precisa de uma fonte com `videoId`, hash, `torrentId` e `fileId` do arquivo já presente na conta. A instalação do manifesto verifica o protocolo, não a disponibilidade de todos os filmes.

Foi corrigido um bloqueio que exigia que o título também existisse no catálogo local. Agora uma fonte cadastrada com IMDb completo (ex.: `tt1254207`) pode ser encontrada quando o Nuvio abre o filme por outro catálogo. Episódios usam o ID exato `tt1234567:temporada:episodio`; temporada zero é aceita. IDs truncados como `tt04`, tipos incorretos e episódios diferentes não recebem um vídeo substituto.

Depois de publicar a versão 0.1.1, abra **Big Buck Bunny** no catálogo de filmes do Lusofonia. Ele já fica disponível sem configuração adicional, com o filme completo e o trailer. A rota `/pt/stream/movie/tt1254207.json` deve retornar duas URLs MP4. O filme é da Blender Foundation, sob [CC BY 3.0](https://peach.blender.org/about/), e as cópias são disponibilizadas pelo [W3C para demonstração de vídeo](https://www.w3.org/2010/05/video/mediaevents.html).

Os arquivos de exemplo permitem executar um catálogo dedicado ao teste:

```env
CATALOG_FILE=examples/catalog-playback-test.json
SOURCES_FILE=examples/sources-playback-test.json
SOURCES_JSON=
TORBOX_ENABLED=false
```

Não há atribuição desse vídeo a outros IDs ou títulos.

Para suas próprias fontes no Railway, preencha `SOURCES_JSON` com o conteúdo de um arquivo no formato dos exemplos, deixando `SOURCES_FILE` vazio. Isso dispensa enviar um arquivo privado ao contêiner. Cada fonte deve conter o `videoId` completo do filme/episódio e uma URL reproduzível ou os dados TorBox. O addon ainda não implementa busca automática em indexadores. Uma URL pública com fontes privadas/TorBox precisa de controle de acesso antes de uso com credenciais pessoais.

Validação: 44 testes passaram e o build concluiu, incluindo filmes e episódios IMDb fora do catálogo local, arquivo de episódio exato, IDs inválidos, fonte ausente e resolução TorBox com API simulada (somente GET). Um cliente Stremio real detectou os dois manifestos, abriu o catálogo e recebeu as duas fontes. Ambos os MP4 públicos responderam HTTP 206 a solicitações parciais, com tipo `video/mp4` e assinatura MP4 válida. A reprodução visual no aparelho Nuvio ainda precisa ser confirmada após o deploy.

### Falha ao iniciar na hospedagem

Os avisos `ExperimentalWarning: SQLite` e `npm warn config production` não são, por si só, a causa da falha. A inicialização agora identifica a etapa e informa nomes de variáveis ou códigos conhecidos do sistema, sem imprimir chaves, caminhos privados ou conteúdo de arquivos. Gere novamente `dist/` com `npm run build` e faça um novo deploy para receber esse diagnóstico.

- **Configuração / BASE_URL:** use a URL pública completa, como `https://SEU-DOMINIO`, sem `/pt/manifest.json` e sem `:3000`. Campos vazios agora utilizam os padrões. No Railway/Render, remova ou esvazie BASE_URL e publique o código atualizado para detectar o domínio da plataforma; o domínio público precisa estar criado. No Mac, use BASE_URL=http://localhost:3000. A validação de URLs inválidas foi corrigida para informar o campo em vez de lançar uma exceção nativa.
- **Configuração / TORBOX_API_KEY:** com `TORBOX_ENABLED=true`, a chave deve estar presente no ambiente da hospedagem. Para testar a demonstração, use `TORBOX_ENABLED=false` e `TORBOX_ONLY_CACHED=true`.
- **CATALOG_FILE ou SOURCES_FILE / ENOENT:** o arquivo existe apenas no computador local. Envie-o por um mecanismo privado da hospedagem ou remova essas variáveis para testar a demonstração sem fontes.
- **DATABASE_URL:** use um caminho SQLite como `file:./data/nuvio.sqlite`, com diretório gravável. URLs de PostgreSQL não são aceitas por este projeto. Em hospedagem com disco efêmero, o cache é recriado; persistência exige um volume.
- **Escuta HTTP / EADDRINUSE:** há outro processo na mesma porta. Mantenha uma instância por contêiner. Para acesso externo, configure `HOST=0.0.0.0` e a porta esperada pelo proxy.

Se estiver no Railway, use build `npm ci --include=dev && npm run build` e start `npm start`, com `HOST=0.0.0.0` e `PORT=3000`; direcione o domínio para a porta 3000. Defina `BASE_URL` com o endereço HTTPS real exibido no painel, ou remova essa variável para usar a detecção automática após gerar o domínio. `RAILWAY_PUBLIC_DOMAIN` contém somente o domínio, sem o prefixo `https://`; a aplicação agora acrescenta `https://` automaticamente quando usa esse domínio. Remova comandos personalizados antigos que forçam BASE_URL e use apenas `npm start`. Referências: [variáveis Railway](https://docs.railway.com/variables/reference) e [configuração de build e start](https://docs.railway.com/overview/advanced-concepts).

Validação desta correção: 33 testes passaram, incluindo inicialização em processos separados com URL inválida, chave ausente, arquivos ausentes/inválidos, banco inacessível, porta ocupada e proteção de segredos. Build TypeScript concluído. A causa no servidor remoto depende da nova mensagem de diagnóstico ou da revisão das variáveis nessa hospedagem.

- **Não conecta na TV:** use o IP do servidor e configure `HOST`/`BASE_URL`; verifique rede e exigência de HTTPS do cliente.
- **Catálogo aparece, mas não reproduz:** os dados padrão são fictícios. Configure uma fonte autorizada e o `videoId` correto.
- **TorBox não aparece:** confira hash/IDs da conta, cache confirmado, arquivo concluído e chave. Não são criados itens novos.
- **Falha na inicialização:** revise os JSON, variáveis, permissão no diretório do banco e porta. `TORBOX_ONLY_CACHED=false` é rejeitado.
- **Idioma incorreto ou desconhecido:** preencha tags padronizadas e `verified` após conferir trilhas; nenhum nome de arquivo é interpretado.
- **Conflito de ID cruzado após trocar de catálogo:** revise os mapeamentos; para reiniciar o índice local de demonstração, pare o servidor e remova o banco em `data/` (isso elimina apenas cache e aliases locais).

Correção de ambiente local/nuvem: `.nvmrc` e `.node-version` adicionados para Node 22.23.2; padrão local alterado para `0.0.0.0:3000`; domínio público detectado por variáveis oficiais Railway/Render quando BASE_URL está ausente; mensagens de erro de URL separadas das orientações TorBox. Valores não vazios inválidos continuam sendo rejeitados.

Validação: 37 testes passaram e o build TypeScript concluiu. O build gerado respondeu ao healthcheck, aos dois manifestos e às páginas de configuração com as URLs corretas em simulações local, Railway e Render. A seleção do Node no Mac e a atualização do deploy precisam ocorrer nesses ambientes.

Correção de campos vazios no painel: foi reproduzida a mensagem com HOST, BASE_URL, DATABASE_URL, TORBOX_ENABLED e TORBOX_ONLY_CACHED definidos como strings vazias. A configuração agora remove espaços externos e um par de aspas externas dos campos de configuração; valores vazios usam os padrões. Isso inclui strings como `""` e `''`. Credenciais TORBOX_API_KEY e METADATA_API_KEY não são alteradas. TORBOX_ENABLED vazio significa false; TORBOX_ONLY_CACHED vazio significa true. Valores não vazios inválidos continuam falhando, inclusive TORBOX_ONLY_CACHED=false e TorBox ativo sem chave.

Validação atual: 40 testes passaram e o build concluiu. Um processo do build foi iniciado em diretório temporário sem .env, com os cinco campos vazios e domínio Railway simulado: healthcheck e manifestos responderam HTTP 200, e os links de configuração usaram HTTPS. Essa correção precisa ser enviada ao repositório conectado e compilada no novo deploy; reiniciar uma versão antiga não aplica a mudança. Build: `npm ci --include=dev && npm run build`; start: `npm start`.
