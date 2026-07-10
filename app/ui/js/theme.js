try {
  const savedTheme = localStorage.getItem("dc.theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }
} catch (e) {}