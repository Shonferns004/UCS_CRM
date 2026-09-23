import {
  generateBeneficiaryCode, createBeneficiary, getBeneficiaryById, getBeneficiaryByCode,
  updateBeneficiary, listBeneficiaries, searchBeneficiaries, getBeneficiaryOverview,
  searchByQRToken, searchByMobile, markKitGiven
} from '../models/beneficiaryModel.js';
import { assignCategories, getBeneficiaryCategories } from '../models/beneficiaryCategoryModel.js';
import { getDisabilities } from '../models/beneficiaryDisabilityModel.js';
import { getFamilyMembers } from '../models/beneficiaryFamilyModel.js';
import { getEducation } from '../models/beneficiaryEducationModel.js';
import { getEmployment } from '../models/beneficiaryEmploymentModel.js';
import { getAssistances } from '../models/beneficiaryAssistanceModel.js';
import { getDocuments } from '../models/beneficiaryDocumentModel.js';
import { getCards, getActiveCard } from '../models/beneficiaryCardModel.js';
import { getBiometricStatus } from '../models/biometricModel.js';
import { getSourceRecords } from '../models/beneficiarySourceModel.js';
import { getBeneficiaryDistributionHistory } from '../models/distributionModel.js';
import { logAuditEvent, getAuditLogs } from '../models/auditLogModel.js';

export const createNewBeneficiary = async (req, res) => {
  try {
    const {
      full_name, first_name, middle_name, last_name, date_of_birth, gender,
      mobile, alternate_mobile, email, address_line_1, address_line_2, area,
      city, district, state, pincode, photo, monthly_family_income, income_category,
      bpl_available, ration_card_available, occupation, mother_name, father_name,
      guardian_name, guardian_occupation, total_family_members, ngo_id, registration_date,
      category_ids, disabilities, family_members, education, employment, assistance_requirements,
    } = req.body;

    if (!full_name) return res.status(400).json({ message: 'Full name is required' });

    const beneficiary_code = await generateBeneficiaryCode();
    const created_by = req.user?.name || req.user?.email || 'system';

    const beneficiary = await createBeneficiary({
      beneficiary_code, full_name, first_name, middle_name, last_name,
      date_of_birth, gender, mobile, alternate_mobile, email,
      address_line_1, address_line_2, area, city, district, state, pincode, photo,
      monthly_family_income, income_category, bpl_available, ration_card_available,
      occupation, mother_name, father_name, guardian_name, guardian_occupation,
      total_family_members, ngo_id, registration_date,
      status: 'ACTIVE', fingerprint_status: 'NOT_REGISTERED',
      created_by, updated_by: created_by,
    });

    if (category_ids && category_ids.length > 0) {
      await assignCategories(beneficiary.id, category_ids);
    }

    await logAuditEvent({
      entity_type: 'beneficiary', entity_id: beneficiary.id,
      beneficiary_id: beneficiary.id, action: 'CREATED',
      details: { beneficiary_code }, performed_by: created_by,
    });

    return res.status(201).json({ message: 'Beneficiary created', beneficiary });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

// True when the beneficiary collected their kit within the last 3 months —
// the window in which an event-kit should only be handed out after an
// explicit operator override.
export function isWithinThreeMonths(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= THREE_MONTHS_MS;
}

// Assembles the fully-enriched beneficiary shape (base row + every
// sub-resource) used both by GET /:id and the QR lookup endpoint.
const buildFullBeneficiary = async (id) => {
  const beneficiary = await getBeneficiaryById(id);
  if (!beneficiary) return null;

  const categories = await getBeneficiaryCategories(beneficiary.id);
  const disabilities = await getDisabilities(beneficiary.id);
  const family = await getFamilyMembers(beneficiary.id);
  const education = await getEducation(beneficiary.id);
  const employment = await getEmployment(beneficiary.id);
  const assistances = await getAssistances(beneficiary.id);
  const documents = await getDocuments(beneficiary.id);
  const cards = await getCards(beneficiary.id);
  const activeCard = await getActiveCard(beneficiary.id);
  const biometric = await getBiometricStatus(beneficiary.id);
  const sourceRecords = await getSourceRecords(beneficiary.id);
  const distributions = await getBeneficiaryDistributionHistory(beneficiary.id);

  return {
    ...beneficiary,
    categories, disabilities, family, education, employment,
    assistances, documents, cards, activeCard, biometric,
    sourceRecords, distributions,
  };
};

export const getBeneficiary = async (req, res) => {
  try {
    const beneficiary = await buildFullBeneficiary(req.params.id);
    if (!beneficiary) return res.status(404).json({ message: 'Beneficiary not found' });

    return res.json(beneficiary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// QR / barcode lookup. Resolves the qr_token to its card, then returns the
// full enriched beneficiary so the operator app gets every detail (including
// kit_given_at) in a single request.
export const lookupBeneficiaryByToken = async (req, res) => {
  try {
    const card = await searchByQRToken(req.params.token);
    if (!card || !card.id) return res.status(404).json({ message: 'No beneficiary found for this QR code' });

    const beneficiary = await buildFullBeneficiary(card.id);
    if (!beneficiary) return res.status(404).json({ message: 'No beneficiary found for this QR code' });

    return res.json(beneficiary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getBeneficiaryByCodeController = async (req, res) => {
  try {
    const beneficiary = await getBeneficiaryByCode(req.params.code);
    if (!beneficiary) return res.status(404).json({ message: 'Beneficiary not found' });
    return res.json(beneficiary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const markBeneficiaryKitGiven = async (req, res) => {
  try {
    const beneficiary = await getBeneficiaryById(req.params.id);
    if (!beneficiary) return res.status(404).json({ message: 'Beneficiary not found' });

    // A kit may only be handed out once every 3 months. If one was given
    // within the window, only an explicit override (operator accepted the
    // "already given on X" prompt) records another handout.
    if (isWithinThreeMonths(beneficiary.kit_given_at) && req.body?.override !== true) {
      const givenOn = beneficiary.kit_given_at
        ? new Date(beneficiary.kit_given_at).toISOString().slice(0, 10)
        : null;
      return res.status(400).json({
        message: givenOn
          ? `Kit already given on ${givenOn}. Would you still want to give this beneficiary the kit?`
          : 'Kit already given. Would you still want to give this beneficiary the kit?',
        withinThreeMonths: true,
        beneficiary,
      });
    }

    const givenBy = req.user?.name || req.user?.email || 'system';
    const updated = await markKitGiven(beneficiary.id, givenBy);

    await logAuditEvent({
      entity_type: 'beneficiary', entity_id: beneficiary.id,
      beneficiary_id: beneficiary.id, action: 'KIT_GIVEN',
      details: { beneficiary_code: beneficiary.beneficiary_code },
      performed_by: givenBy,
    });

    return res.json({ message: 'Kit marked as given', beneficiary: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateBeneficiaryController = async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.id;
    delete updates.beneficiary_code;
    delete updates.created_at;
    delete updates.created_by;

    const updated_by = req.user?.name || req.user?.email || 'system';
    updates.updated_by = updated_by;

    const beneficiary = await updateBeneficiary(req.params.id, updates);

    if (req.body.category_ids) {
      await assignCategories(beneficiary.id, req.body.category_ids);
    }

    await logAuditEvent({
      entity_type: 'beneficiary', entity_id: beneficiary.id,
      beneficiary_id: beneficiary.id, action: 'UPDATED',
      details: { fields: Object.keys(updates) }, performed_by: updated_by,
    });

    return res.json({ message: 'Beneficiary updated', beneficiary });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const listAllBeneficiaries = async (req, res) => {
  try {
    const { page, pageSize, search, status, ngo_id, category_id, state, city, kit_given } = req.query;
    const result = await listBeneficiaries({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 25,
      search, status, ngo_id: ngo_id ? parseInt(ngo_id) : undefined,
      category_id, state, city, kit_given,
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const searchBeneficiariesController = async (req, res) => {
  try {
    const { q } = req.query;
    const results = await searchBeneficiaries(q);
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getOverview = async (req, res) => {
  try {
    const overview = await getBeneficiaryOverview();
    return res.json(overview);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const searchByQR = async (req, res) => {
  try {
    const { token } = req.query;
    const result = await searchByQRToken(token);
    if (!result) return res.status(404).json({ message: 'No beneficiary found for this QR code' });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const searchByMobileController = async (req, res) => {
  try {
    const { mobile } = req.query;
    const results = await searchByMobile(mobile);
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAuditTrail = async (req, res) => {
  try {
    const logs = await getAuditLogs(req.params.id);
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
