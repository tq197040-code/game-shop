const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const SECRET = "GAME_SECRET_2026";
const ADMIN_EMAIL = "tq197040@gmail.com";
const BANK_INFO = {
  bank: "Vietcombank",
  account: "1040505272",
  name: "KIEU QUANG THAI"
};

// Đọc/ghi database
function readDB() {
  if (!fs.existsSync("db.json")) fs.writeFileSync("db.json", JSON.stringify({ users: {}, orders: [] }));
  return JSON.parse(fs.readFileSync("db.json"));
}
function saveDB(db) {
  fs.writeFileSync("db.json", JSON.stringify(db, null, 2));
}

// Gmail
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: { user: ADMIN_EMAIL, pass: "mat_khau_ung_dung_16_ky_tu" }
});

function token(orderId) {
  return crypto.createHmac("sha256", SECRET).update(orderId).digest("hex");
}

// ① Đăng ký tài khoản
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  if (db.users[username]) return res.json({ ok: false, msg: "Tên đã tồn tại" });
  db.users[username] = { password, chip: 0, createdAt: new Date().toISOString() };
  saveDB(db);
  res.json({ ok: true });
});

// ② Đăng nhập
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users[username];
  if (!user || user.password !== password) return res.json({ ok: false, msg: "Sai tài khoản hoặc mật khẩu" });
  res.json({ ok: true, chip: user.chip });
});

// ③ Xem số chip
app.get("/api/chip/:username", (req, res) => {
  const db = readDB();
  const user = db.users[req.params.username];
  if (!user) return res.json({ ok: false });
  res.json({ ok: true, chip: user.chip });
});

// ④ Đặt mua chip
app.post("/api/buy", (req, res) => {
  const { username, amount, chipAmount } = req.body;
  const db = readDB();
  if (!db.users[username]) return res.json({ ok: false, msg: "Không tìm thấy tài khoản" });

  const orderId = Date.now().toString();
  const tk = token(orderId);
  const order = {
    id: orderId, username, amount, chipAmount,
    status: "pending", createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  saveDB(db);

  const base = "https://your-backend.up.railway.app";
  const approveUrl = `${base}/approve?id=${orderId}&token=${tk}`;
  const rejectUrl  = `${base}/reject?id=${orderId}&token=${tk}`;

  // Gửi Gmail cho admin
  mailer.sendMail({
    from: ADMIN_EMAIL, to: ADMIN_EMAIL,
    subject: `[Game] ${username} mua ${chipAmount} chip — ${amount.toLocaleString("vi-VN")}đ`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;padding:20px">
        <h2 style="color:#7c3aed">Đơn mua chip mới</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#666">Người chơi</td><td><b>${username}</b></td></tr>
          <tr><td style="padding:8px 0;color:#666">Số chip</td><td><b style="color:#7c3aed">${chipAmount} chip</b></td></tr>
          <tr><td style="padding:8px 0;color:#666">Số tiền</td><td><b>${amount.toLocaleString("vi-VN")}đ</b></td></tr>
          <tr><td style="padding:8px 0;color:#666">Mã đơn</td><td style="font-family:monospace">#${orderId}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Thời gian</td><td>${new Date().toLocaleString("vi-VN")}</td></tr>
        </table>
        <p style="color:#666;font-size:13px">
          Kiểm tra chuyển khoản <b>${BANK_INFO.bank} - ${BANK_INFO.account}</b> trước khi duyệt.
        </p>
        <div style="display:flex;gap:12px;margin-top:20px">
          <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:15px">
            ✅ Duyệt — cộng chip
          </a>
          <a href="${rejectUrl}" style="background:#dc2626;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:15px">
            ❌ Từ chối
          </a>
        </div>
      </div>
    `
  });

  // Gửi thông tin chuyển khoản cho khách
  res.json({
    ok: true, orderId,
    bank: BANK_INFO,
    content: `GAME ${orderId}`,
    msg: `Chuyển khoản ${amount.toLocaleString("vi-VN")}đ với nội dung GAME ${orderId}`
  });
});

// ⑤ Admin bấm Duyệt trên Gmail
app.get("/approve", (req, res) => {
  const { id, token: tk } = req.query;
  if (tk !== token(id)) return res.send("<h2>Token không hợp lệ!</h2>");

  const db = readDB();
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.send("<h2>Không tìm thấy đơn!</h2>");
  if (order.status !== "pending") return res.send("<h2>Đơn đã được xử lý rồi!</h2>");

  // Cộng chip vào tài khoản
  order.status = "approved";
  db.users[order.username].chip += order.chipAmount;
  saveDB(db);

  res.send(`
    <div style="font-family:sans-serif;text-align:center;padding:40px">
      <h2 style="color:#16a34a">✅ Đã cộng ${order.chipAmount} chip vào tài khoản <b>${order.username}</b></h2>
      <p>Số chip hiện tại: <b>${db.users[order.username].chip} chip</b></p>
    </div>
  `);
});

// ⑥ Admin bấm Từ chối trên Gmail
app.get("/reject", (req, res) => {
  const { id, token: tk } = req.query;
  if (tk !== token(id)) return res.send("<h2>Token không hợp lệ!</h2>");

  const db = readDB();
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.send("<h2>Không tìm thấy đơn!</h2>");
  if (order.status !== "pending") return res.send("<h2>Đơn đã được xử lý rồi!</h2>");

  order.status = "rejected";
  saveDB(db);

  res.send(`
    <div style="font-family:sans-serif;text-align:center;padding:40px">
      <h2 style="color:#dc2626">❌ Đã từ chối đơn #${id} của <b>${order.username}</b></h2>
    </div>
  `);
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/game.html");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server chạy tại :" + PORT));