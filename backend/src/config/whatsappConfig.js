import dotenv from 'dotenv';
dotenv.config();

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1121473674392233';
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAPJSEwmi8sBR1zdk4lJApD7O4om6k2DZBqFLuZBfjfM0OxZB5Yp5unbJxQKUhC4yrnqYfAfO7pAQfXy39ZBgsuqHZBMgtg7Yapp8LmoNAt7BEHCHTOVSDdKSBNJZCz3CNKnH7ZC0NP7TGOQTbeVw5krozDazMPtk4sbAbJBVBqCi1L0sU6Ui2flHWpkZChgz7ZCcOQZDZD';

const whatsappConfig = {
  phoneNumberId,
  accessToken,
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  receiptTemplate: process.env.WHATSAPP_RECEIPT_TEMPLATE || 'bsct_receipt',
  enabled: !!(phoneNumberId && accessToken),
  supabaseFunctionUrl: process.env.WHATSAPP_SUPABASE_FUNCTION_URL || 'https://tvijqgsfdsaoqroebkvz.supabase.co/functions/v1/send-template',
  supabaseFunctionUrlFallback: process.env.WHATSAPP_SUPABASE_FUNCTION_URL_FALLBACK || 'https://tvijqgsfdsaoqroebkvz.supabase.co/functions/v1/send-message',
  supabaseApiKey: process.env.WHATSAPP_SUPABASE_API_KEY || 'b44757603be62c9e2d728ef9697aef4528c3bcf1aae73e9bcbcbd82e6332489c',
  wabaId: process.env.WHATSAPP_WABA_ID || '2529840587470683',
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME || 'bsct_receipt',
  templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
};

export default whatsappConfig;
