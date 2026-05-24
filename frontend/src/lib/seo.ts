/**
 * SEO utilities for managing dynamic meta tags, schemas, and Open Graph data
 */

const SITE_URL_FALLBACK = "https://nepseai.shubraj.com";
const configuredSiteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
export const SITE_URL = (configuredSiteUrl && configuredSiteUrl.length > 0 ? configuredSiteUrl : SITE_URL_FALLBACK).replace(/\/+$/, "");
export const SITE_NAME = "NepseAI";
export const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/og-image.svg`;
export const DEFAULT_LOGO_URL = `${SITE_URL}/logo.svg`;

export interface PageMeta {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  imageAlt?: string;
  url?: string;
  type?: 'website' | 'article';
  canonicalUrl?: string;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export const DEFAULT_PAGE_META: PageMeta = {
  title: "NepseAI - Free AI NEPSE Stock Analysis & Screener | Nepal Stock Market",
  description:
    "Free AI-powered NEPSE stock analysis and screener for the Nepal stock market. Informational only, not investment advice.",
  canonicalUrl: `${SITE_URL}/`,
  image: DEFAULT_OG_IMAGE_URL,
  imageAlt: `${SITE_NAME} - AI-powered NEPSE stock analysis`,
};

/**
 * Update page meta tags dynamically
 */
export function updatePageMeta(meta: PageMeta) {
  document.title = meta.title;

  updateMetaTag('name', 'title', meta.title);
  updateMetaTag('name', 'description', meta.description);

  if (meta.keywords) {
    updateMetaTag('name', 'keywords', meta.keywords);
  }

  updateMetaTag('property', 'og:title', meta.title);
  updateMetaTag('property', 'og:description', meta.description);
  updateMetaTag('property', 'og:type', meta.type || 'website');
  if (meta.image) {
    updateMetaTag('property', 'og:image', meta.image);
    updateMetaTag('property', 'og:image:alt', meta.imageAlt || meta.title);
  }

  updateMetaTag('name', 'twitter:card', 'summary_large_image');
  updateMetaTag('name', 'twitter:title', meta.title);
  updateMetaTag('name', 'twitter:description', meta.description);
  if (meta.image) {
    updateMetaTag('name', 'twitter:image', meta.image);
  }

  const rawCanonical = meta.canonicalUrl || meta.url || window.location.href;
  const canonicalUrl = toAbsoluteUrl(rawCanonical).split("#")[0];
  updateCanonicalLink(canonicalUrl);
  updateMetaTag('property', 'og:url', canonicalUrl);
}

function updateMetaTag(type: 'name' | 'property', key: string, value: string) {
  let el = document.querySelector(`meta[${type}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(type, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

function updateCanonicalLink(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = url;
}

export function addJsonLd(data: Record<string, unknown>) {
  const id = `seo-jsonld-${typeof data['@type'] === 'string' ? data['@type'] : 'generic'}`;
  let script = document.querySelector(`script[data-seo="${id}"]`) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', id);
    document.head.appendChild(script);
  }
  script.setAttribute('data-seo-type', String(data['@type'] || 'generic'));
  script.textContent = JSON.stringify(data);
}

export function clearJsonLd(types?: string[]) {
  const scripts = Array.from(document.querySelectorAll('script[data-seo]')) as HTMLScriptElement[];
  scripts.forEach((script) => {
    if (!types || types.length === 0) {
      script.remove();
      return;
    }
    const t = script.getAttribute('data-seo-type');
    if (t && types.includes(t)) {
      script.remove();
    }
  });
}

export function resetPageMeta() {
  updatePageMeta(DEFAULT_PAGE_META);
}

export function toAbsoluteUrl(urlOrPath: string) {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  if (typeof window !== 'undefined') {
    try {
      return new URL(urlOrPath, window.location.origin).toString();
    } catch {
      return `${SITE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
    }
  }
  return `${SITE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
}

export function createOrganizationSchema(overrides?: Record<string, unknown>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: DEFAULT_LOGO_URL,
    description:
      'Free AI-powered NEPSE stock analysis platform. Get buy/hold/sell signals, fundamental analysis, risk tiers, valuations and investment recommendations for Nepal stock market companies.',
    sameAs: ['https://twitter.com/nepseResearch'],
    areaServed: { '@type': 'Country', name: 'Nepal' },
    ...overrides,
  };
}

export function createLocalBusinessSchema(overrides?: Record<string, unknown>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    image: DEFAULT_LOGO_URL,
    description:
      'AI-powered stock analysis and screening platform for NEPSE-listed companies in Nepal.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kathmandu',
      addressCountry: 'NP',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Nepal',
    },
    ...overrides,
  };
}

export function createBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function createFaqSchema(items: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function createArticleSchema(data: {
  headline: string;
  description: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  keywords?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.headline,
    description: data.description,
    image: data.image || DEFAULT_OG_IMAGE_URL,
    datePublished: data.datePublished || new Date().toISOString(),
    dateModified: data.dateModified || new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: data.author || SITE_NAME,
      url: `${SITE_URL}/`,
    },
    keywords: data.keywords,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
  };
}

export function createStockSchema(data: {
  symbol: string;
  name: string;
  sector?: string;
  description: string;
  url: string;
  image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${data.symbol}: ${data.name} - NEPSE Stock`,
    description: data.description,
    url: data.url,
    image: data.image || DEFAULT_OG_IMAGE_URL,
    category: data.sector || 'Nepal Stock',
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    areaServed: { '@type': 'Country', name: 'Nepal' },
    subjectOf: {
      '@type': 'FinancialProductCategory',
      name: 'NEPSE Listed Stocks',
      description: 'Stocks listed on the Nepal Stock Exchange (NEPSE)',
    },
  };
}

export function createProductSchema(data: {
  symbol: string;
  name: string;
  description: string;
  url: string;
  image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${data.symbol}: ${data.name} NEPSE Stock Analysis`,
    description: data.description,
    image: data.image || DEFAULT_OG_IMAGE_URL,
    brand: {
      '@type': 'Brand',
      name: SITE_NAME,
    },
    category: 'Financial analysis',
    offers: {
      '@type': 'Offer',
      url: data.url,
      price: '0',
      priceCurrency: 'NPR',
      availability: 'https://schema.org/InStock',
    },
  };
}

export function createWebPageSchema(data: {
  title: string;
  description: string;
  url: string;
  image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: data.title,
    description: data.description,
    url: data.url,
    image: data.image || DEFAULT_OG_IMAGE_URL,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
  };
}
