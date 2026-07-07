import dotenv from 'dotenv';
dotenv.config();

const whatsappConfig = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  receiptTemplate: process.env.WHATSAPP_RECEIPT_TEMPLATE || 'bsct_receipt',
  enabled: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
  supabaseFunctionUrl: process.env.WHATSAPP_SUPABASE_FUNCTION_URL || 'https://tvijqgsfdsaoqroebkvz.supabase.co/functions/v1/send-template',
  supabaseFunctionUrlFallback: process.env.WHATSAPP_SUPABASE_FUNCTION_URL_FALLBACK || 'https://tvijqgsfdsaoqroebkvz.supabase.co/functions/v1/send-message',
  supabaseApiKey: process.env.WHATSAPP_SUPABASE_API_KEY || 'b44757603be62c9e2d728ef9697aef4528c3bcf1aae73e9bcbcbd82e6332489c',
  wabaId: process.env.WHATSAPP_WABA_ID || '2529840587470683',
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME || 'bsct_receipt',
  templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
};

export default whatsappConfig;
