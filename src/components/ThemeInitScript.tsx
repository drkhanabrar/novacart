export function ThemeInitScript() {
  const script = `
    (() => {
      try {
        const theme = localStorage.getItem("novacart-theme");
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
          document.documentElement.style.colorScheme = "dark";
        }
      } catch (_) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
