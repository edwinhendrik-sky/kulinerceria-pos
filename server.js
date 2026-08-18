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

  // Insert Data Awal Menu (Jika masih kosong)
  db.get("SELECT COUNT(*) as count FROM menus", (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare("INSERT INTO menus VALUES (?, ?, ?, ?, ?, ?, ?)");
      stmt.run('m1', 'Nasi Goreng Spesial', 25000, 'kitchen', 20, 1, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=300&q=80');
      stmt.run('m2', 'Mie Goreng Seafood', 28000, 'kitchen', 15, 1, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300&q=80');
      stmt.run('b1', 'Es Teh Manis', 5000, 'bar', 50, 1, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300&q=80');
      stmt.run('b2', 'Kopi Susu Gula Aren', 18000, 'bar', 10, 1, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=300&q=80');
      stmt.finalize();
    }
  });

  // 2. Tabel Pesanan Aktif
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    table_no TEXT NOT NULL,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  // 3. Tabel Laporan Transaksi (History Closed)
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