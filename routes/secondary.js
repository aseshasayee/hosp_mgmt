// routes/secondary.js

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Use your pool config or import from db module
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'pacs',
  password: 'pacs',
  database: 'pacsdb'
});

// --- Create a new secondary assessment record ---
router.post('/secondary-assessment', async (req, res) => {
  const {
    patient_id,
    visit_id,
    symptoms_and_signs,
    allergy_history,
    medication_history,
    pmh_dm,
    pmh_htn,
    pmh_cad,
    pmh_ckd,
    pmh_copd,
    pmh_cld,
    pmh_ptb,
    pmh_cva,
    pmh_others,
    pmh_smoking,
    pmh_alcohol,
    pmh_malignancies,
    last_meal_time,
    family_history,
    gyn_g,
    gyn_p,
    gyn_l,
    gyn_a,
    gyn_lmp,
    gyn_menarch,
    gyn_menopause,
    pallor,
    icterus,
    cyanosis,
    clubbing,
    lymphadenopathy,
    edema,
    ent_exam,
    cardiac_exam,
    chest_exam,
    abdomen_exam,
    neuro_exam
  } = req.body;

  if (!patient_id || !visit_id) {
    return res.status(400).json({ error: 'Missing required patient_id or visit_id' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO physician_secondary_assessment (
        patient_id, visit_id, symptoms_and_signs, allergy_history, medication_history,
        pmh_dm, pmh_htn, pmh_cad, pmh_ckd, pmh_copd, pmh_cld, pmh_ptb, pmh_cva, pmh_others,
        pmh_smoking, pmh_alcohol, pmh_malignancies, last_meal_time, family_history,
        gyn_g, gyn_p, gyn_l, gyn_a, gyn_lmp, gyn_menarch, gyn_menopause,
        pallor, icterus, cyanosis, clubbing, lymphadenopathy, edema,
        ent_exam, cardiac_exam, chest_exam, abdomen_exam, neuro_exam
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37
      ) RETURNING *`,
      [
        patient_id, visit_id, symptoms_and_signs, allergy_history, medication_history,
        pmh_dm, pmh_htn, pmh_cad, pmh_ckd, pmh_copd, pmh_cld, pmh_ptb, pmh_cva, pmh_others,
        pmh_smoking, pmh_alcohol, pmh_malignancies, last_meal_time, family_history,
        gyn_g, gyn_p, gyn_l, gyn_a, gyn_lmp, gyn_menarch, gyn_menopause,
        pallor, icterus, cyanosis, clubbing, lymphadenopathy, edema,
        ent_exam, cardiac_exam, chest_exam, abdomen_exam, neuro_exam
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting secondary assessment:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Get all patients (for dropdown) ---
router.get('/patients', async (req, res) => {
  try {
    const result = await pool.query('SELECT patient_id, first_name, last_name, dob FROM patients ORDER BY last_name, first_name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get secondary assessment by patient and visit ---
router.get('/secondary-assessment/:patient_id/:visit_id', async (req, res) => {
  const { patient_id, visit_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM physician_secondary_assessment WHERE patient_id = $1 AND visit_id = $2',
      [patient_id, visit_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Update secondary assessment ---
router.put('/secondary-assessment/:assessment_id', async (req, res) => {
  const { assessment_id } = req.params;
  const updateFields = req.body;
  const keys = Object.keys(updateFields);
  const values = Object.values(updateFields);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

  try {
    const result = await pool.query(
      `UPDATE physician_secondary_assessment SET ${setClause}, updated_at = NOW() WHERE assessment_id = $${keys.length + 1} RETURNING *`,
      [...values, assessment_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
