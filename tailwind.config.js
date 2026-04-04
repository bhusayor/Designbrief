/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        'accent-bg': 'var(--accent-bg)',
        'accent-border': 'var(--accent-border)',
        'social-bg': 'var(--social-bg)',
        border: 'var(--border)',
        'text-h': 'var(--text-h)',
      },
      boxShadow: {
        default: 'var(--shadow)',
      },
    },
  },
  plugins: [],
}
