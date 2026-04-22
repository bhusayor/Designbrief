// ─── Role Metadata ────────────────────────────────────────────────────────────
export const ROLE_META = {
  "UI Designer": {
    color: "#B87FFF",
    icon: "◈",
    description: "Visual design, components, design system, Figma handoff",
  },
  "UX Designer": {
    color: "#5AB8FF",
    icon: "◎",
    description: "User research, wireframes, flows, usability testing",
  },
  "Frontend Dev": {
    color: "#4DFFA0",
    icon: "⟨⟩",
    description: "HTML/CSS/JS, React, animations, responsive build",
  },
  "Backend Dev": {
    color: "#FFB84D",
    icon: "⚙",
    description: "APIs, databases, authentication, server logic",
  },
  "Brand Strategist": {
    color: "#7B68EE",
    icon: "◉",
    description: "Brand positioning, tone of voice, messaging framework",
  },
  "Motion Designer": {
    color: "#FF4D6A",
    icon: "▶",
    description: "Animations, transitions, video, micro-interactions",
  },
  "Copywriter": {
    color: "#FF9EF5",
    icon: "✦",
    description: "Headlines, body copy, CTAs, tone alignment",
  },
  "Project Manager": {
    color: "var(--color-teal)",
    icon: "◆",
    description: "Timelines, stakeholder comms, sprint planning",
  },
};

// ─── Kanban ───────────────────────────────────────────────────────────────────
export const KANBAN_COLS = ["To Do", "In Progress", "Review", "Done"];

export const COL_COLORS = {
  "To Do": "#606078",
  "In Progress": "#5AB8FF",
  "Review": "#FFB84D",
  "Done": "#4DFFA0",
};

// ─── Priority & Phase ─────────────────────────────────────────────────────────
export const PRIORITY_COLORS = {
  HIGH: "#FF4D6A",
  MEDIUM: "#FFB84D",
  LOW: "#4DFFA0",
};

export const PHASE_COLORS = [
  "#5AB8FF",
  "#B87FFF",
  "#C8F55A",
  "#4DFFA0",
  "var(--color-teal)",
  "#FFB84D",
];

// ─── Project Types ────────────────────────────────────────────────────────────
export const PROJECT_TYPES = [
  {
    id: "brand-identity",
    label: "Brand Identity",
    icon: "◉",
    description: "Logo, visual identity, brand guidelines",
  },
  {
    id: "website",
    label: "Website",
    icon: "◈",
    description: "Marketing site, landing page, web presence",
  },
  {
    id: "mobile-app",
    label: "Mobile App",
    icon: "⟨⟩",
    description: "iOS, Android or cross-platform app",
  },
  {
    id: "saas-product",
    label: "SaaS Product",
    icon: "⚙",
    description: "Web application, dashboard, platform",
  },
  {
    id: "campaign",
    label: "Campaign",
    icon: "▶",
    description: "Marketing campaign, social, print, digital",
  },
  {
    id: "logo",
    label: "Logo Only",
    icon: "✦",
    description: "Standalone logo design",
  },
  {
    id: "motion",
    label: "Motion & Video",
    icon: "▶",
    description: "Animation, video production, motion graphics",
  },
  {
    id: "illustration",
    label: "Illustration",
    icon: "◆",
    description: "Custom illustration, icon set, artwork",
  },
];

// ─── Intake Sections ──────────────────────────────────────────────────────────
export const INTAKE_SECTIONS = [
  {
    id: "overview",
    label: "Project Overview",
    icon: "◈",
    description: "Basic project information and goals",
    defaultEnabled: true,
    questions: [
      "What is the name of this project?",
      "Describe the project in 2-3 sentences",
      "What is the main goal of this project?",
      "What problem does this solve for your users?",
    ],
  },
  {
    id: "audience",
    label: "Target Audience",
    icon: "◎",
    description: "Who is this project for?",
    defaultEnabled: true,
    questions: [
      "Who is the primary user of this product?",
      "What is their age range and occupation?",
      "What are their main frustrations or pain points?",
      "What device do they primarily use?",
    ],
  },
  {
    id: "competitors",
    label: "Competitors",
    icon: "⚙",
    description: "Competitive landscape and differentiation",
    defaultEnabled: true,
    questions: [
      "Name your top 3 competitors (with URLs if possible)",
      "How do you want to differentiate from them?",
      "What do competitors do well that you admire?",
    ],
  },
  {
    id: "moodboard",
    label: "Visual Direction",
    icon: "◉",
    description: "Aesthetic and design references",
    defaultEnabled: true,
    questions: [
      "Share links to designs you love (Dribbble, Behance, websites)",
      "Describe the feeling you want the design to evoke",
      "Are there any colours you absolutely want or want to avoid?",
    ],
  },
  {
    id: "budget",
    label: "Budget & Timeline",
    icon: "◆",
    description: "Financial and scheduling constraints",
    defaultEnabled: true,
    questions: [
      "What is your estimated budget range?",
      "What is your ideal launch date?",
      "Are there any hard deadlines we should know about?",
    ],
  },
  {
    id: "assets",
    label: "Existing Assets",
    icon: "✦",
    description: "Any existing materials to incorporate",
    defaultEnabled: false,
    questions: [
      "Do you have an existing logo? (upload below)",
      "Do you have brand guidelines?",
      "Are there any existing design files we should reference?",
    ],
  },
];

// ─── Gantt Colors ─────────────────────────────────────────────────────────────
export const GANTT_COLORS = [
  '#4A90D9',
  '#6B8F71',
  '#9B72FF',
  '#E8A838',
  '#D4706A',
  '#4ECDC4',
  '#95A5A6',
  '#E67E22',
]

// ─── Design Tokens ────────────────────────────────────────────────────────────
export const DESIGN_TOKENS = {
  colors: {
    bg:          'var(--color-bg)',
    sidebar:     'var(--color-sidebar)',
    surface:     'var(--color-surface)',
    card:        'var(--color-card)',
    cardHover:   'var(--color-card-hover)',
    border:      'var(--color-border)',
    borderHover: 'var(--color-border-hover)',
    accent:      'var(--color-accent)',
    accentBg:    'var(--color-accent-bg)',
    accentText:  'var(--color-accent-text)',
    text:        'var(--color-text)',
    textSoft:    'var(--color-text-soft)',
    textMuted:   'var(--color-text-muted)',
    red:         'var(--color-red)',
    amber:       'var(--color-amber)',
    green:       'var(--color-green)',
    blue:        'var(--color-blue)',
    purple:      'var(--color-purple)',
    pink:        'var(--color-pink)',
    teal:        'var(--color-teal)',
  },
  fonts: {
    display: "'Urbanist', sans-serif",
    mono: "'DM Mono', monospace",
  },
  radii: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "18px",
    full: "9999px",
  },
};
