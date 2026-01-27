
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🚀 **Enterprise Application Configuration**
/// تنظیمات اصلی اپ - بدون نیاز به تغییر در آینده
class AppConfig {
  // Singleton با لودینگ تنبل
  AppConfig._internal();
  static final AppConfig _instance = AppConfig._internal();
  factory AppConfig() => _instance;

  // ==================== [METADATA] ====================
  static const String _appName = 'Language Master Pro';
  static const String _appVersion = '2.0.0';
  static const String _appBuild = '2024.12.1';
  static const String _developer = 'Your Company';
  static const String _supportEmail = 'support@langmaster.com';
  
  // ==================== [ENVIRONMENT] ====================
  static bool get isProduction => kReleaseMode;
  static bool get isDevelopment => kDebugMode;
  static bool get isTesting => Platform.environment.containsKey('FLUTTER_TEST');
  static bool get isWeb => kIsWeb;
  static bool get isAndroid => !kIsWeb && Platform.isAndroid;
  static bool get isIOS => !kIsWeb && Platform.isIOS;
  static bool get isDesktop => !kIsWeb && (Platform.isWindows || Platform.isMacOS || Platform.isLinux);
  
  // ==================== [API CONFIGURATION] ====================
  static String get apiBaseUrl {
    if (isProduction) {
      return 'https://api.langmaster.com/v2';
    } else if (isDevelopment) {
      return 'https://staging.api.langmaster.com/v2';
    } else {
      return 'http://localhost:8080/v2';
    }
  }
  
  static const Map<String, String> _apiEndpoints = {
    'auth': '/auth',
    'templates': '/templates',
    'lessons': '/lessons',
    'progress': '/progress',
    'payments': '/payments',
    'users': '/users',
    'languages': '/languages',
    'analytics': '/analytics',
  };
  
  static String getApiUrl(String endpoint) {
    return apiBaseUrl + (_apiEndpoints[endpoint] ?? '');
  }
  
  static const int _apiTimeout = 30; // ثانیه
  static const int _apiRetries = 3;
  static const int _apiCacheDuration = 3600; // ثانیه
  
  // ==================== [LANGUAGE CONFIGURATION] ====================
  /// 📌 لیست ۱۲ زبان اصلی + قابلیت افزودن در آینده
  static const List<LanguageConfig> _supportedLanguages = [
    LanguageConfig(code: 'en', name: 'English', flag: '🇬🇧', rtl: false, enabled: true),
    LanguageConfig(code: 'fa', name: 'فارسی', flag: '🇮🇷', rtl: true, enabled: true),
    LanguageConfig(code: 'de', name: 'Deutsch', flag: '🇩🇪', rtl: false, enabled: true),
    LanguageConfig(code: 'fr', name: 'Français', flag: '🇫🇷', rtl: false, enabled: true),
    LanguageConfig(code: 'es', name: 'Español', flag: '🇪🇸', rtl: false, enabled: true),
    LanguageConfig(code: 'it', name: 'Italiano', flag: '🇮🇹', rtl: false, enabled: true),
    LanguageConfig(code: 'ru', name: 'Русский', flag: '🇷🇺', rtl: false, enabled: true),
    LanguageConfig(code: 'ar', name: 'العربية', flag: '🇸🇦', rtl: true, enabled: true),
    LanguageConfig(code: 'tr', name: 'Türkçe', flag: '🇹🇷', rtl: false, enabled: true),
    LanguageConfig(code: 'pt', name: 'Português', flag: '🇵🇹', rtl: false, enabled: true),
    LanguageConfig(code: 'sv', name: 'Svenska', flag: '🇸🇪', rtl: false, enabled: true),
    LanguageConfig(code: 'nl', name: 'Nederlands', flag: '🇳🇱', rtl: false, enabled: true),
  ];
  
  static const String _defaultLanguage = 'en';
  static const bool _autoDetectLanguage = true;
  static const bool _forceRTL = false;
  
  // ==================== [SECURITY CONFIGURATION] ====================
  static const String _encryptionAlgorithm = 'AES-256-GCM';
  static const int _encryptionKeyLength = 32;
  static const int _sessionTimeout = 7200; // ثانیه
  static const int _maxLoginAttempts = 5;
  static const bool _requireBiometric = false;
  
  // ==================== [PAYMENT CONFIGURATION] ====================
  static const bool _enableIAP = true;
  static const bool _enableIranianGateways = true;
  static const List<String> _iranianGateways = ['zarinpal', 'idpay', 'sep'];
  static const List<String> _internationalGateways = ['google_play', 'stripe', 'paypal'];
  static const String _defaultCurrency = 'USD';
  
  // ==================== [CONTENT CONFIGURATION] ====================
  static const int _lessonsPerLevel = 20;
  static const int _levelsPerLanguage = 6;
  static const int _exercisesPerLesson = 5;
  static const bool _enableVoiceRecognition = true;
  static const bool _enableSpeechSynthesis = true;
  static const int _maxDownloadSize = 500; // مگابایت
  
  // ==================== [FEATURE FLAGS] ====================
  static const Map<String, bool> _featureFlags = {
    'offline_mode': true,
    'gamification': true,
    'social_sharing': true,
    'dark_mode': true,
    'auto_update': true,
    'backup_cloud': true,
    'analytics': true,
    'crash_reporting': true,
    'debug_tools': isDevelopment,
    'performance_monitoring': true,
  };
  
  // ==================== [PUBLIC GETTERS] ====================
  static String get appName => _appName;
  static String get appVersion => _appVersion;
  static String get appBuild => _appBuild;
  static String get developer => _developer;
  static String get supportEmail => _supportEmail;
  
  static int get apiTimeout => _apiTimeout;
  static int get apiRetries => _apiRetries;
  static int get apiCacheDuration => _apiCacheDuration;
  
  static List<LanguageConfig> get supportedLanguages => List.unmodifiable(_supportedLanguages);
  static String get defaultLanguage => _defaultLanguage;
  static bool get autoDetectLanguage => _autoDetectLanguage;
  static bool get forceRTL => _forceRTL;
  
  static String get encryptionAlgorithm => _encryptionAlgorithm;
  static int get encryptionKeyLength => _encryptionKeyLength;
  static int get sessionTimeout => _sessionTimeout;
  static int get maxLoginAttempts => _maxLoginAttempts;
  static bool get requireBiometric => _requireBiometric;
  
  static bool get enableIAP => _enableIAP;
  static bool get enableIranianGateways => _enableIranianGateways;
  static List<String> get iranianGateways => List.unmodifiable(_iranianGateways);
  static List<String> get internationalGateways => List.unmodifiable(_internationalGateways);
  static String get defaultCurrency => _defaultCurrency;
  
  static int get lessonsPerLevel => _lessonsPerLevel;
  static int get levelsPerLanguage => _levelsPerLanguage;
  static int get exercisesPerLesson => _exercisesPerLesson;
  static bool get enableVoiceRecognition => _enableVoiceRecognition;
  static bool get enableSpeechSynthesis => _enableSpeechSynthesis;
  static int get maxDownloadSize => _maxDownloadSize;
  
  static bool isFeatureEnabled(String feature) => _featureFlags[feature] ?? false;
  
  // ==================== [UTILITY METHODS] ====================
  /// بررسی پشتیبانی از زبان
  static bool isLanguageSupported(String code) {
    return _supportedLanguages.any((lang) => lang.code == code);
  }
  
  /// دریافت اطلاعات زبان
  static LanguageConfig? getLanguageConfig(String code) {
    return _supportedLanguages.firstWhere(
      (lang) => lang.code == code,
      orElse: () => LanguageConfig(code: code, name: 'Unknown', flag: '🏳', rtl: false, enabled: false),
    );
  }
  
  /// لیست کد زبان‌های فعال
  static List<String> get enabledLanguageCodes {
    return _supportedLanguages
        .where((lang) => lang.enabled)
        .map((lang) => lang.code)
        .toList();
  }
  
  /// محاسبه حجم تخمینی محتوا
  static double calculateEstimatedSize(String languageCode) {
    const double baseSize = 50.0; // مگابایت پایه
    const double perLesson = 2.5; // مگابایت برای هر درس
    return baseSize + (_lessonsPerLevel * _levelsPerLanguage * perLesson);
  }
  
  /// بررسی نیاز به اینترنت
  static bool requiresInternet(String feature) {
    const onlineFeatures = ['payment', 'sync', 'backup', 'analytics'];
    return onlineFeatures.contains(feature);
  }
  
  /// تنظیمات دیباگ
  static Map<String, dynamic> get debugInfo {
    return {
      'platform': Platform.operatingSystem,
      'version': Platform.version,
      'environment': isProduction ? 'Production' : 'Development',
      'supported_languages': enabledLanguageCodes.length,
      'features_enabled': _featureFlags.values.where((v) => v).length,
    };
  }
  
  // ==================== [INITIALIZATION] ====================
  /// مقداردهی اولیه غیرهمزمان
  Future<void> initialize() async {
    _packageInfo = await PackageInfo.fromPlatform();
    _prefs = await SharedPreferences.getInstance();
    _loadUserPreferences();
  }
  
  late PackageInfo _packageInfo;
  late SharedPreferences _prefs;
  
  PackageInfo get packageInfo => _packageInfo;
  SharedPreferences get prefs => _prefs;
  
  void _loadUserPreferences() {
    // بارگذاری تنظیمات کاربر از SharedPreferences
  }
  
  void saveUserPreference(String key, dynamic value) {
    // ذخیره تنظیمات کاربر
  }
}

/// 📌 مدل پیکربندی زبان
class LanguageConfig {
  final String code;
  final String name;
  final String flag;
  final bool rtl;
  final bool enabled;
  
  const LanguageConfig({
    required this.code,
    required this.name,
    required this.flag,
    required this.rtl,
    required this.enabled,
  });
  
  Map<String, dynamic> toMap() {
    return {
      'code': code,
      'name': name,
      'flag': flag,
      'rtl': rtl,
      'enabled': enabled,
    };
  }
  
  @override
  String toString() => 'LanguageConfig($code: $name)';
}

/// 🎯 استفاده در کل اپ:
/// ```
/// if (AppConfig.isProduction) { ... }
/// String url = AppConfig.getApiUrl('auth');
/// bool isFarsi = AppConfig.getLanguageConfig('fa')?.rtl ?? false;
/// ```
