export const FORM_META = {
  title: 'Sevak Library',
  subtitle: 'Library Membership Admission Form',
  initiative: 'Initiative by Being Sevak Charitable Trust',
  description:
    'Thank you for applying for membership in the Sevak Library. Please complete all required details carefully.',
  upiId: 'library@okbank',
  upiIdAlt: 'beingsevak@upi'
}

export const MEMBERSHIP_PRICES = {
  Daily: '250',
  'Half Monthly': '500',
  Monthly: '1650',
  Quarterly: '4950',
  'Half-Yearly': '9900',
  Annual: '19800'
}

const INDIA_STATES = [
  'Maharashtra', 'Gujarat', 'Delhi', 'Karnataka', 'Tamil Nadu', 'West Bengal',
  'Rajasthan', 'Uttar Pradesh', 'Madhya Pradesh', 'Kerala', 'Telangana',
  'Andhra Pradesh', 'Punjab', 'Haryana', 'Bihar', 'Other'
]

export const SECTIONS = [
  {
    id: 'membership_information',
    title: 'Section 1 - Membership Information',
    fields: [
      {
        id: 'membershipId',
        label: 'Membership ID',
        type: 'text',
        required: false,
        placeholder: 'Leave blank if not yet assigned',
        helpText: 'Leave blank if not yet assigned. The library will issue your Membership ID.'
      },
      {
        id: 'applicationDate',
        label: 'Application Date',
        type: 'date',
        required: true,
        autoToday: true
      },
      {
        id: 'startDate',
        label: 'Start Date',
        type: 'date',
        required: true,
        autoToday: true
      },
      {
        id: 'endDate',
        label: 'End Date',
        type: 'date',
        required: true,
        helpText: 'Will be set based on your membership type.'
      },
      {
        id: 'category',
        label: 'Category',
        type: 'radio',
        required: true,
        options: ['Student', 'General', 'Senior Citizen', 'Other']
      },
      {
        id: 'passportPhoto',
        label: 'Passport Size Photograph',
        type: 'file',
        required: true,
        accept: ['image/jpeg', 'image/png'],
        maxSizeMB: 5,
        helpText: 'Upload a recent passport-size photograph (JPG/PNG).'
      }
    ]
  },
  {
    id: 'personal_details',
    title: 'Section 2 - Personal Details',
    fields: [
      {
        id: 'fullName',
        label: 'Full Name',
        type: 'text',
        required: true,
        placeholder: 'Enter your full name',
        helpText: 'As per your ID proof.'
      },
      {
        id: 'guardianName',
        label: "Father's / Mother's / Guardian's Name",
        type: 'text',
        required: true,
        placeholder: 'Enter guardian name'
      },
      {
        id: 'dateOfBirth',
        label: 'Date of Birth',
        type: 'date',
        required: true,
        helpText: 'Please enter a date in the past.'
      },
      {
        id: 'gender',
        label: 'Gender',
        type: 'radio',
        required: true,
        options: ['Male', 'Female', 'Other']
      },
      {
        id: 'occupation',
        label: 'Occupation',
        type: 'text',
        required: false,
        placeholder: 'e.g. Student, Teacher, Engineer'
      },
      {
        id: 'educationalQualification',
        label: 'Educational Qualification',
        type: 'text',
        required: false,
        placeholder: 'e.g. B.Sc., B.A., HSC'
      }
    ]
  },
  {
    id: 'contact_details',
    title: 'Section 3 - Contact Details',
    fields: [
      {
        id: 'mobileNumber',
        label: 'Mobile Number',
        type: 'tel',
        required: true,
        placeholder: 'Enter 10-digit mobile number',
        pattern: '^[0-9]{10}$',
        errorMsg: 'Please enter a valid 10-digit mobile number.',
        helpText: 'Enter 10-digit mobile number. Only digits allowed.'
      },
      {
        id: 'alternateMobileNumber',
        label: 'Alternate Mobile Number',
        type: 'tel',
        required: false,
        placeholder: 'Optional',
        pattern: '^[0-9]{10}$',
        errorMsg: 'Please enter a valid 10-digit mobile number.',
        helpText: 'Optional. 10-digit mobile number.'
      },
      {
        id: 'emailAddress',
        label: 'Email Address',
        type: 'email',
        required: true,
        placeholder: 'you@example.com'
      }
    ]
  },
  {
    id: 'address',
    title: 'Section 4 - Address',
    fields: [
      {
        id: 'currentAddress',
        label: 'Current Address',
        type: 'textarea',
        required: true,
        placeholder: 'House / Street / Area / Landmark',
        helpText: 'Include house/street/area/landmark.'
      },
      {
        id: 'city',
        label: 'City',
        type: 'text',
        required: true,
        placeholder: 'Enter city'
      },
      {
        id: 'state',
        label: 'State',
        type: 'select',
        required: true,
        options: INDIA_STATES,
        placeholder: 'Select your state'
      },
      {
        id: 'pinCode',
        label: 'PIN Code',
        type: 'tel',
        required: true,
        placeholder: 'Enter 6-digit PIN code',
        pattern: '^[0-9]{6}$',
        errorMsg: 'Please enter a valid 6-digit PIN code.',
        helpText: 'Enter 6-digit PIN code.'
      }
    ]
  },
  {
    id: 'identity_proof',
    title: 'Section 5 - Identity Proof',
    fields: [
      {
        id: 'identityProofType',
        label: 'Identity Proof Type',
        type: 'checkboxes',
        required: true,
        options: ['Aadhaar Card', 'PAN Card', 'Driving Licence', 'Passport', 'Student ID', 'Other'],
        helpText: 'Select one or more identity documents.'
      },
      {
        id: 'identityProofPhoto',
        label: 'Upload Identity Proof Photo',
        type: 'file',
        required: true,
        custom: 'identityDocument',
        accept: ['image/jpeg', 'image/png'],
        maxSizeMB: 5,
        helpText: 'Upload a clear photo of the selected identity document (JPG/PNG).'
      },
      {
        id: 'identityPhotoConfirm',
        label: 'Identity Proof Photo Confirmation',
        type: 'checkbox',
        required: true,
        options: [
          'I confirm that the uploaded photo is a clear picture of the selected identity document.'
        ],
        helpText: 'Tick the box to confirm before proceeding.'
      }
    ]
  },
  {
    id: 'library_membership',
    title: 'Section 6 - Library Membership',
    fields: [
      {
        id: 'membershipType',
        label: 'Membership Type',
        type: 'radio',
        required: true,
        options: ['Daily', 'Half Monthly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annual']
      },
      {
        id: 'membershipFee',
        label: 'Membership Fee',
        type: 'text',
        required: true,
        placeholder: 'Enter fee in INR',
        inputMode: 'decimal',
        pattern: '^[0-9]+(\\.[0-9]{1,2})?$',
        errorMsg: 'Please enter a valid fee amount (numbers only).',
        helpText: 'Enter the applicable fee in Rs based on your membership type.'
      }
    ]
  },
  {
    id: 'about_library',
    title: 'Section 7 - About Library',
    type: 'info',
    content: [
      { heading: 'Turning Pages, Changing Lives' },
      {
        body: 'Your library membership and admission directly support the Vidhya Project of Being Sevak Charitable Trust, helping provide quality education, learning resources, and opportunities to underprivileged children.'
      },
      {
        body: 'Thank you for becoming a part of this mission and empowering young lives through the gift of education.'
      }
    ]
  },
  {
    id: 'payment',
    title: 'Section 8 - Payment',
    type: 'payment',
    description:
      'Please complete your payment before submitting this form.',
    fields: [
      {
        id: 'paymentScreenshot',
        label: 'Upload Payment Screenshot',
        type: 'file',
        required: true,
        accept: ['image/jpeg', 'image/png', 'application/pdf'],
        maxSizeMB: 10,
        helpText: 'Screenshot of the successful UPI/bank payment.'
      },
      {
        id: 'transactionId',
        label: 'Transaction ID',
        type: 'text',
        required: true,
        placeholder: 'e.g. UPI reference / UTR number',
        helpText: 'e.g., UPI transaction reference / UTR number.'
      }
    ]
  },
  {
    id: 'declaration',
    title: 'Section 9 - Declaration',
    fields: [
      {
        id: 'declaration',
        label: 'Declaration',
        type: 'checkbox',
        required: true,
        options: [
          'I hereby declare that the information provided above is true and correct. I agree to follow all the rules and regulations of Sevak Library.'
        ],
        helpText: 'Tick the box to accept the declaration.'
      },
      {
        id: 'applicantSignature',
        label: 'Applicant Signature',
        type: 'text',
        required: true,
        placeholder: 'Type your full name as your signature',
        helpText: 'Type your full name as your signature.'
      },
      {
        id: 'submissionDate',
        label: 'Submission Date',
        type: 'date',
        required: true,
        autoToday: true
      }
    ]
  }
]
