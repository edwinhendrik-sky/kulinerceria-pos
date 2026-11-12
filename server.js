const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi path database (Mendukung persistent disk /data jika di server production seperti Render)
const dbPath = process.env.NODE_ENV === 'production' && fs.existsSync('/data')
  ? '/data/database.sqlite' 
  : path.join(__dirname, 'database.sqlite');

// Inisialisasi Database SQLite
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Gagal terhubung ke SQLite:', err.message);
  } else {
    console.log(`Terhubung ke database SQLite di: ${dbPath}`);
  }
});

// Setup Tabel Database & Auto-Seed Menu Default (Stok Default 50 untuk Semua Menu)
db.serialize(() => {
  // 1. Tabel Menus
  db.run(`CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER DEFAULT 50,
    isAvailable INTEGER DEFAULT 1,
    image TEXT
  )`, () => {
    const defaultImage = 'https://encrypted-tbn3.gstatic.com/licensed-image?q=tbn:ANd9GcTWmjez5R8Mihu3KxDto9GpTKkUMF22YdX75nIVaYqiUjb00IpDqAJIhmArRgC53lIcVXqNF382XH1a3cY';
    
    // Daftar menu default dengan stok di-set 50 semua
    const defaultMenus = [
      { id: 'sk1', name: 'Sate Ayam', price: 7500, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk2', name: 'Sate Saikoro Beef', price: 15000, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk3', name: 'Sate Domba', price: 12000, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk4', name: 'Sate Kulit', price: 6500, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk5', name: 'Sate Jamur Sapi', price: 12000, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk6', name: 'Sate Ati', price: 10000, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk7', name: 'Sate Kucai', price: 5000, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk8', name: 'Sate Brokoli', price: 6500, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'sk9', name: 'Sate Jamur', price: 5000, category: 'shaokao', stock: 50, image: defaultImage },
      { id: 'b1', name: 'Es Teh Manis', price: 5000, category: 'bar', stock: 50, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80' }
    ];

    const stmt = db.prepare("INSERT OR IGNORE INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, 1, ?)");
    defaultMenus.forEach(m => {
      stmt.run(m.id, m.name, m.price, m.category, m.stock, m.image);
    });
    stmt.finalize();
  });

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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

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

// Master Tables Endpoint untuk Denah Meja
app.get('/api/tables', (req, res) => {
  const tables = [];
  for (let i = 1; i <= 10; i++) {
    tables.push({ id: i.toString(), name: `Meja ${i}` });
  }
  res.json(tables);
});

// Get Menu List
app.get('/api/menu', (req, res) => {
  db.all("SELECT * FROM menus", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update Menu Item / Stock / Price
app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { stock, isAvailable, price } = req.body;
  
  if (price !== undefined) {
    db.run("UPDATE menus SET price = ? WHERE id = ?", [price, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } else {
    db.run("UPDATE menus SET stock = ?, isAvailable = ? WHERE id = ?", [stock, isAvailable, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  }
});

// Add New Menu Item
app.post('/api/menu', (req, res) => {
  const { name, price, category, stock, image } = req.body;
  const id = 'm_' + Date.now();
  db.run("INSERT INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, 1, ?)",
    [id, name, price, category, stock || 50, image || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id });
    }
  );
});

// Delete Menu Item
app.delete('/api/menu/:id', (req, res) => {
  db.run("DELETE FROM menus WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
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

// Report Sales API
app.get('/api/reports', (req, res) => {
  db.all("SELECT * FROM sales_reports ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    let totalOmzet = 0;
    let bestSellers = {};
    let history = rows.map(r => {
      let parsedItems = [];
      try {
        parsedItems = JSON.parse(r.items || '[]');
      } catch (e) {
        parsedItems = [];
      }
      totalOmzet += r.total;
      parsedItems.forEach(i => {
        bestSellers[i.name] = (bestSellers[i.name] || 0) + 1;
      });
      return {
        id: r.order_id,
        table: r.table_no,
        items: parsedItems,
        total: r.total,
        method: r.method,
        closedAt: r.closedAt
      };
    });

    res.json({
      totalOmzet,
      totalTransactions: rows.length,
      bestSellers,
      history
    });
  });
});

// ================= SOCKET.IO REALTIME ENGINE =================

function broadcastActiveOrders() {
  db.all("SELECT * FROM orders WHERE status != 'CLOSED'", [], (err, rows) => {
    if (!err && rows) {
      const parsedOrders = rows.map(r => {
        let items = [];
        try {
          items = JSON.parse(r.items || '[]');
        } catch (e) {
          items = [];
        }
        return {
          ...r,
          table: r.table_no,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          items: items
        };
      });
      io.emit('order-update', parsedOrders);
      io.emit('initial-orders', parsedOrders);
      io.emit('order-updated', parsedOrders);
    }
  });
}

io.on('connection', (socket) => {
  console.log('Client Terhubung:', socket.id);
  broadcastActiveOrders();

  // 1. Pesanan Baru dari Pelanggan
  socket.on('new-order', (data) => {
    const orderId = 'ORD-' + Date.now().toString().slice(-6);
    const createdAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('id-ID');

    db.run(
      "INSERT INTO orders (id, table_no, customer_name, customer_phone, items, total, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'COOKING', ?)",
      [orderId, data.table, data.customerName || 'Pelanggan', data.customerPhone || null, JSON.stringify(data.items), data.total, createdAt],
      (err) => {
        if (!err) {
          broadcastActiveOrders();
        }
      }
    );
  });

  // 2. Tambah Pesanan Manual oleh Kasir
  socket.on('add-manual-item', ({ orderId, itemName, itemPrice }) => {
    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, row) => {
      if (row) {
        let items = [];
        try {
          items = JSON.parse(row.items || '[]');
        } catch (e) {
          items = [];
        }
        items.push({ name: itemName, price: itemPrice, category: 'kitchen' });
        let newTotal = row.total + itemPrice;

        db.run("UPDATE orders SET items = ?, total = ? WHERE id = ?", [JSON.stringify(items), newTotal, orderId], () => {
          broadcastActiveOrders();
        });
      }
    });
  });

  // 3. Update Status & Close Bill (Pelunasan Transaksi Kasir)
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
                
                // C. REKAP POIN MEMBER OTOMATIS
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

  // 4. Complete Kitchen / Bar Item Order
  socket.on('complete-kitchen-order', (orderId) => {
    db.run("UPDATE orders SET status = 'READY' WHERE id = ?", [orderId], () => {
      broadcastActiveOrders();
    });
  });

  // 5. Pindah Meja (Move Table)
  socket.on('move-table', ({ oldTable, newTable }) => {
    db.run("UPDATE orders SET table_no = ? WHERE table_no = ? AND status != 'CLOSED'", [newTable, oldTable], (err) => {
      if (!err) {
        broadcastActiveOrders();
      }
    });
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server POS Shao Kao Berjalan di http://localhost:${PORT}`);
});