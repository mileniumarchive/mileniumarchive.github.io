/* ==========================================================================
   desktop.js — comportamento compartilhado de toda "área de trabalho" do site:
   janelas modais (WIN), papel de parede + selo de crédito, relógio e menu do
   botão direito. Cada página chama Desktop.init({ walls: [...] }) no fim do body.

   Marcação esperada (ids): #wall, #badge, #clock (.t/.d), #wallbtn, #ctx
   (botões data-act="wall" | "cred"), janela de créditos #w-cred, e janelas
   .win com .title > h3 + button.close[data-close="<id da janela>"].

   Teclado: Esc fecha a janela do topo · Ctrl+Esc fecha todas.
   ========================================================================== */

/* altura da barra de tarefas (--bar-h do CSS; 0 em página sem barra) */
function alturaBarra(){
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 0;
}

/* ---------- janelas: só a do topo aceita interação ---------- */
var WIN = (function(){
  "use strict";
  var pilha = [], veil = null;

  function atualiza(){
    pilha.forEach(function(w, i){ w.style.zIndex = 100 + i * 2; });
    veil.style.display = pilha.length ? "block" : "none";
    veil.style.zIndex = 99 + (pilha.length - 1) * 2;
  }
  function open(id){
    var w = document.getElementById(id), i = pilha.indexOf(w);
    if (i >= 0) pilha.splice(i, 1);
    pilha.push(w); w.classList.add("open"); atualiza();
    document.dispatchEvent(new Event("winabriu"));
  }
  function close(id){
    var w = document.getElementById(id), i = pilha.indexOf(w);
    if (i < 0) return;
    pilha.splice(i, 1); w.classList.remove("open"); atualiza();
    w.dispatchEvent(new Event("fechou"));
  }
  function closeTop(){ if (pilha.length) close(pilha[pilha.length - 1].id); }
  function closeAll(){ pilha.slice().reverse().forEach(function(w){ close(w.id); }); }

  /* troca o centro por transform por left/top em px, no mesmo lugar: arrastar e redimensionar partem daqui */
  function fixa(w){
    var r = w.getBoundingClientRect();
    w.style.transform = "none"; w.style.left = r.left + "px"; w.style.top = r.top + "px";
    return r;
  }
  /* arrastar pela barra de título, sem sair da tela nem entrar na barra de tarefas;
     redimensionar pelo canto (CSS resize) — o clique no canto cai na própria .win */
  function arrastavel(w){
    var bar = w.querySelector(".title"), dx = 0, dy = 0, drag = false;
    w.addEventListener("pointerdown", function(e){ if (e.target === w) fixa(w); });
    bar.addEventListener("pointerdown", function(e){
      if (e.target.closest("button, a, input")) return;
      var r = fixa(w);
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      drag = true; bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", function(e){
      if (!drag) return;
      w.style.left = Math.max(4, Math.min(window.innerWidth - 60, e.clientX - dx)) + "px";
      w.style.top  = Math.max(0, Math.min(window.innerHeight - alturaBarra() - 30, e.clientY - dy)) + "px";
    });
    bar.addEventListener("pointerup", function(){ drag = false; });
  }

  function init(){
    veil = document.createElement("div"); veil.id = "veil"; document.body.appendChild(veil);
    document.querySelectorAll(".win").forEach(function(w){
      var x = w.querySelector(".title .close"), xx = document.createElement("button");
      xx.type = "button"; xx.className = "close xx"; xx.title = "Fechar tudo (Ctrl+Esc)"; xx.innerHTML = "&times;&times;";
      x.title = "Fechar (Esc)";
      x.before(xx); xx.addEventListener("click", closeAll);
      arrastavel(w);
    });
    document.querySelectorAll("[data-close]").forEach(function(b){
      b.addEventListener("click", function(){ close(b.dataset.close); });
    });
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape") return;
      if (e.ctrlKey) closeAll(); else closeTop();
    });
  }

  return { init: init, open: open, close: close, closeAll: closeAll,
           aberta: function(){ return pilha.length > 0; } };
})();

/* ---------- papel de parede, relógio, menu de contexto ---------- */
var Desktop = (function(){
  "use strict";
  var walls = [], cur = -1, wall, badge, ctx;

  /* walls: [{ file: "caminho/relativo.jpg", badge: "html do selo de crédito" }] */
  function setWall(i){
    if (i === cur) return;
    cur = i;
    var w = walls[i], img = new Image();
    img.onload = img.onerror = function(){
      wall.style.backgroundImage = 'url("' + w.file + '")';
      wall.classList.add("on");
      badge.innerHTML = w.badge;
      badge.classList.add("on");
    };
    img.src = w.file;
  }
  function randomWall(){
    if (walls.length < 2) return setWall(0);
    var i; do { i = Math.floor(Math.random() * walls.length); } while (i === cur);
    wall.classList.remove("on"); badge.classList.remove("on");
    setTimeout(function(){ setWall(i); }, cur === -1 ? 0 : 450);
  }

  function relogio(){
    var el = document.getElementById("clock"), t = el.querySelector(".t"), d = el.querySelector(".d");
    function tick(){
      var n = new Date();
      t.textContent = n.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      d.textContent = n.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "");
      el.title = n.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    tick(); setInterval(tick, 1000);
  }

  function escondeCtx(){ ctx.style.display = "none"; }
  function menuContexto(){
    document.addEventListener("contextmenu", function(e){
      if (WIN.aberta() || e.target.closest(".win, #tray, #ctx, #bar, #start")) return;
      e.preventDefault();
      ctx.style.display = "block";
      ctx.style.left = Math.min(e.clientX, window.innerWidth  - ctx.offsetWidth  - 8) + "px";
      ctx.style.top  = Math.min(e.clientY, window.innerHeight - ctx.offsetHeight - alturaBarra() - 8) + "px";
    });
    ctx.addEventListener("click", function(e){
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.act === "wall") randomWall(); else WIN.open("w-cred");
      escondeCtx();
    });
    document.addEventListener("click", escondeCtx);
    document.addEventListener("winabriu", escondeCtx);
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") escondeCtx(); });
  }

  function init(opts){
    walls = opts.walls;
    wall = document.getElementById("wall"); badge = document.getElementById("badge"); ctx = document.getElementById("ctx");
    WIN.init();
    relogio();
    menuContexto();
    document.getElementById("wallbtn").addEventListener("click", function(e){ e.stopPropagation(); randomWall(); });
    randomWall();
  }

  return { init: init, randomWall: randomWall };
})();
