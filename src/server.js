const express = require("express");
const cors = require("cors");
const path = require("path");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=pt-BR"],
    });
  }
  return browser;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.get("/api/search", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Parâmetro 'query' é obrigatório" });
  }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    // Abre Google Maps com a busca
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Espera a lista de resultados carregar
    await delay(3000);

    // Tenta aceitar cookies se aparecer
    try {
      const acceptBtn = await page.$('button[aria-label="Aceitar tudo"]');
      if (acceptBtn) await acceptBtn.click();
      await delay(1000);
    } catch {}

    // Scroll na lista para carregar mais resultados
    const scrollable = await page.$('div[role="feed"]');
    if (scrollable) {
      for (let i = 0; i < 5; i++) {
        await page.evaluate((el) => {
          el.scrollBy(0, 1000);
        }, scrollable);
        await delay(1500);
      }
    }

    // Extrai os links de cada lugar
    const placeLinks = await page.evaluate(() => {
      const links = [];
      const items = document.querySelectorAll('a[href*="/maps/place/"]');
      const seen = new Set();
      items.forEach((a) => {
        const href = a.href;
        if (href && !seen.has(href)) {
          seen.add(href);
          links.push(href);
        }
      });
      return links;
    });

    console.log(`Encontrados ${placeLinks.length} lugares. Buscando detalhes...`);

    // Visita cada lugar para pegar detalhes
    const results = [];
    for (let i = 0; i < placeLinks.length; i++) {
      try {
        console.log(`  [${i + 1}/${placeLinks.length}] Buscando detalhes...`);
        await page.goto(placeLinks[i], { waitUntil: "networkidle2", timeout: 20000 });
        await delay(2000);

        const placeData = await page.evaluate(() => {
          const getName = () => {
            const el = document.querySelector("h1");
            return el ? el.textContent.trim() : null;
          };

          const getAddress = () => {
            const btn = document.querySelector('button[data-item-id="address"]');
            if (btn) return btn.textContent.trim();
            const el = document.querySelector('[data-item-id="address"] .fontBodyMedium');
            return el ? el.textContent.trim() : null;
          };

          const getPhone = () => {
            const btn = document.querySelector('button[data-item-id*="phone"]');
            if (btn) return btn.textContent.trim();
            return null;
          };

          const getWebsite = () => {
            const btn = document.querySelector('a[data-item-id="authority"]');
            if (btn) return btn.href || null;
            const link = document.querySelector('button[data-item-id="authority"]');
            if (link) return link.textContent.trim();
            return null;
          };

          const getRating = () => {
            const el = document.querySelector('div.fontDisplayLarge');
            if (el) {
              const num = parseFloat(el.textContent.replace(",", "."));
              return isNaN(num) ? null : num;
            }
            return null;
          };

          const getTotalRatings = () => {
            const el = document.querySelector('button[jsaction*="reviewChart"] span');
            if (el) {
              const text = el.textContent.replace(/[^\d]/g, "");
              return parseInt(text) || 0;
            }
            return 0;
          };

          const getCategory = () => {
            const el = document.querySelector('button[jsaction*="category"]');
            return el ? el.textContent.trim() : null;
          };

          const getSocialLinks = () => {
            const socials = { instagram: null, facebook: null, twitter: null, youtube: null, linkedin: null, github: null, email: null };
            // Busca todos os links na página do lugar
            const allLinks = document.querySelectorAll('a[href]');
            allLinks.forEach((a) => {
              const href = a.href || "";
              if (href.includes("instagram.com/") && !socials.instagram) {
                socials.instagram = href;
              } else if (href.includes("facebook.com/") && !socials.facebook) {
                socials.facebook = href;
              } else if ((href.includes("twitter.com/") || href.includes("x.com/")) && !socials.twitter) {
                socials.twitter = href;
              } else if (href.includes("youtube.com/") && !socials.youtube) {
                socials.youtube = href;
              } else if (href.includes("linkedin.com/") && !socials.linkedin) {
                socials.linkedin = href;
              } else if (href.includes("github.com/") && !socials.github) {
                socials.github = href;
              } else if (href.startsWith("mailto:") && !socials.email) {
                socials.email = href.replace("mailto:", "").split("?")[0];
              }
            });
            // Busca email em textos visíveis
            if (!socials.email) {
              const bodyText = document.body.innerText || "";
              const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
              if (emailMatch) socials.email = emailMatch[0];
            }
            return socials;
          };

          return {
            name: getName(),
            address: getAddress(),
            phone: getPhone(),
            website: getWebsite(),
            rating: getRating(),
            totalRatings: getTotalRatings(),
            category: getCategory(),
            socials: getSocialLinks(),
          };
        });

        if (placeData.name) {
          results.push({
            ...placeData,
            hasWebsite: !!placeData.website,
            mapsUrl: placeLinks[i],
          });
        }

        // Intervalo entre buscas para não ser bloqueado
        await delay(1000 + Math.random() * 1500);
      } catch (err) {
        console.log(`  Erro ao buscar detalhes: ${err.message}`);
      }
    }

    res.json({
      results,
      totalFound: results.length,
      withoutWebsite: results.filter((p) => !p.hasWebsite).length,
    });
  } catch (err) {
    console.error("Erro na busca:", err.message);
    res.status(500).json({ error: "Erro ao buscar dados", details: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// Busca email e redes sociais no site do negócio
app.get("/api/scrape-site", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Parâmetro 'url' é obrigatório" });
  }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    await delay(2000);

    const siteData = await page.evaluate(() => {
      const result = { emails: [], instagram: null, facebook: null, twitter: null, linkedin: null, github: null };

      // Busca emails em links mailto
      document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
        const email = a.href.replace("mailto:", "").split("?")[0].trim();
        if (email && !result.emails.includes(email)) result.emails.push(email);
      });

      // Busca emails no texto da página
      const bodyText = document.body.innerText || "";
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const matches = bodyText.match(emailRegex) || [];
      matches.forEach((email) => {
        const lower = email.toLowerCase();
        if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".svg")
            && !lower.endsWith(".webp") && !result.emails.includes(lower)) {
          result.emails.push(lower);
        }
      });

      // Busca redes sociais
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.href || "";
        if (href.includes("instagram.com/") && !result.instagram) {
          result.instagram = href;
        } else if (href.includes("facebook.com/") && !result.facebook) {
          result.facebook = href;
        } else if ((href.includes("twitter.com/") || href.includes("x.com/")) && !result.twitter) {
          result.twitter = href;
        } else if (href.includes("linkedin.com/") && !result.linkedin) {
          result.linkedin = href;
        } else if (href.includes("github.com/") && !result.github) {
          result.github = href;
        }
      });

      return result;
    });

    res.json(siteData);
  } catch (err) {
    res.status(500).json({ error: "Erro ao acessar site", details: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// Busca Instagram do negócio via Google
app.get("/api/find-instagram", async (req, res) => {
  const { name, city } = req.query;

  if (!name) {
    return res.status(400).json({ error: "Parâmetro 'name' é obrigatório" });
  }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    const searchQuery = `"${name}"${city ? ` ${city}` : ""} site:instagram.com`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=5&hl=pt-BR`;

    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    await delay(2000);

    // Tenta aceitar cookies do Google
    try {
      const acceptBtn = await page.$('button[id="L2AGLb"]');
      if (acceptBtn) {
        await acceptBtn.click();
        await delay(1000);
      }
    } catch {}

    const result = await page.evaluate((businessName) => {
      const links = document.querySelectorAll("a[href]");
      const candidates = [];

      links.forEach((a) => {
        const href = a.href || "";
        // Pega links do Instagram que são perfis (não posts, reels, etc)
        const match = href.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?(\?|$)/);
        if (match) {
          const handle = match[1].toLowerCase();
          // Ignora páginas genéricas do Instagram
          const ignore = ["p", "reel", "stories", "explore", "accounts", "directory", "about", "developer", "legal"];
          if (!ignore.includes(handle) && handle.length > 1) {
            // Pega o texto ao redor para verificar relevância
            const parentText = (a.closest("div") || a).textContent || "";
            candidates.push({
              url: `https://www.instagram.com/${handle}/`,
              handle: handle,
              context: parentText.substring(0, 200),
            });
          }
        }
      });

      if (!candidates.length) return null;

      // Tenta achar o mais relevante (nome parecido com o negócio)
      const nameLower = businessName.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

      // Prioriza handles que contenham parte do nome
      const scored = candidates.map((c) => {
        const handleClean = c.handle.replace(/[._]/g, "");
        let score = 0;
        if (handleClean.includes(nameLower) || nameLower.includes(handleClean)) score += 10;
        // Verifica partes do nome
        const nameParts = businessName.toLowerCase().split(/\s+/);
        nameParts.forEach((part) => {
          const partClean = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          if (partClean.length > 2 && c.handle.includes(partClean)) score += 3;
        });
        // Contexto menciona o nome
        const ctxLower = c.context.toLowerCase();
        if (ctxLower.includes(businessName.toLowerCase())) score += 5;
        return { ...c, score };
      });

      scored.sort((a, b) => b.score - a.score);

      // Retorna o melhor candidato e os outros como alternativas
      return {
        best: scored[0],
        alternatives: scored.slice(1, 3),
      };
    }, name);

    res.json({ found: !!result, ...result });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar Instagram", details: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// Fecha o browser ao encerrar
process.on("SIGINT", async () => {
  if (browser) await browser.close();
  process.exit();
});

app.listen(PORT, () => {
  console.log(`\n  Servidor rodando em http://localhost:${PORT}`);
  console.log(`  Abra o navegador e acesse http://localhost:${PORT}\n`);
});
