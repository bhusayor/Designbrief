export const BRIEF_TEMPLATES = [
  {
    id: 'agency-deck',
    name: 'Agency Deck',
    tagline: 'Visual, client-ready presentation',
    icon: 'PresentationChartBarIcon',
    accent: '#7C3AED',
    aiModifier:
      'Format this for a client presentation. ' +
      'Lead with brand identity and visual ' +
      'direction. Use confident, client-friendly ' +
      'language. Emphasize deliverables and ' +
      'timelines clearly.',
  },
  {
    id: 'technical-spec',
    name: 'Technical Spec',
    tagline: 'Developer-ready documentation',
    icon: 'CodeBracketIcon',
    accent: '#0EA5E9',
    aiModifier:
      'Format this as a technical specification. ' +
      'Lead with tech stack and architecture. ' +
      'Be precise and use developer terminology. ' +
      'Include component hierarchy and ' +
      'API considerations.',
  },
  {
    id: 'creative-direction',
    name: 'Creative Direction',
    tagline: 'Mood-forward design brief',
    icon: 'SwatchIcon',
    accent: '#EC4899',
    aiModifier:
      'Format this as a creative direction doc. ' +
      'Lead with concept, mood, and brand voice. ' +
      'Use evocative inspiring language. ' +
      'Typography and color are the hero. ' +
      'Include brand do-say and do-not-say.',
  },
  {
    id: 'sprint-plan',
    name: 'Sprint Plan',
    tagline: 'Agile, action-oriented breakdown',
    icon: 'RocketLaunchIcon',
    accent: '#16a34a',
    aiModifier:
      'Format this as an agile sprint plan. ' +
      'Organise deliverables into sprint weeks. ' +
      'Each feature needs effort and priority. ' +
      'Roles map to specific sprint tasks. ' +
      'Output should feel like a Linear backlog.',
  },
  {
    id: 'lean-canvas',
    name: 'Lean Canvas',
    tagline: 'Startup hypothesis on one page',
    icon: 'ViewColumnsIcon',
    accent: '#F59E0B',
    aiModifier:
      'Format this as a lean startup canvas. ' +
      'Identify: Problem, Solution, Key Metrics, ' +
      'Unique Value Prop, Unfair Advantage, ' +
      'Channels, Customer Segments, ' +
      'Cost Structure, Revenue Streams. ' +
      'Be hypothesis-driven and concise.',
  },
]

export const WEBSITE_TEMPLATES = [
  {
    id: 'saas-landing',
    name: 'SaaS Landing',
    tagline: 'Convert visitors to signups',
    icon: 'ComputerDesktopIcon',
    accent: '#7C3AED',
    sections: [
      'Sticky nav with login and CTA button',
      'Hero with animated product UI mockup',
      'Logo cloud for social proof',
      'Features section (3-column grid)',
      'How it works (numbered steps)',
      'Testimonial wall',
      'Pricing with monthly/annual toggle',
      'Final CTA with email capture',
      'Footer with sitemap',
    ],
    motion:
      'Product mockup parallax on scroll, ' +
      'feature card hover lift, ' +
      'pricing toggle number morph',
    techStack:
      'Next.js 14, TypeScript, Tailwind CSS, ' +
      'shadcn/ui, Framer Motion',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    tagline: 'Discovery to checkout',
    icon: 'ShoppingBagIcon',
    accent: '#EF4444',
    sections: [
      'Sticky nav with cart icon and count badge',
      'Editorial hero with product focal point',
      'Trust strip (free shipping, returns)',
      'Featured products grid (4 across)',
      'Category tiles (4 across)',
      'Lifestyle photography section with parallax',
      'Customer reviews carousel',
      'Newsletter signup section',
      'Footer with sitemap',
    ],
    motion:
      'Cart count spring animation, ' +
      'product card lift on hover, ' +
      'lifestyle section parallax',
    techStack:
      'Next.js 14, TypeScript, Tailwind CSS, ' +
      'Stripe for payments, Zustand for cart state',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    tagline: 'Show work, win clients',
    icon: 'PhotoIcon',
    accent: '#0EA5E9',
    sections: [
      'Minimal nav (logo, two links, contact)',
      'Full-screen hero with typed role',
      'Marquee services/skills strip',
      'Project grid with hover video preview',
      'Selected case studies section',
      'About section with pull-quote',
      'Contact as large-format form',
    ],
    motion:
      'Custom cursor with magnetic targets, ' +
      'project card hover plays video preview, ' +
      'marquee infinite auto-scroll',
    techStack:
      'Next.js 14, TypeScript, Tailwind CSS, ' +
      'GSAP for animations, Framer Motion',
  },
  {
    id: 'startup-mvp',
    name: 'Startup MVP',
    tagline: 'Validate before you build',
    icon: 'BoltIcon',
    accent: '#16a34a',
    sections: [
      'Minimal floating pill nav',
      'Problem statement hero',
      'Solution with 3 key benefits',
      'How it works (3 animated steps)',
      'Social proof (early numbers or logos)',
      'Email waitlist capture (primary CTA)',
      'FAQ accordion',
      'Simple footer',
    ],
    motion:
      'Steps reveal on scroll, ' +
      'counter number animation, ' +
      'email input expand on focus',
    techStack:
      'Next.js 14, TypeScript, Tailwind CSS, ' +
      'Resend or Loops for email capture',
  },
  {
    id: 'mobile-app',
    name: 'Mobile App',
    tagline: 'App store to download',
    icon: 'DevicePhoneMobileIcon',
    accent: '#EC4899',
    sections: [
      'Minimal nav with app store badges',
      'Hero with floating device mockup',
      'Feature screenshots (scroll-driven)',
      'App features grid (icon, heading, body)',
      'Ratings and reviews section',
      'App store download CTA section',
      'Footer',
    ],
    motion:
      'Device mockup float animation, ' +
      'screenshot horizontal scroll-snap, ' +
      'app store badge hover bounce',
    techStack:
      'Next.js 14, TypeScript, Tailwind CSS, ' +
      'Framer Motion for animations',
  },
]

export function getBriefTemplate(id) {
  return BRIEF_TEMPLATES.find(t => t.id === id) || BRIEF_TEMPLATES[0]
}

export function getWebsiteTemplate(id) {
  return WEBSITE_TEMPLATES.find(t => t.id === id) || WEBSITE_TEMPLATES[0]
}
