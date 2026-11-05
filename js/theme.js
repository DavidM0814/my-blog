const root = document.documentElement;
const button = document.getElementById("theme-toggle");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  return root.dataset.theme || (systemDark.matches ? "dark" : "light");
}

function updateButton() {
  const next = currentTheme() === "dark" ? "라이트 모드" : "다크 모드";
  button.textContent = next;
  button.setAttribute("aria-label", `${next}로 전환`);
}

button.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // 저장할 수 없는 환경에서는 현재 화면에만 적용한다.
  }
  updateButton();
});

systemDark.addEventListener("change", updateButton);
updateButton();
