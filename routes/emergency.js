// routes/emergency.js

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Use your existing pool config or import it from your db module
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pacs',
  password: 'pacs',
  database: 'pacsdb'
});

// --- Create a new triage record ---
router.post('/triage', async (req, res) => {
  const {
    patient_id,
    triage_datetime,
    mode_of_arrival,
    referral,
    mode_of_transport,
    referral_specify,
    patient_relative,
    relative_contact,
    identification_mark1,
    identification_mark2,
    presenting_complaints,
    weight,
    cbg,
    allergy_status,
    allergy_specify,
    past_history,
    temp_c,
    pulse,
    resp_rate,
    bp_systolic,
    bp_diastolic,
    spo2,
    capillary_refill_secs,
    vitals_site,
    pain_score,
    neuro_response,
    lmp,
    pregnancy,
    gravida,
    para,
    edd,
    triage_category,
    bed_no,
    triage_nurse_name,
    triage_nurse_sign,
    daep_name,
    daep_sign
  } = req.body;

  // Basic validation
  if (!patient_id || !mode_of_arrival || !referral || !mode_of_transport || !allergy_status || !neuro_response || !triage_category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO triage_records (
        patient_id, triage_datetime, mode_of_arrival, referral, mode_of_transport, referral_specify, 
        patient_relative, relative_contact, identification_mark1, identification_mark2, presenting_complaints, 
        weight, cbg, allergy_status, allergy_specify, past_history, temp_c, pulse, resp_rate, bp_systolic, 
        bp_diastolic, spo2, capillary_refill_secs, vitals_site, pain_score, neuro_response, lmp, pregnancy, 
        gravida, para, edd, triage_category, bed_no, triage_nurse_name, triage_nurse_sign, daep_name, daep_sign
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29,
        $30, $31, $32, $33, $34, $35, $36, $37
      )
      RETURNING *`,
      [
        patient_id, triage_datetime || new Date(), mode_of_arrival, referral, mode_of_transport, referral_specify,
        patient_relative, relative_contact, identification_mark1, identification_mark2, presenting_complaints,
        weight, cbg, allergy_status, allergy_specify, past_history, temp_c, pulse, resp_rate, bp_systolic,
        bp_diastolic, spo2, capillary_refill_secs, vitals_site, pain_score, neuro_response, lmp, pregnancy,
        gravida, para, edd, triage_category, bed_no, triage_nurse_name, triage_nurse_sign, daep_name, daep_sign
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting triage record:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Get all triage records for a patient ---
router.get('/triage/patient/:patient_id', async (req, res) => {
  const { patient_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM triage_records WHERE patient_id = $1 ORDER BY triage_datetime DESC',
      [patient_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get a single triage record by triage_id ---
router.get('/triage/:triage_id', async (req, res) => {
  const { triage_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM triage_records WHERE triage_id = $1',
      [triage_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- List all triage records (optional, for admin/staff dashboard) ---
router.get('/triage', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM triage_records ORDER BY triage_datetime DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
