# Log, 17/10/2026

## Novo

- **Cadastrar Buyback** (`buyback.js`, ícone novo ao lado do Cadastrar Freighter Service): nome, **% do Jita buy** e **exceções** por grupo ou por item, com **taxa adicional** em pontos percentuais (93% com 3 no grupo Fuel Block = 90%). A exceção do item vale no lugar da do grupo. A busca de item (mín. 3 letras) tem **+ Item** e **+ Grupo**.
  - No **Resultado** (Invenção T2, Produzir e Fuel Blocks), uma grade com cada buyback: `Buyback — nome (%)` e `unidades × Jita buy × %` (`Mercado.buyback`, `Buyback.grade`).
- **Seletor de reação** ao lado do de fábrica (Invenção T2, Produzir e Fuel Blocks; chaves `calculeve.*.reacao`). As reações pegam dele o ME do rig de reação, o TE de estrutura e rig de reação e o sistema do custo do job de reação. Sem escolha, sem bônus e custo de job 0.
- **Copiar o que comprar**: na Cadeia e nos Insumos crus, o nome e o **Comprar (un)** das linhas cuja melhor rota é comprar (estrutura ou Jita) viram botões que copiam para a área de transferência (quantidade sem separador de milhar) (`CV.copiavel`).
- **Produto em job**: o que sai dos jobs de fabricação e reação ainda não entregues (runs × unidades por run do SDE), em roxo claro.
  - No **Estoque** (Personal Assets), como item no local de entrega do job, com `em job · termina dd/mm hh:mm`.
  - Na **Cadeia** e nos **Insumos crus** (Invenção T2, Produzir e Fuel Blocks), colunas **Em job** e **Termina** depois do Estoque. No nó que é produzido, o em job sai do **Runs a fazer** e entra na **Sobra** (a raiz não desconta); o Estoque e o Comprar (un) da folha não mudam.
  - Vale a partir do próximo **Atualizar** do Estoque.
- **Invenção T2 — BPC simulada**: com algo na busca, embaixo das BPC do estoque aparece **Blueprints que você não tem — BPC simulada** (blueprints com invenção do SDE que casam com o termo e não estão no estoque, até 60). O clique abre o lote normal, marcado `BPC T1 simulada (não está no estoque)`; sem campos de ME/TE, porque eles não entram na conta da invenção.
- **Invenção T2 — BPC que inventa mais de um T2** (ex.: Nova Cruise Missile → Fury ou Precision; 74 blueprints no SDE): ao lado do título **Invenção**, um ícone por T2 possível; o marcado é o da conta. Clicar em outro refaz a janela inteira (cadeia, insumos, resultado, preços) para ele. Abre no primeiro do dump. No jogo o produto é escolhido no job (*Outcome*), não é sorteado.
- **Loot Appraiser** (`appraiser.js`, ícone de lupa ao lado do Estoque): cola a lista de itens como o jogo copia (sem quantidade = 1; repetido soma) e mostra, em ordem alfabética, o valor de cada item em quatro rotas, com a melhor em negrito:
  - **Estrutura** (ciano): direto no buy do mercado escolhido.
  - **Jita** (rosa): direto no buy de Jita 4-4, menos o frete.
  - **Refino na estrutura** (verde): reprocessa na estrutura de refino escolhida e vende os minerais no buy do mercado.
  - **Refino em Jita** (pêssego): manda pra Jita, reprocessa lá e vende os minerais no buy de Jita.
  - Rendimento pela **Scrapmetal Processing** do char (bônus do dogma do SDE); base da estrutura do dogma do Standup Reprocessing Facility I, base e taxa de Jita da ESI (`/universe/stations/`, taxa base, sem standing). Sobra abaixo de um lote é vendida inteira.
  - Seletor novo **refino** (estrutura de indústria), chaves `calculeve.lap.*`.
  - Linha de cima: `Preços: data · rendimento% · Scrapmetal Processing (nível)`.
  - Item que não refina entra **inteiro** nas rotas de refino (vendido no buy do mesmo lugar), também na linha do item (em itálico). Nota embaixo do veredito: misturar itens que refinam com itens que não refinam pode deixar o appraisal de refino impreciso.
  - Botão **Números para Nerds**, com os parâmetros da conta e o lote por rota, cada um com explicação.
  - **Veredito do lote** no fim: o lote inteiro em cada rota e, embaixo, a diferença para a melhor (a melhor com **V** verde); sem preço conta 0.
  - **Ordenar pelo cabeçalho**: Item, Qtd, Estrutura, Jita, Refino na estrutura e Refino em Jita viram botões. Item volta à ordem alfabética (a padrão); os outros ordenam do maior para o menor. Melhor não ordena. A ordem ativa fica na cor do app.
- **Cadastrar Estruturas**: campo **Taxa de refino (%)** nas estruturas de indústria (a ESI não informa). Estrutura já cadastrada fica sem o campo até ser editada; o Loot Appraiser avisa e conta 0.
- `Mercado.salesTax(skills)`: só a sales tax, para venda direto em buy order.
- **Lista de compra no Resultado** (Invenção T2, Produzir e Fuel Blocks): **Clipboard E** e **Clipboard J** copiam o Comprar (un) da Cadeia e dos Insumos crus (e, na invenção, datacores e decryptor), um item por linha (`nome<TAB>quantidade`): o E só o que se compra na estrutura, o J só o que se compra em Jita.
  - **Não gosto de reação** (independe dos outros; sozinho desconta o estoque): nada da cadeia é produzido; os materiais da blueprint do item final são comprados prontos, cada um na mais barata entre estrutura e Jita (sem ordem em nenhuma, continua produzindo).
  - **Comprar tudo**: ignora o estoque (e o que está em job); rota e decisão de produzir ou comprar não mudam. Marcado, aparece:
    - **COMPRAR TUDO DE VERDADE**: junta os dois clipboards num só, **Clipboard (tudo)**, com a lista completa.
  - A Cadeia, os Insumos crus e o Resultado refletem o que estiver marcado. Botão **Que diabo são esses check box?** explica cada um.

## Mudou

- **Fuel Blocks** virou atalho do Produzir: clicar na blueprint ou no isótopo abre o lote do Produzir (mesma conta, Resultado, buybacks e Nerds), com os seletores do Fuel Blocks. Isótopo sem blueprint no estoque abre como **BPO simulada** ME 10 / TE 0. A janela de materiais antiga (PIs/Gelo, Saldo, Max estoque, Zerar estoque, Tempo) saiu, junto com as explicações do Nerds que só ela usava (Total a comprar, VendaInsumos, Deltas).
- **Reações** não pegam mais bônus da fábrica escolhida, só os da estrutura de reação.
- **Faxina (sem mudança visível)**: as cores exclusivas da Calculeve viraram variáveis no `calculeve.css` (`--verde`, `--rota-re`, `--rota-rj`, `--emjob`), em vez do código da cor repetido em cada regra; os botões de clipboard usam o `CV.copiavel` (que ganhou o parâmetro de classe) em vez de uma cópia local dele; o teste de job não entregue virou `CV.jobAberto`, usado pelo Estoque e pelo produto em job.

## Corrigido

- **Qtd de material**: o ME aplicado era o da blueprint do próprio material, não o da blueprint que o consome. Agora é o da blueprint do job (o ME da raiz passa a valer); reação não tem ME, só o rig de reação.
- **Invenção T2**: BPC T1 com mais de um produto de invenção só calculava o último do dump (`CV.industria` sobrescrevia); o outro não aparecia. Agora o índice guarda todos (`I.inv`).

# Log, 10/10/2026

## Novo

- **Janela Produzir** (`produzir.js`, ícone de engrenagem): a Invenção T2 sem a invenção.
  - Lista blueprints de fabricação do estoque do Tudão (BPO e BPC, T1 e T2; reação fica de fora), em seções **Naves**, **Rigs**, **Módulos**, **Munição** e **Outros** pela categoria do produto.
  - Lote abre com 1 run. Na BPC, teto = cópias × runs e botão **Fazer máximo**; na BPO, livre.
  - **Blueprints que você não tem — BPO simulada**: com termo na busca, mostra até 60 blueprints publicadas do SDE que não estão no estoque; abrem como BPO 0/0 com ME (0–10) e TE (0–20) editáveis.
  - Seletores próprios (`calculeve.prod.*`).
  - Material arredondado para cima por job: `⌈runs × qtd por run⌉`.
- **Brave** (`brave.js`, ícone `Brave.png`):
  - Ícone só aparece se algum char logado está na Brave Collective ou Brave United.
  - Janela **Doutrinas da Brave**: importa o CSV do Ship Overview (substitui o anterior; arquivo errado é recusado).
  - No Produzir, botão **Brave** filtra para naves das doutrinas importadas e mostra a seção **Blueprints que faltam para as naves das doutrinas** (sem Faction, ordenada por número de fits).
- **Busca pelo nome** (sem acento/maiúscula) no Estoque (Personal Assets e Blueprints), na Invenção T2 e no Produzir. No Personal Assets abre o caminho até o item dentro de nave/container.
- **Histórico de 30 dias da região da estrutura** no Resultado: Preço médio (ponderado pelo volume) e Qtd média por dia. Rebaixado depois de 24 h.
- **Limpeza automática** (`CV.limpaOrfaos`): ao abrir a página e ao remover char/estrutura, apaga preço e histórico de estrutura descadastrada, estoque de char removido e o Tudão se ele leva char removido.
- **SSO**: novo scope `esi-fittings.read_fittings.v1` (chars precisam relogar para ganhar o scope).

## Mudou

- **Resultado (Invenção T2 e Produzir)**:
  - Novo campo **Obrigatório em Jita** (parte da Compra (J) sem sell order na estrutura).
  - **ROI** virou **ROI estrutura (sell)** e **ROI Jita (buy)**.
  - **Frete mínimo por contrato saiu da conta** (Compra (J) e desembolso). Texto do Nerds ajustado.
- **Números para Nerds**: ROI de cada rota de venda e ROI da melhor rota.
- **Atualizar preços (Jita)**: agora descarta o salvo inteiro e baixa só os tipos pedidos (antes só sobrescrevia esses tipos).
- **Fuel Blocks**: agrupamento passou a considerar **runs** também (antes: tipo, BPO/BPC, ME, TE).
- **Cartões das listas**: todos na largura do maior texto (grade regular).
- **Seletores**: HTML só tem o contêiner `#<prefixo>-escolhas`; botões e listas montados pelo `CV.seletores`.

## Interno (sem efeito visível)

- Código repetido em `fuel.js`, `t2.js` e `estoque.js` foi para o `CV`: `industria`, `bonusSkill`, `fmt`, `hms`, `niveis`, `estoquePorTipo`, `blueprints`, `tudao`, `cartao`, `cartaoBp`, `listaBps`, `csv`, `grupos` (cache novo `calculeve.cache.gruposinfo`, substitui `calculeve.cache.grupos`), `status`.
- `Mercado`: `precosEsi` (`/markets/prices/` uma vez por carga), `iskOuNaoTem`, `regiaoDoSistema` (cache `calculeve.cache.regiaosis`), `historico`.
- `t2.js` expõe o motor em `T2`; `cenario` ganhou modo `producao`.
- CSS: estilos por id viraram classes reutilizáveis (`.janela-lista`, `.janela-lote`, `.campo`, `.campo-num`, `.busca`, `.bp-info`, `.btn-brave`). `base.css` ganhou `[hidden]{display:none!important}`. `ui.svg` ganhou o símbolo `engrenagem`.
- READMEs (raiz e Calculeve) atualizados.
