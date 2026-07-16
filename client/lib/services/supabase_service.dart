import 'package:supabase_flutter/supabase_flutter.dart';
import '../config.dart';

class SupabaseService {
  static SupabaseClient? _client;

  static Future<void> initialize() async {
    await Supabase.initialize(url: Config.supabaseUrl, anonKey: Config.supabaseAnonKey);
    _client = Supabase.instance.client;
  }

  static SupabaseClient get client {
    if (_client == null) throw Exception('Supabase not initialized. Call SupabaseService.initialize() first.');
    return _client!;
  }
}
