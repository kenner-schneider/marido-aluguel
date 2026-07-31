const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- armazenamento em JSON (MVP; trocar por Postgres na v2) ----------
function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(SEED_PATH, DB_PATH);
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

const PLATFORM_FEE = 0.2; // plataforma fica com 20%, profissional recebe 80%

// ---------- helpers ----------
function proPublic(pro) {
  const { accessCode, ...rest } = pro;
  return rest;
}

// horários livres = grade de disponibilidade do dia − reservas ativas na data
function freeSlots(db, pro, dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  if (isNaN(date)) return [];
  const weekday = date.getDay(); // 0=domingo
  const av = pro.availability[String(weekday)];
  if (!av) return [];
  const taken = db.bookings
    .filter(b => b.proId === pro.id && b.date === dateStr && b.status !== 'recusado' && b.status !== 'cancelado')
    .flatMap(b => {
      const start = parseInt(b.time.split(':')[0], 10);
      return Array.from({ length: b.hours }, (_, i) => start + i);
    });
  const slots = [];
  for (let h = av.start; h < av.end; h++) {
    if (!taken.includes(h)) slots.push(`${String(h).padStart(2, '0')}:00`);
  }
  return slots;
}

// ---------- API ----------
app.get('/api/config', (req, res) => {
  const db = loadDb();
  res.json({ cities: db.cities, services: db.services, platformFee: PLATFORM_FEE });
});

app.get('/api/pros', (req, res) => {
  const db = loadDb();
  const { city, service } = req.query;
  let pros = db.pros;
  if (city) pros = pros.filter(p => p.city === city);
  if (service) pros = pros.filter(p => p.services.includes(service));
  res.json(pros.map(proPublic));
});

app.get('/api/pros/:id', (req, res) => {
  const db = loadDb();
  const pro = db.pros.find(p => p.id === req.params.id);
  if (!pro) return res.status(404).json({ error: 'Profissional não encontrado' });
  res.json(proPublic(pro));
});

app.get('/api/pros/:id/slots', (req, res) => {
  const db = loadDb();
  const pro = db.pros.find(p => p.id === req.params.id);
  if (!pro) return res.status(404).json({ error: 'Profissional não encontrado' });
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Informe a data (?date=AAAA-MM-DD)' });
  res.json({ date, slots: freeSlots(db, pro, date) });
});

app.post('/api/bookings', (req, res) => {
  const db = loadDb();
  const { proId, serviceId, date, time, hours, clientName, clientEmail, clientPhone, address, notes } = req.body || {};

  const pro = db.pros.find(p => p.id === proId);
  const service = db.services.find(s => s.id === serviceId);
  const nHours = parseInt(hours, 10);

  if (!pro) return res.status(400).json({ error: 'Profissional inválido' });
  if (!service) return res.status(400).json({ error: 'Serviço inválido' });
  if (!pro.services.includes(serviceId)) return res.status(400).json({ error: 'Este profissional não atende esse serviço' });
  if (!date || !time) return res.status(400).json({ error: 'Informe data e horário' });
  if (!nHours || nHours < 1 || nHours > 8) return res.status(400).json({ error: 'Duração deve ser entre 1 e 8 horas' });
  if (!clientName || !clientEmail || !clientPhone || !address) {
    return res.status(400).json({ error: 'Preencha nome, e-mail, telefone e endereço' });
  }

  // todos os horários do intervalo precisam estar livres
  const slots = freeSlots(db, pro, date);
  const startH = parseInt(time.split(':')[0], 10);
  for (let h = startH; h < startH + nHours; h++) {
    if (!slots.includes(`${String(h).padStart(2, '0')}:00`)) {
      return res.status(409).json({ error: 'Horário indisponível para essa duração. Escolha outro horário.' });
    }
  }

  // preço calculado no servidor — nunca confiar no valor vindo do cliente
  const price = service.hourlyRate * nHours;
  const payout = Math.round(price * (1 - PLATFORM_FEE) * 100) / 100;

  const booking = {
    id: 'bk_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    proId,
    serviceId,
    date,
    time,
    hours: nHours,
    price,
    payout,
    clientName,
    clientEmail: clientEmail.toLowerCase().trim(),
    clientPhone,
    address,
    notes: notes || '',
    status: 'pendente',
    createdAt: new Date().toISOString()
  };
  db.bookings.push(booking);
  saveDb(db);
  res.status(201).json(booking);
});

app.get('/api/bookings', (req, res) => {
  const db = loadDb();
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Informe o e-mail (?email=)' });
  const list = db.bookings
    .filter(b => b.clientEmail === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

// ---------- lado do profissional ----------
app.get('/api/pro/:id/bookings', (req, res) => {
  const db = loadDb();
  const list = db.bookings
    .filter(b => b.proId === req.params.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

function setStatus(req, res, from, to) {
  const db = loadDb();
  const booking = db.bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Reserva não encontrada' });
  if (booking.status !== from) return res.status(409).json({ error: `Só é possível a partir do status "${from}"` });
  booking.status = to;
  saveDb(db);
  res.json(booking);
}
app.post('/api/bookings/:id/accept', (req, res) => setStatus(req, res, 'pendente', 'confirmado'));
app.post('/api/bookings/:id/decline', (req, res) => setStatus(req, res, 'pendente', 'recusado'));
app.post('/api/bookings/:id/complete', (req, res) => setStatus(req, res, 'confirmado', 'concluido'));

app.get('/api/pro/:id/earnings', (req, res) => {
  const db = loadDb();
  const mine = db.bookings.filter(b => b.proId === req.params.id);
  const sum = states => mine.filter(b => states.includes(b.status)).reduce((acc, b) => acc + b.payout, 0);
  res.json({
    pending: sum(['pendente']),
    confirmed: sum(['confirmado']),
    completed: sum(['concluido']),
    jobsCompleted: mine.filter(b => b.status === 'concluido').length
  });
});

app.put('/api/pro/:id/availability', (req, res) => {
  const db = loadDb();
  const pro = db.pros.find(p => p.id === req.params.id);
  if (!pro) return res.status(404).json({ error: 'Profissional não encontrado' });
  const av = req.body || {};
  const clean = {};
  for (const [day, range] of Object.entries(av)) {
    const d = parseInt(day, 10);
    if (isNaN(d) || d < 0 || d > 6 || !range) continue;
    const start = parseInt(range.start, 10);
    const end = parseInt(range.end, 10);
    if (isNaN(start) || isNaN(end) || start < 6 || end > 22 || start >= end) continue;
    clean[String(d)] = { start, end };
  }
  pro.availability = clean;
  saveDb(db);
  res.json({ availability: pro.availability });
});

app.listen(PORT, () => {
  console.log(`SeuQuebraGalho MVP rodando em http://localhost:${PORT}`);
});
