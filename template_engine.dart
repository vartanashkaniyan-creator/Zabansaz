
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:lang_master/core/app_config.dart';
import 'package:lang_master/data/models/template.dart';
import 'package:lang_master/data/models/lesson.dart';

/// 🎨 **Enterprise Template Engine**
/// سیستم پردازش و رندر قالب‌های پویا
class TemplateEngine {
  // Singleton
  static final TemplateEngine _instance = TemplateEngine._internal();
  factory TemplateEngine() => _instance;
  TemplateEngine._internal();

  // کش قالب‌های لود شده
  final Map<String, Template> _templateCache = {};
  
  // رجیستری ویجت‌های سفارشی
  final Map<String, Widget Function(Map<String, dynamic>)> _widgetRegistry = {};
  
  // ==================== [INITIALIZATION] ====================
  
  /// بارگذاری اولیه قالب‌ها
  Future<void> initialize() async {
    await _loadCoreTemplates();
    _registerCoreWidgets();
  }
  
  Future<void> _loadCoreTemplates() async {
    const coreTemplates = ['vocabulary', 'quiz', 'conversation', 'writing', 'listening'];
    
    for (final templateName in coreTemplates) {
      try {
        final template = await _loadTemplateFromAssets(templateName);
        _templateCache[template.id] = template;
      } catch (e) {
        print('⚠️ Failed to load template: $templateName - $e');
      }
    }
  }
  
  void _registerCoreWidgets() {
    // واژگان
    _widgetRegistry['vocabulary_card'] = (data) => _buildVocabularyCard(data);
    _widgetRegistry['word_list'] = (data) => _buildWordList(data);
    
    // آزمون
    _widgetRegistry['multiple_choice'] = (data) => _buildMultipleChoice(data);
    _widgetRegistry['true_false'] = (data) => _buildTrueFalse(data);
    _widgetRegistry['fill_blank'] = (data) => _buildFillBlank(data);
    
    // مکالمه
    _widgetRegistry['conversation_bubble'] = (data) => _buildConversationBubble(data);
    _widgetRegistry['speech_input'] = (data) => _buildSpeechInput(data);
    
    // نوشتاری
    _widgetRegistry['text_input'] = (data) => _buildTextInput(data);
    _widgetRegistry['essay_box'] = (data) => _buildEssayBox(data);
    
    // شنیداری
    _widgetRegistry['audio_player'] = (data) => _buildAudioPlayer(data);
    _widgetRegistry['transcription_box'] = (data) => _buildTranscriptionBox(data);
  }
  
  // ==================== [TEMPLATE LOADING] ====================
  
  /// بارگذاری قالب از assets
  Future<Template> _loadTemplateFromAssets(String templateId) async {
    try {
      final jsonStr = await DefaultAssetBundle.of(GlobalKey<NavigatorState>().currentContext!)
          .loadString('assets/templates/$templateId.json');
      
      final jsonData = jsonDecode(jsonStr);
      return Template.fromJson(jsonData);
    } catch (e) {
      throw Exception('Failed to load template $templateId: $e');
    }
  }
  
  /// بارگذاری قالب از سرور
  Future<Template> loadTemplateFromServer(String templateId) async {
    // اگر در کش وجود دارد برگردان
    if (_templateCache.containsKey(templateId)) {
      return _templateCache[templateId]!;
    }
    
    try {
      // TODO: API call to fetch template
      // final response = await ApiClient().get('/templates/$templateId');
      // final template = Template.fromJson(response.data);
      
      // فعلاً از assets لود می‌کنیم
      final template = await _loadTemplateFromAssets(templateId);
      _templateCache[templateId] = template;
      return template;
    } catch (e) {
      // Fallback to cached version if available
      if (_templateCache.containsKey('vocabulary')) {
        return _templateCache['vocabulary']!;
      }
      throw Exception('Template not available: $templateId');
    }
  }
  
  /// بارگذاری همه قالب‌های یک زبان
  Future<Map<String, Template>> loadLanguageTemplates(String languageCode) async {
    final Map<String, Template> result = {};
    
    // TODO: Load from server based on language
    for (final templateId in _templateCache.keys) {
      // Check if template supports this language
      if (_templateSupportsLanguage(_templateCache[templateId]!, languageCode)) {
        result[templateId] = _templateCache[templateId]!;
      }
    }
    
    return result;
  }
  
  bool _templateSupportsLanguage(Template template, String languageCode) {
    return template.supportedLanguages.isEmpty || 
           template.supportedLanguages.contains(languageCode);
  }
  
  // ==================== [RENDERING ENGINE] ====================
  
  /// رندر یک درس با استفاده از قالب آن
  Widget renderLesson(Lesson lesson, {String? languageOverride}) {
    final template = _templateCache[lesson.templateId];
    if (template == null) {
      return _buildFallbackWidget(lesson);
    }
    
    final language = languageOverride ?? lesson.languageCode;
    final content = _parseContent(lesson.contentData, language);
    
    return _buildFromTemplate(template, content, lesson);
  }
  
  /// رندر مستقیم از JSON
  Widget renderFromJson(Map<String, dynamic> templateJson, Map<String, dynamic> content) {
    try {
      final template = Template.fromJson(templateJson);
      return _buildFromTemplate(template, content, null);
    } catch (e) {
      return ErrorWidget(e);
    }
  }
  
  /// ساخت ویجت از قالب
  Widget _buildFromTemplate(Template template, Map<String, dynamic> content, Lesson? lesson) {
    return Container(
      decoration: _buildDecoration(template.style),
      padding: _parseEdgeInsets(template.style['padding']),
      child: Column(
        crossAxisAlignment: _parseCrossAxisAlignment(template.style['alignment']),
        children: [
          // هدر
          if (template.showHeader && lesson != null)
            _buildLessonHeader(lesson, template),
          
          // بدنه اصلی
          Expanded(
            child: _buildTemplateBody(template, content),
          ),
          
          // فوتر
          if (template.showFooter)
            _buildTemplateFooter(template, content),
          
          // ناوبری
          if (template.showNavigation && lesson != null)
            _buildNavigation(lesson),
        ],
      ),
    );
  }
  
  /// ساخت بدنه قالب
  Widget _buildTemplateBody(Template template, Map<String, dynamic> content) {
    final List<Widget> children = [];
    
    for (final section in template.sections) {
      try {
        final widget = _buildSection(section, content);
        children.add(widget);
      } catch (e) {
        children.add(
          Text('Error in section ${section['type']}: $e'),
        );
      }
    }
    
    if (template.layout == 'list') {
      return ListView(
        children: children,
        padding: EdgeInsets.zero,
      );
    } else if (template.layout == 'grid') {
      return GridView.count(
        crossAxisCount: template.gridColumns ?? 2,
        children: children,
      );
    } else {
      return Column(
        children: children,
      );
    }
  }
  
  /// ساخت یک سکشن
  Widget _buildSection(Map<String, dynamic> section, Map<String, dynamic> content) {
    final String type = section['type'];
    final Map<String, dynamic> config = Map<String, dynamic>.from(section['config'] ?? {});
    
    // Merge with content data
    config.addAll(content[type] ?? {});
    
    // Check if custom widget is registered
    if (_widgetRegistry.containsKey(type)) {
      return _widgetRegistry[type]!(config);
    }
    
    // Fallback to built-in widgets
    switch (type) {
      case 'text':
        return _buildTextSection(config);
      case 'image':
        return _buildImageSection(config);
      case 'audio':
        return _buildAudioSection(config);
      case 'video':
        return _buildVideoSection(config);
      case 'interactive':
        return _buildInteractiveSection(config);
      default:
        return Text('Unknown section type: $type');
    }
  }
  
  // ==================== [BUILT-IN WIDGETS] ====================
  
  // 📝 ویجت‌های متنی
  Widget _buildTextSection(Map<String, dynamic> config) {
    return Container(
      padding: _parseEdgeInsets(config['padding']),
      child: Text(
        config['text'] ?? '',
        style: TextStyle(
          fontSize: config['fontSize']?.toDouble() ?? 16.0,
          fontWeight: config['bold'] == true ? FontWeight.bold : FontWeight.normal,
          color: _parseColor(config['color']),
        ),
        textAlign: _parseTextAlign(config['align']),
      ),
    );
  }
  
  // 🖼️ ویجت‌های تصویری
  Widget _buildImageSection(Map<String, dynamic> config) {
    return Image.network(
      config['url'] ?? '',
      fit: BoxFit.contain,
      errorBuilder: (context, error, stackTrace) {
        return Container(
          color: Colors.grey[200],
          child: Icon(Icons.broken_image),
        );
      },
    );
  }
  
  // 🔊 ویجت‌های صوتی
  Widget _buildAudioSection(Map<String, dynamic> config) {
    return _widgetRegistry['audio_player']!(config);
  }
  
  Widget _buildAudioPlayer(Map<String, dynamic> config) {
    return Container(
      padding: EdgeInsets.all(16),
      child: Column(
        children: [
          // TODO: Implement audio player
          Icon(Icons.volume_up, size: 48),
          SizedBox(height: 8),
          Text(config['title'] ?? 'Audio'),
          if (config['showControls'] == true)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(icon: Icon(Icons.skip_previous), onPressed: () {}),
                IconButton(icon: Icon(Icons.play_arrow), onPressed: () {}),
                IconButton(icon: Icon(Icons.skip_next), onPressed: () {}),
              ],
            ),
        ],
      ),
    );
  }
  
  // 🎬 ویجت‌های ویدئویی
  Widget _buildVideoSection(Map<String, dynamic> config) {
    // TODO: Implement video player
    return Container(
      color: Colors.black,
      height: 200,
      child: Center(
        child: Text(
          'Video: ${config['url']}',
          style: TextStyle(color: Colors.white),
        ),
      ),
    );
  }
  
  // 🎮 ویجت‌های تعاملی
  Widget _buildInteractiveSection(Map<String, dynamic> config) {
    final String interactiveType = config['interactiveType'] ?? 'choice';
    
    switch (interactiveType) {
      case 'multiple_choice':
        return _widgetRegistry['multiple_choice']!(config);
      case 'true_false':
        return _widgetRegistry['true_false']!(config);
      case 'fill_blank':
        return _widgetRegistry['fill_blank']!(config);
      case 'drag_drop':
        return _buildDragDrop(config);
      default:
        return Text('Unknown interactive type: $interactiveType');
    }
  }
  
  Widget _buildMultipleChoice(Map<String, dynamic> config) {
    final List<dynamic> options = config['options'] ?? [];
    final String correctAnswer = config['correctAnswer'] ?? '';
    
    return Column(
      children: [
        Text(config['question'] ?? 'Select the correct answer:'),
        SizedBox(height: 16),
        ...options.map((option) {
          return RadioListTile(
            title: Text(option.toString()),
            value: option.toString(),
            groupValue: null,
            onChanged: (value) {
              // Handle selection
            },
          );
        }).toList(),
      ],
    );
  }
  
  Widget _buildTrueFalse(Map<String, dynamic> config) {
    return Column(
      children: [
        Text(config['statement'] ?? 'True or False?'),
        SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              onPressed: () {},
              child: Text('True'),
            ),
            SizedBox(width: 16),
            ElevatedButton(
              onPressed: () {},
              child: Text('False'),
            ),
          ],
        ),
      ],
    );
  }
  
  Widget _buildFillBlank(Map<String, dynamic> config) {
    return Column(
      children: [
        Text(config['sentence'] ?? 'Fill in the blank:'),
        SizedBox(height: 16),
        TextField(
          decoration: InputDecoration(
            border: OutlineInputBorder(),
            hintText: config['hint'] ?? 'Type your answer',
          ),
        ),
      ],
    );
  }
  
  Widget _buildDragDrop(Map<String, dynamic> config) {
    // TODO: Implement drag & drop
    return Container(
      padding: EdgeInsets.all(16),
      child: Text('Drag & Drop (Not implemented yet)'),
    );
  }
  
  // 📚 ویجت‌های خاص واژگان
  Widget _buildVocabularyCard(Map<String, dynamic> config) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              config['word'] ?? '',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Text(
              config['translation'] ?? '',
              style: TextStyle(fontSize: 18, color: Colors.grey[600]),
            ),
            if (config['phonetic'] != null)
              Text(
                '/${config['phonetic']}/',
                style: TextStyle(fontStyle: FontStyle.italic),
              ),
            if (config['example'] != null)
              Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text(
                  config['example'],
                  style: TextStyle(fontSize: 16),
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildWordList(Map<String, dynamic> config) {
    final List<dynamic> words = config['words'] ?? [];
    
    return ListView.builder(
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      itemCount: words.length,
      itemBuilder: (context, index) {
        final word = words[index];
        return ListTile(
          leading: CircleAvatar(
            child: Text((index + 1).toString()),
          ),
          title: Text(word['word'] ?? ''),
          subtitle: Text(word['translation'] ?? ''),
          trailing: IconButton(
            icon: Icon(Icons.volume_up),
            onPressed: () {
              // Play pronunciation
            },
          ),
        );
      },
    );
  }
  
  // 💬 ویجت‌های مکالمه
  Widget _buildConversationBubble(Map<String, dynamic> config) {
    final bool isUser = config['isUser'] == true;
    
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: 300),
        padding: EdgeInsets.all(12),
        margin: EdgeInsets.symmetric(vertical: 4, horizontal: 8),
        decoration: BoxDecoration(
          color: isUser ? Colors.blue[100] : Colors.grey[200],
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(config['text'] ?? ''),
            if (config['translation'] != null)
              Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                  config['translation'],
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  // ==================== [UTILITY METHODS] ====================
  
  Map<String, dynamic> _parseContent(String contentJson, String language) {
    try {
      final Map<String, dynamic> content = jsonDecode(contentJson);
      
      // Extract language-specific content
      if (content.containsKey(language)) {
        return Map<String, dynamic>.from(content[language]);
      }
      
      // Fallback to default language
      if (content.containsKey(AppConfig.defaultLanguage)) {
        return Map<String, dynamic>.from(content[AppConfig.defaultLanguage]);
      }
      
      return content;
    } catch (e) {
      return {'error': 'Failed to parse content: $e'};
    }
  }
  
  BoxDecoration _buildDecoration(Map<String, dynamic> style) {
    return BoxDecoration(
      color: _parseColor(style['backgroundColor']),
      borderRadius: BorderRadius.circular((style['borderRadius'] ?? 0).toDouble()),
      border: style['border'] != null
          ? Border.all(
              color: _parseColor(style['border']['color']) ?? Colors.grey,
              width: (style['border']['width'] ?? 1).toDouble(),
            )
          : null,
    );
  }
  
  EdgeInsets _parseEdgeInsets(dynamic value) {
    if (value is Map) {
      return EdgeInsets.only(
        top: (value['top'] ?? 0).toDouble(),
        right: (value['right'] ?? 0).toDouble(),
        bottom: (value['bottom'] ?? 0).toDouble(),
        left: (value['left'] ?? 0).toDouble(),
      );
    } else if (value is num) {
      return EdgeInsets.all(value.toDouble());
    }
    return EdgeInsets.zero;
  }
  
  CrossAxisAlignment _parseCrossAxisAlignment(String? align) {
    switch (align) {
      case 'center': return CrossAxisAlignment.center;
      case 'start': return CrossAxisAlignment.start;
      case 'end': return CrossAxisAlignment.end;
      default: return CrossAxisAlignment.start;
    }
  }
  
  TextAlign _parseTextAlign(String? align) {
    switch (align) {
      case 'center': return TextAlign.center;
      case 'right': return TextAlign.right;
      case 'justify': return TextAlign.justify;
      default: return TextAlign.left;
    }
  }
  
  Color? _parseColor(dynamic color) {
    if (color is String) {
      if (color.startsWith('#')) {
        return Color(int.parse(color.substring(1), radix: 16) + 0xFF000000);
      }
      
      // Named colors
      switch (color) {
        case 'primary': return Colors.blue;
        case 'secondary': return Colors.green;
        case 'error': return Colors.red;
        case 'warning': return Colors.orange;
        default: return null;
      }
    }
    return null;
  }
  
  Widget _buildFallbackWidget(Lesson lesson) {
    return Container(
      padding: EdgeInsets.all(16),
      child: Column(
        children: [
          Text(
            lesson.title,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 16),
          Text(lesson.description ?? 'No description available'),
        ],
      ),
    );
  }
  
  Widget _buildLessonHeader(Lesson lesson, Template template) {
    return Container(
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  lesson.title,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                if (lesson.description != null)
                  Text(
                    lesson.description!,
                    style: TextStyle(color: Colors.grey[600]),
                  ),
              ],
            ),
          ),
          if (template.showDifficulty && lesson.difficulty != null)
            Chip(
              label: Text(lesson.difficulty!),
              backgroundColor: _getDifficultyColor(lesson.difficulty!),
            ),
        ],
      ),
    );
  }
  
  Color _getDifficultyColor(String difficulty) {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return Colors.green;
      case 'intermediate': return Colors.orange;
      case 'advanced': return Colors.red;
      default: return Colors.grey;
    }
  }
  
  Widget _buildTemplateFooter(Template template, Map<String, dynamic> content) {
    return Container(
      padding: EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('Template: ${template.name}'),
          Text('v${template.version}'),
        ],
      ),
    );
  }
  
  Widget _buildNavigation(Lesson lesson) {
    // TODO: Implement lesson navigation
    return Container(
      padding: EdgeInsets.all(12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          ElevatedButton(
            onPressed: () {},
            child: Text('Previous'),
          ),
          ElevatedButton(
            onPressed: () {},
            child: Text('Next'),
          ),
        ],
      ),
    );
  }
  
  // ==================== [MANAGEMENT] ====================
  
  /// ثبت ویجت سفارشی
  void registerWidget(String type, Widget Function(Map<String, dynamic>) builder) {
    _widgetRegistry[type] = builder;
  }
  
  /// دریافت لیست قالب‌های موجود
  List<String> getAvailableTemplates() {
    return _templateCache.keys.toList();
  }
  
  /// پاک‌سازی کش
  void clearCache() {
    _templateCache.clear();
  }
  
  /// دریافت وضعیت موتور
  Map<String, dynamic> getStatus() {
    return {
      'templates_loaded': _templateCache.length,
      'widgets_registered': _widgetRegistry.length,
      'cache_size': _templateCache.values
          .map((t) => t.toJson().toString().length)
          .fold(0, (a, b) => a + b),
    };
  }
}
