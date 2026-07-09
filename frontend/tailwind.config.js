/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0faf4',
          100: '#dcf5e6',
          200: '#bbe9ce',
          300: '#86d5ab',
          400: '#4ab980',
          500: '#27a060',
          600: '#1a6b3a',  // color institucional principal
          700: '#165830',
          800: '#134527',
          900: '#0f3820',
        },
        accent: {          // dorado corporativo — uso puntual (focus, hover, detalles)
          400: '#e2c895',
          500: '#cdac70',
          600: '#b8935f',
          700: '#96774c',
          800: '#74593a',
        },
        ink: {              // neutros con tono más serio que el gray por defecto de Tailwind
          50: '#f7f7f6',
          100: '#eeeeec',
          200: '#dcdcd8',
          300: '#b8b8b2',
          400: '#8f8f87',
          500: '#6b6b63',
          600: '#4f4f48',
          700: '#3a3a34',
          800: '#262622',
          900: '#181815',
        },
      },
    },
  },
  plugins: [],
}
