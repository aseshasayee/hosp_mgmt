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

// --- Create a new primary assessment record ---
router.post('/primary-assessment', async (req, res) => {
  const {
    patient_id,
    visit_id,
    return_within_72h,
    return_within_72h_date,
    is_trauma,
    place_of_incident,
    presenting_complaints,
    airway_status,
    cervical_spine,
    cervical_collar,
    gurgling,
    stridor,
    wheeze,
    airway_intervention, // array
    tube_size,
    respiratory_rate,
    spo2,
    air_entry,
    subcutaneous_emphysema,
    trachea_position,
    breathing_intervention, // array
    pulse_rate,
    blood_pressure,
    capillary_refill_secs,
    distended_neck_veins,
    skin,
    active_bleeding,
    pelvic_compression,
    iv_line,
    blood_transfusion,
    chest_compressions,
    central_line,
    vasopressors,
    iv_fluid,
    splinting_compressions_suture_ligation,
    gcs,
    pupils,
    pnd,
    cbg,
    plantar_reflex,
    temperature,
    log_roll,
    exposure_intervention,
    ecg,
    chest_xray,
    fast,
    two_d_echo,
    blood_gas_analysis,
    pelvic_xray,
    ng_tube,
    foley_catheter
  } = req.body;

  if (!patient_id || !visit_id) {
    return res.status(400).json({ error: 'Missing required patient_id or visit_id' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO physician_primary_assessment (
        patient_id, visit_id, return_within_72h, return_within_72h_date, is_trauma, place_of_incident, presenting_complaints,
        airway_status, cervical_spine, cervical_collar, gurgling, stridor, wheeze, airway_intervention, tube_size,
        respiratory_rate, spo2, air_entry, subcutaneous_emphysema, trachea_position, breathing_intervention,
        pulse_rate, blood_pressure, capillary_refill_secs, distended_neck_veins, skin, active_bleeding, pelvic_compression,
        iv_line, blood_transfusion, chest_compressions, central_line, vasopressors, iv_fluid, splinting_compressions_suture_ligation,
        gcs, pupils, pnd, cbg, plantar_reflex, temperature, log_roll, exposure_intervention,
        ecg, chest_xray, fast, two_d_echo, blood_gas_analysis, pelvic_xray, ng_tube, foley_catheter
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32, $33, $34, $35,
        $36, $37, $38, $39, $40, $41, $42, $43,
        $44, $45, $46, $47, $48, $49, $50, $51
      ) RETURNING *`,
      [
        patient_id, visit_id, return_within_72h, return_within_72h_date, is_trauma, place_of_incident, presenting_complaints,
        airway_status, cervical_spine, cervical_collar, gurgling, stridor, wheeze, airway_intervention, tube_size,
        respiratory_rate, spo2, air_entry, subcutaneous_emphysema, trachea_position, breathing_intervention,
        pulse_rate, blood_pressure, capillary_refill_secs, distended_neck_veins, skin, active_bleeding, pelvic_compression,
        iv_line, blood_transfusion, chest_compressions, central_line, vasopressors, iv_fluid, splinting_compressions_suture_ligation,
        gcs, pupils, pnd, cbg, plantar_reflex, temperature, log_roll, exposure_intervention,
        ecg, chest_xray, fast, two_d_echo, blood_gas_analysis, pelvic_xray, ng_tube, foley_catheter
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting primary assessment:', err);
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

// --- Get primary assessment by patient and visit ---
router.get('/primary-assessment/:patient_id/:visit_id', async (req, res) => {
  const { patient_id, visit_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM physician_primary_assessment WHERE patient_id = $1 AND visit_id = $2',
      [patient_id, visit_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Update primary assessment ---
router.put('/primary-assessment/:assessment_id', async (req, res) => {
  const { assessment_id } = req.params;
  const updateFields = req.body;
  const keys = Object.keys(updateFields);
  const values = Object.values(updateFields);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

  try {
    const result = await pool.query(
      `UPDATE physician_primary_assessment SET ${setClause}, updated_at = NOW() WHERE assessment_id = $${keys.length + 1} RETURNING *`,
      [...values, assessment_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
