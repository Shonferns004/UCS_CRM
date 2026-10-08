class Config {
  // Fixed bootstrap URL — used ONLY to fetch the remote config at startup.
  // All other API calls use Config.apiBaseUrl, which RemoteConfigService
  // populates from the server so the app can be redirected without an update.
  static const String bootstrapBaseUrl = 'https://api.beingsevak.org/api';

  // Config-driven values. Default to the bootstrap URL until config loads.
  static String apiBaseUrl = bootstrapBaseUrl;
  static String socketUrl = bootstrapBaseUrl.endsWith('/api')
      ? bootstrapBaseUrl.substring(0, bootstrapBaseUrl.length - 4)
      : bootstrapBaseUrl;

  // Geoapify reverse-geocoding key (same service hr-attend uses).
  static const String geoapifyKey = 'cb50c21d6668448a8918d07d0b19ed62';
}
