/* ---------- Estoque: assets + blueprints pela ESI, por char ou todos juntos ---------- */
(function(){
  "use strict";
  var ATIVIDADE = { 1: "Fabricação", 3: "Pesquisa TE", 4: "Pesquisa ME", 5: "Cópia",
                    7: "Reverse Eng.", 8: "Invenção", 9: "Reação", 11: "Reação" };
  var OCULTOS = { Implant: 1, Skill: 1 };      // flags que o menu do jogo não lista

  var fmtInt = CV.fmt.int, fmt2 = CV.fmt.n2;

  /* ---------------- utilidades (comuns em calculeve.js) ---------------- */
  var el = CV.el;
  function lsGet(k){ return CV.lsGet(k, {}); }
  var lsSet = CV.lsSet;

  var esi = CV.esi, esiPaginado = CV.esiPaginado, limite = CV.limite, cacheado = CV.cacheado, sistemas = CV.sistemas;
  var tipos = CV.tipos;

  /* ---------------- dados estáticos da ESI, com cache no navegador ---------------- */
  function estacoes(ids){ return cacheado("calculeve.cache.estacoes", ids, async function(id){ var j = (await esi("/universe/stations/" + id + "/")).json; return { name: j.name, sys: j.system_id }; }); }

  var precosP = null;
  function precos(){
    if (!precosP) precosP = Mercado.precosEsi().then(function(l){
      var m = new Map(); l.forEach(function(p){ m.set(p.type_id, p.average_price || 0); }); return m;
    }).catch(function(){ precosP = null; return new Map(); });
    return precosP;
  }

  function tipoLocal(id){
    if (id >= 30000000 && id < 33000000) return "sistema";
    if (id >= 60000000 && id < 64000000) return "estacao";
    if (id >= 1000000000000) return "estrutura";
    return "outro";
  }

  /* ---------------- coleta por char ---------------- */
  async function coletaChar(c, status){
    var tk = await SSO.token(c.id);
    status("Assets de " + c.name + "…");
    var assets = await esiPaginado("/characters/" + c.id + "/assets/", tk);
    assets = assets.filter(function(a){ return !OCULTOS[a.location_flag]; });
    assets.forEach(function(a){ a.dono = c.name; a.donoId = c.id; });

    // nomes customizados (naves, containers)
    var sing = assets.filter(function(a){ return a.is_singleton; }).map(function(a){ return a.item_id; });
    var nomes = {};
    for (var i = 0; i < sing.length; i += 1000){
      try {
        (await esi("/characters/" + c.id + "/assets/names/", { token: tk, body: sing.slice(i, i + 1000) })).json
          .forEach(function(n){ if (n.name && n.name !== "None") nomes[n.item_id] = n.name; });
      } catch(e){ console.warn(e); }
    }
    assets.forEach(function(a){ if (nomes[a.item_id]) a.nome = nomes[a.item_id]; });

    var loc = null;
    try { loc = (await esi("/characters/" + c.id + "/location/", { token: tk })).json.solar_system_id; }
    catch(e){ console.warn("location de " + c.name + ": " + e.message); }

    status("Blueprints de " + c.name + "…");
    var bps = [], jobs = [], avisoBp = "";
    try { bps = await esiPaginado("/characters/" + c.id + "/blueprints/", tk); }
    catch(e){ avisoBp = e.status === 403 ? "falta o scope de blueprints" : e.message; }
    try { jobs = await esiPaginado("/characters/" + c.id + "/industry/jobs/?include_completed=false", tk); }
    catch(e){ console.warn("jobs de " + c.name + ": " + e.message); }
    bps.forEach(function(b){ b.dono = c.name; });
    var I = await CV.industria();
    jobs.forEach(function(j){ j.dono = c.name; var q = CV.qtdProduzida(I, j); if (q) j.qtdProd = q; });

    return { char: c, tk: tk, assets: assets, loc: loc, bps: bps, jobs: jobs, avisoBp: avisoBp };
  }

  /* ---------------- montagem ---------------- */
  /* árvore: item dentro de item conhecido vira filho; o resto é raiz do seu local.
     Produto de job de fabricação/reação não entregue (job.qtdProd) entra como item `emJob` no local de
     entrega do job (output_location_id): filho, se o local é um item conhecido; senão, raiz daquele local. */
  function arvore(dados){
    var assets = [].concat.apply([], dados.map(function(d){ return d.assets; }));
    var porId = new Map(); assets.forEach(function(a){ porId.set(a.item_id, a); a.filhos = []; });
    var raizes = new Map();          // location_id -> [itens]
    function poe(a, local, pai){
      if (pai) pai.filhos.push(a);
      else { if (!raizes.has(local)) raizes.set(local, []); raizes.get(local).push(a); }
    }
    assets.forEach(function(a){ poe(a, a.location_id, a.location_type === "item" ? porId.get(a.location_id) : null); });
    var emJob = [];
    dados.forEach(function(d){
      (d.jobs || []).forEach(function(j){
        if (!j.qtdProd) return;
        var a = { item_id: "job-" + j.job_id, type_id: j.product_type_id, quantity: j.qtdProd, filhos: [],
                  emJob: true, fim: j.end_date, dono: d.char.name };
        emJob.push(a); poe(a, j.output_location_id, porId.get(j.output_location_id));
      });
    });
    return { assets: assets.concat(emJob), raizes: raizes };
  }

  async function monta(dados, status){
    var T = await tipos(), P = await precos();
    var A = arvore(dados), assets = A.assets, raizes = A.raizes;

    // resolve locais
    status("Resolvendo locais…");
    var ids = Array.from(raizes.keys()), info = {};
    var est = await estacoes(ids.filter(function(id){ return tipoLocal(id) === "estacao"; }));
    var cacheEstr = lsGet("calculeve.cache.estruturas");
    await limite(ids.filter(function(id){ return tipoLocal(id) === "estrutura" && !cacheEstr[id]; }), 6, async function(id){
      for (var d of dados){
        try { var j = (await esi("/universe/structures/" + id + "/", { token: d.tk })).json;
              cacheEstr[id] = { name: j.name, sys: j.solar_system_id }; return; } catch(e){}
      }
    });
    lsSet("calculeve.cache.estruturas", cacheEstr);
    ids.forEach(function(id){
      var t = tipoLocal(id);
      if (t === "estacao" && est[id]) info[id] = est[id];
      else if (t === "estrutura" && cacheEstr[id]) info[id] = cacheEstr[id];
      else if (t === "sistema") info[id] = { name: null, sys: id };
      else info[id] = { name: (t === "estrutura" ? "Estrutura " : "Local ") + id, sys: null };
    });
    var sis = await sistemas(Array.from(new Set(ids.map(function(id){ return info[id].sys; }).filter(Boolean))));
    ids.forEach(function(id){
      var s = info[id].sys && sis[info[id].sys];
      if (s){ info[id].sec = s.sec; if (!info[id].name) info[id].name = s.name; }
    });

    // rota (só quando é um char: o Tudão não tem origem única)
    if (dados.length === 1 && dados[0].loc){
      status("Calculando rotas…");
      var o = dados[0].loc, dest = Array.from(new Set(ids.map(function(id){ return info[id].sys; }).filter(Boolean)));
      var jumps = {};
      await limite(dest, 8, async function(d){
        if (d === o){ jumps[d] = 0; return; }
        try { jumps[d] = (await esi("/route/" + o + "/" + d + "/")).json.length - 1; } catch(e){ jumps[d] = null; }
      });
      ids.forEach(function(id){ var s = info[id].sys; if (s && s in jumps) info[id].jumps = jumps[s]; });
    }

    // grupos
    var gids = new Set(); assets.forEach(function(a){ var t = T.get(a.type_id); if (t) gids.add(t.group); });
    var GI = await CV.grupos(Array.from(gids)), G = {};
    gids.forEach(function(id){ G[id] = (GI[id] || {}).n; });

    return { T: T, P: P, G: G, raizes: raizes, info: info, dados: dados };
  }

  /* ---------------- snapshot no navegador: só puxa de novo no Atualizar ---------------- */
  var CAMPOS = ["item_id", "type_id", "quantity", "location_id", "location_type", "location_flag",
                "is_singleton", "is_blueprint_copy", "nome", "dono", "donoId"];
  function chaveSnap(alvo){ return "calculeve.estoque." + alvo; }
  function salvaSnap(alvo, M){
    var precosUsados = {};
    var dados = M.dados.map(function(d){
      return { char: d.char, loc: d.loc, bps: d.bps, jobs: d.jobs, avisoBp: d.avisoBp,
               assets: d.assets.map(function(a){
                 var o = {}; CAMPOS.forEach(function(k){ if (a[k] !== undefined) o[k] = a[k]; });
                 if (M.P.has(a.type_id)) precosUsados[a.type_id] = M.P.get(a.type_id);
                 return o; }) };
    });
    var ts = Date.now();
    lsSet(chaveSnap(alvo), { ts: ts, dados: dados, info: M.info, G: M.G, precos: precosUsados });
    return ts;
  }
  async function leSnap(alvo){
    var s = CV.lsGet(chaveSnap(alvo), null);
    if (!s) return null;
    var T = await tipos(), P = new Map();
    Object.keys(s.precos || {}).forEach(function(k){ P.set(Number(k), s.precos[k]); });
    return { M: { T: T, P: P, G: s.G, raizes: arvore(s.dados).raizes, info: s.info, dados: s.dados }, ts: s.ts };
  }

  /* ---------------- render: assets ---------------- */
  function secTxt(s){ return (s == null) ? "" : (Math.round(s * 10) / 10).toFixed(1); }
  function secClasse(s){ return s == null ? "" : s >= 0.45 ? " hi" : s > 0 ? " lo" : " null"; }

  function linhaItem(M, a, nivel, tb, multi, F){
    var t = M.T.get(a.type_id) || { name: "Tipo " + a.type_id, group: 0, vol: 0 };
    var tr = el("tr", "it" + (a.filhos.length ? " pai" : "") + (a.emJob ? " emjob" : ""));
    var td = el("td", "arv"); td.style.setProperty("--nivel", nivel); td.style.setProperty("--passo", "18px");
    var tw = el("span", "tw", a.filhos.length ? "▸" : ""); td.appendChild(tw);
    td.appendChild(CV.iconeTipo(a.type_id, /Blueprint|Formula/.test(t.name) ? (a.is_blueprint_copy ? "bpc" : "bp") : "icon"));
    td.appendChild(document.createTextNode(a.nome || t.name));
    if (a.nome) td.appendChild(el("span", "sub", t.name));
    if (a.emJob) td.appendChild(el("span", "sub", "em job · termina " + CV.dataHora(a.fim)));
    tr.appendChild(td);
    tr.appendChild(el("td", "n", fmtInt.format(a.quantity)));
    tr.appendChild(el("td", null, M.G[t.group] || ""));
    tr.appendChild(el("td", "n", fmt2.format(t.vol * a.quantity) + " m³"));
    tr.appendChild(el("td", "n", Mercado.isk((M.P.get(a.type_id) || 0) * a.quantity) + " ISK"));
    if (multi) tr.appendChild(el("td", null, a.dono));
    tb.appendChild(tr);

    if (a.filhos.length){
      var filhos = F ? F.filhos(a) : a.filhos;
      expansivel(tr, td, tw, function(tb){
        ordena(M, filhos).forEach(function(f){ linhaItem(M, f, nivel + 1, tb, multi, F); });
      });
      if (F && filhos !== a.filhos) tr._abre();      // busca: abre o caminho até o que casou
    }
  }

  /* linha que abre/fecha (▸/▾) as linhas geradas por `gera(tbody)` logo abaixo dela;
     fechar também fecha, em cascata, as linhas abertas dentro dela */
  function expansivel(tr, alvo, tw, gera){
    var aberto = false, rows = [];
    function fecha(){ rows.forEach(function(r){ if (r._fecha) r._fecha(); r.remove(); }); rows = []; }
    alvo.addEventListener("click", function(){
      aberto = !aberto; tw.textContent = aberto ? "▾" : "▸";
      if (!aberto) return fecha();
      var tmp = el("tbody"); gera(tmp);
      rows = Array.from(tmp.children);
      var frag = document.createDocumentFragment(); rows.forEach(function(r){ frag.appendChild(r); });
      tr.after(frag);
    });
    tr._fecha = function(){ if (aberto){ aberto = false; tw.textContent = "▸"; fecha(); } };
    tr._abre = function(){ if (!aberto) alvo.click(); };
  }
  function ordena(M, lista){
    return lista.slice().sort(function(a, b){
      var na = a.nome || (M.T.get(a.type_id) || {}).name || "", nb = b.nome || (M.T.get(b.type_id) || {}).name || "";
      return na.localeCompare(nb);
    });
  }

  /* soma a quantidade do mesmo tipo; item com conteúdo (nave, container) e produto em job continuam separados */
  function somaTipos(itens){
    var out = [], porTipo = new Map();
    itens.forEach(function(a){
      if (a.filhos.length || a.emJob){ out.push(a); return; }
      var x = porTipo.get(a.type_id);
      if (!x){
        x = { item_id: "soma-" + a.type_id, type_id: a.type_id, quantity: 0, filhos: [],
              is_blueprint_copy: a.is_blueprint_copy, donos: [] };
        porTipo.set(a.type_id, x); out.push(x);
      }
      x.quantity += a.quantity;
      if (x.donos.indexOf(a.dono) < 0) x.donos.push(a.dono);
      x.dono = x.donos.join(", ");
    });
    return out;
  }

  /* busca no Personal Assets: item casa pelo nome (ou pelo tipo, se tiver nome próprio); fica o que casa e o
     caminho até o que casa dentro de nave/container. Item que casa mostra tudo o que tem dentro. */
  function filtroAssets(M, termo){
    function casa(a){ return CV.contem((a.nome || "") + " " + ((M.T.get(a.type_id) || {}).name || ""), termo); }
    function contem(a){ return casa(a) || a.filhos.some(contem); }
    return { contem: contem, filhos: function(a){ return casa(a) ? a.filhos : a.filhos.filter(contem); } };
  }

  function renderAssets(M, alvo, termo){
    var multi = M.dados.length > 1, F = termo ? filtroAssets(M, termo) : null;
    var tab = el("table", "as"), th = el("thead"), hr = el("tr");
    [["Nome"], ["Qtd", "n"], ["Grupo"], ["Volume", "n"], ["Preço est.", "n"]].concat(multi ? [["Char"]] : [])
      .forEach(function(c){ hr.appendChild(el("th", c[1] || null, c[0])); });
    th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody"); tab.appendChild(tb);
    var cols = multi ? 6 : 5;

    function linhaLocal(nome, inf, itens){
      var tr = el("tr", "loc"), td = el("td"); td.colSpan = cols;
      var tw = el("span", "tw", "▸"); td.appendChild(tw);
      td.appendChild(el("span", "sec" + secClasse(inf.sec), secTxt(inf.sec)));
      if (F) itens = itens.filter(F.contem);
      if (!itens.length) return;
      var txt = nome + " - " + itens.length + (itens.length === 1 ? " Item" : " Items");
      if (inf.jumps != null) txt += " - Route: " + inf.jumps + (inf.jumps === 1 ? " Jump" : " Jumps");
      td.appendChild(document.createTextNode(txt));
      tr.appendChild(td); tb.appendChild(tr);
      expansivel(tr, tr, tw, function(tb){
        ordena(M, itens).forEach(function(a){ linhaItem(M, a, 1, tb, multi, F); });
      });
      if (F) tr._abre();
    }

    /* estrutura cujo nome a ESI não devolveu (sem acesso de docagem) vai para um local só */
    function semAcesso(id){ return tipoLocal(Number(id)) === "estrutura" && !(M.info[id] || {}).sys; }
    var todos = Array.from(M.raizes.keys());
    var locs = todos.filter(function(id){ return !semAcesso(id); }).sort(function(a, b){
      var ja = M.info[a].jumps, jb = M.info[b].jumps;
      if (ja != null && jb != null && ja !== jb) return ja - jb;
      return (M.info[a].name || "").localeCompare(M.info[b].name || "");
    });
    locs.forEach(function(id){ linhaLocal(M.info[id].name || ("Local " + id), M.info[id], M.raizes.get(id)); });

    var ocultos = [].concat.apply([], todos.filter(semAcesso).map(function(id){ return M.raizes.get(id); }));
    if (ocultos.length) linhaLocal("Estruturas sem acesso de docagem", {}, somaTipos(ocultos));
    if (F && !tb.children.length){ alvo.appendChild(el("div", "status", "Nada com esse nome.")); return; }
    alvo.appendChild(tab);
  }

  /* ---------------- render: blueprints (mesmo agrupamento da planilha) ---------------- */
  function renderBps(M, alvo, termo){
    var multi = M.dados.length > 1, linhas = [];
    M.dados.forEach(function(d){
      var g = new Map();
      d.bps.forEach(function(b){
        var q = b.quantity || 1, runs = b.runs == null ? -1 : b.runs, copia = runs > 0 || q === -2;
        var k = [b.type_id, copia, b.material_efficiency || 0, b.time_efficiency || 0, copia ? runs : -1].join("|");
        g.set(k, (g.get(k) || 0) + (q > 0 ? q : 1));
      });
      g.forEach(function(qtd, k){
        var p = k.split("|");
        linhas.push({ t: Number(p[0]), qtd: qtd, tipo: p[1] === "true" ? "BPC" : "BPO", me: p[2], te: p[3],
                      runs: p[1] === "true" ? p[4] : "—", sit: "Hangar", dono: d.char.name });
      });
      d.jobs.forEach(function(j){
        if (!CV.jobAberto(j)) return;
        var fim = CV.dataHora(j.end_date);
        linhas.push({ t: j.blueprint_type_id, qtd: 1, tipo: "—", me: "—", te: "—", runs: j.runs || "—",
                      sit: (ATIVIDADE[j.activity_id] || ("Atividade " + j.activity_id)) + " até " + fim, dono: d.char.name });
      });
    });
    function nome(t){ return (M.T.get(t) || {}).name || String(t); }
    linhas.sort(function(a, b){
      return nome(a.t).localeCompare(nome(b.t)) || ((a.sit !== "Hangar") - (b.sit !== "Hangar")) ||
             a.tipo.localeCompare(b.tipo) || a.sit.localeCompare(b.sit);
    });

    var total = linhas.length;
    linhas = linhas.filter(function(l){ return CV.contem(nome(l.t), termo); });
    var avisos = M.dados.filter(function(d){ return d.avisoBp; }).map(function(d){ return d.char.name + ": " + d.avisoBp; });
    if (avisos.length) alvo.appendChild(el("div", "status", "Blueprints puladas — " + avisos.join(" · ")));
    if (!linhas.length){ alvo.appendChild(el("div", "status", total ? "Nada com esse nome." : "Nenhuma blueprint.")); return; }

    var tab = el("table", "as"), hr = el("tr");
    [["Blueprint"], ["Qtd", "n"], ["Tipo"], ["ME", "n"], ["TE", "n"], ["Runs", "n"], ["Situação"]].concat(multi ? [["Char"]] : [])
      .forEach(function(c){ hr.appendChild(el("th", c[1] || null, c[0])); });
    var th = el("thead"); th.appendChild(hr); tab.appendChild(th);
    var tb = el("tbody");
    linhas.forEach(function(l){
      var tr = el("tr"), td = el("td");
      td.appendChild(CV.iconeTipo(l.t, l.tipo === "BPC" ? "bpc" : "bp")); td.appendChild(document.createTextNode(nome(l.t))); tr.appendChild(td);
      tr.appendChild(el("td", "n", fmtInt.format(l.qtd)));
      tr.appendChild(el("td", null, l.tipo));
      tr.appendChild(el("td", "n", l.me === "—" ? "—" : l.me + "%"));
      tr.appendChild(el("td", "n", l.te === "—" ? "—" : l.te + "%"));
      tr.appendChild(el("td", "n", String(l.runs)));
      tr.appendChild(el("td", null, l.sit));
      if (multi) tr.appendChild(el("td", null, l.dono));
      tb.appendChild(tr);
    });
    tab.appendChild(tb); alvo.appendChild(tab);
  }

  /* ---------------- janelas ---------------- */
  var wEst = document.getElementById("w-estoque"), grid = document.getElementById("est-grid"),
      wAs = document.getElementById("w-assets"), body = document.getElementById("as-body"),
      titulo = document.getElementById("as-title");
  var atual = null, M = null, aba = "assets", geracao = 0;
  var termo = CV.busca(document.getElementById("as-busca"), function(){ desenhaAba(); });

  var quando = document.getElementById("as-quando");
  function marcaHora(ts){
    quando.textContent = ts ? "atualizado em " + CV.dataHora(ts) : "";
  }
  function status(msg){ CV.status(body, msg); }
  function desenhaAba(){
    document.querySelectorAll("#w-assets .tab").forEach(function(b){ b.classList.toggle("on", b.dataset.tab === aba); });
    if (!M) return;
    body.innerHTML = "";
    (aba === "assets" ? renderAssets : renderBps)(M, body, termo());
  }

  async function abreCache(){
    var g = ++geracao; M = null; marcaHora(null);
    status("Carregando…");
    var snap = await leSnap(atual);
    if (g !== geracao) return;
    if (!snap) return carrega();
    M = snap.M; marcaHora(snap.ts); desenhaAba();
  }

  async function carrega(){
    var g = ++geracao; M = null; marcaHora(null);
    var cs = atual === "tudo" ? SSO.chars() : SSO.chars().filter(function(c){ return c.id === atual; });
    if (!cs.length){ status("Nenhum personagem."); return; }
    try {
      status("Carregando dados do SDE…");
      await tipos();
      var dados = [];
      for (var c of cs){
        if (g !== geracao) return;
        try { dados.push(await coletaChar(c, function(m){ if (g === geracao) status(m); })); }
        catch(e){
          if (cs.length === 1) throw e;
          console.warn(c.name + ": " + e.message);
        }
      }
      if (!dados.length) throw new Error("nenhum char respondeu");
      // Tudão: aproveita a coleta e salva também o estoque de cada char (com a rota dele)
      if (atual === "tudo"){
        for (var d of dados){
          if (g !== geracao) return;
          var mc = await monta([d], function(x){ if (g === geracao) status(d.char.name + ": " + x); });
          salvaSnap(d.char.id, mc);
        }
      }
      var m = await monta(dados, function(x){ if (g === geracao) status(x); });
      if (g !== geracao) return;
      M = m; marcaHora(salvaSnap(atual, m)); desenhaAba();
    } catch(e){
      console.error(e);
      if (g === geracao) status("Erro: " + e.message + (e.status === 403 ? " — falta scope; reloga o char em Personagens." : ""));
    }
  }

  function abreAssets(id, nome){
    atual = id; titulo.textContent = "Estoque — " + nome;
    document.getElementById("as-busca").value = "";
    WIN.open("w-assets"); abreCache();
  }

  function desenhaGrid(){
    grid.innerHTML = "";
    var cs = SSO.chars();
    if (!cs.length){ grid.appendChild(el("div", "vazio", "Nenhum personagem — adicione em Personagens.")); return; }
    cs.forEach(function(c){
      var ic = el("button", "icon"); ic.title = c.name;
      ic.appendChild(CV.retrato(c.id)); ic.appendChild(el("span", null, c.name));
      ic.addEventListener("click", function(){ abreAssets(c.id, c.name); });
      grid.appendChild(ic);
    });
    if (cs.length > 1){
      var t = el("button", "icon"); t.title = "Todos os personagens";
      t.innerHTML = '<svg viewBox="0 0 24 24"><use href="../../assets/icons/ui.svg#camadas"/></svg>';
      t.appendChild(el("span", null, "Tudão"));
      t.addEventListener("click", function(){ abreAssets("tudo", "Tudão"); });
      grid.appendChild(t);
    }
  }

  document.getElementById("ic-estoque").addEventListener("click", function(){ desenhaGrid(); WIN.open("w-estoque"); });
  wAs.addEventListener("fechou", function(){ geracao++; });
  document.querySelectorAll("#w-assets .tab").forEach(function(b){
    b.addEventListener("click", function(){ aba = b.dataset.tab; desenhaAba(); });
  });
  document.getElementById("as-refresh").addEventListener("click", function(){ if (atual != null) carrega(); });
})();
