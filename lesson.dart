import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:lang_master/core/app_config.dart';
import 'package:lang_master/data/lang_manager.dart';
import 'package:lang_master/data/template_engine.dart';
import 'package:lang_master/ui/widgets/custom_bar.dart';
import 'package:lang_master/ui/widgets/progress_bar.dart';
import 'package:lang_master/ui/widgets/audio_player.dart';

/// 📚 **Enterprise Lesson Page**
/// صفحه درس کامل با تمام قابلیت‌های آموزشی
class LessonPage extends StatefulWidget {
  final String lessonId;
  final String? languageCode;

  const LessonPage({
    Key? key,
    required this.lessonId,
    this.languageCode,
  }) : super(key: key);

  @override
  _LessonPageState createState() => _LessonPageState();
}

class _LessonPageState extends State<LessonPage> with SingleTickerProviderStateMixin {
  // Animation
  late AnimationController _animationController;
  late Animation<double> _slideAnimation;
  
  // State
  Lesson? _lesson;
  bool _isLoading = true;
  bool _hasError = false;
  String _errorMessage = '';
  
  // Audio
  final AudioPlayer _audioPlayer = AudioPlayer();
  PlayerState _audioState = PlayerState.stopped;
  Duration _audioDuration = Duration.zero;
  Duration _audioPosition = Duration.zero;
  
  // Lesson progress
  int _currentStep = 0;
  int _totalSteps = 1;
  Map<int, bool> _stepCompletion = {};
  int _score = 0;
  int _maxScore = 100;
  
  // UI State
  bool _showTranslation = false;
  bool _showHint = false;
  bool _isCompleted = false;
  
  // Services
  late TemplateEngine _templateEngine;
  late LanguageManager _langManager;
  
  // ==================== [LIFECYCLE] ====================
  
  @override
  void initState() {
    super.initState();
    
    _initAnimations();
    _loadLessonData();
    _setupAudioPlayer();
  }
  
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    
    _templateEngine = Provider.of<TemplateEngine>(context, listen: false);
    _langManager = Provider.of<LanguageManager>(context, listen: false);
  }
  
  @override
  void dispose() {
    _animationController.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }
  
  // ==================== [ANIMATIONS] ====================
  
  void _initAnimations() {
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    
    _slideAnimation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeOutBack,
      ),
    );
    
    _animationController.forward();
  }
  
  // ==================== [DATA LOADING] ====================
  
  Future<void> _loadLessonData() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });
    
    try {
      // TODO: Load from database or API
      await Future.delayed(Duration(milliseconds: 500));
      
      // Mock data
      _lesson = Lesson(
        id: widget.lessonId,
        title: 'Introducing Yourself',
        description: 'Learn how to introduce yourself in ${_langManager.currentLanguageConfig?.name ?? 'English'}',
        difficulty: 'beginner',
        estimatedTime: 15,
        languageCode: widget.languageCode ?? _langManager.currentLanguageConfig?.code ?? 'en',
        content: _getMockContent(),
        audioUrl: 'https://example.com/audio/lesson1.mp3',
        templateId: 'conversation_001',
        steps: _getMockSteps(),
      );
      
      _totalSteps = _lesson!.steps.length;
      
      // Initialize step completion
      for (int i = 0; i < _totalSteps; i++) {
        _stepCompletion[i] = false;
      }
      
    } catch (e) {
      setState(() {
        _hasError = true;
        _errorMessage = e.toString();
      });
    } finally {
      setState(() => _isLoading = false);
    }
  }
  
  Map<String, dynamic> _getMockContent() {
    return {
      'dialogue': [
        {
          'speaker': 'John',
          'text': 'Hello, my name is John. What\'s your name?',
          'translation': 'سلام، اسم من جان است. اسم شما چیست؟',
        },
        {
          'speaker': 'Sarah',
          'text': 'Hi John, I\'m Sarah. Nice to meet you!',
          'translation': 'سلام جان، من سارا هستم. از آشنایی با شما خوشبختم!',
        },
      ],
      'vocabulary': [
        {'word': 'Hello', 'translation': 'سلام', 'phonetic': '/həˈloʊ/'},
        {'word': 'Name', 'translation': 'اسم', 'phonetic': '/neɪm/'},
        {'word': 'Nice', 'translation': 'خوش', 'phonetic': '/naɪs/'},
      ],
      'exercises': [
        {
          'type': 'multiple_choice',
          'question': 'How do you say "Hello" in Persian?',
          'options': ['سلام', 'خداحافظ', 'متشکرم'],
          'correct': 0,
        },
      ],
    };
  }
  
  List<LessonStep> _getMockSteps() {
    return [
      LessonStep(
        title: 'Dialogue',
        type: LessonStepType.dialogue,
        content: {'dialogue': _getMockContent()['dialogue']},
      ),
      LessonStep(
        title: 'Vocabulary',
        type: LessonStepType.vocabulary,
        content: {'vocabulary': _getMockContent()['vocabulary']},
      ),
      LessonStep(
        title: 'Grammar',
        type: LessonStepType.grammar,
        content: {
          'title': 'Introducing Yourself',
          'explanation': 'Use "My name is..." to introduce yourself.',
          'examples': [
            'My name is John.',
            'My name is Sarah.',
          ],
        },
      ),
      LessonStep(
        title: 'Practice',
        type: LessonStepType.practice,
        content: {'exercises': _getMockContent()['exercises']},
      ),
    ];
  }
  
  // ==================== [AUDIO PLAYER] ====================
  
  void _setupAudioPlayer() {
    _audioPlayer.onPlayerStateChanged.listen((state) {
      setState(() => _audioState = state);
    });
    
    _audioPlayer.onDurationChanged.listen((duration) {
      setState(() => _audioDuration = duration);
    });
    
    _audioPlayer.onPositionChanged.listen((position) {
      setState(() => _audioPosition = position);
    });
    
    _audioPlayer.onPlayerComplete.listen((event) {
      setState(() {
        _audioPosition = Duration.zero;
        _audioState = PlayerState.stopped;
      });
    });
  }
  
  Future<void> _playAudio() async {
    if (_lesson?.audioUrl == null) return;
    
    try {
      await _audioPlayer.play(UrlSource(_lesson!.audioUrl!));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to play audio: $e')),
      );
    }
  }
  
  Future<void> _pauseAudio() async {
    await _audioPlayer.pause();
  }
  
  Future<void> _stopAudio() async {
    await _audioPlayer.stop();
  }
  
  Future<void> _seekAudio(Duration position) async {
    await _audioPlayer.seek(position);
  }
  
  // ==================== [LESSON PROGRESS] ====================
  
  void _nextStep() {
    if (_currentStep < _totalSteps - 1) {
      setState(() {
        _stepCompletion[_currentStep] = true;
        _currentStep++;
      });
      _animationController.reset();
      _animationController.forward();
    } else {
      _completeLesson();
    }
  }
  
  void _previousStep() {
    if (_currentStep > 0) {
      setState(() => _currentStep--);
      _animationController.reset();
      _animationController.forward();
    }
  }
  
  void _jumpToStep(int step) {
    if (step >= 0 && step < _totalSteps) {
      setState(() => _currentStep = step);
      _animationController.reset();
      _animationController.forward();
    }
  }
  
  void _completeLesson() {
    setState(() {
      _isCompleted = true;
      _stepCompletion[_currentStep] = true;
      _score = 85; // Mock score
    });
    
    // TODO: Save progress to database
    // TODO: Sync with server
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_langManager.translate('lesson_completed')),
        backgroundColor: Colors.green,
      ),
    );
  }
  
  void _updateScore(int points) {
    setState(() => _score += points);
  }
  
  // ==================== [UI BUILDING] ====================
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.background,
      body: _isLoading
          ? _buildLoadingScreen()
          : _hasError
              ? _buildErrorScreen()
              : _buildMainContent(),
    );
  }
  
  Widget _buildLoadingScreen() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 20),
          Text(
            _langManager.translate('loading_lesson'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
  
  Widget _buildErrorScreen() {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error, size: 64, color: Colors.red),
            SizedBox(height: 20),
            Text(
              _langManager.translate('lesson_load_error'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 10),
            Text(
              _errorMessage,
              style: TextStyle(color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 20),
            ElevatedButton(
              onPressed: _loadLessonData,
              child: Text(_langManager.translate('retry')),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildMainContent() {
    return Column(
      children: [
        // App Bar
        _buildAppBar(),
        
        // Progress Bar
        _buildProgressBar(),
        
        // Main Content
        Expanded(
          child: AnimatedBuilder(
            animation: _slideAnimation,
            builder: (context, child) {
              return Transform.scale(
                scale: _slideAnimation.value,
                child: Opacity(
                  opacity: _slideAnimation.value,
                  child: child,
                ),
              );
            },
            child: _isCompleted
                ? _buildCompletionScreen()
                : _buildLessonContent(),
          ),
        ),
      ],
    );
  }
  
  Widget _buildAppBar() {
    return CustomAppBar(
      title: _lesson?.title ?? '',
      subtitle: '${_langManager.translate('step')} ${_currentStep + 1}/$_totalSteps',
      leading: IconButton(
        icon: Icon(Icons.arrow_back),
        onPressed: () => Navigator.pop(context),
      ),
      actions: [
        IconButton(
          icon: Icon(_showTranslation ? Icons.translate : Icons.translate_outlined),
          onPressed: () => setState(() => _showTranslation = !_showTranslation),
          tooltip: _langManager.translate('toggle_translation'),
        ),
        IconButton(
          icon: Icon(_showHint ? Icons.lightbulb : Icons.lightbulb_outline),
          onPressed: () => setState(() => _showHint = !_showHint),
          tooltip: _langManager.translate('show_hint'),
        ),
        IconButton(
          icon: Icon(Icons.help_outline),
          onPressed: _showHelp,
          tooltip: _langManager.translate('help'),
        ),
      ],
    );
  }
  
  Widget _buildProgressBar() {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Column(
        children: [
          // Lesson progress
          ProgressBar(
            progress: _totalSteps > 0 ? (_currentStep + 1) / _totalSteps : 0,
            height: 8,
            backgroundColor: Colors.grey[300],
            progressColor: Theme.of(context).colorScheme.primary,
          ),
          SizedBox(height: 8),
          
          // Step indicators
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(_totalSteps, (index) {
              return GestureDetector(
                onTap: () => _jumpToStep(index),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: _stepCompletion[index] == true
                        ? Colors.green
                        : index == _currentStep
                            ? Theme.of(context).colorScheme.primary
                            : Colors.grey[300],
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '${index + 1}',
                      style: TextStyle(
                        color: _stepCompletion[index] == true || index == _currentStep
                            ? Colors.white
                            : Colors.grey[600],
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
  
  Widget _buildLessonContent() {
    if (_lesson == null || _currentStep >= _lesson!.steps.length) {
      return Center(child: Text(_langManager.translate('no_content')));
    }
    
    final step = _lesson!.steps[_currentStep];
    
    return SingleChildScrollView(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Step title
          Text(
            step.title,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 8),
          
          // Step content based on type
          _buildStepContent(step),
          
          SizedBox(height: 20),
          
          // Audio player (if step has audio)
          if (step.hasAudio) _buildStepAudioPlayer(step),
          
          SizedBox(height: 30),
          
          // Navigation buttons
          _buildNavigationButtons(),
        ],
      ),
    );
  }
  
  Widget _buildStepContent(LessonStep step) {
    switch (step.type) {
      case LessonStepType.dialogue:
        return _buildDialogueContent(step.content);
      case LessonStepType.vocabulary:
        return _buildVocabularyContent(step.content);
      case LessonStepType.grammar:
        return _buildGrammarContent(step.content);
      case LessonStepType.practice:
        return _buildPracticeContent(step.content);
      case LessonStepType.review:
        return _buildReviewContent(step.content);
      default:
        return Text(_langManager.translate('content_not_available'));
    }
  }
  
  Widget _buildDialogueContent(Map<String, dynamic> content) {
    final List dialogues = content['dialogue'] ?? [];
    
    return Column(
      children: [
        // Dialogue box
        Container(
          padding: EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue[50],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue[100]!),
          ),
          child: Column(
            children: dialogues.map<Widget>((dialogue) {
              return Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          child: Text(dialogue['speaker']?.toString().substring(0, 1) ?? '?'),
                        ),
                        SizedBox(width: 12),
                        Text(
                          dialogue['speaker']?.toString() ?? '',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue[700],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 8),
                    Text(
                      dialogue['text']?.toString() ?? '',
                      style: TextStyle(fontSize: 16),
                    ),
                    if (_showTranslation && dialogue['translation'] != null)
                      Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          dialogue['translation'],
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[600],
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
        
        SizedBox(height: 20),
        
        // Practice dialogue
        Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _langManager.translate('practice_dialogue'),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
                SizedBox(height: 12),
                Text(
                  _langManager.translate('practice_dialogue_hint'),
                  style: TextStyle(color: Colors.grey[600]),
                ),
                SizedBox(height: 16),
                TextField(
                  decoration: InputDecoration(
                    hintText: _langManager.translate('type_your_response'),
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 3,
                ),
                SizedBox(height: 12),
                if (_showHint)
                  Text(
                    _langManager.translate('dialogue_hint'),
                    style: TextStyle(
                      color: Colors.orange[700],
                      fontStyle: FontStyle.italic,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildVocabularyContent(Map<String, dynamic> content) {
    final List vocabulary = content['vocabulary'] ?? [];
    
    return Column(
      children: [
        GridView.builder(
          shrinkWrap: true,
          physics: NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
          ),
          itemCount: vocabulary.length,
          itemBuilder: (context, index) {
            final word = vocabulary[index];
            return Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      word['word']?.toString() ?? '',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      word['translation']?.toString() ?? '',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey[600],
                      ),
                    ),
                    if (word['phonetic'] != null)
                      Text(
                        word['phonetic'],
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[500],
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    IconButton(
                      icon: Icon(Icons.volume_up, size: 20),
                      onPressed: () {
                        // TODO: Play pronunciation
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        ),
        
        SizedBox(height: 20),
        
        // Vocabulary quiz
        Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _langManager.translate('vocabulary_quiz'),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
                SizedBox(height: 12),
                Text(
                  'Match the word with its meaning:',
                  style: TextStyle(color: Colors.grey[600]),
                ),
                SizedBox(height: 16),
                // TODO: Add matching quiz
              ],
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildGrammarContent(Map<String, dynamic> content) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              content['title']?.toString() ?? _langManager.translate('grammar'),
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 20,
              ),
            ),
            SizedBox(height: 12),
            Text(
              content['explanation']?.toString() ?? '',
              style: TextStyle(fontSize: 16),
            ),
            SizedBox(height: 20),
            
            if (content['examples'] != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _langManager.translate('examples'),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  SizedBox(height: 8),
                  ...(content['examples'] as List).map<Widget>((example) {
                    return Padding(
                      padding: EdgeInsets.symmetric(vertical: 4),
                      child: Text('• $example'),
                    );
                  }).toList(),
                ],
              ),
            
            SizedBox(height: 20),
            
            // Grammar exercise
            TextField(
              decoration: InputDecoration(
                hintText: _langManager.translate('write_sentence_using_pattern'),
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPracticeContent(Map<String, dynamic> content) {
    final List exercises = content['exercises'] ?? [];
    
    return Column(
      children: [
        Text(
          _langManager.translate('practice_exercises'),
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 20,
          ),
        ),
        SizedBox(height: 16),
        
        ...exercises.map<Widget>((exercise) {
          return Card(
            margin: EdgeInsets.only(bottom: 16),
            child: Padding(
              padding: EdgeInsets.all(16),
              child: _buildExercise(exercise),
            ),
          );
        }).toList(),
      ],
    );
  }
  
  Widget _buildExercise(Map<String, dynamic> exercise) {
    final type = exercise['type'] ?? 'multiple_choice';
    
    switch (type) {
      case 'multiple_choice':
        return _buildMultipleChoiceExercise(exercise);
      case 'true_false':
        return _buildTrueFalseExercise(exercise);
      case 'fill_blank':
        return _buildFillBlankExercise(exercise);
      default:
        return Text(_langManager.translate('exercise_not_supported'));
    }
  }
  
  Widget _buildMultipleChoiceExercise(Map<String, dynamic> exercise) {
    final question = exercise['question'] ?? '';
    final options = exercise['options'] ?? [];
    final correctIndex = exercise['correct'] ?? 0;
    
    int? selectedIndex;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          question,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        SizedBox(height: 16),
        
        ...options.asMap().entries.map((entry) {
          final index = entry.key;
          final option = entry.value;
          
          return RadioListTile<int>(
            title: Text(option.toString()),
            value: index,
            groupValue: selectedIndex,
            onChanged: (value) {
              setState(() => selectedIndex = value);
              if (value == correctIndex) {
                _updateScore(10);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(_langManager.translate('correct_answer'))),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(_langManager.translate('try_again'))),
                );
              }
            },
          );
        }).toList(),
      ],
    );
  }
  
  Widget _buildTrueFalseExercise(Map<String, dynamic> exercise) {
    // Similar implementation
    return Container();
  }
  
  Widget _buildFillBlankExercise(Map<String, dynamic> exercise) {
    // Similar implementation
    return Container();
  }
  
  Widget _buildReviewContent(Map<String, dynamic> content) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.star, size: 64, color: Colors.amber),
          SizedBox(height: 20),
          Text(
            _langManager.translate('review_completed'),
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 12),
          Text(
            _langManager.translate('review_summary'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }
  
  Widget _buildStepAudioPlayer(LessonStep step) {
    return CustomAudioPlayer(
      title: step.audioTitle ?? _langManager.translate('listen_and_repeat'),
      audioUrl: step.audioUrl ?? '',
      onPlay: _playAudio,
      onPause: _pauseAudio,
      onStop: _stopAudio,
      onSeek: _seekAudio,
      duration: _audioDuration,
      position: _audioPosition,
      state: _audioState,
    );
  }
  
  Widget _buildNavigationButtons() {
    return Row(
      children: [
        // Previous button
        Expanded(
          child: ElevatedButton.icon(
            icon: Icon(Icons.arrow_back),
            label: Text(_langManager.translate('previous')),
            onPressed: _currentStep > 0 ? _previousStep : null,
            style: ElevatedButton.styleFrom(
              padding: EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ),
        SizedBox(width: 16),
        
        // Next/Complete button
        Expanded(
          child: ElevatedButton.icon(
            icon: Icon(_currentStep < _totalSteps - 1
                ? Icons.arrow_forward
                : Icons.check),
            label: Text(_currentStep < _totalSteps - 1
                ? _langManager.translate('next')
                : _langManager.translate('complete')),
            onPressed: _nextStep,
            style: ElevatedButton.styleFrom(
              padding: EdgeInsets.symmetric(vertical: 16),
              backgroundColor: _currentStep < _totalSteps - 1
                  ? Theme.of(context).colorScheme.primary
                  : Colors.green,
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildCompletionScreen() {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.celebration, size: 80, color: Colors.green),
            SizedBox(height: 20),
            Text(
              _langManager.translate('lesson_completed'),
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 12),
            Text(
              _langManager.translate('congratulations'),
              style: TextStyle(fontSize: 18, color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 30),
            
            // Score card
            Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text(
                      _langManager.translate('your_score'),
                      style: TextStyle(fontSize: 16, color: Colors.grey[600]),
                    ),
                    SizedBox(height: 8),
                    Text(
                      '$_score/$_maxScore',
                      style: TextStyle(
                        fontSize: 48,
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    SizedBox(height: 16),
                    ProgressBar(
                      progress: _score / _maxScore,
                      height: 12,
                    ),
                  ],
                ),
              ),
            ),
            
            SizedBox(height: 30),
            
            // Action buttons
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(_langManager.translate('back_to_home')),
                ),
                OutlinedButton(
                  onPressed: () => setState(() {
                    _isCompleted = false;
                    _currentStep = 0;
                    _score = 0;
                    for (int i = 0; i < _totalSteps; i++) {
                      _stepCompletion[i] = false;
                    }
                  }),
                  child: Text(_langManager.translate('review_again')),
                ),
                ElevatedButton.icon(
                  onPressed: () {
                    // TODO: Navigate to next lesson
                  },
                  icon: Icon(Icons.skip_next),
                  label: Text(_langManager.translate('next_lesson')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  // ==================== [HELPERS] ====================
  
  void _showHelp() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(_langManager.translate('help')),
        content: Text(_langManager.translate('lesson_help_content')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(_langManager.translate('close')),
          ),
        ],
      ),
    );
  }
}

// ==================== [SUPPORTING CLASSES] ====================

class Lesson {
  final String id;
  final String title;
  final String description;
  final String difficulty;
  final int estimatedTime;
  final String languageCode;
  final Map<String, dynamic> content;
  final String? audioUrl;
  final String templateId;
  final List<LessonStep> steps;
  
  Lesson({
    required this.id,
    required this.title,
    required this.description,
    required this.difficulty,
    required this.estimatedTime,
    required this.languageCode,
    required this.content,
    this.audioUrl,
    required this.templateId,
    required this.steps,
  });
}

class LessonStep {
  final String title;
  final LessonStepType type;
  final Map<String, dynamic> content;
  final String? audioUrl;
  final String? audioTitle;
  final bool hasAudio;
  
  LessonStep({
    required this.title,
    required this.type,
    required this.content,
    this.audioUrl,
    this.audioTitle,
    this.hasAudio = false,
  });
}

enum LessonStepType {
  dialogue,
  vocabulary,
  grammar,
  practice,
  review,
}
