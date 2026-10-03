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
//   (VST, VR, PM y FC).
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
// Switch de sources: true/false para activar o desactivar cada uno sin tocar
// el resto del código.
var ENABLED_SOURCES = {
    Vids: true, // "VST"  -> vids.st    (MP4 directo)
    Videro: true, // "VR"   -> videro.my  (HLS vía API pública)
    Playmate: true, // "PM"   -> playmate.to (HLS vía POST /api/s)
    FC: true, // "FC"   -> blogspot propio del sitio (el MP4 viene en el parámetro `link`)
    // Drive (drive.google.com) y US (upns.online) no están soportados.
    // UA (unlimplay.com) descartado: agregador con anuncio previo y tokens firmados.
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
    return __awaiter(this, void 0, void 0, function () {
        var path, fetchLang, _a, es, en, titles, seen, _i, _b, d, _c, _d, t, key, base, dateStr, year;
        var _this = this;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    path = type === "movie" ? "movie" : "tv";
                    fetchLang = function (lang) { return __awaiter(_this, void 0, void 0, function () {
                        var url, resp, data, _1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 3, , 4]);
                                    url = "https://api.themoviedb.org/3/".concat(path, "/").concat(tmdbId, "?api_key=").concat(TMDB_API_KEY, "&language=").concat(lang);
                                    return [4 /*yield*/, fetch(url, { headers: { "User-Agent": UA } })];
                                case 1:
                                    resp = _a.sent();
                                    if (!resp.ok)
                                        return [2 /*return*/, null];
                                    return [4 /*yield*/, resp.json()];
                                case 2:
                                    data = _a.sent();
                                    return [2 /*return*/, data && data.success === false ? null : data];
                                case 3:
                                    _1 = _a.sent();
                                    return [2 /*return*/, null];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); };
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
    return __awaiter(this, void 0, void 0, function () {
        var resp, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(SITE_BASE).concat(path), {
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
    if (host === "vids.st" || host.endsWith(".vids.st"))
        return "Vids";
    if (host === "videro.my" || host.endsWith(".videro.my"))
        return "Videro";
    if (host === "playmate.to" || host.endsWith(".playmate.to"))
        return "Playmate";
    // FC: https://<algo>.blogspot.com/?player=fluidplayer&...&link=<mp4 codificado>
    if (host.endsWith(".blogspot.com") && /[?&]link=/.test(url))
        return "FC";
    return null;
}
// ─────────────────────────────────────────────
// Extractores
// ─────────────────────────────────────────────
/**
 * VST (https://vids.st/e/<id>)
 * 1) Se buscan en el HTML del embed todas las URLs de video (.mp4 / .m3u8), de cualquier host.
 * 2) Si no hay ninguna, se prueba la URL construida con el ID: /storage/uploads/video<id>/remote.mp4
 * 3) Cada candidata se COMPRUEBA antes de devolverla; si da 404 se descarta (asi no sale un enlace muerto en Nuvio).
 */
function vidsCollectCandidates(html, embedUrl) {
    var text = String(html || "")
        .replace(/\\u002F/gi, "/")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&");
    var re = /https?:\/\/[^"'\s<>\\()]+?\.(?:mp4|m3u8)(?:\?[^"'\s<>\\()]*)?/gi;
    var seen = {};
    var list = [];
    var m;
    while ((m = re.exec(text)) !== null) {
        var u = m[0];
        if (seen[u])
            continue;
        seen[u] = true;
        list.push(u);
    }
    var host = getHost(embedUrl);
    // Primero las del mismo host del embed (o de un subdominio), despues el resto
    list.sort(function (a, b) {
        var sa = getHost(a).indexOf(host.replace(/^www\./, "")) !== -1 ? 0 : 1;
        var sb = getHost(b).indexOf(host.replace(/^www\./, "")) !== -1 ? 0 : 1;
        return sa - sb;
    });
    return list;
}
function vidsIsPlayable(url, headers) {
    // Devuelve "ok" (2xx/206), "dead" (404/410: el archivo no existe) o "unknown" (403, 416, error de red...:
    // el servidor rechazo la prueba pero eso no demuestra que el archivo no exista)
    var h = {};
    for (var k in headers)
        h[k] = headers[k];
    h["Range"] = "bytes=0-1";
    return fetch(url, { headers: h }).then(function (r) {
        console.log("[VST] Comprobando " + url + " -> HTTP " + r.status);
        if (r.ok || r.status === 206)
            return "ok";
        if (r.status === 404 || r.status === 410)
            return "dead";
        return "unknown";
    }).catch(function (e) {
        console.warn("[VST] No se pudo comprobar " + url + ": " + e.message);
        return "unknown";
    });
}
function vidsSlug(s) {
    var out = String(s || "");
    try {
        out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    catch (_) { }
    return out.toLowerCase().replace(/['\u2019`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function extractVids(embedUrl, ctx) {
    var origin = getOrigin(embedUrl);
    var idMatch = embedUrl.match(/\/e\/([^\/?#]+)/);
    var id = idMatch ? idMatch[1] : null;
    var headers = { "Referer": origin + "/", "User-Agent": UA };
    return fetch(embedUrl, { headers: headers })
        .then(function (resp) { return resp.ok ? resp.text() : ""; })
        .catch(function (e) {
        console.warn("[VST] No se pudo leer el embed: " + e.message);
        return "";
    })
        .then(function (html) {
        // 1) URLs de video que aparezcan en el HTML
        var candidates = vidsCollectCandidates(html, embedUrl);
        // 2) vids.st guarda el archivo como /storage/uploads/video<ID>/<titulo-en-slug>-<año>.mp4
        if (id) {
            var base = origin + "/storage/uploads/video" + id + "/";
            var names = [];
            var seenName = {};
            var addName = function (t) {
                var slug = vidsSlug(t);
                if (slug && !seenName[slug]) {
                    seenName[slug] = true;
                    names.push(slug);
                }
            };
            var tm = String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
            if (tm)
                addName(tm[1].replace(/\.(mp4|mkv)$/i, ""));
            // vids.st nombra el archivo con el titulo ORIGINAL; ese va primero
            if (ctx && ctx.original)
                addName(ctx.original);
            var titles = (ctx && ctx.titles) || [];
            for (var i = 0; i < titles.length && i < 5; i++)
                addName(titles[i]);
            var year = ctx && ctx.year;
            names.forEach(function (slug) {
                if (year)
                    candidates.push(base + slug + "-" + year + ".mp4");
                candidates.push(base + slug + ".mp4");
            });
            candidates.push(base + "remote.mp4");
        }
        var seen = {};
        candidates = candidates.filter(function (u) { return seen[u] ? false : (seen[u] = true); }).slice(0, 14);
        console.log("[VST] Candidatas (" + candidates.length + "): " + candidates.slice(0, 8).join(" | "));
        // Se comprueban todas a la vez y se toma la primera valida segun el orden
        return Promise.all(candidates.map(function (u) { return vidsIsPlayable(u, headers); })).then(function (states) {
            var j;
            for (j = 0; j < candidates.length; j++)
                if (states[j] === "ok")
                    return candidates[j];
            for (j = 0; j < candidates.length; j++)
                if (states[j] === "unknown") {
                    console.warn("[VST] Ninguna candidata confirmada; uso la primera que no dio 404: " + candidates[j]);
                    return candidates[j];
                }
            return null;
        });
    })
        .then(function (url) {
        if (!url)
            throw Error("VST: ninguna URL de video respondio (404/403). Embed: " + embedUrl);
        console.log("[VST] Video: " + url);
        var isHls = /\.m3u8(\?|$)/i.test(url);
        return {
            url: url,
            headers: headers,
            type: isHls ? "hls" : "mp4"
        };
    });
}
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
                    return [4 /*yield*/, fetch("".concat(origin, "/api/videos/public/").concat(idMatch[1]), {
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
                    _i = 0, _a = ["android", "desktop"];
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 7];
                    device = _a[_i];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, fetch("".concat(origin, "/api/s"), {
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
            formatMatch = embedUrl.match(/[?&]format=([^&#]+)/);
            format = "";
            try {
                format = formatMatch ? decodeURIComponent(formatMatch[1]) : "";
            }
            catch (_) { }
            isHls = /mpegurl|m3u8/i.test(format) || /\.m3u8(\?|$)/i.test(link);
            origin = getOrigin(embedUrl);
            console.log("[FC] ".concat(isHls ? "HLS" : "MP4", ": ").concat(link));
            return [2 /*return*/, {
                    url: link,
                    headers: { "Referer": "".concat(origin, "/"), "User-Agent": UA },
                    type: isHls ? "hls" : "mp4"
                }];
        });
    });
}
var ALL_SOURCES = {
    Vids: { label: "VST", format: "MP4", extract: extractVids },
    Videro: { label: "VR", format: "HLS", extract: extractVidero },
    Playmate: { label: "PM", format: "HLS", extract: extractPlaymate },
    FC: { label: "FC", format: "MP4", extract: extractFC }
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
exports.getStreams = function (tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var info, entry, seasonNum, episodeNum, servers, order_1, results, final, e_4;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!tmdbId || !type)
                        return [2 /*return*/, []];
                    console.log("[".concat(PROVIDER_NAME, "] Buscando: TMDB ").concat(tmdbId, " (").concat(type, ") S").concat(season !== null && season !== void 0 ? season : "-", "E").concat(episode !== null && episode !== void 0 ? episode : "-"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, getTMDBTitles(tmdbId, type)];
                case 2:
                    info = _a.sent();
                    if (!info || info.titles.length === 0)
                        return [2 /*return*/, []];
                    entry = void 0;
                    if (!(type === "movie")) return [3 /*break*/, 4];
                    return [4 /*yield*/, findMovieEntry(tmdbId, info.titles, info.year)];
                case 3:
                    entry = _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    seasonNum = season ? Number(season) : 1;
                    episodeNum = episode !== undefined && episode !== null ? Number(episode) : 1;
                    return [4 /*yield*/, findEpisodeEntry(tmdbId, info.titles, seasonNum, episodeNum)];
                case 5:
                    entry = _a.sent();
                    _a.label = 6;
                case 6:
                    if (!entry) {
                        console.log("[".concat(PROVIDER_NAME, "] Sin entrada para \"").concat(info.titles[0], "\""));
                        return [2 /*return*/, []];
                    }
                    console.log("[".concat(PROVIDER_NAME, "] Entrada elegida: \"").concat(entry.title, "\""));
                    servers = parseServerLinks(entry.content)
                        .map(function (s) { return (__assign(__assign({}, s), { sourceKey: detectSource(s.url) })); })
                        .filter(function (s) { return s.sourceKey && SOURCE_EXTRACTORS[s.sourceKey]; });
                    if (servers.length === 0) {
                        console.warn("[".concat(PROVIDER_NAME, "] La entrada no tiene servidores soportados"));
                        return [2 /*return*/, []];
                    }
                    order_1 = Object.keys(SOURCE_EXTRACTORS);
                    servers.sort(function (a, b) { return order_1.indexOf(a.sourceKey) - order_1.indexOf(b.sourceKey); });
                    return [4 /*yield*/, Promise.all(servers.map(function (server) { return __awaiter(_this, void 0, void 0, function () {
                            var source, resolved, label, e_5;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        source = SOURCE_EXTRACTORS[server.sourceKey];
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, source.extract(server.url, { titles: info.titles, year: info.year, original: info.original })];
                                    case 2:
                                        resolved = _a.sent();
                                        label = "\uD83D\uDCFA ".concat(source.label, " (").concat(source.format, ")\n").concat(getQualityLabel(server.quality), " | WEB-DL\n").concat(getLangLabel(server.lang));
                                        return [2 /*return*/, __assign({ name: PROVIDER_NAME, title: "", url: resolved.url, quality: label, headers: resolved.headers }, (resolved.type ? { type: resolved.type } : {}))];
                                    case 3:
                                        e_5 = _a.sent();
                                        console.warn("[".concat(source.label, "] Fall\u00F3 resolviendo un servidor: ").concat(e_5.message));
                                        return [2 /*return*/, null];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 7:
                    results = _a.sent();
                    final = results.filter(Boolean);
                    console.log("[".concat(PROVIDER_NAME, "] \u2713 ").concat(final.length, " streams devueltos"));
                    return [2 /*return*/, final];
                case 8:
                    e_4 = _a.sent();
                    console.error("[".concat(PROVIDER_NAME, "] Error: ").concat(e_4.message));
                    return [2 /*return*/, []];
                case 9: return [2 /*return*/];
            }
        });
    });
};
