# Calculeve — futuro

Plano, decisões tomadas e ainda não implementadas, e pendências conhecidas. Diferente do
[README](README.md), que descreve só o que existe, este arquivo muda conforme o trabalho anda: o que
for implementado sai daqui e passa a ser descrito no README.

## Retomar o trabalho num chat novo

- Conectar as duas pastas: `~/Eve` (planilha, `DOC_planilha_eve.md`, scripts Python, dumps do SDE) e
  `~/mileniumarchive` (o site).
- Ler, nesta ordem: [README da raiz](../../README.md), [README da Calculeve](README.md), este arquivo
  e `~/Eve/DOC_planilha_eve.md`, que é a especificação do que falta portar.
- Servir o site com `python -m http.server 8000 -d ~/mileniumarchive` e recarregar com Ctrl+Shift+R
  depois de cada alteração.
- Nada de commit nem de backup: o dono dá o pull/commit no final.

## Ordem do port

A planilha é aposentada quando o port terminar. A ordem segue a dependência entre as abas:

1. **Banco de dados preço + parâmetros** — fonte da verdade, todas as abas apontam pra ela. No site
   vira "puxa preços da ESI" + configuração dos parâmetros.
2. **Pré-cálculo** — a camada de conta universal usada pelas outras abas.
3. O resto das abas.

O molde da aba de produção com invenção (§5.3b do `DOC_planilha`) está fechado na janela **Invenção T2**, e
é genérico: qualquer T2 inventado entra sem código novo.

## Decisões tomadas

**Parâmetros do modelo** (seção 4 do `DOC_planilha`: frete, taxas, buyback, broker, bônus de
estrutura e rigs, níveis de skill):

- Níveis de skill vêm da ESI (`/characters/{id}/skills`, scope `esi-skills.read_skills.v1`, já
  pedido no login).
- O que é público da Brave (frete, buyback, broker da estrutura, bônus de estrutura e rigs) fica num
  arquivo de configuração dentro do repo.
- Se algum desses dados não puder ser público, ele sai do repo e fica no navegador, numa janela de
  configurações com botões de exportar e importar em JSON (o navegador pode apagar os dados).

**SDE.** O site lê o `invTypes.csv` inteiro (18 MB). Decisão consciente: não gerar versão enxuta.

**Versão dos arquivos.** Sem número de versão nos links de CSS/JS; o cache é resolvido com
Ctrl+Shift+R.

## Publicação no GitHub Pages

O site está publicado em `https://mileniumarchive.github.io/`, e a Calculeve em
`https://mileniumarchive.github.io/eve/calculeve/index.html`. São dois apps no portal de devs da CCP, um por
callback, e o `sso.js` escolhe pelo endereço (§ Login do [README](README.md)).

Efeito colateral em vigor: com o callback do app local apontando para o site local, o `python auth.py add`
(adicionar char na planilha) não funciona mais. A renovação de token do `att.py` continua funcionando, porque
não usa callback.

Falta conferir, com o site no ar: o login em cada char, a Content-Security-Policy no console e se o
`localStorage` do endereço publicado começa vazio (origem nova, tokens não atravessam do localhost — e
importar os de lá não resolve, porque refresh token é amarrado ao Client ID que o criou).

## Pendências conhecidas

- **Custo do job de invenção**: a Invenção T2 calcula o custo dos jobs de fabricação e reação
  (`EIV × índice do sistema`), mas não o do job de invenção — falta saber qual EIV a CCP usa nele.
- **Buyback**: a planilha compara com o buyback por contrato (`W1`); no site não existe programa de buyback
  cadastrado, então a Invenção T2 compara só as três rotas de mercado.

- **ESI `/latest`**: o site e o `att.py` usam `https://esi.evetech.net/latest/...`; a especificação
  atual da ESI (`/meta/openapi.json`) não lista caminhos com `/latest` e usa um parâmetro de data de
  compatibilidade. Funciona; se deixar de funcionar, a URL base está numa constante só no
  `estoque.js`.
- **Falha de renovação de token** de um char aparece só no console; mostrar na janela Personagens
  foi cogitado e não decidido.
- **Scope sem uso no site**: `esi-planets.manage_planets.v1` — pedido no login para as próximas
  etapas do port.
