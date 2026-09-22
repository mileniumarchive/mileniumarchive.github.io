/* main.js — exclusivo da área de trabalho principal: menu iniciar, ícones, desligar. */
(function(){
  "use strict";
  Desktop.init({ walls: [
    { file: "assets/wallpapers/klee.jpg",
      badge: "<b>Klee</b> — Genshin Impact · via WallpaperCave · upload de Looby8282" },
    { file: "assets/wallpapers/herta.jpg",
      badge: "<b>The Herta</b> — Honkai: Star Rail · via WallpaperAlchemy · uploader não identificado" },
    { file: "assets/wallpapers/feixiao.jpg",
      badge: "<b>Feixiao</b> — Honkai: Star Rail · arte oficial © HoYoverse" }
  ]});

  var start = document.getElementById("start"), sbtn = document.getElementById("startbtn");

  /* ---- menu iniciar ---- */
  function toggleStart(on){
    var open = (on === undefined) ? !start.classList.contains("open") : on;
    start.classList.toggle("open", open);
    sbtn.classList.toggle("active", open);
    document.body.classList.toggle("menu-open", open);
  }
  sbtn.addEventListener("click", function(e){ e.stopPropagation(); toggleStart(); });
  start.addEventListener("click", function(e){ e.stopPropagation(); });
  document.addEventListener("click", function(){ toggleStart(false); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") toggleStart(false); });
  document.addEventListener("winabriu", function(){ toggleStart(false); });

  /* ---- ícones ---- */
  document.getElementById("ic-cred").addEventListener("click",  function(){ WIN.open("w-cred"); });
  document.getElementById("ic-about").addEventListener("click", function(){ WIN.open("w-about"); });

  /* ---- desligar ---- */
  var sd = document.getElementById("shutdown"), msg = document.getElementById("sd-msg"),
      boot = document.getElementById("boot"), spin = sd.querySelector(".spin");

  document.getElementById("power").addEventListener("click", function(e){
    e.stopPropagation();
    toggleStart(false); WIN.closeAll();
    sd.classList.add("on");
    setTimeout(function(){
      window.close();                       // só funciona em aba aberta por script
      setTimeout(function(){                // se ainda estamos aqui, o navegador barrou
        spin.classList.add("off");
        msg.textContent = "Desligado. Pode fechar a aba.";
        boot.classList.add("show");
      }, 400);
    }, 1400);
  });
  boot.addEventListener("click", function(e){
    e.stopPropagation();
    sd.classList.remove("on");
    setTimeout(function(){
      spin.classList.remove("off");
      msg.textContent = "Desligando…";
      boot.classList.remove("show");
      Desktop.randomWall();
    }, 700);
  });
})();
