/* ==========================================================================
   sso.js — login no EVE SSO (OAuth2 + PKCE, sem client secret), vários chars.

   Guarda no localStorage "calculeve.chars" = [{id, name, refresh_token}].
   O access token (20 min) fica só em memória e é renovado sozinho pelo
   refresh token, que pode rotacionar a cada renovação (o novo é salvo).

   API: SSO.login()      → manda pra tela da CCP (adiciona/atualiza um char)
        SSO.retorno()    → trata a volta do SSO (?code=&state=); chamar no load
        SSO.token(id)    → access token válido do char
        SSO.tokens()     → [{id, name, token}] de todos os chars
        SSO.chars()      → lista salva
        SSO.remove(id)   → tira o char da lista
   ========================================================================== */
var SSO = (function(){
  "use strict";
  /* Um app por callback no portal de devs da CCP: o portal aceita um só por app, e o redirect que o site
     manda é sempre o endereço da própria página. Então o que muda entre rodar local e publicado é o
     Client ID (que é público por natureza; o secret não é usado, o login é PKCE). */
  var APPS = { local: "7949c150858f4233b260e20da10ff099",        // callback http://localhost:8000/eve/calculeve/index.html
               publicado: "c6a171f7502c41ecb4e382e538b396a2" };  // callback https://mileniumarchive.github.io/eve/calculeve/index.html
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var CLIENT_ID = LOCAL ? APPS.local : APPS.publicado;
  var SCOPES = "esi-markets.structure_markets.v1 esi-search.search_structures.v1 " +
               "esi-assets.read_assets.v1 esi-planets.manage_planets.v1 " +
               "esi-characters.read_blueprints.v1 esi-industry.read_character_jobs.v1 " +
               "esi-universe.read_structures.v1 esi-skills.read_skills.v1 esi-location.read_location.v1";
  var AUTH_URL  = "https://login.eveonline.com/v2/oauth/authorize/";
  var TOKEN_URL = "https://login.eveonline.com/v2/oauth/token";
  var REDIRECT  = location.origin + location.pathname.replace(/\/$/, "/index.html");  // = callback do app no portal
  var KEY = "calculeve.chars";
  var MARGEM = 60;                    // renova 60 s antes de expirar
  var cache = {};                     // id -> {token, exp}

  var lsGet = CV.lsGet, lsSet = CV.lsSet;

  /* formato antigo (1 char só) -> lista */
  (function(){
    var velho = lsGet("calculeve.sso", null);
    if (velho && !lsGet(KEY, null)) lsSet(KEY, [velho]);
    try { localStorage.removeItem("calculeve.sso"); } catch(e){}
  })();

  function chars(){ return lsGet(KEY, []); }

  function b64url(bytes){
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function aleatorio(n){ var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  async function sha256(txt){
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)));
  }
  /* payload do JWT — só leitura de nome/ID, sem validar assinatura */
  function claims(jwt){
    var p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  }
  async function troca(corpo){
    var r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(corpo).toString()
    });
    if (!r.ok) throw new Error("SSO " + r.status);
    return r.json();
  }
  /* grava/atualiza o char dono do token, mantendo a posição na lista */
  function guarda(t){
    var c = claims(t.access_token), id = Number(c.sub.split(":")[2]);
    var ent = { id: id, name: c.name, refresh_token: t.refresh_token };
    var lista = chars(), i = lista.findIndex(function(x){ return x.id === id; });
    if (i >= 0) lista[i] = ent; else lista.push(ent);
    lsSet(KEY, lista);
    cache[id] = { token: t.access_token, exp: Date.now() / 1000 + (t.expires_in || 1200) };
    return ent;
  }

  async function login(){
    var verifier = aleatorio(32), state = aleatorio(16);
    try { sessionStorage.setItem("calculeve.pkce", JSON.stringify({ v: verifier, s: state })); } catch(e){}
    var q = new URLSearchParams({
      response_type: "code", redirect_uri: REDIRECT, client_id: CLIENT_ID, scope: SCOPES,
      code_challenge: b64url(await sha256(verifier)), code_challenge_method: "S256", state: state
    });
    location.href = AUTH_URL + "?" + q.toString();
  }

  async function retorno(){
    var q = new URLSearchParams(location.search);
    if (!q.has("code")) return null;
    var pk = null;
    try { pk = JSON.parse(sessionStorage.getItem("calculeve.pkce")); sessionStorage.removeItem("calculeve.pkce"); } catch(e){}
    history.replaceState(null, "", location.pathname);
    if (!pk || pk.s !== q.get("state")) throw new Error("state não confere");
    var t = await troca({ grant_type: "authorization_code", code: q.get("code"),
                          client_id: CLIENT_ID, code_verifier: pk.v });
    return guarda(t);
  }

  async function token(id){
    var c = cache[id];
    if (c && c.exp - MARGEM > Date.now() / 1000) return c.token;
    var e = chars().find(function(x){ return x.id === id; }); if (!e) return null;
    var t = await troca({ grant_type: "refresh_token", refresh_token: e.refresh_token, client_id: CLIENT_ID });
    guarda(t);
    return cache[id].token;
  }

  /* char com refresh falho fica de fora, com aviso no console */
  async function tokens(){
    var out = [];
    for (var e of chars()){
      try { out.push({ id: e.id, name: e.name, token: await token(e.id) }); }
      catch(err){ console.warn("char " + e.name + ": refresh falhou (" + err.message + ")"); }
    }
    return out;
  }

  function remove(id){
    lsSet(KEY, chars().filter(function(x){ return x.id !== id; }));
    delete cache[id];
  }

  return { login: login, retorno: retorno, token: token, tokens: tokens, chars: chars, remove: remove };
})();
