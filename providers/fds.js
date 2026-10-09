"use strict";
// providers/fds.js
// Provider Nuvio (sitio basado en Blogger)
//
// El sitio es un blog de Blogger: cada película es una entrada y cada
// capítulo de serie es otra entrada ("Reacher 4x8"). Los servidores de cada
// entrada están en un bloque `_SV_LINKS` dentro del HTML, y casi todos vienen
// envueltos en una URL de blogspot con el embed real en base64 (`?r=...`).
//
// Flujo:
//   TMDB -> títulos/año -> búsqueda en el feed JSON de Blogger -> entrada correcta
//   -> parsear _SV_LINKS -> decodificar el embed -> extractor por host
//   (VR, PM, FC, OK.RU, VIMEO, GS y DRIVE).
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
// Stream: { name, title, url, quality, headers?, type? }
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var PROVIDER_NAME = "fds"; // nombre visible en los logs y en la lista de streams
var SITE_BASE = atob("aHR0cHM6Ly93d3cuZnVlZ29jaW5lLmNvbQ==");
var TMDB_API_KEY = "56db0ec297530920213e1503706b81ff";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Mejoras de velocidad ─────────────────────────────────────────────
// fetchT = fetch con tiempo limite: antes una peticion colgada (TMDB, feed, embed) bloqueaba TODO hasta el limite del sistema.
// Usa el `fetch` que Nuvio le entrega al plugin (no se busca en globalThis) y NO lo sobrescribe, para funcionar igual en celular y TV.
// Temporizadores seguros: en el entorno de Nuvio de la TV `clearTimeout` NO existe ("clearTimeout is not defined") y antes
// eso hacia fallar todas las peticiones. Si falta setTimeout, simplemente no hay limite de tiempo; si falta clearTimeout, no se cancela
// (el aviso tardio es inofensivo porque cada uso comprueba si ya termino).
function _setT(fn, ms) { try { return typeof setTimeout === "function" ? setTimeout(fn, ms) : null; } catch (_) { return null; } }
function _clrT(id) { try { if (id !== null && id !== undefined && typeof clearTimeout === "function") clearTimeout(id); } catch (_) { } }
var FETCH_TIMEOUT_MS = 12000;
function fetchT(url, opts) {
    // OJO: NO se usa AbortController/`signal`. Algunos entornos de Nuvio (p. ej. el de la TV) pasan las opciones de fetch por un
    // puente nativo que no admite objetos como `signal`, y la peticion fallaba siempre. Solo se corta la ESPERA (Promise.race);
    // las opciones que llegan a fetch son exactamente las mismas que enviaba el plugin original.
    var timer;
    var limit = new Promise(function (_, reject) {
        timer = _setT(function () { reject(Error("fetch: tiempo agotado (" + FETCH_TIMEOUT_MS + " ms)")); }, FETCH_TIMEOUT_MS);
    });
    var req;
    try { req = opts === undefined ? fetch(url) : fetch(url, opts); } catch (e) { _clrT(timer); return Promise.reject(e); }
    return Promise.race([req, limit]).then(function (r) { _clrT(timer); return r; }, function (e) { _clrT(timer); throw e; });
}
// cache en memoria (10 min): reproducir el mismo titulo otra vez, o cambiar de servidor, ya no repite TMDB ni la busqueda en el feed
var CACHE_TTL_MS = 10 * 60 * 1000;
var _cache = {};
function cacheGet(key) { var c = _cache[key]; return c && (Date.now() - c.t < CACHE_TTL_MS) ? c.v : undefined; }
function cacheSet(key, v) { _cache[key] = { t: Date.now(), v: v }; return v; }

// Depuracion: en la TV no se ve la consola. Con DEBUG_STREAMS = true, si no hay ningun enlace, la lista muestra UN enlace falso
// ("DEBUG: ...") con el motivo (TMDB sin respuesta, sin entrada en el feed, servidores que fallaron...). Ponlo en false al terminar.
var DEBUG_STREAMS = false;
var _dbgReasons = [];
var _tmdbWhy = "";
function dbg(msg) { try { _dbgReasons.push(String(msg).replace(/\s+/g, " ").slice(0, 90)); } catch (_) { } }
function dbgOut(arr) {
    if (arr && arr.length) return arr;
    if (!DEBUG_STREAMS) return arr || [];
    return [{ name: PROVIDER_NAME, title: "", url: "https://debug.invalid/sin-enlaces", quality: "DEBUG 0 enlaces: " + (_dbgReasons.join(" | ") || "sin motivo registrado").slice(0, 360) }];
}
// Switch de sources: true/false para activar o desactivar cada uno sin tocar
// el resto del código.
var ENABLED_SOURCES = {
    Videro: true, // "VR"   -> videro.my  (HLS vía API pública)
    Playmate: true, // "PM"   -> playmate.to (HLS vía POST /api/s)
    FC: true, // "FC"   -> blogspot propio del sitio (el MP4 viene en el parámetro `link`)
    Okru: true, // "OK.RU" -> ok.ru. APAGADO en el addon: ok.ru ata el enlace a la IP de quien abre la pagina (srcIp=) y en Render sale la IP de Render, asi que en el celular va lento/sin iniciar. Ponlo en true en la copia que corre dentro de Nuvio.
    Drive: true, // "DRIVE" -> drive.google.com (enlace directo de descarga; NO pasa por el proxy/Render)
    Vimeos: true, // "VIMEO" -> vimeos.net (OJO: no es vimeo.com; JW Player con script empaquetado y HLS)
    GoodStream: true, // "GS" -> goodstream.one y gscdn.cam (JW Player con HLS)
    // US (upns.online) no está soportado todavia.
    // UA (unlimplay.com), AVC (avcaption.com) y VST (vids.st) se quitaron del plugin.
    // LV (loadvid.com) descartado: devuelve el m3u8 como texto tras un token CSRF.
};
// ─────────────────────────────────────────────
// Utilidades (sin depender de URL, que en React Native está incompleta)
// ─────────────────────────────────────────────
function getOrigin(url) {
    var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i);
    return m ? m[1] : "";
}
function getHost(url) {
    return getOrigin(url).replace(/^https?:\/\//i, "").toLowerCase();
}
function absolutize(origin, maybeRelative) {
    if (/^https?:\/\//i.test(maybeRelative))
        return maybeRelative;
    return origin + (maybeRelative.startsWith("/") ? "" : "/") + maybeRelative;
}
function normalizeTitle(s) {
    var out = String(s || "");
    try {
        out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    catch (_) { }
    return out
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function stripYear(title) {
    return String(title || "").replace(/\s*\(\s*\d{4}\s*\)\s*$/, "").trim();
}
function extractYear(title) {
    var m = String(title || "").match(/\(\s*(\d{4})\s*\)\s*$/);
    return m ? Number(m[1]) : undefined;
}
// ─────────────────────────────────────────────
// TMDB -> títulos de búsqueda
// ─────────────────────────────────────────────
function getTMDBTitles(tmdbId, type) {
    var ck = "tmdb:" + type + ":" + tmdbId, hit = cacheGet(ck);
    if (hit) return Promise.resolve(hit);
    return _getTMDBTitles(tmdbId, type).then(function (r) { return r ? cacheSet(ck, r) : r; });
}
function _getTMDBTitles(tmdbId, type) {
    return __awaiter(this, void 0, void 0, function () {
        var path, fetchLang, _a, es, en, titles, seen, _i, _b, d, _c, _d, t, key, base, dateStr, year;
        var _this = this;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    path = type === "movie" ? "movie" : "tv";
                    fetchLang = function (lang) {
                        // Se prueba api.themoviedb.org y, si falla (DNS/red de la TV), el alias api.tmdb.org
                        function one(host) {
                            return fetchT("https://" + host + "/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + lang, { headers: { "User-Agent": UA } })
                                .then(function (resp) {
                                if (!resp.ok) { _tmdbWhy = host + " HTTP " + resp.status; return null; }
                                return resp.json();
                            }).then(function (d) { return d && d.success === false ? null : d; })
                                .then(null, function (e) { _tmdbWhy = host + " " + String((e && e.message) || e).slice(0, 50); return null; });
                        }
                        return one("api.themoviedb.org").then(function (d) { return d || one("api.tmdb.org"); });
                    };
                    return [4 /*yield*/, Promise.all([fetchLang("es-MX"), fetchLang("en-US")])];
                case 1:
                    _a = _e.sent(), es = _a[0], en = _a[1];
                    if (!es && !en)
                        return [2 /*return*/, null];
                    titles = [];
                    seen = {};
                    for (_i = 0, _b = [es, en]; _i < _b.length; _i++) {
                        d = _b[_i];
                        if (!d)
                            continue;
                        for (_c = 0, _d = [d.title, d.name, d.original_title, d.original_name]; _c < _d.length; _c++) {
                            t = _d[_c];
                            if (!t)
                                continue;
                            key = normalizeTitle(t);
                            if (!key || seen[key])
                                continue;
                            seen[key] = true;
                            titles.push(t);
                        }
                    }
                    base = es || en;
                    dateStr = base.release_date || base.first_air_date;
                    year = dateStr ? new Date(dateStr).getFullYear() : undefined;
                    return [2 /*return*/, { titles: titles, year: year, original: (en && (en.original_title || en.original_name)) || base.original_title || base.original_name }];
            }
        });
    });
}
// ─────────────────────────────────────────────
// Feed JSON de Blogger
// ─────────────────────────────────────────────
function fetchFeed(path) {
    var hit = cacheGet("feed:" + path);
    if (hit) return Promise.resolve(hit);
    return _fetchFeed(path).then(function (r) { return cacheSet("feed:" + path, r); });
}
function _fetchFeed(path) {
    return __awaiter(this, void 0, void 0, function () {
        var resp, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetchT("".concat(SITE_BASE).concat(path), {
                        headers: { "User-Agent": UA, "Accept": "application/json" }
                    })];
                case 1:
                    resp = _a.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.json()];
                case 2:
                    data = _a.sent();
                    return [2 /*return*/, (data && data.feed && data.feed.entry) || []];
            }
        });
    });
}
function entryInfo(entry) {
    return {
        title: (entry.title && entry.title.$t) || "",
        content: (entry.content && entry.content.$t) || "",
        url: ((entry.link || []).filter(function (l) { return l.rel === "alternate"; })[0] || {}).href || "",
        categories: (entry.category || []).map(function (c) { return c.term; })
    };
}
// Algunas entradas incluyen un enlace de UnlimPlay con el ID de TMDB
// (…/movie/1204680 o …/tv/108978/4/8). Sirve para confirmar con certeza que
// la entrada encontrada es el título correcto.
function findTmdbRef(content) {
    var m = String(content).match(/unlimplay\.com\/[^"'\s]*?\/(movie|tv)\/(\d+)/);
    return m ? { type: m[1], id: m[2] } : null;
}
function searchFeed(paths) {
    return __awaiter(this, void 0, void 0, function () {
        var lists, infos, seen, _i, lists_1, list, _a, list_1, entry, info, key;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.all(paths.map(function (p) { return __awaiter(_this, void 0, void 0, function () {
                        var e_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, fetchFeed(p)];
                                case 1: return [2 /*return*/, _a.sent()];
                                case 2:
                                    e_1 = _a.sent();
                                    console.warn("[".concat(PROVIDER_NAME, "] B\u00FAsqueda fall\u00F3 (").concat(p, "): ").concat(e_1.message));
                                    return [2 /*return*/, []];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); }))];
                case 1:
                    lists = _b.sent();
                    infos = [];
                    seen = {};
                    for (_i = 0, lists_1 = lists; _i < lists_1.length; _i++) {
                        list = lists_1[_i];
                        for (_a = 0, list_1 = list; _a < list_1.length; _a++) {
                            entry = list_1[_a];
                            info = entryInfo(entry);
                            key = info.title + "|" + info.content.length;
                            if (seen[key])
                                continue;
                            seen[key] = true;
                            infos.push(info);
                        }
                    }
                    return [2 /*return*/, infos];
            }
        });
    });
}
var enc = encodeURIComponent;
function pickMovie(infos, tmdbId, titles, year) {
    var normTitles = titles.map(normalizeTitle);
    var best = null;
    for (var _i = 0, infos_1 = infos; _i < infos_1.length; _i++) {
        var info = infos_1[_i];
        if (info.categories.indexOf("Movie") === -1)
            continue;
        var score = 0;
        var ref = findTmdbRef(info.content);
        if (ref && ref.type === "movie" && String(ref.id) === String(tmdbId)) {
            score = 100;
        }
        else if (normTitles.indexOf(normalizeTitle(stripYear(info.title))) !== -1) {
            var y = extractYear(info.title);
            if (year && y)
                score = Math.abs(y - year) <= 1 ? 60 : 0;
            else
                score = 40;
        }
        if (score > 0 && (!best || score > best.score))
            best = { info: info, score: score };
    }
    return best ? best.info : null;
}
function pickEpisode(infos, tmdbId, titles, season, episode) {
    var normTitles = titles.map(normalizeTitle);
    var best = null;
    for (var _i = 0, infos_2 = infos; _i < infos_2.length; _i++) {
        var info = infos_2[_i];
        if (info.categories.indexOf("Episode") === -1)
            continue;
        var m = info.title.match(/^(.*?)\s+(\d+)x(\d+)\s*$/i);
        if (!m)
            continue;
        if (Number(m[2]) !== season || Number(m[3]) !== episode)
            continue;
        var score = 0;
        var ref = findTmdbRef(info.content);
        if (ref && ref.type === "tv" && String(ref.id) === String(tmdbId))
            score = 100;
        else if (normTitles.indexOf(normalizeTitle(m[1])) !== -1)
            score = 50;
        if (score > 0 && (!best || score > best.score))
            best = { info: info, score: score };
    }
    return best ? best.info : null;
}
function stripAccents(s) {
    try {
        return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    catch (_) {
        return String(s);
    }
}
// El buscador de Blogger distingue acentos ("pinguino" no encuentra "Pingüino"),
// así que se prueba el título tal cual y, si cambia, también sin acentos.
function buildSearchTerms(titles, max) {
    var terms = [];
    for (var _i = 0, titles_1 = titles; _i < titles_1.length; _i++) {
        var t = titles_1[_i];
        if (terms.indexOf(t) === -1)
            terms.push(t);
        var plain = stripAccents(t);
        if (plain !== t && terms.indexOf(plain) === -1)
            terms.push(plain);
    }
    return terms.slice(0, max);
}
function findMovieEntry(tmdbId, titles, year) {
    return __awaiter(this, void 0, void 0, function () {
        var paths, infos;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    paths = buildSearchTerms(titles, 4).map(function (t) { return "/feeds/posts/default?alt=json&max-results=25&q=".concat(enc(t)); });
                    return [4 /*yield*/, searchFeed(paths)];
                case 1:
                    infos = _a.sent();
                    return [2 /*return*/, pickMovie(infos, tmdbId, titles, year)];
            }
        });
    });
}
function findEpisodeEntry(tmdbId, titles, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var paths, infos, found;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    paths = buildSearchTerms(titles, 4).map(function (t) { return "/feeds/posts/default?alt=json&max-results=25&q=".concat(enc("".concat(t, " ").concat(season, "x").concat(episode))); });
                    return [4 /*yield*/, searchFeed(paths)];
                case 1:
                    infos = _a.sent();
                    found = pickEpisode(infos, tmdbId, titles, season, episode);
                    if (found)
                        return [2 /*return*/, found
                            // 2) respaldo: todos los capítulos con la etiqueta "Episode" que mencionen la serie
                        ];
                    // 2) respaldo: todos los capítulos con la etiqueta "Episode" que mencionen la serie
                    paths = buildSearchTerms(titles, 3).map(function (t) { return "/feeds/posts/default/-/Episode?alt=json&max-results=150&q=".concat(enc(t)); });
                    return [4 /*yield*/, searchFeed(paths)];
                case 2:
                    infos = _a.sent();
                    return [2 /*return*/, pickEpisode(infos, tmdbId, titles, season, episode)];
            }
        });
    });
}
// ─────────────────────────────────────────────
// Lista de servidores (_SV_LINKS)
// ─────────────────────────────────────────────
// El embed real suele venir como: https://blogfcNN.blogspot.com/?m=1.html?r=<base64>
function decodeEmbedUrl(rawUrl) {
    if (!rawUrl)
        return "";
    var m = rawUrl.match(/[?&]r=([^&#]+)/);
    if (m) {
        try {
            var b64 = decodeURIComponent(m[1]).replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4)
                b64 += "=";
            var decoded = atob(b64);
            if (/^https?:\/\//i.test(decoded))
                return decoded;
            if (/^\/\/[^\/]/.test(decoded))
                return "https:" + decoded; // GS: //gscdn.cam/video/embed/<id>
        }
        catch (_) { }
    }
    return rawUrl;
}
function parseServerLinks(content) {
    var start = content.indexOf("_SV_LINKS");
    if (start === -1)
        return [];
    var block = content.slice(start);
    var end = block.indexOf("</script>");
    if (end > 0)
        block = block.slice(0, end);
    var servers = [];
    var chunks = block.match(/\{[^{}]*\}/g) || [];
    var _loop_1 = function (chunk) {
        var get = function (key) {
            var m = chunk.match(new RegExp(key + "\\s*:\\s*([\"'])([\\s\\S]*?)\\1"));
            return m ? m[2].trim() : "";
        };
        var url = decodeEmbedUrl(get("url"));
        if (/^\/\/[^\/]/.test(url))
            url = "https:" + url; // OK.RU viene como //ok.ru/videoembed/<id>
        if (!url)
            return "continue"; // algunos servidores vienen vacíos
        servers.push({ lang: get("lang"), name: get("name"), quality: get("quality"), url: url });
    };
    for (var _i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
        var chunk = chunks_1[_i];
        _loop_1(chunk);
    }
    return servers;
}
function detectSource(url) {
    var host = getHost(url);
    if (host === "videro.my" || host.endsWith(".videro.my"))
        return "Videro";
    if (host === "playmate.to" || host.endsWith(".playmate.to"))
        return "Playmate";
    // Google Drive (drive.google.com / docs.google.com / drive.usercontent.google.com)
    if (driveId(url))
        return "Drive";
    // FC: https://<algo>.blogspot.com/?player=fluidplayer&...&link=<mp4 codificado>
    if (host.endsWith(".blogspot.com") && /[?&]link=/.test(url))
        return "FC";
    if (host === "vimeos.net" || host.endsWith(".vimeos.net"))
        return "Vimeos";
    if (host === "goodstream.one" || host.endsWith(".goodstream.one") || host === "gscdn.cam" || host.endsWith(".gscdn.cam"))
        return "GoodStream";
    if (host === "ok.ru" || host.endsWith(".ok.ru") || host === "odnoklassniki.ru" || host.endsWith(".odnoklassniki.ru"))
        return "Okru";
    return null;
}
// ─────────────────────────────────────────────
// Extractores
// ─────────────────────────────────────────────
/**
 * VR (https://videro.my/e/<id>)
 * API pública: GET /api/videos/public/<id> -> { hls_url: "/hls/<hash>/index.m3u8", ... }
 */
function extractVidero(embedUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var origin, idMatch, resp, data, url;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    origin = getOrigin(embedUrl);
                    idMatch = embedUrl.match(/\/e\/([^\/?#]+)/);
                    if (!origin || !idMatch)
                        throw Error("VR: URL de embed inválida");
                    return [4 /*yield*/, fetchT("".concat(origin, "/api/videos/public/").concat(idMatch[1]), {
                            headers: { "User-Agent": UA, "Referer": embedUrl, "Accept": "application/json" }
                        })];
                case 1:
                    resp = _a.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.json()];
                case 2:
                    data = _a.sent();
                    if (data.status && data.status !== "ready")
                        throw Error("VR: video no listo (".concat(data.status, ")"));
                    if (!data.hls_url)
                        throw Error("VR: la API no devolvió hls_url");
                    url = absolutize(origin, data.hls_url);
                    console.log("[VR] HLS: ".concat(url));
                    return [2 /*return*/, {
                            url: url,
                            headers: { "Referer": "".concat(origin, "/"), "User-Agent": UA },
                            type: "hls"
                        }];
            }
        });
    });
}
/**
 * PM (https://playmate.to/embed/<id>)
 * El reproductor hace POST /api/s con {c: <id>, d: <dispositivo>} y la
 * respuesta trae el HLS en `sx`. Los textos exactos del campo `d` están
 * ofuscados en player-core.min.js, por eso se prueban varios.
 */
function extractPlaymate(embedUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var origin, id, lastError, _i, _a, device, resp, data, sx, url, e_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    origin = getOrigin(embedUrl);
                    id = embedUrl.split(/[?#]/)[0].split("/").filter(Boolean).pop();
                    if (!origin || !id)
                        throw Error("PM: URL de embed inválida");
                    lastError = "sin respuesta";
                    _i = 0, _a = ["web", "android", "desktop"];
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 7];
                    device = _a[_i];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, fetchT("".concat(origin, "/api/s"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "User-Agent": UA,
                                "Referer": embedUrl,
                                "Origin": origin
                            },
                            body: JSON.stringify({ c: id, d: device })
                        })];
                case 3:
                    resp = _b.sent();
                    if (!resp.ok) {
                        lastError = "HTTP ".concat(resp.status, " (d=").concat(device, ")");
                        return [3 /*break*/, 6];
                    }
                    return [4 /*yield*/, resp.json()];
                case 4:
                    data = _b.sent();
                    sx = typeof data.sx === "string" ? data.sx : (data.sx && data.sx.url);
                    if (!sx) {
                        lastError = "sin sx (d=".concat(device, ")");
                        return [3 /*break*/, 6];
                    }
                    url = absolutize(origin, sx);
                    console.log("[PM] HLS (d=".concat(device, "): ").concat(url));
                    return [2 /*return*/, {
                            url: url,
                            headers: { "Referer": "".concat(origin, "/"), "Origin": origin, "User-Agent": UA },
                            type: "hls"
                        }];
                case 5:
                    e_3 = _b.sent();
                    lastError = "".concat(e_3.message, " (d=").concat(device, ")");
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 1];
                case 7: throw Error("PM: ".concat(lastError));
            }
        });
    });
}
// ─────────────────────────────────────────────
// Google Drive
// ─────────────────────────────────────────────
// Devuelve el ID de archivo de una URL de Drive (o "" si no es de Drive).
//   https://drive.google.com/file/d/<ID>/preview | /view
//   https://drive.google.com/open?id=<ID>   |   .../uc?id=<ID>&export=download
//   https://docs.google.com/file/d/<ID>/preview
function driveId(url) {
    var host = getHost(url);
    if (!(host === "drive.google.com" || host === "docs.google.com" || host === "drive.usercontent.google.com"))
        return "";
    var m = String(url).match(/\/file\/d\/([\w-]{10,})/) || String(url).match(/[?&]id=([\w-]{10,})/);
    return m ? m[1] : "";
}
/**
 * DRIVE: no usa proxy. Se devuelve la URL directa de descarga de Google y es el
 * REPRODUCTOR (Nuvio) quien la pide a Google, asi que no gasta ancho de banda de
 * Render. Aqui solo se hace una peticion de 1 byte (Range) para comprobar que el
 * archivo existe; si la comprobacion falla por otra razon (Render es una IP de
 * datacenter y Google a veces la trata distinto al celular) NO se descarta el enlace.
 */
function extractDrive(embedUrl) {
    var id = driveId(embedUrl);
    if (!id)
        return Promise.reject(Error("DRIVE: no se encontro el ID del archivo en " + embedUrl));
    // confirm=t salta el aviso de "no se puede analizar si hay virus" de los archivos grandes
    var direct = "https://drive.usercontent.google.com/download?id=" + id + "&export=download&confirm=t";
    var note = "";
    var format = "MP4";
    return fetchT(direct, { method: "GET", headers: { "User-Agent": UA, "Range": "bytes=0-0" } })
        .then(function (r) {
        var ct = "";
        var cd = "";
        try {
            ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
            cd = (r.headers && r.headers.get && r.headers.get("content-disposition")) || "";
        }
        catch (_) { }
        try {
            if (r.body && r.body.cancel)
                r.body.cancel();
        }
        catch (_) { }
        if (r.status === 404)
            throw Error("DRIVE: el archivo no existe (404)");
        var ext = cd.match(/filename\*?=(?:UTF-8'')?"?[^";]*\.(mp4|mkv|webm|avi|mov)/i);
        if (ext)
            format = ext[1].toUpperCase();
        if (/text\/html/i.test(ct))
            throw Error("DRIVE: Drive respondio una pagina (cuota/privado?)");
        console.log("[DRIVE] " + id + " -> " + r.status + " " + ct.split(";")[0] + " " + format);
        return { url: direct, headers: { "User-Agent": UA }, format: format, note: note };
    }, function (e) {
        // Sin red hacia Google desde aqui: se entrega igual, lo abrira el reproductor
        console.warn("[DRIVE] No se pudo comprobar (" + e.message + "); se devuelve el enlace igualmente");
        return { url: direct, headers: { "User-Agent": UA }, format: format, note: note };
    });
}

/**
 * FC (https://<algo>.blogspot.com/?player=fluidplayer&provider=rand&format=video%2Fmp4&link=<url>)
 * No hace falta abrir nada: la URL directa del video ya viene codificada en el
 * parámetro `link`, y `format` indica si es MP4 o HLS.
 */
function extractFC(embedUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var linkMatch, link, formatMatch, format, isHls, origin;
        return __generator(this, function (_a) {
            linkMatch = embedUrl.match(/[?&]link=([^&#]+)/);
            if (!linkMatch)
                throw Error("FC: la URL no trae el parámetro link");
            try {
                link = decodeURIComponent(linkMatch[1]);
            }
            catch (e) {
                throw Error("FC: no se pudo decodificar link (".concat(e.message, ")"));
            }
            if (!/^https?:\/\//i.test(link))
                throw Error("FC: link no es una URL http(s)");
            if (driveId(link))
                return [2 /*return*/, extractDrive(link)];
            formatMatch = embedUrl.match(/[?&]format=([^&#]+)/);
            format = "";
            try {
                format = formatMatch ? decodeURIComponent(formatMatch[1]) : "";
            }
            catch (_) { }
            isHls = /mpegurl|m3u8/i.test(format) || /\.m3u8(\?|$)/i.test(link);
            origin = getOrigin(embedUrl);
            console.log("[FC] ".concat(isHls ? "HLS" : "MP4", ": ").concat(link));
            // Igual que el plugin de Kino: el destino DEBE terminar en extension de video (.mp4 .m4v .webm .mkv) o ser HLS.
            // Si no, el enlace se descarta y Nuvio pasa al siguiente servidor.
            var fcHasExt = isHls || /\.(mp4|m4v|webm|mkv)(\?|#|$)/i.test(link);
            if (!fcHasExt)
                throw Error("FC: el enlace no termina en formato de video (" + link.slice(0, 80) + ")");
            var fcHeaders = { "Referer": "".concat(origin, "/"), "User-Agent": UA };
            var fcOut = { url: link, headers: fcHeaders, type: isHls ? "hls" : "mp4" };
            // Comprobacion rapida (1-2 bytes): si esta claramente muerto (404/410/5xx o una pagina HTML) se descarta.
            // Un fallo de red o lentitud NO lo descarta.
            return [2 /*return*/, fetchT(link, { headers: __assign(__assign({}, fcHeaders), { "Range": "bytes=0-1" }) }).then(function (r) {
                    var ct = "";
                    try { ct = String((r.headers && r.headers.get && r.headers.get("content-type")) || ""); } catch (_) { }
                    try { if (r.body && r.body.cancel) r.body.cancel(); } catch (_) { }
                    console.log("[FC] comprobacion: " + r.status + " " + ct.split(";")[0]);
                    if (r.status === 404 || r.status === 410 || r.status >= 500)
                        throw Error("FC: el servidor respondió " + r.status);
                    if (/text\/html|application\/json/i.test(ct))
                        throw Error("FC: respondió una página, no un video");
                    return fcOut;
                }, function (e) {
                    console.warn("[FC] no se pudo comprobar (" + e.message + "); se ofrece igualmente");
                    return fcOut;
                })];
        });
    });
}
// OK.RU (https://ok.ru/videoembed/<id>): el atributo data-options trae un JSON con "metadata" (otro JSON en texto)
// con hlsManifestUrl y videos[]. Portado de pelisgo.js (funciona): mismo parseo, mismo UA movil y mismas cabeceras de reproduccion.
var OK_UA = "Mozilla/5.0 (Linux; Android 13; moto g82 5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36"; // mismo UA que usa pelisgo.js
var OK_RES = { mobile: "144p", lowest: "240p", low: "360p", sd: "480p", hd: "720p", full: "1080p", quad: "1440p (2K)", ultra: "2160p (4K)" }; // nombre que da ok.ru -> resolucion
var OK_QUALITY = ["mobile", "lowest", "low", "sd", "hd", "full", "quad", "ultra"];
function okDecode(s) {
    return String(s || "").replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function parseOkru(html) {
    var m = /data-options=(["'])([\s\S]*?)\1/.exec(html);
    var meta = null;
    if (m) {
        try {
            var opts = JSON.parse(okDecode(m[2]));
            var raw = opts && opts.flashvars && opts.flashvars.metadata;
            meta = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
        catch (e) { /* se prueba con regex */ }
    }
    var out = [];
    if (meta) {
        var hls = meta.hlsManifestUrl || meta.hlsMasterPlaylistUrl || meta.ondemandHls;
        var vids = (meta.videos || []).filter(function (v) { return v && v.url; });
        vids.sort(function (a, b) { return OK_QUALITY.indexOf(b.name) - OK_QUALITY.indexOf(a.name); });
        function okMp4(v) { return { url: v.url, format: "MP4", quality: OK_RES[v.name] || String(v.name) }; }
        if (vids[0])
            out.push(okMp4(vids[0]));
        // Si la mejor es mayor a 1080p, se ofrece tambien la de 1080p (menos datos)
        var full = vids.filter(function (v) { return v.name === "full"; })[0];
        if (vids[0] && full && vids[0] !== full)
            out.push(okMp4(full));
        // El HLS "Auto" arranca en una calidad baja y sube despues: va DESPUES de los MP4 (calidad fija y mas alta),
        // asi el autoreproducir elige primero el MP4 de mejor calidad.
        if (hls)
            out.push({ url: hls, type: "hls", format: "HLS", quality: "Auto (HLS)" });
        return out;
    }
    var txt = okDecode(html).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    var hm = /"hlsManifestUrl"\s*:\s*"([^"]+)"/.exec(txt) || /"ondemandHls"\s*:\s*"([^"]+)"/.exec(txt);
    if (hm)
        out.push({ url: hm[1], type: "hls", format: "HLS", quality: "Auto (HLS)" });
    return out;
}
function extractOkru(embedUrl) {
    if (embedUrl.indexOf("//") === 0)
        embedUrl = "https:" + embedUrl;
    return fetchT(embedUrl, { headers: { "User-Agent": OK_UA, "Referer": SITE_BASE + "/" } })
        .then(function (r) {
        if (!r.ok)
            throw Error("OK.RU: HTTP " + r.status);
        return r.text();
    }).then(function (html) {
        var streams = parseOkru(html);
        if (!streams.length)
            throw Error("OK.RU: no se encontro el video (" + html.length + " bytes, data-options=" + (/data-options=/.test(html) ? "si" : "no") + ")");
        console.log("[OK.RU] " + streams.map(function (v) { return v.format + " " + v.quality; }).join(", "));
        return streams.map(function (v) {
            var o = { url: v.url, headers: { "Referer": "https://ok.ru/", "User-Agent": OK_UA }, format: v.format, quality: v.quality };
            if (v.type)
                o.type = v.type; // solo HLS lleva type, igual que en pelisgo.js
            return o;
        });
    });
}
/**
 * Reproductores JW Player del tipo XFileSharing: VIMEO (vimeos.net) y GS (goodstream.one, gscdn.cam).
 * La pagina del embed trae jwplayer(...).setup({ sources: [{file: "https://.../master.m3u8?t=..."}] }).
 * En vimeos.net ese script viene empaquetado (eval(function(p,a,c,k,e,d){...})), asi que primero se desempaqueta.
 * El HLS lleva un token firmado en la URL, por eso se pide en el momento y se devuelve tal cual.
 */
function jwPackEnc(c, a) {
    return (c < a ? "" : jwPackEnc(parseInt(c / a, 10), a)) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
}
// Dean Edwards packer: eval(function(p,a,c,k,e,d){...}('payload',radix,count,'dic|cio'.split('|')))
function jwUnpack(src) {
    var m = /\}\(\s*(['"])((?:\\[\s\S]|(?!\1)[^\\])*)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\[\s\S]|(?!\5)[^\\])*)\5\s*\.split\(\s*['"]\|['"]\s*\)/.exec(src);
    if (!m)
        return null;
    var p = m[2].replace(/\\(['"\\\/])/g, "$1");
    var radix = parseInt(m[3], 10), count = parseInt(m[4], 10), dict = m[6].split("|");
    var map = {};
    for (var c = count - 1; c >= 0; c--) {
        var key = jwPackEnc(c, radix);
        map[key] = dict[c] || key;
    }
    return p.replace(/\b\w+\b/g, function (w) { return Object.prototype.hasOwnProperty.call(map, w) ? map[w] : w; });
}
function jwTexts(html) {
    var texts = [html];
    var re = /eval\(function\(p,a,c,k,e,[a-z]\)[\s\S]*?\.split\(\s*['"]\|['"]\s*\)[^\n]*?\)\)/g, m;
    while ((m = re.exec(html)) !== null) {
        try {
            var u = jwUnpack(m[0]);
            if (u)
                texts.unshift(u);
        }
        catch (_) { }
    }
    return texts;
}
// URLs de video del setup de JW Player: file:"..." (m3u8 primero, luego mp4)
function jwFindFiles(texts) {
    var out = [];
    var seen = {};
    for (var i = 0; i < texts.length; i++) {
        var t = String(texts[i]).replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
        var re = /["']?file["']?\s*:\s*["'](https?:\/\/[^"'\s]+?\.(?:m3u8|mp4)(?:\?[^"'\s]*)?)["']/gi, m;
        while ((m = re.exec(t)) !== null) {
            if (!seen[m[1]]) {
                seen[m[1]] = true;
                out.push(m[1]);
            }
        }
        if (!out.length) {
            var re2 = /https?:\/\/[^"'\s<>\\]+?\.m3u8(?:\?[^"'\s<>\\]*)?/gi;
            while ((m = re2.exec(t)) !== null) {
                if (!seen[m[0]]) {
                    seen[m[0]] = true;
                    out.push(m[0]);
                }
            }
        }
    }
    out.sort(function (a, b) { return (/\.m3u8/.test(a) ? 0 : 1) - (/\.m3u8/.test(b) ? 0 : 1); });
    return out;
}
/**
 * VIMEO y GS (embeds con JW Player): se lee la pagina del embed, se saca la URL del .m3u8 y se entrega con las cabeceras
 * Referer/Origin del propio embed. Ya NO se "verifica" el HLS (lista -> variante -> fragmento con varias combinaciones de
 * cabeceras y User-Agent): eso eran hasta ~20 peticiones por servidor y era lo que mas hacia tardar la lista.
 */
var JW_BASE = { "Accept": "*/*", "Accept-Language": "es-419,es;q=0.9" };
function jwHeaders(extra) {
    var h = {};
    for (var k in JW_BASE)
        h[k] = JW_BASE[k];
    for (var k2 in extra)
        h[k2] = extra[k2];
    return h;
}
function extractJw(embedUrl, tag) {
    var origin = getOrigin(embedUrl);
    if (!origin)
        return Promise.reject(Error(tag + ": URL de embed inválida"));
    var uas = [{ ua: UA, label: "" }, { ua: OK_UA, label: "m" }];
    function attempt(i) {
        var ua = uas[i].ua;
        return fetchT(embedUrl, { headers: { "User-Agent": ua, "Referer": SITE_BASE + "/", "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "es-419,es;q=0.9" } }).then(function (resp) {
            return resp.text().then(function (html) {
                var files = jwFindFiles(jwTexts(html));
                if (!files.length)
                    throw Error(tag + ": no se encontró el video (" + (i ? "movil " : "") + "HTTP " + resp.status + ", " + html.length + " bytes)");
                var url = files[0];
                var headers = { "Referer": origin + "/", "Origin": origin, "User-Agent": ua };
                if (!/\.m3u8/i.test(url))
                    return { url: url, headers: headers };
                console.log("[" + tag + "] HLS: " + url);
                return { url: url, headers: jwHeaders(headers), type: "hls" };
            });
        });
    }
    // Si la pagina con User-Agent de escritorio no dio el video, se prueba una vez como navegador movil antes de rendirse
    return attempt(0).then(null, function (e) {
        return attempt(1).then(null, function (e2) { throw Error(e.message + " | " + e2.message); });
    });
}
function extractVimeos(embedUrl) { return extractJw(embedUrl, "VIMEO"); }
function extractGoodStream(embedUrl) { return extractJw(embedUrl, "GS"); }
/**
 * Limite de tiempo por servidor: la lista de streams se devuelve cuando TODOS los extractores terminan, asi que un servidor
 * lento o bloqueado (p. ej. GS detras de Cloudflare) retrasaba tambien a los demas (OK.RU "tardaba en conectar").
 * Con el limite, el que no responde se descarta y el resto sale a tiempo. Tambien deja en el log cuanto tardo cada uno.
 */
var SOURCE_TIMEOUT_MS = 12000;
function runSource(source, url, ctx) {
    var t0 = Date.now();
    var timer;
    var limit = new Promise(function (_, reject) {
        timer = _setT(function () { reject(Error("tiempo agotado (" + SOURCE_TIMEOUT_MS + " ms)")); }, SOURCE_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve().then(function () { return source.extract(url, ctx); }), limit]).then(function (r) {
        _clrT(timer);
        console.log("[" + source.label + "] OK en " + (Date.now() - t0) + " ms");
        return r;
    }, function (e) {
        _clrT(timer);
        console.warn("[" + source.label + "] fallo en " + (Date.now() - t0) + " ms: " + e.message);
        throw e;
    });
}
var ALL_SOURCES = {
    Videro: { label: "VR", format: "HLS", extract: extractVidero },
    Playmate: { label: "PM", format: "HLS", extract: extractPlaymate },
    FC: { label: "FC", format: "MP4", extract: extractFC },
    Okru: { label: "OK.RU", format: "MP4/HLS", extract: extractOkru },
    Vimeos: { label: "VIMEO", format: "HLS", extract: extractVimeos },
    GoodStream: { label: "GS", format: "HLS", extract: extractGoodStream },
    Drive: { label: "DRIVE", format: "MP4", extract: extractDrive }
};
// El orden de este objeto define el orden de salida de los streams.
var SOURCE_EXTRACTORS = {};
for (var _i = 0, _a = Object.entries(ALL_SOURCES); _i < _a.length; _i++) {
    var _b = _a[_i], key = _b[0], source = _b[1];
    if (ENABLED_SOURCES[key])
        SOURCE_EXTRACTORS[key] = source;
}
// ─────────────────────────────────────────────
// Etiquetas
// ─────────────────────────────────────────────
function getLangLabel(lang) {
    var l = String(lang || "").toLowerCase();
    if (l === "lat" || l === "latino" || l === "")
        return "🇲🇽 LATINO";
    if (l === "esp" || l === "es" || l === "cast" || l === "cas")
        return "🇪🇸 CASTELLANO";
    if (l === "sub" || l === "en" || l === "jp")
        return "🌐 SUBTITULADO";
    return "\uD83C\uDF10 ".concat(l.toUpperCase());
}
function getQualityLabel(q) {
    var m = String(q || "").match(/(\d{3,4})p/);
    return m ? "".concat(m[1], "p") : (q || "HD");
}
// ─────────────────────────────────────────────
// Entry point — contrato Nuvio
// ─────────────────────────────────────────────
/**
 * @param {string|number} tmdbId
 * @param {string} type - "movie" | "tv"
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @returns {Promise<Array>}
 */
// Texto que ve el usuario en cada enlace: servidor y formato, calidad REAL si el extractor la conoce (OK.RU),
// idioma, y de donde sale (pagina de la entrada y embed del servidor).
function __buildLabel(source, server, rv, pageUrl) {
    var label = "\uD83D\uDCFA " + source.label + " (" + (rv.format || source.format) + ")\n" +
        (rv.quality || getQualityLabel(server.quality)) + " | WEB-DL\n" + getLangLabel(server.lang);
    if (pageUrl)
        label += "\n\uD83D\uDD17 " + pageUrl;
    if (server.url)
        label += "\n\u25B6 " + (server.url.length > 110 ? server.url.slice(0, 110) + "\u2026" : server.url);
    return label;
}
// Modo directo del addon (catalogo FuegoCine): "entry:<idPost>" lee esa entrada del feed y resuelve sus servidores, sin pasar por TMDB.
/**
 * Antes se esperaba a que TERMINARAN todos los servidores (Promise.all): un solo servidor lento retrasaba la lista entera.
 * Ahora se devuelve en cuanto pasa EARLY_GRACE_MS desde que llego el primer enlace bueno (para dar chance a que
 * lleguen un par mas), o cuando terminan todos, o al llegar a HARD_LIMIT_MS. El orden de salida sigue siendo el de
 * ALL_SOURCES, no el de llegada.
 */
var EARLY_GRACE_MS = 2000;
var HARD_LIMIT_MS = 15000;
function gatherStreams(servers, ctx, pageUrl) {
    return new Promise(function (resolve) {
        var total = servers.length, done = 0, results = [], finished = false, grace = null, hard = null;
        function finish() {
            if (finished) return;
            finished = true;
            _clrT(grace);
            _clrT(hard);
            var out = [];
            for (var k = 0; k < total; k++) if (results[k]) out = out.concat(results[k]);
            console.log("[" + PROVIDER_NAME + "] \u2713 " + out.length + " streams devueltos (" + done + "/" + total + " servidores respondieron)");
            resolve(out);
        }
        if (!total) return resolve([]);
        hard = _setT(finish, HARD_LIMIT_MS);
        servers.forEach(function (server, i) {
            var source = SOURCE_EXTRACTORS[server.sourceKey];
            runSource(source, server.url, ctx).then(function (resolved) {
                results[i] = (Array.isArray(resolved) ? resolved : [resolved]).map(function (rv) {
                    var label = __buildLabel(source, server, rv, pageUrl);
                    return __assign({ name: PROVIDER_NAME, title: "", url: rv.url, quality: label, headers: rv.headers }, (rv.type ? { type: rv.type } : {}));
                });
            }, function (e) { results[i] = null; dbg(source.label + ": " + ((e && e.message) || e)); }).then(function () {
                done++;
                if (done >= total) return finish();
                if (results[i] && results[i].length && !grace) grace = _setT(finish, EARLY_GRACE_MS);
            });
        });
    });
}
function __serversOf(info) {
    var servers = parseServerLinks(info.content)
        .map(function (s) { return __assign(__assign({}, s), { sourceKey: detectSource(s.url) }); })
        .filter(function (s) { return s.sourceKey && SOURCE_EXTRACTORS[s.sourceKey]; });
    var order = Object.keys(SOURCE_EXTRACTORS);
    servers.sort(function (a, b) { return order.indexOf(a.sourceKey) - order.indexOf(b.sourceKey); });
    return servers;
}
function __directEntry(postId) {
    return fetchT(SITE_BASE + "/feeds/posts/default/" + postId + "?alt=json", { headers: { "User-Agent": UA, "Accept": "application/json" } })
        .then(function (r) { if (!r.ok) throw Error("HTTP error! Status: " + r.status); return r.json(); })
        .then(function (d) {
        var e = d && d.entry;
        if (!e) return [];
        var info = entryInfo(e);
        var servers = __serversOf(info);
        if (!servers.length) return [];
        return gatherStreams(servers, { titles: [stripYear(info.title)], year: extractYear(info.title), original: undefined }, info.url);
    }).catch(function () { return []; });
}
exports.getStreams = function (tmdbId, type, season, episode) {
    _dbgReasons = [];
    _tmdbWhy = "";
    var __pd = /^entry:(\d+)$/.exec(String(tmdbId));
    var run = __pd ? __directEntry(__pd[1]) : __getStreamsTmdb(tmdbId, type, season, episode);
    return run.then(dbgOut, function (e) { dbg("error: " + (e && e.message)); return dbgOut([]); });
};
function __getStreamsTmdb(tmdbId, type, season, episode) {
    if (!tmdbId || !type) return Promise.resolve([]);
    console.log("[" + PROVIDER_NAME + "] Buscando: TMDB " + tmdbId + " (" + type + ") S" + (season != null ? season : "-") + "E" + (episode != null ? episode : "-"));
    return getTMDBTitles(tmdbId, type).then(function (info) {
        if (!info || !info.titles.length) { dbg("TMDB " + tmdbId + " (" + type + ") sin datos: " + (_tmdbWhy || "no existe")); return []; }
        dbg("TMDB ok: " + info.titles[0] + (info.year ? " (" + info.year + ")" : ""));
        var finder = type === "movie"
            ? findMovieEntry(tmdbId, info.titles, info.year)
            : findEpisodeEntry(tmdbId, info.titles, season ? Number(season) : 1, episode !== undefined && episode !== null ? Number(episode) : 1);
        return finder.then(function (entry) {
            if (!entry) { console.log("[" + PROVIDER_NAME + "] Sin entrada para \"" + info.titles[0] + "\""); dbg("el sitio no tiene entrada para \"" + info.titles[0] + "\""); return []; }
            console.log("[" + PROVIDER_NAME + "] Entrada elegida: \"" + entry.title + "\"");
            var servers = __serversOf(entry);
            if (!servers.length) { console.warn("[" + PROVIDER_NAME + "] La entrada no tiene servidores soportados"); dbg("entrada sin servidores soportados"); return []; }
            return gatherStreams(servers, { titles: info.titles, year: info.year, original: info.original }, entry.url);
        });
    }).catch(function (e) {
        console.error("[" + PROVIDER_NAME + "] Error: " + e.message);
        dbg("error: " + e.message);
        return [];
    });
}
