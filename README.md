# milenium archive — área de trabalho principal

Site pessoal estático (GitHub Pages) com a aparência de uma área de trabalho: ícones, janelas,
barra de tarefas, menu iniciar e papel de parede aleatório. Cada "programa" do site é uma página
própria, aberta a partir de um ícone ou do menu iniciar, com o seu próprio README.

| Programa | Página | Documentação |
|---|---|---|
| Calculeve | `eve/calculeve/index.html` | [`eve/calculeve/README.md`](eve/calculeve/README.md) |

## Rodar localmente

```
python -m http.server 8000 -d ~/mileniumarchive
```

Abrir `http://localhost:8000/`. O site precisa ser servido por HTTP: aberto direto do disco
(`file://`), os ícones em `<use href>` e o login da Calculeve não funcionam.

O servidor do Python deixa o navegador guardar CSS e JS em cache. Depois de alterar qualquer
arquivo, recarregar com **Ctrl+Shift+R**.

## Estrutura

```
index.html                 área de trabalho principal
assets/
  css/base.css             estilos compartilhados por todas as páginas
  css/main.css             estilos exclusivos da área de trabalho principal
  js/desktop.js            comportamento compartilhado (janelas, papel de parede, relógio, menu de contexto)
  js/main.js               exclusivo do main: menu iniciar, ícones, desligar
  icons/ui.svg             sprite com os ícones de interface
  icons/*_career_svg.svg   ícones de carreira do EVE, usados pelos programas
  icons/*.png              ícones em PNG: coloridos vão como <img>; os recoloridos vão por máscara (.mascara)
  wallpapers/              papéis de parede (subpasta por programa)
eve/calculeve/             programa Calculeve
```

## Convenções

**Nada inline.** Estilo vai em CSS, script vai em arquivo `.js`. A Content-Security-Policy das
páginas proíbe script e estilo inline, então uma exceção não funciona. Os únicos estilos escritos
pelo JavaScript são valores calculados na hora (posição e z-index das janelas, recuo de árvore).

**Nada repetido.** O que duas páginas usam fica em `assets/`: estilo em `base.css`, comportamento
em `desktop.js`, ícone em `ui.svg`. Cada página só acrescenta o que é exclusivo dela, num CSS e num
JS próprios.

**Tema por variáveis.** `base.css` define as cores em `:root` (`--accent`, `--accent-rgb`,
`--accent-light`, `--title-a`, `--title-b`). O main usa o padrão roxo; cada programa redefine essas
variáveis no seu CSS. Cores de marca usadas fora do próprio programa (ex.: o ícone da Calculeve no
main) ficam em `base.css` como `--cor-<programa>`, com a classe `.cor-<programa>`.

**Ícones.** SVG referenciado por `<use href="…#id">`, nunca colado no HTML. A cor vem de
`currentColor` (a propriedade `color` do CSS), e a espessura do traço vem do CSS do contexto
(`.icon svg`, `.tb svg`). Ícone novo de interface entra como `<symbol>` em `ui.svg`; ícone de
arquivo próprio precisa de `id="icone"` no elemento desenhado e `fill="currentColor"`. Ícone que
estende outro reaproveita o símbolo base com `<use>` dentro do `<symbol>`, sem copiar o desenho.

**Estados compartilhados (`base.css`).** Classes para reaproveitar, em vez de repetir a regra:

| Classe | Efeito |
|---|---|
| `.icon`, `.btn`, `.app` | hover na cor do app |
| `.alerta` | hover vermelho (ação destrutiva ou de saída); o X das janelas usa o mesmo |
| `.vidro` | painel translúcido sobre o papel de parede |
| `.icon-linha` | põe ícones lado a lado dentro da coluna de ícones |
| `.rota-e` / `.rota-j` | origem de compra: **estrutura** em ciano, **Jita** em rosa claro. Vale em qualquer página, no número e no rótulo |
| `.mascara` + `.mascara-<nome>` | ícone PNG na cor do app: o PNG vira máscara (só o alfa conta) e a cor vem de `--accent`. PNG novo ganha uma classe `.mascara-<nome>` em `base.css` com `--mascara:url(../icons/<arquivo>.png)` |

**Elementos certos.** O que executa ação é `<button type="button">`; o que leva a outra página é
`<a>`. `<div>` clicável não é usado.

## Content-Security-Policy — manter atualizada

Cada página declara no `<head>` uma `<meta http-equiv="Content-Security-Policy">` com as origens
permitidas. O navegador bloqueia qualquer recurso fora da lista, e o bloqueio só aparece no console.
**Todo domínio novo que uma página passar a usar (script, imagem, API) entra na política dessa
página.**

| Página | Origens além do próprio site |
|---|---|
| `index.html` | nenhuma |
| `eve/calculeve/index.html` | ver README da Calculeve |

## desktop.js

Carregado por toda página com área de trabalho. A página chama, no fim do `<body>`:

```js
Desktop.init({ walls: [{ file: "caminho/imagem.jpg", badge: "html do selo de crédito" }, …] });
```

Marcação esperada: `#wall`, `#badge`, `#clock` (com `.t` e `.d`), `#wallbtn`, `#ctx` (botões
`data-act="wall"` e `data-act="cred"`), janela de créditos `#w-cred`. O véu das janelas e os botões
XX são criados pelo script.

**Janelas (`WIN`).** Toda `.win` tem `.title > h3` e `button.close[data-close="<id>"]`.
`WIN.open(id)`, `WIN.close(id)`, `WIN.closeAll()`, `WIN.aberta()`.

- Só a janela do topo aceita interação; o resto da página fica atrás de um véu.
- X fecha a janela; XX fecha todas.
- Esc fecha a janela do topo; Ctrl+Esc fecha todas.
- Janelas são arrastáveis pela barra de título e redimensionáveis pelo canto inferior direito
  (`resize` do CSS, em `base.css`). Ao redimensionar, a janela deixa de ser centralizada por
  `transform` e passa a `left`/`top` fixos, e o `.content` perde o `max-height` e ocupa a janela.
- Largura ao abrir: o menor tamanho em que o conteúdo cabe sem quebrar linha (`max-content`), até
  `--win-w`; acima disso o texto quebra. Janela que pode crescer até a tela: `--win-w:100vw` na
  própria `.win`. Janela de tabela, que abre sempre na largura cheia de `--win-w`: classe
  `largura-fixa` na `.win`. Redimensionada, a largura só é limitada pela tela.
- Altura máxima do conteúdo antes de redimensionar: variável `--content-h` (padrão `60vh`). Janela que
  precisa de outro valor troca a variável na própria `.win` (ex.: `#w-x{--content-h:78vh}`), nunca o
  `max-height` do `.content` — senão o redimensionar deixa de liberar a altura.
- Eventos: `winabriu` no `document` ao abrir qualquer janela; `fechou` na própria janela ao fechar.

**Menu de contexto.** Botão direito fora de janelas, bandeja e barra de tarefas; não abre com
janela aberta.

`--bar-h` (altura da barra de tarefas, lida por `alturaBarra()`) limita o arraste e o menu de
contexto; é 0 em páginas sem barra.

## Main

Ícones: Créditos, Sobre e Calculeve. O menu iniciar lista os programas instalados. "Desligar"
tenta fechar a aba; como o navegador só permite isso em aba aberta por script, na prática mostra a
tela de desligado com "Ligar novamente".

Papéis de parede em `assets/wallpapers/`, com crédito no selo e na janela Créditos.
