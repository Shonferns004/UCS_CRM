import dotenv from 'dotenv';
dotenv.config();

const whatsappConfig = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  enabled: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
};

export default whatsappConfig;
