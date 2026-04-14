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
  // Update title
  document.title = meta.title;

  // Update meta description
  updateMetaTag('name', 'description', meta.description);

  // Update keywords
  if (meta.keywords) {
    updateMetaTag('name', 'keywords', meta.keywords);
  }

  // Update Open Graph
  updateMetaTag('property', 'og:title', meta.title);
  updateMetaTag('property', 'og:description', meta.description);
  if (meta.image) {
    updateMetaTag('property', 'og:image', meta.image);
    updateMetaTag('property', 'og:image:alt', meta.imageAlt || meta.title);
  }

  // Update Twitter Card
  updateMetaTag('name', 'twitter:title', meta.title);
  updateMetaTag('name', 'twitter:description', meta.description);
  if (meta.image) {
    updateMetaTag('name', 'twitter:image', meta.image);
  }

  // Update canonical URL
  const canonicalUrl = meta.canonicalUrl || meta.url || window.location.href;
  updateCanonicalLink(canonicalUrl);

  // Update og:url
  updateMetaTag('property', 'og:url', canonicalUrl);
}

/**
 * Update or create a meta tag
 */
function updateMetaTag(type: 'name' | 'property', key: string, value: string) {
  let el = document.querySelector(`meta[${type}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(type, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/**
 * Update canonical link
 */
function updateCanonicalLink(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = url;
}

/**
 * Add JSON-LD structured data to page
 */
export function addJsonLd(data: Record<string, unknown>) {
  let script = document.querySelector('script[data-seo="jsonld"]') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'jsonld');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

/**
 * Create Organization schema
 */
export function createOrganizationSchema(overrides?: Record<string, unknown>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NEPSE Research',
    url: 'https://nepseai.shubraj.com',
    logo: 'https://nepseai.shubraj.com/logo.png',
    description:
      'Free NEPSE stock AI analysis and Nepal stock market insights. AI-powered fundamental and technical analysis, screener, valuations for NEPSE.',
    sameAs: ['https://www.facebook.com/nepseResearch', 'https://twitter.com/nepseResearch'],
    ...overrides,
  };
}

/**
 * Create BreadcrumbList schema
 */
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

/**
 * Create FAQPage schema
 */
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

/**
 * Create Article schema for company analysis pages
 */
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
    },
    keywords: data.keywords,
  };
}

/**
 * Create LocalBusiness schema (optional, if NEPSE Research has a physical location)
 */
export function createLocalBusinessSchema(overrides?: Record<string, unknown>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'NEPSE Research',
    image: 'https://nepseai.shubraj.com/logo.png',
    description: 'AI-powered NEPSE stock analysis and Nepal stock market research',
    url: 'https://nepseai.shubraj.com',
    telephone: '+977-000000000',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NP',
      addressLocality: 'Kathmandu',
      addressRegion: 'Kathmandu',
    },
    ...overrides,
  };
}
