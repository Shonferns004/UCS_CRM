import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'pages/home_shell.dart';
import 'pages/login_page.dart';
import 'services/backend_switcher.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'services/call_service.dart';
import 'services/meeting_service.dart';
import 'services/socket_service.dart';
import 'theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await BackendSwitcher.load();
  final auth = await AuthService.create();
  final call = CallService();
  final meeting = MeetingService(call);
  final socket = SocketService();
  if (auth.isLoggedIn && auth.user != null) {
    call.init(auth.user!.workerId ?? auth.user!.id ?? '');
    meeting.start();
    socket.connect();
  }
  runApp(FroApp(auth: auth, call: call, meeting: meeting, socket: socket));
}

class FroApp extends StatefulWidget {
  final AuthService auth;
  final CallService call;
  final MeetingService meeting;
  final SocketService socket;

  const FroApp({
    super.key,
    required this.auth,
    required this.call,
    required this.meeting,
    required this.socket,
  });

  @override
  State<FroApp> createState() => _FroAppState();
}

class _FroAppState extends State<FroApp> with WidgetsBindingObserver {
  bool _wentBackground = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ApiService.onUnauthorised = _onUnauthorised;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _onUnauthorised() {
    widget.auth.clearLocal();
    widget.call.forceOffline();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _wentBackground = true;
      widget.call.markOffline();
    } else if (state == AppLifecycleState.resumed && _wentBackground) {
      _wentBackground = false;
      if (widget.auth.isLoggedIn) {
        widget.call.syncAllStats();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: widget.auth),
        ChangeNotifierProvider.value(value: widget.call),
        ChangeNotifierProvider.value(value: widget.meeting),
        ChangeNotifierProvider.value(value: widget.socket),
      ],
      child: MaterialApp(
        title: 'UCS FRO',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: Consumer<AuthService>(
          builder: (context, auth, _) {
            if (auth.isLoggedIn && auth.hasAccess) {
              return const HomeShell();
            }
            return const LoginPage();
          },
        ),
      ),
    );
  }
}
