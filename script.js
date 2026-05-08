const API = "https://script.google.com/macros/s/AKfycbyHTK1hoyDVNNSeddY5dnD8v9plarVE4AhREy_nDTFvX-YbKRgZQ02U0VuT6cxkz-utcQ/exec";

const CACHE_KEY = "koncept_discount_data_cache_v2";
const CACHE_TIME_KEY = "koncept_discount_data_cache_time_v2";
const CACHE_DURATION = 30 * 1000;

const priceInput = document.getElementById("price");
const productSelect = document.getElementById("productSelect");
const discountTypesContainer = document.getElementById("discountTypes");
const cartList = document.getElementById("cartList");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");

const totalOriginalEl = document.getElementById("totalOriginal");
const totalDiscountEl = document.getElementById("totalDiscount");
const totalFinalEl = document.getElementById("totalFinal");

let appData = {
  discountTypes: [],
  products: []
};

let selectedDiscountKey = "";
let cart = [];

function getCachedData() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch (error) {
    console.error(error);
  }
}

function isCacheFresh() {
  const cachedTime = Number(localStorage.getItem(CACHE_TIME_KEY));

  if (!cachedTime) {
    return false;
  }

  return Date.now() - cachedTime < CACHE_DURATION;
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIME_KEY);
}

async function loadData(forceRefresh = false) {
  const cachedData = getCachedData();

  if (!forceRefresh && cachedData && cachedData.success) {
    applyData(cachedData);
  }

  if (!forceRefresh && cachedData && cachedData.success && isCacheFresh()) {
    setStatus("მონაცემები მზად არის");
    return;
  }

  try {
    setStatus("მონაცემები ახლდება...");

    const freshUrl = API + "?t=" + Date.now();

    const response = await fetch(freshUrl, {
      method: "GET",
      cache: "no-store"
    });

    const data = await response.json();

    if (!data || !data.success) {
      throw new Error(data && data.error ? data.error : "მონაცემების წამოღება ვერ მოხერხდა");
    }

    saveCache(data);
    applyData(data);
    setStatus("მონაცემები განახლებულია");

  } catch (error) {
    console.error(error);

    if (!cachedData) {
      setStatus("შეცდომა: მონაცემები ვერ ჩაიტვირთა");
    } else {
      setStatus("ინტერნეტის შეცდომა, ნაჩვენებია ძველი მონაცემები");
    }
  }
}

function applyData(data) {
  appData = {
    discountTypes: Array.isArray(data.discountTypes) ? data.discountTypes : [],
    products: Array.isArray(data.products) ? data.products : []
  };

  if (!selectedDiscountKey && appData.discountTypes.length) {
    selectedDiscountKey = appData.discountTypes[0].key;
  }

  renderProducts();
  renderDiscountTypes();
  renderCart();
  calculateTotals();
}

function renderProducts() {
  if (!appData.products.length) {
    productSelect.innerHTML = `<option value="">პროდუქცია არ არის დამატებული</option>`;
    return;
  }

  const currentValue = productSelect.value;

  productSelect.innerHTML = `
    <option value="">აირჩიე პროდუქცია</option>
    ${appData.products.map(product => {
      return `<option value="${escapeHtml(product.name)}">${escapeHtml(product.name)}</option>`;
    }).join("")}
  `;

  const stillExists = appData.products.some(product => product.name === currentValue);

  if (stillExists) {
    productSelect.value = currentValue;
  }
}

function renderDiscountTypes() {
  if (!appData.discountTypes.length) {
    discountTypesContainer.innerHTML = `<div class="empty">ფასდაკლების ტიპი არ არის დამატებული</div>`;
    return;
  }

  discountTypesContainer.innerHTML = appData.discountTypes.map(type => {
    const activeClass = type.key === selectedDiscountKey ? "active" : "";

    return `
      <button class="discount-btn ${activeClass}" type="button" data-key="${escapeHtml(type.key)}">
        <span class="discount-name">${escapeHtml(type.title)}</span>
      </button>
    `;
  }).join("");

  document.querySelectorAll(".discount-btn").forEach(button => {
    button.addEventListener("click", () => {
      selectedDiscountKey = button.dataset.key;

      document.querySelectorAll(".discount-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      button.classList.add("active");
      renderCart();
      calculateTotals();
    });
  });
}

function addItem() {
  const selectedProductName = productSelect.value;
  const price = parsePrice(priceInput.value);

  if (!selectedProductName) {
    setStatus("ჯერ აირჩიე პროდუქცია");
    productSelect.focus();
    return;
  }

  if (!price || price <= 0) {
    setStatus("ჩაწერე სწორი თანხა");
    priceInput.focus();
    return;
  }

  const product = findProduct(selectedProductName);

  if (!product) {
    setStatus("არჩეული პროდუქცია ვერ მოიძებნა");
    return;
  }

  cart.push({
    id: Date.now() + "_" + Math.random().toString(16).slice(2),
    productName: product.name,
    price: price
  });

  priceInput.value = "";
  priceInput.focus();

  setStatus("პროდუქცია დაემატა");
  renderCart();
  calculateTotals();
}

function removeItem(itemId) {
  cart = cart.filter(item => item.id !== itemId);
  renderCart();
  calculateTotals();
}

function clearAll() {
  cart = [];
  productSelect.value = "";
  priceInput.value = "";

  setStatus("გასუფთავებულია");
  renderCart();
  calculateTotals();
}

function renderCart() {
  if (!cart.length) {
    cartList.innerHTML = `<div class="empty">ჯერ პროდუქცია დამატებული არ არის</div>`;
    return;
  }

  cartList.innerHTML = cart.map(item => {
    const product = findProduct(item.productName);
    const percent = getProductDiscountPercent(product, selectedDiscountKey);
    const discountedAmount = item.price * percent / 100;
    const finalPrice = item.price - discountedAmount;

    return `
      <div class="cart-item">
        <div class="cart-main">
          <div class="cart-product">${escapeHtml(item.productName)}</div>
          <div class="cart-info">
            ${formatMoney(item.price)} ₾ → ${formatMoney(finalPrice)} ₾
          </div>
        </div>

        <button class="remove-btn" type="button" data-id="${escapeHtml(item.id)}">×</button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".remove-btn").forEach(button => {
    button.addEventListener("click", () => {
      removeItem(button.dataset.id);
    });
  });
}

function calculateTotals() {
  let totalOriginal = 0;
  let totalDiscount = 0;
  let totalFinal = 0;

  cart.forEach(item => {
    const product = findProduct(item.productName);
    const percent = getProductDiscountPercent(product, selectedDiscountKey);

    const discountedAmount = item.price * percent / 100;
    const finalPrice = item.price - discountedAmount;

    totalOriginal += item.price;
    totalDiscount += discountedAmount;
    totalFinal += finalPrice;
  });

  totalOriginalEl.textContent = formatMoney(totalOriginal) + " ₾";
  totalDiscountEl.textContent = formatMoney(totalDiscount) + " ₾";
  totalFinalEl.textContent = formatMoney(totalFinal) + " ₾";
}

function findProduct(productName) {
  return appData.products.find(product => product.name === productName);
}

function getProductDiscountPercent(product, discountKey) {
  if (!product || !product.discounts || !discountKey) {
    return 0;
  }

  if (!product.discounts[discountKey]) {
    return 0;
  }

  return Number(product.discounts[discountKey].percent) || 0;
}

function parsePrice(value) {
  const text = String(value || "")
    .replace(",", ".")
    .trim();

  const number = Number(text);

  if (isNaN(number)) {
    return 0;
  }

  return number;
}

function formatMoney(value) {
  const number = Number(value) || 0;

  return Math.round(number).toLocaleString("ka-GE");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

priceInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    addItem();
  }
});

addBtn.addEventListener("click", addItem);

clearBtn.addEventListener("click", clearAll);

refreshBtn.addEventListener("click", () => {
  clearCache();
  loadData(true);
});

document.addEventListener("gesturestart", function (event) {
  event.preventDefault();
});

loadData();
