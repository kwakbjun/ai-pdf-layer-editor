/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B1020",       // 전체 배경
        panel: "#111A33",    // 카드/패널
        border: "rgba(255,255,255,0.08)",
        text: "#EAF0FF",
        muted: "rgba(234,240,255,0.7)",
        brand: {
          50: "#ECF3FF",
          100: "#D7E7FF",
          200: "#B0CFFF",
          300: "#87B6FF",
          400: "#5E9DFF",
          500: "#3B82F6", // 메인
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        danger: "#EF4444",
        success: "#22C55E",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.35)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};
