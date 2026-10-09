import { useEffect } from 'react';

const BASE = 'T.E.R.M. Edu';
const SITE = 'https://app.termedu.in';

/**
 * Sets document.title, canonical, meta description, og:title, og:description,
 * og:url, twitter:title, twitter:description, and self-referencing hreflang
 * for the current page.
 *
 * @param {string} title   Full page title (e.g. "Pricing & Plans — T.E.R.M. Edu")
 * @param {string} [desc]  Meta description override
 * @param {string} [path]  URL path for canonical (e.g. "/pricing"). Defaults to current pathname.
 */
export function usePageMeta(title, desc, path) {
  useEffect(() => {
    const canonical = path
      ? `${SITE}${path}`
      : `${SITE}${window.location.pathname}`;
    const resolvedTitle = title || `${BASE} — India's #1 Entrepreneurship LMS`;

    // ── document.title ──────────────────────────────────────────────────
    const prevTitle = document.title;
    document.title = resolvedTitle;

    // ── canonical link ───────────────────────────────────────────────────
    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.rel = 'canonical';
      document.head.appendChild(canonicalEl);
    }
    const prevCanonical = canonicalEl.href;
    canonicalEl.href = canonical;

    // Helper: get or create a <meta> and track previous value
    function setMeta(selector, attr, value) {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        const match = selector.match(/\[([^\]=]+)="([^"]+)"\]/);
        if (match) el.setAttribute(match[1], match[2]);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute(attr);
      if (value) el.setAttribute(attr, value);
      return { el, prev };
    }

    // ── meta description ─────────────────────────────────────────────────
    const { el: metaDesc, prev: prevDesc } = setMeta('meta[name="description"]', 'content', desc);

    // ── og:title ──────────────────────────────────────────────────────────
    const { el: ogTitle, prev: prevOgTitle } = setMeta('meta[property="og:title"]', 'content', resolvedTitle);

    // ── og:description ────────────────────────────────────────────────────
    const { el: ogDesc, prev: prevOgDesc } = setMeta('meta[property="og:description"]', 'content', desc);

    // ── og:url ────────────────────────────────────────────────────────────
    const { el: ogUrl, prev: prevOgUrl } = setMeta('meta[property="og:url"]', 'content', canonical);

    // ── twitter:title ─────────────────────────────────────────────────────
    const { el: twTitle, prev: prevTwTitle } = setMeta('meta[name="twitter:title"]', 'content', resolvedTitle);

    // ── twitter:description ───────────────────────────────────────────────
    const { el: twDesc, prev: prevTwDesc } = setMeta('meta[name="twitter:description"]', 'content', desc);

    // ── hreflang — self-referencing per page ──────────────────────────────
    // Update existing hreflang tags to point to this page's canonical URL
    const hreflangEls = document.querySelectorAll('link[rel="alternate"][hreflang]');
    const prevHreflangHrefs = [];
    hreflangEls.forEach(el => {
      prevHreflangHrefs.push(el.href);
      el.href = canonical;
    });

    // If no hreflang tags existed, create self-referencing ones
    const createdHreflang = [];
    if (hreflangEls.length === 0) {
      ['en-IN', 'en', 'x-default'].forEach(lang => {
        const el = document.createElement('link');
        el.rel = 'alternate';
        el.hreflang = lang;
        el.href = canonical;
        document.head.appendChild(el);
        createdHreflang.push(el);
      });
    }

    return () => {
      document.title = prevTitle;
      canonicalEl.href = prevCanonical;
      if (prevDesc) metaDesc.setAttribute('content', prevDesc);
      if (prevOgTitle) ogTitle.setAttribute('content', prevOgTitle);
      if (prevOgDesc) ogDesc.setAttribute('content', prevOgDesc);
      if (prevOgUrl) ogUrl.setAttribute('content', prevOgUrl);
      if (prevTwTitle) twTitle.setAttribute('content', prevTwTitle);
      if (prevTwDesc) twDesc.setAttribute('content', prevTwDesc);
      hreflangEls.forEach((el, i) => {
        if (prevHreflangHrefs[i]) el.href = prevHreflangHrefs[i];
      });
      createdHreflang.forEach(el => el.remove());
    };
  }, [title, desc, path]);
}
