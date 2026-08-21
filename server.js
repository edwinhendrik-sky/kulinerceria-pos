const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Gagal terhubung ke SQLite:', err.message);
  } else {
    console.log('Terhubung ke database SQLite.');
  }
});

// Setup Tabel Database & Auto-Seed Data Shao Kao
db.serialize(() => {
  // 1. Tabel Menus
  db.run(`CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER DEFAULT 0,
    isAvailable INTEGER DEFAULT 1,
    image TEXT
  )`);

  // Auto Insert Menu Default (Shao Kao, Makanan, Minuman)
  const defaultMenus = [
    { id: 'sk1', name: 'Sate Daging Sapi Shao Kao', price: 9000, category: 'shaokao', stock: 50, image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
    { id: 'sk2', name: 'Sate Ayam Tabur Jintan', price: 7000, category: 'shaokao', stock: 50, image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80' },
    { id: 'sk3', name: 'Sate Kulit Ayam Crispy BBQ', price: 6000, category: 'shaokao', stock: 40, image: 'https://images.unsplash.com/photo-1532636875304-0c89119d9b4d?w=400&q=80' },
    { id: 'sk4', name: 'Sate Enoki Gulung Sapi', price: 12000, category: 'shaokao', stock: 30, image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80' },
    { id: 'sk5', name: 'Sate Bakso Sapi Bumbu Pedas', price: 6000, category: 'shaokao', stock: 45, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80' },
    { id: 'sk6', name: 'Sate Sosis Beef Cocktail BBQ', price: 7000, category: 'shaokao', stock: 35, image: 'https://images.unsplash.com/photo-1597289124948-688c1a35b782?w=400&q=80' },
    { id: 'm1', name: 'Nasi Goreng Spesial', price: 25000, category: 'kitchen', stock: 20, image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80' },
    { id: 'b1', name: 'Es Teh Manis', price: 5000, category: 'bar', stock: 50, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80' },
    { id: 'b2', name: 'Kopi Susu Gula Aren', price: 18000, category: 'bar', stock: 25, image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&q=80' }
  ];

  const stmt = db.prepare("INSERT OR IGNORE INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, 1, ?)");
  defaultMenus.forEach(m => {
    stmt.run(m.id, m.name, m.price, m.category, m.stock, m.image);
  });
  stmt.finalize();

  // 2. Tabel Orders (Pesanan Aktif)
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    table_no TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  // 3. Tabel Sales Reports (Laporan Penjualan Lunas)
  db.run(`CREATE TABLE IF NOT EXISTS sales_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    table_no TEXT,
    items TEXT,
    total INTEGER,
    method TEXT,
    closedAt TEXT
  )`);

  // 4. Tabel Members (CRM)
  db.run(`CREATE TABLE IF NOT EXISTS members (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  )`);

  // 5. Tabel Vouchers
  db.run(`CREATE TABLE IF NOT EXISTS vouchers (
    code TEXT PRIMARY KEY,
    discount_amount INTEGER NOT NULL,
    min_purchase INTEGER DEFAULT 0,
    isActive INTEGER DEFAULT 1
  )`);

  db.run("INSERT OR IGNORE INTO vouchers VALUES ('SHAOKAO10K', 10000, 50000, 1)");
});

// ================= API ENDPOINTS =================

// Authentication / Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    res.json({ success: true, name: 'Owner / Manager', role: 'ADMIN' });
  } else if (username === 'kasir' && password === 'kasir123') {
    res.json({ success: true, name: 'Staf Kasir', role: 'KASIR' });
  } else {
    res.status(401).json({ success: false, message: 'Username atau Password salah!' });
  }
});

// Get Menu List
app.get('/api/menu', (req, res) => {
  db.all("SELECT * FROM menus", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update Menu Item / Stock
app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { stock, isAvailable } = req.body;
  db.run("UPDATE menus SET stock = ?, isAvailable = ? WHERE id = ?", [stock, isAvailable, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Add New Menu Item
app.post('/api/menu', (req, res) => {
  const { name, price, category, stock, image } = req.body;
  const id = 'm_' + Date.now();
  db.run("INSERT INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, 1, ?)",
    [id, name, price, category, stock, image],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id });
    }
  );
});

// Seed Shao Kao Manual Endpoint (Emergency Fix)
app.get('/api/seed-shaokao', (req, res) => {
  const shaokaoMenus = [
    { id: 'sk1', name: 'Sate Daging Sapi Shao Kao', price: 9000, category: 'shaokao', stock: 50, image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
    { id: 'sk2', name: 'Sate Ayam Tabur Jintan', price: 7000, category: 'shaokao', stock: 50, image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80' },
    { id: 'sk3', name: 'Sate Kulit Ayam Crispy BBQ', price: 6000, category: 'shaokao', stock: 40, image: 'https://images.unsplash.com/photo-1532636875304-0c89119d9b4d?w=400&q=80' },
    { id: 'sk4', name: 'Sate Enoki Gulung Sapi', price: 12000, category: 'shaokao', stock: 30, image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80' },
    { id: 'sk5', name: 'Sate Bakso Sapi Bumbu Pedas', price: 6000, category: 'shaokao', stock: 45, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80' },
    { id: 'sk6', name: 'Sate Sosis Beef Cocktail BBQ', price: 7000, category: 'shaokao', stock: 35, image: 'https://images.unsplash.com/photo-1597289124948-688c1a35b782?w=400&q=80' }
  ];

  const stmt = db.prepare("INSERT OR REPLACE INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, 1, ?)");
  shaokaoMenus.forEach(m => {
    stmt.run(m.id, m.name, m.price, m.category, m.stock, m.image);
  });
  stmt.finalize();
  res.json({ success: true, message: 'Menu Sate Shao Kao Berhasil Ditambahkan!' });
});

// Member CRM APIs
app.get('/api/member/:phone', (req, res) => {
  db.get("SELECT * FROM members WHERE phone = ?", [req.params.phone], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { found: false });
  });
});

app.get('/api/members-list', (req, res) => {
  db.all("SELECT * FROM members ORDER BY points DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/members-summary', (req, res) => {
  db.get("SELECT COUNT(*) as total_members, COALESCE(SUM(points), 0) as total_points FROM members", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { total_members: 0, total_points: 0 });
  });
});

app.post('/api/voucher/check', (req, res) => {
  const { code, total } = req.body;
  db.get("SELECT * FROM vouchers WHERE code = ? AND isActive = 1", [code.toUpperCase()], (err, row) => {
    if (!row) return res.json({ valid: false, message: 'Kode voucher tidak valid!' });
    if (total < row.min_purchase) {
      return res.json({ valid: false, message: `Minimal pembelian Rp ${row.min_purchase.toLocaleString('id-ID')}` });
    }
    res.json({ valid: true, discount: row.discount_amount });
  });
});

// Report Sales API
app.get('/api/reports/sales', (req, res) => {
  db.all("SELECT * FROM sales_reports ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ================= SOCKET.IO REALTIME ENGINE =================

function broadcastActiveOrders() {
  db.all("SELECT * FROM orders WHERE status != 'CLOSED'", [], (err, rows) => {
    if (!err) {
      const parsedOrders = rows.map(r => ({
        ...r,
        table: r.table_no,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        items: JSON.parse(r.items)
      }));
      io.emit('order-update', parsedOrders);
    }
  });
}

io.on('connection', (socket) => {
  console.log('Client Terhubung:', socket.id);
  broadcastActiveOrders();

  // 1. Pesanan Baru dari Pelanggan
  socket.on('new-order', (data) => {
    const orderId = 'ORD-' + Date.now().toString().slice(-6);
    const createdAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    db.run(
      "INSERT INTO orders (id, table_no, customer_name, customer_phone, items, total, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)",
      [orderId, data.table, data.customerName || 'Pelanggan', data.customerPhone || null, JSON.stringify(data.items), data.total, createdAt],
      (err) => {
        if (!err) {
          broadcastActiveOrders();
        }
      }
    );
  });

  // 2. Update Status & Close Bill (Pelunasan Transaksi Kasir)
  socket.on('update-status', ({ orderId, status, method }) => {
    if (status === 'CLOSED') {
      db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, row) => {
        if (row) {
          const timeNow = new Date().toLocaleTimeString('id-ID') + ' ' + new Date().toLocaleDateString('id-ID');
          const totalPaid = row.total;
          const phone = row.customer_phone;
          const name = row.customer_name || 'Pelanggan';

          // A. Pindahkan ke Laporan Sales
          db.run(
            "INSERT INTO sales_reports (order_id, table_no, items, total, method, closedAt) VALUES (?, ?, ?, ?, ?, ?)",
            [row.id, row.table_no, row.items, totalPaid, method || 'CASH', timeNow],
            () => {
              // B. Update status pesanan menjadi CLOSED
              db.run("UPDATE orders SET status = 'CLOSED' WHERE id = ?", [orderId], () => {
                
                // C. TAUTAN REKAP POIN MEMBER OTOMATIS
                if (phone) {
                  const earnedPoints = Math.floor(totalPaid / 10000); // 1 Poin tiap Rp 10.000
                  const dateNow = new Date().toLocaleDateString('id-ID');

                  db.get("SELECT * FROM members WHERE phone = ?", [phone], (err, member) => {
                    if (member) {
                      db.run("UPDATE members SET points = points + ? WHERE phone = ?", [earnedPoints, phone], () => {
                        broadcastActiveOrders();
                      });
                    } else {
                      db.run("INSERT INTO members (phone, name, points, createdAt) VALUES (?, ?, ?, ?)",
                        [phone, name, earnedPoints, dateNow],
                        () => {
                          broadcastActiveOrders();
                        }
                      );
                    }
                  });
                } else {
                  broadcastActiveOrders();
                }

              });
            }
          );
        }
      });
    } else {
      db.run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId], () => {
        broadcastActiveOrders();
      });
    }
  });

  // 3. Complete Kitchen / Bar Item Order
  socket.on('complete-kitchen-order', (orderId) => {
    db.run("UPDATE orders SET status = 'COOKED' WHERE id = ?", [orderId], () => {
      broadcastActiveOrders();
    });
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server POS Shao Kao Berjalan di http://localhost:${PORT}`);
});