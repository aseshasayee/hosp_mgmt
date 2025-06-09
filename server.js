const express = require('express');
const { Pool } = require('pg');
const net = require('net');
const { format } = require('date-fns');
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

const app = express();
app.use(express.json());
const upload = multer({ dest: 'tmp_reports/' }); // Temporary upload folder

// --- Role-based middleware (NEW) ---
function requireRole(roles) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).send('No token');
    try {
      const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
      if (!roles.includes(decoded.role)) return res.status(403).send('Forbidden');
      req.user = decoded;
      next();
    } catch {
      res.status(401).send('Invalid token');
    }
  };
}

// PostgreSQL config
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pacs',
  password: 'pacs',
  database: 'pacsdb'
});

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

function sendHL7ToDcm4chee(hl7Message, host = 'localhost', port = 2575) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    // MLLP wrap: <VT>message<FS><CR>
    const mllpMessage = '\x0b' + hl7Message + '\x1c\r';
    let response = '';
    client.connect(port, host, () => {
      client.write(mllpMessage);
    });
    client.on('data', (data) => {
      response += data.toString();
      if (response.includes('\x1c\r')) {
        client.destroy();
        resolve(response);
      }
    });
    client.on('error', reject);
    client.on('close', () => {
      if (!response) reject(new Error('No response from HL7 server'));
    });
  });
}

// HL7 generator for custom order (formatting unchanged)
async function generateHL7Custom(patientId, departmentId, modalityId, visitId) {
  const client = await pool.connect();
  try {
    // Fetch all required data
    const [patient, department, modality, visit] = await Promise.all([
      client.query('SELECT * FROM patients WHERE patient_id = $1', [patientId]),
      client.query('SELECT * FROM departments WHERE department_id = $1', [departmentId]),
      client.query('SELECT * FROM modalities WHERE modality_id = $1', [modalityId]),
      client.query('SELECT * FROM visits WHERE visit_id = $1', [visitId])
    ]);

    // Validate all data exists
    if (!patient.rows[0] || !department.rows[0] || !modality.rows[0] || !visit.rows[0]) {
      throw new Error('Missing required data for HL7 generation');
    }

    const { rows: [doctor] } = await client.query(
      'SELECT * FROM doctors WHERE doctor_id = $1',
      [visit.rows[0].doctor_id]
    );

    // Helper functions
    const formatDate = (date) => format(date, 'yyyyMMddHHmmss');
    const now = new Date();
    const accNumber = `ACC${format(now, 'yyyyMMdd')}`;

    // Hardcoded values (update these per your environment)
    const HARDCODED = {
      MSH_3: 'TEST',
      MSH_4: 'TEST',
      MSH_5: 'DCM4CHEE',
      MSH_6: 'DCM4CHEE',
      OBR_CODE: '12345-6^Chest X-Ray^LN',
      ROOM: 'Room101',
      RADIOLOGISTS: 'RAD1~RAD2'
    };

    // Build HL7 segments
    const segments = [
      // MSH Segment
      [
        'MSH', '^~\\&',
        HARDCODED.MSH_3,
        HARDCODED.MSH_4,
        HARDCODED.MSH_5,
        HARDCODED.MSH_6,
        formatDate(now),
        '',
        'OMI^O23^OMI_O23',
        visit.rows[0].visit_id.replace(/-/g, '').substring(0, 15),
        'P', '2.3', '', '', '', '', '', '8859/1'
      ].join('|'),

      // PID Segment
      [
        'PID', '', '', 
        patient.rows[0].patient_id, '',
        `${patient.rows[0].last_name}^${patient.rows[0].first_name}`, '',
        formatDate(patient.rows[0].dob),
        patient.rows[0].sex.toUpperCase().substring(0,1), '', '', 
        patient.rows[0].address.replace(/, /g, '^').replace(/,/g, '^'), '', '', '', '',
        visit.rows[0].visit_id.replace(/-/g, '').substring(0, 15)
      ].join('|'),

      // NTE Segment (Allergies)
      `NTE|||${patient.rows[0].allergies || 'No known allergies'}`,

      // PV1 Segment
      [
        'PV1', '', 'I', '', '', '', '', '',
        `^${doctor.name.split(' ').join('^')}^^^DR^MD`, '', '', '', '', '',
        'B12', '', '', '',
        `ADM${format(now, 'yyyyMMdd')}`, '', '', '', '', '', '', '', '', '', 'V'
      ].join('|'),

      // ORC Segment
      [
        'ORC', 'NW',
        `PLACER${visit.rows[0].visit_id.substring(0, 8)}`,
        `FILLER${modality.rows[0].modality_id.substring(0, 8)}`, '', 'SC', '^^^^^R', '', '', '',
        '', '', '', '',
        'HOSP123^General Hospital^CCN', '', '', '',
        '456 Hospital Rd^^Metropolis^NY^12345^USA'
      ].join('|'),

      // TQ1 Segment
      `TQ1|||||||${formatDate(now)}||`,

      // OBR Segment
      [
        'OBR', '',
        `PLACER${visit.rows[0].visit_id.substring(0, 8)}`,
        `FILLER${modality.rows[0].modality_id.substring(0, 8)}`,
        HARDCODED.OBR_CODE, '', '', '', '', '', '',
        'PatientStable',
        patient.rows[0].allergies || 'No known medical alerts', '', '',
        `^${doctor.name.split(' ').join('^')}^^^DR^MD`, '', '', '', '', '', '', '', '',
        'PatientTransportAmbulance',
        'D1234^Chronic obstructive pulmonary disease^ICD10', '', '',
        `^${doctor.name.split(' ').join('^')}^^^DR^MD`, '', '', '', '', '', HARDCODED.OBR_CODE
      ].join('|'),

      // OBX Segments (Height/Weight - hardcoded for example)
      'OBX|1|ST|^Body Weight||70|kg|||||F||||||',
      'OBX|2|ST|^Body Height||1.75|m|||||F||||||',

      // IPC Segment
      [
        'IPC', accNumber,
        `REQPROC${visit.rows[0].visit_id.substring(0, 8)}`,
        `1.2.840.113619.2.55.3.${visit.rows[0].visit_id.substring(0, 12)}`,
        `SPID${patient.rows[0].patient_id.substring(0, 8)}`,
        modality.rows[0].name,
        HARDCODED.OBR_CODE,
        department.rows[0].name,
        HARDCODED.ROOM,
        HARDCODED.RADIOLOGISTS
      ].join('|')
    ];

    // Return segments with newline separator
    return segments.join('\n') + '\n';

  } finally {
    client.release();
  }
}


// --- AUTHENTICATION ENDPOINTS (UPDATED) ---

// Register a new management user ONLY (first user can be registered by anyone, after that only management can register management)
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (role !== 'management') {
    return res.status(400).json({ error: 'Only management users can be registered here' });
  }
  try {
    const userCountRes = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['management']);
    const mgmtCount = parseInt(userCountRes.rows[0].count, 10);
    let allow = false;
    if (mgmtCount === 0) allow = true; // allow first management user
    else if (req.headers.authorization) {
      try {
        const decoded = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
        if (decoded.role === 'management') allow = true;
      } catch {}
    }
    if (!allow) return res.status(403).json({ error: 'Only management can register new management users' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3) RETURNING user_id, username, role`,
      [username, hash, role]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Management creates doctor/department users via this endpoint
app.post('/users', requireRole(['management']), async (req, res) => {
  const { username, password, role, doctor_id, department_id } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (role === 'management') {
    return res.status(400).json({ error: 'Use /register for management users' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role, doctor_id, department_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING user_id, username, role`,
      [username, hash, role, doctor_id || null, department_id || null]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Login endpoint (unchanged)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({
      user_id: user.user_id,
      role: user.role,
      doctor_id: user.doctor_id,
      department_id: user.department_id
    }, JWT_SECRET, { expiresIn: '8h' });

    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Management creates department user logins
app.post('/users/department', requireRole(['management']), async (req, res) => {
  const { username, password, department_id } = req.body;
  if (!username || !password || !department_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role, department_id)
       VALUES ($1, $2, 'department', $3)
       RETURNING user_id, username, role, department_id`,
      [username, hash, department_id]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.post('/api/reports/upload', upload.single('report_file'), async (req, res) => {
  const { visit_id, patient_id, doctor_id, report_type, summary } = req.body;
  if (!visit_id || !patient_id || !req.file) {
    return res.status(400).json({ error: 'Missing required fields or file' });
  }

  // Create folder path: /reports/{patient_id}/{visit_id}/
  const path = require('path');
  const reportsDir = path.join(__dirname, 'reports', patient_id, visit_id);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Generate a unique report_id and filename
  const report_id = uuidv4();
  const ext = path.extname(req.file.originalname) || '.pdf';
  const file_name = req.file.originalname;
  const file_path = path.join('reports', patient_id, visit_id, `${report_id}${ext}`);

  // Move the file from tmp_reports to the final location
  fs.renameSync(req.file.path, path.join(__dirname, file_path));

  // Insert metadata into the database
  await pool.query(
    `INSERT INTO reports (report_id, visit_id, patient_id, doctor_id, report_type, file_name, file_path, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [report_id, visit_id, patient_id, doctor_id, report_type || null, file_name, file_path, summary || null]
  );

  res.json({ success: true, report_id });
});

app.get('/api/reports', async (req, res) => {
  const { visit_id } = req.query;
  if (!visit_id) return res.json([]);
  const result = await pool.query('SELECT * FROM reports WHERE visit_id = $1', [visit_id]);
  res.json(result.rows);
});

app.get('/api/reports/download/:report_id', async (req, res) => {
  const { report_id } = req.params;
  const result = await pool.query('SELECT * FROM reports WHERE report_id = $1', [report_id]);
  if (!result.rows.length) return res.status(404).send('Not found');
  const report = result.rows[0];
  res.download(path.join(__dirname, report.file_path), report.file_name);
});

// Management assigns a visit to a doctor for an existing patient
app.post('/visits', requireRole(['management']), async (req, res) => {
  const { patient_id, doctor_id, reason } = req.body;
  if (!patient_id || !doctor_id || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Find the doctor's department
    const docRes = await pool.query('SELECT department_id FROM doctors WHERE doctor_id = $1', [doctor_id]);
    if (!docRes.rows.length) return res.status(400).json({ error: 'Doctor not found' });
    const department_id = docRes.rows[0].department_id;

    // Insert the visit
    const result = await pool.query(
      `INSERT INTO visits (patient_id, doctor_id, department_id, reason, status)
       VALUES ($1, $2, $3, $4, 'scheduled')
       RETURNING *`,
      [patient_id, doctor_id, department_id, reason]
    );

    // Optionally: Notify doctor via WebSocket (if you want real-time updates)
    // broadcastNewOrder(); // You can enhance this for doctor-specific notifications

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//DOCTOR COED

// Management assigns a visit to a doctor for an existing patient
app.post('/visits', requireRole(['management']), async (req, res) => {
  const { patient_id, doctor_id, reason } = req.body;
  if (!patient_id || !doctor_id || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Find the doctor's department
    const docRes = await pool.query('SELECT department_id FROM doctors WHERE doctor_id = $1', [doctor_id]);
    if (!docRes.rows.length) return res.status(400).json({ error: 'Doctor not found' });
    const department_id = docRes.rows[0].department_id;

    // Insert the visit
    const result = await pool.query(
      `INSERT INTO visits (patient_id, doctor_id, department_id, reason, status)
       VALUES ($1, $2, $3, $4, 'scheduled')
       RETURNING *`,
      [patient_id, doctor_id, department_id, reason]
    );

    // Optionally: Notify doctor via WebSocket (if you want real-time updates)
    // broadcastNewOrder(); // You can enhance this for doctor-specific notifications

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/doctor/queue', requireRole(['doctor']), async (req, res) => {
  try {
    const doctor_id = req.user.doctor_id;
    const result = await pool.query(`
      SELECT v.*, p.first_name, p.last_name, p.dob, p.sex, p.phone, p.address, p.allergies
      FROM visits v
      JOIN patients p ON v.patient_id = p.patient_id
      WHERE v.doctor_id = $1
      AND v.status IN ('scheduled', 'in-progress')
      ORDER BY v.created_at
    `, [doctor_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/doctor/patients', requireRole(['doctor']), async (req, res) => {
  const q = req.query.q || '';
  const result = await pool.query(`
    SELECT * FROM patients
    WHERE LOWER(first_name) LIKE LOWER($1) OR LOWER(last_name) LIKE LOWER($1) OR phone LIKE $1
    ORDER BY last_name, first_name
    LIMIT 20
  `, [`%${q}%`]);
  res.json(result.rows);
});
app.get('/doctor/patient/:id/visits', requireRole(['doctor']), async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(`
    SELECT v.*, d.name AS department_name
    FROM visits v
    LEFT JOIN departments d ON v.department_id = d.department_id
    WHERE v.patient_id = $1
    ORDER BY v.created_at DESC
    LIMIT 10
  `, [id]);
  res.json(result.rows);
});
app.post('/doctor/visit/:id/complete', requireRole(['doctor']), async (req, res) => {
  const { id } = req.params;
  await pool.query(`UPDATE visits SET status = 'completed' WHERE visit_id = $1`, [id]);
  res.json({ success: true });
});


// --- ALL YOUR EXISTING ENDPOINTS BELOW (UNCHANGED) ---

app.get('/patients', async (req, res) => {
  const result = await pool.query('SELECT * FROM patients ORDER BY last_name, first_name');
  res.json(result.rows);
});

app.get('/patient/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM patients WHERE patient_id = $1', [req.params.id]);
  res.json(result.rows[0] || {});
});

app.get('/departments', async (req, res) => {
  const result = await pool.query('SELECT * FROM departments ORDER BY name');
  res.json(result.rows);
});

app.get('/modalities/:departmentId', async (req, res) => {
  const result = await pool.query('SELECT * FROM modalities WHERE department_id = $1 ORDER BY name', [req.params.departmentId]);
  res.json(result.rows);
});

// --- HL7 generator for custom order (your existing function) ---
// (Assume generateHL7Custom is defined above)
app.post('/send_custom', async (req, res) => {
  try {
    const { patientId, departmentId, modalityId, doctorId } = req.body;
    if (!patientId || !departmentId || !modalityId || !doctorId) {
      return res.status(400).send('Missing required fields');
    }
    // 1. Create a new visit (or fetch existing scheduled visit)
    const visitRes = await pool.query(
      `INSERT INTO visits (patient_id, doctor_id, department_id, reason, status)
       VALUES ($1, $2, $3, $4, 'scheduled')
       RETURNING visit_id`,
      [patientId, doctorId, departmentId, 'HL7 Order']
    );
    const visitId = visitRes.rows[0].visit_id;

    // 2. Generate HL7 with visitId
    const hl7 = await generateHL7Custom(patientId, departmentId, modalityId, visitId);

    // 3. Send HL7 to dcm4chee (NEW)
    try {
      await sendHL7ToDcm4chee(
        hl7,
        process.env.DCM4CHEE_HOST || 'localhost',
        process.env.DCM4CHEE_HL7_PORT ? parseInt(process.env.DCM4CHEE_HL7_PORT) : 2575
      );
    } catch (err) {
      console.error('Failed to send HL7 to dcm4chee:', err);
      // Optionally: return error or set order status to "FAILED"
      // return res.status(500).send('Failed to send HL7 to dcm4chee');
    }

    // 4. Save HL7 order
    await pool.query(
      `INSERT INTO hl7_orders (patient_id, department_id, modality_id, doctor_id, visit_id, hl7_message, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED')`,
      [patientId, departmentId, modalityId, doctorId, visitId, hl7]
    );
    res.type('text/plain').send(
      `HL7 order sent for patient ${patientId}\nDepartment: ${departmentId}\nModality: ${modalityId}\nDoctor: ${doctorId}\n\nHL7 Message:\n${hl7.replace(/\r/g, '\n')}`
    );
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});



app.get('/mwl_orders/:department', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT 
        p.patient_id,
        p.first_name || ' ' || p.last_name AS patient_name,
        m.name AS modality,
        d.name AS department,
        m.name AS procedure,
        ho.created_at AS scheduled_time,
        ho.status
      FROM hl7_orders ho
      JOIN patients p ON ho.patient_id = p.patient_id
      JOIN departments d ON ho.department_id = d.department_id
      JOIN modalities m ON ho.modality_id = m.modality_id
      WHERE d.name ILIKE $1
      ORDER BY ho.created_at DESC
    `, [`%${req.params.department}%`]);
    client.release();

    res.json(result.rows.map(row => ({
      patientId: row.patient_id,
      patientName: row.patient_name,
      procedure: row.procedure,
      modality: row.modality,
      scheduledTime: row.scheduled_time,
      status: row.status
    })));
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: err.message, orders: [] });
  }
});

app.post('/patients', async (req, res) => {
  const { first_name, last_name, dob, sex, address, allergies } = req.body;
  if (!first_name || !last_name || !dob || !sex || !address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO patients (first_name, last_name, dob, sex, address, allergies)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [first_name, last_name, dob, sex, address, allergies || null]
    );
    res.status(201).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/doctors', requireRole(['management']), async (req, res) => {
  const { name, mci_number, specialization, department_id } = req.body;
  if (!name || !mci_number || !department_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO doctors (name, mci_number, specialization, department_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, mci_number, specialization || null, department_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/doctors', requireRole(['management']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, dep.name AS department_name
      FROM doctors d
      LEFT JOIN departments dep ON d.department_id = dep.department_id
      ORDER BY d.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get department worklist (pending orders)
app.get('/department/worklist', requireRole(['department']), async (req, res) => {
  const department_id = req.user.department_id;
  const result = await pool.query(`
    SELECT ho.*, p.first_name, p.last_name, v.reason, d.name AS department_name, m.name AS modality_name, doc.name AS doctor_name
    FROM hl7_orders ho
    JOIN patients p ON ho.patient_id = p.patient_id
    LEFT JOIN visits v ON ho.visit_id = v.visit_id
    LEFT JOIN departments d ON ho.department_id = d.department_id
    LEFT JOIN modalities m ON ho.modality_id = m.modality_id
    LEFT JOIN doctors doc ON ho.doctor_id = doc.doctor_id
    WHERE ho.department_id = $1 AND ho.status = 'SCHEDULED'
    ORDER BY ho.created_at
  `, [department_id]);
  res.json(result.rows);
});

// Mark order as done
app.post('/department/order/:order_id/complete', requireRole(['department']), async (req, res) => {
  const { order_id } = req.params;
  await pool.query(`UPDATE hl7_orders SET status = 'COMPLETED' WHERE order_id = $1`, [order_id]);
  res.json({ success: true });
});

// Get completed orders
app.get('/department/orders/completed', requireRole(['department']), async (req, res) => {
  const department_id = req.user.department_id;
  const result = await pool.query(`
    SELECT ho.*, p.first_name, p.last_name, v.reason, d.name AS department_name, m.name AS modality_name, doc.name AS doctor_name
    FROM hl7_orders ho
    JOIN patients p ON ho.patient_id = p.patient_id
    LEFT JOIN visits v ON ho.visit_id = v.visit_id
    LEFT JOIN departments d ON ho.department_id = d.department_id
    LEFT JOIN modalities m ON ho.modality_id = m.modality_id
    LEFT JOIN doctors doc ON ho.doctor_id = doc.doctor_id
    WHERE ho.department_id = $1 AND ho.status = 'COMPLETED'
    ORDER BY ho.created_at DESC
    LIMIT 100
  `, [department_id]);
  res.json(result.rows);
});

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));
const server = app.listen(5000, () => console.log('Server running on http://localhost:5000'));

// --- WebSocket server for real-time updates ---
const wss = new WebSocket.Server({ port: 8081 });
wss.on('connection', ws => {
  console.log('WebSocket client connected');
});
function broadcastNewOrder() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send('NEW_ORDER');
    }
  });
}
