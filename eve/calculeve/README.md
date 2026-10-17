# Calculeve

Programa de indústria do EVE Online, substituto da planilha `pi_cadeia_isk.xlsx`. Roda inteiro no
navegador: faz login na CCP, puxa os dados da ESI e calcula no próprio site, sem servidor e sem
client secret. Convenções gerais do site (CSS, JS, ícones, CSP) no [README da raiz](../../README.md).
Plano de port e decisões pendentes: [README-FUTURO.md](README-FUTURO.md).

## Arquivos

```
index.html      marcação da página (ícones, janelas); nenhum script ou estilo inline
calculeve.css   tema laranja, cores exclusivas em variáveis no :root (--verde, --rota-re, --rota-rj, --emjob) e componentes exclusivos
calculeve.js    utilidades comuns (CV) + papel de parede, janela Personagens, Apagar dados, Exportar e Importar dados
sso.js          login EVE SSO (OAuth2 + PKCE)
estoque.js      janela Estoque (assets + blueprints)
mercado.js      preços de mercado e taxas (Mercado), comum a toda a Calculeve
nerds.js        janela Números para Nerds (Nerds), comum a toda a Calculeve
fuel.js         janela Fuel Blocks (atalho do Produzir para fuel blocks)
t2.js           janela Invenção T2 (invenção, decryptors, cadeia, insumos crus, resultado); expõe o motor em `T2`
brave.js        importa o CSV do Ship Overview da Brave (Brave)
produzir.js     janela Produzir (blueprints do estoque sem invenção); reusa o motor do t2.js
estruturas.js   janela Cadastrar Estruturas
frete.js        janela Cadastrar Freighter Service
buyback.js      janela Cadastrar Buyback
appraiser.js    janela Loot Appraiser (rota de venda de cada item colado)
sde/*.csv       cópia dos dumps do SDE
Mudanças.md     log de mudanças, mostrado pela janela Log
```

Ordem de carregamento: `desktop.js` → `calculeve.js` → `sso.js` → `estoque.js` → `mercado.js` → `nerds.js` → `fuel.js` →
`t2.js` → `brave.js` → `produzir.js` → `estruturas.js` → `frete.js` → `buyback.js` → `appraiser.js`. O
`calculeve.js` vem primeiro porque define o `CV`, usado pelos outros; a montagem da página espera o
`DOMContentLoaded`, quando `SSO` já existe.

**Utilidades comuns (`CV`)** — tudo que mais de um script da Calculeve usa fica aqui, e nunca é
reescrito localmente:

| Função | Uso |
|---|---|
| `CV.lsGet(chave, padrão)` / `CV.lsSet(chave, valor)` | localStorage tolerante a falha (aba privada, cota cheia) |
| `CV.el(tag, classe, texto)` | cria elemento; `button` já sai com `type="button"` |
| `CV.retrato(id)` | retrato do char no servidor de imagens da CCP |
| `CV.iconeTipo(typeId, variante)` | ícone de item: `icon`, `bp` (BPO/fórmula) ou `bpc` |
| `CV.sinal(v)` | classe de cor pelo sinal: `" pos"` (verde), `" neg"` (vermelho), `""` no zero |
| `CV.dataHora(data)` | data no formato `dd/mm hh:mm` |
| `CV.csv(texto)` | linhas de campos de um CSV (aspas, vírgula e quebra de linha dentro do campo); a primeira é o cabeçalho |
| `CV.sde(arquivo, colunas)` | linhas de um CSV de `sde/`, só com as colunas pedidas (lido uma vez por arquivo) |
| `CV.tipos()` | `typeID` → `{name, group, vol, pub, lote}`, do `invTypes.csv` (`lote` = `portionSize`, unidades por lote de reprocesso) |
| `CV.esi(path, {token, body})` | chamada à ESI (POST quando há `body`); erro HTTP vira exceção com `.status` |
| `CV.esiPaginado(path, token)` | junta todas as páginas (`X-Pages`) |
| `CV.limite(itens, n, fn)` | roda `fn` em cada item com no máximo `n` requisições simultâneas |
| `CV.cacheado(chave, ids, busca)` | dado estático da ESI com cache no `localStorage` |
| `CV.sistemas(ids)` | id do sistema → `{name, sec}` (cache `calculeve.cache.sistemas`) |
| `CV.brave()` | `{membro, chars}`: se algum char logado está na Brave Collective ou na Brave United (`POST /characters/affiliation/`; ids das alianças por nome em `POST /universe/ids/`, cache `calculeve.cache.brave`) |
| `CV.skills(char)` | Map `skill_id` → `active_skill_level` do char (`/characters/{id}/skills/`), uma consulta por char por carga da página |
| `CV.niveis(char)` | níveis de skill do char escolhido: sem char, tudo 0; fictício, tudo no nível dele; senão, `CV.skills` |
| `CV.fmt` | formatadores pt-BR: `int`, `qtd` (até 2 casas), `n2` (2 casas fixas), `pct` (1 casa) |
| `CV.hms(seg)` | segundos → `h:mm:ss` |
| `CV.status(corpo, msg)` | mensagem de uma linha no lugar do conteúdo de uma janela |
| `CV.copiavel(texto, valor, classe)` | botão com `texto` que copia `valor` (ou o texto) para a área de transferência e pisca `.copiado`; `classe` troca o visual (padrão `.copia`, sublinhado tracejado; os clipboards da lista de compra usam `btn …`) |
| `CV.ATIV` | `activityID` do SDE: `FAB` (1), `INV` (8), `REAC` (11) |
| `CV.industria()` | índice do SDE de indústria, lido uma vez: `produto`, `porProd`, `mat`, `tempo`, `prob`, `skills` e `k(act, bp)` |
| `CV.bonusSkill()` | bônus de tempo por nível de Industry, Advanced Industry (`act` 1) e Reactions (`act` 11), do dogma |
| `CV.tudao()` | estoque salvo do Tudão (`null` se não foi baixado) |
| `CV.estoquePorTipo(snap)` | por tipo: `{ qt, locais }`, somando todos os chars |
| `CV.qtdProduzida(I, job)` | unidades que o job entrega: `runs × unidades por run` do SDE, só fabricação e reação (ESI `activity_id` 1, 9 ou 11) com status `active`, `paused` ou `ready` e produto que casa com o da blueprint no SDE; senão 0 |
| `CV.jobAberto(job)` | job ainda não entregue: status `active`, `paused`, `ready` ou sem status (Estoque e `CV.qtdProduzida`) |
| `CV.emJobPorTipo(snap)` | por tipo: `{ qt, fim }` do que está em job (`job.qtdProd`), somando todos os chars; `fim` é o término do último job do tipo |
| `CV.blueprints(snap, T, aceita)` | blueprints do estoque que `aceita(typeID, copia)`, uma linha por (tipo, ME, TE, runs, BPO/BPC), ordenadas |
| `CV.cartao(...)` / `CV.cartaoBp(b, nome, curto)` | cartão clicável das janelas de lista (ícone, nome curto, linha de dados) |
| `CV.listaBps({ grid, nota, aceita, vazio, extraNota, aoAbrir, secoes, secao, prepara, simula, simCopia })` | janela de lista de blueprints do Tudão: aviso, cartões e o clique; usada por Invenção T2 e Produzir. Com `simula`, a busca mostra a seção das blueprints do SDE que o estoque não tem, como BPO simulada (Produzir) ou, com `simCopia`, BPC simulada (Invenção T2). Com `secoes` (títulos, em ordem) e `secao(b, T)`, separa em seções com título; `prepara(lista, T)` é async e roda antes; com `busca` (o `<input>` da janela), some o cartão que não casa e a seção que ficou vazia |
| `CV.busca(input, aoMudar)` / `CV.contem(texto, termo)` | caixa de busca pelo nome: `busca` chama `aoMudar(termo)` a cada tecla e devolve um getter do termo; `contem` compara sem acento nem maiúscula (termo vazio casa tudo) |
| `CV.igualaCartoes(raiz)` | põe todos os cartões de `raiz` na largura do maior texto (`--card-w`, medida na tela): grade regular |
| `CV.grupos(ids)` | id do grupo → `{ n: nome, c: categoria }` (`/universe/groups/{id}/`), cache `calculeve.cache.gruposinfo` |
| `CV.seletores(prefixo, chaves, aoTrocar)` | os seletores (personagem, mercado, fábrica, reação, refino, freighter service) que a janela pedir em `chaves`; devolve `{ desenha, escolhido(id), fecha }` |

**Seletores.** Quem usa põe no HTML só um contêiner `<div class="escolhas" id="<prefixo>-escolhas">` e
chama `CV.seletores` com a chave de `localStorage` de cada escolha; os botões e as listas são montados nele. O
botão mostra a escolha salva, o **×** ao lado tira, e a conta de quem chamou segue sem ela. `aoTrocar` é
opcional: Fuel Blocks, Invenção T2 e Produzir usam para refazer a conta na hora.

Imagem da CCP que não carrega recebe a classe `.falhou` e fica invisível.

## Área de trabalho

Ícones: **Personagens**, **Estoque** e **Loot Appraiser** (lado a lado, ícone `lupa` do `ui.svg`), **Fuel Blocks**, **Invenção T2**, **Produzir** e **Brave** (lado a lado; o botão da Brave, com `assets/icons/Brave.png`, só aparece se
pelo menos um char logado estiver na Brave Collective ou na Brave United, por `CV.brave()`, e abre a janela de importação do CSV), **Cadastrar
Estruturas**, **Cadastrar Freighter Service** e **Cadastrar Buyback** (lado a lado), **Apagar dados**, **Exportar dados** e
**Importar dados** (lado a lado) e **Voltar à main**. Papéis de parede em
`assets/wallpapers/calculeve/`, sorteados como no main, com crédito no selo e na janela Créditos.

**Exportar dados** baixa `calculeve-dados-AAAA-MM-DD.json` com toda chave do `localStorage` que começa
com `calculeve.` (tabela em "Dados no navegador"), no formato `{exportado: data, dados: {chave: valor}}`.
Inclui os refresh tokens dos chars (`calculeve.chars`). O `sessionStorage` (login em andamento) não entra.

**Importar dados** pede confirmação e um arquivo do Exportar dados: apaga toda chave `calculeve.` do
`localStorage`, grava as do arquivo (só as com esse prefixo) e recarrega a página. Arquivo que não tem
`dados` com chaves `calculeve.` é recusado, sem apagar nada.

**Personagens de comparação.** Saitama (todas as skills no 5) e Mr. Satan (todas no 0) ficam em
`CV.FICTICIOS`, com nome, nível, imagem, descrição e fonte (wikis Fandom de One-Punch Man e Dragon Ball).
Aparecem nos seletores de personagem e têm um botão cada na bandeja, ao lado do trocar papel de parede,
que abre a janela com o que são (chars de comparação) e quem são, com a fonte.

**Log.** Botão na bandeja, depois do Mr. Satan (ícone `log` do `ui.svg` + "Log"). Abre a janela Log, que lê o
`Mudanças.md` (`fetch`, mesma origem) e mostra um ícone por log: cada linha `# ` do arquivo começa um log, e o texto
dela é o nome do ícone, na ordem do arquivo. O ícone abre uma segunda janela com o título do log (ícone na cor do app)
e o texto desenhado num markdown mínimo (`##`/`###`, listas com `- ` aninhadas por 2 espaços, `**negrito**`,
`` `código` ``). **Um log por push:** tudo que muda entre um push e o seguinte entra na mesma seção
`# Log, dd/mm/aaaa` do topo do `Mudanças.md` (com `## Novo`, `## Mudou` e `## Corrigido`), descrevendo o estado em que
a coisa fica no push, não cada passo até ele. A data é a do push; depois dele, a próxima mudança abre uma seção nova.

**Apagar dados** remove do `localStorage` e do `sessionStorage` toda chave com prefixo
`calculeve.` e recarrega a página. Depois disso é preciso refazer o login e baixar os estoques de
novo.

## Login (sso.js)

OAuth2 Authorization Code com PKCE, que dispensa o client secret. O site usa o mesmo app do
`auth.py` no portal de devs da CCP.

- **Client ID:** fica em `sso.js` (é público por natureza). São **dois apps**, porque o portal aceita um
  callback por app: o `sso.js` usa o app local em `localhost` / `127.0.0.1` e o app publicado em qualquer
  outro endereço. Endereço novo = app novo no portal e mais uma entrada em `APPS`.
- **Callback:** o redirect enviado é o endereço da própria página, terminado em `index.html`, e
  precisa ser idêntico ao callback cadastrado no app.
- **Scopes:** lista em `sso.js`. Scope novo precisa ser ativado no app, no portal, e cada char
  precisa relogar.

| Scope | Dá acesso a |
|---|---|
| `esi-assets.read_assets.v1` | assets e nomes de naves/containers |
| `esi-characters.read_blueprints.v1` | blueprints em hangar |
| `esi-industry.read_character_jobs.v1` | jobs de indústria (blueprints instaladas) |
| `esi-universe.read_structures.v1` | nome e sistema de estruturas |
| `esi-location.read_location.v1` | sistema atual do char |
| `esi-fittings.read_fittings.v1` | fits salvos do char (teste: se a ESI devolve também os de corp/aliança) |
| `esi-skills.read_skills.v1` | níveis de skill |
| `esi-planets.manage_planets.v1` | colônias de PI |
| `esi-markets.structure_markets.v1` | mercado de estrutura |
| `esi-search.search_structures.v1` | busca de estruturas |

**Tokens.** O refresh token de cada char fica no `localStorage` do navegador, não em arquivo. O
access token fica só em memória e é renovado sozinho antes de vencer; quando a CCP devolve um
refresh token novo na renovação, ele substitui o antigo. O nome e o ID do char são lidos do payload
do JWT sem validar a assinatura, o que só é aceitável porque esses dados servem apenas para exibição
e a autorização real é feita pela ESI em cada chamada.

**Relogar** um char que já está na lista só atualiza o token dele. Para adicionar char de outra
conta, deslogar antes em `login.eveonline.com/account/logoff` (botão "Deslogar conta" na janela
Personagens).

API: `SSO.login()`, `SSO.retorno()`, `SSO.token(id)`, `SSO.tokens()`, `SSO.chars()`,
`SSO.remove(id)`.

## Estoque (estoque.js)

A janela Estoque tem um ícone por char e, com mais de um char, o **Tudão**, que junta todos. Cada um
abre uma janela com duas abas.

**Personal Assets** — imita o menu de assets do jogo:

- Agrupado por local: `segurança · nome do local - N Items - Route: X Jumps`.
- Clicar no local abre os itens; naves e containers abrem o que está dentro deles.
- Colunas: Nome, Qtd, Grupo, Volume, Preço est. (+ Char no Tudão). Item com nome próprio mostra o
  tipo ao lado.
- Itens com flag `Implant` ou `Skill` não são listados (o jogo também não lista).
- **Produto em job:** o que um job de fabricação ou reação ainda não entregue vai produzir aparece como item, em
  roxo claro (`tr.emjob`), no local de entrega do job (`output_location_id`; dentro do item, se o local for um
  container conhecido), com `em job · termina dd/mm hh:mm` ao lado do nome. Um item por job. A quantidade é
  `CV.qtdProduzida`, calculada na coleta e gravada no job do estoque salvo (`qtdProd`); estoque salvo antes disso
  não tem, até o próximo Atualizar. Não é asset: não entra no `CV.estoquePorTipo` nem em conta nenhuma.

**Busca.** A caixa ao lado das abas filtra pelo nome nas duas abas (sem acento, sem diferença de maiúscula) e
zera ao abrir outro char. Em Personal Assets, o item casa pelo nome (ou pelo tipo, se tem nome próprio); ficam os
locais com algum item que casa, já abertos, com o caminho até ele dentro de nave e container. O item que casa
mostra tudo o que tem dentro. O contador do local conta só o que casou. Em Blueprints, filtra as linhas.

**Blueprints** — mesmo agrupamento do bloco de blueprints da planilha: BPO/BPC com ME, TE e runs
iguais viram uma linha; blueprint instalada em job aparece com a atividade e o horário de término.

**Fontes dos dados.**

| Dado | Fonte |
|---|---|
| assets, nomes customizados | `/characters/{id}/assets/`, `/characters/{id}/assets/names/` |
| blueprints, jobs | `/characters/{id}/blueprints/`, `/characters/{id}/industry/jobs/` |
| nome, grupo e volume do tipo | `sde/invTypes.csv` (nome do grupo: `/universe/groups/{id}/`) |
| estação | `/universe/stations/{id}/` |
| estrutura | `/universe/structures/{id}/` (só onde o char tem acesso de docagem) |
| sistema e segurança | `/universe/systems/{id}/` |
| rota | `/characters/{id}/location/` + `/route/{origem}/{destino}/`, modo `shortest` |
| preço | `/markets/prices/` |

**Regras de cálculo e exibição.**

- Preço est. = `average_price` da ESI × quantidade.
- Volume = `volume` do `invTypes.csv` × quantidade.
- Segurança arredondada a uma casa: azul ≥ 0,45, amarelo > 0, vermelho ≤ 0.
- Rota contada a partir do sistema atual do char. O Tudão não mostra rota, porque cada char pode
  estar num lugar diferente.
- Números no formato brasileiro.
- Estrutura cujo nome a ESI não devolve (sem acesso de docagem) não vira
  local próprio: todas vão para um local só, **Estruturas sem acesso de docagem**, no fim da lista, com
  a quantidade somada por tipo (nave e container com conteúdo continuam separados). Os itens continuam
  no estoque salvo e contam no Fuel Blocks.
- Outro local não resolvido aparece como `Local <id>`.

**Salvamento.** O resultado de cada char e do Tudão fica salvo no navegador e é reaberto sem
consultar a ESI; só o botão **Atualizar** puxa de novo. A hora da última atualização aparece ao lado
do botão. Atualizar o Tudão também salva o estoque de cada char. Se o inventário passar do limite de
espaço do navegador, o salvamento é pulado (aviso no console) e a janela continua funcionando.

## Fuel Blocks (fuel.js)

Atalho do Produzir para fuel blocks. No topo, os cinco seletores (personagem, mercado, fábrica, reação, freighter
service), com chaves próprias (`calculeve.fuel.char` / `.mercado` / `.fabrica` / `.reacao` / `.frete`); trocar qualquer um refaz a conta do
lote aberto por esta janela.

A janela tem duas divisões de ícones — blueprints de fuel block em cima, isótopos embaixo — e lê
tudo do **estoque salvo do Tudão** (`calculeve.estoque.tudo`). Não consulta a ESI: para ver o estado atual, atualizar
o Tudão no Estoque antes. Sem Tudão salvo, a janela avisa.

- **Quais blueprints:** as que têm, no `industryActivityProducts.csv`, fabricação (`activityID` 1)
  de um produto do grupo Fuel Block (`groupID` 1136 no `invTypes.csv`).
- **Agrupamento:** blueprints com o mesmo tipo, BPO/BPC, ME, TE e runs viram um ícone só; `QT` é quantas
  são. Entram só as blueprints em hangar (`/characters/{id}/blueprints/`).
- **Ícone:** imagem de BPO ou BPC; em laranja, o nome do fuel block em cima e `ME / TE / QT` embaixo.
- **Isótopos:** Helium, Hydrogen, Nitrogen e Oxygen Isotopes, sempre os quatro. `QT` é a soma de
  todos os chars; `Locais` é quantos locais diferentes têm o isótopo — local é a raiz do item
  (estação, estrutura ou sistema), como no agrupamento da aba Personal Assets, então nave ou
  container conta como o local onde está.
- **Clique:** abre o **lote do Produzir** (`Produzir.abre(b, snap, sel)`, com os seletores desta janela): a mesma
  janela, conta, Resultado, buybacks e Nerds do Produzir. Na blueprint, com o ME/TE/runs dela; no isótopo, com a
  blueprint de maior ME do estoque do fuel block que consome aquele isótopo. Sem essa blueprint no estoque, abre como
  **BPO simulada** com ME 10 e TE 0 (campos editáveis, como no Produzir).

## Mercado (mercado.js)

Parte comum: toda janela da Calculeve que compra, vende ou compara preço usa o `Mercado`. Regras de taxa
do §4 do `DOC_planilha`.

- **Preços:** `/markets/structures/{id}/` (scope `esi-markets.structure_markets.v1`), todas as páginas,
  com o primeiro char que tiver acesso. Salvo no navegador só a **menor sell** e a **maior buy** de cada
  tipo, com a hora. `Mercado.precos(estr)` devolve o salvo (ou baixa se não houver);
  `Mercado.atualiza(estr)` baixa de novo.
- **Taxas** (`Mercado.taxas(estr, skills)`):
  - sales tax = 7,5% × (1 − 11% × nível de Accounting do char) — sozinha em `Mercado.salesTax(skills)`, para quem só
    vende direto em buy order e não precisa do broker;
  - broker = 0,5% fixo da SCC + o broker do dono cadastrado na estrutura (Broker Relations não conta em
    Upwell).
- **Por unidade:**

| Função | Sell | Buy |
|---|---|---|
| `Mercado.venda` | sell order na menor sell: `preço × (1 − broker − sales tax)` | direto na maior buy: `preço × (1 − sales tax)` |
| `Mercado.compra` | direto da menor sell: `preço` | buy order na maior buy: `preço × (1 + broker)` |

- **Jita 4-4** (`Mercado.jita(ids, forca)`): estação `60003760` (§2 do `DOC_planilha`); região achada
  pela ESI (estação → sistema → constelação → região, cache `calculeve.cache.regiao`). Por tipo,
  `/markets/{região}/orders/?type_id=` (público, sem token), só as ordens da estação: menor sell e maior
  buy. Salvo em `calculeve.mercado.jita`; tipo que já está salvo não é baixado de novo. Com `forca`
  (Atualizar preços) o salvo é descartado e só os tipos pedidos voltam.
- **Volume** (`Mercado.volumes(ids)`): `packaged_volume` de `/universe/types/{id}/`, cache
  `calculeve.cache.volumes`.
- **Frete** (`Mercado.frete(servico, preço, volume)`), por unidade, §4 do `DOC_planilha`:
  `MAX(ISK/m³ × volume ; % do colateral × preço)`. O frete mínimo por contrato é pago à parte e não entra.
  Sem serviço: 0.
- **Exibição de ISK:** `Mercado.isk(v)` — 2 casas, com `k` (≥ mil), `m` (≥ milhão) e `bi` (≥ bilhão); `Mercado.iskOuNaoTem(v)` mostra `NÃO TEM` para `null`.
- **Preços da ESI:** `Mercado.precosEsi()` baixa `/markets/prices/` uma vez por carga da página (`average_price` no Estoque, `adjusted_price` no custo de job).
  Todo valor em ISK da Calculeve passa por ela.
- **Buyback** (`Mercado.buyback(bb, tipo, grupo, jitaBuy)`): `% do buyback − taxa adicional da exceção` sobre o
  maior buy de Jita 4-4, sem frete nem taxa. A exceção do item vale no lugar da do grupo dele. Devolve `{pct, un}`.

## Números para Nerds (nerds.js)

Janela comum: qualquer janela da Calculeve chama `Nerds.abre(título, grupos)`, com `grupos` = listas de
`[nome, valor em ISK]` (valor `null` vira `NÃO TEM`; valor em texto sai como está, para o que não é ISK —
percentual, horas, contagem); cada grupo é uma tabela, com espaço entre elas.
Nome que tem texto em `Nerds.EXPLICA` vira botão que abre uma breve explicação, e o valor dele sai verde
se positivo e vermelho se negativo (`CV.sinal`). Os textos são genéricos ("o item fabricado", "os
materiais"), para servir a qualquer aba. Cada métrica (e cada taxa: broker, sales tax) tem uma
explicação só, com a conta dela (`{t, ver}`); o que ela cita não é explicado de novo — aparece em `ver`
e vira botão embaixo do texto, que abre a explicação própria. `Nerds.rotulo(nome)` devolve o
botão (ou texto, se não há explicação) e é usado em toda janela que mostra a métrica. Métrica nova com explicação:
entra em `EXPLICA`.

## Invenção T2 (t2.js)

Molde da aba de produção com invenção da planilha (§5.3b do `DOC_planilha`), genérico: serve para qualquer
T2 inventado, não para um item só. Os cinco seletores do topo (personagem, mercado, fábrica, reação, freighter service)
ficam em chaves próprias; trocar qualquer um refaz a conta na hora.

A janela lista, do **estoque salvo do Tudão**, uma por linha de ME/TE/runs, as **BPC** que têm invenção
(`activityID` 8 no `industryActivityProducts.csv`). Só cópia: invenção não roda em BPO. Clicar numa abre o
lote, com **Jobs** (abre em 100) e **Runs sobrando** (o excedente da invenção anterior, que entra no alvo de fabricação e
muda o que comprar, não a economia da invenção).

**Blueprint que você não tem.** Com algo digitado na busca, embaixo das BPC do estoque aparece a seção
**Blueprints que você não tem — BPC simulada**: as blueprints publicadas do SDE com invenção que casam com o termo e
não estão no estoque (mesma regra e mesmo teto de 60 do Produzir). O clique abre o lote como uma BPC do estoque, com
`BPC T1 simulada (não está no estoque)` no lugar do ME/TE: ME e TE da BPC T1 não entram na conta da invenção, então
não há campo para eles.

**Mais de um T2.** Algumas BPC T1 inventam mais de um T2 (`CV.industria().inv`: todos os produtos de invenção da
blueprint; ex.: Nova Cruise Missile → Fury ou Precision). No jogo quem escolhe é o jogador, no job (*Outcome*,
[EVE University Wiki](https://wiki.eveuniversity.org/Invention)); não há sorteio. Nesse caso, ao lado do título
**Invenção** aparece um ícone por T2 possível (`.inv-prod`, o da conta com `aria-pressed`); o lote abre no primeiro
do dump, e clicar em outro troca o produto e refaz carga e conta (cadeia, insumos, resultado, histórico). Produto de
invenção cujo T2 não tem fabricação no SDE fica de fora.

**Invenção.** Os parâmetros ficam numa grade de cinco colunas, rótulo em cima e valor embaixo. Chance =
`base × (1 + (ciência1 + ciência2)/30 + encryption/40) × multiplicador do decryptor`
(EVE University Wiki, [Invention](https://wiki.eveuniversity.org/Invention)). A base sai do
`industryActivityProbabilities.csv`; as três skills, do `industryActivitySkills.csv` (a que termina em
`Encryption Methods` é a racial, as outras duas são as de datacore), com os níveis do personagem escolhido.
Datacores e quantidade por job saem do `industryActivityMaterials.csv` (atividade 8); runs por BPC, do
`industryActivityProducts.csv`. Datacores e decryptor têm a mesma tabela dos insumos crus — qtd por job, qtd
do lote, **Comprar (E)**, **Comprar (J)** e a **melhor rota**, que é o gasto do lote —, e cada um entra na
compra pela rota que ele mesmo escolhe. O **tempo do job de invenção** é o base do SDE, sem nenhum multiplicador: não
achei fonte que diga o que reduz tempo de invenção (a página de invenção da EVE University fala em redução de
duração de job por engineering complex e rigs, mas sem dizer se vale para invenção, e a de pesquisa atribui
os 3%/nível da Advanced Industry a fabricação e pesquisa). Se for para descontar alguma coisa, é campo novo
em Cadastrar Estruturas. Cópias = `ROUNDDOWN(jobs × chance)` — não existe fração de cópia, e cada
cópia rende o lote inteiro de runs.

**Decryptors.** Os oito do grupo 1304 mais a linha **Sem decryptor**. Os quatro modificadores vêm do dogma
(`inventionPropabilityMultiplier` 1112, `inventionMEModifier` 1113, `inventionTEModifier` 1114,
`inventionMaxRunModifier` 1124); os três últimos são **somados** ao que a BPC inventada já nasce com,
**ME 2 / TE 4**. Cada decryptor é um cenário inteiro — cadeia, compras e venda refeitas —, e o vencedor é o
de maior **ROI**, que é quem dirige o resto da janela. Clicar numa linha fixa aquele decryptor; clicar de
novo devolve o vencedor.

**Cadeia.** Árvore do T2 até a **folha de compra**: nó é o que tem fabricação (`activityID` 1) ou reação
(`activityID` 11) no SDE, folha é o resto (minerais, moon materials crus, produtos de PI, gelo). Item que
aparece em mais de um pai ocupa uma linha só e soma as demandas. Produto com mais de uma blueprint no dump
fica com a que casa o nome (`<item> Blueprint` ou `<item> Reaction Formula`).

- **Três vias:** produzir · comprar na estrutura (menor sell do mercado escolhido) · comprar em Jita
  (menor sell de Jita 4-4 + frete do freighter service). A **melhor rota** é a menor das três e sai na cor da
  via que ganhou; nenhuma expressão de custo é repetida.
- **Colunas, nesta ordem:** item · BP · runs a fazer · estoque · **em job** · **termina** · comprar (un) · **Produzir** · **Comprar (E)**
  · **Comprar (J)** · **melhor rota**, e depois qtd no ciclo, horas de fila e sobra. As três vias e a melhor
  rota saem coloridas, número incluído: verde produzir, ciano estrutura (`.rota-e`), rosa claro Jita
  (`.rota-j`) — as cores são as mesmas em toda a Calculeve (tabela de classes no README da raiz). O que não
  existe sai em cinza: `NÃO TEM`, estoque zero e a linha podada. Rend/run e tempo/run de cada nó ficam no
  Números para Nerds.
- **Coluna BP:** **V** verde quem tem a blueprint no estoque, **x** vermelho quem não tem. Vale igual para
  reação — a fórmula também é blueprint, e o char pode não ter. A raiz diz `inventada`.
- **Poda:** nó cujo pai virou COMPRAR fica `— desnecessário` e some da conta. A raiz é sempre construída — a
  BPC veio da invenção.
- **Qtd de material:** `MAX(1; base × (1 − ME) × bônus da estrutura)` (§5.15 do `DOC_planilha`), com a qtd
  base (ME 0) do `industryActivityMaterials.csv`. O **ME** é o da blueprint que **consome** o material (a do job),
  tirado do estoque (0 para a que não está lá); o da raiz é o da BPC inventada, com o decryptor. O bônus da estrutura na fabricação é o da **fábrica**
  escolhida: `(1 − ME da estrutura) × (1 − ME do rig de fabricação)`. Reação não tem ME e roda em outra estrutura
  (normalmente uma refinaria): pega só o da estrutura escolhida em **reação**, `MAX(1; base × (1 − ME do rig de
  reação))`. Sem a escolha, sem bônus.
- **Tempo/run:** tempo base do SDE × `(1 − TE da BP)` × bônus das skills × bônus de tempo da estrutura (TE da
  estrutura e do rig: da fábrica na fabricação, da estrutura de reação na reação). Na
  fabricação as skills são Industry e Advanced Industry; na reação, Reactions — os três bônus por nível saem
  do dogma (`manufacturingTimeBonus`, `advancedIndustrySkillIndustryJobTimeBonus`, `reactionTimeBonus`).

**Custo de job.** `EIV × índice do sistema`, por run: o EIV é `Σ (qtd base ME 0 × adjusted_price)` de
`/markets/prices/`, e o índice é o da atividade (`manufacturing`, `reaction`) no sistema da estrutura escolhida
para ela — **fábrica** na fabricação, **reação** na reação —, de `/industry/systems/`. Sem a escolha, 0. O job de invenção **não** entra nessa conta.

**Em job / Termina** (Cadeia e Insumos crus): quanto do item está saindo de job de fabricação ou reação ainda não
entregue, somando os chars do Tudão, e o término do último desses jobs (`CV.emJobPorTipo`), em roxo claro (`td.emjob`);
sem job, `0` e `—` em cinza. No nó CONSTRUIR, o em job conta como run feita: **Runs a fazer** =
`⌈MAX(0; demanda − estoque − em job) / rend⌉` e **Sobra** = `estoque + em job + runs × rend − demanda`; a demanda dos
filhos cai junto. A raiz não desconta (o lote é o que se pediu). O Estoque continua sendo só o de assets e o
Comprar (un) da folha não muda.

**Insumos crus.** Uma linha por folha da árvore: qtd no ciclo, estoque, em job, termina, comprar (un), **Comprar (E)**,
**Comprar (J)** e a **melhor rota**, que aqui é o gasto de hoje (o que falta comprar × o preço da rota que
ganhou), na cor dela — e em verde quando dá zero, que é o estoque cobrindo a linha inteira. É a lista de compra: o fuel block é nó com decisão própria, mas os insumos dele
aparecem aqui.

**Copiar o que comprar.** Na Cadeia e nos Insumos crus, toda linha ativa cuja melhor rota é comprar (estrutura ou
Jita) e que tem Comprar (un) > 0 mostra o **nome** e o **Comprar (un)** como botões (`CV.copiavel`, sublinhado
tracejado): o clique copia para a área de transferência o nome, ou a quantidade sem separador de milhar, e o botão
pisca verde. Vale em Invenção T2, Produzir e Fuel Blocks.

**Resultado.** O item inventado não é linha da cadeia — ele é o resultado, e fica aqui: runs a fazer,
unidades, custo de produzir por unidade e as **quatro rotas de venda por unidade**, com os nomes do Fuel
Blocks — **ReceitaSellMerc** e **ReceitaBuyMerc** (sell order e buy order no mercado escolhido) e
**ReceitaSellJita** e **ReceitaBuyJita** (as mesmas duas em Jita 4-4, menos o frete por unidade) —, e a
melhor delas. As taxas de Jita são as do mercado escolhido: o broker do 4-4 é NPC e não é o mesmo da
estrutura, é aproximação (§4 do `DOC_planilha`).

Embaixo da linha do item, duas linhas de delta, uma célula por rota: **delta por unidade** (a rota menos o
custo de produzir uma unidade) e **delta do ciclo** (esse delta vezes as unidades), em verde ou vermelho pelo
sinal.

Depois, em grade (rótulo em cima, valor embaixo, centralizada na janela — como o bloco de parâmetros da
invenção):
**Compra (E)**, **Compra (J)**, **Custo dos jobs** e **Obrigatório em Jita** (a parte da Compra (J) de itens
sem ordem de venda na estrutura, que só se conseguem em Jita); e depois **Total investido**, **Receita**,
**Lucro**, **ROI estrutura (sell)** e **ROI Jita (buy)**. A Compra (J) leva o frete por unidade; o frete mínimo por
contrato não entra; datacores e decryptor entram na Compra (E) ou na Compra (J), pela rota que cada um
escolhe. O total é tudo que o ciclo consome comprado, **estoque nenhum** — material tirado do estoque custa o
que custaria comprar de novo, e contá-lo como zero inflaria o ROI de quem tem estoque. É esse total que o
lucro, o ROI e a tabela de decryptors usam.

Abaixo, o **histórico de 30 dias da região da estrutura** para o item produzido (`GET /markets/{região}/history/`,
sem login; a região sai do sistema da estrutura cadastrada): **Preço médio** (média dos dias ponderada pelo
volume) e **Qtd média por dia** (volume dos 30 dias ÷ 30; dia sem negociação conta zero). É a região inteira, não só
a estrutura. Estrutura cadastrada sem sistema não mostra o histórico. **Atualizar preços** baixa de novo.

**Lista de compra (clipboard)** — embaixo do Resultado, em Invenção T2, Produzir e Fuel Blocks (`secClipboard`).
**Clipboard E** e **Clipboard J** copiam a lista, um item por linha, `nome<TAB>quantidade` (o formato em que o jogo
copia uma lista de itens), em ordem alfabética: o **Comprar (un)** de tudo que a melhor rota manda comprar, na Cadeia e
nos Insumos crus, mais, na invenção, datacores e decryptor do lote inteiro (eles nunca descontam estoque). O E leva o
que se compra na estrutura; o J, o que se compra em Jita. Lista vazia deixa o botão desabilitado. Check box, guardados
no lote aberto (`ctx.compraTudo`, `ctx.deVerdade`, `ctx.semReacao`) e refletidos na Cadeia, nos Insumos crus e no
Resultado:

- **Não gosto de reação** — independe dos outros dois (sozinho desconta o estoque). No `efetivo` do motor, todo nó que não é o item final perde a via produzir quando tem
  ordem de venda na estrutura ou em Jita: os materiais da blueprint do item final são comprados prontos e só o job
  dele é feito. Sem ordem em nenhuma das duas, continua produzindo.
- **Comprar tudo** — conta com estoque e em job zerados (`no.estoque` e `no.emJob` = 0): compra tudo que o ciclo
  consome. Rota e decisão de produzir ou comprar não mudam; os dois clipboards continuam separados. Marcado, aparece o
  de baixo; desmarcar desmarca ele.
- **COMPRAR TUDO DE VERDADE** — só com Comprar tudo marcado: junta os dois num botão só, **Clipboard (tudo)**, com a
  lista completa.

O botão **Que diabo são esses check box?** (`Nerds.rotulo`) abre a explicação de cada um.

Abaixo, a grade dos **buybacks cadastrados** (`Buyback.grade`, seção Cadastrar Buyback).

**Números para Nerds.** O resto da conta: o saldo aberto, o **desembolso de hoje** (o que falta comprar
depois do estoque, por rota), a invenção em detalhe (datacores, decryptor, chance, cópias,
unidades), a venda (as rotas por unidade, receita, margem, horas de fila e ISK por hora de fila), o ROI de cada rota de venda e o da melhor rota e o
rend/run com o tempo/run de cada nó da cadeia. A
venda compara sell order no mercado, buy order no mercado e **Jita buy líquido menos o frete**. Buyback por
contrato não entra no Nerds; os buybacks cadastrados aparecem só no Resultado.

## Produzir (produzir.js)

A Invenção T2 sem a invenção: uma linha de produção normal, a partir de qualquer blueprint do estoque. Os
cinco seletores do topo são os mesmos (chaves próprias, `calculeve.prod.*`); trocar qualquer um refaz a conta.

A janela lista, do **estoque salvo do Tudão**, toda blueprint com fabricação (`activityID` 1), **BPO e
BPC**, T1 e T2, uma por linha de ME/TE/runs (fórmula de reação fica de fora). Clicar numa abre o lote, com o
campo **Runs**:

Abre com **1 run**. Na **BPC** o teto é **cópias × runs da cópia** (a linha da lista soma as cópias
idênticas), e o botão **Fazer máximo** põe o campo nesse teto; na **BPO** é livre e o botão não aparece.

**Blueprint que você não tem.** Com algo digitado na busca, embaixo das blueprints do estoque aparece a seção
**Blueprints que você não tem — BPO simulada**: as blueprints de fabricação publicadas do SDE (`published` do
`invTypes.csv`) que casam com o termo e não estão no estoque, respeitando o botão Brave. Sem termo a seção não
existe; com mais de 60 resultados desenha os 60 primeiros e pede pra refinar. O clique abre o lote como **BPO 0/0**,
com os campos **ME** (0–10) e **TE** (0–20, de 2 em 2) editáveis: a conta é a mesma de uma BPO do estoque, na
estrutura, mercado e char escolhidos nos seletores. Os nós abaixo da raiz continuam com o ME/TE das blueprints do
estoque.

A lista é dividida em seções pelo que a blueprint fabrica, pela categoria do grupo do produto (`CV.grupos`):
**Naves** (categoria 6), **Rigs** (módulo de grupo `Rig …`), **Módulos** (categoria 7), **Munição** (categoria 8) e
**Outros** (o resto: fuel blocks, componentes, drones…), nessa ordem; seção vazia não aparece.

**Botão Brave** (canto superior direito, ao lado da busca): só existe se há um CSV da Brave importado
(`Brave.naves()`). Ligado, a lista mostra só as blueprints que fabricam uma nave das doutrinas importadas
(pelo typeID do produto); desligado, tudo. Ligado, embaixo da lista vem a seção **Blueprints que faltam para as
naves das doutrinas**: as naves do CSV cujo produto nenhuma blueprint do estoque fabrica, sem clique, e sem as de
meta **Faction** (que só existem como BPC), ordenadas por número de fits (mais fits primeiro; empate, ordem alfabética). A busca também filtra essa seção. Por enquanto só há o CSV de naves.

**O que é reusado do `t2.js`** (exposto em `T2`): o motor `cenario` (árvore até a folha de compra, três vias,
poda, custo de job, receita nas quatro rotas), as seções Cadeia, Insumos crus e Resultado, o
Números para Nerds e a carga de preços (`T2.carrega`: mercado, Jita, volumes, skills, índices de custo). A lista de
blueprints, o índice do SDE e o estoque vêm do `CV`. O `cenario` roda em modo `producao`: ME/TE são os da própria blueprint, as unidades são
`runs × unidades por run`, e não há chance, cópias, datacores nem decryptor. Aqui a quantidade de cada material no
ciclo (**Qtd no ciclo**) é sempre arredondada para cima, por job: `⌈runs × qtd por run⌉`.

**Resultado e Nerds** são os da Invenção T2, sem os blocos de invenção e de decryptors. O item fabricado é o
Resultado; a cadeia lista só o que ele consome.

## Loot Appraiser (appraiser.js)

Cola-se a lista de itens como o jogo copia (uma linha por item: nome, tab, quantidade; o resto da linha é ignorado).
Item sem quantidade conta 1; nome repetido soma. A tabela sai em ordem alfabética (ver Ordenar), uma linha por item, com o valor do
item inteiro em cada uma das quatro rotas e a **melhor** em negrito, na cor da rota. Nome que não está no
`invTypes.csv` sai como `não encontrado no SDE`. **Avaliar** calcula; **Atualizar preços** baixa de novo o mercado e
Jita. Seletores (chaves `calculeve.lap.*`): personagem, mercado, **refino** (estrutura de indústria onde se
reprocessa) e freighter service; trocar qualquer um refaz a conta. **Ordenar:** Item, Qtd e as quatro rotas no
cabeçalho são botões (`.ordena`, o ativo com `aria-pressed`, na cor do app). Item volta à ordem alfabética, que é a
padrão; os outros ordenam do maior para o menor (sem valor vai para o fim). Melhor não ordena. A ordem escolhida
vale até trocar, inclusive numa nova avaliação. Acima da tabela, uma linha só:
`Preços: <data> · <rendimento>% · Scrapmetal Processing (<nível>)`; a data é a mais antiga entre mercado e Jita (os dois
são atualizados juntos), e o rendimento sai como um número só quando estrutura e Jita dão igual, senão os dois.

| Rota | Cor | Conta (item inteiro) |
|---|---|---|
| **Estrutura** | ciano (`.rota-e`) | `qtd × maior buy do mercado × (1 − sales tax)` |
| **Jita** | rosa (`.rota-j`) | `qtd × (maior buy de Jita 4-4 × (1 − sales tax) − frete por unidade)` |
| **Refino na estrutura** | verde (`.rota-re`) | minerais no maior buy do mercado × (1 − sales tax), com o rendimento e a taxa da estrutura de refino |
| **Refino em Jita** | pêssego (`.rota-rj`) | minerais no maior buy de Jita × (1 − sales tax), com o rendimento e a taxa de Jita 4-4, menos o frete do item inteiro |

- **Venda:** sempre direto na buy order: só sales tax (`Mercado.salesTax`), sem broker.
- **Reprocesso:** a receita é a do `invTypeMaterials.csv` por **lote** (`portionSize`). Lotes = `⌊qtd / lote⌋`;
  cada material rende `qtd da receita × lotes × rendimento × (1 − taxa)`. A sobra abaixo de um lote cheio é vendida
  inteira no buy do mesmo lugar. **Item que não refina** (sem receita, ou menos de um lote) entra **inteiro** nas rotas
  de refino, vendido no buy do mesmo lugar: Refino na estrutura = Estrutura, Refino em Jita = Jita; na tabela essas
  células saem em itálico (`td.inteiro`), com a explicação no `title`.
- **Rendimento:** base × `(1 + bônus por nível × nível de Scrapmetal Processing do char)`. O bônus por nível é o
  `refiningYieldMutator` da skill, do dogma do SDE. A base na estrutura é o `refiningYieldMultiplier` do
  **Standup Reprocessing Facility I** (dogma do SDE); em Jita, o `reprocessing_efficiency` de
  `/universe/stations/60003760/`.
- **Taxa de refino:** na estrutura, o campo **Taxa de refino (%)** da estrutura de indústria em Cadastrar Estruturas
  (a ESI não informa); em Jita, o `reprocessing_stations_take` da estação, que é a taxa **base** (sem o desconto de
  standing). Aplicada como fração do que o reprocesso devolve.
- **Frete:** `Mercado.frete` do freighter service escolhido, por unidade do item, com o maior buy de Jita do item
  como colateral. Sem serviço, 0.
- Rota que não dá para calcular (sem preço, sem receita, sem mercado ou sem refino escolhido) sai `—` em cinza; sem
  nenhuma rota, `sem preço`. Os avisos do que falta escolher ou cadastrar ficam acima da tabela.

**Veredito do lote.** Embaixo da tabela, em grade (rótulo em cima, valor embaixo), o lote inteiro por cada uma das
quatro rotas e, na linha de baixo, a diferença para a melhor; a melhor leva um **V** verde. É a soma das linhas (item
que não refina já entra inteiro nas rotas de refino); item sem preço numa rota conta 0 nela; item não encontrado no
SDE fica de fora. Embaixo, a nota: item que não refina entra inteiro, e misturar itens que refinam com itens que não
refinam pode deixar o appraisal de refino impreciso.

**Números para Nerds** (botão embaixo de Avaliar): os parâmetros da conta (sales tax, Scrapmetal Processing,
rendimento e taxa de refino de estrutura e Jita, freighter service) e o lote por rota (`Lote — <rota>`), cada um com a
explicação dele em `Nerds.EXPLICA`.

## Cadastrar Estruturas (estruturas.js)

- Caixa de busca (mínimo 3 letras) → `/characters/{id}/search/?categories=structure`, com **cada** char
  logado (scope `esi-search.search_structures.v1`). Os resultados dos chars são somados.
- Cada estrutura achada é resolvida em `/universe/structures/{id}/` com o token de quem a achou; a ESI
  só devolve para char na ACL, senão a linha mostra `sem acesso (erro)`.
- Colunas: Nome · Sistema · Tipo (ícone e nome do `type_id`) · ID · Achada por (chars que a acharam).
- A ESI não tem lista das estruturas a que o char tem acesso, nem os rigs de uma estrutura.
- **Cadastro:** clicar na linha cadastra a estrutura, só nestes tipos (e só se o nome foi resolvido):
  - **Keepstar** (`typeName` exato) → estrutura de **mercado**; abre a janela de taxas, em %: broker do
    dono da estrutura.
  - **Engineering Complex** (grupo 1404: Raitaru, Azbel, Sotiyo) e **Refinery** (grupo 1406: Athanor,
    Tatara) → estrutura de **indústria**; abre a janela de bônus, em %: ME da estrutura — fabricação ·
    ME do rig — fabricação · ME do rig — reação · TE da estrutura — fabricação · TE do rig — fabricação
    · TE da estrutura — reação · TE do rig — reação · Taxa de refino. Estrutura e rig separados, como no jogo; skill não
    entra aqui (vem do char). Campo vazio vale 0.
  - Outro tipo não é clicável.
- Cadastrar de novo a mesma estrutura substitui a anterior (reabre os valores já salvos).
- **Cadastradas:** lista embaixo da busca, com tipo, sistema, os valores digitados (na ordem acima),
  **Editar** (reabre a janela com os valores salvos) e Remover.

## Cadastrar Freighter Service (frete.js)

Lista dos serviços de frete cadastrados, com **Editar** e **Remover**, e o botão **+ Adicionar
freighter service**. Cada serviço tem nome e os três valores do frete do §4 do `DOC_planilha`: **ISK
por m³**, **% do colateral** e **frete mínimo por contrato** (ISK). Campo numérico vazio vale 0. O
escolhido no seletor de freighter service entra no frete por unidade (`Mercado.frete`).

## Cadastrar Buyback (buyback.js)

Lista dos buybacks cadastrados, com **Editar** e **Remover**, e o botão **+ Adicionar buyback**. Cada buyback tem
**nome**, **% do Jita buy** e **exceções**. A exceção é de um **grupo** ou de um **item** e tem uma **taxa adicional**
em pontos percentuais, descontada da %: 93% com 3 de taxa adicional no grupo Fuel Block = 90% para todo fuel block.
A exceção do item vale no lugar da do grupo dele.

Para pôr uma exceção, a busca (mín. 3 letras, sem acento nem maiúscula) procura nos itens publicados do `invTypes.csv`
e mostra os 15 primeiros em ordem alfabética; cada resultado tem **+ Item** e **+ Grupo: <nome>** (nome do grupo por
`CV.grupos`). A taxa adicional se edita na linha da exceção. Nada é gravado antes do **Salvar**.

**Grade no Resultado** (`Buyback.grade(alvo, tipo, grupo, jitaBuy, qtd)`), usada por Invenção T2 e
Produzir (e, por ele, Fuel Blocks): um campo por buyback, `Buyback — <nome> (<%>)`, com `qtd × Jita buy × %` (`Mercado.buyback`, exceção do item
ou do grupo do item produzido). Sem Jita buy, `NÃO TEM`; enquanto Jita carrega, o texto do estado. Sem buyback
cadastrado, a grade não aparece.

## Dados no navegador

| Chave | Onde | Conteúdo |
|---|---|---|
| `calculeve.chars` | localStorage | `[{id, name, refresh_token}]` |
| `calculeve.pkce` | sessionStorage | verifier e state do login em andamento |
| `calculeve.estoque.<id>` / `calculeve.estoque.tudo` | localStorage | estoque salvo |
| `calculeve.estruturas` | localStorage | `{mercado: [{id, name, type, sys, sistema, taxas}], industria: [{…, bonus}]}` |
| `calculeve.fuel.char` / `.mercado` / `.fabrica` / `.reacao` / `.frete` | localStorage | escolhas do Fuel Blocks (id do char / da estrutura) |
| `calculeve.t2.char` / `.mercado` / `.fabrica` / `.reacao` / `.frete` | localStorage | escolhas da Invenção T2 |
| `calculeve.prod.char` / `.mercado` / `.fabrica` / `.reacao` / `.frete` | localStorage | escolhas do Produzir |
| `calculeve.mercado.<id>` | localStorage | `{ts, p: {typeID: [menor sell, maior buy]}}` da estrutura de mercado |
| `calculeve.fretes` | localStorage | `[{id, nome, iskM3, pctColat, minimo}]` |
| `calculeve.lap.char` / `.mercado` / `.refino` / `.frete` | localStorage | escolhas do Loot Appraiser |
| `calculeve.buybacks` | localStorage | `[{id, nome, pct, exc: [{tipo: "g" \| "i", id, nome, taxa}]}]` |
| `calculeve.mercado.jita` | localStorage | `{ts, p: {typeID: [menor sell, maior buy]}}` de Jita 4-4, só dos tipos já consultados |
| `calculeve.cache.regiao` / `calculeve.cache.regiaosis` / `calculeve.cache.volumes` | localStorage | região de Jita · região por sistema · volume embalado por tipo |
| `calculeve.mercado.hist.<região>` | localStorage | `{ts, p: {typeID: [preço médio 30 dias, unidades por dia]}}`; refeito depois de 24 h |
| `calculeve.brave.naves` | localStorage | `{ts, naves: [...]}` do CSV da Brave, inteiro |
| `calculeve.cache.gruposinfo` | localStorage | nome e categoria de grupo |
| `calculeve.cache.sistemas` | localStorage | nome e segurança de sistema |
| `calculeve.cache.estacoes` | localStorage | nome e sistema de estação |
| `calculeve.cache.estruturas` | localStorage | nome e sistema de estrutura |

**Brave (brave.js).** O botão abre uma janela com **Escolher arquivo**: importa o CSV do Export CSV da tabela Ship
Overview do site de doutrinas. Lê as 18 colunas pela posição (o "% Jita" aparece três vezes), tira o typeID da URL do
ícone e salva tudo em `calculeve.brave.naves` (`{ts, naves: [...]}`); cada importação substitui a anterior, e um
arquivo que não seja esse CSV é recusado sem mexer no salvo. As outras janelas leem por `Brave.naves()`.

**Limpeza (`CV.limpaOrfaos()`).** Roda ao abrir a página e ao remover um char ou uma estrutura. Apaga o preço
(`calculeve.mercado.<id>`) e o histórico da região de estrutura que não está mais cadastrada, o estoque
(`calculeve.estoque.<char>`) de char que não está mais logado e o Tudão se ele leva o estoque de um char removido.
Atualizar um estoque, o preço de uma estrutura ou o histórico sobrescreve a chave inteira. Os caches
`calculeve.cache.*` são dado fixo da ESI e não são limpos.

Todas começam com `calculeve.`, que é o prefixo apagado por "Apagar dados".

## Content-Security-Policy

Origens permitidas além do próprio site. **Manter a lista do `<head>` do `index.html` igual a
esta.**

| Diretiva | Origens | Para quê |
|---|---|---|
| `connect-src` | `https://esi.evetech.net`, `https://login.eveonline.com` | ESI e troca/renovação de token |
| `img-src` | `https://images.evetech.net`, `data:` | ícones de itens e retratos |

O redirecionamento para a tela de login é navegação e não passa pela CSP.
