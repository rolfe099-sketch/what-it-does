/**
 * Site-wide constants. One source of truth for anything that appears in more
 * than one place — the name, the tagline, the nav, the legal entity.
 *
 * Editing this file changes the whole site. It is deliberately plain data with
 * no logic in it.
 */

export const SITE = {
  name: 'layerfix',
  domain: 'layerfix.com',
  url: 'https://layerfix.com',

  /** Used as the default meta description and in the footer. */
  tagline: 'A structured settings and failure database for 3D printing.',
  description:
    'Find out what to change when a 3D print fails. Real settings data across printers and materials, with the evidence behind every recommendation.',

  /** Publisher — appears in legal pages and structured data. */
  operator: {
    name: 'Eriksen Labs',
    legalName: 'Eriksen ENK',
    orgNumber: '937 027 834',
    country: 'Norway',
    /** Required by GDPR/CCPA for a privacy contact. Set before launch. */
    email: 'hello@layerfix.com',
  },

  /** Primary navigation. Order matters; this is the order rendered. */
  nav: [
    { href: '/fix/', label: 'Diagnose' },
    { href: '/defects/', label: 'Defects' },
    { href: '/materials/', label: 'Materials' },
    { href: '/data/', label: 'Data' },
  ],
} as const;

/** Footer link groups. Add a link by adding a line here. */
export const FOOTER = [
  {
    heading: 'Fix a print',
    links: [
      { href: '/fix/', label: 'Diagnose a failure' },
      { href: '/defects/', label: 'All defects' },
      { href: '/materials/', label: 'Material guides' },
    ],
  },
  {
    heading: 'The data',
    links: [
      { href: '/data/', label: 'How the data works' },
      { href: '/data/method/', label: 'Method & confidence' },
      { href: '/contribute/', label: 'Contribute a result' },
    ],
  },
  {
    heading: 'Site',
    links: [
      { href: '/about/', label: 'About' },
      { href: '/changelog/', label: 'Changelog' },
      { href: '/rss.xml', label: 'RSS' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy/', label: 'Privacy' },
      { href: '/terms/', label: 'Terms' },
      { href: '/disclosure/', label: 'Disclosure' },
    ],
  },
] as const;
