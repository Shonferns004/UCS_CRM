class Config {
  static const String bootstrapBaseUrl = 'https://api.beingsevak.org/api';

  static String apiBaseUrl = bootstrapBaseUrl;
  static String socketUrl = bootstrapBaseUrl.endsWith('/api')
      ? bootstrapBaseUrl.substring(0, bootstrapBaseUrl.length - 4)
      : bootstrapBaseUrl;
}
