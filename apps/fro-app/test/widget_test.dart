import 'package:flutter_test/flutter_test.dart';
import 'package:fro_app/data/dispositions.dart';
import 'package:fro_app/services/call_service.dart';
import 'package:fro_app/theme.dart';

void main() {
  group('Dispositions port parity', () {
    test('notConnected has 15 entries with correct ids', () {
      expect(notConnected.length, 15);
      expect(notConnected.first.id, 'busy');
      expect(notConnected.last.id, 'ringing_voicemail');
    });

    test('connected has 27 entries with correct ids', () {
      expect(connected.length, 27);
      expect(connected.first.id, 'scheduled');
      expect(connected.last.id, 'not_interested_np');
    });

    test('connectedIds and notConnectedIds are disjoint', () {
      for (final d in connected) {
        expect(notConnectedIds.contains(d.id), false, reason: d.id);
      }
      for (final d in notConnected) {
        expect(connectedIds.contains(d.id), false, reason: d.id);
      }
    });

    test('isConnected works', () {
      expect(isConnected('scheduled'), true);
      expect(isConnected('busy'), false);
      expect(isConnected(othersId), false);
    });

    test('findDisp resolves known and others ids', () {
      expect(findDisp('busy')?.label, 'Busy');
      expect(findDisp('scheduled')?.label, 'Follow Up');
      expect(findDisp(othersId)?.label, 'Others');
      expect(findDisp('nonexistent'), isNull);
    });

    test('schedule type sets match the JS source', () {
      expect(scheduleDateTypes, {'scheduled', 'office_visit_scheduled', 'program_visit_scheduled'});
      expect(scheduleTimeTypes, {'callback'});
      expect(scheduleTypes.length, 4);
    });

    test('grouped lists cover the quick options', () {
      final connectedGroupIds = connectedGroups.expand((g) => g.items.map((i) => i.id)).toSet();
      final notConnectedGroupIds = notConnectedGroups.expand((g) => g.items.map((i) => i.id)).toSet();
      expect(connectedGroupIds.contains('scheduled'), true);
      expect(connectedGroupIds.contains('dnd'), true);
      expect(notConnectedGroupIds.contains('busy'), true);
      expect(notConnectedGroupIds.contains('switched_off'), true);
    });

    test('pillColorName maps statuses', () {
      expect(pillColorName('pending'), 'yellow');
      expect(pillColorName('lead_done'), 'green');
      expect(pillColorName('not_interested'), 'red');
      expect(pillColorName('unknown_status'), isNull);
    });
  });

  group('CallService timer math', () {
    test('fmt formats seconds as mm:ss and hh:mm:ss', () {
      final call = CallService();
      expect(call.fmt(0), '00:00');
      expect(call.fmt(65), '01:05');
      expect(call.fmt(3600), '01:00:00');
      expect(call.fmt(3725), '01:02:05');
    });

    test('constants match the server', () {
      expect(dispositionWindow, 240);
      expect(settleSeconds, 180);
    });

    test('adoptTimer applies server seconds and idle', () {
      final call = CallService();
      call.adoptTimer({
        'seconds_left': 180,
        'is_idle': false,
        'in_shift': true,
        'settle_seconds_left': null,
        'disposition_due_at': '2026-01-01T10:00:00Z',
      });
      expect(call.secondsLeft, 180);
      expect(call.isIdle, false);
      expect(call.inShift, true);
      expect(call.settleSecondsLeft, isNull);
    });

    test('adoptOptimisticDisposition restarts the window', () {
      final call = CallService();
      call.adoptTimer({'seconds_left': 10, 'is_idle': true});
      call.adoptOptimisticDisposition();
      expect(call.secondsLeft, dispositionWindow);
      expect(call.isIdle, false);
    });
  });

  group('theme helpers', () {
    test('formatCurrency', () {
      expect(formatCurrency(null), '—');
      expect(formatCurrency(0), '₹0');
      expect(formatCurrency(1000), '₹1,000');
    });

    test('formatDuration', () {
      expect(formatDuration(null), '00:00');
      expect(formatDuration(0), '00:00');
      expect(formatDuration(90), '01:30');
      expect(formatDuration(3661), '01:01:01');
    });
  });
}
