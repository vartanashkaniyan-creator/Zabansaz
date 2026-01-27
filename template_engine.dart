import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:lang_master/core/app_config.dart';
import 'package:lang_master/data/models/template.dart';
import 'package:lang_master/data/models/lesson.dart';

/// 🎨 **Enterprise Template Engine**
/// سیستم پردازش و رندر قالب‌های پویا برای ۱۴ زبان
class TemplateEngine {
  // Singleton
  static final TemplateEngine _instance = TemplateEngine._internal();
  factory TemplateEngine() => _instance;
  TemplateEngine._internal();

  // کش قالب‌های لود شده
  final Map<String, Template> _templateCache = {};
  
  // رجیستری ویجت‌های سفارشی
  final Map<String, Widget Function(Map<String, dynamic>)> _widgetRegistry = {};
  
  // پشتیبانی زبان‌ها در قالب‌ها
  final Map<String, List<String>> _languageSupport = {
    'vocabulary': _allLanguages(),
    'quiz': _allLanguages(),
    'conversation': _allLanguages(),
    'writing': ['en', 'fa', 'ar-iq', 'de', 'es', 'fr'],
    'listening': _allLanguages(),
    'grammar': ['en', 'de', 'fr', 'es', 'ru', 'fa', 'ar-iq'],
    'pronunciation': ['en', 'fr', 'de', 'es', 'pt-br', 'it', 'ru'],
  };

  // لیست همه ۱۴ زبان
  static List<String> _allLanguages() {
    return AppConfig.supportedLanguages.map((lang) => lang['code']!).toList();
  }
  
  // ==================== [INITIALIZATION] ====================
  
  /// بارگذاری اولیه قالب‌ها برای ۱۴ زبان
  Future<void> initialize() async {
    await _loadCoreTemplates();
    _registerCoreWidgets();
  }
  
  Future<void> _loadCoreTemplates() async {
    const coreTemplates = [
      'vocabulary', 'quiz', 'conversation', 
      'writing', 'listening', 'grammar', 'pronunciation'
    ];
    
    for (final templateName in coreTemplates) {
      try {
        final template = await _loadTemplateFromAssets(templateName);
        _templateCache[template.id] = template;
        
        // ثبت پشتیبانی زبان‌ها
        if (_languageSupport.containsKey(templateName)) {
          template.supportedLanguages = _languageSupport[templateName]!;
        }
      } catch (e) {
        if (AppConfig.debugLoggingEnabled) {
          print('⚠️ Failed to load template: $templateName - $e');
        }
      }
    }
  }
  
  void _registerCoreWidgets() {
    // واژگان
    _widgetRegistry['vocabulary_card'] = (data) => _buildVocabularyCard(data);
    _widgetRegistry['word_list'] = (data) => _buildWordList(data);
    _widgetRegistry['word_match'] = (data) => _buildWordMatch(data);
    
    // آزمون
    _widgetRegistry['multiple_choice'] = (data) => _buildMultipleChoice(data);
    _widgetRegistry['true_false'] = (data) => _buildTrueFalse(data);
    _widgetRegistry['fill_blank'] = (data) => _buildFillBlank(data);
    _widgetRegistry['matching'] = (data) => _buildMatchingExercise(data);
    
    // مکالمه
    _widgetRegistry['conversation_bubble'] = (data) => _buildConversationBubble(data);
    _widgetRegistry['speech_input'] = (data) => _buildSpeechInput(data);
    _widgetRegistry['role_play'] = (data) => _buildRolePlay(data);
    
    // نوشتاری
    _widgetRegistry['text_input'] = (data) => _buildTextInput(data);
    _widgetRegistry['essay_box'] = (data) => _buildEssayBox(data);
    _widgetRegistry['translation_exercise'] = (data) => _buildTranslationExercise(data);
    
    // شنیداری
    _widgetRegistry['audio_player'] = (data) => _buildAudioPlayer(data);
    _widgetRegistry['transcription_box'] = (data) => _buildTranscriptionBox(data);
    _widgetRegistry['dictation'] = (data) => _buildDictation(data);
    
    // دستور زبان
    _widgetRegistry['sentence_builder'] = (data) => _buildSentenceBuilder(data);
    _widgetRegistry['grammar_explanation'] = (data) => _buildGrammarExplanation(data);
    
    // تلفظ
    _widgetRegistry['pronunciation_guide'] = (data) => _buildPronunciationGuide(data);
    _widgetRegistry['voice_recording'] = (data) => _buildVoiceRecording(data);
  }
  
  // ==================== [TEMPLATE LOADING] ====================
  
  /// بارگذاری قالب از assets
  Future<Template> _loadTemplateFromAssets(String templateId) async {
    try {
      // TODO: Implement proper asset loading
      // For now, return a default template
      return Template(
        id: templateId,
        name: _getTemplateName(templateId),
        version: '1.0',
        supportedLanguages: _languageSupport[templateId] ?? _allLanguages(),
        layout: _getDefaultLayout(templateId),
        sections: _getDefaultSections(templateId),
        style: _getDefaultStyle(templateId),
        showHeader: true,
        showFooter: true,
        showNavigation: true,
        showDifficulty: true,
      );
    } catch (e) {
      throw Exception('Failed to load template $templateId: $e');
    }
  }
  
  String _getTemplateName(String templateId) {
    final Map<String, String> names = {
      'vocabulary': 'Vocabulary Exercise',
      'quiz': 'Quiz Challenge',
      'conversation': 'Conversation Practice',
      'writing': 'Writing Exercise',
      'listening': 'Listening Practice',
      'grammar': 'Grammar Lesson',
      'pronunciation': 'Pronunciation Guide',
    };
    return names[templateId] ?? templateId;
  }
  
  String _getDefaultLayout(String templateId) {
    switch (templateId) {
      case 'vocabulary':
      case 'word_list':
        return 'grid';
      case 'conversation':
        return 'list';
      default:
        return 'column';
    }
  }
  
  List<Map<String, dynamic>> _getDefaultSections(String templateId) {
    switch (templateId) {
      case 'vocabulary':
        return [
          {'type': 'text', 'config': {'title': 'Vocabulary Lesson'}},
          {'type': 'vocabulary_card', 'config': {}},
        ];
      case 'quiz':
        return [
          {'type': 'text', 'config': {'title': 'Quiz'}},
          {'type': 'multiple_choice', 'config': {}},
        ];
      case 'conversation':
        return [
          {'type': 'text', 'config': {'title': 'Conversation'}},
          {'type': 'conversation_bubble', 'config': {}},
        ];
      default:
        return [
          {'type': 'text', 'config': {'title': 'Exercise'}},
        ];
    }
  }
  
  Map<String, dynamic> _getDefaultStyle(String templateId) {
    final Map<String, dynamic> baseStyle = {
      'backgroundColor': '#FFFFFF',
      'borderRadius': 12,
      'padding': {'all': 16},
      'alignment': 'start',
    };
    
    switch (templateId) {
      case 'vocabulary':
        baseStyle['backgroundColor'] = '#F0F9FF';
        break;
      case 'quiz':
        baseStyle['backgroundColor'] = '#FFF7ED';
        break;
      case 'conversation':
        baseStyle['backgroundColor'] = '#F0FDF4';
        break;
    }
    
    return baseStyle;
  }
  
  /// بارگذاری قالب از سرور
  Future<Template> loadTemplateFromServer(String templateId) async {
    if (_templateCache.containsKey(templateId)) {
      return _templateCache[templateId]!;
    }
    
    try {
      // TODO: API call
      final template = await _loadTemplateFromAssets(templateId);
      _templateCache[templateId] = template;
      return template;
    } catch (e) {
      if (_templateCache.containsKey('vocabulary')) {
        return _templateCache['vocabulary']!;
      }
      throw Exception('Template not available: $templateId');
    }
  }
  
  /// بارگذاری همه قالب‌های یک زبان
  Future<Map<String, Template>> loadLanguageTemplates(String languageCode) async {
    final Map<String, Template> result = {};
    
    for (final templateId in _templateCache.keys) {
      final template = _templateCache[templateId]!;
      if (_templateSupportsLanguage(template, languageCode)) {
        result[templateId] = template;
      }
    }
    
    // ایجاد قالب‌های ویژه زبان‌های خاص
    if (languageCode == 'ar-iq' || languageCode == 'fa') {
      result['arabic_writing'] = _createArabicWritingTemplate();
      result['rtl_support'] = _createRTLTemplate();
    }
    
    return result;
  }
  
  bool _templateSupportsLanguage(Template template, String languageCode) {
    return template.supportedLanguages.isEmpty || 
           template.supportedLanguages.contains(languageCode);
  }
  
  Template _createArabicWritingTemplate() {
    return Template(
      id: 'arabic_writing',
      name: 'Arabic Writing Practice',
      version: '1.0',
      supportedLanguages: ['ar-iq', 'fa'],
      layout: 'column',
      sections: [
        {
          'type': 'text',
          'config': {
            'text': 'تمرین نوشتن عربی',
            'fontSize': 20,
            'bold': true,
            'align': 'right'
          }
        },
        {
          'type': 'writing_exercise',
          'config': {
            'rtl': true,
            'script': 'arabic',
            'showGuides': true
          }
        }
      ],
      style: {
        'backgroundColor': '#FAF3E0',
        'borderRadius': 16,
        'padding': {'all': 20},
        'alignment': 'center',
      },
      showHeader: true,
      showFooter: false,
      showNavigation: true,
      showDifficulty: true,
    );
  }
  
  Template _createRTLTemplate() {
    return Template(
      id: 'rtl_support',
      name: 'RTL Language Support',
      version: '1.0',
      supportedLanguages: ['ar-iq', 'fa'],
      layout: 'column',
      sections: [
        {
          'type': 'text',
          'config': {
            'text': 'پشتیبانی زبان‌های راست به چپ',
            'fontSize': 18,
            'bold': true,
            'align': 'right'
          }
        }
      ],
      style: {
        'backgroundColor': '#F5F5F5',
        'borderRadius': 12,
        'padding': {'all': 16},
        'alignment': 'end',
      },
      showHeader: true,
      showFooter: true,
      showNavigation: true,
      showDifficulty: false,
    );
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
    final bool isRTL = lesson != null && _isRtlLanguage(lesson.languageCode);
    
    return Directionality(
      textDirection: isRTL ? TextDirection.rtl : TextDirection.ltr,
      child: Container(
        decoration: _buildDecoration(template.style),
        padding: _parseEdgeInsets(template.style['padding']),
        child: Column(
          crossAxisAlignment: _parseCrossAxisAlignment(template.style['alignment']),
          children: [
            // هدر
            if (template.showHeader && lesson != null)
              _buildLessonHeader(lesson, template, isRTL),
            
            // بدنه اصلی
            Expanded(
              child: _buildTemplateBody(template, content, isRTL),
            ),
            
            // فوتر
            if (template.showFooter)
              _buildTemplateFooter(template, content, isRTL),
            
            // ناوبری
            if (template.showNavigation && lesson != null)
              _buildNavigation(lesson, isRTL),
          ],
        ),
      ),
    );
  }
  
  bool _isRtlLanguage(String languageCode) {
    return ['ar-iq', 'fa'].contains(languageCode);
  }
  
  /// ساخت بدنه قالب
  Widget _buildTemplateBody(Template template, Map<String, dynamic> content, bool isRTL) {
    final List<Widget> children = [];
    
    for (final section in template.sections) {
      try {
        final widget = _buildSection(section, content, isRTL);
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
      return SingleChildScrollView(
        child: Column(
          children: children,
        ),
      );
    }
  }
  
  /// ساخت یک سکشن
  Widget _buildSection(Map<String, dynamic> section, Map<String, dynamic> content, bool isRTL) {
    final String type = section['type'];
    final Map<String, dynamic> config = Map<String, dynamic>.from(section['config'] ?? {});
    
    // تنظیمات RTL
    if (isRTL) {
      config['rtl'] = true;
      config['align'] = config['align'] ?? 'right';
    }
    
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
      default:
        return Text('Section type: $type');
    }
  }
  
  // ==================== [BUILT-IN WIDGETS] ====================
  
  Widget _buildTextSection(Map<String, dynamic> config) {
    final bool isRTL = config['rtl'] == true;
    
    return Container(
      padding: _parseEdgeInsets(config['padding']),
      child: Text(
        config['text'] ?? '',
        style: TextStyle(
          fontSize: config['fontSize']?.toDouble() ?? 16.0,
          fontWeight: config['bold'] == true ? FontWeight.bold : FontWeight.normal,
          color: _parseColor(config['color']),
          fontFamily: isRTL ? 'Vazir' : null,
        ),
        textAlign: _parseTextAlign(config['align']),
      ),
    );
  }
  
  Widget _buildImageSection(Map<String, dynamic> config) {
    return Image.asset(
      'assets/images/placeholder.png',
      fit: BoxFit.contain,
    );
  }
  
  Widget _buildAudioSection(Map<String, dynamic> config) {
    return _buildAudioPlayer(config);
  }
  
  Widget _buildVocabularyCard(Map<String, dynamic> config) {
    final bool isRTL = config['rtl'] == true;
    
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: isRTL ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              config['word'] ?? '',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                fontFamily: isRTL ? 'Vazir' : null,
              ),
            ),
            SizedBox(height: 8),
            Text(
              config['translation'] ?? '',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey[600],
              ),
            ),
            if (config['example'] != null)
              Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text(
                  config['example'],
                  style: TextStyle(fontSize: 16),
                  textAlign: isRTL ? TextAlign.right : TextAlign.left,
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildWordList(Map<String, dynamic> config) {
    final List<dynamic> words = config['words'] ?? [];
    final bool isRTL = config['rtl'] == true;
    
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
          title: Text(
            word['word'] ?? '',
            textAlign: isRTL ? TextAlign.right : TextAlign.left,
          ),
          subtitle: Text(
            word['translation'] ?? '',
            textAlign: isRTL ? TextAlign.right : TextAlign.left,
          ),
          trailing: IconButton(
            icon: Icon(Icons.volume_up),
            onPressed: () {},
          ),
        );
      },
    );
  }
  
  Widget _buildMultipleChoice(Map<String, dynamic> config) {
    final bool isRTL = config['rtl'] == true;
    final List<dynamic> options = config['options'] ?? [];
    
    return Column(
      crossAxisAlignment: isRTL ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          config['question'] ?? 'Select the correct answer:',
          textAlign: isRTL ? TextAlign.right : TextAlign.left,
        ),
        SizedBox(height: 16),
        ...options.map((option) {
          return RadioListTile(
            title: Text(
              option.toString(),
              textAlign: isRTL ? TextAlign.right : TextAlign.left,
            ),
            value: option.toString(),
            groupValue: null,
            onChanged: (value) {},
          );
        }).toList(),
      ],
    );
  }
  
  Widget _buildTrueFalse(Map<String, dynamic> config) {
    final bool isRTL = config['rtl'] == true;
    
    return Column(
      crossAxisAlignment: isRTL ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          config['statement'] ?? 'True or False?',
          textAlign: isRTL ? TextAlign.right : TextAlign.left,
        ),
        SizedBox(height: 16),
        Row(
          mainAxisAlignment: isRTL ? MainAxisAlignment.end : MainAxisAlignment.start,
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
    final bool isRTL = config['rtl'] == true;
    
    return Column(
      crossAxisAlignment: isRTL ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          config['sentence'] ?? 'Fill in the blank:',
          textAlign: isRTL ? TextAlign.right : TextAlign.left,
        ),
        SizedBox(height: 16),
        TextField(
          decoration: InputDecoration(
            border: OutlineInputBorder(),
            hintText: config['hint'] ?? 'Type your answer',
            hintTextDirection: isRTL ? TextDirection.rtl : TextDirection.ltr,
          ),
          textDirection: isRTL ? TextDirection.rtl : TextDirection.ltr,
        ),
      ],
    );
  }
  
  Widget _buildConversationBubble(Map<String, dynamic> config) {
    final bool isUser = config['isUser'] == true;
    final bool isRTL = config['rtl'] == true;
    
    return Align(
      alignment: isUser 
          ? (isRTL ? Alignment.centerLeft : Alignment.centerRight)
          : (isRTL ? Alignment.centerRight : Alignment.centerLeft),
      child: Container(
        constraints: BoxConstraints(maxWidth: 300),
        padding: EdgeInsets.all(12),
        margin: EdgeInsets.symmetric(vertical: 4, horizontal: 8),
        decoration: BoxDecoration(
          color: isUser ? Colors.blue[100] : Colors.grey[200],
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: isRTL ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              config['text'] ?? '',
              textAlign: isRTL ? TextAlign.right : TextAlign.left,
            ),
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
                  textAlign: isRTL ? TextAlign.right : TextAlign.left,
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildAudioPlayer(Map<String, dynamic> config) {
    return Container(
      padding: EdgeInsets.all(16),
      child: Column(
        children: [
          Icon(Icons.volume_up, size: 48),
          SizedBox(height: 8),
          Text(config['title'] ?? 'Audio'),
        ],
      ),
    );
  }
  
  // ==================== [UTILITY METHODS] ====================
  
  Map<String, dynamic> _parseContent(String contentJson, String language) {
    try {
      final Map<String, dynamic> content = jsonDecode(contentJson);
      
      if (content.containsKey(language)) {
        return Map<String, dynamic>.from(content[language]);
      }
      
      // Try base language (without region)
      final String baseLang = language.split('-').first;
      if (content.containsKey(baseLang)) {
        return Map<String, dynamic>.from(content[baseLang]);
      }
      
      if (content.containsKey(AppConfig.defaultLanguage)) {
        return Map<String, dynamic>.from(content[AppConfig.defaultLanguage]);
      }
      
      return content;
    } catch (e) {
      return {'error': 'Failed to parse content'};
    }
  }
  
  Widget _buildLessonHeader(Lesson lesson, Template template, bool isRTL) {
    return Container(
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: [
          if (isRTL) Expanded(child: SizedBox()),
          
          Expanded(
            child: Column(
              crossAxisAlignment: isRTL ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Text(
                  lesson.title,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  textAlign: isRTL ? TextAlign.right : TextAlign.left,
                ),
                if (lesson.description != null)
                  Text(
                    lesson.description!,
                    style: TextStyle(color: Colors.grey[600]),
                    textAlign: isRTL ? TextAlign.right : TextAlign.left,
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
  
  Widget _buildTemplateFooter(Template template, Map<String, dynamic> content, bool isRTL) {
    return Container(
      padding: EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (isRTL) ...[
            Text('v${template.version}'),
            Text('قالب: ${template.name}'),
          ] else ...[
            Text('Template: ${template.name}'),
            Text('v${template.version}'),
          ]
        ],
      ),
    );
  }
  
  Widget _buildNavigation(Lesson lesson, bool isRTL) {
    return Container(
      padding: EdgeInsets.all(12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (isRTL) ...[
            ElevatedButton(onPressed: () {}, child: Text('بعدی')),
            ElevatedButton(onPressed: () {}, child: Text('قبلی')),
          ] else ...[
            ElevatedButton(onPressed: () {}, child: Text('Previous')),
            ElevatedButton(onPressed: () {}, child: Text('Next')),
          ]
        ],
      ),
    );
  }
  
  BoxDecoration _buildDecoration(Map<String, dynamic> style) {
    return BoxDecoration(
      color: _parseColor(style['backgroundColor']),
      borderRadius: BorderRadius.circular((style['borderRadius'] ?? 0).toDouble()),
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
      case 'left': return TextAlign.left;
      default: return TextAlign.start;
    }
  }
  
  Color? _parseColor(dynamic color) {
    if (color is String && color.startsWith('#')) {
      try {
        return Color(int.parse(color.substring(1), radix: 16) + 0xFF000000);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  
  Color _getDifficultyColor(String difficulty) {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return Colors.green;
      case 'intermediate': return Colors.orange;
      case 'advanced': return Colors.red;
      default: return Colors.grey;
    }
  }
  
  Widget _buildFallbackWidget(Lesson lesson) {
    final bool isRTL = _isRtlLanguage(lesson.languageCode);
    
    return Directionality(
      textDirection: isRTL ? TextDirection.rtl : TextDirection.ltr,
      child: Container(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              lesson.title,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              textAlign: isRTL ? TextAlign.right : TextAlign.left,
            ),
            SizedBox(height: 16),
            Text(
              lesson.description ?? 'No description available',
              textAlign: isRTL ? TextAlign.right : TextAlign.left,
            ),
          ],
        ),
      ),
    );
  }
  
  // ==================== [MANAGEMENT] ====================
  
  void registerWidget(String type, Widget Function(Map<String, dynamic>) builder) {
    _widgetRegistry[type] = builder;
  }
  
  List<String> getAvailableTemplates() {
    return _templateCache.keys.toList();
  }
  
  void clearCache() {
    _templateCache.clear();
  }
  
  Map<String, dynamic> getStatus() {
    return {
      'templates_loaded': _templateCache.length,
      'widgets_registered': _widgetRegistry.length,
      'supported_languages_count': _allLanguages().length,
    };
  }
}
