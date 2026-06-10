let cart = [];

const productImages = {
  1: '/images/apples.jpg',
  2: '/images/bananas.jpg',
  3: '/images/mangoes.jpg',
  4: '/images/oranges.jpg',
  5: '/images/strawberries.jpg',
  6: '/images/pineapple.jpg',
  7: '/images/lemons.jpg',
  8: '/images/watermelon.jpg',
  9: '/images/grapes.jpg',
  10: '/images/peaches.jpg',
  11: '/images/avocados.jpg',
  12: '/images/passion.jpg',
};

// ── Load products from API ──
async function loadProducts(category = 'All') {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '<div class="loading">🌿 Loading fresh fruits...</div>';
  try {
    const url = category === 'All' ? '/api/products' : `/api/products?category=${encodeURIComponent(category)}`;
    const res = await fetch(url);
    const products = await res.json();
    renderProducts(products);
  } catch (e) {
    grid.innerHTML = '<div class="loading">❌ Failed to load products. Is the server running?</div>';
  }
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (products.length === 0) {
    grid.innerHTML = '<div class="loading">No products found in this category.</div>';
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="product-img" style="padding:0;overflow:hidden">
        <img src="${productImages[p.id]}" alt="${p.name}"
          style="width:100%;height:100%;object-fit:cover;transition:transform .3s"
          onmouseover="this.style.transform='scale(1.05)'"
          onmouseout="this.style.transform='scale(1)'"
          onerror="this.parentElement.innerHTML='<span style=font-size:72px>${p.emoji}</span>'"
        />
      </div>
      <div class="product-body">
        <span class="product-badge ${p.badge === 'Sale' ? 'sale' : ''}">${p.badge}</span>
        <div class="product-name">${p.name}</div>
        <div class="product-origin">📍 ${p.origin}</div>
        <div class="product-footer">
          <div class="product-price">
            RWF ${p.price.toLocaleString()}
            <span class="product-unit">/ ${p.unit}</span>
          </div>
          <button class="add-btn" onclick="addToCart(${p.id}, '${p.name}', '${p.emoji}', ${p.price}, '${p.unit}')">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Category filter ──
function filterCat(cat, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadProducts(cat);
}

// ── Cart ──
function addToCart(id, name, emoji, price, unit) {
  const existing = cart.find(i => i.id === id);
  if (existing) { existing.qty++; }
  else { cart.push({ id, name, emoji, price, unit, qty: 1 }); }
  updateCartBadge();
  showToast('🛒 ' + name + ' added to cart!');
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCartBadge();
  renderCartItems();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  document.getElementById('cartBadge').textContent = cart.reduce((s, i) => s + i.qty, 0);
}

function renderCartItems() {
  const el = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  if (cart.length === 0) {
    el.innerHTML = '<div class="cart-empty"><span class="emoji">🧺</span><p>Your cart is empty</p></div>';
    footer.style.display = 'none';
    return;
  }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  el.innerHTML = cart.map(i => `
    <div class="cart-item">
      <div class="item-emoji">
        <img src="${productImages[i.id]}" alt="${i.name}"
          style="width:100%;height:100%;object-fit:cover;border-radius:10px"
          onerror="this.parentElement.innerHTML='${i.emoji}'"
        />
      </div>
      <div class="item-info">
        <div class="item-name">${i.name}</div>
        <div class="item-price">RWF ${(i.price * i.qty).toLocaleString()}</div>
        <div class="item-qty">
          <button class="qty-btn" onclick="changeQty(${i.id}, -1)">−</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" onclick="changeQty(${i.id}, 1)">+</button>
          <span style="color:var(--gray);font-size:12px;margin-left:4px">/ ${i.unit}</span>
        </div>
      </div>
      <button class="remove-btn" onclick="removeFromCart(${i.id})">🗑</button>
    </div>
  `).join('');
  document.getElementById('cartTotal').textContent = 'RWF ' + total.toLocaleString();
  footer.style.display = 'block';
}

function openCart() {
  renderCartItems();
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}

function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

function goToCheckout() {
  if (cart.length === 0) { showToast('⚠️ Your cart is empty!'); return; }
  localStorage.setItem('freshmart_cart', JSON.stringify(cart));
  window.location.href = '/pages/checkout.html';
}

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Init ──
loadProducts();