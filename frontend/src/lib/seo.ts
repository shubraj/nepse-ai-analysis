/**
 * SEO utilities for managing dynamic meta tags, schemas, and Open Graph data
 */

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
  if (meta.image) {
    updateMetaTag('property', 'og:image', meta.image);
    updateMetaTag('property', 'og:image:alt', meta.imageAlt || meta.title);
  }

  updateMetaTag('name', 'twitter:title', meta.title);
  updateMetaTag('name', 'twitter:description', meta.description);
  if (meta.image) {
    updateMetaTag('name', 'twitter:image', meta.image);
  }

  const canonicalUrl = meta.canonicalUrl || meta.url || window.location.href;
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
  script.textContent = JSON.stringify(data);
}

export function createOrganizationSchema(overrides?: Record<string, unknown>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NEPSE Research',
    url: 'https://nepseai.shubraj.com',
    logo: 'https://nepseai.shubraj.com/logo.png',
    description:
      'Free AI-powered NEPSE stock analysis platform. Get buy/hold/sell signals, fundamental analysis, risk tiers, valuations and investment recommendations for Nepal stock market companies.',
    sameAs: ['https://twitter.com/nepseResearch'],
    areaServed: { '@type': 'Country', name: 'Nepal' },
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
    image: data.image || 'https://nepseai.shubraj.com/og-image.png',
    datePublished: data.datePublished || new Date().toISOString(),
    dateModified: data.dateModified || new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: data.author || 'NEPSE Research',
      url: 'https://nepseai.shubraj.com',
    },
    keywords: data.keywords,
    publisher: {
      '@type': 'Organization',
      name: 'NEPSE Research',
      url: 'https://nepseai.shubraj.com',
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
    image: data.image || 'https://nepseai.shubraj.com/og-image.png',
    category: data.sector || 'Nepal Stock',
    provider: {
      '@type': 'Organization',
      name: 'NEPSE Research',
      url: 'https://nepseai.shubraj.com',
    },
    areaServed: { '@type': 'Country', name: 'Nepal' },
    subjectOf: {
      '@type': 'FinancialProductCategory',
      name: 'NEPSE Listed Stocks',
      description: 'Stocks listed on the Nepal Stock Exchange (NEPSE)',
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
    image: data.image || 'https://nepseai.shubraj.com/og-image.png',
    publisher: {
      '@type': 'Organization',
      name: 'NEPSE Research',
      url: 'https://nepseai.shubraj.com',
    },
  };
}
