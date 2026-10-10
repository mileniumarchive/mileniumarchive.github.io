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
