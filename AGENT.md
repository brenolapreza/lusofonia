# Projeto: Nuvio Lusofonia — MVP

## Missão

Construir um addon compatível com o protocolo do Stremio e utilizável no Nuvio, com catálogo amplo de filmes, séries, doramas, animes, documentários, desenhos e conteúdo infantil. O produto terá duas instalações independentes, geradas pelo mesmo backend:

- `Português`: prioriza áudio PT-BR/PT-PT e legendas em português.
- `English`: prioriza áudio e legendas em inglês.

O addon deve oferecer uma experiência rápida e organizada, usando o TorBox como camada opcional de resolução/cache para a conta autorizada do usuário. O MVP deve ser pequeno, seguro, testável e preparado para crescer.

## Limites obrigatórios

Este projeto é um agregador de catálogo e de fontes autorizadas. Integrar somente:

- APIs de metadados usadas de acordo com seus termos;
- catálogos de domínio público, licenciados ou oficiais;
- fontes próprias do usuário;
- addons/provedores de terceiros quando houver autorização para integrá-los.

Não implementar scraping de sites piratas, bypass de paywall/DRM, coleta de links sem permissão, distribuição de obras protegidas ou uso de uma API key TorBox compartilhada entre usuários sem autorização. WebRip pode ser guardado apenas como rótulo técnico de uma fonte autorizada; não é uma autorização de distribuição.

## Contexto técnico

O Nuvio aceita boa parte dos addons no formato do Stremio. Um addon HTTP precisa expor um `manifest.json` e responder aos recursos de catálogo, metadados, streams e legendas conforme o protocolo oficial.

O addon será inicialmente privado/single-user. Para uma futura versão pública, migrar a configuração do TorBox para credenciais individuais por usuário e revisar os termos de uso, privacidade, rate limits e requisitos de autorização do TorBox.

## Resultado esperado do MVP

Ao final, deve existir um serviço que:

1. pode ser iniciado localmente com um único comando;
2. expõe dois manifestos instaláveis no Nuvio:
   - `/pt/manifest.json`
   - `/en/manifest.json`
3. apresenta catálogos de filmes, séries, doramas, animes, documentários e infantil;
4. permite pesquisar títulos e abrir temporadas/episódios;
5. normaliza IDs e remove duplicados;
6. classifica streams por idioma, áudio, legenda, resolução, codec, qualidade e disponibilidade no cache;
7. consulta o TorBox somente no servidor, nunca no cliente;
8. prioriza itens já em cache no TorBox;
9. não inicia downloads não cacheados automaticamente no MVP;
10. devolve uma mensagem clara quando não houver uma fonte autorizada disponível;
11. possui testes automatizados e documentação de configuração.

## Stack recomendada

Usar TypeScript e Node.js LTS, com:

- SDK oficial/compatível do protocolo de addons do Stremio, fixando a versão no `package.json`;
- servidor HTTP simples e tipado;
- SQLite para o MVP, com camada de repositório que permita migrar para PostgreSQL;
- `zod` ou equivalente para validar configurações e respostas externas;
- `pino` ou equivalente para logs estruturados;
- Vitest/Jest para testes;
- `fetch` com timeout, retry limitado e circuit breaker simples para APIs externas.

Não adicionar dependências grandes sem necessidade. Se o repositório já tiver uma stack, preservar a escolha existente.

## Arquitetura

Separar o código em módulos com interfaces estáveis:

```text
src/
  addon/             manifestos e handlers do protocolo
  catalog/           catálogos e busca
  metadata/          provedores de metadados
  identity/          IDs canônicos e deduplicação
  language/          áudio, legendas e ranking linguístico
  sources/            fontes autorizadas
  torbox/            cliente TorBox e resolução de cache
  storage/           SQLite, cache e migrações
  config/             ambiente e configuração do usuário
  observability/      logs, métricas e healthcheck
  test/               fixtures e testes de contrato
```

### Interfaces mínimas

Criar interfaces, sem acoplar os handlers a um provedor específico:

```ts
interface MetadataProvider {
  search(query: string, options?: SearchOptions): Promise<CanonicalTitle[]>;
  getTitle(id: CanonicalId): Promise<CanonicalTitle | null>;
  getVideos(id: CanonicalId): Promise<Video[] | null>;
}

interface AuthorizedSourceProvider {
  findStreams(video: Video, context: StreamContext): Promise<StreamCandidate[]>;
}

interface CacheResolver {
  resolve(candidate: StreamCandidate, context: UserContext): Promise<ResolvedStream | null>;
}
```

O addon deve funcionar com providers mockados em testes. Nenhum handler deve chamar diretamente uma API externa sem passar por um adapter.

## Catálogo

Implementar primeiro uma fonte principal de metadados e adapters opcionais, sempre respeitando as licenças e políticas de cada serviço. A estrutura deve permitir cobrir:

- filmes e séries gerais;
- doramas por país, idioma, gênero e aliases;
- animes, incluindo temporadas, especiais, OVAs e episódios;
- documentários, desenhos e conteúdo infantil.

O catálogo não deve prometer que possui literalmente toda obra existente. Exibir somente títulos retornados por provedores configurados ou por um catálogo local autorizado.

### IDs e deduplicação

- Preferir IMDb/TMDB quando houver mapeamento confiável.
- Usar namespace próprio quando não houver ID externo confiável, por exemplo `nuvio:anilist:12345`.
- Manter uma tabela de aliases e IDs cruzados.
- Não unir dois títulos apenas por nome; considerar ano, tipo, país e temporada.
- Para anime e dorama, tratar títulos alternativos em português, inglês, romanização e idioma original.

### Catálogos visíveis

Cada manifesto pode expor linhas enxutas, por exemplo:

- Em destaque;
- Filmes;
- Séries;
- Doramas;
- Animes;
- Documentários;
- Infantil;
- Adicionados recentemente;
- Pesquisa.

Evitar dezenas de catálogos no primeiro release. O filtro de idioma deve afetar ranking e disponibilidade, não excluir automaticamente um título que tenha metadados válidos mas ainda não tenha fonte encontrada.

## Dois manifestos

Usar o mesmo código e backend, mas gerar configurações distintas:

```text
/pt/manifest.json  → Nuvio Lusofonia — Português
/en/manifest.json  → Nuvio Lusofonia — English
```

Cada variante deve ter um `id` diferente no manifesto. Os handlers recebem o locale da variante e aplicam o mesmo algoritmo de ranking com pesos diferentes.

Exemplo de ranking Português:

1. áudio PT-BR;
2. áudio PT-PT;
3. legenda PT-BR;
4. legenda PT-PT;
5. áudio original com legenda portuguesa;
6. versão sem idioma confirmado.

Exemplo de ranking English:

1. áudio inglês;
2. legenda inglês;
3. áudio original com legenda inglês;
4. versão sem idioma confirmado.

Todo resultado deve declarar o que foi realmente verificado. Nunca rotular uma fonte como dublada ou legendada apenas por inferência do nome do arquivo.

## Integração com TorBox

### Objetivo

Usar o TorBox para melhorar a reprodução da fonte que o usuário está autorizado a acessar, priorizando disponibilidade em cache e reduzindo espera, buffering e chamadas repetidas.

### Regras de segurança

- Nunca colocar `TORBOX_API_KEY` em código, frontend, logs ou resposta do addon.
- Usar `.env` local e fornecer apenas `.env.example` no repositório.
- Em uso privado, aceitar uma key no ambiente ou na página de configuração do addon.
- Em uso multiusuário, exigir configuração por usuário; não usar a key do operador para todos.
- Redigir tokens e URLs sensíveis nos logs.
- Não persistir links de reprodução além do TTL necessário.
- Confirmar os endpoints e formatos na documentação atual do TorBox no momento da implementação; não inventar endpoints com base em exemplos antigos.

### Fluxo de resolução

Quando o Nuvio pedir streams:

1. identificar o título, temporada e episódio;
2. buscar candidatos somente de providers autorizados;
3. extrair idioma, áudio, legenda, resolução, codec, tamanho e identificador da fonte;
4. consultar o estado de cache do TorBox quando o candidato for elegível;
5. ordenar primeiro os candidatos cacheados;
6. resolver o link de reprodução através da API oficial do TorBox;
7. devolver ao Nuvio um stream com nome e metadados claros;
8. se o item não estiver cacheado, não iniciar download automático no MVP; devolver fallback autorizado ou omitir o candidato;
9. armazenar somente metadados de curta duração para evitar consultas repetidas.

Usar cache local com TTL separado para:

- metadados: longo;
- busca de fontes: curto;
- status de cache: muito curto;
- URL final de reprodução: o menor TTL permitido pelo provedor.

Respeitar rate limits, usar backoff exponencial e interromper chamadas quando o TorBox estiver indisponível. O addon não deve ficar indisponível apenas porque o TorBox falhou.

### Labels dos streams

Usar nomes legíveis, por exemplo:

```text
[PT-BR Áudio] 1080p · WEB-DL · TorBox Cache
[PT-PT Legenda] 720p · H.264 · TorBox
[EN Áudio] 1080p · HEVC · Cache
```

Somente incluir `Cache` quando a API tiver confirmado essa condição.

## Endpoints do addon

Implementar e testar pelo menos:

```text
GET /pt/manifest.json
GET /en/manifest.json
GET /{variant}/catalog/{type}/{catalogId}.json
GET /{variant}/catalog/{type}/{catalogId}/{extra}.json
GET /{variant}/meta/{type}/{id}.json
GET /{variant}/stream/{type}/{videoId}.json
GET /{variant}/subtitles/{type}/{id}.json
GET /{variant}/configure
GET /healthz
```

Adicionar CORS adequado para o protocolo do addon, respostas JSON consistentes e tratamento de erros sem vazar stack trace, key ou dados pessoais.

## Configuração mínima

Criar `.env.example` com nomes sem valores reais:

```env
PORT=7000
BASE_URL=http://localhost:7000
DATABASE_URL=file:./data/nuvio.sqlite
TORBOX_API_KEY=
TORBOX_ENABLED=false
TORBOX_ONLY_CACHED=true
METADATA_PROVIDER=
METADATA_API_KEY=
LOG_LEVEL=info
```

Se uma integração exigir mais de uma key, documentar cada uma e validar na inicialização. O servidor deve iniciar em modo catálogo/mock quando nenhuma key estiver configurada.

## Qualidade e experiência

- Busca tolerante a acentos, hífens, romanização e títulos alternativos.
- Paginação em todos os catálogos grandes.
- Deduplicação de posters, títulos e streams.
- Resposta rápida usando cache; meta alvo: catálogo cacheado em menos de 500 ms e busca externa com timeout controlado.
- Ordenação determinística para não fazer os resultados “pularem”.
- Mensagens de erro simples para o usuário e detalhes somente nos logs.
- Nenhuma operação de download ou processamento pesado dentro do handler HTTP.
- Healthcheck deve informar apenas estado operacional, nunca segredos.

## Testes obrigatórios

Criar testes para:

- validação dos dois manifestos;
- contrato de catálogo, meta, stream e subtitles;
- pesquisa com acentos e aliases;
- deduplicação por ID, temporada e episódio;
- ranking PT-BR, PT-PT e English;
- classificação correta de áudio versus legenda;
- prioridade para candidato cacheado;
- comportamento `TORBOX_ONLY_CACHED=true`;
- fallback quando TorBox estiver indisponível;
- timeout, retry e rate limit;
- garantia de que API keys não aparecem nos logs, erros ou JSON;
- instalação do manifesto em um cliente compatível usando fixtures locais.

Não depender de APIs reais nos testes unitários. Criar mocks e fixtures representativos para filme, série, dorama, anime, especial e conteúdo infantil.

## Fora do escopo do MVP

- scraping de sites de streaming;
- indexação de fontes não autorizadas;
- download automático de itens não cacheados;
- transcodificação, proxy de vídeo ou hospedagem de arquivos;
- sincronização de watchlist e progresso;
- painel administrativo completo;
- recomendação por machine learning;
- suporte a múltiplas contas TorBox usando uma key global;
- promessa de cobertura total de todo conteúdo existente.

## Critérios de aceite

Considerar o MVP pronto somente quando:

- `npm install`, `npm run dev`, `npm test` e `npm run build` estiverem documentados e funcionando;
- os dois manifestos forem válidos e instaláveis no Nuvio;
- cada categoria principal retornar dados de fixture sem duplicação;
- a busca encontrar títulos com acentos, aliases e títulos alternativos;
- o mesmo título puder ser aberto como filme, série, dorama ou anime conforme seus metadados;
- streams sejam filtrados e ranqueados corretamente por idioma e cache;
- nenhuma key fique exposta no cliente ou nos logs;
- a integração TorBox tenha testes mockados e um teste manual documentado com uma conta autorizada;
- o README explique configuração, limitações, fontes permitidas, privacidade e troubleshooting.

## Ordem de implementação

1. Inspecionar o repositório e preservar decisões já existentes.
2. Criar a aplicação mínima com `/healthz` e os dois manifestos.
3. Implementar tipos canônicos, fixtures e handlers de catálogo/meta.
4. Implementar pesquisa, aliases e deduplicação.
5. Implementar ranking de idiomas e labels de streams.
6. Implementar a interface `AuthorizedSourceProvider` com provider mockado.
7. Implementar `TorBoxResolver` atrás de uma interface, seguindo a documentação oficial atual.
8. Adicionar cache local, TTL, timeout, retry e logs redigidos.
9. Criar testes de contrato e documentação de instalação no Nuvio.
10. Executar build, testes e uma validação manual dos manifestos antes de considerar concluído.

## Regra para o agente Codex

Trabalhe em incrementos pequenos. Antes de adicionar uma integração externa, crie a interface, o mock e os testes. Não coloque credenciais reais no repositório. Se uma API ou comportamento do Nuvio/TorBox não estiver confirmado, consultar a documentação oficial e deixar um adapter isolado em vez de adivinhar. Ao terminar cada etapa, registrar no README o que foi implementado, como testar e quais limitações permanecem.
