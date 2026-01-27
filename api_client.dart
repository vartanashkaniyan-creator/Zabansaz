import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:lang_master/core/app_config.dart';
import 'package:logger/logger.dart';

/// 🌐 **Enterprise API Client**
/// مدیریت کامل ارتباط با سرور با قابلیت‌های پیشرفته
class ApiClient {
  // Singleton instance
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal() {
    _initDio();
  }

  late Dio _dio;
  final Logger _logger = Logger();
  final Connectivity _connectivity = Connectivity();
  
  // Cache برای درخواست‌های GET
  final Map<String, _CacheItem> _cache = {};
  
  // Queue برای درخواست‌های آفلاین
  final List<_QueuedRequest> _requestQueue = [];
  bool _isProcessingQueue = false;

  // ==================== [DIO INITIALIZATION] ====================
  
  void _initDio() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: Duration(seconds: AppConfig.apiTimeout),
      receiveTimeout: Duration(seconds: AppConfig.apiTimeout),
      sendTimeout: Duration(seconds: AppConfig.apiTimeout),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'LangMaster/${AppConfig.appVersion}',
        'X-Platform': Platform.isAndroid ? 'android' : 
                      Platform.isIOS ? 'ios' : 
                      'web',
        'X-App-Build': AppConfig.appBuild,
      },
    ));

    // SSL Certificate pinning (فقط در Production)
    if (AppConfig.isProduction) {
      (_dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
        final HttpClient client = HttpClient();
        client.badCertificateCallback = (cert, host, port) => false;
        return client;
      };
    }

    // Add interceptors
    _dio.interceptors.addAll([
      _AuthInterceptor(),
      _LoggingInterceptor(_logger),
      _RetryInterceptor(),
      _CacheInterceptor(_cache),
      _OfflineQueueInterceptor(_requestQueue),
      _ErrorInterceptor(),
    ]);
  }

  // ==================== [PUBLIC METHODS] ====================
  
  /// GET Request با کش‌گذاری خودکار
  Future<ApiResponse> get(
    String endpoint, {
    Map<String, dynamic>? queryParams,
    bool cache = true,
    Duration cacheDuration = const Duration(minutes: 5),
    bool forceRefresh = false,
  }) async {
    final String cacheKey = _generateCacheKey(endpoint, queryParams);
    
    // بررسی کش
    if (cache && !forceRefresh && _isCacheValid(cacheKey)) {
      return ApiResponse(
        success: true,
        data: _cache[cacheKey]!.data,
        source: ResponseSource.cache,
      );
    }

    try {
      final response = await _dio.get(
        endpoint,
        queryParameters: queryParams,
        options: Options(
          extra: {
            'cache': cache,
            'cacheDuration': cacheDuration,
            'cacheKey': cacheKey,
          },
        ),
      );

      // ذخیره در کش
      if (cache && response.statusCode == 200) {
        _cache[cacheKey] = _CacheItem(
          data: response.data,
          expiresAt: DateTime.now().add(cacheDuration),
        );
      }

      return ApiResponse(
        success: true,
        data: response.data,
        statusCode: response.statusCode,
        source: ResponseSource.network,
      );
    } on DioException catch (e) {
      return _handleDioError(e);
    }
  }

  /// POST Request با قابلیت صف‌بندی آفلاین
  Future<ApiResponse> post(
    String endpoint,
    dynamic data, {
    bool queueIfOffline = true,
    Map<String, dynamic>? headers,
  }) async {
    final bool isOnline = await _checkConnectivity();
    
    // اگر آفلاین هستیم و قابلیت صف‌بندی فعال است
    if (!isOnline && queueIfOffline) {
      final queuedRequest = _QueuedRequest(
        method: 'POST',
        endpoint: endpoint,
        data: data,
        headers: headers,
        timestamp: DateTime.now(),
      );
      
      _requestQueue.add(queuedRequest);
      _processQueue(); // شروع پردازش صف در پس‌زمینه
      
      return ApiResponse(
        success: true,
        data: {'queued': true, 'queue_id': queuedRequest.id},
        source: ResponseSource.queue,
      );
    }

    try {
      final response = await _dio.post(
        endpoint,
        data: data,
        options: Options(headers: headers),
      );

      return ApiResponse(
        success: true,
        data: response.data,
        statusCode: response.statusCode,
        source: ResponseSource.network,
      );
    } on DioException catch (e) {
      return _handleDioError(e);
    }
  }

  /// PUT Request
  Future<ApiResponse> put(
    String endpoint,
    dynamic data, {
    Map<String, dynamic>? headers,
  }) async {
    try {
      final response = await _dio.put(
        endpoint,
        data: data,
        options: Options(headers: headers),
      );

      return ApiResponse(
        success: true,
        data: response.data,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return _handleDioError(e);
    }
  }

  /// DELETE Request
  Future<ApiResponse> delete(
    String endpoint, {
    Map<String, dynamic>? data,
    Map<String, dynamic>? headers,
  }) async {
    try {
      final response = await _dio.delete(
        endpoint,
        data: data,
        options: Options(headers: headers),
      );

      return ApiResponse(
        success: true,
        data: response.data,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return _handleDioError(e);
    }
  }

  /// Multipart Upload برای فایل‌های صوتی/تصویری
  Future<ApiResponse> upload(
    String endpoint,
    String filePath, {
    Map<String, dynamic>? formData,
    ProgressCallback? onProgress,
    CancelToken? cancelToken,
  }) async {
    final String fileName = filePath.split('/').last;
    final FormData data = FormData.fromMap({
      ...?formData,
      'file': await MultipartFile.fromFile(
        filePath,
        filename: fileName,
      ),
    });

    try {
      final response = await _dio.post(
        endpoint,
        data: data,
        options: Options(
          headers: {'Content-Type': 'multipart/form-data'},
        ),
        onSendProgress: onProgress,
        cancelToken: cancelToken,
      );

      return ApiResponse(
        success: true,
        data: response.data,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      return _handleDioError(e);
    }
  }

  /// دانلود فایل با قابلیت resume
  Future<ApiResponse> download(
    String url,
    String savePath, {
    ProgressCallback? onProgress,
    CancelToken? cancelToken,
    bool deleteOnError = true,
  }) async {
    try {
      await _dio.download(
        url,
        savePath,
        onReceiveProgress: onProgress,
        cancelToken: cancelToken,
        deleteOnError: deleteOnError,
        options: Options(
          receiveTimeout: Duration(minutes: 5),
        ),
      );

      return ApiResponse(
        success: true,
        data: {'path': savePath},
      );
    } on DioException catch (e) {
      return _handleDioError(e);
    }
  }

  // ==================== [UTILITY METHODS] ====================
  
  Future<bool> _checkConnectivity() async {
    final result = await _connectivity.checkConnectivity();
    return result != ConnectivityResult.none;
  }

  String _generateCacheKey(String endpoint, Map<String, dynamic>? params) {
    final paramString = params != null ? jsonEncode(params) : '';
    return '${endpoint}_$paramString';
  }

  bool _isCacheValid(String key) {
    if (!_cache.containsKey(key)) return false;
    return _cache[key]!.expiresAt.isAfter(DateTime.now());
  }

  ApiResponse _handleDioError(DioException e) {
    _logger.e('API Error: ${e.type}', e.error, e.stackTrace);
    
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiResponse(
          success: false,
          error: 'Connection timeout. Please check your internet.',
          statusCode: 408,
        );
      
      case DioExceptionType.badResponse:
        return _handleBadResponse(e.response!);
      
      case DioExceptionType.cancel:
        return ApiResponse(
          success: false,
          error: 'Request cancelled',
        );
      
      case DioExceptionType.unknown:
        if (e.error is SocketException) {
          return ApiResponse(
            success: false,
            error: 'No internet connection',
            statusCode: 0,
          );
        }
        return ApiResponse(
          success: false,
          error: 'Unknown error occurred',
          statusCode: 500,
        );
      
      default:
        return ApiResponse(
          success: false,
          error: 'Network error',
          statusCode: 500,
        );
    }
  }

  ApiResponse _handleBadResponse(Response response) {
    final statusCode = response.statusCode;
    dynamic errorData = response.data;
    
    String errorMessage = 'Server error';
    
    if (errorData is Map && errorData.containsKey('message')) {
      errorMessage = errorData['message'];
    } else if (errorData is String) {
      errorMessage = errorData;
    }
    
    // Handle specific status codes
    switch (statusCode) {
      case 401:
        errorMessage = 'Session expired. Please login again.';
        // Trigger logout
        break;
      case 403:
        errorMessage = 'Access denied';
        break;
      case 404:
        errorMessage = 'Resource not found';
        break;
      case 429:
        errorMessage = 'Too many requests. Please try again later.';
        break;
      case 500:
      case 502:
      case 503:
        errorMessage = 'Server is temporarily unavailable';
        break;
    }
    
    return ApiResponse(
      success: false,
      error: errorMessage,
      statusCode: statusCode,
      data: errorData,
    );
  }

  // ==================== [QUEUE PROCESSING] ====================
  
  Future<void> _processQueue() async {
    if (_isProcessingQueue || _requestQueue.isEmpty) return;
    
    _isProcessingQueue = true;
    
    while (_requestQueue.isNotEmpty) {
      final request = _requestQueue.first;
      final isOnline = await _checkConnectivity();
      
      if (!isOnline) {
        await Future.delayed(Duration(seconds: 30));
        continue;
      }
      
      try {
        late Response response;
        
        switch (request.method) {
          case 'POST':
            response = await _dio.post(
              request.endpoint,
              data: request.data,
              options: Options(headers: request.headers),
            );
            break;
          case 'PUT':
            response = await _dio.put(
              request.endpoint,
              data: request.data,
              options: Options(headers: request.headers),
            );
            break;
          default:
            _requestQueue.removeAt(0);
            continue;
        }
        
        if (response.statusCode == 200 || response.statusCode == 201) {
          _requestQueue.removeAt(0);
          _logger.i('Queued request completed: ${request.id}');
        }
      } catch (e) {
        _logger.e('Failed to process queued request ${request.id}', e);
        await Future.delayed(Duration(minutes: 1));
      }
    }
    
    _isProcessingQueue = false;
  }

  // ==================== [MAINTENANCE] ====================
  
  /// پاک‌سازی کش
  void clearCache() {
    _cache.clear();
  }
  
  /// پاک‌سازی صف
  void clearQueue() {
    _requestQueue.clear();
  }
  
  /// تنظیم هدر جدید (برای احراز هویت)
  void setAuthHeader(String token) {
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }
  
  /// حذف هدر احراز هویت
  void removeAuthHeader() {
    _dio.options.headers.remove('Authorization');
  }
  
  /// دریافت وضعیت فعلی
  Map<String, dynamic> getStatus() {
    return {
      'cache_size': _cache.length,
      'queue_size': _requestQueue.length,
      'base_url': _dio.options.baseUrl,
      'timeout': _dio.options.connectTimeout?.inSeconds,
    };
  }
}

// ==================== [SUPPORTING CLASSES] ====================

/// پاسخ استاندارد API
class ApiResponse {
  final bool success;
  final dynamic data;
  final String? error;
  final int? statusCode;
  final ResponseSource source;
  
  ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.statusCode,
    this.source = ResponseSource.network,
  });
  
  Map<String, dynamic> toMap() {
    return {
      'success': success,
      'data': data,
      'error': error,
      'status_code': statusCode,
      'source': source.toString(),
    };
  }
}

enum ResponseSource {
  network,
  cache,
  queue,
  local,
}

/// آیتم کش
class _CacheItem {
  final dynamic data;
  final DateTime expiresAt;
  
  _CacheItem({required this.data, required this.expiresAt});
}

/// درخواست صف‌بندی شده
class _QueuedRequest {
  final String id = DateTime.now().microsecondsSinceEpoch.toString();
  final String method;
  final String endpoint;
  final dynamic data;
  final Map<String, dynamic>? headers;
  final DateTime timestamp;
  
  _QueuedRequest({
    required this.method,
    required this.endpoint,
    required this.data,
    this.headers,
    required this.timestamp,
  });
}

// ==================== [INTERCEPTORS] ====================

/// اینترسپتور احراز هویت
class _AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    // اضافه کردن توکن به صورت داینامیک
    final token = _getAuthToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    super.onRequest(options, handler);
  }
  
  String? _getAuthToken() {
    // از SharedPreferences یا SecureStorage بخوان
    return null;
  }
}

/// اینترسپتور لاگینگ
class _LoggingInterceptor extends Interceptor {
  final Logger logger;
  
  _LoggingInterceptor(this.logger);
  
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    logger.d('🌐 REQUEST: ${options.method} ${options.uri}');
    if (options.data != null) {
      logger.d('📦 BODY: ${options.data}');
    }
    super.onRequest(options, handler);
  }
  
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    logger.d('✅ RESPONSE: ${response.statusCode} ${response.requestOptions.uri}');
    super.onResponse(response, handler);
  }
  
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    logger.e('❌ ERROR: ${err.type} ${err.requestOptions.uri}', err.error);
    super.onError(err, handler);
  }
}

/// اینترسپتور تکرار درخواست
class _RetryInterceptor extends Interceptor {
  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (_shouldRetry(err)) {
      final options = err.requestOptions;
      final int retryCount = options.extra['retry_count'] ?? 0;
      
      if (retryCount < AppConfig.apiRetries) {
        options.extra['retry_count'] = retryCount + 1;
        
        await Future.delayed(Duration(seconds: 1 << retryCount));
        
        try {
          final response = await Dio().fetch(options);
          handler.resolve(response);
          return;
        } catch (retryError) {
          // Continue to original error
        }
      }
    }
    super.onError(err, handler);
  }
  
  bool _shouldRetry(DioException err) {
    return err.type == DioExceptionType.connectionTimeout ||
           err.type == DioExceptionType.receiveTimeout ||
           err.type == DioExceptionType.sendTimeout ||
           err.type == DioExceptionType.unknown;
  }
}

/// اینترسپتور کش
class _CacheInterceptor extends Interceptor {
  final Map<String, _CacheItem> cache;
  
  _CacheInterceptor(this.cache);
  
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method == 'GET' && options.extra['cache'] == true) {
      final cacheKey = options.extra['cacheKey'];
      if (cacheKey != null && cache.containsKey(cacheKey)) {
        final item = cache[cacheKey]!;
        if (item.expiresAt.isAfter(DateTime.now())) {
          handler.resolve(
            Response(
              requestOptions: options,
              data: item.data,
              statusCode: 200,
            ),
          );
          return;
        }
      }
    }
    super.onRequest(options, handler);
  }
}

/// اینترسپتور صف آفلاین
class _OfflineQueueInterceptor extends Interceptor {
  final List<_QueuedRequest> queue;
  
  _OfflineQueueInterceptor(this.queue);
  
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.type == DioExceptionType.unknown && err.error is SocketException) {
      final options = err.requestOptions;
      
      if (options.method == 'POST' && options.extra['queueIfOffline'] == true) {
        queue.add(_QueuedRequest(
          method: options.method,
          endpoint: options.path,
          data: options.data,
          headers: options.headers,
          timestamp: DateTime.now(),
        ));
        
        handler.resolve(
          Response(
            requestOptions: options,
            data: {'queued': true},
            statusCode: 202,
          ),
        );
        return;
      }
    }
    super.onError(err, handler);
  }
}

/// اینترسپتور خطا
class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // تبدیل خطاهای خاص
    super.onError(err, handler);
  }
}
