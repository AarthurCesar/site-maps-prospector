// Auth - Client-side password protection
// Senha = ano atual (ex: 2026)
const AUTH_KEY = "prospectmap_auth";

async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById("loginPassword").value;
  const currentYear = new Date().getFullYear().toString();

  if (password === currentYear) {
    sessionStorage.setItem(AUTH_KEY, currentYear);
    showApp();
  } else {
    const errorEl = document.getElementById("loginError");
    errorEl.style.display = "block";
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginPassword").focus();
    setTimeout(() => { errorEl.style.display = "none"; }, 3000);
  }
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appContainer").style.display = "block";
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  document.getElementById("appContainer").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("loginPassword").value = "";
}

// Check auth on load - valida se o ano armazenado ainda é o atual
if (sessionStorage.getItem(AUTH_KEY) === new Date().getFullYear().toString()) {
  showApp();
} else {
  sessionStorage.removeItem(AUTH_KEY);
}
