# Calculeve

Programa de indústria do EVE Online, substituto da planilha `pi_cadeia_isk.xlsx`. Roda inteiro no
navegador: faz login na CCP, puxa os dados da ESI e calcula no próprio site, sem servidor e sem
client secret. Convenções gerais do site (CSS, JS, ícones, CSP) no [README da raiz](../../README.md).
Plano de port e decisões pendentes: [README-FUTURO.md](README-FUTURO.md).

## Arquivos

```
index.html      marcação da página (ícones, janelas); nenhum script ou estilo inline
calculeve.css   tema laranja e componentes exclusivos (bandeja, personagens, tabelas do estoque)
calculeve.js    utilidades comuns (CV) + papel de parede, janela Personagens, Apagar dados, Exportar e Importar dados
sso.js          login EVE SSO (OAuth2 + PKCE)
estoque.js      janela Estoque (assets + blueprints)
mercado.js      preços de mercado e taxas (Mercado), comum a toda a Calculeve
nerds.js        janela Números para Nerds (Nerds), comum a toda a Calculeve
fuel.js         janela Fuel Blocks
t2.js           janela Invenção T2 (invenção, decryptors, cadeia, insumos crus, resultado)
estruturas.js   janela Cadastrar Estruturas
frete.js        janela Cadastrar Freighter Service
sde/*.csv       cópia dos dumps do SDE
```

Ordem de carregamento: `desktop.js` → `calculeve.js` → `sso.js` → `estoque.js` → `mercado.js` → `nerds.js` → `fuel.js` →
`t2.js` → `estruturas.js` → `frete.js`. O
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
| `CV.sde(arquivo, colunas)` | linhas de um CSV de `sde/`, só com as colunas pedidas (lido uma vez por arquivo) |
| `CV.tipos()` | `typeID` → `{name, group, vol}`, do `invTypes.csv` |
| `CV.esi(path, {token, body})` | chamada à ESI (POST quando há `body`); erro HTTP vira exceção com `.status` |
| `CV.esiPaginado(path, token)` | junta todas as páginas (`X-Pages`) |
| `CV.limite(itens, n, fn)` | roda `fn` em cada item com no máximo `n` requisições simultâneas |
| `CV.cacheado(chave, ids, busca)` | dado estático da ESI com cache no `localStorage` |
| `CV.sistemas(ids)` | id do sistema → `{name, sec}` (cache `calculeve.cache.sistemas`) |
| `CV.skills(char)` | Map `skill_id` → `active_skill_level` do char (`/characters/{id}/skills/`), uma consulta por char por carga da página |
| `CV.seletores(prefixo, chaves, aoTrocar)` | os quatro seletores (personagem, mercado, fábrica, freighter service) de uma janela; devolve `{ desenha, escolhido(id), fecha }` |

**Seletores.** Quem usa põe no HTML, para cada seletor, um botão `<prefixo>-<id>-btn` e uma lista
`<prefixo>-<id>-lista` (hidden), e chama `CV.seletores` com a chave de `localStorage` de cada escolha. O
botão mostra a escolha salva, o **×** ao lado tira, e a conta de quem chamou segue sem ela. `aoTrocar` é
opcional: o Fuel Blocks não usa (a escolha vale na próxima abertura da janela de materiais), a Invenção T2
usa para refazer a conta na hora.

Imagem da CCP que não carrega recebe a classe `.falhou` e fica invisível.

## Área de trabalho

Ícones: **Personagens**, **Estoque**, **Fuel Blocks** e **Invenção T2** (lado a lado), **Cadastrar
Estruturas** e **Cadastrar Freighter Service** (lado a lado), **Apagar dados**, **Exportar dados** e
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

No topo, quatro botões de escolha, cada um abrindo sua lista; o escolhido aparece no botão (imagem e
nome) e fica salvo no navegador. O **×** ao lado de cada botão tira a escolha, e a conta segue sem ela:

| Botão | Opções | Sem escolha | Chave |
|---|---|---|---|
| **Escolher personagem** | chars logados + os fictícios **Saitama** (ícone `Sai.png`, todas as skills no 5) e **Mr. Satan** (ícone `Satan.png`, todas no 0) — quem vai fabricar | todas as skills no 0 | `calculeve.fuel.char` |
| **Escolher mercado** | estruturas de mercado cadastradas | sem dados de mercado: todo número de preço vira `SP` (sem preço) | `calculeve.fuel.mercado` |
| **Escolher fábrica** | estruturas de indústria cadastradas | estrutura sem bônus nenhum | `calculeve.fuel.fabrica` |
| **Escolher freighter service** | freighter services cadastrados — frete do CustoJita | frete 0 (o jogador leva) | `calculeve.fuel.frete` |

A janela tem duas divisões de ícones — blueprints de fuel block em cima, isótopos embaixo — e lê
tudo do **estoque salvo do Tudão**
(`calculeve.estoque.tudo`). Não consulta a ESI: para ver o estado atual, atualizar o Tudão no
Estoque antes. Sem Tudão salvo, a janela avisa.

- **Quais blueprints:** as que têm, no `industryActivityProducts.csv`, fabricação (`activityID` 1)
  de um produto do grupo Fuel Block (`groupID` 1136 no `invTypes.csv`).
- **Agrupamento:** blueprints com o mesmo tipo, BPO/BPC, ME e TE viram um ícone só; `QT` é quantas
  são. Entram só as blueprints em hangar (`/characters/{id}/blueprints/`).
- **Ícone:** imagem de BPO ou BPC; em laranja, o nome do fuel block em cima e `ME / TE / QT` embaixo.
- **Isótopos:** Helium, Hydrogen, Nitrogen e Oxygen Isotopes, sempre os quatro. `QT` é a soma de
  todos os chars; `Locais` é quantos locais diferentes têm o isótopo — local é a raiz do item
  (estação, estrutura ou sistema), como no agrupamento da aba Personal Assets, então nave ou
  container conta como o local onde está.
- **Materiais:** clicar numa blueprint abre a janela de materiais com o ME dela; clicar num isótopo
  abre a do fuel block que consome aquele isótopo, com a blueprint de maior ME do estoque. Sem
  blueprint desse tipo no estoque, a janela avisa e calcula com ME 10.

**Janela de materiais.** Caixa de **Runs** (inteiro ≥ 1), botões **Max estoque** e **Zerar estoque**,
dois blocos, **PIs** e **Gelo**, cada um com Item · Necessário · Estoque · Saldo, e embaixo o bloco
**Resultado**: o fuel block produzido e a quantidade, `runs × unidades por run` (`quantity` do
`industryActivityProducts.csv`), numa célula que ocupa as três colunas de número.

- Receita: `industryActivityMaterials.csv`, fabricação (`activityID` 1) da blueprint.
- Gelo = material do grupo Ice Product (`groupID` 423); o resto da receita vai em PIs.
- Necessário = `MAX(runs; ROUNDUP(runs × qtd base × (1 − ME) × bônus da estrutura))`, a mesma conta da
  aba Fuel Blocks da planilha.
- Bônus da estrutura = `(1 − ME da estrutura) × (1 − ME do rig)` de fabricação, da **fábrica
  escolhida** (bônus salvos em Cadastrar Estruturas); sem fábrica, 1.
- **Tempo** (embaixo de Runs) = `tempo base × runs × (1 − TE da BP) × (1 + bônus Industry × nível) ×
  (1 + bônus Advanced Industry × nível) × (1 − TE da estrutura) × (1 − TE do rig)`, no formato `h:mm:ss`. Tempo base:
  `industryActivity.csv`, fabricação. Skills: `active_skill_level` de `/characters/{id}/skills/`
  (scope `esi-skills.read_skills.v1`) do **personagem escolhido**, consultado uma vez por char
  enquanto a página está aberta (sem personagem ou Mr. Satan, 0; Saitama, 5). Bônus por nível (em %, negativo reduz) lidos do SDE: atributo
  `manufacturingTimeBonus` da skill Industry e `advancedIndustrySkillIndustryJobTimeBonus` da Advanced
  Industry, em `dgmTypeAttributes.csv` (nome do atributo em `dgmAttributeTypes.csv`).
- Estoque = soma do item em todos os chars e locais do Tudão.
- **Preço (UnMerc)** (4ª coluna, também no Resultado): duas linhas, **Sell** e **Buy**, do mercado escolhido,
  pelo `Mercado` (seção abaixo). Materiais usam `Mercado.compra`; o fuel block do Resultado,
  `Mercado.venda`. Sem ordem daquele lado: `NÃO TEM`. Sem mercado escolhido: `SP` (sem preço) em
  toda célula de preço, no CustoMerc, no Total e na Receita. Sem o broker do dono cadastrado, a célula
  diz que falta. As taxas usam o Accounting do personagem (sem personagem ou Mr. Satan, 0; Saitama, 5). Os preços salvos são reusados; **Atualizar preços**
  baixa de novo (a hora aparece ao lado).
- **CustoMerc** (5ª coluna dos materiais): se o Saldo é negativo, `−saldo × menor sell` (o que falta,
  comprado direto na sell order, sem taxa); com Saldo ≥ 0, `—`.
- **CustoJita** (6ª coluna dos materiais; o Resultado não tem): se o Saldo é negativo, `−saldo × (menor
  sell de Jita 4-4 + frete por unidade)`; com Saldo ≥ 0, `—`. Frete por unidade = `Mercado.frete` com o
  **freighter service escolhido** (sem serviço, 0). Não depende do mercado escolhido nem do personagem.
  **Atualizar preços** baixa de novo também os preços de Jita.
- **Total a comprar** (linha entre Gelo e Resultado, na coluna do CustoMerc): soma do CustoMerc de
  todos os materiais. Se algum material que falta não tem sell order, `NÃO TEM`.
- **Receita** (5ª coluna do Resultado), duas linhas: **ReceitaSellMerc** = `qtd × Sell` de
  `Mercado.venda` (sell order na menor sell, líquido de broker e sales tax) e **ReceitaBuyMerc** =
  `qtd × Buy` (direto na maior buy, líquido de sales tax).
- **Números para Nerds** (botão embaixo de Atualizar preços): abre uma janela com **DeltaSellMerc** =
  ReceitaSellMerc − Total a comprar e **DeltaBuyMerc** = ReceitaBuyMerc − Total a comprar; separado deles,
  **VendaInsumosBuyMerc** = o Necessário de cada material vendido direto na maior buy (líquido de sales
  tax), **DeltaSellInsumos** = ReceitaSellMerc − VendaInsumosBuyMerc e **DeltaBuyInsumos** =
  ReceitaBuyMerc − VendaInsumosBuyMerc; e um terceiro grupo, **VendaInsumosSellMerc** = o Necessário de
  cada material vendido em sell order na menor sell (líquido de broker e sales tax),
  **DeltaSellInsumosSell** = ReceitaSellMerc − VendaInsumosSellMerc e **DeltaBuyInsumosSell** =
  ReceitaBuyMerc − VendaInsumosSellMerc. Tudo da conta que está na janela de materiais naquele momento.
  A janela é a do `Nerds` (seção abaixo).
- Saldo = Estoque − Necessário; verde se positivo, vermelho se negativo.
- Runs de um material = quantas runs o estoque dele aguenta, pela mesma conta do Necessário: parte de
  `ROUNDDOWN(estoque ÷ (qtd base × (1 − ME) × bônus da estrutura))` e desce uma run enquanto o Saldo
  dele ficar negativo.
- Max estoque: o **menor** valor entre todos os materiais (PIs e Gelo) — Saldo ≥ 0 em todos.
- Zerar estoque: o **maior** valor entre todos os materiais — o Saldo negativo dos outros é o que falta
  comprar para gastar o estoque.

## Mercado (mercado.js)

Parte comum: toda janela da Calculeve que compra, vende ou compara preço usa o `Mercado`. Regras de taxa
do §4 do `DOC_planilha`.

- **Preços:** `/markets/structures/{id}/` (scope `esi-markets.structure_markets.v1`), todas as páginas,
  com o primeiro char que tiver acesso. Salvo no navegador só a **menor sell** e a **maior buy** de cada
  tipo, com a hora. `Mercado.precos(estr)` devolve o salvo (ou baixa se não houver);
  `Mercado.atualiza(estr)` baixa de novo.
- **Taxas** (`Mercado.taxas(estr, skills)`):
  - sales tax = 7,5% × (1 − 11% × nível de Accounting do char);
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
  buy. Salvo em `calculeve.mercado.jita`; tipo que já está salvo não é baixado de novo, a não ser com
  `forca`.
- **Volume** (`Mercado.volumes(ids)`): `packaged_volume` de `/universe/types/{id}/`, cache
  `calculeve.cache.volumes`.
- **Frete** (`Mercado.frete(servico, preço, volume)`), por unidade, §4 do `DOC_planilha`:
  `MAX(ISK/m³ × volume ; % do colateral × preço)`. O frete mínimo por contrato é pago à parte e não entra.
  Sem serviço: 0.
- **Exibição de ISK:** `Mercado.isk(v)` — 2 casas, com `k` (≥ mil), `m` (≥ milhão) e `bi` (≥ bilhão).
  Todo valor em ISK da Calculeve passa por ela (Fuel Blocks e o Preço est. do Estoque).

## Números para Nerds (nerds.js)

Janela comum: qualquer janela da Calculeve chama `Nerds.abre(título, grupos)`, com `grupos` = listas de
`[nome, valor em ISK]` (valor `null` vira `NÃO TEM`; valor em texto sai como está, para o que não é ISK —
percentual, horas, contagem); cada grupo é uma tabela, com espaço entre elas.
Nome que tem texto em `Nerds.EXPLICA` vira botão que abre uma breve explicação, e o valor dele sai verde
se positivo e vermelho se negativo (`CV.sinal`). Os textos são genéricos ("o item fabricado", "os
materiais"), para servir a qualquer aba. Cada métrica (e cada taxa: broker, sales tax) tem uma
explicação só, com a conta dela (`{t, ver}`); o que ela cita não é explicado de novo — aparece em `ver`
e vira botão embaixo do texto, que abre a explicação própria. `Nerds.rotulo(nome)` devolve o
botão (ou texto, se não há explicação) e é usado em toda janela que mostra a métrica — no Fuel Blocks:
Total a comprar, ReceitaSellMerc e ReceitaBuyMerc. Métrica nova com explicação: entra em `EXPLICA`.

## Invenção T2 (t2.js)

Molde da aba de produção com invenção da planilha (§5.3b do `DOC_planilha`), genérico: serve para qualquer
T2 inventado, não para um item só. Os quatro seletores do topo são os mesmos do Fuel Blocks (personagem,
mercado, fábrica, freighter service), em chaves próprias; trocar qualquer um refaz a conta na hora.

A janela lista, do **estoque salvo do Tudão**, uma por linha de ME/TE/runs, as **BPC** que têm invenção
(`activityID` 8 no `industryActivityProducts.csv`). Só cópia: invenção não roda em BPO. Clicar numa abre o
lote, com **Jobs** (abre em 100) e **Runs sobrando** (o excedente da invenção anterior, que entra no alvo de fabricação e
muda o que comprar, não a economia da invenção).

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
- **Colunas, nesta ordem:** item · BP · runs a fazer · estoque · comprar (un) · **Produzir** · **Comprar (E)**
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
  base (ME 0) do `industryActivityMaterials.csv`. O **ME** é o da blueprint no estoque (0 para a que não
  está lá); o da raiz é o da BPC inventada, com o decryptor. Reação não tem ME — pega o rig de reação.
- **Tempo/run:** tempo base do SDE × `(1 − TE da BP)` × bônus das skills × bônus de tempo da estrutura. Na
  fabricação as skills são Industry e Advanced Industry; na reação, Reactions — os três bônus por nível saem
  do dogma (`manufacturingTimeBonus`, `advancedIndustrySkillIndustryJobTimeBonus`, `reactionTimeBonus`).

**Custo de job.** `EIV × índice do sistema`, por run: o EIV é `Σ (qtd base ME 0 × adjusted_price)` de
`/markets/prices/`, e o índice é o da atividade (`manufacturing`, `reaction`) no sistema da **fábrica
escolhida**, de `/industry/systems/`. Sem fábrica escolhida, 0. O job de invenção **não** entra nessa conta.

**Insumos crus.** Uma linha por folha da árvore: qtd no ciclo, estoque, comprar (un), **Comprar (E)**,
**Comprar (J)** e a **melhor rota**, que aqui é o gasto de hoje (o que falta comprar × o preço da rota que
ganhou), na cor dela — e em verde quando dá zero, que é o estoque cobrindo a linha inteira. É a lista de compra: o fuel block é nó com decisão própria, mas os insumos dele
aparecem aqui.

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
**Compra (E)**, **Compra (J)** e **Custo dos jobs**; e depois **Total investido**, **Receita**, **Lucro** e
**ROI**. A Compra (J) já leva o frete por unidade e o **frete mínimo por
contrato**, pago uma vez; datacores e decryptor entram na Compra (E) ou na Compra (J), pela rota que cada um
escolhe. O total é tudo que o ciclo consome comprado, **estoque nenhum** — material tirado do estoque custa o
que custaria comprar de novo, e contá-lo como zero inflaria o ROI de quem tem estoque. É esse total que o
lucro, o ROI e a tabela de decryptors usam.

**Números para Nerds.** O resto da conta: o saldo aberto, o **desembolso de hoje** (o que falta comprar
depois do estoque, por rota, e o frete mínimo), a invenção em detalhe (datacores, decryptor, chance, cópias,
unidades), a venda (as três rotas por unidade, receita, margem, horas de fila e ISK por hora de fila) e o
rend/run com o tempo/run de cada nó da cadeia. A
venda compara sell order no mercado, buy order no mercado e **Jita buy líquido menos o frete**. Buyback por
contrato não entra — o site não tem programa de buyback cadastrado.

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
    · TE da estrutura — reação · TE do rig — reação. Estrutura e rig separados, como no jogo; skill não
    entra aqui (vem do char). Campo vazio vale 0.
  - Outro tipo não é clicável.
- Cadastrar de novo a mesma estrutura substitui a anterior (reabre os valores já salvos).
- **Cadastradas:** lista embaixo da busca, com tipo, sistema, os valores digitados (na ordem acima),
  **Editar** (reabre a janela com os valores salvos) e Remover.

## Cadastrar Freighter Service (frete.js)

Lista dos serviços de frete cadastrados, com **Editar** e **Remover**, e o botão **+ Adicionar
freighter service**. Cada serviço tem nome e os três valores do frete do §4 do `DOC_planilha`: **ISK
por m³**, **% do colateral** e **frete mínimo por contrato** (ISK). Campo numérico vazio vale 0. O
escolhido no Fuel Blocks entra no frete do CustoJita (`Mercado.frete`).

## Dados no navegador

| Chave | Onde | Conteúdo |
|---|---|---|
| `calculeve.chars` | localStorage | `[{id, name, refresh_token}]` |
| `calculeve.pkce` | sessionStorage | verifier e state do login em andamento |
| `calculeve.estoque.<id>` / `calculeve.estoque.tudo` | localStorage | estoque salvo |
| `calculeve.estruturas` | localStorage | `{mercado: [{id, name, type, sys, sistema, taxas}], industria: [{…, bonus}]}` |
| `calculeve.fuel.char` / `.mercado` / `.fabrica` / `.frete` | localStorage | escolhas do Fuel Blocks (id do char / da estrutura) |
| `calculeve.t2.char` / `.mercado` / `.fabrica` / `.frete` | localStorage | escolhas da Invenção T2 |
| `calculeve.mercado.<id>` | localStorage | `{ts, p: {typeID: [menor sell, maior buy]}}` da estrutura de mercado |
| `calculeve.fretes` | localStorage | `[{id, nome, iskM3, pctColat, minimo}]` |
| `calculeve.mercado.jita` | localStorage | `{ts, p: {typeID: [menor sell, maior buy]}}` de Jita 4-4, só dos tipos já consultados |
| `calculeve.cache.regiao` / `calculeve.cache.volumes` | localStorage | região de Jita · volume embalado por tipo |
| `calculeve.cache.grupos` | localStorage | nomes de grupo |
| `calculeve.cache.sistemas` | localStorage | nome e segurança de sistema |
| `calculeve.cache.estacoes` | localStorage | nome e sistema de estação |
| `calculeve.cache.estruturas` | localStorage | nome e sistema de estrutura |

Todas começam com `calculeve.`, que é o prefixo apagado por "Apagar dados".

## Content-Security-Policy

Origens permitidas além do próprio site. **Manter a lista do `<head>` do `index.html` igual a
esta.**

| Diretiva | Origens | Para quê |
|---|---|---|
| `connect-src` | `https://esi.evetech.net`, `https://login.eveonline.com` | ESI e troca/renovação de token |
| `img-src` | `https://images.evetech.net`, `data:` | ícones de itens e retratos |

O redirecionamento para a tela de login é navegação e não passa pela CSP.
