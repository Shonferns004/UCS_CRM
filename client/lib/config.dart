class Config {
  // Change this to your server's IP for real device testing
  // For Android emulator use: http://10.0.2.2:5000/api
  // For iOS simulator use:     http://localhost:5000/api
  // For real device use:       http://192.168.1.100:5000/api (your machine's LAN IP)
  // static const String apiBaseUrl = 'https://attendance-l3oa.onrender.com/api';
  // static const String apiBaseUrl = 'http://192.168.1.58:5000/api';
  static const String apiBaseUrl = 'https://attendance-roan-zeta.vercel.app/api';

  // Socket.io realtime server URL. Defaults to the API base with "/api" stripped.
  static String get socketUrl => apiBaseUrl.endsWith('/api')
      ? apiBaseUrl.substring(0, apiBaseUrl.length - 4)
      : apiBaseUrl;
}
