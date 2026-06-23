// ────────────────────────────────────────────────────────────────────
// intakeQuestionSets.js, default question sets per project type.
//
// Each set is an array of question objects with the shape stored in
// the intake_forms.questions jsonb column. The builder lets the
// designer customise + add their own, but starts from a sensible
// default tuned to the project type so the form is usable on the
// first save.
//
// Question types (matches client-form renderers):
//   short_text       single line, 150 char cap
//   long_text        textarea, 1000 char cap
//   single_choice    pill group, one selectable, options[]
//   multi_choice     pill group, multi selectable, options[]
//   scale            1 to 10 segmented strip with low/high labels
//   reference_upload jpg/png/webp/pdf, up to 5 files
//   file_upload      any common type
//
// The final question on every form is the locked global one:
//   "If this project goes perfectly, what changes for your business
//    or for you personally?"
//, appended automatically by the builder, not stored in these
// per-type sets.
// ────────────────────────────────────────────────────────────────────

const q = (text, opts = {}) => ({
  id: 'q_' + Math.random().toString(36).slice(2, 10),
  text,
  helper_text: opts.helper_text || '',
  type: opts.type || 'short_text',
  required: opts.required !== false,
  options: opts.options || null,
  scale_low_label:  opts.scale_low_label  || null,
  scale_high_label: opts.scale_high_label || null,
  conditional_rules: [],
  order_index: 0,
  locked: false,
})

// ── Helpers shared across types ────────────────────────────────────
const COMMON_OPENERS = [
  q('What does your company or product do, in one sentence?', {
    helper_text: 'A simple, plain language description. Avoid jargon.',
  }),
  q('Who are your customers or users?', {
    type: 'long_text',
    helper_text: 'Describe them like you would a friend. Roles, goals, frustrations.',
  }),
  q('What is the single most important outcome of this project?', {
    type: 'long_text',
    helper_text: 'If you only achieve one thing, what is it?',
  }),
]

const COMMON_TIMELINE_BUDGET = [
  q('When do you need this delivered?', {
    type: 'single_choice',
    options: [
      'ASAP, within 2 weeks',
      'Within a month',
      '2-3 months',
      '3+ months',
      'No firm deadline',
    ],
  }),
  q('What is your approximate budget for this project?', {
    type: 'single_choice',
    options: [
      'Under $5,000',
      '$5,000 - $15,000',
      '$15,000 - $50,000',
      '$50,000+',
      'Open to discussion',
    ],
    helper_text: 'A rough range is fine. This helps me scope correctly.',
  }),
]

const COMMON_REFERENCES = [
  q('Any references that capture the feel you are going for?', {
    type: 'reference_upload',
    required: false,
    helper_text: 'Images, screenshots, or links. Up to 5 files.',
  }),
  q('Which existing products or sites do you admire, and why?', {
    type: 'long_text',
    required: false,
  }),
  q('Anything you definitely want to avoid?', {
    type: 'long_text',
    required: false,
    helper_text: 'Styles, brands, words, anything that is a no.',
  }),
]

// ── Per-type defaults ──────────────────────────────────────────────
function setWebsite() {
  return [
    ...COMMON_OPENERS,
    q('What kind of website do you need?', {
      type: 'single_choice',
      options: [
        'Marketing / landing page',
        'Brochure / company site',
        'Portfolio',
        'E-commerce store',
        'Web app / dashboard',
        'Other',
      ],
    }),
    q('What should a visitor be able to do on the site?', {
      type: 'multi_choice',
      options: [
        'Learn what we do',
        'Sign up for a trial',
        'Book a call',
        'Buy a product',
        'Read content / blog',
        'Contact us',
        'Other',
      ],
    }),
    q('Roughly how many pages do you need?', {
      type: 'single_choice',
      options: ['1 page', '2-5 pages', '6-15 pages', '15+ pages', 'I am not sure'],
    }),
    q('Where does your existing brand stand?', {
      type: 'single_choice',
      options: [
        'Full brand guide exists',
        'Logo + colours only',
        'Logo only',
        'Nothing yet',
      ],
    }),
    q('How would you describe the personality of your brand?', {
      type: 'multi_choice',
      options: ['Bold', 'Calm', 'Premium', 'Playful', 'Editorial', 'Minimal', 'Tech-forward', 'Warm', 'Trustworthy', 'Disruptive'],
      helper_text: 'Pick a few, they should sound like the same person.',
    }),
    ...COMMON_TIMELINE_BUDGET,
    ...COMMON_REFERENCES,
  ]
}

function setMobile() {
  return [
    ...COMMON_OPENERS,
    q('Which platforms do you need?', {
      type: 'multi_choice',
      options: ['iOS', 'Android', 'Web app', 'Both iOS + Android'],
    }),
    q('What is the core action a user comes to do?', {
      type: 'long_text',
      helper_text: 'One sentence describing the loop the user keeps coming back for.',
    }),
    q('How often do you expect a typical user to open the app?', {
      type: 'single_choice',
      options: ['Multiple times a day', 'Daily', 'Weekly', 'Monthly', 'Less often'],
    }),
    q('Will users need an account?', {
      type: 'single_choice',
      options: ['Yes, full sign-up', 'Yes, but with social login', 'Optional', 'No accounts'],
    }),
    q('Pick the words that should describe the app feel.', {
      type: 'multi_choice',
      options: ['Fast', 'Calm', 'Playful', 'Serious', 'Generous', 'Compact', 'Editorial', 'Tactile', 'Glassy', 'Brutalist'],
    }),
    q('What are the must-have features at launch?', {
      type: 'long_text',
      helper_text: 'Just the ones that have to ship for v1. We can phase the rest.',
    }),
    ...COMMON_TIMELINE_BUDGET,
    ...COMMON_REFERENCES,
  ]
}

function setBrand() {
  return [
    ...COMMON_OPENERS,
    q('What is the name of the brand?', {}),
    q('What is the story behind the brand name?', {
      type: 'long_text', required: false,
    }),
    q('Pick the words that should describe the brand.', {
      type: 'multi_choice',
      options: ['Bold', 'Calm', 'Premium', 'Playful', 'Editorial', 'Minimal', 'Warm', 'Trustworthy', 'Provocative', 'Iconic'],
    }),
    q('Which competitors are you most often compared to?', {
      type: 'long_text', required: false,
    }),
    q('Where will the brand live first?', {
      type: 'multi_choice',
      options: ['Website', 'Mobile app', 'Packaging', 'Social media', 'Print', 'Retail / physical space', 'Pitch deck'],
    }),
    q('Do you have an existing logo or visual mark?', {
      type: 'single_choice',
      options: ['Yes, and I want to keep it', 'Yes, but I want to evolve it', 'Yes, and I want to start over', 'No'],
    }),
    ...COMMON_TIMELINE_BUDGET,
    ...COMMON_REFERENCES,
  ]
}

function setEcommerce() {
  return [
    ...COMMON_OPENERS,
    q('What do you sell?', {
      type: 'long_text',
    }),
    q('Which platform are you on or planning to use?', {
      type: 'single_choice',
      options: ['Shopify', 'WooCommerce', 'Squarespace', 'Webflow Ecommerce', 'Custom', 'I am not sure'],
    }),
    q('Roughly how many products will the store have at launch?', {
      type: 'single_choice',
      options: ['1-10', '11-50', '51-200', '200+'],
    }),
    q('Which features matter most for the store?', {
      type: 'multi_choice',
      options: [
        'Lookbook / editorial pages',
        'Product configurator',
        'Quick-add cart',
        'Subscription / refill flow',
        'Wholesale / B2B portal',
        'Customer accounts',
        'Reviews + UGC',
        'Loyalty / rewards',
      ],
    }),
    q('What does your customer feel right before they buy?', {
      type: 'long_text',
      helper_text: 'The emotional state at decision. This shapes the whole flow.',
    }),
    q('How would you describe the brand at the shelf?', {
      type: 'multi_choice',
      options: ['Quiet luxury', 'Loud + maximal', 'Clinical', 'Earthy', 'Editorial', 'Playful', 'Sleek tech', 'Heritage', 'Disruptive'],
    }),
    ...COMMON_TIMELINE_BUDGET,
    ...COMMON_REFERENCES,
  ]
}

function setRedesign() {
  return [
    q('What is the existing product called?', {}),
    q('Share the current URL or app if there is one.', { required: false }),
    q('Why are you redesigning it?', {
      type: 'long_text',
      helper_text: 'The honest reason. Speed, conversion, taste, repositioning, fundraising.',
    }),
    q('What works about the current version that we must keep?', {
      type: 'long_text', required: false,
    }),
    q('What is broken about the current version?', {
      type: 'long_text',
    }),
    q('Who is the target user, and has that changed since launch?', {
      type: 'long_text',
    }),
    q('What is the single most important metric this redesign should move?', {
      type: 'long_text',
      helper_text: 'Conversion, retention, NPS, time-on-task, brand perception, pick one.',
    }),
    q('How much of the existing visual language stays vs goes?', {
      type: 'single_choice',
      options: ['Evolve the look', 'Refresh significantly', 'Start visually from scratch', 'I am not sure'],
    }),
    ...COMMON_TIMELINE_BUDGET,
    ...COMMON_REFERENCES,
  ]
}

function setCustom() {
  return [
    ...COMMON_OPENERS,
    q('Describe what you need built in your own words.', {
      type: 'long_text',
      helper_text: 'No need to use industry terms. Plain language is better.',
    }),
    q('What do you have today, and what is missing?', {
      type: 'long_text',
    }),
    ...COMMON_TIMELINE_BUDGET,
    ...COMMON_REFERENCES,
  ]
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────
export const PROJECT_TYPES = [
  { id: 'website',   label: 'Website or landing page',  tagline: 'Marketing site, brochure, content site, web app surface' },
  { id: 'mobile',    label: 'Mobile app or SaaS product', tagline: 'Native or hybrid app, web product with sign-in flow' },
  { id: 'brand',     label: 'Brand identity',            tagline: 'Naming, logo, colour, type, voice. Everything visual + verbal' },
  { id: 'ecommerce', label: 'E-commerce',                tagline: 'Storefront, product pages, checkout, post-purchase loop' },
  { id: 'redesign',  label: 'Redesign of existing product', tagline: 'You have something already and want to evolve or rebuild it' },
  { id: 'custom',    label: 'Custom',                    tagline: 'Start from a blank slate and build the question set yourself' },
]

export function defaultQuestionsFor(projectTypeId) {
  let questions
  switch (projectTypeId) {
    case 'website':   questions = setWebsite();   break
    case 'mobile':    questions = setMobile();    break
    case 'brand':     questions = setBrand();     break
    case 'ecommerce': questions = setEcommerce(); break
    case 'redesign':  questions = setRedesign();  break
    case 'custom':    questions = setCustom();    break
    default:          questions = setCustom()
  }
  // Stamp order_index and append the locked final question.
  return [...questions, LOCKED_FINAL_QUESTION()].map((q, i) => ({ ...q, order_index: i }))
}

// The locked final question every form always ends with.
export function LOCKED_FINAL_QUESTION() {
  return {
    id: 'q_locked_final',
    text: 'If this project goes perfectly, what changes for your business or for you personally?',
    helper_text: 'Take a moment. The answer here often unlocks the rest of the brief.',
    type: 'long_text',
    required: true,
    options: null,
    scale_low_label: null,
    scale_high_label: null,
    conditional_rules: [],
    order_index: 999,
    locked: true,
  }
}

// Default branding object for a fresh form. The designer overwrites
// these in the branding panel; client form falls back to these if a
// field is null.
export function defaultBranding() {
  return {
    logo_url: null,
    primary_color: '#8B5CF6',
    welcome_message: 'Welcome. Thanks for taking a few minutes to share the shape of this project.',
    completion_message: 'Thank you. I have what I need to start. I will be in touch within a couple of days.',
  }
}

// Default settings object for a fresh form.
export function defaultSettings() {
  return {
    file_uploads_enabled: true,
    language: 'en',
    show_progress_bar: true,
    send_confirmation_email: false,
    send_designer_notification: true,
  }
}

// Question-type metadata used by the builder UI to render dropdown
// options + the appropriate inline editor for each.
export const QUESTION_TYPES = [
  { id: 'short_text',       label: 'Short text',       icon: '✎',  helper: 'Single line, 150 char cap' },
  { id: 'long_text',        label: 'Long text',        icon: '¶',  helper: 'Multi-line textarea, 1000 char cap' },
  { id: 'single_choice',    label: 'Single choice',    icon: '◉',  helper: 'Pick one from a list of pill options' },
  { id: 'multi_choice',     label: 'Multiple choice',  icon: '☷',  helper: 'Pick multiple from a list of pill options' },
  { id: 'scale',            label: 'Scale 1-10',       icon: '⊟',  helper: 'Segmented scale with low + high labels' },
  { id: 'reference_upload', label: 'Reference upload', icon: '🖼', helper: 'Image / pdf reference files, up to 5' },
  { id: 'file_upload',      label: 'File upload',      icon: '⤴',  helper: 'Any common file type, up to 5' },
]

// Used by the Estimated Completion Time calculator. The spec says
// "required questions × 45 seconds, rounded to nearest minute".
export function estimatedMinutes(questions) {
  if (!Array.isArray(questions)) return 1
  const required = questions.filter(q => q?.required).length
  return Math.max(1, Math.round((required * 45) / 60))
}
