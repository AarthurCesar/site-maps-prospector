let allResults = [];
let currentFilter = "all";
let autocompleteTimer = null;
let selectedSuggestion = -1;
let countrySearchRunning = false;
let selectedCountry = "";

// Filtros avançados
let minRating = 0;
let minReviews = 0;
let minScore = 0;

// === SCORE DE PRIORIDADE ===
function calculateScore(place) {
  let score = 0;

  // Sem website = prospect (base de pontos)
  if (!place.hasWebsite) score += 30;

  // Avaliações: quanto mais, mais estabelecido o negócio
  if (place.totalRatings >= 100) score += 25;
  else if (place.totalRatings >= 50) score += 20;
  else if (place.totalRatings >= 20) score += 15;
  else if (place.totalRatings >= 10) score += 10;
  else if (place.totalRatings >= 5) score += 5;

  // Nota alta = negócio bem visto, mais chance de investir
  if (place.rating >= 4.5) score += 20;
  else if (place.rating >= 4.0) score += 15;
  else if (place.rating >= 3.5) score += 10;
  else if (place.rating >= 3.0) score += 5;

  // Tem telefone = mais fácil de contactar
  if (place.phone) score += 15;

  // Tem categoria definida = negócio mais organizado
  if (place.category) score += 10;

  // Tem Instagram = canal direto de contato
  if (place.instagram) score += 5;

  // Tem email = canal profissional de contato
  if (place.email) score += 5;

  return Math.min(score, 100);
}

function getScoreLabel(score) {
  if (score >= 80) return { text: "Excelente", class: "score-excellent" };
  if (score >= 60) return { text: "Muito Bom", class: "score-great" };
  if (score >= 40) return { text: "Bom", class: "score-good" };
  if (score >= 20) return { text: "Regular", class: "score-fair" };
  return { text: "Baixo", class: "score-low" };
}

// Extrai socials do objeto aninhado e calcula score
function flattenSocials(place) {
  const socials = place.socials || {};
  const flat = {
    ...place,
    instagram: socials.instagram || place.instagram || null,
    facebook: socials.facebook || place.facebook || null,
    twitter: socials.twitter || place.twitter || null,
    linkedin: socials.linkedin || place.linkedin || null,
    github: socials.github || place.github || null,
    email: socials.email || place.email || null,
  };
  delete flat.socials;
  flat.score = calculateScore(flat);
  return flat;
}

// Busca email e redes sociais no site do negócio
async function deepScrapeContacts(index) {
  const place = allResults[index];
  if (!place || !place.website) return;

  const btn = document.querySelector(`[data-scrape-idx="${index}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Buscando...";
  }

  try {
    const res = await fetch(`/api/scrape-site?url=${encodeURIComponent(place.website)}`);
    const data = await res.json();

    if (res.ok) {
      if (data.emails && data.emails.length) {
        allResults[index].email = allResults[index].email || data.emails[0];
        allResults[index].allEmails = data.emails;
      }
      if (data.instagram) allResults[index].instagram = allResults[index].instagram || data.instagram;
      if (data.facebook) allResults[index].facebook = allResults[index].facebook || data.facebook;
      if (data.twitter) allResults[index].twitter = allResults[index].twitter || data.twitter;
      if (data.linkedin) allResults[index].linkedin = allResults[index].linkedin || data.linkedin;
      if (data.github) allResults[index].github = allResults[index].github || data.github;

      // Recalcula score com novos dados
      allResults[index].score = calculateScore(allResults[index]);
      allResults.sort((a, b) => b.score - a.score);
      updateStats();
      renderResults();
    }
  } catch {
    if (btn) btn.textContent = "Erro";
  }
}

// Mostra/esconde campo personalizado
document.getElementById("businessType").addEventListener("change", (e) => {
  const customGroup = document.getElementById("customTypeGroup");
  customGroup.style.display = e.target.value === "custom" ? "block" : "none";
});

// Alterna entre modo cidade e país
document.getElementById("searchMode").addEventListener("change", (e) => {
  const isCountry = e.target.value === "country";
  document.getElementById("cityGroup").style.display = isCountry ? "none" : "block";
  document.getElementById("countryGroup").style.display = isCountry ? "block" : "none";
});

// === AUTOCOMPLETE CIDADE ===
const cityInput = document.getElementById("city");
const suggestionsEl = document.getElementById("suggestions");

cityInput.addEventListener("input", (e) => {
  const value = e.target.value.trim();
  clearTimeout(autocompleteTimer);
  selectedSuggestion = -1;

  if (value.length < 2) {
    suggestionsEl.classList.remove("active");
    return;
  }

  autocompleteTimer = setTimeout(() => fetchSuggestions(value, suggestionsEl, cityInput), 300);
});

cityInput.addEventListener("keydown", (e) => {
  handleAutocompleteKeys(e, suggestionsEl, cityInput);
});

// === AUTOCOMPLETE PAÍS ===
const countryInput = document.getElementById("country");
const countrySuggestionsEl = document.getElementById("countrySuggestions");
let countryTimer = null;

countryInput.addEventListener("input", (e) => {
  const value = e.target.value.trim();
  clearTimeout(countryTimer);
  selectedSuggestion = -1;

  if (value.length < 2) {
    countrySuggestionsEl.classList.remove("active");
    return;
  }

  countryTimer = setTimeout(() => {
    fetchSuggestions(value, countrySuggestionsEl, countryInput, true);
  }, 300);
});

countryInput.addEventListener("keydown", (e) => {
  handleAutocompleteKeys(e, countrySuggestionsEl, countryInput);
});

// Enter para buscar
cityInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && selectedSuggestion < 0) search();
});
countryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && selectedSuggestion < 0) search();
});

// Fecha sugestões ao clicar fora
document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrapper")) {
    suggestionsEl.classList.remove("active");
    countrySuggestionsEl.classList.remove("active");
  }
});

// === FUNÇÕES AUTOCOMPLETE ===
function handleAutocompleteKeys(e, listEl, inputEl) {
  const items = listEl.querySelectorAll(".suggestion-item");
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedSuggestion = Math.min(selectedSuggestion + 1, items.length - 1);
    updateSelected(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedSuggestion = Math.max(selectedSuggestion - 1, 0);
    updateSelected(items);
  } else if (e.key === "Enter" && selectedSuggestion >= 0) {
    e.preventDefault();
    items[selectedSuggestion].click();
  } else if (e.key === "Escape") {
    listEl.classList.remove("active");
  }
}

function updateSelected(items) {
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === selectedSuggestion);
  });
  if (items[selectedSuggestion]) {
    items[selectedSuggestion].scrollIntoView({ block: "nearest" });
  }
}

async function fetchSuggestions(query, listEl, inputEl, countriesOnly = false) {
  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1&accept-language=pt-BR`;

    if (countriesOnly) {
      url += "&featuretype=country";
    }

    const res = await fetch(url, {
      headers: { "User-Agent": "ProspectMap/1.0" },
    });
    const data = await res.json();

    let filtered = data;
    if (countriesOnly) {
      filtered = data.filter((p) => p.type === "country" || p.class === "boundary");
    }

    if (!filtered.length) {
      listEl.classList.remove("active");
      return;
    }

    listEl.innerHTML = filtered.map((place) => {
      const parts = place.display_name.split(", ");
      const main = parts[0];
      const detail = parts.slice(1, 3).join(", ");

      return `
        <div class="suggestion-item" data-name="${escapeHtml(place.display_name)}" data-short="${escapeHtml(parts[0])}">
          <div class="suggestion-main">${escapeHtml(main)}</div>
          ${detail ? `<div class="suggestion-detail">${escapeHtml(detail)}</div>` : ""}
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".suggestion-item").forEach((item) => {
      item.addEventListener("click", () => {
        inputEl.value = item.dataset.name;
        if (countriesOnly) {
          selectedCountry = item.dataset.short;
        }
        listEl.classList.remove("active");
        selectedSuggestion = -1;
      });
    });

    listEl.classList.add("active");
  } catch {
    listEl.classList.remove("active");
  }
}

// === BUSCA ===
async function search() {
  const mode = document.getElementById("searchMode").value;
  const typeSelect = document.getElementById("businessType");
  const type = typeSelect.value === "custom"
    ? document.getElementById("customType").value
    : typeSelect.value;

  if (!type) {
    showError("Selecione um tipo de negócio.");
    return;
  }

  if (mode === "country") {
    await searchByCountry(type);
  } else {
    await searchByCity(type);
  }
}

async function searchByCity(type) {
  const city = cityInput.value.trim();
  if (!city) {
    showError("Preencha a cidade.");
    return;
  }

  const query = `${type} em ${city}`;
  allResults = [];

  const btn = document.getElementById("searchBtn");
  const loading = document.getElementById("loading");
  const errorEl = document.getElementById("error");

  btn.disabled = true;
  loading.style.display = "block";
  errorEl.style.display = "none";
  document.getElementById("results").innerHTML = "";
  document.getElementById("filtersSection").style.display = "none";

  try {
    const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Erro ao buscar dados");

    allResults = data.results.map((p) => flattenSocials(p));
    allResults.sort((a, b) => b.score - a.score);
    updateStats();
    renderResults();
    document.getElementById("filtersSection").style.display = "block";
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    loading.style.display = "none";
  }
}

async function searchByCountry(type) {
  const country = countryInput.value.trim();
  if (!country) {
    showError("Selecione um país.");
    return;
  }

  // Busca cidades do país
  const btn = document.getElementById("searchBtn");
  const progressEl = document.getElementById("countryProgress");
  const errorEl = document.getElementById("error");

  btn.disabled = true;
  errorEl.style.display = "none";
  allResults = [];
  document.getElementById("results").innerHTML = "";
  document.getElementById("filtersSection").style.display = "none";
  progressEl.style.display = "block";
  countrySearchRunning = true;

  updateProgress("Buscando cidades do país...", 0, "");

  try {
    // Busca principais cidades do país via API
    const cities = await getCitiesOfCountry(selectedCountry || country.split(",")[0].trim());

    if (!cities.length) {
      throw new Error("Não encontrei cidades para esse país. Tente digitar o nome em inglês.");
    }

    updateProgress(`Encontradas ${cities.length} cidades. Iniciando busca...`, 0, "");

    for (let i = 0; i < cities.length; i++) {
      if (!countrySearchRunning) break;

      const city = cities[i];
      const query = `${type} em ${city}, ${selectedCountry || country.split(",")[0].trim()}`;
      const pct = Math.round(((i + 1) / cities.length) * 100);

      updateProgress(
        `Buscando em ${city} (${i + 1}/${cities.length})`,
        pct,
        `Encontrados: ${allResults.length} negócios | Sem website: ${allResults.filter((p) => !p.hasWebsite).length}`
      );

      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (res.ok && data.results.length) {
          // Evita duplicatas pelo nome + endereço
          const newResults = data.results
            .filter((nr) => !allResults.some((er) => er.name === nr.name && er.address === nr.address))
            .map((p) => flattenSocials(p));
          allResults = [...allResults, ...newResults];
          allResults.sort((a, b) => b.score - a.score);

          updateStats();
          renderResults();
          document.getElementById("filtersSection").style.display = "block";
        }
      } catch {
        // Ignora erro em cidade individual e continua
      }
    }

    updateProgress(
      countrySearchRunning ? "Busca completa!" : "Busca interrompida.",
      100,
      `Total: ${allResults.length} negócios | Sem website: ${allResults.filter((p) => !p.hasWebsite).length}`
    );
  } catch (err) {
    showError(err.message);
    progressEl.style.display = "none";
  } finally {
    btn.disabled = false;
    countrySearchRunning = false;
  }
}

async function getCitiesOfCountry(countryName) {
  try {
    // Usa a API gratuita countriesnow para pegar cidades
    const res = await fetch("https://countriesnow.space/api/v0.1/countries/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: translateCountryName(countryName) }),
    });
    const data = await res.json();

    if (data.data && data.data.length) {
      // Limita às 30 maiores cidades (ordem alfabética, pega as mais conhecidas)
      // Prioriza cidades mais populosas usando heurísticas
      const allCities = data.data;
      return prioritizeCities(allCities, countryName).slice(0, 30);
    }
  } catch {}

  // Fallback: busca cidades via Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=city+in+${encodeURIComponent(countryName)}&limit=30&featuretype=city&accept-language=pt-BR`,
      { headers: { "User-Agent": "ProspectMap/1.0" } }
    );
    const data = await res.json();
    return data.map((p) => p.display_name.split(",")[0].trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Traduz nomes de países PT -> EN para a API
function translateCountryName(name) {
  const map = {
    "Estados Unidos": "United States",
    "EUA": "United States",
    "Brasil": "Brazil",
    "Alemanha": "Germany",
    "França": "France",
    "Espanha": "Spain",
    "Itália": "Italy",
    "Portugal": "Portugal",
    "Reino Unido": "United Kingdom",
    "Inglaterra": "United Kingdom",
    "Japão": "Japan",
    "China": "China",
    "Canadá": "Canada",
    "México": "Mexico",
    "Argentina": "Argentina",
    "Colômbia": "Colombia",
    "Chile": "Chile",
    "Peru": "Peru",
    "Índia": "India",
    "Austrália": "Australia",
    "Coreia do Sul": "South Korea",
    "Rússia": "Russia",
    "Holanda": "Netherlands",
    "Suíça": "Switzerland",
    "Áustria": "Austria",
    "Bélgica": "Belgium",
    "Suécia": "Sweden",
    "Noruega": "Norway",
    "Dinamarca": "Denmark",
    "Polônia": "Poland",
    "Irlanda": "Ireland",
    "Turquia": "Turkey",
    "Egito": "Egypt",
    "África do Sul": "South Africa",
    "Emirados Árabes": "United Arab Emirates",
    "Arábia Saudita": "Saudi Arabia",
    "Uruguai": "Uruguay",
    "Paraguai": "Paraguay",
    "Bolívia": "Bolivia",
    "Venezuela": "Venezuela",
    "Equador": "Ecuador",
  };
  return map[name] || name;
}

// Prioriza cidades mais conhecidas/populosas
function prioritizeCities(cities, country) {
  // Cidades que sabemos serem grandes por país
  const majorCities = {
    "United States": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "Indianapolis", "San Francisco", "Seattle", "Denver", "Washington", "Nashville", "Oklahoma City", "El Paso", "Boston", "Portland", "Las Vegas", "Memphis", "Louisville", "Baltimore", "Milwaukee"],
    "Brazil": ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Manaus", "Curitiba", "Recife", "Goiânia", "Belém", "Porto Alegre", "Guarulhos", "Campinas", "São Luís", "Maceió", "Campo Grande", "Teresina", "João Pessoa", "Natal", "Florianópolis", "Vitória", "Cuiabá", "Aracaju", "Londrina", "Joinville", "Ribeirão Preto", "Uberlândia", "Sorocaba", "Santos"],
    "Portugal": ["Lisboa", "Porto", "Braga", "Coimbra", "Funchal", "Aveiro", "Faro", "Setúbal", "Viseu", "Évora", "Guimarães", "Leiria", "Viana do Castelo", "Vila Nova de Gaia", "Amadora"],
  };

  const translated = translateCountryName(country);
  const known = majorCities[translated];

  if (known) {
    // Retorna as conhecidas que existem na lista + completa com outras
    const knownSet = new Set(known.map((c) => c.toLowerCase()));
    const matched = known.filter((c) => cities.some((city) => city.toLowerCase().includes(c.toLowerCase())));
    const others = cities.filter((c) => !knownSet.has(c.toLowerCase())).slice(0, 30 - matched.length);
    return [...matched, ...others];
  }

  // Se não temos lista, retorna as primeiras 30
  return cities.slice(0, 30);
}

function stopCountrySearch() {
  countrySearchRunning = false;
}

function updateProgress(text, pct, detail) {
  document.getElementById("progressText").textContent = text;
  document.getElementById("progressBar").style.width = pct + "%";
  document.getElementById("progressDetail").textContent = detail;
}

// === STATS E RENDER ===
function updateStats() {
  const noSite = allResults.filter((p) => !p.hasWebsite).length;
  const withSite = allResults.filter((p) => p.hasWebsite).length;
  const withInsta = allResults.filter((p) => p.instagram).length;
  const withEmail = allResults.filter((p) => p.email).length;

  document.getElementById("totalCount").textContent = allResults.length;
  document.getElementById("noSiteCount").textContent = noSite;
  document.getElementById("withSiteCount").textContent = withSite;
  document.getElementById("instaCount").textContent = withInsta;
  document.getElementById("emailCount").textContent = withEmail;
}

function filterResults(filter) {
  currentFilter = filter;

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");

  renderResults();
}

function applyFilters(list) {
  let filtered = list;

  if (currentFilter === "no-website") {
    filtered = filtered.filter((p) => !p.hasWebsite);
  } else if (currentFilter === "with-website") {
    filtered = filtered.filter((p) => p.hasWebsite);
  } else if (currentFilter === "has-instagram") {
    filtered = filtered.filter((p) => p.instagram);
  } else if (currentFilter === "has-email") {
    filtered = filtered.filter((p) => p.email);
  }

  if (minRating > 0) {
    filtered = filtered.filter((p) => (p.rating || 0) >= minRating);
  }
  if (minReviews > 0) {
    filtered = filtered.filter((p) => (p.totalRatings || 0) >= minReviews);
  }
  if (minScore > 0) {
    filtered = filtered.filter((p) => (p.score || 0) >= minScore);
  }

  return filtered;
}

function renderResults() {
  const container = document.getElementById("results");
  const filtered = applyFilters(allResults);

  container.innerHTML = filtered.map((place) => {
    const websiteClass = place.hasWebsite ? "has-website" : "no-website";
    const stars = place.rating
      ? "★".repeat(Math.round(place.rating)) + "☆".repeat(5 - Math.round(place.rating))
      : "Sem avaliação";
    const scoreInfo = getScoreLabel(place.score);

    return `
      <div class="place-card ${websiteClass}">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
          <div class="place-name">${escapeHtml(place.name)}</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="score-badge ${scoreInfo.class}">${place.score}pts</span>
            ${place.hasWebsite
              ? '<span class="badge has-site-badge">Tem Site</span>'
              : '<span class="badge prospect">Prospect</span>'
            }
          </div>
        </div>
        <div class="place-address">${escapeHtml(place.address || "Endereço não disponível")}</div>
        <div class="score-bar-container">
          <div class="score-bar ${scoreInfo.class}" style="width:${place.score}%"></div>
        </div>
        <div class="place-details">
          <div class="detail-row">
            <span class="label">Prioridade:</span>
            <span class="value ${scoreInfo.class}">${scoreInfo.text}</span>
          </div>
          <div class="detail-row">
            <span class="label">Telefone:</span>
            <span class="value">${place.phone ? escapeHtml(place.phone) : "Não informado"}</span>
          </div>
          <div class="detail-row">
            <span class="label">Website:</span>
            <span class="value ${place.hasWebsite ? 'has-site' : 'no-site'}">
              ${place.hasWebsite
                ? `<a href="${escapeHtml(place.website)}" target="_blank" style="color:#3fb950">${truncateUrl(place.website)}</a>`
                : "Sem website"
              }
            </span>
          </div>
          <div class="detail-row">
            <span class="label">Avaliação:</span>
            <span class="value"><span class="rating">${stars}</span> ${place.rating ? `(${place.rating} - ${place.totalRatings} avaliações)` : ""}</span>
          </div>
          ${place.category ? `
          <div class="detail-row">
            <span class="label">Categoria:</span>
            <span class="value">${escapeHtml(place.category)}</span>
          </div>
          ` : ""}
          ${place.instagram ? `
          <div class="detail-row">
            <span class="label">Instagram:</span>
            <span class="value"><a href="${escapeHtml(place.instagram)}" target="_blank" class="social-link instagram-link">@${extractHandle(place.instagram)}</a></span>
          </div>
          ` : ""}
          ${place.facebook ? `
          <div class="detail-row">
            <span class="label">Facebook:</span>
            <span class="value"><a href="${escapeHtml(place.facebook)}" target="_blank" class="social-link facebook-link">${extractHandle(place.facebook)}</a></span>
          </div>
          ` : ""}
          ${place.linkedin ? `
          <div class="detail-row">
            <span class="label">LinkedIn:</span>
            <span class="value"><a href="${escapeHtml(place.linkedin)}" target="_blank" class="social-link linkedin-link">${extractHandle(place.linkedin)}</a></span>
          </div>
          ` : ""}
          ${place.github ? `
          <div class="detail-row">
            <span class="label">GitHub:</span>
            <span class="value"><a href="${escapeHtml(place.github)}" target="_blank" class="social-link github-link">${extractHandle(place.github)}</a></span>
          </div>
          ` : ""}
          ${place.email ? `
          <div class="detail-row">
            <span class="label">Email:</span>
            <span class="value"><a href="mailto:${escapeHtml(place.email)}" class="social-link email-link">${escapeHtml(place.email)}</a></span>
          </div>
          ` : ""}
        </div>
        ${place.hasWebsite && !place.email && !place.instagram ? `
        <div class="deep-scrape-bar">
          <button class="deep-scrape-btn" data-scrape-idx="${allResults.indexOf(place)}" onclick="deepScrapeContacts(${allResults.indexOf(place)})">
            Buscar email/Instagram no site
          </button>
        </div>
        ` : ""}
        ${!place.instagram ? `
        <div class="deep-scrape-bar">
          <button class="find-insta-btn" data-insta-idx="${allResults.indexOf(place)}" onclick="findInstagram(${allResults.indexOf(place)})">
            Buscar Instagram
          </button>
        </div>
        ` : ""}
        <div class="card-actions">
          ${place.phone ? `
            <a href="#" onclick="openWhatsAppModal('${escapeHtml(place.name.replace(/'/g, "\\'"))}', '${place.phone.replace(/\D/g, '')}'); return false;"
               class="action-btn whatsapp-btn">
              WhatsApp
            </a>
          ` : ""}
          ${place.instagram ? `
            <a href="${escapeHtml(place.instagram)}" target="_blank" class="action-btn instagram-action">
              Instagram
            </a>
          ` : ""}
          ${place.linkedin ? `
            <a href="${escapeHtml(place.linkedin)}" target="_blank" class="action-btn linkedin-action">
              LinkedIn
            </a>
          ` : ""}
          ${place.github ? `
            <a href="${escapeHtml(place.github)}" target="_blank" class="action-btn github-action">
              GitHub
            </a>
          ` : ""}
          ${place.email ? `
            <a href="mailto:${escapeHtml(place.email)}" class="action-btn email-action">
              Email
            </a>
          ` : ""}
          <a href="${place.mapsUrl}" target="_blank" class="action-btn maps-btn">
            Ver no Maps
          </a>
        </div>
      </div>
    `;
  }).join("");

  if (filtered.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#8b949e; padding:40px;">Nenhum resultado encontrado para este filtro.</p>';
  }
}

function exportCSV() {
  const noSite = allResults.filter((p) => !p.hasWebsite);

  if (noSite.length === 0) {
    showError("Nenhum negócio sem website para exportar.");
    return;
  }

  const headers = ["Nome", "Endereço", "Telefone", "Email", "Instagram", "Facebook", "LinkedIn", "GitHub", "Avaliação", "Qtd Avaliações", "Score", "Categoria", "Link Maps"];
  const rows = noSite.map((p) => [
    `"${(p.name || "").replace(/"/g, '""')}"`,
    `"${(p.address || "").replace(/"/g, '""')}"`,
    `"${p.phone || ""}"`,
    `"${p.email || ""}"`,
    `"${p.instagram || ""}"`,
    `"${p.facebook || ""}"`,
    `"${p.linkedin || ""}"`,
    `"${p.github || ""}"`,
    p.rating || "",
    p.totalRatings || 0,
    p.score || 0,
    `"${p.category || ""}"`,
    `"${p.mapsUrl || ""}"`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `prospects_sem_website_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

function extractHandle(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "").split("/").pop();
    return path || u.hostname;
  } catch {
    return url;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showError(msg) {
  const errorEl = document.getElementById("error");
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

// === FILTROS AVANÇADOS ===
function setupAdvancedFilters() {
  const ratingSlider = document.getElementById("minRating");
  const reviewsSlider = document.getElementById("minReviews");
  const scoreSlider = document.getElementById("minScore");

  if (ratingSlider) {
    ratingSlider.addEventListener("input", (e) => {
      minRating = parseFloat(e.target.value);
      document.getElementById("minRatingVal").textContent = minRating > 0 ? minRating.toFixed(1) : "Todas";
      renderResults();
    });
  }
  if (reviewsSlider) {
    reviewsSlider.addEventListener("input", (e) => {
      minReviews = parseInt(e.target.value);
      document.getElementById("minReviewsVal").textContent = minReviews > 0 ? minReviews + "+" : "Todas";
      renderResults();
    });
  }
  if (scoreSlider) {
    scoreSlider.addEventListener("input", (e) => {
      minScore = parseInt(e.target.value);
      document.getElementById("minScoreVal").textContent = minScore > 0 ? minScore + "+" : "Todos";
      renderResults();
    });
  }
}

// Inicializa filtros quando DOM estiver pronto
document.addEventListener("DOMContentLoaded", setupAdvancedFilters);
// Fallback se DOM já carregou
if (document.readyState !== "loading") setupAdvancedFilters();

// === BUSCAR INSTAGRAM ===
async function findInstagram(index) {
  const place = allResults[index];
  if (!place) return;

  const btn = document.querySelector(`[data-insta-idx="${index}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Buscando...";
  }

  try {
    // Extrai cidade do endereço
    const city = place.address ? place.address.split(",").slice(-2, -1)[0]?.trim() || "" : "";
    const res = await fetch(`/api/find-instagram?name=${encodeURIComponent(place.name)}&city=${encodeURIComponent(city)}`);
    const data = await res.json();

    if (res.ok && data.found && data.best) {
      allResults[index].instagram = data.best.url;
      allResults[index].instagramHandle = data.best.handle;
      allResults[index].instagramAlternatives = data.alternatives || [];
      allResults[index].score = calculateScore(allResults[index]);
      allResults.sort((a, b) => b.score - a.score);
      updateStats();
      renderResults();
    } else {
      if (btn) {
        btn.textContent = "Não encontrado";
        btn.classList.add("not-found");
      }
    }
  } catch {
    if (btn) btn.textContent = "Erro";
  }
}

let instaBatchRunning = false;

async function findAllInstagrams() {
  const prospects = allResults.filter((p) => !p.hasWebsite && !p.instagram);
  if (!prospects.length) return;

  const btn = document.getElementById("batchInstaBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = `Buscando 0/${prospects.length}...`;
  }
  instaBatchRunning = true;

  let found = 0;
  for (let i = 0; i < prospects.length; i++) {
    if (!instaBatchRunning) break;

    const realIndex = allResults.indexOf(prospects[i]);
    if (realIndex < 0) continue;

    if (btn) btn.textContent = `Buscando ${i + 1}/${prospects.length}... (${found} encontrados)`;

    try {
      const city = prospects[i].address ? prospects[i].address.split(",").slice(-2, -1)[0]?.trim() || "" : "";
      const res = await fetch(`/api/find-instagram?name=${encodeURIComponent(prospects[i].name)}&city=${encodeURIComponent(city)}`);
      const data = await res.json();

      if (res.ok && data.found && data.best) {
        allResults[realIndex].instagram = data.best.url;
        allResults[realIndex].instagramHandle = data.best.handle;
        allResults[realIndex].score = calculateScore(allResults[realIndex]);
        found++;
        updateStats();
        renderResults();
      }
    } catch {}

    // Delay entre buscas para não ser bloqueado pelo Google
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
  }

  allResults.sort((a, b) => b.score - a.score);
  updateStats();
  renderResults();

  if (btn) {
    btn.disabled = false;
    btn.textContent = `Busca finalizada! ${found} Instagram(s) encontrado(s)`;
    setTimeout(() => {
      btn.textContent = "Buscar Instagram de Todos";
      btn.classList.remove("running");
    }, 4000);
  }
  instaBatchRunning = false;
}

function stopInstaBatch() {
  instaBatchRunning = false;
}

// === WHATSAPP MODAL ===
function openWhatsAppModal(businessName, phone) {
  const modal = document.getElementById("whatsappModal");
  const msgEl = document.getElementById("whatsappMessage");

  const template = `Olá! Tudo bem? 😊

Sou desenvolvedor web e encontrei o *${businessName}* no Google Maps. Vi que vocês têm ótimas avaliações!

Notei que ainda não possuem um website e gostaria de oferecer meus serviços. Um site profissional pode:

✅ Atrair mais clientes pelo Google
✅ Passar mais credibilidade
✅ Mostrar seus produtos/serviços 24h

Posso preparar uma proposta personalizada para vocês. Podemos conversar?`;

  msgEl.value = template;
  document.getElementById("whatsappPhone").value = phone;
  document.getElementById("whatsappBusiness").textContent = businessName;
  modal.style.display = "flex";
}

function closeWhatsAppModal() {
  document.getElementById("whatsappModal").style.display = "none";
}

function sendWhatsApp() {
  const phone = document.getElementById("whatsappPhone").value;
  const msg = document.getElementById("whatsappMessage").value;
  const url = `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
  closeWhatsAppModal();
}

function copyWhatsAppMessage() {
  const msg = document.getElementById("whatsappMessage").value;
  navigator.clipboard.writeText(msg).then(() => {
    const btn = document.querySelector(".copy-msg-btn");
    const original = btn.textContent;
    btn.textContent = "Copiado!";
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

// Fecha modal ao clicar fora
document.addEventListener("click", (e) => {
  const modal = document.getElementById("whatsappModal");
  if (e.target === modal) closeWhatsAppModal();
});
