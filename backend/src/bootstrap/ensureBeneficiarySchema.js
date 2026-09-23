import db from '../config/db.js';

export async function ensureBeneficiarySchema() {
  const tables = [
    'beneficiary_categories', 'beneficiaries', 'beneficiary_category_assignments',
    'beneficiary_disabilities', 'beneficiary_family_members', 'beneficiary_education',
    'beneficiary_employment', 'beneficiary_assistance_requirements', 'beneficiary_documents',
    'beneficiary_source_records', 'import_batches', 'import_rows',
    'beneficiary_cards', 'biometric_credentials', 'bnf_programs',
    'program_volunteer_requirements', 'program_beneficiary_requirements',
    'program_beneficiaries', 'program_service_requirements', 'program_requirements',
    'program_volunteers', 'bnf_volunteers', 'benefits', 'benefit_eligibility_rules',
    'benefit_distributions', 'benefit_distribution_items', 'beneficiary_audit_logs',
    'beneficiary_sequences',
  ];

  for (const t of tables) {
    await db._pool.query(`CREATE TABLE IF NOT EXISTS ${t} (id SERIAL PRIMARY KEY)`).catch(() => {});
  }

await db._pool.query(
    'ALTER TABLE biometric_credentials ADD COLUMN IF NOT EXISTS template_data TEXT'
  ).catch(() => {});

  await db._pool.query(
    "ALTER TABLE biometric_credentials ADD COLUMN IF NOT EXISTS template_format TEXT NOT NULL DEFAULT 'legacy'"
  ).catch(() => {});

  await db._pool.query(
    'ALTER TABLE biometric_credentials ADD COLUMN IF NOT EXISTS template_metadata JSONB'
  ).catch(() => {});

  await db._pool.query(
    "ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS kit_given BOOLEAN NOT NULL DEFAULT FALSE"
  ).catch(() => {});

  // Beneficiaries mobile-app operators — only these workers can log into the app.
  await db._pool.query(
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS bnf_operator BOOLEAN NOT NULL DEFAULT FALSE"
  ).catch(() => {});

  await db._pool.query(
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS phone TEXT"
  ).catch(() => {});

  await db._pool.query(
    "ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS kit_given_at TIMESTAMPTZ"
  ).catch(() => {});

  await db._pool.query(
    "ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS kit_given_by TEXT"
  ).catch(() => {});

  // Upgrade guard for installations that still use the old kit_collected*
  // naming: copy the values over and drop the legacy columns.
  await db._pool.query(
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'beneficiaries' AND column_name = 'kit_collected_at') THEN
         UPDATE beneficiaries
         SET kit_given = COALESCE(kit_given, kit_collected),
             kit_given_at = COALESCE(kit_given_at, kit_collected_at),
             kit_given_by = COALESCE(kit_given_by, kit_collected_by)
         WHERE kit_given_at IS NULL AND kit_collected_at IS NOT NULL;
         ALTER TABLE beneficiaries DROP COLUMN IF EXISTS kit_collected;
         ALTER TABLE beneficiaries DROP COLUMN IF EXISTS kit_collected_at;
         ALTER TABLE beneficiaries DROP COLUMN IF EXISTS kit_collected_by;
       END IF;
     END $$`
  ).catch(() => {});

  // Beneficiary Categories seed
  const categories = [
    ['Visually Impaired', 'Beneficiaries with visual impairment'],
    ['Children', 'Child beneficiaries under 18'],
    ['Senior Citizens', 'Elderly beneficiaries above 60'],
    ['Women', 'Women beneficiaries'],
    ['Underprivileged Families', 'Families from economically weaker sections'],
    ['Persons with Disabilities', 'Beneficiaries with various disabilities'],
    ['Other', 'Other beneficiaries'],
  ];
  for (const [name, description] of categories) {
    await db._pool.query(
      `INSERT INTO beneficiary_categories (name, description) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM beneficiary_categories WHERE name = $1)`,
      [name, description]
    ).catch(() => {});
  }

  // Benefits seed
  const benefitsList = [
    ['Nutrition Kit', 'Monthly nutrition support kit', 'Food'],
    ['Education Kit', 'School supplies and educational materials', 'Education'],
    ['White Cane', 'White cane for visually impaired', 'Assistive Device'],
    ['Talking Watch', 'Audio-enabled watch for visually impaired', 'Assistive Device'],
    ['Braille Notebook', 'Braille notepad for writing', 'Assistive Device'],
    ['Braille Slate & Stylus', 'Braille writing tools', 'Assistive Device'],
    ['Computer / Laptop', 'Computer or laptop for education/employment', 'Technology'],
    ['Clothing', 'Clothing assistance', 'Essential'],
    ['Accommodation', 'Housing/shelter support', 'Essential'],
    ['Financial Assistance', 'Direct financial support', 'Financial'],
    ['Scholarship', 'Educational scholarship', 'Education'],
    ['Medical Assistance', 'Medical treatment and medicine support', 'Health'],
    ['Travel Assistance', 'Travel fare support', 'Transport'],
    ['Festival Kit', 'Festival celebration kit', 'Essential'],
  ];
  for (const [name, description, category] of benefitsList) {
    await db._pool.query(
      `INSERT INTO benefits (name, description, category) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM benefits WHERE name = $1)`,
      [name, description, category]
    ).catch(() => {});
  }

  // Sequence table
  await db._pool.query(
    `CREATE TABLE IF NOT EXISTS beneficiary_sequences (id SERIAL PRIMARY KEY, current_value INT DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW())`
  ).catch(() => {});
  await db._pool.query(
    `INSERT INTO beneficiary_sequences (current_value) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM beneficiary_sequences)`
  ).catch(() => {});
}
