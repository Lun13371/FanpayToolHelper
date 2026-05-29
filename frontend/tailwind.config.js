/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#06070A", // Velvet Midnight основной фон
        glass: {
          DEFAULT: "rgba(18, 20, 29, 0.45)", // Apple Glassmorphism плиты
          hover: "rgba(25, 28, 41, 0.55)",
          border: "rgba(255, 255, 255, 0.03)"
        },
        brand: {
          cyan: "#00F2FE", // Бирюзовый неон
          blue: "#3B82F6", // Синий Apple
          indigo: "#6366F1" // Индиго Google
        }
      },
      fontFamily: {
        sans: [
          'SF Pro Display', 
          '-apple-system', 
          'BlinkMacSystemFont', 
          'Segoe UI', 
          'Roboto', 
          'Helvetica Neue', 
          'Arial', 
          'sans-serif'
        ],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'cyan-glow': '0 0 15px rgba(0, 242, 254, 0.15)',
        'blue-glow': '0 0 20px rgba(59, 130, 246, 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'glow-pulse': 'glowPulse 2s infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glowPulse: {
          '0%': { boxShadow: '0 0 5px rgba(0, 242, 254, 0.05)' },
          '100%': { boxShadow: '0 0 15px rgba(0, 242, 254, 0.2)' },
        }
      }
    },
  },
  plugins: [],
}
