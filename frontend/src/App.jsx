import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function AuthPanel({ onClose, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const data = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ ...(mode === "register" ? { name } : {}), email, password }) });
      onSuccess(data.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button className="modal-backdrop" onClick={onClose} aria-label="Close authentication" />
    <section className="auth-panel">
      <button className="close-button" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">SHOPEASE ACCOUNT</p>
      <h2 id="auth-title">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
      <p className="muted">{mode === "login" ? "Log in to view and manage your shopping cart." : "Register to save your cart between visits."}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <label>Your name<input required minLength="2" maxLength="60" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></label>}
        <label>Email address<input required type="email" maxLength="120" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input required type="password" minLength={mode === "register" ? 8 : 1} maxLength="72" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} /></label>
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="switch-auth">{mode === "login" ? "New to ShopEase?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create account" : "Log in"}</button></p>
    </section>
  </div>;
}

function ProductModal({ product, onClose, onAdd }) {
  if (!product) return null;
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-name">
    <button className="modal-backdrop" onClick={onClose} aria-label="Close details" />
    <article className="modal-panel">
      <button className="close-button" onClick={onClose} aria-label="Close details">×</button>
      <div className="detail-layout">
        <img src={product.image_url} alt={product.name} onError={e => { e.currentTarget.src = "https://placehold.co/700x500/f1f2ed/315c45?text=Product"; }} />
        <div><span className="category">{product.category}</span><h2 id="modal-name">{product.name}</h2><p>{product.description}</p><div className="detail-price">{money(product.price)}</div><p className="stock-note">{product.stock > 0 ? `${product.stock} available` : "Out of stock"}</p><button className="primary-button" disabled={product.stock < 1} onClick={() => onAdd(product)}>Add to cart</button></div>
      </div>
    </article>
  </div>;
}

function ProductCard({ product, onDetails, onAdd }) {
  return <article className="product-card">
    <img className="product-image" src={product.image_url} alt={product.name} loading="lazy" onError={e => { e.currentTarget.src = "https://placehold.co/700x500/f1f2ed/315c45?text=Product"; }} />
    <div className="product-info"><span className="category">{product.category}</span><h3>{product.name}</h3><p className="description">{product.description}</p><div className="product-bottom"><span className="price">{money(product.price)}</span><button className="details-button" onClick={() => onDetails(product)}>Details</button></div><button className="add-button" disabled={product.stock < 1} onClick={() => onAdd(product)}>{product.stock < 1 ? "Out of stock" : "＋ Add to cart"}</button></div>
  </article>;
}

function CartPanel({ cart, onClose, onQuantity, onRemove, busy }) {
  return <div className="drawer-layer"><button className="drawer-backdrop" onClick={onClose} aria-label="Close cart" /><aside className="cart-drawer" aria-label="Shopping cart">
    <div className="drawer-heading"><div><p className="eyebrow">YOUR BAG</p><h2>Shopping cart</h2></div><button className="close-button" onClick={onClose} aria-label="Close cart">×</button></div>
    {cart.items.length === 0 ? <div className="cart-empty"><span>🛍️</span><h3>Your cart is empty</h3><p>Add something you like from the collection.</p></div> : <>
      <div className="cart-items">{cart.items.map(item => <article className="cart-item" key={item.product_id}><img src={item.image_url} alt={item.name} /><div className="cart-item-main"><h3>{item.name}</h3><p>{money(item.price)} each</p><div className="quantity-control"><button disabled={busy || item.quantity <= 1} onClick={() => onQuantity(item.product_id, item.quantity - 1)}>−</button><span>{item.quantity}</span><button disabled={busy || item.quantity >= item.stock} onClick={() => onQuantity(item.product_id, item.quantity + 1)}>＋</button><button className="remove-button" disabled={busy} onClick={() => onRemove(item.product_id)}>Remove</button></div></div><strong>{money(item.subtotal)}</strong></article>)}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>{money(cart.total)}</strong></div><p>Prices and totals are calculated by the server.</p><button className="primary-button" disabled>Checkout (not part of this lab)</button></div>
    </>}
  </aside></div>;
}

export default function App() {
  const [products, setProducts] = useState([]); const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [user, setUser] = useState(null); const [authOpen, setAuthOpen] = useState(false); const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState({ items: [], total: 0, itemCount: 0 }); const [notice, setNotice] = useState(""); const [cartBusy, setCartBusy] = useState(false);

  const refreshCart = useCallback(async () => { if (!user) return; try { setCart(await api("/api/cart")); } catch (err) { setNotice(err.message); } }, [user]);
  useEffect(() => { api("/api/auth/me").then(data => setUser(data.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { api("/api/categories").then(data => setCategories(data.categories)).catch(err => setError(err.message)); }, []);
  useEffect(() => { if (user) refreshCart(); else setCart({ items: [], total: 0, itemCount: 0 }); }, [user, refreshCart]);
  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try { const params = new URLSearchParams(); if (search.trim()) params.set("search", search.trim()); if (category !== "All") params.set("category", category); const response = await fetch(`/api/products?${params}`, { signal: controller.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load products."); setProducts(data.products); }
      catch (err) { if (err.name !== "AbortError") setError(err.message); } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, category]);

  async function addToCart(product) {
    setSelectedProduct(null);
    if (!user) { setAuthOpen(true); setNotice("Log in or create an account before adding items to your cart."); return; }
    try { setCart(await api("/api/cart/items", { method: "POST", body: JSON.stringify({ productId: product.id, quantity: 1 }) })); setNotice(`${product.name} added to your cart.`); }
    catch (err) { setNotice(err.message); }
  }
  async function updateQuantity(productId, quantity) {
    setCartBusy(true); try { setCart(await api(`/api/cart/items/${productId}`, { method: "PATCH", body: JSON.stringify({ quantity }) })); } catch (err) { setNotice(err.message); } finally { setCartBusy(false); }
  }
  async function removeItem(productId) {
    setCartBusy(true); try { setCart(await api(`/api/cart/items/${productId}`, { method: "DELETE" })); } catch (err) { setNotice(err.message); } finally { setCartBusy(false); }
  }
  async function logout() { try { await api("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); setCartOpen(false); setNotice("You have been logged out."); } catch (err) { setNotice(err.message); } }
  const greeting = useMemo(() => user?.name?.split(" ")[0] || "", [user]);

  return <>
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">S</span> ShopEase</a><span className="top-note">Thoughtful picks. Everyday prices.</span><nav className="account-nav">{user ? <><span className="welcome-user">Hi, {greeting}</span><button className="nav-button" onClick={() => setCartOpen(true)}>Cart <b>{cart.itemCount}</b></button><button className="text-button" onClick={logout}>Log out</button></> : <><button className="text-button" onClick={() => { setAuthOpen(true); setNotice(""); }}>Log in</button><button className="nav-button" onClick={() => { setAuthOpen(true); setNotice(""); }}>Sign up</button></>}</nav></header>
    <main className="container"><section className="hero"><div><p className="eyebrow">THE EVERYDAY STORE</p><h1>Find your next<br /><span>favourite thing.</span></h1><p className="hero-copy">A little something for work, home and everything in between.</p></div><div className="hero-art" aria-hidden="true"><div className="art-circle" /><div className="art-card art-card-one">✦</div><div className="art-card art-card-two">SHOP<br />GOOD</div></div></section>
      <section className="catalogue"><div className="section-heading"><div><p className="eyebrow">CURATED FOR YOU</p><h2>Explore products</h2></div><span className="result-count">{loading ? "Loading products…" : `${products.length} product${products.length === 1 ? "" : "s"}`}</span></div>
        <div className="toolbar"><label className="search-wrap"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} /></label><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category"><option value="All">All categories</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}{error && <p className="error-message" role="alert">{error}</p>}
        {loading ? <div className="loading">Loading the collection...</div> : products.length === 0 ? <div className="empty-state">No products found. Try another search.</div> : <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} onDetails={setSelectedProduct} onAdd={addToCart} />)}</div>}
      </section>
    </main><footer>© 2026 ShopEase <span>React · Node.js · Express · SQLite · Prometheus · Grafana</span></footer>
    <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addToCart} />
    {authOpen && <AuthPanel onClose={() => setAuthOpen(false)} onSuccess={nextUser => { setUser(nextUser); setAuthOpen(false); setNotice(`Welcome, ${nextUser.name}!`); }} />}
    {cartOpen && <CartPanel cart={cart} onClose={() => setCartOpen(false)} onQuantity={updateQuantity} onRemove={removeItem} busy={cartBusy} />}
  </>;
}
