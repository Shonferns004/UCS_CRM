class Config {
  // Fixed bootstrap URL — used ONLY to fetch the remote config at startup.
  // All other API calls use Config.apiBaseUrl, which RemoteConfigService
  // populates from the server so the app can be redirected without an update.
  static const String bootstrapBaseUrl = 'https://13-207-47-116.sslip.io/api';

  // Config-driven values. Default to the bootstrap URL until config loads.
  static String apiBaseUrl = bootstrapBaseUrl;
  static String socketUrl = bootstrapBaseUrl.endsWith('/api')
      ? bootstrapBaseUrl.substring(0, bootstrapBaseUrl.length - 4)
      : bootstrapBaseUrl;
}
