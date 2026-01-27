// lib/app_config.dart
import 'dart:convert';
import 'package:flutter/foundation.dart';

/// 📱 Main application configuration
/// Version: 1.0.0
/// Author: HyperLang Team
/// Last Updated: 2024-01-15

class AppConfig {
  // Singleton instance
  static final AppConfig _instance = AppConfig._internal();
  factory AppConfig() => _instance;
  AppConfig._internal();

  // App metadata
  static const String appName = 'HyperLang';
  static const String appVersion = '1.0.0';
  static const int appVersionCode = 1;
  static const String appBuild = '20240115.1';

  // Platform configuration
  static const bool isWeb = kIsWeb;
  static const bool isAndroid = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  static const bool isRelease = kReleaseMode;
  static const bool isDebug = kDebugMode;

  // API Configuration
  static const String apiBaseUrl = 'https://api.hyperlang.com/v1';
  static const String apiKey = 'HL2024-${isWeb ? 'WEB' : 'ANDROID'}-SECURE';
  static const int apiTimeout = 30000; // 30 seconds
  static const int apiRetryAttempts = 3;

  // Supported languages (14 زبان طبق درخواست)
  static const List<Map<String, String>> supportedLanguages = [
    {'code': 'ar-iq', 'name': 'العربية العراقية', 'native': 'عربی عراقی', 'flag': '🇮🇶'}, // Arabic Iraqi
    {'code': 'fa', 'name': 'Persian', 'native': 'فارسی', 'flag': '🇮🇷'}, // Persian
    {'code': 'en', 'name': 'English', 'native': 'English', 'flag': '🇺🇸'}, // English
    {'code': 'de', 'name': 'German', 'native': 'Deutsch', 'flag': '🇩🇪'}, // German
    {'code': 'tr', 'name': 'Turkish', 'native': 'Türkçe', 'flag': '🇹🇷'}, // Turkish
    {'code': 'ru', 'name': 'Russian', 'native': 'Русский', 'flag': '🇷🇺'}, // Russian
    {'code': 'fr', 'name': 'French', 'native': 'Français', 'flag': '🇫🇷'}, // French
    {'code': 'es', 'name': 'Spanish', 'native': 'Español', 'flag': '🇪🇸'}, // Spanish
    {'code': 'pt-br', 'name': 'Portuguese (Brazil)', 'native': 'Português Brasileiro', 'flag': '🇧🇷'}, // Brazilian Portuguese
    {'code': 'it', 'name': 'Italian', 'native': 'Italiano', 'flag': '🇮🇹'}, // Italian
    {'code': 'nl', 'name': 'Dutch', 'native': 'Nederlands', 'flag': '🇳🇱'}, // Dutch
    {'code': 'sv', 'name': 'Swedish', 'native': 'Svenska', 'flag': '🇸🇪'}, // Swedish
  ];

  static const String defaultLanguage = 'fa'; // فارسی به عنوان پیش‌فرض
  static const String fallbackLanguage = 'en';

  // Language learning direction
  static const Map<String, List<String>> learningPaths = {
    'fa': ['en', 'de', 'tr', 'ar-iq'], // فارسی به دیگر زبان‌ها
    'ar-iq': ['fa', 'en', 'tr'], // عربی عراقی
    'en': ['de', 'fr', 'es', 'it'], // انگلیسی
    'de': ['en', 'fr', 'nl'], // آلمانی
    'tr': ['en', 'de', 'ru'], // ترکی
    'ru': ['en', 'de', 'tr'], // روسی
  };

  // Payment gateways (با پشتیبانی از ایران و بین‌الملل)
  static const Map<String, dynamic> paymentGateways = {
    'zarinpal': {
      'enabled': true,
      'merchantId': 'ZARINPAL_MERCHANT_ID',
      'callbackUrl': 'hyperlang://payment/callback',
      'isIranian': true,
      'currencies': ['IRR', 'IRT'],
      'supported_countries': ['IR'],
    },
    'paypal': {
      'enabled': true,
      'clientId': 'PAYPAL_CLIENT_ID',
      'secret': 'PAYPAL_SECRET',
      'isIranian': false,
      'currencies': ['USD', 'EUR', 'GBP'],
      'supported_countries': ['US', 'EU', 'GB', 'CA', 'AU'],
    },
    'stripe': {
      'enabled': true,
      'publishableKey': 'STRIPE_PUB_KEY',
      'secretKey': 'STRIPE_SECRET_KEY',
      'isIranian': false,
      'currencies': ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      'supported_countries': ['US', 'EU', 'GB', 'CA', 'AU', 'JP'],
    },
  };

  // Database configuration
  static const String dbName = 'hyperlang_db';
  static const int dbVersion = 1;
  static const bool dbEncryption = true;

  // Security configuration
  static const String encryptionKey = 'HYPERLANG_SECURE_KEY_2024';
  static const String encryptionIV = 'INIT_VECTOR_16BY';
  static const bool enableAntiCrack = true;
  static const bool enableCertificatePinning = true;

  // Feature flags
  static const bool offlineModeEnabled = true;
  static const bool syncEnabled = true;
  static const bool analyticsEnabled = true;
  static const bool crashReportingEnabled = true;
  static const bool debugLoggingEnabled = kDebugMode;

  // UI Configuration
  static const double defaultBorderRadius = 12.0;
  static const Duration animationDuration = Duration(milliseconds: 300);
  static const Duration snackbarDuration = Duration(seconds: 3);
  static const int itemsPerPage = 20;

  // Cache configuration
  static const int memoryCacheSize = 100; // items
  static const Duration cacheDuration = Duration(hours: 24);
  static const int maxCachedImages = 50;

  // Subscription configuration (قیمت‌گذاری محلی و جهانی)
  static const Map<String, dynamic> subscriptionPlans = {
    'basic': {
      'id': 'plan_basic',
      'name': 'Basic',
      'price_monthly': 4.99,
      'price_monthly_irr': 249000, // تومان
      'price_yearly': 49.99,
      'price_yearly_irr': 2490000, // تومان
      'features': ['all_languages', 'offline_access', 'basic_support'],
      'available_countries': ['ALL'],
    },
    'pro': {
      'id': 'plan_pro',
      'name': 'Professional',
      'price_monthly': 9.99,
      'price_monthly_irr': 499000, // تومان
      'price_yearly': 99.99,
      'price_yearly_irr': 4990000, // تومان
      'features': ['all_languages', 'offline_access', 'priority_support', 'no_ads', 'advanced_analytics'],
      'available_countries': ['ALL'],
    },
    'lifetime': {
      'id': 'plan_lifetime',
      'name': 'Lifetime',
      'price': 299.99,
      'price_irr': 14990000, // تومان
      'features': ['all_languages', 'offline_access', 'priority_support', 'no_ads', 'all_future_updates'],
      'available_countries': ['ALL'],
    },
  };

  /// Get language name by code
  static String getLanguageName(String code) {
    for (var lang in supportedLanguages) {
      if (lang['code'] == code) {
        return lang['name']!;
      }
    }
    return 'Unknown';
  }

  /// Get native language name by code
  static String getNativeLanguageName(String code) {
    for (var lang in supportedLanguages) {
      if (lang['code'] == code) {
        return lang['native']!;
      }
    }
    return 'Unknown';
  }

  /// Get language flag by code
  static String getLanguageFlag(String code) {
    for (var lang in supportedLanguages) {
      if (lang['code'] == code) {
        return lang['flag']!;
      }
    }
    return '🌐';
  }

  /// Get current platform name
  static String get platformName {
    if (isWeb) return 'Web';
    if (isAndroid) return 'Android';
    return 'Unknown';
  }

  /// Get API URL for current platform
  static String getApiUrl(String endpoint) {
    return '$apiBaseUrl/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}';
  }

  /// Get available languages for learning from source language
  static List<String> getAvailableTargetLanguages(String sourceLanguage) {
    return learningPaths[sourceLanguage] ?? ['en', 'fa', 'de', 'tr'];
  }

  /// Validate configuration
  static Future<bool> validate() async {
    try {
      // Check required configuration
      if (apiBaseUrl.isEmpty) throw 'API base URL not configured';
      if (supportedLanguages.isEmpty) throw 'No languages configured';
      
      // Check if default language exists
      bool defaultLangExists = supportedLanguages.any((lang) => lang['code'] == defaultLanguage);
      if (!defaultLangExists) {
        throw 'Default language not in supported list';
      }

      // Platform-specific validation
      if (isWeb) {
        // Web-specific checks
        if (!apiBaseUrl.startsWith('https://')) {
          throw 'Web requires HTTPS for API';
        }
      }

      if (isAndroid) {
        // Android-specific checks
        if (encryptionKey.length < 32) {
          throw 'Encryption key too short for Android';
        }
      }

      return true;
    } catch (e) {
      if (debugLoggingEnabled) {
        print('Configuration validation failed: $e');
      }
      return false;
    }
  }

  /// Get configuration as JSON
  static Map<String, dynamic> toJson() {
    return {
      'app': {
        'name': appName,
        'version': appVersion,
        'build': appBuild,
        'platform': platformName,
        'isRelease': isRelease,
      },
      'languages': {
        'supported': supportedLanguages.map((lang) => {
          'code': lang['code'],
          'name': lang['name'],
          'native': lang['native'],
          'flag': lang['flag'],
        }).toList(),
        'default': defaultLanguage,
        'fallback': fallbackLanguage,
        'count': supportedLanguages.length,
      },
      'api': {
        'baseUrl': apiBaseUrl,
        'timeout': apiTimeout,
        'retryAttempts': apiRetryAttempts,
      },
      'security': {
        'encryptionEnabled': dbEncryption,
        'antiCrackEnabled': enableAntiCrack,
        'certificatePinning': enableCertificatePinning,
      },
      'features': {
        'offlineMode': offlineModeEnabled,
        'syncEnabled': syncEnabled,
        'analytics': analyticsEnabled,
      },
      'payment': {
        'gateways': paymentGateways.keys.toList(),
        'iranian_supported': paymentGateways.any((key, value) => value['isIranian'] == true),
        'international_supported': paymentGateways.any((key, value) => value['isIranian'] == false),
      },
    };
  }

  /// Print configuration summary
  static void printSummary() {
    if (!debugLoggingEnabled) return;

    final config = toJson();
    final encoder = JsonEncoder.withIndent('  ');
    print('=' * 60);
    print('🚀 $appName Configuration Summary');
    print('=' * 60);
    print('📱 Platform: ${platformName}');
    print('🌍 Supported Languages: ${supportedLanguages.length}');
    print('💳 Payment Gateways: ${paymentGateways.length}');
    print('-' * 60);
    print('🎯 Languages List:');
    for (var lang in supportedLanguages) {
      print('  ${lang['flag']} ${lang['code']}: ${lang['name']} (${lang['native']})');
    }
    print('-' * 60);
    print(encoder.convert(config['languages']));
    print('=' * 60);
  }

  /// Get subscription plan by ID with localized pricing
  static Map<String, dynamic>? getSubscriptionPlan(String planId, {String country = 'US'}) {
    final plan = subscriptionPlans[planId];
    if (plan == null) return null;
    
    final localizedPlan = Map<String, dynamic>.from(plan);
    
    // Add localized price based on country
    if (country == 'IR') {
      localizedPlan['local_price'] = plan['price_monthly_irr'];
      localizedPlan['local_currency'] = 'IRT';
    } else {
      localizedPlan['local_price'] = plan['price_monthly'];
      localizedPlan['local_currency'] = 'USD';
    }
    
    return localizedPlan;
  }

  /// Check if feature is available in current platform
  static bool isFeatureAvailable(String feature) {
    switch (feature) {
      case 'background_sync':
        return !isWeb; // Background sync not available on web
      case 'push_notifications':
        return !isWeb; // Push notifications limited on web
      case 'deep_linking':
        return true;
      case 'file_system_access':
        return !isWeb; // Limited file system access on web
      case 'iranian_payment':
        return true; // Always available
      case 'international_payment':
        return true; // Always available
      default:
        return true;
    }
  }

  /// Get platform-specific database path
  static String getDatabasePath() {
    if (isWeb) {
      return 'hyperlang_web_db';
    } else {
      return 'hyperlang_android_db';
    }
  }

  /// Get RTL languages list
  static List<String> get rtlLanguages {
    return ['ar-iq', 'fa'];
  }

  /// Check if language is RTL
  static bool isRtlLanguage(String languageCode) {
    return rtlLanguages.contains(languageCode);
  }

  /// Get available payment gateways for country
  static List<String> getPaymentGatewaysForCountry(String countryCode) {
    final availableGateways = <String>[];
    
    paymentGateways.forEach((key, config) {
      final supportedCountries = config['supported_countries'] as List<dynamic>?;
      if (supportedCountries == null || supportedCountries.contains('ALL') || supportedCountries.contains(countryCode)) {
        availableGateways.add(key);
      }
    });
    
    return availableGateways;
  }
}

/// Configuration extension for easy access
extension AppConfigExtensions on AppConfig {
  String get currentPlatform => AppConfig.platformName;
  bool get isProduction => AppConfig.isRelease;
  List<Map<String, String>> get languages => List.from(AppConfig.supportedLanguages);
  Map<String, dynamic> get paymentOptions => Map.from(AppConfig.paymentGateways);
  List<String> get languageCodes => AppConfig.supportedLanguages.map((lang) => lang['code']!).toList();
  
  /// Get language info by code
  Map<String, String>? getLanguageInfo(String code) {
    for (var lang in AppConfig.supportedLanguages) {
      if (lang['code'] == code) {
        return lang;
      }
    }
    return null;
  }
}
