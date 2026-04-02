// ==UserScript==
// @name         AI-generated Warning
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  When an AI-generated tag is detected on artwork pages of image sites like Pixiv, Sankaku, e-hentai, etc..., display a prominent alert in the lower-left corner.
// @author       OozoraAhiru
// @match        https://www.pixiv.net/*/artworks/*
// @match        https://www.pixiv.net/artworks/*
// @match        https://www.sankakucomplex.com/posts/*
// @match        https://e-hentai.org/g/*/*
// @match        https://exhentai.org/g/*/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      sankakuapi.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const _win = unsafeWindow;

    const AI_KEYWORDS = [
        'ai-generated', 'ai generated', 'ai_generated',
        'ai-created',   'ai created',   'ai_created',
        'ai art', 'ai artwork', 'ai image',
        'ai+ps',
        'novelai', 'stable diffusion', 'stablediffusion',
        'midjourney', 'dall-e', 'dalle',
    ];

    function isAIText(text) {
        const t = (text || '').toLowerCase();
        return AI_KEYWORDS.some(kw => t.includes(kw));
    }

    // ── Styles ────────────────────────────────────────────────────
    let styleInjected = false;
    function injectStyle() {
        if (styleInjected) return;
        styleInjected = true;
        const s = document.createElement('style');
        s.textContent = `
            #aiw-banner {
                position: fixed;
                bottom: 24px; left: 24px;
                z-index: 2147483647;
                display: flex; align-items: center; gap: 12px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 2px solid #e94560;
                border-radius: 14px;
                padding: 14px 18px;
                box-shadow: 0 0 24px rgba(233,69,96,0.5), 0 4px 20px rgba(0,0,0,0.4);
                animation: aiw-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
                font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
                max-width: 300px;
            }
            @keyframes aiw-in {
                from { opacity:0; transform:translateX(-60px) scale(0.9); }
                to   { opacity:1; transform:translateX(0) scale(1); }
            }
            #aiw-banner .aiw-icon {
                font-size: 28px; line-height: 1;
                filter: drop-shadow(0 0 6px rgba(233,69,96,0.8));
                animation: aiw-pulse 2s ease-in-out infinite;
                flex-shrink: 0;
            }
            @keyframes aiw-pulse {
                0%,100% { transform:scale(1); }
                50%     { transform:scale(1.15); }
            }
            #aiw-banner .aiw-text { display:flex; flex-direction:column; gap:3px; }
            #aiw-banner .aiw-title {
                font-size:15px; font-weight:700; color:#e94560;
                letter-spacing:0.05em; text-shadow:0 0 10px rgba(233,69,96,0.6);
            }
            #aiw-banner .aiw-sub   { font-size:11px; color:#8892a4; }
            #aiw-banner .aiw-match { font-size:11px; color:#e9923a; margin-top:2px; }
            #aiw-banner .aiw-close {
                background:none; border:none; color:#4a5568; font-size:14px;
                cursor:pointer; padding:2px 4px; margin-left:4px;
                border-radius:4px; line-height:1; transition:color 0.2s; align-self:flex-start;
            }
            #aiw-banner .aiw-close:hover { color:#e94560; }
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    // ── Banner ────────────────────────────────────────────────────
    let banner = null;
    let dismissedForCurrentPage = false;

    function appendToBody(el) {
        if (document.body) {
            document.body.appendChild(el);
        } else {
            const observer = new MutationObserver(() => {
                if (document.body) {
                    observer.disconnect();
                    document.body.appendChild(el);
                }
            });
            observer.observe(document.documentElement, { childList: true });
        }
    }

    function showBanner(matchedTag) {
        if (dismissedForCurrentPage) return;
        if (banner) return;
        injectStyle();
        banner = document.createElement('div');
        banner.id = 'aiw-banner';
        banner.innerHTML = `
            <div class="aiw-icon">🤖</div>
            <div class="aiw-text">
                <span class="aiw-title">AI-Generated Artwork</span>
                <span class="aiw-sub">This artwork is AI-generated</span>
                <span class="aiw-match">Tag: ${matchedTag}</span>
            </div>
            <button class="aiw-close" title="Dismiss">✕</button>
        `;
        banner.querySelector('.aiw-close').addEventListener('click', () => {
            dismissedForCurrentPage = true;
            banner.style.transition = 'opacity 0.3s, transform 0.3s';
            banner.style.opacity = '0';
            banner.style.transform = 'translateX(-40px)';
            setTimeout(() => { if (banner) { banner.remove(); banner = null; } }, 300);
        });
        appendToBody(banner);
    }

    function hideBanner() {
        dismissedForCurrentPage = false;
        if (banner) { banner.remove(); banner = null; }
    }

    // ════════════════════════════════════════════════════════════════
    //  PIXIV
    // ════════════════════════════════════════════════════════════════
    function initPixiv() {
        function checkPixivData(data) {
            try {
                const body = data?.body;
                if (!body) return;
                if (body.aiType === 2) { showBanner('Pixiv official AI label'); return; }
                const tags = body?.tags?.tags || [];
                const names = tags.flatMap(t => [
                    t.tag || '', t.translation?.en || '', t.translation?.zh || ''
                ]).filter(Boolean);
                for (const n of names) {
                    if (isAIText(n)) { showBanner(n); return; }
                }
            } catch (e) { console.error('[AIW/pixiv]', e); }
        }

        const origFetch = _win.fetch.bind(_win);
        _win.fetch = function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
            const p = origFetch(...args);
            if (/\/ajax\/illust\/\d+(\?|$)/.test(url)) {
                p.then(r => r.clone().json().then(checkPixivData).catch(() => {})).catch(() => {});
            }
            return p;
        };

        const origOpen = _win.XMLHttpRequest.prototype.open;
        const origSend = _win.XMLHttpRequest.prototype.send;
        _win.XMLHttpRequest.prototype.open = function (m, url, ...rest) {
            this._aiw_url = url; return origOpen.apply(this, [m, url, ...rest]);
        };
        _win.XMLHttpRequest.prototype.send = function (...args) {
            if (this._aiw_url && /\/ajax\/illust\/\d+(\?|$)/.test(this._aiw_url)) {
                this.addEventListener('load', () => {
                    try { checkPixivData(JSON.parse(this.responseText)); } catch (e) {}
                });
            }
            return origSend.apply(this, args);
        };

        let lastId = null;
        function getPixivId(url) { const m = url.match(/\/artworks\/(\d+)/); return m?.[1] ?? null; }
        ['pushState', 'replaceState'].forEach(fn => {
            const orig = _win.history[fn];
            _win.history[fn] = function (...args) {
                orig.apply(this, args);
                const id = getPixivId(location.href);
                if (id !== lastId) { lastId = id; hideBanner(); }
            };
        });
        _win.addEventListener('popstate', () => {
            const id = getPixivId(location.href);
            if (id !== lastId) { lastId = id; hideBanner(); }
        });
    }

    // ════════════════════════════════════════════════════════════════
    //  SANKAKU COMPLEX
    // ════════════════════════════════════════════════════════════════
    function initSankaku() {
        let checkedPostId = null;

        function getCurrentPostId() {
            const m = location.pathname.match(/\/posts\/([^/?#]+)/);
            return m?.[1] ?? null;
        }

        function fetchTagPage(postId, page) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://sankakuapi.com/posts/${postId}/tags?lang=en&page=${page}&limit=40`,
                    headers: { 'Referer': 'https://www.sankakucomplex.com/' },
                    onload: (res) => {
                        try { resolve(JSON.parse(res.responseText)?.data || []); }
                        catch (e) { resolve([]); }
                    },
                    onerror: () => resolve([]),
                });
            });
        }

        function checkTags(tags) {
            for (const t of tags) {
                const name = t.name || t.name_en || '';
                if (isAIText(name)) { showBanner(name); return true; }
            }
            return false;
        }

        async function fetchRemainingPages(postId, startPage) {
            let page = startPage;
            while (true) {
                if (getCurrentPostId() !== postId) return;
                const tags = await fetchTagPage(postId, page);
                if (!tags.length) return;
                if (checkTags(tags)) return;
                if (tags.length < 40) return;
                page++;
            }
        }

        function handlePage1Response(postId, responseText) {
            try {
                const tags = JSON.parse(responseText)?.data || [];
                if (checkTags(tags)) return;
                if (tags.length >= 40) fetchRemainingPages(postId, 2);
            } catch (e) { console.error('[AIW/sankaku]', e); }
        }

        const origOpen = _win.XMLHttpRequest.prototype.open;
        const origSend = _win.XMLHttpRequest.prototype.send;

        _win.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._aiw_url = (typeof url === 'string') ? url : '';
            return origOpen.apply(this, [method, url, ...rest]);
        };

        _win.XMLHttpRequest.prototype.send = function (...args) {
            if (this._aiw_url && /sankakuapi\.com\/posts\/[^/?#]+\/tags(\?|$)/.test(this._aiw_url)) {
                const postId = getCurrentPostId();
                const isPage1 = !/[?&]page=[2-9]/.test(this._aiw_url);
                if (postId && postId !== checkedPostId && isPage1) {
                    checkedPostId = postId;
                    this.addEventListener('load', () => handlePage1Response(postId, this.responseText));
                }
            }
            return origSend.apply(this, args);
        };

        function onNavigate() {
            const newId = getCurrentPostId();
            if (newId !== checkedPostId) { checkedPostId = null; hideBanner(); }
        }
        ['pushState', 'replaceState'].forEach(fn => {
            const orig = _win.history[fn];
            _win.history[fn] = function (...args) { orig.apply(this, args); onNavigate(); };
        });
        _win.addEventListener('popstate', onNavigate);
    }

    // ════════════════════════════════════════════════════════════════
    //  E-HENTAI / EXHENTAI
    // ════════════════════════════════════════════════════════════════
    function initEhentai() {
        function scanEhentaiTags() {
            const direct = document.querySelector('[id*="ai_generated"], [id*="ai-generated"]');
            if (direct) { showBanner(direct.textContent.trim() || 'ai generated'); return; }

            const byAttr = document.querySelector('[ehs-tag*="ai"]');
            if (byAttr) {
                const tag = byAttr.getAttribute('ehs-tag');
                if (isAIText(tag)) { showBanner(tag); return; }
            }

            const tagLinks = document.querySelectorAll('#taglist a, .gt a, a[href*="/tag/"]');
            for (const a of tagLinks) {
                if (isAIText(a.textContent)) { showBanner(a.textContent.trim()); return; }
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scanEhentaiTags);
        } else {
            scanEhentaiTags();
        }
    }

    // ── Route ─────────────────────────────────────────────────────
    const host = location.hostname;
    if (host.includes('pixiv.net'))           initPixiv();
    else if (host.includes('sankakucomplex')) initSankaku();
    else if (host.includes('e-hentai.org') || host.includes('exhentai.org')) initEhentai();

})();
