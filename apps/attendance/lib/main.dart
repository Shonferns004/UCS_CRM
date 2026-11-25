import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:sileo/sileo.dart';
import 'theme/app_palette.dart';
import 'widgets/app_toast.dart';
import 'services/backend_switcher.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';
import 'services/remote_config_service.dart';
import 'pages/login_page.dart';
import 'pages/onboarding_page.dart';
import 'pages/home_page.dart';
import 'pages/splash_page.dart';

bool firebaseInitialized = false;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await BackendSwitcher.load();
  await RemoteConfigService.instance.init();
  try {
    await Firebase.initializeApp();
    firebaseInitialized = true;
  } catch (e) {
    print('Firebase init error: $e');
  }
  SystemChrome.setSystemUIOverlayStyle(
    SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
    ),
  );
  final navigatorKey = GlobalKey<NavigatorState>();
  NotificationService().setNavigatorKey(navigatorKey);
  runApp(UfsAttendApp(navigatorKey: navigatorKey));
}

class AppColors extends ThemeExtension<AppColors> {
  final Color primaryFixed;
  final Color primaryFixedDim;
  final Color onPrimaryFixed;
  final Color onPrimaryFixedVariant;
  final Color secondaryContainer;
  final Color onSecondaryContainer;
  final Color secondaryFixed;
  final Color secondaryFixedDim;
  final Color onSecondaryFixed;
  final Color onSecondaryFixedVariant;
  final Color tertiary;
  final Color tertiaryContainer;
  final Color onTertiary;
  final Color onTertiaryContainer;
  final Color tertiaryFixed;
  final Color tertiaryFixedDim;
  final Color onTertiaryFixed;
  final Color onTertiaryFixedVariant;
  final Color surfaceContainerLowest;
  final Color surfaceContainerLow;
  final Color surfaceContainer;
  final Color surfaceContainerHigh;
  final Color surfaceContainerHighest;
  final Color surfaceDim;
  final Color surfaceBright;
  final Color surfaceVariant;
  final Color outline;
  final Color outlineVariant;
  final Color inverseSurface;
  final Color inverseOnSurface;
  final Color inversePrimary;

  const AppColors({
    required this.primaryFixed,
    required this.primaryFixedDim,
    required this.onPrimaryFixed,
    required this.onPrimaryFixedVariant,
    required this.secondaryContainer,
    required this.onSecondaryContainer,
    required this.secondaryFixed,
    required this.secondaryFixedDim,
    required this.onSecondaryFixed,
    required this.onSecondaryFixedVariant,
    required this.tertiary,
    required this.tertiaryContainer,
    required this.onTertiary,
    required this.onTertiaryContainer,
    required this.tertiaryFixed,
    required this.tertiaryFixedDim,
    required this.onTertiaryFixed,
    required this.onTertiaryFixedVariant,
    required this.surfaceContainerLowest,
    required this.surfaceContainerLow,
    required this.surfaceContainer,
    required this.surfaceContainerHigh,
    required this.surfaceContainerHighest,
    required this.surfaceDim,
    required this.surfaceBright,
    required this.surfaceVariant,
    required this.outline,
    required this.outlineVariant,
    required this.inverseSurface,
    required this.inverseOnSurface,
    required this.inversePrimary,
  });

  @override
  ThemeExtension<AppColors> copyWith({
    Color? primaryFixed,
    Color? primaryFixedDim,
    Color? onPrimaryFixed,
    Color? onPrimaryFixedVariant,
    Color? secondaryContainer,
    Color? onSecondaryContainer,
    Color? secondaryFixed,
    Color? secondaryFixedDim,
    Color? onSecondaryFixed,
    Color? onSecondaryFixedVariant,
    Color? tertiary,
    Color? tertiaryContainer,
    Color? onTertiary,
    Color? onTertiaryContainer,
    Color? tertiaryFixed,
    Color? tertiaryFixedDim,
    Color? onTertiaryFixed,
    Color? onTertiaryFixedVariant,
    Color? surfaceContainerLowest,
    Color? surfaceContainerLow,
    Color? surfaceContainer,
    Color? surfaceContainerHigh,
    Color? surfaceContainerHighest,
    Color? surfaceDim,
    Color? surfaceBright,
    Color? surfaceVariant,
    Color? outline,
    Color? outlineVariant,
    Color? inverseSurface,
    Color? inverseOnSurface,
    Color? inversePrimary,
  }) => AppColors(
    primaryFixed: primaryFixed ?? this.primaryFixed,
    primaryFixedDim: primaryFixedDim ?? this.primaryFixedDim,
    onPrimaryFixed: onPrimaryFixed ?? this.onPrimaryFixed,
    onPrimaryFixedVariant: onPrimaryFixedVariant ?? this.onPrimaryFixedVariant,
    secondaryContainer: secondaryContainer ?? this.secondaryContainer,
    onSecondaryContainer: onSecondaryContainer ?? this.onSecondaryContainer,
    secondaryFixed: secondaryFixed ?? this.secondaryFixed,
    secondaryFixedDim: secondaryFixedDim ?? this.secondaryFixedDim,
    onSecondaryFixed: onSecondaryFixed ?? this.onSecondaryFixed,
    onSecondaryFixedVariant:
        onSecondaryFixedVariant ?? this.onSecondaryFixedVariant,
    tertiary: tertiary ?? this.tertiary,
    tertiaryContainer: tertiaryContainer ?? this.tertiaryContainer,
    onTertiary: onTertiary ?? this.onTertiary,
    onTertiaryContainer: onTertiaryContainer ?? this.onTertiaryContainer,
    tertiaryFixed: tertiaryFixed ?? this.tertiaryFixed,
    tertiaryFixedDim: tertiaryFixedDim ?? this.tertiaryFixedDim,
    onTertiaryFixed: onTertiaryFixed ?? this.onTertiaryFixed,
    onTertiaryFixedVariant:
        onTertiaryFixedVariant ?? this.onTertiaryFixedVariant,
    surfaceContainerLowest:
        surfaceContainerLowest ?? this.surfaceContainerLowest,
    surfaceContainerLow: surfaceContainerLow ?? this.surfaceContainerLow,
    surfaceContainer: surfaceContainer ?? this.surfaceContainer,
    surfaceContainerHigh: surfaceContainerHigh ?? this.surfaceContainerHigh,
    surfaceContainerHighest:
        surfaceContainerHighest ?? this.surfaceContainerHighest,
    surfaceDim: surfaceDim ?? this.surfaceDim,
    surfaceBright: surfaceBright ?? this.surfaceBright,
    surfaceVariant: surfaceVariant ?? this.surfaceVariant,
    outline: outline ?? this.outline,
    outlineVariant: outlineVariant ?? this.outlineVariant,
    inverseSurface: inverseSurface ?? this.inverseSurface,
    inverseOnSurface: inverseOnSurface ?? this.inverseOnSurface,
    inversePrimary: inversePrimary ?? this.inversePrimary,
  );

  @override
  ThemeExtension<AppColors> lerp(
    covariant ThemeExtension<AppColors>? other,
    double t,
  ) => this;

  static const light = AppColors(
    primaryFixed: Color(0xFFD6EAF7),
    primaryFixedDim: Color(0xFFB4D2E8),
    onPrimaryFixed: Color(0xFF0B2A45),
    onPrimaryFixedVariant: Color(0xFF2C5A85),
    secondaryContainer: Color(0xFFD4F7EC),
    onSecondaryContainer: Color(0xFF075E48),
    secondaryFixed: Color(0xFFB9F0DE),
    secondaryFixedDim: Color(0xFF8FE6CD),
    onSecondaryFixed: Color(0xFF04352A),
    onSecondaryFixedVariant: Color(0xFF0B5C46),
    tertiary: Color(0xFF0F7A5A),
    tertiaryContainer: Color(0xFFD4F7EC),
    onTertiary: Color(0xFFffffff),
    onTertiaryContainer: Color(0xFF075E48),
    tertiaryFixed: Color(0xFFD4F7EC),
    tertiaryFixedDim: Color(0xFF2FD3A0),
    onTertiaryFixed: Color(0xFF04352A),
    onTertiaryFixedVariant: Color(0xFF0B5C46),
    surfaceContainerLowest: Color(0xFFffffff),
    surfaceContainerLow: Color(0xFFF2F8FD),
    surfaceContainer: Color(0xFFECF4FB),
    surfaceContainerHigh: Color(0xFFE7F1FA),
    surfaceContainerHighest: Color(0xFFDCEAF6),
    surfaceDim: Color(0xFFD3E5F2),
    surfaceBright: Color(0xFFF8FCFF),
    surfaceVariant: Color(0xFFDCEAF6),
    outline: Color(0xFF7A97B0),
    outlineVariant: Color(0xFFC2D8EA),
    inverseSurface: Color(0xFF0E3457),
    inverseOnSurface: Color(0xFFE6F0FA),
    inversePrimary: Color(0xFF2FD3A0),
  );
}

class UfsAttendApp extends StatelessWidget {
  final GlobalKey<NavigatorState> navigatorKey;
  const UfsAttendApp({super.key, required this.navigatorKey});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'UCS Attend',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: const ColorScheme.light(
          primary: AppPalette.ocean,
          onPrimary: Color(0xFFffffff),
          primaryContainer: AppPalette.iceDeep,
          onPrimaryContainer: AppPalette.oceanDeep,
          secondary: AppPalette.aqua,
          onSecondary: Color(0xFF04352A),
          secondaryContainer: AppPalette.aquaSoft,
          onSecondaryContainer: Color(0xFF075E48),
          tertiary: AppPalette.aquaDeep,
          onTertiary: Color(0xFFffffff),
          tertiaryContainer: AppPalette.aquaSoft,
          onTertiaryContainer: Color(0xFF075E48),
          surface: AppPalette.white,
          onSurface: AppPalette.ink,
          onSurfaceVariant: AppPalette.muted,
          surfaceContainerHighest: Color(0xFFDCEAF6),
          outline: Color(0xFF7A97B0),
          outlineVariant: Color(0xFFC2D8EA),
          error: AppPalette.error,
          onError: Color(0xFFffffff),
          errorContainer: Color(0xFFffdad6),
          onErrorContainer: Color(0xFF93000a),
          inverseSurface: AppPalette.oceanDeep,
          onInverseSurface: AppPalette.iceBlue,
          inversePrimary: AppPalette.aqua,
          shadow: AppPalette.ocean,
          scrim: AppPalette.oceanDeep,
        ),
        extensions: const [AppColors.light],
        scaffoldBackgroundColor: AppPalette.iceBlue,
        splashFactory: InkSparkle.splashFactory,
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {
            TargetPlatform.android: CupertinoPageTransitionsBuilder(),
            TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          },
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: AppPalette.iceBlue,
          surfaceTintColor: Colors.transparent,
          foregroundColor: AppPalette.ink,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          titleTextStyle: GoogleFonts.hankenGrotesk(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppPalette.ink,
          ),
        ),
        cardTheme: CardThemeData(
          color: AppPalette.white,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
        ),
        bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: AppPalette.white,
          modalBackgroundColor: AppPalette.white,
          surfaceTintColor: Colors.transparent,
          modalBarrierColor: Color(0x57123456),
          elevation: 0,
          modalElevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          ),
        ),
        dialogTheme: DialogThemeData(
          backgroundColor: AppPalette.white,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          titleTextStyle: GoogleFonts.hankenGrotesk(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppPalette.ink,
          ),
          contentTextStyle: GoogleFonts.manrope(
            fontSize: 14,
            fontWeight: FontWeight.w400,
            color: AppPalette.oceanSoft,
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: AppPalette.ocean,
            foregroundColor: AppPalette.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            textStyle: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppPalette.ocean,
            foregroundColor: AppPalette.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            textStyle: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppPalette.ocean,
            side: const BorderSide(color: AppPalette.iceDeep),
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            textStyle: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppPalette.ocean,
            textStyle: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationThemeData(
          filled: true,
          fillColor: AppPalette.white,
          isDense: true,
          hintStyle: GoogleFonts.manrope(fontSize: 14, color: AppPalette.muted),
          prefixIconColor: AppPalette.muted,
          suffixIconColor: AppPalette.muted,
          floatingLabelStyle: GoogleFonts.manrope(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppPalette.ocean,
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 16,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: AppPalette.aqua, width: 1.6),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: AppPalette.error),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: AppPalette.error, width: 1.6),
          ),
        ),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppPalette.oceanDeep,
          contentTextStyle: GoogleFonts.manrope(
            color: AppPalette.white,
            fontSize: 14,
          ),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: Color(0xFFC2D8EA),
          thickness: 1,
          space: 1,
        ),
        textTheme: GoogleFonts.manropeTextTheme()
            .apply(bodyColor: AppPalette.ink, displayColor: AppPalette.ink)
            .copyWith(
              headlineLarge: GoogleFonts.hankenGrotesk(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                height: 32 / 24,
              ),
              headlineMedium: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                height: 28 / 20,
              ),
              headlineSmall: GoogleFonts.hankenGrotesk(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                height: 24 / 18,
              ),
              titleLarge: GoogleFonts.hankenGrotesk(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                height: 32 / 24,
              ),
              bodyLarge: GoogleFonts.manrope(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                height: 24 / 16,
              ),
              bodyMedium: GoogleFonts.manrope(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                height: 20 / 14,
              ),
              labelLarge: GoogleFonts.manrope(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                height: 20 / 20,
                letterSpacing: 0.02,
              ),
              labelMedium: GoogleFonts.manrope(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                height: 16 / 12,
                letterSpacing: 0.05,
              ),
              labelSmall: GoogleFonts.manrope(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                height: 12 / 11,
              ),
            ),
      ),
      builder: (context, child) => Toaster(
        position: SileoPosition.topCenter,
        theme: SileoTheme.light,
        offset: const EdgeInsets.only(top: 8),
        child: child,
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool? _loggedIn;
  bool _showOnboarding = false;
  bool _forceUpdate = false;

  @override
  void initState() {
    super.initState();
    _checkVersion();
    _checkAuth();
  }

  Future<void> _checkVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final cfg = RemoteConfigService.instance;
      if (cfg.isBelowMinimum(info.version)) {
        if (mounted) setState(() => _forceUpdate = true);
      }
    } catch (_) {}
  }

  Future<void> _checkAuth() async {
    try {
      var token = await ApiService.getToken().timeout(
        const Duration(seconds: 2),
      );
      if (token != null) {
        // Access token may have lapsed while the app was closed; swap it for a
        // fresh one via the stored refresh token before deciding auth state.
        try {
          await ApiService.ensureSession().timeout(const Duration(seconds: 6));
          token = await ApiService.getToken();
        } catch (_) {}
      }
      if (token != null && firebaseInitialized) {
        await NotificationService().init();
      }
      if (token != null && firebaseInitialized) {
        final initialMessage = await FirebaseMessaging.instance
            .getInitialMessage();
        if (initialMessage != null) {
          // App opened by tapping a notification — land on home
        }
      }
      if (token != null) {
        // Always query server; use local cache only as fallback
        final prefs = await SharedPreferences.getInstance();
        try {
          final status = await ApiService.checkOnboardingStatus().timeout(
            const Duration(seconds: 2),
          );
          final serverCompleted = status['onboarding_completed'] == true;
          if (serverCompleted) {
            await prefs.setBool('has_seen_onboarding', true);
          }
          setState(() {
            _loggedIn = true;
            _showOnboarding = !serverCompleted;
          });
        } catch (_) {
          // Server unreachable — fall back to local cache
          final locallySeen = prefs.getBool('has_seen_onboarding') ?? false;
          setState(() {
            _loggedIn = true;
            _showOnboarding = !locallySeen;
          });
        }
      } else {
        setState(() => _loggedIn = false);
      }
    } catch (_) {
      setState(() => _loggedIn = false);
    }
  }

  void _onLogin() async {
    if (firebaseInitialized) {
      NotificationService().init();
    }
    // Always query server; use local cache only as fallback
    final prefs = await SharedPreferences.getInstance();
    try {
      final status = await ApiService.checkOnboardingStatus();
      final serverCompleted = status['onboarding_completed'] == true;
      if (serverCompleted) {
        await prefs.setBool('has_seen_onboarding', true);
      }
      if (!mounted) return;
      setState(() {
        _loggedIn = true;
        _showOnboarding = !serverCompleted;
      });
    } catch (_) {
      // Server unreachable — fall back to local cache
      final locallySeen = prefs.getBool('has_seen_onboarding') ?? false;
      if (!mounted) return;
      setState(() {
        _loggedIn = true;
        _showOnboarding = !locallySeen;
      });
    }
  }

  Future<void> _onOnboardingComplete() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('has_seen_onboarding', true);
    setState(() => _showOnboarding = false);
  }

  void _onLogout() async {
    await ApiService.clearAuth();
    AppToast.info('Signed out successfully');
    setState(() {
      _loggedIn = false;
      _showOnboarding = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_forceUpdate) {
      return const ForceUpdatePage();
    }
    if (_loggedIn == null) {
      return const SplashPage();
    }
    if (_loggedIn == true) {
      if (_showOnboarding) {
        return OnboardingPage(onComplete: _onOnboardingComplete);
      }
      return MainShell(onLogout: _onLogout);
    }
    return LoginPage(onLogin: _onLogin);
  }
}

class MainShell extends StatefulWidget {
  final VoidCallback onLogout;
  const MainShell({super.key, required this.onLogout});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  Map<String, dynamic>? _announcement;

  @override
  void initState() {
    super.initState();
    _loadAnnouncement();
  }

  Future<void> _loadAnnouncement() async {
    final announcement = RemoteConfigService.instance.announcement;
    if (announcement == null) return;
    final prefs = await SharedPreferences.getInstance();
    final dismissedId = prefs.getString('announcement_dismissed_id');
    final id = announcement['id']?.toString() ?? '';
    if (id.isEmpty || dismissedId != id) {
      if (mounted) setState(() => _announcement = announcement);
    }
  }

  void _dismissAnnouncement() async {
    final id = _announcement?['id']?.toString() ?? '';
    if (id.isNotEmpty) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('announcement_dismissed_id', id);
    }
    setState(() => _announcement = null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          if (_announcement != null)
            _AnnouncementBanner(
              announcement: _announcement!,
              onDismiss: _dismissAnnouncement,
            ),
          Expanded(
            child: HomePage(tabChangeVersion: 0, onLogout: widget.onLogout),
          ),
        ],
      ),
    );
  }
}

class _AnnouncementBanner extends StatelessWidget {
  final Map<String, dynamic> announcement;
  final VoidCallback onDismiss;

  const _AnnouncementBanner({
    required this.announcement,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final title = announcement['title']?.toString() ?? 'Announcement';
    final body = announcement['body']?.toString() ?? '';
    final dismissible = announcement['dismissible'] != false;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: const Color(0xff174a7c),
      child: SafeArea(
        bottom: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(
              TablerIcons.speakerphone,
              size: 20,
              color: Color(0xff8fc8e8),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      body,
                      style: GoogleFonts.manrope(
                        fontSize: 13,
                        fontWeight: FontWeight.w400,
                        color: const Color(0xFFd7dee8),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (dismissible)
              GestureDetector(
                onTap: onDismiss,
                child: const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(
                    TablerIcons.x,
                    size: 18,
                    color: Color(0xFFd7dee8),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ForceUpdatePage extends StatelessWidget {
  const ForceUpdatePage({super.key});

  static const String _playStoreUrl =
      'https://play.google.com/store/apps/details?id=com.ucs.attendance';

  @override
  Widget build(BuildContext context) {
    final cfg = RemoteConfigService.instance;
    return Scaffold(
      backgroundColor: const Color(0xffe6f0fa),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  TablerIcons.package_export,
                  size: 72,
                  color: const Color(0xff174a7c),
                ),
                const SizedBox(height: 24),
                Text(
                  'Update required',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xff174a7c),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'A new version (${cfg.minimumVersion}) of UCS Attend is available. Please update to continue.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                    color: const Color(0xff3f6487),
                  ),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _openStore,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xff174a7c),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Update Now'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openStore() async {
    final cfg = RemoteConfigService.instance;
    final url = cfg.updateUrl.isNotEmpty ? cfg.updateUrl : _playStoreUrl;
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {}
  }
}
