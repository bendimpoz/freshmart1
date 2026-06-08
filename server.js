const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create & connect database
const db = new sqlite3.Database('./freshmart.db', (err) => {
  if (err) console.error(err.message);
  else console.log('✅ Connected to SQLite database');
});

// Create tables
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

  // Seed products if empty
  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (row.count === 0) {
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

// ========== API ROUTES ==========

// GET all products
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

// GET single product
app.get('/api/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  });
});

// POST place an order
app.post('/api/orders', (req, res) => {
  const { customer, items, total, payment_method, delivery_date } = req.body;

  // Save customer
  db.run(
    `INSERT INTO customers (first_name, last_name, phone, email, address, city) VALUES (?,?,?,?,?,?)`,
    [customer.first_name, customer.last_name, customer.phone, customer.email, customer.address, customer.city],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const customerId = this.lastID;
      const orderCode = 'FM-' + Date.now().toString().slice(-6);

      // Save order
      db.run(
        `INSERT INTO orders (order_code, customer_id, total, payment_method, delivery_date) VALUES (?,?,?,?,?)`,
        [orderCode, customerId, total, payment_method, delivery_date],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          const orderId = this.lastID;

          // Save order items
          const stmt = db.prepare(`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)`);
          items.forEach(item => stmt.run([orderId, item.id, item.qty, item.price]));
          stmt.finalize();

          res.json({ success: true, order_code: orderCode, order_id: orderId });
        }
      );
    }
  );
});

// GET all orders (admin)
app.get('/api/orders', (req, res) => {
  db.all(`
    SELECT o.*, c.first_name, c.last_name, c.phone, c.city
    FROM orders o JOIN customers c ON o.customer_id = c.id
    ORDER BY o.created_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Serve frontend for all other routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 FreshMart running at http://localhost:${PORT}`);
});