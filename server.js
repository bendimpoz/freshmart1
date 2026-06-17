require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const db = new sqlite3.Database('./freshmart.db', (err) => {
  if (err) console.error(err.message);
  else console.log('✅ Connected to SQLite database');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT,
    price REAL NOT NULL,
    unit TEXT,
    origin TEXT,
    category TEXT,
    badge TEXT,
    stock INTEGER DEFAULT 100
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    city TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL,
    customer_id INTEGER,
    total REAL NOT NULL,
    payment_method TEXT,
    delivery_date TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (err) console.error(err.message);
    else if (row && row.count === 0) {
      const products = [
        ['Red Apples','🍎',2500,'kg','Rubavu, Rwanda','Apples & Pears','Organic'],
        ['Bananas','🍌',800,'bunch','Kirehe, Rwanda','Tropical','Best Seller'],
        ['Mangoes','🥭',3000,'kg','Kayonza, Rwanda','Tropical','Seasonal'],
        ['Oranges','🍊',1800,'kg','Musanze, Rwanda','Citrus','Organic'],
        ['Strawberries','🍓',4500,'punnet','Nyabihu, Rwanda','Berries','Fresh'],
        ['Pineapple','🍍',2000,'each','Bugesera, Rwanda','Tropical','Local'],
        ['Lemons','🍋',1200,'bag (6)','Gisagara, Rwanda','Citrus','Organic'],
        ['Watermelon','🍉',3500,'each','Kayonza, Rwanda','Tropical','Sale'],
        ['Grapes','🍇',5500,'kg','Imported (Kenya)','Berries','Premium'],
        ['Peaches','🍑',4000,'kg','Imported (SA)','Stone Fruits','Fresh'],
        ['Avocados','🥑',1500,'bag (4)','Nyamasheke, Rwanda','Tropical','Best Seller'],
        ['Passion Fruits','🟣',2200,'bag (10)','Gicumbi, Rwanda','Tropical','Local'],
      ];
      const stmt = db.prepare(`INSERT INTO products (name,emoji,price,unit,origin,category,badge) VALUES (?,?,?,?,?,?,?)`);
      products.forEach(p => stmt.run(p));
      stmt.finalize();
      console.log('✅ Products seeded');
    }
  });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.get('SELECT id FROM admins WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: 'Username already exists' });

    try {
      const hash = await bcrypt.hash(password, 10);
      db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, hash], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        req.session.userId = this.lastID;
        req.session.username = username;
        res.json({ success: true });
      });
    } catch (e) {
      res.status(500).json({ error: 'Hashing error' });
    }
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    req.session.userId = row.id;
    req.session.username = row.username;
    res.json({ success: true });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Failed to logout' });
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ id: req.session.userId, username: req.session.username });
  }
  res.status(401).json({ error: 'Unauthorized' });
});

app.get('/pages/admin.html', (req, res) => {
  if (req.session && req.session.userId) {
    return res.sendFile(path.join(__dirname, 'public', 'pages', 'admin.html'));
  }
  return res.redirect('/login.html');
});

app.get('/api/products', (req, res) => {
  const { category } = req.query;
  let query = 'SELECT * FROM products';
  let params = [];
  if (category && category !== 'All') {
    query += ' WHERE category = ?';
    params = [category];
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  });
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, emoji, price, unit, origin, category, badge, stock = 100 } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price are required' });

  db.run(
    'INSERT INTO products (name,emoji,price,unit,origin,category,badge,stock) VALUES (?,?,?,?,?,?,?,?)',
    [name, emoji, price, unit, origin, category, badge, stock],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM products WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json(row);
      });
    }
  );
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const { name, emoji, price, unit, origin, category, badge, stock = 100 } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price are required' });

  db.run(
    'UPDATE products SET name = ?, emoji = ?, price = ?, unit = ?, origin = ?, category = ?, badge = ?, stock = ? WHERE id = ?',
    [name, emoji, price, unit, origin, category, badge, stock, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Product not found' });
      db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
      });
    }
  );
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  });
});

app.post('/api/orders', (req, res) => {
  const { customer, items, total, payment_method, delivery_date } = req.body;
  db.run(
    'INSERT INTO customers (first_name, last_name, phone, email, address, city) VALUES (?,?,?,?,?,?)',
    [customer.first_name, customer.last_name, customer.phone, customer.email, customer.address, customer.city],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const customerId = this.lastID;
      const orderCode = 'FM-' + Date.now().toString().slice(-6);

      db.run(
        'INSERT INTO orders (order_code, customer_id, total, payment_method, delivery_date) VALUES (?,?,?,?,?)',
        [orderCode, customerId, total, payment_method, delivery_date],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          const orderId = this.lastID;
          const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)');
          items.forEach(item => stmt.run([orderId, item.id, item.qty, item.price]));
          stmt.finalize();
          res.json({ success: true, order_code: orderCode, order_id: orderId });
        }
      );
    }
  );
});

app.get('/api/orders', requireAuth, (req, res) => {
  db.all(
    `SELECT o.*, c.first_name, c.last_name, c.phone, c.city
     FROM orders o JOIN customers c ON o.customer_id = c.id
     ORDER BY o.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/chat', (req, res) => {
  const message = (req.body.message || '').toLowerCase();
  const responses = [
    { keywords: ['weight loss','lose weight','slim','diet','fat'], reply: '🍉 For weight loss, I recommend Watermelon (RWF 3,500) — it is 92% water and low calorie!' },
    { keywords: ['energy','tired','fatigue','boost','sport','exercise'], reply: '🍌 Bananas (RWF 800/bunch) are the #1 energy fruit!' },
    { keywords: ['vitamin c','immune','cold','flu','sick','immunity'], reply: '🍊 Oranges (RWF 1,800/kg) are great for immunity.' },
  ];
  for (const item of responses) {
    if (item.keywords.some(k => message.includes(k))) return res.json({ reply: item.reply });
  }
  res.json({ reply: '🍎 Great question! At FreshMart we have many fresh fruits to choose from.' });
});

app.use(express.static('public'));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 FreshMart running at http://localhost:${PORT}`);
});
