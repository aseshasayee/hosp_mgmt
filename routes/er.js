const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pacs',
  password: 'pacs',
  database: 'pacsdb'
});

// --- Referrals ---
router.post('/referrals', async (req, res) => {
  const { patient_id, visit_id, specialty, call_doctor_name, call_time, seen_by_doctor_name, seen_time } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO er_referrals (patient_id, visit_id, specialty, call_doctor_name, call_time, seen_by_doctor_name, seen_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [patient_id, visit_id, specialty, call_doctor_name, call_time, seen_by_doctor_name, seen_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Investigations ---
router.post('/investigations', async (req, res) => {
  const {
    patient_id, visit_id, blood_urea, s_creatinine, electrolytes, na, k, troponin, bnp, others_blood,
    xray, xray_findings, ct_scan, mri, ecg,
    abg_time, abg_ph, abg_pco2, abg_po2, abg_hco3, abg_spo2, abg_hb, abg_na, abg_k, abg_lactate, abg_glucose
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO er_investigations (
        patient_id, visit_id, blood_urea, s_creatinine, electrolytes, na, k, troponin, bnp, others_blood,
        xray, xray_findings, ct_scan, mri, ecg,
        abg_time, abg_ph, abg_pco2, abg_po2, abg_hco3, abg_spo2, abg_hb, abg_na, abg_k, abg_lactate, abg_glucose
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
      ) RETURNING *`,
      [
        patient_id, visit_id, blood_urea, s_creatinine, electrolytes, na, k, troponin, bnp, others_blood,
        xray, xray_findings, ct_scan, mri, ecg,
        abg_time, abg_ph, abg_pco2, abg_po2, abg_hco3, abg_spo2, abg_hb, abg_na, abg_k, abg_lactate, abg_glucose
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Reassessment ---
router.post('/reassessments', async (req, res) => {
  const { patient_id, visit_id, reassessment_time, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO er_reassessments (patient_id, visit_id, reassessment_time, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [patient_id, visit_id, reassessment_time, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Discharge/Transfer ---
router.post('/discharge-transfer', async (req, res) => {
  const {
    patient_id, visit_id, disposition, admitted_dept, consultant, ward_icu,
    pulse, bp, rr, spo2, temp, er_physician_name, reg_no, signature, discharge_time
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO er_discharge_transfer (
        patient_id, visit_id, disposition, admitted_dept, consultant, ward_icu,
        pulse, bp, rr, spo2, temp, er_physician_name, reg_no, signature, discharge_time
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      ) RETURNING *`,
      [
        patient_id, visit_id, disposition, admitted_dept, consultant, ward_icu,
        pulse, bp, rr, spo2, temp, er_physician_name, reg_no, signature, discharge_time
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
