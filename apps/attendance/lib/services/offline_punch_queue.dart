import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

/// Stores punch-in/out records locally in SQLite when the device is offline.
/// Each record is queued and synced to the backend when connectivity returns.
class OfflinePunchQueue {
  static Database? _db;

  static Future<Database> get _database async {
    if (_db != null) return _db!;
    final dbPath = await getDatabasesPath();
    _db = await openDatabase(
      join(dbPath, 'offline_punches.db'),
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE pending_punches (
            local_id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            code TEXT,
            latitude REAL,
            longitude REAL,
            punch_method TEXT,
            timestamp TEXT NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0
          )
        ''');
      },
    );
    return _db!;
  }

  /// Add a punch record to the queue.
  static Future<void> enqueue(Map<String, dynamic> record) async {
    final db = await _database;
    await db.insert(
      'pending_punches',
      {
        'local_id': record['local_id'],
        'action': record['action'],
        'code': record['code'],
        'latitude': record['latitude'],
        'longitude': record['longitude'],
        'punch_method': record['punch_method'],
        'timestamp': record['timestamp'],
        'synced': 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Get all pending (unsynced) records.
  static Future<List<Map<String, dynamic>>> getPending() async {
    final db = await _database;
    final rows = await db.query(
      'pending_punches',
      where: 'synced = ?',
      whereArgs: [0],
      orderBy: 'timestamp ASC',
    );
    return rows.map((r) => {
      'local_id': r['local_id'],
      'action': r['action'],
      'code': r['code'],
      'latitude': r['latitude'],
      'longitude': r['longitude'],
      'punch_method': r['punch_method'],
      'timestamp': r['timestamp'],
    }).toList();
  }

  /// Number of pending records.
  static Future<int> pendingCount() async {
    final db = await _database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM pending_punches WHERE synced = 0',
    );
    return (result.first['count'] as int?) ?? 0;
  }

  /// Remove a synced record by its local id.
  static Future<void> remove(String localId) async {
    final db = await _database;
    await db.delete(
      'pending_punches',
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  /// Clear all pending records (after successful sync).
  static Future<void> clear() async {
    final db = await _database;
    await db.delete('pending_punches');
  }

  static bool _syncing = false;

  /// Whether a sync is currently in progress.
  static Future<bool> isSyncing() async => _syncing;

  static Future<void> setSyncing(bool v) async {
    _syncing = v;
  }

  /// Close the database (call on app shutdown).
  static Future<void> close() async {
    if (_db != null) {
      await _db!.close();
      _db = null;
    }
  }
}
