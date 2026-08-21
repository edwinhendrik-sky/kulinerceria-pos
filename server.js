const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// Redirect root URL ke login.html
app.get('/', (req, res) => res.redirect('/login.html'));

// ==========================================
// INISIALISASI DATABASE SQLITE PERMANEN
// ==========================================
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Gagal terhubung ke SQLite:', err.message);
  else console.log('✅ Database SQLite Berhasil Terhubung (database.sqlite)');
});

// Buat Tabel Database jika Belum Ada
db.serialize(() => {
  // 1. Tabel Menu
  db.run(`CREATE TABLE IF NOT EXISTS menus (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER DEFAULT 0,
    isAvailable INTEGER DEFAULT 1,
    image TEXT
  )`);

  // Daftar Menu Shao Kao & Default yang PASTI disuntikkan ke Database
  const defaultMenus = [
    { id: 'sk1', name: 'Sate Daging Sapi Shao Kao', price: 9000, category: 'sate', stock: 50, image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
    { id: 'sk2', name: 'Sate Ayam Tabur Jintan', price: 7000, category: 'sate', stock: 50, image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80' },
    { id: 'sk3', name: 'Sate Kulit Ayam Crispy BBQ', price: 6000, category: 'sate', stock: 40, image: 'https://images.unsplash.com/photo-1532636875304-0c89119d9b4d?w=400&q=80' },
    { id: 'sk4', name: 'Sate Enoki Gulung Sapi', price: 12000, category: 'sate', stock: 30, image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80' },
    { id: 'sk5', name: 'Sate Bakso Sapi Bumbu Pedas', price: 6000, category: 'sate', stock: 45, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80' },
    { id: 'sk6', name: 'Sate Sosis Beef Cocktail BBQ', price: 7000, category: 'sate', stock: 35, image: 'https://images.unsplash.com/photo-1597289124948-688c1a35b782?w=400&q=80' },
    { id: 'm1', name: 'Nasi Goreng Spesial', price: 25000, category: 'kitchen', stock: 20, image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80' },
    { id: 'b1', name: 'Es Teh Manis', price: 5000, category: 'bar', stock: 50, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80' },
    { id: 'b2', name: 'Kopi Susu Gula Aren', price: 18000, category: 'bar', stock: 25, image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&q=80' }
  ];

  // Gunakan INSERT OR IGNORE agar menu yang belum ada otomatis masuk
  const stmt = db.prepare("INSERT OR IGNORE INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, 1, ?)");
  defaultMenus.forEach(m => {
    stmt.run(m.id, m.name, m.price, m.category, m.stock, m.image);
  });
  stmt.finalize();

  // 2. Tabel Pesanan Aktif
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    table_no TEXT NOT NULL,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  // 3. Tabel Laporan Transaksi
  db.run(`CREATE TABLE IF NOT EXISTS sales_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    table_no TEXT,
    items TEXT,
    total INTEGER,
    method TEXT,
    closedAt TEXT
  )`);
});
// Tambahkan Tabel CRM ke db.serialize() di server.js
db.serialize(() => {
  // 1. Tabel Members
  db.run(`CREATE TABLE IF NOT EXISTS members (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  )`);

  // 2. Tabel Vouchers
  db.run(`CREATE TABLE IF NOT EXISTS vouchers (
    code TEXT PRIMARY KEY,
    discount_amount INTEGER NOT NULL,
    min_purchase INTEGER DEFAULT 0,
    isActive INTEGER DEFAULT 1
  )`);

  // Insert Voucher Default jika belum ada
  db.run("INSERT OR IGNORE INTO vouchers VALUES ('SHAOKAO10K', 10000, 50000, 1)");
});

// REST API CEK MEMBER & POIN
app.get('/api/member/:phone', (req, res) => {
  db.get("SELECT * FROM members WHERE phone = ?", [req.params.phone], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { found: false });
  });
});

// REST API CEK VOUCHER
app.post('/api/voucher/check', (req, res) => {
  const { code, total } = req.body;
  db.get("SELECT * FROM vouchers WHERE code = ? AND isActive = 1", [code.toUpperCase()], (err, row) => {
    if (!row) return res.json({ valid: false, message: 'Kode voucher tidak ditemukan / tidak aktif!' });
    if (total < row.min_purchase) {
      return res.json({ valid: false, message: `Minimal transaksi Rp ${row.min_purchase.toLocaleString('id-ID')}` });
    }
    res.json({ valid: true, discount: row.discount_amount });
  });
});
// Master Data Login
const USERS = {
  admin:   { password: 'admin123',   role: 'ADMIN',   name: 'Pemilik / Admin' },
  kasir:   { password: 'kasir123',   role: 'KASIR',   name: 'Kasir Resto' },
  kitchen: { password: 'dapur123',   role: 'KITCHEN', name: 'Staf Dapur' },
  bar:     { password: 'bar123',     role: 'BAR',     name: 'Staf Bar' }
};

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];
  if (user && user.password === password) {
    res.json({ success: true, role: user.role, name: user.name });
  } else {
    res.status(401).json({ success: false, message: 'Username atau Password salah!' });
  }
});

// --- REST API MENU ---
app.get('/api/menu', (req, res) => {
  db.all("SELECT * FROM menus", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const formatted = rows.map(r => ({ ...r, isAvailable: Boolean(r.isAvailable) }));
    res.json(formatted);
  });
});

app.post('/api/menu', (req, res) => {
  const { name, price, category, stock, image } = req.body;
  const id = 'm_' + Date.now();
  const stockVal = stock ? parseInt(stock) : 0;
  const isAvailable = stockVal > 0 ? 1 : 0;

  db.run(
    "INSERT INTO menus (id, name, price, category, stock, isAvailable, image) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, name, parseInt(price), category, stockVal, isAvailable, image || 'https://via.placeholder.com/300'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id });
    }
  );
});

app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, category, stock, isAvailable, image } = req.body;

  db.get("SELECT * FROM menus WHERE id = ?", [id], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Menu tidak ditemukan' });

    const updatedName = name !== undefined ? name : row.name;
    const updatedPrice = price !== undefined ? parseInt(price) : row.price;
    const updatedCategory = category !== undefined ? category : row.category;
    const updatedStock = stock !== undefined ? parseInt(stock) : row.stock;
    const updatedAvail = isAvailable !== undefined ? (isAvailable ? 1 : 0) : row.isAvailable;
    const updatedImg = image !== undefined ? image : row.image;

    db.run(
      "UPDATE menus SET name=?, price=?, category=?, stock=?, isAvailable=?, image=? WHERE id=?",
      [updatedName, updatedPrice, updatedCategory, updatedStock, updatedAvail, updatedImg, id],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
});

app.delete('/api/menu/:id', (req, res) => {
  db.run("DELETE FROM menus WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Master Data Meja
let tablesMaster = Array.from({ length: 12 }, (_, i) => ({ id: (i + 1).toString(), name: `Meja ${i + 1}` }));
app.get('/api/tables', (req, res) => res.json(tablesMaster));

// REST API AMBIL SEMUA DATA MEMBER & REKAP POIN
app.get('/api/members-list', (req, res) => {
  db.all("SELECT * FROM members ORDER BY points DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// REST API REKAP STATISTIK MEMBERSHIP
app.get('/api/members-summary', (req, res) => {
  db.get("SELECT COUNT(*) as total_members, SUM(points) as total_points FROM members", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { total_members: 0, total_points: 0 });
  });
});

// --- REST API LAPORAN PENJUALAN ---
app.get('/api/reports', (req, res) => {
  db.all("SELECT * FROM sales_reports ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let totalOmzet = 0;
    let itemCounter = {};
    const history = rows.map(r => {
      const items = JSON.parse(r.items);
      totalOmzet += r.total;
      items.forEach(i => {
        itemCounter[i.name] = (itemCounter[i.name] || 0) + 1;
      });
      return {
        id: r.order_id,
        table: r.table_no,
        items: items,
        total: r.total,
        method: r.method,
        closedAt: r.closedAt
      };
    });

    res.json({
      totalOmzet,
      totalTransactions: rows.length,
      bestSellers: itemCounter,
      history
    });
  });
});

// Helper Fungsi Mengambil Pesanan Aktif untuk Socket.io
function fetchActiveOrders(callback) {
  db.all("SELECT * FROM orders WHERE status != 'CLOSED'", [], (err, rows) => {
    if (err) return callback([]);
    const orders = rows.map(r => ({
      id: r.id,
      table: r.table_no,
      items: JSON.parse(r.items),
      total: r.total,
      status: r.status,
      createdAt: r.createdAt
    }));
    callback(orders);
  });
}

// REALTIME SOCKET.IO LOGIC (DB PERSISTENT)
io.on('connection', (socket) => {
  fetchActiveOrders(orders => socket.emit('initial-orders', orders));

  // Tambah Pesanan Baru
  socket.on('new-order', (data) => {
    // Di dalam socket.on('new-order', (data) => { ... })
if (data.customerPhone) {
  const earnedPoints = Math.floor(data.total / 10000); // 1 Poin tiap Rp 10.000
  const timeNow = new Date().toLocaleDateString('id-ID');

  db.get("SELECT * FROM members WHERE phone = ?", [data.customerPhone], (err, row) => {
    if (row) {
      db.run("UPDATE members SET points = points + ? WHERE phone = ?", [earnedPoints, data.customerPhone]);
    } else {
      db.run("INSERT INTO members (phone, name, points, createdAt) VALUES (?, ?, ?, ?)", 
        [data.customerPhone, data.customerName, earnedPoints, timeNow]);
    }
  });
}
    const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    db.get("SELECT * FROM orders WHERE table_no = ? AND status != 'CLOSED'", [data.table], (err, row) => {
      if (row) {
        // Gabung ke pesanan meja yang sudah ada
        const existingItems = JSON.parse(row.items);
        const updatedItems = [...existingItems, ...data.items];
        const updatedTotal = row.total + data.total;

        db.run(
          "UPDATE orders SET items=?, total=?, status='COOKING' WHERE id=?",
          [JSON.stringify(updatedItems), updatedTotal, row.id],
          () => broadcastUpdatedOrders()
        );
      } else {
        // Buat Pesanan Baru
        db.run(
          "INSERT INTO orders (id, table_no, items, total, status, createdAt) VALUES (?, ?, ?, ?, 'COOKING', ?)",
          [data.customerName, data.table, JSON.stringify(data.items), data.total, timeNow],
          () => broadcastUpdatedOrders()
        );
      }
    });

    // Update Kurangi Stok di SQLite
    data.items.forEach(item => {
      db.run("UPDATE menus SET stock = MAX(0, stock - 1) WHERE name = ?", [item.name], () => {
        db.run("UPDATE menus SET isAvailable = 0 WHERE stock = 0");
      });
    });
  });

  // Pindah Meja
  socket.on('move-table', ({ oldTable, newTable }) => {
    db.run(
      "UPDATE orders SET table_no = ? WHERE table_no = ? AND status != 'CLOSED'",
      [newTable, oldTable],
      () => broadcastUpdatedOrders()
    );
  });

  // Update Status Pesanan & Close Bill
  socket.on('update-status', ({ orderId, status, method }) => {
    if (status === 'CLOSED') {
      db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, row) => {
        if (row) {
          const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          // Pindahkan ke Laporan Sales
          db.run(
            "INSERT INTO sales_reports (order_id, table_no, items, total, method, closedAt) VALUES (?, ?, ?, ?, ?, ?)",
            [row.id, row.table_no, row.items, row.total, method || 'CASH', timeNow],
            () => {
              // Hapus/Update dari transaksi aktif
              db.run("UPDATE orders SET status='CLOSED' WHERE id=?", [orderId], () => broadcastUpdatedOrders());
            }
          );
        }
      });
    } else {
      db.run("UPDATE orders SET status=? WHERE id=?", [status, orderId], () => broadcastUpdatedOrders());
    }
  });

  function broadcastUpdatedOrders() {
    fetchActiveOrders(orders => io.emit('order-updated', orders));
  }
});

const PORT = 3000;
// REST API UNTUK RESET DATABASE (HANYA UNTUK ADMIN)
app.post('/api/reset-database', (req, res) => {
  db.serialize(() => {
    // Hapus seluruh isi tabel
    db.run("DELETE FROM orders");
    db.run("DELETE FROM sales_reports");
    
    // (Opsional) Jika ingin menghapus semua menu buatan juga:
    // db.run("DELETE FROM menus");

    res.json({ success: true, message: 'Database transaksi dan riwayat berhasil dibersihkan!' });
  });
});
server.listen(PORT, () => console.log(`🚀 Server POS SQLite Berjalan di http://localhost:${PORT}`));