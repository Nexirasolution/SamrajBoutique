/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      animation: {
        marquee: 'marquee 22s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%':   { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      // Black / white / wine theme. The original key names are kept so any
      // existing `bg-brand-*` / `text-brand-*` classes keep working and pick
      // up the new palette automatically.
      colors: {
        brand: {
          pink: '#7B2D4A',       // was gold — now wine accent
          magenta: '#000000',    // primary brand color (wordmark, CTAs, prices) stays black
          rose: '#333333',       // hover/secondary tone stays dark grey
          green: '#4A4A4A',      // neutral grey
          deepgreen: '#1A1A1A',  // near-black
          gold: '#7B2D4A',       // wine accent (matches the wine used on the redesigned pages)
          cream: '#FAFAFA',      // neutral off-white background
          ink: '#000000',        // text color

          // New helpers that match the constants used on the redesigned pages
          goldwash: '#F3DEE5',   // pale wine tint for hovers and placeholders
          inksoft: '#6B6B6B',    // secondary text
          line: '#E8E8E8'        // hairline borders
        }
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)']
      },
      boxShadow: {
        soft: '0 8px 30px -8px rgba(0,0,0,0.12)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};