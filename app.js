const fallbackProducts = [
  {
    id: 1,
    name: "Mini Tasinabilir Blender",
    score: 84,
    trend7d: 22,
    margin: 31,
    status: "Serbest",
    note: "TikTok trend ivmesi guclu, TR rekabet orta.",
    trendDaily: [12, 14, 15, 16, 17, 20, 22],
    docTime: "Belge gerekmiyor",
    competitors: 23,
  },
  {
    id: 2,
    name: "LED Terapi Maske",
    score: 71,
    trend7d: 11,
    margin: 24,
    status: "Belge Gerekli",
    note: "Kozmetik/cihaz sinifinda uygunluk belgesi gerekebilir.",
    trendDaily: [8, 8, 9, 9, 10, 10, 11],
    docTime: "7-15 is gunu",
    competitors: 14,
  },
  {
    id: 3,
    name: "Manyetik Telefon Tutucu",
    score: 66,
    trend7d: 9,
    margin: 19,
    status: "Serbest",
    note: "Hepsiburada ve N11 tarafinda fiyat yarisi yuksek.",
    trendDaily: [5, 6, 7, 7, 8, 9, 9],
    docTime: "Belge gerekmiyor",
    competitors: 39,
  },
  {
    id: 4,
    name: "Nikotin Elektronik Puff",
    score: 58,
    trend7d: 13,
    margin: 28,
    status: "Yasak",
    note: "Turkiye satisinda mevzuat nedeniyle kisitli/yasak sinifta.",
    trendDaily: [7, 8, 9, 10, 11, 12, 13],
    docTime: "Satisa uygun degil",
    competitors: 2,
  },
  {
    id: 5,
    name: "Akilli Evcil Hayvan Kamerasi",
    score: 79,
    trend7d: 17,
    margin: 27,
    status: "Belirsiz",
    note: "Ithalat ve teknik uygunluk kosullari manuel kontrol edilmeli.",
    trendDaily: [10, 12, 12, 13, 14, 16, 17],
    docTime: "Kontrol gerekli",
    competitors: 11,
  },
  {
    id: 6,
    name: "Boyun Sogutucu Fan",
    score: 88,
    trend7d: 29,
    margin: 34,
    status: "Serbest",
    note: "Yaz sezonu oncesi erken firsat penceresi.",
    trendDaily: [14, 15, 17, 19, 22, 25, 29],
    docTime: "Belge gerekmiyor",
    competitors: 9,
  },
];

const fallbackEmailSettings = {
  frequency: "daily",
  trendThreshold: 15,
  scoreDelta: 10,
  complianceAlerts: true,
  enabled: true,
};

const state = {
  products: [],
  watchlist: new Set(),
  emailSettings: { ...fallbackEmailSettings },
};

const rows = document.getElementById("productRows");
const watchlistItems = document.getElementById("watchlistItems");
const alerts = document.getElementById("alerts");

const statusFilter = document.getElementById("statusFilter");
const scoreFilter = document.getElementById("scoreFilter");
const scoreValue = document.getElementById("scoreValue");
const showBanned = document.getElementById("showBanned");

const kpiWatchlist = document.getElementById("kpi-watchlist");
const kpiOpportunities = document.getElementById("kpi-opportunities");
const kpiBanned = document.getElementById("kpi-banned");
const kpiDocs = document.getElementById("kpi-docs");

const emailForm = document.getElementById("emailForm");
const emailFrequency = document.getElementById("emailFrequency");
const trendThreshold = document.getElementById("trendThreshold");
const scoreDelta = document.getElementById("scoreDelta");
const complianceSwitch = document.getElementById("complianceSwitch");
const emailEnabled = document.getElementById("emailEnabled");
const emailStatus = document.getElementById("emailStatus");
const apiStatus = document.getElementById("apiStatus");

const drawer = document.getElementById("drawer");
const closeDrawer = document.getElementById("closeDrawer");
const drawerTitle = document.getElementById("drawerTitle");
const drawerNote = document.getElementById("drawerNote");
const drawerScore = document.getElementById("drawerScore");
const drawerStatus = document.getElementById("drawerStatus");
const drawerDocTime = document.getElementById("drawerDocTime");
const drawerCompetitors = document.getElementById("drawerCompetitors");
const trendBars = document.getElementById("trendBars");

const scanBtn = document.getElementById("scanBtn");
const weeklyBtn = document.getElementById("weeklyBtn");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockApi = {
  async getProducts() {
    await wait(350);
    const response = await fetch("./data/products.json", { cache: "no-store" });
    if (!response.ok) throw new Error("products.json okunamadi");
    return response.json();
  },
  async getEmailSettings() {
    await wait(500);
    const response = await fetch("./data/email-settings.json", { cache: "no-store" });
    if (!response.ok) throw new Error("email-settings.json okunamadi");
    return response.json();
  },
  async saveEmailSettings(payload) {
    await wait(420);
    return {
      ...payload,
      updatedAt: new Date().toISOString(),
    };
  },
};

function statusBadgeClass(status) {
  if (status === "Belge Gerekli") return "Belge";
  return status;
}

function getFilteredProducts() {
  const selectedStatus = statusFilter.value;
  const minScore = Number(scoreFilter.value);

  return state.products.filter((p) => {
    if (!showBanned.checked && p.status === "Yasak") return false;
    if (selectedStatus !== "all" && p.status !== selectedStatus) return false;
    if (p.score < minScore) return false;
    return true;
  });
}

function renderKPIs() {
  const opportunities = state.products.filter((p) => p.trend7d >= 15 && p.score >= 75).length;
  const bannedCount = state.products.filter((p) => p.status === "Yasak").length;
  const docsCount = state.products.filter((p) => p.status === "Belge Gerekli").length;

  kpiWatchlist.textContent = String(state.watchlist.size);
  kpiOpportunities.textContent = String(opportunities);
  kpiBanned.textContent = String(bannedCount);
  kpiDocs.textContent = String(docsCount);
}

function renderWatchlist() {
  watchlistItems.innerHTML = "";

  if (state.watchlist.size === 0) {
    const li = document.createElement("li");
    li.textContent = "Henuz takip edilen urun yok. Tablodan Takibe Al sec.";
    watchlistItems.appendChild(li);
    return;
  }

  [...state.watchlist]
    .map((id) => state.products.find((p) => p.id === id))
    .filter(Boolean)
    .forEach((product) => {
      const li = document.createElement("li");
      li.textContent = `${product.name} | Trend 7g: +%${product.trend7d} | DropScore: ${product.score} | Durum: ${product.status}`;
      watchlistItems.appendChild(li);
    });
}

function renderAlerts() {
  alerts.innerHTML = "";
  const trendItems = [...state.watchlist]
    .map((id) => state.products.find((p) => p.id === id))
    .filter((p) => p && p.trend7d >= state.emailSettings.trendThreshold);

  if (trendItems.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Takip urunlerinde esigi asan kritik trend degisimi yok.";
    alerts.appendChild(li);
  } else {
    trendItems.forEach((product) => {
      const li = document.createElement("li");
      li.textContent = `${product.name}: Trend +%${product.trend7d} (esik %${state.emailSettings.trendThreshold})`;
      alerts.appendChild(li);
    });
  }

  if (state.emailSettings.complianceAlerts) {
    const compliance = state.products.filter((p) => p.status === "Belge Gerekli" || p.status === "Yasak");
    const li = document.createElement("li");
    li.textContent = `Uyumluluk alarmi aktif. Izlenen ${compliance.length} urunde hukuki kontrol oneriliyor.`;
    alerts.appendChild(li);
  }
}

function toggleWatchlist(productId) {
  if (state.watchlist.has(productId)) {
    state.watchlist.delete(productId);
  } else {
    state.watchlist.add(productId);
  }
  renderAll();
}

function openDrawer(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  drawerTitle.textContent = product.name;
  drawerNote.textContent = product.note;
  drawerScore.textContent = String(product.score);
  drawerStatus.textContent = product.status;
  drawerDocTime.textContent = product.docTime;
  drawerCompetitors.textContent = String(product.competitors);

  trendBars.innerHTML = "";
  const max = Math.max(...product.trendDaily, 1);
  product.trendDaily.forEach((value) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.round((value / max) * 120)}px`;

    const label = document.createElement("span");
    label.textContent = String(value);
    bar.appendChild(label);
    trendBars.appendChild(bar);
  });

  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeProductDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function renderTable() {
  const data = getFilteredProducts();
  rows.innerHTML = "";

  if (data.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6">Bu filtreyle urun bulunamadi.</td>`;
    rows.appendChild(tr);
    return;
  }

  data.forEach((p) => {
    const tr = document.createElement("tr");
    const inWatchlist = state.watchlist.has(p.id);
    tr.innerHTML = `
      <td><strong>${p.name}</strong><br><small>${p.note}</small></td>
      <td>${p.score}</td>
      <td>+%${p.trend7d}</td>
      <td>%${p.margin}</td>
      <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
      <td>
        <div class="action-row">
          <button class="small-btn" data-action="watch" data-id="${p.id}">${inWatchlist ? "Takipten Cikar" : "Takibe Al"}</button>
          <button class="small-btn ghost" data-action="detail" data-id="${p.id}">Detay</button>
        </div>
      </td>
    `;
    rows.appendChild(tr);
  });

  rows.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      const action = btn.getAttribute("data-action");
      if (action === "watch") toggleWatchlist(id);
      if (action === "detail") openDrawer(id);
    });
  });
}

function renderEmailForm() {
  emailFrequency.value = state.emailSettings.frequency;
  trendThreshold.value = String(state.emailSettings.trendThreshold);
  scoreDelta.value = String(state.emailSettings.scoreDelta);
  complianceSwitch.checked = !!state.emailSettings.complianceAlerts;
  emailEnabled.checked = !!state.emailSettings.enabled;
  emailStatus.textContent = `Bildirim modu: ${state.emailSettings.frequency === "daily" ? "Gunluk" : "Haftalik"}. Son guncelleme hazir.`;
}

function renderAll() {
  scoreValue.textContent = `${scoreFilter.value}+`;
  renderTable();
  renderWatchlist();
  renderKPIs();
  renderAlerts();
}

function bindEvents() {
  [statusFilter, scoreFilter, showBanned].forEach((el) => {
    el.addEventListener("input", renderAll);
    el.addEventListener("change", renderAll);
  });

  closeDrawer.addEventListener("click", closeProductDrawer);
  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) closeProductDrawer();
  });

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      frequency: emailFrequency.value,
      trendThreshold: Number(trendThreshold.value),
      scoreDelta: Number(scoreDelta.value),
      complianceAlerts: complianceSwitch.checked,
      enabled: emailEnabled.checked,
    };

    emailStatus.textContent = "Ayarlar kaydediliyor...";
    const saved = await mockApi.saveEmailSettings(payload);
    state.emailSettings = { ...saved };

    const humanDate = new Date(saved.updatedAt).toLocaleString("tr-TR");
    emailStatus.textContent = `Ayarlar kaydedildi. Son guncelleme: ${humanDate}`;
    renderAlerts();
  });

  scanBtn.addEventListener("click", () => {
    apiStatus.textContent = "API: yeni tarama kuyruga alindi (mock).";
  });

  weeklyBtn.addEventListener("click", () => {
    emailFrequency.value = "weekly";
    emailForm.requestSubmit();
  });
}

async function init() {
  bindEvents();
  apiStatus.textContent = "API: baglaniyor...";

  try {
    const [products, email] = await Promise.all([
      mockApi.getProducts(),
      mockApi.getEmailSettings(),
    ]);
    state.products = products;
    state.emailSettings = email;
    apiStatus.textContent = "API: baglandi (JSON kaynakli mock).";
  } catch (_error) {
    state.products = fallbackProducts;
    state.emailSettings = fallbackEmailSettings;
    apiStatus.textContent = "API: JSON okunamadi, fallback veri kullaniliyor.";
  }

  renderEmailForm();
  renderAll();
}

init();
